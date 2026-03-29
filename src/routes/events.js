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

function shortText(text, max = 180) {
  const clean = String(text || "").trim();
  if (!clean) return "Premium event discovery inside Tapzy.";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}...`;
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
      linear-gradient(180deg, rgba(4,6,10,.08), rgba(4,6,10,.18) 22%, rgba(4,6,10,.52) 58%, rgba(0,0,0,.88)),
      url('${escapeHtml(image)}');"></div>

    <div class="event-slide-inner">
      <div class="event-slide-top">
        <div class="event-badge-row">
          <span class="event-badge">${escapeHtml(event.category || "Event")}</span>
          ${event.priceText ? `<span class="event-badge event-badge-dark">${escapeHtml(event.priceText)}</span>` : ""}
        </div>

        ${event.city ? `<div class="event-slide-city">${escapeHtml(event.city)}</div>` : ""}
      </div>

      <div class="event-slide-bottom">
        <div class="event-copy-block">
          <h2 class="event-slide-title">${escapeHtml(event.title)}</h2>

          <div class="event-slide-meta">
            <div><b>When</b> ${escapeHtml(when)}</div>
            <div><b>Where</b> ${escapeHtml(location)}</div>
          </div>

          <div class="event-slide-desc">
            ${escapeHtml(shortText(event.description, 165))}
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
                <button class="event-action-btn ${isGoing ? "event-action-btn-active" : ""}" type="submit">
                  ${isGoing ? "Going ✓" : "Attend"}
                </button>
              </form>

              <form method="POST" action="/events/${event.id}/interest" style="margin:0;">
                <button class="event-action-btn" type="submit">
                  ${isInterested ? "Interested ✓" : "Interested"}
                </button>
              </form>

              <form method="POST" action="/events/${event.id}/save" style="margin:0;">
                <button class="event-action-btn" type="submit">
                  ${isSaved ? "Saved ✓" : "Save"}
                </button>
              </form>
              `
              : `<a class="event-action-btn" href="/auth">Sign in</a>`
          }

          ${
            event.ticketUrl
              ? `<a class="event-action-btn" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.ticketUrl)}">Tickets</a>`
              : ""
          }

          ${
            event.eventUrl
              ? `<a class="event-action-btn" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.eventUrl)}">Open</a>`
              : ""
          }

          <button
            class="event-action-btn"
            type="button"
            onclick="tapzyShareEvent('${escapeHtml(event.title)}', '${escapeHtml(location)}', '${escapeHtml(when)}', '${escapeHtml(event.eventUrl || "")}')"
          >
            Share
          </button>
        </div>
      </div>
    </div>
  </section>
  `;
}

router.get("/events", async (req, res) => {
  try {
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
      <section class="events-hero">
        <div class="events-hero-inner">
          <div class="events-kicker">Tapzy Discovery</div>

          <h1 class="events-main-title">Explore Events</h1>

          <div class="events-subtitle">
            Discover nightlife, networking, music, tech, food, creators, and premium social experiences.
          </div>

          ${city ? `<div class="events-chip-line">Showing: <b>${escapeHtml(city)}</b></div>` : ""}
          ${req.query.synced ? `<div class="events-chip-line">Real events synced: <b>${escapeHtml(req.query.synced)}</b></div>` : ""}

          <div class="events-hero-actions">
            ${
              currentProfile
                ? `<a class="events-hero-btn events-hero-btn-dark" href="/events/saved">Saved</a>`
                : `<a class="events-hero-btn events-hero-btn-dark" href="/auth">Sign in</a>`
            }

            ${
              hasAdminKey
                ? `
                <form method="POST" action="/events/admin/sync?key=${encodeURIComponent(adminKey)}" style="margin:0;">
                  <button class="events-hero-btn events-hero-btn-light" type="submit">Refresh Feed</button>
                </form>
                `
                : ""
            }
          </div>

          <form method="GET" action="/events" class="events-filter-grid">
            ${hasAdminKey ? `<input type="hidden" name="key" value="${escapeHtml(adminKey)}" />` : ""}
            <input name="city" value="${escapeHtml(city)}" placeholder="City" />
            <input name="category" value="${escapeHtml(category)}" placeholder="Category" />
            <button type="submit">Search</button>
          </form>
        </div>
      </section>

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
    </div>

    <style>
      .events-wrap{
        max-width:1180px;
      }

      .events-hero{
        margin-top:18px;
        border-radius:34px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(700px 300px at 72% 22%, rgba(36,80,125,.26), transparent 58%),
          linear-gradient(180deg, rgba(3,5,12,.98), rgba(0,0,0,1));
        box-shadow:
          0 24px 70px rgba(0,0,0,.40),
          inset 0 1px 0 rgba(255,255,255,.03);
        overflow:hidden;
      }

      .events-hero-inner{
        padding:28px;
      }

      .events-kicker{
        color:#95a5bf;
        text-transform:uppercase;
        letter-spacing:5px;
        font-size:13px;
        margin-bottom:14px;
      }

      .events-main-title{
        margin:0;
        font-size:58px;
        line-height:.95;
        letter-spacing:-1.8px;
        font-weight:900;
        color:#fff;
      }

      .events-subtitle{
        margin-top:16px;
        max-width:760px;
        color:#c5cfdb;
        font-size:18px;
        line-height:1.7;
      }

      .events-chip-line{
        margin-top:10px;
        color:#dbe8f7;
        font-size:14px;
      }

      .events-hero-actions{
        display:flex;
        gap:12px;
        flex-wrap:wrap;
        margin-top:22px;
      }

      .events-hero-btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:54px;
        padding:0 22px;
        border-radius:22px;
        text-decoration:none;
        font-size:15px;
        font-weight:800;
        border:none;
        cursor:pointer;
      }

      .events-hero-btn-light{
        color:#000;
        background:linear-gradient(180deg, #f7fbff, #deeffb);
        box-shadow:0 18px 36px rgba(0,0,0,.25);
      }

      .events-hero-btn-dark{
        color:#fff;
        background:linear-gradient(180deg, rgba(22,23,31,.98), rgba(14,15,22,.98));
        border:1px solid rgba(255,255,255,.08);
      }

      .events-filter-grid{
        display:grid;
        grid-template-columns:1fr 1fr auto;
        gap:14px;
        margin-top:22px;
      }

      .events-filter-grid input{
        width:100%;
        min-height:64px;
        padding:0 20px;
        border-radius:22px;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(7,10,16,.98), rgba(0,0,0,1));
        color:#fff;
        font-size:16px;
        box-sizing:border-box;
      }

      .events-filter-grid input::placeholder{
        color:#aeb7c5;
      }

      .events-filter-grid button{
        min-height:64px;
        padding:0 28px;
        border-radius:22px;
        border:none;
        cursor:pointer;
        color:#000;
        font-size:16px;
        font-weight:900;
        background:linear-gradient(180deg, #f7fbff, #deeffb);
        box-shadow:0 18px 36px rgba(0,0,0,.25);
      }

      .events-feed{
        display:grid;
        gap:18px;
        margin-top:18px;
      }

      .event-slide{
        position:relative;
        min-height:760px;
        border-radius:34px;
        overflow:hidden;
        border:1px solid rgba(255,255,255,.08);
        background:#090b12;
        box-shadow:0 22px 56px rgba(0,0,0,.34);
      }

      .event-slide-media{
        position:absolute;
        inset:0;
        background-size:cover;
        background-position:center;
        transform:scale(1.02);
      }

      .event-slide-inner{
        position:relative;
        z-index:2;
        min-height:760px;
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
        grid-template-columns:minmax(0, 1fr) 132px;
        gap:22px;
        align-items:end;
      }

      .event-copy-block{
        max-width:760px;
      }

      .event-slide-title{
        margin:0;
        font-size:52px;
        line-height:.96;
        font-weight:900;
        letter-spacing:-1.8px;
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

      .event-action-btn{
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
        background:linear-gradient(180deg, rgba(18,21,31,.94), rgba(8,10,16,.98));
        border:1px solid rgba(255,255,255,.08);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.04),
          0 8px 16px rgba(0,0,0,.18);
      }

      .event-action-btn-active{
        background:
          radial-gradient(circle at 50% 0%, rgba(150,230,255,.18), transparent 55%),
          linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));
        border:none;
      }

      .events-empty-card{
        margin-top:18px;
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
        .events-hero{
          border-radius:24px;
        }

        .events-hero-inner{
          padding:20px 18px;
        }

        .events-kicker{
          font-size:12px;
          letter-spacing:4px;
          margin-bottom:12px;
        }

        .events-main-title{
          font-size:36px;
          letter-spacing:-1.2px;
        }

        .events-subtitle{
          font-size:16px;
          line-height:1.6;
          margin-top:12px;
        }

        .events-hero-actions{
          margin-top:18px;
          gap:10px;
        }

        .events-hero-btn{
          min-height:46px;
          padding:0 16px;
          border-radius:18px;
          font-size:14px;
        }

        .events-filter-grid{
          grid-template-columns:1fr;
          gap:12px;
          margin-top:18px;
        }

        .events-filter-grid input,
        .events-filter-grid button{
          min-height:58px;
          border-radius:20px;
          font-size:15px;
        }

        .events-feed{
          gap:14px;
          margin-top:14px;
        }

        .event-slide{
          min-height:680px;
          border-radius:24px;
        }

        .event-slide-inner{
          min-height:680px;
          padding:18px;
        }

        .event-slide-title{
          font-size:30px;
          line-height:1.02;
          letter-spacing:-1px;
        }

        .event-slide-meta{
          margin-top:14px;
          gap:7px;
          font-size:14px;
        }

        .event-slide-desc{
          margin-top:14px;
          font-size:15px;
          line-height:1.6;
        }

        .event-social-line{
          margin-top:14px;
          font-size:13px;
        }

        .event-slide-actions{
          grid-template-columns:1fr 1fr;
          gap:10px;
        }

        .event-action-btn{
          min-height:44px;
          border-radius:16px;
          font-size:13px;
          padding:0 10px;
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
                        <div class="saved-copy">${escapeHtml(shortText(event.description || "", 140))}</div>
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