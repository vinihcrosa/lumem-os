import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { E2E_CONVEYOR_PORT } from "../ports.js";
import { call, query, startDaemon, type ManagedDaemon } from "./support/daemon.js";
import { E2E_FAKE_ACP_AGENT, E2E_FIXTURE_REPO_ALT } from "./support/fixtures.js";

/**
 * A esteira, ponta a ponta (`028` Parte 2, T33).
 *
 * **Zero token.** O agente é falso e nenhum modelo é chamado — o que está sob
 * teste é a costura que nenhum teste de unidade alcança: o daemon lê a fila
 * sozinho, corta a worktree, abre a sessão, manda o prompt e **move a seta**,
 * sem ninguém clicar em nada.
 *
 * **Daemon próprio**, e por um motivo que é o assunto: a esteira precisa saber
 * com que configuração de agente abrir sessão, e a do e2e é uma cópia falsa. O
 * `LUMEM_CONVEYOR_AGENT` é a mesma exceção que o
 * [ADR de 2026-09-08](../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md)
 * já abre — apontar um binário específico é nomear um arquivo, e o que o ADR
 * proíbe é *o PATH escolher*.
 */

const AGENT = "acp-esteira";

/*
 * O teto de tempo destes casos é maior que o da suíte, e tem que ser: o que está
 * sob teste é um **relógio de 15 segundos** dando duas voltas, mais o boot de um
 * daemon próprio. O default de 30s do playwright derruba o caso no meio da
 * segunda passada, com uma mensagem que fala de timeout e não de esteira.
 */
test.describe.configure({ timeout: 180_000 });

/** O relógio da esteira é de 15s; o teste espera menos que duas voltas. */
const TICK = 40_000;

interface Task {
  id: string;
  status: string;
  attempts: number;
  autonomy: string;
  worktreeId: string | null;
  blockedReason: string | null;
}

async function taskOf(daemon: ManagedDaemon, id: string): Promise<Task> {
  return (await query(daemon.url, "task.get", { id })) as Task;
}

