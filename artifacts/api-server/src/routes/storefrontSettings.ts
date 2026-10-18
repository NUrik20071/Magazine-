import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middlewares/adminAuth";

const router: IRouter = Router();

const defaults = {
  customCode: { html: '', css: '', js: '' },
  theme: {
    background: "#f5f1e8", text: "#244c43", accent: "#244c43", accentText: "#fffaf1",
    cardBackground: "#fffdf7", gradient: "linear-gradient(135deg, #f5f1e8 0%, #e5ded0 100%)",
    font: "DM Sans", headingFont: "Cormorant Garamond", heroLayout: "split", cardRadius: 8, cardColumns: 3,
    imageRatio: "4 / 5", animation: "lift", animationDuration: 240, colorAnimation: false,
  },
  adminTheme: { background: '#f2eee5', sidebar: '#244c43', accent: '#356257', text: '#244c43', surface: '#faf7f0', font: 'DM Sans', radius: 8 },
  sections: { header: true, hero: true, ticker: true, catalog: true, custom: true, story: true, footer: true },
  sectionOrder: ['hero', 'ticker', 'catalog', 'custom', 'story'],
  content: {
    siteName: 'тихо.', siteTagline: 'дом и повседневность', navCatalogLabel: 'Каталог', navAboutLabel: 'О нас', cartLabel: 'Корзина', signInLabel: 'Войти',
    announcement: 'Доставка по Казахстану · бесплатно от 35 000 ₸', heroEyebrow: 'Маленькая коллекция для дома', heroTitle: 'Жить\nчуть тише.', heroText: 'Вещи, которые не требуют внимания — только становятся частью хорошего дня. Собираем их небольшими партиями.', heroImage: '/images/orbit-vase.png', heroImageLink: '', heroButtonText: 'Смотреть коллекцию', heroButtonUrl: '#catalog', heroIndexText: 'ПРЕДМЕТЫ С ХАРАКТЕРОМ · № 01', heroNote: 'Найдено и выбрано в Казахстане', ticker1: 'С любовью к деталям', ticker2: 'Небольшие тиражи', ticker3: 'Сделано на каждый день', catalogEyebrow: 'Наш выбор', catalogTitle: 'Предметы\nна каждый день', searchPlaceholder: 'Найти вещь', storyEyebrow: 'Небольшое объяснение', storyTitle: 'Не больше.\nЛучше.', storyText: '«Тихо» — маленький магазин вещей, которые приятно держать рядом.', storyQuote: '«Хорошая вещь не заполняет пространство — она делает его вашим»', storyLinkText: 'Вернуться к вещам', storyLinkUrl: '#catalog', footerLocation: 'Алматы · Казахстан', footerNote: 'Корзина хранится на устройстве', copyrightLabel: 'ТИХО',
  },
  blocks: [] as Array<Record<string, unknown>>,
  workflows: [] as Array<Record<string, unknown>>,
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
  const candidate = /^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(value) ? 'https://' + value : value;
  try {
    const parsed = new URL(candidate);
    return ["https:", "http:", "mailto:", "tel:"].includes(parsed.protocol);
  } catch { return false; }
}

