import { describe, expect, it, vi } from "vitest";

import type { TaskRow } from "../db/schema.js";
import {
  MAX_ATTEMPTS,
  MAX_BOUNCES,
  commentFor,
  createConveyor,
  type ConveyorPorts,
  type GateVerdict,
} from "./conveyor.js";
import type { QueueEntry, QueueFacts } from "./queue.js";
import { promptFor } from "./prompts.js";

/**
 * A esteira (`028` Parte 2, T27).
 *
 * Testada **sem git, sem processo e sem banco**, que é o que as portas injetadas
 * compram. O que está sob teste aqui é política — a ordem em que as coisas
 * acontecem, e o que acontece quando não dá certo —, e nenhuma dessas perguntas
 * precisa de um adaptador de pé para ser respondida.
 */

function fakeTask(patch: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "t1",
    workspaceId: "w1",
    projectId: "p1",
    title: "o /orders devolve 500",
    body: "quando o carrinho está vazio",
    status: "open",
    createdBy: "human",
    createdBySession: null,
    worktreeId: null,
    position: 0,
    links: "[]",
    reason: null,
    attempts: 0,
    bounces: 0,
    autonomy: "inherit",
    preparedPrompt: null,
    preparedRole: null,
    blockedReason: null,
    notifiedAt: null,
    externalSource: null,
    externalId: null,
    externalState: null,
    externalAssignee: null,
    externalBodyHash: null,
    externalMarks: "[]",
    statusChangedAt: new Date(),
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...patch,
  };
}

interface Harness {
  ports: ConveyorPorts;
  calls: string[];
  spies: {
    openSession: ReturnType<typeof vi.fn>;
    prompt: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    closeSession: ReturnType<typeof vi.fn>;
    advance: ReturnType<typeof vi.fn>;
    bounce: ReturnType<typeof vi.fn>;
    openPullRequest: ReturnType<typeof vi.fn>;
    publishNotes: ReturnType<typeof vi.fn>;
    block: ReturnType<typeof vi.fn>;
    park: ReturnType<typeof vi.fn>;
    comment: ReturnType<typeof vi.fn>;
    mark: ReturnType<typeof vi.fn>;
    prepareCheckout: ReturnType<typeof vi.fn>;
    gate: ReturnType<typeof vi.fn>;
  };
}

function harness({
  facts,
  verdict = { kind: "pass" },
  attemptsSoFar = 0,
  bouncesSoFar = 0,
  returned = [] as readonly { title: string; command: string }[],
  prUrl = null as string | null,
  notes = 0,
  dirty = false,
  instructions = "",
  checkoutFails = null,
}: {
  facts: Partial<QueueFacts>;
  verdict?: GateVerdict;
  attemptsSoFar?: number;
  /** Quantas vezes o revisor já devolveu esta tarefa. */
  bouncesSoFar?: number;
  /** O que o revisor devolveu e o daemon reproduziu. */
  returned?: readonly { title: string; command: string }[];
  /** A URL que a abertura de PR devolve, ou `null` quando ela não acontece. */
  prUrl?: string | null;
  /** Quantas anotações do revisor chegaram à PR. */
  notes?: number;
  dirty?: boolean;
  instructions?: string;
  /** A frase com que `prepareCheckout` rejeita, quando ele rejeita. */
  checkoutFails?: string | null;
}): Harness {
  const calls: string[] = [];
  let attempts = attemptsSoFar;
  let bounces = bouncesSoFar;

  const spies = {
    openSession: vi.fn(async (input: { taskId: string; worktreeId: string }) => {
      calls.push("openSession");
      // O escopo vem junto: uma conversa da esteira mora **no checkout**, e
      // abri-la no projeto poria o agente na raiz do repositório.
      expect(input.worktreeId).toBe(`wt-${input.taskId}`);
      return { sessionId: `ses-${input.taskId}` };
    }),
    prompt: vi.fn(async () => {
      calls.push("prompt");
    }),
    cancel: vi.fn(async () => {
      calls.push("cancel");
    }),
    closeSession: vi.fn(async () => {
      calls.push("closeSession");
    }),
    advance: vi.fn(async () => {
      calls.push("advance");
    }),
    bounce: vi.fn(async () => {
      calls.push("bounce");
      bounces += 1;
      return bounces;
    }),
    openPullRequest: vi.fn(async () => {
      calls.push("openPullRequest");
      return prUrl;
    }),
    publishNotes: vi.fn(async () => {
      calls.push("publishNotes");
      return notes;
    }),
    block: vi.fn(async () => {
      calls.push("block");
    }),
    park: vi.fn(async () => {
      calls.push("park");
    }),
    comment: vi.fn(async () => {
      calls.push("comment");
    }),
    mark: vi.fn(async () => {
      calls.push("mark");
    }),
    prepareCheckout: vi.fn(async (entry: QueueEntry) => {
      calls.push("prepareCheckout");
      if (checkoutFails !== null) throw new Error(checkoutFails);
      return { worktreeId: `wt-${entry.task.id}`, path: `/wt/${entry.task.id}`, dirty, head: "abc123" };
    }),
    gate: vi.fn(async () => {
      calls.push("gate");
      return verdict;
    }),
  };

  const ports: ConveyorPorts = {
    queue: () => ({ slots: 2, autonomy: "autonomo", entries: [], ...facts }),
    agentFor: async () => ({ adapter: "claude", model: null, instructions }),
    prepareCheckout: spies.prepareCheckout as unknown as ConveyorPorts["prepareCheckout"],
    returned: async () => returned,
    openSession: spies.openSession as unknown as ConveyorPorts["openSession"],
    prompt: spies.prompt as unknown as ConveyorPorts["prompt"],
    cancel: spies.cancel as unknown as ConveyorPorts["cancel"],
    closeSession: spies.closeSession as unknown as ConveyorPorts["closeSession"],
    gate: spies.gate as unknown as ConveyorPorts["gate"],
    countAttempt: async () => {
      calls.push("countAttempt");
      attempts += 1;
      return attempts;
    },
    advance: spies.advance as unknown as ConveyorPorts["advance"],
    bounce: spies.bounce as unknown as ConveyorPorts["bounce"],
    openPullRequest: spies.openPullRequest as unknown as ConveyorPorts["openPullRequest"],
    publishNotes: spies.publishNotes as unknown as ConveyorPorts["publishNotes"],
    block: spies.block as unknown as ConveyorPorts["block"],
    comment: spies.comment as unknown as ConveyorPorts["comment"],
    park: spies.park as unknown as ConveyorPorts["park"],
    mark: spies.mark as unknown as NonNullable<ConveyorPorts["mark"]>,
    prepared: async (taskId) => ({
      role: "implementador",
      prompt: "o prompt que foi preparado",
      worktreeId: `wt-${taskId}`,
      checkoutPath: `/wt/${taskId}`,
      adapter: "claude",
      model: null,
    }),
  };

  return { ports, calls, spies };
}

