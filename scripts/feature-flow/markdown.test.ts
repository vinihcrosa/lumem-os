/** The shared reading, where it differs from what JavaScript would do by default. */
import { describe, expect, it } from "vitest";
import { findTables, firstTable, re, sectionBounds, splitRow, stripChars, stripFences } from "./markdown.js";

describe("re — Python's Unicode \\b and \\w", () => {
  it("does not see a boundary between two letters, accented or not", () => {
    // JavaScript's own `\b` would match here: `á` is not an ASCII word character.
    expect(/^## Problem\b/i.test("## Problemática")).toBe(true);
    expect(re(String.raw`^## Problem\b`, "i").test("## Problemática")).toBe(false);
    expect(re(String.raw`^## Problem\b`, "i").test("## Problem Statement")).toBe(true);
  });

  it("reads an accented word as one \\w run", () => {
    expect(re(String.raw`^\w+$`).test("ação")).toBe(true);
  });
});

describe("helpers", () => {
  it("stripChars strips any of the characters from both ends, like str.strip(chars)", () => {
    expect(stripChars(" - — the reason: ", " -–—:")).toBe("the reason");
  });

  it("splitRow keeps an empty last cell, which is how a blank column is seen", () => {
    expect(splitRow("| a | b |  |")).toEqual(["a", "b", ""]);
  });

  it("stripFences blanks fenced lines, keeps the count, and keeps the kinds asked for", () => {
    const lines = ["a", "```mermaid", "x", "```", "```", "y", "```", "b"];
    expect(stripFences(lines, ["mermaid"])).toEqual(["a", "", "x", "", "", "", "", "b"]);
    expect(stripFences(lines)).toHaveLength(lines.length);
  });

  it("a section runs to the next level-1 or level-2 heading, not level 3", () => {
    const lines = ["## A", "### sub", "x", "## B"];
    expect(sectionBounds(lines, "A")).toEqual({ start: 1, end: 3 });
  });

  it("firstTable reads only the first table of the section, with 1-based lines", () => {
    const lines = ["## S", "| h |", "| - |", "| 1 |", "", "| 2 |", "text", "| other |", "| - |", "| 3 |"];
    expect(firstTable(lines, sectionBounds(lines, "S"))).toEqual([
      { cells: ["1"], line: 4 },
      { cells: ["2"], line: 6 },
    ]);
  });

  it("findTables lowercases the header and drops a table with no data row", () => {
    const tables = findTables(["| Killed |", "| --- |", "| yes |", "", "| Lonely |"]);
    expect(tables).toEqual([{ header: ["killed"], rows: [{ cells: ["yes"], line: 3 }] }]);
  });
});
