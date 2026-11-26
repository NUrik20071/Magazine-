import { getAuth } from "@clerk/express";
import { db, pageBlocksTable, pagesTable, sitesTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { z } from "zod/v4";

const router: IRouter = Router();

const uuidSchema = z.string().uuid();
const slugSchema = z.string().trim().min(1).max(80).regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  "Slug must contain lowercase letters, numbers, and single hyphens.",
);
const createSiteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
});
const updateSiteSchema = createSiteSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field must be provided.",
);
const createPageSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: slugSchema,
});
const createBlockSchema = z.object({
  type: z.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9._-]*$/),
  schemaVersion: z.number().int().positive().max(100).default(1),
  position: z.number().int().min(0).max(100_000).default(0),
  config: z.record(z.string(), z.unknown()).default({}),
});

function authenticatedOwnerId(req: Request): string | null {
  if (!process.env.CLERK_SECRET_KEY?.trim()) return null;
  return getAuth(req).userId ?? null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

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

router.get("/sites/:siteId/pages", async (req, res): Promise<void> => {
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

  const [site] = await db.select({ id: sitesTable.id }).from(sitesTable).where(and(
    eq(sitesTable.id, id.data),
    eq(sitesTable.ownerId, ownerId),
  ));
  if (!site) {
    res.status(404).json({ error: "Site not found." });
    return;
  }
  const pages = await db.select().from(pagesTable)
    .where(eq(pagesTable.siteId, site.id))
    .orderBy(asc(pagesTable.sortOrder), asc(pagesTable.createdAt));
  res.json({ data: pages });
});

router.post("/sites/:siteId/pages", async (req, res): Promise<void> => {
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
  const parsed = createPageSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ error: !id.success ? "Invalid site ID." : parsed.error?.flatten() ?? "Invalid request body." });
    return;
  }

  const [site] = await db.select({ id: sitesTable.id }).from(sitesTable).where(and(
    eq(sitesTable.id, id.data),
    eq(sitesTable.ownerId, ownerId),
  ));
  if (!site) {
    res.status(404).json({ error: "Site not found." });
    return;
  }

  try {
    const [page] = await db.insert(pagesTable).values({
      siteId: site.id,
      title: parsed.data.title,
      slug: parsed.data.slug,
    }).returning();
    res.status(201).json({ data: page });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: "A page with this slug already exists in this site." });
      return;
    }
    throw error;
  }
});

router.get("/pages/:pageId/blocks", async (req, res): Promise<void> => {
  if (!process.env.CLERK_SECRET_KEY?.trim()) {
    res.status(503).json({ error: "Authentication is not configured." });
    return;
  }
  const ownerId = authenticatedOwnerId(req);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const id = uuidSchema.safeParse(req.params.pageId);
  if (!id.success) {
    res.status(400).json({ error: "Invalid page ID." });
    return;
  }

  const [ownedPage] = await db.select({ id: pagesTable.id })
    .from(pagesTable)
    .innerJoin(sitesTable, eq(pagesTable.siteId, sitesTable.id))
    .where(and(eq(pagesTable.id, id.data), eq(sitesTable.ownerId, ownerId)));
  if (!ownedPage) {
    res.status(404).json({ error: "Page not found." });
    return;
  }

  const blocks = await db.select().from(pageBlocksTable)
    .where(eq(pageBlocksTable.pageId, ownedPage.id))
    .orderBy(asc(pageBlocksTable.position), asc(pageBlocksTable.createdAt));
  res.json({ data: blocks });
});

router.post("/pages/:pageId/blocks", async (req, res): Promise<void> => {
  if (!process.env.CLERK_SECRET_KEY?.trim()) {
    res.status(503).json({ error: "Authentication is not configured." });
    return;
  }
  const ownerId = authenticatedOwnerId(req);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const id = uuidSchema.safeParse(req.params.pageId);
  const parsed = createBlockSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ error: !id.success ? "Invalid page ID." : parsed.error?.flatten() ?? "Invalid request body." });
    return;
  }

  const [ownedPage] = await db.select({ id: pagesTable.id })
    .from(pagesTable)
    .innerJoin(sitesTable, eq(pagesTable.siteId, sitesTable.id))
    .where(and(eq(pagesTable.id, id.data), eq(sitesTable.ownerId, ownerId)));
  if (!ownedPage) {
    res.status(404).json({ error: "Page not found." });
    return;
  }

  const [block] = await db.insert(pageBlocksTable).values({
    pageId: ownedPage.id,
    type: parsed.data.type,
    schemaVersion: parsed.data.schemaVersion,
    position: parsed.data.position,
    config: parsed.data.config,
  }).returning();
  res.status(201).json({ data: block });
});

export default router;