const entry = (patch: Partial<TaskRow> = {}): QueueEntry => ({
  task: fakeTask(patch),
  role: "implementador",
});

describe("o interruptor manda", () => {
  it("`manual` lê a fila e não faz nada com ela", async () => {
    const { ports, calls } = harness({
      facts: { autonomy: "manual", entries: [entry()] },
    });

    expect(await createConveyor(ports).tick("w1")).toBe(0);
    // Uma linha, e é o default do produto: a fila responde, e a esteira não
    // encosta em nada.
    expect(calls).toEqual([]);
  });

  it("`assistido` prepara e para antes de abrir adaptador", async () => {
    const { ports, calls, spies } = harness({
      facts: { autonomy: "assistido", entries: [entry()] },
    });

    await createConveyor(ports).tick("w1");

    /*
     * Contado, e não lido no código: a Q51 escolheu esta leitura pela conta —
     * um adaptador de pé custa 243 MB (Claude) ou 301 (Codex), e o teto de
     * paralelismo **não segura** um processo que não está gastando turno.
     */
    expect(spies.openSession).not.toHaveBeenCalled();
    // E **sem `countAttempt`**: preparar não é rodar, e a tentativa conta turno.
    expect(calls).toEqual(["prepareCheckout", "park"]);
    expect(spies.park.mock.calls[0]?.[0]).toMatchObject({
      taskId: "t1",
      worktreeId: "wt-t1",
    });
  });

  it("esperar o clique não gasta tentativa, por mais passadas que sejam", async () => {
    const { ports, spies } = harness({
      facts: { autonomy: "assistido", entries: [entry()] },
    });
    const conveyor = createConveyor(ports);

    /*
     * `park` não muda nenhuma das duas condições que a `queueOf` lê — a
     * autonomia da tarefa e o turno em voo —, então um cartão preparado
     * **continua candidato** a cada passada. Contando a tentativa aqui, o teto
     * de 2 estouraria em duas passadas de 15 s e o cartão seria bloqueado por
     * *"parou depois de 2 tentativas"* sem nenhum turno ter aberto, com a
     * autonomia dele desligada junto: o degrau da Q51 se apagando sozinho em
     * meio minuto.
     */
    for (let pass = 0; pass < MAX_ATTEMPTS + 3; pass += 1) await conveyor.tick("w1");

    expect(spies.block).not.toHaveBeenCalled();
    expect(spies.park).toHaveBeenCalledTimes(MAX_ATTEMPTS + 3);
  });

  it("o prompt preparado é o mesmo que seria enviado", async () => {
    const { ports, spies } = harness({
      facts: { autonomy: "assistido", entries: [entry()] },
    });

    await createConveyor(ports).tick("w1");

    // A promessa do degrau é *"você vê o que ele **ia** fazer"*. Se o texto
    // preparado e o texto enviado divergissem, o degrau seria uma demonstração.
    const parked = (spies.park.mock.calls[0]?.[0] as { prompt: string }).prompt;
    expect(parked).toBe(
      promptFor({
        role: "implementador",
        title: "o /orders devolve 500",
        body: "quando o carrinho está vazio",
        checkoutPath: "/wt/t1",
        attempt: 1,
        dirty: false,
        instructions: "",
      }),
    );
  });
});

