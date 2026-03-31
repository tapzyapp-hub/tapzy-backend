const router = require("express").Router();

const prisma = require("../prisma");
const { upload } = require("../upload");
const {
  cleanUsername,
  escapeHtml,
  safeUrl,
  stripAt,
  publicAbsoluteUrl,
  makeVcf,
  buildQuickSharePreview,
  renderShell,
  renderTapzyAssistant,
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

function formatStoryTimeShort(date) {
  const d = new Date(date);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const hours = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));
  if (hours < 24) return `${hours}h`;
  const days = Math.max(1, Math.floor(hours / 24));
  return `${days}d`;
}

function storyTrayCard(profile, story, isOwner) {
  const hasMedia = !!story?.mediaUrl;
  const isVideo = hasMedia && isVideoUrl(story.mediaUrl);

  const mediaHtml = hasMedia
    ? isVideo
      ? `<video class="profile-story-card-media" src="${escapeHtml(story.mediaUrl)}" muted playsinline preload="metadata"></video>`
      : `<img class="profile-story-card-media" src="${escapeHtml(story.mediaUrl)}" alt="Story preview" />`
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
    const displayName = profile.name || profile.username || "Tapzy User";
    const vcardUrl = `/vcard/${escapeHtml(profile.username || "")}`;
    const isOwner = !!(currentProfile && currentProfile.id === profile.id);

    const photoHtml = profile.photo
      ? `<img src="${escapeHtml(profile.photo)}" alt="${escapeHtml(displayName)}" />`
      : escapeHtml((displayName || "T").slice(0, 1).toUpperCase());

    const showMessageButton = currentProfile && currentProfile.id !== profile.id;
    const showFollowButton = !!(currentProfile && currentProfile.id !== profile.id);

    const body = `
    <div class="wrap profile-wrap">

      ${
        isTapOpen
          ? `
          <div id="tapzyTapOverlay" class="tapzy-tap-overlay">
            <div class="tapzy-tap-glow"></div>
            <div class="tapzy-tap-card">
              <div class="tapzy-tap-badge">Powered by Tapzy</div>
              <div class="tapzy-tap-pulse-ring"></div>
              <div class="tapzy-tap-pulse-dot"></div>
              <div class="tapzy-tap-title">Tap detected</div>
              <div class="tapzy-tap-subtitle">Opening ${escapeHtml(displayName)}</div>
            </div>
          </div>

          <div id="tapzyContactPrompt" class="tapzy-contact-prompt" style="display:none;">
            <div class="tapzy-contact-prompt-inner">
              <div class="tapzy-contact-title">Save ${escapeHtml(displayName)} to contacts?</div>
              <div class="tapzy-contact-subtitle">Powered by Tapzy</div>
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
            <div class="profile-showcase-avatar">${photoHtml}</div>
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
        background:
          radial-gradient(circle at 50% 30%, rgba(77,169,255,.12), transparent 35%),
          rgba(0,0,0,.92);
        backdrop-filter:blur(10px);
      }

      .tapzy-tap-glow{
        position:absolute;
        width:340px;
        height:340px;
        border-radius:999px;
        background:radial-gradient(circle, rgba(87,194,255,.28) 0%, rgba(87,194,255,.09) 35%, transparent 72%);
        filter:blur(14px);
        animation:tapzyGlowPulse 1.8s ease-in-out infinite;
      }

      .tapzy-tap-card{
        position:relative;
        z-index:2;
        width:min(92vw, 360px);
        padding:28px 22px;
        border-radius:28px;
        text-align:center;
        border:1px solid rgba(140,220,255,.16);
        background:
          radial-gradient(circle at 50% 0%, rgba(140,220,255,.14), transparent 48%),
          linear-gradient(180deg, rgba(6,10,18,.98), rgba(0,0,0,1));
        box-shadow:
          0 0 34px rgba(75,165,255,.12),
          0 18px 44px rgba(0,0,0,.36),
          inset 0 1px 0 rgba(255,255,255,.05);
      }

      .tapzy-tap-badge{
        color:#dff0ff;
        font-size:12px;
        font-weight:800;
        letter-spacing:2.8px;
        text-transform:uppercase;
        text-shadow:0 0 12px rgba(103,196,255,.35);
      }

      .tapzy-tap-pulse-ring{
        width:112px;
        height:112px;
        margin:18px auto 0;
        border-radius:999px;
        border:2px solid rgba(98,196,255,.40);
        box-shadow:
          0 0 18px rgba(72,160,255,.22),
          inset 0 0 18px rgba(72,160,255,.12);
        animation:tapzyRingPulse 1.3s ease-in-out infinite;
      }

      .tapzy-tap-pulse-dot{
        position:absolute;
        left:50%;
        top:106px;
        transform:translateX(-50%);
        width:16px;
        height:16px;
        border-radius:999px;
        background:#66d5ff;
        box-shadow:
          0 0 16px rgba(102,213,255,.95),
          0 0 34px rgba(78,159,255,.45);
        animation:tapzyDotPulse 1.3s ease-in-out infinite;
      }

      .tapzy-tap-title{
        margin-top:18px;
        color:#fff;
        font-size:28px;
        font-weight:900;
        letter-spacing:-.7px;
      }

      .tapzy-tap-subtitle{
        margin-top:8px;
        color:#dbe6f3;
        font-size:15px;
        line-height:1.6;
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
      }

      .profile-showcase-avatar{
        width:140px;
        height:140px;
        border-radius:30px;
        overflow:hidden;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:54px;
        font-weight:900;
        color:#ffffff;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(circle at 30% 24%, rgba(255,255,255,.03), transparent 28%),
          linear-gradient(180deg, rgba(5,8,14,.98), rgba(0,0,0,1));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.04),
          0 0 0 1px rgba(255,255,255,.02),
          0 12px 30px rgba(0,0,0,.28);
      }

      .profile-showcase-avatar img{
        width:100%;
        height:100%;
        object-fit:cover;
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

      .profile-quick-btn:hover{
        transform:translateY(-1px);
        border-color:rgba(255,255,255,.12);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.05),
          0 10px 22px rgba(0,0,0,.22);
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
            }, 1500);

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

    ${renderTapzyAssistant({
      username: profile.username || "User",
      pageType: "profile",
    })}
    `;

    res.send(
      renderShell(`@${profile.username} • Tapzy`, body, "", {
        currentProfile,
        pageTitle: profile.username || "Profile",
        pageType: "profile",
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

    const currentPhotoHtml = profile.photo
      ? `
        <div class="tz-edit-photo-card">
          <div class="tz-edit-photo-preview">
            <img src="${escapeHtml(profile.photo)}" alt="Current profile photo" />
          </div>
          <div class="tz-edit-photo-meta">
            <div class="tz-edit-photo-title">Current profile photo</div>
            <div class="tz-edit-photo-sub">Your current Tapzy profile image.</div>
          </div>
        </div>
      `
      : `
        <div class="tz-edit-photo-card">
          <div class="tz-edit-photo-preview tz-edit-photo-empty">No photo</div>
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
                <input class="tz-upload-input" type="file" name="photo" accept="image/png,image/jpeg,image/webp" />

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
      }

      .tz-edit-photo-preview img{
        width:100%;
        height:100%;
        object-fit:cover;
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

    ${renderTapzyAssistant({
      username: profile.username || "User",
      pageType: "edit",
    })}
    `;

    res.send(
      renderShell(`Edit • ${profile.username}`, body, "", {
        currentProfile: req.currentProfile || null,
        pageTitle: "Edit Profile",
        pageType: "edit",
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

    if (removePhoto) {
      photo = null;
    } else if (req.file) {
      photo = publicAbsoluteUrl(req, `/uploads/${req.file.filename}`);
    }

    const bool = (name) => !!req.body[name];

    await prisma.userProfile.update({
      where: { id: profile.id },
      data: {
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
      },
    });

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

    ${renderTapzyAssistant({
      username: profile.username || "User",
      pageType: "qr",
    })}
    `;

    res.send(
      renderShell(`QR • ${profile.username}`, body, "", {
        currentProfile: currentProfile,
        pageTitle: "QR",
        pageType: "qr",
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