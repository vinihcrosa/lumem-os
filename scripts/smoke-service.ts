/**
 * O serviço de verdade: instala o tarball e roda `lumem start` contra o launchd
 * ou o `systemd --user` desta máquina (`038` Parte 1).
 *
 *     pnpm smoke:service                     os passos, um depois do outro
 *     pnpm smoke:service --only <passo>      um só
 *
 * Passos: `start-waits-for-health`, `stop-leaves-nothing`, `survives-the-caller`,
 * `update-relaunches`.
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
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { homedir, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
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

const STEP_NAMES = [
  "start-waits-for-health",
  "stop-leaves-nothing",
  "survives-the-caller",
  "update-relaunches",
] as const;
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

/** A porta do registry de mentira, ao lado da do daemon do smoke. */
const REGISTRY_PORT = 4_399;
/** As versões que o passo inventa: nenhuma existe no npm, e nenhuma se confunde com a do repositório. */
const OLD_VERSION = "0.98.0";
const NEW_VERSION = "0.99.0";

const VERSION_LINE = /var LUMEM_VERSION = "[^"]*";/;

/** Chama até `check` devolver o que se quer, ou estoura `timeoutMs` e devolve `null`. */
async function poll<T>(check: () => Promise<T | null>, timeoutMs: number, everyMs = 500): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await check();
    if (found !== null) return found;
    if (Date.now() >= deadline) return null;
    await new Promise((done) => setTimeout(done, everyMs));
  }
}

async function readUpdateStatus(): Promise<{ updateAvailable?: boolean; latest?: string | null; lastError?: string | null } | null> {
  try {
    const response = await fetch(`${ORIGIN}/trpc/system.updateStatus`, { signal: AbortSignal.timeout(1_500) });
    if (!response.ok) return null;
    const body = (await response.json()) as { result?: { data?: { updateAvailable?: boolean; latest?: string | null; lastError?: string | null } } };
    return body.result?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Um daemon **de verdade**, sob o supervisor de verdade, que se atualiza e volta
 * respondendo a versão nova sem ninguém rodar `lumem start` (`038`, C40).
 *
 * Três coisas são de mentira, e as três moram do lado de **fora** do daemon:
 *
 *  - o **registry**: um servidor HTTP nesta máquina, e o daemon o pergunta porque o
 *    bundle instalado tem a URL dele trocada — o `system.update` só instala o que o
 *    `latest` diz ser mais novo que a versão que roda;
 *  - a **versão que roda**: o `LUMEM_VERSION` do bundle instalado é trocado por uma
 *    velha, e o registry de mentira responde uma mais nova;
 *  - o **instalador**: um `npm` na frente do PATH de quem chamou `lumem start` — o
 *    arquivo de serviço copia o PATH, e o daemon roda o gerenciador dono da cópia. O
 *    falso troca a versão dentro do bundle e sai 0, que é o que o `npm i -g` de
 *    verdade faria ao substituir os arquivos.
 *
 * O que é de verdade: o launchd ou o systemd, o daemon, o `system.update`, o
 * `createShutdownHandler` saindo com 0 e o supervisor subindo o processo de novo.
 * É esta a única prova de que **o supervisor reinicia depois de um `exit(0)`** — o
 * `bootstrap.test.ts` prova o `exit`, e ninguém mais prova o que vem depois.
 */
async function stepUpdateRelaunches(sandbox: Sandbox): Promise<void> {
  step("update-relaunches");
  const bundle = join(sandbox.prefix, "lib", "node_modules", "@vinihcrosa", "lumem-os", "dist", "server", "main.mjs");
  const original = readFileSync(bundle, "utf8");
  assert(VERSION_LINE.test(original), "não achei `var LUMEM_VERSION = …;` no bundle instalado");
  assert(original.includes("https://registry.npmjs.org/"), "não achei a URL do registry no bundle instalado");

  const shimDir = join(sandbox.prefix, "shim");
  const callsFile = join(sandbox.prefix, "npm-calls.txt");
  mkdirSync(shimDir, { recursive: true });
  // O `#!` é o `node` que roda este script: o falso não depende do PATH que sobrar.
  writeFileSync(
    join(shimDir, "npm"),
    `#!${process.execPath}
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(callsFile)}, process.argv.slice(2).join(" ") + "\\n");
const spec = process.argv[process.argv.length - 1];
const version = spec.slice(spec.lastIndexOf("@") + 1);
const text = fs.readFileSync(${JSON.stringify(bundle)}, "utf8");
fs.writeFileSync(${JSON.stringify(bundle)}, text.replace(${VERSION_LINE.toString()}, 'var LUMEM_VERSION = "' + version + '";'));
`,
  );
  chmodSync(join(shimDir, "npm"), 0o755);

  const asked: string[] = [];
  const registry: Server = createServer((request, response) => {
    asked.push(request.url ?? "");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ version: NEW_VERSION }));
  });
  await new Promise<void>((done, refuse) => {
    registry.once("error", refuse);
    registry.listen(REGISTRY_PORT, "127.0.0.1", done);
  });

  const env = { ...sandbox.env, PATH: `${shimDir}${delimiter}${process.env["PATH"] ?? ""}` };
  const updating: Sandbox = { ...sandbox, env };
  try {
    writeFileSync(
      bundle,
      original
        .replace(VERSION_LINE, `var LUMEM_VERSION = "${OLD_VERSION}";`)
        .replaceAll("https://registry.npmjs.org/", `http://127.0.0.1:${String(REGISTRY_PORT)}/`),
    );

    const started = await lumem(updating, ["start"]);
    assert(started.code === 0, `lumem start saiu ${String(started.code)}:\n${started.output}`);
    const before = await readHealth();
    assert(before?.version === OLD_VERSION, `o daemon devia responder v${OLD_VERSION}, respondeu ${before?.version ?? "nada"}`);
    assert(before.supervised === true, "o daemon não subiu supervisionado");
    console.log(`  subiu na v${OLD_VERSION}, supervisionado`);

    // O relógio de verificação do daemon lê o registry uns segundos depois do boot.
    const seen = await poll(async () => {
      const status = await readUpdateStatus();
      return status?.updateAvailable === true ? status : null;
    }, 60_000);
    assert(seen !== null, `o daemon não viu a v${NEW_VERSION} em 60 s (registry pedido: ${asked.join(", ") || "nunca"})`);
    assert(
      asked[0] === "/@vinihcrosa%2Flumem-os/latest",
      `o daemon pediu ${asked[0] ?? "nada"} ao registry, e não o dist-tag latest`,
    );
    console.log(`  viu a v${NEW_VERSION} pedindo ${asked[0]}`);

    const response = await fetch(`${ORIGIN}/trpc/system.update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const answer = (await response.json()) as { result?: { data?: { started?: boolean } } };
    assert(response.ok && answer.result?.data?.started === true, `system.update não começou: ${JSON.stringify(answer)}`);

    // **Ninguém** roda `lumem start` daqui até o fim: quem sobe o daemon de novo é o
    // supervisor, depois de o daemon sair com 0.
    const back = await poll(async () => {
      const health = await readHealth();
      return health?.version === NEW_VERSION ? health : null;
    }, 90_000);
    if (back === null) {
      const status = await readUpdateStatus();
      const now = await readHealth();
      fail(
        `o daemon não voltou na v${NEW_VERSION} em 90 s (health: ${now?.version ?? "sem resposta"}, ` +
          `lastError: ${status?.lastError ?? "nenhum"})`,
      );
    }
    assert(back.supervised === true, "o daemon voltou, mas sem `supervised: true`");

    const calls = readFileSync(callsFile, "utf8").trim().split("\n");
    assert(
      calls.length === 1 && calls[0] === `install --global @vinihcrosa/lumem-os@${NEW_VERSION}`,
      `o instalador devia ter recebido uma vez \`install --global @vinihcrosa/lumem-os@${NEW_VERSION}\`: ${calls.join(" | ")}`,
    );
    const status = await lumem(updating, ["status"]);
    assert(status.output.includes(`v${NEW_VERSION}`), `lumem status não diz v${NEW_VERSION}: ${status.output}`);
    console.log(`  o supervisor subiu o daemon de novo, na v${NEW_VERSION}, sem ninguém rodar \`lumem start\``);
  } finally {
    writeFileSync(bundle, original);
    await new Promise<void>((done) => registry.close(() => done()));
    await reset(updating);
  }
}

