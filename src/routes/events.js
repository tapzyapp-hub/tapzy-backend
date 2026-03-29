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



function sampleEvents() {

  const now = Date.now();

  const h = 3600000;

  const d = 86400000;



  return [

    {

      source: "tapzy_seed",

      sourceEventId: "seed-net-1",

      title: "Founder Networking Night",

      description: "Meet founders, builders, and startup operators in a premium social setting.",

      imageUrl: "",

      venueName: "Toronto Innovation Hub",

      address: "Toronto, ON",

      city: "Toronto",

      region: "Ontario",

      country: "Canada",

      eventUrl: "",

      ticketUrl: "",

      category: "Networking",

      startAt: new Date(now + d),

      endAt: new Date(now + d + 3 * h),

      latitude: 43.6532,

      longitude: -79.3832,

      priceText: "Free",

      rawPayload: { seeded: true },

    },

    {

      source: "tapzy_seed",

      sourceEventId: "seed-night-1",

      title: "Friday Night Lounge",

      description: "Cocktails, DJ energy, and a polished nightlife atmosphere.",

      imageUrl: "",

      venueName: "Velvet Lounge",

      address: "Toronto, ON",

      city: "Toronto",

      region: "Ontario",

      country: "Canada",

      eventUrl: "",

      ticketUrl: "",

      category: "Nightlife",

      startAt: new Date(now + d + 18 * h),

      endAt: new Date(now + d + 23 * h),

      latitude: 43.6532,

      longitude: -79.3832,

      priceText: "$20",

      rawPayload: { seeded: true },

    },

    {

      source: "tapzy_seed",

      sourceEventId: "seed-night-2",

      title: "Barrie Social Night",

      description: "Music, drinks, and premium local connections.",

      imageUrl: "",

      venueName: "Barrie Social Club",

      address: "Barrie, ON",

      city: "Barrie",

      region: "Ontario",

      country: "Canada",

      eventUrl: "",

      ticketUrl: "",

      category: "Nightlife",

      startAt: new Date(now + 2 * d + 18 * h),

      endAt: new Date(now + 2 * d + 22 * h),

      latitude: 44.3894,

      longitude: -79.6903,

      priceText: "$10",

      rawPayload: { seeded: true },

    },

    {

      source: "tapzy_seed",

      sourceEventId: "seed-tech-1",

      title: "AI Builders Meetup",

      description: "Developers and founders discussing AI tools and startup ideas.",

      imageUrl: "",

      venueName: "Tech Collective",

      address: "Toronto, ON",

      city: "Toronto",

      region: "Ontario",

      country: "Canada",

      eventUrl: "",

      ticketUrl: "",

      category: "Tech",

      startAt: new Date(now + 3 * d),

      endAt: new Date(now + 3 * d + 3 * h),

      latitude: 43.6532,

      longitude: -79.3832,

      priceText: "Free",

      rawPayload: { seeded: true },

    },

    {

      source: "tapzy_seed",

      sourceEventId: "seed-music-1",

      title: "Live Music Night",

      description: "An evening event with local artists and social energy.",

      imageUrl: "",

      venueName: "City Stage",

      address: "Barrie, ON",

      city: "Barrie",

      region: "Ontario",

      country: "Canada",

      eventUrl: "",

      ticketUrl: "",

      category: "Music",

      startAt: new Date(now + 2 * d),

      endAt: new Date(now + 2 * d + 4 * h),

      latitude: 44.3894,

      longitude: -79.6903,

      priceText: "$15",

      rawPayload: { seeded: true },

    },

    {

      source: "tapzy_seed",

      sourceEventId: "seed-food-1",

      title: "Food & Drink Festival",

      description: "Local chefs, food trucks, and premium social atmosphere.",

      imageUrl: "",

      venueName: "Downtown Square",

      address: "Toronto, ON",

      city: "Toronto",

      region: "Ontario",

      country: "Canada",

      eventUrl: "",

      ticketUrl: "",

      category: "Food",

      startAt: new Date(now + 4 * d),

      endAt: new Date(now + 4 * d + 6 * h),

      latitude: 43.6532,

      longitude: -79.3832,

      priceText: "Free",

      rawPayload: { seeded: true },

    },

    {

      source: "tapzy_seed",

      sourceEventId: "seed-cars-1",

      title: "Exotic Car Meet",

      description: "Supercars, enthusiasts, and premium visual culture.",

      imageUrl: "",

      venueName: "Vaughan Auto Plaza",

      address: "Vaughan, ON",

      city: "Vaughan",

      region: "Ontario",

      country: "Canada",

      eventUrl: "",

      ticketUrl: "",

      category: "Cars",

      startAt: new Date(now + 5 * d),

      endAt: new Date(now + 5 * d + 3 * h),

      latitude: 43.8361,

      longitude: -79.4983,

      priceText: "Free",

      rawPayload: { seeded: true },

    },

    {

      source: "tapzy_seed",

      sourceEventId: "seed-creator-1",

      title: "Creator Networking Night",

      description: "Creators, influencers, and brands connecting in person.",

      imageUrl: "",

      venueName: "Creator Studio",

      address: "Toronto, ON",

      city: "Toronto",

      region: "Ontario",

      country: "Canada",

      eventUrl: "",

      ticketUrl: "",

      category: "Creator",

      startAt: new Date(now + 4 * d),

      endAt: new Date(now + 4 * d + 3 * h),

      latitude: 43.6532,

      longitude: -79.3832,

      priceText: "Free",

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



  if (category.includes("nightlife")) {

    return "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1400&q=80";

  }

  if (category.includes("music")) {

    return "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1400&q=80";

  }

  if (

    category.includes("network") ||

    category.includes("business") ||

    category.includes("tech") ||

    category.includes("startup")

  ) {

    return "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1400&q=80";

  }

  if (category.includes("food")) {

    return "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=80";

  }

  if (category.includes("cars")) {

    return "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1400&q=80";

  }

  if (category.includes("fitness")) {

    return "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1400&q=80";

  }



  return "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1400&q=80";

}



function sectionCard(event, currentProfile, savedSet, interestedSet) {

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

      ${items.map((event) => sectionCard(event, currentProfile, savedSet, interestedSet)).join("")}

    </div>

  </section>

  `;

}



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



    const where = {

      OR: [

        { startAt: null },

        { startAt: { gte: now } },

      ],

    };



    if (city) where.city = { contains: city, mode: "insensitive" };

    if (category) where.category = { contains: category, mode: "insensitive" };



    const events = await prisma.eventFinderItem.findMany({

      where,

      orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],

      take: 120,

    });



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



    const featured = events.slice(0, 6);

    const tonight = events.filter((e) => isBetween(e.startAt, tonightMin, tonightMax)).slice(0, 8);

    const week = events.filter((e) => isBetween(e.startAt, weekMin, weekMax)).slice(0, 12);

    const nightlife = events.filter((e) => String(e.category || "").toLowerCase().includes("nightlife")).slice(0, 10);

    const networking = events.filter((e) => {

      const c = String(e.category || "").toLowerCase();

      return c.includes("network") || c.includes("business") || c.includes("startup") || c.includes("tech") || c.includes("creator");

    }).slice(0, 10);



    const body = `

    <div class="wrap" style="max-width:1150px;">

      <section class="events-hero">

        <div class="events-hero-glow"></div>



        <div class="row-between" style="position:relative;z-index:2;">

          <div>

            <div class="events-kicker">Tapzy Discovery</div>

            <h1 class="events-main-title">Event Finder</h1>

            <div class="muted" style="margin-top:10px;max-width:620px;line-height:1.7;">

              Premium discovery for networking, nightlife, music, business, tech, food, creators, and nearby social events.

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



      ${renderSection("Featured Events", featured, currentProfile, savedSet, interestedSet)}

      ${renderSection("Tonight", tonight, currentProfile, savedSet, interestedSet)}

      ${renderSection("This Week", week, currentProfile, savedSet, interestedSet)}

      ${renderSection("Nightlife", nightlife, currentProfile, savedSet, interestedSet)}

      ${renderSection("Networking & Business", networking, currentProfile, savedSet, interestedSet)}



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
