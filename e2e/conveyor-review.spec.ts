import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { E2E_CONVEYOR_PORT } from "../ports.js";
import { call, query, startDaemon, type ManagedDaemon } from "./support/daemon.js";
import {
  E2E_FAKE_ACP_AGENT,
  E2E_FIXTURE_BIN,
  E2E_FIXTURE_REPO_ALT,
  E2E_FIXTURE_REPO_PR,
  E2E_GH_COMMENTS,
  E2E_GH_STATE,
} from "./support/fixtures.js";

/**
 * O parecer do revisor, ponta a ponta (`028` Parte 7 — T59).
 *
 * **Zero token.** O revisor é o mesmo agente falso da Parte 2, com um encaixe a
 * mais: ele lê a **porta do parecer no próprio prompt** e posta lá o que o spec
 * mandou. Nada aqui chama modelo nenhum.
 *
 * O que só um daemon de verdade responde, e nenhum teste de unidade alcança:
 *
 * - **as quatro setas andam** — `open → in_progress → review → testing →
 *   ready_to_merge`, sem ninguém clicar. Três delas eram recusadas pelo próprio
 *   daemon até a T49, e o `conveyor.test.ts` ficou verde o tempo todo porque o
 *   `advance` dele é falso;
 * - **a porta do parecer chega ao agente**. Ela viaja dentro do preâmbulo, e o
 *   defeito que quase foi para produção é justamente esse: com acervo vazio o
 *   preâmbulo some inteiro, e o revisor nunca saberia que a porta existe. Aqui
 *   o workspace é novo — **sem memória nenhuma** —, que é o caso que falhava;
 * - **o daemon reroda o que o revisor afirmou**, num processo de verdade, dentro
 *   do checkout — reproduziu segura, não reproduziu não segura;
 * - **a anotação chega à pull request**, que é o que o balde `notes` promete.
 */

const AGENT = "acp-esteira-revisao";

/*
 * Teto maior que o da suíte, e pelo mesmo motivo da Parte 2: o que está sob
 * teste é um relógio de 15 s dando **quatro** voltas, mais o boot de um daemon
 * próprio. O default de 30 s derruba o caso no meio da terceira seta.
 */
test.describe.configure({ timeout: 240_000 });

/** Uma passada é 15 s; cada espera aqui cabe duas. */
const TICK = 45_000;
/** As quatro setas são quatro passadas. */
const FOUR = 150_000;

interface Task {
  id: string;
  status: string;
  attempts: number;
  bounces: number;
  autonomy: string;
  worktreeId: string | null;
  blockedReason: string | null;
}

async function taskOf(daemon: ManagedDaemon, id: string): Promise<Task> {
  return (await query(daemon.url, "task.get", { id })) as Task;
}

/**
 * Um daemon só deste caso, com o agente falso fazendo o encaixe da esteira.
 *
 * O `PATH` leva o diretório de fixtures na frente: é o que garante que o `gh`
 * chamado aqui é o de mentira. Sem isso, um projeto com remote do GitHub faria
 * o daemon perguntar ao host **de verdade**, com a conta de quem roda a suíte.
 */
async function boot(options: {
  prefix: string;
  repo: string;
  /** O corpo que o revisor vai postar na porta do parecer. */
  review: string;
}): Promise<{ daemon: ManagedDaemon; workspaceId: string; projectId: string }> {
  const daemon = await startDaemon({
    port: E2E_CONVEYOR_PORT,
    stateDir: mkdtempSync(join(tmpdir(), `lumem-${options.prefix}-`)),
    env: {
      LUMEM_CONVEYOR_AGENT: AGENT,
      PATH: `${E2E_FIXTURE_BIN}:${process.env["PATH"] ?? ""}`,
    },
  });

  await call(daemon.url, "agentConfig.create", {
    name: AGENT,
    command: process.execPath,
    args: [E2E_FAKE_ACP_AGENT],
    adapterVersion: "0.0.0-fake",
    env: {
      // O encaixe da esteira: implementador e testador commitam, o revisor
      // posta. Ligado por variável porque o turno roteirizado **não commita**,
      // e o e2e da Parte 2 depende disso.
      LUMEM_FAKE_CONVEYOR: "1",
      LUMEM_FAKE_REVIEW: options.review,
    },
  });

  const workspace = (await call(daemon.url, "workspace.create", {
    name: `${options.prefix}-${Date.now()}`,
  })) as { id: string };
  const project = (await call(daemon.url, "project.add", {
    workspaceId: workspace.id,
    path: options.repo,
    name: "alvo",
  })) as { id: string };

  return { daemon, workspaceId: workspace.id, projectId: project.id };
}

