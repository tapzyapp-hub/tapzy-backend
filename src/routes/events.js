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
    category.includes("startup") ||
    category.includes("creator")
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

function eventSlide(event, currentProfile, savedSet, interestedSet, attendingSet, goingCountMap) {
  const image = pickImage(event);
  const when = event.startAt ? formatPrettyLocal(event.startAt) : "Date coming soon";
  const location = event.venueName || event.address || event.city || "Location coming soon";
  const goingCount = goingCountMap.get(event.id) || 0;
  const isSaved = savedSet.has(event.id);
  const isInterested = interestedSet.has(event.id);
  const isGoing = attendingSet.has(event.id);

  return `
  <section class="event-slide" id="event-${escapeHtml(event.id)}">
    <div class="event-slide-media" style="background-image:
      linear-gradient(180deg, rgba(3,5,10,.12), rgba(2,4,8,.42) 32%, rgba(2,4,8,.86) 72%, rgba(0,0,0,.96)),
      url('${escapeHtml(image)}');"></div>

    <div class="event-slide-overlay"></div>

    <div class="event-slide-inner">
      <div class="event-slide-top">
        <div class="event-badge-row">
          <span class="event-badge">${escapeHtml(event.category || "Event")}</span>
          ${event.priceText ? `<span class="event-badge event-badge-dark">${escapeHtml(event.priceText)}</span>` : ""}
        </div>

        <div class="event-slide-city">${escapeHtml(event.city || "Tapzy Discovery")}</div>
      </div>

      <div class="event-slide-bottom">
        <div class="event-slide-copy">
          <h2 class="event-slide-title">${escapeHtml(event.title)}</h2>

          <div class="event-slide-meta">
            <div><b>When</b> ${escapeHtml(when)}</div>
            <div><b>Where</b> ${escapeHtml(location)}</div>
            ${event.city ? `<div><b>City</b> ${escapeHtml(event.city)}</div>` : ""}
          </div>

          <div class="event-slide-desc">
            ${escapeHtml(event.description || "Premium event discovery inside Tapzy.")}
          </div>

          <div class="event-social-line">
            <span>${goingCount} going</span>
            ${isInterested ? `<span>Interested ✓</span>` : ""}
            ${isSaved ? `<span>Saved ✓</span>` : ""}
          </div>
        </div>

        <div class="event-slide-actions">
          ${
            currentProfile
              ? `
              <form method="POST" action="/events/${event.id}/attend" style="margin:0;">
                <button class="event-side-btn ${isGoing ? "event-side-btn-active" : ""}" type="submit">
                  ${isGoing ? "Going ✓" : "Attend"}
                </button>
              </form>

              <form method="POST" action="/events/${event.id}/interest" style="margin:0;">
                <button class="event-side-btn" type="submit">
                  ${isInterested ? "Interested ✓" : "Interested"}
                </button>
              </form>

              <form method="POST" action="/events/${event.id}/save" style="margin:0;">
                <button class="event-side-btn" type="submit">
                  ${isSaved ? "Saved ✓" : "Save"}
                </button>
              </form>
              `
              : `
              <a class="event-side-btn" href="/auth">Sign in</a>
              `
          }

          ${
            event.ticketUrl
              ? `<a class="event-side-btn" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.ticketUrl)}">Tickets</a>`
              : ""
          }

          ${
            event.eventUrl
              ? `<a class="event-side-btn" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.eventUrl)}">Open</a>`
              : ""
          }

          <button class="event-side-btn" type="button" onclick="tapzyShareEvent('${escapeHtml(event.title)}', '${escapeHtml(location)}', '${escapeHtml(when)}', '${escapeHtml(event.eventUrl || "")}')">Share</button>
        </div>
      </div>
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
      OR: [{ startAt: null }, { startAt: { gte: now } }],
    };

    if (city) where.city = { contains: city, mode: "insensitive" };
    if (category) where.category = { contains: category, mode: "insensitive" };

    const events = await prisma.eventFinderItem.findMany({
      where,
      orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
      take: 60,
    });

    const ids = events.map((e) => e.id);

    let savedSet = new Set();
    let interestedSet = new Set();
    let attendingSet = new Set();
    const goingCountMap = new Map();

    if (ids.length) {
      const allGoing = await prisma.eventAttendance.findMany({
        where: {
          eventId: { in: ids },
          status: "going",
        },
        select: { eventId: true, profileId: true },
      });

      for (const row of allGoing) {
        goingCountMap.set(row.eventId, (goingCountMap.get(row.eventId) || 0) + 1);
      }

      if (currentProfile) {
        const saved = await prisma.savedEvent.findMany({
          where: { profileId: currentProfile.id, eventId: { in: ids } },
          select: { eventId: true },
        });

        const interested = await prisma.interestedEvent.findMany({
          where: { profileId: currentProfile.id, eventId: { in: ids } },
          select: { eventId: true },
        });

        const attending = await prisma.eventAttendance.findMany({
          where: {
            profileId: currentProfile.id,
            eventId: { in: ids },
            status: "going",
          },
          select: { eventId: true },
        });

        savedSet = new Set(saved.map((x) => x.eventId));
        interestedSet = new Set(interested.map((x) => x.eventId));
        attendingSet = new Set(attending.map((x) => x.eventId));
      }
    }

    const body = `
    <div class="wrap events-wrap">
      <section class="events-feed-shell">
        <div class="events-topbar">
          <div class="events-topbar-left">
            <div class="events-kicker">Tapzy Discovery</div>
            <h1 class="events-main-title">Events</h1>
            <div class="events-subtitle">
              Swipe-style discovery for nightlife, networking, music, creator, tech, food, and premium social experiences.
            </div>
            ${city ? `<div class="events-chip-line">Showing: <b>${escapeHtml(city)}</b></div>` : ""}
            ${req.query.synced ? `<div class="events-chip-line">Real events synced: <b>${escapeHtml(req.query.synced)}</b></div>` : ""}
          </div>

          <div class="events-topbar-right">
            ${currentProfile ? `<a class="events-top-btn" href="/events/saved">Saved</a>` : `<a class="events-top-btn" href="/auth">Sign in</a>`}
            ${
              hasAdminKey
                ? `
                <form method="POST" action="/events/admin/sync?key=${encodeURIComponent(adminKey)}" style="margin:0;">
                  <button class="events-top-btn events-top-btn-bright" type="submit">Refresh Feed</button>
                </form>
                `
                : ""
            }
          </div>
        </div>

        <form method="GET" action="/events" class="events-filter-bar">
          ${hasAdminKey ? `<input type="hidden" name="key" value="${escapeHtml(adminKey)}" />` : ""}
          <input name="city" value="${escapeHtml(city)}" placeholder="City" />
          <input name="category" value="${escapeHtml(category)}" placeholder="Category" />
          <button type="submit">Apply</button>
        </form>

        ${
          events.length
            ? `
            <div class="events-feed">
              ${events
                .map((event) =>
                  eventSlide(
                    event,
                    currentProfile,
                    savedSet,
                    interestedSet,
                    attendingSet,
                    goingCountMap
                  )
                )
                .join("")}
            </div>
            `
            : `<div class="events-empty-card">No upcoming events found.</div>`
        }
      </section>
    </div>

    <style>
      .events-wrap{
        max-width:1220px;
      }

      .events-feed-shell{
        display:flex;
        flex-direction:column;
        gap:16px;
      }

      .events-topbar{
        position:sticky;
        top:12px;
        z-index:20;
        display:flex;
        justify-content:space-between;
        gap:18px;
        align-items:flex-start;
        flex-wrap:wrap;
        padding:20px 22px;
        border-radius:28px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(700px 240px at 50% -10%, rgba(127,210,255,.10), transparent 48%),
          linear-gradient(180deg, rgba(10,12,18,.96), rgba(6,6,8,.96));
        backdrop-filter:blur(12px);
        box-shadow:0 18px 48px rgba(0,0,0,.35);
      }

      .events-kicker{
        color:#95a5bf;
        text-transform:uppercase;
        letter-spacing:4px;
        font-size:12px;
      }

      .events-main-title{
        margin:8px 0 0 0;
        font-size:44px;
        line-height:1;
      }

      .events-subtitle{
        margin-top:10px;
        max-width:640px;
        color:#b8c5d7;
        line-height:1.65;
        font-size:15px;
      }

      .events-chip-line{
        margin-top:10px;
        color:#dbe8f7;
        font-size:14px;
      }

      .events-topbar-right{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
      }

      .events-top-btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:46px;
        padding:0 18px;
        border-radius:16px;
        text-decoration:none;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(18,21,31,.96), rgba(10,12,18,.98));
        color:#fff;
        font-size:14px;
        font-weight:800;
        box-shadow:0 8px 20px rgba(0,0,0,.20);
      }

      .events-top-btn-bright{
        cursor:pointer;
        background:
          radial-gradient(circle at 50% 0%, rgba(150,230,255,.18), transparent 55%),
          linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));
        border:none;
      }

      .events-filter-bar{
        display:grid;
        grid-template-columns:1fr 1fr auto;
        gap:12px;
        padding:14px;
        border-radius:22px;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(8,10,16,.98), rgba(0,0,0,1));
      }

      .events-filter-bar input,
      .events-filter-bar button{
        min-height:52px;
        border-radius:16px;
        border:1px solid rgba(255,255,255,.08);
        padding:0 16px;
        font-size:15px;
        box-sizing:border-box;
      }

      .events-filter-bar input{
        background:linear-gradient(180deg, rgba(12,15,21,.98), rgba(4,6,10,1));
        color:#fff;
      }

      .events-filter-bar button{
        cursor:pointer;
        color:#fff;
        font-weight:800;
        background:
          radial-gradient(circle at 50% 0%, rgba(150,230,255,.18), transparent 55%),
          linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));
      }

      .events-feed{
        display:grid;
        gap:18px;
        scroll-snap-type:y mandatory;
      }

      .event-slide{
        position:relative;
        min-height:calc(100vh - 150px);
        border-radius:34px;
        overflow:hidden;
        border:1px solid rgba(255,255,255,.08);
        background:#090b12;
        box-shadow:0 22px 56px rgba(0,0,0,.34);
        scroll-snap-align:start;
      }

      .event-slide-media{
        position:absolute;
        inset:0;
        background-size:cover;
        background-position:center;
        transform:scale(1.02);
      }

      .event-slide-overlay{
        position:absolute;
        inset:0;
        background:
          radial-gradient(700px 260px at 70% 10%, rgba(125,214,255,.10), transparent 40%),
          linear-gradient(180deg, rgba(0,0,0,.06), rgba(0,0,0,.16) 28%, rgba(0,0,0,.58) 68%, rgba(0,0,0,.90));
      }

      .event-slide-inner{
        position:relative;
        z-index:2;
        min-height:calc(100vh - 150px);
        display:flex;
        flex-direction:column;
        justify-content:space-between;
        padding:24px;
      }

      .event-slide-top{
        display:flex;
        justify-content:space-between;
        gap:16px;
        align-items:flex-start;
        flex-wrap:wrap;
      }

      .event-badge-row{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
      }

      .event-badge{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:34px;
        padding:0 14px;
        border-radius:999px;
        background:rgba(255,255,255,.12);
        border:1px solid rgba(255,255,255,.12);
        color:#fff;
        font-size:13px;
        font-weight:800;
        backdrop-filter:blur(8px);
      }

      .event-badge-dark{
        background:rgba(5,8,14,.55);
      }

      .event-slide-city{
        color:#e6eff9;
        font-size:14px;
        font-weight:700;
      }

      .event-slide-bottom{
        display:grid;
        grid-template-columns:minmax(0, 1fr) 120px;
        gap:22px;
        align-items:end;
      }

      .event-slide-title{
        margin:0;
        font-size:54px;
        line-height:.96;
        font-weight:900;
        letter-spacing:-1.8px;
        max-width:760px;
      }

      .event-slide-meta{
        display:grid;
        gap:8px;
        margin-top:16px;
        color:#e5eef9;
        font-size:15px;
      }

      .event-slide-meta b{
        display:inline-block;
        min-width:54px;
        color:#9edcff;
      }

      .event-slide-desc{
        margin-top:16px;
        max-width:760px;
        color:#d5deea;
        font-size:16px;
        line-height:1.7;
      }

      .event-social-line{
        display:flex;
        gap:12px;
        flex-wrap:wrap;
        margin-top:18px;
        color:#c7d5e6;
        font-size:14px;
      }

      .event-slide-actions{
        display:flex;
        flex-direction:column;
        gap:10px;
      }

      .event-side-btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:48px;
        width:100%;
        padding:0 14px;
        border:none;
        border-radius:18px;
        text-decoration:none;
        cursor:pointer;
        color:#fff;
        font-size:13px;
        font-weight:800;
        background:
          linear-gradient(180deg, rgba(18,21,31,.94), rgba(8,10,16,.98));
        border:1px solid rgba(255,255,255,.08);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.04),
          0 8px 16px rgba(0,0,0,.18);
        backdrop-filter:blur(10px);
      }

      .event-side-btn-active{
        background:
          radial-gradient(circle at 50% 0%, rgba(150,230,255,.18), transparent 55%),
          linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));
        border:none;
      }

      .events-empty-card{
        padding:28px;
        border-radius:24px;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(8,10,16,.98), rgba(0,0,0,1));
      }

      @media(max-width:900px){
        .event-slide-title{
          font-size:40px;
        }

        .event-slide-bottom{
          grid-template-columns:1fr;
        }

        .event-slide-actions{
          display:grid;
          grid-template-columns:repeat(3, minmax(0, 1fr));
        }
      }

      @media(max-width:700px){
        .events-topbar{
          top:8px;
          border-radius:22px;
          padding:18px;
        }

        .events-main-title{
          font-size:34px;
        }

        .events-filter-bar{
          grid-template-columns:1fr;
        }

        .event-slide{
          min-height:calc(100vh - 120px);
          border-radius:24px;
        }

        .event-slide-inner{
          min-height:calc(100vh - 120px);
          padding:18px;
        }

        .event-slide-title{
          font-size:30px;
          line-height:1.02;
        }

        .event-slide-desc{
          font-size:15px;
        }

        .event-slide-actions{
          grid-template-columns:1fr 1fr;
        }

        .event-side-btn{
          min-height:44px;
          border-radius:16px;
        }
      }
    </style>

    <script>
      function tapzyShareEvent(title, location, whenText, url){
        const text = title + " • " + location + " • " + whenText;
        if (navigator.share) {
          navigator.share({
            title,
            text,
            url: url || window.location.href
          }).catch(function(){});
          return;
        }
        const copyText = (url ? url + "\\n" : "") + text;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(copyText).then(function(){
            alert("Event copied to clipboard");
          }).catch(function(){
            alert(text);
          });
        } else {
          alert(text);
        }
      }
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

router.post("/events/:id/attend", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const eventId = String(req.params.id || "").trim();

    await prisma.eventAttendance.upsert({
      where: {
        profileId_eventId: {
          profileId: currentProfile.id,
          eventId,
        },
      },
      update: {
        status: "going",
      },
      create: {
        profileId: currentProfile.id,
        eventId,
        status: "going",
      },
    });

    res.redirect(backUrl(req, "/events"));
  } catch (e) {
    console.error(e);
    res.status(500).send("Attend event error");
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
    <div class="wrap" style="max-width:980px;">
      <div class="saved-shell">
        <div class="saved-head">
          <div>
            <h2 style="margin:0;">Saved Events</h2>
            <div class="muted" style="margin-top:8px;">Your saved event collection inside Tapzy.</div>
          </div>
          <a class="saved-back-btn" href="/events">Back to Events</a>
        </div>

        <div class="saved-grid">
          ${
            rows.length
              ? rows
                  .map((row) => {
                    const event = row.event;
                    const image = pickImage(event);
                    return `
                    <div class="saved-card">
                      <div class="saved-media" style="background-image:
                        linear-gradient(180deg, rgba(6,6,8,.18), rgba(6,6,8,.84)),
                        url('${escapeHtml(image)}');"></div>

                      <div class="saved-content">
                        <div class="saved-pill">${escapeHtml(event.category || "Event")}</div>
                        <h3 class="saved-title">${escapeHtml(event.title)}</h3>
                        <div class="saved-copy">${escapeHtml(event.description || "")}</div>
                        <div class="saved-meta">
                          <div><b>When:</b> ${event.startAt ? escapeHtml(formatPrettyLocal(event.startAt)) : "Date coming soon"}</div>
                          <div><b>Where:</b> ${escapeHtml(event.venueName || event.city || event.address || "Location coming soon")}</div>
                        </div>
                      </div>
                    </div>
                    `;
                  })
                  .join("")
              : `<div class="saved-empty">No saved events yet.</div>`
          }
        </div>
      </div>
    </div>

    <style>
      .saved-shell{
        border-radius:30px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(850px 360px at 50% -5%, rgba(127,210,255,.08), transparent 48%),
          linear-gradient(180deg, rgba(10,12,18,.98), rgba(6,6,8,1));
        padding:24px;
        box-shadow:0 24px 70px rgba(0,0,0,.40);
      }

      .saved-head{
        display:flex;
        justify-content:space-between;
        gap:16px;
        align-items:flex-start;
        flex-wrap:wrap;
      }

      .saved-back-btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:46px;
        padding:0 18px;
        border-radius:16px;
        text-decoration:none;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(18,21,31,.96), rgba(10,12,18,.98));
        color:#fff;
        font-size:14px;
        font-weight:800;
      }

      .saved-grid{
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:16px;
        margin-top:18px;
      }

      .saved-card{
        position:relative;
        min-height:360px;
        overflow:hidden;
        border-radius:24px;
        border:1px solid rgba(255,255,255,.08);
        background:#0d0f14;
      }

      .saved-media{
        position:absolute;
        inset:0;
        background-size:cover;
        background-position:center;
      }

      .saved-content{
        position:relative;
        z-index:2;
        min-height:360px;
        display:flex;
        flex-direction:column;
        justify-content:flex-end;
        padding:20px;
      }

      .saved-pill{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:max-content;
        min-height:32px;
        padding:0 12px;
        border-radius:999px;
        background:rgba(255,255,255,.12);
        border:1px solid rgba(255,255,255,.12);
        color:#fff;
        font-size:12px;
        font-weight:800;
      }

      .saved-title{
        margin:14px 0 0 0;
        font-size:26px;
      }

      .saved-copy{
        margin-top:10px;
        line-height:1.6;
        color:#e2ebf6;
      }

      .saved-meta{
        display:grid;
        gap:7px;
        margin-top:14px;
        color:#e2ebf6;
      }

      .saved-empty{
        padding:18px;
        border-radius:18px;
        border:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.03);
      }

      @media(max-width:800px){
        .saved-grid{
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
