import { readFileSync } from "node:fs";

/**
 * O que os turnos dizem (`028` Q39).
 *
 * A classificação é do **fato**, não do texto: `committed` vem de
 * `git rev-parse HEAD`, que é o mesmo critério do §4.1 — o daemon não acredita
 * no agente, olha o repositório.
 *
 * O texto entra só para separar os que **não** terminaram em dois: o que
 * perguntou e o que simplesmente parou. É essa separação que a Q39 pergunta se
 * dá para automatizar.
 */

interface Turn {
  task: string;
  arm: string;
  stopReason: string;
  committed: boolean;
  text: string;
  tokens: number;
  cost: number | null;
}

const files = process.argv.slice(2);
const turns: Turn[] = files.flatMap(
  (file) => JSON.parse(readFileSync(file, "utf8")) as Turn[],
);

/** A heurística que o estudo mediu em 44% — aqui ela é medida de novo, no braço certo. */
const asksExplicitly = (text: string): boolean => /\?\s*$/.test(text.trim());

type Kind = "terminou" | "pergunta" | "parou-sem-perguntar";

function classify(turn: Turn): Kind {
  if (turn.committed) return "terminou";
  return asksExplicitly(turn.text) ? "pergunta" : "parou-sem-perguntar";
}

const byArm = new Map<string, Turn[]>();
for (const turn of turns) byArm.set(turn.arm, [...(byArm.get(turn.arm) ?? []), turn]);

for (const [arm, rows] of byArm) {
  const kinds = rows.map(classify);
  const count = (kind: Kind) => kinds.filter((one) => one === kind).length;
  const didNotFinish = rows.length - count("terminou");
  const cost = rows.reduce((sum, row) => sum + (row.cost ?? 0), 0);

  console.log(`\n## ${arm} — ${String(rows.length)} turnos`);
  console.log(`  terminou (commit no disco): ${String(count("terminou"))}`);
  console.log(`  não terminou: ${String(didNotFinish)}`);
  console.log(`    perguntou (termina em "?"): ${String(count("pergunta"))}`);
  console.log(`    parou sem perguntar:        ${String(count("parou-sem-perguntar"))}`);
  if (didNotFinish > 0) {
    const recall = (count("pergunta") / didNotFinish) * 100;
    console.log(`  recall da heurística do "?": ${recall.toFixed(0)}%`);
  }
  console.log(`  stopReason: ${[...new Set(rows.map((row) => row.stopReason))].join(", ")}`);
  console.log(`  custo: US$ ${cost.toFixed(4)}`);

  for (const row of rows) {
    console.log(
      `   · ${row.task.padEnd(12)} ${classify(row).padEnd(20)} stop=${row.stopReason} …${row.text.trim().slice(-70).replace(/\n/g, " ⏎ ")}`,
    );
  }
}