const STEPS: Record<StepName, (sandbox: Sandbox) => Promise<void>> = {
  "start-waits-for-health": stepStartWaitsForHealth,
  "stop-leaves-nothing": stepStopLeavesNothing,
  "survives-the-caller": stepSurvivesTheCaller,
  "update-relaunches": stepUpdateRelaunches,
};

function chosenSteps(argv: readonly string[]): StepName[] {
  const at = argv.indexOf("--only");
  if (at === -1) return [...STEP_NAMES];
  const wanted = argv[at + 1];
  const known = STEP_NAMES.find((name) => name === wanted);
  if (known === undefined) {
    console.error(`passo desconhecido: ${wanted ?? "(nenhum)"}. Os passos: ${STEP_NAMES.join(", ")}.`);
    process.exit(2);
  }
  return [known];
}

async function portIsTaken(port: number): Promise<boolean> {
  return await new Promise((done) => {
    const probe = createServer();
    probe.once("error", () => done(true));
    probe.listen(port, "127.0.0.1", () => {
      probe.close(() => done(false));
    });
  });
}

async function main(): Promise<void> {
  const steps = chosenSteps(process.argv.slice(2));
  if (process.platform !== "darwin" && process.platform !== "linux") {
    fail(`sem supervisor para ${process.platform}: o smoke roda no macOS e no Linux.`);
  }
  // O guarda que o cabeçalho promete: o smoke nunca é o serviço de verdade.
  if (LABEL === PRODUCTION_LABEL) fail("o rótulo do smoke é o de produção");
  if ((await readHealth()) !== null) fail(`já tem um Lumem respondendo em ${ORIGIN}; o smoke não o toca.`);
  if (steps.includes("update-relaunches") && (await portIsTaken(REGISTRY_PORT))) {
    fail(`a porta ${String(REGISTRY_PORT)} (registry de mentira) já está em uso.`);
  }

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
    step("construindo");
    // O `prepack` só monta o que já foi construído: sem isto o tarball leva o daemon
    // da última vez que alguém rodou `pnpm build`. O turbo cacheia, e sem mudança é
    // uma consulta.
    execFileSync("pnpm", ["build"], { cwd: repoRoot, stdio: ["ignore", "inherit", "inherit"] });

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
