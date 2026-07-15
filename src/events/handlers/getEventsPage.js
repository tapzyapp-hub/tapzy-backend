const prisma = require("../../prisma");
const { renderShell, renderTapzyAssistant, escapeHtml } = require("../../utils");
const { MAIN_QUERY_LIMIT } = require("../config");
const {
  normalizeCategory,
  eventMatchesCategoryGroup,
  sortRanked,
  buildWhere,
} = require("../helpers/eventServerUtils");
const { triggerEventAutoRefreshIfDue } = require("../../services/eventAutoRefreshScheduler");

const FILTERS = [
  { key: "all", label: "All" },
  { key: "sports", label: "Sports" },
  { key: "concerts", label: "Concerts" },
  { key: "dances", label: "Dances" },
  { key: "other", label: "Other" },
];

function cleanCategory(value) {
  const category = String(value || "all").trim().toLowerCase();
  return FILTERS.some((item) => item.key === category) ? category : "all";
}

function filterHref(filter) {
  return filter === "all" ? "/events" : "/events?category=" + encodeURIComponent(filter);
}

function isOtherCategory(event) {
  return !eventMatchesCategoryGroup(event, "sports") && !eventMatchesCategoryGroup(event, "concerts") && !eventMatchesCategoryGroup(event, "dances");
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
    "html,body{background:#000!important;min-height:100%;overflow-x:hidden;color:#fff;}",
    "body.clean-events-shell{background:#000!important;}",
    ".clean-events-page{min-height:100vh;padding:calc(env(safe-area-inset-top,0px) + 18px) 16px calc(106px + env(safe-area-inset-bottom,0px));color:#fff;background:radial-gradient(circle at 50% 0%,rgba(47,118,255,.30),transparent 38%),radial-gradient(circle at 12% 18%,rgba(66,153,255,.12),transparent 30%),linear-gradient(180deg,#050b15 0%,#000 62%,#000 100%);}",
    ".premium-events-top{max-width:980px;margin:0 auto 18px;display:flex;align-items:center;gap:14px;padding:2px 2px 8px;}",
    ".premium-events-mark{width:58px;height:58px;border:1px solid rgba(140,203,255,.28);border-radius:19px;display:grid;place-items:center;background:linear-gradient(145deg,#2f7bff,#1455df);box-shadow:0 0 34px rgba(47,123,255,.44),0 18px 54px rgba(0,0,0,.44),inset 0 1px 0 rgba(255,255,255,.24);cursor:pointer;}",
    ".premium-events-mark img{width:72%;height:72%;object-fit:contain;display:block;filter:drop-shadow(0 4px 12px rgba(255,255,255,.12));}",
    ".premium-events-top p{margin:0 0 4px;color:rgba(173,209,255,.68);font-size:12px;font-weight:950;letter-spacing:2.4px;text-transform:uppercase;}",
    ".premium-events-top h1{margin:0;font-size:38px;line-height:.95;font-weight:950;letter-spacing:0;color:#fff;text-shadow:0 0 32px rgba(62,142,255,.22);}",
    ".clean-events-filters{max-width:980px;margin:0 auto 14px;display:flex;gap:10px;overflow-x:auto;padding:0 1px 6px;scrollbar-width:none;}",
    ".clean-events-filters::-webkit-scrollbar{display:none;}",
    ".clean-events-filter{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;min-height:46px;padding:0 18px;border-radius:999px;border:1px solid rgba(137,205,255,.20);background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.035));color:rgba(245,249,255,.90);text-decoration:none;font-size:14px;font-weight:900;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 12px 34px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.08);}",
    ".clean-events-filter span{color:rgba(174,200,238,.58);font-size:12px;font-weight:900;}",
    ".clean-events-filter.is-active{background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(229,238,252,.94));color:#061020;border-color:rgba(255,255,255,.72);box-shadow:0 18px 42px rgba(24,102,255,.18),inset 0 1px 0 rgba(255,255,255,.9);}",
    ".clean-events-filter.is-active span{color:rgba(6,16,32,.52);}",
    ".premium-events-count{max-width:980px;margin:0 auto 16px;color:rgba(209,224,248,.52);font-size:13px;font-weight:850;letter-spacing:.5px;}",
    ".premium-events-list{max-width:980px;margin:0 auto;display:grid;gap:16px;}",
    ".premium-event-row{position:relative;min-height:118px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;padding:19px 22px 19px 20px;border:1px solid rgba(130,188,255,.22);border-radius:30px;background:radial-gradient(circle at 12% 12%,rgba(47,123,255,.18),transparent 36%),linear-gradient(180deg,rgba(12,21,36,.88),rgba(4,8,15,.82));box-shadow:0 24px 80px rgba(0,0,0,.44),0 0 0 1px rgba(55,137,255,.05),inset 0 1px 0 rgba(255,255,255,.08);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);overflow:hidden;}",
    ".premium-event-row::before{content:\"\";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(135deg,rgba(255,255,255,.11),transparent 28%,rgba(77,156,255,.06) 72%,transparent);pointer-events:none;}",
    ".premium-event-row::after{content:\"\";position:absolute;left:82px;right:22px;bottom:0;height:1px;background:linear-gradient(90deg,transparent,rgba(119,195,255,.18),transparent);pointer-events:none;}",
    ".premium-event-main{position:relative;z-index:1;min-width:0;display:grid;grid-template-columns:72px minmax(0,1fr);align-items:center;gap:20px;color:#fff;text-decoration:none;}",
    ".premium-event-rank{width:58px;height:58px;border-radius:19px;display:grid;place-items:center;background:linear-gradient(145deg,rgba(47,123,255,.78),rgba(18,75,173,.78));color:#dceaff;font-size:22px;font-weight:950;box-shadow:0 0 26px rgba(47,123,255,.18),inset 0 1px 0 rgba(255,255,255,.14);}",
    ".premium-event-copy{min-width:0;display:grid;gap:9px;}",
    ".premium-event-copy strong{display:block;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:clamp(23px,3.2vw,34px);line-height:1.04;font-weight:950;letter-spacing:0;color:#fff;text-shadow:0 8px 30px rgba(0,0,0,.32);}",
    ".premium-event-copy small{display:block;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(214,226,246,.58);font-size:clamp(16px,2.25vw,24px);line-height:1.15;font-weight:700;}",
    ".premium-event-side{position:relative;z-index:1;display:flex;align-items:center;gap:8px;max-width:230px;justify-content:flex-end;flex-wrap:wrap;}",
    ".premium-event-side span,.premium-event-action{min-height:32px;display:inline-flex;align-items:center;padding:0 11px;border-radius:999px;border:1px solid rgba(137,205,255,.16);background:rgba(255,255,255,.06);color:rgba(226,239,255,.70);font-size:11px;font-weight:950;text-decoration:none;white-space:nowrap;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);}",
    ".premium-event-action{color:#fff;background:linear-gradient(145deg,rgba(47,123,255,.32),rgba(20,85,223,.22));border-color:rgba(100,178,255,.28);}",
    ".clean-events-empty{max-width:760px;margin:80px auto;text-align:center;color:rgba(255,255,255,.72);padding:28px;border:1px solid rgba(137,205,255,.18);border-radius:28px;background:rgba(255,255,255,.055);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);}",
    ".clean-events-empty h2{margin:0 0 10px;color:#fff;font-size:34px;}",
    "@media(max-width:720px){.clean-events-page{padding-left:16px;padding-right:16px}.premium-events-top{margin-bottom:18px}.premium-events-mark{width:64px;height:64px;border-radius:20px}.premium-events-top h1{font-size:38px}.clean-events-filters{gap:11px;margin-bottom:12px}.clean-events-filter{min-height:48px;padding:0 20px;font-size:15px}.premium-events-count{margin-bottom:18px}.premium-events-list{gap:18px}.premium-event-row{min-height:116px;padding:18px 18px;border-radius:28px;grid-template-columns:1fr}.premium-event-main{grid-template-columns:74px minmax(0,1fr);gap:18px}.premium-event-rank{width:62px;height:62px;border-radius:20px;font-size:22px}.premium-event-side{display:none}.premium-event-copy strong{font-size:29px}.premium-event-copy small{font-size:20px}}",
    "@media(max-width:430px){.clean-events-page{padding-left:14px;padding-right:14px}.premium-events-top{gap:14px}.premium-events-mark{width:58px;height:58px}.premium-events-top p{font-size:12px}.premium-events-top h1{font-size:35px}.premium-event-main{grid-template-columns:64px minmax(0,1fr);gap:14px}.premium-event-rank{width:56px;height:56px;border-radius:18px;font-size:20px}.premium-event-copy strong{font-size:24px}.premium-event-copy small{font-size:17px}.premium-event-row{min-height:104px;border-radius:25px;padding:16px 15px}.clean-events-filter{font-size:14px;padding:0 18px}}",
    "@media(max-width:370px){.premium-event-main{grid-template-columns:56px minmax(0,1fr);gap:12px}.premium-event-rank{width:50px;height:50px;border-radius:16px;font-size:18px}.premium-event-copy strong{font-size:21px}.premium-event-copy small{font-size:15px}.premium-event-row{border-radius:22px}.premium-events-top h1{font-size:32px}}",
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

    const allEvents = sortRanked(rawEvents);
    const events = activeCategory === "all"
      ? allEvents
      : activeCategory === "other"
        ? allEvents.filter(isOtherCategory)
        : allEvents.filter((event) => eventMatchesCategoryGroup(event, activeCategory));
    const visibleEvents = events;
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
      all: allEvents.length,
      sports: allEvents.filter((event) => eventMatchesCategoryGroup(event, "sports")).length,
      concerts: allEvents.filter((event) => eventMatchesCategoryGroup(event, "concerts")).length,
      dances: allEvents.filter((event) => eventMatchesCategoryGroup(event, "dances")).length,
      other: allEvents.filter(isOtherCategory).length,
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
      "<div class=\"premium-events-count\">Showing " + visibleEvents.length + " of " + allEvents.length + " events</div>",
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
