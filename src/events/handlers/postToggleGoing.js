const prisma = require("../../prisma");

module.exports = async function postToggleGoing(req, res) {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) {
      if ((req.get("X-Requested-With") || "") === "XMLHttpRequest") {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
      return res.redirect("/auth");
    }

    const eventId = String(req.params.id || "").trim();
    if (!eventId) {
      return res.status(400).json({ ok: false, error: "Missing event id" });
    }

    const existing = await prisma.eventAttendance.findFirst({
      where: {
        eventId,
        profileId: currentProfile.id,
      },
    });

    let going;
    if (existing) {
      await prisma.eventAttendance.delete({
        where: { id: existing.id },
      });
      going = false;
    } else {
      await prisma.eventAttendance.create({
        data: {
          eventId,
          profileId: currentProfile.id,
          status: "going",
        },
      });
      going = true;
    }

    const goingCount = await prisma.eventAttendance.count({
      where: {
        eventId,
        status: "going",
      },
    });


    const goingPreviewRows = await prisma.eventAttendance.findMany({
      where: {
        eventId,
        status: "going",
      },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: {
        profile: {
          select: {
            username: true,
            name: true,
            photo: true,
          },
        },
      },
    });

    const goingPreviewProfiles = goingPreviewRows
      .map((row) => row.profile)
      .filter(Boolean);

    let knownGoingCount = 0;

    const connections = await prisma.connection.findMany({
      where: {
        OR: [
          { profileId: currentProfile.id },
          { connectedProfileId: currentProfile.id },
        ],
      },
      select: {
        profileId: true,
        connectedProfileId: true,
      },
    });

    const knownIds = new Set();

    for (const row of connections) {
      if (row.profileId && row.profileId !== currentProfile.id) {
        knownIds.add(row.profileId);
      }
      if (row.connectedProfileId && row.connectedProfileId !== currentProfile.id) {
        knownIds.add(row.connectedProfileId);
      }
    }

    if (knownIds.size > 0) {
      knownGoingCount = await prisma.eventAttendance.count({
        where: {
          eventId,
          status: "going",
          profileId: { in: Array.from(knownIds) },
        },
      });
    }

    if ((req.get("X-Requested-With") || "") === "XMLHttpRequest") {
      return res.json({
        ok: true,
        going,
        goingCount,
        knownGoingCount,
        goingPreviewProfiles,
      });
    }

    return res.redirect(req.get("referer") || "/events");
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Going toggle failed" });
  }
};
