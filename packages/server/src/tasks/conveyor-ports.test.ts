import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { newId } from "@lumem/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import {
  agentConfig,
  project,
  session,
  worktree,
  task,
  taskComment,
  taskFinding,
  taskReview,
} from "../db/schema.js";
import { createTaskFindingRepository } from "../repositories/task-finding.js";
import { createTaskReviewRepository } from "../repositories/task-review.js";
import { createTaskRepository } from "../repositories/task.js";
import { createTestCaller, type TestCaller } from "../testing/caller.js";

import {
  createConveyorPorts,
  SETUP_TIMEOUT_MS,
  TEST_TIMEOUT_MS,
} from "./conveyor-ports.js";
import type { QueueEntry } from "./queue.js";

/**
 * A costura entre a esteira e o repositório (`028` Parte 7 — T50).
 *
 * **Este arquivo não existia, e é por isso que a T49 chegou à produção.** O
 * `conveyor.test.ts` injeta um `advance` falso — ele prova a *política* da
 * esteira sem tocar o banco —, então as 48 tasks da `028` fecharam com ele verde
 * enquanto **três das quatro setas eram recusadas pelo próprio daemon**.
 *
 * O custo de não ter: uma tarefa de verdade, **US$ 11,41** e 453 884 tokens, com
 * o cartão parado em `In Review` e o revisor rodando contra ele até esgotar as
 * tentativas.
 */

let context: TestCaller;

afterEach(async () => {
  await context?.cleanup();
});

/** O que a reprodução responde, quando o caso a exercita. */
interface SceneOptions {
  reproduce?: (input: { command: string; cwd: string }) => Promise<{
    exitCode: number | null;
    output: string;
  }>;
  /** O número da PR desta worktree, ou `null` quando não há PR. */
  prNumber?: number | null;
  /**
   * Um checkout de verdade em disco, preso à tarefa.
   *
   * Só os casos que preparam o checkout precisam dele — os outros mantêm o
   * `createWorktree` que recusa, porque cortar worktree não é o que eles testam.
   */
  withCheckout?: boolean;
}

/** O que a esteira pediu aos scripts do projeto, em ordem. */
interface ScriptCall {
  phase: string;
  timeoutMs: number | undefined;
}

