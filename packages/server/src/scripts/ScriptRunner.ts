import { createHash } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";

import type { Db } from "../db/index.js";
import { session, type SessionRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import type { EventBus } from "../events.js";
import type { PtyManager } from "../pty/PtyManager.js";
import { createProjectRepository } from "../repositories/project.js";
import { createWorktreeRepository } from "../repositories/worktree.js";
import type { ScriptPhase } from "../repositories/session.js";
import type { ScopeType } from "../scope.js";
import type { SessionStore } from "../sessions/SessionStore.js";
import { PortWatcher, usesReservedPort, type DiscoveredPort } from "./port-sniff.js";
import { findReservedPort, portBlock, reservePort, type PortRange } from "./ports.js";
import { SCRIPT_PHASES, readProjectScripts, type ProjectScripts } from "./project-scripts.js";

/**
 * Quem roda os scripts do projeto.
 *
 * Uma sessão de script **é uma sessão** (A3): mesma tabela, mesmo `PtyManager`, mesmo
 * websocket. Isso dá de graça o que um caminho paralelo levaria uma feature inteira
 * para refazer — scrollback, reanexar, sobreviver ao browser fechado, morrer com o
 * `SIGTERM` do daemon. O que este módulo acrescenta é o que é só dos scripts: de onde
 * vem o comando, o que o processo ganha de ambiente, e quem pode rodar o quê.
 */

export interface CheckoutScope {
  scopeType: ScopeType;
  scopeId: string;
}

export interface ScriptExecution {
  sessionId: string;
  /** `null` enquanto roda. */
  exitCode: number | null;
  running: boolean;
  startedAt: Date;
  finishedAt: Date | null;
  command: string;
  /**
   * A saída desta execução ainda pode ser lida.
   *
   * O scrollback vive na memória do daemon, então **reiniciar o daemon o apaga** —
   * a linha do banco sobrevive e o buffer não. Sem este campo a tela mostrava um
   * retângulo preto vazio, que é a pior forma de dizer "isto não existe mais".
   * Visto rodando o produto, não num teste.
   */
  outputAvailable: boolean;
}

export interface PhaseStatus {
  /** O comando declarado no `project.toml` deste checkout, ou `null`. */
  command: string | null;
  /** A execução mais recente — a que está viva, ou a última que terminou. */
  last: ScriptExecution | null;
}

export interface ScriptStatus {
  scripts: ProjectScripts;
  /** Onde o arquivo fica, exista ele ou não. */
  file: string;
  trusted: boolean;
  /** A reserva deste checkout, quando já existe. Ler não aloca. */
  reservedPort: number | null;
  /** A porta do run vivo, com a proveniência. `null` quando não há. */
  port: DiscoveredPort | null;
  setup: PhaseStatus;
  run: PhaseStatus;
  test: PhaseStatus;
  teardown: PhaseStatus;
}

export interface StartResult {
  session: SessionRow;
  /** O run anterior que este start parou (A4). */
  stoppedPrevious: string | null;
}

export interface ScriptRunner {
  status(scope: CheckoutScope): Promise<ScriptStatus>;
  start(scope: CheckoutScope, phase: ScriptPhase): Promise<StartResult>;
  stop(scope: CheckoutScope, phase: ScriptPhase): Promise<string | null>;
  /**
   * Roda e **espera**, com teto de tempo. É o que o `teardown` precisa: ele existe
   * para desfazer alguma coisa antes de a worktree sumir, e uma remoção que não
   * espera nada teria removido o diretório debaixo do próprio script.
   */
  runToCompletion(
    scope: CheckoutScope,
    phase: ScriptPhase,
    options?: { timeoutMs?: number },
  ): Promise<number | null>;
  /** Confia no `[scripts]` que este projeto tem agora (S11). */
  trust(projectId: string): Promise<void>;
  /** Para tudo que este checkout deixou vivo. Usado antes de remover. */
  stopAll(scope: CheckoutScope): Promise<void>;
}

export interface ScriptRunnerOptions {
  db: Db;
  sessionStore: SessionStore;
  ptyManager: PtyManager;
  /** O shell de login do usuário — o mesmo que a sessão de shell usa. */
  shell: string;
  portRange?: PortRange;
  events?: EventBus;
  log?: Pick<FastifyBaseLogger, "warn" | "info">;
}

/** Teto do `teardown`: curto, porque a remoção não pode ficar refém dele (S8). */
export const TEARDOWN_TIMEOUT_MS = 20_000;

export function createScriptRunner({
  db,
  sessionStore,
  ptyManager,
  shell,
  portRange,
  events,
  log,
}: ScriptRunnerOptions): ScriptRunner {
  /**
   * A porta de cada run vivo, em memória.
   *
   * Em memória de propósito: o processo morre com o daemon, então uma porta
   * persistida sobreviveria ao que ela descreve — e o rodapé mostraria "Abrir
   * :55061" para um servidor que não existe desde o último reboot.
   */
  const discovered = new Map<string, DiscoveredPort>();

  async function checkoutOf(scope: CheckoutScope) {
    const projects = createProjectRepository(db);

    if (scope.scopeType === "project") {
      const project = await projects.findById(scope.scopeId);
      if (!project) throw new DomainError("NOT_FOUND", `projeto ${scope.scopeId} não existe`);
      return { project, worktree: null, cwd: project.path };
    }

    const worktree = await createWorktreeRepository(db).findById(scope.scopeId);
    if (!worktree) throw new DomainError("NOT_FOUND", `worktree ${scope.scopeId} não existe`);
    const project = await projects.findById(worktree.projectId);
    if (!project) {
      throw new DomainError("NOT_FOUND", `projeto ${worktree.projectId} não existe`);
    }
    return { project, worktree, cwd: worktree.path };
  }

  /** A execução mais recente de uma fase, viva ou não. */
  async function lastExecution(
    scope: CheckoutScope,
    phase: ScriptPhase,
  ): Promise<ScriptExecution | null> {
    const [row] = await db
      .select()
      .from(session)
      .where(
        and(
          eq(session.scopeType, scope.scopeType),
          eq(session.scopeId, scope.scopeId),
          eq(session.kind, "script"),
          eq(session.scriptName, phase),
        ),
      )
      .orderBy(desc(session.createdAt))
      .limit(1);

    return row ? toExecution(row) : null;
  }

  function toExecution(row: SessionRow): ScriptExecution {
    // O que a tabela diz e o que o processo diz podem discordar por um instante —
    // e depois de um restart discordam de vez, porque a linha sobreviveu e o
    // processo não. Quem manda é o `PtyManager`: ele é o que ainda existe.
    const known = ptyManager.get(row.id);
    const live = known?.state === "running";
    return {
      sessionId: row.id,
      exitCode: row.exitCode,
      running: row.state === "running" && live,
      startedAt: row.createdAt,
      finishedAt: row.state === "exited" ? row.updatedAt : null,
      command: row.command,
      outputAvailable: known !== undefined,
    };
  }

  async function liveSession(
    scope: CheckoutScope,
    phase: ScriptPhase,
  ): Promise<SessionRow | null> {
    const rows = await db
      .select()
      .from(session)
      .where(
        and(
          eq(session.scopeType, scope.scopeType),
          eq(session.scopeId, scope.scopeId),
          eq(session.kind, "script"),
          eq(session.scriptName, phase),
          eq(session.state, "running"),
        ),
      );

    return rows.find((row) => ptyManager.get(row.id)?.state === "running") ?? null;
  }

  return {
    async status(scope) {
      const { project, cwd } = await checkoutOf(scope);
      const scripts = await readProjectScripts(cwd, {
        warn: (message) => log?.warn({ scope, message }, "scripts ignorados"),
      });

      const [setup, run, test, teardown, reservedPort] = await Promise.all([
        lastExecution(scope, "setup"),
        lastExecution(scope, "run"),
        lastExecution(scope, "test"),
        lastExecution(scope, "teardown"),
        findReservedPort(db, scope),
      ]);

      return {
        scripts,
        file: projectFileOf(cwd),
        trusted: isTrusted(project.managed, project.scriptsTrustedHash, scripts),
        reservedPort,
        port: run?.running ? (discovered.get(run.sessionId) ?? null) : null,
        setup: { command: scripts.setup, last: setup },
        run: { command: scripts.run, last: run },
        test: { command: scripts.test, last: test },
        teardown: { command: scripts.teardown, last: teardown },
      };
    },

    async start(scope, phase) {
      const { project, worktree, cwd } = await checkoutOf(scope);
      const scripts = await readProjectScripts(cwd);
      const command = scripts[phase];

      if (command === null) {
        throw new DomainError(
          "BLOCKED",
          `este projeto não declara \`scripts.${phase}\` em ${projectFileOf(cwd)}`,
        );
      }

      if (!isTrusted(project.managed, project.scriptsTrustedHash, scripts)) {
        // A recusa carrega o comando, e isso é a feature: a tela precisa
        // mostrar o que ia rodar para você poder decidir (S11).
        throw new DomainError(
          "BLOCKED",
          `o \`[scripts]\` de "${project.name}" ainda não foi confiado — ` +
            `ele veio com o repositório clonado, e vai rodar: ${command}`,
        );
      }

      // A4: dois `pnpm dev` no mesmo checkout brigam pela mesma porta, e o
      // segundo morre com um erro que ninguém lê. O anterior para, e quem
      // chamou fica sabendo que parou.
      let stoppedPrevious: string | null = null;
      const previous = await liveSession(scope, phase);
      if (previous) {
        await sessionStore.close(previous.id).catch(() => {});
        discovered.delete(previous.id);
        stoppedPrevious = previous.id;
      }

      // Reservar só na hora de rodar, e não ao abrir o rodapé: ler não pode
      // consumir porta de um checkout que nunca vai rodar nada.
      const port = await reservePort(db, scope, portRange ? { range: portRange } : {});

      const row = await sessionStore.start({
        kind: "script",
        scriptName: phase,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        cwd,
        // O shell de login, como a sessão de shell: um script que não enxerga o
        // `nvm`, o `mise` ou o `PATH` da pessoa é um script que falha aqui e
        // funciona no terminal dela — o pior modo de falha possível.
        command: shell,
        args: ["-lc", command],
        // A linha guarda o comando declarado, não o shell que o carrega: é o
        // que a lista de sessões mostra, e `/bin/zsh` ali não diz nada.
        recordedCommand: command,
        env: {
          LUMEM_WORKSPACE_ID: project.workspaceId,
          LUMEM_PROJECT_ID: project.id,
          LUMEM_PROJECT_PATH: project.path,
          LUMEM_WORKTREE_ID: worktree?.id ?? "",
          LUMEM_WORKTREE_NAME: worktree?.name ?? "",
          LUMEM_WORKTREE_PATH: worktree?.path ?? "",
          LUMEM_SCRIPT: phase,
          LUMEM_RUN_PORT: String(port),
          ...Object.fromEntries(
            portBlock(port).map((value, index) => [`LUMEM_RUN_PORT_${index + 1}`, String(value)]),
          ),
        },
      });

      if (phase === "run") watchPort(row.id, command, port);

      events?.emit({ type: "session.changed", scopeType: scope.scopeType, scopeId: scope.scopeId });
      return { session: row, stoppedPrevious };
    },

    async stop(scope, phase) {
      const live = await liveSession(scope, phase);
      // Parar o que não está rodando é no-op: o botão pode chegar depois de o
      // processo ter morrido sozinho, e isso não é erro de ninguém.
      if (!live) return null;

      await sessionStore.close(live.id);
      discovered.delete(live.id);
      events?.emit({ type: "session.changed", scopeType: scope.scopeType, scopeId: scope.scopeId });
      return live.id;
    },

    async runToCompletion(scope, phase, { timeoutMs = TEARDOWN_TIMEOUT_MS } = {}) {
      const { session: row } = await this.start(scope, phase);

      return new Promise<number | null>((resolve) => {
        const timer = setTimeout(() => {
          // Timeout não é falha do usuário e não pode virar exceção: quem chama
          // é uma remoção, e ela continua de qualquer jeito (S8).
          log?.warn({ scope, phase }, "script não terminou no tempo — seguindo sem ele");
          ptyManager.kill(row.id);
          resolve(null);
        }, timeoutMs);

        ptyManager.onExit(row.id, ({ exitCode }) => {
          clearTimeout(timer);
          resolve(exitCode);
        });
      });
    },

    async trust(projectId) {
      const projects = createProjectRepository(db);
      const project = await projects.findById(projectId);
      if (!project) throw new DomainError("NOT_FOUND", `projeto ${projectId} não existe`);

      const scripts = await readProjectScripts(project.path);
      await projects.setScriptsTrustedHash(projectId, hashScripts(scripts));
    },

    async stopAll(scope) {
      for (const phase of ["run", "setup", "test", "teardown"] as const) {
        const live = await liveSession(scope, phase);
        if (!live) continue;
        await sessionStore.close(live.id).catch(() => {});
        discovered.delete(live.id);
      }
    },
  };

  /** Segue a saída do run até achar a porta, ou até o teto (S6). */
  function watchPort(sessionId: string, command: string, reserved: number): void {
    const watcher = new PortWatcher(reserved, usesReservedPort(command));
    if (watcher.result) {
      discovered.set(sessionId, watcher.result);
      return;
    }

    const unsubscribe = ptyManager.onData(sessionId, (chunk) => {
      watcher.push(chunk);
      const found = watcher.result;
      if (found) {
        discovered.set(sessionId, found);
        unsubscribe();
        return;
      }
      if (!watcher.watching) unsubscribe();
    });

    ptyManager.onExit(sessionId, () => {
      unsubscribe();
      discovered.delete(sessionId);
    });
  }
}

/** O caminho do arquivo, para a tela poder dizer onde ele mora. */
function projectFileOf(cwd: string): string {
  return `${cwd}/.lumem/project.toml`;
}

/**
 * A assinatura do que foi confiado.
 *
 * Sobre os três comandos juntos: aprovar o `run` e ganhar um `setup` novo de brinde
 * é exatamente o buraco que a S11 fecha.
 */
export function hashScripts(scripts: ProjectScripts): string {
  return createHash("sha256")
    // A ordem é a do `SCRIPT_PHASES`, e o hash muda quando uma fase nova entra —
    // de propósito: um `[scripts]` com um comando a mais é outro `[scripts]`, e a
    // confiança é sobre o conjunto (S11).
    .update(JSON.stringify(SCRIPT_PHASES.map((phase) => scripts[phase])))
    .digest("hex");
}

/**
 * Quem pode rodar sem perguntar.
 *
 * Projeto **não gerenciado** é repositório que já estava no disco e que a pessoa
 * apontou: o comando dele é dela, e pedir confirmação aí seria treinar o clique
 * automático — o oposto de uma proteção. Projeto **gerenciado** veio de uma URL, e
 * aí a confiança é sobre este `[scripts]` exato.
 */
export function isTrusted(
  managed: boolean,
  trustedHash: string | null,
  scripts: ProjectScripts,
): boolean {
  if (!managed) return true;
  return trustedHash !== null && trustedHash === hashScripts(scripts);
}
