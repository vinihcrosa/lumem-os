/**
 * O serviço de verdade: instala o tarball e roda `lumem start` contra o launchd
 * ou o `systemd --user` desta máquina (`038` Parte 1).
 *
 *     pnpm smoke:service                     os passos, um depois do outro
 *     pnpm smoke:service --only <passo>      um só
 *
 * Passos: `start-waits-for-health`, `stop-leaves-nothing`, `survives-the-caller`.
 * (`update-relaunches` é da fatia S2 da `038` e ainda não existe.)
 *
 * **Não roda no CI, e de propósito.** Os runners não têm sessão de usuário do
 * launchd nem do systemd, então `lumem start` recusaria lá — que é o
 * comportamento certo, e por isso o que o script prova só se prova na máquina de
 * quem verifica. Os testes de unidade do escritor de serviço provam o conteúdo
 * do arquivo e a ordem dos comandos; este prova que o sistema **aceita** o
 * arquivo, e que o daemon sobrevive a quem o subiu.
 *
 * **Nunca toca o serviço de verdade de quem o roda.** Rótulo, unit, porta e
 * state dir são descartáveis, e o script recusa rodar se o rótulo for o de
 * produção. Os ganchos são as variáveis que o escritor de serviço lê:
 *
 *   LUMEM_SERVICE_LABEL   `tech.cazimi.lumem-smoke`   (o padrão é `tech.cazimi.lumem`)
 *   LUMEM_SERVICE_UNIT    `lumem-smoke.service`       (o padrão é `lumem.service`)
 *
 * Tudo é desfeito no fim, **inclusive quando um passo falha**: `lumem stop` e,
 * se ele não bastou, o desmonte à mão do serviço, do arquivo e dos diretórios.
 */
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const packageRoot = join(repoRoot, "packages", "cli");

// `string` e não o literal: a comparação com o rótulo de produção, mais abaixo, é o guarda.
const LABEL: string = "tech.cazimi.lumem-smoke";
const UNIT = "lumem-smoke.service";
const PRODUCTION_LABEL = "tech.cazimi.lumem";
/** Uma porta que nem o dev (4317/4318) nem o `smoke:install` (4397) usam. */
const PORT = 4_398;
const ORIGIN = `http://127.0.0.1:${String(PORT)}`;

const STEP_NAMES = ["start-waits-for-health", "stop-leaves-nothing", "survives-the-caller"] as const;
type StepName = (typeof STEP_NAMES)[number];

function step(message: string): void {
  console.log(`\n▸ ${message}`);
}

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) fail(message);
}

interface Sandbox {
  prefix: string;
  stateDir: string;
  binary: string;
  env: NodeJS.ProcessEnv;
}

interface Result {
  code: number;
  output: string;
}

/** Roda um comando até o fim e devolve o código, sem lançar por saída diferente de 0. */
function exec(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<Result> {
  return new Promise((done) => {
    execFile(command, args, { env, encoding: "utf8" }, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === "number" ? error.code : 127;
      done({ code, output: `${stdout}${stderr}` });
    });
  });
}

function lumem(sandbox: Sandbox, args: string[]): Promise<Result> {
  return exec(sandbox.binary, args, sandbox.env);
}

async function readHealth(): Promise<{ ok?: boolean; version?: string; supervised?: boolean } | null> {
  try {
    const response = await fetch(`${ORIGIN}/trpc/health`, { signal: AbortSignal.timeout(1_500) });
    if (!response.ok) return null;
    const body = (await response.json()) as { result?: { data?: { ok?: boolean; version?: string; supervised?: boolean } } };
    return body.result?.data ?? null;
  } catch {
    return null;
  }
}

/** Sobe o que estiver de pé no fim de um passo e devolve a máquina ao que era. */
async function reset(sandbox: Sandbox): Promise<void> {
  await lumem(sandbox, ["stop"]);
}

const plistPath = () => join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const unitPath = () => join(homedir(), ".config", "systemd", "user", UNIT);

async function serviceIsLoaded(): Promise<boolean> {
  if (process.platform === "darwin") {
    const uid = String(process.getuid?.() ?? 0);
    return (await exec("launchctl", ["print", `gui/${uid}/${LABEL}`])).code === 0;
  }
  return (await exec("systemctl", ["--user", "is-enabled", UNIT])).code === 0;
}

/** O desmonte que não depende do `lumem stop` ter funcionado — é o que ele pode estar provando. */
async function teardown(): Promise<void> {
  if (process.platform === "darwin") {
    const uid = String(process.getuid?.() ?? 0);
    await exec("launchctl", ["bootout", `gui/${uid}/${LABEL}`]);
    rmSync(plistPath(), { force: true });
    return;
  }
  await exec("systemctl", ["--user", "disable", "--now", UNIT]);
  rmSync(unitPath(), { force: true });
  await exec("systemctl", ["--user", "daemon-reload"]);
}

async function stepStartWaitsForHealth(sandbox: Sandbox): Promise<void> {
  step("start-waits-for-health");
  const started = await lumem(sandbox, ["start"]);
  assert(started.code === 0, `lumem start saiu ${String(started.code)}:\n${started.output}`);

  // Sem nenhuma espera do script: se `start` saiu antes de o daemon responder,
  // esta pergunta é a que pega.
  const health = await readHealth();
  assert(health?.ok === true, "lumem start saiu 0, mas /trpc/health não respondeu logo em seguida");
  console.log(`  saiu 0 e o health já respondia (v${health.version ?? "?"})`);
  await reset(sandbox);
}

