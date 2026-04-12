const fs = require("fs");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");

const uploadsDir = path.join(__dirname, "..", "public", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

function safeExtension(originalName = "", mimetype = "") {
  const ext = path.extname(originalName).toLowerCase();

  if ([".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".webm", ".mp3", ".wav", ".ogg", ".m4a"].includes(ext)) {
    return ext;
  }

  if (mimetype === "image/jpeg") return ".jpg";
  if (mimetype === "image/png") return ".png";
  if (mimetype === "image/webp") return ".webp";
  if (mimetype === "video/mp4") return ".mp4";
  if (mimetype === "video/quicktime") return ".mov";
  if (mimetype === "video/webm") return ".webm";
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
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/quicktime",
      "video/webm",
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
};