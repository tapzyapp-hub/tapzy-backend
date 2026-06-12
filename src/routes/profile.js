const router = require("express").Router();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const prisma = require("../prisma");

const { upload, uploadsDir } = require("../upload");

const {

  cleanUsername,

  escapeHtml,

  safeUrl,

  stripAt,

  publicAbsoluteUrl,

  makeVcf,

  buildQuickSharePreview,

  renderShell,

  renderFollowButton,

  getFollowState,

  ownerKeyQuery,

  requireOwnerAccess,

  backUrl,

} = require("../utils");



function isVideoUrl(url) {

  const value = String(url || "").toLowerCase();

  return (

    value.endsWith(".mp4") ||

    value.endsWith(".mov") ||

    value.endsWith(".webm") ||

    value.includes("/video/")

  );

}



function renderVideoFrame(url, options = {}) {
  const src = escapeHtml(url || "");
  const className = escapeHtml(options.className || "profile-story-card-media");
  const autoplay = options.autoplay ? ' autoplay' : '';
  const muted = options.muted ? ' muted' : '';
  const controls = options.controls === false ? '' : ' controls';
  const loop = options.loop ? ' loop' : '';
  const preload = escapeHtml(options.preload || 'auto');
  const aria = escapeHtml(options.ariaLabel || 'Play video');
  return `
    <div class="tz-video-frame${options.autoplay ? ' is-autoplay' : ''}" data-video-frame>
      <div class="tz-video-preview" data-video-preview tabindex="0" role="button" aria-label="${aria}">
        <div class="tz-video-preview-blur"></div>
        <div class="tz-video-preview-badge">▶</div>
      </div>
      <video class="${className}" src="${src}"${controls}${autoplay}${muted}${loop} playsinline webkit-playsinline preload="${preload}"></video>
    </div>
  `;
}


function formatStoryTimeShort(date) {

  const d = new Date(date);

  const now = Date.now();

  const diffMs = Math.max(0, now - d.getTime());

  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours >= 1) {

    return `${diffHours}h`;

  }

  if (diffMinutes >= 1) {

    return `${diffMinutes}m`;

  }

  return "Just now";

}



function storyTrayCard(profile, story, isOwner) {

  const hasMedia = !!story?.mediaUrl;

  const isVideo = hasMedia && isVideoUrl(story.mediaUrl);



  const mediaHtml = hasMedia

    ? isVideo

      ? renderVideoFrame(story.mediaUrl, { className: "profile-story-card-media", controls: false, muted: true, preload: "auto" })

      : `<img class="profile-story-card-media" src="${escapeHtml(story.mediaUrl)}" alt="Story preview" loading="lazy" decoding="async" />`

    : `<div class="profile-story-card-textonly">${escapeHtml(

        story.text || profile.name || profile.username || "Tapzy"

      )}</div>`;



  return `

    <a class="profile-story-card" href="/stories/${escapeHtml(profile.username || "")}">

      <div class="profile-story-card-ring">

        <div class="profile-story-card-inner">

          ${mediaHtml}

        </div>

      </div>

      <div class="profile-story-card-meta">

        <div class="profile-story-card-time">${escapeHtml(formatStoryTimeShort(story.createdAt))}</div>

        <div class="profile-story-card-label">${isOwner ? "Your Story" : "Story"}</div>

      </div>

    </a>

  `;

}



