import { AcpManager } from "../../packages/server/src/acp/AcpManager.js";
import { labRepo, requireAdapter } from "./lab.js";

const manager = new AcpManager({});
const cwd = labRepo();
const info = await manager.spawn({ command: requireAdapter(), cwd, adapterVersion: "0.75.1" });
const model = info.configOptions.find((option) => option.id === "model");
console.log(JSON.stringify({
  optionIds: info.configOptions.map((option) => option.id),
  model: model?.currentValue,
  choices: model?.choices?.map((choice) => choice.value),
}, null, 1));
manager.kill(info.id);
process.exit(0);
