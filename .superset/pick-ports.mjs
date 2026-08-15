import { createHash } from "node:crypto";
import { createServer } from "node:net";

/**
 * Um par de portas livres para este workspace, impresso como "daemon web".
 *
 * Derivado do caminho do worktree em vez de sorteado: o mesmo workspace volta
 * na mesma porta entre execuções, então o bookmark do navegador continua
 * valendo. O sondar-para-frente existe só para o caso de a porta derivada já
 * estar ocupada por outra coisa.
 */

/** Faixa alta o suficiente para não esbarrar em serviço de sistema. */
const BASE = 43000;
/** Pares disponíveis. 900 workspaces simultâneos é folga de sobra. */
const PAIRS = 900;

const seed = process.argv[2] ?? process.cwd();
const digest = createHash("sha256").update(seed).digest("hex").slice(0, 8);
const start = Number.parseInt(digest, 16) % PAIRS;

function isFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    // 127.0.0.1 e não 0.0.0.0: é onde o daemon e o vite realmente escutam, e
    // uma porta pode estar livre numa interface e ocupada na outra.
    server.listen(port, "127.0.0.1");
  });
}

for (let offset = 0; offset < PAIRS; offset += 1) {
  const daemon = BASE + ((start + offset) % PAIRS) * 2;
  const web = daemon + 1;
  if ((await isFree(daemon)) && (await isFree(web))) {
    process.stdout.write(`${daemon} ${web}\n`);
    process.exit(0);
  }
}

process.stderr.write(`sem par de portas livre entre ${BASE} e ${BASE + PAIRS * 2}\n`);
process.exit(1);
