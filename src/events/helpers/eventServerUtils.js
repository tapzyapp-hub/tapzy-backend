
function sampleEvents() {

  const now = Date.now();

  const h = 3600000;

  const d = 86400000;



  return [

    {

      source: "tapzy_seed",

      sourceEventId: "seed-sports-1",

      title: "Toronto Sports Night",

      description: "Big-game energy, premium crowd, and a live sports atmosphere.",

      imageUrl: "",

      venueName: "Toronto Arena District",

      address: "Toronto, ON",

      city: "Toronto",

      region: "Ontario",

      country: "Canada",

      eventUrl: "",

      ticketUrl: "",

      category: "Sports",

      startAt: new Date(now + d),

      endAt: new Date(now + d + 3 * h),

      latitude: 43.6532,

      longitude: -79.3832,

      priceText: "$35",

      rawPayload: { seeded: true },

    },

    {

      source: "tapzy_seed",

      sourceEventId: "seed-concert-1",

      title: "Downtown Concert Experience",

      description: "Live music, crowd energy, and a premium city-night atmosphere.",

      imageUrl: "",

      venueName: "City Stage",

      address: "Montreal, QC",

      city: "Montreal",

      region: "Quebec",

      country: "Canada",

      eventUrl: "",

      ticketUrl: "",

      category: "Concerts",

      startAt: new Date(now + 2 * d),

      endAt: new Date(now + 2 * d + 4 * h),

      latitude: 45.5017,

      longitude: -73.5673,

      priceText: "$49",

      rawPayload: { seeded: true },

    },

    {

      source: "tapzy_seed",

      sourceEventId: "seed-nightlife-1",

      title: "Friday Night Party",

      description: "Cocktails, DJ energy, and a polished nightlife atmosphere.",

      imageUrl: "",

      venueName: "Velvet Lounge",

      address: "Vancouver, BC",

      city: "Vancouver",

      region: "British Columbia",

      country: "Canada",

      eventUrl: "",

      ticketUrl: "",

      category: "Dances",

      startAt: new Date(now + 3 * d),

      endAt: new Date(now + 3 * d + 5 * h),

      latitude: 49.2827,

      longitude: -123.1207,

      priceText: "$20",

      rawPayload: { seeded: true },

    },

    {

      source: "tapzy_seed",

      sourceEventId: "seed-convention-1",

      title: "Creator & Fan Convention",

      description: "A premium convention space for fans, brands, creators, and community.",

      imageUrl: "",

      venueName: "Expo Hall",

      address: "Calgary, AB",

      city: "Calgary",

      region: "Alberta",

      country: "Canada",

      eventUrl: "",

      ticketUrl: "",

      category: "Conventions",

      startAt: new Date(now + 4 * d),

      endAt: new Date(now + 4 * d + 6 * h),

      latitude: 51.0447,

      longitude: -114.0719,

      priceText: "$25",

      rawPayload: { seeded: true },

    },

    {

      source: "tapzy_seed",

      sourceEventId: "seed-sports-2",

      title: "Edmonton Game Day Experience",

      description: "A packed sports crowd with big energy and premium event vibes.",

      imageUrl: "",

      venueName: "Edmonton Event Centre",

      address: "Edmonton, AB",

      city: "Edmonton",

      region: "Alberta",

      country: "Canada",

      eventUrl: "",

      ticketUrl: "",

      category: "Sports",

      startAt: new Date(now + 5 * d),

      endAt: new Date(now + 5 * d + 3 * h),

      latitude: 53.5461,

      longitude: -113.4938,

      priceText: "$30",

      rawPayload: { seeded: true },

    },

  ];

}



async function seedEventsIfEmpty(prisma) {

  const count = await prisma.eventFinderItem.count();

  if (count > 0) return;



  for (const event of sampleEvents()) {

    try {

      await prisma.eventFinderItem.create({ data: event });

    } catch (e) {

      if (e?.code !== "P2002") throw e;

    }

  }

}