/** Um workspace com um projeto, e uma tarefa na etapa que se quer testar. */
async function scene(status: string, options: SceneOptions = {}) {
  context = createTestCaller();
  const { api, db } = context;
  const space = await api.workspace.create({ name: `acme-${newId()}` });

  const projectId = newId();
  /*
   * Um projeto **em disco** quando o caso precisa: o portão lê o `[scripts]` do
   * `project.toml`, e sem ele `hasTest` é falso — o caso do teto do `test`
   * passaria sem nunca ter havido `test`, que é o teste vazio clássico.
   */
  const repo =
    options.withCheckout === true ? mkdtempSync(join(tmpdir(), "lumem-repo-")) : `/repos/${projectId}`;
  if (options.withCheckout === true) {
    mkdirSync(join(repo, ".lumem"), { recursive: true });
    writeFileSync(join(repo, ".lumem", "project.toml"), '[scripts]\ntest = "echo verde"\n');
  }
  await db.insert(project).values({
    id: projectId,
    workspaceId: space.id,
    name: "acme-api",
    path: repo,
    defaultBranch: "main",
    // O remoto existe porque a anotação do revisor vai para uma PR, e o host
    // sai da URL dele — sem remoto não há host, e é o caso de um projeto
    // adicionado por caminho.
    remoteUrl: "https://github.com/exemplo/repo.git",
  });

  const comments_: { number: number; body: string }[] = [];
  const scripts: ScriptCall[] = [];
  const opened: { agentMode: string | null }[] = [];
  const resumed: { sessionId: string; agentMode: string | null }[] = [];
  const tasks = createTaskRepository(db);
  const created = await tasks.create({
    workspaceId: space.id,
    projectId,
    title: "o /orders devolve 500",
  });
  if (status !== "open") {
    // Pela mão, que é o ator sem allowlist — semear não é o que está sob teste.
    await tasks.setStatus(created.id, status as "review", { actor: "human" });
  }

  /*
   * As portas com as pontas de fora **falsas**, menos a que importa.
   *
   * `advance` é a única coisa deste arquivo, e ela só toca o banco: nada aqui
   * corta worktree, roda script ou abre processo.
   */
  /** O checkout preso à tarefa, quando o caso pede um. */
  let attached: string | null = null;
  if (options.withCheckout === true) {
    const [checkout] = await db
      .insert(worktree)
      .values({
        id: newId(),
        projectId,
        name: "checkout",
        branch: "checkout",
        path: mkdtempSync(join(tmpdir(), "lumem-cena-")),
      })
      .returning();
    await tasks.attachWorktree(created.id, checkout!.id);
    attached = checkout!.id;
  }

  const ports = createConveyorPorts({
    db,
    git: {
      getStatus: () => Promise.resolve({ clean: true }),
      headOf: () => Promise.resolve("cabeca"),
    } as never,
    scripts: {
      runToCompletion: (
        _scope: unknown,
        phase: string,
        options?: { timeoutMs?: number },
      ) => {
        scripts.push({ phase, timeoutMs: options?.timeoutMs });
        return Promise.resolve(0);
      },
    } as never,
    createWorktree: () => Promise.reject(new Error("não devia cortar worktree")),
    openAgentSession: (input: { agentMode: string | null }) => {
      opened.push(input);
      return Promise.resolve({ sessionId: "ses-nova" });
    },
    resumeSession: (input: { sessionId: string; agentMode: string | null }) => {
      resumed.push(input);
      return Promise.resolve({ sessionId: `${input.sessionId}-retomada` });
    },
    prompt: () => Promise.reject(new Error("não devia mandar prompt")),
    cancel: () => Promise.resolve(),
    closeSession: () => Promise.resolve(),
    reproduce:
      options.reproduce ?? (() => Promise.reject(new Error("não devia rerodar nada"))),
    liveTurns: () => [],
    prVerdictOf: () => Promise.resolve(null),
    prNumberOf: () => Promise.resolve(options.prNumber ?? null),
    prHost: {
      create: () => Promise.reject(new Error("não devia abrir PR")),
      comment: (input: { number: number; body: string }) => {
        comments_.push(input);
        return Promise.resolve({ ok: true as const, url: "" });
      },
    } as never,
  });

  const entry = (): QueueEntry => ({
    task: { ...created, status, worktreeId: attached } as never,
    role: "implementador",
  });

  const statusNow = async () =>
    (await db.select().from(task)).find((row) => row.id === created.id)?.status;

  return {
    ports,
    entry,
    statusNow,
    taskId: created.id,
    tasks,
    db,
    findings: createTaskFindingRepository(db),
    reviews: createTaskReviewRepository(db),
    /** O que foi escrito na PR, em ordem. */
    onPr: comments_,
    /** O que a esteira pediu aos scripts do projeto, com o teto de cada um. */
    scripts,
    /** As sessões abertas do zero, e as retomadas, com o que foi pedido nelas. */
    opened,
    resumed,
    /** O checkout que o turno usou — falso, porque nenhum caso aqui corta um. */
    checkout: { worktreeId: "wt-1", path: "/wt/1", dirty: false, head: "abc" },
  };
}

describe("as quatro setas da esteira andam", () => {
  /*
   * As quatro, uma por uma. Três delas eram **recusadas pelo próprio daemon**
   * até a T49: a esteira escrevia com `actor: "agent"`, e o `AGENT_MAY_SET` da
   * `022` só permite `review`.
   */
  const setas: [string, string][] = [
    ["open", "in_progress"],
    ["in_progress", "review"],
    ["review", "testing"],
    ["testing", "ready_to_merge"],
  ];

  it.each(setas)("%s → %s", async (de, para) => {
    const { ports, entry, statusNow } = await scene(de);

    await ports.advance({ task: entry().task, role: "implementador" });

    expect(await statusNow()).toBe(para);
  });

  it("em `ready_to_merge` a seta não anda, e isso não é erro", async () => {
    // É sua vez, e a esteira acabou de chegar nela.
    const { ports, entry, statusNow } = await scene("ready_to_merge");

    await ports.advance({ task: entry().task, role: "implementador" });

    expect(await statusNow()).toBe("ready_to_merge");
  });
});

