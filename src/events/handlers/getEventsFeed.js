const prisma = require("../../prisma");
const { MAIN_QUERY_LIMIT, FEED_PAGE_SIZE } = require("../config");
const { triggerEventAutoRefreshIfDue } = require("../../services/eventAutoRefreshScheduler");
const {
  normalizeCategory,
  getShortDescription,
  getUrgencyBadge,
  eventMatchesCategoryGroup,
  sortRanked,
  buildWhere,
  filterNearbyEvents,
  getClosestAreaEvents,
  isAllowedHotCategory,
  pickImage,
  isSeededEvent,
} = require("../helpers/eventServerUtils");

module.exports = async function getEventsFeed(req, res) {
  try {
    triggerEventAutoRefreshIfDue("events-feed-catch-up");

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(24, Math.max(1, Number(req.query.limit || FEED_PAGE_SIZE)));
    const skip = (page - 1) * limit;
    const city = String(req.query.city || "").trim();
    const rawCategory = String(req.query.category || "all").trim().toLowerCase();
    const isHotNearbyMode = rawCategory === "nearby" || rawCategory === "hot-nearby";
    const category = rawCategory === "all" || isHotNearbyMode ? "" : rawCategory;
    const liveLat = Number(req.query.lat);
    const liveLng = Number(req.query.lng);
    const radiusKm = Math.max(25, Math.min(250, Number(req.query.radiusKm || 85)));
    const now = new Date();
    const currentProfile = req.currentProfile || null;

    const where = buildWhere({ city, category, now });

    // Keep Tapzy's custom ranking, but do less work when the feed grows.
    // We only pull enough records to cover the requested page plus a small look-ahead,
    // instead of sorting the entire configured MAIN_QUERY_LIMIT on every request.
    const queryLimit = MAIN_QUERY_LIMIT;

    const rawItems = await prisma.eventFinderItem.findMany({
      where,
      orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        venueName: true,
        city: true,
        category: true,
        startAt: true,
        endAt: true,
        imageUrl: true,
        ticketUrl: true,
        priceText: true,
        createdAt: true,
        latitude: true,
        longitude: true,
      },
      take: queryLimit,
    });

    const allHotItems = rawItems.filter((event) => isAllowedHotCategory(event) && !isSeededEvent(event));
    const hasLiveLocation = Number.isFinite(liveLat) && Number.isFinite(liveLng);

    const localRanked = isHotNearbyMode
      ? filterNearbyEvents(allHotItems, { lat: liveLat, lng: liveLng, radiusKm })
      : [];

    const closestAreaFallback = isHotNearbyMode && hasLiveLocation && !localRanked.length
      ? getClosestAreaEvents(allHotItems, { lat: liveLat, lng: liveLng, limit: queryLimit })
      : { events: [], areaName: '', distanceKm: null };

    let ranked = isHotNearbyMode
      ? (localRanked.length ? localRanked : closestAreaFallback.events)
      : allHotItems;
    const usingClosestAreaFallback = isHotNearbyMode && hasLiveLocation && !localRanked.length && ranked.length > 0;

    if (!isHotNearbyMode && category) {
      const normalizedFilter = String(category).trim().toLowerCase();
      ranked = ranked.filter((event) => {
        const normalized = String(normalizeCategory(event) || "").trim().toLowerCase();
        if (normalized === normalizedFilter) return true;
        return eventMatchesCategoryGroup(event, normalizedFilter);
      });
    }

    ranked = sortRanked(ranked);

    const slice = ranked.slice(skip, skip + limit);
    const eventIds = slice.map((x) => x.id);

    let goingSet = new Set();
    const goingCounts = new Map();

    if (eventIds.length) {
      const [countRows, myRows] = await Promise.all([
        prisma.eventAttendance.groupBy({
          by: ["eventId"],
          where: { eventId: { in: eventIds }, status: "going" },
          _count: { eventId: true },
        }),
        currentProfile
          ? prisma.eventAttendance.findMany({
              where: { eventId: { in: eventIds }, profileId: currentProfile.id, status: "going" },
              select: { eventId: true },
            })
          : Promise.resolve([]),
      ]);

      for (const row of countRows) {
        goingCounts.set(row.eventId, row._count.eventId || 0);
      }

      goingSet = new Set(myRows.map((row) => row.eventId));
    }

    const items = slice.map((event) => ({
      ...event,
      imageUrl: pickImage(event),
      category: normalizeCategory(event),
      description: getShortDescription(event),
      urgencyBadge: getUrgencyBadge(event),
      isGoing: goingSet.has(event.id),
      goingCount: goingCounts.get(event.id) || 0,
    }));

    return res.json({
      ok: true,
      items,
      page,
      limit,
      total: ranked.length,
      hasMore: ranked.length > skip + items.length,
      fallbackArea: usingClosestAreaFallback ? closestAreaFallback.areaName : "",
      fallbackDistanceKm: usingClosestAreaFallback ? closestAreaFallback.distanceKm : null,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Events feed error" });
  }
};
