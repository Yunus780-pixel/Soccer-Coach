import { Router, type IRouter } from "express";
import { db, sessionsTable, drillsTable } from "@workspace/db";
import { eq, desc, avg, count, sql } from "drizzle-orm";
import {
  ListSessionsResponse,
  CreateSessionBody,
  GetSessionParams,
  GetSessionResponse,
  UpdateSessionParams,
  UpdateSessionBody,
  UpdateSessionResponse,
  GetLeaderboardResponse,
  GetStatsSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeSession(session: Record<string, unknown>) {
  return {
    ...session,
    startedAt: session.startedAt instanceof Date ? session.startedAt.toISOString() : session.startedAt,
    completedAt: session.completedAt instanceof Date ? session.completedAt.toISOString() : session.completedAt ?? null,
  };
}

router.get("/sessions", async (req, res): Promise<void> => {
  const sessions = await db
    .select()
    .from(sessionsTable)
    .orderBy(desc(sessionsTable.startedAt));
  res.json(ListSessionsResponse.parse(sessions.map(serializeSession)));
});

router.post("/sessions", async (req, res): Promise<void> => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [drill] = await db
    .select()
    .from(drillsTable)
    .where(eq(drillsTable.id, parsed.data.drillId));

  if (!drill) {
    res.status(404).json({ error: "Drill not found" });
    return;
  }

  const [session] = await db
    .insert(sessionsTable)
    .values({
      drillId: parsed.data.drillId,
      drillName: drill.name,
      playerName: parsed.data.playerName,
      status: "active",
    })
    .returning();

  res.status(201).json(GetSessionResponse.parse(serializeSession(session)));
});

router.get("/sessions/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetSessionParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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

  res.json(GetSessionResponse.parse(serializeSession(session)));
});

router.patch("/sessions/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateSessionParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "completed" && !parsed.data.completedAt) {
    updateData.completedAt = new Date();
  }

  const [session] = await db
    .update(sessionsTable)
    .set(updateData)
    .where(eq(sessionsTable.id, params.data.id))
    .returning();

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json(UpdateSessionResponse.parse(serializeSession(session)));
});

router.get("/leaderboard", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      playerName: sessionsTable.playerName,
      totalSessions: count(sessionsTable.id),
      avgScore: avg(sessionsTable.score),
    })
    .from(sessionsTable)
    .where(sql`${sessionsTable.status} = 'completed' AND ${sessionsTable.score} IS NOT NULL`)
    .groupBy(sessionsTable.playerName)
    .orderBy(desc(avg(sessionsTable.score)))
    .limit(20);

  const leaderboard = await Promise.all(
    rows.map(async (row, index) => {
      const bestDrillRow = await db
        .select({ drillName: sessionsTable.drillName })
        .from(sessionsTable)
        .where(
          sql`${sessionsTable.playerName} = ${row.playerName} AND ${sessionsTable.score} IS NOT NULL`
        )
        .orderBy(desc(sessionsTable.score))
        .limit(1);

      return {
        rank: index + 1,
        playerName: row.playerName,
        totalSessions: Number(row.totalSessions),
        avgScore: Math.round(Number(row.avgScore ?? 0)),
        bestDrill: bestDrillRow[0]?.drillName ?? "N/A",
      };
    })
  );

  res.json(GetLeaderboardResponse.parse(leaderboard));
});

router.get("/stats/summary", async (req, res): Promise<void> => {
  const [totals] = await db
    .select({
      totalSessions: count(sessionsTable.id),
      avgScore: avg(sessionsTable.score),
    })
    .from(sessionsTable)
    .where(sql`${sessionsTable.status} = 'completed'`);

  const [playerCountRow] = await db
    .select({ totalPlayers: sql<number>`count(distinct ${sessionsTable.playerName})` })
    .from(sessionsTable);

  const [topDrillRow] = await db
    .select({
      drillName: sessionsTable.drillName,
      cnt: count(sessionsTable.id),
    })
    .from(sessionsTable)
    .groupBy(sessionsTable.drillName)
    .orderBy(desc(count(sessionsTable.id)))
    .limit(1);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [todayRow] = await db
    .select({ completedToday: count(sessionsTable.id) })
    .from(sessionsTable)
    .where(sql`${sessionsTable.startedAt} >= ${today}`);

  const summary = {
    totalSessions: Number(totals?.totalSessions ?? 0),
    avgScore: Math.round(Number(totals?.avgScore ?? 0)),
    totalPlayers: Number(playerCountRow?.totalPlayers ?? 0),
    topDrill: topDrillRow?.drillName ?? "Corver Kick Precision",
    completedToday: Number(todayRow?.completedToday ?? 0),
  };

  res.json(GetStatsSummaryResponse.parse(summary));
});

export default router;
