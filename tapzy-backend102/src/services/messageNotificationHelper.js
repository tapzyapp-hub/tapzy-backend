const { createNotification } = require("./notificationService");

async function notifyNewMessage({ receiverId, senderId, senderName = "", conversationId, preview = "", senderPhoto = "" }) {
  if (!receiverId || !senderId || receiverId === senderId || !conversationId) return null;

  const actorLabel = String(senderName || "").trim() || "New message";
  const body = String(preview || "").trim() || "You have a new message";

  return createNotification({
    profileId: receiverId,
    actorId: senderId,
    type: "message_received",
    title: `${actorLabel} sent you a message`,
    body,
    link: `/messages/${conversationId}`,
    entityType: "conversation",
    entityId: conversationId,
    image: senderPhoto,
  });
}

module.exports = { notifyNewMessage };
