import { describe, expect, it } from "vitest";

import {
  allowedOrigins,
  checkHost,
  checkOrigin,
  judge,
  needsOriginCheck,
  parseWebOrigins,
  type GuardedRequest,
  type OriginPolicy,
} from "./origin-policy.js";

const policy: OriginPolicy = { port: 4317, webOrigins: ["http://127.0.0.1:4318"] };

function request(overrides: Partial<GuardedRequest> = {}): GuardedRequest {
  return {
    method: "GET",
    pathname: "/trpc/health",
    headers: { host: "127.0.0.1:4317" },
    upgrade: false,
    ...overrides,
  };
}

describe("checkHost (F1)", () => {
  it("accepts the three loopback names, with the daemon's port", () => {
    for (const host of ["127.0.0.1:4317", "localhost:4317", "[::1]:4317", "LOCALHOST:4317"]) {
      expect(checkHost(host, policy), host).toEqual({ ok: true });
    }
  });

  it("refuses a rebound name — the DNS rebinding case", () => {
    const verdict = checkHost("evil.example:4317", policy);

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.status).toBe(421);
      expect(verdict.reason).toContain("127.0.0.1:4317");
    }
  });

  it("refuses the right name on the wrong port, and a missing header", () => {
    expect(checkHost("127.0.0.1:4318", policy).ok).toBe(false);
    expect(checkHost("127.0.0.1", policy).ok).toBe(false);
    expect(checkHost(undefined, policy).ok).toBe(false);
  });
});

describe("checkOrigin (F2)", () => {
  it("accepts the daemon's own origin and the configured web origins", () => {
    expect(checkOrigin({ origin: "http://127.0.0.1:4317" }, policy)).toEqual({ ok: true });
    expect(checkOrigin({ origin: "http://localhost:4317" }, policy)).toEqual({ ok: true });
    expect(checkOrigin({ origin: "http://127.0.0.1:4318" }, policy)).toEqual({ ok: true });
  });

  it("refuses any other origin, including the opaque `null`", () => {
    for (const origin of ["http://evil.example", "http://127.0.0.1:9999", "null"]) {
      const verdict = checkOrigin({ origin }, policy);
      expect(verdict.ok, origin).toBe(false);
      if (!verdict.ok) expect(verdict.status).toBe(403);
    }
  });

  it("without Origin, refuses only the cross-site fetch metadata", () => {
    expect(checkOrigin({ "sec-fetch-site": "cross-site" }, policy).ok).toBe(false);
    for (const site of ["same-origin", "same-site", "none"]) {
      expect(checkOrigin({ "sec-fetch-site": site }, policy), site).toEqual({ ok: true });
    }
  });

  it("passes a request with no browser signal at all — curl, the e2e, the agent", () => {
    expect(checkOrigin({}, policy)).toEqual({ ok: true });
  });

  it("lets Origin decide when both headers come", () => {
    // A browser that says who it is is judged by that, not by the coarser hint.
    expect(
      checkOrigin({ origin: "http://127.0.0.1:4318", "sec-fetch-site": "cross-site" }, policy),
    ).toEqual({ ok: true });
  });
});

describe("needsOriginCheck", () => {
  it("applies to every upgrade, every unsafe method, and the effectful GET", () => {
    expect(needsOriginCheck({ method: "GET", pathname: "/pty", upgrade: true })).toBe(true);
    expect(needsOriginCheck({ method: "POST", pathname: "/trpc/x", upgrade: false })).toBe(true);
    expect(needsOriginCheck({ method: "OPTIONS", pathname: "/trpc/x", upgrade: false })).toBe(true);
    expect(needsOriginCheck({ method: "GET", pathname: "/memory/ask", upgrade: false })).toBe(true);
  });

  it("leaves a plain GET alone — it has no effect, and the browser cannot read it anyway", () => {
    expect(needsOriginCheck({ method: "GET", pathname: "/trpc/health", upgrade: false })).toBe(false);
    expect(needsOriginCheck({ method: "HEAD", pathname: "/", upgrade: false })).toBe(false);
  });
});

describe("judge", () => {
  it("checks Host before anything else", () => {
    const verdict = judge(
      request({ method: "POST", headers: { host: "evil.example:4317", origin: "http://127.0.0.1:4317" } }),
      policy,
    );
    expect(verdict).toMatchObject({ ok: false, status: 421 });
  });

  it("checks Origin only where it matters", () => {
    const crossSite = { host: "127.0.0.1:4317", "sec-fetch-site": "cross-site" };

    expect(judge(request({ headers: crossSite }), policy)).toEqual({ ok: true });
    expect(judge(request({ pathname: "/memory/ask", headers: crossSite }), policy)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(judge(request({ method: "POST", headers: crossSite }), policy)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(judge(request({ upgrade: true, headers: crossSite }), policy)).toMatchObject({
      ok: false,
      status: 403,
    });
  });
});

describe("parseWebOrigins", () => {
  it("falls back when the variable is unset or blank", () => {
    expect(parseWebOrigins(undefined, ["http://a"])).toEqual(["http://a"]);
    expect(parseWebOrigins("  ", ["http://a"])).toEqual(["http://a"]);
  });

  it("splits on commas, trims, drops empties and the trailing slash someone pasted", () => {
    expect(parseWebOrigins(" http://127.0.0.1:5001/, HTTP://localhost:5001 ,,", [])).toEqual([
      "http://127.0.0.1:5001",
      "http://localhost:5001",
    ]);
  });

  it("is what the allowlist is built from", () => {
    const allowed = allowedOrigins({ port: 4317, webOrigins: ["http://127.0.0.1:5001/"] });

    expect(allowed.has("http://127.0.0.1:5001")).toBe(true);
    expect(allowed.has("http://[::1]:4317")).toBe(true);
  });
});
