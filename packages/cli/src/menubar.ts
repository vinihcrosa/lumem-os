import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DESKTOP_CONFIG_FILE,
  DESKTOP_PLATFORMS,
  desktopDataDir,
  desktopPackageName,
  desktopPlatformOf,
  detectPackageManager,
  installCommand,
  uninstallCommand,
  type DesktopConfig,
  type DesktopPlatform,
  type InstallCommand,
  type PackageManager,
} from "@lumem/shared";

import type { MenubarAction } from "./args.js";
import { recordedLumemPath, type ServiceHost } from "./service.js";

/**
 * O app de desktop (`038` Parte 4): `lumem menubar install`, `open` e `uninstall`.
 *
 * O app é um pacote npm por plataforma, opt-in, instalado com o gerenciador que é dono
 * da cópia do `lumem` (o mesmo motivo do `upgrade`: um `npm i -g` por cima de uma cópia do
 * pnpm deixa duas). O que este arquivo acrescenta ao gerenciador é o que o npm **não**
 * faz: gravar o que o app precisa saber (`lumem-desktop.json`), pôr o app onde o sistema o
 * acha, e tirar tudo de volta.
 *
 * O sistema entra por `ServiceHost`, como no serviço: o disco, o `ditto`, o `rm`.
 */

const APP_BUNDLE = "Lumem.app";
/** O `.app` viaja dentro do pacote como zip: o npm descarta symlink, e o `.app` vive deles. */
const APP_ZIP = "Lumem.zip";
const LINUX_EXECUTABLE = ["app", "lumem-desktop"] as const;

export interface DesktopDeps {
  out: (line: string) => void;
  err: (line: string) => void;
  host: ServiceHost;
  /** `process.arch`; separado da plataforma do `host` para o teste dizer as duas. */
  arch: string;
  env: NodeJS.ProcessEnv;
  /** A versão do daemon: o app é instalado na mesma, sempre. */
  version: string;
  /** Onde o daemon está, para o app saber a quem perguntar. */
  where: { stateDir: string; origin: string };
  manager?: PackageManager;
  /** Roda o gerenciador de pacotes. @returns o código de saída dele. */
  install: (command: InstallCommand) => Promise<number>;
  /** Sobe um processo solto, sem esperar por ele. */
  launch?: (command: string, args: string[]) => void;
}

interface Layout {
  platform: DesktopPlatform;
  packageName: string;
  /** Onde o gerenciador pôs o pacote do app, ao lado do `lumem`. */
  packageDir: string;
  dataDir: string;
  /** `~/Applications/Lumem.app`; só existe no macOS. */
  macApp: string;
  /** O que se executa para abrir o app. */
  executable: string;
  applicationsEntry: string;
  autostartEntry: string;
}

/**
 * Onde tudo mora, ou `null` quando a máquina não é uma das quatro.
 *
 * O pacote do app fica ao lado do `lumem` em `node_modules/@vinihcrosa/`. Parte-se do
 * caminho **estável** do `lumem` (o que o arquivo de serviço grava, critério 77): sob o
 * pnpm o resolvido tem a versão no caminho, e um `.desktop` que o apontasse quebraria na
 * próxima atualização.
 */
function layoutOf(deps: Pick<DesktopDeps, "host" | "arch" | "env">): Layout | null {
  const { host, arch, env } = deps;
  const platform = desktopPlatformOf(host.platform, arch);
  if (platform === null) return null;

  const scope = dirname(dirname(dirname(recordedLumemPath(host))));
  const packageDir = join(scope, `lumem-desktop-${platform}`);
  const macApp = join(host.home, "Applications", APP_BUNDLE);
  return {
    platform,
    packageName: desktopPackageName(platform),
    packageDir,
    dataDir: desktopDataDir({ platform: host.platform, home: host.home, env }),
    macApp,
    executable:
      host.platform === "darwin"
        ? join(macApp, "Contents", "MacOS", "Lumem")
        : join(packageDir, ...LINUX_EXECUTABLE),
    applicationsEntry: join(host.home, ".local", "share", "applications", "lumem.desktop"),
    autostartEntry: join(host.home, ".config", "autostart", "lumem.desktop"),
  };
}

function refuse({ host, arch, err }: Pick<DesktopDeps, "host" | "arch" | "err">): number {
  err(`o app de desktop não existe para ${host.platform}-${arch}. Plataformas com app:`);
  for (const platform of DESKTOP_PLATFORMS) err(`  ${platform}`);
  return 1;
}

export async function menubar(action: MenubarAction, deps: DesktopDeps): Promise<number> {
  const layout = layoutOf(deps);
  if (layout === null) return refuse(deps);

  if (action === "install") return await installDesktop(deps, layout);
  if (action === "open") return openDesktop(deps, layout);
  return await uninstallDesktop(deps, layout);
}

