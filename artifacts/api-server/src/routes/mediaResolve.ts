import { Router, type IRouter } from "express";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const router: IRouter = Router();
const allowedHosts = new Set([
  "t.me", "telegram.me", "pin.it", "pinterest.com", "www.pinterest.com",
  "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be",
  "tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com",
  "2gis.kz", "www.2gis.kz", "2gis.com", "www.2gis.com", "eventup.kz", "www.eventup.kz",
  "instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am", "www.instagr.am",
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
  // TikTok embeds playback addresses in serialized page data under playAddr/downloadAddr.
  const patterns = [
    /["']playAddr["']\s*:\s*["']((?:\\.|[^"'\\])*)["']/gi,
    /["']downloadAddr["']\s*:\s*["']((?:\\.|[^"'\\])*)["']/gi,
    /["']contentUrl["']\s*:\s*["']((?:\\.|[^"'\\])*)["']/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      let raw = match[1];
      try {
        raw = JSON.parse('"' + raw + '"');
      } catch {
        raw = raw.replace(/\\u002F/gi, "/").replace(/\\u0026/gi, "&").replace(/\\\//g, "/");
      }
      raw = raw.replace(/&amp;/g, "&").replace(/\\u0026/gi, "&");
      try {
        const candidate = new URL(raw);
        const host = candidate.hostname.toLowerCase();
        const trustedCdn = host.includes("tiktokcdn") || host.includes("tiktokv") ||
          host.includes("byteoversea") || host.includes("muscdn") || host.includes("ibytedtos");
        if (candidate.protocol === "https:" && trustedCdn && /\.(mp4|m3u8|mpd)(?:$|\?)/i.test(candidate.pathname + candidate.search)) {
          return candidate.toString();
        }
      } catch { /* continue searching other serialized addresses */ }
    }
  }
  return null;
}

type ExtractedMedia = { url: string; title?: string; ext?: string; mimeType?: string; extractor?: string };

/**
 * Run server-installed extractors instead of relying only on Open Graph tags.
 * The URL passed here has already been checked against allowedHosts.
 */
async function runExtractor(moduleName: "yt_dlp" | "gallery_dl", args: string[], url: string): Promise<string | null> {
  const configuredPython = process.env.MEDIA_TOOLS_PYTHON;
  const localPython = process.cwd() + "/.venv-media/bin/python3";
  const python = configuredPython || (existsSync(localPython) ? localPython : "python3");
  try {
    const { stdout } = await execFileAsync(python, ["-m", moduleName, ...args, url], {
      timeout: 20_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    const lines = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (moduleName === "yt_dlp") {
      for (const line of lines.reverse()) {
        try {
          const data = JSON.parse(line) as Record<string, unknown>;
          const requested = Array.isArray(data.requested_downloads) ? data.requested_downloads as Record<string, unknown>[] : [];
          const requestedUrl = requested.find(item => typeof item.url === "string" && /^https:\/\//i.test(item.url as string))?.url;
          const direct = typeof requestedUrl === "string" ? requestedUrl
            : typeof data.url === "string" && /^https:\/\//i.test(data.url) ? data.url : null;
          if (direct) return direct;
          const formats = Array.isArray(data.formats) ? data.formats as Record<string, unknown>[] : [];
          const format = formats.find(item => typeof item.url === "string" && /^https:\/\//i.test(item.url as string) && (item.vcodec !== "none" || item.acodec !== "none"));
          if (format && typeof format.url === "string") return format.url;
        } catch { /* ignore progress or warning lines */ }
      }
      return null;
    }
    // gallery-dl emits one or more JSON records for gallery items.
    for (const line of lines) {
      try {
        const data = JSON.parse(line) as unknown;
        const visit = (value: unknown): string | null => {
          if (Array.isArray(value)) {
            for (const item of value) { const found = visit(item); if (found) return found; }
          } else if (value && typeof value === "object") {
            const record = value as Record<string, unknown>;
            for (const key of ["url", "content_url", "contentUrl", "download_url"]) {
              const candidate = record[key];
              if (typeof candidate === "string" && /^https:\/\//i.test(candidate) && /\.(jpe?g|png|webp|gif|mp4|mov|webm)(?:$|[?#])/i.test(candidate)) return candidate;
            }
            for (const item of Object.values(record)) { const found = visit(item); if (found) return found; }
          }
          return null;
        };
        const found = visit(data);
        if (found) return found;
      } catch { /* ignore non-JSON output */ }
    }
  } catch (error) {
    // Extractors are best-effort: protected posts and unavailable tools fall back to metadata.
    const detail = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    console.warn(`[media-resolve] ${moduleName} failed: ${detail}`);
  }
  return null;
}

async function extractWithTools(url: URL, provider: string): Promise<ExtractedMedia | null> {
  if (!["instagram", "tiktok", "youtube", "pinterest"].includes(provider)) return null;
  // yt-dlp is usually best for video; gallery-dl is a useful fallback for Instagram carousels/photos.
  const video = await runExtractor("yt_dlp", [
    "--dump-single-json", "--no-warnings", "--no-playlist", "--skip-download",
    "--socket-timeout", "8", "--retries", "1", "--extractor-retries", "1",
  ], url.toString());
  if (video) return { url: video, extractor: "yt-dlp" };
  if (provider === "instagram" || provider === "pinterest") {
    const gallery = await runExtractor("gallery_dl", ["--dump-json", "--no-mtime"], url.toString());
    if (gallery) return { url: gallery, extractor: "gallery-dl" };
  }
  return null;
}

type MediaItem = { url: string; type: "video" | "image" | "audio"; mimeType?: string; title?: string };
type MultiExtract = { items: MediaItem[]; title?: string; extractor: string };

function classifyMedia(url: string, mime = ""): MediaItem["type"] {
  const v = (url + " " + mime).toLowerCase();
  if (/audio|\.mp3(?:$|[?#])|\.m4a(?:$|[?#])|\.aac(?:$|[?#])/.test(v)) return "audio";
  if (/image|\.jpe?g(?:$|[?#])|\.png(?:$|[?#])|\.webp(?:$|[?#])|\.gif(?:$|[?#])|\.avif(?:$|[?#])/.test(v)) return "image";
  return "video";
}
function makeMediaItem(url: unknown, mime?: unknown, title?: unknown): MediaItem | null {
  if (typeof url !== "string" || !/^https:\/\//i.test(url)) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return { url: u.toString(), type: classifyMedia(url, typeof mime === "string" ? mime : ""),
      ...(typeof mime === "string" && mime ? { mimeType: mime } : {}),
      ...(typeof title === "string" && title ? { title: title.slice(0, 300) } : {}) };
  } catch { return null; }
}
function uniqueMedia(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  return items.filter(x => !seen.has(x.url) && !!seen.add(x.url)).slice(0, 100);
}
function parseYtDlp(value: unknown): { items: MediaItem[]; title?: string } {
  const items: MediaItem[] = [];
  let title: string | undefined;
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return;
    const d = v as Record<string, unknown>;
    if (!title && typeof d.title === "string") title = d.title;
    const formats = Array.isArray(d.formats) ? d.formats as Record<string, unknown>[] : [];
    const requested = Array.isArray(d.requested_downloads) ? d.requested_downloads as Record<string, unknown>[] : [];
    const candidates = [...requested, ...(typeof d.url === "string" ? [d] : []),
      ...formats.filter(x => typeof x.url === "string" && (x.vcodec !== "none" || x.acodec !== "none"))];
    for (const c of candidates) {
      const item = makeMediaItem(c.url, c.mime_type || d.mime_type, d.title);
      if (item) items.push(item);
    }
    if (Array.isArray(d.entries)) for (const e of d.entries) visit(e);
    if (!items.length && Array.isArray(d.thumbnails)) for (const t of d.thumbnails) {
      if (t && typeof t === "object") {
        const item = makeMediaItem((t as Record<string, unknown>).url, "image", d.title);
        if (item) items.push(item);
      }
    }
  };
  visit(value);
  return { items: uniqueMedia(items), title };
}
function parseGalleryJson(value: unknown, items: MediaItem[], title?: string): void {
  if (typeof value === "string") {
    if (/^https:\/\//i.test(value) && /\.(?:jpe?g|png|webp|gif|avif|mp4|mov|webm|m3u8|mpd|mp3|m4a)(?:$|[?#])/i.test(value)) {
      const item = makeMediaItem(value, undefined, title); if (item) items.push(item);
    }
    return;
  }
  if (Array.isArray(value)) { for (const child of value) parseGalleryJson(child, items, title); return; }
  if (value && typeof value === "object") {
    const d = value as Record<string, unknown>;
    const t = typeof d.title === "string" ? d.title : title;
    for (const [key, child] of Object.entries(d)) {
      if (["url", "content_url", "contentUrl", "download_url", "src"].includes(key) && typeof child === "string") {
        const item = makeMediaItem(child, key.toLowerCase().includes("image") ? "image" : undefined, t);
        if (item) items.push(item);
      } else parseGalleryJson(child, items, t);
    }
  }
}
async function runMultiExtractor(moduleName: "yt_dlp" | "gallery_dl", args: string[], url: string): Promise<MultiExtract | null> {
  const python = process.env.MEDIA_TOOLS_PYTHON || (existsSync(process.cwd() + "/.venv-media/bin/python3") ? process.cwd() + "/.venv-media/bin/python3" : "python3");
  try {
    const { stdout } = await execFileAsync(python, ["-m", moduleName, ...args, url], {
      timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    const lines = stdout.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (moduleName === "yt_dlp") {
      for (const line of [...lines].reverse()) {
        try {
          const parsed = parseYtDlp(JSON.parse(line));
          if (parsed.items.length) return { ...parsed, extractor: "yt-dlp" };
        } catch { /* ignore progress output */ }
      }
      return null;
    }
    const items: MediaItem[] = [];
    for (const line of lines) {
      try { parseGalleryJson(JSON.parse(line), items); }
      catch { parseGalleryJson(line, items); }
    }
    const deduped = uniqueMedia(items);
    return deduped.length ? { items: deduped, extractor: "gallery-dl" } : null;
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);
    console.warn("[media-resolve] " + moduleName + " failed: " + detail);
    return null;
  }
}
async function extractAllMedia(url: URL, provider: string): Promise<MultiExtract | null> {
  if (!["instagram", "tiktok", "youtube", "pinterest", "telegram", "2gis"].includes(provider)) return null;
  const video = await runMultiExtractor("yt_dlp", [
    "--dump-single-json", "--no-warnings", "--no-playlist", "--skip-download",
    "--socket-timeout", "8", "--retries", "1", "--extractor-retries", "1",
  ], url.toString());
  if (video?.items.length) return video;
  if (["instagram", "pinterest", "tiktok", "telegram"].includes(provider)) {
    const gallery = await runMultiExtractor("gallery_dl", ["--dump-json", "--no-mtime"], url.toString());
    if (gallery?.items.length) return gallery;
  }
  return null;
}

function youtubeId(url: URL): string {
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
    const sourceHost = source.hostname.toLowerCase();
    const sourceProvider = sourceHost.includes("instagram") || sourceHost.includes("instagr.am") ? "instagram"
      : sourceHost.includes("tiktok") ? "tiktok"
      : sourceHost.includes("youtube") || sourceHost === "youtu.be" ? "youtube"
      : sourceHost.includes("pinterest") || sourceHost === "pin.it" ? "pinterest" : "website";
    // Run extractors before fetching HTML: Instagram may return 403 or empty metadata to server requests.
    const earlyExtracted = await extractAllMedia(source, sourceProvider);
    if (earlyExtracted?.items.length) {
      const items = earlyExtracted.items;
      const firstVideo = items.find(item => item.type === "video");
      const firstImage = items.find(item => item.type === "image");
      const firstAudio = items.find(item => item.type === "audio");
      const imageCount = items.filter(item => item.type === "image").length;
      res.json({
        provider: sourceProvider, finalUrl: source.toString(),
        title: earlyExtracted.title || (sourceProvider + " media"),
        mediaUrl: firstVideo?.url || firstImage?.url || firstAudio?.url || items[0].url,
        videoUrl: firstVideo?.url || null, imageUrl: firstImage?.url || null, audioUrl: firstAudio?.url || null,
        mediaItems: items, mediaType: imageCount > 1 ? "photo_gallery" : items[0].type,
        embedUrl: source.toString(), extractor: earlyExtracted.extractor,
        note: "Медиа извлечено серверным загрузчиком; временные CDN-ссылки могут истекать."
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
      : current.hostname.includes("2gis") ? "2gis"
      : current.hostname.includes("instagram") || current.hostname.includes("instagr.am") ? "instagram" : "website";
    if (!type.includes("text/html") && !type.includes("application/xhtml")) {
      res.json({ provider, finalUrl: current.toString(), title: current.hostname, mediaUrl: current.toString(), mediaType: type.split(";")[0], embedUrl: current.toString() });
      return;
    }
    const html = (await response.text()).slice(0, 2_000_000);
    const title = meta(html, "og:title") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || current.hostname;
    const image = meta(html, "og:image:secure_url") || meta(html, "og:image");
    const ogVideo = meta(html, "og:video:secure_url") || meta(html, "og:video") || meta(html, "og:video:url");
    const video = provider === "tiktok" ? (extractTikTokCdnUrl(html) || ogVideo) : ogVideo;
    const audio = meta(html, "og:audio:secure_url") || meta(html, "og:audio");
    let embedUrl = current.toString();
    const ytId = youtubeId(current);
    if (provider === "youtube" && ytId) embedUrl = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(ytId);
    else if (provider === "telegram" && current.pathname.split("/").filter(Boolean).length >= 2) {
      const embed = new URL(current.toString()); embed.searchParams.set("embed", "1"); embed.searchParams.set("mode", "tme"); embedUrl = embed.toString();
    }
    else if (provider === "pinterest" || provider === "tiktok") embedUrl = current.toString();
    const fallbackItems: MediaItem[] = [];
    if (video) { const item = makeMediaItem(video, "video", title); if (item) fallbackItems.push(item); }
    if (image) { const item = makeMediaItem(image, "image", title); if (item) fallbackItems.push(item); }
    res.json({
      provider, finalUrl: current.toString(), title,
      imageUrl: image || null, videoUrl: video || null, mediaUrl: video || image || null, audioUrl: audio || null,
      mediaItems: uniqueMedia(fallbackItems), mediaType: video ? "video" : image ? "image" : null, embedUrl,
      note: provider === "instagram" && !image && !video
        ? "Instagram не предоставил медиа через загрузчики или метаданные. Публикация может требовать входа в аккаунт либо быть недоступна."
        : provider === "pinterest" && !image && !video
        ? "Pinterest may require its own embed and may not expose media to external sites."
        : provider === "tiktok" && !video
          ? "TikTok page opened, but no direct CDN video URL was found in embedded page data or Open Graph metadata. The post may be unavailable or TikTok may have changed its page format."
          : undefined
    });
  } catch (error) {
    req.log.warn({ err: error }, "Media source resolution failed");
    res.status(502).json({ error: "Не удалось получить предпросмотр. Проверьте ссылку или используйте прямой URL/код встраивания." });
  }
});
export default router;
