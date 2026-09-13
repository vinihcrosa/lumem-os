import { join } from "node:path";

import { ADAPTERS_DIR_NAME } from "@lumem/shared";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";

import { reconcileOnBoot } from "./boot/reconcile.js";
import type { ServerConfig } from "./config.js";
import { openDatabase, type Database_ } from "./db/index.js";
import { createEventBus } from "./events.js";
import { AcpManager } from "./acp/AcpManager.js";
import { ensureMemoryHome } from "./memory/home.js";
import { MemoryService } from "./memory/MemoryService.js";
import { createSessionCapture } from "./memory/capture.js";
import { createPlaybookService } from "./memory/playbook.js";
import { trackPlaybookLoads } from "./memory/playbook-tracking.js";
import { trackSessionUsage } from "./usage/record.js";
import { trackTaskProgress } from "./tasks/progress.js";
import { createAgentAuthService } from "./setup/agent-auth.js";
import { adapterCommandForConfig } from "./setup/adapter-command.js";
import { reconcileAdapters } from "./setup/reconcile-adapters.js";
import { createMemoryPreamble } from "./memory/preamble.js";
import { createBudgetSource } from "./tasks/budget-source.js";
import { createConveyor } from "./tasks/conveyor.js";
import { createConveyorPorts } from "./tasks/conveyor-ports.js";
import { runConveyorLoop } from "./tasks/conveyor-loop.js";
import { createLinearHost } from "./tracker/LinearHost.js";
import { createSecretStore } from "./secrets/SecretStore.js";
import { runTrackerLoop } from "./tracker/loop.js";
import { writeMark, type Mark } from "./tracker/marks.js";
import { configForAdapter, verdictOfWorktree } from "./tasks/conveyor-wiring.js";
import { createCallerFactory } from "./trpc.js";
import { appRouter } from "./routers/index.js";
import { createGitService } from "./git/GitService.js";
import { createCloneJobStore } from "./git/CloneJobStore.js";
import { createGhHost } from "./pr/GhHost.js";
import { createPrCache } from "./pr/PrCache.js";
import { createIssueCache } from "./pr/IssueCache.js";
import { PtyManager } from "./pty/PtyManager.js";
import { createTranscriptStore, type TranscriptStore } from "./acp/TranscriptStore.js";
import { createTurnFailureSink } from "./acp/turn-failures.js";
import { createScriptRunner } from "./scripts/ScriptRunner.js";
import { createSessionStore } from "./sessions/SessionStore.js";
import { createServer } from "./server.js";
import { createShutdownHandler } from "./shutdown.js";
import { installSignalHandlers, type SignalSource } from "./signals.js";

export interface BootstrapOptions {
  config: ServerConfig;
  /** Injected so tests can assert handlers without arming a real process exit. */
  signalSource?: SignalSource;
  exit?: (code: number) => void;
  logger?: boolean;
  /**
   * Owner of the daemon's PTYs. Created here by default; injected by tests that
   * need to inspect the sessions after shutdown.
   */
  ptyManager?: PtyManager;
  /**
   * Owner of every ACP agent. Same reasoning as `ptyManager`: it outlives the
   * HTTP server, because shutdown has to end the conversations before closing the
   * socket they travel on.
   */
  acpManager?: AcpManager;
  /**
   * Where conversations are kept (F5.4).
   *
   * Opened here from `config.transcriptsDir` unless a test hands one over. Closed on
   * shutdown, with the database, for the same reason: an open SQLite handle at exit
   * leaves a journal beside the file.
   */
  transcripts?: TranscriptStore;
  /**
   * Already-open database. Injected by tests that want a throwaway file;
   * otherwise opened here from `config.databasePath` and closed on shutdown.
   */
  database?: Database_;
  /** Extra shutdown work, run after the children die and before the server closes. */
  beforeClose?: () => Promise<void>;
}

/**
 * Builds the daemon, wires shutdown, and starts listening.
 *
 * This exists as a function rather than top-level statements in main.ts because
 * the signal wiring is the single line that decides whether children get closed
 * on SIGTERM, and top-level statements cannot be tested at all — deleting the
 * call passed every gate.
 */