describe("a ordem das coisas, e por que ela é essa", () => {
  it("a tentativa conta antes do prompt", async () => {
    const { ports, calls } = harness({ facts: { entries: [entry()] } });

    await createConveyor(ports).tick("w1");

    /*
     * Contar depois parece mais justo — *"só conta o que rodou"* — e é o que
     * quebra: um daemon que morre no meio do turno não contaria, a tarefa
     * voltaria à fila com o orçamento intacto, e o laço não teria fim. Contar
     * antes erra para o lado visível.
     */
    expect(calls.indexOf("countAttempt")).toBeLessThan(calls.indexOf("prompt"));
  });

  it("o portão decide, e o fim do turno não", async () => {
    const { ports, spies } = harness({
      facts: { entries: [entry()] },
      verdict: { kind: "unfinished", reason: "o turno acabou sem commit" },
    });

    await createConveyor(ports).tick("w1");

    /*
     * O turno **acabou** — a porta `prompt` resolveu — e mesmo assim a seta não
     * anda. É o achado que mais restringe esta feature: dos 13 `end_turn`
     * gravados neste repositório, 4 significaram *terminei*.
     */
    expect(spies.prompt).toHaveBeenCalled();
    expect(spies.advance).not.toHaveBeenCalled();
  });

  it("portão verde move a seta, e quem move é o daemon", async () => {
    const { ports, spies } = harness({ facts: { entries: [entry()] } });

    await createConveyor(ports).tick("w1");

    expect(spies.advance).toHaveBeenCalledWith({
      task: expect.objectContaining({ id: "t1" }) as unknown as TaskRow,
      role: "implementador",
    });
  });

  it("o turno deixa comentário na tarefa, com ou sem portão verde", async () => {
    const green = harness({ facts: { entries: [entry()] } });
    await createConveyor(green.ports).tick("w1");
    const red = harness({
      facts: { entries: [entry()] },
      verdict: { kind: "fail", reason: "o teste do projeto falhou" },
    });
    await createConveyor(red.ports).tick("w1");

    expect(green.spies.comment.mock.calls[0]?.[0]).toMatchObject({
      taskId: "t1",
      sessionId: "ses-t1",
      body: "implementador · tentativa 1 — portão verde",
    });
    expect(red.spies.comment.mock.calls[0]?.[0]).toMatchObject({
      body: "implementador · tentativa 1 — o teste do projeto falhou",
    });
  });
});

describe("quando não dá certo", () => {
  it("a primeira falha não bloqueia — a fila relê na passada seguinte", async () => {
    const { ports, spies } = harness({
      facts: { entries: [entry()] },
      verdict: { kind: "fail", reason: "o teste do projeto falhou" },
    });

    await createConveyor(ports).tick("w1");

    // A segunda tentativa **é** a passada seguinte: sem agenda, sem
    // `setTimeout`, sem estado. É o que sobra de não haver lease.
    expect(spies.block).not.toHaveBeenCalled();
  });

  it("a última falha bloqueia com o motivo do portão", async () => {
    const { ports, spies } = harness({
      facts: { entries: [entry()] },
      verdict: { kind: "fail", reason: "o teste do projeto falhou" },
      attemptsSoFar: MAX_ATTEMPTS - 1,
    });

    await createConveyor(ports).tick("w1");

    // O motivo é o do portão, e não *"falhou duas vezes"*: o cartão bloqueado
    // existe para dizer **o que** segurou.
    expect(spies.block).toHaveBeenCalledWith({
      taskId: "t1",
      reason: "o teste do projeto falhou",
    });
  });

  it("acima do teto, bloqueia sem gastar turno", async () => {
    const { ports, calls, spies } = harness({
      facts: { entries: [entry()] },
      attemptsSoFar: MAX_ATTEMPTS,
    });

    await createConveyor(ports).tick("w1");

    // Nem `openSession` nem `prompt`: uma tarefa que já esgotou a tentativa não
    // pode custar mais um turno para descobrir isso.
    expect(spies.openSession).not.toHaveBeenCalled();
    expect(calls).toEqual(["prepareCheckout", "countAttempt", "block"]);
  });
});

describe("quantas de uma vez", () => {
  it("as vagas cortam a fila, e a fila não vem cortada", async () => {
    const three = [entry({ id: "t1" }), entry({ id: "t2" }), entry({ id: "t3" })];
    const { ports, spies } = harness({ facts: { slots: 2, entries: three } });

    expect(await createConveyor(ports).tick("w1")).toBe(2);

    /*
     * O corte é aqui e não na `queueOf`, e a razão é da tela: uma fila já
     * cortada não sabe dizer a diferença entre *"não há nada devido"* e *"não
     * cabe mais agora"*.
     */
    expect(spies.openSession).toHaveBeenCalledTimes(2);
  });

  it("zero vaga não abre nada, mesmo com fila cheia", async () => {
    const { ports, calls } = harness({
      facts: { slots: 0, entries: [entry(), entry({ id: "t2" })] },
    });

    expect(await createConveyor(ports).tick("w1")).toBe(0);
    expect(calls).toEqual([]);
  });
});

