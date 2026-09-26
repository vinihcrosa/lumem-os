import { execFileSync } from "node:child_process";
import { AcpManager } from "../../packages/server/src/acp/AcpManager.js";
import { labRepo, requireAdapter } from "./lab.js";

const log = (...parts: unknown[]) => console.log("[q39]", ...parts);
const manager = new AcpManager({});
const cwd = labRepo();
log("repo", cwd);
const before = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();

const info = await manager.spawn({ command: requireAdapter(), cwd, adapterVersion: "0.75.1", lumemMode: "free" });
log("spawn ok", info.id, "model=", info.model);

manager.onEvent(info.id, ({ event: e }: { event: Record<string, unknown> }) => {
  const type = String(e["type"]);
  if (type === "message" || type === "thought") log(type, String(e["text"] ?? "").slice(0, 80));
  else if (type === "tool_call") log("tool_call", e["title"] ?? e["kind"]);
  else if (type === "permission_request") log("PERMISSION", JSON.stringify(e).slice(0, 200));
  else if (type !== "usage") log(type);
});

log("set model haiku…");
await manager.setConfig(info.id, "mode", "bypassPermissions");
await manager.setConfig(info.id, "model", "haiku");
log("model set");

log("prompt…");
const stop = await manager.prompt(info.id,
  "Você está trabalhando SOZINHO, ninguém vai responder. Quando terminar, faça `git add -A` e `git commit`.\n\nAdicione um comentário JSDoc na interface `Cart` em `src/orders.ts`.");
const after = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
log("RESULTADO", JSON.stringify({ stop, commitou: after !== before }));
manager.kill(info.id);
process.exit(0);
