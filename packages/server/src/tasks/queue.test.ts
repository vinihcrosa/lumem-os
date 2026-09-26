import { newId } from "@lumem/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { project, session, task, workspace } from "../db/schema.js";
import { DUE_STAGES, queueOf, slotsOf } from "./queue.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";

/**
 * A fila da esteira (`028` Parte 2, T24 e T25).
 *
 * Ela é **uma leitura**, e é isso que a maior parte destes casos cobra: não
 * existe nada guardado dizendo *"esta está na fila"*, então tudo que muda a
 * resposta é estado que já estava lá — a coluna, o turno em voo, o interruptor.
 */

let context: TestCaller;

afterEach(async () => {
  await context?.cleanup();
});

async function scene() {
  context = createTestCaller();
  const { api, db } = context;
  const space = await api.workspace.create({ name: `acme-${newId()}` });
  const projectId = newId();
  await db.insert(project).values({
    id: projectId,
    workspaceId: space.id,
    name: "acme-api",
    path: `/repos/${projectId}`,
    defaultBranch: "main",
  });

  async function card(title: string, status: string) {
    const created = await api.task.create({ workspaceId: space.id, projectId, title });
    if (status === "open") return created.id;
    /*
     * Pela porta normal, e não com `UPDATE` cru: `done` e `dropped` exigem
     * `closed_at`, cobrado por `CHECK`, e escrever direto no banco derrubava o
     * teste com uma mensagem que não fala de fila. O arranjo tem que ser
     * construível pelo produto.
     */
    await api.task.setStatus({ id: created.id, status: status as "review" });
    return created.id;
  }

  /** Uma sessão presa a uma tarefa, para o turno em voo ter em quem pousar. */
  async function sessionOn(taskId: string) {
    const id = `ses-${newId()}`;
    await db.insert(session).values({
      id,
      kind: "shell",
      scopeType: "project",
      scopeId: projectId,
      cwd: "/repos",
      command: "bash",
      taskId,
    });
    return id;
  }

  return { api, db, workspaceId: space.id, projectId, card, sessionOn };
}

describe("uma regra, nenhum caso especial", () => {
  it("puxa da direita para a esquerda — terminar vale mais que começar", async () => {
    const { db, workspaceId, card } = await scene();
    const toDo = await card("nova", "open");
    const reviewing = await card("esperando revisor", "review");
    const testing = await card("esperando testador", "testing");

    const { entries } = queueOf(db, { workspaceId, liveTurns: [] });

    // A ordem **é** a política do §4.1, e por isso ela é um array e não um
    // `CASE` no `ORDER BY`: quem lê a lista lê a regra.
    expect(entries.map((entry) => entry.task.id)).toEqual([testing, reviewing, toDo]);
  });

  it("cada etapa pede o encaixe dela", async () => {
    const { db, workspaceId, card } = await scene();
    await card("nova", "open");
    await card("esperando revisor", "review");
    await card("esperando testador", "testing");

    const { entries } = queueOf(db, { workspaceId, liveTurns: [] });

    expect(entries.map((entry) => entry.role)).toEqual(["testador", "revisor", "implementador"]);
  });

  it("dentro da coluna, a posição é a prioridade", async () => {
    const { api, db, workspaceId, card } = await scene();
    const first = await card("primeira", "open");
    const second = await card("segunda", "open");
    await api.task.move({ id: second, status: "open", index: 0 });

    const { entries } = queueOf(db, { workspaceId, liveTurns: [] });

    // §4.3: *"a posição na coluna é a prioridade, e não existe campo de
    // prioridade"*. Arrastar é o gesto, e a fila obedece sem saber disso.
    expect(entries.map((entry) => entry.task.id)).toEqual([second, first]);
  });

  it("as colunas que não são etapa da máquina nunca entram", async () => {
    const { db, workspaceId, card } = await scene();
    await card("não autorizada", "backlog");
    await card("sua vez", "ready_to_merge");
    await card("acabou", "done");

    /*
     * As três dizem coisas diferentes e todas dizem *"não é da esteira"*:
     * `backlog` é o que ainda não foi autorizado — a coluna existe para marcar
     * essa fronteira —, `ready_to_merge` é sua vez, e o §4.1 a criou justamente
     * para a fila não pegar de volta o que já foi aprovado.
     */
    expect(queueOf(db, { workspaceId, liveTurns: [] }).entries).toEqual([]);
  });

  it("`dropped` sai do quadro e não volta pela fila", async () => {
    const { db, workspaceId, card, api } = await scene();
    const id = await card("mudei de ideia", "open");
    await api.task.setStatus({ id, status: "dropped", reason: "não é mais necessário" });

    expect(queueOf(db, { workspaceId, liveTurns: [] }).entries).toEqual([]);
  });
});

