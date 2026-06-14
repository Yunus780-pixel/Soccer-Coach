import { describe, it, expect } from "vitest";
import { editDistance, fuzzyScore } from "./fuzzy";

describe("editDistance — counting letter fixes", () => {
  it("identical words need zero fixes", () => {
    expect(editDistance("juggling", "juggling")).toBe(0);
    expect(editDistance("", "")).toBe(0);
  });

  it("counts adds, removes and swaps", () => {
    expect(editDistance("toe", "toes")).toBe(1); // one add
    expect(editDistance("taps", "tap")).toBe(1); // one remove
    expect(editDistance("ball", "bell")).toBe(1); // one swap
    expect(editDistance("juglin", "juggling")).toBe(2);
  });

  it("an empty word costs the other word's full length", () => {
    expect(editDistance("", "kick")).toBe(4);
    expect(editDistance("kick", "")).toBe(4);
  });
});

describe("fuzzyScore — typo-forgiving search", () => {
  it("empty query matches everything perfectly", () => {
    expect(fuzzyScore("", "Juggling Starter")).toBe(0);
  });

  it("exact text inside is a perfect match, ignoring UPPER/lower case", () => {
    expect(fuzzyScore("juggling", "Juggling Starter")).toBe(0);
    expect(fuzzyScore("JUGGLING", "juggling starter")).toBe(0);
  });

  it("forgives typos: 'juglin' still finds 'Juggling Starter'", () => {
    expect(fuzzyScore("juglin", "Juggling Starter")).not.toBeNull();
    expect(fuzzyScore("powr strik", "Power Strike Form")).not.toBeNull();
    expect(fuzzyScore("kne bounse", "Knee Bounce Combo")).not.toBeNull();
  });

  it("typing the start of a word counts as very close", () => {
    const score = fuzzyScore("jug", "Juggling Starter");
    expect(score).not.toBeNull();
    expect(score!).toBeLessThanOrEqual(1);
  });

  it("totally different words do NOT match", () => {
    expect(fuzzyScore("banana", "Juggling Starter")).toBeNull();
    expect(fuzzyScore("xyz", "Toe Taps")).toBeNull();
  });

  it("closer spellings get better (lower) scores for ranking", () => {
    const exact = fuzzyScore("juggling", "Juggling Starter")!;
    const typo = fuzzyScore("jugling", "Juggling Starter")!;
    expect(exact).toBeLessThan(typo);
  });

  it("multi-word queries work, even with typos in each word", () => {
    expect(fuzzyScore("jugling starter", "Juggling Starter")).not.toBeNull();
    expect(fuzzyScore("wal pas", "Wall Pass Precision")).not.toBeNull();
  });
});
