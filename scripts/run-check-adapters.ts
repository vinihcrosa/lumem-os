/** Entry point for the adapter-ageing check. See `check-adapters.ts`. */
import { checkAdapters, fails, formatFindings, npmRegistry } from "./check-adapters.js";

const findings = checkAdapters(npmRegistry());
console.log(formatFindings(findings));
process.exit(fails(findings) ? 1 : 0);
