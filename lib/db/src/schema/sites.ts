import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** A tenant-owned website. It has no dependency on commerce or storefront settings. */
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

export const insertSiteSchema = createInsertSchema(sitesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Site = typeof sitesTable.$inferSelect;
export type InsertSite = z.infer<typeof insertSiteSchema>;
