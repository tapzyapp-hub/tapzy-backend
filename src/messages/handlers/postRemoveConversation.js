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

    try {
      await prisma.conversationMember.update({
        where: { id: membership.id },
        data: { hiddenAt: new Date() },
      });
    } catch (updateError) {
      const message = String(updateError?.message || updateError || "");
      if (!/(hiddenAt|Unknown arg|P2022|column)/i.test(message)) throw updateError;
      await prisma.conversationMember.delete({
        where: { id: membership.id },
      });
    }

    return res.redirect("/messages");
  } catch (e) {
    console.error(e);
    return res.status(500).send("Remove conversation error");
  }
};
