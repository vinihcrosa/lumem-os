import { describe, expect, it } from "vitest";

import {
  ADAPTERS,
  CLAUDE_ADAPTER,
  CODEX_ADAPTER,
  DEFAULT_ADAPTER_ID,
  adapterByCommand,
  adapterById,
  adapterInstallCommand,
} from "./adapters.js";

describe("ADAPTERS", () => {
  it("has the two agents the product speaks ACP with", () => {
    expect(ADAPTERS.map((spec) => spec.id)).toEqual(["claude", "codex"]);
  });

  it("keeps ids and commands unique, because both are used as keys", () => {
    // The id names a directory under `<stateDir>/adapters`, and the command is
    // how a running session is recognised. A duplicate in either would have two
    // adapters overwrite each other's install.
    expect(new Set(ADAPTERS.map((spec) => spec.id)).size).toBe(ADAPTERS.length);
    expect(new Set(ADAPTERS.map((spec) => spec.command)).size).toBe(ADAPTERS.length);
  });

  it("pins a literal version, never a range and never `latest`", () => {
    // A12. An overnight release of a third-party adapter must not change how the
    // agent behaves without someone having reviewed it — and a caret would do
    // exactly that while still looking pinned.
    for (const spec of ADAPTERS) {
      expect(spec.pinnedVersion).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("never takes the label from the package name", () => {
    // Measured (second-agent §4.1): `agentInfo.name` of codex-acp is
    // `@agentclientprotocol/codex-acp`. A screen that shows that string is
    // showing an npm coordinate to a person choosing an agent.
    for (const spec of ADAPTERS) {
      expect(spec.label).not.toBe(spec.package);
      expect(spec.label).not.toContain("@agentclientprotocol");
      expect(spec.label.trim()).not.toBe("");
    }
  });

  it("defaults to the adapter the first run installs", () => {
    expect(adapterById(DEFAULT_ADAPTER_ID)).toBe(CLAUDE_ADAPTER);
  });
});

describe("accounts", () => {
  /*
   * A conta é um diretório de config inteiro, passado por uma variável do
   * próprio CLI (ADR de 2026-09-26). O que este bloco protege é a Q6: a
   * variável muda **só** onde o CLI procura o login, e nunca o ambiente em que o
   * agente roda comando no seu repositório.
   */
  it("every spec declares the three account fields", () => {
    for (const spec of ADAPTERS) {
      expect(spec.accountEnv, spec.id).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(spec.defaultConfigDir, spec.id).toMatch(/^\.[a-z]+$/);
      expect(spec.inheritLinks.length, spec.id).toBeGreaterThan(0);
      expect(spec.identity, spec.id).not.toBeNull();
    }
  });

  it("never isolates by rewriting HOME or an XDG variable", () => {
    // Q6 e a alternativa que o ADR recusou: um agente num `HOME` que não é o
    // seu commita sem autor, dá `push` sem chave e roda outro `node`.
    for (const spec of ADAPTERS) {
      expect(spec.accountEnv, spec.id).not.toBe("HOME");
      expect(spec.accountEnv ?? "", spec.id).not.toMatch(/^XDG_/);
    }
  });

  it("links only relative behaviour items, never an identity file", () => {
    // A identidade nunca é herdada (Q10): um link para a credencial faria duas
    // contas serem a mesma, com duas linhas na tela.
    const identityFiles = [".claude.json", ".credentials.json", "auth.json"];
    for (const spec of ADAPTERS) {
      for (const item of spec.inheritLinks) {
        expect(item, spec.id).not.toMatch(/^\/|\.\./);
        expect(identityFiles, `${spec.id}: ${item}`).not.toContain(item);
      }
    }
  });

  it("says what a new account does not inherit — the Claude user MCPs live beside the identity", () => {
    // Q10: `~/.claude.json` carries the `mcpServers` of the user *and* the
    // `oauthAccount`; no link brings one without the other.
    expect(CLAUDE_ADAPTER.notInherited.length).toBeGreaterThan(0);
    expect(CLAUDE_ADAPTER.notInherited.join(" ")).toContain(".claude.json");
    expect(CODEX_ADAPTER.notInherited).toEqual([]);
  });

  it("claude isolates by CLAUDE_CONFIG_DIR and confers by `--cli auth status`", () => {
    expect(CLAUDE_ADAPTER).toMatchObject({
      accountEnv: "CLAUDE_CONFIG_DIR",
      defaultConfigDir: ".claude",
      identity: "cli-auth-status",
    });
    expect(CLAUDE_ADAPTER.inheritLinks).toEqual([
      "settings.json",
      "CLAUDE.md",
      "rules",
      "skills",
      "plugins",
      "agents",
    ]);
  });

  it("codex isolates by CODEX_HOME and confers by the auth notification", () => {
    expect(CODEX_ADAPTER).toMatchObject({
      accountEnv: "CODEX_HOME",
      defaultConfigDir: ".codex",
      identity: "auth-status-notification",
    });
    expect(CODEX_ADAPTER.inheritLinks).toEqual(["config.toml", "AGENTS.md", "skills"]);
  });
});

describe("the claude spec", () => {
  it("carries the five strings that used to be constants", () => {
    // The reason this test is literal: the migration from constants to a
    // catalogue is only safe if the claude values are byte-identical. Anything
    // else silently reinstalls, or probes a binary nobody has.
    expect(CLAUDE_ADAPTER).toMatchObject({
      command: "claude-agent-acp",
      package: "@agentclientprotocol/claude-agent-acp",
      pinnedVersion: "0.75.1",
      cli: null,
      apiKeyEnv: ["ANTHROPIC_API_KEY"],
    });
  });

  it("does not drive a CLI from the PATH any more", () => {
    /*
     * Isto **reverte** `"drives a CLI that has to exist"`, que afirmava
     * `cli.command === "claude"`. A afirmação era verdade no `0.40.0`; três
     * medições em 2026-09-08 a derrubaram para o `0.75.1`, e estão escritas no
     * comentário do campo:
     *
     * - `initialize` + `session/new` fecham com o `claude` fora do PATH;
     * - o daemon spawna `@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`,
     *   de dentro do pacote;
     * - os `authMethods` pedem `--cli auth login`, do próprio adaptador.
     *
     * O [ADR de
     * 2026-09-08](../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md)
     * é quem decide. O campo continua existindo — ver `agents.test.ts`, que o
     * exercita com uma spec sintética.
     */
    expect(CLAUDE_ADAPTER.cli).toBeNull();
  });

  it("is not pinned at the version whose embedded runtime the API refuses", () => {
    /*
     * LUM-54, and the reason this assertion names a number instead of a shape:
     * `0.40.0` embeds `@anthropic-ai/claude-agent-sdk@0.3.160` — Claude Code
     * `2.1.160` — and the API answers `session/prompt` with *"version 2.1.251 or
     * newer is required"*. Every turn died on a clean install, and the `claude`
     * of the PATH cannot help: the runtime that answers is the one inside the
     * adapter.
     *
     * A `not.toBe` rather than a comparison because there is no ordering to
     * check here — this is a known-bad version, and going back to it should cost
     * whoever does it a red test with the reason written down. What the version
     * *is* was measured, and is asserted above.
     */
    expect(CLAUDE_ADAPTER.pinnedVersion).not.toBe("0.40.0");
  });
});

describe("a recusa por cota é declarada, não descoberta", () => {
  it("o claude recusa com `data.errorKind: rate_limit` — medido em 2026-09-28", () => {
    // A forma veio de uma cota semanal esgotada de verdade, no `0.75.1`: `-32603`,
    // a mensagem do adaptador, e `data: { errorKind: "rate_limit" }`. O código é
    // o genérico; o que distingue é o `errorKind` (Q46 da `028`).
    expect(CLAUDE_ADAPTER.quotaRefusalKind).toBe("rate_limit");
  });

  it("o codex não foi medido, e o catálogo não inventa a palavra dele", () => {
    // Não medido não é não existe: `null` é "a recusa dele vira falha de turno
    // comum" até uma cota do Codex fechar de verdade (ADR de 2026-09-13).
    expect(CODEX_ADAPTER.quotaRefusalKind).toBeNull();
  });
});

describe("the codex spec", () => {
  it("brings its own CLI, so the spec declares none", () => {
    // Measured (§4.8): `codex-acp` depends on `@openai/codex` through
    // optionalDependencies, and the handshake answers with `PATH=/nonexistent`.
    // Giving it a `cli` "for symmetry" would make the pre-flight demand a binary
    // that nobody needs to install, and refuse a machine that works.
    expect(CODEX_ADAPTER.cli).toBeNull();
  });

  it("accepts either of the two key variables the adapter reads", () => {
    expect(CODEX_ADAPTER.apiKeyEnv).toEqual(["CODEX_API_KEY", "OPENAI_API_KEY"]);
  });

  it("is pinned at the version phase 0 measured", () => {
    expect(CODEX_ADAPTER.pinnedVersion).toBe("1.10.0");
  });
});

describe("adapterById", () => {
  it("answers null for an id nobody catalogued", () => {
    // Null rather than a throw: the caller translates it into the error of its
    // own floor, and the code that builds an error message cannot fail while
    // building an error message.
    expect(adapterById("gemini")).toBeNull();
  });
});

describe("adapterByCommand", () => {
  it("recognises a running adapter by its binary", () => {
    expect(adapterByCommand("codex-acp")).toBe(CODEX_ADAPTER);
  });

  it("does not guess for a command outside the catalogue", () => {
    // The `remedy` of a failed spawn depends on this: suggesting an npm package
    // for a command the product never catalogued would send someone to install
    // the wrong thing.
    expect(adapterByCommand("/opt/homebrew/bin/some-agent")).toBeNull();
  });
});

describe("adapterInstallCommand", () => {
  it("pins the version in the command it suggests", () => {
    expect(adapterInstallCommand(CODEX_ADAPTER)).toBe(
      "npm i -g @agentclientprotocol/codex-acp@1.10.0",
    );
  });

  it("suggests nothing for a spec with no package", () => {
    // A native agent has no adapter to install; the pre-flight says which binary
    // is missing instead of inventing an npm coordinate for it.
    expect(adapterInstallCommand({ ...CODEX_ADAPTER, package: null })).toBeNull();
  });
});

describe("reasoningMeta", () => {
  it("declares the reasoningMeta each adapter needs", () => {
    // `035` S1: o Claude `0.75.1` só manda o texto do pensamento se o resumo for
    // pedido; o `codex-acp@1.10.0` já pede `summary: "auto"` sozinho em todo turno.
    expect(CLAUDE_ADAPTER.reasoningMeta).toEqual({
      claudeCode: { options: { thinking: { type: "adaptive", display: "summarized" } } },
    });
    expect(CODEX_ADAPTER.reasoningMeta).toBeNull();
  });
});
