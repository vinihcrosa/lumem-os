import { describe, expect, it } from "vitest";

import { absoluteStamp, agoOf, daysAgo, relativeAge } from "./relative-time.js";

describe("relativeAge", () => {
  const now = Date.parse("2026-09-21T12:00:00Z");

  it("collapses anything under a minute to agora", () => {
    expect(relativeAge("2026-09-21T11:59:30Z", now)).toBe("agora");
  });

  it("counts minutes under an hour", () => {
    expect(relativeAge("2026-09-21T11:55:00Z", now)).toBe("5 min");
  });

  it("counts hours under a day", () => {
    expect(relativeAge("2026-09-21T09:00:00Z", now)).toBe("3 h");
  });

  it("counts days past that", () => {
    expect(relativeAge("2026-09-19T12:00:00Z", now)).toBe("2 d");
  });

  it("returns empty for an unparsable instant", () => {
    expect(relativeAge("not-a-date", now)).toBe("");
  });
});

describe("agoOf", () => {
  it("shows seconds under a minute, where relativeAge would say agora", () => {
    expect(agoOf(3_000)).toBe("3 s");
  });

  it("shows minutes under an hour", () => {
    expect(agoOf(600_000)).toBe("10 min");
  });

  it("shows hours under a day", () => {
    expect(agoOf(4 * 3_600_000)).toBe("4 h");
  });

  it("shows days past that", () => {
    expect(agoOf(2 * 86_400_000)).toBe("2 d");
  });
});

describe("daysAgo", () => {
  it("names today instead of counting zero", () => {
    expect(daysAgo(new Date(Date.now() - 3_600_000))).toBe("hoje");
  });

  it("names yesterday instead of counting one", () => {
    expect(daysAgo(new Date(Date.now() - 25 * 3_600_000))).toBe("ontem");
  });

  it("counts every day after that", () => {
    expect(daysAgo(new Date(Date.now() - 5 * 86_400_000 - 3_600_000))).toBe("há 5 dias");
  });
});

describe("absoluteStamp", () => {
  // Asserting the exact ICU punctuation ("21/09" vs "21/09,") would couple
  // the test to the Node version's CLDR data rather than to the behaviour
  // this function actually decides — which fields show, and as digits or as
  // a word. `Conversation.test.tsx` avoids the same trap with a regex on
  // "retomada" instead of the formatted date.
  it("renders day, hour and minute, with the month as digits by default", () => {
    const stamp = absoluteStamp(new Date("2026-09-21T09:02:00"));
    expect(stamp).toContain("21");
    expect(stamp).toContain("09:02");
    expect(stamp).not.toMatch(/[a-zà-ú]/i);
  });

  it("renders the month as a word when asked", () => {
    const stamp = absoluteStamp(new Date("2026-09-21T09:02:00"), "short");
    expect(stamp).toContain("21");
    expect(stamp).toContain("09:02");
    expect(stamp.toLowerCase()).toContain("set");
  });

  it("accepts a string or a millisecond number, not only a Date", () => {
    const asDate = absoluteStamp(new Date("2026-09-21T09:02:00"));
    const asString = absoluteStamp("2026-09-21T09:02:00");
    const asNumber = absoluteStamp(new Date("2026-09-21T09:02:00").getTime());
    expect(asString).toBe(asDate);
    expect(asNumber).toBe(asDate);
  });
});
