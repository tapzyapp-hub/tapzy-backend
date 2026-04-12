const prisma = require("../../prisma");
const {
  cleanUsername,
  getOrCreateConversationBetween,
} = require("../../utils");

module.exports = async function startConversation(req, res) {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const username = cleanUsername(req.params.username);
    const other = await prisma.userProfile.findUnique({
      where: { username },
    });

    if (!other) return res.status(404).send("User not found");
    if (other.id === currentProfile.id) return res.redirect("/messages");

    const conversation = await getOrCreateConversationBetween(
      currentProfile.id,
      other.id
    );

    return res.redirect(`/messages/${conversation.id}`);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Start conversation error");
  }
};
