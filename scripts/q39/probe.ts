import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { homedir } from "node:os";

import { AcpManager } from "../../packages/server/src/acp/AcpManager.js";

const command = join(homedir(), ".lumem/adapters/claude/node_modules/.bin/claude-agent-acp");
const manager = new AcpManager({});
const cwd = mkdtempSync(join(tmpdir(), "q39-probe-"));

const report = await manager.probe({ command, cwd, adapterVersion: "0.75.1" });
console.log(JSON.stringify({
  agentInfo: report.agentInfo,
  authMethods: report.authMethods,
  modes: report.modes,
  models: (report as { models?: unknown }).models,
}, null, 1));
process.exit(0);
