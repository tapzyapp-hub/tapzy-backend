const express = require("express");
const { buildTapzyAiReply, getBrainScore } = require("../services/tapzyAi");

const router = express.Router();

function stableBrainSessionId(req, body = {}) {
  const bodySession = String(body.sessionId || body.brainSessionId || "").trim().slice(0, 160);
  if (bodySession && bodySession !== "guest" && bodySession !== "User") return bodySession;
  const profileId = String(req.currentProfile?.id || "").trim();
  if (profileId) return "profile:" + profileId;
  const username = String(req.currentProfile?.username || req.session?.user?.username || body.username || "").trim();
  if (username && username !== "User") return "user:" + username.toLowerCase();
  return req.sessionID || "guest";
}

router.get("/health", async (req, res) => {
  res.json({
    ok: true,
    name: "Tapzy AI",
    brainScore: await getBrainScore(stableBrainSessionId(req, req.query || {})),
  });
});

router.post("/chat", async (req, res) => {
  try {
    const result = await buildTapzyAiReply({
      ...req.body,
      sessionId: stableBrainSessionId(req, req.body || {}),
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
