import { Router, type IRouter } from "express";

const router: IRouter = Router();
const allowedHosts = new Set([
  "t.me", "telegram.me", "pin.it", "pinterest.com", "www.pinterest.com",
  "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be",
  "tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com",
  "2gis.kz", "www.2gis.kz", "2gis.com", "www.2gis.com", "eventup.kz", "www.eventup.kz",
]);
const allowedMediaHosts = new Set([
  ...allowedHosts, "i.pinimg.com", "img.youtube.com", "ytimg.com", "www.ytimg.com",
  "telegram.org", "cdn4.telegram-cdn.org",
  "tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com",
  "tiktokcdn-eu.com",
]);
function hostAllowed(host: string, media = false) {
  const h = host.toLowerCase().replace(/\.$/, "");
  const set = media ? allowedMediaHosts : allowedHosts;
  const tiktokCdn = h === "tiktokcdn-eu.com" || h.endsWith(".tiktokcdn-eu.com");
  return set.has(h) || tiktokCdn || (media && (h.endsWith(".pinimg.com") || h.endsWith(".youtube.com") || h.endsWith(".ytimg.com")));
}
function safeUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const candidate = /^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(value.trim()) ? "https://" + value.trim() : value.trim();
    const url = new URL(candidate);
    if (url.protocol !== "https:" || !hostAllowed(url.hostname)) return null;
    return url;
  } catch { return null; }
}
function meta(html: string, key: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const found = html.match(pattern);
    if (found?.[1]) return found[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }
  return "";
}

