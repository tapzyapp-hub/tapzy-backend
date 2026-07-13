const prisma = require("../../prisma");
const {
  formatPrettyLocal,
  renderShell,
  renderTapzyAssistant,
} = require("../../utils");
const renderMessagesInboxPage = require("../pages/renderMessagesInboxPage");
const { getUnreadNotificationCount } = require("../../services/notificationService");

function isAudioMediaUrl(url) {
  const value = String(url || "").trim();
  return /\.(mp3|wav|ogg|m4a|aac)(?:[?#].*)?$/i.test(value) || /voice-note\./i.test(value);
}

function isVideoMediaUrl(url) {
  return /\.(mp4|mov|webm|m4v)(?:[?#].*)?$/i.test(String(url || "").trim());
}

function cleanPreview(lastMessage) {
  if (!lastMessage) return "No messages yet";

  const body = String(lastMessage.body || "").trim();
  const imageUrl = String(lastMessage.imageUrl || "").trim();
  const hasAudio = !!String(lastMessage.audioUrl || "").trim() || isAudioMediaUrl(imageUrl);
  const hasVideo = !!imageUrl && !hasAudio && isVideoMediaUrl(imageUrl);
  const hasImage = !!imageUrl && !hasAudio && !hasVideo;

  if (body) return body;
  if (hasAudio) return "Voice message";
  if (hasVideo) return "Sent a video";
  if (hasImage) return "Sent an image";
  return "No messages yet";
}

module.exports = async function getMessagesPage(req, res) {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");
    const view = String(req.query.view || "inbox").trim().toLowerCase() === "archived" ? "archived" : "inbox";

    async function findConversations(withSettings = true) {
      const memberWhere = {
        profileId: currentProfile.id,
        hiddenAt: null,
      };

      if (withSettings) {
        memberWhere.archivedAt = view === "archived" ? { not: null } : null;
      }

      return prisma.conversation.findMany({
        where: {
          members: {
            some: memberWhere,
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
    }

    let conversations;
    try {
      conversations = await findConversations(true);
    } catch (settingsQueryError) {
      const message = String(settingsQueryError?.message || settingsQueryError || "");
      if (!/(archivedAt|Unknown arg|P2022|column)/i.test(message)) throw settingsQueryError;
      conversations = await findConversations(false);
    }

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

    const unreadCounts = conversations.length
      ? await prisma.directMessage.groupBy({
          by: ["conversationId"],
          where: {
            conversationId: { in: conversations.map((conversation) => conversation.id) },
            senderProfileId: { not: currentProfile.id },
            readAt: null,
          },
          _count: { _all: true },
        })
      : [];

    const unreadMap = new Map(
      unreadCounts.map((row) => [row.conversationId, row._count._all || 0])
    );

    const rows = conversations.map((conversation) => {
      const otherMember = conversation.members.find(
        (member) => member.profileId !== currentProfile.id
      );
      const myMember = conversation.members.find(
        (member) => member.profileId === currentProfile.id
      );

      const other = otherMember?.profile || null;
      const lastMessage = conversation.messages[0] || null;
      const preview = cleanPreview(lastMessage);
      const time = lastMessage ? formatPrettyLocal(lastMessage.createdAt) : "";
      const mutedUntil = myMember?.mutedUntil ? new Date(myMember.mutedUntil) : null;
      const isMuted = mutedUntil && mutedUntil.getTime() > Date.now();

      return {
        id: conversation.id,
        other,
        preview,
        time,
        unreadCount: unreadMap.get(conversation.id) || 0,
        isConnected: !!(other?.id && mutualConnectionIds.has(other.id)),
        isPinned: !!myMember?.pinnedAt,
        isMuted: !!isMuted,
        isArchived: !!myMember?.archivedAt,
        pinnedAt: myMember?.pinnedAt || null,
      };
    }).sort((a, b) => {
      if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;
      return 0;
    });

    const unreadNotificationCount = await getUnreadNotificationCount(currentProfile.id);

    const body = renderMessagesInboxPage({
      currentProfile,
      rows,
      conversationCount: conversations.length,
      renderTapzyAssistant,
      unreadNotificationCount,
      view,
    });

    res.send(
      renderShell("Messages", body, "", {
        currentProfile,
        pageTitle: "Messages",
        pageType: "messages-list",
        storiesBottomNav: true,
        hideTopBar: true,
      })
    );
  } catch (e) {
    console.error(e);
    res.status(500).send("Messages page error");
  }
};
