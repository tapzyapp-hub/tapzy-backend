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

function eventDayParts(event) {
  if (!event.startAt) return { month: "TAP", day: "--", time: "Soon" };
  const date = new Date(event.startAt);
  if (Number.isNaN(date.getTime())) return { month: "TAP", day: "--", time: "Soon" };
  return {
    month: date.toLocaleString("en-US", { month: "short" }).toUpperCase(),
    day: String(date.getDate()).padStart(2, "0"),
    time: date.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
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
    const day = eventDayParts(event);
    const place = eventPlaceLabel(event);
    const price = event.priceText ? "<span>" + escapeHtml(event.priceText) + "</span>" : "";
    const ticket = event.ticketUrl ? "<a class=\"tapzy-event-btn\" target=\"_blank\" rel=\"noopener noreferrer\" href=\"" + escapeHtml(event.ticketUrl) + "\">Tickets</a>" : "";
    return "<article class=\"tapzy-event-card\">" +
      "<a class=\"tapzy-event-open\" href=\"/events/view/" + encodeURIComponent(event.id) + "\">" +
        "<header class=\"tapzy-event-card-head\"><span class=\"tapzy-event-live-dot\"></span><strong>Tapzy Events</strong><em>" + escapeHtml(category) + "</em></header>" +
        "<div class=\"tapzy-event-center\">" +
          "<span class=\"tapzy-event-rank\">" + (index + 1) + "</span>" +
          "<h2>" + escapeHtml(event.title || "Untitled event") + "</h2>" +
          "<p>" + escapeHtml(day.time + " - " + place) + "</p>" +
          "<div class=\"tapzy-event-meta\"><span>" + escapeHtml(day.month + " " + day.day) + "</span>" + price + "</div>" +
        "</div>" +
      "</a>" +
      "<footer class=\"tapzy-event-actions\"><a class=\"tapzy-event-btn primary\" href=\"/events/view/" + encodeURIComponent(event.id) + "\">Open Event</a>" + ticket + "</footer>" +
    "</article>";
  }).join("");
}