describe("a regra do agente não foi afrouxada", () => {
  /*
   * O conserto da T49 é a esteira **parar de se declarar agente** — e não a `022`
   * passar a deixar um agente mover o que quiser. Sem estes dois casos, o
   * conserto poderia ter sido feito do jeito errado e ninguém saberia.
   */
  it("um agente continua sem poder dizer `testing`", async () => {
    const { tasks, taskId } = await scene("review");

    await expect(
      tasks.setStatus(taskId, "testing", { actor: "agent" }),
    ).rejects.toThrow(/um agente não pode mover/);
  });

  it("um agente continua podendo dizer `review`", async () => {
    const { tasks, taskId, statusNow } = await scene("in_progress");

    await tasks.setStatus(taskId, "review", { actor: "agent" });

    expect(await statusNow()).toBe("review");
  });

  it("a esteira também não marca `done` — ela para em `ready_to_merge`", async () => {
    // O §4 é explícito: `done` é seu. A esteira ganhou quatro etapas, e não a
    // última — que é a única sem desfazer barato.
    const { tasks, taskId } = await scene("ready_to_merge");

    await expect(
      tasks.setStatus(taskId, "done", { actor: "conveyor" }),
    ).rejects.toThrow(/só você marca done/);
  });

  it("a esteira não reabre o que você fechou", async () => {
    const { tasks, taskId } = await scene("ready_to_merge");
    await tasks.setStatus(taskId, "done", { actor: "human" });

    await expect(
      tasks.setStatus(taskId, "review", { actor: "conveyor" }),
    ).rejects.toThrow(/reabrir é seu/);
  });
});

describe("o revisor devolve, e a volta é contada (Parte 7 — T58)", () => {
  it("a tarefa volta para `in_progress`, e `attempts` zera com a etapa", async () => {
    const { ports, taskId, statusNow, db } = await scene("review");
    // Duas tentativas gastas no revisor, como a `LUM-51` teve.
    await ports.countAttempt(taskId);
    await ports.countAttempt(taskId);

    const voltas = await ports.bounce({ taskId, reason: "o teste da linha 194 sobrevive" });

    expect(await statusNow()).toBe("in_progress");
    expect(voltas).toBe(1);
    const [row] = await db.select().from(task);
    // `attempts` zera porque a etapa mudou — é a regra de sempre, e é
    // exatamente por ela que `bounces` precisa existir em separado.
    expect(row?.attempts).toBe(0);
    expect(row?.bounces).toBe(1);
  });

  it("o motivo fica escrito na tarefa, e não só no cartão", async () => {
    // É o que sobra na conversa quando alguém for entender por que o cartão
    // voltou — o cartão mostra a última frase, e a tarefa guarda todas.
    const { ports, taskId, db } = await scene("review");

    await ports.bounce({ taskId, reason: "o job nunca rodou" });

    const [comment] = await db.select().from(taskComment);
    expect(comment?.body).toContain("o job nunca rodou");
  });

  it("a contagem de voltas **não** zera na ida seguinte", async () => {
    /*
     * É a propriedade inteira: `attempts` zera a cada troca de etapa, e o ciclo
     * `implementador → revisor → implementador` troca de etapa a cada passo.
     * Sem um contador que sobrevive, nenhum teto chegaria e o cartão circularia
     * até o orçamento acabar — que é o medo que originou a Parte 7.
     */
    const { ports, taskId, tasks, db } = await scene("review");

    await ports.bounce({ taskId, reason: "primeira" });
    await tasks.setStatus(taskId, "review", { actor: "conveyor" });
    await ports.bounce({ taskId, reason: "segunda" });

    const [row] = await db.select().from(task);
    expect(row?.bounces).toBe(2);
    expect(row?.attempts).toBe(0);
  });
});

