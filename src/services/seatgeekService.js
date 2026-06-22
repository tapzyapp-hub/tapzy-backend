const SEATGEEK_CLIENT_ID = process.env.SEATGEEK_CLIENT_ID || "";

function text(value) {
  return String(value || "").trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function pickBestImage(performers = []) {
  for (const performer of performers || []) {
    const img = text(performer?.images?.huge || performer?.images?.large || performer?.image);
    if (img) return img;
  }
  return "";
}

function formatPrice(stats) {
  const low = numberOrNull(stats?.lowest_price);
  const high = numberOrNull(stats?.highest_price);

  if (low == null && high == null) return "";
  if (low != null && high != null && low !== high) {
    return `USD ${low} - ${high}`;
  }
  return `USD ${low ?? high}`;
}

function categoryFromEvent(event) {
  const taxonomies = Array.isArray(event?.taxonomies) ? event.taxonomies : [];
  const names = taxonomies.map((x) => text(x?.name)).filter(Boolean);

  if (names.length) return names[0];
  return "Event";
}

function normalizeSeatGeekEvent(event) {
  const id = text(event?.id);
  const title = text(event?.title || event?.short_title);

  if (!id || !title) return null;

  const venue = event?.venue || {};
  const city = text(venue?.city);
  const region = text(venue?.state || venue?.state_code);
  const country = text(venue?.country || "Canada");

  return {
    source: "seatgeek",
    sourceEventId: id,
    title,
    description: text(event?.description || ""),
    imageUrl: pickBestImage(event?.performers),
    venueName: text(venue?.name),
    address: [
      text(venue?.address),
      city,
      region,
      country,
    ].filter(Boolean).join(", "),
    city,
    region,
    country,
    eventUrl: text(event?.url),
    ticketUrl: text(event?.url),
    category: categoryFromEvent(event),
    startAt: toIso(event?.datetime_utc || event?.datetime_local),
    endAt: null,
    latitude: numberOrNull(venue?.location?.lat ?? venue?.location?.latitude),
    longitude: numberOrNull(venue?.location?.lon ?? venue?.location?.longitude),
    priceText: formatPrice(event?.stats),
    rawPayload: event,
  };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SeatGeek ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

function buildUrl(params = {}) {
  const url = new URL("https://api.seatgeek.com/2/events");
  url.searchParams.set("client_id", SEATGEEK_CLIENT_ID);
  url.searchParams.set("per_page", String(params.per_page || 40));
  url.searchParams.set("sort", "datetime_utc.asc");

  if (params.q) url.searchParams.set("q", params.q);
  if (params.venue_city) url.searchParams.set("venue.city", params.venue_city);
  if (params.datetime_utc_gte) url.searchParams.set("datetime_utc.gte", params.datetime_utc_gte);
  if (params.datetime_utc_lte) url.searchParams.set("datetime_utc.lte", params.datetime_utc_lte);
  if (params.page) url.searchParams.set("page", String(params.page));

  return url.toString();
}

function futureWindow() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 45);
  end.setHours(23, 59, 59, 999);

  return {
    datetime_utc_gte: start.toISOString(),
    datetime_utc_lte: end.toISOString(),
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSeatGeekEvents(options = {}) {
  if (!SEATGEEK_CLIENT_ID) {
    console.log("SeatGeek client ID missing");
    return [];
  }

  const cities = Array.isArray(options.cities) && options.cities.length
    ? options.cities
    : ["Toronto", "Montreal", "Vancouver", "Calgary", "Edmonton"];

  const keywords = Array.isArray(options.keywords) && options.keywords.length
    ? options.keywords
    : ["concert", "sports", "nightlife", "convention"];

  const windowParams = futureWindow();
  const all = [];
  const seen = new Set();

  for (const city of cities) {
    for (const keyword of keywords) {
      try {
        const url = buildUrl({
          venue_city: city,
          q: keyword,
          per_page: 40,
          ...windowParams,
        });

        const json = await fetchJson(url);
        const events = Array.isArray(json?.events) ? json.events : [];

        console.log(`SeatGeek city "${city}" keyword "${keyword}" events:`, events.length);

        for (const raw of events) {
          const normalized = normalizeSeatGeekEvent(raw);
          if (!normalized) continue;

          const key = `${normalized.source}:${normalized.sourceEventId}`;
          if (seen.has(key)) continue;

          seen.add(key);
          all.push(normalized);
        }

        await delay(500);
      } catch (err) {
        console.error(`SeatGeek fetch failed for ${city} / ${keyword}:`, err?.message || err);
      }
    }
  }

  console.log("SeatGeek raw events:", all.length);
  return all;
}

module.exports = {
  fetchSeatGeekEvents,
};

