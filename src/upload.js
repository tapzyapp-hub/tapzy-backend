const fs = require("fs");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");

const uploadsDir = path.join(__dirname, "..", "public", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

// One consistent safety limit for stories, messages, and future media uploads.
// Long videos are supported when their compressed file size fits this limit.
const VIDEO_UPLOAD_MAX_MB = 50;
const VIDEO_UPLOAD_MAX_BYTES = VIDEO_UPLOAD_MAX_MB * 1024 * 1024;

function safeExtension(originalName = "", mimetype = "") {
  const ext = path.extname(originalName).toLowerCase();

  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".mov", ".webm", ".m4v", ".mp3", ".wav", ".ogg", ".m4a", ".aac"].includes(ext)) {
    return ext;
  }

  if (mimetype === "image/jpeg") return ".jpg";
  if (mimetype === "image/png") return ".png";
  if (mimetype === "image/webp") return ".webp";
  if (mimetype === "image/gif") return ".gif";
  if (mimetype === "video/mp4") return ".mp4";
  if (mimetype === "video/quicktime") return ".mov";
  if (mimetype === "video/webm") return ".webm";
  if (mimetype === "video/x-m4v") return ".m4v";
  if (mimetype === "application/octet-stream" && [".webm", ".m4a", ".mp4", ".mov", ".m4v", ".mp3", ".wav", ".ogg", ".aac"].includes(ext)) return ext;
  if (mimetype === "audio/mpeg") return ".mp3";
  if (mimetype === "audio/wav") return ".wav";
  if (mimetype === "audio/x-wav") return ".wav";
  if (mimetype === "audio/ogg") return ".ogg";
  if (mimetype === "audio/webm") return ".webm";
  if (mimetype === "audio/mp4") return ".m4a";
  if (mimetype === "audio/x-m4a") return ".m4a";
  if (mimetype === "audio/aac") return ".m4a";

  return ".jpg";
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = safeExtension(file.originalname || "", file.mimetype || "");
    const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: VIDEO_UPLOAD_MAX_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "video/x-m4v",
      "application/octet-stream",
      "audio/mpeg",
      "audio/wav",
      "audio/x-wav",
      "audio/ogg",
      "audio/webm",
      "audio/mp4",
      "audio/x-m4a",
      "audio/aac",
    ];

    const ok = allowed.includes(file.mimetype);
    cb(ok ? null : new Error("Only images, videos, and audio are allowed"), ok);
  },
});

module.exports = {
  upload,
  uploadsDir,
  VIDEO_UPLOAD_MAX_MB,
  VIDEO_UPLOAD_MAX_BYTES,
};
