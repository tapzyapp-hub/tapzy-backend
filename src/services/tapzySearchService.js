const SERPAPI_KEY = process.env.SERPAPI_KEY || "";
const SEARCH_CACHE_TTL_MS = Math.max(30000, Number(process.env.TAPZY_SEARCH_CACHE_TTL_MS || 5 * 60 * 1000));
const SEARCH_CACHE_MAX = Math.max(20, Number(process.env.TAPZY_SEARCH_CACHE_MAX || 160));
const SEARCH_CACHE = new Map();

function cleanText(value, limit = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function tokenize(value) {
  return cleanText(value).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function distanceKm(aLat, aLng, bLat, bLng) {
  const lat1 = safeNumber(aLat);
  const lon1 = safeNumber(aLng);
  const lat2 = safeNumber(bLat);
  const lon2 = safeNumber(bLng);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h = s1 * s1 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * s2 * s2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function inferKind(query) {
  const text = cleanText(query).toLowerCase();
  if (/\b(dessert|ice cream|bakery|cake|cookie|pastry|sweet)\b/.test(text)) return "dessert";
  if (/\b(bar|bars|cocktail|drinks|nightlife|club|lounge)\b/.test(text)) return "bars";
  if (/\b(coffee|cafe|study|quiet)\b/.test(text)) return "coffee";
  if (/\b(fast food|quick|cheap|chain)\b/.test(text)) return "fast-food";
  if (/\b(travel|places to go|best places|tourist|visit)\b/.test(text)) return "travel";
  return "food";
}

function hasPlaceIntent(query) {
  return /\b(food|restaurant|restaurants|eat|dinner|lunch|breakfast|brunch|dessert|coffee|bar|bars|nightlife|late night|open now|open late|fast food|pizza|burger|sushi|italian|indian|thai|chinese|shawarma|tacos|travel|places to go|best places|date spot|date night)\b/i.test(cleanText(query));
}

function buildQuery(query, city, weather) {
  const text = cleanText(query).toLowerCase();
  const parts = [];
  if (/\b(open now|open late|late night|after hours)\b/.test(text)) parts.push("open now");
  if (/\b(best|top|popular|rated|five star|5 star)\b/.test(text)) parts.push("best rated popular");
  if (/\b(cheap|under|budget)\b/.test(text)) parts.push("affordable");
  if (/\b(date|romantic|girl|boyfriend|girlfriend)\b/.test(text)) parts.push("date night");
  const cuisine = ["italian", "sushi", "pizza", "burger", "thai", "indian", "chinese", "shawarma", "tacos", "mexican", "vegan", "steak", "seafood", "dessert", "coffee", "brunch", "bar", "fast food"].find((word) => text.includes(word));
  if (cuisine) parts.push(cuisine);
  parts.push(inferKind(query).replace("-", " "));
  parts.push(city || "near me");
  if (weather && /\b(rain|raining|cold|hot)\b/.test(text)) parts.push("weather friendly");
  return parts.filter(Boolean).join(" ");
}

function mapsDirectionUrl(place) {
  const lat = safeNumber(place && place.latitude);
  const lng = safeNumber(place && place.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(lat + "," + lng);
  }
  const target = cleanText(place && (place.address || place.title || place.name), 260);
  return target ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(target) : "";
}

function action(label, url, type) {
  const cleanUrl = cleanText(url, 900);
  if (!cleanUrl) return null;
  return { label, url: cleanUrl, type: type || label.toLowerCase().replace(/\s+/g, "-") };
}

function compactPlace(item) {
  const title = cleanText(item?.title || item?.name || item?.place_name || "", 180);
  if (!title) return null;
  const gps = item?.gps_coordinates || item?.coordinates || {};
  const place = {
    title,
    link: cleanText(item?.link || item?.website || item?.directions || item?.maps_url || "", 900),
    snippet: cleanText(item?.snippet || item?.description || item?.address || item?.type || item?.types || "", 320),
    rating: cleanText(item?.rating || "", 40),
    reviews: cleanText(item?.reviews || item?.reviews_original || "", 80),
    price: cleanText(item?.price || item?.price_level || "", 40),
    type: cleanText(item?.type || item?.types || item?.category || "", 120),
    address: cleanText(item?.address || item?.place_address || "", 220),
    phone: cleanText(item?.phone || "", 80),
    website: cleanText(item?.website || item?.link || "", 900),
    directions: cleanText(item?.directions || item?.directions_link || item?.maps_url || "", 900),
    hours: cleanText(item?.hours || item?.operating_hours || item?.open_state || item?.hours_text || "", 180),
    latitude: safeNumber(gps.latitude ?? gps.lat),
    longitude: safeNumber(gps.longitude ?? gps.lng),
  };
  if (!place.directions) place.directions = mapsDirectionUrl(place);
  return place;
}

function scorePlace(place, originalQuery, location = {}) {
  const text = cleanText(originalQuery).toLowerCase();
  let score = 0;
  const rating = Number(place.rating);
  if (Number.isFinite(rating)) score += rating * 12;
  const reviews = Number(String(place.reviews || "").replace(/[^0-9.]/g, ""));
  if (Number.isFinite(reviews)) score += Math.min(reviews, 2000) / 100;
  if (place.hours && /open/i.test(place.hours)) score += 8;
  if (/\b(open now|late night|open late|after hours)\b/.test(text) && place.hours && /open/i.test(place.hours)) score += 14;
  if (place.price && /\$/.test(place.price)) score += 3;
  if (place.website) score += 2;
  if (place.directions) score += 2;
  const km = distanceKm(location.latitude, location.longitude, place.latitude, place.longitude);
  if (Number.isFinite(km)) score += Math.max(0, 20 - km);
  const haystack = [place.title, place.type, place.snippet, place.address].join(" ").toLowerCase();
  tokenize(originalQuery).forEach((term) => {
    if (term.length > 2 && haystack.includes(term)) score += 4;
  });
  return { ...place, distanceKm: Number.isFinite(km) ? Math.round(km * 10) / 10 : null, tapzyScore: Math.round(score * 10) / 10 };
}

function toTapzyCard(place, index) {
  const details = [
    place.rating ? "Rating " + place.rating : "",
    place.reviews ? place.reviews + " reviews" : "",
    place.price || "",
    place.hours || "Hours need live check",
    Number.isFinite(place.distanceKm) ? "About " + place.distanceKm + " km away" : "",
  ].filter(Boolean);
  const actions = [
    action("Directions", place.directions || mapsDirectionUrl(place), "directions"),
    action("Website", place.website, "website"),
    action("Call", place.phone ? "tel:" + place.phone.replace(/[^+0-9]/g, "") : "", "phone"),
  ].filter(Boolean).slice(0, 3);
  return {
    rank: index + 1,
    title: place.title,
    subtitle: place.type || place.address || place.snippet || "Tapzy pick",
    detail: details.join(" - "),
    rating: place.rating,
    reviews: place.reviews,
    price: place.price,
    hours: place.hours,
    address: place.address,
    distanceKm: place.distanceKm,
    score: place.tapzyScore,
    actions,
  };
}

function cacheKey(params) {
  const lat = safeNumber(params.latitude);
  const lng = safeNumber(params.longitude);
  return JSON.stringify({
    q: cleanText(params.query, 300).toLowerCase(),
    city: cleanText(params.city, 120).toLowerCase(),
    lat: lat === null ? null : Math.round(lat * 100) / 100,
    lng: lng === null ? null : Math.round(lng * 100) / 100,
    limit: Math.max(1, Number(params.limit || 8)),
  });
}

function getCached(key) {
  const entry = SEARCH_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > SEARCH_CACHE_TTL_MS) {
    SEARCH_CACHE.delete(key);
    return null;
  }
  SEARCH_CACHE.delete(key);
  SEARCH_CACHE.set(key, entry);
  return { ...entry.value, cached: true };
}

function setCached(key, value) {
  SEARCH_CACHE.set(key, { createdAt: Date.now(), value: { ...value, cached: false } });
  while (SEARCH_CACHE.size > SEARCH_CACHE_MAX) {
    const first = SEARCH_CACHE.keys().next().value;
    SEARCH_CACHE.delete(first);
  }
}

function emptySearch({ query, kind = "general", city = "", latitude = null, longitude = null, filters = {}, summary = "", error = "" }) {
  return { available: false, query, kind, city, latitude: safeNumber(latitude), longitude: safeNumber(longitude), results: [], cards: [], webResults: [], filters, summary, cached: false, error };
}

async function tapzySearchPlaces({ query, city = "", latitude = null, longitude = null, weather = null, limit = 8 } = {}) {
  const originalQuery = cleanText(query, 500);
  const kind = inferKind(originalQuery);
  if (!originalQuery || !hasPlaceIntent(originalQuery)) {
    return emptySearch({ query: originalQuery, kind: "general", city, latitude, longitude });
  }

  const searchQuery = buildQuery(originalQuery, city, weather);
  const filters = {
    openNow: /\b(open now|open late|late night|after hours)\b/i.test(originalQuery),
    bestRated: /\b(best|top|rated|five star|5 star|popular)\b/i.test(originalQuery),
    lateNight: /\b(late night|open late|after hours)\b/i.test(originalQuery),
    dessert: kind === "dessert",
    bars: kind === "bars",
    fastFood: kind === "fast-food",
  };
  const key = cacheKey({ query: searchQuery, city, latitude, longitude, limit });
  const cached = getCached(key);
  if (cached) return cached;

  if (!SERPAPI_KEY || typeof fetch !== "function") {
    return emptySearch({ query: searchQuery, kind, city, latitude, longitude, filters });
  }

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", searchQuery);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", city && ["Toronto", "Barrie", "Mississauga", "Brampton", "Hamilton", "Montreal", "Vancouver", "Calgary", "Edmonton"].includes(city) ? "ca" : "us");
  url.searchParams.set("num", "10");
  url.searchParams.set("api_key", SERPAPI_KEY);
  if (city && city !== "your current area") url.searchParams.set("location", city);

  let response;
  let data;
  try {
    response = await fetch(url.toString(), { signal: AbortSignal.timeout ? AbortSignal.timeout(5200) : undefined });
    data = await response.json().catch(() => null);
  } catch (error) {
    return emptySearch({ query: searchQuery, kind, city, latitude, longitude, filters, error: cleanText(error && error.message ? error.message : "Tapzy Search unavailable", 180) });
  }
  if (!response.ok || !data) {
    return emptySearch({ query: searchQuery, kind, city, latitude, longitude, filters });
  }

  const local = Array.isArray(data.local_results?.places) ? data.local_results.places : [];
  const organic = Array.isArray(data.organic_results) ? data.organic_results : [];
  const results = local.map(compactPlace).filter(Boolean).map((place) => scorePlace(place, originalQuery, { latitude, longitude })).sort((a, b) => b.tapzyScore - a.tapzyScore).slice(0, Math.max(1, limit));
  const cards = results.map(toTapzyCard);
  const webResults = organic.map(compactPlace).filter(Boolean).slice(0, 3);
  const value = {
    available: true,
    query: searchQuery,
    kind,
    city,
    latitude: safeNumber(latitude),
    longitude: safeNumber(longitude),
    results,
    cards,
    webResults,
    filters,
    cached: false,
    summary: cards.slice(0, 5).map((card) => {
      return card.rank + ". " + [card.title, card.detail, card.subtitle].filter(Boolean).join(" - ");
    }).join("\n"),
  };
  setCached(key, value);
  return value;
}

module.exports = {
  tapzySearchPlaces,
  hasPlaceIntent,
  inferKind,
  buildQuery,
  compactPlace,
  scorePlace,
  distanceKm,
  mapsDirectionUrl,
  toTapzyCard,
};
