#!/usr/bin/env node
import { runMemoryCli } from "./cli.js";

/**
 * O binário. Separado do `cli.ts` pelo mesmo motivo que o `bootstrap` é separado
 * do `main`: código que chama `process.exit` no topo não é testável, e o que
 * decide o código de saída é exatamente o que precisa de teste.
 */
runMemoryCli(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  });
