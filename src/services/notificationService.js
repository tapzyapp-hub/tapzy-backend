const prisma = require("../prisma");
const { getIO } = require("./realtimeService");
const { sendPushToProfile } = require("./pushService");

function normalizeValue(value) {
  return value == null ? "" : String(value).trim();
}

async function findRecentDuplicate({ profileId, actorId = null, type, entityType = "", entityId = "" }) {
  if (!profileId || !type) return null;

  return prisma.notification.findFirst({
    where: {
      profileId,
      actorId: actorId || null,
      type,
      entityType: normalizeValue(entityType) || null,
      entityId: normalizeValue(entityId) || null,
      readAt: null,
      createdAt: {
        gte: new Date(Date.now() - 1000 * 60 * 10),
      },
    },
    select: { id: true },
  });
}

async function createNotification({
  profileId,
  actorId = null,
  type,
  title,
  body = "",
  link = "",
  entityType = "",
  entityId = "",
  image = "",
  skipDuplicateWindow = true,
}) {
  const recipientId = normalizeValue(profileId);
  const actorProfileId = normalizeValue(actorId) || null;
  const notificationType = normalizeValue(type);
  const notificationTitle = normalizeValue(title);

  if (!recipientId || !notificationType || !notificationTitle) return null;
  if (actorProfileId && actorProfileId === recipientId) return null;

  if (skipDuplicateWindow) {
    const existing = await findRecentDuplicate({
      profileId: recipientId,
      actorId: actorProfileId,
      type: notificationType,
      entityType,
      entityId,
    });

    if (existing) return existing;
  }

  const created = await prisma.notification.create({
    data: {
      profileId: recipientId,
      actorId: actorProfileId,
      type: notificationType,
      title: notificationTitle,
      body: normalizeValue(body) || null,
      link: normalizeValue(link) || null,
      entityType: normalizeValue(entityType) || null,
      entityId: normalizeValue(entityId) || null,
      image: normalizeValue(image) || null,
    },
  });
}


async function emitNotificationToProfile(notification) {
  if (!notification?.profileId) return;
  try {
    const unreadCount = await getUnreadNotificationCount(notification.profileId);
    const io = getIO();
    if (io) {
      io.to(`profile:${notification.profileId}`).emit("notification_new", {
        profileId: notification.profileId,
        unreadCount,
        title: notification.title || "New notification",
        body: notification.body || "",
        link: notification.link || "/notifications",
        image: notification.image || "",
        type: notification.type || "general",
      });
      io.to(`profile:${notification.profileId}`).emit("notification_count", {
        profileId: notification.profileId,
        unreadCount,
      });
    }

    await sendPushToProfile(notification.profileId, {
      title: notification.title || "Tapzy",
      body: notification.body || "You have a new notification",
      image: notification.image || "",
      url: notification.link || "/notifications",
      type: notification.type || "general",
      tag: `${notification.type || 'notification'}:${notification.entityType || ''}:${notification.entityId || notification.id || ''}`,
      data: {
        link: notification.link || "/notifications",
        notificationId: notification.id || "",
        type: notification.type || "general",
      },
    });
  } catch (error) {
    console.error("emitNotificationToProfile error", error);
  }
}

async function createManyNotifications(items = []) {
  const valid = [];
  for (const item of items) {
    if (!item || !item.profileId || !item.type || !item.title) continue;
    if (item.actorId && String(item.actorId) === String(item.profileId)) continue;
    valid.push({
      profileId: String(item.profileId),
      actorId: item.actorId ? String(item.actorId) : null,
      type: String(item.type),
      title: String(item.title),
      body: normalizeValue(item.body) || null,
      link: normalizeValue(item.link) || null,
      entityType: normalizeValue(item.entityType) || null,
      entityId: normalizeValue(item.entityId) || null,
      image: normalizeValue(item.image) || null,
    });
  }

  if (!valid.length) return { count: 0 };
  return prisma.notification.createMany({ data: valid });
}

async function markNotificationRead(id, profileId) {
  return prisma.notification.updateMany({
    where: { id, profileId, readAt: null },
    data: { readAt: new Date() },
  });
}

async function markAllNotificationsRead(profileId) {
  return prisma.notification.updateMany({
    where: { profileId, readAt: null },
    data: { readAt: new Date() },
  });
}

async function getUnreadNotificationCount(profileId) {
  if (!profileId) return 0;
  return prisma.notification.count({
    where: { profileId, readAt: null },
  });
}

module.exports = {
  createNotification,
  createManyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
};
