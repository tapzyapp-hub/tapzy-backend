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

    const event = await prisma.eventFinderItem.findUnique({
      where: { id: eventId },
      select: { id: true, title: true },
    });

    if (!event) {
      return res.status(404).json({ ok: false, error: "Event not found" });
    }

    const existing = await prisma.eventAttendance.findFirst({
      where: {
        eventId,
        profileId: currentProfile.id,
      },
    });

    let going = false;

    if (existing) {
      await prisma.eventAttendance.delete({ where: { id: existing.id } });
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
      where: { eventId, status: "going" },
    });

    const connectionRows = await prisma.connection.findMany({
      where: {
        OR: [
          { senderProfileId: currentProfile.id },
          { receiverProfileId: currentProfile.id },
        ],
      },
      select: {
        senderProfileId: true,
        receiverProfileId: true,
      },
    });

    const connectedIds = Array.from(new Set(
      connectionRows
        .flatMap((row) => [row.senderProfileId, row.receiverProfileId])
        .filter((id) => id && id !== currentProfile.id)
    ));

    let knownGoingCount = 0;
    let attendingProfiles = [];

    if (connectedIds.length) {
      const knownAttendance = await prisma.eventAttendance.findMany({
        where: {
          eventId,
          status: "going",
          profileId: { in: connectedIds },
        },
        include: {
          profile: {
            select: {
              id: true,
              username: true,
              name: true,
              photo: true,
            },
          },
        },
      });

      knownGoingCount = knownAttendance.length;
      attendingProfiles = knownAttendance.map((row) => row.profile).filter(Boolean);
    }

    if (going && attendingProfiles.length) {
      const actorName = String(currentProfile.name || currentProfile.username || "Tapzy member").trim();
      const eventTitle = String(event.title || "this event").trim();
      const link = `/events/view/${event.id}`;

      const outbound = [];

      for (const profile of attendingProfiles) {
        if (!profile || profile.id === currentProfile.id) continue;

        outbound.push({
          profileId: profile.id,
          actorId: currentProfile.id,
          type: "event_shared_attendance",
          title: `${actorName} is also attending`,
          body: `${actorName} is going to ${eventTitle} too.`,
          link,
        });

        const otherName = String(profile.name || profile.username || "A Tapzy member").trim();
        outbound.push({
          profileId: currentProfile.id,
          actorId: profile.id,
          type: "event_shared_attendance",
          title: `${otherName} is also attending`,
          body: `${otherName} is going to ${eventTitle}.`,
          link,
        });
      }

      if (outbound.length) {
        await prisma.notification.createMany({ data: outbound });
      }
    }

    if ((req.get("X-Requested-With") || "") === "XMLHttpRequest") {
      return res.json({
        ok: true,
        going,
        goingCount,
        knownGoingCount,
        attendingProfiles: attendingProfiles.slice(0, 6).map((profile) => ({
          id: profile.id,
          username: profile.username || "",
          name: profile.name || "",
          photo: profile.photo || "",
        })),
      });
    }

    return res.redirect(req.get("referer") || "/events");
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Going toggle failed" });
  }
};
