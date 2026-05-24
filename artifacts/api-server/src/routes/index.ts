import { Router, type IRouter } from "express";
import healthRouter from "./health";
import drillsRouter from "./drills";
import sessionsRouter from "./sessions";
import feedbackRouter from "./feedback";

const router: IRouter = Router();

router.use(healthRouter);
router.use(drillsRouter);
router.use(sessionsRouter);
router.use(feedbackRouter);

export default router;
