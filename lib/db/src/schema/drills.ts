import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const drillsTable = pgTable("drills", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  difficulty: text("difficulty").notNull(),
  description: text("description").notNull(),
  keyPoints: text("key_points").array().notNull().default([]),
  targetLegMotion: text("target_leg_motion").notNull(),
  durationSeconds: integer("duration_seconds").notNull().default(60),
  thumbnailEmoji: text("thumbnail_emoji"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDrillSchema = createInsertSchema(drillsTable).omit({ id: true, createdAt: true });
export type InsertDrill = z.infer<typeof insertDrillSchema>;
export type Drill = typeof drillsTable.$inferSelect;
