import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middlewares/adminAuth";

const router: IRouter = Router();

const defaults = {
  theme: {
    background: "#f5f1e8", text: "#244c43", accent: "#244c43", accentText: "#fffaf1",
    cardBackground: "#fffdf7", gradient: "linear-gradient(135deg, #f5f1e8 0%, #e5ded0 100%)",
    font: "DM Sans", headingFont: "Cormorant Garamond", cardRadius: 8, cardColumns: 3,
    imageRatio: "4 / 5", animation: "lift", animationDuration: 240, colorAnimation: false,
  },
  content: {
    announcement: "Доставка по Казахстану · бесплатно от 35 000 ₸",
    heroEyebrow: "Маленькая коллекция для дома", heroTitle: "Жить\nчуть тише.",
    heroText: "Вещи, которые не требуют внимания — только становятся частью хорошего дня. Собираем их небольшими партиями.",
    heroImage: "/images/orbit-vase.png", heroImageLink: "", heroButtonText: "Смотреть коллекцию",
    storyTitle: "Не больше.\nЛучше.", storyText: "«Тихо» — маленький магазин вещей, которые приятно держать рядом.",
  },
  blocks: [] as Array<Record<string, unknown>>,
};

async function ensureSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS storefront_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      config JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    "INSERT INTO storefront_settings (id, config) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING",
    [JSON.stringify(defaults)],
  );
}

function validUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 2000) return false;
  if (!value.trim()) return true;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  if (value.startsWith("#")) return true;
  try {
    const parsed = new URL(value);
    return ["https:", "http:", "mailto:", "tel:"].includes(parsed.protocol);
  } catch { return false; }
}

function validConfig(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const config = value as Record<string, any>;
  if (!config.theme || typeof config.theme !== "object" || !config.content || typeof config.content !== "object" || !Array.isArray(config.blocks)) return false;
  if (config.content.heroImageLink !== undefined && !validUrl(config.content.heroImageLink)) return false;
  if (config.content.heroImage !== undefined && !validUrl(config.content.heroImage)) return false;
  if (config.blocks.length > 40) return false;
  const allowedTypes = new Set(["text", "image", "video", "audio", "button", "embed"]);
  for (const block of config.blocks) {
    if (!block || typeof block !== "object" || !allowedTypes.has(block.type)) return false;
    if (typeof block.id !== "string" || block.id.length > 80) return false;
    for (const key of ["url", "mediaUrl"]) if (block[key] !== undefined && !validUrl(block[key])) return false;
    for (const key of ["title", "text", "label", "url", "mediaUrl", "background", "color", "width", "animation"]) {
      if (block[key] !== undefined && (typeof block[key] !== "string" || block[key].length > 4000)) return false;
    }
  }
  return true;
}

router.get("/storefront/settings", async (_req, res): Promise<void> => {
  await ensureSettingsTable();
  const { rows } = await pool.query("SELECT config FROM storefront_settings WHERE id = 1");
  res.json(rows[0]?.config ?? defaults);
});

router.put("/admin/storefront/settings", requireAdmin, async (req, res): Promise<void> => {
  const config = req.body?.config;
  if (!validConfig(config)) {
    res.status(400).json({ error: "Некорректные настройки оформления или блоков." });
    return;
  }
  await ensureSettingsTable();
  const { rows } = await pool.query(
    "UPDATE storefront_settings SET config = $1::jsonb, updated_at = NOW() WHERE id = 1 RETURNING config, updated_at",
    [JSON.stringify(config)],
  );
  res.json({ config: rows[0].config, updatedAt: rows[0].updated_at });
});

export default router;
