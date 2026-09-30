/**
 * Empacota o app de uma plataforma e monta o pacote npm dela (`038` Parte 4).
 *
 *     pnpm --filter @lumem/desktop run pack --platform darwin --arch arm64
 *
 * Escreve em `release/`:
 *
 *   release/<plataforma>-<arch>/package/       o que o npm empacota
 *   release/<plataforma>-<arch>/vinihcrosa-lumem-desktop-….tgz
 *   release/assets/                            o que o GitHub release anexa: `.zip`, `.AppImage`, `.deb`
 *
 * O electron-builder faz o app; o que este arquivo acrescenta é o **pacote** em volta dele — e
 * uma linha de resumo em JSON no fim, que o release e o `smoke:install` leem.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { desktopPlatformOf, type DesktopPlatform } from "@lumem/shared";

import { platformManifest, tarballName } from "./src/packaging.js";

const here = dirname(fileURLToPath(import.meta.url));

interface Target {
  key: DesktopPlatform;
  platform: "darwin" | "linux";
  arch: "arm64" | "x64";
}

/**
 * O que o resto do arquivo usa em comando e em caminho sai **deste `switch`**, que devolve
 * literais, e nunca do argumento: `--platform` e `--arch` só escolhem um caso, e uma
 * combinação que não é uma das quatro não chega a lugar nenhum. Não há `--out`: a saída é
 * sempre `release/`, porque um diretório vindo da linha de comando é o que o `rmSync` abaixo
 * apagaria por inteiro.
 */
function targetOf(requested: DesktopPlatform): Target {
  switch (requested) {
    case "darwin-arm64":
      return { key: "darwin-arm64", platform: "darwin", arch: "arm64" };
    case "darwin-x64":
      return { key: "darwin-x64", platform: "darwin", arch: "x64" };
    case "linux-arm64":
      return { key: "linux-arm64", platform: "linux", arch: "arm64" };
    case "linux-x64":
      return { key: "linux-x64", platform: "linux", arch: "x64" };
  }
}

const { values } = parseArgs({ options: { platform: { type: "string" }, arch: { type: "string" } } });
const requested = desktopPlatformOf(values.platform ?? "", values.arch ?? "");
if (requested === null) {
  console.error("uso: pack --platform <darwin|linux> --arch <arm64|x64>   (as quatro combinações que o app tem)");
  process.exit(2);
}
const { key, platform, arch } = targetOf(requested);
const version = (JSON.parse(readFileSync(join(here, "package.json"), "utf8")) as { version: string }).version;

const release = join(here, "release");
const workdir = join(release, key);
const builderOut = join(workdir, "builder");
const packageDir = join(workdir, "package");
const assetsDir = join(release, "assets");

function run(command: string, args: string[], cwd = here): void {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

rmSync(workdir, { recursive: true, force: true });
mkdirSync(packageDir, { recursive: true });
mkdirSync(assetsDir, { recursive: true });

run("pnpm", ["exec", "tsx", "build.ts"]);

const targets = platform === "darwin" ? ["--mac", "zip"] : ["--linux", "AppImage", "deb"];
run("pnpm", [
  "exec",
  "electron-builder",
  "--config",
  "electron-builder.yml",
  ...targets,
  `--${arch}`,
  "--publish",
  "never",
  `--config.directories.output=${builderOut}`,
]);

const built = readdirSync(builderOut);
const artifact = (extension: string): string => {
  const found = built.find((name) => name.endsWith(extension));
  if (found === undefined) throw new Error(`o electron-builder não escreveu nenhum ${extension} em ${builderOut}`);
  return join(builderOut, found);
};

if (platform === "darwin") {
  const zip = artifact(".zip");
  cpSync(zip, join(packageDir, "Lumem.zip"));
  cpSync(zip, join(assetsDir, `Lumem-${version}-mac-${arch}.zip`));
} else {
  // A pasta desempacotada é o que o `.desktop` executa: o AppImage precisa de FUSE, e o
  // `.deb` de root, e nenhum dos dois cabe num `npm i -g` de usuário.
  const unpacked = built.find((name) => name.endsWith("-unpacked") && statSync(join(builderOut, name)).isDirectory());
  if (unpacked === undefined) throw new Error(`o electron-builder não deixou a pasta desempacotada em ${builderOut}`);
  cpSync(join(builderOut, unpacked), join(packageDir, "app"), { recursive: true, verbatimSymlinks: true });
  cpSync(join(here, "assets", "icon.png"), join(packageDir, "icon.png"));
  for (const extension of [".AppImage", ".deb"]) cpSync(artifact(extension), join(assetsDir, `Lumem-${version}-linux-${arch}${extension}`));
}

writeFileSync(join(packageDir, "package.json"), `${JSON.stringify(platformManifest({ platform: key, version }), null, 2)}\n`);
run("npm", ["pack", "--pack-destination", workdir], packageDir);

const tarball = join(workdir, tarballName(key, version));
if (!existsSync(tarball)) throw new Error(`o npm pack não escreveu ${tarball}`);
console.log(
  `\n${JSON.stringify({ platform: key, version, tarball, bytes: statSync(tarball).size, assets: readdirSync(assetsDir) })}`,
);
