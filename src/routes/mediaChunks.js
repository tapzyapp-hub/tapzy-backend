const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const router = require("express").Router();

const { uploadsDir, chunkUploadsDir, safeUploadFilename } = require("../upload");
const { publicAbsoluteUrl } = require("../utils");

const MAX_CHUNKS = 800;
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const sessions = new Map();

const chunkStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, chunkUploadsDir),
  filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.part`),
});

const chunkUpload = multer({
  storage: chunkStorage,
  limits: { fileSize: MAX_CHUNK_BYTES + 1024 * 1024 },
});

function isSupportedMediaMime(mimetype = "", originalName = "") {
  const type = String(mimetype || "").toLowerCase();
  const name = String(originalName || "").toLowerCase();
  return (
    type.startsWith("video/") ||
    type.startsWith("image/") ||
    type === "application/octet-stream" ||
    /\.(mp4|mov|m4v|webm|3gp|3gpp|avi|hevc|jpg|jpeg|png|webp|gif|heic|heif)$/i.test(name)
  );
}

function safeId(value = "") {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

async function removeDirSafe(dir) {
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch (_) {}
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > 2 * 60 * 60 * 1000) {
      sessions.delete(id);
      removeDirSafe(session.dir);
    }
  }
}

router.post("/media/chunk/start", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).json({ ok: false, error: "Sign in required" });

    cleanupExpiredSessions();

    const originalName = String(req.body.originalName || "tapzy-media").trim();
    const mimetype = String(req.body.type || "application/octet-stream").trim();
    const size = Math.max(0, Number(req.body.size) || 0);
    const totalChunks = Math.max(0, Number(req.body.totalChunks) || 0);

    if (!isSupportedMediaMime(mimetype, originalName)) {
      return res.status(400).json({ ok: false, error: "Only media chunk uploads are supported" });
    }
    if (!totalChunks || totalChunks > MAX_CHUNKS) {
      return res.status(400).json({ ok: false, error: "Invalid chunk count" });
    }
    if (size > MAX_TOTAL_BYTES) {
      return res.status(413).json({ ok: false, error: "Media is too large for chunked upload" });
    }

    const uploadId = crypto.randomBytes(16).toString("hex");
    const dir = path.join(chunkUploadsDir, uploadId);
    await fsp.mkdir(dir, { recursive: true });

    sessions.set(uploadId, {
      uploadId,
      dir,
      profileId: currentProfile.id,
      originalName,
      mimetype,
      size,
      totalChunks,
      received: new Set(),
      createdAt: Date.now(),
    });

    res.json({ ok: true, uploadId, chunkSize: MAX_CHUNK_BYTES });
  } catch (error) {
    console.error("Chunk start error:", error);
    res.status(500).json({ ok: false, error: "Could not start upload" });
  }
});

router.post("/media/chunk/:uploadId/:index", chunkUpload.single("chunk"), async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).json({ ok: false, error: "Sign in required" });

    const uploadId = safeId(req.params.uploadId);
    const index = Number(req.params.index);
    const session = sessions.get(uploadId);
    if (!session || session.profileId !== currentProfile.id) {
      return res.status(404).json({ ok: false, error: "Upload session not found" });
    }
    if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) {
      return res.status(400).json({ ok: false, error: "Invalid chunk index" });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "Missing chunk" });
    }
    if (req.file.size > MAX_CHUNK_BYTES + 1024 * 1024) {
      await fsp.unlink(req.file.path).catch(() => {});
      return res.status(413).json({ ok: false, error: "Chunk is too large" });
    }

    const chunkPath = path.join(session.dir, `${index}.part`);
    await fsp.rename(req.file.path, chunkPath);
    session.received.add(index);

    res.json({ ok: true, received: session.received.size, totalChunks: session.totalChunks });
  } catch (error) {
    console.error("Chunk upload error:", error);
    res.status(500).json({ ok: false, error: "Chunk upload failed" });
  }
});

router.post("/media/chunk/:uploadId/complete", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).json({ ok: false, error: "Sign in required" });

    const uploadId = safeId(req.params.uploadId);
    const session = sessions.get(uploadId);
    if (!session || session.profileId !== currentProfile.id) {
      return res.status(404).json({ ok: false, error: "Upload session not found" });
    }
    if (session.received.size !== session.totalChunks) {
      return res.status(400).json({ ok: false, error: "Upload is missing chunks" });
    }

    const filename = safeUploadFilename(session.originalName, session.mimetype);
    const finalPath = path.join(uploadsDir, filename);
    const output = fs.createWriteStream(finalPath);

    for (let i = 0; i < session.totalChunks; i += 1) {
      const chunkPath = path.join(session.dir, `${i}.part`);
      await new Promise((resolve, reject) => {
        const input = fs.createReadStream(chunkPath);
        input.on("error", reject);
        input.on("end", resolve);
        input.pipe(output, { end: false });
      });
    }

    await new Promise((resolve, reject) => {
      output.end(resolve);
      output.on("error", reject);
    });

    sessions.delete(uploadId);
    await removeDirSafe(session.dir);

    res.json({
      ok: true,
      mediaUrl: publicAbsoluteUrl(req, `/uploads/${filename}`),
      filename,
      originalName: session.originalName,
      mimetype: session.mimetype,
      size: fs.statSync(finalPath).size,
    });
  } catch (error) {
    console.error("Chunk complete error:", error);
    res.status(500).json({ ok: false, error: "Could not complete upload" });
  }
});

router.post("/media/chunk/:uploadId/cancel", async (req, res) => {
  const uploadId = safeId(req.params.uploadId);
  const session = sessions.get(uploadId);
  if (session && (!req.currentProfile || session.profileId === req.currentProfile.id)) {
    sessions.delete(uploadId);
    await removeDirSafe(session.dir);
  }
  res.json({ ok: true });
});

module.exports = router;
