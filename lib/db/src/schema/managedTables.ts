import { sql } from "drizzle-orm";
import {
  bigserial,
  bytea,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// These tables are also created by the API's idempotent CREATE TABLE IF NOT EXISTS
// helpers. Declaring them here prevents drizzle-kit push from treating them as
// unmanaged tables and proposing destructive drops on every Render startup.
export const storefrontSettingsTable = pgTable(
  "storefront_settings",
  {
    id: integer("id").primaryKey(),
    config: jsonb("config").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idMustBeOne: check("storefront_settings_id_check", sql`${table.id} = 1`),
  }),
);

export const storeOrdersTable = pgTable(
  "store_orders",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email").notNull().default(""),
    deliveryAddress: text("delivery_address").notNull(),
    customerNote: text("customer_note").notNull().default(""),
    items: jsonb("items").notNull(),
    totalAmount: integer("total_amount").notNull(),
    status: text("status").notNull().default("pending"),
    moderationNote: text("moderation_note").notNull().default(""),
    userId: text("user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    totalAmountNonnegative: check("store_orders_total_amount_check", sql`${table.totalAmount} >= 0`),
    statusAllowed: check("store_orders_status_check", sql`${table.status} IN ('pending', 'approved', 'rejected')`),
  }),
);

export const siteMediaTable = pgTable("site_media", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  data: bytea("data").notNull(),
  byteSize: integer("byte_size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
