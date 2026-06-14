import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// One row per visitor (anonymous client id) per UTC day — powers the "usage
// over time" history. Live "who's online right now" is tracked in-memory in
// the API (see routes/monitor.ts); this table is the durable record.
export const activityTable = pgTable(
  "activity",
  {
    id: serial("id").primaryKey(),
    clientId: text("client_id").notNull(),
    name: text("name").notNull().default("Anonymous"),
    day: text("day").notNull(), // YYYY-MM-DD in UTC
    drill: text("drill"), // most recent activity/drill that day
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
    pings: integer("pings").notNull().default(1),
  },
  (t) => ({
    clientDay: uniqueIndex("activity_client_day_unq").on(t.clientId, t.day),
  }),
);

export type Activity = typeof activityTable.$inferSelect;
