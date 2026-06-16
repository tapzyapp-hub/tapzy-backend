const rateLimit = require("express-rate-limit");
const prisma = require("./prisma");
const { SESSION_COOKIE, ADMIN_KEY, IS_PROD } = require("./config");

function makeLimiter(max) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

const activateLimiter = makeLimiter(40);
const adminLimiter = makeLimiter(100);
const shareLimiter = makeLimiter(80);
const editLimiter = makeLimiter(80);
const momentLimiter = makeLimiter(100);
const authLimiter = makeLimiter(30);
const followLimiter = makeLimiter(120);
const likeLimiter = makeLimiter(200);
const searchLimiter = makeLimiter(120);
const messageLimiter = makeLimiter(120);
const pairLimiter = makeLimiter(120);
const eventLimiter = makeLimiter(120);

const SESSION_CACHE_TTL_MS = 30 * 1000;
const sessionCache = new Map();

function getCachedSession(token) {
  const cached = sessionCache.get(token);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    sessionCache.delete(token);
    return null;
  }
  return cached.value;
}

function setCachedSession(token, value) {
  if (!token || !value) return;
  sessionCache.set(token, { value, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });

  // Prevent unlimited memory growth on long-running servers.
  if (sessionCache.size > 1000) {
    for (const key of sessionCache.keys()) {
      sessionCache.delete(key);
      if (sessionCache.size <= 800) break;
    }
  }
}

function requireAdmin(req, res) {
  if (!ADMIN_KEY) {
    if (!IS_PROD) return true;
    res.status(503).send("Admin access is not configured");
    return false;
  }

  const key = String(req.query?.key || req.headers["x-admin-key"] || "").trim();

  if (key !== ADMIN_KEY) {
    res.status(401).send("Unauthorized (missing or invalid admin key)");
    return false;
  }

  return true;
}

async function sessionMiddleware(req, _res, next) {
  try {
    req.currentAccount = null;
    req.currentProfile = null;

    const token = String(req.cookies?.[SESSION_COOKIE] || "").trim();
    if (!token) return next();

    let session = getCachedSession(token);

    if (!session) {
      session = await prisma.userSession.findUnique({
        where: { token },
        select: {
          expiresAt: true,
          userAccount: { include: { profile: true } },
        },
      });

      if (!session) return next();

      if (session.expiresAt < new Date()) {
        try {
          await prisma.userSession.delete({ where: { token } });
        } catch {}
        sessionCache.delete(token);
        return next();
      }

      setCachedSession(token, session);
    }

    req.currentAccount = session.userAccount || null;
    req.currentProfile = session.userAccount?.profile || null;

    return next();
  } catch (error) {
    console.error("sessionMiddleware error:", error);
    return next();
  }
}

module.exports = {
  activateLimiter,
  adminLimiter,
  shareLimiter,
  editLimiter,
  momentLimiter,
  authLimiter,
  followLimiter,
  likeLimiter,
  searchLimiter,
  messageLimiter,
  pairLimiter,
  eventLimiter,
  requireAdmin,
  sessionMiddleware,
};