describe("o prompt", () => {
  it("diz que ninguém vai responder", () => {
    const text = promptFor({
      role: "implementador",
      title: "t",
      body: "",
      checkoutPath: "/wt/1",
      attempt: 1,
      dirty: false,
      instructions: "",
    });

    // A medição da Q39 mostrou o custo de não dizer isto: o agente que acha que
    // tem interlocutor pergunta e para, e ninguém responde.
    expect(text).toContain("Você está trabalhando sozinho");
  });

  it("a segunda tentativa diz o fato do checkout sujo, e não o que a primeira achou", () => {
    const text = promptFor({
      role: "implementador",
      title: "t",
      body: "",
      checkoutPath: "/wt/1",
      attempt: 2,
      dirty: true,
      instructions: "",
    });

    /*
     * A linha da Q49, e ela é deliberadamente pobre: *"existe mudança
     * anterior"* é fato sobre o disco — o agente o acharia com `git status` —,
     * e *"a tentativa anterior concluiu X"* seria o canal que a Q47 fecha.
     */
    expect(text).toContain("tentativa anterior que terminou sem completar");
    expect(text).toContain("git status");
  });

  it("checkout limpo não ganha a frase", () => {
    const text = promptFor({
      role: "revisor",
      title: "t",
      body: "",
      checkoutPath: "/wt/1",
      attempt: 1,
      dirty: false,
      instructions: "",
    });

    expect(text).not.toContain("tentativa anterior");
  });

  it("cada encaixe tem missão própria", () => {
    const base = { title: "t", body: "", checkoutPath: "/wt/1", attempt: 1, dirty: false, instructions: "" };

    expect(promptFor({ ...base, role: "implementador" })).toContain("git commit");
    expect(promptFor({ ...base, role: "testador" })).toContain("funciona");

    /*
     * O revisor **posta** o parecer, e não o escreve na conversa (Parte 7 — T53).
     *
     * A missão dele dizia *"aprove ou reprove"*, e o daemon não lia nem um nem
     * outro: o portão tinha quatro fatos e nenhum vinha dele. Como se posta está
     * no preâmbulo, que é onde mora o id da sessão — este arquivo é função pura
     * sobre fato, montada antes de a sessão existir.
     */
    const revisor = promptFor({ ...base, role: "revisor" });
    expect(revisor).toContain("poste o parecer");
    expect(revisor).toContain("mesmo que você não tenha achado nada");
  });

  it("a instrução do agente nomeado vem primeiro", () => {
    const text = promptFor({
      role: "revisor",
      title: "t",
      body: "",
      checkoutPath: "/wt/1",
      attempt: 1,
      dirty: false,
      instructions: "reprove por qualquer teste faltando",
    });

    // Primeiro, porque é o que diferencia `revisor-severo` de `revisor-rapido`:
    // enterrá-la depois do fato a transformaria em observação.
    expect(text.startsWith("reprove por qualquer teste faltando")).toBe(true);
  });
});

describe("o comentário", () => {
  it("é factual e curto — não é relatório", () => {
    expect(commentFor("revisor", 2, { kind: "pass" })).toBe("revisor · tentativa 2 — portão verde");
    expect(commentFor("testador", 1, { kind: "fail", reason: "o CI está vermelho" })).toBe(
      "testador · tentativa 1 — o CI está vermelho",
    );
  });
});

describe("o clique do `assistido`", () => {
  it("manda o que foi preparado, e não um prompt remontado", async () => {
    const { ports, spies } = harness({ facts: {} });

    await createConveyor(ports).send("t1");

    /*
     * A promessa do degrau é *"você vê o que ele **ia** fazer"*. Remontar aqui
     * abriria a janela em que o corpo da tarefa mudou entre preparar e clicar —
     * e o que você aprovou não seria o que seguiu.
     */
    expect(spies.prompt.mock.calls[0]?.[0]).toMatchObject({
      text: "o prompt que foi preparado",
    });
  });

  it("o preparo é limpo **antes** do turno", async () => {
    const { ports, calls } = harness({ facts: {} });

    await createConveyor(ports).send("t1");

    /*
     * Limpar depois deixaria o botão `enviar` clicável durante todo o turno, e
     * o segundo clique abriria uma segunda sessão para a mesma tarefa — que é o
     * que o teto e a fila passam o arquivo inteiro evitando.
     */
    expect(calls.indexOf("park")).toBeLessThan(calls.indexOf("prompt"));
  });

  it("sem nada preparado, recusa dizendo o que falta", async () => {
    const { ports } = harness({ facts: {} });
    const conveyor = createConveyor({ ...ports, prepared: async () => null });

    await expect(conveyor.send("t1")).rejects.toThrow(/nada preparado/);
  });

  it("o turno do clique tem o mesmo teto do autônomo", async () => {
    const { ports, spies } = harness({ facts: {} });
    spies.prompt.mockImplementation(() => new Promise(() => undefined));

    /*
     * O clique é seu; o turno não é. A sessão nasce liberada justamente porque
     * não há ninguém para responder permissão — e quando o modo do agente não
     * pôde ser trocado, ele pergunta, o pedido vai para uma pessoa que não está
     * lá e o turno pendura para sempre com o cartão dizendo `implementando`.
     * Nada disso é exclusivo do caminho autônomo.
     */
    await createConveyor(ports, { turnTimeoutMs: 1, sleep: () => Promise.resolve() }).send("t1");

    expect(spies.cancel).toHaveBeenCalledWith("ses-t1");
  });
});