describe("quem já tem trabalhador não está na fila", () => {
  it("um turno em voo tira o cartão da fila, sem nenhuma escrita", async () => {
    const { db, workspaceId, card, sessionOn } = await scene();
    const busy = await card("já tem alguém", "in_progress");
    const free = await card("não tem", "review");
    const sessionId = await sessionOn(busy);

    const { entries } = queueOf(db, {
      workspaceId,
      liveTurns: [{ sessionId, startedAt: new Date() }],
    });

    expect(entries.map((entry) => entry.task.id)).toEqual([free]);
  });

  it("matar a sessão devolve o cartão na leitura seguinte", async () => {
    const { db, workspaceId, card, sessionOn } = await scene();
    const id = await card("em progresso", "in_progress");
    const sessionId = await sessionOn(id);

    const before = queueOf(db, { workspaceId, liveTurns: [{ sessionId, startedAt: new Date() }] });
    const after = queueOf(db, { workspaceId, liveTurns: [] });

    /*
     * **A recuperação inteira da esteira, em duas linhas.** É o
     * [ADR](../../../../docs/adr/2026-09-13-0412-the-conveyor-has-no-lease.md):
     * não há lease para expirar nem varredor para rodar, porque não há estado
     * guardado. O turno sumiu, e a leitura seguinte já responde diferente.
     */
    expect(before.entries).toEqual([]);
    expect(after.entries.map((entry) => entry.task.id)).toEqual([id]);
  });

  it("uma sessão sem tarefa não tira cartão nenhum da fila", async () => {
    const { db, workspaceId, card, projectId } = await scene();
    const id = await card("nova", "open");
    const loose = `ses-${newId()}`;
    await db.insert(session).values({
      id: loose,
      kind: "shell",
      scopeType: "project",
      scopeId: projectId,
      cwd: "/repos",
      command: "bash",
    });

    // Um shell aberto ao lado é o caso comum do produto, e ele não está
    // trabalhando em tarefa nenhuma.
    expect(
      queueOf(db, { workspaceId, liveTurns: [{ sessionId: loose, startedAt: new Date() }] }).entries
        .length,
    ).toBe(1);
    expect(queueOf(db, { workspaceId, liveTurns: [] }).entries[0]?.task.id).toBe(id);
  });
});

describe("a autonomia da tarefa é condição da fila, não exceção", () => {
  it("um cartão que você assumiu não é candidato", async () => {
    const { db, workspaceId, card } = await scene();
    const mine = await card("estou nesta", "in_progress");
    const theirs = await card("ninguém está", "review");
    await db.update(task).set({ autonomy: "off" }).where(eq(task.id, mine));

    // A Q40 é explícita: a autonomia por tarefa **não** é exceção da fila, é
    // condição dela — como o teto e o orçamento são.
    expect(queueOf(db, { workspaceId, liveTurns: [] }).entries.map((e) => e.task.id)).toEqual([
      theirs,
    ]);
  });
});

describe("quantas de uma vez", () => {
  it("vaga é teto menos turno em voo, e nunca negativa", () => {
    expect(slotsOf({ ceiling: 2, turnsInFlight: 0 })).toBe(2);
    expect(slotsOf({ ceiling: 2, turnsInFlight: 1 })).toBe(1);
    // Baixar o teto com três em voo não pode devolver `-1`: quem chama trata
    // isso como *"quantas abrir agora"*, e um número negativo viraria um laço
    // que não roda ou um erro longe daqui.
    expect(slotsOf({ ceiling: 2, turnsInFlight: 3 })).toBe(0);
  });

  it("o default é 2, que é o número da folha", async () => {
    const { db, workspaceId } = await scene();

    expect(queueOf(db, { workspaceId, liveTurns: [] }).slots).toBe(2);
  });

  it("conta só os turnos deste workspace", async () => {
    const { db, workspaceId, card, sessionOn } = await scene();
    const mine = await card("desta", "in_progress");
    const here = await sessionOn(mine);
    const other = await scene();
    const theirs = await other.card("da outra", "in_progress");
    const there = await other.sessionOn(theirs);

    /*
     * O teto é do workspace. Sem este recorte, um workspace ocupado fecharia a
     * fila de outro — e a folha do Open Design desenha `teto 2 · 2 em uso` ao
     * lado de um quadro, que é a tela de **um** workspace.
     */
    const facts = queueOf(db, {
      workspaceId,
      liveTurns: [
        { sessionId: here, startedAt: new Date() },
        { sessionId: there, startedAt: new Date() },
      ],
    });

    expect(facts.slots).toBe(1);
  });

  it("`0` não deixa vaga nenhuma — é como se pausa a esteira", async () => {
    const { db, workspaceId, card } = await scene();
    await card("nova", "open");
    await db.update(workspace).set({ autonomyMaxParallel: 0 }).where(eq(workspace.id, workspaceId));

    const facts = queueOf(db, { workspaceId, liveTurns: [] });

    // A fila **continua respondendo** o que está devido: pausar não é esquecer.
    // Quem não abre sessão é quem lê `slots`.
    expect(facts.slots).toBe(0);
    expect(facts.entries.length).toBe(1);
  });

  it("o interruptor do workspace vem junto, e nasce em `manual`", async () => {
    const { db, workspaceId } = await scene();

    expect(queueOf(db, { workspaceId, liveTurns: [] }).autonomy).toBe("manual");
  });

  it("workspace que não existe devolve fila vazia e zero vaga", async () => {
    const { db } = await scene();

    // Nem exceção nem fila cheia: quem chama é um laço de fundo, e derrubá-lo
    // por um id velho seria parar a esteira inteira por causa de um workspace.
    expect(queueOf(db, { workspaceId: "nao-existe", liveTurns: [] })).toEqual({
      slots: 0,
      autonomy: "manual",
      entries: [],
    });
  });
});

describe("o que a lista de etapas diz", () => {
  it("são quatro, e `open` e `in_progress` pedem o mesmo encaixe", () => {
    // Escrito como asserção porque é fácil de errar lendo: a To-Do e o
    // In Progress são etapas diferentes do quadro e **o mesmo** papel — o
    // segundo é o primeiro que já começou e cuja sessão morreu.
    expect(DUE_STAGES.map((stage) => `${stage.status}:${stage.role}`)).toEqual([
      "testing:testador",
      "review:revisor",
      "in_progress:implementador",
      "open:implementador",
    ]);
  });
});
