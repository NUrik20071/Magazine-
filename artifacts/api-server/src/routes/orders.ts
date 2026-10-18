import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middlewares/adminAuth";

const router: IRouter = Router();
let tableReady: Promise<unknown> | undefined;

function ensureOrdersTable() {
  tableReady ??= pool.query(`
    CREATE TABLE IF NOT EXISTS store_orders (
      id BIGSERIAL PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT NOT NULL DEFAULT '',
      delivery_address TEXT NOT NULL,
      customer_note TEXT NOT NULL DEFAULT '',
      items JSONB NOT NULL,
      total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      moderation_note TEXT NOT NULL DEFAULT '',
      user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  return tableReady;
}

router.post("/orders", async (req, res): Promise<void> => {
  const { customerName, phone, email, address, note, items } = req.body ?? {};
  if (typeof customerName !== "string" || customerName.trim().length < 2 ||
      customerName.trim().length > 120 ||
      typeof phone !== "string" || phone.trim().length < 5 || phone.length > 40 ||
      typeof address !== "string" || address.trim().length < 5 || address.length > 500 ||
      (email !== undefined && (typeof email !== "string" || email.length > 254)) ||
      (note !== undefined && (typeof note !== "string" || note.length > 1000)) ||
      !Array.isArray(items) || items.length < 1 || items.length > 50) {
    res.status(400).json({ error: "Проверьте контактные данные и состав заказа." });
    return;
  }

  const quantities = new Map<number, number>();
  for (const item of items) {
    if (!item || !Number.isSafeInteger(item.productId) || item.productId < 1 ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      res.status(400).json({ error: "Некорректный состав заказа." });
      return;
    }
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }

  try {
    await ensureOrdersTable();
    const ids = [...quantities.keys()];
    const found = await pool.query(
      "SELECT id, name, price, image_url FROM products WHERE id = ANY($1::int[]) AND is_active = TRUE",
      [ids],
    );
    if (found.rows.length !== ids.length) {
      res.status(409).json({ error: "Некоторые товары уже недоступны. Обновите корзину." });
      return;
    }

    let total = 0;
    for (const product of found.rows) {
      const quantity = quantities.get(product.id)!;
      total += Number(product.price) * quantity;
    }
    if (!Number.isSafeInteger(total) || total < 0 || total > 2_000_000_000) {
      res.status(400).json({ error: "Слишком большая сумма заказа." });
      return;
    }

    const { userId } = getAuth(req);
    const inserted = await pool.query(
      `INSERT INTO store_orders
       (customer_name, customer_phone, customer_email, delivery_address, customer_note, items, total_amount, user_id)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
       RETURNING id, status, created_at`,
      [customerName.trim(), phone.trim(), typeof email === "string" ? email.trim() : "",
       address.trim(), typeof note === "string" ? note.trim() : "",
       JSON.stringify(found.rows.map((p: {id:number; name:string; price:number; image_url:string}) => ({
         productId: p.id, name: p.name, price: Number(p.price), imageUrl: p.image_url,
         quantity: quantities.get(p.id),
       }))), total, userId ?? null],
    );
    res.status(201).json({
      id: inserted.rows[0].id,
      status: inserted.rows[0].status,
      createdAt: inserted.rows[0].created_at,
      total,
      message: "Заявка отправлена на проверку. Заказ ещё не подтверждён.",
    });
  } catch (error) {
    req.log.error({ err: error }, "Unable to create store order");
    res.status(500).json({ error: "Не удалось отправить заказ. Попробуйте ещё раз." });
  }
});

router.get("/admin/orders", requireAdmin, async (req, res): Promise<void> => {
  try {
    await ensureOrdersTable();
    const status = typeof req.query.status === "string" ? req.query.status : "";
    if (status && !["pending", "approved", "rejected"].includes(status)) {
      res.status(400).json({ error: "Некорректный статус заказа." });
      return;
    }
    const result = status
      ? await pool.query("SELECT * FROM store_orders WHERE status = $1 ORDER BY created_at DESC LIMIT 200", [status])
      : await pool.query("SELECT * FROM store_orders ORDER BY created_at DESC LIMIT 200");
    res.json(result.rows);
  } catch (error) {
    req.log.error({ err: error }, "Unable to list store orders");
    res.status(500).json({ error: "Не удалось загрузить заказы." });
  }
});

router.patch("/admin/orders/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { customerName, phone, email = "", address, note = "", items } = req.body ?? {};
  if (!Number.isSafeInteger(id) || id < 1 ||
      typeof customerName !== "string" || customerName.trim().length < 2 || customerName.length > 120 ||
      typeof phone !== "string" || phone.trim().length < 5 || phone.length > 40 ||
      typeof email !== "string" || email.length > 254 ||
      typeof address !== "string" || address.trim().length < 5 || address.length > 500 ||
      typeof note !== "string" || note.length > 1000 ||
      !Array.isArray(items) || items.length < 1 || items.length > 50) {
    res.status(400).json({ error: "Проверьте имя, контакты, адрес и состав заказа." });
    return;
  }
  try {
    await ensureOrdersTable();
    const current = await pool.query("SELECT items FROM store_orders WHERE id = $1", [id]);
    if (!current.rows[0]) { res.status(404).json({ error: "Заказ не найден." }); return; }
    const originalItems = Array.isArray(current.rows[0].items) ? current.rows[0].items : [];
    const byProduct = new Map<number, any>(originalItems.map((item: any) => [Number(item.productId), item]));
    const seen = new Set<number>();
    const nextItems: any[] = [];
    for (const item of items) {
      const productId = Number(item?.productId);
      const quantity = Number(item?.quantity);
      if (!Number.isSafeInteger(productId) || !byProduct.has(productId) ||
          !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99 || seen.has(productId)) {
        res.status(400).json({ error: "Изменять можно количество товаров из исходного заказа; количество — от 1 до 99." });
        return;
      }
      seen.add(productId);
      nextItems.push({ ...byProduct.get(productId), quantity });
    }
    const total = nextItems.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    if (!Number.isSafeInteger(total) || total < 0 || total > 2_000_000_000) {
      res.status(400).json({ error: "Некорректная итоговая сумма." }); return;
    }
    const result = await pool.query(
      `UPDATE store_orders SET customer_name=$1, customer_phone=$2, customer_email=$3,
       delivery_address=$4, customer_note=$5, items=$6::jsonb, total_amount=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [customerName.trim(), phone.trim(), email.trim(), address.trim(), note.trim(), JSON.stringify(nextItems), total, id],
    );
    res.json(result.rows[0]);
  } catch (error) {
    req.log.error({ err: error }, "Unable to edit store order");
    res.status(500).json({ error: "Не удалось сохранить изменения заказа." });
  }
});

router.patch("/admin/orders/:id/moderation", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { status, moderationNote = "" } = req.body ?? {};
  if (!Number.isSafeInteger(id) || id < 1 ||
      !["approved", "rejected"].includes(status) ||
      typeof moderationNote !== "string" || moderationNote.length > 1000) {
    res.status(400).json({ error: "Проверьте решение модерации." });
    return;
  }
  try {
    await ensureOrdersTable();
    const result = await pool.query(
      `UPDATE store_orders SET status = $1, moderation_note = $2, updated_at = NOW()
       WHERE id = $3 AND status = 'pending' RETURNING id, status, moderation_note, updated_at`,
      [status, moderationNote.trim(), id],
    );
    if (!result.rowCount) {
      res.status(409).json({ error: "Заказ не найден или уже обработан." });
      return;
    }
    res.json(result.rows[0]);
  } catch (error) {
    req.log.error({ err: error }, "Unable to moderate store order");
    res.status(500).json({ error: "Не удалось обновить статус заказа." });
  }
});

export default router;