function validConfig(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const config = value as Record<string, any>;
  if (!config.theme || typeof config.theme !== "object" || !config.content || typeof config.content !== "object" || !Array.isArray(config.blocks)) return false;
  if (config.customCode !== undefined) {
    if (!config.customCode || typeof config.customCode !== 'object') return false;
    for (const key of ['html', 'css', 'js']) if (typeof config.customCode[key] !== 'string' || config.customCode[key].length > 60000) return false;
  }
  if (config.adminTheme !== undefined) {
    const admin = config.adminTheme;
    if (!admin || typeof admin !== "object") return false;
    for (const key of ["background", "sidebar", "accent", "text", "surface"]) if (typeof admin[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(admin[key])) return false;
    if (typeof admin.font !== "string" || admin.font.length > 80 || !Number.isFinite(admin.radius) || admin.radius < 0 || admin.radius > 32) return false;
  }
  if (config.sections !== undefined) {
    if (!config.sections || typeof config.sections !== "object") return false;
    for (const key of ["header", "hero", "ticker", "catalog", "custom", "story", "footer"]) if (typeof config.sections[key] !== "boolean") return false;
  }
  if (config.sectionOrder !== undefined && (!Array.isArray(config.sectionOrder) || config.sectionOrder.length > 5 || config.sectionOrder.some((key: unknown) => !["hero","ticker","catalog","custom","story"].includes(String(key))) || new Set(config.sectionOrder).size !== config.sectionOrder.length)) return false;
  if (config.content.heroImageLink !== undefined && !validUrl(config.content.heroImageLink)) return false;
  if (config.content.heroImage !== undefined && !validUrl(config.content.heroImage)) return false;
  for (const key of ["heroButtonUrl", "storyLinkUrl"]) if (config.content[key] !== undefined && !validUrl(config.content[key])) return false;
  for (const key of Object.keys(config.content)) if (typeof config.content[key] !== "string" || config.content[key].length > 4000) return false;
  if (config.blocks.length > 40 || !Array.isArray(config.workflows) || config.workflows.length > 50) return false;
  if (config.theme.heroLayout !== undefined && !["split", "image-left", "centered"].includes(config.theme.heroLayout)) return false;
  const allowedTypes = new Set(["text", "image", "video", "audio", "button", "embed", "map"]);
  const allowedAnimations = new Set(["fade", "lift", "glow", "float", "none"]);
  const allowedTriggers = new Set(["page-load", "click", "swipe-left", "swipe-right"]);
  const allowedConditions = new Set(["always", "mobile", "desktop", "cart-has-items", "url-contains"]);
  const allowedActions = new Set(["show", "hide", "toggle", "animate", "scroll", "navigate", "open-link", "play-video", "show-message"]);
  for (const rule of config.workflows) {
    if (!rule || typeof rule !== "object" || typeof rule.id !== "string" || rule.id.length > 80) return false;
    if (typeof rule.name !== "string" || rule.name.length > 200 || typeof rule.enabled !== "boolean") return false;
    if (!allowedTriggers.has(rule.trigger) || !allowedConditions.has(rule.condition) || !allowedActions.has(rule.action)) return false;
    if (typeof rule.listenOn !== "string" || rule.listenOn.length > 100 || (rule.targetId !== undefined && (typeof rule.targetId !== "string" || rule.targetId.length > 100))) return false;
    if (rule.conditionValue !== undefined && (typeof rule.conditionValue !== "string" || rule.conditionValue.length > 1000)) return false;
    if (rule.value !== undefined && (typeof rule.value !== "string" || rule.value.length > 2000)) return false;
    if (["navigate", "open-link"].includes(rule.action) && rule.value && !validUrl(rule.value)) return false;
  }
  for (const block of config.blocks) {
    if (!block || typeof block !== "object" || !allowedTypes.has(block.type)) return false;
    if (typeof block.id !== "string" || block.id.length > 80) return false;
    for (const key of ["url", "mediaUrl"]) if (block[key] !== undefined && !validUrl(block[key])) return false;
    if (block.columns !== undefined && (!Number.isInteger(block.columns) || block.columns < 1 || block.columns > 12)) return false;
    if (block.radius !== undefined && (!Number.isInteger(block.radius) || block.radius < 0 || block.radius > 48)) return false;
    if (block.animation !== undefined && (typeof block.animation !== "string" || !allowedAnimations.has(block.animation))) return false;
    if (block.textAlign !== undefined && !["left", "center", "right"].includes(block.textAlign)) return false;
    if (block.objectFit !== undefined && !["cover", "contain"].includes(block.objectFit)) return false;
    if (block.targetBlank !== undefined && typeof block.targetBlank !== "boolean") return false;
    for (const key of ["title", "titleSize", "text", "label", "url", "mediaUrl", "background", "color", "width", "height", "fontSize", "padding", "textAlign", "objectFit", "animation"]) {
      if (block[key] !== undefined && (typeof block[key] !== "string" || block[key].length > 4000)) return false;
    }
  }
  return true;
}

router.get("/storefront/settings", async (_req, res): Promise<void> => {
  await ensureSettingsTable();
  const { rows } = await pool.query("SELECT config FROM storefront_settings WHERE id = 1");
  const config = rows[0]?.config ?? defaults;
  const { adminTheme: _privateAdminTheme, ...publishedConfig } = config;
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
  res.json(publishedConfig);
});

router.get("/admin/storefront/settings", requireAdmin, async (_req, res): Promise<void> => {
  await ensureSettingsTable();
  const { rows } = await pool.query("SELECT config, updated_at FROM storefront_settings WHERE id = 1");
  res.json({ config: rows[0]?.config ?? defaults, updatedAt: rows[0]?.updated_at ?? null });
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
