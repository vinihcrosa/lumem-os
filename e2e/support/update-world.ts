import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

import { E2E_UPDATE_PORT, E2E_UPDATE_REGISTRY_PORT, WEB_DIST_DIR } from "../../ports.js";
import { LUMEM_VERSION } from "../../packages/shared/src/constants.js";
import { startSupervised, type SupervisedDaemon } from "./supervised-daemon.js";

/**
 * Um Lumem instalado, e o `npm i -g` da versão seguinte (`038`, C41).
 *
 * **O que este mundo precisa ser para o teste valer:** um daemon cuja `index.html`
 * aponta para um asset com hash no nome, e uma instalação que troca **o arquivo do
 * asset por outro de outro hash** — que é o que uma release nova faz ao `dist/web`. A
 * página em branco do experimento 1 da fase 0 só existe nessa forma: `/` serve o
 * `index.html` novo, o asset novo não tem rota no daemon velho e o velho foi apagado.
 * Uma instalação que só mudasse o texto de um arquivo não reproduziria nada.
 *
 * Três coisas são de mentira, todas do lado de **fora** do daemon:
 *
 *  - a **versão**: o bundle do daemon e o JS da página levam a versão trocada por
 *    uma que só existe aqui, velha e nova — as duas partes do Lumem sabem em que
 *    versão foram construídas, e o `useVersionReload` compara as duas;
 *  - o **registry**: um servidor nesta máquina, e o daemon o pergunta porque a URL no
 *    bundle copiado é a dele;
 *  - o **`npm`**: um executável na frente do `PATH` do daemon, que troca os arquivos
 *    como o gerenciador de verdade trocaria e sai 0.
 *
 * O bundle do daemon é uma **cópia ao lado do original** (`dist/server/`), e não um
 * arquivo em `/tmp`: os dois pacotes nativos (`better-sqlite3`, `node-pty`) são
 * resolvidos a partir da pasta do arquivo, e o `drizzle/` fica dois níveis acima
 * dele.
 */

export const OLD_VERSION = "0.98.0";
export const NEW_VERSION = "0.99.0";

const SERVER_DIST = fileURLToPath(new URL("../../packages/server/dist/server/", import.meta.url));
const VERSION_LINE = /var LUMEM_VERSION = "[^"]*";/;

export interface UpdateWorld {
  origin: string;
  daemon: SupervisedDaemon;
  /** Os dois assets de entrada da página, por caminho (`/assets/index-<hash>.js`). */
  assets: { old: string; new: string };
  /** O que o `npm i -g` da versão nova faz, rodado à mão — para o teste de controle. */
  install(): void;
  /** O que o registry de mentira foi perguntado. */
  asked: string[];
  /** O que o `npm` de mentira recebeu, uma linha por chamada. */
  installerCalls(): string[];
  dispose(): Promise<void>;
}

const hash = (text: string): string => createHash("sha1").update(text).digest("hex").slice(0, 8);

