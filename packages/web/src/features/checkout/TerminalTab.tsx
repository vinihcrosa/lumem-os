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

  async function open(): Promise<void> {
    const created = await createShell.mutateAsync();
    setCurrent(created.id);
  }

  if (active === undefined || active === null) {
    return (
      <div className="dock__idle">
        <span>Nenhum terminal aberto neste checkout.</span>
        <Button size="sm" onClick={() => void open()}>
          ＋ abrir terminal
        </Button>
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
        <span className="dock__spacer" />
        <button type="button" className="dock__new" onClick={() => void open()}>
          ＋ outro terminal
        </button>
      </div>
      <div className="dock__out">
        <Terminal key={active.id} sessionId={active.id} />
      </div>
    </>
  );
}
