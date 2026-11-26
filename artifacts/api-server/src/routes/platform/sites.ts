import { db, sitesTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  createSiteBodySchema as createSiteSchema,
  platformIdSchema as uuidSchema,
  updateSiteBodySchema as updateSiteSchema,
} from "@workspace/api-zod";
import { authenticatedOwnerId, isUniqueConstraintError } from "./shared";

const router: IRouter = Router();

router.get("/sites", async (req, res): Promise<void> => {
  if (!process.env.CLERK_SECRET_KEY?.trim()) {
    res.status(503).json({ error: "Authentication is not configured." });
    return;
  }
  const ownerId = authenticatedOwnerId(req);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const sites = await db.select().from(sitesTable)
    .where(eq(sitesTable.ownerId, ownerId))
    .orderBy(asc(sitesTable.createdAt));
  res.json({ data: sites });
});

router.post("/sites", async (req, res): Promise<void> => {
  if (!process.env.CLERK_SECRET_KEY?.trim()) {
    res.status(503).json({ error: "Authentication is not configured." });
    return;
  }
  const ownerId = authenticatedOwnerId(req);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const parsed = createSiteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error?.flatten() ?? "Invalid request body." });
    return;
  }

  try {
    const [site] = await db.insert(sitesTable).values({
      ownerId,
      name: parsed.data.name,
      slug: parsed.data.slug,
    }).returning();
    res.status(201).json({ data: site });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: "You already have a site with this slug." });
      return;
    }
    throw error;
  }
});

router.get("/sites/:siteId", async (req, res): Promise<void> => {
  if (!process.env.CLERK_SECRET_KEY?.trim()) {
    res.status(503).json({ error: "Authentication is not configured." });
    return;
  }
  const ownerId = authenticatedOwnerId(req);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const id = uuidSchema.safeParse(req.params.siteId);
  if (!id.success) {
    res.status(400).json({ error: "Invalid site ID." });
    return;
  }

  const [site] = await db.select().from(sitesTable).where(and(
    eq(sitesTable.id, id.data),
    eq(sitesTable.ownerId, ownerId),
  ));
  if (!site) {
    res.status(404).json({ error: "Site not found." });
    return;
  }
  res.json({ data: site });
});

router.patch("/sites/:siteId", async (req, res): Promise<void> => {
  if (!process.env.CLERK_SECRET_KEY?.trim()) {
    res.status(503).json({ error: "Authentication is not configured." });
    return;
  }
  const ownerId = authenticatedOwnerId(req);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const id = uuidSchema.safeParse(req.params.siteId);
  const parsed = updateSiteSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ error: !id.success ? "Invalid site ID." : parsed.error?.flatten() ?? "Invalid request body." });
    return;
  }

  try {
    const [site] = await db.update(sitesTable).set({
      ...parsed.data,
      updatedAt: new Date(),
    }).where(and(
      eq(sitesTable.id, id.data),
      eq(sitesTable.ownerId, ownerId),
    )).returning();
    if (!site) {
      res.status(404).json({ error: "Site not found." });
      return;
    }
    res.json({ data: site });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: "You already have a site with this slug." });
      return;
    }
    throw error;
  }
});

export default router;
