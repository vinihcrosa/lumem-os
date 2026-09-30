import { LUMEM_VERSION, compareVersions } from "@lumem/shared";

import type { ServerConfig } from "../config.js";
import type { DaemonSettingsRepository } from "../repositories/daemonSettings.js";
import { createUpdateCheck, type UpdateCheck, type UpdateCheckOptions } from "./check.js";
import { createInstaller, type Installer, type InstallerOptions } from "./install.js";

/**
 * A atualização do daemon inteira, o que uma procedure alcança (`038`, Parte 2).
 *
 * Um objeto só, no contexto do tRPC, porque as três peças — a verificação, o
 * instalador e o interruptor — precisam concordar sobre uma pergunta: *o Lumem está
 * procurando versão nova?* Com cada uma lendo o ambiente e o banco por conta, o
 * relógio poderia perguntar ao registry enquanto `updateStatus` jurava que não.
 */
export interface UpdateService {
  /** A versão que roda: `LUMEM_VERSION`, e nada que o registry diga. */
  current: string;
  check: UpdateCheck;
  installer: Installer;
  /** Ligada agora: nem `LUMEM_NO_UPDATE_CHECK=1` nem `update_check = 0`. */
  checkEnabled(): boolean;
  /** Há versão nova, pelo último `latest` bom. */
  updateAvailable(): boolean;
}

export interface UpdateServiceOptions {
  config: Pick<ServerConfig, "noUpdateCheck">;
  settings: DaemonSettingsRepository;
  /** Só um teste passa: o valor de verdade é o `LUMEM_VERSION` embutido no bundle. */
  current?: string;
  request?: UpdateCheckOptions["request"];
  timeoutMs?: UpdateCheckOptions["timeoutMs"];
  bootDelayMs?: UpdateCheckOptions["bootDelayMs"];
  manager?: InstallerOptions["manager"];
  install?: InstallerOptions["install"];
  shutdown: InstallerOptions["shutdown"];
  holdPrompts: InstallerOptions["holdPrompts"];
  log?: UpdateCheckOptions["log"] & InstallerOptions["log"];
}

export function createUpdateService({
  config,
  settings,
  current = LUMEM_VERSION,
  request,
  timeoutMs,
  bootDelayMs,
  manager,
  install,
  shutdown,
  holdPrompts,
  log,
}: UpdateServiceOptions): UpdateService {
  const checkEnabled = (): boolean => !config.noUpdateCheck && settings.get().updateCheck;

  const check = createUpdateCheck({
    enabled: checkEnabled,
    ...(request === undefined ? {} : { request }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(bootDelayMs === undefined ? {} : { bootDelayMs }),
    ...(log === undefined ? {} : { log }),
  });

  const installer = createInstaller({
    shutdown,
    holdPrompts,
    ...(manager === undefined ? {} : { manager }),
    ...(install === undefined ? {} : { install }),
    ...(log === undefined ? {} : { log }),
  });

  return {
    current,
    check,
    installer,
    checkEnabled,
    updateAvailable() {
      const { latest } = check.last();
      return latest !== null && compareVersions(current, latest) === -1;
    },
  };
}
