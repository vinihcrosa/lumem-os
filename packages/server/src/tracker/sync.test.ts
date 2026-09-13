import { newId } from "@lumem/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { project, task } from "../db/schema.js";
import { bodyHash, changeOf, firstProjectOf, syncTracker, LUMEM_LABEL } from "./sync.js";
import type { TrackerHost, TrackerIssue } from "./TrackerHost.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";

/**
 * A issue que vira cartão (`028` Parte 5, T44 e T45).
 *
 * O host é falso, e é o assunto: o que está sob teste é **a costura** — a
 * idempotência, o instantâneo, e qual das três mudanças o cartão nomeia. O
 * Linear tem os testes dele no `LinearHost.test.ts`.
 */

let context: TestCaller;

afterEach(async () => {
  await context?.cleanup();
});

const issue = (patch: Partial<TrackerIssue> = {}): TrackerIssue => ({
  id: "iss-1",
  key: "ACME-142",
  title: "o /orders devolve 500",
  body: "quando o carrinho está vazio",
  url: "https://linear.app/acme/issue/ACME-142",
  state: "open",
  assignee: "user-1",
  ...patch,
});

function fakeHost(issues: TrackerIssue[], available = true): TrackerHost {
  return {
    id: "linear",
    keyEnv: "LINEAR_API_KEY",
    available: () => available,
    labelled: vi.fn(async () => Promise.resolve(issues)),
    comment: vi.fn(async () => Promise.resolve()),
    moveState: vi.fn(async () => Promise.resolve()),
  };
}

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
  return { api, db, workspaceId: space.id, projectId };
}

describe("sem chave, nada acontece e nada quebra", () => {
  it("o host indisponível não é consultado", async () => {
    const { db, workspaceId } = await scene();
    const host = fakeHost([issue()], false);

    expect(await syncTracker({ db, host, projectFor: firstProjectOf(db) }, workspaceId)).toEqual({
      created: 0,
      blocked: 0,
    });
    expect(host.labelled).not.toHaveBeenCalled();
  });
});

describe("a issue vira cartão, uma vez", () => {
  it("cai direto na To-Do, com o link", async () => {
    const { db, workspaceId } = await scene();

    await syncTracker({ db, host: fakeHost([issue()]), projectFor: firstProjectOf(db) }, workspaceId);

    const [row] = await db.select().from(task);
    /*
     * *"O default é executar, e quem quiser triagem configura"* — §6. Ela nasce
     * em `open`, que é a To-Do, e não em `proposed`: quem pôs o rótulo na issue
     * foi uma pessoa.
     */
    expect(row).toMatchObject({
      status: "open",
      title: "o /orders devolve 500",
      externalSource: "linear",
      externalId: "iss-1",
    });
    expect(JSON.parse(row!.links) as string[]).toEqual([
      "https://linear.app/acme/issue/ACME-142",
    ]);
  });

  it("rodar duas vezes não cria nada na segunda", async () => {
    const { db, workspaceId } = await scene();
    const deps = { db, host: fakeHost([issue()]), projectFor: firstProjectOf(db) };

    const first = await syncTracker(deps, workspaceId);
    const second = await syncTracker(deps, workspaceId);

    // Idempotência é **o requisito**, e não *"não duplicar"* — que é a mesma
    // coisa dita de um jeito que permite errar por um.
    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(await db.select().from(task)).toHaveLength(1);
  });

  it("o rótulo consultado é o do produto", async () => {
    const { db, workspaceId } = await scene();
    const host = fakeHost([]);

    await syncTracker({ db, host, projectFor: firstProjectOf(db) }, workspaceId);

    expect(host.labelled).toHaveBeenCalledWith(LUMEM_LABEL);
  });

  it("workspace sem projeto não inventa um", async () => {
    context = createTestCaller();
    const space = await context.api.workspace.create({ name: `vazio-${newId()}` });

    const result = await syncTracker(
      { db: context.db, host: fakeHost([issue()]), projectFor: firstProjectOf(context.db) },
      space.id,
    );

    // A tarefa é de um projeto só desde a `022`, e escolher um seria o produto
    // decidindo por você.
    expect(result.created).toBe(0);
  });
});