function renderCleanStyles() {
  return [
    "<style>",
    ":root{--tz-blue:#2f7bff;--tz-blue-2:#1455df;--tz-glass:rgba(7,15,29,.94);--tz-glass-2:rgba(0,0,0,.96);--tz-line:rgba(116,198,255,.24);--tz-soft:rgba(255,255,255,.075);--tz-text:#fff;--tz-muted:rgba(235,244,255,.62);}",
    "html,body{background:#000!important;min-height:100%;overflow-x:hidden;color:#fff;}",
    "body.clean-events-shell{background:#000!important;}",
    ".clean-events-page{position:relative;min-height:100vh;padding:calc(env(safe-area-inset-top,0px) + 14px) 16px calc(118px + env(safe-area-inset-bottom,0px));color:var(--tz-text);background:#000;isolation:isolate;}",
    ".clean-events-page::before{content:\"\";position:fixed;inset:0;z-index:-1;background:#000;pointer-events:none;}",
    ".clean-events-page::after{display:none;}",
    ".premium-events-top{max-width:760px;margin:0 auto 10px;display:flex;align-items:center;gap:12px;padding:12px 13px;border:1px solid rgba(116,198,255,.18);border-radius:24px;background:linear-gradient(180deg,rgba(8,13,22,.96),rgba(0,0,0,.96));box-shadow:0 20px 64px rgba(0,0,0,.48),inset 0 1px 0 rgba(255,255,255,.065);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);}",
    ".premium-events-mark{width:48px;height:48px;border:1px solid rgba(255,255,255,.18);border-radius:17px;display:grid;place-items:center;background:linear-gradient(145deg,var(--tz-blue),var(--tz-blue-2));box-shadow:0 0 28px rgba(47,123,255,.42),0 14px 38px rgba(0,0,0,.46),inset 0 1px 0 rgba(255,255,255,.25);cursor:pointer;flex:0 0 auto;}",
    ".premium-events-mark img{width:72%;height:72%;object-fit:contain;display:block;filter:drop-shadow(0 5px 14px rgba(255,255,255,.14));}",
    ".premium-events-top p{margin:0 0 3px;color:rgba(177,214,255,.64);font-size:10px;font-weight:950;letter-spacing:2.4px;text-transform:uppercase;}",
    ".premium-events-top h1{margin:0;font-size:clamp(25px,6vw,35px);line-height:.96;font-weight:950;letter-spacing:0;color:#fff;text-shadow:0 0 28px rgba(62,142,255,.18);}",
    ".clean-events-filters{position:sticky;top:0;z-index:20;max-width:760px;margin:0 auto 12px;display:flex;gap:9px;overflow-x:auto;padding:10px;border:1px solid rgba(116,198,255,.14);border-radius:24px;background:linear-gradient(180deg,rgba(8,13,22,.94),rgba(0,0,0,.94));box-shadow:0 18px 58px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.055);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);scrollbar-width:none;}",
    ".clean-events-filters::-webkit-scrollbar{display:none;}",
    ".clean-events-filter{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 15px;border-radius:999px;border:1px solid rgba(137,205,255,.16);background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.025));color:rgba(245,249,255,.88);text-decoration:none;font-size:13px;font-weight:950;box-shadow:inset 0 1px 0 rgba(255,255,255,.055);}",
    ".clean-events-filter span{color:rgba(174,200,238,.54);font-size:11px;font-weight:950;}",
    ".clean-events-filter.is-active{background:linear-gradient(180deg,rgba(255,255,255,.97),rgba(228,239,255,.94));color:#061020;border-color:rgba(255,255,255,.78);box-shadow:0 18px 42px rgba(24,102,255,.18),inset 0 1px 0 rgba(255,255,255,.9);}",
    ".clean-events-filter.is-active span{color:rgba(6,16,32,.52);}",
    ".premium-events-count{max-width:760px;margin:0 auto 13px;padding:0 4px;color:rgba(209,224,248,.48);font-size:12px;font-weight:850;letter-spacing:.8px;text-transform:uppercase;}",
    ".premium-events-list{max-width:760px;margin:0 auto;display:grid;gap:18px;}",
    ".tapzy-event-card{position:relative;min-height:520px;border:1px solid rgba(116,198,255,.24);border-radius:34px;background:radial-gradient(circle at 50% 16%,rgba(47,123,255,.28),transparent 35%),linear-gradient(180deg,rgba(7,15,29,.96),rgba(0,0,0,.98) 62%,#000);box-shadow:0 28px 100px rgba(0,0,0,.70),0 0 54px rgba(55,137,255,.16),inset 0 1px 0 rgba(255,255,255,.08);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);overflow:hidden;}",
    ".tapzy-event-card::before{content:\"\";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(135deg,rgba(255,255,255,.11),transparent 28%,rgba(77,156,255,.08) 74%,transparent);pointer-events:none;}",
    ".tapzy-event-card::after{content:\"\";position:absolute;left:0;right:0;bottom:0;height:1px;background:linear-gradient(90deg,transparent,rgba(119,195,255,.25),transparent);pointer-events:none;}",
    ".tapzy-event-open{position:relative;z-index:1;min-height:430px;display:grid;grid-template-rows:auto 1fr;color:#fff;text-decoration:none;padding:28px;}",
    ".tapzy-event-card-head{display:flex;align-items:center;gap:12px;min-width:0;color:#fff;}",
    ".tapzy-event-live-dot{width:18px;height:18px;border-radius:50%;background:#4fd8ff;box-shadow:0 0 24px rgba(79,216,255,.72);flex:0 0 auto;}",
    ".tapzy-event-card-head strong{font-size:22px;font-weight:950;letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".tapzy-event-card-head em{margin-left:auto;font-style:normal;color:rgba(177,214,255,.62);font-size:11px;font-weight:950;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap;}",
    ".tapzy-event-center{align-self:center;justify-self:center;width:min(100%,560px);display:grid;justify-items:center;text-align:center;gap:16px;padding:28px 0 10px;}",
    ".tapzy-event-rank{width:96px;height:96px;border-radius:30px;display:grid;place-items:center;background:linear-gradient(145deg,var(--tz-blue),var(--tz-blue-2));box-shadow:0 0 44px rgba(47,123,255,.52),0 18px 58px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.18);font-size:36px;font-weight:950;color:#fff;}",
    ".tapzy-event-center h2{width:100%;margin:6px 0 0;font-size:clamp(34px,7vw,58px);line-height:.96;font-weight:950;letter-spacing:0;color:#fff;text-wrap:balance;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;text-shadow:0 12px 40px rgba(0,0,0,.42);}",
    ".tapzy-event-center p{max-width:520px;margin:0;color:rgba(235,244,255,.66);font-size:clamp(17px,3vw,24px);line-height:1.24;font-weight:760;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}",
    ".tapzy-event-meta{display:flex;justify-content:center;flex-wrap:wrap;gap:9px;margin-top:2px;}",
    ".tapzy-event-meta span{min-height:32px;display:inline-flex;align-items:center;padding:0 12px;border-radius:999px;border:1px solid rgba(137,205,255,.18);background:rgba(255,255,255,.06);color:rgba(226,239,255,.72);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:1px;}",
    ".tapzy-event-actions{position:relative;z-index:1;display:flex;justify-content:center;gap:10px;padding:0 28px 28px;}",
    ".tapzy-event-btn{min-height:46px;display:inline-flex;align-items:center;justify-content:center;padding:0 18px;border-radius:16px;border:1px solid rgba(137,205,255,.18);background:rgba(255,255,255,.07);color:#fff;text-decoration:none;font-size:13px;font-weight:950;box-shadow:inset 0 1px 0 rgba(255,255,255,.08);}",
    ".tapzy-event-btn.primary{background:linear-gradient(145deg,var(--tz-blue),var(--tz-blue-2));border-color:rgba(255,255,255,.20);box-shadow:0 0 28px rgba(47,123,255,.34),inset 0 1px 0 rgba(255,255,255,.18);}",
    ".clean-events-empty{max-width:760px;margin:80px auto;text-align:center;color:rgba(255,255,255,.72);padding:28px;border:1px solid var(--tz-line);border-radius:28px;background:radial-gradient(circle at 50% 0%,rgba(47,118,255,.20),transparent 44%),linear-gradient(180deg,var(--tz-glass),var(--tz-glass-2));backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);}",
    ".clean-events-empty h2{margin:0 0 10px;color:#fff;font-size:34px;}",
    "@media(max-width:720px){.clean-events-page{padding-left:16px;padding-right:16px}.premium-events-top{border-radius:24px;padding:12px}.premium-events-mark{width:48px;height:48px}.premium-events-top h1{font-size:29px}.clean-events-filters{border-radius:22px;padding:9px}.clean-events-filter{min-height:42px;padding:0 16px;font-size:14px}.premium-events-list{gap:16px}.tapzy-event-card{min-height:470px;border-radius:32px}.tapzy-event-open{min-height:388px;padding:25px}.tapzy-event-rank{width:84px;height:84px;border-radius:27px;font-size:31px}.tapzy-event-center h2{font-size:39px}.tapzy-event-center p{font-size:19px}.tapzy-event-card-head strong{font-size:20px}.tapzy-event-actions{padding:0 25px 25px}}",
    "@media(max-width:430px){.clean-events-page{padding-left:16px;padding-right:16px}.premium-events-top{gap:12px}.premium-events-mark{width:46px;height:46px}.premium-events-top p{font-size:10px}.premium-events-top h1{font-size:27px}.tapzy-event-card{min-height:430px;border-radius:30px}.tapzy-event-open{min-height:352px;padding:22px}.tapzy-event-card-head em{display:none}.tapzy-event-card-head strong{font-size:19px}.tapzy-event-live-dot{width:16px;height:16px}.tapzy-event-rank{width:76px;height:76px;border-radius:24px;font-size:28px}.tapzy-event-center{gap:13px}.tapzy-event-center h2{font-size:33px}.tapzy-event-center p{font-size:17px}.tapzy-event-actions{padding:0 22px 22px}.tapzy-event-btn{min-height:44px;border-radius:15px}}",
    "@media(max-width:370px){.tapzy-event-card{min-height:400px}.tapzy-event-open{min-height:326px;padding:20px}.tapzy-event-rank{width:68px;height:68px;border-radius:22px;font-size:25px}.tapzy-event-center h2{font-size:29px}.tapzy-event-center p{font-size:15px}.premium-events-top h1{font-size:25px}}",
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
      "<div><p>Tapzy Events</p><h1>Tonight & beyond</h1></div>",
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
