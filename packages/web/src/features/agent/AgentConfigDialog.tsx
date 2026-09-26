import { CLAUDE_ADAPTER } from "@lumem/shared";
import { useState, type FormEvent } from "react";

import { useAgentConfigMutations, useAgentConfigs } from "./queries.js";
import { Banner, Button, Card, Chip, Field, Glyph, Input } from "../../ui/index.js";

/**
 * The agents this daemon knows how to launch, and how to add one.
 *
 * This exists because the ACP transport made it necessary. The CRUD is the
 * `walking-skeleton`'s and never needed a screen — the seeded `claude-code`
 * configuration comes up on boot (F6.4) and creating another was convenience. An
 * **ACP** configuration is different: it needs a pinned adapter version (F5.5), and
 * no screen could write it, so the only way to use the conversation at all was an
 * HTTP call by hand. There is no transport to pick (`033` F1.1): every
 * configuration is an ACP adapter, so the field is gone rather than disabled — a
 * greyed-out choice would still say there is one.
 *
 * In the sidebar footer, reusing the shape of a form that used to sit beside it —
 * `sidebar-actions` moved `adicionar projeto` up into the tree, and this is what
 * the footer was left with. The lie in the placement is named in A16:
 * `agent_config` has no workspace, and the footer does; a preferences screen would
 * be the honest home, and it does not exist.
 */
export interface AgentConfigDialogProps {
  /**
   * Rendered already open, without its own trigger.
   *
   * True when it is embedded in the login panel, which is the only way in now:
   * the footer's action is "conectar um agente", and this form is the drawer
   * behind "outro agente ACP…" — a trigger of its own there would be a second
   * button that opens what is already open.
   */
  embedded?: boolean;
  /** Called when the embedded form is done with the panel. */
  onClose?: () => void;
}

export function AgentConfigDialog({ embedded = false, onClose }: AgentConfigDialogProps = {}) {
  const [open, setOpen] = useState(embedded);

  const configs = useAgentConfigs({ enabled: open });
  const { create, remove } = useAgentConfigMutations();

  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [adapterVersion, setAdapterVersion] = useState("");
  /** Which row asked to be removed and is waiting for a second click. */
  const [confirming, setConfirming] = useState<string | null>(null);

  /*
   * The daemon's CHECK, repeated here on purpose (D17).
   *
   * Repeating a rule is a debt, and this one pays: without it the only way to find
   * out the version is missing is to submit and read a refusal — and this is the rule
   * the daemon has refused every configuration without it since `033`. The daemon
   * stays the authority: whatever it refuses shows up in its own words.
   */
  const complete = name.trim() !== "" && command.trim() !== "" && adapterVersion.trim() !== "";

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!complete) return;
    create.mutate(
      {
        name: name.trim(),
        command: command.trim(),
        // Split on whitespace, because that is how a command line is written. The
        // wire wants a list, and joining it back together downstream would make the
        // daemon guess where one argument ends.
        args: args.trim() === "" ? [] : args.trim().split(/\s+/),
        adapterVersion: adapterVersion.trim(),
      },
      {
        onSuccess: () => {
          setName("");
          setCommand("");
          setArgs("");
          setAdapterVersion("");
        },
      },
    );
  };

  if (!open) {
    return (
      <button type="button" className="sidebar__add" onClick={() => setOpen(true)}>
        <Glyph tone="agent">◆</Glyph>
        agentes
      </button>
    );
  }

  const list = configs.data ?? [];

  return (
    <div className="agents">
      <Card>
        {list.length === 0 && !configs.isPending && (
          <p className="agents__empty">nenhum agente configurado</p>
        )}

        {list.map((config) => (
          <div className="agents__row" key={config.id}>
            <div className="agents__head">
              <Glyph tone="agent">◆</Glyph>
              <span className="agents__name">{config.name}</span>
              {/* F6.5: shown, and said why it cannot launch. */}
              {!config.available && <Chip tone="missing">fora do PATH</Chip>}
            </div>
            <div className="agents__foot">
              <span className="agents__cmd" title={config.command}>
                {config.command}
                {config.adapterVersion ? ` @${config.adapterVersion}` : ""}
              </span>
              {/*
                Two clicks, because one is a mis-click away from retyping four
                fields. Not a modal: the daemon refuses a configuration still in use
                (IN_USE), which is the guard that matters, and this one is only about
                the pointer slipping.
              */}
              {confirming === config.id ? (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(config.id, { onSuccess: () => setConfirming(null) })}
                >
                  confirmar
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirming(config.id)}>
                  remover <span className="sr-only">{config.name}</span>
                </Button>
              )}
            </div>
          </div>
        ))}

        {remove.isError && <Banner tone="danger">{remove.error.message}</Banner>}

        <form className="agents__form" onSubmit={submit}>
          <Field
            id="agent-name"
            label="Nome"
            // The daemon's own words. A duplicate name is the common one, and only it
            // knows which of its constraints refused.
            error={create.isError ? create.error.message : undefined}
          >
            <Input
              id="agent-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="claude-acp"
              invalid={create.isError}
              autoFocus
            />
          </Field>

          <Field id="agent-command" label="Comando">
            <Input
              id="agent-command"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="claude-agent-acp"
            />
          </Field>

          <Field id="agent-args" label="Argumentos (opcional)">
            <Input
              id="agent-args"
              value={args}
              onChange={(event) => setArgs(event.target.value)}
              placeholder="--flag valor"
            />
          </Field>

          <Field id="agent-version" label="Versão do adaptador">
            <Input
              id="agent-version"
              value={adapterVersion}
              onChange={(event) => setAdapterVersion(event.target.value)}
              // From the catalogue, not typed here: a hint that outlives the
              // pin teaches the version the product no longer installs, which
              // is how LUM-54 read as normal for weeks.
              placeholder={CLAUDE_ADAPTER.pinnedVersion}
            />
          </Field>

          <div className="agents__actions">
            <Button type="submit" variant="primary" disabled={create.isPending || !complete}>
              {create.isPending ? "criando…" : "adicionar"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (embedded) onClose?.();
                else setOpen(false);
              }}
            >
              fechar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