router.get("/u/:username", async (req, res) => {

  try {

    const username = cleanUsername(req.params.username);

    const now = new Date();



    const profile = await prisma.userProfile.findUnique({

      where: { username },

      include: {

        followers: true,

        following: true,

      },

    });



    if (!profile) {

      return res.status(404).send("Profile not found");

    }



    const currentProfile = req.currentProfile || null;

    const followState = await getFollowState(currentProfile?.id, profile.id);

    const quickPreview = buildQuickSharePreview(profile);



    const [activeStories, attendingEvent] = await Promise.all([

      prisma.story.findMany({

        where: {

          profileId: profile.id,

          expiresAt: { gt: now },

        },

        orderBy: { createdAt: "desc" },

        take: 10,

      }),

      prisma.eventAttendance.findFirst({

        where: {

          profileId: profile.id,

          status: "going",

          event: {

            startAt: { gte: now },

          },

        },

        include: {

          event: true,

        },

        orderBy: {

          event: {

            startAt: "asc",

          },

        },

      }),

    ]);



    const isTapOpen = String(req.query.tap || "") === "1";

    const photoPositionX = Number.isFinite(Number(profile.profilePhotoPositionX)) ? Number(profile.profilePhotoPositionX) : 50;
    const photoPositionY = Number.isFinite(Number(profile.profilePhotoPositionY)) ? Number(profile.profilePhotoPositionY) : 50;
    const photoScale = Number.isFinite(Number(profile.profilePhotoScale)) ? Math.max(100, Math.min(180, Number(profile.profilePhotoScale))) : 100;

    const displayName = profile.name || profile.username || "Tapzy User";

    const vcardUrl = `/vcard/${escapeHtml(profile.username || "")}`;

    const isOwner = !!(currentProfile && currentProfile.id === profile.id);



    const photoHtml = profile.photo

      ? `<img src="${escapeHtml(profile.photo)}" alt="${escapeHtml(displayName)}" loading="eager" decoding="async" style="object-position:${photoPositionX}% ${photoPositionY}%; transform:scale(${photoScale / 100});" />`

      : escapeHtml((displayName || "T").slice(0, 1).toUpperCase());



    const showMessageButton = currentProfile && currentProfile.id !== profile.id;

    const showFollowButton = !!(currentProfile && currentProfile.id !== profile.id);



    const body = `

    <div class="wrap profile-wrap">



      ${

        isTapOpen

          ? `

          <div id="tapzyTapOverlay" class="tapzy-tap-overlay" role="status" aria-live="polite">

            <div class="tapzy-tap-aurora tapzy-tap-aurora-one"></div>

            <div class="tapzy-tap-aurora tapzy-tap-aurora-two"></div>

            <div class="tapzy-tap-orbit tapzy-tap-orbit-one"></div>

            <div class="tapzy-tap-orbit tapzy-tap-orbit-two"></div>

            <div class="tapzy-tap-card">

              <div class="tapzy-tap-badge">Tapzy Network™</div>

              <div class="tapzy-tap-device">

                <div class="tapzy-tap-signal tapzy-tap-signal-one"></div>

                <div class="tapzy-tap-signal tapzy-tap-signal-two"></div>

                <div class="tapzy-tap-signal tapzy-tap-signal-three"></div>

                <div class="tapzy-tap-avatar">

                  ${profile.photo
                    ? `<img src="${escapeHtml(profile.photo)}" alt="${escapeHtml(displayName)}" />`
                    : `<span>${escapeHtml((displayName || "T").slice(0, 1).toUpperCase())}</span>`
                  }

                </div>

              </div>

              <div class="tapzy-tap-title">Tap detected</div>

              <div class="tapzy-tap-subtitle">Opening ${escapeHtml(displayName)}'s profile</div>

              <div class="tapzy-tap-progress" aria-hidden="true"><span></span></div>

              <div class="tapzy-tap-status">Secure NFC handoff in progress</div>

            </div>

          </div>



          <div id="tapzyContactPrompt" class="tapzy-contact-prompt" style="display:none;">

            <div class="tapzy-contact-prompt-inner">

              <div class="tapzy-contact-title">Save ${escapeHtml(displayName)} to contacts?</div>

              <div class="tapzy-contact-subtitle">Powered by Tapzy Network™</div>

              <div class="tapzy-contact-actions">

                <a class="tapzy-contact-btn" href="${vcardUrl}">Save Contact</a>

                <button type="button" class="tapzy-contact-btn tapzy-contact-btn-dark" id="tapzyContactDismiss">Not now</button>

              </div>

            </div>

          </div>

          `

          : ""

      }



      <section id="tapzyProfileShell" class="profile-showcase ${isTapOpen ? "tapzy-profile-hidden" : ""}">

        <div class="profile-showcase-bg"></div>



        <div class="profile-showcase-top">

          <div class="profile-showcase-avatar-wrap">

            <button type="button" class="profile-showcase-avatar" data-profile-photo-open aria-label="Open profile picture for ${escapeHtml(displayName)}">${photoHtml}</button>

          </div>



          <div class="profile-showcase-main">

            <div class="profile-showcase-name">${escapeHtml(displayName)}</div>

            <div class="profile-showcase-handle">@${escapeHtml(profile.username || "user")}</div>



            <div class="profile-showcase-actions">

              ${

                showFollowButton

                  ? renderFollowButton(currentProfile, profile, followState.isFollowing)

                  : ""

              }



              ${

                showMessageButton

                  ? `

                    <form method="POST" action="/messages/start/${escapeHtml(profile.username || "")}" style="margin:0;">

                      <button class="profile-pill-btn profile-pill-btn-dark" type="submit">Message</button>

                    </form>

                  `

                  : ""

              }



              <a class="profile-pill-btn profile-pill-btn-dark" href="/qr/${escapeHtml(profile.username || "")}">QR</a>

              <a class="profile-pill-btn profile-pill-btn-dark" href="/vcard/${escapeHtml(profile.username || "")}">Save Contact</a>

            </div>

          </div>

        </div>

      </section>



      ${

        attendingEvent?.event

          ? `

            <section class="profile-panel profile-attending-banner" style="margin-top:18px;">

              <div class="profile-attending-kicker">Attending</div>

              <div class="profile-attending-title">${escapeHtml(attendingEvent.event.title || "Upcoming event")}</div>

              <div class="profile-attending-sub">

                ${attendingEvent.event.city ? `${escapeHtml(attendingEvent.event.city)} • ` : ""}${

                  attendingEvent.event.startAt

                    ? escapeHtml(new Date(attendingEvent.event.startAt).toLocaleString())

                    : "Upcoming"

                }

              </div>

              <div class="profile-attending-actions">

                <a class="profile-pill-btn" href="/events">View Events</a>

              </div>

            </section>

          `

          : ""

      }



      ${

        activeStories.length

          ? `

            <section class="profile-panel" style="margin-top:18px;">

              <div class="profile-panel-row">

                <div>

                  <h3 class="profile-panel-heading">Stories</h3>

                  <div class="profile-panel-subheading">Live 24-hour updates from this profile.</div>

                </div>



                <a class="profile-mini-action" href="/stories/${escapeHtml(profile.username || "")}">Open Stories</a>

              </div>



              <div class="profile-stories-tray">

                ${activeStories.map((story) => storyTrayCard(profile, story, isOwner)).join("")}

              </div>

            </section>

          `

          : isOwner

            ? `

              <section class="profile-panel" style="margin-top:18px;">

                <div class="profile-panel-row">

                  <div>

                    <h3 class="profile-panel-heading">Stories</h3>

                    <div class="profile-panel-subheading">You do not have any active stories right now.</div>

                  </div>



                  <a class="profile-mini-action" href="/stories">Create Story</a>

                </div>

              </section>

            `

            : ""

      }



      ${

        profile.title || profile.bio

          ? `

            <section class="profile-panel" style="margin-top:18px;">

              ${profile.title ? `<div class="profile-section-title">${escapeHtml(profile.title)}</div>` : ""}

              ${

                profile.bio

                  ? `<div class="profile-section-text" style="margin-top:${profile.title ? "10px" : "0"};">${escapeHtml(profile.bio)}</div>`

                  : ""

              }

            </section>

          `

          : ""

      }



      ${

        quickPreview.length

          ? `

            <section class="profile-panel" style="margin-top:18px;">

              <h3 class="profile-panel-heading">Quick Share</h3>

              <div class="profile-panel-subheading">Tap to connect instantly.</div>



              <div class="profile-quick-actions">

                ${profile.phone ? `<a class="profile-quick-btn" href="tel:${escapeHtml(profile.phone)}">Phone</a>` : ""}

                ${profile.email ? `<a class="profile-quick-btn" href="mailto:${escapeHtml(profile.email)}">Email</a>` : ""}

                ${

                  profile.website

                    ? `<a class="profile-quick-btn" href="${escapeHtml(safeUrl(profile.website))}" target="_blank" rel="noopener noreferrer">Website</a>`

                    : ""

                }

                ${

                  profile.instagram

                    ? `<a class="profile-quick-btn" href="https://instagram.com/${escapeHtml(stripAt(profile.instagram))}" target="_blank" rel="noopener noreferrer">Instagram</a>`

                    : ""

                }

                ${

                  profile.tiktok

                    ? `<a class="profile-quick-btn" href="https://www.tiktok.com/@${escapeHtml(stripAt(profile.tiktok))}" target="_blank" rel="noopener noreferrer">TikTok</a>`

                    : ""

                }

                ${

                  profile.linkedin

                    ? `<a class="profile-quick-btn" href="${escapeHtml(safeUrl(profile.linkedin))}" target="_blank" rel="noopener noreferrer">LinkedIn</a>`

                    : ""

                }

                ${

                  profile.twitter

                    ? `<a class="profile-quick-btn" href="https://x.com/${escapeHtml(stripAt(profile.twitter))}" target="_blank" rel="noopener noreferrer">X</a>`

                    : ""

                }

                ${

                  profile.facebook

                    ? `<a class="profile-quick-btn" href="https://facebook.com/${escapeHtml(stripAt(profile.facebook))}" target="_blank" rel="noopener noreferrer">Facebook</a>`

                    : ""

                }

                ${

                  profile.youtube

                    ? `<a class="profile-quick-btn" href="https://youtube.com/@${escapeHtml(stripAt(profile.youtube))}" target="_blank" rel="noopener noreferrer">YouTube</a>`

                    : ""

                }

                ${

                  profile.github

                    ? `<a class="profile-quick-btn" href="https://github.com/${escapeHtml(stripAt(profile.github))}" target="_blank" rel="noopener noreferrer">GitHub</a>`

                    : ""

                }

                ${

                  profile.snapchat

                    ? `<a class="profile-quick-btn" href="https://www.snapchat.com/add/${escapeHtml(stripAt(profile.snapchat))}" target="_blank" rel="noopener noreferrer">Snapchat</a>`

                    : ""

                }

                ${

                  profile.whatsapp

                    ? `<a class="profile-quick-btn" href="https://wa.me/${String(profile.whatsapp).replace(/[^\d]/g, "")}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`

                    : ""

                }

                ${

                  profile.telegram

                    ? `<a class="profile-quick-btn" href="https://t.me/${escapeHtml(stripAt(profile.telegram))}" target="_blank" rel="noopener noreferrer">Telegram</a>`

                    : ""

                }

              </div>

            </section>

          `

          : ""

      }



      ${

        currentProfile && currentProfile.id === profile.id

          ? `

            <div class="row" style="margin-top:18px;">

              <a class="profile-edit-btn" href="/edit/${escapeHtml(profile.username || "")}">Edit Profile</a>

            </div>

          `

          : ""

      }

    </div>

    <div class="profile-photo-viewer" id="profilePhotoViewer" aria-hidden="true">
      <button type="button" class="profile-photo-viewer-backdrop" data-profile-photo-close aria-label="Close profile picture viewer"></button>
      <div class="profile-photo-viewer-card" role="dialog" aria-modal="true" aria-label="Profile picture viewer">
        <button type="button" class="profile-photo-viewer-close" data-profile-photo-close aria-label="Close profile picture viewer">×</button>
        <div class="profile-photo-viewer-frame">
          ${profile.photo
            ? `<img src="${escapeHtml(profile.photo)}" alt="${escapeHtml(displayName)} profile picture" style="object-position:${photoPositionX}% ${photoPositionY}%; transform:scale(${photoScale / 100});" />`
            : `<div class="profile-photo-viewer-initial">${escapeHtml((displayName || "T").slice(0, 1).toUpperCase())}</div>`
          }
        </div>
      </div>
    </div>



    <style>

      .profile-wrap{

        max-width:920px;

      }



      .tapzy-profile-hidden{

        opacity:0;

        transform:translateY(10px) scale(.985);

        pointer-events:none;

      }



      .tapzy-profile-visible{

        opacity:1;

        transform:none;

        pointer-events:auto;

        transition:opacity .42s ease, transform .42s ease;

      }



      .tapzy-tap-overlay{

        position:fixed;

        inset:0;

        z-index:1000;

        display:flex;

        align-items:center;

        justify-content:center;

        min-height:100svh;

        overflow:hidden;

        background:

          radial-gradient(circle at 50% 18%, rgba(85,180,255,.20), transparent 34%),

          radial-gradient(circle at 18% 82%, rgba(56,98,255,.14), transparent 30%),

          linear-gradient(180deg, #050814 0%, #02030a 48%, #000 100%);

        backdrop-filter:blur(18px);

      }



      .tapzy-tap-overlay::before{

        content:"";

        position:absolute;

        inset:0;

        background:

          linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),

          linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px);

        background-size:42px 42px;

        mask-image:radial-gradient(circle at 50% 42%, #000 0%, transparent 68%);

        opacity:.45;

        animation:tapzyGridDrift 6s linear infinite;

      }



      .tapzy-tap-aurora{

        position:absolute;

        width:360px;

        height:360px;

        border-radius:999px;

        filter:blur(24px);

        opacity:.62;

        pointer-events:none;

      }



      .tapzy-tap-aurora-one{

        background:radial-gradient(circle, rgba(85,198,255,.34), rgba(53,108,255,.10) 44%, transparent 72%);

        top:10%;

        left:50%;

        transform:translateX(-50%);

        animation:tapzyAuroraOne 3.2s ease-in-out infinite alternate;

      }



      .tapzy-tap-aurora-two{

        width:300px;

        height:300px;

        background:radial-gradient(circle, rgba(149,224,255,.22), rgba(85,120,255,.10) 48%, transparent 75%);

        bottom:8%;

        right:8%;

        animation:tapzyAuroraTwo 3.8s ease-in-out infinite alternate;

      }



      .tapzy-tap-orbit{

        position:absolute;

        border-radius:999px;

        border:1px solid rgba(125,208,255,.12);

        box-shadow:0 0 42px rgba(74,170,255,.10);

        pointer-events:none;

      }



      .tapzy-tap-orbit-one{

        width:520px;

        height:520px;

        animation:tapzyOrbit 12s linear infinite;

      }



      .tapzy-tap-orbit-two{

        width:380px;

        height:380px;

        border-style:dashed;

        animation:tapzyOrbit 9s linear infinite reverse;

      }



      .tapzy-tap-card{

        position:relative;

        z-index:2;

        width:min(92vw, 382px);

        padding:30px 24px 24px;

        border-radius:34px;

        text-align:center;

        border:1px solid rgba(152,220,255,.22);

        background:

          radial-gradient(circle at 50% 0%, rgba(130,217,255,.18), transparent 52%),

          linear-gradient(180deg, rgba(12,18,32,.92), rgba(2,4,10,.98));

        box-shadow:

          0 0 52px rgba(67,164,255,.18),

          0 24px 70px rgba(0,0,0,.48),

          inset 0 1px 0 rgba(255,255,255,.08);

        transform:translateY(0);

        animation:tapzyCardEnter .62s cubic-bezier(.2,.9,.2,1) both;

      }



      .tapzy-tap-badge{

        color:#eaf7ff;

        font-size:12px;

        font-weight:900;

        letter-spacing:3.6px;

        text-transform:uppercase;

        text-shadow:0 0 18px rgba(103,196,255,.42);

      }



      .tapzy-tap-device{

        position:relative;

        width:148px;

        height:148px;

        margin:22px auto 0;

        display:grid;

        place-items:center;

      }



      .tapzy-tap-signal{

        position:absolute;

        inset:0;

        border-radius:999px;

        border:1px solid rgba(119,211,255,.26);

        box-shadow:0 0 24px rgba(78,172,255,.15), inset 0 0 18px rgba(78,172,255,.08);

        animation:tapzySignal 1.65s ease-out infinite;

      }



      .tapzy-tap-signal-two{ animation-delay:.28s; }

      .tapzy-tap-signal-three{ animation-delay:.56s; }



      .tapzy-tap-avatar{

        position:relative;

        z-index:2;

        width:86px;

        height:86px;

        border-radius:28px;

        overflow:hidden;

        display:grid;

        place-items:center;

        color:#fff;

        font-size:34px;

        font-weight:950;

        background:linear-gradient(145deg, rgba(20,34,58,.98), rgba(0,0,0,.98));

        border:1px solid rgba(172,229,255,.28);

        box-shadow:0 0 30px rgba(87,190,255,.22), inset 0 1px 0 rgba(255,255,255,.12);

      }



      .tapzy-tap-avatar img{

        width:100%;

        height:100%;

        object-fit:cover;

        display:block;

      }



      .tapzy-tap-title{

        margin-top:20px;

        color:#fff;

        font-size:30px;

        font-weight:950;

        letter-spacing:-.9px;

      }



      .tapzy-tap-subtitle{

        margin-top:8px;

        color:#dbe8f7;

        font-size:15px;

        line-height:1.55;

      }



      .tapzy-tap-progress{

        height:7px;

        margin:22px auto 0;

        border-radius:999px;

        overflow:hidden;

        background:rgba(255,255,255,.08);

        border:1px solid rgba(255,255,255,.08);

      }



      .tapzy-tap-progress span{

        display:block;

        height:100%;

        width:100%;

        transform-origin:left center;

        transform:scaleX(0);

        border-radius:999px;

        background:linear-gradient(90deg, #65d7ff, #f6fbff);

        box-shadow:0 0 18px rgba(101,215,255,.55);

        animation:tapzyLoadBar 1.75s ease-out forwards;

      }



      .tapzy-tap-status{

        margin-top:12px;

        color:#98b9d7;

        font-size:12px;

        font-weight:750;

        letter-spacing:.9px;

        text-transform:uppercase;

      }



      @keyframes tapzyCardEnter{

        from{ opacity:0; transform:translateY(18px) scale(.965); }

        to{ opacity:1; transform:translateY(0) scale(1); }

      }



      @keyframes tapzySignal{

        0%{ transform:scale(.62); opacity:.95; }

        70%{ opacity:.16; }

        100%{ transform:scale(1.18); opacity:0; }

      }



      @keyframes tapzyLoadBar{

        0%{ transform:scaleX(0); }

        72%{ transform:scaleX(.86); }

        100%{ transform:scaleX(1); }

      }



      @keyframes tapzyGridDrift{

        from{ background-position:0 0, 0 0; }

        to{ background-position:42px 42px, 42px 42px; }

      }



      @keyframes tapzyAuroraOne{

        from{ transform:translateX(-50%) translateY(0) scale(.96); opacity:.48; }

        to{ transform:translateX(-50%) translateY(18px) scale(1.08); opacity:.72; }

      }



      @keyframes tapzyAuroraTwo{

        from{ transform:translateY(0) scale(1); opacity:.38; }

        to{ transform:translateY(-18px) scale(1.12); opacity:.58; }

      }



      @keyframes tapzyOrbit{

        from{ transform:rotate(0deg); }

        to{ transform:rotate(360deg); }

      }



      .tapzy-contact-prompt{

        position:sticky;

        top:14px;

        z-index:50;

        margin-bottom:18px;

      }



      .tapzy-contact-prompt-inner{

        border-radius:22px;

        padding:16px 18px;

        border:1px solid rgba(136,216,255,.14);

        background:

          radial-gradient(circle at 50% 0%, rgba(120,210,255,.10), transparent 55%),

          linear-gradient(180deg, rgba(8,12,20,.98), rgba(0,0,0,1));

        box-shadow:

          0 10px 28px rgba(0,0,0,.24),

          inset 0 1px 0 rgba(255,255,255,.04);

      }



      .tapzy-contact-title{

        color:#fff;

        font-size:18px;

        font-weight:800;

      }



      .tapzy-contact-subtitle{

        margin-top:6px;

        color:#b9d7f0;

        font-size:13px;

        text-shadow:0 0 10px rgba(103,196,255,.18);

      }



      .tapzy-contact-actions{

        display:flex;

        gap:10px;

        flex-wrap:wrap;

        margin-top:14px;

      }



      .tapzy-contact-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:42px;

        padding:0 16px;

        border:none;

        border-radius:14px;

        text-decoration:none;

        cursor:pointer;

        background:

          radial-gradient(circle at 50% 0%, rgba(150,230,255,.18), transparent 55%),

          linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));

        color:#fff;

        font-size:14px;

        font-weight:800;

        box-shadow:

          0 0 16px rgba(80,150,255,.16),

          inset 0 1px 0 rgba(255,255,255,.14);

      }



      .tapzy-contact-btn-dark{

        background:linear-gradient(180deg, rgba(14,16,22,.96), rgba(0,0,0,1));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 8px 16px rgba(0,0,0,.16);

      }



      @keyframes tapzyGlowPulse{

        0%,100%{ transform:scale(.94); opacity:.82; }

        50%{ transform:scale(1.08); opacity:1; }

      }



      @keyframes tapzyRingPulse{

        0%,100%{ transform:scale(.96); opacity:.78; }

        50%{ transform:scale(1.08); opacity:1; }

      }



      @keyframes tapzyDotPulse{

        0%,100%{ transform:translateX(-50%) scale(.85); opacity:.85; }

        50%{ transform:translateX(-50%) scale(1.25); opacity:1; }

      }



      .profile-showcase{

        position:relative;

        overflow:hidden;

        border-radius:34px;

        padding:28px;

        border:1px solid rgba(255,255,255,.08);

        background:

          linear-gradient(180deg, rgba(3,5,12,.98), rgba(0,0,0,1));

        box-shadow:

          0 0 0 1px rgba(115,194,255,.06),
          0 0 42px rgba(87,170,255,.08),
          0 24px 70px rgba(0,0,0,.66),

          inset 0 1px 0 rgba(255,255,255,.03);

      }



      .profile-showcase-bg{

        position:absolute;

        inset:0;

        pointer-events:none;

        border-radius:34px;

        background:

          radial-gradient(500px 300px at 72% 22%, rgba(36,80,125,.42), transparent 58%),

          radial-gradient(380px 220px at 18% 10%, rgba(20,42,88,.16), transparent 52%);

        opacity:.95;

      }



      .profile-showcase-top{

        position:relative;

        z-index:2;

        display:grid;

        grid-template-columns:140px minmax(0, 1fr);

        gap:24px;

        align-items:start;

      }



      .profile-showcase-avatar-wrap{

        position:relative;
        width:140px;
        height:140px;
      }

      .profile-showcase-avatar-wrap::before{
        content:"";
        position:absolute;
        inset:-8px;
        border-radius:38px;
        pointer-events:none;
        background:
          radial-gradient(circle at 50% 16%, rgba(115,194,255,.32), transparent 56%),
          linear-gradient(180deg, rgba(115,194,255,.34), rgba(55,108,210,.16));
        filter:blur(10px);
        opacity:.76;
        transition:opacity .22s ease, filter .22s ease, transform .22s ease;
      }

      .profile-showcase-avatar-wrap:hover::before{
        opacity:1;
        filter:blur(12px);
        transform:scale(1.02);
      }



      .profile-showcase-avatar{

        width:140px;

        height:140px;

        border-radius:30px;

        overflow:hidden;

        appearance:none;
        -webkit-appearance:none;
        padding:0;
        cursor:pointer;
        position:relative;
        z-index:1;
        display:flex;

        align-items:center;

        justify-content:center;

        font-size:54px;

        font-weight:900;

        color:#ffffff;

        border:3px solid rgba(115,194,255,.92);

        background:

          radial-gradient(circle at 30% 24%, rgba(255,255,255,.03), transparent 28%),

          linear-gradient(180deg, rgba(5,8,14,.98), rgba(0,0,0,1));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 0 0 1px rgba(255,255,255,.02),

          0 0 22px rgba(87,170,255,.22),

          0 0 42px rgba(48,110,255,.16),

          0 12px 30px rgba(0,0,0,.28);

        transition:

          border-color .22s ease,

          box-shadow .22s ease,

          transform .22s ease;

      }



      .profile-showcase-avatar:hover{

        border-color:rgba(145,214,255,.98);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.05),

          0 0 28px rgba(87,170,255,.32),

          0 0 56px rgba(48,110,255,.24),

          0 14px 34px rgba(0,0,0,.32);

        transform:translateY(-1px);

      }



      .profile-showcase-avatar img{

        width:100%;

        height:100%;

        object-fit:cover;

      }

      .profile-showcase-avatar-wrap::after{
        content:"";
        position:absolute;
        inset:-15px;
        border-radius:44px;
        pointer-events:none;
        background:radial-gradient(circle at 50% 50%, rgba(85,179,255,.34), transparent 62%);
        filter:blur(18px);
        opacity:.82;
        z-index:0;
      }



      .profile-showcase-main{

        min-width:0;

        padding-top:2px;

      }



      .profile-showcase-name{

        font-size:52px;

        line-height:1.08;

        font-weight:900;

        letter-spacing:-1.8px;

        color:#fff;

        white-space:nowrap;

        overflow:hidden;

        text-overflow:ellipsis;

      }



      .profile-showcase-handle{

        margin-top:10px;

        color:#ffffff;

        font-size:22px;

        font-weight:500;

        line-height:1.1;

        white-space:nowrap;

        overflow:hidden;

        text-overflow:ellipsis;

      }



      .profile-showcase-actions{

        display:flex;

        gap:12px;

        flex-wrap:wrap;

        align-items:center;

        margin-top:18px;

        width:auto;

      }



      .profile-showcase-actions form{

        margin:0;

        flex:0 0 auto;
        touch-action:none;
        user-select:none;
        cursor:grab;

      }



      .profile-pill-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:54px;

        padding:0 22px;

        border-radius:22px;

        text-decoration:none;

        border:1px solid rgba(255,255,255,.08);

        background:

          linear-gradient(180deg, rgba(10,12,18,.98), rgba(0,0,0,1));

        color:#fff;

        font-size:15px;

        font-weight:800;

        letter-spacing:.1px;

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 8px 18px rgba(0,0,0,.18);

        width:auto;

        flex:0 0 auto;

        max-width:100%;

        white-space:nowrap;
        transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease, background .18s ease;

      }



      .profile-pill-btn-dark{

        background:linear-gradient(180deg, rgba(10,12,18,.98), rgba(0,0,0,1));

      }



      .profile-showcase-actions form .btn,

      .profile-showcase-actions .btn{

        min-height:54px;

        padding:0 22px;

        border-radius:22px;

        font-size:15px;

        font-weight:800;

        border:1px solid rgba(255,255,255,.08);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 8px 18px rgba(0,0,0,.18);

        width:auto;

        flex:0 0 auto;

        max-width:100%;

        white-space:nowrap;

      }



      .profile-showcase-actions .btn.btnDark,

      .profile-showcase-actions form .btn.btnDark{

        background:linear-gradient(180deg, rgba(10,12,18,.98), rgba(0,0,0,1));

        color:#fff;

      }





      .profile-pill-btn:hover,

      .profile-mini-action:hover,

      .profile-showcase-actions .btn:hover,

      .tapzy-contact-btn:hover{

        border-color:rgba(115,194,255,.92);

        box-shadow:

          0 0 18px rgba(87,170,255,.24),

          0 0 42px rgba(48,110,255,.18),

          inset 0 1px 0 rgba(255,255,255,.08);

        transform:translateY(-1px);

      }

      .profile-showcase-actions form .btn:not(.btnDark),

      .profile-showcase-actions .btn:not(.btnDark){

        background:

          radial-gradient(circle at 50% 0%, rgba(130,180,255,.16), transparent 55%),

          linear-gradient(180deg, rgba(22,45,95,.95), rgba(10,20,48,.99));

        color:#fff;

        border-color:rgba(140,220,255,.16);

        box-shadow:

          0 0 16px rgba(80,150,255,.10),

          inset 0 1px 0 rgba(255,255,255,.10);

      }



      .profile-panel{

        position:relative;

        overflow:hidden;

        border-radius:34px;

        padding:26px;

        border:1px solid rgba(255,255,255,.08);

        background:

          radial-gradient(500px 300px at 72% 22%, rgba(36,80,125,.24), transparent 58%),

          linear-gradient(180deg, rgba(3,5,12,.98), rgba(0,0,0,1));

        box-shadow:

          0 18px 40px rgba(0,0,0,.28),

          inset 0 1px 0 rgba(255,255,255,.03);

      }



      .profile-panel-row{

        display:flex;

        justify-content:space-between;

        gap:16px;

        align-items:flex-start;

        flex-wrap:wrap;

      }



      .profile-panel-heading{

        margin:0;

        color:#fff;

        font-size:28px;

        font-weight:900;

        letter-spacing:-.6px;

      }



      .profile-panel-subheading,

      .profile-section-text{

        color:#ffffff;

        font-size:18px;

        line-height:1.7;

        max-width:760px;

      }



      .profile-section-title{

        color:#fff;

        font-size:24px;

        font-weight:900;

      }



      .profile-mini-action{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:44px;

        padding:0 16px;

        border-radius:16px;

        text-decoration:none;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(10,12,18,.98), rgba(0,0,0,1));

        color:#fff;

        font-size:14px;

        font-weight:800;

      }



      .profile-attending-banner{

        background:

          radial-gradient(600px 260px at 78% 18%, rgba(60,120,210,.24), transparent 48%),

          linear-gradient(180deg, rgba(5,10,20,.98), rgba(0,0,0,1));

      }



      .profile-attending-kicker{

        color:#cfe6ff;

        text-transform:uppercase;

        letter-spacing:4px;

        font-size:12px;

        font-weight:800;

      }



      .profile-attending-title{

        margin-top:12px;

        color:#fff;

        font-size:30px;

        font-weight:900;

        letter-spacing:-.6px;

      }



      .profile-attending-sub{

        margin-top:8px;

        color:#d7e3f2;

        font-size:16px;

        line-height:1.7;

      }



      .profile-attending-actions{

        margin-top:16px;

      }



      .profile-stories-tray{

        display:flex;

        gap:14px;

        overflow-x:auto;

        padding-top:16px;

        -webkit-overflow-scrolling:touch;

      }



      .profile-story-card{

        min-width:132px;

        width:132px;

        text-decoration:none;

        flex:0 0 auto;
        touch-action:none;
        user-select:none;
        cursor:grab;

      }



      .profile-story-card-ring{

        padding:3px;

        border-radius:30px;

        background:

          linear-gradient(180deg, rgba(115,194,255,.95), rgba(55,108,210,.95));

        box-shadow:0 0 20px rgba(87,170,255,.18);

      }



      .profile-story-card-inner{

        width:126px;

        height:182px;

        border-radius:27px;

        overflow:hidden;

        background:linear-gradient(180deg, rgba(7,10,16,.98), rgba(0,0,0,1));

        border:1px solid rgba(255,255,255,.05);

        position:relative;

      }



      .tz-video-frame{position:relative;overflow:hidden;background:#05070d;width:100%;height:100%;}
      .tz-video-preview{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;cursor:pointer;background:radial-gradient(circle at 50% 20%, rgba(52,116,255,.22), transparent 42%),linear-gradient(180deg, rgba(8,12,24,.96), rgba(3,5,12,.98));transition:opacity .22s ease, visibility .22s ease;}
      .tz-video-preview-blur{position:absolute;inset:0;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}
      .tz-video-preview-badge{position:relative;z-index:1;width:60px;height:60px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:rgba(10,14,24,.72);border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 28px rgba(0,0,0,.34);color:#fff;font-size:24px;line-height:1;}
      .tz-video-frame.is-ready .tz-video-preview,.tz-video-frame.is-playing .tz-video-preview{opacity:0;visibility:hidden;pointer-events:none;}
      .profile-story-card-media{

        width:100%;

        height:100%;

        object-fit:cover;

        display:block;

      }



      .profile-story-card-textonly{

        width:100%;

        height:100%;

        display:flex;

        align-items:center;

        justify-content:center;

        padding:16px;

        text-align:center;

        color:#fff;

        font-size:16px;

        line-height:1.4;

        font-weight:800;

        background:

          radial-gradient(400px 180px at 50% 0%, rgba(95,182,255,.12), transparent 42%),

          linear-gradient(180deg, rgba(14,18,28,.96), rgba(8,10,16,.99));

      }



      .profile-story-card-meta{

        margin-top:10px;

      }



      .profile-story-card-time{

        color:#fff;

        font-size:14px;

        font-weight:800;

      }



      .profile-story-card-label{

        margin-top:4px;

        color:#c7d5e7;

        font-size:12px;

      }



      .profile-quick-actions{

        display:flex;

        flex-wrap:wrap;

        gap:12px;

        margin-top:16px;

      }



      .profile-quick-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:48px;

        padding:0 18px;

        border-radius:18px;

        text-decoration:none;

        border:1px solid rgba(255,255,255,.08);

        background:

          linear-gradient(180deg, rgba(10,12,18,.98), rgba(0,0,0,1));

        color:#fff;

        font-size:14px;

        font-weight:800;

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 8px 18px rgba(0,0,0,.18);

        transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease;

      }



      .profile-quick-btn:hover,
      .profile-quick-btn:focus-visible{

        transform:translateY(-1px);

        border-color:rgba(115,194,255,.92);

        background:
          radial-gradient(circle at 50% 0%, rgba(115,194,255,.18), transparent 56%),
          linear-gradient(180deg, rgba(10,12,18,.98), rgba(0,0,0,1));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.08),

          0 0 18px rgba(87,170,255,.28),
          0 0 44px rgba(48,110,255,.20),
          0 10px 24px rgba(0,0,0,.24);

      }



      .profile-edit-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:56px;

        padding:0 24px;

        border-radius:22px;

        text-decoration:none;

        border:1px solid rgba(255,255,255,.08);

        background:

          linear-gradient(180deg, rgba(10,12,18,.98), rgba(0,0,0,1));

        color:#fff;

        font-size:15px;

        font-weight:800;

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 8px 18px rgba(0,0,0,.18);
        transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease, background .18s ease;

      }

      .profile-edit-btn:hover,
      .profile-edit-btn:focus-visible{
        transform:translateY(-1px);
        border-color:rgba(115,194,255,.92);
        background:
          radial-gradient(circle at 50% 0%, rgba(115,194,255,.18), transparent 56%),
          linear-gradient(180deg, rgba(10,12,18,.98), rgba(0,0,0,1));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.08),
          0 0 18px rgba(87,170,255,.28),
          0 0 44px rgba(48,110,255,.20),
          0 10px 24px rgba(0,0,0,.24);
      }




      .profile-photo-viewer{
        position:fixed;
        inset:0;
        z-index:9999;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:22px;
        opacity:0;
        visibility:hidden;
        pointer-events:none;
        transition:opacity .22s ease, visibility .22s ease;
      }

      .profile-photo-viewer.is-open{
        opacity:1;
        visibility:visible;
        pointer-events:auto;
      }

      .profile-photo-viewer-backdrop{
        position:absolute;
        inset:0;
        border:0;
        background:rgba(0,0,0,.74);
        backdrop-filter:blur(14px);
        -webkit-backdrop-filter:blur(14px);
      }

      .profile-photo-viewer-card{
        position:relative;
        width:min(88vw, 520px);
        border-radius:34px;
        padding:10px;
        background:
          linear-gradient(180deg, rgba(115,194,255,.95), rgba(55,108,210,.95));
        box-shadow:
          0 0 26px rgba(87,170,255,.34),
          0 0 70px rgba(48,110,255,.24),
          0 22px 60px rgba(0,0,0,.46);
      }

      .profile-photo-viewer-frame{
        aspect-ratio:1 / 1;
        border-radius:28px;
        overflow:hidden;
        background:linear-gradient(180deg, rgba(7,10,16,.98), rgba(0,0,0,1));
        display:flex;
        align-items:center;
        justify-content:center;
      }

      .profile-photo-viewer-frame img{
        width:100%;
        height:100%;
        object-fit:cover;
        display:block;
      }

      .profile-photo-viewer-initial{
        color:#fff;
        font-size:120px;
        font-weight:900;
      }

      .profile-photo-viewer-close{
        position:absolute;
        top:-14px;
        right:-14px;
        width:44px;
        height:44px;
        border-radius:999px;
        border:1px solid rgba(115,194,255,.52);
        background:rgba(5,8,14,.92);
        color:#fff;
        font-size:30px;
        line-height:1;
        cursor:pointer;
        box-shadow:0 0 20px rgba(87,170,255,.28);
      }

      .profile-edit-btn:hover,
      .profile-edit-btn:focus-visible,
      .profile-quick-btn:hover,
      .profile-quick-btn:focus-visible,
      .profile-pill-btn:hover,
      .profile-pill-btn:focus-visible,
      .profile-mini-action:hover,
      .profile-mini-action:focus-visible,
      .profile-showcase-actions .btn:hover,
      .profile-showcase-actions .btn:focus-visible{
        border-color:rgba(115,194,255,.92) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.08),
          0 0 18px rgba(87,170,255,.30),
          0 0 46px rgba(48,110,255,.22),
          0 10px 24px rgba(0,0,0,.24) !important;
        transform:translateY(-1px);
      }

      @media(max-width:700px){

        .tapzy-tap-card{

          width:min(92vw, 320px);

          padding:24px 18px;

          border-radius:24px;

        }



        .tapzy-tap-title{

          font-size:24px;

        }



        .tapzy-tap-subtitle{

          font-size:14px;

        }



        .tapzy-contact-actions{

          flex-direction:column;

        }



        .tapzy-contact-btn{

          width:100%;

        }



        .profile-showcase{

          padding:20px;

          border-radius:28px;

        }



        .profile-showcase-bg{

          border-radius:28px;

        }



        .profile-showcase-top{

          display:flex;

          flex-direction:column;

          gap:14px;

          align-items:flex-start;

        }



        .profile-showcase-avatar-wrap{
          width:88px;
          height:88px;
        }

        .profile-showcase-avatar-wrap::before{
          inset:-7px;
          border-radius:30px;
        }

        .profile-showcase-avatar{

          width:88px;

          height:88px;

          border-radius:22px;

          font-size:32px;

        }



        .profile-showcase-main{

          width:100%;

          padding-top:0;

        }



        .profile-showcase-name{

          font-size:34px;

          letter-spacing:-1.1px;

          line-height:1.08;

          white-space:normal;

        }



        .profile-showcase-handle{

          font-size:18px;

          margin-top:8px;

          line-height:1.1;

          white-space:normal;

        }



        .profile-showcase-actions{

          margin-top:12px;

          gap:8px;

          display:flex;

          flex-wrap:wrap;

          align-items:center;

          width:100%;

        }



        .profile-showcase-actions form{

          margin:0;

          flex:0 0 auto;

        }



        .profile-showcase-actions form .btn,

        .profile-showcase-actions .btn,

        .profile-pill-btn{

          min-height:46px;

          padding:0 16px;

          border-radius:18px;

          font-size:14px;

          width:auto;

          max-width:100%;

          flex:0 0 auto;

          white-space:nowrap;

        }



        .profile-panel{

          padding:20px;

          border-radius:28px;

        }



        .profile-panel-heading{

          font-size:24px;

        }



        .profile-panel-subheading,

        .profile-section-text{

          font-size:16px;

        }



        .profile-section-title{

          font-size:22px;

        }



        .profile-quick-btn{

          min-height:44px;

          padding:0 16px;

          border-radius:16px;

          font-size:13px;

        }

      }

    </style>



    ${

      isTapOpen

        ? `

        <script>

          (function(){

            const overlay = document.getElementById("tapzyTapOverlay");

            const prompt = document.getElementById("tapzyContactPrompt");

            const profileShell = document.getElementById("tapzyProfileShell");

            const dismiss = document.getElementById("tapzyContactDismiss");



            window.setTimeout(function(){

              if (overlay) overlay.style.display = "none";

              if (profileShell) {

                profileShell.classList.remove("tapzy-profile-hidden");

                profileShell.classList.add("tapzy-profile-visible");

              }

              if (prompt) prompt.style.display = "block";

            }, 1900);



            if (dismiss) {

              dismiss.addEventListener("click", function(){

                if (prompt) prompt.style.display = "none";

              });

            }

          })();

        </script>

        `

        : ""

    }

    <script>
      (function(){
        function initProfilePhotoViewer(){
          const viewer = document.getElementById('profilePhotoViewer');
          const openBtn = document.querySelector('[data-profile-photo-open]');
          if (!viewer || !openBtn) return;
          const closeBtns = viewer.querySelectorAll('[data-profile-photo-close]');
          const openViewer = function(){
            viewer.classList.add('is-open');
            viewer.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
          };
          const closeViewer = function(){
            viewer.classList.remove('is-open');
            viewer.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
          };
          openBtn.addEventListener('click', openViewer);
          closeBtns.forEach(function(btn){ btn.addEventListener('click', closeViewer); });
          document.addEventListener('keydown', function(e){
            if (e.key === 'Escape' && viewer.classList.contains('is-open')) closeViewer();
          });
        }
        function initVideoPreviewFrames(root){
          (root || document).querySelectorAll('[data-video-frame]').forEach(function(frame){
            if (frame.dataset.videoReady === '1') return;
            frame.dataset.videoReady = '1';
            const video = frame.querySelector('video');
            const preview = frame.querySelector('[data-video-preview]');
            if (!video || !preview) return;
            const markReady = function(){ frame.classList.add('is-ready'); };
            const markPlaying = function(){ frame.classList.add('is-playing'); frame.classList.add('is-ready'); };
            const markPaused = function(){ frame.classList.remove('is-playing'); };
            const warmPreviewFrame = function(){
              try {
                video.muted = true;
                video.setAttribute('muted', '');
                video.setAttribute('playsinline', '');
                video.setAttribute('webkit-playsinline', '');
                video.preload = 'auto';
                if (video.readyState === 0) video.load();
                if (video.readyState >= 1 && !video.dataset.previewSeeked) {
                  video.dataset.previewSeeked = '1';
                  const target = Math.min(0.12, Math.max(0.01, (video.duration || 1) - 0.01));
                  video.currentTime = target;
                }
              } catch (err) {}
            };
            preview.addEventListener('click', function(){ video.play().catch(function(){}); });
            preview.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); video.play().catch(function(){}); } });
            video.addEventListener('loadedmetadata', warmPreviewFrame, { once: true });
            video.addEventListener('loadeddata', markReady, { once: true });
            video.addEventListener('canplay', markReady, { once: true });
            video.addEventListener('seeked', markReady, { once: true });
            video.addEventListener('play', markPlaying);
            video.addEventListener('playing', markPlaying);
            video.addEventListener('pause', markPaused);
            warmPreviewFrame();
            if (video.readyState >= 2) markReady();
          });
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', function(){ initProfilePhotoViewer(); initVideoPreviewFrames(document); }, { once: true });
        } else {
          initProfilePhotoViewer();
          initVideoPreviewFrames(document);
        }
      })();
    </script>

    `;



    res.send(

      renderShell(`@${profile.username} • Tapzy Network™`, body, "", {

        currentProfile,

        pageTitle: profile.username || "Profile",

        pageType: "profile",

        metaDescription: `${displayName} on Tapzy Network™. View profile, quick share links, stories, and contact details.`,

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("Profile page error");

  }

});



router.get("/edit/:username", async (req, res) => {

  try {

    const username = cleanUsername(req.params.username);

    const profile = await prisma.userProfile.findUnique({ where: { username } });



    if (!profile) return res.status(404).send("Profile not found");

    if (!requireOwnerAccess(profile, req, res)) return;



    const keyQuery = ownerKeyQuery(req, profile);

    const photoPositionX = Number.isFinite(Number(profile.profilePhotoPositionX)) ? Number(profile.profilePhotoPositionX) : 50;
    const photoPositionY = Number.isFinite(Number(profile.profilePhotoPositionY)) ? Number(profile.profilePhotoPositionY) : 50;
    const photoScale = Number.isFinite(Number(profile.profilePhotoScale)) ? Math.max(100, Math.min(180, Number(profile.profilePhotoScale))) : 100;



    const currentPhotoHtml = profile.photo

      ? `

        <div class="tz-edit-photo-card">

          <div class="tz-edit-photo-preview">

            <img src="${escapeHtml(profile.photo)}" alt="Current profile photo" data-photo-position-preview style="object-position:${photoPositionX}% ${photoPositionY}%; transform:scale(${photoScale / 100});" />

          </div>

          <div class="tz-edit-photo-meta">

            <div class="tz-edit-photo-title">Current profile photo</div>

            <div class="tz-edit-photo-sub">Your current Tapzy profile image.</div>

          </div>

        </div>

      `

      : `

        <div class="tz-edit-photo-card">

          <div class="tz-edit-photo-preview tz-edit-photo-empty" data-photo-empty-preview>No photo</div>

          <div class="tz-edit-photo-meta">

            <div class="tz-edit-photo-title">Current profile photo</div>

            <div class="tz-edit-photo-sub">No profile image uploaded yet.</div>

          </div>

        </div>

      `;



    const body = `

    <div class="wrap tz-edit-wrap">

      <div class="tz-edit-shell">



        <section class="tz-edit-hero">

          <div class="tz-edit-hero-bg"></div>



          <div class="tz-edit-hero-top">

            <div>

              <div class="tz-edit-kicker">TAPZY PROFILE</div>

              <h1 class="tz-edit-title">Edit Profile</h1>

              <div class="tz-edit-subtitle">

                Update your Tapzy identity and quick share settings.

              </div>

            </div>



            <div class="tz-edit-actions">

              <a class="tz-edit-btn" href="/u/${escapeHtml(profile.username || "")}">View Profile</a>

              <a class="tz-edit-btn" href="/qr/${escapeHtml(profile.username || "")}">QR</a>

            </div>

          </div>

        </section>



        <form method="POST" action="/edit/${escapeHtml(profile.username || "")}${keyQuery}" enctype="multipart/form-data" class="tz-edit-form">



          <section class="tz-edit-section">

            <div class="tz-edit-section-head">

              <h3>Identity</h3>

              <p>Main public details people see first.</p>

            </div>



            <div class="tz-edit-grid tz-edit-grid-one">

              <div class="tz-field">

                <label>Name</label>

                <input name="name" value="${escapeHtml(profile.name || "")}" placeholder="Your name" />

              </div>



              <div class="tz-field">

                <label>Title</label>

                <input name="title" value="${escapeHtml(profile.title || "")}" placeholder="Founder of Tapzy" />

              </div>



              <div class="tz-field">

                <label>Bio</label>

                <textarea name="bio" placeholder="Short premium bio">${escapeHtml(profile.bio || "")}</textarea>

              </div>

            </div>

          </section>



          <section class="tz-edit-section">

            <div class="tz-edit-section-head">

              <h3>Profile Photo</h3>

              <p>Manage your Tapzy profile image.</p>

            </div>



            <div class="tz-edit-upload-wrap">

              ${currentPhotoHtml}



              <div class="tz-edit-upload-box">

                <label class="tz-field">Upload New Profile Photo</label>

                <input id="tzPhotoFileInput" class="tz-upload-input tz-upload-input-hidden" type="file" name="photo" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" data-photo-position-file onchange="window.tapzyHandlePhotoFile && window.tapzyHandlePhotoFile(this)" />

                <input type="hidden" name="profilePhotoPositionX" value="${photoPositionX}" data-photo-position-x data-photo-position-x-value />
                <input type="hidden" name="profilePhotoPositionY" value="${photoPositionY}" data-photo-position-y data-photo-position-y-value />
                <input type="hidden" name="profilePhotoScale" value="${photoScale}" data-photo-scale data-photo-scale-value />
                <input type="hidden" name="croppedPhotoData" value="" data-cropped-photo-data />

                <label class="tz-photo-pick-btn" for="tzPhotoFileInput" data-photo-pick-trigger>
                  <span class="tz-photo-pick-icon">＋</span>
                  <span>Choose photo</span>
                </label>
                <div class="tz-photo-crop-note">After choosing a photo, a full-screen Move and scale editor opens automatically.</div>

                <div class="tz-photo-crop-modal" data-photo-crop-modal aria-hidden="true">
                  <div class="tz-photo-crop-topbar">
                    <button type="button" class="tz-photo-crop-textbtn" data-photo-crop-cancel>Cancel</button>
                    <div class="tz-photo-crop-title">Move and scale</div>
                    <button type="button" class="tz-photo-crop-done" data-photo-crop-done>Done</button>
                  </div>
                  <div class="tz-photo-crop-stage" data-photo-crop-stage>
                    <img data-photo-crop-img alt="Selected profile photo" />
                    <div class="tz-photo-crop-mask"></div>
                    <div class="tz-photo-crop-ring"></div>
                  </div>
                  <div class="tz-photo-crop-hint">Drag to move • pinch to zoom</div>
                </div>



                <label class="tz-switch-row">

                  <div class="tz-switch-copy">

                    <strong>Remove current photo</strong>

                    <span>Turn this on if you want the current profile photo removed when you save.</span>

                  </div>



                  <span class="tz-check-wrap">

                    <input type="checkbox" name="removePhoto" />

                  </span>

                </label>

              </div>

            </div>

          </section>



          <section class="tz-edit-section">

            <div class="tz-edit-section-head">

              <h3>Contact Details</h3>

              <p>Your core contact information.</p>

            </div>



            <div class="tz-edit-grid">

              <div class="tz-field">

                <label>Phone</label>

                <input name="phone" value="${escapeHtml(profile.phone || "")}" />

              </div>



              <div class="tz-field">

                <label>Email</label>

                <input name="email" value="${escapeHtml(profile.email || "")}" />

              </div>



              <div class="tz-field tz-field-full">

                <label>Website</label>

                <input name="website" value="${escapeHtml(profile.website || "")}" />

              </div>

            </div>

          </section>



          <section class="tz-edit-section">

            <div class="tz-edit-section-head">

              <h3>Social Links</h3>

              <p>Connect your social presence to your Tapzy profile.</p>

            </div>



            <div class="tz-edit-grid">

              <div class="tz-field">

                <label>Instagram</label>

                <input name="instagram" value="${escapeHtml(profile.instagram || "")}" />

              </div>



              <div class="tz-field">

                <label>LinkedIn</label>

                <input name="linkedin" value="${escapeHtml(profile.linkedin || "")}" />

              </div>



              <div class="tz-field">

                <label>TikTok</label>

                <input name="tiktok" value="${escapeHtml(profile.tiktok || "")}" />

              </div>



              <div class="tz-field">

                <label>X / Twitter</label>

                <input name="twitter" value="${escapeHtml(profile.twitter || "")}" />

              </div>



              <div class="tz-field">

                <label>Facebook</label>

                <input name="facebook" value="${escapeHtml(profile.facebook || "")}" />

              </div>



              <div class="tz-field">

                <label>YouTube</label>

                <input name="youtube" value="${escapeHtml(profile.youtube || "")}" />

              </div>



              <div class="tz-field">

                <label>GitHub</label>

                <input name="github" value="${escapeHtml(profile.github || "")}" />

              </div>



              <div class="tz-field">

                <label>Snapchat</label>

                <input name="snapchat" value="${escapeHtml(profile.snapchat || "")}" />

              </div>



              <div class="tz-field">

                <label>WhatsApp</label>

                <input name="whatsapp" value="${escapeHtml(profile.whatsapp || "")}" />

              </div>



              <div class="tz-field">

                <label>Telegram</label>

                <input name="telegram" value="${escapeHtml(profile.telegram || "")}" />

              </div>

            </div>

          </section>



          <section class="tz-edit-section">

            <div class="tz-edit-section-head">

              <h3>Quick Share Settings</h3>

              <p>Choose what Tapzy shares instantly.</p>

            </div>



            <div class="tz-toggle-list">

              <label class="tz-toggle-row">

                <span>Enable Quick Share</span>

                <input type="checkbox" name="quickShareEnabled" ${profile.quickShareEnabled ? "checked" : ""} />

              </label>



              <div class="tz-edit-grid">

                <label class="tz-toggle-row"><span>Share Name</span><input type="checkbox" name="shareNameEnabled" ${profile.shareNameEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share Phone</span><input type="checkbox" name="sharePhoneEnabled" ${profile.sharePhoneEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share Email</span><input type="checkbox" name="shareEmailEnabled" ${profile.shareEmailEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share Website</span><input type="checkbox" name="shareWebsiteEnabled" ${profile.shareWebsiteEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share Instagram</span><input type="checkbox" name="shareInstagramEnabled" ${profile.shareInstagramEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share LinkedIn</span><input type="checkbox" name="shareLinkedinEnabled" ${profile.shareLinkedinEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share TikTok</span><input type="checkbox" name="shareTiktokEnabled" ${profile.shareTiktokEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share X</span><input type="checkbox" name="shareTwitterEnabled" ${profile.shareTwitterEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share Facebook</span><input type="checkbox" name="shareFacebookEnabled" ${profile.shareFacebookEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share YouTube</span><input type="checkbox" name="shareYoutubeEnabled" ${profile.shareYoutubeEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share GitHub</span><input type="checkbox" name="shareGithubEnabled" ${profile.shareGithubEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share Snapchat</span><input type="checkbox" name="shareSnapchatEnabled" ${profile.shareSnapchatEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share WhatsApp</span><input type="checkbox" name="shareWhatsappEnabled" ${profile.shareWhatsappEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share Telegram</span><input type="checkbox" name="shareTelegramEnabled" ${profile.shareTelegramEnabled ? "checked" : ""} /></label>

              </div>

            </div>

          </section>



          <div class="tz-edit-savebar">

            <button class="tz-edit-savebtn" type="submit">Save Profile</button>

          </div>

        </form>

      </div>

    </div>



    <style>

      .tz-edit-wrap{

        max-width:920px;

      }



      .tz-edit-shell{

        display:flex;

        flex-direction:column;

        gap:16px;

      }



      .tz-edit-hero{

        position:relative;

        overflow:hidden;

        border-radius:34px;

        padding:28px;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(3,5,12,.98), rgba(0,0,0,1));

        box-shadow:

          0 24px 70px rgba(0,0,0,.66),

          inset 0 1px 0 rgba(255,255,255,.03);

      }



      .tz-edit-hero-bg{

        position:absolute;

        inset:0;

        pointer-events:none;

        border-radius:34px;

        background:

          radial-gradient(500px 300px at 72% 22%, rgba(36,80,125,.42), transparent 58%),

          radial-gradient(380px 220px at 18% 10%, rgba(20,42,88,.16), transparent 52%);

      }



      .tz-edit-hero-top{

        position:relative;

        z-index:2;

        display:flex;

        align-items:flex-start;

        justify-content:space-between;

        gap:18px;

        flex-wrap:wrap;

      }



      .tz-edit-kicker{

        color:#d7deeb;

        font-size:12px;

        letter-spacing:6px;

        text-transform:uppercase;

        margin-bottom:12px;

      }



      .tz-edit-title{

        margin:0;

        font-size:52px;

        line-height:.98;

        letter-spacing:-1.8px;

        font-weight:900;

        color:#fff;

      }



      .tz-edit-subtitle{

        margin-top:12px;

        color:#ffffff;

        font-size:18px;

        line-height:1.7;

        max-width:720px;

      }



      .tz-edit-actions{

        display:flex;

        gap:10px;

        flex-wrap:wrap;

      }



      .tz-edit-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:52px;

        padding:0 20px;

        border-radius:20px;

        text-decoration:none;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(10,12,18,.98), rgba(0,0,0,1));

        color:#fff;

        font-size:14px;

        font-weight:800;

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 8px 16px rgba(0,0,0,.16);

      }



      .tz-edit-form{

        display:flex;

        flex-direction:column;

        gap:16px;

      }



      .tz-edit-section{

        border-radius:34px;

        padding:24px;

        border:1px solid rgba(255,255,255,.08);

        background:

          radial-gradient(500px 300px at 72% 22%, rgba(36,80,125,.24), transparent 58%),

          linear-gradient(180deg, rgba(3,5,12,.98), rgba(0,0,0,1));

        box-shadow:

          0 18px 40px rgba(0,0,0,.28),

          inset 0 1px 0 rgba(255,255,255,.03);

      }



      .tz-edit-section-head{

        margin-bottom:16px;

      }



      .tz-edit-section-head h3{

        margin:0;

        color:#fff;

        font-size:28px;

        font-weight:900;

        letter-spacing:-.6px;

      }



      .tz-edit-section-head p{

        margin:8px 0 0;

        color:#ffffff;

        font-size:16px;

        line-height:1.7;

      }



      .tz-edit-grid{

        display:grid;

        grid-template-columns:1fr 1fr;

        gap:14px;

      }



      .tz-edit-grid-one{

        grid-template-columns:1fr;

      }



      .tz-field{

        display:flex;

        flex-direction:column;

        gap:8px;

      }



      .tz-field-full{

        grid-column:1 / -1;

      }



      .tz-field label{

        margin:0;

        color:#fff;

        font-size:14px;

        font-weight:800;

        letter-spacing:.1px;

      }



      .tz-field input,

      .tz-field textarea{

        width:100%;

        padding:17px 18px;

        border-radius:22px;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(7,10,16,.98), rgba(0,0,0,1));

        color:#fff;

        outline:none;

        box-sizing:border-box;

        box-shadow:inset 0 1px 0 rgba(255,255,255,.02);

        font-size:16px;

      }



      .tz-field input::placeholder,

      .tz-field textarea::placeholder{

        color:#bfc7d4;

      }



      .tz-field input:focus,

      .tz-field textarea:focus{

        border-color:rgba(140,220,255,.22);

        box-shadow:0 0 0 3px rgba(140,220,255,.06);

      }



      .tz-field textarea{

        min-height:150px;

        resize:vertical;

      }



      .tz-edit-upload-wrap{

        display:grid;

        grid-template-columns:1fr;

        gap:14px;

      }



      .tz-edit-photo-card,

      .tz-edit-upload-box{

        border-radius:28px;

        padding:18px;

        border:1px solid rgba(255,255,255,.08);

        background:rgba(255,255,255,.02);

      }



      .tz-edit-photo-card{

        display:flex;

        align-items:center;

        gap:14px;

        flex-wrap:wrap;

      }



      .tz-edit-photo-preview{

        width:110px;

        height:110px;

        border-radius:24px;

        overflow:hidden;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(7,10,16,.98), rgba(0,0,0,1));

        display:flex;

        align-items:center;

        justify-content:center;

        color:#fff;

        font-weight:800;

        flex:0 0 auto;
        touch-action:none;
        user-select:none;
        cursor:grab;

      }



      .tz-edit-photo-preview img{

        width:100%;

        height:100%;

        object-fit:cover;
        transform-origin:center center;
        transition:transform .16s ease, object-position .08s linear;
        pointer-events:none;

      }
      .tz-edit-photo-preview:active{cursor:grabbing;}

      .tz-photo-crop-note{
        margin-top:10px;
        padding:10px 12px;
        border-radius:16px;
        border:1px solid rgba(115,194,255,.16);
        background:rgba(115,194,255,.07);
        color:rgba(225,235,255,.72);
        font-size:12px;
        line-height:1.35;
      }

      .tz-upload-input-hidden{
        position:absolute;
        width:1px;
        height:1px;
        opacity:0;
        pointer-events:none;
      }

      .tz-photo-pick-btn{
        margin-top:12px;
        min-height:52px;
        border-radius:20px;
        border:1px solid rgba(255,255,255,.12);
        background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03));
        color:#fff;
        display:flex;
        align-items:center;
        justify-content:center;
        gap:10px;
        font-weight:900;
        cursor:pointer;
        box-shadow:0 18px 50px rgba(0,0,0,.25);
      }

      .tz-photo-pick-icon{
        width:28px;
        height:28px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        background:rgba(115,194,255,.14);
        border:1px solid rgba(115,194,255,.22);
        color:#73c2ff;
        font-size:20px;
        line-height:1;
      }

      .tz-photo-crop-modal{
        position:fixed;
        inset:0;
        z-index:9999;
        background:#05060a;
        display:none;
        flex-direction:column;
        color:#fff;
        touch-action:none;
      }

      .tz-photo-crop-modal.is-open{display:flex;}

      .tz-photo-crop-topbar{
        height:72px;
        padding:14px 18px;
        padding-top:max(14px, env(safe-area-inset-top));
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        border-bottom:1px solid rgba(255,255,255,.08);
        background:rgba(5,6,10,.86);
        backdrop-filter:blur(16px);
      }

      .tz-photo-crop-title{
        font-weight:900;
        letter-spacing:.01em;
      }

      .tz-photo-crop-textbtn,
      .tz-photo-crop-done{
        border:0;
        background:transparent;
        color:#fff;
        font:inherit;
        font-weight:850;
        padding:10px 8px;
        cursor:pointer;
      }

      .tz-photo-crop-done{
        color:#73c2ff;
      }

      .tz-photo-crop-stage{
        position:relative;
        flex:1;
        overflow:hidden;
        display:flex;
        align-items:center;
        justify-content:center;
        background:radial-gradient(circle at center, rgba(115,194,255,.12), transparent 44%), #05060a;
        touch-action:none;
        user-select:none;
      }

      .tz-photo-crop-stage img{
        position:absolute;
        left:50%;
        top:50%;
        width:82vw;
        max-width:520px;
        height:auto;
        transform:translate(-50%, -50%) scale(1);
        transform-origin:center center;
        will-change:transform;
        user-select:none;
        -webkit-user-drag:none;
      }

      .tz-photo-crop-mask{
        position:absolute;
        inset:0;
        pointer-events:none;
        background:radial-gradient(circle at center, transparent 0 32vw, rgba(0,0,0,.58) calc(32vw + 2px));
      }

      .tz-photo-crop-ring{
        position:absolute;
        left:50%;
        top:50%;
        width:64vw;
        height:64vw;
        max-width:420px;
        max-height:420px;
        transform:translate(-50%, -50%);
        border-radius:50%;
        border:2px solid rgba(255,255,255,.92);
        box-shadow:0 0 0 999px rgba(0,0,0,.34), 0 0 36px rgba(115,194,255,.20);
        pointer-events:none;
      }

      .tz-photo-crop-hint{
        padding:16px 18px max(22px, env(safe-area-inset-bottom));
        text-align:center;
        color:rgba(255,255,255,.72);
        font-size:14px;
        background:rgba(5,6,10,.92);
        border-top:1px solid rgba(255,255,255,.08);
      }




      .tz-edit-photo-title{

        color:#fff;

        font-size:18px;

        font-weight:800;

      }



      .tz-edit-photo-sub{

        color:#ffffff;

        font-size:15px;

        margin-top:6px;

        line-height:1.6;

      }



      .tz-upload-input{

        width:100%;

        padding:14px;

        border-radius:20px;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(7,10,16,.98), rgba(0,0,0,1));

        color:#fff;

        box-sizing:border-box;

      }



      .tz-switch-row{

        margin-top:14px;

        display:flex;

        align-items:center;

        justify-content:space-between;

        gap:14px;

        flex-wrap:wrap;

      }



      .tz-switch-copy strong{

        display:block;

        color:#fff;

        font-size:16px;

      }



      .tz-switch-copy span{

        display:block;

        margin-top:4px;

        color:#ffffff;

        font-size:14px;

        line-height:1.6;

        max-width:620px;

      }



      .tz-check-wrap{

        flex:0 0 auto;
        touch-action:none;
        user-select:none;
        cursor:grab;

      }



      .tz-check-wrap input{

        width:22px;

        height:22px;

      }



      .tz-toggle-list{

        display:flex;

        flex-direction:column;

        gap:12px;

      }



      .tz-toggle-row{

        display:flex;

        align-items:center;

        justify-content:space-between;

        gap:14px;

        padding:16px 18px;

        border-radius:22px;

        border:1px solid rgba(255,255,255,.08);

        background:rgba(255,255,255,.02);

        color:#fff;

        font-size:15px;

        font-weight:800;

      }



      .tz-toggle-row input{

        width:20px;

        height:20px;

        flex:0 0 auto;
        touch-action:none;
        user-select:none;
        cursor:grab;

      }



      .tz-edit-savebar{

        margin-top:4px;

      }



      .tz-edit-savebtn{

        width:100%;

        min-height:60px;

        border:none;

        border-radius:24px;

        cursor:pointer;

        font-size:18px;

        font-weight:900;

        color:#000;

        background:linear-gradient(180deg, #eef4fb, #dfe9f5);

        box-shadow:

          0 12px 28px rgba(0,0,0,.24),

          inset 0 1px 0 rgba(255,255,255,.7);

      }



      @media(max-width:700px){

        .tz-edit-hero{

          padding:20px;

          border-radius:28px;

        }



        .tz-edit-hero-bg{

          border-radius:28px;

        }



        .tz-edit-title{

          font-size:36px;

          letter-spacing:-1.2px;

        }



        .tz-edit-subtitle{

          font-size:16px;

          line-height:1.6;

        }



        .tz-edit-kicker{

          font-size:11px;

          letter-spacing:5px;

        }



        .tz-edit-section{

          padding:20px;

          border-radius:28px;

        }



        .tz-edit-grid{

          grid-template-columns:1fr;

        }



        .tz-edit-photo-card{

          align-items:flex-start;

        }



        .tz-edit-btn{

          min-height:46px;

          border-radius:18px;

          padding:0 16px;

        }



        .tz-edit-savebtn{

          min-height:56px;

          border-radius:20px;

        }

      }

    </style>

    <script>
      (function(){
        var file = document.querySelector('[data-photo-position-file]');
        var previewFrame = document.querySelector('.tz-edit-photo-preview');
        var previewImg = document.querySelector('[data-photo-position-preview]');
        var x = document.querySelector('[data-photo-position-x]');
        var y = document.querySelector('[data-photo-position-y]');
        var scaleInput = document.querySelector('[data-photo-scale]');
        var modal = document.querySelector('[data-photo-crop-modal]');
        var stage = document.querySelector('[data-photo-crop-stage]');
        var cropImg = document.querySelector('[data-photo-crop-img]');
        var doneBtn = document.querySelector('[data-photo-crop-done]');
        var cancelBtn = document.querySelector('[data-photo-crop-cancel]');
        var croppedPhotoData = document.querySelector('[data-cropped-photo-data]');
        var selectedUrl = '';
        var dragging = false;
        var lastX = 0;
        var lastY = 0;
        var state = { tx:0, ty:0, scale:1 };
        var pointers = {};
        var lastDistance = 0;

        function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
        function syncHidden(){
          var px = Math.round(clamp(50 - state.tx / 3.2, 0, 100));
          var py = Math.round(clamp(50 - state.ty / 3.2, 0, 100));
          var ps = Math.round(clamp(state.scale * 100, 100, 240));
          if (x) x.value = String(px);
          if (y) y.value = String(py);
          if (scaleInput) scaleInput.value = String(ps);
          return { px:px, py:py, ps:ps };
        }
        function ensurePreview(){
          if (!previewImg && previewFrame) {
            previewFrame.classList.remove('tz-edit-photo-empty');
            previewFrame.innerHTML = '';
            previewImg = document.createElement('img');
            previewImg.setAttribute('data-photo-position-preview', '');
            previewImg.alt = 'Selected profile photo preview';
            previewFrame.appendChild(previewImg);
          }
          return previewImg;
        }
        function applyTransforms(){
          var vals = syncHidden();
          if (cropImg) {
            cropImg.style.transform = 'translate(calc(-50% + ' + state.tx + 'px), calc(-50% + ' + state.ty + 'px)) scale(' + state.scale + ')';
          }
          var img = ensurePreview();
          if (img && selectedUrl) {
            img.src = selectedUrl;
            img.style.objectPosition = vals.px + '% ' + vals.py + '%';
            img.style.transform = 'scale(' + (vals.ps / 100) + ')';
          }
        }
        function forceOpenModal(){
          if (!modal) return;
          modal.classList.add('is-open');
          modal.setAttribute('aria-hidden', 'false');
          modal.style.setProperty('display', 'flex', 'important');
          modal.style.setProperty('position', 'fixed', 'important');
          modal.style.setProperty('inset', '0', 'important');
          modal.style.setProperty('z-index', '999999', 'important');
          document.documentElement.style.overflow = 'hidden';
          document.body.style.overflow = 'hidden';
        }
        function closeModal(){
          if (!modal) return;
          modal.classList.remove('is-open');
          modal.setAttribute('aria-hidden', 'true');
          modal.style.display = '';
          document.documentElement.style.overflow = '';
          document.body.style.overflow = '';
          pointers = {};
          dragging = false;
        }
        function isImage(f){
          if (!f) return false;
          var type = String(f.type || '').toLowerCase();
          var name = String(f.name || '').toLowerCase();
          return type.indexOf('image/') === 0 || /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(name);
        }
        function loadSelectedFile(input){
          var f = input && input.files && input.files[0];
          if (!isImage(f)) return;
          state = { tx:0, ty:0, scale:1 };
          pointers = {};
          var opened = false;
          function useUrl(url){
            if (!url) return;
            selectedUrl = url;
            if (cropImg) cropImg.src = selectedUrl;
            applyTransforms();
            forceOpenModal();
            opened = true;
            setTimeout(forceOpenModal, 50);
            setTimeout(forceOpenModal, 250);
          }
          try {
            var reader = new FileReader();
            reader.onload = function(e){ useUrl(e && e.target ? e.target.result : ''); };
            reader.onerror = function(){
              try { useUrl(URL.createObjectURL(f)); } catch(_) {}
            };
            reader.readAsDataURL(f);
          } catch(e) {
            try { useUrl(URL.createObjectURL(f)); } catch(_) {}
          }
          setTimeout(function(){
            if (!opened) {
              try { useUrl(URL.createObjectURL(f)); } catch(_) {}
            }
          }, 400);
        }

        window.tapzyHandlePhotoFile = loadSelectedFile;

        if (file) {
          file.onchange = function(){ loadSelectedFile(file); };
          file.addEventListener('change', function(){ loadSelectedFile(file); });
          file.addEventListener('input', function(){ loadSelectedFile(file); });
        }

        function getDistance(){
          var ids = Object.keys(pointers);
          if (ids.length < 2) return 0;
          var a = pointers[ids[0]], b = pointers[ids[1]];
          var dx = a.x - b.x, dy = a.y - b.y;
          return Math.sqrt(dx*dx + dy*dy);
        }
        if (stage) {
          stage.addEventListener('mousedown', function(e){
            if (!selectedUrl) return;
            dragging = true; lastX = e.clientX; lastY = e.clientY; e.preventDefault();
          });
          window.addEventListener('mousemove', function(e){
            if (!dragging || !selectedUrl) return;
            state.tx += e.clientX - lastX;
            state.ty += e.clientY - lastY;
            lastX = e.clientX; lastY = e.clientY;
            applyTransforms();
          });
          window.addEventListener('mouseup', function(){ dragging = false; });
          stage.addEventListener('touchstart', function(e){
            if (!selectedUrl) return;
            e.preventDefault();
            for (var i=0;i<e.changedTouches.length;i++) pointers[e.changedTouches[i].identifier] = {x:e.changedTouches[i].clientX,y:e.changedTouches[i].clientY};
            if (e.touches.length === 1) { lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }
            if (e.touches.length >= 2) lastDistance = getDistance();
          }, {passive:false});
          stage.addEventListener('touchmove', function(e){
            if (!selectedUrl) return;
            e.preventDefault();
            for (var i=0;i<e.changedTouches.length;i++) pointers[e.changedTouches[i].identifier] = {x:e.changedTouches[i].clientX,y:e.changedTouches[i].clientY};
            if (e.touches.length >= 2) {
              var d = getDistance();
              if (lastDistance > 0 && d > 0) state.scale = clamp(state.scale * (d / lastDistance), 1, 2.4);
              lastDistance = d;
            } else if (e.touches.length === 1) {
              var t = e.touches[0];
              state.tx += t.clientX - lastX;
              state.ty += t.clientY - lastY;
              lastX = t.clientX; lastY = t.clientY;
            }
            applyTransforms();
          }, {passive:false});
          stage.addEventListener('touchend', function(e){
            for (var i=0;i<e.changedTouches.length;i++) delete pointers[e.changedTouches[i].identifier];
            lastDistance = getDistance();
          });
          stage.addEventListener('wheel', function(e){
            if (!selectedUrl) return;
            e.preventDefault();
            state.scale = clamp(state.scale + (e.deltaY < 0 ? .08 : -.08), 1, 2.4);
            applyTransforms();
          }, {passive:false});
        }
        function saveCroppedPhotoThenClose(){
          applyTransforms();
          try {
            if (!cropImg || !selectedUrl || !cropImg.naturalWidth || !stage) { closeModal(); return; }
            var ring = document.querySelector('.tz-photo-crop-ring');
            var ringRect = ring ? ring.getBoundingClientRect() : stage.getBoundingClientRect();
            var imgRect = cropImg.getBoundingClientRect();
            var out = 900;
            var canvas = document.createElement('canvas');
            canvas.width = out;
            canvas.height = out;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#05060a';
            ctx.fillRect(0, 0, out, out);
            var ratio = out / Math.max(1, ringRect.width);
            var dx = (imgRect.left - ringRect.left) * ratio;
            var dy = (imgRect.top - ringRect.top) * ratio;
            var dw = imgRect.width * ratio;
            var dh = imgRect.height * ratio;
            ctx.drawImage(cropImg, dx, dy, dw, dh);
            var dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            if (croppedPhotoData) croppedPhotoData.value = dataUrl;
            if (file && window.DataTransfer) {
              canvas.toBlob(function(blob){
                try {
                  if (blob) {
                    var dt = new DataTransfer();
                    var croppedFile = new File([blob], 'tapzy-profile-photo.jpg', { type:'image/jpeg' });
                    dt.items.add(croppedFile);
                    file.files = dt.files;
                  }
                } catch(_) {}
                closeModal();
              }, 'image/jpeg', 0.92);
              return;
            }
          } catch(e) {}
          closeModal();
        }
        if (doneBtn) doneBtn.onclick = saveCroppedPhotoThenClose;
        if (cancelBtn) cancelBtn.onclick = function(){ if (file) file.value = ''; if (croppedPhotoData) croppedPhotoData.value = ''; closeModal(); };
      })();
    </script>

    `;



    res.send(

      renderShell(`Edit • ${profile.username} • Tapzy Network™`, body, "", {

        currentProfile: req.currentProfile || null,

        pageTitle: "Edit Profile",

        pageType: "edit",

        metaDescription: `Edit ${profile.username}'s Tapzy Network™ profile, quick share settings, contact details, and social links.`,

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("Edit page error");

  }

});



router.post("/edit/:username", upload.single("photo"), async (req, res) => {

  try {

    const username = cleanUsername(req.params.username);

    const profile = await prisma.userProfile.findUnique({ where: { username } });



    if (!profile) return res.status(404).send("Profile not found");

    if (!requireOwnerAccess(profile, req, res)) return;



    const keyQuery = ownerKeyQuery(req, profile);

    const removePhoto = !!req.body.removePhoto;



    let photo = profile.photo;

    function saveCroppedPhotoData(dataUrl) {
      const value = String(dataUrl || "");
      const match = value.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
      if (!match) return null;
      const mimeExt = match[1].toLowerCase() === "png" ? "png" : match[1].toLowerCase() === "webp" ? "webp" : "jpg";
      const buffer = Buffer.from(match[2], "base64");
      if (!buffer.length || buffer.length > 8 * 1024 * 1024) return null;
      fs.mkdirSync(uploadsDir, { recursive: true });
      const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-cropped.${mimeExt}`;
      fs.writeFileSync(path.join(uploadsDir, filename), buffer);
      return publicAbsoluteUrl(req, `/uploads/${filename}`);
    }

    if (removePhoto) {

      photo = null;

    } else {

      const croppedPhotoUrl = saveCroppedPhotoData(req.body.croppedPhotoData);
      if (croppedPhotoUrl) {
        photo = croppedPhotoUrl;
      } else if (req.file) {
        photo = publicAbsoluteUrl(req, `/uploads/${req.file.filename}`);
      }

    }



    const bool = (name) => !!req.body[name];

    const clampPercent = (value, fallback = 50) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(0, Math.min(100, Math.round(n)));
    };



    const profilePhotoFitData = {
      profilePhotoPositionX: clampPercent(req.body.profilePhotoPositionX, 50),
      profilePhotoPositionY: clampPercent(req.body.profilePhotoPositionY, 50),
      profilePhotoScale: Math.max(100, Math.min(180, Math.round(Number(req.body.profilePhotoScale || 100) || 100))),
    };

    const profileUpdateData = {

        name: String(req.body.name || "").trim() || null,

        title: String(req.body.title || "").trim() || null,

        bio: String(req.body.bio || "").trim() || null,

        photo,

        phone: String(req.body.phone || "").trim() || null,

        email: String(req.body.email || "").trim() || null,

        website: String(req.body.website || "").trim() || null,

        instagram: String(req.body.instagram || "").trim() || null,

        linkedin: String(req.body.linkedin || "").trim() || null,

        tiktok: String(req.body.tiktok || "").trim() || null,

        twitter: String(req.body.twitter || "").trim() || null,

        facebook: String(req.body.facebook || "").trim() || null,

        youtube: String(req.body.youtube || "").trim() || null,

        github: String(req.body.github || "").trim() || null,

        snapchat: String(req.body.snapchat || "").trim() || null,

        whatsapp: String(req.body.whatsapp || "").trim() || null,

        telegram: String(req.body.telegram || "").trim() || null,



        quickShareEnabled: bool("quickShareEnabled"),

        shareNameEnabled: bool("shareNameEnabled"),

        sharePhoneEnabled: bool("sharePhoneEnabled"),

        shareEmailEnabled: bool("shareEmailEnabled"),

        shareWebsiteEnabled: bool("shareWebsiteEnabled"),

        shareInstagramEnabled: bool("shareInstagramEnabled"),

        shareLinkedinEnabled: bool("shareLinkedinEnabled"),

        shareTiktokEnabled: bool("shareTiktokEnabled"),

        shareTwitterEnabled: bool("shareTwitterEnabled"),

        shareFacebookEnabled: bool("shareFacebookEnabled"),

        shareYoutubeEnabled: bool("shareYoutubeEnabled"),

        shareGithubEnabled: bool("shareGithubEnabled"),

        shareSnapchatEnabled: bool("shareSnapchatEnabled"),

        shareWhatsappEnabled: bool("shareWhatsappEnabled"),

        shareTelegramEnabled: bool("shareTelegramEnabled"),

      };

    try {
      await prisma.userProfile.update({
        where: { id: profile.id },
        data: { ...profileUpdateData, ...profilePhotoFitData },
      });
    } catch (fitUpdateError) {
      const message = String(fitUpdateError && fitUpdateError.message || "");
      const canRetryWithoutFit = message.includes("profilePhotoPositionX") || message.includes("profilePhotoPositionY") || message.includes("profilePhotoScale") || message.includes("Unknown argument");
      if (!canRetryWithoutFit) throw fitUpdateError;
      console.warn("Profile photo fitting columns/client not ready yet; saving profile without fit data. Run prisma migrate/generate to enable saved fitting.", fitUpdateError);
      await prisma.userProfile.update({
        where: { id: profile.id },
        data: profileUpdateData,
      });
    }



    res.redirect(`/u/${profile.username}${keyQuery ? keyQuery : ""}`);

  } catch (e) {

    console.error(e);

    res.status(500).send("Update failed");

  }

});



router.get("/qr/:username", async (req, res) => {

  try {

    const username = cleanUsername(req.params.username);



    const profile = await prisma.userProfile.findUnique({

      where: { username },

    });



    if (!profile) return res.status(404).send("Profile not found");



    const currentProfile = req.currentProfile || null;

    const profileUrl = publicAbsoluteUrl(req, `/u/${profile.username}?tap=1`);

    const displayName = profile.name || profile.username || "Tapzy User";

    const isOwner = !!(currentProfile && currentProfile.id === profile.id);



    const body = `

    <div class="wrap tz-qr-wrap">

      <section class="tz-qr-shell">



        <section class="tz-qr-hero">

          <div class="tz-qr-hero-glow tz-qr-hero-glow-a"></div>

          <div class="tz-qr-hero-glow tz-qr-hero-glow-b"></div>



          <div class="tz-qr-hero-top">

            <div class="tz-qr-hero-copy">

              <div class="tz-qr-kicker">TAPZY SHARE</div>

              <h1 class="tz-qr-title">Tapzy QR</h1>

              <div class="tz-qr-subtitle">

                Instantly share <strong>@${escapeHtml(profile.username || "user")}</strong> with one clean scan.

              </div>

            </div>



            <div class="tz-qr-hero-actions">

              <a class="tz-qr-btn" href="/u/${escapeHtml(profile.username || "")}">Back to Profile</a>

              <a class="tz-qr-btn tz-qr-btn-dark" href="/vcard/${escapeHtml(profile.username || "")}">Save Contact</a>

            </div>

          </div>

        </section>



        <section class="tz-qr-card">

          <div class="tz-qr-frame">

            <div class="tz-qr-frame-inner">

              <img

                src="https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(profileUrl)}"

                alt="Tapzy QR"

                class="tz-qr-image"

              />

            </div>

          </div>



          <div class="tz-qr-meta">

            <div class="tz-qr-meta-name">${escapeHtml(displayName)}</div>

            <div class="tz-qr-meta-handle">@${escapeHtml(profile.username || "user")}</div>

            <div class="tz-qr-meta-caption">Scan to open ${escapeHtml(profileUrl)}</div>

          </div>



          <div class="tz-qr-actions">

            <a class="tz-qr-action" href="${escapeHtml(profileUrl)}">Open Profile</a>

            ${

              isOwner

                ? `<a class="tz-qr-action tz-qr-action-dark" href="/edit/${escapeHtml(profile.username || "")}">Edit Profile</a>`

                : `<a class="tz-qr-action tz-qr-action-dark" href="/vcard/${escapeHtml(profile.username || "")}">Download VCF</a>`

            }

          </div>

        </section>

      </section>

    </div>



    <style>

      .tz-qr-wrap{

        max-width:920px;

      }



      .tz-qr-shell{

        display:flex;

        flex-direction:column;

        gap:18px;

      }



      .tz-qr-hero{

        position:relative;

        overflow:hidden;

        border-radius:34px;

        padding:24px;

        border:1px solid rgba(140,198,255,.10);

        background:

          radial-gradient(900px 420px at 70% 10%, rgba(24,59,93,.34), transparent 45%),

          linear-gradient(180deg, rgba(10,13,20,.98), rgba(6,8,12,1));

        box-shadow:

          0 24px 70px rgba(0,0,0,.56),

          inset 0 1px 0 rgba(255,255,255,.03),

          inset 0 0 0 1px rgba(120,200,255,.02);

      }



      .tz-qr-hero-glow{

        position:absolute;

        border-radius:999px;

        pointer-events:none;

        filter:blur(28px);

      }



      .tz-qr-hero-glow-a{

        width:220px;

        height:220px;

        right:-28px;

        top:-40px;

        background:radial-gradient(circle, rgba(170,242,255,.09) 0%, rgba(170,242,255,.03) 40%, transparent 72%);

      }



      .tz-qr-hero-glow-b{

        width:180px;

        height:180px;

        left:70px;

        bottom:-50px;

        background:radial-gradient(circle, rgba(64,136,255,.08) 0%, rgba(64,136,255,.03) 42%, transparent 75%);

      }



      .tz-qr-hero-top{

        position:relative;

        z-index:2;

        display:flex;

        align-items:flex-start;

        justify-content:space-between;

        gap:18px;

        flex-wrap:wrap;

      }



      .tz-qr-kicker{

        color:#aeb9cf;

        font-size:12px;

        letter-spacing:6px;

        text-transform:uppercase;

        margin-bottom:12px;

      }



      .tz-qr-title{

        margin:0;

        font-size:50px;

        line-height:1;

        letter-spacing:-1.5px;

        font-weight:900;

        color:#fff;

      }



      .tz-qr-subtitle{

        margin-top:12px;

        max-width:680px;

        color:#a7b0c0;

        font-size:18px;

        line-height:1.65;

      }



      .tz-qr-hero-actions{

        display:flex;

        gap:10px;

        flex-wrap:wrap;

      }



      .tz-qr-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:46px;

        padding:0 18px;

        border-radius:16px;

        text-decoration:none;

        border:1px solid rgba(145,203,255,.12);

        background:

          radial-gradient(circle at 50% 0%, rgba(150,230,255,.18), transparent 55%),

          linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));

        color:#fff;

        font-size:14px;

        font-weight:800;

        box-shadow:

          0 0 16px rgba(80,150,255,.16),

          inset 0 1px 0 rgba(255,255,255,.14);

      }



      .tz-qr-btn-dark{

        background:linear-gradient(180deg, rgba(32,35,45,.94), rgba(14,16,23,.98));

        border:1px solid rgba(145,203,255,.12);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 8px 16px rgba(0,0,0,.16);

      }



      .tz-qr-card{

        position:relative;

        overflow:hidden;

        border-radius:34px;

        padding:26px;

        border:1px solid rgba(140,198,255,.10);

        background:

          radial-gradient(720px 360px at 50% 0%, rgba(95,182,255,.10), transparent 42%),

          linear-gradient(180deg, rgba(14,18,28,.96), rgba(8,10,16,.99));

        box-shadow:

          0 24px 70px rgba(0,0,0,.46),

          inset 0 1px 0 rgba(255,255,255,.03);

      }



      .tz-qr-frame{

        display:flex;

        justify-content:center;

      }



      .tz-qr-frame-inner{

        width:min(100%, 480px);

        padding:18px;

        border-radius:34px;

        background:linear-gradient(180deg, #ffffff, #eef6ff);

        box-shadow:

          0 18px 40px rgba(0,0,0,.22),

          inset 0 1px 0 rgba(255,255,255,.8);

      }



      .tz-qr-image{

        display:block;

        width:100%;

        max-width:100%;

        border-radius:24px;

        background:#fff;

      }



      .tz-qr-meta{

        text-align:center;

        margin-top:18px;

      }



      .tz-qr-meta-name{

        color:#fff;

        font-size:24px;

        font-weight:900;

        letter-spacing:-.4px;

      }



      .tz-qr-meta-handle{

        margin-top:6px;

        color:#b8c4d7;

        font-size:16px;

      }



      .tz-qr-meta-caption{

        margin-top:10px;

        color:#96a2b7;

        font-size:15px;

        word-break:break-word;

      }



      .tz-qr-actions{

        display:flex;

        gap:12px;

        justify-content:center;

        flex-wrap:wrap;

        margin-top:20px;

      }



      .tz-qr-action{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:46px;

        padding:0 18px;

        border-radius:16px;

        text-decoration:none;

        border:1px solid rgba(145,203,255,.12);

        background:

          radial-gradient(circle at 50% 0%, rgba(150,230,255,.18), transparent 55%),

          linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));

        color:#fff;

        font-size:14px;

        font-weight:800;

        box-shadow:

          0 0 16px rgba(80,150,255,.16),

          inset 0 1px 0 rgba(255,255,255,.14);

      }



      .tz-qr-action-dark{

        background:linear-gradient(180deg, rgba(32,35,45,.94), rgba(14,16,23,.98));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 8px 16px rgba(0,0,0,.16);

      }



      @media(max-width:700px){

        .tz-qr-hero,

        .tz-qr-card{

          padding:20px 16px;

          border-radius:28px;

        }



        .tz-qr-title{

          font-size:34px;

        }



        .tz-qr-subtitle{

          font-size:15px;

          line-height:1.6;

        }



        .tz-qr-kicker{

          font-size:11px;

          letter-spacing:5px;

        }



        .tz-qr-frame-inner{

          padding:14px;

          border-radius:24px;

        }



        .tz-qr-meta-name{

          font-size:21px;

        }



        .tz-qr-meta-handle,

        .tz-qr-meta-caption{

          font-size:14px;

        }



        .tz-qr-btn,

        .tz-qr-action{

          min-height:44px;

          padding:0 16px;

          border-radius:14px;

          font-size:13px;

        }

      }

    </style>

    `;



    res.send(

      renderShell(`QR • ${profile.username} • Tapzy Network™`, body, "", {

        currentProfile: currentProfile,

        pageTitle: "QR",

        pageType: "qr",

        metaDescription: `Scan and share ${displayName}'s Tapzy Network™ profile instantly with this QR code.`,

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("QR error");

  }

});



router.get("/vcard/:username", async (req, res) => {

  try {

    const username = cleanUsername(req.params.username);



    const profile = await prisma.userProfile.findUnique({

      where: { username },

    });



    if (!profile) return res.status(404).send("Profile not found");



    const vcf = makeVcf(profile);



    res.setHeader("Content-Type", "text/vcard; charset=utf-8");

    res.setHeader("Content-Disposition", `attachment; filename="${profile.username || "tapzy"}.vcf"`);

    return res.send(vcf);

  } catch (e) {

    console.error(e);

    return res.status(500).send("VCF error");

  }

});



router.post("/logout", async (req, res) => {

  return res.redirect(backUrl(req, "/"));

});



module.exports = router;