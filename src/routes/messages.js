const router = require("express").Router();
const { upload } = require("../upload");

const startConversation = require("../messages/handlers/startConversation");
const getMessagesPage = require("../messages/handlers/getMessagesPage");
const getConversationPage = require("../messages/handlers/getConversationPage");
const postSendMessage = require("../messages/handlers/postSendMessage");
const postRemoveConversation = require("../messages/handlers/postRemoveConversation");

router.post("/messages/start/:username", startConversation);
router.get("/messages", getMessagesPage);
router.get("/messages/:id", getConversationPage);
router.post("/messages/:id", upload.single("media"), postSendMessage);
router.post("/messages/:id/remove", postRemoveConversation);

module.exports = router;