/** Liga a esteira do workspace, que é o único gesto de pessoa destes casos. */
async function turnOn(daemon: ManagedDaemon, workspaceId: string): Promise<void> {
  await call(daemon.url, "workspace.setAutonomy", {
    id: workspaceId,
    autonomy: "autonomo",
    maxParallel: 2,
  });
}

/**
 * Para a esteira neste cartão antes de afirmar sobre ele.
 *
 * Sem isto, a passada seguinte já moveu o cartão enquanto as asserções liam a
 * linha: o que se afirma é uma etapa, e ela dura 15 s.
 */
async function freeze(daemon: ManagedDaemon, taskId: string): Promise<Task> {
  await call(daemon.url, "task.setAutonomy", { id: taskId, autonomy: "off" });
  return taskOf(daemon, taskId);
}

test("as quatro setas andam, e cada encaixe tem uma conversa só", async () => {
  const { daemon, workspaceId, projectId } = await boot({
    prefix: "esteira-setas",
    repo: E2E_FIXTURE_REPO_ALT,
    // O parecer vazio é uma resposta legítima, e é a que o portão do revisor lê
    // como *"olhei e não achei nada que segure"*.
    review: '{"findings":[]}',
  });

  try {
    const created = (await call(daemon.url, "task.create", {
      workspaceId,
      projectId,
      title: "as quatro setas",
    })) as { id: string };

    await turnOn(daemon, workspaceId);

    /*
     * `ready_to_merge` é o fim da máquina: `done` é seu, e a esteira não o
     * marca. Chegar aqui quer dizer que as quatro setas andaram — e que o
     * portão respondeu verde nas quatro, cada uma com o fato do papel dela.
     */
    await expect
      .poll(async () => (await taskOf(daemon, created.id)).status, { timeout: FOUR })
      .toBe("ready_to_merge");

    const comments = (await query(daemon.url, "task.comments", {
      taskId: created.id,
    })) as { body: string }[];
    const trail = comments.map((one) => one.body).join("\n");
    expect(trail).toContain("implementador · tentativa 1 — portão verde");
    expect(trail).toContain("revisor · tentativa 1 — portão verde");
    expect(trail).toContain("testador · tentativa 1 — portão verde");

    /*
     * **Três conversas, e não seis** (T57).
     *
     * A `LUM-51` produziu seis sessões para uma tarefa, cada uma pagando o
     * contexto do zero — 453 884 tokens ao todo. Uma por encaixe é a conta que a
     * Parte 7 comprou.
     *
     * *Conversa* e não *linha*: o implementador trabalha em duas etapas
     * (`open → in_progress` e `in_progress → review`), e a esteira fecha a
     * sessão quando a tarefa **sai** da etapa (T52). A segunda vez dele é uma
     * linha nova **retomada** da primeira — o `session/load` carrega a conversa
     * de volta, que é como o produto faz *"retomar"* desde a `006`. O que não
     * pode existir é uma segunda conversa **do zero** para o mesmo encaixe.
     */
    const sessions = (await query(daemon.url, "session.listByTask", {
      taskId: created.id,
    })) as {
      taskRole: string;
      resumedFromId: string | null;
      state: string;
      mode: string | null;
      lumemMode: string;
    }[];

    expect(new Set(sessions.map((one) => one.taskRole))).toEqual(
      new Set(["implementador", "revisor", "testador"]),
    );
    expect(sessions.filter((one) => one.resumedFromId === null)).toHaveLength(3);

    /*
     * E **nenhuma fica de pé** (T52). A `LUM-51` deixou três vivas horas depois,
     * cada uma segurando um processo de adaptador de 243 MB.
     */
    expect(sessions.every((one) => one.state === "exited")).toBe(true);

    /*
     * **Todas na postura de quem trabalha sozinho** — inclusive a retomada.
     *
     * `session/load` traz a conversa e sobe um adaptador **novo**, no modo padrão
     * dele: a conversa voltava e a postura não. E como a esteira fecha a sessão
     * ao sair da etapa, a segunda vez de cada encaixe é sempre uma retomada — o
     * caminho comum era o que perguntava. O relato foi literal: *"coloquei no
     * autônomo e ele abriu uma sessão no manual, tenho que ficar dando aceito em
     * tudo"*.
     */
    const retomada = sessions.find((one) => one.resumedFromId !== null);
    expect(retomada?.mode).toBe("bypassPermissions");
    expect(sessions.every((one) => one.lumemMode === "free")).toBe(true);
  } finally {
    await daemon.stop();
  }
});

