function cleanText(value, max = 1200) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function tokenize(value) {
  return cleanText(value, 1200)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length > 2)
    .slice(0, 40);
}

function distanceKm(aLat, aLng, bLat, bLng) {
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return null;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function wantsTonight(message) {
  return /\b(tonight|late night|evening|after work|after school)\b/i.test(message);
}

function wantsWeekend(message) {
  return /\b(weekend|friday|saturday|sunday)\b/i.test(message);
}

function wantsQuiet(message) {
  return /\b(quiet|chill|relax|study|solo|alone|peaceful|calm)\b/i.test(message);
}

function wantsBusy(message) {
  return /\b(busy|crowd|people|packed|popular|lit|nightlife|party|social)\b/i.test(message);
}

function wantsFood(message) {
  return /\b(food|restaurant|dessert|coffee|snack|eat|dinner|lunch|breakfast|date)\b/i.test(message);
}

function getIntent(message) {
  if (wantsFood(message)) return "food";
  if (/\b(concert|music|show|festival|party|club|bar|nightlife)\b/i.test(message)) return "music";
  if (/\b(event|events|going on|things to do|tonight|weekend)\b/i.test(message)) return "events";
  if (wantsQuiet(message)) return "quiet";
  if (wantsBusy(message)) return "busy";
  return "general";
}

function formatWhen(value) {
  if (!value) return "time TBA";
  try {
    return new Date(value).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch (_) {
    return "time TBA";
  }
}

function scoreTextMatch(messageTokens, haystack) {
  if (!messageTokens.length) return 0;
  const text = cleanText(haystack, 4000).toLowerCase();
  return messageTokens.reduce((score, token) => score + (text.includes(token) ? 8 : 0), 0);
}

function scoreEvent(event, context, tokens, intent) {
  let score = 20;
  const haystack = [
    event.title,
    event.description,
    event.venueName,
    event.city,
    event.region,
    event.category,
    event.priceText,
  ].join(" ");
  score += scoreTextMatch(tokens, haystack);

  if (intent === "music" && /music|concert|dj|club|festival|dance|party/i.test(haystack)) score += 35;
  if (intent === "food" && /food|wine|beer|restaurant|market|taste|dessert|coffee/i.test(haystack)) score += 18;
  if (intent === "quiet" && /gallery|museum|market|class|workshop|study|coffee|park/i.test(haystack)) score += 16;
  if (intent === "busy" && /festival|concert|club|party|nightlife|sports|market/i.test(haystack)) score += 18;

  const eventDate = event.startAt ? new Date(event.startAt) : null;
  if (eventDate && !Number.isNaN(eventDate.getTime())) {
    const hoursAway = (eventDate.getTime() - Date.now()) / 3600000;
    if (hoursAway >= -4 && hoursAway <= 12) score += wantsTonight(context.message) ? 35 : 18;
    if (hoursAway >= 0 && hoursAway <= 72) score += wantsWeekend(context.message) ? 18 : 8;
    if (hoursAway < -8) score -= 35;
  }

  const userLat = asNumber(context.latitude);
  const userLng = asNumber(context.longitude);
  const eventLat = asNumber(event.latitude);
  const eventLng = asNumber(event.longitude);
  const distance = distanceKm(userLat, userLng, eventLat, eventLng);
  if (distance !== null) {
    if (distance <= 5) score += 35;
    else if (distance <= 15) score += 24;
    else if (distance <= 40) score += 12;
    else score -= Math.min(30, distance / 10);
  }

  const city = cleanText(context.city || context.locationLabel, 80).toLowerCase();
  if (city && cleanText(event.city, 80).toLowerCase().includes(city)) score += 22;

  return { score, distanceKm: distance };
}

function summarizeEvent(event, scoreMeta = {}) {
  const where = cleanText(event.venueName || event.address || event.city || "location TBA", 120);
  const distance = scoreMeta.distanceKm !== null && scoreMeta.distanceKm !== undefined
    ? `, about ${Math.max(1, Math.round(scoreMeta.distanceKm))} km away`
    : "";
  return {
    type: "event",
    title: cleanText(event.title, 140),
    when: formatWhen(event.startAt),
    where,
    city: cleanText(event.city, 80),
    category: cleanText(event.category, 80),
    reason: cleanText(event.description || event.category || "Good Tapzy event match.", 180),
    distance,
    url: event.id ? `/events/view/${event.id}` : "",
  };
}

function summarizeProfile(profile) {
  return {
    type: "profile",
    title: cleanText(profile.name || profile.username || "Tapzy profile", 120),
    handle: profile.username ? "@" + cleanText(profile.username, 80) : "",
    reason: cleanText([profile.title, profile.bio].filter(Boolean).join(" - "), 180),
    url: profile.username ? `/u/${profile.username}` : "",
  };
}

function summarizeStory(story) {
  return {
    type: "story",
    title: cleanText(story.text || story.audioTitle || "Recent Tapzy story", 120),
    when: formatWhen(story.createdAt),
    reason: story.profile ? cleanText(`Story from ${story.profile.name || story.profile.username || "a Tapzy user"}`, 160) : "Recent Tapzy story.",
  };
}

function summarizePost(post) {
  return {
    type: "post",
    title: cleanText(post.caption || "Recent Tapzy post", 120),
    when: formatWhen(post.createdAt),
    reason: post.profile ? cleanText(`Post from ${post.profile.name || post.profile.username || "a Tapzy user"}`, 160) : "Recent Tapzy post.",
  };
}

async function getPrisma() {
  try {
    return require("../prisma");
  } catch (_) {
    return null;
  }
}

async function searchTapzyKnowledge(input = {}) {
  const prisma = await getPrisma();
  const message = cleanText(input.message, 1200);
  const tokens = tokenize(message);
  const intent = getIntent(message);
  const context = {
    message,
    latitude: asNumber(input.latitude),
    longitude: asNumber(input.longitude),
    city: cleanText(input.city, 80),
    locationLabel: cleanText(input.locationLabel, 100),
  };

  if (!prisma) {
    return { ok: true, intent, events: [], profiles: [], stories: [], posts: [], facts: [] };
  }

  const now = new Date();
  const [events, profiles, stories, posts] = await Promise.all([
    prisma.eventFinderItem?.findMany({
      where: { OR: [{ startAt: { gte: new Date(now.getTime() - 8 * 3600000) } }, { startAt: null }] },
      orderBy: [{ startAt: "asc" }, { updatedAt: "desc" }],
      take: 60,
    }).catch(() => []) || [],
    prisma.userProfile?.findMany({
      orderBy: [{ connections: "desc" }, { updatedAt: "desc" }],
      take: 12,
    }).catch(() => []) || [],
    prisma.story?.findMany({
      where: { expiresAt: { gte: now } },
      include: { profile: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    }).catch(() => []) || [],
    prisma.post?.findMany({
      include: { profile: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    }).catch(() => []) || [],
  ]);

  const rankedEvents = events
    .map((event) => {
      const meta = scoreEvent(event, context, tokens, intent);
      return { event, meta };
    })
    .sort((a, b) => b.meta.score - a.meta.score)
    .slice(0, 8)
    .map(({ event, meta }) => summarizeEvent(event, meta));

  const rankedProfiles = profiles
    .filter((profile) => scoreTextMatch(tokens, [profile.name, profile.username, profile.title, profile.bio].join(" ")) > 0 || intent !== "events")
    .slice(0, 4)
    .map(summarizeProfile);

  const rankedStories = stories.slice(0, 4).map(summarizeStory);
  const rankedPosts = posts.slice(0, 4).map(summarizePost);

  const facts = [
    ...rankedEvents.map((event) => `${event.title} is ${event.when} at ${event.where}${event.distance || ""}.`),
    ...rankedProfiles.map((profile) => `${profile.title} ${profile.handle} ${profile.reason}`.trim()),
    ...rankedStories.map((story) => `${story.title} - ${story.reason}`),
    ...rankedPosts.map((post) => `${post.title} - ${post.reason}`),
  ].filter(Boolean).slice(0, 18);

  return {
    ok: true,
    intent,
    events: rankedEvents,
    profiles: rankedProfiles,
    stories: rankedStories,
    posts: rankedPosts,
    facts,
    hasLocation: Number.isFinite(context.latitude) && Number.isFinite(context.longitude),
  };
}

module.exports = {
  searchTapzyKnowledge,
  distanceKm,
  getIntent,
};
