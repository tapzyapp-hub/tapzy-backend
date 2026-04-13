const router = require("express").Router();
const prisma = require("../prisma");
const { upload } = require("../upload");

const startConversation = require("../messages/handlers/startConversation");
const getMessagesPage = require("../messages/handlers/getMessagesPage");
const getConversationPage = require("../messages/handlers/getConversationPage");
const postSendMessage = require("../messages/handlers/postSendMessage");

router.post("/messages/start/:username", startConversation);
router.get("/messages", getMessagesPage);
router.get("/messages/:id", getConversationPage);
router.post("/messages/:id", upload.single("image"), postSendMessage);
router.post("/messages/:id/voice", upload.single("audio"), postSendMessage);
router.delete("/messages/:id", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).json({ ok: false, error: "Please sign in first" });

    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "Missing conversation id" });

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { members: true },
    });

    if (!conversation) return res.status(404).json({ ok: false, error: "Conversation not found" });

    const isMember = conversation.members.some((member) => member.profileId === currentProfile.id);
    if (!isMember) return res.status(403).json({ ok: false, error: "Forbidden" });

    await prisma.conversation.delete({ where: { id } });
    return res.json({ ok: true, id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "Delete conversation error" });
  }
});

module.exports = router;