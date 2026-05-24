import { Router, type IRouter } from "express";
import { db, drillsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListDrillsResponse,
  GetDrillParams,
  GetDrillResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/drills", async (req, res): Promise<void> => {
  const drills = await db.select().from(drillsTable).orderBy(drillsTable.id);
  res.json(ListDrillsResponse.parse(drills));
});

router.get("/drills/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetDrillParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [drill] = await db
    .select()
    .from(drillsTable)
    .where(eq(drillsTable.id, params.data.id));

  if (!drill) {
    res.status(404).json({ error: "Drill not found" });
    return;
  }

  res.json(GetDrillResponse.parse(drill));
});

export default router;
