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

    const isMember = conversation.members.some(
      (member) => member.profileId === currentProfile.id
    );
    if (!isMember) return res.status(403).send("Forbidden");

    const otherMember = conversation.members.find(
      (member) => member.profileId !== currentProfile.id
    );
    const other = otherMember?.profile || null;

    const body = renderConversationPage({
      currentProfile,
      conversation,
      other,
      escapeHtml,
      renderTapzyAssistant,
    });

    res.send(
      renderShell("Conversation", body, "", {
        currentProfile,
        pageTitle: other?.name || other?.username || "Conversation",
        pageType: "messages",
      })
    );
  } catch (e) {
    console.error(e);
    res.status(500).send("Conversation error");
  }
};