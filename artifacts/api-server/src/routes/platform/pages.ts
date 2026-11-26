import { db, pagesTable, sitesTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  createPageBodySchema as createPageSchema,
  platformIdSchema as uuidSchema,
  updatePageBodySchema as updatePageSchema,
} from "@workspace/api-zod";
import { authenticatedOwnerId, getOwnedPage, isUniqueConstraintError } from "./shared";

const router: IRouter = Router();

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

router.patch("/pages/:pageId", async (req, res): Promise<void> => {
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
  const parsed = updatePageSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ error: !id.success ? "Invalid page ID." : parsed.error?.flatten() ?? "Invalid request body." });
    return;
  }
  const ownedPage = await getOwnedPage(id.data, ownerId);
  if (!ownedPage) {
    res.status(404).json({ error: "Page not found." });
    return;
  }
  try {
    const [page] = await db.update(pagesTable).set({
      ...parsed.data,
      updatedAt: new Date(),
    }).where(eq(pagesTable.id, ownedPage.id)).returning();
    res.json({ data: page });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: "A page with this slug already exists in this site." });
      return;
    }
    throw error;
  }
});

router.delete("/pages/:pageId", async (req, res): Promise<void> => {
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
  const ownedPage = await getOwnedPage(id.data, ownerId);
  if (!ownedPage) {
    res.status(404).json({ error: "Page not found." });
    return;
  }
  await db.delete(pagesTable).where(eq(pagesTable.id, ownedPage.id));
  res.sendStatus(204);
});

export default router;
