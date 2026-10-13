import {
  CreateProductBody,
  CreateProductResponse,
  DeleteProductParams,
  GetAdminOverviewResponse,
  GetProductParams,
  GetProductResponse,
  GetStoreSummaryResponse,
  ListAdminProductsResponse,
  ListProductsQueryParams,
  ListProductsResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
} from "@workspace/api-zod";
import { db, productsTable } from "@workspace/db";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { Router, type IRouter } from "express";

import { requireAdmin } from "../middlewares/adminAuth";

const router: IRouter = Router();

router.get("/products", async (req, res): Promise<void> => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions = [eq(productsTable.isActive, true)];
  const { search, category, featured } = parsed.data;
  if (category) conditions.push(eq(productsTable.category, category));
  if (featured !== undefined) {
    conditions.push(eq(productsTable.isFeatured, featured));
  }
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(
      or(ilike(productsTable.name, term), ilike(productsTable.description, term))!,
    );
  }

  const products = await db
    .select()
    .from(productsTable)
    .where(and(...conditions))
    .orderBy(desc(productsTable.isFeatured), asc(productsTable.createdAt));

  res.json(ListProductsResponse.parse(products));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.isActive, true)));

  if (!product) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  res.json(GetProductResponse.parse(product));
});

router.get("/store/summary", async (_req, res): Promise<void> => {
  const products = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.isActive, true))
    .orderBy(desc(productsTable.isFeatured), asc(productsTable.createdAt));
  const categoryNames = [...new Set(products.map((product) => product.category))];

  res.json(
    GetStoreSummaryResponse.parse({
      productCount: products.length,
      categoryCount: categoryNames.length,
      categoryNames,
      featuredProducts: products.filter((product) => product.isFeatured).slice(0, 4),
    }),
  );
});

router.get("/admin/overview", requireAdmin, async (_req, res): Promise<void> => {
  const products = await db.select().from(productsTable);
  const categoryCount = new Set(products.map((product) => product.category)).size;
  const activeProducts = products.filter((product) => product.isActive).length;

  res.json(
    GetAdminOverviewResponse.parse({
      totalProducts: products.length,
      activeProducts,
      inactiveProducts: products.length - activeProducts,
      categoryCount,
    }),
  );
});

router.get("/admin/products", requireAdmin, async (_req, res): Promise<void> => {
  const products = await db
    .select()
    .from(productsTable)
    .orderBy(desc(productsTable.createdAt));
  res.json(ListAdminProductsResponse.parse(products));
});

router.post("/admin/products", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [product] = await db
      .insert(productsTable)
      .values({
        ...parsed.data,
        badge: parsed.data.badge ?? null,
        isFeatured: parsed.data.isFeatured ?? false,
        isActive: parsed.data.isActive ?? true,
      })
      .returning();
    res.status(201).json(CreateProductResponse.parse(product));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(400).json({ error: "A product with this slug already exists." });
      return;
    }
    throw error;
  }
});

router.patch("/admin/products/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    res.status(400).json({
      error: parsed.success ? "At least one product field is required." : parsed.error.message,
    });
    return;
  }

  try {
    const [product] = await db
      .update(productsTable)
      .set(parsed.data)
      .where(eq(productsTable.id, params.data.id))
      .returning();

    if (!product) {
      res.status(404).json({ error: "Product not found." });
      return;
    }

    res.json(UpdateProductResponse.parse(product));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(400).json({ error: "A product with this slug already exists." });
      return;
    }
    throw error;
  }
});

router.delete("/admin/products/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [product] = await db
    .delete(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .returning({ id: productsTable.id });

  if (!product) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  res.sendStatus(204);
});

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export default router;