export async function createUpdateWorld(): Promise<UpdateWorld> {
  const bundleOriginal = join(SERVER_DIST, "main.mjs");
  if (!existsSync(bundleOriginal) || !existsSync(join(WEB_DIST_DIR, "index.html"))) {
    throw new Error("falta o build do daemon e do web: rode `pnpm build` (o webServer de produção o faz).");
  }

  const root = mkdtempSync(join(tmpdir(), "lumem-e2e-update-"));
  const webRoot = join(root, "web");
  const stage = join(root, "stage");
  const shimDir = join(root, "shim");
  const stateDir = join(root, "state");
  const callsFile = join(root, "npm-calls.txt");
  mkdirSync(join(stage), { recursive: true });
  mkdirSync(shimDir, { recursive: true });
  cpSync(WEB_DIST_DIR, webRoot, { recursive: true });

  // -- a página, na versão velha, e a que a instalação vai escrever -------------
  const indexHtml = readFileSync(join(webRoot, "index.html"), "utf8");
  const entry = /\/assets\/(index-[\w-]+\.js)/.exec(indexHtml)?.[1];
  if (entry === undefined) throw new Error("o index.html do web não aponta um `assets/index-*.js`");
  const entrySource = readFileSync(join(webRoot, "assets", entry), "utf8");
  const quoted = `"${LUMEM_VERSION}"`;
  if (!entrySource.includes(quoted)) {
    throw new Error(`o JS de entrada do web não leva a versão ${quoted}: a troca de versão não teria efeito`);
  }

  const build = (version: string) => {
    const source = entrySource.replaceAll(quoted, `"${version}"`);
    const name = `index-${hash(source)}.js`;
    return { name, source, html: indexHtml.replace(entry, name) };
  };
  const older = build(OLD_VERSION);
  const newer = build(NEW_VERSION);
  rmSync(join(webRoot, "assets", entry));
  writeFileSync(join(webRoot, "assets", older.name), older.source);
  writeFileSync(join(webRoot, "index.html"), older.html);
  writeFileSync(join(stage, newer.name), newer.source);
  writeFileSync(join(stage, "index.html"), newer.html);

  // -- o daemon, copiado ao lado do original -------------------------------------
  const bundle = join(SERVER_DIST, "main-e2e-update.mjs");
  const bundleSource = readFileSync(bundleOriginal, "utf8");
  if (!VERSION_LINE.test(bundleSource) || !bundleSource.includes("https://registry.npmjs.org/")) {
    throw new Error("o bundle do daemon não tem a versão ou a URL do registry no formato que o e2e troca");
  }
  const registryOrigin = `http://127.0.0.1:${String(E2E_UPDATE_REGISTRY_PORT)}/`;
  writeFileSync(
    bundle,
    bundleSource
      .replace(VERSION_LINE, `var LUMEM_VERSION = "${OLD_VERSION}";`)
      .replaceAll("https://registry.npmjs.org/", registryOrigin),
  );

  // -- o `npm i -g` ---------------------------------------------------------------
  // O que o gerenciador faz com o diretório do pacote: os arquivos da versão velha
  // saem, os da nova entram. O daemon **de pé** não é avisado de nada.
  writeFileSync(
    join(shimDir, "npm"),
    `#!${process.execPath}
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(callsFile)}, process.argv.slice(2).join(" ") + "\\n");
fs.rmSync(${JSON.stringify(join(webRoot, "assets", older.name))}, { force: true });
fs.copyFileSync(${JSON.stringify(join(stage, newer.name))}, ${JSON.stringify(join(webRoot, "assets", newer.name))});
fs.copyFileSync(${JSON.stringify(join(stage, "index.html"))}, ${JSON.stringify(join(webRoot, "index.html"))});
const text = fs.readFileSync(${JSON.stringify(bundle)}, "utf8");
fs.writeFileSync(${JSON.stringify(bundle)}, text.replace(${VERSION_LINE.toString()}, 'var LUMEM_VERSION = "${NEW_VERSION}";'));
`,
  );
  chmodSync(join(shimDir, "npm"), 0o755);

  // -- o registry -----------------------------------------------------------------
  const asked: string[] = [];
  const registry: Server = createServer((request, response) => {
    asked.push(request.url ?? "");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ version: NEW_VERSION }));
  });
  await new Promise<void>((resolve, reject) => {
    registry.once("error", reject);
    registry.listen(E2E_UPDATE_REGISTRY_PORT, "127.0.0.1", resolve);
  });

  const cleanup = async (): Promise<void> => {
    await new Promise<void>((resolve) => registry.close(() => resolve()));
    rmSync(bundle, { force: true });
    rmSync(root, { recursive: true, force: true });
  };

  let daemon: SupervisedDaemon;
  try {
    daemon = await startSupervised({
      entry: bundle,
      port: E2E_UPDATE_PORT,
      logFile: join(root, "daemon.log"),
      env: {
        LUMEM_STATE_DIR: stateDir,
        LUMEM_WEB_ROOT: webRoot,
        // O teste é o launchd: sem isto o `system.update` recusa com 412.
        LUMEM_SUPERVISOR: "launchd",
        SHELL: "/bin/sh",
        PATH: `${shimDir}${delimiter}${process.env["PATH"] ?? ""}`,
      },
    });
  } catch (error) {
    await cleanup();
    throw error;
  }

  return {
    origin: daemon.url,
    daemon,
    assets: { old: `/assets/${older.name}`, new: `/assets/${newer.name}` },
    install: () => {
      execFileSync(join(shimDir, "npm"), ["install", "--global", `@vinihcrosa/lumem-os@${NEW_VERSION}`]);
    },
    asked,
    installerCalls: () =>
      existsSync(callsFile) ? readFileSync(callsFile, "utf8").trim().split("\n") : [],
    dispose: async () => {
      await daemon.stop();
      await cleanup();
    },
  };
}
