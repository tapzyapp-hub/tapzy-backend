require("dotenv").config();

const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");

const app = require("./src/app");
const prisma = require("./src/prisma");
const { PORT, WEB_BASE, isAllowedOrigin } = require("./src/config");
const { uploadsDir } = require("./src/upload");
const { cleanUsername } = require("./src/utils");

fs.mkdirSync(uploadsDir, { recursive: true });

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin(origin, cb) {
      if (isAllowedOrigin(origin)) {
        return cb(null, true);
      }
      return cb(new Error("Not allowed by Socket.IO CORS"));
    },
    credentials: true,
  },
});

app.set("io", io);

const liveHosts = new Map();
const liveViewers = new Map();

function liveRoomCount(storyId) {
  const viewers = liveViewers.get(storyId);
  return viewers ? viewers.size : 0;
}

function emitLiveCount(storyId) {
  io.to(`live:${storyId}`).emit("live:count", {
    storyId,
    count: liveRoomCount(storyId),
  });
}

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("join_inbox", (profileId) => {
    const id = String(profileId || "").trim();
    if (!id) return;
    socket.join(`inbox:${id}`);
  });

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

  socket.on("live:join", ({ storyId, role, name }) => {
    const id = String(storyId || "").trim();
    const liveRole = String(role || "").trim();
    if (!id) return;

    socket.join(`live:${id}`);
    socket.data.liveStoryId = id;
    socket.data.liveRole = liveRole;
    socket.data.liveName = String(name || "").trim() || "Viewer";

    if (liveRole === "host") {
      liveHosts.set(id, socket.id);
      if (!liveViewers.has(id)) liveViewers.set(id, new Set());
      io.to(`live:${id}`).emit("live:host-ready", {
        storyId: id,
        hostId: socket.id,
      });
      emitLiveCount(id);
      return;
    }

    if (!liveViewers.has(id)) liveViewers.set(id, new Set());
    liveViewers.get(id).add(socket.id);
    emitLiveCount(id);

    const hostId = liveHosts.get(id);
    if (hostId) {
      io.to(hostId).emit("live:viewer-joined", {
        storyId: id,
        viewerId: socket.id,
        name: socket.data.liveName,
      });
    } else {
      socket.emit("live:waiting", { storyId: id });
    }
  });

  socket.on("live:offer", ({ storyId, to, sdp }) => {
    const id = String(storyId || "").trim();
    const target = String(to || "").trim();
    if (!id || !target || !sdp) return;
    io.to(target).emit("live:offer", { storyId: id, from: socket.id, sdp });
  });

  socket.on("live:answer", ({ storyId, to, sdp }) => {
    const id = String(storyId || "").trim();
    const target = String(to || "").trim();
    if (!id || !target || !sdp) return;
    io.to(target).emit("live:answer", { storyId: id, from: socket.id, sdp });
  });

  socket.on("live:ice", ({ storyId, to, candidate }) => {
    const id = String(storyId || "").trim();
    const target = String(to || "").trim();
    if (!id || !target || !candidate) return;
    io.to(target).emit("live:ice", { storyId: id, from: socket.id, candidate });
  });

  socket.on("live:end", ({ storyId }) => {
    const id = String(storyId || "").trim();
    if (!id) return;
    if (liveHosts.get(id) === socket.id) {
      liveHosts.delete(id);
      socket.to(`live:${id}`).emit("live:ended", { storyId: id });
    }
  });

  socket.on("live:chat", ({ storyId, message, name, clientMessageId }) => {
    const id = String(storyId || "").trim();
    const text = String(message || "").trim().slice(0, 220);
    if (!id || !text) return;
    io.to(`live:${id}`).emit("live:chat", {
      storyId: id,
      name: String(name || socket.data.liveName || "Viewer").trim().slice(0, 48) || "Viewer",
      message: text,
      clientMessageId: String(clientMessageId || "").trim().slice(0, 80),
      at: Date.now(),
    });
  });

  socket.on("live:gift", ({ storyId, gift, amount, name }) => {
    const id = String(storyId || "").trim();
    const giftName = String(gift || "Rose").trim().slice(0, 32) || "Rose";
    const giftAmount = Math.max(0, Math.min(9999, Number(amount || 0) || 0));
    if (!id) return;
    io.to(`live:${id}`).emit("live:gift", {
      storyId: id,
      name: String(name || socket.data.liveName || "Viewer").trim().slice(0, 48) || "Viewer",
      gift: giftName,
      amount: giftAmount,
      at: Date.now(),
    });
  });

  socket.on("disconnect", () => {
    const liveStoryId = socket.data.liveStoryId;
    if (liveStoryId && liveHosts.get(liveStoryId) === socket.id) {
      liveHosts.delete(liveStoryId);
      socket.to(`live:${liveStoryId}`).emit("live:ended", { storyId: liveStoryId });
    }
    if (liveStoryId && liveViewers.has(liveStoryId)) {
      liveViewers.get(liveStoryId).delete(socket.id);
      emitLiveCount(liveStoryId);
      if (!liveViewers.get(liveStoryId).size && !liveHosts.has(liveStoryId)) {
        liveViewers.delete(liveStoryId);
      }
    }
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

