import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { tokensTsFromCss } from "./tokens-from-css.js";

/**
 * Deriva o `tokens.ts` a partir do `tokens.css`.
 *
 * Isto é o que sobrou do `design:sync`. Enquanto o desenho morava no Open
 * Design, este script **copiava** de lá — `tokens.css` e uma tela por arquivo —
 * e derivava no fim. O desenho passou a morar no repositório
 * ([ADR](../../../docs/adr/)), então não há de onde copiar: `tokens.css` é
 * original, editado aqui, e a única transformação que resta é a que o
 * JavaScript precisa.
 *
 * **Derivado ≠ gerado.** Nada aqui escolhe cor. O `xterm`, o CodeMirror e o
 * Shiki não sabem ler `var(--token)`, e precisam do hexadecimal; a
 * transformação é mecânica e sem perda, porque os semânticos do CSS apontam
 * para primitiva por `var(--familia-degrau)` e o TypeScript reproduz a mesma
 * indireção. Ver `tokens-from-css.ts`.
 *
 * Uso:
 *   pnpm design:derive            escreve o `tokens.ts`
 *   pnpm design:derive --check    não escreve; sai 1 se o commitado divergiu
 *
 * O `--check` aqui é conveniência: quem **garante** é o `tokens.test.ts`, que
 * compara a derivação com o arquivo commitado dentro do `gate:quick` e roda em
 * qualquer máquina.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, "..");

const TOKENS_CSS = join(WEB, "src/styles/tokens.css");
const TOKENS_TS = join(WEB, "src/styles/tokens.ts");

function main(): void {
  const check = process.argv.includes("--check");

  if (!existsSync(TOKENS_CSS)) {
    process.stderr.write(`não achei ${TOKENS_CSS}\n`);
    process.exit(1);
  }

  const derived = tokensTsFromCss(readFileSync(TOKENS_CSS, "utf8"));
  const committed = existsSync(TOKENS_TS) ? readFileSync(TOKENS_TS, "utf8") : null;

  if (derived === committed) {
    process.stdout.write("tokens.ts em dia com tokens.css\n");
    return;
  }

  if (check) {
    process.stderr.write("tokens.ts divergiu do tokens.css — rode `pnpm design:derive`\n");
    process.exit(1);
  }

  writeFileSync(TOKENS_TS, derived);
  process.stdout.write(`${committed === null ? "criado" : "atualizado"} ${TOKENS_TS}\n`);
}

main();
