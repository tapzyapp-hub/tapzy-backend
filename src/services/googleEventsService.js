const SERPAPI_KEY = process.env.SERPAPI_KEY || "";

function text(value) {
  return String(value || "").trim();
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeGoogleEvent(item, city, keyword) {
  const title = text(item?.title);
  const link = text(item?.link);
  const address = text(item?.address?.join?.(", ") || item?.address || "");
  const venueName = text(item?.venue?.name || item?.venue || "");
  const imageUrl = text(item?.thumbnail || "");
  const eventId = text(item?.event_id || item?.link || `${title}:${address}:${item?.date?.start_date || ""}`);

  if (!title || !eventId) return null;

  const startAt =
    toIso(item?.date?.start_date) ||
    toIso(item?.date?.when) ||
    null;

  return {
    source: "google_events",
    sourceEventId: eventId,
    title,
    description: text(item?.description || ""),
    imageUrl,
    venueName,
    address,
    city: text(city),
    region: "",
    country: "Canada",
    eventUrl: link,
    ticketUrl: link,
    category: text(keyword || "Event"),
    startAt,
    endAt: null,
    latitude: numberOrNull(item?.gps_coordinates?.latitude),
    longitude: numberOrNull(item?.gps_coordinates?.longitude),
    priceText: text(item?.ticket_info?.[0]?.price || ""),
    rawPayload: item,
  };
}

async function fetchGoogleEventsQuery(query, location) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_events");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "ca");
  url.searchParams.set("api_key", SERPAPI_KEY);
  if (location) url.searchParams.set("location", location);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SerpApi ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  return Array.isArray(json?.events_results) ? json.events_results : [];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGoogleEvents(options = {}) {
  if (!SERPAPI_KEY) {
    console.log("SERPAPI_KEY missing");
    return [];
  }

  const cities = Array.isArray(options.cities) && options.cities.length
    ? options.cities
    : ["Toronto", "Montreal", "Vancouver", "Calgary", "Edmonton"];

  const keywords = Array.isArray(options.keywords) && options.keywords.length
    ? options.keywords
    : ["concerts", "sports", "nightlife", "conventions"];

  const all = [];
  const seen = new Set();

  for (const city of cities) {
    for (const keyword of keywords) {
      const query = `${keyword} in ${city}`;
      try {
        const items = await fetchGoogleEventsQuery(query, city);
        console.log(`Google Events "${query}":`, items.length);

        for (const item of items) {
          const normalized = normalizeGoogleEvent(item, city, keyword);
          if (!normalized) continue;

          const key = `${normalized.source}:${normalized.sourceEventId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          all.push(normalized);
        }

        await delay(800);
      } catch (err) {
        console.error(`Google Events fetch failed for "${query}":`, err?.message || err);
      }
    }
  }

  console.log("Google Events usable events:", all.length);
  return all;
}

module.exports = {
  fetchGoogleEvents,
};

