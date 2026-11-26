import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import ordersRouter from "./orders";
import storefrontSettingsRouter from "./storefrontSettings";
import mediaRouter from "./media";
import mediaResolveRouter from "./mediaResolve";
import aiCodeRouter from "./aiCode";
import sitesRouter from "./sites";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(ordersRouter);
router.use(storefrontSettingsRouter);
router.use(mediaRouter);
router.use(mediaResolveRouter);
router.use(aiCodeRouter);
router.use(sitesRouter);

export default router;
