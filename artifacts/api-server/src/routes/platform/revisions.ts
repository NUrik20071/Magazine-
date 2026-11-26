import { db, pageBlocksTable, pageRevisionsTable, pagesTable, sitesTable, type PageRevisionSnapshot } from "@workspace/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { pageRevisionNumberSchema as revisionNumberSchema, platformIdSchema as uuidSchema } from "@workspace/api-zod";
import { authenticatedOwnerId, getOwnedPage } from "./shared";

const router: IRouter = Router();

router.get("/pages/:pageId/revisions", async (req, res): Promise<void> => {
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
  const page = await getOwnedPage(id.data, ownerId);
  if (!page) {
    res.status(404).json({ error: "Page not found." });
    return;
  }
  const revisions = await db.select({
    id: pageRevisionsTable.id,
    revisionNumber: pageRevisionsTable.revisionNumber,
    createdBy: pageRevisionsTable.createdBy,
    createdAt: pageRevisionsTable.createdAt,
  }).from(pageRevisionsTable)
    .where(eq(pageRevisionsTable.pageId, page.id))
    .orderBy(desc(pageRevisionsTable.revisionNumber));
  res.json({ data: revisions });
});

router.post("/pages/:pageId/revisions", async (req, res): Promise<void> => {
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

  const revision = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM pages WHERE id = ${id.data} FOR UPDATE`);
    const [result] = await tx.select({ page: pagesTable })
      .from(pagesTable)
      .innerJoin(sitesTable, eq(pagesTable.siteId, sitesTable.id))
      .where(and(eq(pagesTable.id, id.data), eq(sitesTable.ownerId, ownerId)));
    if (!result) return null;

    const blocks = await tx.select().from(pageBlocksTable)
      .where(eq(pageBlocksTable.pageId, result.page.id))
      .orderBy(asc(pageBlocksTable.position), asc(pageBlocksTable.createdAt));
    const [latest] = await tx.select({ revisionNumber: pageRevisionsTable.revisionNumber })
      .from(pageRevisionsTable)
      .where(eq(pageRevisionsTable.pageId, result.page.id))
      .orderBy(desc(pageRevisionsTable.revisionNumber))
      .limit(1);
    const snapshot: PageRevisionSnapshot = {
      page: {
        title: result.page.title,
        slug: result.page.slug,
        sortOrder: result.page.sortOrder,
        seo: result.page.seo,
      },
      blocks: blocks.map((block) => ({
        type: block.type,
        schemaVersion: block.schemaVersion,
        position: block.position,
        config: block.config,
      })),
    };
    const [created] = await tx.insert(pageRevisionsTable).values({
      pageId: result.page.id,
      revisionNumber: (latest?.revisionNumber ?? 0) + 1,
      snapshot,
      createdBy: ownerId,
    }).returning();
    return created;
  });

  if (!revision) {
    res.status(404).json({ error: "Page not found." });
    return;
  }
  res.status(201).json({ data: revision });
});

router.post("/pages/:pageId/publish", async (req, res): Promise<void> => {
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

  const published = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM pages WHERE id = ${id.data} FOR UPDATE`);
    const [result] = await tx.select({ page: pagesTable })
      .from(pagesTable)
      .innerJoin(sitesTable, eq(pagesTable.siteId, sitesTable.id))
      .where(and(eq(pagesTable.id, id.data), eq(sitesTable.ownerId, ownerId)));
    if (!result) return null;

    const blocks = await tx.select().from(pageBlocksTable)
      .where(eq(pageBlocksTable.pageId, result.page.id))
      .orderBy(asc(pageBlocksTable.position), asc(pageBlocksTable.createdAt));
    const [latest] = await tx.select({ revisionNumber: pageRevisionsTable.revisionNumber })
      .from(pageRevisionsTable)
      .where(eq(pageRevisionsTable.pageId, result.page.id))
      .orderBy(desc(pageRevisionsTable.revisionNumber))
      .limit(1);
    const revisionNumber = (latest?.revisionNumber ?? 0) + 1;
    const snapshot: PageRevisionSnapshot = {
      page: {
        title: result.page.title,
        slug: result.page.slug,
        sortOrder: result.page.sortOrder,
        seo: result.page.seo,
      },
      blocks: blocks.map((block) => ({
        type: block.type,
        schemaVersion: block.schemaVersion,
        position: block.position,
        config: block.config,
      })),
    };
    const [revision] = await tx.insert(pageRevisionsTable).values({
      pageId: result.page.id,
      revisionNumber,
      snapshot,
      createdBy: ownerId,
    }).returning();
    const [page] = await tx.update(pagesTable).set({
      status: "published",
      publishedRevisionNumber: revisionNumber,
      publishedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(pagesTable.id, result.page.id)).returning();
    return { page, revision };
  });

  if (!published) {
    res.status(404).json({ error: "Page not found." });
    return;
  }
  res.json({ data: published });
});

