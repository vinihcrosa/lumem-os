import { existsSync } from "node:fs";
import { join } from "node:path";

import { ADAPTERS_DIR_NAME, adapterById, type AdapterSpec } from "@lumem/shared";

import { DomainError } from "../errors.js";
import { adapterBinaryPath } from "./install-adapter.js";

/**
 * Which copy of an adapter this daemon launches — the one it installed, or none.
 *
 * One function, because there used to be two answers to one question and they
 * disagreed. `setup.ts` preferred the managed copy and fell back to the PATH;
 * `session.ts` read an absolute path frozen into `agent_config.command` on the day
 * the row was written. Neither consulted the pin at launch time, and the result was
 * nine days of sessions on `claude-agent-acp@0.40.0` while `pinnedVersion` said
 * `0.75.1` — no Opus 5 offered, `Custom model` where Fable 5.1 belongs, and one
 * session reporting a 200K window under a label that read *"1M context"*.
 *
 * The decision, with the measurements: [ADR de
 * 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md).
 * The rule it states is that the PATH never participates in *which adapter*, and
 * this module is where that is true or not true.
 *
 * What still comes from the PATH, and is a different question: `npm`, which
 * installs, and the child process's own environment — measured, with only `node`
 * on the PATH a turn dies with `Authentication required`, and adding
 * `/usr/bin/security` (the macOS keychain) makes the same turn close in `end_turn`.
 * An adapter needs a usable PATH. It does not need the PATH to say who it is.
 */

/** `<stateDir>/adapters` — the directory that holds one per spec. */
export function adaptersDir(stateDir: string): string {
  return join(stateDir, ADAPTERS_DIR_NAME);
}

/**
 * The managed binary of a spec, or a refusal naming where it should be.
 *
 * A refusal and never `spec.command`: a bare name is resolved by the PATH, which is
 * exactly the provenance that is no longer allowed to decide. The sentence names the
 * pin because "install it" without a version is the mistake the A12 already refused
 * once, on the screen that offered a copyable `npm i -g` with no `@version`.
 */
export function adapterCommandFor(spec: AdapterSpec, stateDir: string): string {
  const managed = adapterBinaryPath(adaptersDir(stateDir), spec);
  if (!existsSync(managed)) {
    throw new DomainError(
      "NOT_FOUND",
      `o adaptador de ${spec.label} não está instalado neste daemon: esperado em ${managed}. ` +
        `Uma cópia no PATH não serve — o Lumem lança a que ele mesmo instalou, no ${spec.pinnedVersion}`,
    );
  }
  return managed;
}

/** The fields of an `agent_config` row this resolution actually reads. */
export interface AdapterConfigRef {
  name: string;
  command: string;
  transport: string;
}

/**
 * What to launch for a configuration row.
 *
 * Three cases, and separating them is the whole content of this function. The first
 * version collapsed the last two and it was wrong: it refused any ACP row whose name
 * is not in the catalogue, which is not what the decision forbids and which broke 25
 * e2e specs that drive a deliberately-named fake adapter.
 *
 * **PTY** is returned untouched. It is a shell or a CLI someone chose, and `~/.lumem`
 * has no opinion about where `bash` lives. Only the ACP transport carries the
 * provenance rule, because only it is an adapter.
 *
 * **A catalogued id** always resolves to the managed copy, and the stored `command`
 * is *ignored*. This is the case that broke: the row on this machine said
 * `name: "claude"` with `command: "/…/nvm/…/bin/claude-agent-acp"`, resolved on
 * 2026-08-30 and never revisited, because `agentConfig` has no `update`. Matching on
 * `command` instead of `name` would find nothing — the column holds an absolute path
 * on every machine that ran the product before this — which is why the match is by
 * id. Both creation paths write it that way (`AgentLogin` passes `spec.id`, and the
 * onboarding's `SETUP_AGENT_NAME` is the literal `"claude"`).
 *
 * **An uncatalogued name** keeps its own command, and only if that command is an
 * absolute path. Someone pointing the daemon at a specific binary — a locally built
 * adapter, an agent not yet catalogued, the e2e's fake — is naming exactly one file,
 * and that is not the thing being forbidden: what the [ADR de
 * 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md)
 * forbids is *the PATH choosing*. A **bare name** is the PATH choosing, so it is
 * refused here rather than handed to the OS to resolve however it likes today.
 */
export function adapterCommandForConfig(config: AdapterConfigRef, stateDir: string): string {
  if (config.transport !== "acp") return config.command;

  const spec = adapterById(config.name);
  if (spec !== null) return adapterCommandFor(spec, stateDir);

  if (!config.command.startsWith("/")) {
    throw new DomainError(
      "NOT_FOUND",
      `a configuração "${config.name}" diz transporte ACP com o comando "${config.command}", que é ` +
        `um nome e não um caminho — quem escolheria o binário é o PATH, e adaptador não vem do PATH. ` +
        `Use um id do catálogo, ou o caminho absoluto do adaptador`,
    );
  }
  return config.command;
}
