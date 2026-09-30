import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AcpManager } from "../acp/AcpManager.js";
import { AdapterCatalog } from "../acp/adapter-catalog.js";
import { loadConfig, type ConfigEnv, type ServerConfig } from "../config.js";
import { openTestDb, type TestDb } from "../db/testing.js";
import type { Db } from "../db/index.js";
import { createEventBus, type EventBus } from "../events.js";
import { createCloneJobStore } from "../git/CloneJobStore.js";
import { createGitService, type GitService } from "../git/GitService.js";
import { createGhHost } from "../pr/GhHost.js";
import { createAgentAuthService } from "../setup/agent-auth.js";
import { createPrCache, type PrCache } from "../pr/PrCache.js";
import { createIssueCache } from "../pr/IssueCache.js";
import type { PrHost } from "../pr/PrHost.js";
import { PtyManager } from "../pty/PtyManager.js";
import { createScriptRunner, type ScriptRunner } from "../scripts/ScriptRunner.js";
import { createSecretStore } from "../secrets/SecretStore.js";
import { createSessionStore, type SessionStore } from "../sessions/SessionStore.js";
import { createDaemonSettingsRepository } from "../repositories/daemonSettings.js";
import { createLiveResources } from "../resources/live.js";
import type { ProcessTableReader } from "../resources/process-table.js";
import type { ResourceSampler } from "../resources/sample.js";
import { createUpdateService, type UpdateService, type UpdateServiceOptions } from "../update/service.js";
import { adapterInvocationFor, catalogedAdapterOf } from "../setup/adapter-command.js";
import { defaultAccountIdOf } from "../repositories/agentAccount.js";
import { appRouter } from "../routers/index.js";
import { createCallerFactory, type Context } from "../trpc.js";

const createCaller = createCallerFactory(appRouter);

export interface TestCaller {
  api: ReturnType<typeof createCaller>;
  /** The same context the procedures get, for the routines they share. */
  ctx: Context;
  db: Db;
  ptyManager: PtyManager;
  acpManager: AcpManager;
  sessionStore: SessionStore;
  scripts: ScriptRunner;
  /**
   * Espera o que a API deixou rodando em segundo plano: o `setup` que o
   * `worktree.create` dispara sem `await`. Sem isso, um teste que declara o
   * `[scripts]` logo depois de criar a worktree disputa o arquivo com o gancho.
   */
  settled(): Promise<void>;
  git: GitService;
  pr: PrCache;
  events: EventBus;
  config: ServerConfig;
  /** A verificação e o instalador do daemon, para o teste avançar a verificação à mão. */
  update: UpdateService;
  /** Kills every session and deletes the database. Always call it. */
  cleanup(): Promise<void>;
}

/**
 * The whole router, over storage that belongs to this test.
 *
 * Calling procedures through the caller rather than over HTTP keeps the tests
 * about behaviour instead of transport — the transport has its own tests, in
 * `server.test.ts` and in `routers/files.transport.test.ts`.
 */
export interface TestCallerOverrides {
  /**
   * A manager whose adapter is fake.
   *
   * Only `setup.probe` needs it: it is the one procedure that reaches the manager
   * directly, and without a seam the test would spawn whatever `claude-agent-acp`
   * happens to be on the machine running the suite — which makes the result depend
   * on the laptop.
   */
  acpManager?: AcpManager;
  /**
   * Um host de git de mentira.
   *
   * Sem ele, um teste do router de PR executaria o `gh` que estiver na máquina
   * de quem roda a suíte — e o resultado dependeria da conta de alguém. Ver
   * `docs/project/testing.md`.
   */
  prHost?: PrHost;
  /**
   * Um `ScriptRunner` de mentira (`033` T12).
   *
   * O `worktree.start` espera o `setup` antes de mandar o primeiro prompt, e a
   * pergunta do teste é **a ordem** — o prompt só depois do exit, e o `setup`
   * uma vez. Um `pnpm install` de verdade responde isso com tempo de máquina;
   * um falso responde com o exit que o teste escolher, na hora que ele quiser.
   */
  scripts?: ScriptRunner;
  /**
   * A atualização do daemon (`038`), com tudo o que ela toca de fora trocado.
   *
   * Sem `request`, o registry é o de verdade — e a verificação **não roda sozinha**
   * aqui (o relógio nunca é armado), então um teste que esquecer de dublar só
   * chegaria à rede se chamasse `check.checkNow()` de propósito. Sem `install` e sem
   * `shutdown` o padrão **recusa**: um teste que chegasse a instalar de verdade
   * trocaria o Lumem de quem roda a suíte.
   */
  update?: TestUpdateOverrides;
  /**
   * A tabela de processos de mentira e o relógio do painel de recursos (`038`).
   *
   * O padrão é uma máquina **vazia**: sem ele, um teste que perguntasse os recursos
   * executaria o `ps` de quem roda a suíte, e a resposta dependeria do que estiver
   * aberto no laptop.
   */
  resources?: { read?: ProcessTableReader; now?: () => number; every?: (fn: () => void, ms: number) => () => void };
}

