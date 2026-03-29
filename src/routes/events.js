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

function renderFeedCard(event, currentProfile, savedSet, interestedSet, index, total, adminKey, city, category) {
  const when = event.startAt ? formatPrettyLocal(event.startAt) : "Date coming soon";
  const image = pickImage(event);

  const quickTags = [];
  const cat = String(event.category || "").toLowerCase();

  if (cat.includes("nightlife")) quickTags.push("Night Out");
  if (cat.includes("music")) quickTags.push("Live Music");
  if (cat.includes("food")) quickTags.push("Food");
  if (cat.includes("cars")) quickTags.push("Cars");
  if (
    cat.includes("network") ||
    cat.includes("business") ||
    cat.includes("tech") ||
    cat.includes("startup") ||
    cat.includes("creator")
  ) {
    quickTags.push("Networking");
  }

  if (isBetween(event.startAt, startOfDay(new Date()), endOfDay(new Date()))) {
    quickTags.unshift("Tonight");
  }

  const topBadge = quickTags[0] || "Featured";
  const progressCurrent = index + 1;
  const progressTotal = total || 1;

  const query = [];
  if (city) query.push(`city=${encodeURIComponent(city)}`);
  if (category) query.push(`category=${encodeURIComponent(category)}`);
  if (adminKey) query.push(`key=${encodeURIComponent(adminKey)}`);
  const filterQuery = query.length ? `?${query.join("&")}` : "";

  return `
  <section class="event-slide">
    <div
      class="event-slide-bg"
      style="background-image:
        linear-gradient(180deg, rgba(3,6,10,.08) 0%, rgba(3,6,10,.28) 24%, rgba(3,6,10,.76) 62%, rgba(3,6,10,.96) 100%),
        linear-gradient(90deg, rgba(0,0,0,.32) 0%, rgba(0,0,0,.08) 42%, rgba(0,0,0,.38) 100%),
        url('${escapeHtml(image)}');"
    ></div>

    <div class="event-slide-shell">
      <div class="event-overlay-top">
        <div class="event-top-left">
          <div class="event-feed-brand">Tapzy Discovery</div>
          <div class="event-feed-sub">
            ${city ? `Showing ${escapeHtml(city)}` : "Nearby events"}
            ${category ? ` • ${escapeHtml(category)}` : ""}
          </div>
        </div>

        <div class="event-top-right">
          <div class="event-counter">${progressCurrent} / ${progressTotal}</div>
          ${
            currentProfile
              ? `<a class="btn btnDark" href="/events/saved">Saved</a>`
              : `<a class="btn btnDark" href="/auth">Sign in</a>`
          }
        </div>
      </div>

      <div class="event-side-actions">
        ${
          currentProfile
            ? `
              <form method="POST" action="/events/${event.id}/save" style="margin:0;">
                <button class="feed-action-btn" type="submit" aria-label="Save event">
                  <span class="feed-action-icon">${savedSet.has(event.id) ? "✓" : "♡"}</span>
                  <span class="feed-action-label">${savedSet.has(event.id) ? "Saved" : "Save"}</span>
                </button>
              </form>

              <form method="POST" action="/events/${event.id}/interest" style="margin:0;">
                <button class="feed-action-btn" type="submit" aria-label="Interested">
                  <span class="feed-action-icon">${interestedSet.has(event.id) ? "★" : "☆"}</span>
                  <span class="feed-action-label">${interestedSet.has(event.id) ? "Interested" : "Interest"}</span>
                </button>
              </form>
            `
            : `
              <a class="feed-action-btn" href="/auth" aria-label="Sign in">
                <span class="feed-action-icon">↗</span>
                <span class="feed-action-label">Sign in</span>
              </a>
            `
        }

        ${
          event.eventUrl
            ? `
              <a class="feed-action-btn" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.eventUrl)}" aria-label="Open event">
                <span class="feed-action-icon">↗</span>
                <span class="feed-action-label">Open</span>
              </a>
            `
            : ""
        }

        ${
          event.ticketUrl
            ? `
              <a class="feed-action-btn" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.ticketUrl)}" aria-label="Tickets">
                <span class="feed-action-icon">🎟</span>
                <span class="feed-action-label">Tickets</span>
              </a>
            `
            : ""
        }
      </div>

      <div class="event-slide-content">
        <div class="event-chip-row">
          <span class="pill">${escapeHtml(topBadge)}</span>
          <span class="pill">${escapeHtml(event.category || "Event")}</span>
          ${event.priceText ? `<span class="pill">${escapeHtml(event.priceText)}</span>` : ""}
          ${event.city ? `<span class="pill">${escapeHtml(event.city)}</span>` : ""}
        </div>

        <h1 class="event-slide-title">${escapeHtml(event.title)}</h1>

        <div class="event-slide-copy">
          ${escapeHtml(event.description || "Premium event discovery inside Tapzy.")}
        </div>

        <div class="event-slide-meta">
          <div><b>When:</b> ${escapeHtml(when)}</div>
          <div><b>Where:</b> ${escapeHtml(event.venueName || event.address || event.city || "Location coming soon")}</div>
          ${event.city ? `<div><b>City:</b> ${escapeHtml(event.city)}</div>` : ""}
        </div>

        <div class="event-bottom-actions">
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

          ${
            event.eventUrl
              ? `<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.eventUrl)}">Open Event</a>`
              : ""
          }

          ${
            event.ticketUrl
              ? `<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.ticketUrl)}">Tickets</a>`
              : ""
          }
        </div>

        <div class="event-scroll-tip">Swipe or scroll for next event</div>
      </div>

      <div class="event-filter-drawer">
        <form method="GET" action="/events" class="event-filter-form">
          ${adminKey ? `<input type="hidden" name="key" value="${escapeHtml(adminKey)}" />` : ""}
          <input name="city" value="${escapeHtml(city)}" placeholder="City" />
          <input name="category" value="${escapeHtml(category)}" placeholder="Category" />
          <button class="btn btnDark" type="submit">Apply</button>
          ${
            city || category
              ? `<a class="btn btnDark" href="/events${adminKey ? `?key=${encodeURIComponent(adminKey)}` : ""}">Clear</a>`
              : ""
          }
        </form>

        ${
          adminKey
            ? `
              <form method="POST" action="/events/admin/sync?key=${encodeURIComponent(adminKey)}" style="margin:0;">
                <button class="btn" type="submit">Refresh Feed</button>
              </form>
            `
            : ""
        }

        ${
          filterQuery
            ? `<a class="btn btnDark" href="/events${filterQuery}">Reload View</a>`
            : ""
        }
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
    const nightlife = events
      .filter((e) => String(e.category || "").toLowerCase().includes("nightlife"))
      .slice(0, 10);
    const networking = events
      .filter((e) => {
        const c = String(e.category || "").toLowerCase();
        return (
          c.includes("network") ||
          c.includes("business") ||
          c.includes("startup") ||
          c.includes("tech") ||
          c.includes("creator")
        );
      })
      .slice(0, 10);

    const priorityIds = [];
    const seen = new Set();

    for (const item of [...tonight, ...featured, ...week, ...nightlife, ...networking, ...events]) {
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      priorityIds.push(item.id);
    }

    const feedEvents = priorityIds
      .map((id) => events.find((e) => e.id === id))
      .filter(Boolean);

    const body = `
    <div class="events-feed-wrap">
      ${
        req.query.synced
          ? `
            <div class="events-sync-toast">
              Real events synced: ${escapeHtml(req.query.synced)}
            </div>
          `
          : ""
      }

      ${
        feedEvents.length
          ? feedEvents
              .map((event, index) =>
                renderFeedCard(
                  event,
                  currentProfile,
                  savedSet,
                  interestedSet,
                  index,
                  feedEvents.length,
                  adminKey,
                  city,
                  category
                )
              )
              .join("")
          : `
            <section class="event-slide">
              <div class="event-slide-bg" style="background:
                linear-gradient(180deg, rgba(10,12,18,.98), rgba(6,6,8,1)),
                radial-gradient(850px 360px at 50% -5%, rgba(127,210,255,.10), transparent 48%);"></div>

              <div class="event-slide-shell">
                <div class="event-slide-content" style="max-width:700px;">
                  <div class="event-chip-row">
                    <span class="pill">Tapzy Discovery</span>
                  </div>
                  <h1 class="event-slide-title">No upcoming events found</h1>
                  <div class="event-slide-copy">
                    Try changing your city or category filters to load more events.
                  </div>
                  <div class="event-filter-drawer" style="margin-top:20px;">
                    <form method="GET" action="/events" class="event-filter-form">
                      ${hasAdminKey ? `<input type="hidden" name="key" value="${escapeHtml(adminKey)}" />` : ""}
                      <input name="city" value="${escapeHtml(city)}" placeholder="City" />
                      <input name="category" value="${escapeHtml(category)}" placeholder="Category" />
                      <button class="btn btnDark" type="submit">Apply</button>
                    </form>
                  </div>
                </div>
              </div>
            </section>
          `
      }
    </div>

    <style>
      html, body {
        background:#05070b;
      }

      .wrap{
        max-width:none !important;
        width:100%;
        padding:0 !important;
      }

      .events-feed-wrap{
        position:relative;
        width:100%;
        min-height:100vh;
        background:#05070b;
        overflow-y:auto;
        scroll-snap-type:y mandatory;
        -webkit-overflow-scrolling:touch;
      }

      .events-feed-wrap::-webkit-scrollbar{
        width:0;
        height:0;
      }

      .events-sync-toast{
        position:fixed;
        top:18px;
        left:50%;
        transform:translateX(-50%);
        z-index:90;
        padding:10px 14px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.12);
        background:rgba(8,10,14,.78);
        backdrop-filter:blur(12px);
        color:#dff3ff;
        box-shadow:0 14px 40px rgba(0,0,0,.35);
      }

      .event-slide{
        position:relative;
        min-height:100svh;
        height:100svh;
        scroll-snap-align:start;
        scroll-snap-stop:always;
        overflow:hidden;
        background:#05070b;
      }

      .event-slide-bg{
        position:absolute;
        inset:0;
        background-size:cover;
        background-position:center;
        transform:scale(1.03);
      }

      .event-slide-shell{
        position:relative;
        z-index:2;
        min-height:100svh;
        height:100svh;
        display:flex;
        flex-direction:column;
        justify-content:space-between;
        padding:20px 22px calc(24px + env(safe-area-inset-bottom));
      }

      .event-overlay-top{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:14px;
      }

      .event-top-left{
        max-width:70%;
      }

      .event-feed-brand{
        display:inline-flex;
        align-items:center;
        gap:8px;
        padding:9px 12px;
        border-radius:999px;
        background:rgba(7,10,14,.42);
        border:1px solid rgba(255,255,255,.10);
        backdrop-filter:blur(14px);
        color:#ffffff;
        font-size:12px;
        text-transform:uppercase;
        letter-spacing:3px;
      }

      .event-feed-sub{
        margin-top:10px;
        color:rgba(255,255,255,.80);
        font-size:13px;
      }

      .event-top-right{
        display:flex;
        align-items:center;
        gap:10px;
      }

      .event-counter{
        min-width:66px;
        text-align:center;
        padding:9px 12px;
        border-radius:999px;
        background:rgba(7,10,14,.42);
        border:1px solid rgba(255,255,255,.10);
        backdrop-filter:blur(14px);
        color:#ffffff;
        font-size:13px;
      }

      .event-side-actions{
        position:absolute;
        right:16px;
        bottom:110px;
        z-index:4;
        display:flex;
        flex-direction:column;
        gap:12px;
      }

      .feed-action-btn{
        width:74px;
        min-height:74px;
        border-radius:22px;
        border:1px solid rgba(255,255,255,.11);
        background:rgba(7,10,14,.38);
        backdrop-filter:blur(14px);
        color:#fff;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:5px;
        text-decoration:none;
        box-shadow:0 14px 34px rgba(0,0,0,.30);
      }

      .feed-action-btn:hover{
        border-color:rgba(127,210,255,.35);
      }

      .feed-action-icon{
        font-size:24px;
        line-height:1;
      }

      .feed-action-label{
        font-size:11px;
        color:rgba(255,255,255,.86);
      }

      .event-slide-content{
        position:relative;
        z-index:3;
        max-width:760px;
        padding-right:104px;
      }

      .event-chip-row{
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        margin-bottom:14px;
      }

      .event-slide-title{
        margin:0;
        font-size:clamp(34px, 6vw, 68px);
        line-height:.98;
        letter-spacing:-0.03em;
        color:#fff;
        text-shadow:0 10px 32px rgba(0,0,0,.34);
      }

      .event-slide-copy{
        margin-top:16px;
        max-width:640px;
        font-size:16px;
        line-height:1.75;
        color:rgba(255,255,255,.88);
        text-shadow:0 8px 20px rgba(0,0,0,.30);
      }

      .event-slide-meta{
        display:grid;
        gap:8px;
        margin-top:18px;
        color:rgba(255,255,255,.92);
        font-size:14px;
      }

      .event-bottom-actions{
        display:flex;
        flex-wrap:wrap;
        gap:10px;
        margin-top:18px;
      }

      .event-scroll-tip{
        margin-top:18px;
        font-size:12px;
        color:rgba(255,255,255,.68);
        letter-spacing:.08em;
        text-transform:uppercase;
      }

      .event-filter-drawer{
        display:flex;
        flex-wrap:wrap;
        align-items:center;
        gap:10px;
        margin-top:18px;
      }

      .event-filter-form{
        display:grid;
        grid-template-columns:1fr 1fr auto auto;
        gap:10px;
        width:min(760px, 100%);
      }

      .event-filter-form input{
        min-height:48px;
        border-radius:16px;
        background:rgba(7,10,14,.38);
        border:1px solid rgba(255,255,255,.10);
        color:#fff;
        padding:0 14px;
        backdrop-filter:blur(14px);
      }

      .event-filter-form input::placeholder{
        color:rgba(255,255,255,.52);
      }

      .pill{
        background:rgba(7,10,14,.42);
        border:1px solid rgba(255,255,255,.10);
        color:#fff;
        backdrop-filter:blur(12px);
      }

      @media(max-width:900px){
        .event-slide-shell{
          padding:16px 14px calc(18px + env(safe-area-inset-bottom));
        }

        .event-side-actions{
          right:12px;
          bottom:104px;
        }

        .feed-action-btn{
          width:68px;
          min-height:68px;
          border-radius:20px;
        }

        .event-slide-content{
          padding-right:86px;
        }

        .event-filter-form{
          grid-template-columns:1fr;
        }
      }

      @media(max-width:700px){
        .event-overlay-top{
          gap:10px;
        }

        .event-top-left{
          max-width:64%;
        }

        .event-top-right{
          flex-direction:column;
          align-items:flex-end;
        }

        .event-slide-title{
          font-size:40px;
        }

        .event-slide-copy{
          font-size:14px;
          line-height:1.65;
        }

        .event-slide-meta{
          font-size:13px;
        }

        .event-slide-content{
          padding-right:82px;
        }

        .event-side-actions{
          bottom:116px;
        }

        .feed-action-btn{
          width:62px;
          min-height:62px;
        }

        .feed-action-icon{
          font-size:21px;
        }

        .feed-action-label{
          font-size:10px;
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
              ? rows
                  .map((row) => {
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
                  })
                  .join("")
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