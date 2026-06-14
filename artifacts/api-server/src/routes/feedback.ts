import { Router, type IRouter } from "express";
import { db, sessionsTable, drillsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  SubmitFeedbackParams,
  SubmitFeedbackBody,
} from "@workspace/api-zod";
import { scorePoseData, RANGES_BY_CATEGORY, DEFAULT_RANGES } from "../lib/scoring";

const router: IRouter = Router();

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

  // Score against the ideal form for THIS drill's category
  const [drill] = await db
    .select()
    .from(drillsTable)
    .where(eq(drillsTable.id, parsed.data.drillId));
  const ranges = RANGES_BY_CATEGORY[drill?.category ?? ""] ?? DEFAULT_RANGES;

  const result = scorePoseData(parsed.data.poseData ?? {}, parsed.data.repCount, ranges);

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