describe("o parecer do revisor, rerodado pelo daemon (Parte 7 — T54 e T55)", () => {
  /*
   * O portão do revisor lê **uma** coisa: o que ele postou, e o que o daemon
   * obteve rerodando. Estes casos tocam o banco de verdade e um `reproduce`
   * roteirizado — o que está sob teste é a costura entre os dois, que é
   * exatamente o que faltava quando a `LUM-51` escreveu `portão verde` em cima
   * de um `Reprovo`.
   */
  const SESSION = "ses-revisor";

  /** A entrada como a fila a entrega quando o cartão está em revisão. */
  function reviewing(base: Awaited<ReturnType<typeof scene>>) {
    return { ...base.entry(), role: "revisor" as const };
  }

  /**
   * O parecer, como a porta o grava: os achados **e o recibo**.
   *
   * Os dois, sempre — é o que a `POST /tasks/:id/findings` faz numa chamada, e
   * gravar só metade aqui faria estes casos provarem um estado que o produto não
   * produz.
   */
  async function post(
    base: Awaited<ReturnType<typeof scene>>,
    findings: Parameters<typeof base.findings.record>[0][],
  ) {
    for (const one of findings) await base.findings.record(one);
    await base.reviews.record({
      taskId: base.taskId,
      bySession: SESSION,
      role: "revisor",
      blocks: findings.filter((one) => one.bucket === "blocks").length,
      notes: findings.filter((one) => one.bucket === "notes").length,
    });
  }

  it("um `bloqueia` que reproduz segura o cartão, e o motivo é o título dele", async () => {
    const base = await scene("review", {
      reproduce: () => Promise.resolve({ exitCode: 1, output: "1 failed" }),
    });
    await post(base, [
      {
        taskId: base.taskId,
        foundBySession: SESSION,
        role: "revisor",
        bucket: "blocks",
        title: "o teste da linha 194 sobrevive à mutação",
        command: "pnpm vitest run scripts",
      },
    ]);

    const verdict = await base.ports.gate(
      reviewing(base),
      base.checkout,
      SESSION,
      new Date(Date.now() - 1_000),
    );

    expect(verdict).toEqual({
      kind: "fail",
      reason: "o teste da linha 194 sobrevive à mutação",
    });
    const [row] = await base.findings.byTask(base.taskId);
    expect(row?.verification).toBe("reproduced");
  });

  it("um `bloqueia` que não reproduz **não** segura, e fica registrado", async () => {
    /*
     * A outra metade da T54, e é a que responde ao relato que abriu a Parte 7:
     * o revisor acha o que quiser, e o que ele não consegue demonstrar **cai**.
     * Cai com rastro — a saída real fica na linha, porque é ela que faz alguém
     * discordar.
     */
    const base = await scene("review", {
      reproduce: () => Promise.resolve({ exitCode: 0, output: "19 passed | 0 failed" }),
    });
    await post(base, [
      {
        taskId: base.taskId,
        foundBySession: SESSION,
        role: "revisor",
        bucket: "blocks",
        title: "o job roda sem permissão",
        command: "pnpm vitest run scripts",
        expected: "20 passed",
      },
    ]);

    const verdict = await base.ports.gate(
      reviewing(base),
      base.checkout,
      SESSION,
      new Date(Date.now() - 1_000),
    );

    expect(verdict).toEqual({ kind: "pass" });
    const [row] = await base.findings.byTask(base.taskId);
    expect(row?.verification).toBe("refuted");
    expect(row?.output).toContain("19 passed");
  });

  it("o que não deu para verificar **continua segurando**", async () => {
    // `exitCode: null` é o teto da reprodução, e tratá-lo como refutação seria o
    // portão falhando aberto exatamente onde ele existe para não falhar.
    const base = await scene("review", {
      reproduce: () => Promise.resolve({ exitCode: null, output: "[a reprodução passou do tempo]" }),
    });
    await post(base, [
      {
        taskId: base.taskId,
        foundBySession: SESSION,
        role: "revisor",
        bucket: "blocks",
        title: "o servidor não sobe",
        command: "pnpm dev",
      },
    ]);

    const verdict = await base.ports.gate(
      reviewing(base),
      base.checkout,
      SESSION,
      new Date(Date.now() - 1_000),
    );

    expect(verdict.kind).toBe("fail");
    const [row] = await base.findings.byTask(base.taskId);
    expect(row?.verification).toBe("pending");
  });

  it("só `anota` avança o cartão, e as anotações vão para a PR", async () => {
    const base = await scene("review", { prNumber: 19 });
    await post(
      base,
      ["o runner ficou 3x maior que os irmãos", "o nome não diz o que faz"].map((title) => ({
        taskId: base.taskId,
        foundBySession: SESSION,
        role: "revisor" as const,
        bucket: "notes" as const,
        title,
      })),
    );
    const since = new Date(Date.now() - 1_000);
    const entry = reviewing(base);

    const verdict = await base.ports.gate(entry, base.checkout, SESSION, since);
    const published = await base.ports.publishNotes({
      entry,
      checkout: base.checkout,
      sessionId: SESSION,
      since,
    });

    // Nada segurou — e é a metade da Q67 que responde *"toda vez que você pede
    // um review, o agente acha alguma coisa"*.
    expect(verdict).toEqual({ kind: "pass" });
    expect(published).toBe(2);
    expect(base.onPr).toHaveLength(1);
    expect(base.onPr[0]?.number).toBe(19);
    expect(base.onPr[0]?.body).toContain("o runner ficou 3x maior que os irmãos");
    expect(base.onPr[0]?.body).toContain("o nome não diz o que faz");
  });

  it("sem PR, a anotação não se perde — ela só não tem onde aparecer", async () => {
    const base = await scene("review", { prNumber: null });
    await post(base, [
      {
        taskId: base.taskId,
        foundBySession: SESSION,
        role: "revisor",
        bucket: "notes",
        title: "o arquivo passou de 400 linhas",
      },
    ]);

    const published = await base.ports.publishNotes({
      entry: reviewing(base),
      checkout: base.checkout,
      sessionId: SESSION,
      since: new Date(Date.now() - 1_000),
    });

    expect(published).toBe(0);
    expect(await base.findings.byTask(base.taskId)).toHaveLength(1);
  });

  it("*olhei e não achei nada* **avança** o cartão, e não é silêncio", async () => {
    /*
     * O caso que o e2e da T59 encontrou, e o pior modo de falha que esta parte
     * podia ter: um parecer vazio não grava achado nenhum, então o portão —
     * que lia achados — concluía *"o revisor não deixou parecer"*. O cartão
     * ficava em `In Review` para sempre **porque o revisor acertou**, que é
     * exatamente o comportamento que a Q67 existe para tornar possível.
     */
    const base = await scene("review");
    await post(base, []);

    const verdict = await base.ports.gate(
      reviewing(base),
      base.checkout,
      SESSION,
      new Date(Date.now() - 1_000),
    );

    expect(verdict).toEqual({ kind: "pass" });
  });

  it("o parecer da volta passada **não** conta como parecer desta", async () => {
    /*
     * A conversa do revisor é **uma só** por tarefa desde a T57, e ela atravessa
     * as voltas. Sem o instante do turno, um revisor que não postasse nada na
     * segunda volta passaria por *"entregou parecer"* com o que ele disse na
     * primeira — e o cartão andaria por causa de um texto de meia hora atrás.
     */
    const base = await scene("review");
    await post(base, [
      {
        taskId: base.taskId,
        foundBySession: SESSION,
        role: "revisor",
        bucket: "notes",
        title: "o que ele achou na volta passada",
      },
    ]);
    // Meia hora atrás, que é a volta passada: o achado **e** o recibo dela.
    const antes = new Date(Date.now() - 1_800_000);
    await base.db.update(taskFinding).set({ createdAt: antes });
    await base.db.update(taskReview).set({ createdAt: antes });

    const verdict = await base.ports.gate(
      reviewing(base),
      base.checkout,
      SESSION,
      new Date(Date.now() - 1_000),
    );

    expect(verdict).toEqual({ kind: "unfinished", reason: "o revisor não deixou parecer" });
  });
});

