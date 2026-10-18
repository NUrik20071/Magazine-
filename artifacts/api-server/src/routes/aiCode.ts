import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/adminAuth";

const router: IRouter = Router();
const allowedHosts = new Set(["api.openai.com", "openrouter.ai", "api.groq.com", "api.deepseek.com"]);


router.post("/admin/ai/builder", requireAdmin, async (req, res): Promise<void> => {
  const { apiKey, endpoint, model, prompt, currentConfig } = req.body ?? {};
  if (typeof apiKey !== "string" || apiKey.length < 8 || apiKey.length > 500 ||
      typeof endpoint !== "string" || endpoint.length > 500 ||
      typeof model !== "string" || model.trim().length < 1 || model.length > 160 ||
      typeof prompt !== "string" || prompt.trim().length < 3 || prompt.length > 12000 ||
      !currentConfig || typeof currentConfig !== "object" || JSON.stringify(currentConfig).length > 180000) {
    res.status(400).json({ error: "Укажите API-ключ, модель и задачу для AI-конструктора." }); return;
  }
  let url: URL;
  try { url = new URL(endpoint.trim()); } catch { res.status(400).json({ error: "Endpoint должен быть полным HTTPS URL." }); return; }
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase()) ||
      !(url.pathname.endsWith("/chat/completions") || url.pathname.endsWith("/v1/chat/completions"))) {
    res.status(400).json({ error: "Разрешены HTTPS chat-completions endpoints OpenAI, OpenRouter, Groq или DeepSeek." }); return;
  }
  try {
    const upstream = await fetch(url, {
      method: "POST", signal: AbortSignal.timeout(60000),
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model.trim(), temperature: 0.2, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are an expert visual website builder. Return ONLY a JSON object with fields blocks, customSections, theme, sectionOrder. Generate builder configuration, never HTML/CSS/JavaScript. Preserve existing fields and product/catalog functionality. blocks must be an array of objects with unique string id and type one of text,image,video,audio,button,embed,map,carousel. customSections must be an array of {id,title,enabled,background,animation,blocks}; custom section ids must start with custom-. Allowed animations: reveal,blur,rotate,parallax,magnetic,tilt,fade,lift,glow,float,none. Media carousel uses mediaUrl with one public URL per line. Do not invent external assets; use empty mediaUrl if none supplied. Do not include scripts, API keys, or executable code. theme must contain only visual theme keys from the supplied config. sectionOrder must include built-in ids hero,ticker,catalog,custom,story and any generated custom section ids in desired order. Output a complete replacement for each of the four fields." },
          { role: "user", content: JSON.stringify({ request: prompt.trim(), currentConfig: { blocks: currentConfig.blocks || [], customSections: currentConfig.customSections || [], theme: currentConfig.theme || {}, sectionOrder: currentConfig.sectionOrder || [] } }) },
        ],
      }),
    });
    const body: any = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const detail = typeof body?.error?.message === "string" ? body.error.message.slice(0, 600) : "AI-провайдер вернул ошибку.";
      res.status(502).json({ error: detail }); return;
    }
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length > 150000) { res.status(502).json({ error: "AI вернул пустой или слишком большой ответ." }); return; }
    let generated: any;
    try { generated = JSON.parse(content); } catch { res.status(502).json({ error: "AI вернул невалидный JSON. Попробуйте уточнить задачу." }); return; }
    const allowedTypes = new Set(["text","image","video","audio","button","embed","map","carousel"]);
    const allowedAnimations = new Set(["reveal","blur","rotate","parallax","magnetic","tilt","fade","lift","glow","float","none"]);
    const validBlock = (block: any) => block && typeof block === "object" && typeof block.id === "string" && block.id.length <= 80 && allowedTypes.has(block.type) &&
      ["title","text","label","url","mediaUrl","background","color","width","height","fontSize","titleSize","padding","outline","inlineStyle","textAlign","objectFit","animation"].every((key) => block[key] === undefined || typeof block[key] === "string") &&
      (block.animation === undefined || allowedAnimations.has(block.animation)) &&
      (block.rotation === undefined || (Number.isFinite(block.rotation) && block.rotation >= -180 && block.rotation <= 180)) &&
      (block.animationDuration === undefined || (Number.isFinite(block.animationDuration) && block.animationDuration >= 0 && block.animationDuration <= 10000));
    if (!generated || !Array.isArray(generated.blocks) || generated.blocks.length > 40 || !generated.blocks.every(validBlock) ||
        !Array.isArray(generated.customSections) || generated.customSections.length > 25 ||
        !generated.customSections.every((section: any) => section && typeof section.id === "string" && /^custom-[a-zA-Z0-9_-]{1,70}$/.test(section.id) && typeof section.title === "string" && typeof section.enabled === "boolean" && typeof section.background === "string" && allowedAnimations.has(section.animation) && Array.isArray(section.blocks) && section.blocks.length <= 40 && section.blocks.every(validBlock)) ||
        !generated.theme || typeof generated.theme !== "object" || Array.isArray(generated.theme) ||
        !Array.isArray(generated.sectionOrder) || generated.sectionOrder.length > 30 || generated.sectionOrder.some((key: unknown) => typeof key !== "string" || !["hero","ticker","catalog","custom","story"].includes(key) && !/^custom-[a-zA-Z0-9_-]{1,70}$/.test(key))) {
      res.status(502).json({ error: "AI вернул настройки, которые нельзя безопасно применить. Уточните запрос и повторите." }); return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({ blocks: generated.blocks, customSections: generated.customSections, theme: generated.theme, sectionOrder: generated.sectionOrder });
  } catch (error) {
    req.log.warn({ err: error }, "AI visual builder request failed");
    res.status(502).json({ error: "Не удалось обратиться к AI API. Проверьте ключ, модель и endpoint." });
  }
});

