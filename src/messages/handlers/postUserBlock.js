const prisma = require("../../prisma");

module.exports = async function postUserBlock(req, res) {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const targetId = String(req.params.profileId || "").trim();
    const action = String(req.body.action || "block").trim().toLowerCase();
    if (!targetId || targetId === currentProfile.id) {
      return res.redirect(req.get("referer") || "/messages");
    }

    if (action === "unblock") {
      await prisma.userBlock.deleteMany({
        where: {
          blockerId: currentProfile.id,
          blockedId: targetId,
        },
      });
    } else {
      await prisma.userBlock.upsert({
        where: {
          blockerId_blockedId: {
            blockerId: currentProfile.id,
            blockedId: targetId,
          },
        },
        update: {},
        create: {
          blockerId: currentProfile.id,
          blockedId: targetId,
        },
      });
    }

    return res.redirect(req.get("referer") || "/messages");
  } catch (e) {
    const message = String(e?.message || e || "");
    if (/(userBlock|UserBlock|Unknown arg|P2021|P2022|does not exist|column)/i.test(message)) {
      return res.redirect(`${req.get("referer") || "/messages"}?settings=run-migrations`);
    }
    console.error(e);
    return res.status(500).send("Block settings error");
  }
};
