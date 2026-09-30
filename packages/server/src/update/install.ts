import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  PACKAGE_NAME,
  detectPackageManager,
  installCommand,
  type InstallCommand,
  type PackageManager,
} from "@lumem/shared";
import type { FastifyBaseLogger } from "fastify";

/**
 * Instalar por cima, e sair (`038`, Parte 2; ADR de 2026-09-29-2004, door 8).
 *
 * **Instalar e reiniciar são um gesto só**, e o motivo foi medido (experimento 1 da
 * fase 0): com o daemon de pé, um `npm i -g` de uma versão com outro hash de JS faz
 * `/` servir o `index.html` novo apontando para um asset que responde 404 — o
 * `@fastify/static` registrou uma rota por arquivo no boot —, e o asset velho
 * também é 404, porque o npm o apagou. Quem instala tem de ser quem sai, e o
 * supervisor (launchd, systemd) é quem sobe a versão nova: por isso o `update` só
 * existe com `supervised`.
 */

export interface InstallerOptions {
  /**
   * O gerenciador dono da cópia que roda. Lido do caminho **deste** arquivo — que,
   * no pacote instalado, é `dist/server/main.mjs` dentro do prefixo global de quem o
   * instalou —, e é a mesma leitura que o `lumem upgrade` faz.
   */
  manager?: PackageManager;
  /** Roda o instalador e devolve o código de saída; lança se ele nem nasceu. */
  install?: (command: InstallCommand) => Promise<number>;
  /** O `createShutdownHandler` do daemon: fecha tudo e sai com 0. */
  shutdown: (signal: string) => Promise<void>;
  /** Fecha (`true`) e reabre (`false`) a porta de prompt: turno novo é o que uma reinicialização mata. */
  holdPrompts: (held: boolean) => void;
  log?: Pick<FastifyBaseLogger, "info" | "warn">;
}

export interface Installer {
  /** Há uma instalação em curso — ou já terminada com sucesso, com o processo a caminho da saída. */
  installing(): boolean;
  /** Por que a última tentativa falhou; `null` se não falhou, ou enquanto outra roda. */
  lastError(): string | null;
  /**
   * Começa a instalar `version` e **volta na hora**: quem chama responde `started`
   * e não espera o npm, que leva minutos.
   */
  start(version: string): void;
}

export function createInstaller({
  manager = detectPackageManager(fileURLToPath(import.meta.url)),
  install = runInstall,
  shutdown,
  holdPrompts,
  log,
}: InstallerOptions): Installer {
  let installing = false;
  let lastError: string | null = null;

  function fail(reason: string): void {
    // Volta a aceitar prompt e continua na versão de agora; a razão fica para a tela.
    lastError = reason;
    installing = false;
    holdPrompts(false);
    log?.warn({ reason }, "a atualização falhou; o Lumem continua na versão atual");
  }

  async function run(version: string): Promise<void> {
    const command = installCommand(manager, `${PACKAGE_NAME}@${version}`);
    let code: number;
    try {
      code = await install(command);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
      return;
    }
    if (code !== 0) {
      fail(`o ${command.command} saiu com ${String(code)}`);
      return;
    }
    // Não reabre nada: o processo vai embora, e um prompt aceito agora seria um turno
    // que o `killAll` do desligamento mata no meio.
    log?.info({ version }, "atualização instalada; saindo para o supervisor subir a nova");
    try {
      await shutdown("update");
    } catch (error) {
      // O handler de desligamento trata as próprias falhas e sai; se ainda assim algo
      // lançou, o daemon está de pé, na versão velha, com a nova em disco — e o que
      // ele deve fazer é voltar a aceitar prompt e dizer isso.
      fail(`instalou, mas o desligamento falhou: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    installing: () => installing,
    lastError: () => lastError,
    start(version) {
      installing = true;
      lastError = null;
      holdPrompts(true);
      void run(version);
    },
  };
}

/**
 * Sem `stdio: "inherit"` no stdin, e com o resto herdado: a saída do gerenciador cai
 * no `daemon.log` sob o supervisor — é onde alguém procura quando a atualização
 * falha — e nada pode ficar esperando um terminal que não existe.
 */
async function runInstall({ command, args }: InstallCommand): Promise<number> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}
