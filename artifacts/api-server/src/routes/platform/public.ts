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
    page: {
      id: pagesTable.id,
      title: pagesTable.title,
      slug: pagesTable.slug,
      seo: pagesTable.seo,
      publishedAt: pagesTable.publishedAt,
    },
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
      eq(pagesTable.slug, pageSlug.data),
      eq(pagesTable.status, "published"),
    ));

  if (!published) {
    res.status(404).json({ error: "Published page not found." });
    return;
  }
  res.json({ data: published });
});

export default router;
