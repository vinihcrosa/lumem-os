import { describe, expect, it } from "vitest";

import { isLoopbackHost, loopbackAuthorities, loopbackOrigins } from "./loopback.js";

describe("isLoopbackHost", () => {
  it("accepts the three spellings of this machine", () => {
    for (const host of ["127.0.0.1", "localhost", "::1", "[::1]", "LOCALHOST", " 127.0.0.1 "]) {
      expect(isLoopbackHost(host), host).toBe(true);
    }
  });

  it("refuses anything that would publish the daemon", () => {
    for (const host of ["0.0.0.0", "::", "192.168.0.10", "evil.example", "", "127.0.0.1:4317"]) {
      expect(isLoopbackHost(host), host).toBe(false);
    }
  });
});

describe("loopback authorities and origins", () => {
  it("carry the port, because a Host header does", () => {
    expect(loopbackAuthorities(4317)).toEqual(["127.0.0.1:4317", "localhost:4317", "[::1]:4317"]);
    expect(loopbackOrigins(4317)).toEqual([
      "http://127.0.0.1:4317",
      "http://localhost:4317",
      "http://[::1]:4317",
    ]);
  });
});
