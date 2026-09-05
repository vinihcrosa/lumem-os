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
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const packageRoot = join(repoRoot, "packages", "cli");

/** A port nobody else on this machine is likely to want. */
const PORT = 4_397;
const ORIGIN = `http://127.0.0.1:${String(PORT)}`;

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

/**
 * A tarball to test instead of building one.
 *
 * The release passes the artefact it is about to publish, which is the only way
 * the smoke proves anything about *that* file rather than about a rebuild of the
 * same source — they are supposed to be identical, and the whole point of this
 * script is to stop supposing.
 */
const given = process.argv[2];

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
    daemon = spawn(binary, ["--port", String(PORT)], {
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

await main();
