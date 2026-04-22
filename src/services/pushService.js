const prisma = require("../prisma");
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = require("../config");

let webPush = null;
let configured = false;

function getWebPush() {
  if (configured) return webPush;
  configured = true;
  try {
    // Optional dependency. App still works without it.
    webPush = require("web-push");
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      webPush.setVapidDetails(VAPID_SUBJECT || "mailto:support@tapzy.org", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    }
  } catch (error) {
    webPush = null;
    console.warn("web-push not installed. Push notifications will stay disabled until dependency is added.");
  }
  return webPush;
}

function hasPushConfig() {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && getWebPush());
}

function normalizeSubscription(raw) {
  const endpoint = String(raw?.endpoint || "").trim();
  const p256dh = String(raw?.keys?.p256dh || "").trim();
  const auth = String(raw?.keys?.auth || "").trim();
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}

async function savePushSubscription({ profileId, subscription, userAgent = "" }) {
  const normalized = normalizeSubscription(subscription);
  if (!profileId || !normalized) return null;
  return prisma.pushSubscription.upsert({
    where: { endpoint: normalized.endpoint },
    create: {
      profileId,
      endpoint: normalized.endpoint,
      p256dh: normalized.keys.p256dh,
      auth: normalized.keys.auth,
      userAgent: String(userAgent || "").slice(0, 500) || null,
    },
    update: {
      profileId,
      p256dh: normalized.keys.p256dh,
      auth: normalized.keys.auth,
      userAgent: String(userAgent || "").slice(0, 500) || null,
      lastUsedAt: new Date(),
    },
  });
}

async function removePushSubscription({ profileId, endpoint }) {
  const cleanEndpoint = String(endpoint || "").trim();
  if (!cleanEndpoint || !profileId) return { count: 0 };
  return prisma.pushSubscription.deleteMany({ where: { profileId, endpoint: cleanEndpoint } });
}

async function sendPushToProfile(profileId, payload = {}) {
  if (!profileId || !hasPushConfig()) return { count: 0, skipped: true };

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { profileId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  if (!subscriptions.length) return { count: 0, skipped: true };

  const wp = getWebPush();
  const message = JSON.stringify({
    title: payload.title || "Tapzy",
    body: payload.body || "You have a new notification",
    icon: payload.icon || "/images/tapzy-logo-white.png",
    badge: payload.badge || "/images/tapzy-logo-white.png",
    tag: payload.tag || payload.type || "tapzy-notification",
    url: payload.url || "/notifications",
    image: payload.image || "",
    vibrate: Array.isArray(payload.vibrate) ? payload.vibrate : [120, 40, 160],
    data: payload.data || {},
  });

  await Promise.all(subscriptions.map(async (sub) => {
    const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
    try {
      await wp.sendNotification(subscription, message);
      await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      console.error("Push send error", statusCode || "", error?.message || error);
      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
      }
    }
  }));

  return { count: subscriptions.length };
}

module.exports = {
  hasPushConfig,
  savePushSubscription,
  removePushSubscription,
  sendPushToProfile,
};
