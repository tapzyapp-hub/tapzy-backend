
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

      category: "Nightlife",

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

  const raw = String(event?.category || "").trim();

  const value = raw.toLowerCase();



  if (!raw || value === "undefined" || value === "miscellaneous" || value === "other") {

    const haystack = String(

      [event?.title || "", event?.description || "", event?.venueName || ""].join(" ")

    ).toLowerCase();



    if (

      haystack.includes("concert") ||

      haystack.includes("music") ||

      haystack.includes("festival") ||

      haystack.includes("tour") ||

      haystack.includes("band")

    ) return "Concerts";



    if (

      haystack.includes("sport") ||

      haystack.includes("hockey") ||

      haystack.includes("basketball") ||

      haystack.includes("football") ||

      haystack.includes("soccer") ||

      haystack.includes("baseball") ||

      haystack.includes("mma") ||

      haystack.includes("ufc") ||

      haystack.includes("game")

    ) return "Sports";



    if (

      haystack.includes("nightlife") ||

      haystack.includes("party") ||

      haystack.includes("club") ||

      haystack.includes("dj") ||

      haystack.includes("rave") ||

      haystack.includes("lounge")

    ) return "Nightlife";



    if (

      haystack.includes("convention") ||

      haystack.includes("expo") ||

      haystack.includes("comic con") ||

      haystack.includes("fan expo") ||

      haystack.includes("conference") ||

      haystack.includes("summit")

    ) return "Conventions";



    return "Event";

  }



  if (value.includes("concert") || value.includes("music") || value.includes("festival")) {

    return "Concerts";

  }



  if (

    value.includes("sport") ||

    value.includes("hockey") ||

    value.includes("basketball") ||

    value.includes("football") ||

    value.includes("soccer") ||

    value.includes("baseball") ||

    value.includes("mma") ||

    value.includes("ufc")

  ) {

    return "Sports";

  }



  if (

    value.includes("nightlife") ||

    value.includes("party") ||

    value.includes("club") ||

    value.includes("dj")

  ) {

    return "Nightlife";

  }



  if (

    value.includes("convention") ||

    value.includes("expo") ||

    value.includes("comic") ||

    value.includes("fan")

  ) {

    return "Conventions";

  }



  return raw;

}



function getShortDescription(event) {

  const source = String(event?.description || "").trim();

  if (!source) return "Premium event discovery inside Tapzy Network™.";



  const cleaned = source.replace(/\s+/g, " ").trim();

  if (cleaned.length <= 120) return cleaned;

  return cleaned.slice(0, 117).trim() + "...";

}



function pickImage(event) {

  if (event.imageUrl) return event.imageUrl;



  const category = normalizeCategory(event).toLowerCase();



  if (

    category.includes("nightlife") ||

    category.includes("party") ||

    category.includes("club") ||

    category.includes("dj")

  ) {

    return "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1400&q=80";

  }



  if (

    category.includes("concert") ||

    category.includes("music") ||

    category.includes("festival")

  ) {

    return "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1400&q=80";

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

    return "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1400&q=80";

  }



  if (

    category.includes("convention") ||

    category.includes("expo") ||

    category.includes("comic") ||

    category.includes("fan")

  ) {

    return "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1400&q=80";

  }



  return "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1400&q=80";

}



function eventMatchesCategoryGroup(event, group) {

  const haystack = String(

    [

      normalizeCategory(event),

      event.title || "",

      event.description || "",

      event.venueName || "",

    ].join(" ")

  ).toLowerCase();



  if (group === "sports") {

    return [

      "sports",

      "sport",

      "hockey",

      "basketball",

      "football",

      "soccer",

      "baseball",

      "mma",

      "ufc",

      "wrestling",

      "tennis",

      "lacrosse",

      "volleyball",

      "game",

    ].some((term) => haystack.includes(term));

  }



  if (group === "concerts") {

    return [

      "concert",

      "music",

      "live music",

      "festival",

      "tour",

      "show",

      "artist",

      "band",

    ].some((term) => haystack.includes(term));

  }



  if (group === "nightlife") {

    return [

      "nightlife",

      "party",

      "club",

      "dj",

      "dance",

      "rave",

      "afterparty",

      "lounge",

    ].some((term) => haystack.includes(term));

  }



  if (group === "conventions") {

    return [

      "convention",

      "expo",

      "comic con",

      "fan expo",

      "conference",

      "summit",

    ].some((term) => haystack.includes(term));

  }



  return false;

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



function sortRanked(events) {

  return [...events].sort((a, b) => {

    const diff = rankEvent(b) - rankEvent(a);

    if (diff !== 0) return diff;



    const aTime = a.startAt ? new Date(a.startAt).getTime() : Number.MAX_SAFE_INTEGER;

    const bTime = b.startAt ? new Date(b.startAt).getTime() : Number.MAX_SAFE_INTEGER;

    return aTime - bTime;

  });

}


function normalizeCategoryQuery(category) {
  return String(category || "").trim().toLowerCase();
}

function eventMatchesCategoryFilter(event, category) {
  const group = normalizeCategoryQuery(category);
  if (!group) return true;

  if (["concerts", "concert", "music", "festival"].includes(group)) {
    return eventMatchesCategoryGroup(event, "concerts") || normalizeCategory(event).toLowerCase() === "concerts";
  }

  if (["sports", "sport"].includes(group)) {
    return eventMatchesCategoryGroup(event, "sports") || normalizeCategory(event).toLowerCase() === "sports";
  }

  if (["nightlife", "party", "club", "dj"].includes(group)) {
    return eventMatchesCategoryGroup(event, "nightlife") || normalizeCategory(event).toLowerCase() === "nightlife";
  }

  if (["conventions", "convention", "expo", "conference", "comic"].includes(group)) {
    return eventMatchesCategoryGroup(event, "conventions") || normalizeCategory(event).toLowerCase() === "conventions";
  }

  return normalizeCategory(event).toLowerCase().includes(group);
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
  eventMatchesCategoryGroup,
  eventMatchesCategoryFilter,
  rankEvent,
  getUrgencyBadge,
  sortRanked,
  buildWhere,
};
