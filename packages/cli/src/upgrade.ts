import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  compareVersions,
  detectPackageManager,
  installCommand,
  fetchLatestVersion,
  PACKAGE_NAME,
  type InstallCommand,
  type PackageManager,
} from "@lumem/shared";

import { probePort } from "./port.js";
import {
  START_TIMEOUT_MS,
  isLoaded,
  restartService,
  waitUntil,
  type ServiceHost,
  type ServiceIdentity,
} from "./service.js";

// O que os testes e o resto do CLI sempre importaram daqui; a definição subiu para
// o `shared`, onde o daemon a lê também (`038`).
export {
  compareVersions,
  detectPackageManager,
  fetchLatestVersion,
  installCommand,
  PACKAGE_NAME,
  REGISTRY_URL,
  type FetchLatestOptions,
  type InstallCommand,
  type PackageManager,
} from "@lumem/shared";

/**
 * Updating the daemon in place.
 *
 * The daemon is not a separate artifact from the CLI: `bin/lumem.mjs` and
 * `dist/server/main.mjs` ship in the same npm package, so "atualizar o daemon"
 * is "reinstalar o pacote". What this file adds over typing
 * `npm i -g @vinihcrosa/lumem-os@latest` by hand is the part that command gets
 * wrong on the two machines that are not npm-on-a-clean-prefix:
 *
 *  - it asks the registry **first**, so being already up to date costs one HTTP
 *    request and not a full reinstall;
 *  - it installs with the package manager that **owns the installed copy**. A
 *    `npm i -g` over a pnpm global install leaves two `lumem` on the PATH and
 *    the older one usually wins;
 *  - it says out loud that a daemon already running keeps the old code until it
 *    is restarted, which is the one way this command silently looks broken.
 */

export interface UpgradeDeps {
  out: (line: string) => void;
  err: (line: string) => void;
  /** The version running right now. */
  current: string;
  /** Only report; never install. */
  check: boolean;
  /** Where a daemon would be, so the "restart it" line only appears when there is one. */
  origin: string;
  fetchLatest?: () => Promise<string>;
  /** @returns the exit code of the installer. */
  install?: (command: InstallCommand) => Promise<number>;
  manager?: PackageManager;
  probe?: typeof probePort;
  /**
   * O serviço do sistema (`038`, AC 36). Quando está **carregado**, o `upgrade` o
   * reinicia depois de instalar e diz a versão que o daemon responde; sem ele — ou
   * sem serviço carregado — vale a frase de sempre.
   */
  service?: { host: ServiceHost; identity: ServiceIdentity };
}

export async function upgrade(deps: UpgradeDeps): Promise<number> {
  const {
    out,
    err,
    current,
    check,
    origin,
    fetchLatest = () => fetchLatestVersion(),
    install = runInstall,
    manager = detectPackageManager(fileURLToPath(import.meta.url)),
    probe = probePort,
    service,
  } = deps;

  let latest: string;
  try {
    latest = await fetchLatest();
  } catch (error) {
    err(`não consegui perguntar ao npm qual é a última versão: ${message(error)}`);
    return 1;
  }

  const order = compareVersions(current, latest);
  if (order === 0) {
    out(`já está na última versão (v${current}).`);
    return 0;
  }
  if (order === 1) {
    // A local build, or a publish that was rolled back. Downgrading silently
    // would be a surprise, and there is nothing to upgrade to.
    out(`a versão instalada (v${current}) é mais nova que a do npm (v${latest}); nada a fazer.`);
    return 0;
  }

  if (check) {
    out(`tem versão nova: v${current} → v${latest}`);
    out("rode `lumem upgrade` para instalar.");
    return 0;
  }

  const command = installCommand(manager, `${PACKAGE_NAME}@${latest}`);
  out(`atualizando o Lumem: v${current} → v${latest}`);
  out(`$ ${command.command} ${command.args.join(" ")}`);

  let code: number;
  try {
    code = await install(command);
  } catch (error) {
    err(`não consegui rodar o ${command.command}: ${message(error)}`);
    return 1;
  }
  if (code !== 0) {
    err(`o ${command.command} saiu com ${String(code)}; o Lumem continua na v${current}.`);
    return code;
  }

  out(`pronto: v${latest} instalado.`);

  if (service !== undefined && (await isLoaded(service.host, service.identity))) {
    return await restartLoadedService({ service, probe, origin, latest, out, err });
  }

  const occupant = await probe({ origin });
  if (occupant.kind === "lumem") {
    // The daemon loaded its code at boot. The new files are on disk and the
    // process running is still the old one.
    out(`o daemon em ${origin} ainda está na v${occupant.version}: pare e suba de novo para valer.`);
  }
  return 0;
}

/**
 * Reinicia o serviço e só diz que deu certo quando o **daemon novo** responde.
 *
 * `kickstart -k` volta antes de o processo velho terminar de fechar, e nesse
 * intervalo o `/trpc/health` ainda responde a versão de antes: dizer *"reiniciou"*
 * na primeira resposta seria dizer a versão errada. Por isso se espera a versão que
 * acabou de ser instalada, e a que sobrar no fim do prazo vai para a mensagem.
 */
async function restartLoadedService({
  service,
  probe,
  origin,
  latest,
  out,
  err,
}: {
  service: NonNullable<UpgradeDeps["service"]>;
  probe: typeof probePort;
  origin: string;
  latest: string;
  out: (line: string) => void;
  err: (line: string) => void;
}): Promise<number> {
  const restarted = await restartService(service.host, service.identity);
  if (!restarted.ok) {
    err(`a versão nova está instalada, mas o serviço não reiniciou: ${restarted.reason}`);
    err("rode `lumem stop` e `lumem start` para subir a versão nova.");
    return 1;
  }

  let seen = "nenhuma";
  const came = await waitUntil(
    service.host,
    async () => {
      const occupant = await probe({ origin });
      if (occupant.kind !== "lumem") return false;
      seen = `v${occupant.version}`;
      return occupant.version === latest;
    },
    START_TIMEOUT_MS,
  );
  if (!came) {
    err(`o serviço reiniciou, mas o Lumem em ${origin} ainda responde ${seen} e não v${latest}.`);
    err("`lumem logs` mostra o que o daemon escreveu.");
    return 1;
  }

  out(`o serviço reiniciou: o Lumem em ${origin} agora responde v${latest}.`);
  return 0;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Inherits stdio: the installer's own progress is the progress of this command. */
async function runInstall({ command, args }: InstallCommand): Promise<number> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}