export async function bootstrap({
  config,
  signalSource = process,
  exit = (code) => process.exit(code),
  logger = true,
  ptyManager = new PtyManager(),
  acpManager,
  transcripts,
  database,
  beforeClose,
}: BootstrapOptions): Promise<FastifyInstance> {
  // Antes do banco, porque o banco mora dentro do state dir e porque o
  // `.gitignore` que exclui o próprio banco do histórico é escrito aqui: abrir
  // o SQLite primeiro criaria o arquivo antes de existir a regra que o ignora.
  const home = await ensureMemoryHome({ stateDir: config.stateDir });

  /*
   * O adaptador que este daemon possui é o do pino, e isto é conferido **antes**
   * de a primeira sessão poder existir — [ADR de
   * 2026-09-08](../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md).
   *
   * Aqui e não dentro do `createServer` porque o resultado é log de boot e não
   * estado de request. O log sai depois, quando `app.log` existir; guardar a lista
   * é mais barato que reordenar a construção do servidor por uma linha de aviso.
   */
  const adapters = await reconcileAdapters({
    dir: join(config.stateDir, ADAPTERS_DIR_NAME),
  });

  const owned = database === undefined;
  const openedDatabase = database ?? openDatabase({ path: config.databasePath });
  const ownedTranscripts = transcripts === undefined;
  const openedTranscripts = transcripts ?? createTranscriptStore({ dir: config.transcriptsDir });
  // One bus, shared: the session store emits from the PTY exit callback and
  // the router emits from procedures, and both have to reach the same clients.
  const events = createEventBus();
  // Built here rather than defaulted inside `createServer`, because the store and
  // the server both need the *same* one and shutdown needs it too. The first
  // version of this let `createServer` default it, and the daemon then refused
  // every ACP session with "nenhum AcpManager foi ligado" — the store it was
  // handed had been built without one.
  /*
   * The manager needs a logger and the logger does not exist yet: `app.log` comes
   * from `createServer`, which needs the store, which needs the manager. Rather
   * than reorder that or drop the log, the manager gets a forwarder that resolves
   * `app` when a message actually happens — which is always after boot.
   */
  let bootedApp: FastifyInstance | undefined;
  const acp =
    acpManager ??
    new AcpManager({
      // The `PtyManager` the daemon already owns, so the agent can be given a
      // terminal (F3.2, D7). Without it the capability is never declared and the
      // whole feature is dead in the real daemon while every unit test passes —
      // which is exactly how the e2e found this line missing.
      ptyManager,
      // Without this the manager falls back to its in-memory store and the daemon
      // loses every conversation on exit, while every unit test still passes — the
      // same shape of mistake as the `ptyManager` line above, which is why the proof
      // that this one is wired lives in the e2e that restarts the daemon.
      transcripts: openedTranscripts,
      log: {
        warn: (...args: Parameters<FastifyBaseLogger["warn"]>) => {
          bootedApp?.log.warn(...args);
        },
      },
      // A memória entra na conversa aqui, e só aqui: é o único lugar que conhece
      // o banco, o `~/.lumem` e o endereço do próprio daemon ao mesmo tempo.
      // Um `AcpManager` injetado por teste não recebe nada — a conversa dele é a
      // que era antes desta feature.
      preamble: createMemoryPreamble({
        db: openedDatabase.db,
        stateDir: config.stateDir,
        askUrl: `http://${config.host}:${String(config.port)}/memory/ask`,
        // A porta de tarefas entra no mesmo preâmbulo (`022` T14): um parágrafo,
        // com o teto junto — um agente que não sabe do orçamento gasta um turno
        // descobrindo que ele existe.
        tasks: {
          url: `http://${config.host}:${String(config.port)}/tasks`,
          budget: config.taskBudget,
        },
      }),
      // O teto entra pela mesma porta e pela mesma razão: este é o único lugar
      // que conhece o banco e o manager ao mesmo tempo (`028` Parte 3, T16).
      budget: createBudgetSource(openedDatabase.db),
      // O retrato do turno que falhou, em disco (`028` Q46). Sem isto ele sai
      // por `stdout` e some com o terminal — e a cota fecha durante trabalho
      // autônomo, que é quando ninguém está olhando.
      turnFailures: createTurnFailureSink({
        stateDir: config.stateDir,
        // Disco recusado não derruba nada: a falha do turno já subiu. Ela vira
        // mais uma linha no mesmo log que o retrato também usa.
        onError: (error: unknown) => {
          bootedApp?.log.warn({ tag: "turn-failed-sink", error }, "não deu para gravar o retrato");
        },
      }),
    });
  /*
   * As tentativas de login vivas, criadas aqui para o desligamento alcançá-las.
   *
   * O `createServer` monta uma se ninguém der — e aí o `close` do daemon não
   * teria a mesma instância para cancelar. Um serviço por lugar seria um serviço
   * que ninguém desliga.
   */
  const agentAuth = createAgentAuthService({ acpManager: acp });
  const sessionStore = createSessionStore({
    db: openedDatabase.db,
    ptyManager,
    acpManager: acp,
    events,
    // Retomar relança o adaptador **de hoje**, não o caminho gravado na sessão
    // morta. A costura é opcional no store e obrigatória aqui: sem esta linha,
    // toda unidade passa e o daemon real retoma na versão velha.
    resolveAcpCommand: (agent) => adapterCommandForConfig(agent, config.stateDir),
    // A captura de fim de sessão (§10). Desligada por padrão, e a configuração é
    // quem diz: `LUMEM_MEMORY_DISTILL=1`.
    onEnded: createSessionCapture({
      db: openedDatabase.db,
      stateDir: config.stateDir,
      acpManager: acp,
      enabled: config.distill,
      log: {
        warn: (...args: Parameters<FastifyBaseLogger["warn"]>) => {
          bootedApp?.log.warn(...args);
        },
      },
    }),
  });
  // A telemetria de playbook (Q16): o carregamento chega como `tool_call`, e o
  // ciclo de vida do §9 é derivado dela. Desligar o observador junto com o resto,
  // porque ele guarda uma referência ao banco.
  // O consumo de cada turno (`workspace-screen`, W4): o `usage_update` sempre
  // chegou e nunca foi guardado.
  const stopUsageTracking = trackSessionUsage({
    db: openedDatabase.db,
    acpManager: acp,
    log: {
      warn: (...args: Parameters<FastifyBaseLogger["warn"]>) => {
        bootedApp?.log.warn(...args);
      },
    },
  });

  // `in_progress` é derivado do primeiro prompt de uma sessão ligada à tarefa
  // (`022` §3.2). Observador irmão do de consumo, na mesma costura e desligado
  // junto: ninguém aperta um botão "comecei", e a máquina só move a seta quando
  // o fato é verificável de fora do agente.
  const stopTaskProgress = trackTaskProgress({
    db: openedDatabase.db,
    acpManager: acp,
    events,
    log: {
      warn: (...args: Parameters<FastifyBaseLogger["warn"]>) => {
        bootedApp?.log.warn(...args);
      },
    },
  });

  const stopPlaybookTracking = trackPlaybookLoads({
    acpManager: acp,
    playbooks: createPlaybookService({ db: openedDatabase.db, stateDir: config.stateDir }),
    log: {
      warn: (...args: Parameters<FastifyBaseLogger["warn"]>) => {
        bootedApp?.log.warn(...args);
      },
    },
  });

  // Construído uma vez e passado adiante: o servidor e a esteira precisam do
  // **mesmo** runner, senão a esteira rodaria `setup` num processo que a aba
  // `Setup` do rodapé não vê.
  const scripts = createScriptRunner({
    db: openedDatabase.db,
    sessionStore,
    ptyManager,
    shell: config.shell,
    portRange: config.runPortRange,
    events,
    log: {
      warn: (...args: Parameters<FastifyBaseLogger["warn"]>) => {
        bootedApp?.log.warn(...args);
      },
      info: (...args: Parameters<FastifyBaseLogger["info"]>) => {
        bootedApp?.log.info(...args);
      },
    },
  });

  /*
   * Git, host e caches construídos **aqui**, e não pelos defaults do servidor.
   *
   * Pelo mesmo motivo do `scripts` logo acima: a esteira e o servidor precisam
   * dos **mesmos**. Dois `PrCache` perguntariam ao `gh` duas vezes a mesma
   * coisa, que é exatamente o que a `013` pagou para não fazer — *"oito
   * worktrees custam um processo, não oito"*.
   */
  const git = createGitService();
  const clones = createCloneJobStore();
  const prHost = createGhHost();
  const pr = createPrCache({
    host: prHost,
    onChange: (projectId) => {
      events.emit({ type: "pr.changed", projectId });
    },
  });
  const issues = createIssueCache({ host: prHost });

  /*
   * O tracker (`028` Partes 5 e 6).
   *
   * Construído sempre, e **não** condicionado a haver credencial: o host
   * reporta ausência em vez de falhar, e é ele que decide a cada chamada. Um
   * `if` aqui faria uma chave guardada depois do boot só valer no reinício
   * seguinte — e guardar a chave é um gesto na tela, não uma variável de
   * ambiente que pede reinício.
   */
  const secrets = createSecretStore({ stateDir: config.stateDir });
  const tracker = createLinearHost({ secrets });

  /*
   * A esteira, construída **antes** do servidor porque ela entra no contexto
   * dele: o clique do `assistido` é uma procedure, e ela manda o prompt pela
   * mesma esteira que o teria mandado sozinha. Duas instâncias dariam duas
   * políticas — e a do clique seria a que ninguém testou.
   *
   * O `api` dela é um chamador do lado do servidor sobre o mesmo router, e a
   * dependência circular que isso parece ser não é: o contexto do chamador não
   * tem esteira, porque nada do que a esteira chama precisa de uma.
   */
  const conveyor = createConveyor(
    createConveyorPorts({
      db: openedDatabase.db,
      git,
      scripts,
      createWorktree: async ({ projectId, name, taskId }) => {
        const created = await api.worktree.create({ projectId, name, taskId });
        return { id: created.id, path: created.path };
      },
      openAgentSession: async ({ taskId, adapter, model, cwd, worktreeId, agentMode }) => {
        // `cwd` não é usado: a sessão da esteira é **de escopo**, e o escopo é a
        // worktree — o daemon resolve o diretório dela, como faz para toda
        // conversa aberta pela tela.
        void cwd;
        const configured = await configForAdapter(
          openedDatabase.db,
          adapter,
          config.conveyorAgent,
        );
        const opened = await api.session.createAgent({
          scopeType: "worktree",
          scopeId: worktreeId,
          agentConfigId: configured,
          taskId,
          // Não há ninguém do outro lado. Ver a nota da procedure: é **nascer**
          // liberada, e não trocar — o portão do `016` protege a troca.
          autonomous: true,
        });
        /*
         * O modo do agente é escolhido **depois** do handshake, e não podia ser
         * antes: ele é uma `configOption` que o próprio adaptador declara, e o
         * daemon só conhece a lista dela quando a sessão existe.
         *
         * Falhar aqui não derruba o turno — um adaptador que não tem aquele modo
         * vai perguntar alguma coisa e o turno vai morrer, que é a tentativa
         * gasta com o motivo, e não um erro de boot.
         */
        if (agentMode !== null) {
          await acp.setConfig(opened.id, "mode", agentMode).catch(() => undefined);
        }
        if (model !== null) {
          await acp.setConfig(opened.id, "model", model).catch(() => undefined);
        }
        return { sessionId: opened.id };
      },
      prompt: async ({ sessionId, text }) => {
        await acp.prompt(sessionId, text);
      },
      cancel: (sessionId) => {
        acp.cancel(sessionId);
        return Promise.resolve();
      },
      liveTurns: () => acp.liveTurns(),
      prVerdictOf: (worktreeId) => verdictOfWorktree(openedDatabase.db, pr, worktreeId),
      /*
       * O marco que o tracker vê (`028` Parte 6).
       *
       * Ligado sempre, e é o `available()` do host que decide se acontece
       * alguma coisa — não um `if` aqui. A diferença importa: com o `if`, uma
       * chave posta no ambiente depois do boot não valeria até o próximo
       * reinício.
       */
      mark: async ({ taskId, mark, context }) => {
        await writeMark(
          {
            db: openedDatabase.db,
            host: tracker,
            log: {
              warn: (payload, message) => {
                bootedApp?.log.warn(payload, message);
              },
            },
          },
          taskId,
          mark as Mark,
          context,
        );
      },
    }),
  );

  const app = await createServer({
    config,
    db: openedDatabase.db,
    ptyManager,
    acpManager: acp,
    sessionStore,
    scripts,
    conveyor,
    secrets,
    git,
    clones,
    prHost,
    pr,
    issues,
    events,
    agentAuth,
    logger,
  });
  bootedApp = app;

  /*
   * A esteira (`028` Parte 2).
   *
   * **Ela chama o mesmo router que a tela chama**, por um chamador do lado do
   * servidor. A alternativa seria uma segunda implementação de *"cortar worktree
   * e abrir sessão"* — e duas implementações do mesmo gesto é como elas
   * divergem: a `026` acabou de pôr quatro origens no corte, e nenhuma delas
   * valeria para a esteira.
   */
  const api = createCallerFactory(appRouter)({
    config,
    db: openedDatabase.db,
    ptyManager,
    acpManager: acp,
    sessionStore,
    scripts,
    secrets,
    git,
    clones,
    prHost,
    pr,
    issues,
    events,
    agentAuth,
  });

  const stopTracker = runTrackerLoop({
    db: openedDatabase.db,
    host: tracker,
    log: {
      warn: (...args: Parameters<FastifyBaseLogger["warn"]>) => {
        bootedApp?.log.warn(...args);
      },
    },
  });

  const stopConveyor = runConveyorLoop({
    db: openedDatabase.db,
    conveyor,
    log: {
      warn: (...args: Parameters<FastifyBaseLogger["warn"]>) => {
        bootedApp?.log.warn(...args);
      },
    },
  });


  /*
   * O resultado da conferência de adaptador, agora que há onde escrever.
   *
   * `warn` para o que pede ação de alguém — uma versão fora do pino que não subiu,
   * ou nenhuma cópia gerenciada, que é o estado em que `commandFor` recusa sessão.
   * `info` para o resto, incluindo `already-pinned`: um boot silencioso é o que
   * fez nove dias passarem sem ninguém notar que o pino não decidia nada.
   */
  for (const adapter of adapters) {
    const level = adapter.outcome === "failed" || adapter.outcome === "absent" ? "warn" : "info";
    app.log[level](
      { adapter: adapter.id, ...adapter },
      `adaptador ${adapter.id}: ${adapter.outcome}`,
    );
  }

  const target = {
    log: app.log,
    close: async () => {
      // Children first, and before any optional hook that might throw: closing
      // the HTTP server does not touch them, and once the process is gone
      // nothing will — SIGTERM would orphan every shell the daemon spawned.
      // Unhook first: killAll is about to end every session, and recording
      // those exits would write "exited" rows the next boot has to redo anyway.
      stopTracking();
      stopPlaybookTracking();
      stopUsageTracking();
      stopTaskProgress();
      stopConveyor();
      stopTracker();
      await ptyManager.killAll();
      // Conversations too: an adapter left running is a subprocess with nothing
      // pointing at it, exactly like an orphaned shell.
      await acp.killAll();
      /*
       * E as tentativas de login, que o `killAll` não alcança.
       *
       * O processo de um login não é sessão — não tem linha e não está no mapa —,
       * e um `authenticate` de método de navegador fica pendurado esperando uma
       * pessoa. Sem isto, desligar o daemon no meio de um login deixa exatamente
       * o órfão que o `killAll` existe para evitar.
       */
      agentAuth.cancelAll();
      if (beforeClose) await beforeClose();
      await app.close();
      // Last: a handler still finishing a request would otherwise write to a
      // closed handle. Only if we opened it — an injected one is the caller's.
      if (owned) openedDatabase.close();
      if (ownedTranscripts) openedTranscripts.close();
    },
  };

  installSignalHandlers(signalSource, createShutdownHandler({ target, exit }));

  // Records follow processes from here on: a shell that dies on its own has to
  // stop being `running` without anyone polling for it.
  const stopTracking = sessionStore.trackExits(app.log);

  // Before listening, deliberately: a client that connects mid-reconciliation
  // would read states that are about to change under it.
  const reconciled = await reconcileOnBoot({
    db: openedDatabase.db,
    config,
    transcriptsDir: config.transcriptsDir,
    log: app.log,
  });
  app.log.info(reconciled, "reconciliação de boot");
  // O índice FTS5 é derivado e nasce fora das migrations: um banco com catálogo
  // e sem índice existe. Reconstruir aqui é o que impede a primeira busca de
  // responder "nada encontrado" para o acervo inteiro, sem erro e sem sinal.
  const { failures, ...index } = await new MemoryService({
    db: openedDatabase.db,
    stateDir: config.stateDir,
    log: app.log,
  }).ensureIndexFresh();
  app.log.info(
    { ...home, stateDir: config.stateDir, index, unreadable: failures.length },
    "memória do workspace",
  );

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (error) {
    // EADDRINUSE is by far the most common way starting the daemon fails, and
    // a raw node stack buries the one thing worth reading. Log the code, not
    // the whole error object.
    const code = (error as NodeJS.ErrnoException).code ?? "UNKNOWN";
    app.log.error({ port: config.port, host: config.host, code }, `cannot listen: ${code}`);
    exit(1);
    return app;
  }

  app.log.info({ port: config.port, host: config.host }, "lumem daemon listening");
  return app;
}
