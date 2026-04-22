const prisma = require("../../prisma");
const { createNotification } = require("../../services/notificationService");

const ALLOWED_REACTIONS = new Set(["❤️", "🔥", "😂", "👍", "👀", "😮"]);

function summarizeReactions(reactions = []) {
  const grouped = new Map();
  for (const reaction of reactions) {
    const emoji = String(reaction?.emoji || "").trim();
    if (!emoji) continue;
    if (!grouped.has(emoji)) grouped.set(emoji, { emoji, count: 0, profileIds: [], names: [] });
    const item = grouped.get(emoji);
    item.count += 1;
    if (reaction.profileId) item.profileIds.push(String(reaction.profileId));
    if (reaction.profile?.name || reaction.profile?.username) item.names.push(reaction.profile?.name || reaction.profile?.username);
  }
  return Array.from(grouped.values());
}

module.exports = async function postToggleReaction(req, res) {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).json({ ok: false, error: "Please sign in first" });

    const conversationId = String(req.params.id || "").trim();
    const messageId = String(req.params.messageId || "").trim();
    const emoji = String(req.body?.emoji || "").trim();

    if (!conversationId || !messageId || !ALLOWED_REACTIONS.has(emoji)) {
      return res.status(400).json({ ok: false, error: "Invalid reaction" });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: { include: { profile: true } } },
    });
    if (!conversation) return res.status(404).json({ ok: false, error: "Conversation not found" });
    if (!conversation.members.some((member) => member.profileId === currentProfile.id)) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const message = await prisma.directMessage.findFirst({
      where: { id: messageId, conversationId },
      include: {
        sender: true,
        reactions: { include: { profile: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!message) return res.status(404).json({ ok: false, error: "Message not found" });

    const existing = message.reactions.find((reaction) => reaction.profileId === currentProfile.id && reaction.emoji === emoji);
    let active = true;

    if (existing) {
      await prisma.messageReaction.delete({ where: { id: existing.id } });
      active = false;
    } else {
      await prisma.messageReaction.create({
        data: { messageId: message.id, profileId: currentProfile.id, emoji },
      });
      active = true;

      if (message.senderProfileId !== currentProfile.id) {
        await createNotification({
          profileId: message.senderProfileId,
          actorId: currentProfile.id,
          type: "message_reaction",
          title: `${currentProfile.name || currentProfile.username || "Someone"} reacted to your message`,
          body: `${emoji} in your conversation`,
          link: `/messages/${conversationId}`,
          entityType: "message",
          entityId: message.id,
          image: currentProfile.photo || "",
          skipDuplicateWindow: false,
        });
      }
    }

    const updated = await prisma.directMessage.findFirst({
      where: { id: messageId, conversationId },
      include: { reactions: { include: { profile: true }, orderBy: { createdAt: "asc" } } },
    });

    const summary = summarizeReactions(updated?.reactions || []);

    const io = req.app.get("io");
    if (io) {
      io.to(`conversation:${conversationId}`).emit("message_reactions_updated", {
        conversationId,
        messageId,
        reactions: summary,
      });
      conversation.members.forEach((member) => {
        io.to(`profile:${member.profileId}`).emit("conversation_updated", { profileId: member.profileId, conversationId });
      });
    }

    return res.json({ ok: true, active, messageId, reactions: summary });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "Reaction error" });
  }
};
