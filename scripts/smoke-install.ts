/**
 * Installs the tarball and proves it runs. The gate the release cannot skip.
 *
 * Every way this packaging breaks is invisible to typecheck, to vitest and to
 * the e2e, because all three run against the repository: a dependency that does
 * `require()` at load time, a migration left out of `files`, a native prebuild
 * missing for the platform, a bin path that points at nothing. They all show up
 * for the first time on a machine that ran `npm i -g lumem` — unless something
 * does that first, which is this.
 *
 * Deliberately not a vitest test: it installs globally (into a throwaway prefix)
 * and binds a port, and it has to be runnable on a bare runner as one command.
 */
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { desktopPlatformOf } from "../packages/shared/src/desktop.js";
import { menubar } from "../packages/cli/src/menubar.js";
import { nodeServiceHost } from "../packages/cli/src/service.js";
import { tarballName } from "../packages/desktop/src/packaging.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const packageRoot = join(repoRoot, "packages", "cli");

/** A port nobody else on this machine is likely to want. */
const PORT = 4_397;
const ORIGIN = `http://127.0.0.1:${String(PORT)}`;

/**
 * How the installed binary is started: in the foreground, with `run`.
 *
 * Bare `lumem` is `lumem start` since the `038`, which installs a launchd or
 * systemd service and returns — a child this script could neither wait on nor
 * kill, and one that would touch the service of whoever runs it.
 */
export function installedStartArgs(port: number): string[] {
  return ["run", "--port", String(port)];
}

function step(message: string): void {
  console.log(`\n▸ ${message}`);
}

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

async function waitForListening(daemon: ChildProcess, output: () => string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (daemon.exitCode !== null) {
      throw new Error(`o daemon morreu com código ${String(daemon.exitCode)}:\n${output()}`);
    }
    try {
      const response = await fetch(`${ORIGIN}/trpc/health`);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`o daemon não atendeu em 60s:\n${output()}`);
}

const STEPS = ["desktop"] as const;
type Only = (typeof STEPS)[number];

export interface SmokeArgs {
  /** Um passo só, em vez do pacote do daemon. */
  only: Only | null;
  /** O tarball a testar, em vez de empacotar um. */
  tarball: string | null;
}

/**
 * `smoke-install.ts [--only desktop] [tarball]`.
 *
 * O tarball posicional é o que o `release.yml` passa desde a 014, e continua valendo; o
 * `--only` é da `038`, e escolhe o app de desktop no lugar do daemon.
 */
export function parseSmokeArgs(argv: readonly string[]): SmokeArgs {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: { only: { type: "string" } },
  });
  const only = values.only;
  if (only !== undefined && !STEPS.some((known) => known === only)) {
    throw new Error(`--only ${only}: os passos que existem são ${STEPS.join(", ")}`);
  }
  return { only: (only as Only | undefined) ?? null, tarball: positionals[0] ?? null };
}

/**
 * A tarball to test instead of building one.
 *
 * The release passes the artefact it is about to publish, which is the only way
 * the smoke proves anything about *that* file rather than about a rebuild of the
 * same source — they are supposed to be identical, and the whole point of this
 * script is to stop supposing.
 */
let given: string | undefined;

