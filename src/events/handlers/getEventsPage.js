
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
const { triggerEventAutoRefreshIfDue } = require("../../services/eventAutoRefreshScheduler");

module.exports = async function getEventsPage(req, res) {


  try {

    triggerEventAutoRefreshIfDue("events-page-catch-up");

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

    <header class="events-story-top">
      <a class="events-story-brand" href="/stories/feed" aria-label="Stories home">
        <img src="/images/tapzy-mark-white.png" alt="" aria-hidden="true" decoding="async" />
      </a>
      <nav class="events-story-tabs" aria-label="Primary sections">
        <span class="events-story-tab is-active">Events</span>
        <a class="events-story-tab" href="/stories/feed?filter=following">Following</a>
        <a class="events-story-tab" href="/stories/feed">Discover</a>
        <a class="events-story-tab" href="/messages">Messages</a>
      </nav>
      <a class="events-story-search" href="${currentProfile?.username ? `/discovery/${escapeHtml(currentProfile.username)}?tab=search` : "/auth"}" aria-label="Search Tapzy">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m16.5 16.5 4 4"></path></svg>
      </a>
    </header>

    <div class="wrap events-wrap">

      <section class="events-chip-wrap">
        <div class="events-chip-row">
          ${[
            ["all", "All Events", allHotEvents.length],
            ["sports", "Sports", allHotEvents.filter((e) => eventMatchesCategoryGroup(e, "sports")).length],
            ["dances", "Dances", allHotEvents.filter((e) => eventMatchesCategoryGroup(e, "dances")).length],
            ["concerts", "Concerts", allHotEvents.filter((e) => eventMatchesCategoryGroup(e, "concerts")).length],
            ["nearby", "Hot Nearby", hasLiveLocation ? (localEvents.length || closestAreaFallback.events.length) : ""],
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

      <section class="events-section mobile-only events-mobile-feed">
        <div id="mobileFeedGrid" class="events-grid mobile-events-grid">
          ${mainFeedInitial.map((event) => renderEventCard(event, currentProfile, goingSet, goingCounts)).join("")}
        </div>
        <div id="mobileFeedLoader" class="events-load-state" data-has-more="${mainFeedHasMore ? "1" : "0"}" style="display:${mainFeedHasMore ? "block" : "none"};">Loading more events...</div>
        <button id="mobileLoadMoreBtn" class="btn btnDark events-mobile-more" type="button" style="display:none;">Load more events</button>
        <div id="mobileFeedEnd" class="events-load-state" style="display:${mainFeedHasMore ? "none" : "block"};">You’re all caught up</div>
      </section>

      <section class="event-feed-mobile mobile-only" hidden>
        <header class="event-feed-top">
          <a class="event-feed-brand" href="/" aria-label="Tapzy home">T</a>
          <nav class="event-feed-tabs" aria-label="Event feed filters">
            ${[
              ["nearby", "Nearby"],
              ["all", "Discover"],
              ["concerts", "Music"],
              ["sports", "Sports"],
            ].map(([value, label]) => {
              const qs = new URLSearchParams();
              qs.set("category", value);
              if (value === "nearby" && hasLiveLocation) {
                qs.set("lat", String(liveLat));
                qs.set("lng", String(liveLng));
                qs.set("radiusKm", String(radiusKm));
              }
              return `<a class="event-feed-tab${activeCategory === value ? " is-active" : ""}" href="/events?${qs.toString()}">${escapeHtml(label)}</a>`;
            }).join("")}
          </nav>
        </header>

        <div id="reelFeed" class="reel-feed">
          ${mainFeedInitial.map((event) => renderReelItem(event, currentProfile, goingSet, goingCounts)).join("")}
          <div id="reelLoader" class="event-reel-status" style="display:${mainFeedHasMore ? "block" : "none"};">Loading more events...</div>
          <div id="reelEnd" class="event-reel-status" style="display:${mainFeedHasMore ? "none" : "block"};">You’re all caught up</div>
          <div id="reelSentinel" class="reel-sentinel"></div>
        </div>

        <nav class="event-feed-bottom" aria-label="Primary navigation">
          <a class="event-feed-nav is-active" href="/">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8v10h-6v-7H9v7H3V11Z"></path></svg>
            <span>Home</span>
          </a>
          <a class="event-feed-create" href="${currentProfile ? "/stories" : "/auth"}" aria-label="Create story">+</a>
          <a class="event-feed-nav" href="${currentProfile?.username ? `/u/${escapeHtml(currentProfile.username)}` : "/auth"}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 22c0-5 3-8 8-8s8 3 8 8"></path></svg>
            <span>Profile</span>
          </a>
        </nav>
      </section>

      <section class="events-section desktop-only">

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

      body.events-story-shell > .tz-topbar{display:none !important;}
      body.events-story-shell{background:#000;}
      .events-story-top{
        position:sticky;
        z-index:60;
        top:0;
        left:0;
        right:0;
        min-height:72px;
        display:flex;
        align-items:center;
        justify-content:center;
        gap:26px;
        padding:calc(env(safe-area-inset-top, 0px) + 18px) 58px 16px;
        background:linear-gradient(180deg,rgba(0,0,0,.82),rgba(0,0,0,.56),rgba(0,0,0,.08));
      }
      .events-story-brand{
        position:absolute;
        left:16px;
        top:calc(env(safe-area-inset-top, 0px) + 16px);
        width:38px;
        height:38px;
        display:grid;
        place-items:center;
        border:2px solid rgba(255,255,255,.9);
        border-radius:12px;
        color:#fff;
        text-decoration:none;
        background:rgba(3,6,12,.24);
        box-shadow:0 10px 26px rgba(0,0,0,.22);
        backdrop-filter:blur(10px);
        -webkit-backdrop-filter:blur(10px);
      }
      .events-story-brand img{width:72%;height:72%;object-fit:contain;display:block;}
      .events-story-tabs{
        display:flex;
        gap:18px;
        align-items:center;
        min-width:0;
      }
      .events-story-tab{
        position:relative;
        border:0;
        background:none;
        padding:8px 0;
        color:rgba(255,255,255,.68);
        font-weight:750;
        font-size:15px;
        text-decoration:none;
        white-space:nowrap;
      }
      .events-story-tab.is-active{color:#fff;}
      .events-story-tab.is-active::after{
        content:"";
        position:absolute;
        left:50%;
        bottom:-5px;
        width:26px;
        height:3px;
        border-radius:5px;
        background:#fff;
        transform:translateX(-50%);
      }
      .events-story-search{
        position:absolute;
        right:15px;
        top:calc(env(safe-area-inset-top, 0px) + 16px);
        width:40px;
        height:40px;
        padding:7px;
        color:#fff;
        text-decoration:none;
      }
      .events-story-search svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
      @media(max-width:430px){
        .events-story-top{min-height:66px;gap:12px;padding:calc(env(safe-area-inset-top, 0px) + 15px) 50px 14px;}
        .events-story-brand{left:14px;top:calc(env(safe-area-inset-top, 0px) + 14px);width:36px;height:36px;border-radius:12px;}
        .events-story-tabs{gap:12px;}
        .events-story-tab{font-size:13px;font-weight:800;padding:7px 0;}
        .events-story-tab.is-active::after{bottom:-4px;width:24px;height:3px;}
        .events-story-search{right:12px;top:calc(env(safe-area-inset-top, 0px) + 14px);width:36px;height:36px;padding:6px;}
      }
      @media(max-width:360px){
        .events-story-top{gap:5px;padding-left:36px;padding-right:34px;}
        .events-story-brand{width:30px;height:30px;}
        .events-story-tabs{gap:5px;}
        .events-story-tab{font-size:10px;}
        .events-story-search{width:30px;height:30px;padding:5px;}
      }
      @media(max-width:320px){
        .events-story-top{gap:4px;padding-left:32px;padding-right:30px;}
        .events-story-brand{left:6px;width:28px;height:28px;border-radius:9px;}
        .events-story-tabs{gap:4px;}
        .events-story-tab{font-size:9.4px;}
        .events-story-search{right:4px;width:28px;height:28px;padding:4px;}
      }

      .mobile-only{ display:none; }

      .desktop-only{ display:block; }
      .events-chip-wrap{ display:grid; gap:12px; margin:6px 0 26px; }
      .events-chip-row{ display:flex; gap:14px; overflow-x:auto; padding-bottom:6px; -webkit-overflow-scrolling:touch; scrollbar-width:none; }
      .events-chip-row::-webkit-scrollbar{ display:none; }
      .events-chip{ flex:0 0 auto; min-width:124px; text-align:center; padding:13px 18px; border-radius:999px; text-decoration:none; font-weight:800; font-size:12px; letter-spacing:.065em; text-transform:uppercase; color:rgba(255,255,255,.9); background:linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.03)); border:1px solid rgba(255,255,255,.12); box-shadow:0 10px 30px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.06); }
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
        --mx:72%;
        --my:22%;
        isolation:isolate;

        min-height:450px;

        overflow:hidden;

        border-radius:32px;
        clip-path:inset(0 round 32px);

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
        border-radius:inherit;

        background:

          radial-gradient(circle at var(--mx,50%) var(--my,50%),

          rgba(127,220,255,.36), rgba(64,155,255,.16) 18%, transparent 38%);

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

        background:linear-gradient(135deg, rgba(137,226,255,.82), rgba(255,255,255,.16), rgba(75,154,255,.58));

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

        transform:translateY(-6px) scale(1.006);

        box-shadow:

          0 30px 80px rgba(0,0,0,.55),

          0 0 0 1px rgba(127,220,255,.42),
          0 0 42px rgba(78,178,255,.28);

        border-color:rgba(127,220,255,.56);

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
        border-radius:inherit;

        opacity:.045;

        background-image:radial-gradient(rgba(255,255,255,.9) .6px, transparent .6px);

        background-size:8px 8px;

        z-index:1;

        pointer-events:none;

      }



      .event-card-glow{

        position:absolute;
        left:var(--mx,72%);
        top:var(--my,22%);
        width:min(78vw, 430px);
        height:min(78vw, 430px);
        border-radius:999px;
        background:radial-gradient(circle,
          rgba(150,225,255,.72) 0%,
          rgba(76,169,255,.42) 24%,
          rgba(46,112,255,.22) 48%,
          transparent 74%);
        transform:translate(-50%, -50%);
        filter:blur(18px);
        opacity:.96;
        mix-blend-mode:screen;

        z-index:2;

        pointer-events:none;
        transition:opacity .22s ease, filter .22s ease, left .08s linear, top .08s linear;

      }

      .event-card:hover .event-card-glow,
      .event-card.is-touch-active .event-card-glow{
        opacity:1;
        filter:blur(21px);
      }



      .event-card-edge{

        position:absolute;

        inset:0;

        border-radius:inherit;

        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.10),
          inset 0 0 0 1px rgba(127,210,255,.10);

        z-index:2;

        pointer-events:none;

      }



      .event-media{

        position:absolute;

        inset:0;
        border-radius:inherit;

        background-size:cover;

        background-position:center;

        transform:scale(1.015);

        transition:transform 1.2s ease;

      }



      .event-card:hover .event-media,

      .event-card.is-touch-active .event-media{

        transform:scale(1.045);

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

        white-space:nowrap;

        flex-shrink:0;

        line-height:1;

        word-break:keep-all;

      }



      .event-pill-urgency{

        background:rgba(111,210,255,.12);

        border-color:rgba(111,210,255,.32);

      }



      .event-title{

        margin:0;

        font-size:clamp(30px, 4.2vw, 42px);

        line-height:1.01;

        letter-spacing:0;

        font-weight:950;

        text-wrap:balance;

        max-width:96%;

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





      .btnGhost:hover,
      .btnGhost:focus-visible,
      .btnGhost.is-going{
        border-color:rgba(127,220,255,.64);
        background:rgba(64,148,255,.16);
        box-shadow:
          0 0 0 1px rgba(127,220,255,.22),
          0 0 30px rgba(75,170,255,.34),
          inset 0 1px 0 rgba(255,255,255,.14);
        transform:translateY(-2px);
      }

      .js-save-btn.is-animating{
        box-shadow:0 0 36px rgba(75,170,255,.48);
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

        background:radial-gradient(circle, rgba(100,190,255,.42), rgba(58,128,255,.20) 36%, transparent 70%);

        filter:blur(22px);

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
          backdrop-filter:blur(8px);
          -webkit-backdrop-filter:blur(8px);
        }

        .mobile-events-grid .event-card.is-touch-active{
          transform:translateY(-6px) scale(1.015);
          box-shadow:
            0 30px 82px rgba(0,0,0,.64),
            0 0 0 1px rgba(135,220,255,.42),
            0 0 52px rgba(78,178,255,.46),
            0 0 96px rgba(64,128,255,.20);
        }

        .mobile-events-grid .event-card.is-touch-active .event-media{
          transform:scale(1.085);
          filter:saturate(1.28) contrast(1.08) blur(.6px);
        }

        .mobile-events-grid .event-card.is-touch-active .event-content{
          backdrop-filter:blur(10px);
          -webkit-backdrop-filter:blur(10px);
        }

        .events-section.mobile-only{
          padding-bottom:calc(170px + env(safe-area-inset-bottom));
          overflow:visible;
        }

        .events-mobile-more-wrap{
          display:flex;
          justify-content:center;
          padding:4px 0 28px;
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
          padding:12px 17px;
          font-size:12px;
          scroll-snap-align:start;
        }

        .mobile-events-grid{
          display:grid;
          grid-template-columns:1fr;
          gap:22px;
        }

        .mobile-events-grid .event-card{
          width:100%;
          min-height:min(78svh, 720px);
          border-radius:34px;
          contain-intrinsic-size:0 620px;
          backface-visibility:hidden;
          -webkit-backface-visibility:hidden;
        }

        .mobile-feed-virtual-spacer{
          width:100%;
          flex:0 0 auto;
          pointer-events:none;
        }

        .mobile-events-grid .event-card.is-virtualized-card{
          animation:none !important;
          opacity:1 !important;
        }

        .mobile-events-grid .event-card:not(.is-touch-active){
          transform:translateZ(0);
        }

        @media (prefers-reduced-motion: no-preference){
          .mobile-events-grid .event-card.is-virtualized-card{
            transition:transform .24s cubic-bezier(.2,.8,.2,1), box-shadow .24s ease, border-color .24s ease;
          }
        }


        .mobile-events-grid .event-card .event-content{
          min-height:min(78svh, 720px);
          padding:26px 22px 22px;
          justify-content:flex-end;
        }

        .mobile-events-grid .event-title{
          font-size:clamp(32px, 9.4vw, 46px);
          line-height:1.01;
          letter-spacing:0;
          font-weight:950;
          text-wrap:balance;
          max-width:100%;
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

      @media(max-width:700px){
        html,body{height:100%;overflow:hidden;background:#000;}
        body > .tz-topbar,
        body > .tz-menu-overlay,
        body > .tz-menu-panel,
        .events-wrap > .events-hero,
        .events-wrap > .events-chip-wrap,
        .events-wrap > #liveLocationNotice,
        .events-wrap > .events-location-prompt,
        .tz-assistant-launcher,
        .tz-assistant-panel{display:none !important;}

        .events-wrap{
          width:100%;
          height:100dvh;
          margin:0;
          padding:0;
          overflow:hidden;
        }

        .event-feed-mobile{
          position:relative;
          display:block !important;
          width:100%;
          height:100dvh;
          margin:0;
          overflow:hidden;
          background:#000;
        }

        .event-feed-top{
          position:fixed;
          z-index:40;
          top:0;
          left:0;
          right:0;
          min-height:74px;
          padding:calc(env(safe-area-inset-top) + 14px) 54px 13px;
          display:flex;
          justify-content:center;
          align-items:center;
          background:linear-gradient(180deg,rgba(0,0,0,.68),rgba(0,0,0,.08),transparent);
          pointer-events:none;
        }

        .event-feed-brand{
          position:absolute;
          left:15px;
          top:calc(env(safe-area-inset-top) + 13px);
          width:40px;
          height:40px;
          display:grid;
          place-items:center;
          border:2px solid rgba(255,255,255,.9);
          border-radius:12px;
          color:#fff;
          text-decoration:none;
          font-size:17px;
          font-weight:950;
          pointer-events:auto;
        }

        .event-feed-tabs{
          display:flex;
          align-items:center;
          gap:16px;
          max-width:100%;
          overflow-x:auto;
          scrollbar-width:none;
          pointer-events:auto;
        }
        .event-feed-tabs::-webkit-scrollbar{display:none;}
        .event-feed-tab{
          position:relative;
          flex:0 0 auto;
          padding:8px 0;
          color:rgba(255,255,255,.7);
          text-decoration:none;
          font-size:14px;
          font-weight:780;
          text-shadow:0 2px 10px rgba(0,0,0,.72);
        }
        .event-feed-tab.is-active{color:#fff;}
        .event-feed-tab.is-active::after{
          content:"";
          position:absolute;
          left:50%;
          bottom:-3px;
          width:26px;
          height:3px;
          border-radius:4px;
          background:#fff;
          transform:translateX(-50%);
        }

        .event-feed-mobile .reel-feed{
          width:100%;
          height:100dvh;
          margin:0;
          border-radius:0;
          background:#000;
          scrollbar-width:none;
        }
        .event-feed-mobile .reel-feed::-webkit-scrollbar{display:none;}
        .event-feed-mobile .reel-item{
          min-height:100dvh;
          height:100dvh;
          transform:none;
          scroll-snap-stop:always;
        }
        .event-feed-mobile .reel-bg{
          background-position:center;
          transform:none;
        }
        .event-feed-mobile .reel-item.is-active .reel-bg{transform:scale(1.035);}
        .event-feed-mobile .reel-content{
          min-height:100dvh;
          padding:calc(env(safe-area-inset-top) + 82px) 84px calc(env(safe-area-inset-bottom) + 82px) 17px;
          background:linear-gradient(180deg,rgba(0,0,0,.1) 22%,transparent 45%,rgba(0,0,0,.84) 88%,rgba(0,0,0,.98));
        }
        .event-feed-mobile .reel-top{display:flex;justify-content:space-between;gap:10px;}
        .event-feed-mobile .reel-title{
          font-size:clamp(31px,9vw,44px);
          line-height:.98;
          letter-spacing:-1.3px;
          text-shadow:0 3px 18px rgba(0,0,0,.72);
        }
        .event-feed-mobile .reel-sub{
          margin-top:9px;
          font-size:14px;
          line-height:1.4;
          display:-webkit-box;
          -webkit-box-orient:vertical;
          -webkit-line-clamp:2;
          overflow:hidden;
          text-shadow:0 2px 12px rgba(0,0,0,.8);
        }
        .event-feed-mobile .reel-meta{
          gap:4px;
          margin-top:10px;
          font-size:13px;
          text-shadow:0 2px 10px rgba(0,0,0,.85);
        }
        .event-feed-mobile .reel-actions{
          display:flex;
          flex-wrap:wrap;
          gap:8px;
          margin-top:14px;
        }
        .event-feed-mobile .reel-actions .btn{
          min-height:40px;
          padding:0 14px;
          border-radius:12px;
          font-size:13px;
        }
        .event-feed-mobile .reel-actions .js-save-form{flex:0 0 auto;}
        .event-feed-mobile .event-going-count{
          margin-top:8px;
          color:rgba(255,255,255,.78);
          font-size:12px;
        }
        .event-reel-status{
          min-height:100dvh;
          display:grid;
          place-items:center;
          padding:100px 24px;
          scroll-snap-align:start;
          color:#aeb8ca;
          text-align:center;
          background:#08090d;
        }

        .event-feed-bottom{
          position:fixed;
          z-index:40;
          left:0;
          right:0;
          bottom:0;
          height:calc(64px + env(safe-area-inset-bottom));
          padding:7px 36px env(safe-area-inset-bottom);
          display:flex;
          align-items:center;
          justify-content:space-between;
          background:#030303;
          border-top:1px solid rgba(255,255,255,.09);
        }
        .event-feed-nav{
          min-width:56px;
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:2px;
          color:rgba(255,255,255,.72);
          text-decoration:none;
          font-size:10px;
          font-weight:700;
        }
        .event-feed-nav.is-active{color:#fff;}
        .event-feed-nav svg{
          width:25px;
          height:25px;
          fill:none;
          stroke:currentColor;
          stroke-width:2;
          stroke-linecap:round;
          stroke-linejoin:round;
        }
        .event-feed-create{
          width:56px;
          height:38px;
          display:grid;
          place-items:center;
          border:2px solid #fff;
          border-radius:11px;
          background:linear-gradient(145deg,#2f76ff,#1145ad);
          color:#fff;
          text-decoration:none;
          font-size:29px;
          font-weight:900;
          line-height:1;
          box-shadow:0 5px 18px rgba(35,102,231,.42);
        }

        .event-feed-mobile .reel-item{
          isolation:isolate;
          opacity:.72;
          transition:opacity .48s ease;
        }
        .event-feed-mobile .reel-item.is-active{opacity:1;}
        .event-feed-mobile .reel-bg{
          z-index:-4;
          background-size:cover;
          filter:saturate(.92) contrast(1.04) brightness(.82);
          will-change:transform,filter;
          transition:transform 1.25s cubic-bezier(.2,.8,.2,1),filter .7s ease;
        }
        .event-feed-mobile .reel-item.is-active .reel-bg{
          transform:scale(1.065);
          filter:saturate(1.08) contrast(1.07) brightness(.92);
        }
        .reel-ambient{
          position:absolute;
          z-index:-3;
          inset:auto -20% -18% -20%;
          height:48%;
          background-size:cover;
          background-position:center bottom;
          filter:blur(48px) saturate(1.45);
          opacity:.32;
          transform:scale(1.18);
          transition:opacity .7s ease;
        }
        .reel-item.is-active .reel-ambient{opacity:.58;}
        .reel-vignette{
          position:absolute;
          z-index:-2;
          inset:0;
          background:
            linear-gradient(180deg,rgba(0,0,0,.62) 0,rgba(0,0,0,.04) 24%,rgba(0,0,0,.08) 48%,rgba(0,0,0,.78) 78%,#020306 100%),
            radial-gradient(circle at 50% 38%,transparent 24%,rgba(0,0,0,.42) 100%);
          pointer-events:none;
        }
        .reel-grain{
          position:absolute;
          z-index:-1;
          inset:0;
          opacity:.035;
          background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.8'/%3E%3C/svg%3E");
          pointer-events:none;
        }
        .event-feed-mobile .reel-content{
          padding:calc(env(safe-area-inset-top) + 84px) 82px calc(env(safe-area-inset-bottom) + 84px) 18px;
          background:none;
        }
        .event-feed-mobile .reel-top{
          align-items:flex-start;
          opacity:0;
          transform:translateY(-14px);
          transition:opacity .46s ease .08s,transform .55s cubic-bezier(.2,.8,.2,1) .08s;
        }
        .event-feed-mobile .reel-item.is-active .reel-top{
          opacity:1;
          transform:none;
        }
        .reel-date{
          width:54px;
          height:62px;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          border:1px solid rgba(255,255,255,.24);
          border-radius:17px;
          background:rgba(8,12,22,.46);
          box-shadow:0 14px 36px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.15);
          backdrop-filter:blur(18px);
          -webkit-backdrop-filter:blur(18px);
        }
        .reel-date span{
          color:#9fc4ff;
          font-size:10px;
          font-weight:900;
          letter-spacing:1.6px;
        }
        .reel-date strong{
          margin-top:1px;
          color:#fff;
          font-size:25px;
          line-height:1;
          letter-spacing:-1px;
        }
        .reel-top-pills{
          display:flex;
          flex-wrap:wrap;
          justify-content:flex-end;
          gap:7px;
          max-width:190px;
        }
        .reel-chip{
          display:inline-flex;
          align-items:center;
          min-height:31px;
          padding:0 11px;
          border:1px solid rgba(255,255,255,.2);
          border-radius:999px;
          background:rgba(5,9,17,.42);
          color:#fff;
          font-size:10px;
          font-weight:850;
          letter-spacing:.8px;
          text-transform:uppercase;
          backdrop-filter:blur(16px);
          -webkit-backdrop-filter:blur(16px);
        }
        .reel-chip-price{
          border-color:rgba(126,185,255,.45);
          background:rgba(24,81,179,.54);
        }
        .reel-action-rail{
          position:absolute;
          right:10px;
          bottom:calc(env(safe-area-inset-bottom) + 91px);
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:17px;
          opacity:0;
          transform:translateX(18px);
          transition:opacity .48s ease .18s,transform .58s cubic-bezier(.2,.8,.2,1) .18s;
        }
        .reel-item.is-active .reel-action-rail{opacity:1;transform:none;}
        .reel-rail-form{margin:0;}
        .reel-rail-action{
          width:58px;
          padding:0;
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:4px;
          border:0;
          background:none;
          color:#fff;
          text-decoration:none;
          font-size:10px;
          font-weight:800;
          text-shadow:0 2px 8px #000;
          cursor:pointer;
        }
        .reel-rail-action svg{
          width:43px;
          height:43px;
          padding:10px;
          border:1px solid rgba(255,255,255,.2);
          border-radius:50%;
          background:rgba(4,8,15,.5);
          fill:none;
          stroke:currentColor;
          stroke-width:1.8;
          stroke-linecap:round;
          stroke-linejoin:round;
          box-shadow:0 10px 28px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.12);
          backdrop-filter:blur(14px);
          -webkit-backdrop-filter:blur(14px);
          transition:transform .2s ease,background .2s ease,border-color .2s ease,color .2s ease;
        }
        .reel-rail-action:active svg{transform:scale(.88);}
        .reel-rail-action.is-going{color:#fff;}
        .reel-rail-action.is-going svg{
          border-color:#76a9ff;
          background:linear-gradient(145deg,#347cff,#1649b6);
          box-shadow:0 10px 30px rgba(36,103,235,.45);
        }
        .reel-rail-action.is-animating svg{animation:reelActionPop .38s ease;}
        .event-feed-mobile .reel-body{
          margin-top:auto;
          opacity:0;
          transform:translateY(28px);
          transition:opacity .5s ease .12s,transform .68s cubic-bezier(.16,.84,.24,1) .12s;
        }
        .event-feed-mobile .reel-item.is-active .reel-body{opacity:1;transform:none;}
        .reel-eyebrow{
          display:flex;
          align-items:center;
          gap:8px;
          margin-bottom:8px;
          color:#d7e6ff;
          font-size:10px;
          font-weight:900;
          letter-spacing:1.5px;
          text-transform:uppercase;
        }
        .reel-live-dot{
          width:8px;
          height:8px;
          border-radius:50%;
          background:#4b8cff;
          box-shadow:0 0 0 5px rgba(55,123,255,.14),0 0 18px #4b8cff;
          animation:reelPulse 1.8s ease-in-out infinite;
        }
        .event-feed-mobile .reel-title{
          max-width:100%;
          margin:0;
          font-size:clamp(34px,10.2vw,48px);
          line-height:.94;
          letter-spacing:-1.8px;
          text-wrap:balance;
        }
        .event-feed-mobile .reel-sub{
          margin-top:11px;
          color:rgba(246,249,255,.88);
          font-size:14px;
          line-height:1.42;
          -webkit-line-clamp:2;
        }
        .reel-location{
          display:flex;
          align-items:center;
          gap:7px;
          margin-top:13px;
          color:#fff;
          font-size:13px;
          font-weight:750;
        }
        .reel-location svg{
          flex:0 0 auto;
          width:17px;
          height:17px;
          fill:none;
          stroke:#8ab8ff;
          stroke-width:2;
        }
        .reel-location span{
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .reel-time{
          margin-top:5px;
          color:rgba(255,255,255,.66);
          font-size:12px;
        }
        .reel-footer-row{
          margin-top:15px;
          display:flex;
          align-items:center;
          gap:12px;
        }
        .reel-open-btn{
          min-height:45px;
          padding:0 16px;
          display:inline-flex;
          align-items:center;
          gap:12px;
          border:1px solid rgba(255,255,255,.9);
          border-radius:15px;
          background:#fff;
          color:#071020;
          text-decoration:none;
          font-size:13px;
          font-weight:900;
          box-shadow:0 12px 34px rgba(0,0,0,.26);
          transition:transform .2s ease,box-shadow .2s ease;
        }
        .reel-open-btn span{font-size:19px;line-height:1;}
        .reel-open-btn:active{transform:scale(.96);box-shadow:0 6px 18px rgba(0,0,0,.22);}
        .reel-attendance{
          color:rgba(255,255,255,.72);
          font-size:11px;
          font-weight:700;
          line-height:1.25;
        }
        .event-reel-status{
          background:
            radial-gradient(circle at 50% 38%,rgba(32,79,175,.22),transparent 30%),
            #050609;
        }
        @keyframes reelPulse{
          0%,100%{transform:scale(.9);opacity:.72;}
          50%{transform:scale(1.08);opacity:1;}
        }
        @keyframes reelActionPop{
          0%{transform:scale(1)}
          45%{transform:scale(1.23)}
          100%{transform:scale(1)}
        }
        @media(prefers-reduced-motion:reduce){
          .event-feed-mobile .reel-item,
          .event-feed-mobile .reel-bg,
          .event-feed-mobile .reel-top,
          .event-feed-mobile .reel-body,
          .reel-action-rail{transition:none !important;}
          .reel-live-dot{animation:none;}
        }
      }

      @media(max-width:700px){
        html,body{
          height:auto !important;
          min-height:100%;
          overflow-x:hidden !important;
          overflow-y:auto !important;
          background:#05070c;
        }
        body > .tz-topbar{
          display:block !important;
          position:sticky;
          top:0;
          z-index:9000;
        }
        body > .tz-menu-overlay{
          display:block !important;
          z-index:9050 !important;
        }
        body > .tz-menu-panel{
          display:block !important;
          z-index:9100 !important;
          visibility:visible !important;
        }
        body > .tz-menu-panel:not(.open){
          pointer-events:none;
        }
        body > .tz-menu-panel.open{
          pointer-events:auto;
        }
        .events-wrap{
          width:auto !important;
          height:auto !important;
          max-width:none;
          margin:0 auto !important;
          padding:16px 14px calc(80px + env(safe-area-inset-bottom)) !important;
          overflow:visible !important;
        }
        .events-wrap > .events-hero,
        .events-wrap > .events-chip-wrap,
        .events-wrap > #liveLocationNotice,
        .events-wrap > .events-location-prompt{
          display:block !important;
        }
        .event-feed-mobile[hidden]{display:none !important;}
        .events-mobile-feed{
          display:block !important;
          margin-top:22px;
          padding-bottom:40px !important;
          overflow:visible;
        }
        .events-mobile-feed-head{
          display:flex;
          align-items:flex-end;
          justify-content:space-between;
          gap:16px;
          margin:0 2px 15px;
        }
        .events-mobile-feed-head .events-section-title{
          margin:3px 0 0;
          font-size:28px;
          line-height:1;
          letter-spacing:-1px;
        }
        .mobile-events-grid{
          display:grid !important;
          grid-template-columns:1fr !important;
          gap:22px !important;
          overflow:visible !important;
        }
        .mobile-events-grid .event-card{
          min-height:min(76svh,680px);
          border-radius:30px;
          border-color:rgba(166,215,255,.2);
          background:#080b12;
          box-shadow:
            0 24px 70px rgba(0,0,0,.52),
            0 0 0 1px rgba(81,151,255,.09),
            inset 0 1px 0 rgba(255,255,255,.08);
          contain:layout paint style;
          contain-intrinsic-size:0 620px;
          touch-action:pan-y;
          -webkit-tap-highlight-color:transparent;
        }
        .mobile-events-grid .event-card::after{
          background:radial-gradient(circle at var(--mx,50%) var(--my,50%),
            rgba(184,235,255,.62) 0,
            rgba(80,174,255,.38) 13%,
            rgba(42,105,255,.18) 31%,
            transparent 54%);
          mix-blend-mode:screen;
        }
        .mobile-events-grid .event-card .event-card-glow{
          width:min(92vw,480px);
          height:min(92vw,480px);
          opacity:.7;
          filter:blur(22px);
          transition:opacity .18s ease,left .06s linear,top .06s linear,filter .18s ease;
        }
        .mobile-events-grid .event-card.is-touch-active{
          transform:translateY(-4px) scale(1.012);
          border-color:rgba(151,221,255,.62);
          box-shadow:
            0 30px 82px rgba(0,0,0,.64),
            0 0 0 1px rgba(145,220,255,.46),
            0 0 46px rgba(68,164,255,.4);
        }
        .mobile-events-grid .event-card.is-touch-active::after{opacity:1;}
        .mobile-events-grid .event-card.is-touch-active .event-card-glow{
          opacity:1;
          filter:blur(17px);
        }
        .mobile-events-grid .event-media{
          filter:saturate(1.12) contrast(1.06) brightness(.92);
          transform:scale(1.025);
        }
        .mobile-events-grid .event-card.is-touch-active .event-media{
          transform:scale(1.055);
          filter:saturate(1.2) contrast(1.08) brightness(.97);
        }
        .mobile-events-grid .event-content{
          min-height:min(76svh,680px);
          padding:24px 20px 21px;
          justify-content:flex-end;
          background:linear-gradient(180deg,
            rgba(4,7,13,.03) 16%,
            rgba(4,7,13,.2) 44%,
            rgba(2,4,9,.86) 76%,
            rgba(1,2,6,.97) 100%);
          backdrop-filter:none;
          -webkit-backdrop-filter:none;
        }
        .mobile-events-grid .event-title{
          max-width:94%;
          margin-top:11px;
          font-size:clamp(31px,9vw,44px);
          line-height:.97;
          letter-spacing:-1.5px;
          text-wrap:balance;
        }
        .mobile-events-grid .event-copy{
          margin-top:9px;
          font-size:14px;
          line-height:1.42;
          -webkit-line-clamp:2;
          color:rgba(241,247,255,.82);
        }
        .mobile-events-grid .event-divider{
          margin:15px 0 13px;
          opacity:.55;
        }
        .mobile-events-grid .event-meta{gap:7px;}
        .mobile-events-grid .event-meta-row{
          display:grid;
          grid-template-columns:52px 1fr;
          gap:9px;
        }
        .mobile-events-grid .event-meta-label{
          color:#86b4ff;
          font-size:10px;
          font-weight:900;
          letter-spacing:1.1px;
          text-transform:uppercase;
        }
        .mobile-events-grid .event-meta-value{
          color:#fff;
          font-size:13px;
          font-weight:700;
        }
        .mobile-events-grid .event-actions-primary{
          grid-template-columns:1fr 1fr;
          gap:9px;
          margin-top:16px;
        }
        .mobile-events-grid .event-actions-primary .btn{
          min-height:45px;
          border-radius:14px;
          font-size:12px;
        }
        .mobile-events-grid .event-actions-secondary{
          margin-top:9px;
          min-height:36px;
        }
        .mobile-feed-virtual-spacer{
          width:100%;
          pointer-events:none;
        }
        .mobile-events-grid .event-card.is-virtualized-card{
          animation:none !important;
          opacity:1 !important;
        }
        .events-load-state{
          padding:22px 0;
          text-align:center;
          color:#8391a7;
        }
      }

      @media(max-width:700px){
        html,body{
          height:auto !important;
          min-height:100% !important;
          overflow-x:hidden !important;
          overflow-y:auto !important;
          background:#000 !important;
        }

        .event-feed-mobile,
        .event-feed-mobile.mobile-only{
          display:none !important;
        }

        .events-wrap{
          width:auto !important;
          height:auto !important;
          margin:0 auto !important;
          padding:10px 14px calc(92px + env(safe-area-inset-bottom, 0px)) !important;
          overflow:visible !important;
        }

        .events-story-top{
          position:sticky;
          min-height:72px;
          gap:26px;
          padding:calc(env(safe-area-inset-top, 0px) + 18px) 58px 16px;
        }

        .events-story-brand{
          left:16px;
          top:calc(env(safe-area-inset-top, 0px) + 16px);
          width:38px;
          height:38px;
          border-radius:12px;
        }

        .events-story-tabs{
          gap:18px;
        }

        .events-story-tab{
          font-size:15px;
          font-weight:750;
          padding:8px 0;
        }

        .events-story-tab.is-active::after{
          bottom:-5px;
          width:26px;
          height:3px;
        }

        .events-story-search{
          right:15px;
          top:calc(env(safe-area-inset-top, 0px) + 16px);
          width:40px;
          height:40px;
          padding:7px;
        }

        @media(max-width:340px){
          .events-story-top{
            gap:5px;
            padding-left:36px;
            padding-right:34px;
          }

          .events-story-brand{
            width:30px;
            height:30px;
          }

          .events-story-tabs{gap:5px;}
          .events-story-tab{font-size:10px;}

          .events-story-search{
            width:30px;
            height:30px;
            padding:5px;
          }
        }

        .events-wrap > .events-hero{
          display:none !important;
        }

        .events-chip-wrap{
          display:block !important;
          margin:4px -14px 28px !important;
          padding:0 14px;
          overflow:hidden;
        }

        .events-chip-row{
          gap:12px;
          padding:0 0 8px;
        }

        .events-chip{
          min-width:auto;
          padding:12px 17px;
          border-radius:999px;
          font-size:12px;
          letter-spacing:.075em;
          white-space:nowrap;
          background:linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.03));
          border:1px solid rgba(255,255,255,.12);
          box-shadow:0 10px 30px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.06);
        }

        .events-chip.is-active{
          background:#eef3fb;
          color:#101626;
          border-color:rgba(255,255,255,.45);
        }

        .events-mobile-feed{
          display:block !important;
          margin-top:0 !important;
          padding-bottom:40px !important;
          overflow:visible !important;
        }

        .events-mobile-feed-head{
          display:flex !important;
          align-items:flex-end;
          justify-content:space-between;
          gap:16px;
          margin:0 2px 15px;
        }

        .events-mobile-feed-head .events-section-title{
          margin:3px 0 0;
          font-size:30px;
          line-height:1;
          letter-spacing:-1px;
        }

        .mobile-events-grid{
          display:grid !important;
          grid-template-columns:1fr !important;
          gap:22px !important;
          overflow:visible !important;
        }

        .mobile-events-grid .event-card{
          min-height:min(76svh,680px);
          border-radius:32px;
          clip-path:inset(0 round 32px);
          overflow:hidden;
          isolation:isolate;
          background:
            radial-gradient(520px 260px at 72% 14%, rgba(120,190,255,.08), transparent 58%),
            linear-gradient(180deg, rgba(9,12,19,.98), rgba(0,0,0,1));
          border-color:rgba(135,205,255,.24);
          box-shadow:
            0 28px 80px rgba(0,0,0,.62),
            0 0 0 1px rgba(115,194,255,.10),
            inset 0 1px 0 rgba(255,255,255,.10);
        }

        .mobile-events-grid .event-card::before,
        .mobile-events-grid .event-card::after,
        .mobile-events-grid .event-media,
        .mobile-events-grid .event-content,
        .mobile-events-grid .event-card-edge,
        .mobile-events-grid .event-card-noise{
          border-radius:inherit;
        }

        .mobile-events-grid .event-card.is-touch-active{
          transform:translateY(-3px) scale(1.004) !important;
          border-radius:32px;
          clip-path:inset(0 round 32px);
        }

        .mobile-events-grid .event-card.is-touch-active .event-media{
          transform:scale(1.04) !important;
        }

        .mobile-events-grid .event-pill-soft{
          max-width:46%;
          padding-inline:10px;
          font-size:9.5px;
          letter-spacing:.75px;
          overflow:hidden;
          text-overflow:ellipsis;
        }
      }

      @media(max-width:700px){
        html,
        body,
        body.events-story-shell{
          height:auto !important;
          min-height:100% !important;
          overflow-x:hidden !important;
          overflow-y:auto !important;
          overscroll-behavior-y:auto !important;
          touch-action:pan-y !important;
          -webkit-overflow-scrolling:touch;
        }

        body.events-story-shell{
          position:static !important;
        }

        .events-wrap,
        .events-mobile-feed,
        .events-section.mobile-only,
        .mobile-events-grid{
          overflow:visible !important;
          overscroll-behavior:contain;
          touch-action:pan-y !important;
        }

        .event-feed-mobile,
        .event-feed-mobile.mobile-only,
        .event-feed-mobile .reel-feed{
          height:auto !important;
          min-height:0 !important;
          overflow:hidden !important;
          scroll-snap-type:none !important;
          overscroll-behavior:auto !important;
        }

        .events-chip-row{
          touch-action:pan-x pan-y !important;
        }

        .mobile-events-grid .event-card,
        .mobile-events-grid .event-card:hover,
        .mobile-events-grid .event-card.is-touch-active{
          border-radius:32px !important;
          clip-path:inset(0 round 32px) !important;
          overflow:hidden !important;
          touch-action:pan-y !important;
          transform:translateZ(0);
          -webkit-transform:translateZ(0);
          -webkit-backface-visibility:hidden;
          backface-visibility:hidden;
        }

        .mobile-events-grid .event-card::before,
        .mobile-events-grid .event-card::after,
        .mobile-events-grid .event-card-edge,
        .mobile-events-grid .event-card-noise,
        .mobile-events-grid .event-media,
        .mobile-events-grid .event-content{
          border-radius:inherit !important;
        }

        .mobile-events-grid .event-card.is-touch-active{
          transform:translateY(-3px) scale(1.004) !important;
        }

        .mobile-events-grid .event-card.is-touch-active .event-media{
          transform:scale(1.04) !important;
        }
      }

      @media(max-width:430px){
        .events-story-top{
          min-height:66px !important;
          gap:12px !important;
          padding:calc(env(safe-area-inset-top, 0px) + 15px) 50px 14px !important;
        }

        .events-story-brand{
          left:14px !important;
          top:calc(env(safe-area-inset-top, 0px) + 14px) !important;
          width:36px !important;
          height:36px !important;
          border-radius:12px !important;
        }

        .events-story-tabs{
          gap:12px !important;
        }

        .events-story-tab{
          font-size:13px !important;
          font-weight:800 !important;
          padding:7px 0 !important;
        }

        .events-story-tab.is-active::after{
          bottom:-4px !important;
          width:24px !important;
          height:3px !important;
        }

        .events-story-search{
          right:12px !important;
          top:calc(env(safe-area-inset-top, 0px) + 14px) !important;
          width:36px !important;
          height:36px !important;
          padding:6px !important;
        }
      }

      @media(max-width:360px){
        .events-story-top{
          gap:5px !important;
          padding-left:36px !important;
          padding-right:34px !important;
        }

        .events-story-brand{
          left:6px !important;
          width:30px !important;
          height:30px !important;
        }

        .events-story-tabs{gap:5px !important;}
        .events-story-tab{font-size:10px !important;}
        .events-story-search{right:4px !important;width:30px !important;height:30px !important;padding:5px !important;}
      }

      @media(max-width:320px){
        .events-story-top{
          gap:4px !important;
          padding-left:32px !important;
          padding-right:30px !important;
        }

        .events-story-brand{
          width:28px !important;
          height:28px !important;
          border-radius:9px !important;
        }

        .events-story-tabs{gap:4px !important;}
        .events-story-tab{font-size:9.4px !important;}
        .events-story-search{width:28px !important;height:28px !important;padding:4px !important;}
      }

    
      /* Event pill small-screen stability */
      .event-topline{
        min-width:0;
      }

      .event-pill-stack{
        min-width:0;
        max-width:100%;
      }

      .event-pill{
        max-width:100%;
        min-width:0;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .event-pill-soft{
        max-width:min(46%, 176px);
        min-width:0;
      }

      @media(max-width:430px){
        .mobile-events-grid .event-topline{
          display:grid;
          grid-template-columns:minmax(0, 1fr) auto;
          gap:8px;
          align-items:start;
        }

        .mobile-events-grid .event-pill-stack{
          display:flex;
          flex-wrap:wrap;
          gap:7px;
          min-width:0;
          max-width:100%;
        }

        .mobile-events-grid .event-pill{
          min-height:28px;
          padding-inline:10px;
          font-size:9px;
          letter-spacing:.62px;
          max-width:100%;
        }

        .mobile-events-grid .event-pill-soft{
          justify-self:end;
          max-width:116px;
          padding-inline:9px;
          font-size:8.8px;
          letter-spacing:.42px;
        }
      }

      @media(max-width:370px){
        .mobile-events-grid .event-topline{
          grid-template-columns:1fr;
        }

        .mobile-events-grid .event-pill-soft{
          justify-self:start;
          max-width:100%;
        }

        .mobile-events-grid .event-title{
          font-size:clamp(29px, 9vw, 38px) !important;
        }
      }
      /* End event pill small-screen stability */



      /* Android stable loader space */
      @media(max-width:700px){
        #mobileFeedLoader{
          min-height:44px;
          margin:12px 0 4px;
        }
      }
      /* End Android stable loader space */


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

        storiesBottomNav: true,

        bodyClass: "events-story-shell",

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("Events page error");

  }

};