async function installDesktop(deps: DesktopDeps, layout: Layout): Promise<number> {
  const { out, err, host, version, where, install } = deps;
  const command = installCommand(managerOf(deps), `${layout.packageName}@${version}`);

  out(`instalando o app do Lumem: v${version}`);
  out(`$ ${command.command} ${command.args.join(" ")}`);
  const code = await runManager(install, command, err);
  if (code !== 0) {
    err(`o ${command.command} saiu com ${String(code)}; o app não foi instalado.`);
    return code;
  }
  if (!host.exists(layout.packageDir)) {
    err(`o ${command.command} instalou, mas o pacote não está em ${layout.packageDir}.`);
    return 1;
  }

  const config: DesktopConfig = {
    node: host.nodePath,
    lumem: recordedLumemPath(host),
    stateDir: where.stateDir,
    origin: where.origin,
    path: host.path,
  };
  host.write(join(layout.dataDir, DESKTOP_CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`);

  const placed = await placeApp(host, layout);
  if (placed !== null) {
    err(placed);
    return 1;
  }

  // macOS abre pelo LaunchServices (registro do app e do item de login); o Linux, o binário.
  const launch = deps.launch ?? spawnDetached;
  if (host.platform === "darwin") launch("open", [layout.macApp]);
  else launch(layout.executable, []);

  out(
    host.platform === "darwin"
      ? `app em ${layout.macApp}; o ícone está na barra de menus.`
      : `app instalado; o ícone está na bandeja e o autostart está ligado.`,
  );
  return 0;
}

/** `lumem upgrade` com o app instalado: o mesmo pacote, na versão nova (AC 56). */
export async function takeDesktopAlong(
  deps: Omit<DesktopDeps, "where">,
): Promise<number> {
  const layout = layoutOf(deps);
  const { out, err, host, version } = deps;
  if (layout === null || !host.exists(layout.packageDir)) return 0;

  const command = installCommand(managerOf(deps), `${layout.packageName}@${version}`);
  out(`o app do Lumem vai junto: v${version}`);
  out(`$ ${command.command} ${command.args.join(" ")}`);
  const code = await runManager(deps.install, command, err);
  if (code !== 0) {
    err(`o ${command.command} saiu com ${String(code)}; o app continua na versão de antes.`);
    return code;
  }

  const placed = await placeApp(host, layout);
  if (placed !== null) {
    err(placed);
    return 1;
  }
  out("app atualizado.");
  return 0;
}

/** macOS: descompacta o `.app` em `~/Applications`. Linux: escreve os dois `.desktop`. */
async function placeApp(host: ServiceHost, layout: Layout): Promise<string | null> {
  if (host.platform !== "darwin") {
    host.write(layout.applicationsEntry, desktopEntry(layout, ["--panel"]));
    host.write(layout.autostartEntry, desktopEntry(layout, [], "X-GNOME-Autostart-enabled=true\n"));
    return null;
  }

  const applications = dirname(layout.macApp);
  host.mkdir(applications);
  // Sem isto o `ditto` mescla o `.app` novo por cima do velho, e um arquivo que a
  // versão nova não tem mais fica dentro do bundle e invalida a assinatura.
  await host.exec("rm", ["-rf", layout.macApp]);
  const unzip = await host.exec("ditto", ["-x", "-k", join(layout.packageDir, APP_ZIP), applications]);
  if (unzip.code === 0) return null;
  return `não consegui copiar o app para ${layout.macApp}: ${unzip.stderr.trim() || `ditto saiu com ${String(unzip.code)}`}`;
}

/** Uma palavra de `Exec=`, entre aspas: o caminho pode ter espaço, e `$` e `` ` `` são sintaxe. */
function execWord(word: string): string {
  return `"${word.replace(/(["`$\\])/g, "\\$1")}"`;
}

function desktopEntry(layout: Layout, args: readonly string[], extra = ""): string {
  const exec = [execWord(layout.executable), ...args].join(" ");
  return `[Desktop Entry]
Type=Application
Name=Lumem
Comment=O painel do Lumem
Exec=${exec}
Icon=${join(layout.packageDir, "icon.png")}
Terminal=false
Categories=Development;
StartupWMClass=Lumem
${extra}`;
}

function openDesktop(deps: DesktopDeps, layout: Layout): number {
  const { err, host } = deps;
  if (!host.exists(layout.packageDir) || (host.platform === "darwin" && !host.exists(layout.macApp))) {
    err("o app de desktop não está instalado. Rode `lumem menubar install`.");
    return 1;
  }
  // O binário, e não `open`: com o app já rodando o `open` só o traz para a frente, e o
  // `--panel` chega à instância viva pelo `second-instance` do Electron.
  (deps.launch ?? spawnDetached)(layout.executable, ["--panel"]);
  return 0;
}

async function uninstallDesktop(deps: DesktopDeps, layout: Layout): Promise<number> {
  const { out, err, host, install } = deps;
  const command = uninstallCommand(managerOf(deps), layout.packageName);

  out(`$ ${command.command} ${command.args.join(" ")}`);
  const code = await runManager(install, command, err);
  if (code !== 0) {
    err(`o ${command.command} saiu com ${String(code)}; o app continua instalado.`);
    return code;
  }

  if (host.platform === "darwin") {
    // O item de login é do próprio app (`setLoginItemSettings`): quem o tira é ele, e
    // tem de ser antes de o `.app` sumir.
    if (host.exists(layout.macApp)) await host.exec(layout.executable, ["--uninstall"]);
    await host.exec("rm", ["-rf", layout.macApp]);
  } else {
    // No Linux o item de login é o próprio `.desktop` do autostart.
    host.remove(layout.applicationsEntry);
    host.remove(layout.autostartEntry);
  }
  await host.exec("rm", ["-rf", layout.dataDir]);

  out("app do Lumem removido.");
  return 0;
}

function managerOf(deps: Pick<DesktopDeps, "manager">): PackageManager {
  return deps.manager ?? detectPackageManager(fileURLToPath(import.meta.url));
}

async function runManager(
  install: (command: InstallCommand) => Promise<number>,
  command: InstallCommand,
  err: (line: string) => void,
): Promise<number> {
  try {
    return await install(command);
  } catch (error) {
    err(`não consegui rodar o ${command.command}: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

function spawnDetached(command: string, args: string[]): void {
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    // Sem isto um binário que não existe derruba o CLI com um `error` sem dono.
    child.on("error", () => {});
    child.unref();
  } catch {
    // O app é um extra: não abrir não é motivo para falhar o que já foi instalado.
  }
}
