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
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sitesTable } from "./sites";

export const pagesTable = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sitesTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    status: text("status").notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    seo: jsonb("seo").$type<Record<string, unknown>>().notNull().default({}),
    publishedRevisionNumber: integer("published_revision_number"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    siteSlugUnique: uniqueIndex("pages_site_slug_unique").on(table.siteId, table.slug),
    siteOrderIndex: index("pages_site_order_idx").on(table.siteId, table.sortOrder),
    statusCheck: check("pages_status_check", sql`${table.status} IN ('draft', 'published')`),
    publishedRevisionCheck: check(
      "pages_published_revision_check",
      sql`${table.publishedRevisionNumber} IS NULL OR ${table.publishedRevisionNumber} > 0`,
    ),
  }),
);

export const insertPageSchema = createInsertSchema(pagesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Page = typeof pagesTable.$inferSelect;
export type InsertPage = z.infer<typeof insertPageSchema>;
