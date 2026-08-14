import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEFAULT_SERVER_PORT, DEFAULT_WEB_PORT, LUMEM_VERSION } from "./constants.js";

function readJson<T>(relative: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8")) as T;
}

describe("LUMEM_VERSION", () => {
  it("matches the package version", () => {
    // Guards the constant against drifting on the first version bump.
    const manifest = readJson<{ version: string }>("../package.json");

    expect(LUMEM_VERSION).toBe(manifest.version);
  });
});

describe("default ports", () => {
  const ports = readJson<Record<string, number>>("../../../ports.json");

  it("matches ports.json, which the vite and playwright configs read", () => {
    // The only thing preventing the dev proxy from silently pointing at a
    // different process than the daemon actually binds to.
    expect(DEFAULT_SERVER_PORT).toBe(ports["server"]);
    expect(DEFAULT_WEB_PORT).toBe(ports["web"]);
  });

  it("keeps every port distinct", () => {
    const values = Object.values(ports);

    expect(new Set(values).size).toBe(values.length);
  });

  it("keeps the e2e ports away from the dev ports", () => {
    // E2E owning its own ports is what stops it from attaching to the
    // developer's running daemon and mutating real state.
    expect(ports["e2eServer"]).not.toBe(ports["server"]);
    expect(ports["e2eWeb"]).not.toBe(ports["web"]);
  });
});
