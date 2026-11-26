import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pagesTable } from "./pages";

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

export const insertPageBlockSchema = createInsertSchema(pageBlocksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type PageBlock = typeof pageBlocksTable.$inferSelect;
export type InsertPageBlock = z.infer<typeof insertPageBlockSchema>;
