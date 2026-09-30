import { describe, expect, it } from "vitest";

import { installedStartArgs, parseSmokeArgs } from "./smoke-install.js";

describe("smoke:install", () => {
  it("starts the installed binary with lumem run", () => {
    // `lumem` sem verbo é `lumem start` desde a 038: instala um serviço e volta,
    // sem deixar ao script um processo para esperar nem para matar.
    const args = installedStartArgs(4_397);

    expect(args[0]).toBe("run");
    expect(args).toEqual(["run", "--port", "4397"]);
  });
});

describe("smoke:install arguments", () => {
  it("keeps the bare tarball the release passes, and adds --only", () => {
    // O `release.yml` chama `smoke-install.ts <tarball>` desde antes da 038: continua valendo.
    expect(parseSmokeArgs([])).toEqual({ only: null, tarball: null });
    expect(parseSmokeArgs(["lumem.tgz"])).toEqual({ only: null, tarball: "lumem.tgz" });
    expect(parseSmokeArgs(["--only", "desktop"])).toEqual({ only: "desktop", tarball: null });
    expect(parseSmokeArgs(["--only", "desktop", "app.tgz"])).toEqual({ only: "desktop", tarball: "app.tgz" });
  });

  it("refuses a step it does not have", () => {
    expect(() => parseSmokeArgs(["--only", "nope"])).toThrow("desktop");
  });
});