describe("o que volta ao implementador volta uma vez (Parte 7 — T58)", () => {
  it("entregue é entregue: a volta seguinte não repete o achado já consertado", async () => {
    const base = await scene("in_progress");
    const posted = await base.findings.record({
      taskId: base.taskId,
      foundBySession: "ses-revisor",
      role: "revisor",
      bucket: "blocks",
      title: "o `--body-file` não é passado",
      command: "grep -n body-file src/pr.ts",
    });
    await base.findings.verify(posted.id, "reproduced", "325: flag(\"body-file\", bodyFile)");

    const first = await base.ports.returned(base.taskId);
    const second = await base.ports.returned(base.taskId);

    expect(first).toEqual([
      { title: "o `--body-file` não é passado", command: "grep -n body-file src/pr.ts" },
    ]);
    // Sem isto, o prompt da volta 2 mandaria consertar o que já foi consertado —
    // com a frase "Cada um destes o daemon rodou e reproduziu".
    expect(second).toEqual([]);
    // E o achado **fica na tabela**: apagá-lo apagaria o rastro de quem afirma o
    // que se sustenta.
    expect(await base.findings.byTask(base.taskId)).toHaveLength(1);
  });
});

describe("a conversa do encaixe volta na postura em que nasceu (Parte 7 — T57)", () => {
  /*
   * **Retomar não é herdar.** `session/load` traz a conversa e sobe um adaptador
   * **novo**, que nasce no modo padrão dele. A conversa voltava e a postura de
   * permissão não — e como a esteira fecha a sessão ao sair da etapa (T52), a
   * segunda vez de cada encaixe passa por aqui. O sintoma é o relato: *"coloquei
   * no modo autônomo e ele abriu uma sessão no manual, tenho que ficar dando
   * aceito em tudo"*.
   */
  async function withSession(state: "running" | "exited") {
    const base = await scene("in_progress");
    const [config] = await base.db
      .insert(agentConfig)
      .values({
        id: newId(),
        name: `claude-${newId()}`,
        command: "claude-agent-acp",
        adapterVersion: "1.0.0",
      })
      .returning();
    const [row] = await base.db
      .insert(session)
      .values({
        id: newId(),
        kind: "agent",
        agentConfigId: config!.id,
        scopeType: "worktree",
        scopeId: "wt-1",
        cwd: "/wt/1",
        command: "claude-agent-acp",
        transport: "acp",
        acpSessionId: "acp-1",
        state,
        taskId: base.taskId,
        taskRole: "implementador",
      })
      .returning();
    return { ...base, previous: row! };
  }

  it("a retomada leva o modo que não pergunta, e não só o id", async () => {
    const base = await withSession("exited");

    const opened = await base.ports.openSession({
      taskId: base.taskId,
      role: "implementador",
      adapter: "claude",
      model: null,
      cwd: "/wt/1",
      worktreeId: "wt-1",
    });

    expect(opened.sessionId).toBe(`${base.previous.id}-retomada`);
    expect(base.resumed).toEqual([
      // O mesmo modo com que ela teria nascido: sai da `spec` do adaptador, e
      // nunca de uma string escrita aqui (Q41).
      { sessionId: base.previous.id, agentMode: "bypassPermissions", model: null },
    ]);
    // E não abriu uma segunda conversa: o contexto da primeira é o que a T57
    // existe para não pagar de novo.
    expect(base.opened).toEqual([]);
  });

  it("viva, ela continua no mesmo processo — sem retomar nada", async () => {
    const base = await withSession("running");

    const opened = await base.ports.openSession({
      taskId: base.taskId,
      role: "implementador",
      adapter: "claude",
      model: null,
      cwd: "/wt/1",
      worktreeId: "wt-1",
    });

    expect(opened.sessionId).toBe(base.previous.id);
    expect(base.resumed).toEqual([]);
    expect(base.opened).toEqual([]);
  });
});

