let webPush = null;
try {
  webPush = require("web-push");
} catch (_) {
  webPush = null;
}

const prisma = require("../prisma");

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || process.env.WEB_PUSH_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || process.env.WEB_PUSH_PRIVATE_KEY || "";
const SUBJECT = process.env.VAPID_SUBJECT || process.env.WEB_PUSH_SUBJECT || "mailto:tapzy@tapzy.org";

function isConfigured() {
  return !!(webPush && PUBLIC_KEY && PRIVATE_KEY);
}

function configure() {
  if (!isConfigured()) return false;
  webPush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  return true;
}

function publicKey() {
  return PUBLIC_KEY;
}

async function saveSubscription(profileId, subscription, userAgent = "") {
  if (!profileId || !subscription || !subscription.endpoint) return null;
  const keys = subscription.keys || {};
  if (!keys.p256dh || !keys.auth) return null;
  return prisma.pushSubscription.upsert({
    where: { endpoint: String(subscription.endpoint) },
    update: {
      profileId,
      p256dh: String(keys.p256dh),
      auth: String(keys.auth),
      userAgent: String(userAgent || "").slice(0, 300),
      lastUsedAt: new Date(),
    },
    create: {
      profileId,
      endpoint: String(subscription.endpoint),
      p256dh: String(keys.p256dh),
      auth: String(keys.auth),
      userAgent: String(userAgent || "").slice(0, 300),
      lastUsedAt: new Date(),
    },
  });
}

async function sendPushToProfile(profileId, payload = {}) {
  if (!profileId || !configure()) return { ok: false, skipped: true };
  const subscriptions = await prisma.pushSubscription.findMany({ where: { profileId } });
  await Promise.all(subscriptions.map(async (row) => {
    const sub = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
    try {
      await webPush.sendNotification(sub, JSON.stringify(payload));
      await prisma.pushSubscription.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    } catch (error) {
      const code = Number(error && error.statusCode);
      if (code === 404 || code === 410) {
        await prisma.pushSubscription.delete({ where: { id: row.id } }).catch(() => {});
      } else {
        console.error("Push notification failed", error && error.message ? error.message : error);
      }
    }
  }));
  return { ok: true };
}

module.exports = { isConfigured, publicKey, saveSubscription, sendPushToProfile };
