import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * O Lumem como serviço do sistema (`038` Parte 1).
 *
 * O daemon é um processo comum que precisa de alguém que o **reponha**: o
 * launchd no macOS e o `systemd --user` no Linux. O que este arquivo faz é
 * escrever o arquivo de serviço, carregá-lo e descarregá-lo — e nada mais. Quem
 * roda o daemon continua sendo `lumem run`, que o arquivo de serviço chama.
 *
 * Tudo que toca o sistema entra por `ServiceHost`: `launchctl`, `systemctl`, o
 * disco, o relógio. É assim que a suíte prova o **conteúdo** do arquivo e a
 * **ordem** dos comandos sem nenhum supervisor de verdade — e é o que o
 * `pnpm smoke:service` exercita de verdade, numa máquina de quem verifica.
 */

/** O rótulo do launchd e o nome do arquivo (porta 2 da `038`). */
export const SERVICE_LABEL = "tech.cazimi.lumem";
export const SYSTEMD_UNIT = "lumem.service";

/** Quanto `lumem start` espera o `/trpc/health` e quanto `lumem stop` espera ele calar. */
export const START_TIMEOUT_MS = 15_000;
export const STOP_TIMEOUT_MS = 10_000;
const POLL_MS = 250;

export interface ExecResult {
  /** `127` quando o comando nem nasceu (não existe na máquina). */
  code: number;
  stdout: string;
  stderr: string;
}

export interface ServiceHost {
  platform: NodeJS.Platform;
  uid: number;
  home: string;
  /** O `node` absoluto que roda o `lumem` de agora. */
  nodePath: string;
  /** O `bin/lumem.mjs` absoluto de agora. */
  lumemPath: string;
  /** O `PATH` de **quem chamou** — o launchd e o systemd não herdam o do terminal. */
  path: string;
  exec(command: string, args: readonly string[]): Promise<ExecResult>;
  /** `null` quando o arquivo não existe. */
  read(path: string): string | null;
  /** Escreve, criando o que faltar do diretório. */
  write(path: string, content: string): void;
  mkdir(path: string): void;
  remove(path: string): void;
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface ServiceIdentity {
  label: string;
  unit: string;
}

/**
 * O rótulo e a unit, com dois ganchos de **teste**.
 *
 * `LUMEM_SERVICE_LABEL` e `LUMEM_SERVICE_UNIT` existem para o `smoke:service`
 * subir um serviço descartável sem tocar num `tech.cazimi.lumem` de verdade. O
 * padrão é o da porta 2 e ninguém deveria precisar dos ganchos.
 */
export function serviceIdentity(env: NodeJS.ProcessEnv): ServiceIdentity {
  return {
    label: env["LUMEM_SERVICE_LABEL"] || SERVICE_LABEL,
    unit: env["LUMEM_SERVICE_UNIT"] || SYSTEMD_UNIT,
  };
}

export interface ServiceSpec extends ServiceIdentity {
  stateDir: string;
  /**
   * O que a pessoa pediu na linha de `lumem start`, e só isso.
   *
   * O serviço executa `lumem run` sem argumento, então `--port` e companhia só
   * chegam ao daemon pelo ambiente do arquivo. O que não foi pedido não entra:
   * um padrão gravado ali seria um padrão que o próximo `lumem start` não muda.
   */
  env: Record<string, string>;
}

export type Supervisor = "launchd" | "systemd";

export function supervisorOf(platform: NodeJS.Platform): Supervisor | null {
  if (platform === "darwin") return "launchd";
  if (platform === "linux") return "systemd";
  return null;
}

export function daemonLogPath(stateDir: string): string {
  return join(stateDir, "daemon.log");
}

export function serviceFilePath(host: ServiceHost, spec: ServiceIdentity): string {
  return supervisorOf(host.platform) === "launchd"
    ? join(host.home, "Library", "LaunchAgents", `${spec.label}.plist`)
    : join(host.home, ".config", "systemd", "user", spec.unit);
}

function xml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderPlist(host: ServiceHost, spec: ServiceSpec): string {
  const environment = { PATH: host.path, ...spec.env, LUMEM_SUPERVISOR: "launchd" };
  const log = xml(daemonLogPath(spec.stateDir));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(spec.label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(host.nodePath)}</string>
    <string>${xml(host.lumemPath)}</string>
    <string>run</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${Object.entries(environment)
  .map(([key, value]) => `    <key>${xml(key)}</key>\n    <string>${xml(value)}</string>`)
  .join("\n")}
  </dict>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${log}</string>
  <key>StandardErrorPath</key>
  <string>${log}</string>
</dict>
</plist>
`;
}

/**
 * Um argumento de `ExecStart=`, entre aspas quando precisa.
 *
 * `%` e `$` são sintaxe do systemd (especificador e substituição de ambiente), e
 * um caminho com espaço vira dois argumentos sem as aspas.
 */
function unitWord(word: string): string {
  const escaped = word.replace(/%/g, "%%").replace(/\$/g, "$$$$");
  return /[\s"'\\]/.test(escaped) ? `"${escaped.replace(/(["\\])/g, "\\$1")}"` : escaped;
}

