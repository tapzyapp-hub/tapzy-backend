const fs = require("fs");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");
const { execFile } = require("child_process");

const uploadsDir = path.join(__dirname, "..", "public", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

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


function isVideoUpload(file) {
  if (!file) return false;
  const mimetype = String(file.mimetype || "").toLowerCase();
  const ext = path.extname(file.originalname || file.filename || "").toLowerCase();
  return mimetype.startsWith("video/") || [".mp4", ".mov", ".m4v", ".webm"].includes(ext);
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function normalizeStoryVideoUpload(file) {
  if (!isVideoUpload(file) || !file.path || !file.filename) return file;

  const inputPath = file.path;
  const parsed = path.parse(file.filename);
  const outputFilename = `${parsed.name}-tapzy.mp4`;
  const outputPath = path.join(uploadsDir, outputFilename);

  try {
    // Instagram exports can be HEVC/HDR, variable-frame-rate, odd metadata, or .mov-style MP4s.
    // This converts them into a normal web-safe MP4 that mobile browsers can preview and play reliably.
    await runFfmpeg([
      "-y",
      "-i", inputPath,
      "-map", "0:v:0",
      "-map", "0:a?",
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-profile:v", "main",
      "-level", "4.0",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ac", "2",
      "-movflags", "+faststart",
      outputPath,
    ]);

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      try { fs.unlinkSync(inputPath); } catch (_e) {}
      file.filename = outputFilename;
      file.path = outputPath;
      file.mimetype = "video/mp4";
      file.originalname = outputFilename;
      file.size = fs.statSync(outputPath).size;
    }
  } catch (error) {
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (_e) {}
    console.warn("Tapzy story video normalization skipped:", error && error.message ? error.message : error);
  }

  return file;
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
    fileSize: 500 * 1024 * 1024,
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
  normalizeStoryVideoUpload,
};