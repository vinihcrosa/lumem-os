/** Entry point for the documentation gate. See `check-docs.ts`. */
import { checkDocs, formatFindings } from "./check-docs.js";

const root = process.cwd();
const findings = checkDocs(root);
console.log(formatFindings(findings));
process.exit(findings.length === 0 ? 0 : 1);
