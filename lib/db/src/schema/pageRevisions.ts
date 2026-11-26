import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { pagesTable } from "./pages";

export type PageRevisionSnapshot = {
  page: {
    title: string;
    slug: string;
    sortOrder: number;
    seo: Record<string, unknown>;
  };
  blocks: Array<{
    type: string;
    schemaVersion: number;
    position: number;
    config: Record<string, unknown>;
  }>;
};

/** Append-only by application contract: edits/restores create new snapshots. */
export const pageRevisionsTable = pgTable(
  "page_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id").notNull().references(() => pagesTable.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    snapshot: jsonb("snapshot").$type<PageRevisionSnapshot>().notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pageRevisionUnique: uniqueIndex("page_revisions_page_number_unique").on(table.pageId, table.revisionNumber),
    pageCreatedIndex: index("page_revisions_page_created_idx").on(table.pageId, table.createdAt),
    revisionPositive: check("page_revisions_number_check", sql`${table.revisionNumber} > 0`),
    snapshotObject: check("page_revisions_snapshot_object_check", sql`jsonb_typeof(${table.snapshot}) = 'object'`),
  }),
);
export type PageRevision = typeof pageRevisionsTable.$inferSelect;
