const router = require("express").Router();
const { VAPID_PUBLIC_KEY } = require("../config");
const { savePushSubscription, removePushSubscription, hasPushConfig } = require("../services/pushService");

router.get("/api/push/public-key", (req, res) => {
  if (!req.currentProfile) return res.status(401).json({ ok: false, error: "Please sign in first" });
  return res.json({ ok: true, publicKey: VAPID_PUBLIC_KEY || "", enabled: !!(VAPID_PUBLIC_KEY && hasPushConfig()) });
});

router.post("/api/push/subscribe", async (req, res) => {
  try {
    if (!req.currentProfile) return res.status(401).json({ ok: false, error: "Please sign in first" });
    const subscription = req.body?.subscription || req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ ok: false, error: "Invalid subscription" });
    }
    await savePushSubscription({
      profileId: req.currentProfile.id,
      subscription,
      userAgent: req.get("user-agent") || "",
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "Push subscribe error" });
  }
});

router.post("/api/push/unsubscribe", async (req, res) => {
  try {
    if (!req.currentProfile) return res.status(401).json({ ok: false, error: "Please sign in first" });
    await removePushSubscription({
      profileId: req.currentProfile.id,
      endpoint: req.body?.endpoint,
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "Push unsubscribe error" });
  }
});

module.exports = router;
