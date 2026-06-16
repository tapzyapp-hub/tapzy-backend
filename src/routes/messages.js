const router = require("express").Router();
const { upload } = require("../upload");

const startConversation = require("../messages/handlers/startConversation");
const getMessagesPage = require("../messages/handlers/getMessagesPage");
const getConversationPage = require("../messages/handlers/getConversationPage");
const postSendMessage = require("../messages/handlers/postSendMessage");
const postRemoveConversation = require("../messages/handlers/postRemoveConversation");
const postConversationSettings = require("../messages/handlers/postConversationSettings");
const getConversationMessages = require("../messages/handlers/getConversationMessages");

router.post("/messages/start/:username", startConversation);
router.get("/messages", getMessagesPage);
router.get("/messages/:id", getConversationPage);
router.get("/messages/:id/live", getConversationMessages);
router.post("/messages/:id/settings", postConversationSettings);
router.post("/messages/:id", (req, res, next) => {
  upload.single("media")(req, res, (err) => {
    if (!err) return next();

    const isAjax = req.xhr || req.get("X-Requested-With") === "XMLHttpRequest";
    const message = err.message || "Upload failed";

    if (isAjax) return res.status(400).json({ ok: false, error: message });
    return res.status(400).send(message);
  });
}, postSendMessage);
router.post("/messages/:id/remove", postRemoveConversation);

module.exports = router;
