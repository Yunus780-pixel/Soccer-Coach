// The scoring brain of PANNA, in its own file so tests can examine it.

// Each drill type has its own ideal leg shape: juggling lifts the knee high,
// passing wants a firmer standing leg, dribbling stays low and bouncy.
export type FormRanges = { knee: [number, number]; hip: [number, number] };

export const RANGES_BY_CATEGORY: Record<string, FormRanges> = {
  juggling: { knee: [100, 150], hip: [140, 175] },
  shooting: { knee: [110, 160], hip: [145, 175] },
  dribbling: { knee: [110, 150], hip: [140, 170] },
  corver: { knee: [110, 150], hip: [140, 170] },
  passing: { knee: [125, 165], hip: [150, 175] },
};

export const DEFAULT_RANGES: FormRanges = { knee: [120, 160], hip: [150, 175] };

export interface PoseData {
  kneeAngle?: number | null;
  hipAngle?: number | null;
  ankleFlexion?: number | null;
  legExtension?: number | null;
  balanceScore?: number | null;
}

export interface ScoreResult {
  score: number;
  verdict: string;
  tips: string[];
  poseQuality: { kneeAlignment: string; hipStability: string; footContact: string };
}

// Scores ONLY what the camera actually measured. Components that weren't
// measured are excluded from the score and reported as "not measured" —
// the score is never padded with invented numbers.
export function scorePoseData(
  poseData: PoseData,
  repCount: number | null | undefined,
  ranges: FormRanges,
): ScoreResult {
  const tips: string[] = [];
  let earned = 0;
  let possible = 0;

  // How far a value sits outside [lo, hi]
  const distOutside = (value: number, lo: number, hi: number) =>
    value < lo ? lo - value : value > hi ? value - hi : 0;

  // Knee angle: ideal range depends on the drill, worth 40 points,
  // fading to 0 at 40° outside the range
  let kneeAlignment = "not measured";
  if (typeof poseData.kneeAngle === "number") {
    possible += 40;
    const dist = distOutside(poseData.kneeAngle, ranges.knee[0], ranges.knee[1]);
    earned += Math.round(40 * Math.max(0, 1 - dist / 40));
    if (dist === 0) {
      kneeAlignment = "excellent";
    } else if (poseData.kneeAngle < ranges.knee[0]) {
      kneeAlignment = "too bent";
      tips.push("Keep your knee at a wider angle when striking — avoid over-bending.");
    } else {
      kneeAlignment = "too straight";
      tips.push("Bend your knee more on contact to generate power and control.");
    }
  }

  // Hip angle (shoulder–hip–knee): upright posture, range depends on drill
  let hipStability = "not measured";
  if (typeof poseData.hipAngle === "number") {
    possible += 30;
    const dist = distOutside(poseData.hipAngle, ranges.hip[0], ranges.hip[1]);
    earned += Math.round(30 * Math.max(0, 1 - dist / 35));
    if (dist === 0) {
      hipStability = "stable";
    } else if (poseData.hipAngle < ranges.hip[0]) {
      hipStability = "bending forward";
      tips.push("Stand taller — keep your chest up over the ball.");
    } else {
      hipStability = "leaning back";
      tips.push("Lean slightly over the ball instead of away from it.");
    }
  }

  // Balance (0–1 from level hips + upright torso), worth 30 points
  if (typeof poseData.balanceScore === "number") {
    possible += 30;
    const balance = Math.max(0, Math.min(1, poseData.balanceScore));
    earned += Math.round(30 * balance);
    if (balance < 0.5) {
      tips.push("Work on your standing leg stability — plant your foot firmly before kicking.");
    }
  }

  // The camera can't see foot/ankle detail yet — say so instead of guessing
  const footContact = "not tracked yet";

  let score: number;
  if (possible > 0) {
    score = Math.round((earned / possible) * 100);
  } else {
    // No pose was measured at all — base a modest score on reps and be honest
    score = Math.max(10, Math.min(70, 30 + (repCount ?? 0) * 3));
    tips.push(
      "The camera couldn't track your body this time — stand back so your whole body is in view, with good lighting.",
    );
  }

  if (tips.length === 0) {
    tips.push("Great form! Keep your follow-through consistent.");
    tips.push("Focus on planting the standing foot firmly each rep.");
  }

  score = Math.max(0, Math.min(100, score));

  let verdict = "needs_work";
  if (score >= 85) verdict = "excellent";
  else if (score >= 70) verdict = "good";
  else if (score >= 50) verdict = "needs_work";
  else verdict = "poor";

  return {
    score,
    verdict,
    tips,
    poseQuality: { kneeAlignment, hipStability, footContact },
  };
}
