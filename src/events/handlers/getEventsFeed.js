const prisma = require("../../prisma");
const { MAIN_QUERY_LIMIT, FEED_PAGE_SIZE } = require("../config");
const {
  normalizeCategory,
  getShortDescription,
  getUrgencyBadge,
  sortRanked,
  buildWhere,
  eventMatchesCategoryFilter,
} = require("../helpers/eventServerUtils");

module.exports = async function getEventsFeed(req, res) {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(24, Math.max(1, Number(req.query.limit || FEED_PAGE_SIZE)));
    const skip = (page - 1) * limit;
    const city = String(req.query.city || "").trim();
    const category = String(req.query.category || "").trim();
    const now = new Date();
    const currentProfile = req.currentProfile || null;

    const where = buildWhere({ city, category, now });
    const rawItems = await prisma.eventFinderItem.findMany({
      where,
      orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
      take: MAIN_QUERY_LIMIT,
    });

    const ranked = sortRanked(rawItems).filter((event) => eventMatchesCategoryFilter(event, category));
    const slice = ranked.slice(skip, skip + limit);

    let goingSet = new Set();
    const goingCounts = new Map();
    const goingPreviewMap = new Map();

    if (slice.length) {
      const rows = await prisma.eventAttendance.findMany({
        where: {
          eventId: { in: slice.map((x) => x.id) },
          status: "going",
        },
        orderBy: { createdAt: "desc" },
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

      for (const row of rows) {
        goingCounts.set(row.eventId, (goingCounts.get(row.eventId) || 0) + 1);
        if (!goingPreviewMap.has(row.eventId)) goingPreviewMap.set(row.eventId, []);
        const list = goingPreviewMap.get(row.eventId);
        if (row.profile && list.length < 3) list.push(row.profile);
        if (currentProfile && row.profileId === currentProfile.id) goingSet.add(row.eventId);
      }
    }

    const items = slice.map((event) => ({
      ...event,
      category: normalizeCategory(event),
      description: getShortDescription(event),
      urgencyBadge: getUrgencyBadge(event),
      isGoing: goingSet.has(event.id),
      goingCount: goingCounts.get(event.id) || 0,
      goingPreviewProfiles: goingPreviewMap.get(event.id) || [],
    }));

    return res.json({ ok: true, items, page, limit, total: ranked.length, hasMore: skip + items.length < ranked.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Events feed error" });
  }
};