router.post("/pages/:pageId/restore/:revisionNumber", async (req, res): Promise<void> => {
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
  const revisionNumber = revisionNumberSchema.safeParse(req.params.revisionNumber);
  if (!id.success || !revisionNumber.success) {
    res.status(400).json({ error: "Invalid page ID or revision number." });
    return;
  }

  const restored = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM pages WHERE id = ${id.data} FOR UPDATE`);
    const [result] = await tx.select({ page: pagesTable })
      .from(pagesTable)
      .innerJoin(sitesTable, eq(pagesTable.siteId, sitesTable.id))
      .where(and(eq(pagesTable.id, id.data), eq(sitesTable.ownerId, ownerId)));
    if (!result) return { kind: "missing-page" as const };

    const [source] = await tx.select().from(pageRevisionsTable).where(and(
      eq(pageRevisionsTable.pageId, result.page.id),
      eq(pageRevisionsTable.revisionNumber, revisionNumber.data),
    ));
    if (!source) return { kind: "missing-revision" as const };

    await tx.delete(pageBlocksTable).where(eq(pageBlocksTable.pageId, result.page.id));
    if (source.snapshot.blocks.length > 0) {
      await tx.insert(pageBlocksTable).values(source.snapshot.blocks.map((block) => ({
        pageId: result.page.id,
        type: block.type,
        schemaVersion: block.schemaVersion,
        position: block.position,
        config: block.config,
      })));
    }
    const [page] = await tx.update(pagesTable).set({
      title: source.snapshot.page.title,
      slug: source.snapshot.page.slug,
      sortOrder: source.snapshot.page.sortOrder,
      seo: source.snapshot.page.seo,
      updatedAt: new Date(),
    }).where(eq(pagesTable.id, result.page.id)).returning();

    const blocks = await tx.select().from(pageBlocksTable)
      .where(eq(pageBlocksTable.pageId, page.id))
      .orderBy(asc(pageBlocksTable.position), asc(pageBlocksTable.createdAt));
    const [latest] = await tx.select({ revisionNumber: pageRevisionsTable.revisionNumber })
      .from(pageRevisionsTable)
      .where(eq(pageRevisionsTable.pageId, page.id))
      .orderBy(desc(pageRevisionsTable.revisionNumber))
      .limit(1);
    const snapshot: PageRevisionSnapshot = {
      page: {
        title: page.title,
        slug: page.slug,
        sortOrder: page.sortOrder,
        seo: page.seo,
      },
      blocks: blocks.map((block) => ({
        type: block.type,
        schemaVersion: block.schemaVersion,
        position: block.position,
        config: block.config,
      })),
    };
    const [revision] = await tx.insert(pageRevisionsTable).values({
      pageId: page.id,
      revisionNumber: (latest?.revisionNumber ?? 0) + 1,
      snapshot,
      createdBy: ownerId,
    }).returning();
    return { kind: "restored" as const, page, revision };
  });

  if (restored.kind === "missing-page") {
    res.status(404).json({ error: "Page not found." });
    return;
  }
  if (restored.kind === "missing-revision") {
    res.status(404).json({ error: "Revision not found." });
    return;
  }
  res.json({ data: restored });
});

export default router;
