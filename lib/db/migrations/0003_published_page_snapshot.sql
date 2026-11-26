-- Keep the public URL and metadata pinned to the published revision.
-- Draft edits may change pages.slug/seo without changing the live site.
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS published_slug text;

UPDATE pages
SET published_slug = page_revisions.snapshot #>> '{page,slug}'
FROM page_revisions
WHERE page_revisions.page_id = pages.id
  AND page_revisions.revision_number = pages.published_revision_number
  AND pages.status = 'published'
  AND pages.published_revision_number IS NOT NULL
  AND pages.published_slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pages_site_published_slug_unique
  ON pages (site_id, published_slug)
  WHERE published_slug IS NOT NULL;
