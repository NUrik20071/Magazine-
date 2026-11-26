import { db, pageBlocksTable, pagesTable, sitesTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  createPageBlockBodySchema as createBlockSchema,
  platformIdSchema as uuidSchema,
  updatePageBlockBodySchema as updateBlockSchema,
} from "@workspace/api-zod";
import { authenticatedOwnerId, getOwnedPage } from "./shared";

const router: IRouter = Router();

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

router.patch("/pages/:pageId/blocks/:blockId", async (req, res): Promise<void> => {
  if (!process.env.CLERK_SECRET_KEY?.trim()) {
    res.status(503).json({ error: "Authentication is not configured." });
    return;
  }
  const ownerId = authenticatedOwnerId(req);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const pageId = uuidSchema.safeParse(req.params.pageId);
  const blockId = uuidSchema.safeParse(req.params.blockId);
  const parsed = updateBlockSchema.safeParse(req.body);
  if (!pageId.success || !blockId.success || !parsed.success) {
    res.status(400).json({ error: "Invalid page ID, block ID, or block payload." });
    return;
  }
  const ownedPage = await getOwnedPage(pageId.data, ownerId);
  if (!ownedPage) {
    res.status(404).json({ error: "Page not found." });
    return;
  }
  const [block] = await db.update(pageBlocksTable).set({
    ...parsed.data,
    updatedAt: new Date(),
  }).where(and(
    eq(pageBlocksTable.id, blockId.data),
    eq(pageBlocksTable.pageId, ownedPage.id),
  )).returning();
  if (!block) {
    res.status(404).json({ error: "Block not found." });
    return;
  }
  res.json({ data: block });
});

router.delete("/pages/:pageId/blocks/:blockId", async (req, res): Promise<void> => {
  if (!process.env.CLERK_SECRET_KEY?.trim()) {
    res.status(503).json({ error: "Authentication is not configured." });
    return;
  }
  const ownerId = authenticatedOwnerId(req);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const pageId = uuidSchema.safeParse(req.params.pageId);
  const blockId = uuidSchema.safeParse(req.params.blockId);
  if (!pageId.success || !blockId.success) {
    res.status(400).json({ error: "Invalid page ID or block ID." });
    return;
  }
  const ownedPage = await getOwnedPage(pageId.data, ownerId);
  if (!ownedPage) {
    res.status(404).json({ error: "Page not found." });
    return;
  }
  const [deleted] = await db.delete(pageBlocksTable).where(and(
    eq(pageBlocksTable.id, blockId.data),
    eq(pageBlocksTable.pageId, ownedPage.id),
  )).returning({ id: pageBlocksTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Block not found." });
    return;
  }
  res.sendStatus(204);
});

export default router;
