import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/adminAuth";

const router: IRouter = Router();
const allowedHosts = new Set(["api.openai.com", "openrouter.ai", "api.groq.com", "api.deepseek.com"]);

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