describe("os scripts do projeto têm o teto da esteira, e não o da remoção", () => {
  /*
   * O `runToCompletion` tem default de 20 s, e o nome dele diz para quê:
   * `TEARDOWN_TIMEOUT_MS` — *"curto, porque a remoção não pode ficar refém
   * dele"*. A esteira chamava sem opções e herdava esse número.
   *
   * O que custou está medido na `LUM-51`: `pnpm gate:quick` foi **morto aos
   * 20,3 s**, o portão leu *"o teste do projeto não chegou a rodar"* e a
   * tentativa foi gasta — duas das quatro do cartão. Nesse teto, nenhum projeto
   * com suíte de verdade passa no portão.
   */
  it("o `setup` espera dez minutos, e não vinte segundos", async () => {
    const base = await scene("open", { withCheckout: true });

    await base.ports.prepareCheckout({ ...base.entry(), role: "implementador" });

    expect(base.scripts).toEqual([{ phase: "setup", timeoutMs: SETUP_TIMEOUT_MS }]);
    expect(SETUP_TIMEOUT_MS).toBeGreaterThan(20_000);
  });

  it("o `test` também — é ele que o portão lê", async () => {
    const base = await scene("in_progress", { withCheckout: true });

    await base.ports
      .gate(
        { ...base.entry(), role: "implementador" },
        base.checkout,
        "ses-1",
        new Date(Date.now() - 1_000),
      )
      .catch(() => undefined);

    // O projeto desta cena **declara** `test` — sem isso `hasTest` é falso, o
    // portão não roda nada, e o caso passaria contra uma lista vazia.
    expect(base.scripts).toEqual([{ phase: "test", timeoutMs: TEST_TIMEOUT_MS }]);
    expect(TEST_TIMEOUT_MS).toBeGreaterThan(20_000);
  });
});
