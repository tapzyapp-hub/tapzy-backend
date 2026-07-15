const prisma = require("../../prisma");
const { renderShell, renderTapzyAssistant, escapeHtml } = require("../../utils");
const { MAIN_QUERY_LIMIT } = require("../config");
const {
  normalizeCategory,
  eventMatchesCategoryGroup,
  sortRanked,
  buildWhere,
  isAllowedHotCategory,
} = require("../helpers/eventServerUtils");
const { renderEventCard } = require("../render/renderEventParts");
const { triggerEventAutoRefreshIfDue } = require("../../services/eventAutoRefreshScheduler");

const FILTERS = [
  { key: "all", label: "All" },
  { key: "sports", label: "Sports" },
  { key: "concerts", label: "Concerts" },
  { key: "dances", label: "Dances" },
];

function cleanCategory(value) {
  const category = String(value || "all").trim().toLowerCase();
  return FILTERS.some((item) => item.key === category) ? category : "all";
}

function filterHref(filter) {
  return filter === "all" ? "/events" : "/events?category=" + encodeURIComponent(filter);
}

function eventTimeLabel(event) {
  if (!event.startAt) return "Time coming soon";
  const date = new Date(event.startAt);
  if (Number.isNaN(date.getTime())) return "Time coming soon";
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function eventPlaceLabel(event) {
  return [event.venueName, event.city].filter(Boolean).join(" - ") || event.address || "Location coming soon";
}

function renderFilter(filter, activeCategory, counts) {
  const active = activeCategory === filter.key ? " is-active" : "";
  return "<a class=\"clean-events-filter" + active + "\" href=\"" + filterHref(filter.key) + "\">" +
    escapeHtml(filter.label) + " <span>" + escapeHtml(counts[filter.key] || 0) + "</span></a>";
}

function renderQuickList(events) {
  return events.slice(0, 8).map((event, index) => {
    return "<a class=\"clean-event-row\" href=\"/events/view/" + encodeURIComponent(event.id) + "\">" +
      "<span class=\"clean-event-rank\">" + (index + 1) + "</span>" +
      "<span class=\"clean-event-row-main\"><strong>" + escapeHtml(event.title || "Untitled event") + "</strong>" +
      "<small>" + escapeHtml(eventTimeLabel(event)) + " - " + escapeHtml(eventPlaceLabel(event)) + "</small></span>" +
      "<span class=\"clean-event-row-chip\">" + escapeHtml(normalizeCategory(event) || "Event") + "</span>" +
      "</a>";
  }).join("");
}

function renderCleanStyles() {
  return [
    "<style>",
    "html,body{background:#000!important;min-height:100%;overflow-x:hidden;}",
    ".clean-events-page{min-height:100vh;padding:calc(env(safe-area-inset-top,0px) + 22px) 16px calc(88px + env(safe-area-inset-bottom,0px));color:#fff;background:radial-gradient(circle at 50% 0%,rgba(34,112,255,.22),transparent 34%),#000;}",
    ".clean-events-hero{max-width:1080px;margin:0 auto 18px;display:grid;grid-template-columns:auto 1fr;align-items:center;gap:16px;padding:18px 0 8px;}",
    ".clean-events-mark{width:64px;height:64px;border:0;border-radius:20px;display:grid;place-items:center;background:linear-gradient(145deg,#2f7bff,#1455df);box-shadow:0 0 42px rgba(47,123,255,.42);cursor:pointer;}",
    ".clean-events-mark img{width:72%;height:72%;object-fit:contain;display:block;}",
    ".clean-events-kicker{margin:0 0 4px;color:#89b9ff;font-size:12px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;}",
    ".clean-events-hero h1{margin:0;font-size:clamp(32px,7vw,68px);line-height:.94;letter-spacing:0;font-weight:950;}",
    ".clean-events-copy{max-width:640px;margin:10px 0 0;color:rgba(255,255,255,.68);font-size:15px;line-height:1.45;}",
    ".clean-events-filters{max-width:1080px;margin:0 auto 20px;display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;}",
    ".clean-events-filters::-webkit-scrollbar{display:none;}",
    ".clean-events-filter{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:0 15px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;text-decoration:none;font-size:13px;font-weight:850;}",
    ".clean-events-filter span{color:rgba(255,255,255,.58);font-size:12px;}",
    ".clean-events-filter.is-active{background:#fff;color:#07101f;border-color:#fff;}",
    ".clean-events-filter.is-active span{color:rgba(7,16,31,.58);}",
    ".clean-events-snapshot{max-width:1080px;margin:0 auto 22px;display:grid;gap:8px;}",
    ".clean-event-row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:10px;min-height:58px;padding:10px 12px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(255,255,255,.055);color:#fff;text-decoration:none;}",
    ".clean-event-rank{width:28px;height:28px;border-radius:10px;display:grid;place-items:center;background:rgba(47,123,255,.22);color:#aecdff;font-size:12px;font-weight:900;}",
    ".clean-event-row-main{min-width:0;display:grid;gap:4px;}",
    ".clean-event-row-main strong{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".clean-event-row-main small{font-size:12px;color:rgba(255,255,255,.58);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".clean-event-row-chip{font-size:11px;font-weight:900;color:#9fc5ff;text-transform:uppercase;letter-spacing:.6px;}",
    ".clean-events-grid{max-width:1080px;margin:0 auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;}",
    ".clean-events-grid .event-card{min-height:520px;}",
    ".clean-events-empty{max-width:760px;margin:80px auto;text-align:center;color:rgba(255,255,255,.72);}",
    ".clean-events-empty h2{margin:0 0 10px;color:#fff;font-size:34px;}",
    "@media(max-width:900px){.clean-events-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.clean-events-grid .event-card{min-height:480px;}}",
    "@media(max-width:640px){.clean-events-page{padding-left:12px;padding-right:12px;}.clean-events-hero{grid-template-columns:1fr;text-align:center;justify-items:center;margin-bottom:14px;}.clean-events-copy{font-size:14px;}.clean-events-grid{grid-template-columns:1fr;gap:16px;}.clean-events-grid .event-card{min-height:min(72svh,620px);}.clean-event-row{grid-template-columns:30px minmax(0,1fr);}.clean-event-row-chip{display:none;}}",
    "</style>",
  ].join("");
}

module.exports = async function getEventsPage(req, res) {
  try {
    triggerEventAutoRefreshIfDue("events-page-clean");

    const currentProfile = req.currentProfile || null;
    const now = new Date();
    const activeCategory = cleanCategory(req.query.category);
    const rawEvents = await prisma.eventFinderItem.findMany({
      where: buildWhere({ city: "", category: "", now }),
      orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
      take: MAIN_QUERY_LIMIT,
    });

    const hotEvents = sortRanked(rawEvents.filter(isAllowedHotCategory));
    const events = activeCategory === "all"
      ? hotEvents
      : hotEvents.filter((event) => eventMatchesCategoryGroup(event, activeCategory));
    const visibleEvents = events.slice(0, 36);
    const eventIds = visibleEvents.map((event) => event.id);
    const goingCounts = new Map();
    let goingSet = new Set();

    if (eventIds.length) {
      const [countRows, myRows] = await Promise.all([
        prisma.eventAttendance.groupBy({
          by: ["eventId"],
          where: { eventId: { in: eventIds }, status: "going" },
          _count: { eventId: true },
        }),
        currentProfile
          ? prisma.eventAttendance.findMany({
              where: { eventId: { in: eventIds }, profileId: currentProfile.id, status: "going" },
              select: { eventId: true },
            })
          : Promise.resolve([]),
      ]);

      for (const row of countRows) goingCounts.set(row.eventId, row._count.eventId || 0);
      goingSet = new Set(myRows.map((row) => row.eventId));
    }

    const counts = {
      all: hotEvents.length,
      sports: hotEvents.filter((event) => eventMatchesCategoryGroup(event, "sports")).length,
      concerts: hotEvents.filter((event) => eventMatchesCategoryGroup(event, "concerts")).length,
      dances: hotEvents.filter((event) => eventMatchesCategoryGroup(event, "dances")).length,
    };

    const eventsHtml = visibleEvents.length
      ? [
          "<section class=\"clean-events-snapshot\" aria-label=\"Top events snapshot\">" + renderQuickList(visibleEvents) + "</section>",
          "<section class=\"clean-events-grid\" aria-label=\"Events\">" + visibleEvents.map((event) => renderEventCard(event, currentProfile, goingSet, goingCounts)).join("") + "</section>",
        ].join("")
      : "<section class=\"clean-events-empty\"><h2>No events found here yet.</h2><p>Try another filter, or ask Tapzy what kind of plan you want and it can suggest a fallback.</p></section>";

    const body = [
      "<main class=\"clean-events-page\">",
      "<section class=\"clean-events-hero\">",
      "<button class=\"clean-events-mark tz-ai-trigger\" type=\"button\" data-tapzy-ai-open aria-label=\"Ask Tapzy about events\"><img src=\"/images/tapzy-mark-white.png\" alt=\"\" aria-hidden=\"true\" /></button>",
      "<div><p class=\"clean-events-kicker\">Tapzy Events</p><h1>Find something worth doing.</h1><p class=\"clean-events-copy\">A clean feed of Tapzy events. Ask Tapzy reads the same event data and can help pick one.</p></div>",
      "</section>",
      "<nav class=\"clean-events-filters\" aria-label=\"Event filters\">" + FILTERS.map((filter) => renderFilter(filter, activeCategory, counts)).join("") + "</nav>",
      eventsHtml,
      "</main>",
      renderTapzyAssistant({ username: currentProfile?.username || "User", pageType: "events" }),
      renderCleanStyles(),
    ].join("");

    res.send(renderShell("Events", body, "", {
      currentProfile,
      pageTitle: "Events",
      pageType: "events",
      activeNav: "events",
      hideTopBar: true,
      bodyClass: "clean-events-shell",
    }));
  } catch (error) {
    console.error("Clean events page error:", error);
    res.status(500).send("Events page error");
  }
};
