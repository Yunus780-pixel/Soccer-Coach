import { describe, it, expect } from "vitest";
import {
  scorePoseData,
  RANGES_BY_CATEGORY,
  DEFAULT_RANGES,
} from "./scoring";

describe("scorePoseData — honest AI scoring", () => {
  it("gives a top score for perfect form", () => {
    const result = scorePoseData(
      { kneeAngle: 140, hipAngle: 160, balanceScore: 1 },
      20,
      DEFAULT_RANGES,
    );
    expect(result.score).toBe(100);
    expect(result.verdict).toBe("excellent");
    expect(result.poseQuality.kneeAlignment).toBe("excellent");
    expect(result.poseQuality.hipStability).toBe("stable");
  });

  it("calls out an over-bent knee with a tip", () => {
    const result = scorePoseData(
      { kneeAngle: 95, hipAngle: 160, balanceScore: 0.9 },
      10,
      DEFAULT_RANGES,
    );
    expect(result.poseQuality.kneeAlignment).toBe("too bent");
    expect(result.tips.join(" ")).toContain("knee");
  });

  it("calls out a too-straight knee", () => {
    const result = scorePoseData(
      { kneeAngle: 178, hipAngle: 160, balanceScore: 0.9 },
      10,
      DEFAULT_RANGES,
    );
    expect(result.poseQuality.kneeAlignment).toBe("too straight");
  });

  it("worse form always scores lower than better form", () => {
    const good = scorePoseData(
      { kneeAngle: 140, hipAngle: 160, balanceScore: 0.9 },
      10,
      DEFAULT_RANGES,
    );
    const bad = scorePoseData(
      { kneeAngle: 95, hipAngle: 130, balanceScore: 0.4 },
      10,
      DEFAULT_RANGES,
    );
    expect(bad.score).toBeLessThan(good.score);
  });

  it("NEVER invents data: unmeasured components say 'not measured'", () => {
    const result = scorePoseData({}, 12, DEFAULT_RANGES);
    expect(result.poseQuality.kneeAlignment).toBe("not measured");
    expect(result.poseQuality.hipStability).toBe("not measured");
    expect(result.tips.join(" ")).toContain("camera");
  });

  it("with no pose at all, score comes modestly from reps (and is capped)", () => {
    expect(scorePoseData({}, 0, DEFAULT_RANGES).score).toBe(30);
    expect(scorePoseData({}, 12, DEFAULT_RANGES).score).toBe(66);
    expect(scorePoseData({}, 1000, DEFAULT_RANGES).score).toBe(70); // capped
  });

  it("admits the foot can't be tracked yet", () => {
    const result = scorePoseData(
      { kneeAngle: 140, hipAngle: 160, balanceScore: 1 },
      5,
      DEFAULT_RANGES,
    );
    expect(result.poseQuality.footContact).toBe("not tracked yet");
  });

  it("scores the same pose differently per drill type (juggling vs passing)", () => {
    const pose = { kneeAngle: 105, hipAngle: 160, balanceScore: 0.85 };
    const juggling = scorePoseData(pose, 15, RANGES_BY_CATEGORY["juggling"]);
    const passing = scorePoseData(pose, 15, RANGES_BY_CATEGORY["passing"]);
    expect(juggling.poseQuality.kneeAlignment).toBe("excellent"); // high knee is great for juggling
    expect(passing.poseQuality.kneeAlignment).toBe("too bent"); // passing wants a firmer leg
    expect(juggling.score).toBeGreaterThan(passing.score);
  });

  it("warns about wobbly balance", () => {
    const result = scorePoseData(
      { kneeAngle: 140, hipAngle: 160, balanceScore: 0.3 },
      10,
      DEFAULT_RANGES,
    );
    expect(result.tips.join(" ")).toContain("standing leg");
  });

  it("score always stays between 0 and 100, with matching verdicts", () => {
    const cases = [
      { pose: { kneeAngle: 140, hipAngle: 160, balanceScore: 1 }, verdict: "excellent" },
      { pose: { kneeAngle: 10, hipAngle: 60, balanceScore: 0 }, verdict: "poor" },
    ];
    for (const c of cases) {
      const result = scorePoseData(c.pose, 10, DEFAULT_RANGES);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.verdict).toBe(c.verdict);
    }
  });
});
