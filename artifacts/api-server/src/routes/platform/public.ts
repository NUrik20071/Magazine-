import { db, pageRevisionsTable, pagesTable, sitesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { platformIdSchema as uuidSchema, platformSlugSchema as slugSchema } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/public/sites/:siteId/pages/:pageSlug", async (req, res): Promise<void> => {
  const siteId = uuidSchema.safeParse(req.params.siteId);
  const pageSlug = slugSchema.safeParse(req.params.pageSlug);
  if (!siteId.success || !pageSlug.success) {
    res.status(400).json({ error: "Invalid site ID or page slug." });
    return;
  }

  const [published] = await db.select({
    site: {
      id: sitesTable.id,
      name: sitesTable.name,
      slug: sitesTable.slug,
    },
    pageId: pagesTable.id,
    publishedAt: pagesTable.publishedAt,
    revisionNumber: pageRevisionsTable.revisionNumber,
    content: pageRevisionsTable.snapshot,
  }).from(sitesTable)
    .innerJoin(pagesTable, eq(pagesTable.siteId, sitesTable.id))
    .innerJoin(pageRevisionsTable, and(
      eq(pageRevisionsTable.pageId, pagesTable.id),
      eq(pageRevisionsTable.revisionNumber, pagesTable.publishedRevisionNumber),
    ))
    .where(and(
      eq(sitesTable.id, siteId.data),
      eq(pagesTable.publishedSlug, pageSlug.data),
      eq(pagesTable.status, "published"),
    ));

  if (!published) {
    res.status(404).json({ error: "Published page not found." });
    return;
  }

  // Public metadata and content must come from the same immutable snapshot.
  // Mutable page fields represent the current draft and must never leak before publish.
  res.json({
    data: {
      site: published.site,
      page: {
        id: published.pageId,
        title: published.content.page.title,
        slug: published.content.page.slug,
        seo: published.content.page.seo,
        publishedAt: published.publishedAt,
      },
      revisionNumber: published.revisionNumber,
      content: published.content,
    },
  });
});

export default router;
