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

/**
 * Platform core: a site belongs to one Clerk user. Commerce data is deliberately
 * not referenced here, so a site can exist without products or storefront config.
 */
export const sitesTable = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: text("status").notNull().default("draft"),
    domain: text("domain"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerSlugUnique: uniqueIndex("sites_owner_slug_unique").on(table.ownerId, table.slug),
    domainUnique: uniqueIndex("sites_domain_unique").on(table.domain).where(sql`${table.domain} IS NOT NULL`),
    ownerCreatedIndex: index("sites_owner_created_idx").on(table.ownerId, table.createdAt),
    statusCheck: check("sites_status_check", sql`${table.status} IN ('draft', 'published', 'archived')`),
  }),
);

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    siteSlugUnique: uniqueIndex("pages_site_slug_unique").on(table.siteId, table.slug),
    siteOrderIndex: index("pages_site_order_idx").on(table.siteId, table.sortOrder),
    statusCheck: check("pages_status_check", sql`${table.status} IN ('draft', 'published')`),
  }),
);

export const pageBlocksTable = pgTable(
  "page_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id").notNull().references(() => pagesTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    position: integer("position").notNull().default(0),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pagePositionIndex: index("page_blocks_page_position_idx").on(table.pageId, table.position),
    versionPositive: check("page_blocks_schema_version_check", sql`${table.schemaVersion} > 0`),
    configObject: check("page_blocks_config_object_check", sql`jsonb_typeof(${table.config}) = 'object'`),
  }),
);

export const insertSiteSchema = createInsertSchema(sitesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertPageSchema = createInsertSchema(pagesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertPageBlockSchema = createInsertSchema(pageBlocksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Site = typeof sitesTable.$inferSelect;
export type InsertSite = z.infer<typeof insertSiteSchema>;
export type Page = typeof pagesTable.$inferSelect;
export type InsertPage = z.infer<typeof insertPageSchema>;
export type PageBlock = typeof pageBlocksTable.$inferSelect;
export type InsertPageBlock = z.infer<typeof insertPageBlockSchema>;
