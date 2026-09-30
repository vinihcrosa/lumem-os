import { describe, expect, it } from "vitest";

import { installedStartArgs } from "./smoke-install.js";

describe("smoke:install", () => {
  it("starts the installed binary with lumem run", () => {
    // `lumem` sem verbo é `lumem start` desde a 038: instala um serviço e volta,
    // sem deixar ao script um processo para esperar nem para matar.
    const args = installedStartArgs(4_397);

    expect(args[0]).toBe("run");
    expect(args).toEqual(["run", "--port", "4397"]);
  });
});