describe("preparar pode falhar, e falhar preparando gasta tentativa", () => {
  it("a passada não repesca o mesmo cartão para sempre", async () => {
    const { ports, spies, calls } = harness({
      facts: { entries: [entry()] },
      checkoutFails: "o checkout desta tarefa não está mais em /wt/t1",
    });
    const conveyor = createConveyor(ports);

    await conveyor.tick("w1");

    /*
     * Sem contar aqui, a exceção subia **antes** de qualquer escrita: sem
     * tentativa, sem bloqueio, e a passada seguinte repescava o mesmo cartão a
     * cada 15 s para sempre — com o único rastro num `conveyor-tick-failed` de
     * um daemon que ninguém está olhando.
     */
    expect(calls).toEqual(["prepareCheckout", "countAttempt"]);
    expect(spies.openSession).not.toHaveBeenCalled();
  });

  it("quando as tentativas acabam, o cartão para com a frase do disco", async () => {
    const { ports, spies } = harness({
      facts: { entries: [entry()] },
      checkoutFails: "o checkout desta tarefa não está mais em /wt/t1",
    });
    const conveyor = createConveyor(ports);

    for (let pass = 0; pass < MAX_ATTEMPTS; pass += 1) await conveyor.tick("w1");

    // A frase é a do disco, e não `parou depois de N tentativas`: quem lê o
    // cartão precisa saber **o que** falhou para ter como consertar.
    expect(spies.block).toHaveBeenCalledWith({
      taskId: "t1",
      reason: "o checkout desta tarefa não está mais em /wt/t1",
    });
  });

  it("o `assistido` também para, em vez de preparar para sempre", async () => {
    // A exceção à regra do degrau: preparar **com sucesso** não gasta tentativa
    // porque esperar o clique não é trabalho; uma falha é custo que se repete.
    const { ports, spies } = harness({
      facts: { autonomy: "assistido", entries: [entry()] },
      checkoutFails: "o repositório do projeto não está mais no lugar",
    });
    const conveyor = createConveyor(ports);

    for (let pass = 0; pass < MAX_ATTEMPTS; pass += 1) await conveyor.tick("w1");

    expect(spies.park).not.toHaveBeenCalled();
    expect(spies.block).toHaveBeenCalledWith({
      taskId: "t1",
      reason: "o repositório do projeto não está mais no lugar",
    });
  });
});

describe("o portão julga o checkout que o turno usou", () => {
  it("recebe o preparado, e não o ponteiro da linha em memória", async () => {
    /*
     * `worktreeId` nulo é o caso de **toda** tarefa que entra na esteira sem
     * checkout — um cartão da To-Do, um cartão vindo de issue. O
     * `prepareCheckout` corta a worktree e a anexa no banco, mas a linha que a
     * passada leu no começo continua com o ponteiro nulo: lendo dali, o portão
     * reprovava como *"sem checkout"* um turno inteiro que commitou e passou no
     * teste, e o primeiro turno pago era desperdiçado sempre.
     */
    const { ports, spies } = harness({ facts: { entries: [entry({ worktreeId: null })] } });

    await createConveyor(ports).tick("w1");

    expect(spies.gate.mock.calls[0]?.[1]).toEqual({
      worktreeId: "wt-t1",
      path: "/wt/t1",
      dirty: false,
      // O `HEAD` de antes do turno vai junto: é contra ele que `committed` é
      // lido, em vez do `ahead > 0` que ficava verdadeiro para sempre (T51).
      head: "abc123",
    });
    expect(spies.advance).toHaveBeenCalled();
  });
});