async function main(): Promise<void> {
  const prefix = mkdtempSync(join(tmpdir(), "lumem-prefix-"));
  const stateDir = mkdtempSync(join(tmpdir(), "lumem-smoke-state-"));
  let daemon: ChildProcess | undefined;
  let output = "";

  try {
    let tarball: string;
    if (given === undefined) {
      step("empacotando");
      // `npm pack` runs `prepack`, which builds. Publishing without the assets is
      // therefore not something this script can accidentally bless.
      run("npm", ["pack", "--pack-destination", prefix], packageRoot);
      const packed = readdirSync(prefix).find((name) => name.endsWith(".tgz"));
      if (packed === undefined) throw new Error("npm pack não escreveu tarball nenhum");
      tarball = join(prefix, packed);
    } else {
      step("usando o tarball recebido");
      tarball = resolve(given);
    }
    console.log(`  ${tarball}`);

    step("instalando num prefixo descartável");
    run("npm", ["install", "--global", "--prefix", prefix, tarball], prefix);

    step("subindo o binário instalado");
    const binary = join(prefix, "bin", "lumem");
    daemon = spawn(binary, installedStartArgs(PORT), {
      env: { ...process.env, LUMEM_STATE_DIR: stateDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const collect = (chunk: Buffer): void => {
      output += chunk.toString();
    };
    daemon.stdout?.on("data", collect);
    daemon.stderr?.on("data", collect);

    await waitForListening(daemon, () => output);

    step("a interface");
    const page = await fetch(ORIGIN);
    const html = await page.text();
    if (!page.ok || !html.includes("<!doctype html>")) {
      throw new Error(`GET / devolveu ${String(page.status)} e não parece HTML:\n${html.slice(0, 200)}`);
    }
    console.log(`  ${String(page.status)} ${page.headers.get("content-type") ?? ""}`);

    step("o daemon");
    const health = await fetch(`${ORIGIN}/trpc/health`);
    const body = (await health.json()) as { result?: { data?: { ok?: boolean; version?: string } } };
    if (body.result?.data?.ok !== true) {
      throw new Error(`/trpc/health respondeu algo que não é um Lumem: ${JSON.stringify(body)}`);
    }
    console.log(`  v${body.result.data.version ?? "?"}`);

    console.log("\n✓ o pacote instala e sobe");
  } finally {
    daemon?.kill("SIGTERM");
    rmSync(prefix, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  }
}

/**
 * O app de desktop (`038`, AC 69), instalado do tarball e posto onde o CLI o poria.
 *
 * O que só instalar de verdade mostra, e que nenhum teste de unidade alcança: o zip do
 * macOS **preserva os symlinks** que o npm descartaria de um `.app` solto (é a
 * assinatura que o diz), o app **não chega em quarentena** — a suposição do ADR de
 * 2026-09-29-2003, que decide se a Developer ID entra — e, no Linux, o binário abre uma
 * janela que carrega `/menubar`.
 *
 * O CLI é o **de verdade**: `menubar install` é chamado com um `ServiceHost` que só troca a
 * casa por uma pasta descartável, então a cópia para `~/Applications` e os `.desktop` são o
 * código que o usuário roda — e não uma segunda cópia dele aqui.
 */
async function smokeDesktop(tarballArg: string | undefined): Promise<void> {
  const key = desktopPlatformOf(process.platform, process.arch);
  if (key === null) throw new Error(`não há app de desktop para ${process.platform}-${process.arch}`);

  const scratch = mkdtempSync(join(tmpdir(), "lumem-desktop-smoke-"));
  const prefix = join(scratch, "prefix");
  const home = join(scratch, "home");
  let app: ChildProcess | undefined;
  let server: ReturnType<typeof createServer> | undefined;

  try {
    let tarball: string;
    if (tarballArg === undefined) {
      step("empacotando o app");
      const [platform, arch] = key.split("-") as [string, string];
      run("pnpm", ["--filter", "@lumem/desktop", "run", "pack", "--platform", platform, "--arch", arch], repoRoot);
      const version = (JSON.parse(readFileSync(join(repoRoot, "packages", "desktop", "package.json"), "utf8")) as { version: string }).version;
      tarball = join(repoRoot, "packages", "desktop", "release", key, tarballName(key, version));
    } else {
      step("usando o tarball recebido");
      tarball = resolve(tarballArg);
    }
    console.log(`  ${tarball}`);

    step("instalando o pacote num prefixo descartável");
    run("npm", ["install", "--global", "--prefix", prefix, tarball], scratch);

    // O daemon de mentira que o app consulta: `health`, `status` e a página do painel. O que o
    // Linux confere é que a janela **pediu** `/menubar`.
    const asked: string[] = [];
    server = createServer((request, response) => {
      const path = request.url ?? "";
      asked.push(path);
      response.setHeader("content-type", path.startsWith("/trpc") ? "application/json" : "text/html");
      if (path.startsWith("/trpc/health")) {
        response.end(JSON.stringify({ result: { data: { ok: true, version: "0.0.0", supervised: false, protocolVersion: 1 } } }));
      } else if (path.startsWith("/trpc/system.status")) {
        response.end(JSON.stringify({ result: { data: { attention: false, updateAvailable: false } } }));
      } else {
        response.end("<!doctype html><title>Lumem</title><p>painel</p>");
      }
    });
    await new Promise<void>((done) => server?.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("o servidor de mentira não abriu");
    const origin = `http://127.0.0.1:${String(address.port)}`;

    step("posto onde `lumem menubar install` o poria");
    const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config") };
    const lumem = join(prefix, "lib", "node_modules", "@vinihcrosa", "lumem-os", "bin", "lumem.mjs");
    const lines: string[] = [];
    const code = await menubar("install", {
      out: (line) => lines.push(line),
      err: (line) => lines.push(line),
      host: { ...nodeServiceHost(env, lumem), home },
      arch: process.arch,
      env,
      version: "smoke",
      where: { stateDir: join(home, ".lumem"), origin },
      manager: "npm",
      // O pacote já foi instalado acima, do tarball; instalar `@smoke` do registry seria outro teste.
      install: async () => 0,
      launch: () => {},
    });
    console.log(lines.map((line) => `  ${line}`).join("\n"));
    if (code !== 0) throw new Error(`lumem menubar install saiu com ${String(code)}`);

    if (process.platform === "darwin") {
      const bundle = join(home, "Applications", "Lumem.app");

      step("a assinatura (codesign --verify)");
      const verify = spawnSync("codesign", ["--verify", "--deep", "--strict", bundle], { encoding: "utf8" });
      if (verify.status !== 0) throw new Error(`codesign --verify saiu com ${String(verify.status)}:\n${verify.stderr}`);
      console.log("  ad-hoc, e confere");

      step("sem quarentena");
      const attributes = spawnSync("xattr", ["-lr", bundle], { encoding: "utf8" }).stdout;
      if (attributes.includes("com.apple.quarantine")) {
        throw new Error(
          "o app chegou em quarentena: o Gatekeeper vai barrá-lo, e a decisão de assinar com Developer ID (D2) precisa voltar",
        );
      }
      console.log("  nenhum com.apple.quarantine");
    } else {
      step("o app sob xvfb");
      const executable = join(prefix, "lib", "node_modules", "@vinihcrosa", `lumem-desktop-${key}`, "app", "lumem-desktop");
      // `--no-sandbox` só aqui: o runner não deixa o Chromium criar o sandbox de usuário, e o
      // que este passo prova é que o pacote abre e carrega a página — não a trava de janelas.
      app = spawn("xvfb-run", ["-a", executable, "--panel", "--no-sandbox"], {
        env,
        stdio: "ignore",
        detached: true,
      });
      const deadline = Date.now() + 60_000;
      while (!asked.includes("/menubar") && Date.now() < deadline) await new Promise((wait) => setTimeout(wait, 250));
      if (!asked.includes("/menubar")) throw new Error(`nenhuma janela pediu /menubar em 60 s; o app pediu: ${asked.join(", ") || "nada"}`);
      console.log("  a janela carregou /menubar");
    }

    console.log("\n✓ o app instala e confere");
  } finally {
    if (app?.pid !== undefined) {
      try {
        process.kill(-app.pid, "SIGTERM");
      } catch {
        // Já saiu.
      }
    }
    server?.close();
    rmSync(scratch, { recursive: true, force: true });
  }
}

// Not on import: the test reads `installedStartArgs` and must not install anything.
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = parseSmokeArgs(process.argv.slice(2));
  given = args.tarball ?? undefined;
  if (args.only === "desktop") await smokeDesktop(given);
  else await main();
}
