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

function compactEventMeta(event) {
  return [eventTimeLabel(event), eventPlaceLabel(event)].filter(Boolean).join(" - ");
}

function renderEventRows(events) {
  return events.map((event, index) => {
    const category = normalizeCategory(event) || "Event";
    const price = event.priceText ? "<span>" + escapeHtml(event.priceText) + "</span>" : "";
    const ticket = event.ticketUrl ? "<a class=\"premium-event-action\" target=\"_blank\" rel=\"noopener noreferrer\" href=\"" + escapeHtml(event.ticketUrl) + "\">Tickets</a>" : "";
    return "<article class=\"premium-event-row\">" +
      "<a class=\"premium-event-main\" href=\"/events/view/" + encodeURIComponent(event.id) + "\">" +
        "<span class=\"premium-event-rank\">" + (index + 1) + "</span>" +
        "<span class=\"premium-event-copy\"><strong>" + escapeHtml(event.title || "Untitled event") + "</strong>" +
        "<small>" + escapeHtml(compactEventMeta(event)) + "</small></span>" +
      "</a>" +
      "<span class=\"premium-event-side\"><span>" + escapeHtml(category) + "</span>" + price + ticket + "</span>" +
    "</article>";
  }).join("");
}

function renderCleanStyles() {
  return [
    "<style>",
    "html,body{background:#061327!important;min-height:100%;overflow-x:hidden;}",
    ".clean-events-page{min-height:100vh;padding:calc(env(safe-area-inset-top,0px) + 18px) 14px calc(88px + env(safe-area-inset-bottom,0px));color:#fff;background:radial-gradient(circle at 50% -12%,rgba(34,112,255,.26),transparent 34%),linear-gradient(180deg,#071a34 0%,#061327 42%,#030913 100%);}",
    ".premium-events-top{max-width:980px;margin:0 auto 16px;display:flex;align-items:center;gap:13px;padding:4px 2px 8px;}",
    ".premium-events-mark{width:48px;height:48px;border:1px solid rgba(255,255,255,.18);border-radius:16px;display:grid;place-items:center;background:linear-gradient(145deg,rgba(47,123,255,.92),rgba(20,85,223,.88));box-shadow:0 18px 46px rgba(20,92,255,.32),inset 0 1px 0 rgba(255,255,255,.22);cursor:pointer;}",
    ".premium-events-mark img{width:72%;height:72%;object-fit:contain;display:block;}",
    ".premium-events-top p{margin:0;color:rgba(185,208,244,.72);font-size:12px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;}",
    ".premium-events-top h1{margin:1px 0 0;font-size:26px;line-height:1;font-weight:950;letter-spacing:0;}",
    ".clean-events-filters{max-width:980px;margin:0 auto 16px;display:flex;gap:9px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;}",
    ".clean-events-filters::-webkit-scrollbar{display:none;}",
    ".clean-events-filter{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:0 14px;border-radius:999px;border:1px solid rgba(160,195,245,.18);background:rgba(17,39,72,.58);color:rgba(239,246,255,.86);text-decoration:none;font-size:12px;font-weight:900;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:inset 0 1px 0 rgba(255,255,255,.08);}",
    ".clean-events-filter span{color:rgba(190,211,244,.62);font-size:11px;}",
    ".clean-events-filter.is-active{background:rgba(238,246,255,.96);color:#071527;border-color:rgba(255,255,255,.68);}",
    ".clean-events-filter.is-active span{color:rgba(7,21,39,.55);}",
    ".premium-events-list{max-width:980px;margin:0 auto;display:grid;gap:14px;}",
    ".premium-event-row{min-height:104px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;padding:17px 20px 17px 18px;border:1px solid rgba(156,188,233,.22);border-radius:28px;background:linear-gradient(180deg,rgba(20,43,78,.78),rgba(14,34,64,.74));box-shadow:0 18px 50px rgba(0,0,0,.26),inset 0 1px 0 rgba(255,255,255,.08);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);}",
    ".premium-event-main{min-width:0;display:grid;grid-template-columns:68px minmax(0,1fr);align-items:center;gap:18px;color:#fff;text-decoration:none;}",
    ".premium-event-rank{width:54px;height:54px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(145deg,rgba(35,91,178,.92),rgba(22,67,139,.92));color:#c9dcff;font-size:21px;font-weight:950;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 10px 24px rgba(13,57,139,.24);}",
    ".premium-event-copy{min-width:0;display:grid;gap:8px;}",
    ".premium-event-copy strong{display:block;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:clamp(22px,3.1vw,33px);line-height:1.05;font-weight:950;letter-spacing:0;}",
    ".premium-event-copy small{display:block;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(204,216,235,.66);font-size:clamp(15px,2.2vw,23px);line-height:1.15;font-weight:650;}",
    ".premium-event-side{display:flex;align-items:center;gap:8px;max-width:220px;justify-content:flex-end;flex-wrap:wrap;}",
    ".premium-event-side span,.premium-event-action{min-height:30px;display:inline-flex;align-items:center;padding:0 10px;border-radius:999px;border:1px solid rgba(174,205,255,.16);background:rgba(255,255,255,.055);color:rgba(220,235,255,.72);font-size:11px;font-weight:900;text-decoration:none;white-space:nowrap;}",
    ".premium-event-action{color:#fff;background:rgba(47,123,255,.24);}",
    ".clean-events-empty{max-width:760px;margin:80px auto;text-align:center;color:rgba(255,255,255,.72);}",
    ".clean-events-empty h2{margin:0 0 10px;color:#fff;font-size:34px;}",
    "@media(max-width:720px){.clean-events-page{padding-left:12px;padding-right:12px;}.premium-events-top{margin-bottom:12px}.premium-events-list{gap:12px}.premium-event-row{min-height:92px;padding:14px 14px;border-radius:24px;grid-template-columns:1fr}.premium-event-main{grid-template-columns:62px minmax(0,1fr);gap:13px}.premium-event-rank{width:52px;height:52px;border-radius:17px;font-size:19px}.premium-event-side{display:none}.premium-event-copy strong{font-size:24px}.premium-event-copy small{font-size:17px}.clean-events-filters{margin-bottom:14px}}",
    "@media(max-width:390px){.premium-event-main{grid-template-columns:54px minmax(0,1fr);gap:11px}.premium-event-rank{width:48px;height:48px;border-radius:16px;font-size:18px}.premium-event-copy strong{font-size:20px}.premium-event-copy small{font-size:15px}.premium-event-row{border-radius:22px}}",
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
      ? "<section class=\"premium-events-list\" aria-label=\"Events\">" + renderEventRows(visibleEvents) + "</section>"
      : "<section class=\"clean-events-empty\"><h2>No events found here yet.</h2><p>Try another filter, or ask Tapzy what kind of plan you want and it can suggest a fallback.</p></section>";

    const body = [
      "<main class=\"clean-events-page\">",
      "<header class=\"premium-events-top\">",
      "<button class=\"premium-events-mark tz-ai-trigger\" type=\"button\" data-tapzy-ai-open aria-label=\"Ask Tapzy about events\"><img src=\"/images/tapzy-mark-white.png\" alt=\"\" aria-hidden=\"true\" /></button>",
      "<div><p>Tapzy Events</p><h1>Events</h1></div>",
      "</header>",
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
