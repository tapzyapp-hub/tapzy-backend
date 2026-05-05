
const prisma = require("../../prisma");
const { renderShell, renderTapzyAssistant, escapeHtml } = require("../../utils");
const { TOP_CITY_ORDER, MAIN_QUERY_LIMIT, FEED_PAGE_SIZE } = require("../config");
const {
  seedEventsIfEmpty,
  startOfDay,
  endOfDay,
  isBetween,
  eventMatchesCategoryGroup,
  normalizeCategory,
  sortRanked,
  buildWhere,
  filterNearbyEvents,
  getClosestAreaEvents,
  isAllowedHotCategory,
} = require("../helpers/eventServerUtils");
const {
  renderEventCard,
  renderReelItem,
  renderSection,
  renderCitySwitcher,
} = require("../render/renderEventParts");
const renderEventsClientScript = require("../render/renderEventsClientScript");

module.exports = async function getEventsPage(req, res) {


  try {

    await seedEventsIfEmpty(prisma);



    const currentProfile = req.currentProfile || null;

    const liveLat = Number(req.query.lat);
    const liveLng = Number(req.query.lng);
    const hasLiveLocation = Number.isFinite(liveLat) && Number.isFinite(liveLng);
    const radiusKm = Math.max(25, Math.min(250, Number(req.query.radiusKm || 85)));

    const city = "";

    const rawCategory = String(req.query.category || "all").trim().toLowerCase();
    const isHotNearbyMode = rawCategory === "nearby" || rawCategory === "hot-nearby";
    const category = rawCategory === "all" || isHotNearbyMode ? "" : rawCategory;
    const activeCategory = isHotNearbyMode ? "nearby" : (rawCategory === "all" ? "all" : category);

    const adminKey = String(req.query.key || "").trim();

    const { ADMIN_KEY } = require("../../config");
    const hasAdminKey = !!ADMIN_KEY && adminKey === ADMIN_KEY;

    const now = new Date();



    const where = buildWhere({ city, category, now });



    const rawEvents = await prisma.eventFinderItem.findMany({

      where,

      orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],

      take: MAIN_QUERY_LIMIT,

    });



    const allHotEvents = rawEvents.filter(isAllowedHotCategory);

    const localEvents = isHotNearbyMode
      ? filterNearbyEvents(allHotEvents, { lat: liveLat, lng: liveLng, radiusKm })
      : [];

    const closestAreaFallback = isHotNearbyMode && hasLiveLocation && !localEvents.length
      ? getClosestAreaEvents(allHotEvents, { lat: liveLat, lng: liveLng, limit: MAIN_QUERY_LIMIT })
      : { events: [], areaName: '', distanceKm: null };

    let events = isHotNearbyMode
      ? (localEvents.length ? localEvents : closestAreaFallback.events)
      : allHotEvents;
    const usingClosestAreaFallback = isHotNearbyMode && hasLiveLocation && !localEvents.length && events.length > 0;

    if (!isHotNearbyMode && category) {
      const normalizedFilter = String(category).trim().toLowerCase();
      events = events.filter((event) => {
        const normalized = String(normalizeCategory(event) || '').trim().toLowerCase();
        if (normalized === normalizedFilter) return true;
        return eventMatchesCategoryGroup(event, normalizedFilter);
      });
    }



    let goingSet = new Set();
    const goingCounts = new Map();

    if (events.length) {
      const rows = await prisma.eventAttendance.findMany({
        where: { eventId: { in: events.map((e) => e.id) }, status: "going" },
        select: { eventId: true, profileId: true },
      });

      for (const row of rows) {
        goingCounts.set(row.eventId, (goingCounts.get(row.eventId) || 0) + 1);
        if (currentProfile && row.profileId === currentProfile.id) {
          goingSet.add(row.eventId);
        }
      }
    }

    const tonightMin = startOfDay(now);

    const tonightMax = endOfDay(now);



    const weekMin = startOfDay(now);

    const weekMax = new Date(now.getTime() + 6 * 86400000);

    weekMax.setHours(23, 59, 59, 999);



    events = sortRanked(events);

    const mainFeedInitial = events.slice(0, FEED_PAGE_SIZE);

    const mainFeedTotal = events.length;

    const mainFeedHasMore = mainFeedTotal > FEED_PAGE_SIZE;




    const featured = events.slice(0, 6);

    const tonight = sortRanked(events.filter((e) => isBetween(e.startAt, tonightMin, tonightMax))).slice(0, 8);

    const week = sortRanked(events.filter((e) => isBetween(e.startAt, weekMin, weekMax))).slice(0, 12);



    const sports = sortRanked(events.filter((e) => eventMatchesCategoryGroup(e, "sports"))).slice(0, 10);

    const concerts = sortRanked(events.filter((e) => eventMatchesCategoryGroup(e, "concerts"))).slice(0, 10);

    const dances = sortRanked(events.filter((e) => eventMatchesCategoryGroup(e, "dances"))).slice(0, 10);



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

              Live nearby discovery for the hottest sports, dances, and concerts around you.

            </div>

            ${

              hasLiveLocation

                ? usingClosestAreaFallback
                  ? `<div class="muted" style="margin-top:10px;">No hot events were found within <b>${escapeHtml(radiusKm)} km</b>, so Tapzy switched to the closest active area: <b>${escapeHtml(closestAreaFallback.areaName)}</b>.</div>`
                  : `<div class="muted" style="margin-top:10px;">Showing live nearby events within <b>${escapeHtml(radiusKm)} km</b>.</div>`

                : isHotNearbyMode
                  ? `<div class="muted" style="margin-top:10px;"><b>Enable location</b> to show hot events in your area only.</div>`
                  : ``

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



      </section>



      <section class="events-chip-wrap">
        <div class="events-chip-row">
          ${[
            ["nearby", "Hot Nearby", hasLiveLocation ? (localEvents.length || closestAreaFallback.events.length) : ""],
            ["all", "All Events", allHotEvents.length],
            ["sports", "Sports", allHotEvents.filter((e) => eventMatchesCategoryGroup(e, "sports")).length],
            ["dances", "Dances", allHotEvents.filter((e) => eventMatchesCategoryGroup(e, "dances")).length],
            ["concerts", "Concerts", allHotEvents.filter((e) => eventMatchesCategoryGroup(e, "concerts")).length],
          ].map(([value, label, count]) => {
            const qs = new URLSearchParams();
            if (value) qs.set("category", value);
            if (value === "nearby" && hasLiveLocation) {
              qs.set("lat", String(liveLat));
              qs.set("lng", String(liveLng));
              qs.set("radiusKm", String(radiusKm));
            }
            if (hasAdminKey) qs.set("key", adminKey);
            const href = `/events${qs.toString() ? `?${qs.toString()}` : ""}`;
            const isActive = activeCategory === value;
            return `<a class="events-chip${isActive ? " is-active" : ""}" href="${href}">${escapeHtml(label)} <span>${escapeHtml(count)}</span></a>`;
          }).join("")}
        </div>
      </section>
      ${isHotNearbyMode ? `<div id="liveLocationNotice" class="muted" style="margin:8px 0 20px;">${hasLiveLocation ? (usingClosestAreaFallback ? `No local events yet — showing closest active area, ${escapeHtml(closestAreaFallback.areaName)}.` : "Hot Nearby is filtered to your live area.") : "Tap Enable Location to unlock Hot Nearby."}</div>` : `<div id="liveLocationNotice" style="display:none;"></div>`}

      ${isHotNearbyMode && !hasLiveLocation ? `
        <section id="locationPromptCard" class="events-location-prompt">
          <div class="location-prompt-glow"></div>
          <div class="events-kicker">Live Location Required</div>
          <h2>Find what is hot around you</h2>
          <p class="muted">Tapzy uses your live location to show nearby sports, dances, and concerts. If nothing is close enough, we automatically switch to the closest area with events.</p>
          <button id="enableLocationBtn" class="btn btnLuxury" type="button" onclick="window.requestTapzyLocation && window.requestTapzyLocation(event)">Enable Location</button>
          <div id="locationPromptStatus" class="muted location-prompt-status">Your exact location is only used to build this event feed.</div>
        </section>
      ` : ""}

      <section class="events-section mobile-only">
        <div id="mobileFeedGrid" class="events-grid mobile-events-grid">
          ${mainFeedInitial.map((event) => renderEventCard(event, currentProfile, goingSet, goingCounts)).join("")}
        </div>
        <div id="mobileFeedLoader" class="events-load-state" style="display:${mainFeedHasMore ? "block" : "none"};">Loading more events...</div>
        <div id="mobileFeedEnd" class="events-load-state" style="display:${mainFeedHasMore ? "none" : "block"};">No more events</div>
        <div id="mobileFeedSentinel" style="height:1px;"></div>
      </section>

      <section class="events-section desktop-only">

        <div class="row-between" style="margin-bottom:14px;">

          <h2 class="events-section-title">Live Event Feed</h2>

          <div class="muted">${mainFeedTotal} total</div>

        </div>



        <div id="mainFeedGrid" class="events-grid">

          ${mainFeedInitial.map((event) => renderEventCard(event, currentProfile, goingSet, goingCounts)).join("")}

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



      ${!events.length ? `<section class="events-section"><div class="empty muted">${isHotNearbyMode ? (hasLiveLocation ? "No hot sports, dance, or concert events were found nearby or in a closest active area yet." : "Enable location to start the Hot Nearby search, or tap All Events to browse without location.") : "No events found for this section yet."}</div></section>` : ""}

      ${renderSection("Featured Events", featured, currentProfile, goingSet, goingCounts)}

      ${renderSection("Tonight", tonight, currentProfile, goingSet, goingCounts)}

      ${renderSection("This Week", week, currentProfile, goingSet, goingCounts)}

      ${renderSection("Sports", sports, currentProfile, goingSet, goingCounts)}

      ${renderSection("Concerts", concerts, currentProfile, goingSet, goingCounts)}

      ${renderSection("Dances", dances, currentProfile, goingSet, goingCounts)}



      ${citySections.map((section) => `

        <section class="events-section desktop-only">

          <div class="row-between" style="margin-bottom:14px;">

            <h2 class="events-section-title">${escapeHtml(section.cityName)} Events</h2>

            <div class="muted">${section.total} total</div>

          </div>



          <div id="cityGrid-${escapeHtml(section.cityName)}" class="events-grid">

            ${section.initialItems.map((event) => renderEventCard(event, currentProfile, goingSet, goingCounts)).join("")}

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
      .events-chip-wrap{ display:grid; gap:12px; margin:18px 0 12px; }
      .events-chip-row{ display:flex; gap:14px; overflow-x:auto; padding-bottom:6px; -webkit-overflow-scrolling:touch; scrollbar-width:none; }
      .events-chip-row::-webkit-scrollbar{ display:none; }
      .events-chip{ flex:0 0 auto; min-width:160px; text-align:center; padding:18px 26px; border-radius:999px; text-decoration:none; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:rgba(255,255,255,.9); background:linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.03)); border:1px solid rgba(255,255,255,.12); box-shadow:0 10px 30px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.06); }
      .events-chip.is-active{ background:#eef3fb; color:#101626; border-color:rgba(255,255,255,.45); }
      .events-location-prompt{ position:relative; overflow:hidden; margin:18px 0 24px; padding:26px; border-radius:30px; border:1px solid rgba(127,210,255,.28); background:radial-gradient(520px 260px at 92% -10%, rgba(83,184,255,.22), transparent 58%), radial-gradient(380px 220px at 8% 0%, rgba(255,255,255,.08), transparent 56%), linear-gradient(180deg, rgba(19,28,43,.88), rgba(7,9,14,.96)); box-shadow:0 26px 80px rgba(0,0,0,.44), 0 0 0 1px rgba(255,255,255,.05) inset, 0 0 46px rgba(83,184,255,.10); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); }
      .events-location-prompt h2{ margin:8px 0 8px; font-size:28px; letter-spacing:-.04em; }
      .events-location-prompt p{ max-width:680px; line-height:1.55; }
      .location-prompt-glow{ position:absolute; width:280px; height:180px; right:-80px; top:-90px; border-radius:999px; background:radial-gradient(circle, rgba(127,210,255,.26), transparent 68%); filter:blur(12px); pointer-events:none; }
      .location-prompt-status{ margin-top:12px; font-size:13px; }



      .events-hero{

        position:relative;

        overflow:hidden;

        border-radius:32px;

        border:1px solid rgba(127,210,255,.20);

        background:

          radial-gradient(720px 300px at 88% -12%, rgba(83,184,255,.20), transparent 56%),

          radial-gradient(520px 260px at 4% 0%, rgba(255,255,255,.075), transparent 54%),

          linear-gradient(180deg, rgba(17,25,38,.92), rgba(6,7,11,.98));

        padding:30px;

        box-shadow:0 26px 80px rgba(0,0,0,.46), 0 0 0 1px rgba(255,255,255,.045) inset, 0 0 42px rgba(83,184,255,.09);

        backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);

      }



      .events-hero-glow,

      .events-hero-glow-b{

        position:absolute;

        border-radius:999px;

        filter:blur(16px);

        pointer-events:none;

      }



      .events-hero-glow{

        width:420px;

        height:220px;

        left:50%;

        top:-120px;

        transform:translateX(-50%);

        background:radial-gradient(circle, rgba(127,210,255,.08) 0%, rgba(127,210,255,.04) 42%, transparent 72%);

      }



      .events-hero-glow-b{

        display:none;

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



      .city-switcher-wrap{

        margin-top:16px;

        margin-bottom:18px;

      }



      .city-switcher{

        display:flex;

        gap:10px;

        overflow-x:auto;

        padding:4px 2px 6px;

        -webkit-overflow-scrolling:touch;

        scrollbar-width:none;

      }



      .city-switcher::-webkit-scrollbar{

        display:none;

      }



      .city-chip{

        flex:0 0 auto;

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:42px;

        padding:0 16px;

        border-radius:999px;

        text-decoration:none;

        font-weight:800;

        font-size:13px;

        letter-spacing:.6px;

        text-transform:uppercase;

        color:#dbe8f7;

        background:rgba(255,255,255,.06);

        border:1px solid rgba(255,255,255,.10);

        box-shadow:inset 0 1px 0 rgba(255,255,255,.04);

        backdrop-filter:blur(10px);

        transition:

          transform .18s ease,

          background .18s ease,

          border-color .18s ease,

          color .18s ease,

          box-shadow .18s ease;

      }



      .city-chip:hover{

        transform:translateY(-1px);

        border-color:rgba(127,210,255,.28);

        color:#f4f9ff;

      }



      .city-chip:active{

        transform:scale(.97);

      }



      .city-chip.is-active{

        color:#07111d;

        background:linear-gradient(180deg, #f8fbff, #dceeff);

        border-color:rgba(255,255,255,.75);

        box-shadow:

          0 10px 24px rgba(0,0,0,.18),

          inset 0 1px 0 rgba(255,255,255,.85);

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

          rgba(127,210,255,.34), rgba(92,154,255,.16) 18%, transparent 44%);

        opacity:0;

        transition:opacity .22s ease;

        z-index:2;

        pointer-events:none;

      }



      .event-card::before{

        content:"";

        position:absolute;

        inset:-1px;

        border-radius:inherit;

        background:linear-gradient(135deg, rgba(137,218,255,.52), rgba(255,255,255,.10), rgba(120,150,255,.32));

        opacity:0;

        filter:blur(1px);

        transition:opacity .22s ease;

        z-index:2;

        pointer-events:none;

        -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);

        -webkit-mask-composite:xor;

        mask-composite:exclude;

        padding:1px;

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



      .event-card:hover::before,

      .event-card.is-touch-active::before{ opacity:1; }



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

        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.10),
          inset 0 0 0 1px rgba(127,210,255,.10);

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

        -webkit-backdrop-filter:blur(5px);

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

          padding:24px;

          border-radius:32px;

        }



        .events-main-title{ font-size:38px; }



        .events-filter-grid{

          grid-template-columns:1fr;

        }



        .city-switcher-wrap{

          margin-top:14px;

          margin-bottom:14px;

        }



        .city-chip{

          min-height:40px;

          padding:0 14px;

          font-size:12px;

        }



        .mobile-events-grid{
          gap:18px;
        }

        .mobile-events-grid .event-card{
          min-height:520px;
          border-color:rgba(190,230,255,.18);
          box-shadow:
            0 24px 70px rgba(0,0,0,.52),
            0 0 0 1px rgba(127,210,255,.10),
            inset 0 1px 0 rgba(255,255,255,.08);
        }

        .mobile-events-grid .event-card .event-media{
          filter:saturate(1.18) contrast(1.05);
        }

        .mobile-events-grid .event-card .event-content{
          min-height:520px;
          background:linear-gradient(180deg, rgba(8,12,20,.10), rgba(5,8,14,.28) 48%, rgba(1,3,8,.70));
          backdrop-filter:blur(12px);
          -webkit-backdrop-filter:blur(12px);
        }

        .mobile-events-grid .event-card.is-touch-active{
          transform:translateY(-6px) scale(1.015);
          box-shadow:
            0 30px 82px rgba(0,0,0,.64),
            0 0 0 1px rgba(135,220,255,.42),
            0 0 34px rgba(78,178,255,.30);
        }

        .mobile-events-grid .event-card.is-touch-active .event-media{
          transform:scale(1.085);
          filter:saturate(1.28) contrast(1.08) blur(.6px);
        }

        .mobile-events-grid .event-card.is-touch-active .event-content{
          backdrop-filter:blur(16px);
          -webkit-backdrop-filter:blur(16px);
        }

        .events-section.mobile-only{
          padding-bottom:calc(150px + env(safe-area-inset-bottom));
        }

        .events-mobile-more{
          width:100%;
          justify-content:center;
          margin:20px 0 8px;
          min-height:56px;
          border-radius:999px;
        }

        .events-chip-wrap{ overflow:hidden; }
        .events-chip-row{
          display:flex;
          gap:14px;
          overflow-x:auto;
          overflow-y:hidden;
          -webkit-overflow-scrolling:touch;
          scroll-snap-type:x proximity;
          padding-bottom:8px;
        }
        .events-chip{
          flex:0 0 auto;
          min-width:max-content;
          scroll-snap-align:start;
        }

        .mobile-events-grid{
          display:grid;
          grid-template-columns:1fr;
          gap:22px;
        }

        .mobile-events-grid .event-card{
          width:100%;
          min-height:min(76vh, 720px);
          border-radius:34px;
        }

        .mobile-events-grid .event-card .event-content{
          min-height:min(76vh, 720px);
          padding:26px 22px 22px;
          justify-content:flex-end;
        }

        .mobile-events-grid .event-title{
          font-size:clamp(34px, 10vw, 48px);
          line-height:.98;
          letter-spacing:-1.4px;
        }

        .mobile-events-grid .event-copy{
          font-size:clamp(16px, 4.2vw, 20px);
          line-height:1.45;
          -webkit-line-clamp:2;
          max-width:100%;
        }

        .mobile-events-grid .event-meta-label{ font-size:12px; }
        .mobile-events-grid .event-meta-value{ font-size:16px; }
        .mobile-events-grid .event-actions-primary{
          grid-template-columns:1fr;
          gap:12px;
        }

        .reel-title{ font-size:30px; }

        .reel-actions{ grid-template-columns:1fr; }

      }

    </style>



    ${renderEventsClientScript({ FEED_PAGE_SIZE, category: activeCategory, isHotNearbyMode, citySections, currentProfile, liveLat, liveLng, radiusKm, usingClosestAreaFallback, closestAreaFallback })}



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

};