router.post("/admin/ai/code", requireAdmin, async (req, res): Promise<void> => {
  const { apiKey, endpoint, model, prompt, currentCode } = req.body ?? {};
  if (typeof apiKey !== "string" || apiKey.length < 8 || apiKey.length > 500 ||
      typeof endpoint !== "string" || endpoint.length > 500 ||
      typeof model !== "string" || model.trim().length < 1 || model.length > 160 ||
      typeof prompt !== "string" || prompt.trim().length < 3 || prompt.length > 12000 ||
      !currentCode || typeof currentCode !== "object") {
    res.status(400).json({ error: "Укажите API-ключ, endpoint, модель и задачу для AI." }); return;
  }
  let url: URL;
  try { url = new URL(endpoint.trim()); } catch { res.status(400).json({ error: "Endpoint должен быть полным HTTPS URL." }); return; }
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase()) ||
      !(url.pathname.endsWith("/chat/completions") || url.pathname.endsWith("/v1/chat/completions"))) {
    res.status(400).json({ error: "Разрешены HTTPS chat-completions endpoints OpenAI, OpenRouter, Groq или DeepSeek." }); return;
  }
  for (const key of ["html", "css", "js"]) {
    if (typeof currentCode[key] !== "string" || currentCode[key].length > 60000) {
      res.status(400).json({ error: "Каждый фрагмент кода должен быть текстом до 60 000 символов." }); return;
    }
  }
  try {
    const upstream = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(60000),
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model.trim(),
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a careful senior frontend developer. Return only a JSON object with string fields html, css, js. Modify the supplied website code according to the user's request. Preserve existing functionality and return complete replacement contents for all three fields. Do not include markdown fences. HTML should be a fragment, not a full document. Do not add API keys, credentials, trackers, or destructive actions." },
          { role: "user", content: JSON.stringify({ request: prompt.trim(), currentCode }) },
        ],
      }),
    });
    const body: any = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const detail = typeof body?.error?.message === "string" ? body.error.message.slice(0, 600) : "AI-провайдер вернул ошибку.";
      res.status(502).json({ error: detail }); return;
    }
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length > 190000) {
      res.status(502).json({ error: "AI вернул пустой или слишком большой ответ." }); return;
    }
    let code: any;
    try { code = JSON.parse(content); } catch { res.status(502).json({ error: "AI вернул невалидный JSON. Попробуйте уточнить задачу." }); return; }
    if (!code || typeof code.html !== "string" || typeof code.css !== "string" || typeof code.js !== "string" ||
        code.html.length > 60000 || code.css.length > 60000 || code.js.length > 60000) {
      res.status(502).json({ error: "AI вернул код неподходящего формата или превышающий лимит." }); return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({ customCode: { html: code.html, css: code.css, js: code.js } });
  } catch (error) {
    req.log.warn({ err: error }, "AI code assistant request failed");
    res.status(502).json({ error: "Не удалось обратиться к AI API. Проверьте ключ, модель и endpoint." });
  }
});

export default router;
