#!/usr/bin/env node
/**
 * Um `gh` que não fala com a rede.
 *
 * A política de `docs/project/testing.md` diz que git nunca é dublado, porque
 * `git worktree` tem comportamento que nenhum dublê reproduz. Com o `gh` o
 * argumento vira do avesso: ele fala com a **rede** e com a **conta de alguém**,
 * então um e2e que o chamasse de verdade falharia no avião e mexeria numa conta
 * real.
 *
 * O que este arquivo preserva é o que interessa: **processo de verdade, `argv`
 * de verdade, saída de verdade, código de saída de verdade**. O daemon executa
 * um binário no PATH e lê stdout — é o mesmo caminho de código, com a rede
 * trocada por um arquivo.
 *
 * O estado vem de `gh-state.json`, que o spec reescreve entre um passo e outro.
 * É assim que o e2e faz a barra andar de âmbar a vermelho a verde sem esperar
 * um CI existir.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const STATE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".lumem-e2e-fixtures", "gh-state.json");

function state() {
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    // Nenhum estado escrito ainda: repositório sem PR nenhuma, que é uma
    // resposta legítima e não um erro.
    return { pulls: [] };
  }
}

const argv = process.argv.slice(2);
if (process.env.FAKE_GH_LOG) appendFileSync(process.env.FAKE_GH_LOG, `${Date.now()} ${argv[1]} -> ${JSON.stringify(state().pulls.length)}\n`);

/**
 * `gh repo view --json …`.
 *
 * Duas estratégias e não três, para o spec poder provar que a lista do diálogo
 * de merge vem do host e não de uma constante nossa.
 */
if (argv[0] === "repo" && argv[1] === "view") {
  process.stdout.write(
    JSON.stringify({
      nameWithOwner: "exemplo/repo",
      mergeCommitAllowed: true,
      squashMergeAllowed: true,
      rebaseMergeAllowed: false,
      deleteBranchOnMerge: false,
    }),
  );
  process.exit(0);
}

if (argv[0] === "pr" && argv[1] === "list") {
  // O daemon manda `--jq` com a projeção. Aqui o estado **já está** na forma
  // projetada, então a projeção é a identidade — o que o spec exercita é o
  // transporte e o parse, não o gojq.
  process.stdout.write(JSON.stringify(state().pulls));
  process.exit(0);
}

if (argv[0] === "pr" && argv[1] === "merge") {
  // Escrita: não há remoto para escrever, então ele só confirma. O que o spec
  // prova aqui é o `argv` — que a estratégia escolhida chegou.
  process.stdout.write(`merged ${argv[2] ?? ""} ${argv[3] ?? ""}\n`);
  process.exit(0);
}

process.stderr.write(`fake-gh não conhece: ${argv.join(" ")}\n`);
process.exit(1);
