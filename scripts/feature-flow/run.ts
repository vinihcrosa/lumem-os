/** Entry point for the feature-flow validators. See `cli.ts`. */
import { runFeatureFlow } from "./cli.js";

const result = runFeatureFlow(process.argv.slice(2), process.cwd());
if (result.stdout) console.log(result.stdout);
if (result.stderr) console.error(result.stderr);
process.exit(result.exitCode);