describe("as vagas rodam ao mesmo tempo", () => {
  it("`teto 2` produz dois turnos em voo, e não um depois do outro", async () => {
    const { ports, spies } = harness({
      facts: { slots: 2, entries: [entry({ id: "a" }), entry({ id: "b" })] },
    });
    let inFlight = 0;
    let peak = 0;
    spies.prompt.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
    });

    await createConveyor(ports).tick("w1");

    /*
     * Em série o pico era **1**: cada `runOne` espera o turno inteiro, então a
     * segunda vaga só começava quando a primeira acabasse — e o `2 em uso` que
     * o Open Design desenha ao lado do quadro era um número que o produto nunca
     * alcançava.
     */
    expect(peak).toBe(2);
    expect(spies.prompt).toHaveBeenCalledTimes(2);
  });

  it("uma vaga que falha não descarta o trabalho das outras", async () => {
    const { ports, spies } = harness({
      facts: { slots: 2, entries: [entry({ id: "a" }), entry({ id: "b" })] },
    });
    spies.prompt.mockImplementationOnce(() => Promise.reject(new Error("o adaptador morreu")));

    // Com `Promise.all`, a primeira rejeição descartaria o resultado da outra
    // vaga que já estava rodando. A falha continua subindo — é ela que vira o
    // `conveyor-tick-failed` —, mas depois de todo mundo ter terminado.
    await expect(createConveyor(ports).tick("w1")).rejects.toThrow(/o adaptador morreu/);
    expect(spies.prompt).toHaveBeenCalledTimes(2);
  });
});

describe("o turno tem teto de tempo", () => {
  it("um turno que não acaba é interrompido, e a tentativa é gasta", async () => {
    const { ports, spies, calls } = harness({ facts: { entries: [entry()] } });
    // Um `prompt` que nunca resolve: é o que acontece quando o agente é dono do
    // seletor de modos e manda um pedido de permissão — o daemon **não**
    // consulta a política do Lumem (A1 da `016`), e não há ninguém do outro
    // lado. O e2e achou isso antes deste teste existir.
    spies.prompt.mockImplementation(() => new Promise(() => undefined));

    await createConveyor(ports, {
      turnTimeoutMs: 1,
      sleep: () => Promise.resolve(),
    }).tick("w1");

    expect(spies.cancel).toHaveBeenCalledWith("ses-t1");
    expect(calls).toContain("countAttempt");
  });

  it("cancelar não é opcional — o turno abandonado continuaria gastando", async () => {
    const { ports, spies } = harness({ facts: { entries: [entry()] } });
    spies.prompt.mockImplementation(() => new Promise(() => undefined));

    await createConveyor(ports, { turnTimeoutMs: 1, sleep: () => Promise.resolve() }).tick("w1");

    /*
     * Sem o cancelamento o processo fica de pé ocupando vaga do teto de
     * paralelismo, e o agente do outro lado continua queimando token contra uma
     * tarefa que a esteira já deu por perdida.
     */
    expect(spies.cancel).toHaveBeenCalledTimes(1);
  });

  it("o portão não é chamado quando o teto chegou antes", async () => {
    const gate = vi.fn(async () => ({ kind: "pass" }) as const);
    const { ports, spies } = harness({ facts: { entries: [entry()] } });
    spies.prompt.mockImplementation(() => new Promise(() => undefined));

    await createConveyor(
      { ...ports, gate },
      { turnTimeoutMs: 1, sleep: () => Promise.resolve() },
    ).tick("w1");

    /*
     * Julgar um trabalho interrompido seria rodar o `test` contra um checkout
     * que o agente estava no meio de escrever — e um verde ali moveria a seta
     * por um estado que ninguém produziu de propósito.
     */
    expect(gate).not.toHaveBeenCalled();
    expect(spies.advance).not.toHaveBeenCalled();
  });

  it("um turno que acaba a tempo não é cancelado", async () => {
    const { ports, spies } = harness({ facts: { entries: [entry()] } });

    await createConveyor(ports, { turnTimeoutMs: 60_000 }).tick("w1");

    expect(spies.cancel).not.toHaveBeenCalled();
  });
});

describe("os marcos do tracker são cortesia (Q64)", () => {
  it("*peguei* sai antes de abrir a sessão", async () => {
    const { ports, calls } = harness({ facts: { entries: [entry()] } });

    await createConveyor(ports).tick("w1");

    /*
     * Quem está olhando a issue quer saber que alguém pegou **quando pegou**, e
     * não quando terminou.
     */
    expect(calls.indexOf("mark")).toBeLessThan(calls.indexOf("openSession"));
  });

  it("*pronta para mesclar* só sai quando a última etapa da máquina anda", async () => {
    const last = harness({ facts: { entries: [{ task: fakeTask({ status: "testing" }), role: "testador" }] } });
    await createConveyor(last.ports).tick("w1");
    const middle = harness({ facts: { entries: [{ task: fakeTask({ status: "review" }), role: "revisor" }] } });
    await createConveyor(middle.ports).tick("w1");

    const marks = (spy: typeof last.spies.mark) =>
      spy.mock.calls.map((call) => (call[0] as { mark: string }).mark);

    // `testing` é a última em que um encaixe trabalha; o que vem depois é sua
    // vez, e é o que a frase promete a quem lê a issue.
    expect(marks(last.spies.mark)).toContain("ready");
    expect(marks(middle.spies.mark)).not.toContain("ready");
  });

  it("*travei* sai com o motivo do portão, e só na última tentativa", async () => {
    const { ports, spies } = harness({
      facts: { entries: [entry()] },
      verdict: { kind: "fail", reason: "o teste do projeto falhou" },
      attemptsSoFar: MAX_ATTEMPTS - 1,
    });

    await createConveyor(ports).tick("w1");

    expect(spies.mark.mock.calls.map((call) => call[0])).toContainEqual({
      taskId: "t1",
      mark: "blocked",
      context: "o teste do projeto falhou",
    });
  });

  it("uma esteira sem tracker é a esteira de antes", async () => {
    const { ports, spies } = harness({ facts: { entries: [entry()] } });
    const { mark: _ignored, ...withoutTracker } = ports;

    // A porta é opcional, e o `?.` é o que faz uma instalação sem
    // `LINEAR_API_KEY` não pagar nada por uma feature que ela não tem.
    await expect(createConveyor(withoutTracker).tick("w1")).resolves.toBe(1);
    expect(spies.advance).toHaveBeenCalled();
  });

  it("um marco que falha não derruba o turno", async () => {
    const { ports, spies } = harness({ facts: { entries: [entry()] } });
    spies.mark.mockRejectedValue(new Error("o Linear respondeu 500"));

    // Cortesia, não portão: o trabalho já aconteceu do lado de cá.
    await expect(createConveyor(ports).tick("w1")).resolves.toBe(1);
    expect(spies.advance).toHaveBeenCalled();
  });
});

