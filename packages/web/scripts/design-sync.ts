import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { tokensTsFromCss } from "./tokens-from-css.js";

/**
 * Traz o design do Open Design para o repositório.
 *
 * O design é feito **inteiramente no Open Design** — ver
 * `docs/project/design-source-of-truth.md`. Isto não desenha nada: copia o que está lá
 * e deriva o que o JavaScript precisa. A direção é uma só, e é o que faz "quem manda"
 * ser uma pergunta com resposta: mexer no `tokens.css` do repositório é mexer numa
 * cópia, e o próximo sync desfaz.
 *
 * Uso:
 *   pnpm design:sync              copia e deriva
 *   pnpm design:sync --check      não escreve nada; sai 1 se o repositório divergiu
 *
 * O `--check` é para a pessoa, não para o gate: ele exige o Open Design instalado, e
 * gate que depende de ferramenta de desktop é gate que falha na máquina errada. O que
 * o gate confere é outra coisa — que o `tokens.ts` commitado é o que a derivação
 * produz, e que todo par de contraste passa. Isso roda em qualquer lugar.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, "..");

/**
 * Onde o Open Design guarda o projeto.
 *
 * Caminho interno de outro programa, então ele é um **default**, não uma suposição:
 * `LUMEM_DESIGN_DIR` sobrescreve, e a mensagem de erro diz isso quando o default não
 * existe mais.
 */
const DEFAULT_SOURCE = join(
  homedir(),
  "Library/Application Support/Open Design/namespaces/release-stable/data/projects/lumem-os",
);

const TOKENS_CSS = join(WEB, "src/styles/tokens.css");
const TOKENS_TS = join(WEB, "src/styles/tokens.ts");
const PROTOTYPE_DIR = join(WEB, "prototype");

interface Change {
  path: string;
  state: "novo" | "atualizado" | "igual";
}

function main(): void {
  const check = process.argv.includes("--check");
  const source = process.env["LUMEM_DESIGN_DIR"] ?? DEFAULT_SOURCE;

  if (!existsSync(join(source, "tokens.css"))) {
    fail(
      `não achei o projeto de design em ${source}\n` +
        "Abra o projeto lumem-os no Open Design, ou aponte LUMEM_DESIGN_DIR para a pasta dele.",
    );
  }

  const changes: Change[] = [];
  const css = readFileSync(join(source, "tokens.css"), "utf8");

  changes.push(write(TOKENS_CSS, css, check));
  // Derivado, não gerado: nada aqui escolhe cor. Ver `tokens-from-css.ts`.
  changes.push(write(TOKENS_TS, tokensTsFromCss(css), check));

  mkdirSync(PROTOTYPE_DIR, { recursive: true });
  for (const name of readdirSync(source).sort()) {
    if (name === "tokens.css" || !/\.(html|css)$/.test(name)) continue;

    const content = readFileSync(join(source, name), "utf8");
    changes.push(
      write(
        join(PROTOTYPE_DIR, name),
        // Uma cópia de token no repositório é uma cópia a mais do que existe verdade:
        // o protótipo passa a apontar para o arquivo que o sync acabou de escrever.
        name.endsWith(".html") ? content.replace(/href="tokens\.css"/g, 'href="../src/styles/tokens.css"') : content,
        check,
      ),
    );
  }

  report(changes, check, source);
}

function write(path: string, content: string, check: boolean): Change {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
  const state = existing === null ? "novo" : existing === content ? "igual" : "atualizado";

  if (!check && state !== "igual") {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return { path: path.slice(WEB.length + 1), state };
}

function report(changes: Change[], check: boolean, source: string): void {
  const moved = changes.filter((change) => change.state !== "igual");

  console.log(`design em ${source}`);
  for (const change of changes) {
    const mark = change.state === "igual" ? "=" : change.state === "novo" ? "+" : "~";
    console.log(`  ${mark} ${change.path}`);
  }

  if (moved.length === 0) {
    console.log(`\n${changes.length} arquivos, nada mudou.`);
    return;
  }

  if (check) {
    fail(`\n${moved.length} arquivo(s) divergem do design. Rode: pnpm design:sync`);
  }
  console.log(`\n${moved.length} de ${changes.length} arquivos atualizados.`);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

main();