export type TestUpdateOverrides = Partial<
  Pick<UpdateServiceOptions, "current" | "request" | "install" | "shutdown" | "manager">
>;

export function createTestCaller(
  env: ConfigEnv = {},
  overrides: TestCallerOverrides = {},
): TestCaller {
  /*
   * Um `stateDir` descartável, sempre, mesmo quando o teste não pede.
   *
   * `loadConfig({})` resolve para o `~/.lumem` **de verdade**, e o que corre por
   * cima dele grava: `worktree.create` cria worktree dentro de
   * `~/.lumem/worktrees/<projeto>/`, e as fixtures de git têm nome de tmpdir. O
   * resultado, medido na máquina de quem escreveu isto: **nove diretórios
   * `lumem-git-*`** no estado real, deixados por suítes que já tinham passado.
   *
   * A regra que o resto do arquivo já segue para o banco vale para o diretório:
   * teste que toca o estado do desenvolvedor é teste que uma hora o destrói.
   */
  const stateDir =
    env.LUMEM_STATE_DIR ?? mkdtempSync(join(tmpdir(), "lumem-caller-"));
  const scoped: ConfigEnv = { ...env, LUMEM_STATE_DIR: stateDir };
  const ownedStateDir = env.LUMEM_STATE_DIR === undefined;

  const database: TestDb = openTestDb();
  const ptyManager = new PtyManager();
  /*
   * A manager of its own, wired to nothing.
   *
   * The sessions in these tests go through the store, which builds its own; this
   * one exists because `setup.probe` reaches the manager directly (onboarding D4),
   * and a context missing it would fail at the type level for every other router.
   */
  const acpManager = overrides.acpManager ?? new AcpManager();
  const config = loadConfig(scoped);
  const git = createGitService();
  const events = createEventBus();
  /*
   * O store recebe o `acpManager` e o resolvedor de adaptador — o mesmo par que o
   * `bootstrap` liga.
   *
   * Antes ele recebia nem um nem outro, e o comentário acima explicava por quê:
   * *"as sessões destes testes vão pelo store, que constrói o seu"*. A consequência
   * é que **nenhum** teste de router conseguia criar sessão ACP — `session.createAgent`
   * com `transport: "acp"` morria em `"nenhum AcpManager foi ligado"` —, então a
   * resolução de adaptador no caminho de sessão não tinha onde ser provada. Ligar os
   * dois aqui é o que faz um teste de router poder afirmar **o que o spawner
   * recebeu**, que é a única asserção que pega a versão errada.
   */
  // O cofre do daemon de teste: um diretório descartável, como o resto. Antes
  // do store, porque a retomada de uma conta de chave lê dele (`034` T5).
  const secrets = createSecretStore({ stateDir: config.stateDir });
  // O catálogo por conta, ligado ao store como o `bootstrap` liga (`034` T9):
  // sem ele, o handshake de uma sessão não chega à leitura da conta, e o trio
  // indisponível — derivado dela — nunca apareceria num teste de router.
  const adapterCatalog = new AdapterCatalog({
    stateDir: config.stateDir,
    defaultAccountOf: (adapterId) => defaultAccountIdOf(database.db, adapterId),
  });
  const sessionStore = createSessionStore({
    db: database.db,
    ptyManager,
    acpManager,
    events,
    git,
    resolveInvocation: (agent, account) =>
      adapterInvocationFor({ config: agent, account, stateDir: config.stateDir, secrets }),
    adapterCatalog,
    catalogAdapterOf: (agent) => catalogedAdapterOf(agent, config.stateDir)?.id ?? null,
  });
  // Same wiring the daemon uses: without it a session that ends on its own
  // stays `running` and the removal rules read stale state.
  const stopTracking = sessionStore.trackExits();
  /*
   * Os `start` em voo do runner de verdade. O `worktree.create` dispara o `setup` com
   * `void`, e o gancho lê o `[scripts]` *depois* de a chamada ter voltado: sob carga,
   * depois de o teste ter escrito o arquivo — e então roda o `setup` do teste uma
   * segunda vez, com uma linha de execução que o teste não iniciou. Deixar o teste
   * esperar o gancho fechar é o que o torna determinístico; um `sleep` só o adiaria.
   */
  const inFlight = new Set<Promise<unknown>>();
  const scripts =
    overrides.scripts ??
    trackStarts(
      createScriptRunner({
        db: database.db,
        sessionStore,
        ptyManager,
        shell: config.shell,
        portRange: config.runPortRange,
        events,
      }),
      inFlight,
    );

  /*
   * O adaptador padrão é o de verdade, e ele **não** é exercitado por acidente:
   * o cache só executa quando alguém chama `pr.*`, e os testes que chamam
   * passam o seu próprio. Deixar o real como padrão é o que faz o teste que
   * esquecer de dublar falhar de forma visível, em vez de passar contra um
   * dublê que ninguém pediu.
   */
  const prHost = overrides.prHost ?? createGhHost();
  const prCache: PrCache = createPrCache({
    host: prHost,
    onChange: (projectId) => events.emit({ type: "pr.changed", projectId }),
  });

  const update = createUpdateService({
    config,
    settings: createDaemonSettingsRepository(database.db),
    manager: "npm",
    install: () => Promise.reject(new Error("o teste não injetou o instalador")),
    // Nunca resolve: o daemon do teste não sai, e o teste vê o que ficou de pé.
    shutdown: () => new Promise<void>(() => {}),
    holdPrompts: (held) => acpManager.setUpdating(held),
    ...overrides.update,
  });

  const resources: ResourceSampler = createLiveResources({
    db: database.db,
    ptyManager,
    acpManager,
    read: overrides.resources?.read ?? (async () => []),
    ...(overrides.resources?.now === undefined ? {} : { now: overrides.resources.now }),
    ...(overrides.resources?.every === undefined ? {} : { every: overrides.resources.every }),
  });

  const ctx: Context = {
    config,
    db: database.db,
    ptyManager,
    acpManager,
    // Sobre o `stateDir` descartável, e vazio: quem quer leitura grava pelo `ctx`.
    adapterCatalog,
    sessionStore,
    scripts,
    secrets,
    git,
    clones: createCloneJobStore(),
    pr: prCache,
    issues: createIssueCache({ host: prHost }),
    prHost,
    agentAuth: createAgentAuthService({ acpManager }),
    update,
    resources,
    events,
  };

  return {
    api: createCaller(ctx),
    ctx,
    db: database.db,
    ptyManager,
    acpManager,
    sessionStore,
    scripts,
    async settled() {
      while (inFlight.size > 0) await Promise.allSettled(inFlight);
    },
    git,
    pr: prCache,
    events,
    config,
    update,
    cleanup: async () => {
      stopTracking();
      resources.stop();
      await acpManager.killAll();
      await ptyManager.killAll();
      database.cleanup();
      // Só o que este caller criou: um `LUMEM_STATE_DIR` vindo do teste é do teste.
      if (ownedStateDir) rmSync(stateDir, { recursive: true, force: true });
    },
  };
}

/**
 * O runner com os `start` anotados enquanto não terminam.
 *
 * Espalhar o objeto mantém o `this` certo: `runToCompletion` chama `this.start`, e
 * com o espalhamento isso cai no `start` anotado — o que é o desejado.
 */
function trackStarts(runner: ScriptRunner, inFlight: Set<Promise<unknown>>): ScriptRunner {
  return {
    ...runner,
    start(scope, phase) {
      const started = runner.start(scope, phase);
      const tracked = started.then(
        () => {},
        () => {},
      );
      inFlight.add(tracked);
      void tracked.then(() => inFlight.delete(tracked));
      return started;
    },
  };
}