test("um cartão atravessa uma etapa sem ninguém clicar", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "lumem-esteira-"));
  const daemon = await startDaemon({
    port: E2E_CONVEYOR_PORT,
    stateDir,
    env: { LUMEM_CONVEYOR_AGENT: AGENT },
  });

  try {
    await call(daemon.url, "agentConfig.create", {
      name: AGENT,
      command: process.execPath,
      args: [E2E_FAKE_ACP_AGENT],
      transport: "acp",
      adapterVersion: "0.0.0-fake",
    });
    const workspace = (await call(daemon.url, "workspace.create", { name: "esteira" })) as {
      id: string;
    };
    const project = (await call(daemon.url, "project.add", {
      workspaceId: workspace.id,
      // O repositório alternativo, como a `acp-resume` faz: este daemon tem
      // diretório de estado próprio e **compartilha o checkout em disco**, e
      // dois daemons criando branch no mesmo repositório colidiriam.
      path: E2E_FIXTURE_REPO_ALT,
      name: "alt",
    })) as { id: string };

    const created = (await call(daemon.url, "task.create", {
      workspaceId: workspace.id,
      projectId: project.id,
      title: "esteira leva o cartao",
    })) as { id: string };

    /*
     * Antes de ligar: **nada anda**. É o default do produto, e vale a asserção
     * porque é a propriedade que a migração não pode quebrar — um `~/.lumem`
     * que atravessa a atualização não começa a abrir sessões sozinho.
     */
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect((await taskOf(daemon, created.id)).status).toBe("open");
    expect((await taskOf(daemon, created.id)).attempts).toBe(0);

    await call(daemon.url, "workspace.setAutonomy", {
      id: workspace.id,
      autonomy: "autonomo",
      maxParallel: 2,
    });

    /*
     * E agora **anda sozinho**. O que acontece entre uma linha e outra, sem
     * nenhum clique e sem nenhuma chamada deste arquivo: o laço lê a fila, corta
     * a worktree, roda o `setup`, abre a sessão do implementador **no modo que
     * não pergunta**, manda o prompt, espera o turno acabar, chama o portão e
     * registra o parecer na tarefa.
     *
     * **O que este caso não prova é a seta andando por portão verde**, e a
     * razão é o agente falso: ele não commita, então o portão responde *"o turno
     * acabou sem commit"* — corretamente. A seta que anda aqui é a da
     * [`022`](../docs/features/022-workspace-tasks/prd.md), derivada do primeiro
     * prompt, e ela andar já diz que o prompt saiu. O `advance` por portão verde
     * é coberto no `conveyor.test.ts`, onde o portão é injetado.
     */
    await expect
      .poll(async () => (await taskOf(daemon, created.id)).worktreeId, { timeout: TICK })
      .not.toBeNull();

    await expect
      .poll(async () => (await taskOf(daemon, created.id)).attempts, { timeout: TICK })
      .toBeGreaterThan(0);

    // O checkout nasceu com a tarefa, e o nome dele é legível: o título
    // encurtado mais o pedaço do id que impede dois cartões homônimos de
    // colidirem no `git worktree add`.
    const worktrees = (await query(daemon.url, "worktree.listByProject", {
      projectId: project.id,
    })) as { id: string; name: string }[];
    expect(worktrees.map((row) => row.name).join(" ")).toContain("esteira-leva-o-cartao");

    /*
     * E o turno deixa registro na tarefa, com a proveniência: é o comentário da
     * T21, que a Q47 fechou a lista contando com ele.
     *
     * **Esperado, e não conferido na hora** — a primeira versão deste caso
     * afirmava logo depois do `attempts`, e falhou: a tentativa é contada
     * **antes** do prompt, de propósito, então `attempts > 0` só quer dizer que
     * a esteira pegou o cartão. O comentário sai depois do turno e do portão.
     */
    await expect
      .poll(
        async () =>
          ((await query(daemon.url, "task.comments", { taskId: created.id })) as unknown[]).length,
        { timeout: TICK },
      )
      .toBeGreaterThan(0);

    const comments = (await query(daemon.url, "task.comments", { taskId: created.id })) as {
      body: string;
      createdBy: string;
    }[];
    expect(comments[0]?.createdBy).toBe("agent");
    // O texto é factual e curto: é comentário de tarefa, não relatório.
    expect(comments[0]?.body).toContain("implementador · tentativa 1");

    /*
     * E a segunda tentativa é **a passada seguinte** — sem agenda, sem
     * `setTimeout`, sem estado. Quando ela acaba, o cartão para com o motivo do
     * portão, e não com *"falhou duas vezes"*: o cartão bloqueado existe para
     * dizer **o que** segurou.
     */
    await expect
      .poll(async () => (await taskOf(daemon, created.id)).blockedReason, { timeout: TICK * 2 })
      .toBe("o turno acabou sem commit");

    const blocked = await taskOf(daemon, created.id);
    // Bloquear **não** muda a coluna: situação é selo, etapa é coluna, e mover a
    // tarefa apagaria onde ela parou.
    expect(blocked.status).toBe("in_progress");
    // E desliga a autonomia dela, senão a fila a pegaria de volta na passada
    // seguinte e o bloqueio duraria 15 segundos.
    expect(blocked.autonomy).toBe("off");
  } finally {
    await daemon.stop();
  }
});

