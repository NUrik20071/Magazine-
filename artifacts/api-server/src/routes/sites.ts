import { getAuth } from "@clerk/express";
import { db, pageBlocksTable, pageRevisionsTable, pagesTable, sitesTable, type PageRevisionSnapshot } from "@workspace/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
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


const revisionNumberSchema = z.coerce.number().int().positive().max(2_000_000_000);

async function getOwnedPage(pageId: string, ownerId: string) {
  const [result] = await db.select({ page: pagesTable })
    .from(pagesTable)
    .innerJoin(sitesTable, eq(pagesTable.siteId, sitesTable.id))
    .where(and(eq(pagesTable.id, pageId), eq(sitesTable.ownerId, ownerId)));
  return result?.page;
}

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
      status: "draft",
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