describe("mudou no meio, e o cartão diz qual das três (Q63)", () => {
  const stored = {
    externalState: "open",
    externalAssignee: "user-1",
    externalBodyHash: bodyHash("quando o carrinho está vazio"),
  };

  it("reatribuída", () => {
    expect(changeOf(stored, issue({ assignee: "user-2" }))).toBe(
      "a issue foi reatribuída no tracker",
    );
  });

  it("desatribuída é uma frase própria", () => {
    // *"Reatribuída"* para ninguém não é reatribuída: quem lê precisa saber que
    // a issue ficou **sem dono**, que é uma ação diferente da de passar adiante.
    expect(changeOf(stored, issue({ assignee: null }))).toBe(
      "a issue foi desatribuída no tracker",
    );
  });

  it("fechada", () => {
    expect(changeOf(stored, issue({ state: "closed" }))).toBe("a issue foi fechada no tracker");
  });

  it("descrição editada", () => {
    expect(changeOf(stored, issue({ body: "outro corpo" }))).toBe(
      "a descrição da issue mudou no tracker",
    );
  });

  it("nada mudou é `null`", () => {
    expect(changeOf(stored, issue())).toBeNull();
  });

  it("o corpo é comparado por hash, e o hash é estável", () => {
    // O corpo é texto livre de tamanho arbitrário: guardá-lo aqui duplicaria a
    // descrição da tarefa dentro da própria tarefa.
    expect(bodyHash("a")).toBe(bodyHash("a"));
    expect(bodyHash("a")).not.toBe(bodyHash("b"));
  });
});

describe("a mudança bloqueia, uma vez", () => {
  it("bloqueia com o motivo e desliga a autonomia", async () => {
    const { db, workspaceId } = await scene();
    await syncTracker({ db, host: fakeHost([issue()]), projectFor: firstProjectOf(db) }, workspaceId);

    const result = await syncTracker(
      { db, host: fakeHost([issue({ state: "closed" })]), projectFor: firstProjectOf(db) },
      workspaceId,
    );

    expect(result.blocked).toBe(1);
    const [row] = await db.select().from(task);
    expect(row).toMatchObject({
      blockedReason: "a issue foi fechada no tracker",
      // Sem desligar, a fila pegaria de volta em 15 segundos um cartão que o
      // tracker acabou de dizer que não é mais para fazer.
      autonomy: "off",
    });
  });

  it("uma já bloqueada não é bloqueada de novo", async () => {
    const { db, workspaceId } = await scene();
    await syncTracker({ db, host: fakeHost([issue()]), projectFor: firstProjectOf(db) }, workspaceId);
    const changed = { db, host: fakeHost([issue({ state: "closed" })]), projectFor: firstProjectOf(db) };
    await syncTracker(changed, workspaceId);

    const again = await syncTracker(changed, workspaceId);

    /*
     * Sem isto, cada passada reescreveria o motivo a cada 60 segundos — e o
     * `updated_at` junto, o que faria a tarefa parecer estar acontecendo alguma
     * coisa quando o que houve foi o daemon relendo a mesma notícia.
     */
    expect(again.blocked).toBe(0);
  });

  it("o instantâneo é atualizado mesmo já bloqueada", async () => {
    const { db, workspaceId } = await scene();
    await syncTracker({ db, host: fakeHost([issue()]), projectFor: firstProjectOf(db) }, workspaceId);
    await syncTracker(
      { db, host: fakeHost([issue({ state: "closed" })]), projectFor: firstProjectOf(db) },
      workspaceId,
    );

    const [row] = await db.select().from(task);
    /*
     * Sem atualizar, uma **segunda** mudança lá nunca seria vista: a comparação
     * continuaria sendo contra o estado de três mudanças atrás.
     */
    expect(row?.externalState).toBe("closed");
  });

  it("desbloquear e mudar de novo bloqueia outra vez", async () => {
    const { db, workspaceId } = await scene();
    await syncTracker({ db, host: fakeHost([issue()]), projectFor: firstProjectOf(db) }, workspaceId);
    await syncTracker(
      { db, host: fakeHost([issue({ state: "closed" })]), projectFor: firstProjectOf(db) },
      workspaceId,
    );
    const [row] = await db.select().from(task);
    await db.update(task).set({ blockedReason: null }).where(eq(task.id, row!.id));

    const again = await syncTracker(
      { db, host: fakeHost([issue({ state: "closed", body: "outro" })]), projectFor: firstProjectOf(db) },
      workspaceId,
    );

    // A guarda é *"já está bloqueada"*, e não *"já bloqueei uma vez"*: quem
    // destravou quer saber da próxima.
    expect(again.blocked).toBe(1);
  });
});