async function stepStopLeavesNothing(sandbox: Sandbox): Promise<void> {
  step("stop-leaves-nothing");
  const started = await lumem(sandbox, ["start"]);
  assert(started.code === 0, `lumem start saiu ${String(started.code)}:\n${started.output}`);
  assert(await serviceIsLoaded(), "o serviço não ficou carregado depois do start");

  const stopped = await lumem(sandbox, ["stop"]);
  assert(stopped.code === 0, `lumem stop saiu ${String(stopped.code)}:\n${stopped.output}`);

  assert((await readHealth()) === null, "o daemon ainda responde depois do stop");
  assert(!(await serviceIsLoaded()), "o serviço continua carregado depois do stop");
  if (process.platform === "darwin") {
    assert(!existsSync(plistPath()), `o plist continua em ${plistPath()}: voltaria no próximo login`);
  }
  const status = await lumem(sandbox, ["status"]);
  assert(status.code === 3, `lumem status depois do stop deveria sair 3, saiu ${String(status.code)}`);
  console.log("  parou, descarregou e não deixou item de login");
}

/**
 * O chamador é **outro processo**, que sobe o serviço e morre: é isso que
 * "fechar o terminal" é. O daemon que sobra tem de continuar respondendo, e
 * respondendo `supervised: true`.
 */
async function stepSurvivesTheCaller(sandbox: Sandbox): Promise<void> {
  step("survives-the-caller");
  const caller = await exec(
    process.execPath,
    ["-e", "require('node:child_process').execFileSync(process.argv[1], ['start'], { stdio: 'inherit' })", sandbox.binary],
    sandbox.env,
  );
  assert(caller.code === 0, `o processo chamador saiu ${String(caller.code)}:\n${caller.output}`);

  // Algum tempo de vida depois de o chamador ter morrido, e não só o instante.
  for (let second = 0; second < 3; second += 1) {
    await new Promise((done) => setTimeout(done, 1_000));
    const health = await readHealth();
    assert(health?.ok === true, `o daemon parou de responder ${String(second + 1)} s depois do chamador morrer`);
    assert(health.supervised === true, "o daemon respondeu supervised diferente de true");
  }
  console.log("  o chamador morreu, e o daemon seguiu respondendo supervised: true");
  await reset(sandbox);
}

const STEPS: Record<StepName, (sandbox: Sandbox) => Promise<void>> = {
  "start-waits-for-health": stepStartWaitsForHealth,
  "stop-leaves-nothing": stepStopLeavesNothing,
  "survives-the-caller": stepSurvivesTheCaller,
};

function chosenSteps(argv: readonly string[]): StepName[] {
  const at = argv.indexOf("--only");
  if (at === -1) return [...STEP_NAMES];
  const wanted = argv[at + 1];
  if (wanted === "update-relaunches") {
    console.error("update-relaunches é da fatia S2 da 038 e ainda não foi construído.");
    process.exit(2);
  }
  const known = STEP_NAMES.find((name) => name === wanted);
  if (known === undefined) {
    console.error(`passo desconhecido: ${wanted ?? "(nenhum)"}. Os passos: ${STEP_NAMES.join(", ")}.`);
    process.exit(2);
  }
  return [known];
}

async function main(): Promise<void> {
  const steps = chosenSteps(process.argv.slice(2));
  if (process.platform !== "darwin" && process.platform !== "linux") {
    fail(`sem supervisor para ${process.platform}: o smoke roda no macOS e no Linux.`);
  }
  // O guarda que o cabeçalho promete: o smoke nunca é o serviço de verdade.
  if (LABEL === PRODUCTION_LABEL) fail("o rótulo do smoke é o de produção");
  if ((await readHealth()) !== null) fail(`já tem um Lumem respondendo em ${ORIGIN}; o smoke não o toca.`);

  const prefix = mkdtempSync(join(tmpdir(), "lumem-svc-prefix-"));
  const stateDir = mkdtempSync(join(tmpdir(), "lumem-svc-state-"));
  const sandbox: Sandbox = {
    prefix,
    stateDir,
    binary: join(prefix, "bin", "lumem"),
    env: {
      ...process.env,
      LUMEM_SERVICE_LABEL: LABEL,
      LUMEM_SERVICE_UNIT: UNIT,
      LUMEM_PORT: String(PORT),
      LUMEM_STATE_DIR: stateDir,
    },
  };

  try {
    step("empacotando");
    // `npm pack` roda o `prepack`, que constrói: o tarball é o que o release publicaria.
    execFileSync("npm", ["pack", "--pack-destination", prefix], {
      cwd: packageRoot,
      stdio: ["ignore", "pipe", "inherit"],
    });
    const packed = readdirSync(prefix).find((name) => name.endsWith(".tgz"));
    if (packed === undefined) fail("npm pack não escreveu tarball nenhum");
    const tarball = resolve(prefix, packed);

    step("instalando num prefixo descartável");
    execFileSync("npm", ["install", "--global", "--prefix", prefix, tarball], {
      cwd: prefix,
      stdio: ["ignore", "pipe", "inherit"],
    });

    for (const name of steps) await STEPS[name](sandbox);
    console.log("\n✓ o serviço de verdade se comporta");
  } finally {
    await teardown();
    rmSync(prefix, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  }
}

await main();
