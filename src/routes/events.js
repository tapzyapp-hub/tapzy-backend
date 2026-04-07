const router = require("express").Router();

const prisma = require("../prisma");

const { requireAdmin } = require("../middleware");

const {

  renderShell,

  renderTapzyAssistant,

  escapeHtml,

  formatPrettyLocal,

  backUrl,

} = require("../utils");

const { syncRealEvents } = require("../services/eventSyncService");



const TOP_CITY_ORDER = [

  "Toronto",

  "Montreal",

  "Vancouver",

  "Calgary",

  "Edmonton",

];



const MAIN_QUERY_LIMIT = 600;

const FEED_PAGE_SIZE = 12;



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



async function seedEventsIfEmpty() {

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



function renderSaveButton(eventId, currentProfile, isSaved) {

  return currentProfile

    ? `

      <form method="POST" action="/events/${eventId}/save" class="js-save-form" style="margin:0;">

        <button class="btn btnGhost js-save-btn" type="submit">${isSaved ? "Saved ✓" : "Save"}</button>

      </form>

    `

    : `<a class="btn btnGhost" href="/auth">Sign in to save</a>`;

}



function renderEventCard(event, currentProfile, savedSet) {

  const when = event.startAt ? formatPrettyLocal(event.startAt) : "Date coming soon";

  const image = pickImage(event);

  const label = normalizeCategory(event);

  const shortDescription = getShortDescription(event);

  const badge = getUrgencyBadge(event);

  const isSaved = savedSet.has(event.id);



  return `

  <div class="event-card js-event-card">

    <div class="event-media" style="background-image:

      linear-gradient(180deg, rgba(6,8,14,.06), rgba(6,8,14,.18) 22%, rgba(3,5,10,.62) 60%, rgba(0,0,0,.94)),

      url('${escapeHtml(image)}');"></div>



    <div class="event-card-noise"></div>

    <div class="event-card-glow"></div>

    <div class="event-card-edge"></div>



    <div class="event-content">

      <div class="event-topline">

        <div class="event-pill-stack">

          <span class="event-pill">${escapeHtml(label || "Event")}</span>

          <span class="event-pill event-pill-urgency">${escapeHtml(badge)}</span>

        </div>

        ${event.priceText ? `<span class="event-pill event-pill-soft">${escapeHtml(event.priceText)}</span>` : ""}

      </div>



      <h3 class="event-title">${escapeHtml(event.title)}</h3>



      <div class="event-copy muted">

        ${escapeHtml(shortDescription)}

      </div>



      <div class="event-divider"></div>



      <div class="event-meta">

        <div class="event-meta-row">

          <span class="event-meta-label">When</span>

          <span class="event-meta-value">${escapeHtml(when)}</span>

        </div>

        <div class="event-meta-row">

          <span class="event-meta-label">Where</span>

          <span class="event-meta-value">${escapeHtml(event.venueName || event.address || event.city || "Location coming soon")}</span>

        </div>

        ${event.city ? `

          <div class="event-meta-row">

            <span class="event-meta-label">City</span>

            <span class="event-meta-value">${escapeHtml(event.city)}</span>

          </div>

        ` : ""}

      </div>



      <div class="event-actions-primary">

        <a class="btn btnLuxury" href="/events/view/${escapeHtml(event.id)}">Open Event</a>

        ${event.ticketUrl ? `<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.ticketUrl)}">Tickets</a>` : ""}

      </div>



      <div class="event-actions-secondary">

        ${renderSaveButton(event.id, currentProfile, isSaved)}

      </div>

    </div>

  </div>

  `;

}



function renderReelItem(event, currentProfile, savedSet) {

  const when = event.startAt ? formatPrettyLocal(event.startAt) : "Date coming soon";

  const image = pickImage(event);

  const label = normalizeCategory(event);

  const badge = getUrgencyBadge(event);

  const shortDescription = getShortDescription(event);

  const isSaved = savedSet.has(event.id);



  return `

  <section class="reel-item js-reel-item">

    <div class="reel-bg" style="background-image:

      linear-gradient(180deg, rgba(6,8,14,.12), rgba(6,8,14,.18) 18%, rgba(3,5,10,.50) 48%, rgba(0,0,0,.96)),

      url('${escapeHtml(image)}');"></div>



    <div class="reel-noise"></div>

    <div class="reel-glow"></div>



    <div class="reel-content">

      <div class="reel-top">

        <div class="event-pill-stack">

          <span class="event-pill">${escapeHtml(label)}</span>

          <span class="event-pill event-pill-urgency">${escapeHtml(badge)}</span>

        </div>

        ${event.priceText ? `<span class="event-pill event-pill-soft">${escapeHtml(event.priceText)}</span>` : ""}

      </div>



      <div class="reel-body">

        <h2 class="reel-title">${escapeHtml(event.title)}</h2>

        <div class="reel-sub">${escapeHtml(shortDescription)}</div>



        <div class="reel-meta">

          <div>${escapeHtml(when)}</div>

          <div>${escapeHtml(event.venueName || event.city || "Location coming soon")}</div>

        </div>



        <div class="reel-actions">

          <a class="btn btnLuxury" href="/events/view/${escapeHtml(event.id)}">Open Event</a>

          ${event.ticketUrl ? `<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.ticketUrl)}">Tickets</a>` : ""}

          ${renderSaveButton(event.id, currentProfile, isSaved)}

        </div>

      </div>

    </div>

  </section>

  `;

}



function renderSection(title, items, currentProfile, savedSet) {

  if (!items.length) return "";



  return `

  <section class="events-section desktop-only">

    <div class="row-between" style="margin-bottom:14px;">

      <h2 class="events-section-title">${escapeHtml(title)}</h2>

      <div class="muted">${items.length} event${items.length === 1 ? "" : "s"}</div>

    </div>



    <div class="events-grid">

      ${items.map((event) => renderEventCard(event, currentProfile, savedSet)).join("")}

    </div>

  </section>

  `;

}



function buildWhere({ city, category, now }) {

  const where = {

    OR: [

      { startAt: null },

      { startAt: { gte: now } },

    ],

  };



  if (city) where.city = { contains: city, mode: "insensitive" };

  if (category) where.category = { contains: category, mode: "insensitive" };



  return where;

}



router.get("/events/feed", async (req, res) => {

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



    const ranked = sortRanked(rawItems);

    const slice = ranked.slice(skip, skip + limit);



    let savedSet = new Set();

    if (currentProfile && slice.length) {

      const saved = await prisma.savedEvent.findMany({

        where: {

          profileId: currentProfile.id,

          eventId: { in: slice.map((x) => x.id) },

        },

        select: { eventId: true },

      });

      savedSet = new Set(saved.map((x) => x.eventId));

    }



    const items = slice.map((event) => ({

      ...event,

      category: normalizeCategory(event),

      description: getShortDescription(event),

      urgencyBadge: getUrgencyBadge(event),

      isSaved: savedSet.has(event.id),

    }));



    return res.json({

      ok: true,

      items,

      page,

      limit,

      total: ranked.length,

      hasMore: skip + items.length < ranked.length,

    });

  } catch (e) {

    console.error(e);

    return res.status(500).json({ ok: false, error: "Events feed error" });

  }

});



router.get("/events", async (req, res) => {

  try {

    await seedEventsIfEmpty();



    const currentProfile = req.currentProfile || null;

    const profileCity = String(currentProfile?.city || "").trim();

    const city = String(req.query.city || profileCity || "").trim();

    const category = String(req.query.category || "").trim();

    const adminKey = String(req.query.key || "").trim();

    const hasAdminKey = !!adminKey;

    const now = new Date();



    const where = buildWhere({ city, category, now });



    const rawEvents = await prisma.eventFinderItem.findMany({

      where,

      orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],

      take: MAIN_QUERY_LIMIT,

    });



    const events = sortRanked(rawEvents);



    let savedSet = new Set();



    if (currentProfile && events.length) {

      const ids = events.map((e) => e.id);



      const saved = await prisma.savedEvent.findMany({

        where: { profileId: currentProfile.id, eventId: { in: ids } },

        select: { eventId: true },

      });



      savedSet = new Set(saved.map((x) => x.eventId));

    }



    const tonightMin = startOfDay(now);

    const tonightMax = endOfDay(now);



    const weekMin = startOfDay(now);

    const weekMax = new Date(now.getTime() + 6 * 86400000);

    weekMax.setHours(23, 59, 59, 999);



    const mainFeedInitial = events.slice(0, FEED_PAGE_SIZE);

    const mainFeedTotal = events.length;

    const mainFeedHasMore = mainFeedTotal > FEED_PAGE_SIZE;



    const featured = events.slice(0, 6);

    const tonight = sortRanked(events.filter((e) => isBetween(e.startAt, tonightMin, tonightMax))).slice(0, 8);

    const week = sortRanked(events.filter((e) => isBetween(e.startAt, weekMin, weekMax))).slice(0, 12);



    const sports = sortRanked(events.filter((e) => eventMatchesCategoryGroup(e, "sports"))).slice(0, 10);

    const concerts = sortRanked(events.filter((e) => eventMatchesCategoryGroup(e, "concerts"))).slice(0, 10);

    const nightlife = sortRanked(events.filter((e) => eventMatchesCategoryGroup(e, "nightlife"))).slice(0, 10);

    const conventions = sortRanked(events.filter((e) => eventMatchesCategoryGroup(e, "conventions"))).slice(0, 10);



    const citySections = TOP_CITY_ORDER.map((cityName) => {

      const cityEvents = sortRanked(

        events.filter((e) => String(e.city || "").toLowerCase() === cityName.toLowerCase())

      );



      return {

        cityName,

        initialItems: cityEvents.slice(0, FEED_PAGE_SIZE),

        total: cityEvents.length,

        hasMore: cityEvents.length > FEED_PAGE_SIZE,

      };

    }).filter((section) => section.total > 0);



    const body = `

    <div class="wrap events-wrap">

      <section class="events-hero">

        <div class="events-hero-glow"></div>

        <div class="events-hero-glow-b"></div>



        <div class="row-between events-hero-top">

          <div>

            <div class="events-kicker">Tapzy Discovery</div>

            <h1 class="events-main-title">Event Finder</h1>

            <div class="muted events-hero-copy">

              Premium discovery for sports, concerts, nightlife, and conventions across Canada’s biggest cities.

            </div>

            ${

              city

                ? `<div class="muted" style="margin-top:10px;">Showing events for: <b>${escapeHtml(city)}</b></div>`

                : ""

            }

            ${

              req.query.synced

                ? `<div class="success" style="margin-top:14px;">Real events synced: ${escapeHtml(req.query.synced)}</div>`

                : ""

            }

          </div>



          <div class="row desktop-only">

            ${

              currentProfile

                ? `<a class="btn btnDark" href="/events/saved">My Saved Events</a>`

                : `<a class="btn btnDark" href="/auth">Sign in</a>`

            }

            ${

              hasAdminKey

                ? `

                  <form method="POST" action="/events/admin/sync?key=${encodeURIComponent(adminKey)}" style="margin:0;">

                    <button class="btn btnLuxury" type="submit">Refresh Feed</button>

                  </form>

                `

                : ""

            }

          </div>

        </div>



        <div class="events-filter-wrap">

          <form method="GET" action="/events" class="events-filter-grid">

            ${

              hasAdminKey

                ? `<input type="hidden" name="key" value="${escapeHtml(adminKey)}" />`

                : ""

            }

            <input name="city" value="${escapeHtml(city)}" placeholder="City" />

            <input name="category" value="${escapeHtml(category)}" placeholder="Category" />

            <button class="btn btnDark" type="submit">Apply Filters</button>

          </form>

        </div>

      </section>



      <section class="reel-wrap mobile-only">

        <div class="reel-feed" id="reelFeed">

          ${mainFeedInitial.map((event) => renderReelItem(event, currentProfile, savedSet)).join("")}

          <div id="reelSentinel" class="reel-sentinel"></div>

        </div>



        <div id="reelLoader" class="events-load-state" style="display:${mainFeedHasMore ? "block" : "none"};">

          Loading more events...

        </div>



        <div id="reelEnd" class="events-load-state" style="display:${mainFeedHasMore ? "none" : "block"};">

          No more events

        </div>

      </section>



      <section class="events-section desktop-only">

        <div class="row-between" style="margin-bottom:14px;">

          <h2 class="events-section-title">Live Event Feed</h2>

          <div class="muted">${mainFeedTotal} total</div>

        </div>



        <div id="mainFeedGrid" class="events-grid">

          ${mainFeedInitial.map((event) => renderEventCard(event, currentProfile, savedSet)).join("")}

        </div>



        <div id="mainFeedLoader" class="events-load-state" style="display:${mainFeedHasMore ? "block" : "none"};">

          <div class="skeleton-grid">

            ${Array.from({ length: 2 }).map(() => `

              <div class="event-card skeleton-card">

                <div class="skeleton-shimmer"></div>

              </div>

            `).join("")}

          </div>

        </div>



        <div id="mainFeedEnd" class="events-load-state" style="display:${mainFeedHasMore ? "none" : "block"};">

          No more events

        </div>



        <div id="mainFeedSentinel" style="height:1px;"></div>

      </section>



      ${renderSection("Featured Events", featured, currentProfile, savedSet)}

      ${renderSection("Tonight", tonight, currentProfile, savedSet)}

      ${renderSection("This Week", week, currentProfile, savedSet)}

      ${renderSection("Sports", sports, currentProfile, savedSet)}

      ${renderSection("Concerts", concerts, currentProfile, savedSet)}

      ${renderSection("Nightlife", nightlife, currentProfile, savedSet)}

      ${renderSection("Conventions", conventions, currentProfile, savedSet)}



      ${citySections.map((section) => `

        <section class="events-section desktop-only">

          <div class="row-between" style="margin-bottom:14px;">

            <h2 class="events-section-title">${escapeHtml(section.cityName)} Events</h2>

            <div class="muted">${section.total} total</div>

          </div>



          <div id="cityGrid-${escapeHtml(section.cityName)}" class="events-grid">

            ${section.initialItems.map((event) => renderEventCard(event, currentProfile, savedSet)).join("")}

          </div>



          <div id="cityLoader-${escapeHtml(section.cityName)}" class="events-load-state" style="display:${section.hasMore ? "block" : "none"};">

            <div class="skeleton-grid">

              ${Array.from({ length: 2 }).map(() => `

                <div class="event-card skeleton-card">

                  <div class="skeleton-shimmer"></div>

                </div>

              `).join("")}

            </div>

          </div>



          <div id="cityEnd-${escapeHtml(section.cityName)}" class="events-load-state" style="display:${section.hasMore ? "none" : "block"};">

            No more ${escapeHtml(section.cityName)} events

          </div>



          <div id="citySentinel-${escapeHtml(section.cityName)}" style="height:1px;"></div>

        </section>

      `).join("")}

    </div>



    <style>

      .events-wrap{ max-width:1160px; }

      .mobile-only{ display:none; }

      .desktop-only{ display:block; }



      .events-hero{

        position:relative;

        overflow:hidden;

        border-radius:34px;

        border:1px solid rgba(255,255,255,.08);

        background:

          radial-gradient(980px 420px at 50% -8%, rgba(97,164,255,.10), transparent 46%),

          radial-gradient(440px 240px at 8% 14%, rgba(26,56,120,.14), transparent 58%),

          linear-gradient(180deg, rgba(8,10,18,.98), rgba(3,4,8,1));

        padding:30px;

        box-shadow:

          0 32px 90px rgba(0,0,0,.44),

          inset 0 1px 0 rgba(255,255,255,.04);

      }



      .events-hero-glow,

      .events-hero-glow-b{

        position:absolute;

        border-radius:999px;

        filter:blur(16px);

        pointer-events:none;

      }



      .events-hero-glow{

        width:360px;

        height:360px;

        right:-40px;

        top:-80px;

        background:radial-gradient(circle, rgba(111,210,255,.18) 0%, rgba(111,210,255,.05) 42%, transparent 72%);

      }



      .events-hero-glow-b{

        width:260px;

        height:260px;

        left:-40px;

        bottom:-60px;

        background:radial-gradient(circle, rgba(87,144,255,.12) 0%, rgba(87,144,255,.04) 42%, transparent 72%);

      }



      .events-hero-top{ position:relative; z-index:2; }

      .events-kicker{

        color:#95a5bf;

        text-transform:uppercase;

        letter-spacing:4px;

        font-size:12px;

      }



      .events-main-title{

        margin:12px 0 0 0;

        font-size:56px;

        line-height:1;

        letter-spacing:-1.6px;

      }



      .events-hero-copy{

        margin-top:12px;

        max-width:640px;

        line-height:1.75;

      }



      .events-filter-wrap{

        position:relative;

        z-index:2;

        margin-top:22px;

      }



      .events-filter-grid{

        display:grid;

        grid-template-columns:1fr 1fr auto;

        gap:12px;

      }



      .events-section{ margin-top:28px; }

      .events-section-title{ margin:0; letter-spacing:-.5px; }



      .events-grid,

      .skeleton-grid{

        display:grid;

        grid-template-columns:repeat(2, minmax(0, 1fr));

        gap:20px;

      }



      .event-card{

        position:relative;

        min-height:450px;

        overflow:hidden;

        border-radius:32px;

        border:1px solid rgba(255,255,255,.08);

        background:#0c0f16;

        box-shadow:

          0 20px 48px rgba(0,0,0,.34),

          inset 0 1px 0 rgba(255,255,255,.04);

        transform:translateY(0) scale(1);

        transition:

          transform .35s cubic-bezier(.2,.8,.2,1),

          box-shadow .35s ease,

          border-color .35s ease,

          opacity .45s ease;

        will-change:transform;

      }



      .event-card::after{

        content:"";

        position:absolute;

        inset:0;

        background:

          radial-gradient(circle at var(--mx,50%) var(--my,50%),

          rgba(127,210,255,.18), transparent 40%);

        opacity:0;

        transition:opacity .25s ease;

        z-index:2;

        pointer-events:none;

      }



      .event-card:hover,

      .event-card.is-touch-active{

        transform:translateY(-8px) scale(1.02);

        box-shadow:

          0 30px 80px rgba(0,0,0,.55),

          0 0 0 1px rgba(127,210,255,.25);

        border-color:rgba(127,210,255,.35);

      }



      .event-card:hover::after,

      .event-card.is-touch-active::after{ opacity:1; }



      .event-card.is-revealed{

        animation:eventReveal .5s ease both;

      }



      @keyframes eventReveal{

        from{

          opacity:.01;

          transform:translateY(18px) scale(.985);

        }

        to{

          opacity:1;

          transform:translateY(0) scale(1);

        }

      }



      .event-card-noise{

        position:absolute;

        inset:0;

        opacity:.045;

        background-image:radial-gradient(rgba(255,255,255,.9) .6px, transparent .6px);

        background-size:8px 8px;

        z-index:1;

        pointer-events:none;

      }



      .event-card-glow{

        position:absolute;

        width:220px;

        height:220px;

        right:-60px;

        top:-30px;

        border-radius:999px;

        background:radial-gradient(circle, rgba(86,156,255,.18), transparent 68%);

        filter:blur(16px);

        z-index:1;

        pointer-events:none;

      }



      .event-card-edge{

        position:absolute;

        inset:0;

        border-radius:32px;

        box-shadow:inset 0 1px 0 rgba(255,255,255,.06);

        z-index:2;

        pointer-events:none;

      }



      .event-media{

        position:absolute;

        inset:0;

        background-size:cover;

        background-position:center;

        transform:scale(1.015);

        transition:transform 1.2s ease;

      }



      .event-card:hover .event-media,

      .event-card.is-touch-active .event-media{

        transform:scale(1.08);

      }



      .event-content{

        position:relative;

        z-index:3;

        min-height:450px;

        display:flex;

        flex-direction:column;

        justify-content:flex-end;

        padding:26px;

        backdrop-filter:blur(5px);

      }



      .event-topline,

      .reel-top{

        display:flex;

        justify-content:space-between;

        gap:10px;

        align-items:center;

        margin-bottom:14px;

      }



      .event-pill-stack{

        display:flex;

        gap:8px;

        flex-wrap:wrap;

      }



      .event-pill{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:30px;

        padding:0 12px;

        border-radius:999px;

        font-size:10px;

        font-weight:900;

        letter-spacing:.9px;

        text-transform:uppercase;

        color:#eef7ff;

        background:rgba(10,18,34,.58);

        border:1px solid rgba(156,214,255,.22);

        backdrop-filter:blur(10px);

      }



      .event-pill-soft{

        color:#d8e6f5;

        background:rgba(255,255,255,.08);

        border-color:rgba(255,255,255,.12);

      }



      .event-pill-urgency{

        background:rgba(111,210,255,.12);

        border-color:rgba(111,210,255,.32);

      }



      .event-title{

        margin:0;

        font-size:31px;

        line-height:1.06;

        letter-spacing:-.9px;

      }



      .event-copy{

        margin-top:12px;

        line-height:1.7;

        font-size:14px;

        max-width:92%;

        display:-webkit-box;

        -webkit-line-clamp:2;

        -webkit-box-orient:vertical;

        overflow:hidden;

      }



      .event-divider{

        width:100%;

        height:1px;

        margin-top:16px;

        background:linear-gradient(90deg, rgba(255,255,255,.16), rgba(255,255,255,.04), transparent);

      }



      .event-meta{

        display:grid;

        gap:10px;

        margin-top:16px;

      }



      .event-meta-row{

        display:flex;

        flex-direction:column;

        gap:3px;

      }



      .event-meta-label{

        font-size:10px;

        text-transform:uppercase;

        letter-spacing:1px;

        color:#9eb1c9;

      }



      .event-meta-value{

        font-size:14px;

        color:#f3f8ff;

      }



      .event-actions-primary{

        display:grid;

        grid-template-columns:1fr 1fr;

        gap:10px;

        margin-top:20px;

      }



      .event-actions-secondary{

        display:flex;

        justify-content:flex-start;

        margin-top:10px;

      }



      .btnLuxury{

        background:linear-gradient(180deg, #fbfdff, #dceeff);

        color:#0a0f17;

        border:1px solid rgba(255,255,255,.7);

        box-shadow:

          0 14px 28px rgba(0,0,0,.22),

          inset 0 1px 0 rgba(255,255,255,.7);

      }



      .btnGhost{

        background:rgba(255,255,255,.07);

        color:#fff;

        border:1px solid rgba(255,255,255,.12);

        box-shadow:none;

        backdrop-filter:blur(8px);

      }



      .events-load-state{

        color:#95a5bf;

        padding:24px 0 10px;

      }



      .skeleton-card{

        min-height:450px;

        background:linear-gradient(180deg, rgba(12,15,22,.98), rgba(8,9,14,1));

        overflow:hidden;

      }



      .skeleton-shimmer{

        position:absolute;

        inset:0;

        background:

          linear-gradient(

            90deg,

            rgba(255,255,255,.03) 20%,

            rgba(255,255,255,.08) 50%,

            rgba(255,255,255,.03) 80%

          );

        background-size:200% 100%;

        animation:shimmer 1.4s linear infinite;

      }



      @keyframes shimmer{

        0%{ background-position:200% 0; }

        100%{ background-position:-200% 0; }

      }



      .reel-wrap{ margin-top:18px; }



      .reel-feed{

        height:100dvh;

        overflow-y:auto;

        scroll-snap-type:y mandatory;

        border-radius:28px;

        -webkit-overflow-scrolling:touch;

      }



      .reel-item{

        position:relative;

        min-height:100dvh;

        scroll-snap-align:start;

        overflow:hidden;

        transform:scale(.985);

        transition:transform .35s ease, opacity .35s ease;

      }



      .reel-item.is-active{ transform:scale(1); }



      .reel-bg{

        position:absolute;

        inset:0;

        background-size:cover;

        background-position:center;

        transform:scale(1.03);

        transition:transform 1.1s ease;

      }



      .reel-item.is-active .reel-bg{ transform:scale(1.08); }



      .reel-noise{

        position:absolute;

        inset:0;

        opacity:.04;

        background-image:radial-gradient(rgba(255,255,255,.9) .6px, transparent .6px);

        background-size:8px 8px;

        z-index:1;

      }



      .reel-glow{

        position:absolute;

        width:260px;

        height:260px;

        right:-60px;

        top:10%;

        border-radius:999px;

        background:radial-gradient(circle, rgba(86,156,255,.20), transparent 68%);

        filter:blur(18px);

        z-index:1;

      }



      .reel-content{

        position:relative;

        z-index:2;

        min-height:100dvh;

        display:flex;

        flex-direction:column;

        justify-content:space-between;

        padding:18px 16px calc(env(safe-area-inset-bottom) + 20px);

      }



      .reel-body{ margin-top:auto; }



      .reel-title{

        margin:0;

        font-size:34px;

        line-height:1;

        letter-spacing:-1px;

      }



      .reel-sub{

        margin-top:12px;

        line-height:1.72;

        font-size:15px;

        max-width:95%;

        color:#e3ecf7;

      }



      .reel-meta{

        display:grid;

        gap:6px;

        margin-top:14px;

        color:#eaf2fb;

        font-size:14px;

      }



      .reel-actions{

        display:grid;

        grid-template-columns:1fr 1fr;

        gap:10px;

        margin-top:18px;

      }



      .reel-sentinel{ height:1px; }



      .js-save-btn.is-animating{

        animation:savePulse .28s ease;

      }



      @keyframes savePulse{

        0%{ transform:scale(1); }

        50%{ transform:scale(1.08); }

        100%{ transform:scale(1); }

      }



      @media(max-width:900px){

        .events-main-title{ font-size:44px; }

        .events-grid,

        .skeleton-grid{

          grid-template-columns:1fr;

        }

      }



      @media(max-width:700px){

        .mobile-only{ display:block; }

        .desktop-only{ display:none; }



        .events-wrap{ max-width:none; }



        .events-hero{

          padding:20px;

          border-radius:26px;

        }



        .events-main-title{ font-size:38px; }

        .reel-title{ font-size:30px; }

        .reel-actions{ grid-template-columns:1fr; }

      }

    </style>



    <script>

      (function () {

        const FEED_PAGE_SIZE = ${JSON.stringify(FEED_PAGE_SIZE)};

        const category = ${JSON.stringify(category)};

        const cities = ${JSON.stringify(citySections.map((s) => s.cityName))};

        const HAS_CURRENT_PROFILE = ${JSON.stringify(!!currentProfile)};



        function escapeUnsafe(value) {

          return String(value || "")

            .replace(/&/g, "&amp;")

            .replace(/</g, "&lt;")

            .replace(/>/g, "&gt;")

            .replace(/"/g, "&quot;")

            .replace(/'/g, "&#39;");

        }



        function getClientCategory(event) {

          const raw = String(event.category || "").trim();

          const value = raw.toLowerCase();



          if (!raw || value === "undefined" || value === "miscellaneous" || value === "other") {

            const haystack = String(

              [event.title || "", event.description || "", event.venueName || ""].join(" ")

            ).toLowerCase();



            if (haystack.includes("concert") || haystack.includes("music") || haystack.includes("festival")) return "Concerts";

            if (haystack.includes("sports") || haystack.includes("hockey") || haystack.includes("basketball") || haystack.includes("football") || haystack.includes("soccer") || haystack.includes("baseball") || haystack.includes("mma") || haystack.includes("ufc") || haystack.includes("game")) return "Sports";

            if (haystack.includes("nightlife") || haystack.includes("party") || haystack.includes("club") || haystack.includes("dj") || haystack.includes("rave")) return "Nightlife";

            if (haystack.includes("convention") || haystack.includes("expo") || haystack.includes("comic con") || haystack.includes("fan expo") || haystack.includes("conference")) return "Conventions";

            return "Event";

          }



          return raw;

        }



        function getClientDescription(event) {

          const text = String(event.description || "").replace(/\\s+/g, " ").trim();

          if (!text) return "Premium event discovery inside Tapzy Network™.";

          if (text.length <= 120) return text;

          return text.slice(0, 117).trim() + "...";

        }



        function getClientBadge(event) {

          if (!event || !event.startAt) return "Trending";

          const diffHours = (new Date(event.startAt).getTime() - Date.now()) / 3600000;

          if (diffHours >= 0 && diffHours <= 18) return "Tonight";

          if (diffHours > 18 && diffHours <= 72) return "Hot";

          if (diffHours > 72 && diffHours <= 168) return "This Week";

          return "Trending";

        }



        function pickFallbackImage(event) {

          const categoryText = getClientCategory(event).toLowerCase();



          if (

            categoryText.includes("nightlife") ||

            categoryText.includes("party") ||

            categoryText.includes("club") ||

            categoryText.includes("dj")

          ) {

            return "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1400&q=80";

          }



          if (

            categoryText.includes("concert") ||

            categoryText.includes("music") ||

            categoryText.includes("festival")

          ) {

            return "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1400&q=80";

          }



          if (

            categoryText.includes("sport") ||

            categoryText.includes("hockey") ||

            categoryText.includes("basketball") ||

            categoryText.includes("football") ||

            categoryText.includes("soccer") ||

            categoryText.includes("baseball") ||

            categoryText.includes("mma") ||

            categoryText.includes("ufc")

          ) {

            return "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1400&q=80";

          }



          if (

            categoryText.includes("convention") ||

            categoryText.includes("expo") ||

            categoryText.includes("comic") ||

            categoryText.includes("fan")

          ) {

            return "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1400&q=80";

          }



          return "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1400&q=80";

        }



        function formatClientDate(value) {

          if (!value) return "Date coming soon";

          const d = new Date(value);

          if (Number.isNaN(d.getTime())) return "Date coming soon";

          return d.toLocaleString();

        }



        function renderClientSave(event) {

          if (!HAS_CURRENT_PROFILE) {

            return '<a class="btn btnGhost" href="/auth">Sign in to save</a>';

          }



          const label = event.isSaved ? "Saved ✓" : "Save";

          return \`

            <form method="POST" action="/events/\${escapeUnsafe(event.id)}/save" class="js-save-form" style="margin:0;">

              <button class="btn btnGhost js-save-btn" type="submit">\${label}</button>

            </form>

          \`;

        }



        function renderClientCard(event) {

          const image = event.imageUrl || pickFallbackImage(event);

          const when = formatClientDate(event.startAt);

          const categoryText = getClientCategory(event);

          const shortDescription = getClientDescription(event);

          const badge = event.urgencyBadge || getClientBadge(event);



          return \`

            <div class="event-card js-event-card">

              <div class="event-media" style="background-image:

                linear-gradient(180deg, rgba(6,8,14,.06), rgba(6,8,14,.18) 22%, rgba(3,5,10,.62) 60%, rgba(0,0,0,.94)),

                url('\${escapeUnsafe(image)}');"></div>



              <div class="event-card-noise"></div>

              <div class="event-card-glow"></div>

              <div class="event-card-edge"></div>



              <div class="event-content">

                <div class="event-topline">

                  <div class="event-pill-stack">

                    <span class="event-pill">\${escapeUnsafe(categoryText || "Event")}</span>

                    <span class="event-pill event-pill-urgency">\${escapeUnsafe(badge)}</span>

                  </div>

                  \${event.priceText ? \`<span class="event-pill event-pill-soft">\${escapeUnsafe(event.priceText)}</span>\` : ""}

                </div>



                <h3 class="event-title">\${escapeUnsafe(event.title || "Untitled Event")}</h3>



                <div class="event-copy muted">

                  \${escapeUnsafe(shortDescription)}

                </div>



                <div class="event-divider"></div>



                <div class="event-meta">

                  <div class="event-meta-row">

                    <span class="event-meta-label">When</span>

                    <span class="event-meta-value">\${escapeUnsafe(when)}</span>

                  </div>

                  <div class="event-meta-row">

                    <span class="event-meta-label">Where</span>

                    <span class="event-meta-value">\${escapeUnsafe(event.venueName || event.address || event.city || "Location coming soon")}</span>

                  </div>

                  \${event.city ? \`

                    <div class="event-meta-row">

                      <span class="event-meta-label">City</span>

                      <span class="event-meta-value">\${escapeUnsafe(event.city)}</span>

                    </div>

                  \` : ""}

                </div>



                <div class="event-actions-primary">

                  <a class="btn btnLuxury" href="/events/view/\${escapeUnsafe(event.id)}">Open Event</a>

                  \${event.ticketUrl ? \`<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="\${escapeUnsafe(event.ticketUrl)}">Tickets</a>\` : ""}

                </div>



                <div class="event-actions-secondary">

                  \${renderClientSave(event)}

                </div>

              </div>

            </div>

          \`;

        }



        function renderClientReel(event) {

          const image = event.imageUrl || pickFallbackImage(event);

          const when = formatClientDate(event.startAt);

          const categoryText = getClientCategory(event);

          const shortDescription = getClientDescription(event);

          const badge = event.urgencyBadge || getClientBadge(event);



          return \`

            <section class="reel-item js-reel-item">

              <div class="reel-bg" style="background-image:

                linear-gradient(180deg, rgba(6,8,14,.12), rgba(6,8,14,.18) 18%, rgba(3,5,10,.50) 48%, rgba(0,0,0,.96)),

                url('\${escapeUnsafe(image)}');"></div>



              <div class="reel-noise"></div>

              <div class="reel-glow"></div>



              <div class="reel-content">

                <div class="reel-top">

                  <div class="event-pill-stack">

                    <span class="event-pill">\${escapeUnsafe(categoryText)}</span>

                    <span class="event-pill event-pill-urgency">\${escapeUnsafe(badge)}</span>

                  </div>

                  \${event.priceText ? \`<span class="event-pill event-pill-soft">\${escapeUnsafe(event.priceText)}</span>\` : ""}

                </div>



                <div class="reel-body">

                  <h2 class="reel-title">\${escapeUnsafe(event.title)}</h2>

                  <div class="reel-sub">\${escapeUnsafe(shortDescription)}</div>



                  <div class="reel-meta">

                    <div>\${escapeUnsafe(when)}</div>

                    <div>\${escapeUnsafe(event.venueName || event.city || "Location coming soon")}</div>

                  </div>



                  <div class="reel-actions">

                    <a class="btn btnLuxury" href="/events/view/\${escapeUnsafe(event.id)}">Open Event</a>

                    \${event.ticketUrl ? \`<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="\${escapeUnsafe(event.ticketUrl)}">Tickets</a>\` : ""}

                    \${renderClientSave(event)}

                  </div>

                </div>

              </div>

            </section>

          \`;

        }



        function bindCardMotion(scope) {

          const root = scope || document;

          const cards = root.querySelectorAll(".js-event-card");



          cards.forEach((card) => {

            if (card.dataset.motionBound === "1") return;

            card.dataset.motionBound = "1";



            card.addEventListener("mousemove", (e) => {

              const rect = card.getBoundingClientRect();

              const x = ((e.clientX - rect.left) / rect.width) * 100;

              const y = ((e.clientY - rect.top) / rect.height) * 100;

              card.style.setProperty("--mx", x + "%");

              card.style.setProperty("--my", y + "%");

            });



            card.addEventListener("touchstart", () => {

              card.classList.add("is-touch-active");

            }, { passive: true });



            card.addEventListener("touchend", () => {

              setTimeout(() => card.classList.remove("is-touch-active"), 120);

            }, { passive: true });



            card.addEventListener("touchcancel", () => {

              card.classList.remove("is-touch-active");

            }, { passive: true });

          });

        }



        function bindCardReveal(scope) {

          const root = scope || document;

          const cards = root.querySelectorAll(".js-event-card");



          const observer = new IntersectionObserver((entries) => {

            entries.forEach((entry) => {

              if (entry.isIntersecting) {

                entry.target.classList.add("is-revealed");

                observer.unobserve(entry.target);

              }

            });

          }, { threshold: 0.12 });



          cards.forEach((card) => {

            if (card.dataset.revealBound === "1") return;

            card.dataset.revealBound = "1";

            observer.observe(card);

          });

        }



        function bindSaveAnimation(scope) {

          const root = scope || document;

          const forms = root.querySelectorAll(".js-save-form");



          forms.forEach((form) => {

            if (form.dataset.saveBound === "1") return;

            form.dataset.saveBound = "1";



            form.addEventListener("submit", (e) => {

              const btn = form.querySelector(".js-save-btn");

              if (!btn || form.dataset.submitting === "1") return;

              form.dataset.submitting = "1";

              e.preventDefault();

              btn.classList.add("is-animating");

              setTimeout(() => form.submit(), 180);

            });

          });

        }



        function setupReelActiveState() {

          const feed = document.getElementById("reelFeed");

          if (!feed || feed.dataset.activeBound === "1") return;

          feed.dataset.activeBound = "1";



          function refreshActive() {

            const all = Array.from(feed.querySelectorAll(".js-reel-item"));

            let best = null;

            let bestDelta = Infinity;



            all.forEach((item) => {

              const rect = item.getBoundingClientRect();

              const center = rect.top + rect.height / 2;

              const delta = Math.abs(center - window.innerHeight / 2);



              if (delta < bestDelta) {

                bestDelta = delta;

                best = item;

              }

            });



            all.forEach((item) => item.classList.remove("is-active"));

            if (best) best.classList.add("is-active");

          }



          feed.addEventListener("scroll", () => {

            requestAnimationFrame(refreshActive);

          }, { passive: true });



          refreshActive();

          feed.refreshActive = refreshActive;

        }



        function enhance(scope) {

          bindCardMotion(scope);

          bindCardReveal(scope);

          bindSaveAnimation(scope);

        }



        function setupMainFeedInfinite() {

          const grid = document.getElementById("mainFeedGrid");

          const sentinel = document.getElementById("mainFeedSentinel");

          const loader = document.getElementById("mainFeedLoader");

          const end = document.getElementById("mainFeedEnd");



          if (!grid || !sentinel || !loader || !end) return;



          let page = 2;

          let loading = false;

          let hasMore = loader.style.display !== "none";



          async function loadMore() {

            if (loading || !hasMore) return;

            loading = true;

            loader.style.display = "block";



            try {

              const qs = new URLSearchParams({

                page: String(page),

                limit: String(FEED_PAGE_SIZE),

                city: "",

                category,

              });



              const res = await fetch("/events/feed?" + qs.toString(), {

                cache: "no-store",

              });



              const data = await res.json();



              if (!res.ok || !data.ok) throw new Error(data.error || "Could not load more events");



              const items = Array.isArray(data.items) ? data.items : [];

              if (!items.length) {

                hasMore = false;

                loader.style.display = "none";

                end.style.display = "block";

                return;

              }



              const wrapper = document.createElement("div");

              wrapper.innerHTML = items.map(renderClientCard).join("");

              Array.from(wrapper.children).forEach((node) => grid.appendChild(node));

              enhance(wrapper);



              page += 1;

              hasMore = !!data.hasMore;



              if (!hasMore) {

                loader.style.display = "none";

                end.style.display = "block";

              }

            } catch (err) {

              console.error(err);

              loader.innerHTML = "Could not load more events";

              hasMore = false;

              end.style.display = "none";

            } finally {

              loading = false;

            }

          }



          const observer = new IntersectionObserver((entries) => {

            const first = entries[0];

            if (first && first.isIntersecting) loadMore();

          }, { rootMargin: "300px 0px" });



          observer.observe(sentinel);

        }



        function setupCityInfinite(cityName) {

          const grid = document.getElementById("cityGrid-" + cityName);

          const sentinel = document.getElementById("citySentinel-" + cityName);

          const loader = document.getElementById("cityLoader-" + cityName);

          const end = document.getElementById("cityEnd-" + cityName);



          if (!grid || !sentinel || !loader || !end) return;



          let page = 2;

          let loading = false;

          let hasMore = loader.style.display !== "none";



          async function loadMore() {

            if (loading || !hasMore) return;

            loading = true;

            loader.style.display = "block";



            try {

              const qs = new URLSearchParams({

                page: String(page),

                limit: String(FEED_PAGE_SIZE),

                city: cityName,

                category,

              });



              const res = await fetch("/events/feed?" + qs.toString(), {

                cache: "no-store",

              });



              const data = await res.json();



              if (!res.ok || !data.ok) throw new Error(data.error || "Could not load more events");



              const items = Array.isArray(data.items) ? data.items : [];

              if (!items.length) {

                hasMore = false;

                loader.style.display = "none";

                end.style.display = "block";

                return;

              }



              const wrapper = document.createElement("div");

              wrapper.innerHTML = items.map(renderClientCard).join("");

              Array.from(wrapper.children).forEach((node) => grid.appendChild(node));

              enhance(wrapper);



              page += 1;

              hasMore = !!data.hasMore;



              if (!hasMore) {

                loader.style.display = "none";

                end.style.display = "block";

              }

            } catch (err) {

              console.error(err);

              loader.innerHTML = "Could not load more events";

              hasMore = false;

              end.style.display = "none";

            } finally {

              loading = false;

            }

          }



          const observer = new IntersectionObserver((entries) => {

            const first = entries[0];

            if (first && first.isIntersecting) loadMore();

          }, { rootMargin: "300px 0px" });



          observer.observe(sentinel);

        }



        function setupReelInfinite() {

          const feed = document.getElementById("reelFeed");

          const sentinel = document.getElementById("reelSentinel");

          const loader = document.getElementById("reelLoader");

          const end = document.getElementById("reelEnd");



          if (!feed || !sentinel || !loader || !end) return;



          let page = 2;

          let loading = false;

          let hasMore = loader.style.display !== "none";



          async function loadMore() {

            if (loading || !hasMore) return;

            loading = true;

            loader.style.display = "block";



            try {

              const qs = new URLSearchParams({

                page: String(page),

                limit: String(FEED_PAGE_SIZE),

                city: "",

                category,

              });



              const res = await fetch("/events/feed?" + qs.toString(), {

                cache: "no-store",

              });



              const data = await res.json();



              if (!res.ok || !data.ok) throw new Error(data.error || "Could not load more events");



              const items = Array.isArray(data.items) ? data.items : [];

              if (!items.length) {

                hasMore = false;

                loader.style.display = "none";

                end.style.display = "block";

                return;

              }



              const html = items.map(renderClientReel).join("");

              sentinel.insertAdjacentHTML("beforebegin", html);

              bindSaveAnimation(feed);



              if (typeof feed.refreshActive === "function") {

                requestAnimationFrame(feed.refreshActive);

              }



              page += 1;

              hasMore = !!data.hasMore;



              if (!hasMore) {

                loader.style.display = "none";

                end.style.display = "block";

              }

            } catch (err) {

              console.error(err);

              loader.innerHTML = "Could not load more events";

              hasMore = false;

              end.style.display = "none";

            } finally {

              loading = false;

            }

          }



          const observer = new IntersectionObserver((entries) => {

            const first = entries[0];

            if (first && first.isIntersecting) loadMore();

          }, { rootMargin: "600px 0px" });



          observer.observe(sentinel);

        }



        enhance(document);

        setupMainFeedInfinite();

        cities.forEach(setupCityInfinite);

        setupReelActiveState();

        setupReelInfinite();

      })();

    </script>



    ${renderTapzyAssistant({

      username: currentProfile?.username || "User",

      pageType: "events",

    })}

    `;



    res.send(

      renderShell("Event Finder", body, "", {

        currentProfile,

        pageTitle: "Events",

        pageType: "events",

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("Events page error");

  }

});



router.get("/events/view/:id", async (req, res) => {

  try {

    const currentProfile = req.currentProfile || null;

    const eventId = String(req.params.id || "").trim();



    if (!eventId) return res.status(404).send("Event not found");



    const event = await prisma.eventFinderItem.findUnique({

      where: { id: eventId },

    });



    if (!event) return res.status(404).send("Event not found");



    const saved = currentProfile

      ? await prisma.savedEvent.findUnique({

          where: {

            profileId_eventId: {

              profileId: currentProfile.id,

              eventId: event.id,

            },

          },

        })

      : null;



    const image = pickImage(event);

    const label = normalizeCategory(event);

    const shortDescription = getShortDescription(event);

    const when = event.startAt ? formatPrettyLocal(event.startAt) : "Date coming soon";

    const badge = getUrgencyBadge(event);

    const fullDescription =

      String(event.description || "").trim() || "Premium event discovery inside Tapzy Network™.";



    const body = `

    <div class="wrap" style="max-width:1100px;">

      <section class="tz-event-detail-hero">

        <div class="tz-event-detail-bg" style="background-image:

          linear-gradient(180deg, rgba(6,8,14,.12), rgba(6,8,14,.24) 22%, rgba(3,5,10,.72) 60%, rgba(0,0,0,.96)),

          url('${escapeHtml(image)}');"></div>



        <div class="tz-event-detail-noise"></div>

        <div class="tz-event-detail-glow"></div>



        <div class="tz-event-detail-content">

          <div class="tz-event-detail-topline">

            <div class="tz-pill-stack">

              <span class="tz-event-pill">${escapeHtml(label || "Event")}</span>

              <span class="tz-event-pill tz-event-pill-urgency">${escapeHtml(badge)}</span>

            </div>

            ${event.priceText ? `<span class="tz-event-pill tz-event-pill-soft">${escapeHtml(event.priceText)}</span>` : ""}

          </div>



          <h1 class="tz-event-detail-title">${escapeHtml(event.title || "Untitled Event")}</h1>



          <div class="tz-event-detail-subtitle">

            ${escapeHtml(shortDescription)}

          </div>



          <div class="tz-event-detail-meta">

            <div class="tz-event-detail-meta-card">

              <div class="tz-event-detail-meta-label">When</div>

              <div class="tz-event-detail-meta-value">${escapeHtml(when)}</div>

            </div>



            <div class="tz-event-detail-meta-card">

              <div class="tz-event-detail-meta-label">Where</div>

              <div class="tz-event-detail-meta-value">${escapeHtml(event.venueName || event.address || event.city || "Location coming soon")}</div>

            </div>



            ${

              event.city

                ? `

                  <div class="tz-event-detail-meta-card">

                    <div class="tz-event-detail-meta-label">City</div>

                    <div class="tz-event-detail-meta-value">${escapeHtml(event.city)}</div>

                  </div>

                `

                : ""

            }

          </div>



          <div class="tz-event-detail-actions">

            <a class="btn btnLuxury" href="/events">Back to Events</a>

            ${

              event.ticketUrl

                ? `<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.ticketUrl)}">Tickets</a>`

                : ""

            }

            ${

              event.eventUrl

                ? `<a class="btn btnGhost" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.eventUrl)}">Source Event</a>`

                : ""

            }

            ${

              currentProfile

                ? `

                  <form method="POST" action="/events/${event.id}/save" class="js-save-form" style="margin:0;">

                    <button class="btn btnGhost js-save-btn" type="submit">${saved ? "Saved ✓" : "Save"}</button>

                  </form>

                `

                : `<a class="btn btnGhost" href="/auth">Sign in to save</a>`

            }

          </div>

        </div>

      </section>



      <section class="tz-event-detail-section">

        <div class="tz-event-detail-grid">

          <div class="tz-event-detail-panel">

            <div class="tz-event-section-kicker">Event Overview</div>

            <h2 class="tz-event-section-title">Inside the experience</h2>

            <div class="tz-event-detail-copy">

              ${escapeHtml(fullDescription)}

            </div>

          </div>



          <div class="tz-event-detail-panel">

            <div class="tz-event-section-kicker">Event Details</div>

            <h2 class="tz-event-section-title">Key information</h2>



            <div class="tz-event-detail-list">

              <div class="tz-event-detail-list-row">

                <span>Category</span>

                <strong>${escapeHtml(label || "Event")}</strong>

              </div>

              <div class="tz-event-detail-list-row">

                <span>Urgency</span>

                <strong>${escapeHtml(badge)}</strong>

              </div>

              <div class="tz-event-detail-list-row">

                <span>Venue</span>

                <strong>${escapeHtml(event.venueName || "Venue coming soon")}</strong>

              </div>

              <div class="tz-event-detail-list-row">

                <span>Address</span>

                <strong>${escapeHtml(event.address || event.city || "Location coming soon")}</strong>

              </div>

              <div class="tz-event-detail-list-row">

                <span>Price</span>

                <strong>${escapeHtml(event.priceText || "See source")}</strong>

              </div>

              <div class="tz-event-detail-list-row">

                <span>Source</span>

                <strong>${escapeHtml(String(event.source || "Tapzy"))}</strong>

              </div>

            </div>

          </div>

        </div>

      </section>

    </div>



    <style>

      .tz-event-detail-hero{

        position:relative;

        overflow:hidden;

        border-radius:36px;

        min-height:640px;

        border:1px solid rgba(255,255,255,.08);

        background:#090b10;

        box-shadow:

          0 34px 90px rgba(0,0,0,.46),

          inset 0 1px 0 rgba(255,255,255,.04);

      }



      .tz-event-detail-bg{

        position:absolute;

        inset:0;

        background-size:cover;

        background-position:center;

        transform:scale(1.02);

      }



      .tz-event-detail-noise{

        position:absolute;

        inset:0;

        opacity:.045;

        background-image:radial-gradient(rgba(255,255,255,.9) .6px, transparent .6px);

        background-size:8px 8px;

        z-index:1;

      }



      .tz-event-detail-glow{

        position:absolute;

        width:300px;

        height:300px;

        right:-70px;

        top:-50px;

        border-radius:999px;

        background:radial-gradient(circle, rgba(86,156,255,.20), transparent 68%);

        filter:blur(18px);

        z-index:1;

      }



      .tz-event-detail-content{

        position:relative;

        z-index:2;

        min-height:640px;

        display:flex;

        flex-direction:column;

        justify-content:flex-end;

        padding:34px;

      }



      .tz-event-detail-topline{

        display:flex;

        justify-content:space-between;

        gap:10px;

        align-items:center;

        margin-bottom:14px;

      }



      .tz-pill-stack{

        display:flex;

        gap:8px;

        flex-wrap:wrap;

      }



      .tz-event-pill{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:32px;

        padding:0 14px;

        border-radius:999px;

        font-size:10px;

        font-weight:900;

        letter-spacing:1px;

        text-transform:uppercase;

        color:#eef7ff;

        background:rgba(10,18,34,.58);

        border:1px solid rgba(156,214,255,.22);

        backdrop-filter:blur(10px);

      }



      .tz-event-pill-soft{

        color:#d8e6f5;

        background:rgba(255,255,255,.08);

        border-color:rgba(255,255,255,.12);

      }



      .tz-event-pill-urgency{

        background:rgba(111,210,255,.12);

        border-color:rgba(111,210,255,.32);

      }



      .tz-event-detail-title{

        margin:0;

        font-size:58px;

        line-height:.96;

        letter-spacing:-1.8px;

        max-width:860px;

      }



      .tz-event-detail-subtitle{

        margin-top:16px;

        max-width:760px;

        color:#d9e4f2;

        font-size:17px;

        line-height:1.8;

      }



      .tz-event-detail-meta{

        display:grid;

        grid-template-columns:repeat(3, minmax(0, 1fr));

        gap:14px;

        margin-top:24px;

      }



      .tz-event-detail-meta-card{

        border-radius:22px;

        padding:16px;

        background:rgba(10,14,22,.42);

        border:1px solid rgba(255,255,255,.08);

        backdrop-filter:blur(10px);

      }



      .tz-event-detail-meta-label{

        font-size:10px;

        text-transform:uppercase;

        letter-spacing:1px;

        color:#9eb1c9;

      }



      .tz-event-detail-meta-value{

        margin-top:6px;

        font-size:15px;

        color:#f5f9ff;

        line-height:1.55;

      }



      .tz-event-detail-actions{

        display:flex;

        gap:10px;

        flex-wrap:wrap;

        margin-top:22px;

      }



      .tz-event-detail-section{

        margin-top:24px;

      }



      .tz-event-detail-grid{

        display:grid;

        grid-template-columns:1.2fr .8fr;

        gap:18px;

      }



      .tz-event-detail-panel{

        border-radius:30px;

        padding:26px;

        border:1px solid rgba(255,255,255,.08);

        background:

          radial-gradient(600px 220px at 80% 0%, rgba(90,150,255,.06), transparent 42%),

          linear-gradient(180deg, rgba(12,14,22,.96), rgba(7,8,12,1));

        box-shadow:

          0 20px 40px rgba(0,0,0,.28),

          inset 0 1px 0 rgba(255,255,255,.04);

      }



      .tz-event-section-kicker{

        color:#95a5bf;

        text-transform:uppercase;

        letter-spacing:4px;

        font-size:11px;

      }



      .tz-event-section-title{

        margin:12px 0 0 0;

        font-size:30px;

        letter-spacing:-.8px;

      }



      .tz-event-detail-copy{

        margin-top:14px;

        color:#d9e4f2;

        line-height:1.85;

        font-size:15px;

      }



      .tz-event-detail-list{

        display:grid;

        gap:12px;

        margin-top:16px;

      }



      .tz-event-detail-list-row{

        display:flex;

        justify-content:space-between;

        gap:16px;

        align-items:flex-start;

        padding:14px 0;

        border-bottom:1px solid rgba(255,255,255,.06);

      }



      .tz-event-detail-list-row span{

        color:#95a5bf;

        font-size:13px;

      }



      .tz-event-detail-list-row strong{

        text-align:right;

        color:#f5f9ff;

        font-size:14px;

        line-height:1.5;

      }



      .js-save-btn.is-animating{

        animation:savePulse .28s ease;

      }



      @keyframes savePulse{

        0%{ transform:scale(1); }

        50%{ transform:scale(1.08); }

        100%{ transform:scale(1); }

      }



      @media(max-width:900px){

        .tz-event-detail-title{

          font-size:42px;

        }



        .tz-event-detail-meta{

          grid-template-columns:1fr;

        }



        .tz-event-detail-grid{

          grid-template-columns:1fr;

        }

      }



      @media(max-width:700px){

        .tz-event-detail-hero{

          min-height:560px;

          border-radius:26px;

        }



        .tz-event-detail-content{

          min-height:560px;

          padding:20px;

        }



        .tz-event-detail-title{

          font-size:34px;

        }



        .tz-event-detail-subtitle{

          font-size:15px;

        }



        .tz-event-detail-panel{

          border-radius:22px;

          padding:18px;

        }

      }

    </style>



    <script>

      (function () {

        const forms = document.querySelectorAll(".js-save-form");

        forms.forEach((form) => {

          if (form.dataset.saveBound === "1") return;

          form.dataset.saveBound = "1";



          form.addEventListener("submit", (e) => {

            const btn = form.querySelector(".js-save-btn");

            if (!btn || form.dataset.submitting === "1") return;

            form.dataset.submitting = "1";

            e.preventDefault();

            btn.classList.add("is-animating");

            setTimeout(() => form.submit(), 180);

          });

        });

      })();

    </script>



    ${renderTapzyAssistant({

      username: currentProfile?.username || "User",

      pageType: "events",

    })}

    `;



    res.send(

      renderShell(event.title || "Event", body, "", {

        currentProfile,

        pageTitle: event.title || "Event",

        pageType: "events",

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("Event detail error");

  }

});



router.post("/events/admin/sync", async (req, res) => {

  try {

    if (!requireAdmin(req, res)) return;



    const key = String(req.query.key || "").trim();

    const count = await syncRealEvents();



    return res.redirect(

      backUrl(req, `/events?key=${encodeURIComponent(key)}&synced=${count}`)

    );

  } catch (e) {

    console.error(e);

    return res.status(500).send("Real event sync error");

  }

});



router.post("/events/:id/save", async (req, res) => {

  try {

    const currentProfile = req.currentProfile;

    if (!currentProfile) return res.redirect("/auth");



    const eventId = String(req.params.id || "").trim();



    await prisma.savedEvent.upsert({

      where: {

        profileId_eventId: {

          profileId: currentProfile.id,

          eventId,

        },

      },

      update: {},

      create: {

        profileId: currentProfile.id,

        eventId,

      },

    });



    res.redirect(backUrl(req, "/events"));

  } catch (e) {

    console.error(e);

    res.status(500).send("Save event error");

  }

});



router.get("/events/saved", async (req, res) => {

  try {

    const currentProfile = req.currentProfile;

    if (!currentProfile) return res.redirect("/auth");



    const rows = await prisma.savedEvent.findMany({

      where: { profileId: currentProfile.id },

      include: { event: true },

      orderBy: { createdAt: "desc" },

      take: 100,

    });



    const body = `

    <div class="wrap" style="max-width:920px;">

      <div class="card">

        <div class="row-between">

          <div>

            <h2 style="margin:0;">Saved Events</h2>

            <div class="muted" style="margin-top:8px;">Events saved to your Tapzy profile.</div>

          </div>

          <a class="btn btnDark" href="/events">Back to Feed</a>

        </div>



        <div class="events-grid" style="margin-top:18px;">

          ${

            rows.length

              ? rows.map((row) => {

                  const event = row.event;

                  const image = pickImage(event);

                  const shortDescription = getShortDescription(event);

                  const label = normalizeCategory(event);

                  const badge = getUrgencyBadge(event);



                  return `

                  <div class="event-card">

                    <div class="event-media" style="background-image:

                      linear-gradient(180deg, rgba(6,8,14,.06), rgba(6,8,14,.18) 22%, rgba(3,5,10,.62) 60%, rgba(0,0,0,.94)),

                      url('${escapeHtml(image)}');"></div>



                    <div class="event-card-noise"></div>

                    <div class="event-card-glow"></div>

                    <div class="event-card-edge"></div>



                    <div class="event-content">

                      <div class="event-topline">

                        <div class="event-pill-stack">

                          <span class="event-pill">${escapeHtml(label || "Event")}</span>

                          <span class="event-pill event-pill-urgency">${escapeHtml(badge)}</span>

                        </div>

                        ${event.priceText ? `<span class="event-pill event-pill-soft">${escapeHtml(event.priceText)}</span>` : ""}

                      </div>



                      <h3 class="event-title">${escapeHtml(event.title)}</h3>

                      <div class="event-copy muted">${escapeHtml(shortDescription)}</div>



                      <div class="event-divider"></div>



                      <div class="event-meta">

                        <div class="event-meta-row">

                          <span class="event-meta-label">When</span>

                          <span class="event-meta-value">${event.startAt ? escapeHtml(formatPrettyLocal(event.startAt)) : "Date coming soon"}</span>

                        </div>

                        <div class="event-meta-row">

                          <span class="event-meta-label">Where</span>

                          <span class="event-meta-value">${escapeHtml(event.venueName || event.city || event.address || "Location coming soon")}</span>

                        </div>

                      </div>

                    </div>

                  </div>

                  `;

                }).join("")

              : `<div class="panel">No saved events yet.</div>`

          }

        </div>

      </div>

    </div>



    <style>

      .events-grid{

        display:grid;

        grid-template-columns:repeat(2, minmax(0, 1fr));

        gap:16px;

      }



      .event-card{

        position:relative;

        min-height:360px;

        overflow:hidden;

        border-radius:24px;

        border:1px solid rgba(255,255,255,.08);

        background:#0d0f14;

      }



      .event-card-noise{

        position:absolute;

        inset:0;

        opacity:.045;

        background-image:radial-gradient(rgba(255,255,255,.9) .6px, transparent .6px);

        background-size:8px 8px;

        z-index:1;

      }



      .event-card-glow{

        position:absolute;

        width:220px;

        height:220px;

        right:-60px;

        top:-30px;

        border-radius:999px;

        background:radial-gradient(circle, rgba(86,156,255,.18), transparent 68%);

        filter:blur(16px);

        z-index:1;

      }



      .event-card-edge{

        position:absolute;

        inset:0;

        border-radius:24px;

        box-shadow:inset 0 1px 0 rgba(255,255,255,.06);

        z-index:2;

      }



      .event-media{

        position:absolute;

        inset:0;

        background-size:cover;

        background-position:center;

      }



      .event-content{

        position:relative;

        z-index:3;

        min-height:360px;

        display:flex;

        flex-direction:column;

        justify-content:flex-end;

        padding:20px;

      }



      .event-topline{

        display:flex;

        justify-content:space-between;

        gap:10px;

        align-items:center;

        margin-bottom:14px;

      }



      .event-pill-stack{

        display:flex;

        gap:8px;

        flex-wrap:wrap;

      }



      .event-pill{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:30px;

        padding:0 12px;

        border-radius:999px;

        font-size:10px;

        font-weight:900;

        letter-spacing:.9px;

        text-transform:uppercase;

        color:#eef7ff;

        background:rgba(10,18,34,.58);

        border:1px solid rgba(156,214,255,.22);

      }



      .event-pill-soft{

        color:#d8e6f5;

        background:rgba(255,255,255,.08);

        border-color:rgba(255,255,255,.12);

      }



      .event-pill-urgency{

        background:rgba(111,210,255,.12);

        border-color:rgba(111,210,255,.32);

      }



      .event-title{

        margin:0;

        font-size:26px;

      }



      .event-copy{

        margin-top:10px;

        line-height:1.65;

        display:-webkit-box;

        -webkit-line-clamp:2;

        -webkit-box-orient:vertical;

        overflow:hidden;

      }



      .event-divider{

        width:100%;

        height:1px;

        margin-top:16px;

        background:linear-gradient(90deg, rgba(255,255,255,.16), rgba(255,255,255,.04), transparent);

      }



      .event-meta{

        display:grid;

        gap:8px;

        margin-top:14px;

      }



      .event-meta-row{

        display:flex;

        flex-direction:column;

        gap:3px;

      }



      .event-meta-label{

        font-size:10px;

        text-transform:uppercase;

        letter-spacing:1px;

        color:#9eb1c9;

      }



      .event-meta-value{

        font-size:14px;

      }



      @media(max-width:800px){

        .events-grid{

          grid-template-columns:1fr;

        }

      }

    </style>



    ${renderTapzyAssistant({

      username: currentProfile.username || "User",

      pageType: "events",

    })}

    `;



    res.send(

      renderShell("Saved Events", body, "", {

        currentProfile,

        pageTitle: "Saved Events",

        pageType: "events",

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("Saved events error");

  }

});



module.exports = router;