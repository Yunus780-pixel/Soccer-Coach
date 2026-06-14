import { Router, type IRouter } from "express";
import { db, activityTable, sessionsTable } from "@workspace/db";
import { count, sql } from "drizzle-orm";

const router: IRouter = Router();

// ── Live presence: who is using the app *right now* ────────────────────────
// Kept in memory (resets on restart, single-instance) — that's fine for a
// real-time "online now" view. Durable history lives in the activity table.
interface LiveEntry {
  name: string;
  drill: string;
  lastSeen: number;
}
const live = new Map<string, LiveEntry>();
const LIVE_TTL_MS = 35_000; // counted as "online" if seen within this window

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

// Client heartbeat — called every ~15s while the app is open.
router.post("/presence", async (req, res): Promise<void> => {
  const { clientId, name, drill } = req.body ?? {};
  if (!clientId || typeof clientId !== "string") {
    res.status(400).json({ error: "clientId required" });
    return;
  }
  const safeName = typeof name === "string" && name.trim() ? name.trim().slice(0, 40) : "Anonymous";
  const safeDrill = typeof drill === "string" && drill.trim() ? drill.trim().slice(0, 60) : "Browsing";

  live.set(clientId, { name: safeName, drill: safeDrill, lastSeen: Date.now() });

  try {
    const now = new Date();
    await db
      .insert(activityTable)
      .values({ clientId, name: safeName, day: utcDay(now), drill: safeDrill, firstSeen: now, lastSeen: now, pings: 1 })
      .onConflictDoUpdate({
        target: [activityTable.clientId, activityTable.day],
        set: { name: safeName, drill: safeDrill, lastSeen: now, pings: sql`${activityTable.pings} + 1` },
      });
  } catch {
    // Never fail a heartbeat on a transient DB hiccup; live presence still works.
  }
  res.json({ ok: true });
});

// Everyone online right now (with the drill/activity they're on).
router.get("/monitor/live", (req, res): void => {
  const now = Date.now();
  const users: { name: string; drill: string; secondsAgo: number }[] = [];
  for (const [id, e] of live) {
    if (now - e.lastSeen > LIVE_TTL_MS) {
      live.delete(id);
      continue;
    }
    users.push({ name: e.name, drill: e.drill, secondsAgo: Math.round((now - e.lastSeen) / 1000) });
  }
  users.sort((a, b) => a.secondsAgo - b.secondsAgo);
  res.json({ count: users.length, users, serverTime: new Date().toISOString() });
});

// Usage over time: distinct visitors per day + training sessions per day.
router.get("/monitor/history", async (req, res): Promise<void> => {
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? "14"), 10) || 14, 1), 60);

  const visitorRows = await db
    .select({ day: activityTable.day, visitors: count(activityTable.id) })
    .from(activityTable)
    .groupBy(activityTable.day);

  const sessionRows = await db
    .select({
      day: sql<string>`to_char(${sessionsTable.startedAt}, 'YYYY-MM-DD')`,
      sessions: count(sessionsTable.id),
    })
    .from(sessionsTable)
    .groupBy(sql`to_char(${sessionsTable.startedAt}, 'YYYY-MM-DD')`);

  const vMap = new Map(visitorRows.map((r) => [r.day, Number(r.visitors)]));
  const sMap = new Map(sessionRows.map((r) => [r.day, Number(r.sessions)]));

  const out: { day: string; visitors: number; sessions: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const key = utcDay(d);
    out.push({ day: key, visitors: vMap.get(key) ?? 0, sessions: sMap.get(key) ?? 0 });
  }
  res.json({ days: out });
});

export default router;