test("um `bloqueia` que reproduz segura o cartão e o devolve ao implementador", async () => {
  const { daemon, workspaceId, projectId } = await boot({
    prefix: "esteira-bloqueia",
    repo: E2E_FIXTURE_REPO_ALT,
    /*
     * O comando roda **no checkout**, e é por isso que ele fala do `README.md`
     * do repositório de fixture: o que o daemon reroda é um processo de verdade
     * naquele diretório, e a saída dele é lida contra o `expected`.
     */
    review: JSON.stringify({
      findings: [
        {
          bucket: "blocks",
          title: "o README não diz o que este projeto faz",
          command: "cat README.md",
          expected: "# fixture",
        },
      ],
    }),
  });

  try {
    const created = (await call(daemon.url, "task.create", {
      workspaceId,
      projectId,
      title: "o revisor devolve",
    })) as { id: string };
    // Direto na etapa do revisor: o que está sob teste é a volta, e passar pelo
    // implementador antes custaria duas passadas para provar a mesma coisa.
    await call(daemon.url, "task.setStatus", { id: created.id, status: "review" });

    await turnOn(daemon, workspaceId);

    await expect
      .poll(async () => (await taskOf(daemon, created.id)).status, { timeout: TICK })
      .toBe("in_progress");

    const row = await freeze(daemon, created.id);
    /*
     * A volta é contada em `bounces`, e não em `attempts`: aquele zera na
     * mudança de etapa, e o ciclo implementador ↔ revisor troca de etapa a cada
     * passo. Sem um contador que sobrevive, nenhum teto chegaria.
     */
    expect(row.bounces).toBe(1);
    expect(row.attempts).toBe(0);

    const comments = (await query(daemon.url, "task.comments", {
      taskId: created.id,
    })) as { body: string }[];
    expect(comments.map((one) => one.body).join("\n")).toContain(
      "o revisor devolveu: o README não diz o que este projeto faz",
    );
  } finally {
    await daemon.stop();
  }
});

test("um `bloqueia` que não reproduz **não** segura o cartão", async () => {
  const { daemon, workspaceId, projectId } = await boot({
    prefix: "esteira-refutado",
    repo: E2E_FIXTURE_REPO_ALT,
    // O mesmo comando do caso acima, com uma saída que ele não produz. É a
    // metade da Q67 que responde *"toda vez que você pede um review, o agente
    // acha alguma coisa"*: ele acha, e o que não se sustenta cai.
    review: JSON.stringify({
      findings: [
        {
          bucket: "blocks",
          title: "o README fala de outra coisa",
          command: "cat README.md",
          expected: "isto nunca esteve no arquivo",
        },
      ],
    }),
  });

  try {
    const created = (await call(daemon.url, "task.create", {
      workspaceId,
      projectId,
      title: "o achado que nao se sustenta",
    })) as { id: string };
    await call(daemon.url, "task.setStatus", { id: created.id, status: "review" });

    await turnOn(daemon, workspaceId);

    await expect
      .poll(async () => (await taskOf(daemon, created.id)).status, { timeout: TICK })
      .toBe("testing");

    const row = await freeze(daemon, created.id);
    // Não voltou, e não parou: o cartão andou com o achado registrado contra o
    // revisor, e não contra o código.
    expect(row.bounces).toBe(0);
    expect(row.blockedReason).toBeNull();
  } finally {
    await daemon.stop();
  }
});

