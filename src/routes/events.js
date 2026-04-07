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



function pickImage(event) {

  if (event.imageUrl) return event.imageUrl;



  const category = String(event.category || "").toLowerCase();



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

      event.category || "",

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

    [event.category || "", event.title || "", event.description || ""].join(" ")

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



function sortRanked(events) {

  return [...events].sort((a, b) => {

    const diff = rankEvent(b) - rankEvent(a);

    if (diff !== 0) return diff;



    const aTime = a.startAt ? new Date(a.startAt).getTime() : Number.MAX_SAFE_INTEGER;

    const bTime = b.startAt ? new Date(b.startAt).getTime() : Number.MAX_SAFE_INTEGER;

    return aTime - bTime;

  });

}



function renderEventCard(event, currentProfile, savedSet, interestedSet) {

  const when = event.startAt ? formatPrettyLocal(event.startAt) : "Date coming soon";

  const image = pickImage(event);



  return `

  <div class="event-card">

    <div class="event-media" style="background-image:

      linear-gradient(180deg, rgba(6,6,8,.18), rgba(6,6,8,.84)),

      url('${escapeHtml(image)}');"></div>



    <div class="event-content">

      <div class="row event-top-row">

        <span class="pill">${escapeHtml(event.category || "Event")}</span>

        ${event.priceText ? `<span class="pill">${escapeHtml(event.priceText)}</span>` : ""}

      </div>



      <h3 class="event-title">${escapeHtml(event.title)}</h3>



      <div class="muted event-copy">

        ${escapeHtml(event.description || "Premium event discovery inside Tapzy.")}

      </div>



      <div class="event-meta">

        <div><b>When:</b> ${escapeHtml(when)}</div>

        <div><b>Where:</b> ${escapeHtml(event.venueName || event.address || event.city || "Location coming soon")}</div>

        ${event.city ? `<div><b>City:</b> ${escapeHtml(event.city)}</div>` : ""}

      </div>



      <div class="row" style="margin-top:16px;">

        ${

          currentProfile

            ? `

              <form method="POST" action="/events/${event.id}/save" style="margin:0;">

                <button class="btn btnDark" type="submit">${savedSet.has(event.id) ? "Saved ✓" : "Save"}</button>

              </form>

              <form method="POST" action="/events/${event.id}/interest" style="margin:0;">

                <button class="btn" type="submit">${interestedSet.has(event.id) ? "Interested ✓" : "Interested"}</button>

              </form>

            `

            : `<a class="btn" href="/auth">Sign in to save</a>`

        }

        ${event.eventUrl ? `<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.eventUrl)}">Open Event</a>` : ""}

        ${event.ticketUrl ? `<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.ticketUrl)}">Tickets</a>` : ""}

      </div>

    </div>

  </div>

  `;

}



function renderSection(title, items, currentProfile, savedSet, interestedSet) {

  if (!items.length) return "";



  return `

  <section class="events-section">

    <div class="row-between" style="margin-bottom:14px;">

      <h2 style="margin:0;">${escapeHtml(title)}</h2>

      <div class="muted">${items.length} event${items.length === 1 ? "" : "s"}</div>

    </div>



    <div class="events-grid">

      ${items.map((event) => renderEventCard(event, currentProfile, savedSet, interestedSet)).join("")}

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



    const where = buildWhere({ city, category, now });



    const rawItems = await prisma.eventFinderItem.findMany({

      where,

      orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],

      take: MAIN_QUERY_LIMIT,

    });



    const ranked = sortRanked(rawItems);

    const items = ranked.slice(skip, skip + limit);



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

    let interestedSet = new Set();



    if (currentProfile && events.length) {

      const ids = events.map((e) => e.id);



      const saved = await prisma.savedEvent.findMany({

        where: { profileId: currentProfile.id, eventId: { in: ids } },

        select: { eventId: true },

      });



      const interested = await prisma.interestedEvent.findMany({

        where: { profileId: currentProfile.id, eventId: { in: ids } },

        select: { eventId: true },

      });



      savedSet = new Set(saved.map((x) => x.eventId));

      interestedSet = new Set(interested.map((x) => x.eventId));

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

    <div class="wrap" style="max-width:1150px;">

      <section class="events-hero">

        <div class="events-hero-glow"></div>



        <div class="row-between" style="position:relative;z-index:2;">

          <div>

            <div class="events-kicker">Tapzy Discovery</div>

            <h1 class="events-main-title">Event Finder</h1>

            <div class="muted" style="margin-top:10px;max-width:620px;line-height:1.7;">

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



          <div class="row">

            ${

              currentProfile

                ? `<a class="btn btnDark" href="/events/saved">My Saved Events</a>`

                : `<a class="btn btnDark" href="/auth">Sign in</a>`

            }

            ${

              hasAdminKey

                ? `

                  <form method="POST" action="/events/admin/sync?key=${encodeURIComponent(adminKey)}" style="margin:0;">

                    <button class="btn" type="submit">Refresh Feed</button>

                  </form>

                `

                : ""

            }

          </div>

        </div>



        <div style="position:relative;z-index:2;margin-top:18px;display:grid;gap:12px;">

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



      <section class="events-section">

        <div class="row-between" style="margin-bottom:14px;">

          <h2 style="margin:0;">Live Event Feed</h2>

          <div class="muted">${mainFeedTotal} total</div>

        </div>



        <div id="mainFeedGrid" class="events-grid">

          ${mainFeedInitial.map((event) => renderEventCard(event, currentProfile, savedSet, interestedSet)).join("")}

        </div>



        <div id="mainFeedLoader" class="events-load-state" style="display:${mainFeedHasMore ? "block" : "none"};">

          Loading more events...

        </div>



        <div id="mainFeedEnd" class="events-load-state" style="display:${mainFeedHasMore ? "none" : "block"};">

          No more events

        </div>



        <div id="mainFeedSentinel" style="height:1px;"></div>

      </section>



      ${renderSection("Featured Events", featured, currentProfile, savedSet, interestedSet)}

      ${renderSection("Tonight", tonight, currentProfile, savedSet, interestedSet)}

      ${renderSection("This Week", week, currentProfile, savedSet, interestedSet)}

      ${renderSection("Sports", sports, currentProfile, savedSet, interestedSet)}

      ${renderSection("Concerts", concerts, currentProfile, savedSet, interestedSet)}

      ${renderSection("Nightlife", nightlife, currentProfile, savedSet, interestedSet)}

      ${renderSection("Conventions", conventions, currentProfile, savedSet, interestedSet)}



      ${citySections.map((section) => `

        <section class="events-section">

          <div class="row-between" style="margin-bottom:14px;">

            <h2 style="margin:0;">${escapeHtml(section.cityName)} Events</h2>

            <div class="muted">${section.total} total</div>

          </div>



          <div id="cityGrid-${escapeHtml(section.cityName)}" class="events-grid">

            ${section.initialItems.map((event) => renderEventCard(event, currentProfile, savedSet, interestedSet)).join("")}

          </div>



          <div id="cityLoader-${escapeHtml(section.cityName)}" class="events-load-state" style="display:${section.hasMore ? "block" : "none"};">

            Loading more ${escapeHtml(section.cityName)} events...

          </div>



          <div id="cityEnd-${escapeHtml(section.cityName)}" class="events-load-state" style="display:${section.hasMore ? "none" : "block"};">

            No more ${escapeHtml(section.cityName)} events

          </div>



          <div id="citySentinel-${escapeHtml(section.cityName)}" style="height:1px;"></div>

        </section>

      `).join("")}



      ${

        !featured.length

          ? `<div class="card">No upcoming events found.</div>`

          : ""

      }

    </div>



    <style>

      .events-hero{

        position:relative;

        overflow:hidden;

        border-radius:30px;

        border:1px solid rgba(255,255,255,.08);

        background:

          radial-gradient(850px 360px at 50% -5%, rgba(127,210,255,.10), transparent 48%),

          linear-gradient(180deg, rgba(10,12,18,.98), rgba(6,6,8,1));

        padding:28px;

        box-shadow:0 24px 70px rgba(0,0,0,.40);

      }



      .events-hero-glow{

        position:absolute;

        width:340px;

        height:340px;

        border-radius:999px;

        background:radial-gradient(circle, rgba(111,210,255,.18) 0%, rgba(111,210,255,.06) 36%, transparent 70%);

        right:-50px;

        top:-70px;

        filter:blur(12px);

      }



      .events-kicker{

        color:#95a5bf;

        text-transform:uppercase;

        letter-spacing:4px;

        font-size:13px;

      }



      .events-main-title{

        margin:10px 0 0 0;

        font-size:54px;

        line-height:1;

      }



      .events-filter-grid{

        display:grid;

        grid-template-columns:1fr 1fr auto;

        gap:12px;

      }



      .events-section{

        margin-top:24px;

      }



      .events-grid{

        display:grid;

        grid-template-columns:repeat(2, minmax(0, 1fr));

        gap:16px;

      }



      .event-card{

        position:relative;

        min-height:420px;

        overflow:hidden;

        border-radius:28px;

        border:1px solid rgba(255,255,255,.08);

        background:#0d0f14;

        box-shadow:0 18px 44px rgba(0,0,0,.28);

      }



      .event-media{

        position:absolute;

        inset:0;

        background-size:cover;

        background-position:center;

      }



      .event-content{

        position:relative;

        z-index:2;

        min-height:420px;

        display:flex;

        flex-direction:column;

        justify-content:flex-end;

        padding:22px;

      }



      .event-top-row{

        justify-content:space-between;

      }



      .event-title{

        margin:14px 0 0 0;

        font-size:28px;

        line-height:1.1;

      }



      .event-copy{

        margin-top:10px;

        line-height:1.65;

      }



      .event-meta{

        display:grid;

        gap:7px;

        margin-top:14px;

        font-size:14px;

      }



      .events-load-state{

        text-align:center;

        color:#95a5bf;

        padding:22px 0 8px;

      }



      @media(max-width:900px){

        .events-main-title{

          font-size:42px;

        }



        .events-grid{

          grid-template-columns:1fr;

        }

      }



      @media(max-width:700px){

        .events-hero{

          padding:18px;

          border-radius:24px;

        }



        .events-main-title{

          font-size:36px;

        }



        .events-filter-grid{

          grid-template-columns:1fr;

        }



        .event-card{

          min-height:380px;

          border-radius:22px;

        }



        .event-content{

          min-height:380px;

          padding:18px;

        }



        .event-title{

          font-size:24px;

        }

      }

    </style>



    <script>

      (function () {

        const FEED_PAGE_SIZE = ${JSON.stringify(FEED_PAGE_SIZE)};

        const category = ${JSON.stringify(category)};

        const cities = ${JSON.stringify(citySections.map((s) => s.cityName))};



        function escapeUnsafe(value) {

          return String(value || "")

            .replace(/&/g, "&amp;")

            .replace(/</g, "&lt;")

            .replace(/>/g, "&gt;")

            .replace(/"/g, "&quot;")

            .replace(/'/g, "&#39;");

        }



        function pickFallbackImage(event) {

          const categoryText = String(event.category || "").toLowerCase();



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



        function renderClientCard(event) {

          const image = event.imageUrl || pickFallbackImage(event);

          const when = formatClientDate(event.startAt);



          return \`

            <div class="event-card">

              <div class="event-media" style="background-image:

                linear-gradient(180deg, rgba(6,6,8,.18), rgba(6,6,8,.84)),

                url('\${escapeUnsafe(image)}');"></div>



              <div class="event-content">

                <div class="row event-top-row">

                  <span class="pill">\${escapeUnsafe(event.category || "Event")}</span>

                  \${event.priceText ? \`<span class="pill">\${escapeUnsafe(event.priceText)}</span>\` : ""}

                </div>



                <h3 class="event-title">\${escapeUnsafe(event.title || "Untitled Event")}</h3>



                <div class="muted event-copy">

                  \${escapeUnsafe(event.description || "Premium event discovery inside Tapzy.")}

                </div>



                <div class="event-meta">

                  <div><b>When:</b> \${escapeUnsafe(when)}</div>

                  <div><b>Where:</b> \${escapeUnsafe(event.venueName || event.address || event.city || "Location coming soon")}</div>

                  \${event.city ? \`<div><b>City:</b> \${escapeUnsafe(event.city)}</div>\` : ""}

                </div>



                <div class="row" style="margin-top:16px;">

                  \${event.eventUrl ? \`<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="\${escapeUnsafe(event.eventUrl)}">Open Event</a>\` : ""}

                  \${event.ticketUrl ? \`<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="\${escapeUnsafe(event.ticketUrl)}">Tickets</a>\` : ""}

                </div>

              </div>

            </div>

          \`;

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



              if (!res.ok || !data.ok) {

                throw new Error(data.error || "Could not load more events");

              }



              const items = Array.isArray(data.items) ? data.items : [];



              if (!items.length) {

                hasMore = false;

                loader.style.display = "none";

                end.style.display = "block";

                return;

              }



              grid.insertAdjacentHTML("beforeend", items.map(renderClientCard).join(""));

              page += 1;

              hasMore = !!data.hasMore;



              if (!hasMore) {

                loader.style.display = "none";

                end.style.display = "block";

              }

            } catch (err) {

              console.error(err);

              loader.textContent = "Could not load more events";

              hasMore = false;

              end.style.display = "none";

            } finally {

              loading = false;

            }

          }



          const observer = new IntersectionObserver(

            (entries) => {

              const first = entries[0];

              if (first && first.isIntersecting) {

                loadMore();

              }

            },

            {

              rootMargin: "300px 0px",

            }

          );



          observer.observe(sentinel);

        }



        function setupCityInfinite(cityName) {

          const safe = cityName;

          const grid = document.getElementById("cityGrid-" + safe);

          const sentinel = document.getElementById("citySentinel-" + safe);

          const loader = document.getElementById("cityLoader-" + safe);

          const end = document.getElementById("cityEnd-" + safe);



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



              if (!res.ok || !data.ok) {

                throw new Error(data.error || "Could not load more events");

              }



              const items = Array.isArray(data.items) ? data.items : [];



              if (!items.length) {

                hasMore = false;

                loader.style.display = "none";

                end.style.display = "block";

                return;

              }



              grid.insertAdjacentHTML("beforeend", items.map(renderClientCard).join(""));

              page += 1;

              hasMore = !!data.hasMore;



              if (!hasMore) {

                loader.style.display = "none";

                end.style.display = "block";

              }

            } catch (err) {

              console.error(err);

              loader.textContent = "Could not load more events";

              hasMore = false;

              end.style.display = "none";

            } finally {

              loading = false;

            }

          }



          const observer = new IntersectionObserver(

            (entries) => {

              const first = entries[0];

              if (first && first.isIntersecting) {

                loadMore();

              }

            },

            {

              rootMargin: "300px 0px",

            }

          );



          observer.observe(sentinel);

        }



        setupMainFeedInfinite();

        cities.forEach(setupCityInfinite);

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



router.post("/events/:id/interest", async (req, res) => {

  try {

    const currentProfile = req.currentProfile;

    if (!currentProfile) return res.redirect("/auth");



    const eventId = String(req.params.id || "").trim();



    await prisma.interestedEvent.upsert({

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

    res.status(500).send("Interest event error");

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

                  return `

                  <div class="event-card">

                    <div class="event-media" style="background-image:

                      linear-gradient(180deg, rgba(6,6,8,.18), rgba(6,6,8,.84)),

                      url('${escapeHtml(image)}');"></div>



                    <div class="event-content">

                      <div class="pill">${escapeHtml(event.category || "Event")}</div>

                      <h3 class="event-title">${escapeHtml(event.title)}</h3>

                      <div class="muted event-copy">${escapeHtml(event.description || "")}</div>

                      <div class="event-meta">

                        <div><b>When:</b> ${event.startAt ? escapeHtml(formatPrettyLocal(event.startAt)) : "Date coming soon"}</div>

                        <div><b>Where:</b> ${escapeHtml(event.venueName || event.city || event.address || "Location coming soon")}</div>

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



      .event-media{

        position:absolute;

        inset:0;

        background-size:cover;

        background-position:center;

      }



      .event-content{

        position:relative;

        z-index:2;

        min-height:360px;

        display:flex;

        flex-direction:column;

        justify-content:flex-end;

        padding:20px;

      }



      .event-title{

        margin:14px 0 0 0;

        font-size:26px;

      }



      .event-copy{

        margin-top:10px;

        line-height:1.6;

      }



      .event-meta{

        display:grid;

        gap:7px;

        margin-top:14px;

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