import { Router, type IRouter } from "express";
import { db, sessionsTable, drillsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  SubmitFeedbackParams,
  SubmitFeedbackBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function scorePoseData(poseData: {
  kneeAngle?: number | null;
  hipAngle?: number | null;
  ankleFlexion?: number | null;
  legExtension?: number | null;
  balanceScore?: number | null;
}): {
  score: number;
  verdict: string;
  tips: string[];
  poseQuality: { kneeAlignment: string; hipStability: string; footContact: string };
} {
  let score = 60;
  const tips: string[] = [];

  const kneeAngle = poseData.kneeAngle ?? 140;
  const hipAngle = poseData.hipAngle ?? 160;
  const balanceScore = poseData.balanceScore ?? 0.7;
  const ankleFlexion = poseData.ankleFlexion ?? 90;

  let kneeAlignment = "good";
  if (kneeAngle >= 120 && kneeAngle <= 160) {
    score += 15;
    kneeAlignment = "excellent";
  } else if (kneeAngle < 120) {
    score -= 10;
    kneeAlignment = "too bent";
    tips.push("Keep your knee at a wider angle when striking — avoid over-bending.");
  } else {
    score -= 5;
    kneeAlignment = "too straight";
    tips.push("Bend your knee more on contact to generate power and control.");
  }

  let hipStability = "good";
  if (hipAngle >= 150 && hipAngle <= 175) {
    score += 10;
    hipStability = "stable";
  } else if (hipAngle < 150) {
    score -= 8;
    hipStability = "rotating too much";
    tips.push("Stabilize your hip — reduce side rotation during the swing.");
  }

  let footContact = "good";
  if (ankleFlexion >= 80 && ankleFlexion <= 100) {
    score += 8;
    footContact = "excellent";
  } else {
    tips.push("Point your ankle downward (plantar flexion) on contact for a cleaner strike.");
    footContact = "needs adjustment";
  }

  if (balanceScore >= 0.8) {
    score += 7;
  } else if (balanceScore < 0.5) {
    score -= 10;
    tips.push("Work on your standing leg stability — plant your foot firmly before kicking.");
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

router.post("/sessions/:id/feedback", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = SubmitFeedbackParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SubmitFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, params.data.id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const result = scorePoseData(parsed.data.poseData ?? {});

  const feedbackSummary = `Score: ${result.score}/100 — ${result.verdict.replace("_", " ")}. ${result.tips[0] ?? ""}`;

  await db
    .update(sessionsTable)
    .set({
      score: result.score,
      feedbackSummary,
      status: "completed",
      completedAt: new Date(),
      repCount: parsed.data.repCount ?? session.repCount,
    })
    .where(eq(sessionsTable.id, params.data.id));

  res.status(201).json(result);
});

export default router;
