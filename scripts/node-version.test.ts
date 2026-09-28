import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { checkNodeVersion } from "./node-version.js";

describe("o node pinado", () => {
  it("a versão exata passa", () => {
    expect(checkNodeVersion("22.17.1", "22.17.1\n").kind).toBe("ok");
  });

  it("o v26 que quebra o jsdom é recusado, e a mensagem diz as duas versões e a saída", () => {
    const result = checkNodeVersion("26.0.0", "22.17.1");
    expect(result.kind).toBe("major-differs");
    expect(result.message).toContain("22.17.1");
    expect(result.message).toContain("26.0.0");
    expect(result.message).toMatch(/nvm use|mise install/);
  });

  it("um major abaixo também é recusado", () => {
    expect(checkNodeVersion("v20.19.4", "22.17.1").kind).toBe("major-differs");
  });

  it("mesmo major, outro patch: avisa e segue", () => {
    expect(checkNodeVersion("22.18.0", "22.17.1").kind).toBe("minor-differs");
  });

  it("o .nvmrc e o mise.toml concordam", () => {
    const root = join(import.meta.dirname, "..");
    const nvmrc = readFileSync(join(root, ".nvmrc"), "utf8").trim();
    const mise = readFileSync(join(root, "mise.toml"), "utf8");
    expect(mise).toContain(`node = "${nvmrc}"`);
  });

  it("o CI lê o mesmo .nvmrc, em vez de um número à parte", () => {
    const root = join(import.meta.dirname, "..");
    for (const workflow of ["ci.yml", "release.yml", "sonarqube.yml"]) {
      const text = readFileSync(join(root, ".github/workflows", workflow), "utf8");
      expect(text, workflow).not.toMatch(/node-version:\s*\d/);
    }
  });

  it("o script sai 1 sob um node de outro major", () => {
    const script = join(import.meta.dirname, "node-version.ts");
    const result = spawnSync(process.execPath, ["--no-warnings", "--experimental-strip-types", script], {
      encoding: "utf8",
    });
    const pinnedMajor = readFileSync(join(import.meta.dirname, "..", ".nvmrc"), "utf8").split(".")[0];
    const sameMajor = process.versions.node.split(".")[0] === pinnedMajor;
    expect(result.status).toBe(sameMajor ? 0 : 1);
  });
});
