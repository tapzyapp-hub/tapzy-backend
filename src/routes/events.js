const router = require("express").Router();

const getEventsFeed = require("../events/handlers/getEventsFeed");
const getEventsPage = require("../events/handlers/getHiddenEventsAssistantPage");
const getEventDetailPage = require("../events/handlers/getEventDetailPage");
const postAdminSync = require("../events/handlers/postAdminSync");
const postToggleGoing = require("../events/handlers/postToggleGoing");

router.get("/events/feed", getEventsFeed);
router.get("/events", getEventsPage);
router.get("/events/view/:id", getEventDetailPage);
router.post("/events/admin/sync", postAdminSync);
router.post("/events/:id/going", postToggleGoing);

module.exports = router;
