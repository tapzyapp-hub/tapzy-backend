const rateLimit = require("express-rate-limit");
const prisma = require("./prisma");
const { SESSION_COOKIE, ADMIN_KEY } = require("./config");

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

function requireAdmin(req, res) {
  if (!ADMIN_KEY) return true;

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

    const session = await prisma.userSession.findUnique({
      where: { token },
      include: {
        userAccount: {
          include: {
            profile: true,
          },
        },
      },
    });

    if (!session) return next();

    if (session.expiresAt < new Date()) {
      try {
        await prisma.userSession.delete({ where: { token } });
      } catch {}
      return next();
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