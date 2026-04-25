const prisma = require("../../prisma");

function toPayload(message) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    body: message.body,
    imageUrl: message.imageUrl,
    audioUrl: message.audioUrl,
    createdAt: message.createdAt,
    deliveredAt: message.deliveredAt,
    readAt: message.readAt,
    senderProfileId: message.senderProfileId,
    senderName: message.sender?.name || message.sender?.username || "User",
    senderUsername: message.sender?.username || "user",
    senderPhoto: message.sender?.photo || "",
  };
}

module.exports = async function getConversationMessages(req, res) {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).json({ ok: false, error: "Please sign in first" });

    const id = String(req.params.id || "").trim();
    if (!id) return res.status(404).json({ ok: false, error: "Conversation not found" });

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { members: true },
    });

    if (!conversation) return res.status(404).json({ ok: false, error: "Conversation not found" });

    const isMember = conversation.members.some((member) => member.profileId === currentProfile.id);
    if (!isMember) return res.status(403).json({ ok: false, error: "Forbidden" });

    const after = String(req.query.after || "").trim();
    const cursorDate = after ? new Date(after) : null;
    const hasValidCursor = cursorDate && !Number.isNaN(cursorDate.getTime());

    const messages = await prisma.directMessage.findMany({
      where: {
        conversationId: id,
        ...(hasValidCursor ? { createdAt: { gt: cursorDate } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: { sender: true },
    });

    const unreadIncomingIds = messages
      .filter((message) => message.senderProfileId !== currentProfile.id && !message.readAt)
      .map((message) => message.id);

    if (unreadIncomingIds.length) {
      const now = new Date();
      await prisma.directMessage.updateMany({
        where: { id: { in: unreadIncomingIds } },
        data: { readAt: now },
      });
      await prisma.conversationMember.updateMany({
        where: { conversationId: id, profileId: currentProfile.id },
        data: { lastReadAt: now },
      });

      const io = req.app.get("io");
      if (io) {
        io.to(`conversation:${id}`).emit("messages_seen", {
          conversationId: id,
          readerProfileId: currentProfile.id,
          messageIds: unreadIncomingIds,
          seenAt: now.toISOString(),
        });
      }
    }

    return res.json({
      ok: true,
      messages: messages.map(toPayload),
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Load messages error" });
  }
};
