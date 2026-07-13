const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const path = require("path");

const { isAllowedOrigin } = require("./config");
const { uploadsDir } = require("./upload");
const { sessionMiddleware } = require("./middleware");

const authRoutes = require("./routes/auth");
const activateRoutes = require("./routes/activate");
const cardsRoutes = require("./routes/cards");
const profileRoutes = require("./routes/profile");
const shareRoutes = require("./routes/share");
const messagesRoutes = require("./routes/messages");
const searchRoutes = require("./routes/search");
const adminRoutes = require("./routes/admin");
const miscRoutes = require("./routes/misc");
const discoveryRoutes = require("./routes/discovery");
const assistantRoutes = require("./routes/assistantRoutes");
const pairRoutes = require("./routes/pair");
const eventsRoutes = require("./routes/events");
const storiesRoutes = require("./routes/stories");
const postsRoutes = require("./routes/posts");
const notificationsRoutes = require("./routes/notifications");
const mediaChunksRoutes = require("./routes/mediaChunks");

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(
  cors({
    credentials: true,
    origin(origin, cb) {
      if (isAllowedOrigin(origin)) {
        return cb(null, true);
      }

      console.error("Blocked CORS origin:", origin);
      return cb(new Error("Not allowed by CORS"));
    },
  })
);

app.use(compression({ threshold: 1024 }));

const LOCKED_VIEWPORT = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

app.use((req, res, next) => {
  const originalSend = res.send.bind(res);
  res.send = function patchedSend(body) {
    const contentType = String(res.getHeader("Content-Type") || "");
    const looksHtml = typeof body === "string" && /<html|<!doctype html|<head/i.test(body);
    if (looksHtml && (!contentType || /html/i.test(contentType))) {
      if (/<meta\s+name=["']viewport["'][^>]*>/i.test(body)) {
        body = body.replace(/<meta\s+name=["']viewport["'][^>]*>/gi, '<meta name="viewport" content="' + LOCKED_VIEWPORT + '" />');
      } else if (/<head[^>]*>/i.test(body)) {
        body = body.replace(/<head([^>]*)>/i, '<head$1>\n<meta name="viewport" content="' + LOCKED_VIEWPORT + '" />');
      }
    }
    return originalSend(body);
  };
  next();
});

app.use(cookieParser());
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));

// Speed pass: browser-cache static Tapzy assets so repeat visits feel much faster.
// Server-rendered HTML still stays dynamic because this only affects static files.
const staticCache = {
  etag: true,
  maxAge: "7d",
  setHeaders(res, filePath) {
    if (filePath && (/\/sw\.js$/i.test(filePath) || /\.(?:html?)$/i.test(filePath))) {
      res.setHeader("Cache-Control", "no-cache");
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  },
};

const uploadsCache = {
  etag: true,
  maxAge: "30d",
  setHeaders(res, filePath) {
    if (filePath && /\.(?:mp4|mov|m4v|webm|3gp|3gpp|avi|hevc)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
  },
};

app.use(express.static(path.join(__dirname, "..", "public"), staticCache));
app.use("/uploads", express.static(uploadsDir, uploadsCache));

app.use(sessionMiddleware);

app.use("/api/assistant", assistantRoutes);

app.use("/", authRoutes);
app.use("/", cardsRoutes);
app.use("/", activateRoutes);
app.use("/", profileRoutes);
app.use("/", shareRoutes);
app.use("/", messagesRoutes);
app.use("/", searchRoutes);
app.use("/", adminRoutes);
app.use("/", miscRoutes);
app.use("/", discoveryRoutes);
app.use("/", pairRoutes);
app.use("/", eventsRoutes);
app.use("/", mediaChunksRoutes);
app.use("/", storiesRoutes);
app.use("/", postsRoutes);
app.use("/", notificationsRoutes);

app.use((err, req, res, next) => {
  if (!err || err.code !== "LIMIT_FILE_SIZE") return next(err);
  const message = "This video is still too large after Tapzy's upload prep. Try exporting it at 1080p or lower, then post again.";
  const isAjax = req.xhr || req.get("X-Requested-With") === "XMLHttpRequest";
  if (isAjax) return res.status(413).json({ ok: false, error: message });
  return res.status(413).send(message);
});

module.exports = app;
