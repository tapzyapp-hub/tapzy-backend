const prisma = require("../../prisma");

module.exports = async function postRemoveConversation(req, res) {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const id = String(req.params.id || "").trim();
    if (!id) return res.redirect("/messages");

    const membership = await prisma.conversationMember.findFirst({
      where: {
        conversationId: id,
        profileId: currentProfile.id,
      },
      select: { id: true },
    });

    if (!membership) return res.status(404).send("Conversation not found");

    await prisma.conversationMember.update({
      where: { id: membership.id },
      data: { hiddenAt: new Date() },
    });

    return res.redirect("/messages");
  } catch (e) {
    console.error(e);
    return res.status(500).send("Remove conversation error");
  }
};