function extractTikTokCdnUrl(html: string): string | null {
  // TikTok embeds the playback address in serialized page data under playAddr/downloadAddr.
  // Decode escaped JSON strings, but only return known TikTok/ByteDance media CDN hosts.
  const patterns = [
    /["']playAddr["']\\s*:\\s*["']((?:\\\\.|[^"'\\\\])*)["']/gi,
    /["']downloadAddr["']\\s*:\\s*["']((?:\\\\.|[^"'\\\\])*)["']/gi,
    /["']contentUrl["']\\s*:\\s*["']((?:\\\\.|[^"'\\\\])*)["']/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      let raw = match[1];
      try { raw = JSON.parse("\\"" + raw + "\\""); } catch {
        raw = raw.replace(/\\\\u002F/gi, "/").replace(/\\\\u0026/gi, "&").replace(/\\\\\\//g, "/");
      }
      raw = raw.replace(/&amp;/g, "&").replace(/\\u0026/gi, "&");
      try {
        const candidate = new URL(raw);
        const host = candidate.hostname.toLowerCase();
        const trustedCdn = host.includes("tiktokcdn") || host.includes("tiktokv") ||
          host.includes("byteoversea") || host.includes("muscdn") || host.includes("ibytedtos");
        if (candidate.protocol === "https:" && trustedCdn && /\\.(mp4|m3u8|mpd)(?:$|\\?)/i.test(candidate.pathname + candidate.search)) {
          return candidate.toString();
        }
      } catch { /* continue searching other serialized addresses */ }
    }
  }
  return null;
}
\nfunction youtubeId(url: URL): string {
  if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
  if (url.pathname === "/watch") return url.searchParams.get("v") || "";
  const parts = url.pathname.split("/").filter(Boolean);
  return ["embed", "shorts", "live"].includes(parts[0] || "") ? parts[1] || "" : "";
}
router.get("/media/resolve", async (req, res): Promise<void> => {
  const source = safeUrl(req.query.url);
  if (!source) { res.status(400).json({ error: "Поддерживаются публичные ссылки TikTok, Telegram, Pinterest, YouTube и 2ГИС, а также прямые ссылки на медиа TikTok CDN." }); return; }
  try {
    // A direct TikTok CDN URL is already the media resource; do not fetch the whole video
    // just to identify it, because CDN links can be large and their query signatures are time-limited.
    if (source.hostname.toLowerCase().endsWith(".tiktokcdn-eu.com") || source.hostname.toLowerCase() === "tiktokcdn-eu.com") {
      const mime = source.searchParams.get("mime_type") || (source.pathname.includes("/video/") ? "video/mp4" : "application/octet-stream");
      const isVideo = mime.toLowerCase().includes("video") || source.pathname.includes("/video/");
      res.json({
        provider: "tiktok",
        finalUrl: source.toString(),
        title: isVideo ? "TikTok video" : "TikTok media",
        mediaUrl: source.toString(),
        videoUrl: isVideo ? source.toString() : null,
        imageUrl: isVideo ? null : source.toString(),
        mediaType: mime,
        embedUrl: source.toString(),
        note: "Прямая CDN-ссылка распознана. Срок её действия контролируется TikTok; при истечении получите свежую ссылку из публикации."
      });
      return;
    }
    let current = source;
    let response: Response | null = null;
    for (let hop = 0; hop < 6; hop++) {
      if (!hostAllowed(current.hostname)) { res.status(400).json({ error: "Ссылка перенаправляет на неподдерживаемый источник." }); return; }
      response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 (compatible; StorefrontMediaPreview/1.0)", "Accept": "text/html,application/xhtml+xml" } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || hop === 5) { res.status(502).json({ error: "Не удалось раскрыть короткую ссылку." }); return; }
        current = new URL(location, current);
        if (current.protocol !== "https:" || !hostAllowed(current.hostname)) { res.status(400).json({ error: "Ссылка ведёт за пределы поддерживаемых источников." }); return; }
        continue;
      }
      break;
    }
    if (!response?.ok) { res.status(502).json({ error: "Источник не открылся. Возможно, публикация закрыта или удалена." }); return; }
    const type = response.headers.get("content-type") || "";
    const provider = current.hostname.includes("tiktok") ? "tiktok"
      : current.hostname.includes("telegram") || current.hostname === "t.me" ? "telegram"
      : current.hostname.includes("pinterest") || current.hostname === "pin.it" ? "pinterest"
      : current.hostname.includes("youtube") || current.hostname === "youtu.be" ? "youtube"
      : current.hostname.includes("2gis") ? "2gis" : "website";
    if (!type.includes("text/html") && !type.includes("application/xhtml")) {
      res.json({ provider, finalUrl: current.toString(), title: current.hostname, mediaUrl: current.toString(), mediaType: type.split(";")[0], embedUrl: current.toString() });
      return;
    }
    const html = (await response.text()).slice(0, 2_000_000);
    const title = meta(html, "og:title") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || current.hostname;
    const image = meta(html, "og:image:secure_url") || meta(html, "og:image");
    const video = meta(html, "og:video:secure_url") || meta(html, "og:video") || meta(html, "og:video:url");
    const audio = meta(html, "og:audio:secure_url") || meta(html, "og:audio");
    let embedUrl = current.toString();
    const ytId = youtubeId(current);
    if (provider === "youtube" && ytId) embedUrl = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(ytId);
    else if (provider === "telegram" && current.pathname.split("/").filter(Boolean).length >= 2) {
      const embed = new URL(current.toString()); embed.searchParams.set("embed", "1"); embed.searchParams.set("mode", "tme"); embedUrl = embed.toString();
    }
    else if (provider === "pinterest" || provider === "tiktok") embedUrl = current.toString();
    res.json({
      provider, finalUrl: current.toString(), title,
      imageUrl: image || null, videoUrl: video || null, audioUrl: audio || null, embedUrl,
      note: provider === "pinterest" && !image && !video
        ? "Pinterest may require its own embed and may not expose media to external sites."
        : provider === "tiktok" && !video
          ? "TikTok page opened, but no direct video URL was exposed in page metadata. Public post extraction may require a platform-specific resolver."
          : undefined
    });
  } catch (error) {
    req.log.warn({ err: error }, "Media source resolution failed");
    res.status(502).json({ error: "Не удалось получить предпросмотр. Проверьте ссылку или используйте прямой URL/код встраивания." });
  }
});
export default router;
