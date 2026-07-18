const prisma = require("../prisma");

function cleanText(value, limit = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalize(value) {
  return cleanText(value).toLowerCase();
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function intFromText(value) {
  const number = Number(String(value || "").replace(/[^0-9]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function sourceKeyForPlace(place, city) {
  return [place.title, place.address || place.subtitle || "", city || "", place.website || ""].map((part) => normalize(part).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")).filter(Boolean).join("|").slice(0, 700);
}

function tagsFromText(text) {
  const source = normalize(text);
  const tags = [];
  const groups = {
    dessert: ["dessert", "ice cream", "cake", "cookie", "bakery", "sweet"],
    coffee: ["coffee", "cafe", "latte", "espresso"],
    nightlife: ["bar", "club", "nightlife", "cocktail", "drinks", "lounge"],
    lateNight: ["late night", "open late", "after hours"],
    dateNight: ["date", "romantic", "girlfriend", "boyfriend"],
    fastFood: ["fast food", "quick", "cheap", "chain"],
    food: ["food", "restaurant", "eat", "dinner", "lunch", "brunch"],
    travel: ["travel", "visit", "places to go", "tourist"],
  };
  Object.keys(groups).forEach((tag) => {
    if (groups[tag].some((word) => source.includes(word))) tags.push(tag);
  });
  ["italian", "sushi", "pizza", "burger", "thai", "indian", "chinese", "shawarma", "tacos", "mexican", "vegan", "steak", "seafood"].forEach((tag) => {
    if (source.includes(tag)) tags.push(tag);
  });
  return Array.from(new Set(tags));
}

function cityFromMessage(message) {
  const text = normalize(message);
  const cities = ["Barrie", "Toronto", "Mississauga", "Brampton", "Hamilton", "Vancouver", "Calgary", "Edmonton", "Montreal", "Ottawa"];
  return cities.find((city) => text.includes(city.toLowerCase())) || "";
}

async function findProfileId(username, profileId) {
  if (profileId) return profileId;
  const cleanUsername = cleanText(username, 80).replace(/^@+/, "");
  if (!cleanUsername) return null;
  try {
    const profile = await prisma.userProfile.findFirst({ where: { username: cleanUsername }, select: { id: true } });
    return profile && profile.id ? profile.id : null;
  } catch (_) {
    return null;
  }
}

async function rememberPreference(profileId, key, value, metadata = {}) {
  const cleanKey = cleanText(key, 80);
  const cleanValue = cleanText(value, 160);
  if (!cleanKey || !cleanValue) return null;
  try {
    return await prisma.tapzyUserMemory.upsert({
      where: {
        profileId_scope_key_value: {
          profileId,
          scope: "preference",
          key: cleanKey,
          value: cleanValue,
        },
      },
      create: {
        profileId,
        scope: "preference",
        key: cleanKey,
        value: cleanValue,
        weight: 1,
        source: "assistant",
        metadata,
        lastUsedAt: new Date(),
      },
      update: {
        weight: { increment: 0.35 },
        metadata,
        lastUsedAt: new Date(),
      },
      select: { id: true },
    });
  } catch (_) {
    return null;
  }
}

async function learnUserPreferences({ message, username, profileId, city, tapzySearch } = {}) {
  const resolvedProfileId = await findProfileId(username, profileId);
  if (!resolvedProfileId) return [];
  const text = normalize(message);
  const signals = [];
  const messageCity = cityFromMessage(message) || cleanText(city, 80);
  if (messageCity) signals.push(["city", messageCity]);
  tagsFromText(text).forEach((tag) => signals.push(["interest", tag]));
  if (tapzySearch && tapzySearch.kind) signals.push(["search_kind", tapzySearch.kind]);
  const saved = [];
  for (const [key, value] of signals.slice(0, 8)) {
    const row = await rememberPreference(resolvedProfileId, key, value, { lastMessage: cleanText(message, 240) });
    if (row) saved.push({ key, value });
  }
  return saved;
}

async function rememberSearchPlaces({ search, city, query } = {}) {
  const results = Array.isArray(search && search.results) ? search.results : [];
  if (!results.length) return [];
  const remembered = [];
  for (const place of results.slice(0, 10)) {
    const title = cleanText(place.title, 180);
    if (!title) continue;
    const sourceExternalKey = sourceKeyForPlace(place, city || search.city);
    if (!sourceExternalKey) continue;
    const tags = Array.from(new Set([...(tagsFromText([query, search.kind, place.type, place.title, place.snippet].filter(Boolean).join(" "))), cleanText(search.kind, 50)].filter(Boolean)));
    const rating = safeNumber(place.rating);
    const reviews = intFromText(place.reviews);
    const confidence = Math.min(1, Math.max(0.15, (rating ? rating / 5 : 0.45) + (reviews ? Math.min(reviews, 1000) / 5000 : 0)));
    try {
      const row = await prisma.tapzyPlaceSnapshot.upsert({
        where: { sourceExternalKey },
        create: {
          source: "serpapi_google",
          sourceExternalKey,
          title,
          category: cleanText(search.kind || place.type || "place", 80),
          city: cleanText(city || search.city || "", 80),
          country: "CA",
          address: cleanText(place.address || place.snippet || "", 220),
          latitude: safeNumber(place.latitude),
          longitude: safeNumber(place.longitude),
          rating,
          reviews,
          price: cleanText(place.price || "", 40),
          hours: cleanText(place.hours || "", 180),
          website: cleanText(place.website || place.link || "", 900),
          directions: cleanText(place.directions || "", 900),
          phone: cleanText(place.phone || "", 80),
          tags,
          raw: place,
          confidence,
          lastSeenAt: new Date(),
          lastVerifiedAt: new Date(),
        },
        update: {
          category: cleanText(search.kind || place.type || "place", 80),
          city: cleanText(city || search.city || "", 80),
          address: cleanText(place.address || place.snippet || "", 220),
          latitude: safeNumber(place.latitude),
          longitude: safeNumber(place.longitude),
          rating,
          reviews,
          price: cleanText(place.price || "", 40),
          hours: cleanText(place.hours || "", 180),
          website: cleanText(place.website || place.link || "", 900),
          directions: cleanText(place.directions || "", 900),
          phone: cleanText(place.phone || "", 80),
          tags,
          raw: place,
          confidence,
          seenCount: { increment: 1 },
          lastSeenAt: new Date(),
          lastVerifiedAt: new Date(),
        },
        select: { id: true, title: true },
      });
      remembered.push(row);
    } catch (_) {}
  }
  return remembered;
}

async function absorbTapzyBrain({ message, username, profileId, city, tapzySearch } = {}) {
  const [preferences, places] = await Promise.all([
    learnUserPreferences({ message, username, profileId, city, tapzySearch }),
    rememberSearchPlaces({ search: tapzySearch, city, query: message }),
  ]);
  return { preferences, places };
}

async function loadTapzyBrainContext({ message, username, profileId, city, limit = 8 } = {}) {
  const resolvedProfileId = await findProfileId(username, profileId);
  const tags = tagsFromText(message);
  const requestedCity = cityFromMessage(message) || cleanText(city, 80);
  const output = { memories: [], places: [], tags, city: requestedCity };
  try {
    if (resolvedProfileId) {
      output.memories = await prisma.tapzyUserMemory.findMany({
        where: { profileId: resolvedProfileId, scope: "preference" },
        orderBy: [{ weight: "desc" }, { updatedAt: "desc" }],
        take: 12,
        select: { key: true, value: true, weight: true, updatedAt: true },
      });
    }
  } catch (_) {}
  try {
    const where = {
      AND: [
        requestedCity ? { city: { equals: requestedCity, mode: "insensitive" } } : {},
        tags.length ? { tags: { hasSome: tags } } : {},
      ],
    };
    output.places = await prisma.tapzyPlaceSnapshot.findMany({
      where,
      orderBy: [{ confidence: "desc" }, { seenCount: "desc" }, { lastSeenAt: "desc" }],
      take: limit,
      select: {
        title: true,
        category: true,
        city: true,
        address: true,
        rating: true,
        reviews: true,
        price: true,
        hours: true,
        website: true,
        directions: true,
        tags: true,
        confidence: true,
        seenCount: true,
        lastVerifiedAt: true,
      },
    });
  } catch (_) {}
  return output;
}

function formatTapzyBrainContext(brain = {}) {
  const parts = [];
  const memories = Array.isArray(brain.memories) ? brain.memories : [];
  const places = Array.isArray(brain.places) ? brain.places : [];
  if (memories.length) {
    parts.push("Tapzy user memory: " + memories.map((item) => item.key + "=" + item.value + " weight " + Math.round(Number(item.weight || 0) * 10) / 10).join("; "));
  }
  if (places.length) {
    parts.push("Tapzy learned places: " + places.map((place, index) => {
      return (index + 1) + ". " + [place.title, place.category, place.city, place.rating ? "rating " + place.rating : "", place.reviews ? place.reviews + " reviews" : "", place.price, place.hours, place.address].filter(Boolean).join(" | ");
    }).join(" || "));
  }
  return parts.join("\n");
}

module.exports = {
  absorbTapzyBrain,
  loadTapzyBrainContext,
  formatTapzyBrainContext,
  tagsFromText,
};
