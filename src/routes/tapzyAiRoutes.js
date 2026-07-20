const express = require("express");
const { buildTapzyAiReply, getBrainScore } = require("../services/tapzyAi");

const router = express.Router();

router.get("/health", async (req, res) => {
  res.json({
    ok: true,
    name: "Tapzy AI",
    brainScore: await getBrainScore(req.sessionID || "guest"),
  });
});

router.post("/chat", async (req, res) => {
  try {
    const result = await buildTapzyAiReply({
      ...req.body,
      sessionId: req.sessionID || req.body?.sessionId,
      username: req.session?.user?.username || req.body?.username,
    });
    res.json(result);
  } catch (error) {
    console.error("Tapzy AI chat error:", error?.message || error);
    res.status(500).json({
      ok: false,
      reply: "Tapzy AI had trouble answering that. Try again in a moment.",
      error: "tapzy_ai_error",
    });
  }
});

module.exports = router;