test("um `anota` avança o cartão, e aparece na pull request", async () => {
  const { daemon, workspaceId, projectId } = await boot({
    prefix: "esteira-anota",
    // O repositório com remote do GitHub: é dele que sai o host, e o `gh` que
    // responde é o de mentira do `PATH`.
    repo: E2E_FIXTURE_REPO_PR,
    review: JSON.stringify({
      findings: [
        {
          bucket: "notes",
          title: "o runner ficou 3x maior que os irmãos",
          detail: "não segura nada, mas alguém devia olhar antes de mesclar",
        },
      ],
    }),
  });

  try {
    const created = (await call(daemon.url, "task.create", {
      workspaceId,
      projectId,
      title: "a anotacao vai para a PR",
    })) as { id: string };

    /*
     * O checkout é cortado **aqui**, e não pela esteira, por um motivo de
     * relógio: a PR do host é casada pelo nome da branch, e o spec precisa
     * escrever o estado do `gh` antes de a revisão rodar. Cortando aqui, o nome
     * é conhecido antes de a esteira ligar.
     */
    await call(daemon.url, "worktree.create", {
      projectId,
      name: "anota-na-pr",
      taskId: created.id,
    });
    const [checkout] = (await query(daemon.url, "worktree.listByProject", {
      projectId,
    })) as { branch: string }[];
    writeFileSync(
      E2E_GH_STATE,
      JSON.stringify({
        pulls: [
          {
            number: 19,
            url: "https://github.com/exemplo/repo/pull/19",
            title: "a anotacao vai para a PR",
            state: "OPEN",
            isDraft: true,
            mergeable: "MERGEABLE",
            mergeStateStatus: "CLEAN",
            reviewDecision: "",
            headRefName: checkout!.branch,
            baseRefName: "main",
            updatedAt: "2026-09-15T12:00:00Z",
            mergedAt: null,
            closedAt: null,
            author: "pessoa-1",
            reviews: [],
            checks: [],
          },
        ],
      }),
      "utf8",
    );

    await call(daemon.url, "task.setStatus", { id: created.id, status: "review" });
    await turnOn(daemon, workspaceId);

    await expect
      .poll(async () => (await taskOf(daemon, created.id)).status, { timeout: TICK })
      .toBe("testing");
    await freeze(daemon, created.id);

    /*
     * E a anotação **saiu da máquina**: o que o revisor postou no balde que não
     * segura chegou ao único lugar onde uma pessoa a arbitra. Sem esta linha, o
     * balde `notes` é uma gaveta — e o preâmbulo teria prometido ao agente que
     * alguém lê o que ele escreveu ali.
     */
    const written = readFileSync(E2E_GH_COMMENTS, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as { number: string; body: string });

    expect(written).toHaveLength(1);
    expect(written[0]?.number).toBe("19");
    expect(written[0]?.body).toContain("o runner ficou 3x maior que os irmãos");
    expect(written[0]?.body).toContain("alguém devia olhar antes de mesclar");
  } finally {
    // O estado do `gh` é um arquivo só, e os outros specs o leem: o que este
    // caso escreveu sai com ele.
    writeFileSync(E2E_GH_STATE, JSON.stringify({ pulls: [] }), "utf8");
    writeFileSync(E2E_GH_COMMENTS, "", "utf8");
    await daemon.stop();
  }
});