function startOfDay(date) {

  const d = new Date(date);

  d.setHours(0, 0, 0, 0);

  return d;

}



function endOfDay(date) {

  const d = new Date(date);

  d.setHours(23, 59, 59, 999);

  return d;

}



function isBetween(date, min, max) {

  if (!date) return false;

  const t = new Date(date).getTime();

  return t >= min.getTime() && t <= max.getTime();

}



function normalizeCategory(event) {

  const group = getEventCategoryGroup(event);
  if (group === "sports") return "Sports";
  if (group === "concerts") return "Concerts";
  if (group === "dances") return "Dances";
  if (group === "conventions") return "Conventions";

  const raw = String(event?.category || "").trim();
  if (!raw || raw.toLowerCase() === "undefined" || raw.toLowerCase() === "miscellaneous" || raw.toLowerCase() === "other") {
    return "Event";
  }
  return raw;

}

function getEventCategoryGroup(event) {

  const rawCategory = String(event?.category || "").trim().toLowerCase();
  const text = String([
    event?.title || "",
    event?.description || "",
    event?.venueName || "",
    event?.city || "",
  ].join(" ")).toLowerCase();

  const categoryText = rawCategory && !["undefined", "miscellaneous", "other", "event", "events"].includes(rawCategory)
    ? rawCategory
    : "";
  const haystack = `${categoryText} ${text}`;

  const hasAny = (terms, source = haystack) => terms.some((term) => source.includes(term));

  // Keep category pills mutually exclusive. A card should belong to one group only.
  // Prefer an explicit category when the source gives one, then infer from title/details.
  if (hasAny([
    "sports", "sport", "hockey", "basketball", "football", "soccer", "baseball",
    "mma", "ufc", "wrestling", "boxing", "tennis", "lacrosse", "volleyball",
    "rugby", "golf", "racing", "motorsport", "athletic", "tournament", "match",
  ], categoryText || haystack)) {
    return "sports";
  }

  if (hasAny([
    "nightlife", "dance", "dances", "party", "club", "dj", "rave", "afterparty",
    "lounge", "social dance", "dancehall", "latin night", "salsa", "bachata",
  ], categoryText || haystack)) {
    return "dances";
  }

  if (hasAny([
    "concert", "concerts", "live music", "music", "festival", "tour", "band",
    "artist", "singer", "performance", "orchestra", "opera", "gig",
  ], categoryText || haystack)) {
    return "concerts";
  }

  if (hasAny([
    "convention", "expo", "comic con", "fan expo", "conference", "summit",
  ], categoryText || haystack)) {
    return "conventions";
  }

  return "";

}

function getShortDescription(event) {

  const source = String(event?.description || "").trim();

  if (!source) return "Premium event discovery inside Tapzy Network™.";



  const cleaned = source.replace(/\s+/g, " ").trim();

  if (cleaned.length <= 120) return cleaned;

  return cleaned.slice(0, 117).trim() + "...";

}



