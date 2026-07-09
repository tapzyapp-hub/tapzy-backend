const fs = require("fs");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");

const uploadsDir = path.join(__dirname, "..", "public", "uploads");
const chunkUploadsDir = path.join(__dirname, "..", "tmp", "chunk-uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(chunkUploadsDir, { recursive: true });

// One consistent safety limit for stories, messages, and future media uploads.
// Long videos are supported when their compressed file size fits this limit.
const VIDEO_UPLOAD_MAX_MB = 150;
const VIDEO_UPLOAD_MAX_BYTES = VIDEO_UPLOAD_MAX_MB * 1024 * 1024;

function safeExtension(originalName = "", mimetype = "") {
  const ext = path.extname(originalName).toLowerCase();

  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".mp4", ".mov", ".webm", ".m4v", ".3gp", ".3gpp", ".avi", ".hevc", ".mp3", ".wav", ".ogg", ".m4a", ".aac"].includes(ext)) {
    return ext;
  }

  if (mimetype === "image/jpeg") return ".jpg";
  if (mimetype === "image/png") return ".png";
  if (mimetype === "image/webp") return ".webp";
  if (mimetype === "image/gif") return ".gif";
  if (mimetype === "image/heic") return ".heic";
  if (mimetype === "image/heif") return ".heif";
  if (mimetype === "video/mp4") return ".mp4";
  if (mimetype === "video/quicktime") return ".mov";
  if (mimetype === "video/webm") return ".webm";
  if (mimetype === "video/x-m4v") return ".m4v";
  if (mimetype === "video/3gpp") return ".3gp";
  if (mimetype === "video/3gpp2") return ".3gpp";
  if (mimetype === "video/x-msvideo") return ".avi";
  if (mimetype.startsWith("video/")) return ext || ".mp4";
  if (mimetype === "application/octet-stream" && [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".webm", ".m4a", ".mp4", ".mov", ".m4v", ".3gp", ".3gpp", ".avi", ".hevc", ".mp3", ".wav", ".ogg", ".aac"].includes(ext)) return ext;
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

function safeUploadFilename(originalName = "", mimetype = "") {
  const ext = safeExtension(originalName, mimetype);
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    cb(null, safeUploadFilename(file.originalname || "", file.mimetype || ""));
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
      "image/heic",
      "image/heif",
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "video/x-m4v",
      "video/3gpp",
      "video/3gpp2",
      "video/x-msvideo",
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

function cloudinaryConfig() {
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || "").trim();

  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

function isCloudinaryConfigured() {
  return !!cloudinaryConfig();
}

function signCloudinaryParams(params, apiSecret) {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return crypto.createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
}

async function uploadBufferToCloudinary(buffer, options = {}) {
  const config = cloudinaryConfig();
  if (!config) return null;
  if (!buffer || !buffer.length) return null;
  if (typeof fetch !== "function" || typeof FormData !== "function" || typeof Blob !== "function") {
    throw new Error("Cloudinary upload requires Node fetch/FormData support");
  }

  const resourceType = String(options.resourceType || "image").trim() || "image";
  const folderRoot = String(process.env.CLOUDINARY_UPLOAD_FOLDER || "tapzy-media").trim() || "tapzy-media";
  const folder = String(options.folder || `${folderRoot}/profile-photos`).trim();
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = String(options.publicId || "").trim();
  const contentType = String(options.contentType || "image/jpeg").trim() || "image/jpeg";
  const filename = String(options.filename || "tapzy-profile-photo.jpg").trim() || "tapzy-profile-photo.jpg";

  const signedParams = {
    folder,
    timestamp,
  };
  if (publicId) signedParams.public_id = publicId;

  const signature = signCloudinaryParams(signedParams, config.apiSecret);
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType }), filename);
  form.append("api_key", config.apiKey);
  form.append("signature", signature);
  Object.entries(signedParams).forEach(([key, value]) => form.append(key, String(value)));

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/${encodeURIComponent(resourceType)}/upload`;
  const response = await fetch(endpoint, { method: "POST", body: form });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_) {
    payload = null;
  }

  if (!response.ok) {
    const message = payload && payload.error && payload.error.message ? payload.error.message : text;
    throw new Error(`Cloudinary upload failed: ${String(message || response.status).slice(0, 240)}`);
  }

  return {
    url: payload && (payload.secure_url || payload.url) ? payload.secure_url || payload.url : null,
    publicId: payload && payload.public_id ? payload.public_id : null,
    raw: payload,
  };
}

async function uploadFileToCloudinary(filePath, options = {}) {
  if (!filePath) return null;
  const buffer = await fs.promises.readFile(filePath);
  return uploadBufferToCloudinary(buffer, options);
}

module.exports = {
  upload,
  uploadsDir,
  chunkUploadsDir,
  safeUploadFilename,
  safeExtension,
  isCloudinaryConfigured,
  uploadBufferToCloudinary,
  uploadFileToCloudinary,
  VIDEO_UPLOAD_MAX_MB,
  VIDEO_UPLOAD_MAX_BYTES,
};
