// Fills the sessions table with 3000 practice sessions from pretend athletes,
// spread over the past year — so the Sessions page, search, leaderboard and
// stats have lots of data to work with.
import { db, drillsTable, sessionsTable } from "./index";

const TOTAL = 3000;
const BATCH_SIZE = 500;

// Each athlete gets a skill level so the leaderboard looks realistic:
// strong players score high most days, beginners wobble more.
const ATHLETES: Array<{ name: string; skill: number }> = [
  { name: "LEO", skill: 88 }, { name: "MIA", skill: 84 },
  { name: "ZARA", skill: 81 }, { name: "OMAR", skill: 79 },
  { name: "KAI", skill: 77 }, { name: "LUNA", skill: 75 },
  { name: "MATEO", skill: 74 }, { name: "AISHA", skill: 72 },
  { name: "NOAH", skill: 70 }, { name: "YARA", skill: 69 },
  { name: "DIEGO", skill: 67 }, { name: "SOFIA", skill: 66 },
  { name: "EMRE", skill: 64 }, { name: "LINA", skill: 63 },
  { name: "MARCUS", skill: 61 }, { name: "TARIQ", skill: 60 },
  { name: "ELLA", skill: 58 }, { name: "HUGO", skill: 57 },
  { name: "AMARA", skill: 55 }, { name: "FINN", skill: 53 },
  { name: "NADIA", skill: 52 }, { name: "RAYAN", skill: 50 },
  { name: "IVY", skill: 48 }, { name: "MUSA", skill: 46 },
  { name: "CHLOE", skill: 44 },
];

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function verdictFor(score: number): string {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "needs_work";
  return "poor";
}

const existing = await db.select({ id: sessionsTable.id }).from(sessionsTable);
if (existing.length > 1000) {
  console.log(
    `There are already ${existing.length} sessions — not adding more. ` +
      "(Delete .pglite-data and re-run push + seed + seed-sessions for a fresh start.)",
  );
  process.exit(0);
}

const drills = await db.select().from(drillsTable);
if (drills.length === 0) {
  console.error("No drills found — run `pnpm --filter @workspace/db run seed` first.");
  process.exit(1);
}

const now = Date.now();
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

type NewSession = typeof sessionsTable.$inferInsert;
const rows: NewSession[] = [];

for (let i = 0; i < TOTAL; i++) {
  const athlete = pick(ATHLETES);
  const drill = pick(drills);
  const startedAt = new Date(now - Math.random() * YEAR_MS);
  const isCompleted = Math.random() > 0.08; // a few abandoned sessions, like real life

  if (!isCompleted) {
    rows.push({
      drillId: drill.id,
      drillName: drill.name,
      playerName: athlete.name,
      startedAt,
      status: "active",
    });
    continue;
  }

  // Score near the athlete's skill, with everyday ups and downs
  const wobble = (Math.random() + Math.random() - 1) * 18;
  const score = Math.round(clamp(athlete.skill + wobble, 10, 100));
  const repCount = Math.round(drill.durationSeconds * (0.2 + Math.random() * 0.8));
  const completedAt = new Date(
    startedAt.getTime() + drill.durationSeconds * 1000 + Math.random() * 60_000,
  );

  rows.push({
    drillId: drill.id,
    drillName: drill.name,
    playerName: athlete.name,
    startedAt,
    completedAt,
    status: "completed",
    score,
    feedbackSummary: verdictFor(score),
    repCount,
  });
}

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  await db.insert(sessionsTable).values(rows.slice(i, i + BATCH_SIZE));
  console.log(`Inserted ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} sessions...`);
}

console.log(`Done! ${TOTAL} practice sessions added across ${ATHLETES.length} athletes. 🏟️`);
process.exit(0);