function isHeroQualityImage(url) {
  const value = String(url || "").trim();
  if (!/^https?:\/\//i.test(value)) return false;

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const combined = `${parsed.pathname}${parsed.search}`.toLowerCase();

    // Search/event thumbnails are often only 100–400px wide and become visibly
    // soft when stretched into a full-screen card.
    if (host.includes("gstatic.com") || host.includes("googleusercontent.com")) {
      const sizeMatch = combined.match(/(?:w|width|sz|s)[=_-]?(\d{2,4})/i);
      if (!sizeMatch || Number(sizeMatch[1]) < 900) return false;
    }

    const explicitWidth = parsed.searchParams.get("w") || parsed.searchParams.get("width");
    const explicitHeight = parsed.searchParams.get("h") || parsed.searchParams.get("height");
    if (explicitWidth && Number(explicitWidth) > 0 && Number(explicitWidth) < 900) return false;
    if (explicitHeight && Number(explicitHeight) > 0 && Number(explicitHeight) < 700) return false;
    if (/(?:thumb|thumbnail|small|tiny|100x|200x|300x|400x)/i.test(combined)) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function pickImage(event) {
  const category = normalizeCategory(event).toLowerCase();
  if (isHeroQualityImage(event?.imageUrl)) return String(event.imageUrl).trim();



  if (

    category.includes("nightlife") ||

    category.includes("party") ||

    category.includes("club") ||

    category.includes("dj")

  ) {

    return "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=2000&q=92";

  }



  if (

    category.includes("concert") ||

    category.includes("music") ||

    category.includes("festival")

  ) {

    return "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=2000&q=92";

  }



  if (

    category.includes("sport") ||

    category.includes("hockey") ||

    category.includes("basketball") ||

    category.includes("football") ||

    category.includes("soccer") ||

    category.includes("baseball") ||

    category.includes("mma") ||

    category.includes("ufc")

  ) {

    return "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=2000&q=92";

  }



  if (

    category.includes("convention") ||

    category.includes("expo") ||

    category.includes("comic") ||

    category.includes("fan")

  ) {

    return "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=2000&q=92";

  }



  return "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=2000&q=92";

}



function eventMatchesCategoryGroup(event, group) {

  const normalizedGroup = String(group || "").trim().toLowerCase();
  const eventGroup = getEventCategoryGroup(event);

  if (!eventGroup) return false;
  if (normalizedGroup === "dance" || normalizedGroup === "nightlife") return eventGroup === "dances";
  if (normalizedGroup === "concert" || normalizedGroup === "music") return eventGroup === "concerts";
  if (normalizedGroup === "sport") return eventGroup === "sports";

  return eventGroup === normalizedGroup;

}

function rankEvent(event) {

  let score = 0;



  if (event.imageUrl) score += 20;

  if (event.ticketUrl) score += 16;

  if (event.eventUrl) score += 12;

  if (event.description) score += 10;

  if (event.venueName) score += 8;

  if (event.city) score += 6;

  if (event.priceText) score += 2;



  const city = String(event.city || "").toLowerCase();

  if (city === "toronto") score += 14;

  if (city === "montreal") score += 11;

  if (city === "vancouver") score += 11;

  if (city === "calgary") score += 9;

  if (city === "edmonton") score += 9;



  const haystack = String(

    [normalizeCategory(event), event.title || "", event.description || ""].join(" ")

  ).toLowerCase();



  if (haystack.includes("concert")) score += 12;

  if (haystack.includes("music")) score += 10;

  if (haystack.includes("sports")) score += 12;

  if (haystack.includes("hockey")) score += 10;

  if (haystack.includes("nightlife")) score += 10;

  if (haystack.includes("party")) score += 8;

  if (haystack.includes("convention")) score += 10;

  if (haystack.includes("expo")) score += 8;

  if (haystack.includes("ufc")) score += 8;

  if (haystack.includes("mma")) score += 8;



  if (event.source === "ticketmaster") score += 10;

  if (event.source === "seatgeek") score += 9;

  if (event.source === "google_events") score += 8;

  if (event.source === "eventbrite") score += 5;



  if (Number.isFinite(Number(event.distanceKm))) {
    score += Math.max(0, 30 - Number(event.distanceKm) / 3);
  }

  if (event.startAt) {

    const hoursAway = (new Date(event.startAt).getTime() - Date.now()) / 3600000;

    if (hoursAway >= 0 && hoursAway <= 48) score += 18;

    else if (hoursAway <= 120) score += 14;

    else if (hoursAway <= 240) score += 10;

    else if (hoursAway <= 480) score += 6;

  }



  return score;

}



function getUrgencyBadge(event) {

  if (!event?.startAt) return "Trending";



  const now = Date.now();

  const diffMs = new Date(event.startAt).getTime() - now;

  const diffHours = diffMs / 3600000;



  if (diffHours >= 0 && diffHours <= 18) return "Tonight";

  if (diffHours > 18 && diffHours <= 72) return "Hot";

  if (diffHours > 72 && diffHours <= 168) return "This Week";

  return "Trending";

}




function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getDistanceKm(lat1, lng1, lat2, lng2) {
  const aLat = toFiniteNumber(lat1);
  const aLng = toFiniteNumber(lng1);
  const bLat = toFiniteNumber(lat2);
  const bLng = toFiniteNumber(lng2);

  if (aLat === null || aLng === null || bLat === null || bLng === null) return Infinity;

  const earthRadiusKm = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isAllowedHotCategory(event) {
  return ["sports", "concerts", "dances"].includes(getEventCategoryGroup(event));
}

function filterNearbyEvents(events, { lat, lng, radiusKm } = {}) {
  const userLat = toFiniteNumber(lat);
  const userLng = toFiniteNumber(lng);
  const maxRadius = Math.max(1, Math.min(500, Number(radiusKm || 85)));

  // Event Finder is now live-location first: no browser location means no local feed.
  if (userLat === null || userLng === null) return [];

  return (events || [])
    .map((event) => {
      const distanceKm = getDistanceKm(userLat, userLng, event?.latitude, event?.longitude);
      return { ...event, distanceKm };
    })
    .filter((event) => Number.isFinite(event.distanceKm) && event.distanceKm <= maxRadius)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function getClosestAreaEvents(events, { lat, lng, limit = 48 } = {}) {
  const userLat = toFiniteNumber(lat);
  const userLng = toFiniteNumber(lng);

  if (userLat === null || userLng === null) {
    return { events: [], areaName: '', distanceKm: null };
  }

  const withDistance = (events || [])
    .map((event) => {
      const distanceKm = getDistanceKm(userLat, userLng, event?.latitude, event?.longitude);
      return { ...event, distanceKm };
    })
    .filter((event) => Number.isFinite(event.distanceKm));

  if (!withDistance.length) {
    return { events: [], areaName: '', distanceKm: null };
  }

  const areaMap = new Map();
  for (const event of withDistance) {
    const areaName = String(event.city || event.venueName || 'Closest Area').trim() || 'Closest Area';
    const key = areaName.toLowerCase();
    const current = areaMap.get(key);
    if (!current || event.distanceKm < current.distanceKm) {
      areaMap.set(key, { areaName, distanceKm: event.distanceKm });
    }
  }

  const closest = Array.from(areaMap.values()).sort((a, b) => a.distanceKm - b.distanceKm)[0];
  if (!closest) return { events: [], areaName: '', distanceKm: null };

  const closestEvents = withDistance
    .filter((event) => String(event.city || event.venueName || 'Closest Area').trim().toLowerCase() === closest.areaName.toLowerCase())
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, Math.max(1, Number(limit) || 48));

  return { events: closestEvents, areaName: closest.areaName, distanceKm: closest.distanceKm };
}

function sortRanked(events) {

  return [...events].sort((a, b) => {

    const diff = rankEvent(b) - rankEvent(a);

    if (diff !== 0) return diff;



    const aTime = a.startAt ? new Date(a.startAt).getTime() : Number.MAX_SAFE_INTEGER;

    const bTime = b.startAt ? new Date(b.startAt).getTime() : Number.MAX_SAFE_INTEGER;

    return aTime - bTime;

  });

}

function buildWhere({ city, category, now }) {
  const where = {
    OR: [
      { startAt: null },
      { startAt: { gte: now } },
    ],
  };

  if (city) {
    where.city = { contains: city, mode: "insensitive" };
  }

  return where;
}



module.exports = {
  sampleEvents,
  seedEventsIfEmpty,
  startOfDay,
  endOfDay,
  isBetween,
  normalizeCategory,
  getShortDescription,
  pickImage,
  isHeroQualityImage,
  eventMatchesCategoryGroup,
  rankEvent,
  getUrgencyBadge,
  sortRanked,
  getDistanceKm,
  filterNearbyEvents,
  getClosestAreaEvents,
  isAllowedHotCategory,
  buildWhere,
};
