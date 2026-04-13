const prisma = require("../../prisma");
const {
  formatPrettyLocal,
  renderShell,
  renderTapzyAssistant,
} = require("../../utils");
const renderMessagesInboxPage = require("../pages/renderMessagesInboxPage");

function cleanPreview(lastMessage) {
  if (!lastMessage) return "No messages yet";

  const body = String(lastMessage.body || "").trim();
  const hasImage = !!String(lastMessage.imageUrl || "").trim();
  const hasAudio = !!String(lastMessage.audioUrl || "").trim();

  if (body) return body;
  if (hasImage) return "Sent an image";
  if (hasAudio) return "Sent a voice message";
  return "No messages yet";
}

module.exports = async function getMessagesPage(req, res) {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const conversations = await prisma.conversation.findMany({
      where: {
        members: {
          some: { profileId: currentProfile.id },
        },
      },
      include: {
        members: {
          include: { profile: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { sender: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const otherProfileIds = conversations
      .map((conversation) => {
        const otherMember = conversation.members.find(
          (member) => member.profileId !== currentProfile.id
        );
        return otherMember?.profileId || otherMember?.profile?.id || null;
      })
      .filter(Boolean);

    let mutualConnectionIds = new Set();

    if (otherProfileIds.length) {
      const [iFollowThem, theyFollowMe] = await Promise.all([
        prisma.follow.findMany({
          where: {
            followerProfileId: currentProfile.id,
            followingProfileId: { in: otherProfileIds },
          },
          select: { followingProfileId: true },
        }),
        prisma.follow.findMany({
          where: {
            followerProfileId: { in: otherProfileIds },
            followingProfileId: currentProfile.id,
          },
          select: { followerProfileId: true },
        }),
      ]);

      const iFollowSet = new Set(iFollowThem.map((row) => row.followingProfileId));
      const theyFollowSet = new Set(theyFollowMe.map((row) => row.followerProfileId));

      mutualConnectionIds = new Set(
        [...iFollowSet].filter((id) => theyFollowSet.has(id))
      );
    }

    const rows = conversations.map((conversation) => {
      const otherMember = conversation.members.find(
        (member) => member.profileId !== currentProfile.id
      );

      const other = otherMember?.profile || null;
      const lastMessage = conversation.messages[0] || null;
      const preview = cleanPreview(lastMessage);
      const time = lastMessage ? formatPrettyLocal(lastMessage.createdAt) : "";

      return {
        id: conversation.id,
        other,
        preview,
        time,
        isConnected: !!(other?.id && mutualConnectionIds.has(other.id)),
      };
    });

    const body = renderMessagesInboxPage({
      currentProfile,
      rows,
      conversationCount: conversations.length,
      renderTapzyAssistant,
    });

    res.send(
      renderShell("Messages", body, "", {
        currentProfile,
        pageTitle: "Messages",
        pageType: "messages-list",
      })
    );
  } catch (e) {
    console.error(e);
    res.status(500).send("Messages page error");
  }
};
