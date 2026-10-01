import { useState } from "react";

import { Button } from "../../ui/index.js";
import { Terminal } from "../conversation/index.js";
import { useSessionMutations, useSessionsByScope, type Scope } from "./useSessionsByScope.js";

/**
 * A aba `Terminal`: **o único lugar onde um terminal nasce** (LUM-62). O menu
 * `＋ nova sessão` tinha o seu próprio caminho até `session.createShell`, e o mesmo
 * shell aparecia como aba no meio e aqui — uma ação, um lugar.
 *
 * Todo shell vivo do checkout mora aqui, então a faixa de estado é o seletor: um
 * botão por terminal, para voltar a um anterior sem fechar nenhum.
 */
export function TerminalTab({ scope }: { scope: Scope }) {
  const sessions = useSessionsByScope(scope);
  const { createShell } = useSessionMutations(scope);
  const [current, setCurrent] = useState<string | null>(null);

  const shells = (sessions.data ?? []).filter(
    (session) => session.kind === "shell" && session.state === "running",
  );
  const active = shells.find((shell) => shell.id === current) ?? shells[0] ?? null;

  // `mutate`, not `mutateAsync`: a refusal ends up in `createShell.error`, drawn
  // below, instead of a rejected promise nobody awaits.
  function open(): void {
    createShell.mutate(undefined, { onSuccess: (created) => setCurrent(created.id) });
  }

  // The dock is the only way to open a terminal (LUM-62), so the daemon's reason
  // for a refusal — `a worktree "x" não está no disco` — has nowhere else to go.
  const refusal = createShell.isError ? (
    <span className="trust__note" role="alert">
      {createShell.error.message}
    </span>
  ) : null;

  if (active === undefined || active === null) {
    return (
      <div className="dock__idle">
        <span>Nenhum terminal aberto neste checkout.</span>
        <Button size="sm" disabled={createShell.isPending} onClick={open}>
          ＋ abrir terminal
        </Button>
        {refusal}
      </div>
    );
  }

  return (
    <>
      <div className="dock__state">
        <div className="dock__terms" role="group" aria-label="terminais do checkout">
          {shells.map((shell, index) => (
            <button
              key={shell.id}
              type="button"
              className={`dock__term${shell.id === active.id ? " dock__term--active" : ""}`}
              aria-pressed={shell.id === active.id}
              onClick={() => setCurrent(shell.id)}
            >
              terminal {index + 1}
            </button>
          ))}
        </div>
        <span className="dock__cmd dock__cmd--dim">cwd {active.cwd}</span>
        {refusal}
        <span className="dock__spacer" />
        <button
          type="button"
          className="dock__new"
          disabled={createShell.isPending}
          onClick={open}
        >
          ＋ outro terminal
        </button>
      </div>
      <div className="dock__out">
        <Terminal key={active.id} sessionId={active.id} />
      </div>
    </>
  );
}
