import { pool } from "@workspace/db";
import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Liveness: the process is running. This must not depend on optional services.
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Readiness: only route traffic here when PostgreSQL is reachable.
router.get("/readyz", async (_req, res): Promise<void> => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ready", dependencies: { database: "ok" } });
  } catch {
    res.status(503).json({ status: "not_ready", dependencies: { database: "unavailable" } });
  }
});

export default router;