describe("o revisor devolve, e o vaivém tem fim (Parte 7 — T58)", () => {
  const reprovado: GateVerdict = { kind: "fail", reason: "o teste da linha 194 sobrevive" };
  /** O cartão em `In Review`, com o encaixe que trabalha nele. */
  const emReview = (): QueueEntry => ({ task: fakeTask({ status: "review" }), role: "revisor" });

  it("reprovar devolve a tarefa, e não a deixa parada em `review`", async () => {
    /*
     * Sem isto o cartão ficava em `In Review` e a passada seguinte entregava ao
     * revisor o **mesmo** código que ele acabou de reprovar — que é metade do
     * que a `LUM-51` fez enquanto gastava US$ 11,41.
     */
    const { ports, spies } = harness({
      facts: { entries: [emReview()] },
      verdict: reprovado,
    });

    await createConveyor(ports).tick("w1");

    expect(spies.bounce).toHaveBeenCalledWith({
      taskId: "t1",
      reason: "o teste da linha 194 sobrevive",
    });
    // A seta **não** anda para frente: quem volta não avança.
    expect(spies.advance).not.toHaveBeenCalled();
  });

  it("depois de `MAX_BOUNCES` voltas o cartão para, com a última frase", async () => {
    /*
     * É o teto que responde ao medo que originou a Parte 7: se o revisor achar
     * alguma coisa **toda** vez, o cartão para com o motivo escrito em vez de
     * circular até o orçamento acabar.
     *
     * `attempts` não daria conta: ele zera na mudança de etapa, e o ciclo troca
     * de etapa a cada passo — nenhum teto chegaria.
     */
    const { ports, spies } = harness({
      facts: { entries: [emReview()] },
      verdict: reprovado,
      bouncesSoFar: MAX_BOUNCES,
    });

    await createConveyor(ports).tick("w1");

    expect(spies.block).toHaveBeenCalledWith({
      taskId: "t1",
      reason: `o revisor devolveu ${String(MAX_BOUNCES)} vezes — a última: o teste da linha 194 sobrevive`,
    });
  });

  it("o implementador lê o que foi reproduzido, e só isso", async () => {
    const { ports, spies } = harness({
      facts: { entries: [entry()] },
      returned: [{ title: "o teste da linha 194 sobrevive", command: "pnpm vitest run scripts" }],
    });

    await createConveyor(ports).tick("w1");

    const enviado = (spies.prompt.mock.calls[0]?.[0] as { text: string }).text;
    expect(enviado).toContain("O que a revisão devolveu");
    expect(enviado).toContain("pnpm vitest run scripts");
  });

  it("o revisor **não** recebe os próprios achados de volta", async () => {
    // Seria a conversa dele consigo mesma — e para o testador seria o canal que
    // a Q47 fecha.
    const { ports, spies } = harness({
      facts: { entries: [emReview()] },
      returned: [{ title: "não devia aparecer", command: "eco" }],
    });

    await createConveyor(ports).tick("w1");

    expect((spies.prompt.mock.calls[0]?.[0] as { text: string }).text).not.toContain(
      "O que a revisão devolveu",
    );
  });

  it("sem volta nenhuma, o prompt não ganha a seção", async () => {
    const { ports, spies } = harness({ facts: { entries: [entry()] } });

    await createConveyor(ports).tick("w1");

    expect((spies.prompt.mock.calls[0]?.[0] as { text: string }).text).not.toContain(
      "O que a revisão devolveu",
    );
  });
});

