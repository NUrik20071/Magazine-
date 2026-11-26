import { getAuth } from "@clerk/express";
import { db, pagesTable, sitesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { Request } from "express";

export function authenticatedOwnerId(req: Request): string | null {
  if (!process.env.CLERK_SECRET_KEY?.trim()) return null;
  return getAuth(req).userId ?? null;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function getOwnedPage(pageId: string, ownerId: string) {
  const [result] = await db.select({ page: pagesTable })
    .from(pagesTable)
    .innerJoin(sitesTable, eq(pagesTable.siteId, sitesTable.id))
    .where(and(eq(pagesTable.id, pageId), eq(sitesTable.ownerId, ownerId)));
  return result?.page;
};
