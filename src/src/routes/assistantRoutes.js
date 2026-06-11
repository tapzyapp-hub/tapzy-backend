const express = require("express");
const { buildAssistantReply } = require("../services/assistantService");

const router = express.Router();

function asSafeString(value, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function asSafeBool(value) {
  return value === true || value === "true";
}

function asSafeMemory(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => ({
      role: asSafeString(item?.role, 40),
      content: asSafeString(item?.content, 2000),
    }))
    .filter((item) => item.role && item.content)
    .slice(-12);
}

async function handleAssistantRequest(req, res) {
  try {
    const body = req.body || {};

    const message = asSafeString(body.message, 4000);
    const pageType = asSafeString(body.pageType || "general", 80);
    const isAuthPage = asSafeBool(body.isAuthPage);
    const username = asSafeString(body.username || "User", 80);
    const currentPath = asSafeString(body.currentPath || "/", 300);
    const currentUrl = asSafeString(body.currentUrl || "", 500);
    const memory = asSafeMemory(body.memory);

    if (!message) {
      return res.status(400).json({
        ok: false,
        reply: "Please enter a message.",
      });
    }

    const reply = await buildAssistantReply({
      message,
      pageType,
      isAuthPage,
      username,
      currentPath,
      currentUrl,
      memory,
      currentProfile: req.currentProfile || null,
    });

    return res.json({
      ok: true,
      reply:
        typeof reply === "string" && reply.trim()
          ? reply.trim()
          : "Tapzy Assistant is temporarily unavailable.",
    });
  } catch (error) {
    console.error("Assistant route error:", error);
    return res.status(500).json({
      ok: false,
      reply: "Tapzy Assistant is temporarily unavailable.",
    });
  }
}

router.post("/chat", handleAssistantRequest);
router.post("/reply", handleAssistantRequest);

module.exports = router;

