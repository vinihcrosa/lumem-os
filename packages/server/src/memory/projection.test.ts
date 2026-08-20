import type { AcpEvent, AcpTranscriptEntry } from "@lumem/shared";
import { describe, expect, it } from "vitest";

import { isEmpty, projectSession } from "./projection.js";

const CWD = "/repos/lorebase";

let clock = 1_700_000_000_000;
function at(event: AcpEvent): AcpTranscriptEntry {
  clock += 10;
  return { at: clock, event };
}

const read = (path: string): AcpEvent => ({
  type: "tool_call",
  toolCallId: `tc-${path}`,
  title: `Read ${path}`,
  name: "Read",
  kind: "read",
  status: "in_progress",
  locations: [{ path }],
});

describe("projectSession", () => {
  it("não carrega uma linha de prosa", () => {
    const projection = projectSession(
      [
        at({ type: "message", messageId: "m1", role: "user", text: "a senha é hunter2" }),
        at({ type: "message", messageId: "m2", role: "agent", text: "entendi, a senha é hunter2" }),
        at({ type: "thought", messageId: "t1", text: "vou usar a senha" }),
        at(read(`${CWD}/src/loader.ts`)),
      ],
      { cwd: CWD },
    );

    // Dump de transcript é o item que o §10 nomeia como coisa que nunca é
    // capturada, e é por onde segredo escapa.
    expect(JSON.stringify(projection)).not.toContain("hunter2");
    expect(projection.files).toEqual([{ path: "src/loader.ts", touches: 1 }]);
  });

  it("conta o que foi mais tocado, e ordena por isso", () => {
    const projection = projectSession(
      [
        at(read(`${CWD}/src/a.ts`)),
        at(read(`${CWD}/src/b.ts`)),
        at(read(`${CWD}/src/b.ts`)),
      ],
      { cwd: CWD },
    );

    expect(projection.files.map((file) => file.path)).toEqual(["src/b.ts", "src/a.ts"]);
  });

  it("caminho fora do checkout é descartado, não consertado", () => {
    const projection = projectSession([at(read("/etc/hosts"))], { cwd: CWD });

    // O agente lendo `/etc/hosts` não é conhecimento sobre o projeto — e o
    // caminho absoluto carregaria o nome da máquina para um arquivo versionado.
    expect(projection.files).toEqual([]);
  });

  it("comando entra pelo título; a saída dele nunca", () => {
    const projection = projectSession(
      [
        at({
          type: "tool_call",
          toolCallId: "tc-bash",
          title: "Bash pnpm gate:quick",
          name: "Bash",
          kind: "execute",
          status: "in_progress",
          locations: [],
        }),
        at({
          type: "tool_call_update",
          toolCallId: "tc-bash",
          status: "completed",
          content: [{ type: "content", text: "AWS_SECRET=abc" }],
        }),
      ],
      { cwd: CWD },
    );

    expect(projection.commands).toEqual(["Bash pnpm gate:quick"]);
    expect(JSON.stringify(projection)).not.toContain("AWS_SECRET");
  });

  it("o teto é duro, e o que sobrou é uma contagem", () => {
    const many = Array.from({ length: 20 }, (_, index) => at(read(`${CWD}/src/f${index}.ts`)));

    const projection = projectSession(many, { cwd: CWD });

    expect(projection.files).toHaveLength(12);
    expect(projection.filesOmitted).toBe(8);
  });

  it("turnos e custo: quantos, como terminaram, e o último usage", () => {
    const projection = projectSession(
      [
        at({ type: "usage", used: 1_000, size: 1_000_000 }),
        at({ type: "turn_end", stopReason: "end_turn" }),
        at({ type: "usage", used: 4_200, size: 1_000_000 }),
        at({ type: "turn_end", stopReason: "cancelled" }),
      ],
      { cwd: CWD },
    );

    expect(projection.turns).toBe(2);
    expect(projection.stopReasons).toEqual({ end_turn: 1, cancelled: 1 });
    // O último, e não a soma: o `usage` do ACP é acumulado por sessão.
    expect(projection.tokens).toBe(4_200);
  });

  it("sessão que só conversou não tem o que ensinar", () => {
    const projection = projectSession(
      [
        at({ type: "message", messageId: "m1", role: "user", text: "oi" }),
        at({ type: "turn_end", stopReason: "end_turn" }),
      ],
      { cwd: CWD },
    );

    expect(isEmpty(projection)).toBe(true);
  });
});
