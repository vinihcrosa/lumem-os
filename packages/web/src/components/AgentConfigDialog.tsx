import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { trpc } from "../lib/trpc.js";
import { Banner, Button, Card, Chip, Field, Glyph, Input } from "../ui/index.js";

/** The key the session menu reads too, so creating one shows it there at once. */
const AGENT_CONFIGS_KEY = ["agentConfig", "list"];

type Transport = "pty" | "acp";

/**
 * The agents this daemon knows how to launch, and how to add one.
 *
 * This exists because the ACP transport made it necessary. The CRUD is the
 * `walking-skeleton`'s and never needed a screen — the seeded `claude-code`
 * configuration comes up on boot (F6.4) and creating another was convenience. An
 * **ACP** configuration is different: it needs a `transport` (F1.2) and a pinned
 * adapter version (F5.5), and no screen could write either, so the only way to use
 * the conversation at all was an HTTP call by hand.
 *
 * In the sidebar footer beside "adicionar projeto", reusing that form's shape. The
 * lie in the placement is named in A16: `agent_config` has no workspace, and the
 * footer does — a preferences screen would be the honest home, and it does not exist.
 */
export function AgentConfigDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const configs = useQuery({
    queryKey: AGENT_CONFIGS_KEY,
    queryFn: () => trpc.agentConfig.list.query(),
    enabled: open,
  });

  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  /*
   * ACP by default.
   *
   * A11 defaults the *column* to `pty`, so that migrating a row changes nothing
   * about how it behaves. A human typing into this form is a different question: the
   * PTY configuration already exists from the seed, and the reason to be here is the
   * conversation.
   */
  const [transport, setTransport] = useState<Transport>("acp");
  const [adapterVersion, setAdapterVersion] = useState("");
  /** Which row asked to be removed and is waiting for a second click. */
  const [confirming, setConfirming] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      trpc.agentConfig.create.mutate({
        name: name.trim(),
        command: command.trim(),
        // Split on whitespace, because that is how a command line is written. The
        // wire wants a list, and joining it back together downstream would make the
        // daemon guess where one argument ends.
        args: args.trim() === "" ? [] : args.trim().split(/\s+/),
        transport,
        ...(transport === "acp" ? { adapterVersion: adapterVersion.trim() } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AGENT_CONFIGS_KEY });
      setName("");
      setCommand("");
      setArgs("");
      setAdapterVersion("");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => trpc.agentConfig.remove.mutate({ id }),
    onSuccess: async () => {
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: AGENT_CONFIGS_KEY });
    },
  });

  /*
   * The daemon's CHECK, repeated here on purpose (D17).
   *
   * Repeating a rule is a debt, and this one pays: without it the only way to find
   * out the version is missing is to submit and read a refusal — and this is the rule
   * that separates a conversation from a terminal, which is the most consequential
   * choice on the form. The daemon stays the authority: whatever it refuses shows up
   * in its own words.
   */
  const complete =
    name.trim() !== "" &&
    command.trim() !== "" &&
    (transport === "pty" || adapterVersion.trim() !== "");

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!complete) return;
    create.mutate();
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

        {list.map((config) => {
          const conversation = config.transport === "acp";
          return (
            <div className="agents__row" key={config.id}>
              <div className="agents__head">
                <Glyph tone={conversation ? "agent" : "shell"}>{conversation ? "◆" : "●"}</Glyph>
                <span className="agents__name">{config.name}</span>
                {/*
                  The word carries the fact and the colour does not. Colour is spoken
                  for by state — the chip beside it — and an element with two colour
                  axes has none.
                */}
                <Chip>{conversation ? "conversa" : "terminal"}</Chip>
                {/* F6.5, and the same words the session menu uses: a list that
                    disagreed with the menu about what is launchable would be a
                    second, quieter truth. */}
                {!config.available && <Chip tone="missing">fora do PATH</Chip>}
              </div>
              <div className="agents__foot">
                <span className="agents__cmd" title={config.command}>
                  {config.command}
                  {conversation && config.adapterVersion ? ` @${config.adapterVersion}` : ""}
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
                    onClick={() => remove.mutate(config.id)}
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
          );
        })}

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

          <Field id="agent-transport" label="Transporte">
            <select
              id="agent-transport"
              className="input"
              value={transport}
              onChange={(event) => setTransport(event.target.value as Transport)}
            >
              {/* The user's words first, the protocol's in brackets: what changes is
                  whether the tab is a conversation or a terminal. */}
              <option value="acp">conversa (ACP)</option>
              <option value="pty">terminal (PTY)</option>
            </select>
          </Field>

          <Field id="agent-command" label="Comando">
            <Input
              id="agent-command"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder={transport === "acp" ? "claude-agent-acp" : "claude"}
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

          {/* Only on ACP, and required there: the column's CHECK forbids it on PTY,
              where it would be a claim about something that never runs. */}
          {transport === "acp" && (
            <Field id="agent-version" label="Versão do adaptador">
              <Input
                id="agent-version"
                value={adapterVersion}
                onChange={(event) => setAdapterVersion(event.target.value)}
                placeholder="0.40.0"
              />
            </Field>
          )}

          <div className="agents__actions">
            <Button type="submit" variant="primary" disabled={create.isPending || !complete}>
              {create.isPending ? "criando…" : "adicionar"}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              fechar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
