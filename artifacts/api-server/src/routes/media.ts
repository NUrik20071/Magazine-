import { Router, type IRouter } from "express";
import express from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middlewares/adminAuth";

const router: IRouter = Router();
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const allowedMimeTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif",
  "video/mp4", "video/webm", "video/quicktime",
  "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm",
]);

async function ensureMediaTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_media (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data BYTEA NOT NULL,
      byte_size INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// Media is stored server-side. Only the requested asset is streamed to visitors;
// database exports and backups are never exposed by this route.
router.post("/admin/media", requireAdmin, express.raw({ type: "*/*", limit: MAX_MEDIA_BYTES }), async (req, res): Promise<void> => {
  const mime = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (!allowedMimeTypes.has(mime)) {
    res.status(415).json({ error: "Этот тип файла не поддерживается. Используйте фото, MP4/WebM или аудио MP3/OGG/WAV." });
    return;
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    res.status(400).json({ error: "Файл пустой или не был передан." });
    return;
  }
  if (req.body.length > MAX_MEDIA_BYTES) {
    res.status(413).json({ error: "Максимальный размер файла — 25 МБ." });
    return;
  }
  const suppliedName = String(req.query.filename || "media").slice(0, 180);
  const filename = suppliedName.replace(/[\\/\r\n\0]/g, "_").replace(/[^\p{L}\p{N}._ -]/gu, "_") || "media";
  await ensureMediaTable();
  const { rows } = await pool.query(
    "INSERT INTO site_media (filename, mime_type, data, byte_size) VALUES ($1, $2, $3, $4) RETURNING id, filename, mime_type, byte_size",
    [filename, mime, req.body, req.body.length],
  );
  res.status(201).json({ id: String(rows[0].id), filename: rows[0].filename, mimeType: rows[0].mime_type, size: rows[0].byte_size, url: "/api/media/" + rows[0].id });
});

router.get("/media/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: "Некорректный идентификатор файла." });
    return;
  }
  await ensureMediaTable();
  const { rows } = await pool.query("SELECT filename, mime_type, data, byte_size FROM site_media WHERE id = $1", [id]);
  if (!rows[0]) {
    res.status(404).json({ error: "Файл не найден." });
    return;
  }
  const data = rows[0].data as Buffer;
  const size = Number(rows[0].byte_size);
  res.setHeader("Content-Type", rows[0].mime_type);
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("Accept-Ranges", "bytes");
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      res.setHeader("Content-Range", "bytes */" + size);
      res.status(416).end();
      return;
    }
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
      res.setHeader("Content-Range", "bytes */" + size);
      res.status(416).end();
      return;
    }
    res.status(206);
    res.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + size);
    res.setHeader("Content-Length", String(end - start + 1));
    res.send(data.subarray(start, end + 1));
    return;
  }
  res.setHeader("Content-Length", String(size));
  res.send(data);
});

export default router;