describe("a PR abre na primeira vez que o implementador fecha (Parte 7 — T56)", () => {
  it("abre, e o marco do tracker sai com a URL", async () => {
    /*
     * É o que dá endereço ao balde `notes` — parecer de revisão mora numa PR —,
     * e o que faz o marco `pr` do §6, que existe e **nunca disparou**, passar a
     * disparar.
     */
    const { ports, spies } = harness({
      facts: { entries: [entry()] },
      prUrl: "https://github.com/acme/api/pull/87",
    });

    await createConveyor(ports).tick("w1");

    expect(spies.openPullRequest).toHaveBeenCalledTimes(1);
    expect(spies.mark).toHaveBeenCalledWith({
      taskId: "t1",
      mark: "pr",
      context: "https://github.com/acme/api/pull/87",
    });
  });

  it("antes da seta andar — a PR é da etapa que acabou", async () => {
    const { ports, calls } = harness({
      facts: { entries: [entry()] },
      prUrl: "https://github.com/acme/api/pull/87",
    });

    await createConveyor(ports).tick("w1");

    expect(calls.indexOf("openPullRequest")).toBeLessThan(calls.indexOf("advance"));
  });

  it("o revisor não abre PR — ele trabalha sobre a que já existe", async () => {
    const { ports, spies } = harness({
      facts: { entries: [{ task: fakeTask({ status: "review" }), role: "revisor" }] },
      verdict: { kind: "pass" },
      prUrl: "https://github.com/acme/api/pull/87",
    });

    await createConveyor(ports).tick("w1");

    expect(spies.openPullRequest).not.toHaveBeenCalled();
  });

  it("falhar ao abrir não segura o cartão — é cortesia, não portão", async () => {
    /*
     * Sem remoto, sem `gh`, o host fora do ar: o trabalho já aconteceu deste
     * lado, e recusar o avanço seria o produto ficando refém de um terceiro. É
     * a mesma regra do marco do tracker (Q64).
     */
    const { ports, spies } = harness({ facts: { entries: [entry()] } });
    spies.openPullRequest.mockRejectedValue(new Error("o gh não está instalado"));

    await createConveyor(ports).tick("w1");

    expect(spies.advance).toHaveBeenCalled();
    expect(spies.mark).not.toHaveBeenCalledWith(
      expect.objectContaining({ mark: "pr" }),
    );
  });

  it("sem URL, não há marco para mandar", async () => {
    // `null` é *não deu* — sem remoto, ou PR já aberta. O tracker não recebe
    // marco vazio.
    const { ports, spies } = harness({ facts: { entries: [entry()] }, prUrl: null });

    await createConveyor(ports).tick("w1");

    expect(spies.advance).toHaveBeenCalled();
    expect(spies.mark).not.toHaveBeenCalledWith(
      expect.objectContaining({ mark: "pr" }),
    );
  });
});

describe("a anotação do revisor vai para a PR (Parte 7 — T55)", () => {
  it("o revisor passou: as anotações são publicadas antes de a seta andar", async () => {
    /*
     * O balde `notes` promete, no preâmbulo, que o que não é reproduzível *"vai
     * para a pull request, onde uma pessoa lê antes de mesclar"*. Sem esta
     * chamada a promessa é falsa e a anotação morre numa tabela que nenhuma tela
     * lê — o revisor teria sido instruído a escrever para ninguém.
     */
    const { ports, spies, calls } = harness({
      facts: { entries: [{ task: fakeTask({ status: "review" }), role: "revisor" }] },
      verdict: { kind: "pass" },
      notes: 3,
    });

    await createConveyor(ports).tick("w1");

    expect(spies.publishNotes).toHaveBeenCalledTimes(1);
    expect(calls.indexOf("publishNotes")).toBeLessThan(calls.indexOf("advance"));
  });

  it("o implementador não publica anotação — ele não fez revisão nenhuma", async () => {
    const { ports, spies } = harness({ facts: { entries: [entry()] } });

    await createConveyor(ports).tick("w1");

    expect(spies.publishNotes).not.toHaveBeenCalled();
  });

  it("falhar ao publicar não segura o cartão — é cortesia, como a PR", async () => {
    const { ports, spies } = harness({
      facts: { entries: [{ task: fakeTask({ status: "review" }), role: "revisor" }] },
      verdict: { kind: "pass" },
    });
    spies.publishNotes.mockRejectedValue(new Error("o gh não está instalado"));

    await createConveyor(ports).tick("w1");

    expect(spies.advance).toHaveBeenCalled();
  });

  it("o revisor que devolveu não publica nada — o cartão nem chega à PR", async () => {
    // O caminho do `fail` sai antes: o que ele produz é volta, e a anotação
    // desta passada vai junto com a volta seguinte, se ela sobreviver.
    const { ports, spies } = harness({
      facts: { entries: [{ task: fakeTask({ status: "review" }), role: "revisor" }] },
      verdict: { kind: "fail", reason: "o teste da linha 194 sobrevive" },
    });

    await createConveyor(ports).tick("w1");

    expect(spies.publishNotes).not.toHaveBeenCalled();
    expect(spies.bounce).toHaveBeenCalled();
  });
});
