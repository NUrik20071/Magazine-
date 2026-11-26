import { z } from "zod";

export const platformIdSchema = z.string().uuid();
export const platformSlugSchema = z.string().trim().min(1).max(80).regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  "Slug must contain lowercase letters, numbers, and single hyphens.",
);

export const createSiteBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: platformSlugSchema,
});
export const updateSiteBodySchema = createSiteBodySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field must be provided.",
);

export const createPageBodySchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: platformSlugSchema,
});
export const updatePageBodySchema = createPageBodySchema.partial().extend({
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  seo: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const createPageBlockBodySchema = z.object({
  type: z.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9._-]*$/),
  schemaVersion: z.number().int().positive().max(100).default(1),
  position: z.number().int().min(0).max(100_000).default(0),
  config: z.record(z.string(), z.unknown()).default({}),
});
export const updatePageBlockBodySchema = createPageBlockBodySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required.",
);

export const pageRevisionNumberSchema = z.coerce.number().int().positive().max(2_000_000_000);

export type CreateSiteBody = z.infer<typeof createSiteBodySchema>;
export type UpdateSiteBody = z.infer<typeof updateSiteBodySchema>;
export type CreatePageBody = z.infer<typeof createPageBodySchema>;
export type UpdatePageBody = z.infer<typeof updatePageBodySchema>;
export type CreatePageBlockBody = z.infer<typeof createPageBlockBodySchema>;
export type UpdatePageBlockBody = z.infer<typeof updatePageBlockBodySchema>;
