

const router = require("express").Router();
const prisma = require("../prisma");

router.get("/activate", async (req, res) => {
  const token = String(req.query.token || "").trim();

  if (!token) {
    return res.status(400).send("Missing token");
  }

  const code = await prisma.activationCode.findUnique({
    where: { publicToken: token },
  });

  if (!code) {
    return res.status(404).send("Activation code not found");
  }

  res.send("Activation page placeholder");
});

router.post("/activate", async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();

    const activation = await prisma.activationCode.findUnique({
      where: { publicToken: token },
    });

    if (!activation || !activation.isActive) {
      return res.status(400).send("Invalid activation");
    }

    if (activation.profileId) {
      return res.status(400).send("Already claimed");
    }

    const profile = await prisma.userProfile.create({
      data: {},
    });

    await prisma.activationCode.update({
      where: { id: activation.id },
      data: {
        profileId: profile.id,
        claimedAt: new Date(),
      },
    });

    res.redirect(`/edit/${profile.id}`);
  } catch (e) {
    console.error(e);
    res.status(500).send("Activation failed");
  }
});

module.exports = router;
