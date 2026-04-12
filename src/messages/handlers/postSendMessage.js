const prisma = require("../../prisma");
const { publicAbsoluteUrl } = require("../../utils");
const { notifyNewMessage } = require("../../services/messageNotificationHelper");

module.exports = async function postSendMessage(req, res) {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) {
      if (req.xhr || req.get("X-Requested-With") === "XMLHttpRequest") {
        return res.status(401).json({ ok: false, error: "Please sign in first" });
      }
      return res.redirect("/auth");
    }

    const id = String(req.params.id || "").trim();
    const text = String(req.body.text || "").trim() || null;
    const mediaUrl = req.file
      ? publicAbsoluteUrl(req, `/uploads/${req.file.filename}`)
      : null;
    const mimetype = String(req.file?.mimetype || "").toLowerCase();

    const imageUrl = mediaUrl && mimetype.startsWith("image/") ? mediaUrl : null;
    const audioUrl =
      mediaUrl && mimetype.startsWith("audio/")
        ? mediaUrl
        : null;

    if (!text && !imageUrl && !audioUrl) {
      if (req.xhr || req.get("X-Requested-With") === "XMLHttpRequest") {
        return res.status(400).json({ ok: false, error: "Message is empty" });
      }
      return res.redirect(`/messages/${id}`);
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { members: true },
    });

    if (!conversation) {
      if (req.xhr || req.get("X-Requested-With") === "XMLHttpRequest") {
        return res.status(404).json({ ok: false, error: "Conversation not found" });
      }
      return res.status(404).send("Conversation not found");
    }

    const myMembership = conversation.members.find(
      (member) => member.profileId === currentProfile.id
    );
    if (!myMembership) {
      if (req.xhr || req.get("X-Requested-With") === "XMLHttpRequest") {
        return res.status(403).json({ ok: false, error: "Forbidden" });
      }
      return res.status(403).send("Forbidden");
    }

    await prisma.conversationMember.update({
      where: { id: myMembership.id },
      data: { hiddenAt: null, lastReadAt: new Date() },
    });

    const recipientMembershipIds = conversation.members
      .filter((member) => member.profileId !== currentProfile.id)
      .map((member) => member.id);

    if (recipientMembershipIds.length) {
      await prisma.conversationMember.updateMany({
        where: { id: { in: recipientMembershipIds } },
        data: { hiddenAt: null },
      });
    }

    const createdMessage = await prisma.directMessage.create({
      data: {
        conversationId: id,
        senderProfileId: currentProfile.id,
        body: text,
        imageUrl,
        audioUrl,
      },
      include: {
        sender: true,
      },
    });

    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    const payload = {
      id: createdMessage.id,
      conversationId: createdMessage.conversationId,
      body: createdMessage.body,
      imageUrl: createdMessage.imageUrl,
      audioUrl: createdMessage.audioUrl,
      createdAt: createdMessage.createdAt,
      deliveredAt: createdMessage.deliveredAt,
      readAt: createdMessage.readAt,
      senderProfileId: createdMessage.senderProfileId,
      senderName: createdMessage.sender?.name || createdMessage.sender?.username || "User",
      senderUsername: createdMessage.sender?.username || "user",
      senderPhoto: createdMessage.sender?.photo || "",
    };

    const otherMemberIds = conversation.members
      .map((member) => member.profileId)
      .filter((profileId) => profileId && profileId !== currentProfile.id);

    if (otherMemberIds.length) {
      const preview =
        text || (audioUrl ? "Sent a voice message" : imageUrl ? "Sent an image" : "New message");
      await Promise.all(
        otherMemberIds.map((receiverId) =>
          notifyNewMessage({
            receiverId,
            senderId: currentProfile.id,
            senderName: payload.senderName,
            senderPhoto: payload.senderPhoto,
            conversationId: id,
            preview,
          })
        )
      );
    }

    const io = req.app.get("io");
    if (io) {
      io.to(`conversation:${id}`).emit("receive_message", payload);
      io.to(`conversation:${id}`).emit("stop_typing", {
        conversationId: id,
      });
    }

    if (req.xhr || req.get("X-Requested-With") === "XMLHttpRequest") {
      return res.json({ ok: true, message: payload });
    }

    res.redirect(`/messages/${id}`);
  } catch (e) {
    console.error(e);

    if (req.xhr || req.get("X-Requested-With") === "XMLHttpRequest") {
      return res.status(500).json({ ok: false, error: "Send message error" });
    }

    res.status(500).send("Send message error");
  }
};
