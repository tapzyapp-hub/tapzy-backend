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
    const ticket = event.ticketUrl ? "<a class=\"premium-event-action\" target=\"_blank\" rel=\"noopener noreferrer\" href=\"" + escapeHtml(event.ticketUrl) + "\">Tickets</a>" : "";
    return "<article class=\"premium-event-row\">" +
      "<a class=\"premium-event-main\" href=\"/events/view/" + encodeURIComponent(event.id) + "\">" +
        "<span class=\"premium-event-rank\"><b>" + (index + 1) + "</b></span>" +
        "<span class=\"premium-event-copy\"><span class=\"premium-event-eyebrow\"><em>" + escapeHtml(category) + "</em><i>" + escapeHtml(day.month + " " + day.day) + "</i></span>" +
        "<strong>" + escapeHtml(event.title || "Untitled event") + "</strong>" +
        "<small>" + escapeHtml(day.time + " - " + place) + "</small></span>" +
      "</a>" +
      "<span class=\"premium-event-side\"><span>" + escapeHtml(category) + "</span>" + price + ticket + "</span>" +
    "</article>";
  }).join("");
}

function renderCleanStyles() {
  return [
    "<style>",
    ":root{--tz-blue:#2f7bff;--tz-blue-2:#1455df;--tz-glass:rgba(7,15,29,.94);--tz-glass-2:rgba(0,0,0,.96);--tz-line:rgba(116,198,255,.24);--tz-soft:rgba(255,255,255,.075);--tz-text:#fff;--tz-muted:rgba(235,244,255,.62);}",
    "html,body{background:#000!important;min-height:100%;overflow-x:hidden;color:#fff;}",
    "body.clean-events-shell{background:#000!important;}",
    ".clean-events-page{position:relative;min-height:100vh;padding:calc(env(safe-area-inset-top,0px) + 14px) 16px calc(116px + env(safe-area-inset-bottom,0px));color:var(--tz-text);background:#000;isolation:isolate;}",
    ".clean-events-page::before{content:\"\";position:fixed;inset:0;z-index:-1;background:#000;pointer-events:none;}",
    ".clean-events-page::after{display:none;}",
    ".premium-events-top{max-width:960px;margin:0 auto 12px;display:flex;align-items:center;gap:14px;padding:16px;border:1px solid var(--tz-line);border-radius:28px;background:radial-gradient(circle at 50% 0%,rgba(47,118,255,.28),transparent 42%),linear-gradient(180deg,var(--tz-glass),var(--tz-glass-2));box-shadow:0 28px 90px rgba(0,0,0,.46),0 0 44px rgba(55,137,255,.18),inset 0 1px 0 rgba(255,255,255,.08);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);}",
    ".premium-events-mark{width:58px;height:58px;border:1px solid rgba(255,255,255,.18);border-radius:20px;display:grid;place-items:center;background:linear-gradient(145deg,var(--tz-blue),var(--tz-blue-2));box-shadow:0 0 34px rgba(47,123,255,.48),0 18px 48px rgba(0,0,0,.44),inset 0 1px 0 rgba(255,255,255,.25);cursor:pointer;flex:0 0 auto;}",
    ".premium-events-mark img{width:72%;height:72%;object-fit:contain;display:block;filter:drop-shadow(0 5px 14px rgba(255,255,255,.14));}",
    ".premium-events-top p{margin:0 0 5px;color:rgba(177,214,255,.70);font-size:11px;font-weight:950;letter-spacing:2.7px;text-transform:uppercase;}",
    ".premium-events-top h1{margin:0;font-size:clamp(28px,7vw,44px);line-height:.94;font-weight:950;letter-spacing:0;color:#fff;text-shadow:0 0 34px rgba(62,142,255,.24);}",
    ".clean-events-filters{position:sticky;top:0;z-index:20;max-width:960px;margin:0 auto 12px;display:flex;gap:9px;overflow-x:auto;padding:12px;border:1px solid rgba(116,198,255,.18);border-radius:26px;background:radial-gradient(circle at 50% 0%,rgba(47,118,255,.18),transparent 48%),linear-gradient(180deg,rgba(7,15,29,.86),rgba(0,0,0,.88));box-shadow:0 20px 70px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);scrollbar-width:none;}",
    ".clean-events-filters::-webkit-scrollbar{display:none;}",
    ".clean-events-filter{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:0 16px;border-radius:999px;border:1px solid rgba(137,205,255,.18);background:rgba(255,255,255,.06);color:rgba(245,249,255,.88);text-decoration:none;font-size:13px;font-weight:950;box-shadow:inset 0 1px 0 rgba(255,255,255,.06);}",
    ".clean-events-filter span{color:rgba(174,200,238,.54);font-size:11px;font-weight:950;}",
    ".clean-events-filter.is-active{background:linear-gradient(180deg,rgba(255,255,255,.97),rgba(228,239,255,.94));color:#061020;border-color:rgba(255,255,255,.78);box-shadow:0 18px 42px rgba(24,102,255,.18),inset 0 1px 0 rgba(255,255,255,.9);}",
    ".clean-events-filter.is-active span{color:rgba(6,16,32,.52);}",
    ".premium-events-count{max-width:960px;margin:0 auto 13px;padding:0 4px;color:rgba(209,224,248,.48);font-size:12px;font-weight:850;letter-spacing:.8px;text-transform:uppercase;}",
    ".premium-events-list{max-width:960px;margin:0 auto;display:grid;gap:12px;}",
    ".premium-event-row{position:relative;min-height:104px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;padding:15px 18px 15px 15px;border:1px solid var(--tz-line);border-radius:28px;background:radial-gradient(circle at 50% 0%,rgba(47,118,255,.20),transparent 44%),linear-gradient(180deg,rgba(7,15,29,.94),rgba(0,0,0,.94));box-shadow:0 24px 80px rgba(0,0,0,.48),0 0 38px rgba(55,137,255,.10),inset 0 1px 0 rgba(255,255,255,.08);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);overflow:hidden;transform:translateZ(0);}",
    ".premium-event-row::before{content:\"\";position:absolute;inset:-1px;border-radius:inherit;background:linear-gradient(135deg,rgba(255,255,255,.10),transparent 28%,rgba(77,156,255,.08) 72%,transparent);pointer-events:none;}",
    ".premium-event-row::after{content:\"\";position:absolute;left:92px;right:22px;bottom:0;height:1px;background:linear-gradient(90deg,transparent,rgba(119,195,255,.20),transparent);pointer-events:none;}",
    ".premium-event-main{position:relative;z-index:1;min-width:0;display:grid;grid-template-columns:72px minmax(0,1fr);align-items:center;gap:17px;color:#fff;text-decoration:none;}",
    ".premium-event-rank{width:58px;height:58px;border-radius:20px;display:grid;place-items:center;background:linear-gradient(145deg,var(--tz-blue),var(--tz-blue-2));color:#e3efff;box-shadow:0 0 30px rgba(47,123,255,.34),0 10px 28px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.16);}",
    ".premium-event-rank b{font-size:20px;line-height:1;font-weight:950;}",
    ".premium-event-copy{min-width:0;display:grid;gap:6px;}",
    ".premium-event-eyebrow{display:flex;align-items:center;gap:8px;min-width:0;}",
    ".premium-event-eyebrow em,.premium-event-eyebrow i{font-style:normal;min-width:0;max-width:48%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(145,190,255,.78);font-size:10px;font-weight:950;letter-spacing:1.4px;text-transform:uppercase;}",
    ".premium-event-eyebrow i{color:rgba(255,255,255,.44);letter-spacing:1px;}",
    ".premium-event-copy strong{display:block;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:clamp(20px,3vw,31px);line-height:1.04;font-weight:950;letter-spacing:0;color:#fff;text-shadow:0 8px 30px rgba(0,0,0,.36);}",
    ".premium-event-copy small{display:block;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--tz-muted);font-size:clamp(14px,2vw,21px);line-height:1.15;font-weight:750;}",
    ".premium-event-side{position:relative;z-index:1;display:flex;align-items:center;gap:8px;max-width:220px;justify-content:flex-end;flex-wrap:wrap;}",
    ".premium-event-side span,.premium-event-action{min-height:30px;display:inline-flex;align-items:center;padding:0 10px;border-radius:999px;border:1px solid rgba(137,205,255,.14);background:rgba(255,255,255,.055);color:rgba(226,239,255,.68);font-size:10px;font-weight:950;text-decoration:none;white-space:nowrap;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);}",
    ".premium-event-action{color:#fff;background:linear-gradient(145deg,rgba(47,123,255,.30),rgba(20,85,223,.20));border-color:rgba(100,178,255,.26);}",
    ".clean-events-empty{max-width:760px;margin:80px auto;text-align:center;color:rgba(255,255,255,.72);padding:28px;border:1px solid var(--tz-line);border-radius:28px;background:radial-gradient(circle at 50% 0%,rgba(47,118,255,.20),transparent 44%),linear-gradient(180deg,var(--tz-glass),var(--tz-glass-2));backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);}",
    ".clean-events-empty h2{margin:0 0 10px;color:#fff;font-size:34px;}",
    "@media(max-width:720px){.clean-events-page{padding-left:16px;padding-right:16px}.premium-events-top{margin-bottom:12px;border-radius:26px;padding:14px}.premium-events-mark{width:56px;height:56px;border-radius:19px}.premium-events-top h1{font-size:36px}.clean-events-filters{gap:10px;margin-bottom:12px;border-radius:24px;padding:11px}.clean-events-filter{min-height:44px;padding:0 17px;font-size:14px}.premium-events-count{margin-bottom:14px}.premium-events-list{gap:12px}.premium-event-row{min-height:102px;padding:15px 15px;border-radius:27px;grid-template-columns:1fr}.premium-event-main{grid-template-columns:66px minmax(0,1fr);gap:15px}.premium-event-rank{width:58px;height:58px;border-radius:19px}.premium-event-side{display:none}.premium-event-copy strong{font-size:27px}.premium-event-copy small{font-size:18px}}",
    "@media(max-width:430px){.clean-events-page{padding-left:16px;padding-right:16px}.premium-events-top{gap:13px}.premium-events-mark{width:52px;height:52px}.premium-events-top p{font-size:11px}.premium-events-top h1{font-size:33px}.premium-event-main{grid-template-columns:62px minmax(0,1fr);gap:14px}.premium-event-rank{width:56px;height:56px;border-radius:18px}.premium-event-rank b{font-size:19px}.premium-event-copy strong{font-size:23px}.premium-event-copy small{font-size:16px}.premium-event-row{min-height:98px;border-radius:25px;padding:15px 14px}.clean-events-filter{font-size:14px;padding:0 17px}}",
    "@media(max-width:370px){.premium-event-main{grid-template-columns:54px minmax(0,1fr);gap:12px}.premium-event-rank{width:50px;height:50px;border-radius:16px}.premium-event-rank b{font-size:18px}.premium-event-copy strong{font-size:20px}.premium-event-copy small{font-size:14px}.premium-event-row{border-radius:22px}.premium-events-top h1{font-size:30px}}",
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
