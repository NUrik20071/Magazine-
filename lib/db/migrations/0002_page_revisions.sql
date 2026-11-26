-- Versioned immutable page snapshots. Existing page content remains in-place;
-- this migration only adds publication pointers and a new revisions table.
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS published_revision_number integer,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE pages
  ADD CONSTRAINT pages_published_revision_check
  CHECK (published_revision_number IS NULL OR published_revision_number > 0);

CREATE TABLE IF NOT EXISTS page_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  snapshot jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT page_revisions_number_check CHECK (revision_number > 0),
  CONSTRAINT page_revisions_snapshot_object_check CHECK (jsonb_typeof(snapshot) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS page_revisions_page_number_unique
  ON page_revisions (page_id, revision_number);
CREATE INDEX IF NOT EXISTS page_revisions_page_created_idx
  ON page_revisions (page_id, created_at);
