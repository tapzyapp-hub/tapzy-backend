
const prisma = require("../../prisma");
const { renderShell, renderTapzyAssistant, escapeHtml, formatPrettyLocal } = require("../../utils");
const { normalizeCategory, getShortDescription, cleanEventDescription, pickImage, getUrgencyBadge, isSeededEvent } = require("../helpers/eventServerUtils");

module.exports = async function getEventDetailPage(req, res) {


  try {

    const currentProfile = req.currentProfile || null;

    const eventId = String(req.params.id || "").trim();



    if (!eventId) return res.status(404).send("Event not found");



    const event = await prisma.eventFinderItem.findUnique({

      where: { id: eventId },

    });



    if (!event || isSeededEvent(event)) return res.status(404).send("Event not found");



    const attendanceRows = await prisma.eventAttendance.findMany({
      where: { eventId: event.id },
      select: { profileId: true },
    });

    const goingCount = attendanceRows.length;
    const isGoing = !!(currentProfile && attendanceRows.some((row) => row.profileId === currentProfile.id));



    const image = pickImage(event);

    const label = normalizeCategory(event);

    const shortDescription = getShortDescription(event);

    const when = event.startAt ? formatPrettyLocal(event.startAt) : "Date coming soon";

    const badge = getUrgencyBadge(event);

    const fullDescription =

      cleanEventDescription(event) || "Premium event discovery inside Tapzy Network™.";



    const fullDescriptionHtml = fullDescription
      .split(/(?<=[.!?])\s+(?=[A-Z0-9*])|\n+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => `<p>${escapeHtml(part)}</p>`)
      .join("");

    const body = `

    <div class="wrap" style="max-width:1100px;">

      <section class="tz-event-detail-hero">

        <div class="tz-event-detail-bg" style="background-image:

          linear-gradient(180deg, rgba(6,8,14,.12), rgba(6,8,14,.24) 22%, rgba(3,5,10,.72) 60%, rgba(0,0,0,.96)),

          url('${escapeHtml(image)}');"></div>



        <div class="tz-event-detail-noise"></div>

        <div class="tz-event-detail-glow"></div>



        <div class="tz-event-detail-content">

          <div class="tz-event-detail-topline">

            <div class="tz-pill-stack">

              <span class="tz-event-pill">${escapeHtml(label || "Event")}</span>

              <span class="tz-event-pill tz-event-pill-urgency">${escapeHtml(badge)}</span>

            </div>

            ${event.priceText ? `<span class="tz-event-pill tz-event-pill-soft">${escapeHtml(event.priceText)}</span>` : ""}

          </div>



          <h1 class="tz-event-detail-title">${escapeHtml(event.title || "Untitled Event")}</h1>



          <div class="tz-event-detail-subtitle">

            ${escapeHtml(shortDescription)}

          </div>



          <div class="tz-event-detail-meta">

            <div class="tz-event-detail-meta-card">

              <div class="tz-event-detail-meta-label">When</div>

              <div class="tz-event-detail-meta-value">${escapeHtml(when)}</div>

            </div>



            <div class="tz-event-detail-meta-card">

              <div class="tz-event-detail-meta-label">Where</div>

              <div class="tz-event-detail-meta-value">${escapeHtml(event.venueName || event.address || event.city || "Location coming soon")}</div>

            </div>



            ${

              event.city

                ? `

                  <div class="tz-event-detail-meta-card">

                    <div class="tz-event-detail-meta-label">City</div>

                    <div class="tz-event-detail-meta-value">${escapeHtml(event.city)}</div>

                  </div>

                `

                : ""

            }

          </div>



          <div class="tz-event-detail-actions">

            <a class="btn btnLuxury" href="/events">Back to Events</a>

            ${

              event.ticketUrl

                ? `<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.ticketUrl)}">Tickets</a>`

                : ""

            }

            ${

              event.eventUrl

                ? `<a class="btn btnGhost" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.eventUrl)}">Source Event</a>`

                : ""

            }

            ${
              currentProfile
                ? `
                  <button
                    class="btn btnGhost js-going-btn ${isGoing ? "is-active" : ""}"
                    type="button"
                    data-going-id="${escapeHtml(event.id)}"
                  >
                    ${isGoing ? "Going ✓" : "I’m Going"}${goingCount ? ` • ${goingCount}` : ""}
                  </button>
                `
                : `<a class="btn btnGhost" href="/auth">Sign in to go</a>`
            }

          </div>

        </div>

      </section>



      <section class="tz-event-detail-section">

        <div class="tz-event-detail-grid">

          <div class="tz-event-detail-panel">

            <div class="tz-event-section-kicker">Event Overview</div>

            <h2 class="tz-event-section-title">Inside the experience</h2>

            <div class="tz-event-detail-copy">

              ${fullDescriptionHtml}

            </div>

          </div>



          <div class="tz-event-detail-panel">

            <div class="tz-event-section-kicker">Event Details</div>

            <h2 class="tz-event-section-title">Key information</h2>



            <div class="tz-event-detail-list">

              <div class="tz-event-detail-list-row">

                <span>Category</span>

                <strong>${escapeHtml(label || "Event")}</strong>

              </div>

              <div class="tz-event-detail-list-row">

                <span>Urgency</span>

                <strong>${escapeHtml(badge)}</strong>

              </div>

              <div class="tz-event-detail-list-row">

                <span>Venue</span>

                <strong>${escapeHtml(event.venueName || "Venue coming soon")}</strong>

              </div>

              <div class="tz-event-detail-list-row">

                <span>Address</span>

                <strong>${escapeHtml(event.address || event.city || "Location coming soon")}</strong>

              </div>

              <div class="tz-event-detail-list-row">

                <span>Price</span>

                <strong>${escapeHtml(event.priceText || "See source")}</strong>

              </div>

              <div class="tz-event-detail-list-row">

                <span>Source</span>

                <strong>${escapeHtml(String(event.source || "Tapzy"))}</strong>

              </div>

            </div>

          </div>

        </div>

      </section>

    </div>



    <style>

      .tz-event-detail-hero{

        position:relative;

        overflow:hidden;

        border-radius:36px;

        min-height:640px;

        border:1px solid rgba(255,255,255,.08);

        background:#090b10;

        box-shadow:

          0 34px 90px rgba(0,0,0,.46),

          inset 0 1px 0 rgba(255,255,255,.04);

      }



      .tz-event-detail-bg{

        position:absolute;

        inset:0;

        background-size:cover;

        background-position:center;

        transform:scale(1.02);

      }



      .tz-event-detail-noise{

        position:absolute;

        inset:0;

        opacity:.045;

        background-image:radial-gradient(rgba(255,255,255,.9) .6px, transparent .6px);

        background-size:8px 8px;

        z-index:1;

      }



      .tz-event-detail-glow{

        position:absolute;

        width:300px;

        height:300px;

        right:-70px;

        top:-50px;

        border-radius:999px;

        background:radial-gradient(circle, rgba(86,156,255,.20), transparent 68%);

        filter:blur(18px);

        z-index:1;

      }



      .tz-event-detail-content{

        position:relative;

        z-index:2;

        min-height:640px;

        display:flex;

        flex-direction:column;

        justify-content:flex-end;

        padding:34px;

      }



      .tz-event-detail-topline{

        display:flex;

        justify-content:space-between;

        gap:10px;

        align-items:center;

        margin-bottom:14px;

      }



      .tz-pill-stack{

        display:flex;

        gap:8px;

        flex-wrap:wrap;

      }



      .tz-event-pill{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:32px;

        padding:0 14px;

        border-radius:999px;

        font-size:10px;

        font-weight:900;

        letter-spacing:1px;

        text-transform:uppercase;

        color:#eef7ff;

        background:rgba(10,18,34,.58);

        border:1px solid rgba(156,214,255,.22);

        backdrop-filter:blur(10px);

      }



      .tz-event-pill-soft{

        color:#d8e6f5;

        background:rgba(255,255,255,.08);

        border-color:rgba(255,255,255,.12);

      }



      .tz-event-pill-urgency{

        background:rgba(111,210,255,.12);

        border-color:rgba(111,210,255,.32);

      }



      .tz-event-detail-title{

        margin:0;

        font-size:58px;

        line-height:.96;

        letter-spacing:-1.8px;

        max-width:860px;

      }



      .tz-event-detail-subtitle{

        margin-top:16px;

        max-width:760px;

        color:#d9e4f2;

        font-size:17px;

        line-height:1.8;

      }



      .tz-event-detail-meta{

        display:grid;

        grid-template-columns:repeat(3, minmax(0, 1fr));

        gap:14px;

        margin-top:24px;

      }



      .tz-event-detail-meta-card{

        border-radius:22px;

        padding:16px;

        background:rgba(10,14,22,.42);

        border:1px solid rgba(255,255,255,.08);

        backdrop-filter:blur(10px);

      }



      .tz-event-detail-meta-label{

        font-size:10px;

        text-transform:uppercase;

        letter-spacing:1px;

        color:#9eb1c9;

      }



      .tz-event-detail-meta-value{

        margin-top:6px;

        font-size:15px;

        color:#f5f9ff;

        line-height:1.55;

      }



      .tz-event-detail-actions{

        display:flex;

        gap:10px;

        flex-wrap:wrap;

        margin-top:22px;

      }



      .tz-event-detail-section{

        margin-top:24px;

      }



      .tz-event-detail-grid{

        display:grid;

        grid-template-columns:1.2fr .8fr;

        gap:18px;

      }



      .tz-event-detail-panel{

        border-radius:30px;

        padding:26px;

        border:1px solid rgba(255,255,255,.08);

        background:

          radial-gradient(600px 220px at 80% 0%, rgba(90,150,255,.06), transparent 42%),

          linear-gradient(180deg, rgba(12,14,22,.96), rgba(7,8,12,1));

        box-shadow:

          0 20px 40px rgba(0,0,0,.28),

          inset 0 1px 0 rgba(255,255,255,.04);

      }



      .tz-event-section-kicker{

        color:#95a5bf;

        text-transform:uppercase;

        letter-spacing:4px;

        font-size:11px;

      }



      .tz-event-section-title{

        margin:12px 0 0 0;

        font-size:30px;

        letter-spacing:-.8px;

      }



      .tz-event-detail-copy{

        margin-top:14px;

        color:#d9e4f2;

        line-height:1.85;

        font-size:15px;

      }

      .tz-event-detail-copy p{

        margin:0 0 16px;

      }

      .tz-event-detail-copy p:last-child{

        margin-bottom:0;

      }



      .tz-event-detail-list{

        display:grid;

        gap:12px;

        margin-top:16px;

      }



      .tz-event-detail-list-row{

        display:flex;

        justify-content:space-between;

        gap:16px;

        align-items:flex-start;

        padding:14px 0;

        border-bottom:1px solid rgba(255,255,255,.06);

      }



      .tz-event-detail-list-row span{

        color:#95a5bf;

        font-size:13px;

      }



      .tz-event-detail-list-row strong{

        text-align:right;

        color:#f5f9ff;

        font-size:14px;

        line-height:1.5;

      }



      .js-save-btn.is-animating{

        animation:savePulse .28s ease;

      }



      @keyframes savePulse{

        0%{ transform:scale(1); }

        50%{ transform:scale(1.08); }

        100%{ transform:scale(1); }

      }



      @media(max-width:900px){

        .tz-event-detail-title{

          font-size:42px;

        }



        .tz-event-detail-meta{

          grid-template-columns:1fr;

        }



        .tz-event-detail-grid{

          grid-template-columns:1fr;

        }

      }



      @media(max-width:700px){

        .tz-event-detail-hero{

          min-height:560px;

          border-radius:26px;

        }



        .tz-event-detail-content{

          min-height:560px;

          padding:20px;

        }



        .tz-event-detail-title{

          font-size:34px;

        }



        .tz-event-detail-subtitle{

          font-size:15px;

        }



        .tz-event-detail-panel{

          border-radius:22px;

          padding:18px;

        }

      }

    </style>



    <script>

      (function () {

        const forms = document.querySelectorAll(".js-save-form");

        forms.forEach((form) => {

          if (form.dataset.saveBound === "1") return;

          form.dataset.saveBound = "1";



          form.addEventListener("submit", (e) => {

            const btn = form.querySelector(".js-save-btn");

            if (!btn || form.dataset.submitting === "1") return;

            form.dataset.submitting = "1";

            e.preventDefault();

            btn.classList.add("is-animating");

            setTimeout(() => form.submit(), 180);

          });

        });

      })();

    </script>



    <script>
      (function(){
        document.addEventListener("click", async function(e){
          const btn = e.target.closest(".js-going-btn");
          if (!btn) return;
          e.preventDefault();
          const eventId = btn.getAttribute("data-going-id");
          if (!eventId || btn.dataset.loading === "1") return;
          btn.dataset.loading = "1";
          try {
            const res = await fetch("/events/" + encodeURIComponent(eventId) + "/going", { method:"POST", headers:{"X-Requested-With":"XMLHttpRequest"} });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.error || "Going update failed");
            btn.classList.toggle("is-active", !!data.going);
            btn.textContent = (data.going ? "Going ✓" : "I’m Going") + (data.goingCount ? " • " + data.goingCount : "");
            var count = document.getElementById("eventGoingCount");
            if (count) count.textContent = String(data.goingCount || 0);
          } catch (err) { console.error(err); }
          finally { delete btn.dataset.loading; }
        });
      })();
    </script>

    ${renderTapzyAssistant({

      username: currentProfile?.username || "User",

      pageType: "events",

    })}

    `;



    res.send(

      renderShell(event.title || "Event", body, "", {

        currentProfile,

        pageTitle: event.title || "Event",

        pageType: "events",

        hideTopBar: true,

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("Event detail error");

  }

};
