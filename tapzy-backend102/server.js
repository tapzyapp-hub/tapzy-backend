require("dotenv").config();

const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");

const app = require("./src/app");
const prisma = require("./src/prisma");
const { PORT, WEB_BASE } = require("./src/config");
const { uploadsDir } = require("./src/upload");
const { cleanUsername } = require("./src/utils");

fs.mkdirSync(uploadsDir, { recursive: true });

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("join_conversation", (conversationId) => {
    const id = String(conversationId || "").trim();
    if (!id) return;
    socket.join(`conversation:${id}`);
  });

  socket.on("leave_conversation", (conversationId) => {
    const id = String(conversationId || "").trim();
    if (!id) return;
    socket.leave(`conversation:${id}`);
  });

  socket.on("typing", ({ conversationId, username }) => {
    const id = String(conversationId || "").trim();
    if (!id) return;

    socket.to(`conversation:${id}`).emit("typing", {
      conversationId: id,
      username: String(username || "").trim() || "User",
    });
  });

  socket.on("stop_typing", ({ conversationId }) => {
    const id = String(conversationId || "").trim();
    if (!id) return;

    socket.to(`conversation:${id}`).emit("stop_typing", {
      conversationId: id,
    });
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

app.use((req, res, next) => {
  const host = String(req.hostname || "");
  if (host.endsWith(".tapzy.me")) {
    const sub = host.split(".")[0];
    const u = cleanUsername(sub);
    if (u && (req.path === "/" || req.path === "")) {
      return res.redirect(302, `/u/${u}`);
    }
  }
  next();
});

app.get("/db-test", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, message: "DB connected" });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/me", async (req, res) => {
  return res.json({ ok: true, currentProfile: req.currentProfile || null });
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  res.status(500).json({
    ok: false,
    error: "Internal server error",
  });
});

server.listen(PORT, () => {
  console.log(`Tapzy running on port ${PORT}`);
  console.log(`Local: http://127.0.0.1:${PORT}`);
  console.log(`WEB_BASE = ${WEB_BASE}`);
});

async function shutdown() {
  try {
    await prisma.$disconnect();
  } catch (e) {
    console.error("Prisma disconnect error:", e);
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

