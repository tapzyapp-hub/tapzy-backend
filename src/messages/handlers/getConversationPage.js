const prisma = require("../../prisma");
const { escapeHtml, renderShell, renderTapzyAssistant } = require("../../utils");
const renderConversationPage = require("../pages/renderConversationPage");

module.exports = async function getConversationPage(req, res) {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const id = String(req.params.id || "").trim();
    if (!id) return res.status(404).send("Conversation not found");

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        members: {
          include: { profile: true },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 200,
          include: { sender: true },
        },
      },
    });

    if (!conversation) return res.status(404).send("Conversation not found");

    const memberRecord = conversation.members.find(
      (member) => member.profileId === currentProfile.id
    );
    if (!memberRecord) return res.status(403).send("Forbidden");

    await prisma.conversationMember.update({
      where: { id: memberRecord.id },
      data: {
        hiddenAt: null,
        lastReadAt: new Date(),
      },
    });

    const unreadRows = await prisma.directMessage.findMany({
      where: {
        conversationId: id,
        senderProfileId: { not: currentProfile.id },
        readAt: null,
      },
      select: { id: true },
    });

    if (unreadRows.length) {
      const now = new Date();
      await prisma.directMessage.updateMany({
        where: {
          id: { in: unreadRows.map((row) => row.id) },
        },
        data: {
          readAt: now,
        },
      });

      const io = req.app.get("io");
      if (io) {
        io.to(`conversation:${id}`).emit("messages_seen", {
          conversationId: id,
          readerProfileId: currentProfile.id,
          messageIds: unreadRows.map((row) => row.id),
          seenAt: now.toISOString(),
        });
      }
    }

    const refreshedConversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        members: {
          include: { profile: true },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 200,
          include: { sender: true },
        },
      },
    });

    const otherMember = refreshedConversation.members.find(
      (member) => member.profileId !== currentProfile.id
    );
    const other = otherMember?.profile || null;
    const refreshedMemberRecord = refreshedConversation.members.find(
      (member) => member.profileId === currentProfile.id
    );
    let blockState = { iBlockedThem: false, theyBlockedMe: false };

    if (other?.id) {
      try {
        const blocks = await prisma.userBlock.findMany({
          where: {
            OR: [
              { blockerId: currentProfile.id, blockedId: other.id },
              { blockerId: other.id, blockedId: currentProfile.id },
            ],
          },
          select: { blockerId: true, blockedId: true },
        });

        blockState = {
          iBlockedThem: blocks.some((row) => row.blockerId === currentProfile.id && row.blockedId === other.id),
          theyBlockedMe: blocks.some((row) => row.blockerId === other.id && row.blockedId === currentProfile.id),
        };
      } catch (blockError) {
        const message = String(blockError?.message || blockError || "");
        if (!/(userBlock|UserBlock|P2021|P2022|does not exist|column)/i.test(message)) throw blockError;
      }
    }

    const body = renderConversationPage({
      currentProfile,
      conversation: refreshedConversation,
      other,
      memberSettings: refreshedMemberRecord || {},
      blockState,
      escapeHtml,
      renderTapzyAssistant,
    });

    res.send(
      renderShell("Conversation", body, "", {
        currentProfile,
        pageTitle: other?.name || other?.username || "Conversation",
        pageType: "messages",
        storiesBottomNav: true,
        hideTopBar: true,
      })
    );
  } catch (e) {
    console.error(e);
    res.status(500).send("Conversation error");
  }
};