/** `Environment=NOME=valor`, com as aspas do systemd só quando o valor as pede. */
function unitEnvironment(key: string, value: string): string {
  const escaped = value.replace(/%/g, "%%");
  const assignment = `${key}=${escaped}`;
  return /[\s"'\\]/.test(assignment)
    ? `Environment="${assignment.replace(/(["\\])/g, "\\$1")}"`
    : `Environment=${assignment}`;
}

function renderUnit(host: ServiceHost, spec: ServiceSpec): string {
  const environment = { PATH: host.path, ...spec.env, LUMEM_SUPERVISOR: "systemd" };
  const log = `append:${daemonLogPath(spec.stateDir)}`;
  return `[Unit]
Description=Lumem

[Service]
ExecStart=${unitWord(host.nodePath)} ${unitWord(host.lumemPath)} run
${Object.entries(environment)
  .map(([key, value]) => unitEnvironment(key, value))
  .join("\n")}
Restart=always
RestartSec=2
StandardOutput=${log}
StandardError=${log}

[Install]
WantedBy=default.target
`;
}

/** O conteúdo que `lumem start` escreveria agora. */
export function renderService(host: ServiceHost, spec: ServiceSpec): string {
  return supervisorOf(host.platform) === "launchd" ? renderPlist(host, spec) : renderUnit(host, spec);
}

/** O arquivo em disco já é o que `lumem start` escreveria agora? */
export function isCurrent(host: ServiceHost, spec: ServiceSpec): boolean {
  return host.read(serviceFilePath(host, spec)) === renderService(host, spec);
}

const domain = (host: ServiceHost) => `gui/${String(host.uid)}`;

/** O supervisor responde nesta sessão? É o que separa "tem launchd" de "tem launchd **aqui**". */
async function supervisorAnswers(host: ServiceHost): Promise<boolean> {
  const supervisor = supervisorOf(host.platform);
  if (supervisor === "launchd") return (await host.exec("launchctl", ["print", domain(host)])).code === 0;
  if (supervisor === "systemd") {
    return (await host.exec("systemctl", ["--user", "show-environment"])).code === 0;
  }
  return false;
}

/** O serviço está carregado (launchd) ou ativo (systemd)? */
export async function isLoaded(host: ServiceHost, identity: ServiceIdentity): Promise<boolean> {
  const supervisor = supervisorOf(host.platform);
  if (supervisor === "launchd") {
    return (await host.exec("launchctl", ["print", `${domain(host)}/${identity.label}`])).code === 0;
  }
  if (supervisor === "systemd") {
    return (await host.exec("systemctl", ["--user", "is-active", identity.unit])).code === 0;
  }
  return false;
}

export type InstallResult = { ok: true; file: string } | { ok: false; reason: string };

function failure(step: string, result: ExecResult): InstallResult {
  const detail = result.stderr.trim() || result.stdout.trim() || `saiu com ${String(result.code)}`;
  return { ok: false, reason: `${step} falhou: ${detail}` };
}

/**
 * Escreve o arquivo de serviço de agora e o carrega.
 *
 * Reescreve **sempre**, antes de carregar: `nvm use`, uma versão nova do Node ou
 * um `PATH` diferente deixam o arquivo da última vez apontando para um `node`
 * que já não está lá. Quem já está carregado é descarregado (launchd) ou
 * reiniciado (systemd) — o ambiente novo só vale para um processo novo.
 */
export async function installService(host: ServiceHost, spec: ServiceSpec): Promise<InstallResult> {
  const supervisor = supervisorOf(host.platform);
  if (supervisor === null) {
    return {
      ok: false,
      reason: `não há supervisor para ${host.platform}; use \`lumem run\` para rodar em primeiro plano.`,
    };
  }
  if (!(await supervisorAnswers(host))) {
    const which =
      supervisor === "launchd"
        ? "o launchd não responde nesta sessão (é preciso uma sessão gráfica de usuário)"
        : "o `systemctl --user` não responde";
    return { ok: false, reason: `${which}; use \`lumem run\` para rodar em primeiro plano.` };
  }

  const loaded = await isLoaded(host, spec);
  const file = serviceFilePath(host, spec);
  // O launchd não cria o diretório do log, e sem ele o serviço nem sobe.
  host.mkdir(spec.stateDir);
  host.write(file, renderService(host, spec));

  if (supervisor === "launchd") {
    if (loaded) await host.exec("launchctl", ["bootout", `${domain(host)}/${spec.label}`]);
    const bootstrap = await host.exec("launchctl", ["bootstrap", domain(host), file]);
    return bootstrap.code === 0 ? { ok: true, file } : failure("`launchctl bootstrap`", bootstrap);
  }

  const reload = await host.exec("systemctl", ["--user", "daemon-reload"]);
  if (reload.code !== 0) return failure("`systemctl --user daemon-reload`", reload);
  const enable = await host.exec("systemctl", ["--user", "enable", "--now", spec.unit]);
  if (enable.code !== 0) return failure("`systemctl --user enable --now`", enable);
  if (loaded) {
    const restart = await host.exec("systemctl", ["--user", "restart", spec.unit]);
    if (restart.code !== 0) return failure("`systemctl --user restart`", restart);
  }
  return { ok: true, file };
}

export type StopResult = { ok: true } | { ok: false; reason: string };

/** Chama `check` até dar `true` ou estourar `timeoutMs`; devolve se deu. */
export async function waitUntil(
  host: ServiceHost,
  check: () => Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = host.now() + timeoutMs;
  for (;;) {
    if (await check()) return true;
    if (host.now() >= deadline) return false;
    await host.sleep(POLL_MS);
  }
}

/**
 * Para o serviço e o tira do login.
 *
 * *Parar* que volta no próximo login surpreende, então o macOS perde o plist e o
 * Linux perde o `enable`; o próximo `lumem start` os recria. O que decide o
 * resultado não é o `launchctl` ter saído 0, é o daemon ter **calado**.
 */
export async function stopService(
  host: ServiceHost,
  spec: ServiceSpec,
  isUp: () => Promise<boolean>,
): Promise<StopResult> {
  const supervisor = supervisorOf(host.platform);
  const loaded = await isLoaded(host, spec);
  if (!loaded && (await isUp())) {
    return {
      ok: false,
      reason:
        "o Lumem que responde não roda como serviço; pare-o onde ele roda (Ctrl-C no terminal do `lumem run`).",
    };
  }

  if (supervisor === "launchd") {
    await host.exec("launchctl", ["bootout", `${domain(host)}/${spec.label}`]);
    host.remove(serviceFilePath(host, spec));
  } else if (supervisor === "systemd") {
    await host.exec("systemctl", ["--user", "disable", "--now", spec.unit]);
  }

  const stopped = await waitUntil(host, async () => !(await isUp()), STOP_TIMEOUT_MS);
  return stopped
    ? { ok: true }
    : { ok: false, reason: `o Lumem ainda responde depois de ${String(STOP_TIMEOUT_MS / 1_000)} s.` };
}

/** O `ServiceHost` da máquina de verdade. */
export function nodeServiceHost(env: NodeJS.ProcessEnv, lumemPath: string): ServiceHost {
  return {
    platform: process.platform,
    uid: process.getuid?.() ?? 0,
    home: homedir(),
    nodePath: process.execPath,
    lumemPath,
    path: env["PATH"] ?? "",
    exec: (command, args) =>
      new Promise((resolve) => {
        execFile(command, [...args], { encoding: "utf8" }, (error, stdout, stderr) => {
          if (error === null) return resolve({ code: 0, stdout, stderr });
          const code = typeof error.code === "number" ? error.code : 127;
          resolve({ code, stdout, stderr: stderr === "" ? error.message : stderr });
        });
      }),
    read: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return null;
      }
    },
    write: (path, content) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    },
    mkdir: (path) => {
      mkdirSync(path, { recursive: true });
    },
    remove: (path) => {
      rmSync(path, { force: true });
    },
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
