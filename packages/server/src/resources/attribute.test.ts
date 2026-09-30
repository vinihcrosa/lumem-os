import { describe, expect, it } from "vitest";

import { attribute } from "./attribute.js";
import type { ProcessRow } from "./process-table.js";

const row = (pid: number, ppid: number, command = "x"): ProcessRow => ({
  pid,
  ppid,
  rssBytes: 1,
  cpuSeconds: 0,
  command,
});

describe("attribute", () => {
  it("attributes a process to its nearest tracked ancestor", () => {
    const table = [
      row(100, 1, "node"), // o daemon
      row(200, 100, "claude-agent-acp"), // filho do daemon: um adaptador ACP
      row(201, 200, "node"),
      row(202, 201, "git"), // neto do adaptador
      row(300, 100, "zsh"), // filho do daemon: um PTY
      row(301, 300, "vim"),
      row(302, 301, "less"), // bisneto do PTY
      row(400, 100, "git"), // filho do daemon que ninguém rastreia
      row(999, 1, "Safari"), // fora da árvore do daemon
    ];

    const result = attribute(table, {
      daemonPid: 100,
      agents: [{ pid: 200, sessionId: "ses-agent" }],
      terminals: [{ pid: 300, sessionId: "ses-shell" }],
    });

    const groupOf = (pid: number) => result.get(pid)?.group;
    expect(groupOf(202)).toBe("agents");
    expect(groupOf(201)).toBe("agents");
    expect(groupOf(200)).toBe("agents");
    expect(groupOf(301)).toBe("terminals");
    expect(groupOf(302)).toBe("terminals");
    expect(groupOf(300)).toBe("terminals");
    expect(groupOf(100)).toBe("daemon");
    // Sem outro ancestral rastreado, o filho é do daemon.
    expect(groupOf(400)).toBe("daemon");
    // Quem não desce do daemon não entra em grupo nenhum.
    expect(result.has(999)).toBe(false);

    // A raiz diz **qual sessão**: é o que o rótulo do `top` lê.
    expect(result.get(202)?.root).toEqual({ kind: "agent", pid: 200, sessionId: "ses-agent" });
    expect(result.get(302)?.root).toEqual({ kind: "terminal", pid: 300, sessionId: "ses-shell" });
    expect(result.get(400)?.root).toEqual({ kind: "daemon", pid: 100, sessionId: null });
  });

  it("stops at a parent loop instead of walking forever", () => {
    // Um `ppid` que aponta de volta (pid reaproveitado entre dois `ps`) não pode
    // travar o daemon num laço de leitura.
    const table = [row(100, 1), row(500, 501), row(501, 500)];

    const result = attribute(table, { daemonPid: 100, agents: [], terminals: [] });

    expect([...result.keys()]).toEqual([100]);
  });
});
