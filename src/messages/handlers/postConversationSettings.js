const prisma = require("../../prisma");

function redirectBack(req, fallback) {
  const ref = String(req.get("referer") || "").trim();
  return ref || fallback;
}

function muteUntilFor(action) {
  const now = Date.now();
  if (action === "mute-8h") return new Date(now + 8 * 60 * 60 * 1000);
  if (action === "mute-1w") return new Date(now + 7 * 24 * 60 * 60 * 1000);
  if (action === "mute-always") return new Date("9999-12-31T23:59:59.000Z");
  return null;
}

module.exports = async function postConversationSettings(req, res) {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const id = String(req.params.id || "").trim();
    const action = String(req.body.action || "").trim().toLowerCase();
    if (!id || !action) return res.redirect("/messages");

    const membership = await prisma.conversationMember.findFirst({
      where: {
        conversationId: id,
        profileId: currentProfile.id,
      },
      select: { id: true },
    });

    if (!membership) return res.status(404).send("Conversation not found");

    let data = null;
    let fallback = `/messages/${encodeURIComponent(id)}`;

    if (action === "pin") data = { pinnedAt: new Date() };
    if (action === "unpin") data = { pinnedAt: null };
    if (action === "unmute") data = { mutedUntil: null };
    if (action === "archive") {
      data = { archivedAt: new Date() };
      fallback = "/messages";
    }
    if (action === "unarchive") data = { archivedAt: null, hiddenAt: null };

    const muteUntil = muteUntilFor(action);
    if (muteUntil) data = { mutedUntil: muteUntil };

    if (!data) return res.redirect(redirectBack(req, fallback));

    try {
      await prisma.conversationMember.update({
        where: { id: membership.id },
        data,
      });
    } catch (settingsError) {
      const message = String(settingsError?.message || settingsError || "");
      if (!/(mutedUntil|pinnedAt|archivedAt|hiddenAt|Unknown arg|P2022|column)/i.test(message)) {
        throw settingsError;
      }
      return res.redirect(`${fallback}?settings=upgrade-required`);
    }

    if (action === "archive") return res.redirect(fallback);
    return res.redirect(redirectBack(req, fallback));
  } catch (e) {
    console.error(e);
    return res.status(500).send("Conversation settings error");
  }
};
