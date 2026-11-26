import { Router, type IRouter } from "express";
import blocksRouter from "./blocks";
import pagesRouter from "./pages";
import publicRouter from "./public";
import revisionsRouter from "./revisions";
import sitesRouter from "./sites";

const router: IRouter = Router();

router.use(publicRouter);
router.use(sitesRouter);
router.use(pagesRouter);
router.use(blocksRouter);
router.use(revisionsRouter);

export default router;
