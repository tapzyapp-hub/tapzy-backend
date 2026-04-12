const prisma = require("../../prisma");
const { MAIN_QUERY_LIMIT, FEED_PAGE_SIZE } = require("../config");
const {
  normalizeCategory,
  getShortDescription,
  getUrgencyBadge,
  eventMatchesCategoryGroup,
  sortRanked,
  buildWhere,
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

    let ranked = sortRanked(rawItems);
    if (category) {
      const normalizedFilter = String(category).trim().toLowerCase();
      ranked = ranked.filter((event) => {
        const normalized = String(normalizeCategory(event) || '').trim().toLowerCase();
        if (normalized === normalizedFilter) return true;
        return eventMatchesCategoryGroup(event, normalizedFilter);
      });
    }
    const slice = ranked.slice(skip, skip + limit);

    let goingSet = new Set();
    const goingCounts = new Map();

    if (slice.length) {
      const rows = await prisma.eventAttendance.findMany({
        where: { eventId: { in: slice.map((x) => x.id) }, status: "going" },
        select: { eventId: true, profileId: true },
      });

      for (const row of rows) {
        goingCounts.set(row.eventId, (goingCounts.get(row.eventId) || 0) + 1);
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
    }));

    return res.json({ ok: true, items, page, limit, total: ranked.length, hasMore: skip + items.length < ranked.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Events feed error" });
  }
};