test("desligar a autonomia da tarefa para a esteira nela, e não nas outras", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "lumem-esteira-off-"));
  const daemon = await startDaemon({
    port: E2E_CONVEYOR_PORT,
    stateDir,
    env: { LUMEM_CONVEYOR_AGENT: AGENT },
  });

  try {
    await call(daemon.url, "agentConfig.create", {
      name: AGENT,
      command: process.execPath,
      args: [E2E_FAKE_ACP_AGENT],
      transport: "acp",
      adapterVersion: "0.0.0-fake",
    });
    const workspace = (await call(daemon.url, "workspace.create", { name: "esteira-off" })) as {
      id: string;
    };
    const project = (await call(daemon.url, "project.add", {
      workspaceId: workspace.id,
      path: E2E_FIXTURE_REPO_ALT,
      name: "alt",
    })) as { id: string };

    const mine = (await call(daemon.url, "task.create", {
      workspaceId: workspace.id,
      projectId: project.id,
      title: "esta eu faco na mao",
    })) as { id: string };
    const theirs = (await call(daemon.url, "task.create", {
      workspaceId: workspace.id,
      projectId: project.id,
      title: "esta pode ir sozinha",
    })) as { id: string };

    // O gesto da Q40, pela porta que tem nome. Arrastar para uma coluna de
    // trabalho faria o mesmo, e é o segundo caminho para o mesmo interruptor.
    await call(daemon.url, "task.setAutonomy", { id: mine.id, autonomy: "off" });

    await call(daemon.url, "workspace.setAutonomy", {
      id: workspace.id,
      autonomy: "autonomo",
      maxParallel: 2,
    });

    await expect
      .poll(async () => (await taskOf(daemon, theirs.id)).attempts, { timeout: TICK })
      .toBeGreaterThan(0);

    /*
     * A que você assumiu **não foi tocada**, e a asserção é feita depois de a
     * outra ter andado: sem essa ordem, um `attempts: 0` poderia querer dizer
     * apenas que a esteira ainda não tinha rodado.
     */
    const untouched = await taskOf(daemon, mine.id);
    expect(untouched.attempts).toBe(0);
    expect(untouched.worktreeId).toBeNull();
  } finally {
    await daemon.stop();
  }
});

test("`assistido` prepara e para — nenhum adaptador sobe", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "lumem-esteira-assistido-"));
  const daemon = await startDaemon({
    port: E2E_CONVEYOR_PORT,
    stateDir,
    env: { LUMEM_CONVEYOR_AGENT: AGENT },
  });

  try {
    await call(daemon.url, "agentConfig.create", {
      name: AGENT,
      command: process.execPath,
      args: [E2E_FAKE_ACP_AGENT],
      transport: "acp",
      adapterVersion: "0.0.0-fake",
    });
    const workspace = (await call(daemon.url, "workspace.create", { name: "assistido" })) as {
      id: string;
    };
    const project = (await call(daemon.url, "project.add", {
      workspaceId: workspace.id,
      path: E2E_FIXTURE_REPO_ALT,
      name: "alt",
    })) as { id: string };
    const created = (await call(daemon.url, "task.create", {
      workspaceId: workspace.id,
      projectId: project.id,
      title: "prepara e para",
    })) as { id: string };

    await call(daemon.url, "workspace.setAutonomy", {
      id: workspace.id,
      autonomy: "assistido",
      maxParallel: 2,
    });

    await expect
      .poll(
        async () =>
          (
            (await query(daemon.url, "task.get", { id: created.id })) as {
              preparedPrompt: string | null;
            }
          ).preparedPrompt,
        { timeout: TICK },
      )
      .not.toBeNull();

    /*
     * **Nenhuma sessão**, e é o que a Q51 comprou: um adaptador de pé custa
     * 243 MB, e o teto de paralelismo não segura um processo que não está
     * gastando turno. Contado, e não lido no código.
     */
    const sessions = (await query(daemon.url, "session.listByTask", {
      taskId: created.id,
    })) as unknown[];
    expect(sessions).toEqual([]);

    // O prompt preparado é o que ia ser enviado, e ele diz as duas coisas que a
    // medição da Q39 mostrou custarem caro quando faltam.
    const prepared = (await query(daemon.url, "task.get", { id: created.id })) as {
      preparedPrompt: string;
    };
    expect(prepared.preparedPrompt).toContain("Você está trabalhando sozinho");
    expect(prepared.preparedPrompt).toContain("prepara e para");
  } finally {
    await daemon.stop();
  }
});
