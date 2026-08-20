import type { AcpEvent } from "@lumem/shared";
import { describe, expect, it } from "vitest";

import { playbookLoadedBy } from "./playbook-telemetry.js";

const KNOWN = [
  {
    path: "workspaces/ws1/playbooks/investigar-teste-flaky/PLAYBOOK.md",
    slug: "investigar-teste-flaky",
    taskClass: "Investigar teste flaky",
  },
  {
    path: "workspaces/ws1/playbooks/revisar/PLAYBOOK.md",
    slug: "revisar",
    taskClass: "Revisar",
  },
];

const call = (overrides: Partial<Extract<AcpEvent, { type: "tool_call" }>>): AcpEvent => ({
  type: "tool_call",
  toolCallId: "tc-1",
  title: "Skill investigar-teste-flaky",
  name: "Skill",
  kind: "other",
  status: "running",
  locations: [],
  ...overrides,
});

describe("playbookLoadedBy", () => {
  it("um `tool_call` de Skill que nomeia o playbook conta", () => {
    expect(playbookLoadedBy(call({}), KNOWN)).toEqual({
      path: "workspaces/ws1/playbooks/investigar-teste-flaky/PLAYBOOK.md",
    });
  });

  it("casa também pela classe de tarefa, como a pessoa a escreveu", () => {
    const loaded = playbookLoadedBy(
      call({ title: "Skill: Investigar teste flaky", name: "Skill" }),
      KNOWN,
    );

    expect(loaded?.path).toContain("investigar-teste-flaky");
  });

  it("evento que não se diz Skill não conta, mesmo citando o nome", () => {
    // Um `Read` do próprio arquivo do playbook não é carregamento de playbook —
    // e é exatamente o caso em que superconter passaria despercebido.
    const loaded = playbookLoadedBy(
      call({
        name: "Read",
        title: "Read workspaces/ws1/playbooks/investigar-teste-flaky/PLAYBOOK.md",
      }),
      KNOWN,
    );

    expect(loaded).toBeNull();
  });

  it("slug curto não engole o do vizinho", () => {
    // Sem fronteira de palavra, `revisar` casaria em "revisar-pr-grande" e o
    // playbook errado pareceria vivo.
    expect(playbookLoadedBy(call({ title: "Skill revisar-pr-grande" }), KNOWN)).toBeNull();
  });

  it("outro evento qualquer não conta", () => {
    expect(playbookLoadedBy({ type: "turn_end", stopReason: "end_turn" }, KNOWN)).toBeNull();
  });
});
