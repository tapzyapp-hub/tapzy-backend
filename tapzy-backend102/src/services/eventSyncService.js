const prisma = require("../prisma");
const { fetchTicketmasterEvents } = require("./ticketmasterService");
const { fetchEventbriteEvents } = require("./eventbriteService");
const { fetchGoogleEvents } = require("./googleEventsService");
const { fetchSeatGeekEvents } = require("./seatgeekService");

const TOP_CITIES = [
  "Toronto",
  "Montreal",
  "Vancouver",
  "Calgary",
  "Edmonton",
];

const TARGET_KEYWORDS = [
  "concert",
  "music",
  "live music",
  "sports",
  "game",
  "hockey",
  "basketball",
  "football",
  "soccer",
  "baseball",
  "ufc",
  "mma",
  "party",
  "nightlife",
  "dj",
  "club",
  "convention",
  "expo",
  "fan expo",
  "comic con",
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[@]/g, " at ")
    .replace(/[’'`]/g, "")
    .replace(/[-_/|]+/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value) {
  return String(value || "").trim();
}

function normalizeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeJson(value) {
  if (!value || typeof value !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function isPlaceholderText(value) {
  const text = normalizeText(value);
  if (!text) return true;

  const blocked = [
    "placeholder",
    "sample",
    "test",
    "demo",
    "coming soon",
    "tbd",
    "to be announced",
    "untitled",
    "no title",
    "event title",
    "lorem ipsum",
  ];

  return blocked.some((bad) => text.includes(bad));
}

function isPlaceholderImage(url) {
  const text = String(url || "").toLowerCase();
  if (!text) return false;

  return (
    text.includes("placeholder") ||
    text.includes("default") ||
    text.includes("fallback") ||
    text.includes("no-image") ||
    text.includes("noimage") ||
    text.includes("blank") ||
    text.includes("dummy")
  );
}

function normalizeVenue(value) {
  return normalizeText(value)
    .replace(/\b(stadium|arena|centre|center|theatre|theater|club|hall)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getEventTitle(event) {
  return event.title || "";
}

function getEventVenue(event) {
  return event.venueName || "";
}

function getEventCity(event) {
  return event.city || "";
}

function strictEventKey(event) {
  const title = normalizeText(getEventTitle(event));
  const date = event.startAt instanceof Date ? event.startAt.toISOString().slice(0, 10) : "";
  const city = normalizeText(getEventCity(event));
  const venue = normalizeVenue(getEventVenue(event));

  return `${title}__${date}__${city}__${venue}`;
}

function fallbackEventKey(event) {
  const title = normalizeText(getEventTitle(event));
  const date = event.startAt instanceof Date ? event.startAt.toISOString().slice(0, 10) : "";
  return `${title}__${date}`;
}

function scoreEventQuality(event) {
  let score = 0;

  if (event.imageUrl) score += 3;
  if (event.description) score += 2;
  if (event.ticketUrl) score += 2;
  if (event.eventUrl) score += 1;
  if (event.venueName) score += 1;
  if (event.city) score += 1;
  if (event.startAt) score += 2;
  if (event.category) score += 1;
  if (event.source === "ticketmaster") score += 1;
  if (event.source === "eventbrite") score += 1;
  if (event.source === "google_events") score += 1;
  if (event.source === "seatgeek") score += 1;

  return score;
}

function mergeEventData(base, incoming) {
  return {
    ...base,
    ...incoming,

    title: base.title || incoming.title,
    description:
      (base.description && base.description.length >= (incoming.description || "").length)
        ? base.description
        : (incoming.description || base.description),

    imageUrl: base.imageUrl || incoming.imageUrl,
    ticketUrl: base.ticketUrl || incoming.ticketUrl,
    eventUrl: base.eventUrl || incoming.eventUrl,
    venueName: base.venueName || incoming.venueName,
    address: base.address || incoming.address,
    city: base.city || incoming.city,
    region: base.region || incoming.region,
    country: base.country || incoming.country,
    category: base.category || incoming.category,
    startAt: base.startAt || incoming.startAt,
    endAt: base.endAt || incoming.endAt,
    latitude: base.latitude ?? incoming.latitude,
    longitude: base.longitude ?? incoming.longitude,
    priceText: base.priceText || incoming.priceText,
    rawPayload:
      base.rawPayload && Object.keys(base.rawPayload).length
        ? base.rawPayload
        : incoming.rawPayload,
  };
}

function isRelevantEvent(event) {
  const haystack = normalizeText([
    event.title,
    event.description,
    event.category,
    event.venueName,
  ].filter(Boolean).join(" "));

  const matchesKeyword = TARGET_KEYWORDS.some((keyword) =>
    haystack.includes(normalizeText(keyword))
  );

  const sportsTerms = [
    "sports", "hockey", "basketball", "football", "soccer", "baseball", "mma", "ufc",
    "wrestling", "tennis", "volleyball", "lacrosse",
  ];

  const concertTerms = [
    "concert", "music", "live music", "tour", "festival", "show",
  ];

  const nightlifeTerms = [
    "party", "nightlife", "dj", "club", "dance", "afterparty", "rave",
  ];

  const conventionTerms = [
    "convention", "expo", "comic con", "fan expo", "summit",
  ];

  const buckets = [sportsTerms, concertTerms, nightlifeTerms, conventionTerms];

  return matchesKeyword || buckets.some((list) => list.some((term) => haystack.includes(normalizeText(term))));
}

function sanitizeEvent(raw) {
  if (!raw || !raw.title || !raw.source) return null;

  const source = String(raw.source || "").trim();
  const sourceEventId = String(raw.sourceEventId || "").trim();
  const title = String(raw.title || "").trim();

  if (!source || !sourceEventId || !title) return null;
  if (isPlaceholderText(title)) return null;

  const startAt = normalizeDate(raw.startAt);
  const endAt = normalizeDate(raw.endAt);

  const imageUrl = normalizeUrl(raw.imageUrl);
  if (imageUrl && isPlaceholderImage(imageUrl)) return null;

  const city = String(raw.city || "").trim();
  const venueName = String(raw.venueName || "").trim();

  if (!startAt) return null;
  if (!city) return null;
  if (isPlaceholderText(city)) return null;
  if (venueName && isPlaceholderText(venueName)) return null;

  return {
    source,
    sourceEventId,
    title: title || "Untitled Event",
    description: String(raw.description || "").trim(),
    imageUrl,
    venueName,
    address: String(raw.address || "").trim(),
    city,
    region: String(raw.region || "").trim(),
    country: String(raw.country || "Canada").trim(),
    eventUrl: normalizeUrl(raw.eventUrl),
    ticketUrl: normalizeUrl(raw.ticketUrl),
    category: String(raw.category || "Event").trim(),
    startAt,
    endAt,
    latitude: normalizeNumber(raw.latitude),
    longitude: normalizeNumber(raw.longitude),
    priceText: String(raw.priceText || "").trim(),
    rawPayload: safeJson(raw.rawPayload),
  };
}

function makeDbEvent(event) {
  return {
    source: event.source,
    sourceEventId: event.sourceEventId,
    title: event.title,
    description: event.description || "",
    imageUrl: event.imageUrl || "",
    venueName: event.venueName || "",
    address: event.address || "",
    city: event.city || "",
    region: event.region || "",
    country: event.country || "",
    eventUrl: event.eventUrl || "",
    ticketUrl: event.ticketUrl || "",
    category: event.category || "Event",
    startAt:
      event.startAt instanceof Date && !Number.isNaN(event.startAt.getTime())
        ? event.startAt
        : null,
    endAt:
      event.endAt instanceof Date && !Number.isNaN(event.endAt.getTime())
        ? event.endAt
        : null,
    latitude: typeof event.latitude === "number" ? event.latitude : null,
    longitude: typeof event.longitude === "number" ? event.longitude : null,
    priceText: event.priceText || "",
    rawPayload: safeJson(event.rawPayload),
  };
}

async function upsertEvent(event) {
  const dbEvent = makeDbEvent(event);

  await prisma.eventFinderItem.upsert({
    where: {
      source_sourceEventId: {
        source: dbEvent.source,
        sourceEventId: dbEvent.sourceEventId,
      },
    },
    update: {
      title: dbEvent.title,
      description: dbEvent.description,
      imageUrl: dbEvent.imageUrl,
      venueName: dbEvent.venueName,
      address: dbEvent.address,
      city: dbEvent.city,
      region: dbEvent.region,
      country: dbEvent.country,
      eventUrl: dbEvent.eventUrl,
      ticketUrl: dbEvent.ticketUrl,
      category: dbEvent.category,
      startAt: dbEvent.startAt,
      endAt: dbEvent.endAt,
      latitude: dbEvent.latitude,
      longitude: dbEvent.longitude,
      priceText: dbEvent.priceText,
      rawPayload: dbEvent.rawPayload,
    },
    create: dbEvent,
  });
}

async function fetchTicketmasterBatches() {
  try {
    return await fetchTicketmasterEvents({
      cities: TOP_CITIES,
      keywords: TARGET_KEYWORDS,
    });
  } catch (err) {
    console.error("Ticketmaster fetch error:", err?.message || err);
    return [];
  }
}

async function fetchEventbriteBatches() {
  try {
    return await fetchEventbriteEvents({
      cities: TOP_CITIES,
      keywords: TARGET_KEYWORDS,
    });
  } catch (err) {
    console.error("Eventbrite fetch error:", err?.message || err);
    return [];
  }
}

async function fetchGoogleEventsBatches() {
  try {
    return await fetchGoogleEvents({
      cities: TOP_CITIES,
      keywords: ["concerts", "sports", "nightlife", "conventions"],
    });
  } catch (err) {
    console.error("Google Events fetch error:", err?.message || err);
    return [];
  }
}

async function fetchSeatGeekBatches() {
  try {
    return await fetchSeatGeekEvents({
      cities: TOP_CITIES,
      keywords: TARGET_KEYWORDS,
    });
  } catch (err) {
    console.error("SeatGeek fetch error:", err?.message || err);
    return [];
  }
}

function dedupeEvents(rawEvents) {
  const strictMap = new Map();
  const looseMap = new Map();

  for (const raw of rawEvents || []) {
    const event = sanitizeEvent(raw);
    if (!event) continue;

    if (event.startAt && event.startAt.getTime() < Date.now() - 6 * 60 * 60 * 1000) {
      continue;
    }

    if (!isRelevantEvent(event)) continue;

    const strictKey = strictEventKey(event);
    const looseKey = fallbackEventKey(event);

    if (strictMap.has(strictKey)) {
      const existing = strictMap.get(strictKey);
      const better =
        scoreEventQuality(event) > scoreEventQuality(existing) ? event : existing;
      const merged = mergeEventData(better, better === event ? existing : event);

      strictMap.set(strictKey, merged);
      looseMap.set(looseKey, merged);
      continue;
    }

    if (looseMap.has(looseKey)) {
      const existing = looseMap.get(looseKey);

      const sameVenue =
        normalizeVenue(getEventVenue(existing)) === normalizeVenue(getEventVenue(event));

      const sameCity =
        normalizeText(getEventCity(existing)) === normalizeText(getEventCity(event));

      if (sameVenue || sameCity || !getEventVenue(existing) || !getEventVenue(event)) {
        const better =
          scoreEventQuality(event) > scoreEventQuality(existing) ? event : existing;
        const merged = mergeEventData(better, better === event ? existing : event);

        looseMap.set(looseKey, merged);

        const oldStrictKey = strictEventKey(existing);
        strictMap.delete(oldStrictKey);
        strictMap.set(strictKey, merged);
        continue;
      }
    }

    strictMap.set(strictKey, event);
    looseMap.set(looseKey, event);
  }

  return Array.from(strictMap.values()).sort((a, b) => {
    const aTime = a.startAt ? a.startAt.getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.startAt ? b.startAt.getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
}

async function cleanupOldEvents() {
  await prisma.eventFinderItem.deleteMany({
    where: {
      source: { not: "tapzy_seed" },
      startAt: {
        not: null,
        lt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      },
    },
  });
}

async function syncRealEvents() {
  console.log("Starting real events sync...");

  const [ticketmasterRaw, eventbriteRaw, googleRaw, seatGeekRaw] = await Promise.all([
    fetchTicketmasterBatches(),
    fetchEventbriteBatches(),
    fetchGoogleEventsBatches(),
    fetchSeatGeekBatches(),
  ]);

  console.log("Ticketmaster raw events:", ticketmasterRaw.length);
  console.log("Eventbrite raw events:", eventbriteRaw.length);
  console.log("Google Events raw events:", googleRaw.length);
  console.log("SeatGeek raw events:", seatGeekRaw.length);

  const allEvents = dedupeEvents([
    ...ticketmasterRaw,
    ...eventbriteRaw,
    ...googleRaw,
    ...seatGeekRaw,
  ]).slice(0, 600);

  console.log("Deduped valid events:", allEvents.length);

  let count = 0;
  let failed = 0;

  for (const event of allEvents) {
    try {
      await upsertEvent(event);
      count += 1;

      if (count % 25 === 0) {
        console.log("Saved events so far:", count);
      }
    } catch (err) {
      failed += 1;

      console.error("Event upsert error:", {
        source: event.source,
        sourceEventId: event.sourceEventId,
        title: event.title,
        startAt: event.startAt,
        latitude: event.latitude,
        longitude: event.longitude,
        error: err?.message || err,
      });

      if (failed % 10 === 0) {
        console.log("Failed events so far:", failed);
      }
    }
  }

  await cleanupOldEvents();

  console.log("Real events sync complete. Upserted:", count, "Failed:", failed);

  return count;
}

module.exports = {
  syncRealEvents,
};
