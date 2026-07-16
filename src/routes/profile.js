const router = require("express").Router();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const prisma = require("../prisma");
const { renderEventCard } = require("../events/render/renderEventParts");

const {
  upload,
  uploadsDir,
  isCloudinaryConfigured,
  uploadBufferToCloudinary,
  uploadFileToCloudinary,
} = require("../upload");

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
    value.endsWith(".m4v") ||
    value.endsWith(".3gp") ||
    value.endsWith(".3gpp") ||
    value.endsWith(".avi") ||
    value.endsWith(".hevc") ||

    value.includes("/video/")

  );

}



function compatibleVideoUrl(url) {
  const value = String(url || "");
  if (!value || !/res\.cloudinary\.com\//i.test(value) || !/\/video\/upload\//i.test(value)) return value;
  if (/\/video\/upload\/[^/]*(?:f_mp4|vc_h264|ac_aac)/i.test(value)) return value;
  return value.replace(/\/video\/upload\//i, "/video/upload/f_mp4,vc_h264,ac_aac,q_auto/");
}

function renderVideoFrame(url, options = {}) {
  const src = escapeHtml(compatibleVideoUrl(url) || "");
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

function tapzyMarkImg(className = "tapzy-mark") {
  return `<img class="${escapeHtml(className)}" src="/images/tapzy-mark-white.png" alt="" aria-hidden="true" decoding="async" />`;
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

function storyStageMedia(profile, story) {
  if (!story) {
    return `
      <div class="profile-story-stage-empty">
        <div class="profile-story-stage-empty-mark">${tapzyMarkImg("tapzy-mark profile-story-stage-empty-logo")}</div>
        <div class="profile-story-stage-empty-title">No active stories</div>
        <div class="profile-story-stage-empty-sub">Create a 24-hour update to fill this space.</div>
      </div>
    `;
  }

  const label = escapeHtml(story.text || profile.name || profile.username || "Tapzy Story");
  if (!story.mediaUrl) {
    return `<div class="profile-story-stage-text">${label}</div>`;
  }

  if (isVideoUrl(story.mediaUrl)) {
    return renderVideoFrame(story.mediaUrl, {
      className: "profile-story-stage-media",
      controls: false,
      muted: true,
      preload: "auto",
      ariaLabel: "Play profile story preview",
    });
  }

  return `<img class="profile-story-stage-media" src="${escapeHtml(story.mediaUrl)}" alt="${label}" loading="eager" fetchpriority="high" decoding="async" />`;
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

    const quickShareOn = !!profile.quickShareEnabled;
    const quickPreview = quickShareOn ? buildQuickSharePreview(profile) : [];



    const followingStoryProfileIdsPromise = currentProfile
      ? prisma.follow.findMany({
          where: { followerProfileId: currentProfile.id },
          select: { followingProfileId: true, createdAt: true },
          orderBy: { createdAt: "asc" },
          take: 80,
        })
      : Promise.resolve([]);

    const [activeStories, followingStoryFollows, attendingEvent] = await Promise.all([

      prisma.story.findMany({

        where: {

          profileId: profile.id,

          expiresAt: { gt: now },

        },

        orderBy: { createdAt: "desc" },

        take: 60,

      }),

      followingStoryProfileIdsPromise,

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

    const followingStoryProfileIds = [...new Set((followingStoryFollows || [])
      .map((follow) => follow.followingProfileId)
      .filter((id) => id && id !== profile.id))];
    const followingStories = followingStoryProfileIds.length
      ? await prisma.story.findMany({
          where: {
            profileId: { in: followingStoryProfileIds },
            expiresAt: { gt: now },
          },
          include: { profile: true },
          orderBy: [{ profileId: "asc" }, { createdAt: "desc" }],
          take: Math.min(800, Math.max(80, followingStoryProfileIds.length * 10)),
        })
      : [];



    const attendingProfileEvent = attendingEvent?.event || null;
    const profileEventGoingSet = new Set();
    const profileEventGoingCounts = new Map();
    if (attendingProfileEvent?.id) {
      const [profileEventGoingCount, viewerEventAttendance] = await Promise.all([
        prisma.eventAttendance.count({
          where: { eventId: attendingProfileEvent.id, status: "going" },
        }),
        currentProfile
          ? prisma.eventAttendance.findFirst({
              where: { eventId: attendingProfileEvent.id, profileId: currentProfile.id, status: "going" },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);
      profileEventGoingCounts.set(attendingProfileEvent.id, profileEventGoingCount);
      if (viewerEventAttendance) profileEventGoingSet.add(attendingProfileEvent.id);
    }

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

    const storyMediaRank = (story) => (story?.mediaUrl && isVideoUrl(story.mediaUrl)) ? 0 : 1;
    const sortStoriesForProfileFeed = (a, b) => {
      const mediaRank = storyMediaRank(a) - storyMediaRank(b);
      if (mediaRank !== 0) return mediaRank;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    };
    const ownedStoryItems = [...activeStories]
      .sort(sortStoriesForProfileFeed)
      .map((story) => ({ story, owner: profile, isOwn: true }));
    const storiesByFollowedProfile = new Map();
    followingStories.forEach((story) => {
      if (!story || !story.profileId) return;
      if (!storiesByFollowedProfile.has(story.profileId)) storiesByFollowedProfile.set(story.profileId, []);
      storiesByFollowedProfile.get(story.profileId).push(story);
    });
    const followedStoryItems = followingStoryProfileIds.flatMap((profileId) => {
      return (storiesByFollowedProfile.get(profileId) || [])
        .sort(sortStoriesForProfileFeed)
        .map((story) => ({ story, owner: story.profile || null, isOwn: false }));
    });
    const allProfileStoryItems = [...ownedStoryItems, ...followedStoryItems];
    const featuredStoryItem = allProfileStoryItems[0] || null;
    const featuredStory = featuredStoryItem?.story || null;
    const featuredStoryOwner = featuredStoryItem?.owner || profile;
    const profileStoryFeedItems = allProfileStoryItems.map(({ story, owner, isOwn }) => {
      const ownerName = owner?.name || owner?.username || (isOwn ? displayName : "Tapzy User");
      return {
        mediaUrl: story.mediaUrl && isVideoUrl(story.mediaUrl) ? compatibleVideoUrl(story.mediaUrl) : (story.mediaUrl || ""),
        isVideo: !!(story.mediaUrl && isVideoUrl(story.mediaUrl)),
        text: story.text || ownerName || "Tapzy Story",
        time: formatStoryTimeShort(story.createdAt),
        ownerName,
        ownerUsername: owner?.username || "",
        ownerPhoto: owner?.photo || "",
        ownerInitial: (ownerName || "T").slice(0, 1).toUpperCase(),
        isOwn: !!isOwn,
      };
    });
    const hasProfileStoryVideo = profileStoryFeedItems.some((story) => story.isVideo);
    const profileStoryFeedJson = JSON.stringify(profileStoryFeedItems).replace(/</g, "\\u003c");
    const quickShareRailLinks = quickShareOn ? [
      profile.shareNameEnabled && (profile.name || displayName) ? `<button class="profile-story-rail-btn" type="button" data-copy-share="${escapeHtml(profile.name || displayName)}"><span>Name</span></button>` : "",
      profile.sharePhoneEnabled && profile.phone ? `<a class="profile-story-rail-btn" href="tel:${escapeHtml(profile.phone)}"><span>Phone</span></a>` : "",
      profile.shareEmailEnabled && profile.email ? `<a class="profile-story-rail-btn" href="mailto:${escapeHtml(profile.email)}"><span>Email</span></a>` : "",
      profile.shareWebsiteEnabled && profile.website ? `<a class="profile-story-rail-btn" href="${escapeHtml(safeUrl(profile.website))}" target="_blank" rel="noopener noreferrer"><span>Website</span></a>` : "",
      profile.shareInstagramEnabled && profile.instagram ? `<a class="profile-story-rail-btn" href="https://instagram.com/${escapeHtml(stripAt(profile.instagram))}" target="_blank" rel="noopener noreferrer"><span>Instagram</span></a>` : "",
      profile.shareTiktokEnabled && profile.tiktok ? `<a class="profile-story-rail-btn" href="https://www.tiktok.com/@${escapeHtml(stripAt(profile.tiktok))}" target="_blank" rel="noopener noreferrer"><span>TikTok</span></a>` : "",
      profile.shareLinkedinEnabled && profile.linkedin ? `<a class="profile-story-rail-btn" href="${escapeHtml(safeUrl(profile.linkedin))}" target="_blank" rel="noopener noreferrer"><span>LinkedIn</span></a>` : "",
      profile.shareTwitterEnabled && profile.twitter ? `<a class="profile-story-rail-btn" href="https://x.com/${escapeHtml(stripAt(profile.twitter))}" target="_blank" rel="noopener noreferrer"><span>X</span></a>` : "",
      profile.shareFacebookEnabled && profile.facebook ? `<a class="profile-story-rail-btn" href="https://facebook.com/${escapeHtml(stripAt(profile.facebook))}" target="_blank" rel="noopener noreferrer"><span>Facebook</span></a>` : "",
      profile.shareYoutubeEnabled && profile.youtube ? `<a class="profile-story-rail-btn" href="https://youtube.com/@${escapeHtml(stripAt(profile.youtube))}" target="_blank" rel="noopener noreferrer"><span>YouTube</span></a>` : "",
      profile.shareGithubEnabled && profile.github ? `<a class="profile-story-rail-btn" href="https://github.com/${escapeHtml(stripAt(profile.github))}" target="_blank" rel="noopener noreferrer"><span>GitHub</span></a>` : "",
      profile.shareSnapchatEnabled && profile.snapchat ? `<a class="profile-story-rail-btn" href="https://www.snapchat.com/add/${escapeHtml(stripAt(profile.snapchat))}" target="_blank" rel="noopener noreferrer"><span>Snapchat</span></a>` : "",
      profile.shareWhatsappEnabled && profile.whatsapp ? `<a class="profile-story-rail-btn" href="https://wa.me/${String(profile.whatsapp).replace(/[^\d]/g, "")}" target="_blank" rel="noopener noreferrer"><span>WhatsApp</span></a>` : "",
      profile.shareTelegramEnabled && profile.telegram ? `<a class="profile-story-rail-btn" href="https://t.me/${escapeHtml(stripAt(profile.telegram))}" target="_blank" rel="noopener noreferrer"><span>Telegram</span></a>` : "",
    ].filter(Boolean).join("") : "";
    const showProfileStoryTaskbar = !!quickShareRailLinks || hasProfileStoryVideo;



    const body = `

    <script data-tapzy-horizontal-lock data-tapzy-profile-zoom-lock>
      (function(){
        function stopProfileZoom(event){
          if (event && event.cancelable && event.preventDefault) event.preventDefault();
        }
        document.addEventListener("gesturestart", stopProfileZoom, { passive:false, capture:true });
        document.addEventListener("gesturechange", stopProfileZoom, { passive:false, capture:true });
        document.addEventListener("gestureend", stopProfileZoom, { passive:false, capture:true });
        document.addEventListener("touchmove", function(event){
          if (event.touches && event.touches.length > 1) stopProfileZoom(event);
        }, { passive:false, capture:true });
        document.addEventListener("wheel", function(event){
          if (event.ctrlKey) stopProfileZoom(event);
        }, { passive:false, capture:true });
        var edgeSwipe = null;
        function startEdgeSwipe(event){
          if (!event.touches || event.touches.length !== 1) { edgeSwipe = null; return; }
          var touch = event.touches[0];
          var width = window.innerWidth || document.documentElement.clientWidth || 0;
          var edge = touch.clientX <= 36 ? "left" : (width && touch.clientX >= width - 36 ? "right" : "");
          edgeSwipe = edge ? { edge: edge, x: touch.clientX, y: touch.clientY } : null;
          // Let normal vertical Android scrolling start cleanly; only block once a real horizontal edge swipe is detected.
        }
        function stopEdgeSwipe(event){
          if (!edgeSwipe || !event.touches || event.touches.length !== 1) return;
          var touch = event.touches[0];
          var dx = touch.clientX - edgeSwipe.x;
          var dy = touch.clientY - edgeSwipe.y;
          var isBrowserSwipe = (edgeSwipe.edge === "left" && dx > 8) || (edgeSwipe.edge === "right" && dx < -8);
          if (isBrowserSwipe && Math.abs(dx) > Math.abs(dy) * 1.15) {
            event.preventDefault();
            pinHorizontalScroll();
          }
        }
        document.addEventListener("touchstart", startEdgeSwipe, { passive:false });
        document.addEventListener("touchmove", stopEdgeSwipe, { passive:false, capture:true });
        document.addEventListener("touchend", function(){ edgeSwipe = null; }, { passive:true });
        document.addEventListener("touchcancel", function(){ edgeSwipe = null; }, { passive:true });
        function pinHorizontalScroll(){
          if (window.scrollX || document.documentElement.scrollLeft || document.body.scrollLeft) {
            document.documentElement.scrollLeft = 0;
            document.body.scrollLeft = 0;
            window.scrollTo(0, window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0);
          }
        }
        window.addEventListener("scroll", pinHorizontalScroll, { passive:true });
        window.addEventListener("resize", pinHorizontalScroll, { passive:true });
        window.addEventListener("orientationchange", function(){ window.setTimeout(pinHorizontalScroll, 60); }, { passive:true });
        document.addEventListener("touchmove", function(){ window.requestAnimationFrame(pinHorizontalScroll); }, { passive:true });
        pinHorizontalScroll();
      })();
    </script>

    <style id="tapzy-profile-horizontal-lock">
      html,
      body,
      .tz-has-stories-top-nav,
      .tz-has-stories-bottom-nav,
      .profile-wrap{
        background:#000!important;
        background-color:#000!important;
      }
      html{
        overscroll-behavior-x:none!important;
        overscroll-behavior-y:auto!important;
      }
      body{
        overscroll-behavior-x:none!important;
        overscroll-behavior-y:auto!important;
      }
      .profile-wrap::before{
        content:"";
        position:fixed;
        inset:-120px;
        z-index:-1;
        background:#000;
        pointer-events:none;
      }
      .profile-wrap{isolation:isolate;}
      /* tapzy-profile-black-backdrop */
      html,
      body{
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        overflow-x:hidden!important;
        overscroll-behavior-x:none!important;
      }
      body{
        position:relative!important;
        touch-action:pan-y!important;
        overflow-y:auto!important;
        -webkit-overflow-scrolling:touch!important;
      }
      .profile-wrap,
      .profile-showcase,
      .profile-story-stage,
      .profile-panel,
      .profile-event-card-panel{
        max-width:100%!important;
        min-width:0!important;
        box-sizing:border-box!important;
      }
      .profile-wrap{
        width:100%!important;
        overflow-x:hidden!important;
        overflow-y:visible!important;
        touch-action:pan-y!important;
      }
    </style>

    <style id="tapzy-profile-first-paint-guard">
      html:not(.tz-profile-ready) .profile-wrap,
      html:not(.tz-profile-ready) .profile-photo-viewer{
        visibility:hidden!important;
        opacity:0!important;
      }
      .profile-photo-viewer:not(.is-open),
      .profile-photo-viewer[aria-hidden="true"]{
        visibility:hidden!important;
        opacity:0!important;
        pointer-events:none!important;
      }
      html.tz-profile-ready .profile-wrap{
        visibility:visible;
        opacity:1;
      }
    </style>

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



      <section id="tapzyProfileShell" class="profile-showcase is-profile-booting ${isTapOpen ? "tapzy-profile-hidden" : "tapzy-profile-visible"}">

        <div class="profile-showcase-bg"></div>
        <div class="profile-weather-scene" aria-hidden="true"><span class="profile-weather-sun"></span><span class="profile-weather-cloud profile-weather-cloud-a"></span><span class="profile-weather-cloud profile-weather-cloud-b"></span><span class="profile-weather-wisp profile-weather-wisp-a"></span><span class="profile-weather-wisp profile-weather-wisp-b"></span><span class="profile-weather-lens profile-weather-lens-a"></span><span class="profile-weather-lens profile-weather-lens-b"></span><span class="profile-weather-rain"></span><span class="profile-weather-snow"></span></div>



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



              <a class="profile-pill-btn profile-pill-btn-dark profile-showcase-secondary" href="/qr/${escapeHtml(profile.username || "")}">QR</a>

              <a class="profile-pill-btn profile-pill-btn-dark profile-showcase-secondary" href="/vcard/${escapeHtml(profile.username || "")}">Save Contact</a>

            </div>

          </div>

        </div>

      </section>



      ${
        attendingProfileEvent
          ? `
            <section class="profile-panel profile-event-card-panel" style="margin-top:18px;">
              ${renderEventCard(attendingProfileEvent, currentProfile, profileEventGoingSet, profileEventGoingCounts)}
            </section>
          `
          : ""
      }



      ${

        profileStoryFeedItems.length || isOwner || quickPreview.length

          ? `

            <section class="profile-story-stage-panel" aria-label="Profile story feed">

              <div class="profile-story-stage" data-profile-story-stage>

                <script type="application/json" data-profile-story-items>${profileStoryFeedJson}</script>

                <div class="profile-story-stage-top">

                  <div class="profile-story-stage-identity">

                    <span class="profile-story-stage-dot"></span>

                    <span>Tapzy Network™</span>

                  </div>

                </div>

                <div class="profile-story-stage-media-link" data-profile-story-frame aria-label="Profile story feed">

                  ${storyStageMedia(featuredStoryOwner, featuredStory)}

                </div>

                <div class="profile-story-stage-caption">

                  <div>

                    <strong data-profile-story-owner>${escapeHtml(featuredStoryOwner?.name || featuredStoryOwner?.username || displayName)}</strong>

                    ${
                      featuredStory
                        ? `<span data-profile-story-meta>${escapeHtml(formatStoryTimeShort(featuredStory.createdAt))} · Tapzy Story</span>`
                        : ""
                    }

                  </div>

                </div>
                ${quickShareRailLinks ? `<div class="profile-story-copy-toast" data-profile-story-copy-toast>Copied name</div>` : ""}
                ${showProfileStoryTaskbar ? `
                  <div class="profile-story-taskbar" data-profile-story-taskbar>
                    ${
                      quickShareRailLinks
                        ? `<aside class="profile-story-rail" aria-label="Quick share">${quickShareRailLinks}</aside>`
                        : `<div class="profile-story-rail" aria-hidden="true"></div>`
                    }
                    <button class="profile-story-stage-sound" type="button" data-profile-story-sound ${hasProfileStoryVideo ? "" : "hidden"} aria-label="Turn story sound on">
                      <svg viewBox="0 0 24 24" aria-hidden="true" class="profile-sound-icon profile-sound-icon-on">
                        <path d="M4 9v6h4l5 4V5L8 9H4z"></path>
                        <path d="M16 8.5a5 5 0 0 1 0 7"></path>
                        <path d="M18.5 6a8.5 8.5 0 0 1 0 12"></path>
                      </svg>
                      <svg viewBox="0 0 24 24" aria-hidden="true" class="profile-sound-icon profile-sound-icon-off">
                        <path d="M4 9v6h4l5 4V5L8 9H4z"></path>
                        <path d="M17 9l4 4"></path>
                        <path d="M21 9l-4 4"></path>
                      </svg>
                    </button>
                  </div>
                ` : ""}

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

      .profile-showcase.is-profile-booting,
      .profile-showcase.is-profile-booting *,
      .profile-showcase.is-profile-weather-swapping,
      .profile-showcase.is-profile-weather-swapping *{
        transition:none!important;
      }

      .profile-showcase.is-profile-booting{
        opacity:1!important;
        transform:none!important;
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

      .profile-showcase.is-event-selected{
        border-color:rgba(127,220,255,.56);
        box-shadow:
          0 30px 80px rgba(0,0,0,.55),
          0 0 0 1px rgba(127,220,255,.42),
          0 0 42px rgba(78,178,255,.28),
          inset 0 1px 0 rgba(255,255,255,.05);
        transition:box-shadow .35s ease, border-color .35s ease;
      }

      .profile-showcase.is-event-selected .profile-showcase-bg{
        background-image:
          linear-gradient(180deg, rgba(6,8,14,.16), rgba(6,8,14,.28) 22%, rgba(3,5,10,.72) 60%, rgba(0,0,0,.96)),
          var(--profile-event-bg);
        background-size:cover;
        background-position:center;
        opacity:1;
        filter:saturate(1.18) contrast(1.05);
        transform:scale(1.015);
        transition:background-image .2s ease, transform 1.2s ease, filter .35s ease;
      }

      .profile-showcase.is-event-selected::after{
        background:
          radial-gradient(circle at var(--profile-event-mx,72%) var(--profile-event-my,22%), rgba(127,220,255,.24), rgba(64,155,255,.10) 18%, transparent 38%),
          linear-gradient(180deg, rgba(255,255,255,.018), transparent 34%);
        opacity:1;
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
        transition:opacity .32s ease, transform .32s ease;

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

      .profile-showcase-secondary{
        transition:opacity .32s ease, transform .32s ease;
      }

      .profile-showcase.is-secondary-dim .profile-showcase-name,
      .profile-showcase.is-secondary-dim .profile-showcase-handle,
      .profile-showcase.is-secondary-dim .profile-showcase-secondary{
        opacity:0;
        pointer-events:none;
        transform:translateY(5px);
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



      .profile-event-card-panel{
        padding:0 !important;
        overflow:visible;
        background:transparent !important;
        border:0 !important;
        box-shadow:none !important;
      }

      .profile-event-card-panel::before,
      .profile-event-card-panel::after{
        display:none !important;
      }

      .profile-event-card-panel .event-card{
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

      .profile-event-card-panel .event-card::after{
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

      .profile-event-card-panel .event-card::before{
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

      .profile-event-card-panel .event-card:hover,
      .profile-event-card-panel .event-card.is-touch-active{
        transform:translateY(-6px) scale(1.006);
        box-shadow:
          0 30px 80px rgba(0,0,0,.55),
          0 0 0 1px rgba(127,220,255,.42),
          0 0 42px rgba(78,178,255,.28);
        border-color:rgba(127,220,255,.56);
      }

      .profile-event-card-panel .event-card:hover::after,
      .profile-event-card-panel .event-card.is-touch-active::after,
      .profile-event-card-panel .event-card:hover::before,
      .profile-event-card-panel .event-card.is-touch-active::before{
        opacity:1;
      }

      .profile-event-card-panel .event-card.is-revealed{
        animation:eventReveal .5s ease both;
      }

      @keyframes eventReveal{
        from{ opacity:.01; transform:translateY(18px) scale(.985); }
        to{ opacity:1; transform:translateY(0) scale(1); }
      }

      .profile-event-card-panel .event-card-noise{
        position:absolute;
        inset:0;
        border-radius:inherit;
        opacity:.045;
        background-image:radial-gradient(rgba(255,255,255,.9) .6px, transparent .6px);
        background-size:8px 8px;
        z-index:1;
        pointer-events:none;
      }

      .profile-event-card-panel .event-card-glow{
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

      .profile-event-card-panel .event-card:hover .event-card-glow,
      .profile-event-card-panel .event-card.is-touch-active .event-card-glow{
        opacity:1;
        filter:blur(21px);
      }

      .profile-event-card-panel .event-card-edge{
        position:absolute;
        inset:0;
        border-radius:inherit;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.10),
          inset 0 0 0 1px rgba(127,210,255,.10);
        z-index:2;
        pointer-events:none;
      }

      .profile-event-card-panel .event-media{
        position:absolute;
        inset:0;
        border-radius:inherit;
        background-size:cover;
        background-position:center;
        transform:scale(1.015);
        transition:transform 1.2s ease;
      }

      .profile-event-card-panel .event-card:hover .event-media,
      .profile-event-card-panel .event-card.is-touch-active .event-media{
        transform:scale(1.045);
      }

      .profile-event-card-panel .event-content{
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

      .profile-event-card-panel .event-topline{
        display:flex;
        justify-content:space-between;
        gap:10px;
        align-items:center;
        margin-bottom:14px;
      }

      .profile-event-card-panel .event-pill-stack{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }

      .profile-event-card-panel .event-pill{
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

      .profile-event-card-panel .event-pill-soft{
        color:#d8e6f5;
        background:rgba(255,255,255,.08);
        border-color:rgba(255,255,255,.12);
        white-space:nowrap;
        flex-shrink:0;
        line-height:1;
        word-break:keep-all;
      }

      .profile-event-card-panel .event-pill-urgency{
        background:rgba(111,210,255,.12);
        border-color:rgba(111,210,255,.32);
      }

      .profile-event-card-panel .event-title{
        margin:0;
        font-size:clamp(30px, 4.2vw, 42px);
        line-height:1.01;
        letter-spacing:0;
        color:#fff;
        font-weight:950;
        text-wrap:balance;
        max-width:96%;
        font-family:inherit;
        font-feature-settings:"kern" 1, "liga" 1;
      }


      @media(min-width:701px){
        .profile-event-card-panel .event-title{
          font-size:clamp(24px, 3vw, 34px);
          line-height:1.08;
          font-weight:900;
        }
      }

      .profile-event-card-panel .event-title .event-title-word{
        display:inline;
      }

      .profile-event-card-panel .event-copy{
        margin-top:12px;
        line-height:1.7;
        font-size:14px;
        max-width:92%;
        color:rgba(235,244,255,.82);
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
        overflow:hidden;
      }

      .profile-event-card-panel .event-divider{
        width:100%;
        height:1px;
        margin-top:16px;
        background:linear-gradient(90deg, rgba(255,255,255,.16), rgba(255,255,255,.04), transparent);
      }

      .profile-event-card-panel .event-meta{
        display:grid;
        gap:10px;
        margin-top:16px;
      }

      .profile-event-card-panel .event-meta-row{
        display:flex;
        flex-direction:column;
        gap:3px;
      }

      .profile-event-card-panel .event-meta-label{
        font-size:10px;
        text-transform:uppercase;
        letter-spacing:1px;
        color:#9eb1c9;
        font-weight:900;
      }

      .profile-event-card-panel .event-meta-value{
        font-size:14px;
        color:#f3f8ff;
        font-weight:800;
      }

      .profile-event-card-panel .event-actions-primary{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:10px;
        margin-top:20px;
      }

      .profile-event-card-panel .event-actions-secondary{
        display:flex;
        align-items:center;
        justify-content:flex-start;
        gap:12px;
        margin-top:10px;
      }

      .profile-event-card-panel .btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:52px;
        padding:0 18px;
        border-radius:20px;
        text-decoration:none;
        border:1px solid rgba(255,255,255,.12);
        font-size:15px;
        font-weight:900;
        cursor:pointer;
        transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease;
      }

      .profile-event-card-panel .btnLuxury{
        background:linear-gradient(180deg, #fbfdff, #dceeff);
        color:#0a0f17;
        border:1px solid rgba(255,255,255,.7);
        box-shadow:
          0 14px 28px rgba(0,0,0,.22),
          inset 0 1px 0 rgba(255,255,255,.7);
      }

      .profile-event-card-panel .btnDark,
      .profile-event-card-panel .btnGhost{
        background:rgba(255,255,255,.07);
        color:#fff;
        border:1px solid rgba(255,255,255,.12);
        box-shadow:none;
        backdrop-filter:blur(8px);
      }

      .profile-event-card-panel .btnGhost:hover,
      .profile-event-card-panel .btnGhost:focus-visible,
      .profile-event-card-panel .btnGhost.is-going{
        border-color:rgba(127,220,255,.64);
        background:rgba(64,148,255,.16);
        box-shadow:
          0 0 0 1px rgba(127,220,255,.22),
          0 0 30px rgba(75,170,255,.34),
          inset 0 1px 0 rgba(255,255,255,.14);
        transform:translateY(-2px);
      }

      .profile-event-card-panel .js-save-btn.is-animating{
        animation:savePulse .28s ease;
        box-shadow:0 0 36px rgba(75,170,255,.48);
      }

      @keyframes savePulse{
        0%{ transform:scale(1); }
        50%{ transform:scale(1.08); }
        100%{ transform:scale(1); }
      }

      .profile-event-card-panel .event-going-count{
        color:rgba(230,240,255,.72);
        font-size:15px;
        font-weight:800;
      }

      @media(max-width:700px){
        .profile-event-card-panel .event-card{
          width:100%;
          min-height:min(78svh, 720px);
          border-radius:34px;
          clip-path:inset(0 round 34px);
          border-color:rgba(190,230,255,.18);
          box-shadow:
            0 24px 70px rgba(0,0,0,.52),
            0 0 0 1px rgba(127,210,255,.10),
            inset 0 1px 0 rgba(255,255,255,.08);
          backface-visibility:hidden;
          -webkit-backface-visibility:hidden;
        }

        .profile-event-card-panel .event-media{
          filter:saturate(1.18) contrast(1.05);
        }

        .profile-event-card-panel .event-content{
          min-height:min(78svh, 720px);
          padding:26px 20px 22px;
          justify-content:flex-end;
          background:linear-gradient(180deg, rgba(8,12,20,.10), rgba(5,8,14,.28) 48%, rgba(1,3,8,.70));
          backdrop-filter:blur(8px);
          -webkit-backdrop-filter:blur(8px);
        }

        .profile-event-card-panel .event-card.is-touch-active{
          transform:translateY(-6px) scale(1.015);
          box-shadow:
            0 30px 82px rgba(0,0,0,.64),
            0 0 0 1px rgba(135,220,255,.42),
            0 0 52px rgba(78,178,255,.46),
            0 0 96px rgba(64,128,255,.20);
        }

        .profile-event-card-panel .event-card.is-touch-active .event-media{
          transform:scale(1.085);
          filter:saturate(1.28) contrast(1.08) blur(.6px);
        }

        .profile-event-card-panel .event-title{
          font-size:clamp(30px, 8.35vw, 40px);
          line-height:1.03;
          letter-spacing:0;
          font-weight:950;
          text-wrap:balance;
          max-width:100%;
        }

        .profile-event-card-panel .event-copy{
          font-size:clamp(16px, 4.2vw, 20px);
          line-height:1.45;
          -webkit-line-clamp:2;
          max-width:100%;
        }

        .profile-event-card-panel .event-meta-label{ font-size:12px; }
        .profile-event-card-panel .event-meta-value{ font-size:16px; }
        .profile-event-card-panel .event-actions-primary{
          grid-template-columns:1fr;
          gap:12px;
        }
      }

      .profile-stories-tray{

        display:flex;

        gap:14px;

        overflow-x:auto;
        overflow-y:hidden;

        padding:16px 2px 8px;

        -webkit-overflow-scrolling:touch;
        scroll-snap-type:x proximity;
        scroll-padding-inline:2px;
        overscroll-behavior-x:contain;
        touch-action:pan-x pan-y;
        scrollbar-width:none;

      }

      .profile-stories-tray::-webkit-scrollbar{display:none;}



      .profile-story-card{

        min-width:132px;

        width:132px;

        text-decoration:none;

        flex:0 0 auto;
        touch-action:pan-x pan-y;
        scroll-snap-align:start;
        scroll-snap-stop:normal;
        user-select:none;
        cursor:pointer;

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

      .profile-story-stage-panel{
        margin-top:18px;
      }

      .profile-story-stage{
        position:relative;
        min-height:min(760px, calc(100svh - 116px));
        border-radius:34px;
        overflow:hidden;
        border:1px solid rgba(115,194,255,.18);
        background:
          radial-gradient(circle at 50% 0%, rgba(115,194,255,.12), transparent 42%),
          linear-gradient(180deg, rgba(7,10,18,.98), rgba(0,0,0,1));
        box-shadow:
          0 0 0 1px rgba(255,255,255,.03),
          0 0 44px rgba(87,170,255,.12),
          0 24px 70px rgba(0,0,0,.60),
          inset 0 1px 0 rgba(255,255,255,.05);
      }

      .profile-story-stage::after{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        background:
          linear-gradient(180deg, rgba(0,0,0,.50) 0%, transparent 22%, transparent 58%, rgba(0,0,0,.76) 100%);
        z-index:2;
        transition:opacity .32s ease;
      }

      .profile-story-stage.is-controls-dim::after{
        opacity:.08;
      }

      .profile-story-stage-top{
        position:absolute;
        left:24px;
        right:24px;
        top:42px;
        z-index:5;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        transition:opacity .32s ease, transform .32s ease;
      }

      .profile-story-stage-identity{
        min-width:0;
        display:flex;
        align-items:center;
        gap:9px;
        color:#fff;
        font-size:19px;
        font-weight:950;
        text-shadow:0 2px 14px rgba(0,0,0,.72);
      }

      .profile-story-stage-identity span:last-child{
        min-width:0;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .profile-story-stage-dot{
        width:13px;
        height:13px;
        flex:0 0 auto;
        border-radius:999px;
        background:#65d7ff;
        box-shadow:0 0 18px rgba(101,215,255,.72);
      }

      .profile-story-stage-sound{
        position:relative;
        flex:0 0 auto;
        width:43px;
        height:43px;
        padding:0;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        border-radius:999px;
        color:#fff;
        font-size:20px;
        font-weight:900;
        border:2px solid rgba(255,255,255,.65);
        background:rgba(0,0,0,.40);
        box-shadow:
          0 12px 30px rgba(0,0,0,.30),
          inset 0 1px 0 rgba(255,255,255,.08);
        backdrop-filter:blur(14px);
        -webkit-backdrop-filter:blur(14px);
        cursor:pointer;
        transition:opacity .32s ease, transform .32s ease, border-color .22s ease, box-shadow .22s ease;
        animation:profileSoundPulse 1.9s ease-in-out infinite;
      }

      .profile-story-stage-sound[hidden]{display:none;}

      .profile-story-stage-sound::before,
      .profile-story-stage-sound::after{
        content:"";
        position:absolute;
        inset:-8px;
        border-radius:999px;
        pointer-events:none;
        border:1px solid rgba(255,255,255,.38);
        box-shadow:0 0 18px rgba(255,255,255,.12), 0 0 24px rgba(87,170,255,.18);
        opacity:.72;
        animation:profileSoundRing 2.15s ease-in-out infinite;
      }

      .profile-story-stage-sound::after{
        inset:-14px;
        opacity:.42;
        animation-delay:.34s;
      }

      .profile-story-stage-sound svg,
      .profile-story-stage-sound span{
        position:relative;
        z-index:1;
      }

      .profile-story-stage-sound svg{
        width:100%;
        height:100%;
        padding:10px;
        fill:none;
        stroke:currentColor;
        stroke-width:2;
        stroke-linecap:round;
        stroke-linejoin:round;
        box-sizing:border-box;
      }

      .profile-sound-icon-off{display:none;}
      .profile-story-stage-sound.is-muted .profile-sound-icon-on{display:none;}
      .profile-story-stage-sound.is-muted .profile-sound-icon-off{display:block;}
      }

      @keyframes profileSoundPulse{
        0%,100%{
          box-shadow:
            0 0 0 1px rgba(255,255,255,.10),
            0 0 0 0 rgba(255,255,255,.16),
            0 12px 32px rgba(0,0,0,.30),
            inset 0 1px 0 rgba(255,255,255,.08);
        }
        50%{
          box-shadow:
            0 0 0 1px rgba(255,255,255,.12),
            0 0 0 9px rgba(255,255,255,.08),
            0 12px 32px rgba(0,0,0,.30),
            inset 0 1px 0 rgba(255,255,255,.08);
        }
      }

      @keyframes profileSoundRing{
        0%,100%{ transform:scale(.92); opacity:.38; }
        50%{ transform:scale(1.05); opacity:.82; }
      }

      .profile-story-stage-media-link{
        position:absolute;
        inset:0;
        display:block;
        color:#fff;
        text-decoration:none;
        z-index:1;
      }

      .profile-story-stage-media-link .tz-video-frame{
        width:100%;
        height:100%;
      }

      .profile-story-stage-media{
        width:100%;
        height:100%;
        display:block;
        object-fit:cover;
      }

      .profile-story-stage-text,
      .profile-story-stage-empty{
        width:100%;
        height:100%;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:12px;
        padding:32px 32px 122px;
        text-align:center;
        background:
          radial-gradient(circle at 50% 18%, rgba(95,182,255,.22), transparent 38%),
          linear-gradient(180deg, rgba(10,16,28,.98), rgba(0,0,0,1));
        font-size:28px;
        line-height:1.2;
        font-weight:950;
      }

      .profile-story-stage-empty-mark{
        position:relative;
        width:86px;
        height:86px;
        border-radius:24px;
        display:grid;
        place-items:center;
        background:linear-gradient(145deg, #2f76ff, #1145ad);
        color:#fff;
        box-shadow:0 18px 44px rgba(35,102,231,.34), inset 0 1px 0 rgba(255,255,255,.16);
        animation:profileStageLogoPulse 2.25s ease-in-out infinite;
        will-change:transform,box-shadow;
        z-index:1;
      }

      .profile-story-stage-empty-mark::before{
        content:"";
        position:absolute;
        inset:-12px;
        border-radius:32px;
        background:radial-gradient(circle, rgba(47,118,255,.36), rgba(47,118,255,0) 70%);
        animation:profileStageLogoHalo 2.25s ease-out infinite;
        z-index:-1;
      }

      .profile-story-stage-empty-mark::after{
        content:"";
        position:absolute;
        inset:0;
        border-radius:24px;
        background:linear-gradient(135deg, rgba(255,255,255,.22), rgba(255,255,255,0) 45%);
        pointer-events:none;
      }

      .profile-story-stage-empty-logo{
        width:66%;
        height:66%;
        object-fit:contain;
        filter:drop-shadow(0 3px 8px rgba(0,0,0,.22));
        animation:profileStageLogoInnerPulse 2.25s ease-in-out infinite;
      }

      @keyframes profileStageLogoPulse{
        0%,100%{transform:scale(1);box-shadow:0 18px 44px rgba(35,102,231,.34), inset 0 1px 0 rgba(255,255,255,.16);}
        50%{transform:scale(1.075);box-shadow:0 22px 62px rgba(35,102,231,.58), 0 0 32px rgba(79,145,255,.38), inset 0 1px 0 rgba(255,255,255,.22);}
      }

      @keyframes profileStageLogoHalo{
        0%{opacity:.48;transform:scale(.86);}
        60%{opacity:.16;transform:scale(1.32);}
        100%{opacity:0;transform:scale(1.45);}
      }

      @keyframes profileStageLogoInnerPulse{
        0%,100%{transform:scale(1);}
        50%{transform:scale(1.035);}
      }

      .profile-story-stage-empty-title{
        color:#fff;
        font-size:28px;
        font-weight:950;
      }

      .profile-story-stage-empty-sub{
        max-width:300px;
        color:#c8d5e6;
        font-size:15px;
        line-height:1.5;
        font-weight:750;
      }

      .profile-story-stage-caption{
        position:absolute;
        left:24px;
        right:118px;
        bottom:24px;
        z-index:5;
        color:#fff;
        text-shadow:0 2px 14px rgba(0,0,0,.72);
        transition:opacity .32s ease, transform .32s ease;
      }

      .profile-story-stage-caption strong{
        display:block;
        font-size:28px;
        line-height:1.05;
        font-weight:950;
      }

      .profile-story-stage-caption span{
        display:block;
        margin-top:8px;
        color:#d8e2f0;
        font-size:17px;
        font-weight:650;
      }

      .profile-story-taskbar{
        position:absolute;
        left:18px;
        right:18px;
        bottom:20px;
        z-index:6;
        display:flex;
        align-items:center;
        gap:8px;
        padding:10px;
        border-radius:28px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(4,7,12,.40);
        box-shadow:0 12px 34px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.04);
        backdrop-filter:blur(16px);
        -webkit-backdrop-filter:blur(16px);
        transition:opacity .32s ease, transform .32s ease;
      }

      .profile-story-rail{
        flex:1 1 auto;
        min-width:0;
        max-height:none;
        display:flex;
        flex-direction:row;
        gap:8px;
        overflow-x:auto;
        overflow-y:hidden;
        scrollbar-width:none;
        scroll-snap-type:x proximity;
      }

      .profile-story-rail::-webkit-scrollbar{display:none;}

      .profile-story-rail-btn{
        appearance:none;
        -webkit-appearance:none;
        width:calc((100% - 24px) / 4);
        min-width:calc((100% - 24px) / 4);
        min-height:58px;
        border-radius:18px;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:7px;
        color:#fff;
        text-decoration:none;
        text-align:center;
        font-size:10px;
        line-height:1.12;
        font-family:inherit;
        font-weight:950;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.06);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.05);
        scroll-snap-align:start;
        cursor:pointer;
      }

      .profile-story-stage.is-controls-dim .profile-story-stage-top,
      .profile-story-stage.is-controls-dim .profile-story-stage-caption,
      .profile-story-stage.is-controls-dim .profile-story-taskbar{
        opacity:.05;
        pointer-events:none;
        transform:translateY(6px);
      }

      .profile-story-stage.is-controls-dim .profile-story-stage-top{
        transform:translateY(-6px);
      }

      .profile-story-rail-btn:hover,
      .profile-story-rail-btn:focus-visible,
      .profile-story-rail-btn.is-copied{
        border-color:rgba(115,194,255,.82);
        background:rgba(115,194,255,.14);
        box-shadow:0 0 18px rgba(87,170,255,.24), inset 0 1px 0 rgba(255,255,255,.08);
      }



      /* profile-story-compact-taskbar: match the story feed glass control feel */
      .profile-story-stage-caption{
        bottom:92px;
      }

      .profile-story-taskbar{
        left:18px;
        right:18px;
        bottom:18px;
        gap:9px;
        padding:8px;
        min-height:64px;
        border-radius:32px;
        border:1px solid rgba(255,255,255,.13);
        background:linear-gradient(180deg,rgba(18,20,26,.42),rgba(5,7,12,.56));
        box-shadow:0 18px 44px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.08);
        backdrop-filter:blur(18px) saturate(1.15);
        -webkit-backdrop-filter:blur(18px) saturate(1.15);
      }

      .profile-story-rail{
        gap:8px;
        align-items:center;
      }

      .profile-story-rail-btn{
        width:auto;
        min-width:88px;
        flex:0 0 auto;
        min-height:48px;
        padding:0 16px;
        border-radius:18px;
        font-size:13px;
        line-height:1;
        letter-spacing:0;
        border:1px solid rgba(255,255,255,.10);
        background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.035));
        box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 8px 20px rgba(0,0,0,.18);
      }

      .profile-story-stage-sound{
        width:52px;
        height:52px;
        min-width:52px;
        min-height:52px;
        border-radius:999px;
        border:2px solid rgba(255,255,255,.82);
        background:rgba(5,7,12,.58);
        box-shadow:0 0 0 7px rgba(255,255,255,.045),0 0 26px rgba(118,194,255,.22),inset 0 1px 0 rgba(255,255,255,.12);
        animation:none;
      }

      .profile-story-stage-sound::before{
        inset:-7px;
        border-color:rgba(255,255,255,.16);
        box-shadow:0 0 22px rgba(92,166,255,.16);
        opacity:.62;
      }

      .profile-story-stage-sound::after{
        display:none;
      }

      .profile-story-stage-sound svg{
        padding:12px;
      }

      @media(max-width:430px){
        .profile-story-stage-caption{
          left:20px;
          right:20px;
          bottom:88px;
        }

        .profile-story-taskbar{
          left:18px;
          right:18px;
          bottom:max(14px, env(safe-area-inset-bottom));
          min-height:62px;
          padding:7px;
          gap:7px;
          border-radius:30px;
        }

        .profile-story-rail{
          gap:7px;
        }

        .profile-story-rail-btn{
          min-width:82px;
          min-height:46px;
          padding:0 13px;
          border-radius:17px;
          font-size:12px;
        }

        .profile-story-stage-sound{
          width:50px;
          height:50px;
          min-width:50px;
          min-height:50px;
        }
      }

      .profile-story-copy-toast{
        position:absolute;
        left:50%;
        bottom:98px;
        z-index:8;
        transform:translateX(-50%) translateY(8px);
        opacity:0;
        pointer-events:none;
        padding:9px 14px;
        border-radius:999px;
        border:1px solid rgba(115,194,255,.24);
        background:rgba(5,9,16,.82);
        color:#fff;
        font-size:12px;
        font-weight:900;
        box-shadow:0 14px 34px rgba(0,0,0,.34), 0 0 22px rgba(87,170,255,.16);
        backdrop-filter:blur(14px);
        -webkit-backdrop-filter:blur(14px);
        transition:opacity .22s ease, transform .22s ease;
      }

      .profile-story-copy-toast.is-visible{
        opacity:1;
        transform:translateX(-50%) translateY(0);
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

      .profile-photo-viewer.is-open[data-user-open="1"]{
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

      /* Match the public profile surface to the Discovery page UI. */
      .profile-wrap{
        max-width:1120px;
      }

      .profile-showcase,
      .profile-panel{
        border-radius:34px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(500px 300px at 72% 22%, rgba(36,80,125,.24), transparent 58%),
          linear-gradient(180deg, rgba(3,5,12,.98), rgba(0,0,0,1));
        box-shadow:
          0 18px 40px rgba(0,0,0,.28),
          inset 0 1px 0 rgba(255,255,255,.04),
          0 0 0 1px rgba(115,194,255,.03);
        backdrop-filter:blur(8px);
      }

      .profile-showcase{
        padding:28px;
      }

      .profile-panel{
        padding:24px;
      }

      .profile-showcase::before,
      .profile-panel::before{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        opacity:.04;
        background-image:radial-gradient(rgba(255,255,255,.92) .6px, transparent .6px);
        background-size:10px 10px;
        z-index:0;
      }

      .profile-showcase::after,
      .profile-panel::after{
        content:"";
        position:absolute;
        inset:1px;
        border-radius:33px;
        pointer-events:none;
        background:
          linear-gradient(180deg, rgba(255,255,255,.018), transparent 34%),
          radial-gradient(420px 180px at 72% 14%, rgba(115,194,255,.035), transparent 62%);
        z-index:0;
      }

      .profile-showcase > *,
      .profile-panel > *{
        position:relative;
        z-index:1;
      }

      .profile-showcase-bg{
        inset:0;
        border-radius:34px;
        background:
          radial-gradient(500px 300px at 72% 22%, rgba(36,80,125,.42), transparent 58%),
          radial-gradient(380px 220px at 18% 10%, rgba(20,42,88,.16), transparent 52%);
        opacity:1;
      }

      .profile-showcase-avatar-wrap{
        width:132px;
        height:132px;
      }

      .profile-showcase-avatar{
        width:132px;
        height:132px;
        border-radius:22px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(circle at 50% 0%, rgba(130,200,255,.14), transparent 55%),
          linear-gradient(180deg,#162033,#0d1118);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.05),
          0 0 18px rgba(127,210,255,.11),
          0 12px 28px rgba(0,0,0,.24);
      }

      .profile-showcase-avatar-wrap::before,
      .profile-showcase-avatar-wrap::after{
        border-radius:26px;
        opacity:.45;
        filter:blur(14px);
      }

      .profile-showcase-name{
        font-size:clamp(36px, 7vw, 52px);
        letter-spacing:-1.25px;
      }

      .profile-showcase-handle{
        color:#d9e4f2;
      }

      .profile-panel-heading{
        font-size:28px;
        line-height:1.02;
        letter-spacing:-.9px;
      }

      .profile-panel-subheading,
      .profile-section-text{
        color:#bcc8d8;
        line-height:1.55;
      }

      .profile-section-title{
        letter-spacing:-.55px;
      }

      .profile-pill-btn,
      .profile-mini-action,
      .profile-quick-btn,
      .profile-showcase-actions .btn,
      .profile-showcase-actions form .btn{
        min-height:48px;
        border-radius:20px;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(10,12,18,.98), rgba(0,0,0,1));
        color:#fff;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.04),
          0 8px 16px rgba(0,0,0,.16);
        transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease;
      }

      .profile-pill-btn:hover,
      .profile-pill-btn:focus-visible,
      .profile-mini-action:hover,
      .profile-mini-action:focus-visible,
      .profile-quick-btn:hover,
      .profile-quick-btn:focus-visible,
      .profile-showcase-actions .btn:hover,
      .profile-showcase-actions .btn:focus-visible{
        transform:translateY(-1px);
        border-color:rgba(115,194,255,.92) !important;
        background:
          radial-gradient(circle at 50% 0%, rgba(115,194,255,.18), transparent 56%),
          linear-gradient(180deg, rgba(10,12,18,.98), rgba(0,0,0,1));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.08),
          0 0 18px rgba(87,170,255,.30),
          0 0 46px rgba(48,110,255,.22),
          0 10px 24px rgba(0,0,0,.24) !important;
      }

      .profile-pill-btn:active,
      .profile-mini-action:active,
      .profile-quick-btn:active,
      .profile-showcase-actions .btn:active{
        transform:scale(.985);
      }

      .profile-showcase-avatar-wrap::before,
      .profile-showcase-avatar-wrap:hover::before,
      .profile-showcase-avatar-wrap:focus-within::before{
        inset:-10px;
        border-radius:34px;
        background:
          radial-gradient(circle at 50% 18%, rgba(115,194,255,.48), transparent 58%),
          linear-gradient(180deg, rgba(115,194,255,.42), rgba(55,108,210,.18)) !important;
        opacity:.86 !important;
        filter:blur(11px) !important;
        transform:none !important;
        transition:none !important;
      }

      .profile-showcase-avatar-wrap::after,
      .profile-showcase-avatar-wrap:hover::after,
      .profile-showcase-avatar-wrap:focus-within::after{
        inset:-18px;
        border-radius:40px;
        background:radial-gradient(circle at 50% 50%, rgba(85,179,255,.42), transparent 62%) !important;
        opacity:.78 !important;
        filter:blur(18px) !important;
        transform:none !important;
        transition:none !important;
      }

      .profile-showcase-avatar,
      .profile-showcase-avatar:hover,
      .profile-showcase-avatar:focus-visible{
        border-color:rgba(115,194,255,.92) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.05),
          0 0 0 1px rgba(255,255,255,.02),
          0 0 22px rgba(87,170,255,.22),
          0 0 42px rgba(48,110,255,.16),
          0 12px 28px rgba(0,0,0,.24) !important;
        transform:none !important;
        transition:none !important;
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

        .profile-story-stage{
          min-height:min(680px, calc(100dvh - 152px));
          border-radius:30px;
        }

        .profile-story-stage-top{
          left:16px;
          right:16px;
          top:34px;
        }

        .profile-story-stage-identity{
          font-size:16px;
        }

        .profile-story-stage-sound{
          width:43px;
          height:43px;
          min-height:43px;
          padding:0;
          border-radius:999px;
          font-size:20px;
        }

        .profile-story-stage-caption{
          left:18px;
          right:18px;
          bottom:96px;
        }

        .profile-story-stage-caption strong{
          font-size:24px;
        }

        .profile-story-stage-caption span{
          font-size:15px;
        }

        .profile-story-taskbar{
          left:16px;
          right:16px;
          bottom:max(16px, env(safe-area-inset-bottom));
          border-radius:24px;
          gap:7px;
          padding:8px;
        }

        .profile-story-stage-empty,
        .profile-story-stage-text{
          padding-bottom:118px;
        }

        .profile-story-rail{
          flex:1 1 auto;
          min-width:0;
          max-height:none;
          flex-direction:row;
          overflow-x:auto;
          overflow-y:hidden;
          gap:7px;
        }

        .profile-story-rail-btn{
          width:calc((100% - 21px) / 4);
          min-width:calc((100% - 21px) / 4);
          min-height:48px;
          padding:8px 6px;
          border-radius:16px;
          flex:0 0 auto;
          font-size:10px;
        }

      }

    



      /* profile-story-compact-taskbar-final: wins after mobile layout rules */
      .profile-story-stage-caption{
        bottom:82px !important;
      }
      .profile-story-taskbar{
        left:20px !important;
        right:20px !important;
        bottom:16px !important;
        gap:7px !important;
        padding:6px !important;
        min-height:54px !important;
        border-radius:999px !important;
        border:1px solid rgba(122,186,255,.18) !important;
        background:linear-gradient(180deg,rgba(18,26,36,.34),rgba(3,5,10,.52)) !important;
        box-shadow:0 12px 34px rgba(0,0,0,.30),0 0 18px rgba(81,164,255,.08),inset 0 1px 0 rgba(255,255,255,.08) !important;
        backdrop-filter:blur(20px) saturate(1.18) !important;
        -webkit-backdrop-filter:blur(20px) saturate(1.18) !important;
      }
      .profile-story-rail{
        gap:7px !important;
        align-items:center !important;
      }
      .profile-story-rail-btn{
        width:auto !important;
        min-width:78px !important;
        flex:0 0 auto !important;
        min-height:42px !important;
        padding:0 12px !important;
        border-radius:16px !important;
        font-size:12px !important;
        line-height:1 !important;
        letter-spacing:0 !important;
      }
      .profile-story-stage-sound{
        width:46px !important;
        height:46px !important;
        min-width:46px !important;
        min-height:46px !important;
        border-radius:999px !important;
        border:2px solid rgba(255,255,255,.82) !important;
        background:rgba(5,7,12,.58) !important;
        box-shadow:0 0 0 5px rgba(255,255,255,.04),0 0 22px rgba(118,194,255,.20),inset 0 1px 0 rgba(255,255,255,.12) !important;
        animation:none !important;
      }
      .profile-story-stage-sound::before{
        inset:-6px !important;
        border-color:rgba(255,255,255,.16) !important;
        box-shadow:0 0 18px rgba(92,166,255,.15) !important;
        opacity:.62 !important;
      }
      .profile-story-stage-sound::after{display:none !important;}
      .profile-story-stage-sound svg{padding:10px !important;}
      @media(max-width:430px){
        .profile-story-stage-caption{left:20px !important;right:20px !important;bottom:78px !important;}
        .profile-story-taskbar{left:18px !important;right:18px !important;bottom:max(12px, env(safe-area-inset-bottom)) !important;min-height:54px !important;padding:6px !important;gap:6px !important;border-radius:999px !important;}
        .profile-story-rail{gap:6px !important;}
        .profile-story-rail-btn{min-width:74px !important;min-height:40px !important;padding:0 10px !important;border-radius:15px !important;font-size:11.5px !important;}
        .profile-story-stage-sound{width:44px !important;height:44px !important;min-width:44px !important;min-height:44px !important;}
      }

      /* TAPZY MOBILE LAYOUT MATCH FIX: force Edit Profile to use the same full-width mobile layout as the rest of the app. */
      @media(max-width:700px){
        html,
        body{
          width:100% !important;
          max-width:100% !important;
          overflow-x:hidden !important;
        }

        .wrap.tz-edit-wrap{
          width:100vw !important;
          max-width:100vw !important;
          min-width:0 !important;
          margin-left:calc(50% - 50vw) !important;
          margin-right:0 !important;
          padding:18px 22px 120px !important;
          overflow-x:hidden !important;
          box-sizing:border-box !important;
        }

        .tz-edit-shell,
        .tz-edit-form{
          width:100% !important;
          max-width:100% !important;
          min-width:0 !important;
          margin:0 !important;
          padding:0 !important;
          overflow:visible !important;
          box-sizing:border-box !important;
        }

        .tz-edit-hero,
        .tz-edit-section,
        .tz-edit-upload-box,
        .tz-edit-photo-card{
          width:100% !important;
          max-width:100% !important;
          min-width:0 !important;
          margin-left:0 !important;
          margin-right:0 !important;
          box-sizing:border-box !important;
        }

        .tz-edit-section{
          overflow:hidden !important;
        }

        .tz-field input,
        .tz-field textarea,
        .tz-edit-savebtn{
          max-width:100% !important;
          box-sizing:border-box !important;
        }
      }


      .profile-showcase,
      .profile-showcase-top,
      .profile-showcase-avatar-wrap,
      .profile-showcase-avatar,
      .profile-showcase-main,
      .profile-story-stage{
        transition:
          min-height .42s ease,
          padding .42s ease,
          width .42s ease,
          height .42s ease,
          gap .42s ease,
          opacity .32s ease,
          transform .32s ease;
      }

      .profile-showcase.is-secondary-dim{
        padding:14px;
      }

      .profile-showcase.is-secondary-dim .profile-showcase-top{
        grid-template-columns:66px minmax(0, 1fr);
        gap:12px;
        align-items:center;
      }

      .profile-showcase.is-secondary-dim .profile-showcase-avatar-wrap,
      .profile-showcase.is-secondary-dim .profile-showcase-avatar{
        width:66px;
        height:66px;
        border-radius:18px;
      }

      .profile-showcase.is-secondary-dim .profile-showcase-avatar-wrap::before{
        inset:-6px;
        border-radius:22px;
      }

      .profile-showcase.is-secondary-dim .profile-showcase-avatar-wrap::after{
        inset:-10px;
        border-radius:26px;
      }

      .profile-showcase.is-secondary-dim .profile-showcase-main{
        max-height:0;
        min-height:0;
        overflow:hidden;
        opacity:0;
        pointer-events:none;
      }

      .profile-wrap.is-profile-condensed .profile-story-stage{
        min-height:min(900px, calc(100svh - 72px));
      }

      .profile-wrap > .profile-panel{
        max-height:1200px;
        overflow:hidden;
        transition:
          opacity .28s ease,
          max-height .42s ease,
          margin .42s ease,
          padding .42s ease,
          border-width .42s ease;
      }

      .profile-wrap.is-profile-condensed > .profile-panel{
        opacity:0;
        max-height:0;
        margin-top:0 !important;
        margin-bottom:0 !important;
        padding-top:0;
        padding-bottom:0;
        border-width:0;
        pointer-events:none;
      }

      .profile-wrap.is-profile-condensed .profile-story-stage-panel{
        margin-top:12px;
      }


      @media(max-width:700px){
        .profile-showcase.is-secondary-dim{
          padding:10px;
          border-radius:24px;
        }

        .profile-showcase.is-secondary-dim .profile-showcase-bg{
          border-radius:24px;
        }

        .profile-showcase.is-secondary-dim .profile-showcase-top{
          display:grid;
          grid-template-columns:44px minmax(0, 1fr);
          gap:8px;
          align-items:center;
        }

        .profile-showcase.is-secondary-dim .profile-showcase-avatar-wrap,
        .profile-showcase.is-secondary-dim .profile-showcase-avatar{
          width:44px;
          height:44px;
          border-radius:14px;
        }

        .profile-wrap.is-profile-condensed .profile-story-stage{
          min-height:min(760px, calc(100dvh - 86px));
        }
      }


      .profile-showcase.is-event-selected{
        border-color:rgba(127,220,255,.56) !important;
        background:#0c0f16 !important;
        box-shadow:
          0 30px 80px rgba(0,0,0,.55),
          0 0 0 1px rgba(127,220,255,.42),
          0 0 42px rgba(78,178,255,.28),
          inset 0 1px 0 rgba(255,255,255,.05) !important;
      }

      .profile-showcase.is-event-selected .profile-showcase-bg{
        background-image:
          linear-gradient(180deg, rgba(6,8,14,.06), rgba(6,8,14,.18) 22%, rgba(3,5,10,.62) 60%, rgba(0,0,0,.94)),
          var(--profile-event-bg) !important;
        background-size:cover !important;
        background-position:center !important;
        opacity:1 !important;
        filter:saturate(1.18) contrast(1.05) !important;
        transform:scale(1.015) !important;
      }

      .profile-showcase.is-event-selected::before{
        opacity:.045 !important;
      }

      .profile-showcase.is-event-selected::after{
        background:
          radial-gradient(circle at var(--profile-event-mx,72%) var(--profile-event-my,22%), rgba(127,220,255,.36), rgba(64,155,255,.16) 18%, transparent 38%),
          linear-gradient(180deg, rgba(255,255,255,.018), transparent 34%) !important;
        opacity:1 !important;
      }


      .profile-weather-scene{
        position:absolute;
        inset:0;
        z-index:0;
        pointer-events:none;
        overflow:hidden;
        border-radius:34px;
        opacity:0;
        transition:opacity .7s ease;
      }

      .profile-showcase.is-weather-live .profile-weather-scene{
        opacity:1;
      }

      .profile-showcase.is-weather-live .profile-showcase-bg{
        opacity:1;
        background:
          radial-gradient(circle at 22% 10%, rgba(255,255,255,.30), transparent 18%),
          linear-gradient(180deg, #4ba8ef 0%, #1f78c8 48%, #06111e 100%);
      }

      .profile-showcase.weather-sunny .profile-showcase-bg,
      .profile-showcase.weather-clear .profile-showcase-bg{
        background:
          radial-gradient(circle at 22% 10%, rgba(255,255,255,.78), rgba(255,255,255,.36) 9%, transparent 21%),
          radial-gradient(circle at 44% 78%, rgba(150,224,255,.22), transparent 18%),
          linear-gradient(180deg, #5db7ff 0%, #2588d9 50%, #07111d 100%);
      }

      .profile-showcase.weather-cloudy .profile-showcase-bg,
      .profile-showcase.weather-fog .profile-showcase-bg{
        background:
          radial-gradient(circle at 28% 18%, rgba(255,255,255,.34), transparent 24%),
          radial-gradient(circle at 78% 8%, rgba(165,210,255,.24), transparent 22%),
          linear-gradient(180deg, #6f93b3 0%, #345873 48%, #07111b 100%);
      }

      .profile-showcase.weather-rain .profile-showcase-bg,
      .profile-showcase.weather-storm .profile-showcase-bg{
        background:
          radial-gradient(circle at 70% 8%, rgba(151,206,255,.25), transparent 20%),
          linear-gradient(180deg, #314a62 0%, #162837 54%, #02070d 100%);
      }

      .profile-showcase.weather-snow .profile-showcase-bg{
        background:
          radial-gradient(circle at 26% 12%, rgba(255,255,255,.58), transparent 22%),
          linear-gradient(180deg, #9fc6e8 0%, #5c83a7 50%, #07111c 100%);
      }

      .profile-showcase.weather-night .profile-showcase-bg{
        background:
          radial-gradient(circle at 76% 16%, rgba(220,235,255,.50), transparent 10%),
          radial-gradient(circle at 22% 72%, rgba(65,125,255,.18), transparent 30%),
          linear-gradient(180deg, #101a35 0%, #081122 52%, #000 100%);
      }

      .profile-weather-sun{
        position:absolute;
        left:12%;
        top:-18%;
        width:210px;
        height:210px;
        border-radius:999px;
        background:radial-gradient(circle, rgba(255,255,255,.96) 0%, rgba(255,244,190,.68) 20%, rgba(255,224,96,.18) 44%, transparent 70%);
        filter:blur(1px);
        opacity:0;
        animation:profileWeatherSun 9s ease-in-out infinite alternate;
      }

      .profile-showcase.weather-sunny .profile-weather-sun,
      .profile-showcase.weather-clear .profile-weather-sun{
        opacity:1;
      }

      .profile-weather-cloud{
        position:absolute;
        width:260px;
        height:96px;
        border-radius:999px;
        background:radial-gradient(circle at 28% 42%, rgba(255,255,255,.54), transparent 34%), radial-gradient(circle at 58% 34%, rgba(255,255,255,.42), transparent 34%), linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,.04));
        filter:blur(10px);
        opacity:.52;
        transform:translateX(-20%);
        animation:profileWeatherCloud 22s linear infinite;
      }

      .profile-weather-cloud-a{ left:-18%; top:12%; }
      .profile-weather-cloud-b{ left:34%; top:34%; width:310px; opacity:.34; animation-duration:30s; animation-delay:-10s; }

      .profile-showcase.weather-sunny .profile-weather-cloud,
      .profile-showcase.weather-clear .profile-weather-cloud{ opacity:.22; }
      .profile-showcase.weather-rain .profile-weather-cloud,
      .profile-showcase.weather-storm .profile-weather-cloud,
      .profile-showcase.weather-cloudy .profile-weather-cloud,
      .profile-showcase.weather-fog .profile-weather-cloud{ opacity:.68; }
      .profile-showcase.weather-night .profile-weather-cloud{ opacity:.26; }

      .profile-weather-rain,
      .profile-weather-snow{
        position:absolute;
        inset:-20% 0 0;
        opacity:0;
        transition:opacity .5s ease;
        mix-blend-mode:screen;
      }

      .profile-weather-rain{
        background-image:linear-gradient(115deg, rgba(190,230,255,.0) 0 42%, rgba(190,230,255,.48) 44%, rgba(190,230,255,.0) 48% 100%);
        background-size:18px 42px;
        animation:profileWeatherRain .62s linear infinite;
      }

      .profile-weather-snow{
        background-image:radial-gradient(circle, rgba(255,255,255,.76) 0 1.4px, transparent 1.7px);
        background-size:26px 26px;
        animation:profileWeatherSnow 8s linear infinite;
      }

      .profile-showcase.weather-rain .profile-weather-rain,
      .profile-showcase.weather-storm .profile-weather-rain{ opacity:.42; }
      .profile-showcase.weather-snow .profile-weather-snow{ opacity:.70; }

      .profile-weather-label{
        position:absolute;
        right:18px;
        top:18px;
        z-index:3;
        display:inline-flex;
        align-items:center;
        gap:8px;
        min-height:34px;
        padding:0 12px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(0,0,0,.22);
        color:rgba(255,255,255,.84);
        font-size:12px;
        font-weight:900;
        letter-spacing:.03em;
        backdrop-filter:blur(12px);
        opacity:0;
        transform:translateY(-4px);
        transition:opacity .35s ease, transform .35s ease;
      }

      .profile-showcase.is-weather-live .profile-weather-label{
        opacity:1;
        transform:translateY(0);
      }

      @keyframes profileWeatherSun{
        from{ transform:translate3d(-8px, 8px, 0) scale(.96); }
        to{ transform:translate3d(10px, -4px, 0) scale(1.04); }
      }

      @keyframes profileWeatherCloud{
        from{ transform:translateX(-36%); }
        to{ transform:translateX(92%); }
      }

      @keyframes profileWeatherRain{
        from{ transform:translate3d(0, -42px, 0); }
        to{ transform:translate3d(-18px, 42px, 0); }
      }

      @keyframes profileWeatherSnow{
        from{ transform:translate3d(0, -26px, 0); }
        to{ transform:translate3d(18px, 26px, 0); }
      }

      @media(max-width:700px){
        .profile-weather-scene{ border-radius:28px; }
        .profile-weather-label{ right:12px; top:12px; font-size:11px; min-height:30px; }
      }


      .profile-showcase.is-weather-live{
        background:#2f8fd8 !important;
        border-color:rgba(218,242,255,.42) !important;
        box-shadow:
          0 24px 70px rgba(0,0,0,.36),
          0 0 0 1px rgba(210,242,255,.24),
          0 0 46px rgba(120,205,255,.22),
          inset 0 1px 0 rgba(255,255,255,.18) !important;
      }

      .profile-showcase.is-weather-live::before{
        opacity:.035 !important;
      }

      .profile-showcase.is-weather-live::after{
        background:
          linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,.02) 34%, rgba(0,0,0,.36) 100%),
          radial-gradient(circle at 48% 28%, rgba(255,255,255,.18), transparent 17%) !important;
        opacity:1 !important;
      }

      .profile-showcase.is-weather-live .profile-showcase-bg{
        background:
          radial-gradient(circle at 40% 19%, rgba(255,255,255,1) 0%, rgba(255,255,255,.78) 7%, rgba(255,239,176,.35) 15%, transparent 31%),
          radial-gradient(circle at 56% 84%, rgba(255,255,255,.24), transparent 9%),
          radial-gradient(circle at 64% 72%, rgba(110,210,255,.28), transparent 18%),
          linear-gradient(180deg, #74c4ff 0%, #4aa7eb 38%, #1d7fd0 70%, #06111f 100%) !important;
        opacity:1 !important;
        background-size:cover !important;
        background-position:center !important;
        filter:saturate(1.10) contrast(1.02) brightness(1.06) !important;
        transform:scale(1.01) !important;
      }

      .profile-showcase.is-weather-live .profile-weather-scene{
        opacity:1 !important;
        z-index:1;
      }

      .profile-showcase.is-weather-live .profile-showcase-top{
        z-index:3;
      }

      .profile-showcase.is-weather-live .profile-showcase-main{
        text-shadow:0 2px 24px rgba(0,0,0,.34);
      }

      .profile-showcase.is-weather-live .profile-showcase-avatar-wrap::before{
        background:
          radial-gradient(circle at 50% 16%, rgba(210,240,255,.62), transparent 58%),
          linear-gradient(180deg, rgba(165,224,255,.58), rgba(80,150,220,.25)) !important;
        opacity:.96 !important;
      }

      .profile-showcase.is-weather-live .profile-showcase-avatar-wrap::after{
        background:radial-gradient(circle at 50% 50%, rgba(135,215,255,.54), transparent 62%) !important;
        opacity:.86 !important;
      }

      .profile-showcase.is-weather-live .profile-pill-btn,
      .profile-showcase.is-weather-live .profile-showcase-actions .btn{
        background:rgba(0,0,0,.52) !important;
        border-color:rgba(255,255,255,.14) !important;
        backdrop-filter:blur(12px);
        -webkit-backdrop-filter:blur(12px);
      }

      .profile-weather-wisp,
      .profile-weather-lens{
        position:absolute;
        pointer-events:none;
        opacity:0;
      }

      .profile-weather-wisp{
        width:520px;
        height:120px;
        border-radius:999px;
        background:
          radial-gradient(ellipse at 20% 48%, rgba(255,255,255,.36), transparent 32%),
          radial-gradient(ellipse at 55% 38%, rgba(255,255,255,.28), transparent 34%),
          linear-gradient(90deg, transparent, rgba(255,255,255,.24), transparent);
        filter:blur(10px);
        mix-blend-mode:screen;
        animation:profileWeatherWisp 24s linear infinite;
      }

      .profile-weather-wisp-a{ left:-20%; top:8%; opacity:.72; }
      .profile-weather-wisp-b{ left:20%; top:30%; opacity:.42; animation-duration:32s; animation-delay:-11s; }

      .profile-showcase.is-weather-live .profile-weather-wisp{ opacity:.62; }
      .profile-showcase.weather-rain .profile-weather-wisp,
      .profile-showcase.weather-storm .profile-weather-wisp,
      .profile-showcase.weather-cloudy .profile-weather-wisp,
      .profile-showcase.weather-fog .profile-weather-wisp{ opacity:.38; }

      .profile-weather-lens{
        border-radius:999px;
        background:rgba(255,255,255,.15);
        filter:blur(2px);
        mix-blend-mode:screen;
        animation:profileWeatherLens 7s ease-in-out infinite alternate;
      }

      .profile-weather-lens-a{ width:82px; height:82px; left:58%; top:76%; opacity:.24; }
      .profile-weather-lens-b{ width:36px; height:36px; left:48%; top:42%; opacity:.18; animation-delay:-2s; }

      .profile-showcase.is-weather-live .profile-weather-label{
        right:24px;
        top:26px;
        min-height:46px;
        padding:0 20px;
        border-radius:999px;
        font-size:18px;
        font-weight:950;
        letter-spacing:.01em;
        color:#f7fbff;
        border:1px solid rgba(255,255,255,.20);
        background:rgba(5,11,22,.44);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.10), 0 10px 28px rgba(0,0,0,.20);
        text-shadow:0 1px 10px rgba(0,0,0,.32);
      }

      .profile-showcase.weather-sunny .profile-showcase-bg,
      .profile-showcase.weather-clear .profile-showcase-bg{
        background:
          radial-gradient(circle at 40% 19%, rgba(255,255,255,1) 0%, rgba(255,255,255,.82) 7%, rgba(255,241,181,.36) 15%, transparent 32%),
          radial-gradient(circle at 56% 84%, rgba(255,255,255,.24), transparent 9%),
          radial-gradient(circle at 64% 72%, rgba(110,210,255,.28), transparent 18%),
          linear-gradient(180deg, #74c4ff 0%, #4aa7eb 38%, #1d7fd0 70%, #06111f 100%) !important;
      }

      .profile-showcase.weather-cloudy .profile-showcase-bg,
      .profile-showcase.weather-fog .profile-showcase-bg{
        background:
          radial-gradient(circle at 35% 18%, rgba(255,255,255,.58), transparent 25%),
          radial-gradient(circle at 72% 18%, rgba(210,235,255,.32), transparent 24%),
          linear-gradient(180deg, #9bc4e0 0%, #5a8faf 48%, #10243a 100%) !important;
      }

      .profile-showcase.weather-rain .profile-showcase-bg,
      .profile-showcase.weather-storm .profile-showcase-bg{
        background:
          radial-gradient(circle at 68% 10%, rgba(185,225,255,.30), transparent 21%),
          linear-gradient(180deg, #5d7f99 0%, #28465a 54%, #04101c 100%) !important;
      }

      .profile-showcase.weather-snow .profile-showcase-bg{
        background:
          radial-gradient(circle at 34% 16%, rgba(255,255,255,.82), transparent 24%),
          linear-gradient(180deg, #c3e1f8 0%, #82acd0 50%, #10263e 100%) !important;
      }

      .profile-showcase.weather-night .profile-showcase-bg{
        background:
          radial-gradient(circle at 72% 16%, rgba(225,238,255,.58), transparent 10%),
          radial-gradient(circle at 22% 72%, rgba(65,125,255,.20), transparent 30%),
          linear-gradient(180deg, #101a35 0%, #081122 52%, #000 100%) !important;
      }

      @keyframes profileWeatherWisp{
        from{ transform:translateX(-42%) translateY(0) rotate(-4deg); }
        to{ transform:translateX(82%) translateY(-10px) rotate(-4deg); }
      }

      @keyframes profileWeatherLens{
        from{ transform:translate3d(-6px, 8px, 0) scale(.92); }
        to{ transform:translate3d(8px, -10px, 0) scale(1.08); }
      }

      @media(max-width:700px){
        .profile-showcase.is-weather-live .profile-weather-label{
          right:14px;
          top:14px;
          min-height:34px;
          padding:0 13px;
          font-size:13px;
        }
      }


      .profile-showcase.is-weather-live{
        border:1px solid rgba(218,242,255,.48) !important;
        box-shadow:
          0 22px 60px rgba(0,0,0,.42),
          0 0 0 1px rgba(255,255,255,.10),
          0 0 48px rgba(92,190,255,.20),
          inset 0 1px 0 rgba(255,255,255,.32),
          inset 0 -1px 0 rgba(0,0,0,.22) !important;
      }

      .profile-showcase.is-weather-live .profile-showcase-bg{
        background:
          radial-gradient(circle at 38% 17%, rgba(255,255,255,1) 0%, rgba(255,255,255,.88) 6%, rgba(255,240,184,.44) 13%, rgba(255,225,122,.12) 24%, transparent 34%),
          radial-gradient(ellipse at 52% 33%, rgba(255,255,255,.30), transparent 19%),
          radial-gradient(circle at 58% 78%, rgba(255,255,255,.24), transparent 8%),
          radial-gradient(circle at 68% 68%, rgba(92,210,255,.25), transparent 20%),
          linear-gradient(180deg, #85d1ff 0%, #54b3f3 34%, #2789db 66%, #071421 100%) !important;
        filter:saturate(1.16) contrast(1.04) brightness(1.08) !important;
      }

      .profile-showcase.is-weather-live .profile-weather-scene::before{
        content:"";
        position:absolute;
        inset:0;
        background:
          linear-gradient(115deg, transparent 0 18%, rgba(255,255,255,.22) 26%, transparent 38% 100%),
          radial-gradient(circle at 46% 44%, rgba(255,255,255,.20), transparent 13%);
        mix-blend-mode:screen;
        opacity:.52;
        animation:profileWeatherRay 10s ease-in-out infinite alternate;
      }

      .profile-showcase.is-weather-live .profile-weather-scene::after{
        content:"";
        position:absolute;
        inset:0;
        background:
          radial-gradient(circle at 30% 18%, rgba(255,255,255,.22), transparent 2px),
          radial-gradient(circle at 70% 34%, rgba(255,255,255,.14), transparent 2px),
          radial-gradient(circle at 52% 72%, rgba(255,255,255,.16), transparent 2px);
        background-size:46px 46px;
        opacity:.18;
        mix-blend-mode:screen;
      }

      .profile-showcase.is-weather-live .profile-showcase-top::before{
        content:"";
        position:absolute;
        left:-18px;
        right:-18px;
        bottom:-18px;
        height:62%;
        z-index:-1;
        pointer-events:none;
        background:linear-gradient(180deg, transparent, rgba(0,0,0,.34));
        filter:blur(18px);
        opacity:.82;
      }

      .profile-showcase.is-weather-live .profile-showcase-name,
      .profile-showcase.is-weather-live .profile-showcase-handle{
        text-shadow:0 2px 18px rgba(0,0,0,.34), 0 1px 2px rgba(0,0,0,.32);
      }

      .profile-showcase.is-weather-live .profile-weather-label{
        background:rgba(12,26,48,.38);
        border:1px solid rgba(255,255,255,.26);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.22),
          inset 0 -1px 0 rgba(0,0,0,.18),
          0 16px 34px rgba(0,0,0,.22),
          0 0 24px rgba(145,220,255,.18);
        backdrop-filter:blur(18px) saturate(1.25);
        -webkit-backdrop-filter:blur(18px) saturate(1.25);
      }

      .profile-showcase.is-weather-live .profile-pill-btn,
      .profile-showcase.is-weather-live .profile-showcase-actions .btn{
        background:rgba(5,12,24,.50) !important;
        border-color:rgba(255,255,255,.18) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.14),
          inset 0 -1px 0 rgba(0,0,0,.20),
          0 12px 30px rgba(0,0,0,.22) !important;
      }

      .profile-showcase.is-weather-live .profile-showcase-avatar{
        background:rgba(5,12,24,.36) !important;
        border-color:rgba(180,230,255,.74) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.16),
          0 0 0 1px rgba(255,255,255,.08),
          0 0 28px rgba(115,210,255,.44),
          0 18px 42px rgba(0,0,0,.28) !important;
      }

      @keyframes profileWeatherRay{
        from{ transform:translate3d(-18px, 8px, 0) rotate(-3deg); opacity:.34; }
        to{ transform:translate3d(18px, -8px, 0) rotate(-3deg); opacity:.62; }
      }


      .profile-showcase.is-weather-live{
        border-color:rgba(230,246,255,.30) !important;
        box-shadow:
          0 18px 52px rgba(0,0,0,.30),
          inset 0 1px 0 rgba(255,255,255,.22),
          inset 0 -1px 0 rgba(42,94,145,.26) !important;
      }

      .profile-showcase.is-weather-live .profile-showcase-bg{
        background:
          radial-gradient(circle at 44% -5%, rgba(255,255,255,1) 0%, rgba(255,255,255,.92) 7%, rgba(246,250,255,.66) 16%, rgba(255,240,184,.20) 27%, transparent 39%),
          radial-gradient(ellipse at 44% 18%, rgba(255,255,255,.38), transparent 24%),
          radial-gradient(circle at 58% 82%, rgba(255,255,255,.20), transparent 7%),
          linear-gradient(180deg, #8ec6ec 0%, #63a9dc 38%, #3f8fd0 70%, #226da9 100%) !important;
        filter:saturate(.96) contrast(.98) brightness(1.12) !important;
      }

      .profile-weather-sun{
        left:28%;
        top:-26%;
        width:250px;
        height:250px;
        background:radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,.94) 16%, rgba(255,250,220,.45) 31%, rgba(255,230,140,.10) 50%, transparent 72%) !important;
        filter:blur(2px);
      }

      .profile-weather-wisp{
        width:680px;
        height:150px;
        background:
          radial-gradient(ellipse at 16% 46%, rgba(255,255,255,.40), transparent 28%),
          radial-gradient(ellipse at 42% 40%, rgba(255,255,255,.30), transparent 30%),
          radial-gradient(ellipse at 72% 52%, rgba(255,255,255,.22), transparent 28%),
          linear-gradient(90deg, transparent, rgba(255,255,255,.28), rgba(255,255,255,.18), transparent) !important;
        filter:blur(13px);
        mix-blend-mode:screen;
      }

      .profile-weather-wisp-a{
        left:-34%;
        top:4%;
        opacity:.86 !important;
        transform:rotate(-5deg);
      }

      .profile-weather-wisp-b{
        left:-4%;
        top:23%;
        width:740px;
        opacity:.54 !important;
        transform:rotate(-6deg);
      }

      .profile-showcase.is-weather-live .profile-weather-wisp{
        opacity:.72 !important;
      }

      .profile-weather-lens-a{
        width:92px;
        height:92px;
        left:58%;
        top:78%;
        opacity:.16 !important;
        background:rgba(255,255,255,.18) !important;
      }

      .profile-weather-lens-b{
        width:44px;
        height:44px;
        left:47%;
        top:39%;
        opacity:.12 !important;
        background:rgba(255,255,255,.16) !important;
      }

      .profile-showcase.is-weather-live .profile-weather-scene::before{
        background:
          linear-gradient(110deg, transparent 0 18%, rgba(255,255,255,.26) 28%, rgba(255,255,255,.08) 42%, transparent 62% 100%),
          radial-gradient(circle at 44% 12%, rgba(255,255,255,.32), transparent 18%) !important;
        opacity:.58 !important;
      }

      .profile-showcase.is-weather-live .profile-showcase-top::before{
        background:linear-gradient(180deg, transparent, rgba(18,78,128,.30), rgba(0,0,0,.24)) !important;
        opacity:.70 !important;
      }

      .profile-showcase.is-weather-live .profile-showcase-name,
      .profile-showcase.is-weather-live .profile-showcase-handle{
        text-shadow:0 2px 20px rgba(28,66,105,.40), 0 1px 2px rgba(0,0,0,.28) !important;
      }

      .profile-showcase.is-weather-live .profile-weather-label{
        background:rgba(35,85,130,.34) !important;
        border-color:rgba(255,255,255,.24) !important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 12px 28px rgba(20,74,122,.22) !important;
      }

      .profile-showcase.weather-sunny .profile-showcase-bg,
      .profile-showcase.weather-clear .profile-showcase-bg{
        background:
          radial-gradient(circle at 44% -5%, rgba(255,255,255,1) 0%, rgba(255,255,255,.92) 7%, rgba(246,250,255,.66) 16%, rgba(255,240,184,.20) 27%, transparent 39%),
          radial-gradient(ellipse at 44% 18%, rgba(255,255,255,.38), transparent 24%),
          radial-gradient(circle at 58% 82%, rgba(255,255,255,.20), transparent 7%),
          linear-gradient(180deg, #8ec6ec 0%, #63a9dc 38%, #3f8fd0 70%, #226da9 100%) !important;
      }

      /* Premium iOS-style live weather final tuning */
      .profile-showcase.is-weather-live{
        background:#78bce9 !important;
        border-color:rgba(235,248,255,.62) !important;
        box-shadow:
          0 18px 46px rgba(0,0,0,.24),
          0 0 0 1px rgba(76,181,255,.34),
          inset 0 1px 0 rgba(255,255,255,.55),
          inset 0 -1px 0 rgba(25,98,156,.26) !important;
      }

      .profile-showcase.is-weather-live .profile-showcase-bg,
      .profile-showcase.weather-sunny .profile-showcase-bg,
      .profile-showcase.weather-clear .profile-showcase-bg{
        opacity:1 !important;
        background:
          radial-gradient(circle at 46% -10%, rgba(255,255,255,1) 0%, rgba(255,255,255,.98) 7%, rgba(255,255,255,.76) 15%, rgba(255,242,192,.28) 24%, transparent 38%),
          radial-gradient(ellipse at 46% 12%, rgba(255,255,255,.42), transparent 25%),
          radial-gradient(circle at 62% 92%, rgba(255,255,255,.20), transparent 9%),
          radial-gradient(ellipse at 18% 80%, rgba(67,176,230,.34), transparent 36%),
          linear-gradient(180deg, #9bd4f3 0%, #76bdea 34%, #4fa3da 66%, #2f83c3 100%) !important;
        filter:saturate(1.02) contrast(.95) brightness(1.14) !important;
      }

      .profile-showcase.is-weather-live .profile-weather-scene{
        background:
          linear-gradient(180deg, rgba(255,255,255,.22), transparent 20%, rgba(255,255,255,.05) 58%, rgba(25,108,174,.18)),
          radial-gradient(ellipse at 50% 7%, rgba(255,255,255,.30), transparent 30%) !important;
        mix-blend-mode:normal;
      }

      .profile-showcase.is-weather-live .profile-weather-scene::before{
        background:
          linear-gradient(108deg, transparent 0 16%, rgba(255,255,255,.34) 27%, rgba(255,255,255,.13) 43%, transparent 64% 100%),
          linear-gradient(98deg, transparent 0 36%, rgba(255,255,255,.18) 46%, transparent 60% 100%) !important;
        filter:blur(3px);
        opacity:.72 !important;
        animation:profileWeatherRay 11s ease-in-out infinite alternate;
      }

      .profile-showcase.is-weather-live .profile-weather-scene::after{
        content:"";
        position:absolute;
        left:-18%;
        right:-18%;
        top:5%;
        height:58%;
        background:
          linear-gradient(168deg, transparent 0 10%, rgba(255,255,255,.38) 20%, transparent 34% 100%),
          linear-gradient(174deg, transparent 0 28%, rgba(255,255,255,.30) 38%, transparent 52% 100%),
          radial-gradient(ellipse at 34% 22%, rgba(255,255,255,.30), transparent 28%),
          radial-gradient(ellipse at 74% 34%, rgba(255,255,255,.22), transparent 24%) !important;
        filter:blur(12px);
        opacity:.78 !important;
        transform:rotate(-4deg);
        animation:profileWeatherWisp 28s linear infinite;
      }

      .profile-weather-sun{
        left:31% !important;
        top:-35% !important;
        width:320px !important;
        height:320px !important;
        background:radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,.97) 12%, rgba(255,251,229,.72) 24%, rgba(255,236,156,.20) 43%, transparent 69%) !important;
        filter:blur(2px) !important;
        opacity:1;
      }

      .profile-showcase.weather-cloudy .profile-weather-sun,
      .profile-showcase.weather-fog .profile-weather-sun{ opacity:.62; }

      .profile-weather-wisp{
        height:170px !important;
        background:
          radial-gradient(ellipse at 14% 42%, rgba(255,255,255,.48), transparent 27%),
          radial-gradient(ellipse at 43% 38%, rgba(255,255,255,.36), transparent 29%),
          radial-gradient(ellipse at 74% 48%, rgba(255,255,255,.28), transparent 30%),
          linear-gradient(92deg, transparent 0%, rgba(255,255,255,.33) 28%, rgba(255,255,255,.18) 54%, transparent 92%) !important;
        filter:blur(15px) !important;
        mix-blend-mode:screen !important;
      }

      .profile-weather-wisp-a{
        left:-38% !important;
        top:2% !important;
        width:760px !important;
        opacity:.92 !important;
      }

      .profile-weather-wisp-b{
        left:-2% !important;
        top:20% !important;
        width:820px !important;
        opacity:.66 !important;
      }

      .profile-weather-cloud{
        background:
          radial-gradient(ellipse at 26% 48%, rgba(255,255,255,.54), transparent 30%),
          radial-gradient(ellipse at 55% 42%, rgba(255,255,255,.42), transparent 32%),
          radial-gradient(ellipse at 80% 58%, rgba(255,255,255,.28), transparent 34%),
          linear-gradient(90deg, transparent, rgba(255,255,255,.23), transparent) !important;
        filter:blur(18px) !important;
        mix-blend-mode:screen !important;
      }

      .profile-weather-cloud-a{ left:-30% !important; top:25% !important; width:420px !important; opacity:.45 !important; }
      .profile-weather-cloud-b{ left:34% !important; top:44% !important; width:500px !important; opacity:.30 !important; }

      .profile-weather-lens-a{
        left:57% !important;
        top:77% !important;
        width:96px !important;
        height:96px !important;
        background:rgba(255,255,255,.22) !important;
        box-shadow:0 0 44px rgba(255,255,255,.10) inset !important;
        opacity:.18 !important;
      }

      .profile-weather-lens-b{
        left:45% !important;
        top:34% !important;
        background:rgba(255,255,255,.18) !important;
        opacity:.16 !important;
      }

      .profile-showcase.is-weather-live .profile-showcase-top::before{
        background:linear-gradient(180deg, transparent 0%, rgba(41,126,190,.05) 42%, rgba(13,69,121,.22) 100%) !important;
        opacity:.58 !important;
      }

      .profile-showcase.is-weather-live .profile-showcase-name,
      .profile-showcase.is-weather-live .profile-showcase-handle{
        text-shadow:0 2px 18px rgba(20,77,130,.36), 0 1px 2px rgba(0,0,0,.20) !important;
      }

      .profile-showcase.is-weather-live .profile-weather-label{
        background:rgba(38,91,136,.42) !important;
        border-color:rgba(255,255,255,.26) !important;
        color:rgba(255,255,255,.94) !important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.25), 0 10px 24px rgba(20,80,130,.18) !important;
      }

      .profile-showcase.is-weather-live .profile-pill-btn,
      .profile-showcase.is-weather-live .profile-showcase-actions .btn{
        background:rgba(20,58,90,.58) !important;
        border-color:rgba(255,255,255,.16) !important;
        color:#fff !important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.12), 0 10px 24px rgba(18,77,122,.22) !important;
      }
      /* End premium iOS-style live weather final tuning */


      /* Weather profile name area polish */
      .profile-showcase.is-weather-live .profile-showcase-main{
        position:relative;
        z-index:4;
        width:max-content;
        max-width:100%;
        padding:10px 14px 12px 0;
        isolation:isolate;
      }

      .profile-showcase.is-weather-live .profile-showcase-main::before{
        content:"";
        position:absolute;
        left:-18px;
        right:-22px;
        top:-12px;
        bottom:-12px;
        z-index:-1;
        border-radius:28px;
        background:
          radial-gradient(ellipse at 22% 40%, rgba(255,255,255,.26), transparent 54%),
          linear-gradient(90deg, rgba(25,91,143,.28), rgba(49,135,190,.12) 58%, transparent 100%);
        filter:blur(.2px);
        opacity:.92;
        pointer-events:none;
      }

      .profile-showcase.is-weather-live .profile-showcase-main::after{
        content:"";
        position:absolute;
        left:-18px;
        right:6%;
        bottom:-8px;
        height:1px;
        z-index:-1;
        background:linear-gradient(90deg, rgba(255,255,255,.34), rgba(255,255,255,.08), transparent);
        opacity:.82;
        pointer-events:none;
      }

      .profile-showcase.is-weather-live .profile-showcase-name{
        color:rgba(255,255,255,.98) !important;
        text-shadow:
          0 1px 0 rgba(255,255,255,.16),
          0 3px 12px rgba(15,76,124,.38),
          0 1px 2px rgba(0,0,0,.24) !important;
      }

      .profile-showcase.is-weather-live .profile-showcase-handle{
        color:rgba(241,249,255,.86) !important;
        text-shadow:0 2px 10px rgba(16,76,125,.34), 0 1px 2px rgba(0,0,0,.18) !important;
      }

      .profile-showcase.is-weather-live .profile-showcase-actions{
        position:relative;
        z-index:4;
      }
      /* End weather profile name area polish */


      /* Final premium weather card micro-polish */
      .profile-showcase.is-weather-live{
        overflow:hidden;
      }

      .profile-showcase.is-weather-live::after{
        content:"";
        position:absolute;
        inset:1px;
        z-index:2;
        pointer-events:none;
        border-radius:inherit;
        background:
          linear-gradient(180deg, rgba(255,255,255,.26), transparent 18%, transparent 72%, rgba(255,255,255,.14)),
          linear-gradient(90deg, rgba(255,255,255,.16), transparent 18%, transparent 82%, rgba(255,255,255,.12));
        mix-blend-mode:screen;
        opacity:.70;
      }

      .profile-showcase.is-weather-live .profile-showcase-main::before{
        left:-22px !important;
        right:-34px !important;
        top:-18px !important;
        bottom:-18px !important;
        border-radius:34px !important;
        background:
          radial-gradient(ellipse at 24% 44%, rgba(255,255,255,.20), transparent 50%),
          radial-gradient(ellipse at 42% 58%, rgba(51,140,195,.16), transparent 60%),
          linear-gradient(90deg, rgba(20,86,139,.18), rgba(255,255,255,.05) 56%, transparent 100%) !important;
        filter:blur(10px) !important;
        opacity:.82 !important;
      }

      .profile-showcase.is-weather-live .profile-showcase-main::after{
        left:-10px !important;
        right:18% !important;
        bottom:-4px !important;
        opacity:.52 !important;
      }

      .profile-showcase.is-weather-live .profile-showcase-avatar{
        box-shadow:
          0 0 0 1px rgba(255,255,255,.48),
          0 0 0 2px rgba(87,184,255,.38),
          0 14px 34px rgba(22,93,145,.26),
          inset 0 1px 0 rgba(255,255,255,.18) !important;
      }

      .profile-showcase.is-weather-live .profile-showcase-avatar-wrap::before{
        opacity:.86 !important;
        filter:blur(18px) !important;
      }

      .profile-showcase.is-weather-live .profile-weather-label{
        top:16px !important;
        right:16px !important;
        min-height:36px !important;
        padding:0 14px !important;
        background:rgba(58,111,153,.34) !important;
        backdrop-filter:blur(18px) saturate(1.22) !important;
      }

      .profile-showcase.is-weather-live .profile-pill-btn,
      .profile-showcase.is-weather-live .profile-showcase-actions .btn{
        backdrop-filter:blur(18px) saturate(1.18) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.18),
          inset 0 -1px 0 rgba(6,39,67,.18),
          0 10px 24px rgba(18,77,122,.18) !important;
      }

      .profile-showcase.is-weather-live .profile-pill-btn::before,
      .profile-showcase.is-weather-live .profile-showcase-actions .btn::before{
        opacity:.38 !important;
      }
      /* End final premium weather card micro-polish */


      /* Remove weather card edge glare */
      .profile-showcase.is-weather-live{
        border-color:rgba(209,239,255,.42) !important;
        box-shadow:
          0 16px 40px rgba(0,0,0,.20),
          0 0 0 1px rgba(76,181,255,.22),
          inset 0 1px 0 rgba(255,255,255,.28) !important;
      }

      .profile-showcase.is-weather-live::after{
        inset:0 !important;
        border-radius:inherit !important;
        background:
          linear-gradient(180deg, rgba(255,255,255,.13), transparent 22%, transparent 78%, rgba(255,255,255,.05)) !important;
        opacity:.32 !important;
        mix-blend-mode:normal !important;
      }

      .profile-showcase.is-weather-live.is-secondary-dim::after,
      .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live::after{
        opacity:.18 !important;
        background:linear-gradient(180deg, rgba(255,255,255,.10), transparent 48%, rgba(255,255,255,.03)) !important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live{
        border-color:rgba(206,238,255,.34) !important;
        box-shadow:
          0 10px 28px rgba(0,0,0,.18),
          0 0 0 1px rgba(76,181,255,.16),
          inset 0 1px 0 rgba(255,255,255,.18) !important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live .profile-showcase-bg{
        border-radius:inherit !important;
      }
      /* End remove weather card edge glare */


      /* Profile event pill small-screen stability */
      .profile-event-card-panel .event-topline,
      .profile-event-card-panel .event-pill-stack{
        min-width:0;
        max-width:100%;
      }

      .profile-event-card-panel .event-pill{
        max-width:100%;
        min-width:0;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .profile-event-card-panel .event-pill-soft{
        max-width:min(46%, 176px);
        min-width:0;
      }

      @media(max-width:430px){
        .profile-event-card-panel .event-topline{
          display:grid;
          grid-template-columns:minmax(0, 1fr) auto;
          gap:8px;
          align-items:start;
        }

        .profile-event-card-panel .event-pill-stack{
          display:flex;
          flex-wrap:wrap;
          gap:7px;
          min-width:0;
        }

        .profile-event-card-panel .event-pill{
          min-height:28px;
          padding-inline:10px;
          font-size:9px;
          letter-spacing:.62px;
        }

        .profile-event-card-panel .event-pill-soft{
          justify-self:end;
          max-width:116px;
          padding-inline:9px;
          font-size:8.8px;
          letter-spacing:.42px;
        }
      }

      @media(max-width:370px){
        .profile-event-card-panel .event-topline{
          grid-template-columns:1fr;
        }

        .profile-event-card-panel .event-pill-soft{
          justify-self:start;
          max-width:100%;
        }

        .profile-event-card-panel .event-title{
          font-size:clamp(29px, 9vw, 38px) !important;
        }
      }
      /* End profile event pill small-screen stability */


      /* Premium edit profile rebuild polish */
      .tz-edit-wrap{
        max-width:1040px !important;
        padding-bottom:130px;
      }
      .tz-edit-shell{
        gap:18px !important;
      }
      .tz-edit-hero{
        min-height:260px;
        padding:28px !important;
        border-radius:36px !important;
        border-color:rgba(145,210,255,.26) !important;
        background:#06111d !important;
        box-shadow:0 24px 70px rgba(0,0,0,.50), 0 0 0 1px rgba(91,190,255,.14), inset 0 1px 0 rgba(255,255,255,.16) !important;
      }
      .tz-edit-hero-bg{
        background:
          radial-gradient(circle at 22% 2%, rgba(255,255,255,.86), rgba(255,255,255,.32) 14%, rgba(255,229,155,.10) 28%, transparent 44%),
          radial-gradient(ellipse at 64% 30%, rgba(113,201,255,.32), transparent 48%),
          linear-gradient(180deg, #74bce8 0%, #378bc9 62%, #07111d 100%) !important;
        opacity:1;
      }
      .tz-edit-hero::after{
        content:"";
        position:absolute;
        inset:0;
        border-radius:inherit;
        pointer-events:none;
        background:linear-gradient(180deg, rgba(255,255,255,.22), transparent 22%, rgba(0,0,0,.22));
        opacity:.72;
      }
      .tz-edit-hero-top,
      .tz-edit-form{
        position:relative;
        z-index:2;
      }
      .tz-edit-kicker{
        color:rgba(255,255,255,.82) !important;
        letter-spacing:.18em !important;
        font-weight:950 !important;
      }
      .tz-edit-title{
        color:#fff !important;
        font-size:clamp(42px, 9vw, 76px) !important;
        line-height:.88 !important;
        letter-spacing:0 !important;
        text-shadow:0 3px 18px rgba(22,77,120,.38), 0 1px 2px rgba(0,0,0,.22);
      }
      .tz-edit-subtitle{
        max-width:470px;
        color:rgba(245,250,255,.82) !important;
        font-weight:760;
      }
      .tz-edit-btn,
      .tz-edit-submit{
        border-radius:18px !important;
        min-height:48px;
        border-color:rgba(255,255,255,.20) !important;
        background:rgba(10,38,66,.38) !important;
        color:#fff !important;
        backdrop-filter:blur(18px) saturate(1.15);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.14), 0 12px 26px rgba(0,0,0,.20) !important;
      }
      .tz-edit-submit{
        background:linear-gradient(135deg,#31d6ff,#2d6bff 58%,#123fbd) !important;
      }
      .tz-edit-section{
        border-radius:28px !important;
        border-color:rgba(145,210,255,.15) !important;
        background:linear-gradient(180deg, rgba(14,22,34,.82), rgba(5,7,12,.94)) !important;
        box-shadow:0 18px 54px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.08) !important;
      }
      .tz-edit-section-head h3{
        color:#fff !important;
        letter-spacing:0 !important;
        font-size:clamp(24px, 5vw, 34px) !important;
      }
      .tz-edit-section-head p{
        color:rgba(226,238,255,.68) !important;
        font-weight:740;
      }
      .tz-field label{
        color:rgba(225,240,255,.74) !important;
        font-weight:900 !important;
      }
      .tz-field input,
      .tz-field textarea,
      .tz-field select{
        border-radius:18px !important;
        border-color:rgba(190,225,255,.17) !important;
        background:rgba(0,0,0,.28) !important;
        color:#fff !important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.06) !important;
      }
      .tz-field input:focus,
      .tz-field textarea:focus,
      .tz-field select:focus{
        border-color:rgba(100,205,255,.62) !important;
        box-shadow:0 0 0 3px rgba(53,171,255,.14), inset 0 1px 0 rgba(255,255,255,.08) !important;
        outline:none;
      }
      @media(max-width:700px){
        .tz-edit-wrap{padding-inline:12px !important;}
        .tz-edit-hero{min-height:230px;padding:22px !important;border-radius:30px !important;}
        .tz-edit-actions{width:100%;display:grid !important;grid-template-columns:1fr 1fr;}
        .tz-edit-section{border-radius:24px !important;}
      }


      .tz-identity-tour-section{
        min-height:690px;
        overflow:hidden;
        transform-style:preserve-3d;
      }
      .tz-identity-tour-screen{
        position:absolute;
        inset:0;
        z-index:8;
        display:grid;
        place-items:stretch;
        min-height:100%;
        border-radius:inherit;
        overflow:hidden;
        opacity:0;
        pointer-events:none;
        transform:scale(.985);
        transition:opacity .7s ease, transform .7s ease;
        background:#02040a;
      }
      .tz-identity-tour-section.is-tour-active .tz-edit-section-head,
      .tz-identity-tour-section.is-tour-active .tz-edit-grid{
        opacity:0;
        transform:scale(.97);
        pointer-events:none;
        transition:opacity .45s ease, transform .45s ease;
      }
      .tz-identity-tour-section.is-tour-active .tz-identity-tour-screen{
        opacity:1;
        pointer-events:auto;
        transform:scale(1);
      }
      .tz-mansion-sky{
        position:absolute;
        inset:0;
        background:
          radial-gradient(circle at 62% 16%, rgba(255,247,207,.78), rgba(255,247,207,.08) 9%, transparent 23%),
          radial-gradient(520px 280px at 50% 0%, rgba(130,204,255,.30), transparent 62%),
          linear-gradient(180deg, #08131f 0%, #101a29 38%, #02050c 100%);
      }
      .tz-mansion-sky::before{
        content:"";
        position:absolute;
        inset:0;
        background:linear-gradient(90deg, transparent, rgba(255,255,255,.10), transparent);
        transform:translateX(-120%);
        animation:tzMansionGleam 7s ease-in-out 1.2s infinite;
      }
      .tz-mansion-camera{
        position:absolute;
        inset:0;
        perspective:900px;
        transform-style:preserve-3d;
        animation:tzMansionTour 12s cubic-bezier(.2,.76,.18,1) infinite;
      }
      .tz-mansion-estate{
        position:absolute;
        left:50%;
        top:28%;
        width:min(80%, 760px);
        height:270px;
        transform:translateX(-50%) rotateY(-23deg) translateZ(-80px);
        transform-style:preserve-3d;
        filter:drop-shadow(0 32px 48px rgba(0,0,0,.56));
      }
      .tz-mansion-core,
      .tz-mansion-wing,
      .tz-mansion-roof,
      .tz-mansion-door,
      .tz-mansion-window{
        position:absolute;
        display:block;
      }
      .tz-mansion-core{
        left:30%;
        right:30%;
        bottom:30px;
        height:168px;
        border-radius:18px 18px 10px 10px;
        background:linear-gradient(110deg,#edf6ff,#8ea9c3 42%,#20334c 100%);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.88), inset -26px 0 44px rgba(17,35,58,.42);
      }
      .tz-mansion-wing{
        bottom:30px;
        width:32%;
        height:126px;
        border-radius:15px 15px 9px 9px;
        background:linear-gradient(105deg,#dcefff,#7e9dbb 52%,#182a43 100%);
      }
      .tz-wing-left{left:2%;transform:rotateY(16deg)}
      .tz-wing-right{right:2%;transform:rotateY(-16deg)}
      .tz-mansion-roof{
        left:25%;
        right:25%;
        bottom:192px;
        height:56px;
        clip-path:polygon(50% 0,100% 100%,0 100%);
        background:linear-gradient(140deg,#ffffff,#98b6d8 48%,#263956);
      }
      .tz-mansion-door{
        left:45%;
        bottom:30px;
        width:10%;
        height:86px;
        border-radius:999px 999px 5px 5px;
        background:linear-gradient(180deg,#08111f,#02050b);
        box-shadow:0 0 34px rgba(102,191,255,.35), inset 0 0 0 2px rgba(255,255,255,.20);
      }
      .tz-mansion-window{
        width:42px;
        height:54px;
        border-radius:999px 999px 8px 8px;
        background:linear-gradient(180deg,rgba(255,249,205,.96),rgba(92,189,255,.44));
        box-shadow:0 0 24px rgba(255,232,145,.34), inset 0 0 0 2px rgba(255,255,255,.36);
      }
      .tz-mansion-window.w1{left:15%;bottom:86px}.tz-mansion-window.w2{left:35%;bottom:112px}.tz-mansion-window.w3{right:35%;bottom:112px}.tz-mansion-window.w4{right:15%;bottom:86px}
      .tz-mansion-drive{
        position:absolute;
        left:50%;
        bottom:-40px;
        width:64%;
        height:360px;
        transform:translateX(-50%) rotateX(70deg);
        transform-origin:bottom;
        border-radius:999px 999px 0 0;
        background:linear-gradient(180deg,rgba(218,235,255,.28),rgba(86,112,150,.18),rgba(0,0,0,.92));
        box-shadow:0 -18px 60px rgba(90,176,255,.20);
      }
      .tz-mansion-interior{
        position:absolute;
        inset:0;
        opacity:0;
        transform:translateZ(120px) scale(1.1);
        animation:tzInteriorReveal 12s cubic-bezier(.2,.76,.18,1) infinite;
        background:
          radial-gradient(420px 220px at 50% 16%, rgba(255,236,184,.26), transparent 58%),
          linear-gradient(90deg,rgba(255,255,255,.08),transparent 16%,transparent 84%,rgba(255,255,255,.08)),
          linear-gradient(180deg,#121a26,#03050a);
      }
      .tz-interior-arch{position:absolute;left:18%;right:18%;top:12%;height:58%;border-radius:999px 999px 30px 30px;border:2px solid rgba(219,237,255,.24);box-shadow:0 0 60px rgba(110,190,255,.12) inset}
      .tz-interior-chandelier{position:absolute;left:50%;top:13%;width:106px;height:106px;border-radius:999px;transform:translateX(-50%);background:radial-gradient(circle,#fff6d8,rgba(255,208,107,.26) 40%,transparent 70%);filter:blur(.2px);box-shadow:0 0 60px rgba(255,215,135,.44)}
      .tz-interior-stair{position:absolute;bottom:18%;width:35%;height:38%;border-top:2px solid rgba(255,255,255,.22);background:repeating-linear-gradient(180deg,rgba(255,255,255,.13) 0 6px,transparent 6px 18px)}
      .tz-interior-stair.left{left:10%;transform:skewY(-14deg)}.tz-interior-stair.right{right:10%;transform:skewY(14deg)}
      .tz-interior-runway{position:absolute;left:44%;right:44%;bottom:-8%;height:58%;background:linear-gradient(180deg,rgba(255,236,189,.32),rgba(47,118,255,.10),transparent);transform:perspective(260px) rotateX(62deg);transform-origin:bottom}
      .tz-identity-tour-copy{
        position:absolute;
        z-index:3;
        left:24px;
        right:24px;
        bottom:22px;
        display:grid;
        gap:6px;
        text-shadow:0 10px 28px rgba(0,0,0,.72);
      }
      .tz-identity-tour-copy span{
        color:rgba(204,230,255,.72);
        font-size:11px;
        font-weight:950;
        letter-spacing:.22em;
        text-transform:uppercase;
      }
      .tz-identity-tour-copy strong{
        color:#fff;
        font-size:clamp(34px,8vw,72px);
        line-height:.9;
        letter-spacing:0;
      }
      .tz-identity-tour-copy em{
        color:rgba(255,255,255,.66);
        font-style:normal;
        font-size:13px;
        font-weight:850;
      }
      @keyframes tzMansionTour{
        0%,14%{transform:translateX(22%) scale(.92) rotateY(-10deg)}
        42%{transform:translateX(0) scale(1.08) rotateY(0deg)}
        68%,100%{transform:translateY(-3%) scale(1.34) rotateY(0deg)}
      }
      @keyframes tzInteriorReveal{
        0%,48%{opacity:0;transform:translateZ(90px) scale(1.18)}
        60%,100%{opacity:1;transform:translateZ(170px) scale(1)}
      }
      @keyframes tzMansionGleam{
        0%,38%{transform:translateX(-120%)}
        62%,100%{transform:translateX(120%)}
      }
      @media(max-width:560px){
        .tz-identity-tour-section{min-height:690px}
        .tz-mansion-estate{top:24%;width:92%;height:235px}
        .tz-mansion-window{width:28px;height:42px}
        .tz-identity-tour-copy{left:18px;right:18px;bottom:18px}
      }

            /* End premium edit profile rebuild polish */

      

      /* Public profile top card premium match */
      .profile-showcase:not(.is-weather-live):not(.is-event-selected){
        position:relative;
        isolation:isolate;
        min-height:346px;
        padding:32px;
        border-radius:36px;
        border-color:rgba(133,205,255,.19) !important;
        background:
          radial-gradient(620px 330px at 76% 15%, rgba(93,180,255,.16), transparent 56%),
          radial-gradient(420px 240px at 18% 6%, rgba(255,255,255,.055), transparent 54%),
          linear-gradient(180deg, rgba(13,17,26,.96), rgba(2,3,7,1)) !important;
        box-shadow:
          0 24px 70px rgba(0,0,0,.54),
          0 0 0 1px rgba(255,255,255,.035) inset,
          0 0 42px rgba(72,162,255,.08) !important;
        backdrop-filter:blur(10px) saturate(1.08);
      }

      .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-bg{
        border-radius:36px;
        opacity:.98;
        background:
          radial-gradient(340px 210px at 72% 20%, rgba(210,240,255,.13), transparent 62%),
          radial-gradient(470px 250px at 28% 0%, rgba(83,178,255,.16), transparent 58%),
          linear-gradient(125deg, rgba(255,255,255,.035), transparent 34%),
          repeating-radial-gradient(circle at 18% 16%, rgba(255,255,255,.05) 0 1px, transparent 1px 13px) !important;
        mix-blend-mode:screen;
      }

      .profile-showcase:not(.is-weather-live):not(.is-event-selected)::before{
        opacity:.055;
        background-image:radial-gradient(rgba(255,255,255,.95) .65px, transparent .65px);
        background-size:12px 12px;
      }

      .profile-showcase:not(.is-weather-live):not(.is-event-selected)::after{
        inset:1px;
        border-radius:35px;
        opacity:1;
        background:
          linear-gradient(180deg, rgba(255,255,255,.032), transparent 32%, rgba(0,0,0,.20)),
          radial-gradient(520px 210px at 74% 10%, rgba(126,205,255,.075), transparent 62%) !important;
      }

      .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-top{
        min-height:282px;
        align-items:flex-end;
        gap:24px;
      }

      .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-avatar-wrap{
        width:138px;
        height:138px;
        align-self:flex-start;
      }

      .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-avatar{
        width:138px;
        height:138px;
        border-radius:28px;
        border-color:rgba(126,205,255,.72) !important;
        background:
          radial-gradient(circle at 50% 0%, rgba(130,200,255,.14), transparent 55%),
          linear-gradient(180deg,#182235,#0b0f17) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.08),
          0 0 0 1px rgba(255,255,255,.025),
          0 0 28px rgba(87,170,255,.28),
          0 0 52px rgba(48,110,255,.18),
          0 16px 34px rgba(0,0,0,.30) !important;
      }

      .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-avatar-wrap::before{
        inset:-13px;
        border-radius:38px;
        opacity:.88 !important;
        filter:blur(12px) !important;
        background:
          radial-gradient(circle at 45% 24%, rgba(118,202,255,.55), transparent 60%),
          linear-gradient(180deg, rgba(115,194,255,.42), rgba(55,108,210,.16)) !important;
      }

      .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-avatar-wrap::after{
        inset:-24px;
        border-radius:46px;
        opacity:.52 !important;
        filter:blur(22px) !important;
        background:radial-gradient(circle at 50% 45%, rgba(85,179,255,.46), transparent 64%) !important;
      }

      .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-main{
        padding-bottom:8px;
      }

      .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-name{
        font-size:clamp(44px, 7.8vw, 72px);
        line-height:.95;
        letter-spacing:0;
        color:#fff;
        text-shadow:0 12px 30px rgba(0,0,0,.44);
      }

      .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-handle{
        margin-top:14px;
        color:rgba(225,238,255,.82);
        font-size:clamp(24px, 4vw, 34px);
        line-height:1.08;
        text-shadow:0 8px 22px rgba(0,0,0,.32);
      }

      .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-actions{
        margin-top:22px;
        gap:12px;
      }

      .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-pill-btn,
      .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-actions .btn,
      .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-actions form .btn{
        min-height:56px;
        padding:0 24px;
        border-radius:22px;
        border-color:rgba(255,255,255,.13) !important;
        background:rgba(255,255,255,.065) !important;
        backdrop-filter:blur(16px) saturate(1.1);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.08),
          0 12px 26px rgba(0,0,0,.20) !important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected),
      .profile-showcase.is-secondary-dim:not(.is-event-selected){
        min-height:0;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-top,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-top{
        min-height:0;
      }

      @media(max-width:700px){
        .profile-showcase:not(.is-weather-live):not(.is-event-selected){
          min-height:390px;
          padding:22px;
          border-radius:30px;
        }

        .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-bg{
          border-radius:30px;
        }

        .profile-showcase:not(.is-weather-live):not(.is-event-selected)::after{
          border-radius:29px;
        }

        .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-top{
          min-height:344px;
          gap:16px;
        }

        .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-avatar-wrap,
        .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-avatar{
          width:96px;
          height:96px;
          border-radius:23px;
        }

        .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-name{
          font-size:42px;
          line-height:.98;
        }

        .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-handle{
          font-size:24px;
          margin-top:10px;
        }

        .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-actions{
          margin-top:18px;
          gap:9px;
        }

        .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-pill-btn,
        .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-actions .btn,
        .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-actions form .btn{
          min-height:48px;
          padding:0 18px;
          border-radius:18px;
        }
      }

      

      /* Compact profile top card premium finish */
      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected),
      .profile-showcase.is-secondary-dim:not(.is-event-selected){
        padding:14px !important;
        border-radius:28px !important;
        border-color:rgba(133,205,255,.22) !important;
        background:
          radial-gradient(460px 150px at 74% 18%, rgba(210,240,255,.13), transparent 62%),
          radial-gradient(380px 150px at 18% 8%, rgba(83,178,255,.16), transparent 58%),
          linear-gradient(180deg, rgba(13,17,26,.96), rgba(2,3,7,1)) !important;
        box-shadow:
          0 18px 48px rgba(0,0,0,.44),
          0 0 0 1px rgba(255,255,255,.035) inset,
          0 0 34px rgba(72,162,255,.10) !important;
        backdrop-filter:blur(10px) saturate(1.08);
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected)::before,
      .profile-showcase.is-secondary-dim:not(.is-event-selected)::before{
        opacity:.055 !important;
        background-image:radial-gradient(rgba(255,255,255,.95) .6px, transparent .6px) !important;
        background-size:12px 12px !important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected)::after,
      .profile-showcase.is-secondary-dim:not(.is-event-selected)::after{
        inset:1px !important;
        border-radius:27px !important;
        opacity:.95 !important;
        background:
          linear-gradient(180deg, rgba(255,255,255,.038), transparent 40%, rgba(0,0,0,.18)),
          radial-gradient(440px 150px at 74% 10%, rgba(126,205,255,.075), transparent 62%) !important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-bg,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-bg{
        border-radius:28px !important;
        opacity:.98 !important;
        background:
          radial-gradient(340px 150px at 72% 20%, rgba(210,240,255,.13), transparent 62%),
          radial-gradient(360px 140px at 28% 0%, rgba(83,178,255,.16), transparent 58%),
          linear-gradient(125deg, rgba(255,255,255,.035), transparent 34%),
          repeating-radial-gradient(circle at 18% 16%, rgba(255,255,255,.05) 0 1px, transparent 1px 13px) !important;
        mix-blend-mode:screen;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-top,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-top{
        min-height:70px !important;
        align-items:center !important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar-wrap,
      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar-wrap,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar{
        width:70px !important;
        height:70px !important;
        border-radius:20px !important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar{
        border-color:rgba(126,205,255,.72) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.08),
          0 0 0 1px rgba(255,255,255,.025),
          0 0 22px rgba(87,170,255,.26),
          0 0 42px rgba(48,110,255,.16),
          0 12px 26px rgba(0,0,0,.26) !important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar-wrap::before,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar-wrap::before{
        inset:-8px !important;
        border-radius:26px !important;
        opacity:.78 !important;
        filter:blur(10px) !important;
        background:
          radial-gradient(circle at 45% 24%, rgba(118,202,255,.52), transparent 60%),
          linear-gradient(180deg, rgba(115,194,255,.38), rgba(55,108,210,.14)) !important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar-wrap::after,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar-wrap::after{
        inset:-15px !important;
        border-radius:32px !important;
        opacity:.46 !important;
        filter:blur(18px) !important;
        background:radial-gradient(circle at 50% 45%, rgba(85,179,255,.42), transparent 64%) !important;
      }

      @media(max-width:700px){
        .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected),
        .profile-showcase.is-secondary-dim:not(.is-event-selected){
          padding:10px !important;
          border-radius:24px !important;
        }

        .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected)::after,
        .profile-showcase.is-secondary-dim:not(.is-event-selected)::after,
        .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-bg,
        .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-bg{
          border-radius:24px !important;
        }

        .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-top,
        .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-top{
          min-height:48px !important;
        }

        .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar-wrap,
        .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar,
        .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar-wrap,
        .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar{
          width:48px !important;
          height:48px !important;
          border-radius:15px !important;
        }
      }

      

      /* Clean compact profile edge glow */
      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected),
      .profile-showcase.is-secondary-dim:not(.is-event-selected){
        overflow:hidden !important;
        contain:paint;
        box-shadow:
          0 12px 30px rgba(0,0,0,.36),
          0 0 0 1px rgba(255,255,255,.035) inset !important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar-wrap,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar-wrap{
        overflow:visible;
        z-index:3 !important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar-wrap::before,
      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar-wrap::after,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar-wrap::before,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar-wrap::after{
        opacity:.26 !important;
        filter:blur(8px) !important;
        inset:-5px !important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar{
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.08),
          0 0 0 1px rgba(255,255,255,.025),
          0 0 14px rgba(87,170,255,.18),
          0 8px 18px rgba(0,0,0,.24) !important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected)::after,
      .profile-showcase.is-secondary-dim:not(.is-event-selected)::after{
        opacity:.74 !important;
      }

      @media(max-width:700px){
        .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected),
        .profile-showcase.is-secondary-dim:not(.is-event-selected){
          box-shadow:
            0 8px 22px rgba(0,0,0,.32),
            0 0 0 1px rgba(255,255,255,.035) inset !important;
        }
      }

      /* End clean compact profile edge glow */
/* End compact profile top card premium finish */


      /* Public profile hero buttons match edit hero */
      .profile-showcase:not(.is-event-selected) .profile-showcase-secondary,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions .profile-pill-btn,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions form .btn{
        position:relative;
        overflow:hidden;
        min-height:56px;
        border-radius:23px;
        padding:0 24px;
        border:1px solid rgba(255,255,255,.16) !important;
        background:
          linear-gradient(180deg, rgba(255,255,255,.105), rgba(255,255,255,.035)),
          rgba(8,12,18,.72) !important;
        color:#fff !important;
        font-size:18px;
        font-weight:950;
        letter-spacing:0;
        text-shadow:0 1px 10px rgba(0,0,0,.32);
        backdrop-filter:blur(18px) saturate(1.12);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.16),
          inset 0 -1px 0 rgba(255,255,255,.04),
          0 15px 30px rgba(0,0,0,.28),
          0 0 0 1px rgba(126,205,255,.045) !important;
      }

      .profile-showcase:not(.is-event-selected) .profile-showcase-secondary::before,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions .profile-pill-btn::before,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions form .btn::before{
        content:"";
        position:absolute;
        inset:0;
        border-radius:inherit;
        pointer-events:none;
        background:
          radial-gradient(120px 42px at 50% 0%, rgba(255,255,255,.18), transparent 70%),
          linear-gradient(180deg, rgba(255,255,255,.08), transparent 44%);
        opacity:.72;
      }

      .profile-showcase:not(.is-event-selected) .profile-showcase-secondary::after,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions .profile-pill-btn::after,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions form .btn::after{
        content:"";
        position:absolute;
        left:14%;
        right:14%;
        bottom:-1px;
        height:1px;
        border-radius:999px;
        pointer-events:none;
        background:linear-gradient(90deg, transparent, rgba(126,205,255,.42), transparent);
        opacity:.86;
      }

      .profile-showcase:not(.is-event-selected) .profile-showcase-secondary:hover,
      .profile-showcase:not(.is-event-selected) .profile-showcase-secondary:focus-visible,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions .profile-pill-btn:hover,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions .profile-pill-btn:focus-visible,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions form .btn:hover,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions form .btn:focus-visible{
        transform:translateY(-1px);
        border-color:rgba(150,220,255,.42) !important;
        background:
          radial-gradient(circle at 50% 0%, rgba(126,205,255,.14), transparent 58%),
          linear-gradient(180deg, rgba(255,255,255,.13), rgba(255,255,255,.045)),
          rgba(8,12,18,.76) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.20),
          inset 0 -1px 0 rgba(255,255,255,.05),
          0 0 22px rgba(87,170,255,.18),
          0 16px 32px rgba(0,0,0,.30) !important;
      }

      .profile-showcase:not(.is-event-selected) .profile-showcase-secondary:active,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions .profile-pill-btn:active,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions form .btn:active{
        transform:scale(.985);
      }

      @media(max-width:700px){
        .profile-showcase:not(.is-event-selected) .profile-showcase-secondary,
        .profile-showcase:not(.is-event-selected) .profile-showcase-actions .profile-pill-btn,
        .profile-showcase:not(.is-event-selected) .profile-showcase-actions form .btn{
          min-height:48px;
          border-radius:18px;
          padding:0 18px;
          font-size:15px;
        }
      }

      

      /* Exact edit hero button match for public profile */
      .profile-showcase:not(.is-event-selected) .profile-showcase-secondary,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions .profile-pill-btn,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions form .btn{
        position:relative !important;
        overflow:hidden !important;
        min-height:48px !important;
        border-radius:18px !important;
        padding:0 20px !important;
        border:1px solid rgba(255,255,255,.20) !important;
        background:rgba(10,38,66,.38) !important;
        color:#fff !important;
        font-size:16px !important;
        font-weight:950 !important;
        letter-spacing:0 !important;
        text-shadow:none !important;
        backdrop-filter:blur(18px) saturate(1.15) !important;
        -webkit-backdrop-filter:blur(18px) saturate(1.15) !important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.14), 0 12px 26px rgba(0,0,0,.20) !important;
      }

      .profile-showcase:not(.is-event-selected) .profile-showcase-secondary::before,
      .profile-showcase:not(.is-event-selected) .profile-showcase-secondary::after,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions .profile-pill-btn::before,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions .profile-pill-btn::after,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions form .btn::before,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions form .btn::after{
        content:none !important;
        display:none !important;
      }

      .profile-showcase:not(.is-event-selected) .profile-showcase-secondary:hover,
      .profile-showcase:not(.is-event-selected) .profile-showcase-secondary:focus-visible,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions .profile-pill-btn:hover,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions .profile-pill-btn:focus-visible,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions form .btn:hover,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions form .btn:focus-visible{
        transform:translateY(-1px) !important;
        border-color:rgba(115,194,255,.92) !important;
        background:
          radial-gradient(circle at 50% 0%, rgba(115,194,255,.18), transparent 56%),
          rgba(10,38,66,.38) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.14),
          0 0 18px rgba(87,170,255,.30),
          0 0 46px rgba(48,110,255,.22),
          0 12px 26px rgba(0,0,0,.20) !important;
      }

      @media(max-width:700px){
        .profile-showcase:not(.is-event-selected) .profile-showcase-secondary,
        .profile-showcase:not(.is-event-selected) .profile-showcase-actions .profile-pill-btn,
        .profile-showcase:not(.is-event-selected) .profile-showcase-actions form .btn{
          min-height:48px !important;
          border-radius:18px !important;
          padding:0 18px !important;
          font-size:15px !important;
        }
      }

      

      /* Always-on profile hero button glow */
      .profile-showcase:not(.is-event-selected) .profile-showcase-secondary,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions .profile-pill-btn,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions form .btn{
        border-color:rgba(115,194,255,.92) !important;
        background:
          radial-gradient(circle at 50% 0%, rgba(115,194,255,.18), transparent 56%),
          rgba(10,38,66,.38) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.14),
          0 0 18px rgba(87,170,255,.30),
          0 0 46px rgba(48,110,255,.22),
          0 12px 26px rgba(0,0,0,.20) !important;
      }

      .profile-showcase:not(.is-event-selected) .profile-showcase-secondary:hover,
      .profile-showcase:not(.is-event-selected) .profile-showcase-secondary:focus-visible,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions .profile-pill-btn:hover,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions .profile-pill-btn:focus-visible,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions form .btn:hover,
      .profile-showcase:not(.is-event-selected) .profile-showcase-actions form .btn:focus-visible{
        border-color:rgba(150,224,255,.98) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.18),
          0 0 22px rgba(87,170,255,.36),
          0 0 52px rgba(48,110,255,.26),
          0 12px 26px rgba(0,0,0,.20) !important;
      }

      /* End always-on profile hero button glow */
/* End exact edit hero button match for public profile */
/* End public profile hero buttons match edit hero */





      /* Profile name descender guard */
      .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-name{
        line-height:1.08;
        padding-bottom:2px;
      }

      @media(max-width:700px){
        .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-name{
          line-height:1.08;
          padding-bottom:2px;
        }
      }

      /* End profile name descender guard */
/* End public profile top card premium match */
/* Final weather polish: keep effects behind identity and make conditions visibly alive. */
      .profile-showcase.is-weather-live{isolation:isolate!important;overflow:hidden!important;contain:paint;}
      .profile-showcase.is-weather-live .profile-showcase-bg{z-index:0!important;}
      .profile-showcase.is-weather-live .profile-weather-scene{z-index:1!important;pointer-events:none!important;mix-blend-mode:normal!important;opacity:.95!important;}
      .profile-showcase.is-weather-live .profile-showcase-top{position:relative!important;z-index:4!important;isolation:isolate!important;transform:translateZ(0);}
      .profile-showcase.is-weather-live .profile-showcase-main{position:relative!important;z-index:6!important;isolation:isolate!important;}
      .profile-showcase.is-weather-live .profile-showcase-main::before,
      .profile-showcase.is-weather-live .profile-showcase-main::after{z-index:-1!important;pointer-events:none!important;opacity:.38!important;}
      .profile-showcase.is-weather-live .profile-showcase-name,
      .profile-showcase.is-weather-live .profile-showcase-handle,
      .profile-showcase.is-weather-live .profile-showcase-actions{position:relative!important;z-index:7!important;transform:translateZ(0);}
      .profile-showcase.weather-rain .profile-weather-rain{opacity:.82!important;background-size:12px 28px!important;animation:profileWeatherRain .34s linear infinite!important;}
      .profile-showcase.weather-storm .profile-weather-rain{opacity:.96!important;background-size:13px 26px!important;animation:profileWeatherRain .22s linear infinite!important;}
      .profile-showcase.weather-snow .profile-weather-snow{opacity:.92!important;animation:profileWeatherSnow 4.4s linear infinite!important;}
      .profile-showcase.weather-cloudy .profile-weather-cloud,
      .profile-showcase.weather-fog .profile-weather-cloud{opacity:.88!important;filter:blur(13px)!important;animation-duration:15s!important;}
      .profile-showcase.weather-sunny .profile-weather-sun,
      .profile-showcase.weather-clear .profile-weather-sun{opacity:1!important;width:245px!important;height:245px!important;filter:blur(8px) saturate(1.25)!important;animation:profileWeatherSun 4.8s ease-in-out infinite alternate!important;}
      .profile-showcase.weather-sunny .profile-weather-wisp,
      .profile-showcase.weather-clear .profile-weather-wisp{opacity:.76!important;animation-duration:16s!important;}
      .profile-showcase.weather-storm .profile-weather-scene::after{
        content:""!important;position:absolute!important;inset:-12%!important;opacity:0;pointer-events:none!important;
        background:linear-gradient(112deg,transparent 0 41%,rgba(255,255,255,.98) 46%,rgba(178,226,255,.74) 48%,transparent 55%),radial-gradient(circle at 68% 24%,rgba(255,255,255,.92),transparent 23%)!important;
        mix-blend-mode:screen!important;animation:profileWeatherLightningStrong 2.6s steps(1,end) infinite!important;
      }
      @keyframes profileWeatherLightningStrong{0%,62%,100%{opacity:0}64%{opacity:.98}66%{opacity:.14}68%{opacity:.88}73%{opacity:0}}
      .profile-showcase.is-weather-live .profile-showcase-top > *{position:relative!important;z-index:7!important;}
      .profile-showcase.is-weather-live .profile-avatar,
      .profile-showcase.is-weather-live .profile-showcase-avatar,
      .profile-showcase.is-weather-live img{transform:translateZ(0);}
      .profile-showcase.is-weather-live .profile-weather-scene::before{z-index:0!important;opacity:.72!important;}
      .profile-showcase.weather-rain .profile-weather-rain,
      .profile-showcase.weather-storm .profile-weather-rain{filter:drop-shadow(0 0 8px rgba(180,225,255,.36))!important;}
      .profile-showcase.weather-cloudy .profile-weather-wisp,
      .profile-showcase.weather-fog .profile-weather-wisp{opacity:.86!important;animation-duration:13s!important;}



      

      /* Live wallpaper weather upgrade */
      .profile-showcase.is-weather-live{
        border-color:rgba(150,220,255,.24)!important;
        box-shadow:0 18px 48px rgba(0,0,0,.38),0 0 0 1px rgba(255,255,255,.04) inset!important;
      }
      .profile-showcase.is-weather-live .profile-showcase-bg{transition:background 600ms ease,filter 600ms ease,opacity 600ms ease!important;}
      .profile-showcase.weather-night{border-color:rgba(126,170,255,.20)!important;background:#03050b!important;box-shadow:0 22px 58px rgba(0,0,0,.50),0 0 0 1px rgba(180,216,255,.035) inset!important;}
      .profile-showcase.weather-night .profile-showcase-bg,
      .profile-showcase.weather-night.weather-sunny .profile-showcase-bg,
      .profile-showcase.weather-night.weather-clear .profile-showcase-bg,
      .profile-showcase.weather-night.weather-cloudy .profile-showcase-bg,
      .profile-showcase.weather-night.weather-fog .profile-showcase-bg,
      .profile-showcase.weather-night.weather-rain .profile-showcase-bg,
      .profile-showcase.weather-night.weather-storm .profile-showcase-bg,
      .profile-showcase.weather-night.weather-snow .profile-showcase-bg{
        opacity:1!important;filter:saturate(1.08) contrast(1.05)!important;
        background:radial-gradient(circle at 74% 18%,rgba(218,238,255,.36) 0 3%,rgba(155,190,255,.12) 8%,transparent 20%),radial-gradient(ellipse at 62% 30%,rgba(69,107,190,.24),transparent 46%),radial-gradient(ellipse at 20% 8%,rgba(89,165,255,.14),transparent 44%),linear-gradient(180deg,#101a32 0%,#071022 48%,#02040a 100%)!important;
      }
      .profile-showcase.weather-night .profile-weather-scene::before{
        content:""!important;position:absolute!important;inset:0!important;opacity:.72!important;
        background-image:radial-gradient(circle at 12% 18%,rgba(255,255,255,.88) 0 1px,transparent 1.8px),radial-gradient(circle at 28% 34%,rgba(255,255,255,.56) 0 1px,transparent 1.8px),radial-gradient(circle at 48% 14%,rgba(255,255,255,.72) 0 1px,transparent 1.8px),radial-gradient(circle at 68% 38%,rgba(255,255,255,.44) 0 1px,transparent 1.8px),radial-gradient(circle at 86% 22%,rgba(255,255,255,.62) 0 1px,transparent 1.8px),radial-gradient(circle at 36% 72%,rgba(255,255,255,.42) 0 1px,transparent 1.8px)!important;
        background-size:220px 150px,260px 190px,300px 210px,240px 170px,280px 200px,250px 180px!important;
        animation:profileWeatherStars 9s ease-in-out infinite alternate!important;mix-blend-mode:screen!important;z-index:1!important;
      }
      .profile-showcase.weather-night .profile-weather-scene::after{
        content:""!important;position:absolute!important;inset:-12% -18%!important;opacity:.46!important;pointer-events:none!important;
        background:radial-gradient(ellipse at 64% 18%,rgba(210,230,255,.24),transparent 26%),linear-gradient(118deg,transparent 0 18%,rgba(136,182,255,.08) 34%,transparent 58%)!important;
        animation:profileWeatherAurora 7.5s ease-in-out infinite alternate!important;mix-blend-mode:screen!important;z-index:2!important;
      }
      .profile-showcase.weather-night .profile-weather-sun{
        left:auto!important;right:12%!important;top:9%!important;width:92px!important;height:92px!important;opacity:.95!important;
        background:radial-gradient(circle at 38% 34%,#fff 0 19%,#dcecff 34%,rgba(190,216,255,.34) 54%,transparent 72%)!important;
        filter:blur(.5px) drop-shadow(0 0 18px rgba(200,226,255,.44))!important;animation:profileWeatherMoon 5.6s ease-in-out infinite alternate!important;
      }
      .profile-showcase.weather-night .profile-weather-wisp{opacity:.58!important;background:linear-gradient(90deg,transparent,rgba(182,214,255,.22),rgba(255,255,255,.12),transparent)!important;animation-duration:20s!important;}
      .profile-showcase.weather-night .profile-weather-cloud{opacity:.30!important;filter:blur(16px) saturate(.9)!important;background:radial-gradient(ellipse at center,rgba(170,196,230,.28),transparent 62%)!important;}
      .profile-showcase.weather-night.weather-cloudy .profile-weather-cloud,.profile-showcase.weather-night.weather-fog .profile-weather-cloud{opacity:.72!important;animation-duration:18s!important;}
      .profile-showcase.weather-night.weather-rain .profile-weather-rain,.profile-showcase.weather-night.weather-storm .profile-weather-rain{opacity:.88!important;background-size:11px 25px!important;filter:drop-shadow(0 0 7px rgba(185,225,255,.38))!important;}
      .profile-showcase.weather-night.weather-storm .profile-weather-scene::after{opacity:0;background:linear-gradient(112deg,transparent 0 39%,rgba(255,255,255,.98) 45%,rgba(150,214,255,.70) 48%,transparent 57%),radial-gradient(circle at 66% 20%,rgba(255,255,255,.80),transparent 24%)!important;animation:profileWeatherLightningStrong 2.35s steps(1,end) infinite!important;}
      .profile-showcase.weather-night .profile-weather-label{color:rgba(245,250,255,.92)!important;border-color:rgba(200,226,255,.18)!important;background:rgba(11,18,32,.36)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 10px 24px rgba(0,0,0,.18)!important;}
      .profile-showcase.weather-night .profile-showcase-name,.profile-showcase.weather-night .profile-showcase-handle{color:#fff!important;text-shadow:0 2px 16px rgba(0,0,0,.42),0 0 18px rgba(120,180,255,.12)!important;}
      @keyframes profileWeatherStars{0%{opacity:.50;transform:translate3d(0,0,0)}100%{opacity:.88;transform:translate3d(-10px,5px,0)}}
      @keyframes profileWeatherAurora{0%{opacity:.30;transform:translate3d(-2%,0,0) scale(1)}100%{opacity:.58;transform:translate3d(3%,-2%,0) scale(1.04)}}
      @keyframes profileWeatherMoon{0%{transform:translate3d(0,0,0) scale(.98)}100%{transform:translate3d(-4px,3px,0) scale(1.04)}}
      @media(max-width:700px){.profile-showcase.weather-night .profile-weather-sun{right:8%!important;top:8%!important;width:74px!important;height:74px!important}.profile-showcase.weather-night .profile-weather-scene::after{opacity:.38!important}}
      

      /* Premium daytime live weather upgrade */
      .profile-showcase.is-weather-live:not(.weather-night).weather-sunny,
      .profile-showcase.is-weather-live:not(.weather-night).weather-clear{
        border-color:rgba(203,237,255,.34)!important;
        background:#4aa9e8!important;
        box-shadow:
          0 22px 52px rgba(0,0,0,.30),
          0 0 0 1px rgba(255,255,255,.13) inset,
          0 0 34px rgba(96,194,255,.14)!important;
      }

      .profile-showcase.is-weather-live:not(.weather-night).weather-sunny .profile-showcase-bg,
      .profile-showcase.is-weather-live:not(.weather-night).weather-clear .profile-showcase-bg{
        opacity:1!important;
        filter:saturate(1.16) contrast(1.02)!important;
        background:
          radial-gradient(circle at 52% 8%, rgba(255,255,255,.98) 0 5%, rgba(255,250,215,.70) 10%, rgba(255,232,145,.18) 24%, transparent 38%),
          radial-gradient(ellipse at 68% 34%, rgba(255,255,255,.34), transparent 38%),
          radial-gradient(ellipse at 20% 18%, rgba(190,236,255,.42), transparent 46%),
          linear-gradient(180deg, #bdeeff 0%, #71c7f5 42%, #2e8dcc 100%)!important;
      }

      .profile-showcase.is-weather-live:not(.weather-night).weather-sunny .profile-weather-scene::before,
      .profile-showcase.is-weather-live:not(.weather-night).weather-clear .profile-weather-scene::before{
        content:""!important;
        position:absolute!important;
        inset:-18% -12%!important;
        opacity:.66!important;
        pointer-events:none!important;
        z-index:1!important;
        background:
          linear-gradient(112deg, transparent 0 18%, rgba(255,255,255,.30) 34%, transparent 56%),
          linear-gradient(78deg, transparent 0 36%, rgba(255,247,208,.18) 47%, transparent 66%)!important;
        mix-blend-mode:screen!important;
        animation:profileWeatherDayRays 8s ease-in-out infinite alternate!important;
      }

      .profile-showcase.is-weather-live:not(.weather-night).weather-sunny .profile-weather-scene::after,
      .profile-showcase.is-weather-live:not(.weather-night).weather-clear .profile-weather-scene::after{
        content:""!important;
        position:absolute!important;
        inset:-8% -16%!important;
        opacity:.58!important;
        pointer-events:none!important;
        z-index:2!important;
        background:
          radial-gradient(ellipse at 16% 74%, rgba(255,255,255,.48), transparent 28%),
          radial-gradient(ellipse at 52% 68%, rgba(255,255,255,.30), transparent 34%),
          radial-gradient(ellipse at 88% 78%, rgba(255,255,255,.40), transparent 30%)!important;
        filter:blur(13px)!important;
        animation:profileWeatherDayCloudBank 18s linear infinite!important;
      }

      .profile-showcase.is-weather-live:not(.weather-night).weather-sunny .profile-weather-sun,
      .profile-showcase.is-weather-live:not(.weather-night).weather-clear .profile-weather-sun{
        left:38%!important;
        top:-24%!important;
        width:260px!important;
        height:260px!important;
        opacity:1!important;
        background:
          radial-gradient(circle, rgba(255,255,255,1) 0 12%, rgba(255,252,221,.88) 18%, rgba(255,230,144,.30) 36%, rgba(115,208,255,.16) 56%, transparent 74%)!important;
        filter:blur(4px) saturate(1.18)!important;
        animation:profileWeatherDaySun 5.5s ease-in-out infinite alternate!important;
        mix-blend-mode:screen!important;
      }

      .profile-showcase.is-weather-live:not(.weather-night).weather-sunny .profile-weather-wisp,
      .profile-showcase.is-weather-live:not(.weather-night).weather-clear .profile-weather-wisp{
        opacity:.74!important;
        height:82px!important;
        background:linear-gradient(90deg, transparent, rgba(255,255,255,.38), rgba(205,241,255,.22), transparent)!important;
        filter:blur(14px)!important;
        animation-duration:18s!important;
        mix-blend-mode:screen!important;
      }

      .profile-showcase.is-weather-live:not(.weather-night).weather-sunny .profile-weather-cloud,
      .profile-showcase.is-weather-live:not(.weather-night).weather-clear .profile-weather-cloud{
        opacity:.52!important;
        filter:blur(15px) saturate(1.08)!important;
        background:radial-gradient(ellipse at center, rgba(255,255,255,.46), rgba(210,240,255,.20) 44%, transparent 68%)!important;
        animation-duration:20s!important;
      }

      .profile-showcase.is-weather-live:not(.weather-night).weather-sunny .profile-weather-lens,
      .profile-showcase.is-weather-live:not(.weather-night).weather-clear .profile-weather-lens{
        opacity:.28!important;
        background:radial-gradient(circle, rgba(255,255,255,.42), rgba(150,220,255,.14) 48%, transparent 72%)!important;
        animation:profileWeatherLens 6.5s ease-in-out infinite alternate!important;
      }

      .profile-showcase.is-weather-live:not(.weather-night).weather-cloudy .profile-showcase-bg,
      .profile-showcase.is-weather-live:not(.weather-night).weather-fog .profile-showcase-bg{
        background:
          radial-gradient(circle at 55% 6%, rgba(255,255,255,.56), rgba(255,250,215,.18) 18%, transparent 34%),
          radial-gradient(ellipse at 24% 20%, rgba(225,242,255,.36), transparent 44%),
          linear-gradient(180deg, #9ecdeb 0%, #6aa8d0 48%, #385d82 100%)!important;
      }

      .profile-showcase.is-weather-live:not(.weather-night).weather-rain .profile-showcase-bg,
      .profile-showcase.is-weather-live:not(.weather-night).weather-storm .profile-showcase-bg{
        background:
          radial-gradient(circle at 58% 8%, rgba(255,255,255,.36), rgba(210,230,255,.12) 20%, transparent 34%),
          radial-gradient(ellipse at 20% 18%, rgba(195,225,245,.24), transparent 44%),
          linear-gradient(180deg, #7f9fba 0%, #536b82 48%, #1a2434 100%)!important;
      }

      .profile-showcase.is-weather-live:not(.weather-night) .profile-weather-label{
        color:rgba(255,255,255,.94)!important;
        border-color:rgba(255,255,255,.20)!important;
        background:rgba(54,105,145,.30)!important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.16), 0 10px 24px rgba(0,0,0,.10)!important;
      }

      .profile-showcase.is-weather-live:not(.weather-night) .profile-showcase-name,
      .profile-showcase.is-weather-live:not(.weather-night) .profile-showcase-handle{
        text-shadow:0 2px 18px rgba(31,83,126,.32), 0 1px 2px rgba(0,0,0,.20)!important;
      }

      @keyframes profileWeatherDaySun{0%{transform:translate3d(-6px,0,0) scale(.98)}100%{transform:translate3d(5px,4px,0) scale(1.05)}}
      @keyframes profileWeatherDayRays{0%{opacity:.42;transform:translate3d(-2%,0,0) rotate(-1deg)}100%{opacity:.78;transform:translate3d(2%,-2%,0) rotate(1deg)}}
      @keyframes profileWeatherDayCloudBank{0%{transform:translate3d(-8%,0,0) scale(1)}100%{transform:translate3d(8%,-1%,0) scale(1.03)}}

      @media(max-width:700px){
        .profile-showcase.is-weather-live:not(.weather-night).weather-sunny .profile-weather-sun,
        .profile-showcase.is-weather-live:not(.weather-night).weather-clear .profile-weather-sun{
          left:34%!important;
          top:-18%!important;
          width:210px!important;
          height:210px!important;
        }
        .profile-showcase.is-weather-live:not(.weather-night).weather-sunny .profile-weather-scene::after,
        .profile-showcase.is-weather-live:not(.weather-night).weather-clear .profile-weather-scene::after{
          opacity:.48!important;
        }
      }

      /* End premium daytime live weather upgrade */
/* End live wallpaper weather upgrade */


      /* Weather compact edge seal and motion boost */
      .profile-showcase.is-weather-live{
        overflow:hidden!important;
        isolation:isolate!important;
        contain:paint!important;
        clip-path:inset(0 round 34px);
      }

      .profile-showcase.is-weather-live .profile-showcase-bg,
      .profile-showcase.is-weather-live .profile-weather-scene{
        inset:0!important;
        border-radius:inherit!important;
        overflow:hidden!important;
        clip-path:inset(0 round inherit);
      }

      .profile-showcase.is-weather-live::before,
      .profile-showcase.is-weather-live::after,
      .profile-showcase.is-weather-live .profile-weather-scene::before,
      .profile-showcase.is-weather-live .profile-weather-scene::after{
        border-radius:inherit!important;
        overflow:hidden!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live,
      .profile-showcase.is-weather-live.is-secondary-dim{
        border-radius:24px!important;
        overflow:hidden!important;
        contain:paint!important;
        clip-path:inset(0 round 24px)!important;
        box-shadow:
          0 10px 26px rgba(0,0,0,.34),
          0 0 0 1px rgba(255,255,255,.035) inset!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live .profile-showcase-bg,
      .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live .profile-weather-scene,
      .profile-showcase.is-weather-live.is-secondary-dim .profile-showcase-bg,
      .profile-showcase.is-weather-live.is-secondary-dim .profile-weather-scene{
        border-radius:24px!important;
        clip-path:inset(0 round 24px)!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live::after,
      .profile-showcase.is-weather-live.is-secondary-dim::after{
        inset:1px!important;
        border-radius:23px!important;
        opacity:.45!important;
        background:
          linear-gradient(180deg, rgba(255,255,255,.065), transparent 46%, rgba(255,255,255,.02)),
          radial-gradient(220px 86px at 78% 28%, rgba(170,215,255,.13), transparent 68%)!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live .profile-weather-sun,
      .profile-showcase.is-weather-live.is-secondary-dim .profile-weather-sun{
        filter:blur(2px) drop-shadow(0 0 12px rgba(200,226,255,.32))!important;
      }

      .profile-showcase.is-weather-live .profile-weather-scene .profile-weather-wisp-a{
        animation:profileWeatherPremiumDriftA 17s ease-in-out infinite alternate!important;
      }

      .profile-showcase.is-weather-live .profile-weather-scene .profile-weather-wisp-b{
        animation:profileWeatherPremiumDriftB 21s ease-in-out infinite alternate!important;
      }

      .profile-showcase.is-weather-live .profile-weather-cloud-a{
        animation:profileWeatherPremiumCloudA 24s ease-in-out infinite alternate!important;
      }

      .profile-showcase.is-weather-live .profile-weather-cloud-b{
        animation:profileWeatherPremiumCloudB 28s ease-in-out infinite alternate!important;
      }

      .profile-showcase.weather-night .profile-weather-lens-a{
        opacity:.20!important;
        animation:profileWeatherNightOrbA 6.8s ease-in-out infinite alternate!important;
      }

      .profile-showcase.weather-night .profile-weather-lens-b{
        opacity:.16!important;
        animation:profileWeatherNightOrbB 8.4s ease-in-out infinite alternate!important;
      }

      .profile-showcase.weather-night .profile-weather-scene::before{
        animation:profileWeatherStars 7s ease-in-out infinite alternate, profileWeatherStarDrift 18s linear infinite!important;
      }

      .profile-showcase.weather-night .profile-weather-scene::after{
        filter:blur(1px)!important;
      }

      .profile-showcase.is-weather-live:not(.weather-night).weather-sunny .profile-weather-scene::after,
      .profile-showcase.is-weather-live:not(.weather-night).weather-clear .profile-weather-scene::after{
        animation:profileWeatherDayCloudBank 14s ease-in-out infinite alternate!important;
      }

      @keyframes profileWeatherPremiumDriftA{0%{transform:translate3d(-7%,1%,0) scale(1)}100%{transform:translate3d(8%,-4%,0) scale(1.05)}}
      @keyframes profileWeatherPremiumDriftB{0%{transform:translate3d(8%,4%,0) scale(1.04)}100%{transform:translate3d(-9%,-2%,0) scale(.98)}}
      @keyframes profileWeatherPremiumCloudA{0%{transform:translate3d(-5%,0,0) scale(1)}100%{transform:translate3d(6%,-3%,0) scale(1.04)}}
      @keyframes profileWeatherPremiumCloudB{0%{transform:translate3d(6%,2%,0) scale(1.02)}100%{transform:translate3d(-7%,-2%,0) scale(1.06)}}
      @keyframes profileWeatherNightOrbA{0%{transform:translate3d(-3px,5px,0) scale(.96);opacity:.14}100%{transform:translate3d(8px,-6px,0) scale(1.08);opacity:.26}}
      @keyframes profileWeatherNightOrbB{0%{transform:translate3d(5px,-2px,0) scale(1);opacity:.10}100%{transform:translate3d(-7px,7px,0) scale(1.14);opacity:.22}}
      @keyframes profileWeatherStarDrift{0%{background-position:0 0,0 0,0 0,0 0,0 0,0 0}100%{background-position:24px -18px,-18px 16px,20px 12px,-20px -14px,18px -16px,-16px 20px}}

      @media(max-width:700px){
        .profile-showcase.is-weather-live{clip-path:inset(0 round 30px);}
        .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live,
        .profile-showcase.is-weather-live.is-secondary-dim{
          border-radius:24px!important;
          clip-path:inset(0 round 24px)!important;
        }
      }

      /* End weather compact edge seal and motion boost */


      /* Final compact profile strip goes black when weather is unavailable */
      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-weather-live):not(.is-event-selected),
      .profile-showcase.is-secondary-dim:not(.is-weather-live):not(.is-event-selected){
        background:#000!important;
        border-color:rgba(255,255,255,.10)!important;
        box-shadow:
          0 10px 24px rgba(0,0,0,.38),
          0 0 0 1px rgba(255,255,255,.035) inset!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-bg,
      .profile-showcase.is-secondary-dim:not(.is-weather-live):not(.is-event-selected) .profile-showcase-bg{
        opacity:0!important;
        background:#000!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-weather-live):not(.is-event-selected)::before,
      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-weather-live):not(.is-event-selected)::after,
      .profile-showcase.is-secondary-dim:not(.is-weather-live):not(.is-event-selected)::before,
      .profile-showcase.is-secondary-dim:not(.is-weather-live):not(.is-event-selected)::after{
        opacity:0!important;
        background:transparent!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-avatar,
      .profile-showcase.is-secondary-dim:not(.is-weather-live):not(.is-event-selected) .profile-showcase-avatar{
        border-color:rgba(126,205,255,.72)!important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.08),
          0 0 0 1px rgba(255,255,255,.025),
          0 0 14px rgba(87,170,255,.16),
          0 8px 18px rgba(0,0,0,.28)!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-avatar-wrap::before,
      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-weather-live):not(.is-event-selected) .profile-showcase-avatar-wrap::after,
      .profile-showcase.is-secondary-dim:not(.is-weather-live):not(.is-event-selected) .profile-showcase-avatar-wrap::before,
      .profile-showcase.is-secondary-dim:not(.is-weather-live):not(.is-event-selected) .profile-showcase-avatar-wrap::after{
        opacity:.18!important;
        filter:blur(7px)!important;
      }

      

      /* Normal compact profile strip subtle blue rim */
      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-weather-live):not(.is-event-selected),
      .profile-showcase.is-secondary-dim:not(.is-weather-live):not(.is-event-selected){
        border-color:rgba(96,188,255,.18)!important;
        box-shadow:
          0 10px 24px rgba(0,0,0,.38),
          0 0 0 1px rgba(118,203,255,.10) inset,
          0 0 18px rgba(74,169,255,.10)!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-weather-live):not(.is-event-selected)::after,
      .profile-showcase.is-secondary-dim:not(.is-weather-live):not(.is-event-selected)::after{
        opacity:.72!important;
        background:
          linear-gradient(180deg, rgba(255,255,255,.018), transparent 46%),
          radial-gradient(240px 68px at 8% 46%, rgba(92,184,255,.12), transparent 72%),
          linear-gradient(90deg, rgba(95,190,255,.14), transparent 18%, transparent 82%, rgba(95,190,255,.08))!important;
      }

      /* End normal compact profile strip subtle blue rim */
/* Compact profile header uses the story feed action rail turned sideways. */
      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected),
      .profile-showcase.is-secondary-dim:not(.is-event-selected){
        min-height:58px!important;
        height:58px!important;
        width:100%!important;
        padding:3px 8px!important;
        border:1px solid rgba(90,190,255,.20)!important;
        border-radius:29px!important;
        background:linear-gradient(90deg,rgba(5,8,14,.16),rgba(5,8,14,.04))!important;
        box-shadow:0 0 0 1px rgba(80,170,255,.08) inset,0 0 18px rgba(70,160,255,.14),0 10px 26px rgba(0,0,0,.22)!important;
        backdrop-filter:blur(10px)!important;
        -webkit-backdrop-filter:blur(10px)!important;
        overflow:visible!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-bg,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-bg,
      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected)::before,
      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected)::after,
      .profile-showcase.is-secondary-dim:not(.is-event-selected)::before,
      .profile-showcase.is-secondary-dim:not(.is-event-selected)::after,
      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-weather-scene,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-weather-scene{
        display:none!important;
        opacity:0!important;
        background:transparent!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-top,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-top{
        display:flex!important;
        flex-direction:row!important;
        align-items:center!important;
        justify-content:flex-start!important;
        gap:10px!important;
        min-height:52px!important;
        height:52px!important;
        width:100%!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-main,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-main{
        display:none!important;
        opacity:0!important;
        pointer-events:none!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar-wrap,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar-wrap{
        position:relative!important;
        width:52px!important;
        height:52px!important;
        flex:0 0 52px!important;
        border-radius:50%!important;
        display:grid!important;
        place-items:center!important;
        transform:translateX(1px)!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar-wrap::before,
      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar-wrap::after,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar-wrap::before,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar-wrap::after{
        content:none!important;
        display:none!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar{
        position:relative!important;
        width:46px!important;
        height:46px!important;
        margin:0!important;
        border:2px solid rgba(255,255,255,.88)!important;
        border-radius:50%!important;
        overflow:visible!important;
        display:grid!important;
        place-items:center!important;
        background:rgba(0,0,0,.4)!important;
        color:#fff!important;
        text-decoration:none!important;
        font-weight:950!important;
        box-shadow:0 12px 26px rgba(0,0,0,.32),0 0 0 1px rgba(255,255,255,.18) inset,0 0 12px rgba(255,255,255,.22)!important;
        transform:none!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar::before,
      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar::after,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar::before,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar::after{
        content:""!important;
        position:absolute!important;
        inset:-5px!important;
        border-radius:inherit!important;
        border:1px solid rgba(82,166,255,.54)!important;
        background:transparent!important;
        box-shadow:0 0 18px rgba(47,118,255,.30)!important;
        animation:profileCompactAvatarPulse 2.2s ease-out infinite!important;
        pointer-events:none!important;
        z-index:2!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar::after,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar::after{
        inset:-10px!important;
        animation-delay:.75s!important;
        opacity:.42!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected) .profile-showcase-avatar img,
      .profile-showcase.is-secondary-dim:not(.is-event-selected) .profile-showcase-avatar img{
        width:100%!important;
        height:100%!important;
        object-fit:cover!important;
        border-radius:50%!important;
        display:block!important;
      }

      @keyframes profileCompactAvatarPulse{0%{transform:scale(.88);opacity:.86}70%{transform:scale(1.16);opacity:.12}100%{transform:scale(1.2);opacity:0}}

      @media(max-width:700px){
        .profile-wrap.is-profile-condensed .profile-showcase:not(.is-event-selected),
        .profile-showcase.is-secondary-dim:not(.is-event-selected){
          min-height:58px!important;
          height:58px!important;
          padding:3px 8px!important;
          border-radius:29px!important;
        }
      }
      /* Compact weather rail restores the animated weather layer and restyles the temperature chip. */
      .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live:not(.is-event-selected),
      .profile-showcase.is-weather-live.is-secondary-dim:not(.is-event-selected){
        min-height:58px!important;
        height:58px!important;
        width:100%!important;
        padding:3px 8px!important;
        border:0!important;
        border-radius:29px!important;
        background:#4aa9e8!important;
        box-shadow:0 10px 26px rgba(0,0,0,.24),0 0 0 1px rgba(255,255,255,.10) inset!important;
        backdrop-filter:blur(10px)!important;
        -webkit-backdrop-filter:blur(10px)!important;
        overflow:hidden!important;
        contain:paint!important;
        clip-path:inset(0 round 29px)!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live:not(.is-event-selected) .profile-showcase-bg,
      .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live:not(.is-event-selected) .profile-weather-scene,
      .profile-showcase.is-weather-live.is-secondary-dim:not(.is-event-selected) .profile-showcase-bg,
      .profile-showcase.is-weather-live.is-secondary-dim:not(.is-event-selected) .profile-weather-scene{
        display:block!important;
        opacity:1!important;
        inset:0!important;
        border-radius:29px!important;
        clip-path:inset(0 round 29px)!important;
        overflow:hidden!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live:not(.weather-night).weather-sunny:not(.is-event-selected) .profile-showcase-bg,
      .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live:not(.weather-night).weather-clear:not(.is-event-selected) .profile-showcase-bg,
      .profile-showcase.is-weather-live.is-secondary-dim:not(.weather-night).weather-sunny:not(.is-event-selected) .profile-showcase-bg,
      .profile-showcase.is-weather-live.is-secondary-dim:not(.weather-night).weather-clear:not(.is-event-selected) .profile-showcase-bg{
        background:
          radial-gradient(circle at 52% 48%, rgba(255,255,255,.98) 0 7%, rgba(255,250,215,.70) 13%, rgba(255,232,145,.18) 28%, transparent 45%),
          radial-gradient(ellipse at 72% 50%, rgba(255,255,255,.28), transparent 40%),
          linear-gradient(90deg, #bdeeff 0%, #71c7f5 44%, #2e8dcc 100%)!important;
        filter:saturate(1.16) contrast(1.02)!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live:not(.is-event-selected)::before,
      .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live:not(.is-event-selected)::after,
      .profile-showcase.is-weather-live.is-secondary-dim:not(.is-event-selected)::before,
      .profile-showcase.is-weather-live.is-secondary-dim:not(.is-event-selected)::after{
        display:block!important;
        opacity:.30!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live:not(.is-event-selected) .profile-showcase-top,
      .profile-showcase.is-weather-live.is-secondary-dim:not(.is-event-selected) .profile-showcase-top{
        position:relative!important;
        z-index:5!important;
      }

      .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live:not(.is-event-selected) .profile-weather-label,
      .profile-showcase.is-weather-live.is-secondary-dim:not(.is-event-selected) .profile-weather-label{
        right:9px!important;
        top:50%!important;
        z-index:8!important;
        min-height:36px!important;
        max-width:calc(100% - 82px)!important;
        padding:0 14px!important;
        border-radius:18px!important;
        border:1px solid rgba(255,255,255,.12)!important;
        background:rgba(8,13,20,.34)!important;
        color:rgba(255,255,255,.92)!important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 10px 24px rgba(0,0,0,.18)!important;
        backdrop-filter:blur(12px)!important;
        -webkit-backdrop-filter:blur(12px)!important;
        font-size:13px!important;
        line-height:1!important;
        letter-spacing:0!important;
        transform:translateY(-50%)!important;
        white-space:nowrap!important;
      }

      @media(max-width:700px){
        .profile-wrap.is-profile-condensed .profile-showcase.is-weather-live:not(.is-event-selected) .profile-weather-label,
        .profile-showcase.is-weather-live.is-secondary-dim:not(.is-event-selected) .profile-weather-label{
          right:8px!important;
          min-height:34px!important;
          padding:0 12px!important;
          font-size:12px!important;
        }
      }
      /* End final compact profile strip goes black when weather is unavailable */
/* Desktop-only profile event title rollback. Mobile rules below 700px stay untouched. */
      @media(min-width:701px){
        .profile-event-card-panel .event-card .event-title{
          font-size:clamp(22px, 2.35vw, 31px) !important;
          line-height:1.1 !important;
          font-weight:900 !important;
          letter-spacing:0 !important;
          max-width:92% !important;
        }
      }


      /* Premium animated QR rebuild */
      .tz-qr-wrap{
        max-width:980px;
      }

      .tz-qr-hero,
      .tz-qr-card{
        border-color:rgba(126,205,255,.18);
        background:
          radial-gradient(620px 330px at 76% 15%, rgba(93,180,255,.14), transparent 56%),
          radial-gradient(420px 240px at 18% 6%, rgba(255,255,255,.045), transparent 54%),
          linear-gradient(180deg, rgba(13,17,26,.96), rgba(2,3,7,1));
        box-shadow:
          0 24px 70px rgba(0,0,0,.54),
          0 0 0 1px rgba(255,255,255,.035) inset,
          0 0 42px rgba(72,162,255,.08);
        isolation:isolate;
      }

      .tz-qr-hero::before,
      .tz-qr-card::before{
        content:"";
        position:absolute;
        inset:0;
        border-radius:inherit;
        pointer-events:none;
        opacity:.052;
        background-image:radial-gradient(rgba(255,255,255,.95) .65px, transparent .65px);
        background-size:12px 12px;
        z-index:0;
      }

      .tz-qr-hero::after,
      .tz-qr-card::after{
        content:"";
        position:absolute;
        inset:1px;
        border-radius:inherit;
        pointer-events:none;
        background:
          linear-gradient(180deg, rgba(255,255,255,.032), transparent 32%, rgba(0,0,0,.20)),
          radial-gradient(520px 210px at 74% 10%, rgba(126,205,255,.075), transparent 62%);
        z-index:0;
      }

      .tz-qr-hero > *,
      .tz-qr-card > *{
        position:relative;
        z-index:2;
      }

      .tz-qr-kicker{
        display:inline-flex;
        align-items:center;
        min-height:34px;
        padding:0 13px;
        border-radius:999px;
        border:1px solid rgba(126,205,255,.16);
        background:rgba(7,12,20,.52);
        color:rgba(226,239,255,.82);
        font-size:11px;
        letter-spacing:.16em;
        backdrop-filter:blur(12px);
      }

      .tz-qr-title{
        font-size:clamp(44px, 7vw, 72px);
        letter-spacing:0;
        text-shadow:0 12px 30px rgba(0,0,0,.42);
      }

      .tz-qr-subtitle{
        color:rgba(236,245,255,.72);
      }

      .tz-qr-btn,
      .tz-qr-action{
        min-height:48px;
        border-radius:18px;
        border:1px solid rgba(115,194,255,.92);
        background:
          radial-gradient(circle at 50% 0%, rgba(115,194,255,.18), transparent 56%),
          rgba(10,38,66,.38);
        color:#fff;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.14),
          0 0 18px rgba(87,170,255,.30),
          0 0 46px rgba(48,110,255,.22),
          0 12px 26px rgba(0,0,0,.20);
        backdrop-filter:blur(18px) saturate(1.15);
      }

      .tz-qr-btn-dark,
      .tz-qr-action-dark{
        background:rgba(10,38,66,.24);
      }

      .tz-qr-frame{
        position:relative;
        padding:18px;
        border-radius:42px;
        background:linear-gradient(135deg, rgba(116,204,255,.98), rgba(45,105,255,.96));
        box-shadow:
          0 0 26px rgba(87,170,255,.34),
          0 0 70px rgba(48,110,255,.24),
          0 22px 60px rgba(0,0,0,.46);
        overflow:visible;
        animation:tzQrFrameBreath 3.6s ease-in-out infinite alternate;
      }

      .tz-qr-frame::before{
        content:"";
        position:absolute;
        inset:-16px;
        border-radius:50px;
        pointer-events:none;
        background:radial-gradient(circle at 50% 50%, rgba(90,178,255,.42), transparent 66%);
        filter:blur(18px);
        opacity:.68;
        animation:tzQrOuterAura 4.8s ease-in-out infinite alternate;
      }

      .tz-qr-frame::after{
        content:"";
        position:absolute;
        inset:8px;
        border-radius:34px;
        pointer-events:none;
        border:1px solid rgba(255,255,255,.20);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.22);
      }

      .tz-qr-frame-inner{
        position:relative;
        width:min(100%, 500px);
        padding:16px;
        border-radius:30px;
        background:#fff;
        overflow:hidden;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.85),
          0 18px 38px rgba(0,0,0,.26);
      }

      .tz-qr-frame-inner::before{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        background:linear-gradient(110deg, transparent 0 38%, rgba(255,255,255,.34) 48%, transparent 58%);
        transform:translateX(-130%);
        animation:tzQrScanSheen 4.2s ease-in-out infinite;
        z-index:2;
        mix-blend-mode:screen;
      }

      .tz-qr-image{
        position:relative;
        z-index:1;
        border-radius:22px;
      }

      .tz-qr-meta-name{
        font-size:28px;
        letter-spacing:0;
        text-shadow:0 10px 24px rgba(0,0,0,.35);
      }

      .tz-qr-meta-caption{
        max-width:620px;
        margin-left:auto;
        margin-right:auto;
      }

      @keyframes tzQrFrameBreath{0%{filter:saturate(1);transform:translateZ(0) scale(.996)}100%{filter:saturate(1.15);transform:translateZ(0) scale(1.004)}}
      @keyframes tzQrOuterAura{0%{opacity:.44;transform:scale(.98)}100%{opacity:.78;transform:scale(1.03)}}
      @keyframes tzQrScanSheen{0%,38%{transform:translateX(-135%)}62%,100%{transform:translateX(135%)}}

      @media(max-width:700px){
        .tz-qr-frame{
          padding:12px;
          border-radius:30px;
        }
        .tz-qr-frame::before{
          inset:-10px;
          border-radius:38px;
        }
        .tz-qr-frame::after{
          inset:6px;
          border-radius:24px;
        }
        .tz-qr-frame-inner{
          padding:12px;
          border-radius:22px;
        }
        .tz-qr-image{
          border-radius:16px;
        }
      }

      /* End premium animated QR rebuild */


      /* Futuristic floating glass QR portal */
      body{
        background:
          radial-gradient(circle at 50% -6%, rgba(88, 182, 255, .16), transparent 28%),
          radial-gradient(circle at 14% 22%, rgba(42, 105, 255, .10), transparent 32%),
          linear-gradient(180deg, #020306 0%, #000 58%, #000 100%) !important;
        overflow-x: hidden !important;
      }

      body::before{
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        background:
          linear-gradient(rgba(100, 190, 255, .035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(100, 190, 255, .03) 1px, transparent 1px);
        background-size: 34px 34px;
        mask-image: radial-gradient(circle at 50% 38%, #000 0%, transparent 72%);
        -webkit-mask-image: radial-gradient(circle at 50% 38%, #000 0%, transparent 72%);
        opacity: .55;
      }

      .tz-qr-wrap{
        max-width: 620px !important;
        padding: 18px 18px 124px !important;
      }

      .tz-qr-shell{
        gap: 14px !important;
        perspective: 1200px;
      }

      .tz-qr-hero{
        min-height: 0 !important;
        padding: 18px !important;
        border-radius: 30px !important;
        overflow: hidden !important;
        background:
          linear-gradient(135deg, rgba(255,255,255,.10), rgba(255,255,255,.025) 35%, rgba(71,168,255,.08)),
          rgba(5, 10, 18, .62) !important;
        border: 1px solid rgba(147, 214, 255, .20) !important;
        backdrop-filter: blur(24px) saturate(1.18) !important;
        -webkit-backdrop-filter: blur(24px) saturate(1.18) !important;
        box-shadow:
          0 18px 42px rgba(0,0,0,.42),
          inset 0 1px 0 rgba(255,255,255,.13),
          inset 0 -1px 0 rgba(82,171,255,.10) !important;
      }

      .tz-qr-hero::before,
      .tz-qr-hero::after{ opacity: .08 !important; }

      .tz-qr-kicker{
        min-height: 28px !important;
        margin-bottom: 10px !important;
        padding: 0 12px !important;
        font-size: 10px !important;
        letter-spacing: .16em !important;
        color: rgba(225, 240, 255, .78) !important;
        background: rgba(4, 10, 18, .54) !important;
        border: 1px solid rgba(134, 208, 255, .20) !important;
      }

      .tz-qr-title{
        font-size: clamp(38px, 9vw, 52px) !important;
        line-height: .95 !important;
        margin: 0 !important;
      }

      .tz-qr-subtitle{
        margin-top: 10px !important;
        max-width: 430px !important;
        font-size: 15px !important;
        line-height: 1.45 !important;
        color: rgba(228, 238, 255, .70) !important;
      }

      .tz-qr-hero-actions,
      .tz-qr-actions{
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 11px !important;
        width: 100% !important;
      }

      .tz-qr-hero-actions{ margin-top: 16px !important; }

      .tz-qr-btn,
      .tz-qr-action{
        min-height: 48px !important;
        border-radius: 18px !important;
        border: 1px solid rgba(125, 203, 255, .82) !important;
        background:
          linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.018)),
          rgba(4, 13, 24, .74) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.16),
          0 0 18px rgba(87, 184, 255, .22),
          0 12px 24px rgba(0,0,0,.30) !important;
        backdrop-filter: blur(16px) saturate(1.16) !important;
        -webkit-backdrop-filter: blur(16px) saturate(1.16) !important;
      }

      .tz-qr-card{
        position: relative !important;
        padding: 18px !important;
        border-radius: 34px !important;
        overflow: visible !important;
        transform-style: preserve-3d;
        background:
          radial-gradient(circle at 50% -6%, rgba(100, 204, 255, .24), transparent 44%),
          linear-gradient(140deg, rgba(255,255,255,.11), rgba(255,255,255,.025) 42%, rgba(64,160,255,.08)),
          rgba(4, 8, 15, .60) !important;
        border: 1px solid rgba(151, 218, 255, .18) !important;
        backdrop-filter: blur(28px) saturate(1.2) !important;
        -webkit-backdrop-filter: blur(28px) saturate(1.2) !important;
        box-shadow:
          0 30px 74px rgba(0,0,0,.58),
          inset 0 1px 0 rgba(255,255,255,.15),
          inset 0 -1px 0 rgba(75,165,255,.14) !important;
        animation: tzQrPortalFloat 5.8s ease-in-out infinite !important;
        transition: opacity .42s ease, transform .42s cubic-bezier(.2,.85,.2,1), filter .42s ease !important;
      }

      .tz-qr-card::before{
        content: "" !important;
        position: absolute !important;
        inset: -24px !important;
        border-radius: 46px !important;
        pointer-events: none !important;
        opacity: .42 !important;
        background: conic-gradient(from 0deg, transparent 0 18%, rgba(97,202,255,.34), transparent 34% 58%, rgba(41,113,255,.25), transparent 74% 100%) !important;
        filter: blur(14px) !important;
        animation: tzQrAuraSpin 10s linear infinite !important;
        z-index: -1 !important;
      }

      .tz-qr-card::after{
        content: "Tap screen to hide QR" !important;
        position: absolute !important;
        left: 50% !important;
        top: -12px !important;
        transform: translateX(-50%) !important;
        padding: 7px 13px !important;
        border-radius: 999px !important;
        white-space: nowrap !important;
        font-size: 11px !important;
        font-weight: 850 !important;
        color: rgba(225, 241, 255, .72) !important;
        background: rgba(2, 8, 15, .72) !important;
        border: 1px solid rgba(130, 208, 255, .20) !important;
        box-shadow: 0 0 18px rgba(83, 178, 255, .16) !important;
      }

      .tz-qr-frame{
        width: min(100%, 486px) !important;
        margin: 0 auto !important;
        padding: 7px !important;
        border-radius: 32px !important;
        overflow: visible !important;
        background: linear-gradient(135deg, rgba(145,226,255,.96), rgba(42,112,255,.95) 48%, rgba(162,235,255,.98)) !important;
        box-shadow:
          0 0 0 1px rgba(235,250,255,.55) inset,
          0 0 24px rgba(89,190,255,.42),
          0 0 58px rgba(36,113,255,.25),
          0 22px 42px rgba(0,0,0,.46) !important;
        animation: tzQrFrameBreathe 3.4s ease-in-out infinite !important;
      }

      .tz-qr-frame::before{
        content: "" !important;
        position: absolute !important;
        inset: -14px !important;
        border-radius: 44px !important;
        background: radial-gradient(circle, rgba(90,190,255,.38), transparent 68%) !important;
        filter: blur(13px) !important;
        opacity: .72 !important;
        z-index: -1 !important;
        animation: tzQrPulse 2.6s ease-in-out infinite !important;
      }

      .tz-qr-frame::after{ display: none !important; }

      .tz-qr-frame-inner{
        padding: 10px !important;
        border-radius: 25px !important;
        background: #fff !important;
        overflow: hidden !important;
        box-shadow: inset 0 0 0 1px rgba(0,0,0,.05) !important;
      }

      .tz-qr-image{
        display: block !important;
        width: 100% !important;
        border-radius: 16px !important;
        background: #fff !important;
      }

      .tz-qr-logo-overlay{ display: none !important; }

      .tz-qr-meta{
        margin-top: 18px !important;
        position: relative !important;
        z-index: 1 !important;
      }

      .tz-qr-meta-name{
        font-size: 26px !important;
        line-height: 1.06 !important;
        text-shadow: 0 0 20px rgba(120,200,255,.12) !important;
      }

      .tz-qr-meta-caption{
        max-width: 420px !important;
        margin: 9px auto 0 !important;
        font-size: 12px !important;
        color: rgba(220, 232, 255, .52) !important;
      }

      .qr-hidden .tz-qr-card{
        opacity: .18 !important;
        transform: translateY(18px) rotateX(10deg) scale(.92) !important;
        filter: blur(9px) saturate(.7) !important;
        pointer-events: none !important;
      }

      .qr-hidden .tz-qr-card::after{ opacity: 0 !important; }

      .qr-hidden .tz-qr-shell::after{
        content: "Tap to reveal QR";
        display: grid;
        place-items: center;
        min-height: 96px;
        border-radius: 28px;
        color: rgba(226, 241, 255, .76);
        font-weight: 900;
        letter-spacing: .02em;
        border: 1px solid rgba(126, 204, 255, .18);
        background: rgba(5, 12, 22, .50);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 0 28px rgba(78,173,255,.12);
        backdrop-filter: blur(22px) saturate(1.15);
        -webkit-backdrop-filter: blur(22px) saturate(1.15);
        animation: tzQrRevealHint 2.3s ease-in-out infinite;
      }

      @keyframes tzQrPortalFloat{
        0%, 100%{ transform: translateY(0) rotateX(0deg); }
        50%{ transform: translateY(-7px) rotateX(.8deg); }
      }

      @keyframes tzQrRevealHint{
        0%, 100%{ opacity: .72; transform: translateY(0); }
        50%{ opacity: 1; transform: translateY(-3px); }
      }

      @media(max-width:700px){
        .tz-qr-wrap{ padding: 12px 18px 126px !important; }
        .tz-qr-hero{ padding: 17px !important; border-radius: 28px !important; }
        .tz-qr-title{ font-size: 39px !important; }
        .tz-qr-card{ padding: 16px !important; border-radius: 30px !important; }
        .tz-qr-card::after{ font-size: 10px !important; top: -10px !important; }
        .tz-qr-frame{ padding: 6px !important; border-radius: 28px !important; }
        .tz-qr-frame-inner{ padding: 8px !important; border-radius: 22px !important; }
        .tz-qr-image{ border-radius: 15px !important; }
        .tz-qr-actions{ grid-template-columns: 1fr !important; }
      }

      /* End futuristic floating glass QR portal */
</style>

    <script>
      (() => {
        const root = document.documentElement;
        const interactiveSelector = 'a, button, input, textarea, select';
        document.addEventListener('click', (event) => {
          if (event.target.closest(interactiveSelector)) return;
          const insideCard = event.target.closest('.tz-qr-card');
          if (insideCard && !root.classList.contains('qr-hidden')) {
            root.classList.add('qr-hidden');
            return;
          }
          root.classList.toggle('qr-hidden');
        }, { passive: true });
      })();
    </script>



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
        function releaseProfileHeroBoot(){
          document.documentElement.classList.add('tz-profile-ready');
          const shell = document.getElementById('tapzyProfileShell');
          if (!shell) return;
          requestAnimationFrame(function(){
            requestAnimationFrame(function(){ shell.classList.remove('is-profile-booting'); });
          });
        }
        window.addEventListener('pageshow', releaseProfileHeroBoot);
        function initProfileWeatherBackground(){
          const shell = document.getElementById('tapzyProfileShell');
          if (!shell || !navigator.geolocation || !window.fetch) return;
          const weatherClasses = ['is-weather-live','weather-clear','weather-sunny','weather-cloudy','weather-fog','weather-rain','weather-storm','weather-snow','weather-night'];
          let label = shell.querySelector('.profile-weather-label');
          if (!label) {
            label = document.createElement('div');
            label.className = 'profile-weather-label';
            label.setAttribute('aria-hidden', 'true');
            shell.appendChild(label);
          }
          function conditionFromCode(code){
            const n = Number(code);
            const map = {
              0:{ key:'clear', text:'Sunny' },
              1:{ key:'sunny', text:'Mostly Sunny' },
              2:{ key:'cloudy', text:'Partly Cloudy' },
              3:{ key:'cloudy', text:'Cloudy' },
              45:{ key:'fog', text:'Fog' },
              48:{ key:'fog', text:'Freezing Fog' },
              51:{ key:'rain', text:'Light Drizzle' },
              53:{ key:'rain', text:'Drizzle' },
              55:{ key:'rain', text:'Heavy Drizzle' },
              56:{ key:'rain', text:'Freezing Drizzle' },
              57:{ key:'rain', text:'Freezing Drizzle' },
              61:{ key:'rain', text:'Light Rain' },
              63:{ key:'rain', text:'Rain' },
              65:{ key:'rain', text:'Heavy Rain' },
              66:{ key:'rain', text:'Freezing Rain' },
              67:{ key:'rain', text:'Freezing Rain' },
              71:{ key:'snow', text:'Light Snow' },
              73:{ key:'snow', text:'Snow' },
              75:{ key:'snow', text:'Heavy Snow' },
              77:{ key:'snow', text:'Snow Grains' },
              80:{ key:'rain', text:'Light Showers' },
              81:{ key:'rain', text:'Showers' },
              82:{ key:'rain', text:'Heavy Showers' },
              85:{ key:'snow', text:'Snow Showers' },
              86:{ key:'snow', text:'Heavy Snow Showers' },
              95:{ key:'storm', text:'Thunderstorm' },
              96:{ key:'storm', text:'Thunderstorm' },
              99:{ key:'storm', text:'Thunderstorm' },
            };
            return map[n] || { key:'clear', text:'Sunny' };
          }
          function applyWeather(data){
            const current = data && data.current;
            if (!current) return;
            const condition = conditionFromCode(current.weather_code);
            const apiSaysDay = Number(current.is_day) !== 0;
            const localHour = new Date().getHours();
            const localLooksNight = localHour >= 20 || localHour < 6;
            const isDay = apiSaysDay && !localLooksNight;
            shell.classList.add('is-profile-weather-swapping');
            shell.classList.remove.apply(shell.classList, weatherClasses);
            shell.classList.add('is-weather-live', 'weather-' + condition.key);
            if (!isDay) shell.classList.add('weather-night');
            requestAnimationFrame(function(){
              requestAnimationFrame(function(){ shell.classList.remove('is-profile-weather-swapping', 'is-profile-booting'); });
            });
            const temp = Number(current.temperature_2m);
            let conditionText = condition.text || '';
            if (!isDay && (condition.key === 'clear' || condition.key === 'sunny')) {
              conditionText = condition.key === 'sunny' ? 'Mostly Clear' : 'Clear Night';
            }
            label.textContent = (Number.isFinite(temp) ? Math.round(temp) + String.fromCharCode(176) : '') + (conditionText ? ' ' + conditionText : '');
          }
          function loadWeather(lat, lng){
            const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lng) + '&current=temperature_2m,weather_code,is_day,precipitation,wind_speed_10m&timezone=auto';
            fetch(url, { cache:'no-store' })
              .then(function(res){ return res.ok ? res.json() : null; })
              .then(applyWeather)
              .catch(function(){});
          }
          function requestWeather(){
            navigator.geolocation.getCurrentPosition(function(pos){
              if (!pos || !pos.coords) return;
              loadWeather(pos.coords.latitude, pos.coords.longitude);
            }, function(){}, { enableHighAccuracy:false, timeout:7000, maximumAge:900000 });
          }
          if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name:'geolocation' }).then(function(result){
              if (result && (result.state === 'granted' || result.state === 'prompt')) requestWeather();
            }).catch(requestWeather);
          } else {
            requestWeather();
          }
        }

        function initProfileShowcaseFade(){
          const shell = document.getElementById('tapzyProfileShell');
          if (!shell) return;
          if (shell.dataset.fadeBound === '1') return;
          shell.dataset.fadeBound = '1';
          const profileWrap = shell.closest('.profile-wrap');
          let timer = null;
          let restoreTapCount = 0;
          function resetProfileLayout(){
            restoreTapCount = 0;
            shell.classList.remove('is-secondary-dim', 'is-event-selected');
            if (profileWrap) profileWrap.classList.remove('is-profile-condensed');
          }
          resetProfileLayout();
          function dim(){
            restoreTapCount = 0;
            shell.classList.add('is-secondary-dim');
            if (profileWrap) profileWrap.classList.add('is-profile-condensed');
          }
          function wake(){
            resetProfileLayout();
            if (timer) window.clearTimeout(timer);
            timer = window.setTimeout(dim, 30000);
          }
          document.addEventListener('click', function(event){
            if (shell.classList.contains('is-secondary-dim')) {
              restoreTapCount += 1;
              if (restoreTapCount >= 3) wake();
              return;
            }
            wake();
          }, true);
          document.addEventListener('touchstart', function(){
            if (!shell.classList.contains('is-secondary-dim')) wake();
          }, { passive:true, capture:true });
          window.addEventListener('pageshow', wake);
          window.addEventListener('pagehide', resetProfileLayout);
          window.addEventListener('beforeunload', resetProfileLayout);
          document.addEventListener('visibilitychange', function(){ if (document.hidden) resetProfileLayout(); else wake(); });
          requestAnimationFrame(wake);
          wake();
        }

        function initProfileEventCards(){
          const profileShowcase = document.getElementById('tapzyProfileShell');
          let eventActiveTimer = null;
          function selectedEventImage(card){
            const media = card ? card.querySelector('.event-media') : null;
            const bg = media ? media.style.backgroundImage || '' : '';
            const parts = bg.match(/url\([^)]*\)/g);
            return parts && parts.length ? parts[parts.length - 1] : '';
          }
          function setProfileEventState(card, active, clientX, clientY){
            if (!profileShowcase) return;
            if (eventActiveTimer) window.clearTimeout(eventActiveTimer);
            if (active && card) {
              const image = selectedEventImage(card);
              if (image) profileShowcase.style.setProperty('--profile-event-bg', image);
              if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
                const rect = profileShowcase.getBoundingClientRect();
                const x = Math.max(0, Math.min(100, ((clientX - rect.left) / Math.max(rect.width, 1)) * 100));
                const y = Math.max(0, Math.min(100, ((clientY - rect.top) / Math.max(rect.height, 1)) * 100));
                profileShowcase.style.setProperty('--profile-event-mx', x.toFixed(2) + '%');
                profileShowcase.style.setProperty('--profile-event-my', y.toFixed(2) + '%');
              }
              profileShowcase.classList.add('is-event-selected');
              return;
            }
            eventActiveTimer = window.setTimeout(function(){
              profileShowcase.classList.remove('is-event-selected');
            }, 6000);
          }
          document.querySelectorAll('.profile-event-card-panel .js-event-card').forEach(function(card){
            card.classList.add('is-revealed');
            function updatePointer(clientX, clientY){
              const rect = card.getBoundingClientRect();
              const x = Math.max(0, Math.min(100, ((clientX - rect.left) / Math.max(rect.width, 1)) * 100));
              const y = Math.max(0, Math.min(100, ((clientY - rect.top) / Math.max(rect.height, 1)) * 100));
              card.style.setProperty('--mx', x.toFixed(2) + '%');
              card.style.setProperty('--my', y.toFixed(2) + '%');
              setProfileEventState(card, true, clientX, clientY);
            }
            function activateCard(clientX, clientY){
              updatePointer(clientX, clientY);
              card.classList.add('is-touch-active');
            }
            function releaseCard(){
              window.setTimeout(function(){ card.classList.remove('is-touch-active'); }, 170);
              setProfileEventState(card, false);
            }
            card.addEventListener('pointerenter', function(event){ updatePointer(event.clientX, event.clientY); });
            card.addEventListener('pointermove', function(event){ updatePointer(event.clientX, event.clientY); });
            card.addEventListener('pointerdown', function(event){ activateCard(event.clientX, event.clientY); }, { passive:true });
            card.addEventListener('pointerup', releaseCard, { passive:true });
            card.addEventListener('pointercancel', releaseCard, { passive:true });
            card.addEventListener('pointerleave', releaseCard, { passive:true });
            card.addEventListener('focusin', function(){ setProfileEventState(card, true); });
            card.addEventListener('focusout', releaseCard);
            card.addEventListener('touchstart', function(event){
              const touch = event.touches && event.touches[0];
              if (touch) activateCard(touch.clientX, touch.clientY);
            }, { passive:true });
            card.addEventListener('touchmove', function(event){
              const touch = event.touches && event.touches[0];
              if (touch) activateCard(touch.clientX, touch.clientY);
            }, { passive:true });
            card.addEventListener('touchend', releaseCard, { passive:true });
            card.addEventListener('touchcancel', releaseCard, { passive:true });
          });
          document.querySelectorAll('.profile-event-card-panel .js-save-form').forEach(function(form){
            if (form.dataset.profileGoingBound === '1') return;
            form.dataset.profileGoingBound = '1';
            form.addEventListener('submit', function(event){
              event.preventDefault();
              const eventId = form.getAttribute('data-event-id');
              if (!eventId) return;
              fetch(form.action, { method:'POST', headers:{ 'X-Requested-With':'XMLHttpRequest' } })
                .then(function(res){ return res.json(); })
                .then(function(data){
                  const isGoing = !!data.going;
                  document.querySelectorAll('.js-save-btn[data-event-id="' + CSS.escape(eventId) + '"]').forEach(function(btn){
                    btn.classList.toggle('is-going', isGoing);
                    btn.textContent = isGoing ? 'Going ' + String.fromCharCode(10003) : 'Going';
                  });
                  document.querySelectorAll('.js-going-count[data-event-id="' + CSS.escape(eventId) + '"]').forEach(function(node){
                    const count = Number(data.goingCount || 0);
                    node.textContent = count ? String(count) + ' going' : '';
                  });
                })
                .catch(function(){ form.submit(); });
            });
          });
        }

        function initProfileStoryFeed(){
          const stage = document.querySelector('[data-profile-story-stage]');
          if (!stage) return;
          const frame = stage.querySelector('[data-profile-story-frame]');
          const source = stage.querySelector('[data-profile-story-items]');
          const meta = stage.querySelector('[data-profile-story-meta]');
          const ownerLabel = stage.querySelector('[data-profile-story-owner]');
          const soundBtn = stage.querySelector('[data-profile-story-sound]');
          const copyToast = stage.querySelector('[data-profile-story-copy-toast]');
          if (!frame || !source) return;
          let items = [];
          try {
            items = JSON.parse(source.textContent || '[]') || [];
          } catch (_) {
            items = [];
          }
          if (!items.length) {
            if (soundBtn) soundBtn.hidden = true;
            return;
          }

          let index = 0;
          let timer = null;
          let controlsTimer = null;
          let soundOn = false;
          let soundMutedByUser = false;
          try {
            const savedStorySound = window.localStorage && window.localStorage.getItem('tapzy_story_sound');
            soundOn = savedStorySound === '1';
            soundMutedByUser = savedStorySound === '0';
          } catch (_) {}
          const hasVideo = items.some(function(item){ return !!item.isVideo; });
          if (soundBtn) {
            soundBtn.hidden = !hasVideo;
            soundBtn.setAttribute('aria-label', 'Turn story sound on');
          }

          function clearTimer(){
            if (timer) window.clearTimeout(timer);
            timer = null;
          }


          function hideControls(){
            stage.classList.add('is-controls-dim');
          }

          function scheduleControlsFade(){
            if (controlsTimer) window.clearTimeout(controlsTimer);
            controlsTimer = window.setTimeout(hideControls, 4000);
          }

          function showControls(){
            stage.classList.remove('is-controls-dim');
            scheduleControlsFade();
          }

          function updateSoundLabel(video){
            if (!soundBtn) return;
            soundBtn.classList.toggle('is-muted', !soundOn);
            soundBtn.setAttribute('aria-label', soundOn ? 'Mute story sound' : 'Turn story sound on');
            if (video) {
              video.muted = !soundOn;
              video.defaultMuted = !soundOn;
              if (soundOn) {
                video.volume = 1;
                video.removeAttribute('muted');
              } else {
                video.setAttribute('muted', '');
              }
            }
          }

          function rememberSoundChoice(){
            try {
              if (window.localStorage) window.localStorage.setItem('tapzy_story_sound', soundOn ? '1' : '0');
            } catch (_) {}
          }

          function currentVideo(){
            return frame.querySelector('video');
          }

          function playVideo(video){
            if (!video) return;
            if (video.readyState === 0) {
              try { video.load(); } catch (_) {}
            }
            video.play().catch(function(){
              video.muted = true;
              video.defaultMuted = true;
              video.setAttribute('muted', '');
              video.play().catch(function(){});
            });
          }

          function restartVideo(video){
            if (!video) return;
            try { video.currentTime = 0; } catch (_) {}
            playVideo(video);
          }

          function keepProfileStoryPlaying(){
            const video = currentVideo();
            if (!video || document.visibilityState !== 'visible' || !frame.contains(video) || video.ended) return;
            if (video.paused || video.readyState < 2) playVideo(video);
          }

          function profileVideoLooksBlack(video){
            if (!video || !(video.videoWidth > 0 && video.videoHeight > 0) || video.readyState < 2) return false;
            try {
              const canvas = document.createElement('canvas');
              const size = 24;
              canvas.width = size;
              canvas.height = size;
              const ctx = canvas.getContext('2d', { willReadFrequently:true });
              if (!ctx) return false;
              ctx.drawImage(video, 0, 0, size, size);
              const pixels = ctx.getImageData(0, 0, size, size).data;
              let total = 0;
              let bright = 0;
              for (let i = 0; i < pixels.length; i += 4) {
                const luma = (pixels[i] * 0.2126) + (pixels[i + 1] * 0.7152) + (pixels[i + 2] * 0.0722);
                total += luma;
                if (luma > 36) bright += 1;
              }
              const sampleCount = pixels.length / 4;
              return (total / sampleCount) < 10 && bright <= 2;
            } catch (_) {
              return false;
            }
          }

          function profileVideoIsBlank(video){
            if (!video || !video.isConnected || video.ended) return false;
            if (video.error) return true;
            if (!(video.videoWidth > 0 && video.videoHeight > 0)) return video.readyState < 2;
            return profileVideoLooksBlack(video);
          }

          function recoverProfileBlankVideo(video){
            if (!video || !frame.contains(video)) return;
            const source = video.currentSrc || video.getAttribute('src') || '';
            try { video.pause(); } catch (_) {}
            if (source) {
              video.setAttribute('src', source);
              video.preload = 'auto';
              try { video.load(); } catch (_) {}
            }
            playVideo(video);
          }

          function monitorProfileBlankVideo(video){
            if (!video || video.dataset.profileBlankWatch === '1') return;
            video.dataset.profileBlankWatch = '1';
            let blankTimer = null;
            let recoveryTimer = null;
            function clearBlankTimer(){ if (blankTimer) window.clearTimeout(blankTimer); blankTimer = null; }
            function clearRecoveryTimer(){ if (recoveryTimer) window.clearTimeout(recoveryTimer); recoveryTimer = null; }
            function clearBlankWatch(){ clearBlankTimer(); clearRecoveryTimer(); }
            function movePastBlankIfNeeded(){
              recoveryTimer = null;
              if (!frame.contains(video) || !profileVideoIsBlank(video)) return;
              if (items.length <= 1) {
                recoverProfileBlankVideo(video);
                armBlankTimer();
                return;
              }
              next();
            }
            function armBlankTimer(){
              if (!profileVideoIsBlank(video)) { clearBlankWatch(); return; }
              if (blankTimer) return;
              blankTimer = window.setTimeout(function(){
                blankTimer = null;
                if (!frame.contains(video) || !profileVideoIsBlank(video)) return;
                recoverProfileBlankVideo(video);
                clearRecoveryTimer();
                recoveryTimer = window.setTimeout(movePastBlankIfNeeded, 4500);
              }, 7000);
            }
            ['loadeddata','canplay','playing','timeupdate'].forEach(function(name){
              video.addEventListener(name, function(){ if (!profileVideoLooksBlack(video)) clearBlankWatch(); else armBlankTimer(); }, { passive:true });
            });
            ['error','stalled','waiting','emptied'].forEach(function(name){
              video.addEventListener(name, armBlankTimer, { passive:true });
            });
            armBlankTimer();
            window.setTimeout(armBlankTimer, 700);
            window.setTimeout(armBlankTimer, 1800);
          }

          function bindVideoStory(video){
            if (!video || video.dataset.profileStoryBound === '1') return video;
            video.dataset.profileStoryBound = '1';
            video.autoplay = true;
            video.loop = items.length <= 1;
            video.playsInline = true;
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.preload = 'auto';
            video.setAttribute('data-keep-video-live', '1');
            monitorProfileBlankVideo(video);
            updateSoundLabel(video);
            video.addEventListener('ended', function(){
              if (items.length <= 1) {
                restartVideo(video);
                return;
              }
              next();
            });
            video.addEventListener('pause', function(){
              if (document.visibilityState !== 'visible' || video.ended || !frame.contains(video)) return;
              window.setTimeout(keepProfileStoryPlaying, 180);
              window.setTimeout(keepProfileStoryPlaying, 900);
            });
            ['stalled','waiting','suspend'].forEach(function(name){
              video.addEventListener(name, function(){
                window.setTimeout(keepProfileStoryPlaying, 500);
                window.setTimeout(keepProfileStoryPlaying, 1600);
              }, { passive:true });
            });
            video.addEventListener('error', function(){
              window.setTimeout(function(){ recoverProfileBlankVideo(video); }, 1800);
              timer = window.setTimeout(function(){ if (profileVideoIsBlank(video)) next(); }, 8500);
            }, { once:true });
            window.setTimeout(function(){ playVideo(video); }, 30);
            window.setTimeout(keepProfileStoryPlaying, 700);
            window.setTimeout(keepProfileStoryPlaying, 1800);
            return video;
          }

          function unlockStorySound(event){
            if (event && event.target && event.target.closest('a, button')) return false;
            if (!hasVideo || soundMutedByUser) return false;
            const video = currentVideo();
            if (!video) return false;
            if (!soundOn) {
              soundOn = true;
              rememberSoundChoice();
            }
            document.removeEventListener('pointerdown', unlockStorySound, true);
            updateSoundLabel(video);
            playVideo(video);
            return true;
          }

          function makeTextStory(item){
            const box = document.createElement('div');
            box.className = 'profile-story-stage-text';
            box.textContent = item.text || 'Tapzy Story';
            return box;
          }

          function makeImageStory(item){
            const img = document.createElement('img');
            img.className = 'profile-story-stage-media';
            img.src = item.mediaUrl;
            img.alt = item.text || 'Profile story';
            img.loading = 'eager';
            img.decoding = 'async';
            return img;
          }

          function makeVideoStory(item){
            const video = document.createElement('video');
            video.className = 'profile-story-stage-media';
            video.src = item.mediaUrl;
            return bindVideoStory(video);
          }

          const profileWrap = stage.closest('.profile-wrap');
          const showcaseAvatar = document.querySelector('.profile-showcase-avatar');
          const defaultAvatarHtml = showcaseAvatar ? showcaseAvatar.innerHTML : '';
          let activeStoryItem = items[0] || null;

          function setCompactAvatar(item){
            if (!showcaseAvatar) return;
            const shouldBorrowAvatar = !!(profileWrap && profileWrap.classList.contains('is-profile-condensed') && item && !item.isOwn);
            if (!shouldBorrowAvatar) {
              if (showcaseAvatar.innerHTML !== defaultAvatarHtml) showcaseAvatar.innerHTML = defaultAvatarHtml;
              return;
            }
            showcaseAvatar.replaceChildren();
            if (item.ownerPhoto) {
              const img = document.createElement('img');
              img.src = item.ownerPhoto;
              img.alt = item.ownerName || 'Story profile';
              img.loading = 'eager';
              img.decoding = 'async';
              showcaseAvatar.appendChild(img);
              return;
            }
            showcaseAvatar.textContent = item.ownerInitial || 'T';
          }

          if (profileWrap && showcaseAvatar && window.MutationObserver) {
            const compactAvatarObserver = new MutationObserver(function(){ setCompactAvatar(activeStoryItem); });
            compactAvatarObserver.observe(profileWrap, { attributes: true, attributeFilter: ['class'] });
          }

          function swapStoryNode(node, item){
            if (!node) return;
            activeStoryItem = item || activeStoryItem;
            frame.replaceChildren(node);
            if (ownerLabel) ownerLabel.textContent = item.ownerName || 'Tapzy User';
            if (meta) meta.textContent = (item.time || 'Just now') + ' · Tapzy Story';
            setCompactAvatar(activeStoryItem);
            updateSoundLabel(item.isVideo ? node : null);
            showControls();
          }

          function render(){
            clearTimer();
            const item = items[index] || items[0];
            let node = null;
            if (item.mediaUrl && item.isVideo) {
              node = makeVideoStory(item);
              swapStoryNode(node, item);
            } else if (item.mediaUrl) {
              node = makeImageStory(item);
              const swapReady = function(){ swapStoryNode(node, item); };
              if (node.complete && node.naturalWidth > 0) swapReady();
              else {
                node.addEventListener('load', swapReady, { once:true });
                node.addEventListener('error', function(){ timer = window.setTimeout(next, 900); }, { once:true });
              }
              timer = window.setTimeout(next, 5200);
            } else {
              node = makeTextStory(item);
              swapStoryNode(node, item);
              timer = window.setTimeout(next, 5200);
            }
          }

          function next(){
            if (items.length <= 1) {
              if (!(items[0] && items[0].isVideo)) timer = window.setTimeout(render, 5200);
              return;
            }
            index = (index + 1) % items.length;
            render();
          }

          if (soundBtn) {
            soundBtn.addEventListener('click', function(e){
              e.stopPropagation();
              soundOn = !soundOn;
              soundMutedByUser = !soundOn;
              rememberSoundChoice();
              if (soundMutedByUser) document.removeEventListener('pointerdown', unlockStorySound, true);
              const video = currentVideo();
              updateSoundLabel(video);
              playVideo(video);
              showControls();
            });
          }

          stage.querySelectorAll('.profile-story-rail-btn').forEach(function(link){
            link.addEventListener('click', function(e){
              if (stage.classList.contains('is-controls-dim')) {
                e.preventDefault();
                e.stopPropagation();
                showControls();
                return;
              }
              const copyValue = link.getAttribute('data-copy-share');
              if (copyValue) {
                e.preventDefault();
                e.stopPropagation();
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(copyValue).catch(function(){});
                }
                link.classList.add('is-copied');
                if (copyToast) {
                  copyToast.textContent = 'Copied name';
                  copyToast.classList.add('is-visible');
                  window.setTimeout(function(){ copyToast.classList.remove('is-visible'); }, 1100);
                }
                window.setTimeout(function(){ link.classList.remove('is-copied'); }, 900);
                return;
              }
              const href = link.getAttribute('href');
              if (!href) return;
              e.preventDefault();
              e.stopPropagation();
              if (link.target === '_blank') {
                const opened = window.open(href, '_blank', 'noopener,noreferrer');
                if (!opened) window.location.href = href;
              } else {
                window.location.href = href;
              }
            });
          });

          stage.addEventListener('pointerdown', function(e){
            if (e.target && e.target.closest('a, button')) return;
            unlockStorySound();
            showControls();
          });
          document.addEventListener('pointerdown', unlockStorySound, { capture:true });
          document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible') window.setTimeout(keepProfileStoryPlaying, 120); });
          window.setInterval(keepProfileStoryPlaying, 2200);

          if (meta && items[0]) meta.textContent = (items[0].time || 'Just now') + ' · Tapzy Story';
          bindVideoStory(currentVideo());
          if (items.length > 1 && !(items[0] && items[0].isVideo)) timer = window.setTimeout(next, 5200);
          showControls();
        }

        function initProfilePhotoViewer(){
          const viewer = document.getElementById('profilePhotoViewer');
          const openBtn = document.querySelector('[data-profile-photo-open]');
          if (!viewer || !openBtn) return;
          const closeBtns = viewer.querySelectorAll('[data-profile-photo-close]');
          const closeViewer = function(){
            viewer.classList.remove('is-open');
            viewer.removeAttribute('data-user-open');
            viewer.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
          };
          closeViewer();
          const openViewer = function(event){
            if (event) event.stopPropagation();
            viewer.setAttribute('data-user-open', '1');
            viewer.classList.add('is-open');
            viewer.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
          };
          openBtn.addEventListener('click', openViewer);
          closeBtns.forEach(function(btn){ btn.addEventListener('click', closeViewer); });
          document.addEventListener('keydown', function(e){
            if (e.key === 'Escape' && viewer.classList.contains('is-open')) closeViewer();
          });
          window.addEventListener('pagehide', closeViewer);
          window.addEventListener('beforeunload', closeViewer);
          document.addEventListener('visibilitychange', function(){ if (document.hidden) closeViewer(); });
        }
        function initVideoPreviewFrames(root){
          (root || document).querySelectorAll('[data-video-frame]').forEach(function(frame){
            if (frame.dataset.videoReady === '1') return;
            frame.dataset.videoReady = '1';
            const video = frame.querySelector('video');
            const preview = frame.querySelector('[data-video-preview]');
            if (!video || !preview) return;
            const markReady = function(){ if (video.dataset.previewSeeked === '1') frame.classList.add('is-ready'); };
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
                  video.dataset.previewSeeked = 'pending';
                  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
                  const target = Math.min(Math.max(0.65, duration * 0.08), Math.max(0.01, duration - 0.05));
                  video.currentTime = target;
                }
              } catch (err) {}
            };
            video.addEventListener('seeked', function(){
              video.dataset.previewSeeked = '1';
              frame.classList.add('is-ready');
            });
            preview.addEventListener('click', function(){ video.play().catch(function(){}); });
            preview.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); video.play().catch(function(){}); } });
            video.addEventListener('loadedmetadata', warmPreviewFrame, { once: true });
            video.addEventListener('loadeddata', warmPreviewFrame, { once: true });
            video.addEventListener('canplay', markReady, { once: true });
            video.addEventListener('play', markPlaying);
            video.addEventListener('playing', markPlaying);
            video.addEventListener('pause', markPaused);
            warmPreviewFrame();
            if (video.readyState >= 1) warmPreviewFrame();
          });
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', function(){ initProfilePhotoViewer(); releaseProfileHeroBoot(); initProfileWeatherBackground(); initProfileShowcaseFade(); initProfileEventCards(); initProfileStoryFeed(); initVideoPreviewFrames(document); }, { once: true });
        } else {
          initProfilePhotoViewer();
          releaseProfileHeroBoot();
          initProfileWeatherBackground();
          initProfileShowcaseFade();
          initProfileEventCards();
          initProfileStoryFeed();
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

        storiesBottomNav: true,

        hideTopBar: true,

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

    const activeIdentityStory = await prisma.story.findFirst({
      where: {
        profileId: profile.id,
        mediaUrl: { not: null },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { mediaUrl: true, text: true, type: true },
    });

    const activeIdentityStoryUrl = String(activeIdentityStory?.mediaUrl || "").trim();
    const activeIdentityStoryIsVideo = activeIdentityStoryUrl && isVideoUrl(activeIdentityStoryUrl);
    const activeIdentityStoryLabel = String(activeIdentityStory?.text || "Current story").trim() || "Current story";
    const identityStoryEmbedHtml = activeIdentityStoryUrl
      ? activeIdentityStoryIsVideo
        ? `<video class="tz-identity-story-media" src="${escapeHtml(compatibleVideoUrl(activeIdentityStoryUrl))}" autoplay muted loop playsinline webkit-playsinline preload="auto"></video>`
        : `<img class="tz-identity-story-media" src="${escapeHtml(activeIdentityStoryUrl)}" alt="${escapeHtml(activeIdentityStoryLabel)}" loading="eager" decoding="async" />`
      : `<div class="tz-identity-story-empty"><span>No active story yet</span></div>`;






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

              <button class="tz-edit-btn tz-edit-top-save" type="submit" form="tzEditProfileForm">Save Profile</button>

            </div>

          </div>

        </section>



        <form id="tzEditProfileForm" method="POST" action="/edit/${escapeHtml(profile.username || "")}${keyQuery}" enctype="multipart/form-data" class="tz-edit-form">



          <section class="tz-edit-section tz-identity-tour-section" data-identity-tour>

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

            <div class="tz-identity-tour-screen tz-identity-story-screen" data-identity-tour-screen aria-hidden="true">
              <div class="tz-identity-story-embed" aria-label="Current story preview">
                ${identityStoryEmbedHtml}
              </div>
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

        </form>

      </div>

    </div>



    <style>

      .tz-edit-wrap{

        width:100%;
        max-width:1180px;
        margin-left:auto;
        margin-right:auto;
        overflow-x:hidden;
        box-sizing:border-box;

      }

      .tz-edit-wrap,
      .tz-edit-wrap *{
        box-sizing:border-box;
      }



      .tz-edit-shell{

        width:100%;
        max-width:100%;
        overflow-x:hidden;
        display:flex;

        flex-direction:column;

        gap:16px;

      }



      .tz-edit-hero{

        width:100%;
        max-width:100%;
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

        width:100%;
        max-width:100%;
        overflow:hidden;
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
        width:100vw;
        height:100vh;
        height:100dvh;
        max-height:100dvh;
        background:#05060a;
        display:none;
        flex-direction:column;
        color:#fff;
        touch-action:none;
        overscroll-behavior:none;
        overflow:hidden;
        isolation:isolate;
      }

      .tz-photo-crop-modal.is-open{display:flex;}

      .tz-photo-crop-topbar{
        flex:0 0 auto;
        min-height:72px;
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
        flex:1 1 auto;
        min-height:0;
        width:100%;
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
        width:min(86vw, 560px);
        max-width:520px;
        max-height:none;
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
        background:transparent;
      }

      .tz-photo-crop-ring{
        position:absolute;
        left:50%;
        top:50%;
        width:min(70vw, 52dvh, 420px);
        aspect-ratio:1 / 1;
        max-width:420px;
        transform:translate(-50%, -50%);
        border-radius:clamp(24px, 7vw, 36px);
        border:2px solid rgba(255,255,255,.92);
        box-shadow:
          0 0 0 999px rgba(0,0,0,.54),
          0 0 36px rgba(115,194,255,.20),
          inset 0 1px 0 rgba(255,255,255,.16);
        pointer-events:none;
      }

      .tz-photo-crop-hint{
        flex:0 0 auto;
        padding:16px 18px max(22px, env(safe-area-inset-bottom));
        text-align:center;
        color:rgba(255,255,255,.72);
        font-size:14px;
        background:rgba(5,6,10,.92);
        border-top:1px solid rgba(255,255,255,.08);
      }

      @supports not (height:100dvh){
        .tz-photo-crop-modal{height:100vh;max-height:100vh;}
        .tz-photo-crop-ring{width:min(70vw, 420px);}
      }

      @media(max-height:640px){
        .tz-photo-crop-topbar{min-height:60px;padding-top:max(10px, env(safe-area-inset-top));padding-bottom:10px;}
        .tz-photo-crop-hint{padding-top:12px;padding-bottom:max(14px, env(safe-area-inset-bottom));}
        .tz-photo-crop-ring{width:min(68vw, 48dvh, 360px);}
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



      /* Match Edit Profile to the final public profile page treatment. */
      .tz-edit-hero,
      .tz-edit-section{
        border-radius:34px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(500px 300px at 72% 22%, rgba(36,80,125,.24), transparent 58%),
          linear-gradient(180deg, rgba(3,5,12,.98), rgba(0,0,0,1));
        box-shadow:
          0 18px 40px rgba(0,0,0,.28),
          inset 0 1px 0 rgba(255,255,255,.04),
          0 0 0 1px rgba(115,194,255,.03);
        backdrop-filter:blur(8px);
      }

      .tz-edit-hero{
        padding:28px;
      }

      .tz-edit-section{
        padding:24px;
      }

      .tz-edit-hero::after,
      .tz-edit-section::after{
        content:"";
        position:absolute;
        inset:1px;
        border-radius:33px;
        pointer-events:none;
        background:
          linear-gradient(180deg, rgba(255,255,255,.018), transparent 34%),
          radial-gradient(420px 180px at 72% 14%, rgba(115,194,255,.035), transparent 62%);
        z-index:0;
      }

      .tz-edit-hero-bg{
        border-radius:34px;
        background:
          radial-gradient(500px 300px at 72% 22%, rgba(36,80,125,.42), transparent 58%),
          radial-gradient(380px 220px at 18% 10%, rgba(20,42,88,.16), transparent 52%);
      }

      .tz-edit-hero > *,
      .tz-edit-section > *{
        position:relative;
        z-index:1;
      }

      .tz-edit-btn,
      .tz-edit-savebtn{
        min-height:52px;
        border-radius:20px;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(10,12,18,.98), rgba(0,0,0,1));
        color:#fff;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.04),
          0 8px 16px rgba(0,0,0,.16);
        transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease;
      }

      .tz-edit-btn:hover,
      .tz-edit-btn:focus-visible,
      .tz-edit-savebtn:hover,
      .tz-edit-savebtn:focus-visible{
        transform:translateY(-1px);
        border-color:rgba(115,194,255,.92);
        background:
          radial-gradient(circle at 50% 0%, rgba(115,194,255,.18), transparent 56%),
          linear-gradient(180deg, rgba(10,12,18,.98), rgba(0,0,0,1));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.08),
          0 0 18px rgba(87,170,255,.30),
          0 0 46px rgba(48,110,255,.22),
          0 10px 24px rgba(0,0,0,.24);
      }

      .tz-edit-btn:active,
      .tz-edit-savebtn:active{
        transform:scale(.985);
      }



      @media(max-width:700px){

        .wrap.tz-edit-wrap{
          width:100%;
          max-width:100%;
          margin-left:auto;
          margin-right:auto;
          padding:18px 12px 120px;
          box-sizing:border-box;
          overflow-x:hidden;
        }

        .tz-edit-shell{
          margin:0;
          padding:0;
          gap:16px;
        }

        .tz-edit-shell,
        .tz-edit-form,
        .tz-edit-hero,
        .tz-edit-section{
          width:100%;
          max-width:100%;
          box-sizing:border-box;
        }

        .tz-edit-hero{

          padding:20px;

          border-radius:28px;

        }



        .tz-edit-hero-bg{

          border-radius:28px;

        }

        .tz-edit-section{

          padding:20px;

          border-radius:28px;

        }

        .tz-edit-hero::after,
        .tz-edit-section::after{

          border-radius:27px;

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

    

      .tz-identity-tour-section{
        min-height:690px!important;
        overflow:hidden!important;
        transform-style:preserve-3d;
      }
      .tz-identity-tour-section .tz-identity-tour-screen{
        position:absolute!important;
        inset:0!important;
        z-index:30!important;
        display:block!important;
        min-height:100%!important;
        border-radius:inherit!important;
        overflow:hidden!important;
        opacity:0!important;
        visibility:hidden!important;
        pointer-events:none!important;
        transform:scale(.985)!important;
        transition:opacity .7s ease, visibility .7s ease, transform .7s ease!important;
        background:#02040a!important;
      }
      .tz-identity-tour-section.is-tour-active .tz-edit-section-head,
      .tz-identity-tour-section.is-tour-active .tz-edit-grid{
        opacity:0!important;
        transform:scale(.97)!important;
        pointer-events:none!important;
        transition:opacity .45s ease, transform .45s ease!important;
      }
      .tz-identity-tour-section.is-tour-active .tz-identity-tour-screen{
        opacity:1!important;
        visibility:visible!important;
        pointer-events:auto!important;
        transform:scale(1)!important;
      }
      .tz-identity-tour-copy{display:none!important;}
      .tz-mansion-sky{position:absolute;inset:0;background:radial-gradient(circle at 62% 16%, rgba(255,247,207,.78), rgba(255,247,207,.08) 9%, transparent 23%),radial-gradient(520px 280px at 50% 0%, rgba(130,204,255,.30), transparent 62%),linear-gradient(180deg,#08131f 0%,#101a29 38%,#02050c 100%)}
      .tz-mansion-sky::before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.10),transparent);transform:translateX(-120%);animation:tzMansionGleam 7s ease-in-out 1.2s infinite}
      .tz-mansion-camera{position:absolute;inset:0;perspective:900px;transform-style:preserve-3d;animation:tzMansionTour 12s cubic-bezier(.2,.76,.18,1) infinite}
      .tz-mansion-estate{position:absolute;left:50%;top:28%;width:min(80%,760px);height:270px;transform:translateX(-50%) rotateY(-23deg) translateZ(-80px);transform-style:preserve-3d;filter:drop-shadow(0 32px 48px rgba(0,0,0,.56))}
      .tz-mansion-core,.tz-mansion-wing,.tz-mansion-roof,.tz-mansion-door,.tz-mansion-window{position:absolute;display:block}
      .tz-mansion-core{left:30%;right:30%;bottom:30px;height:168px;border-radius:18px 18px 10px 10px;background:linear-gradient(110deg,#edf6ff,#8ea9c3 42%,#20334c 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.88),inset -26px 0 44px rgba(17,35,58,.42)}
      .tz-mansion-wing{bottom:30px;width:32%;height:126px;border-radius:15px 15px 9px 9px;background:linear-gradient(105deg,#dcefff,#7e9dbb 52%,#182a43 100%)}
      .tz-wing-left{left:2%;transform:rotateY(16deg)}.tz-wing-right{right:2%;transform:rotateY(-16deg)}
      .tz-mansion-roof{left:25%;right:25%;bottom:192px;height:56px;clip-path:polygon(50% 0,100% 100%,0 100%);background:linear-gradient(140deg,#fff,#98b6d8 48%,#263956)}
      .tz-mansion-door{left:45%;bottom:30px;width:10%;height:86px;border-radius:999px 999px 5px 5px;background:linear-gradient(180deg,#08111f,#02050b);box-shadow:0 0 34px rgba(102,191,255,.35),inset 0 0 0 2px rgba(255,255,255,.20)}
      .tz-mansion-window{width:42px;height:54px;border-radius:999px 999px 8px 8px;background:linear-gradient(180deg,rgba(255,249,205,.96),rgba(92,189,255,.44));box-shadow:0 0 24px rgba(255,232,145,.34),inset 0 0 0 2px rgba(255,255,255,.36)}
      .tz-mansion-window.w1{left:15%;bottom:86px}.tz-mansion-window.w2{left:35%;bottom:112px}.tz-mansion-window.w3{right:35%;bottom:112px}.tz-mansion-window.w4{right:15%;bottom:86px}
      .tz-mansion-drive{position:absolute;left:50%;bottom:-40px;width:64%;height:360px;transform:translateX(-50%) rotateX(70deg);transform-origin:bottom;border-radius:999px 999px 0 0;background:linear-gradient(180deg,rgba(218,235,255,.28),rgba(86,112,150,.18),rgba(0,0,0,.92));box-shadow:0 -18px 60px rgba(90,176,255,.20)}
      .tz-mansion-interior{position:absolute;inset:0;opacity:0;transform:translateZ(120px) scale(1.1);animation:tzInteriorReveal 12s cubic-bezier(.2,.76,.18,1) infinite;background:radial-gradient(420px 220px at 50% 16%,rgba(255,236,184,.26),transparent 58%),linear-gradient(90deg,rgba(255,255,255,.08),transparent 16%,transparent 84%,rgba(255,255,255,.08)),linear-gradient(180deg,#121a26,#03050a)}
      .tz-interior-arch{position:absolute;left:18%;right:18%;top:12%;height:58%;border-radius:999px 999px 30px 30px;border:2px solid rgba(219,237,255,.24);box-shadow:0 0 60px rgba(110,190,255,.12) inset}
      .tz-interior-chandelier{position:absolute;left:50%;top:13%;width:106px;height:106px;border-radius:999px;transform:translateX(-50%);background:radial-gradient(circle,#fff6d8,rgba(255,208,107,.26) 40%,transparent 70%);box-shadow:0 0 60px rgba(255,215,135,.44)}
      .tz-interior-stair{position:absolute;bottom:18%;width:35%;height:38%;border-top:2px solid rgba(255,255,255,.22);background:repeating-linear-gradient(180deg,rgba(255,255,255,.13) 0 6px,transparent 6px 18px)}
      .tz-interior-stair.left{left:10%;transform:skewY(-14deg)}.tz-interior-stair.right{right:10%;transform:skewY(14deg)}
      .tz-interior-runway{position:absolute;left:44%;right:44%;bottom:-8%;height:58%;background:linear-gradient(180deg,rgba(255,236,189,.32),rgba(47,118,255,.10),transparent);transform:perspective(260px) rotateX(62deg);transform-origin:bottom}
      @keyframes tzMansionTour{0%,14%{transform:translateX(22%) scale(.92) rotateY(-10deg)}42%{transform:translateX(0) scale(1.08) rotateY(0deg)}68%,100%{transform:translateY(-3%) scale(1.34) rotateY(0deg)}}
      @keyframes tzInteriorReveal{0%,48%{opacity:0;transform:translateZ(90px) scale(1.18)}60%,100%{opacity:1;transform:translateZ(170px) scale(1)}}
      @keyframes tzMansionGleam{0%,38%{transform:translateX(-120%)}62%,100%{transform:translateX(120%)}}
      @media(max-width:560px){.tz-identity-tour-section{min-height:690px!important}.tz-mansion-estate{top:24%;width:92%;height:235px}.tz-mansion-window{width:28px;height:42px}}

      .tz-identity-story-screen{
        background:#000!important;
      }
      .tz-identity-story-embed{
        position:absolute;
        inset:0;
        overflow:hidden;
        border-radius:inherit;
        background:#000;
      }
      .tz-identity-story-media{
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
        object-fit:cover;
        display:block;
        background:#000;
        transform:scale(1.015);
        filter:saturate(1.08) contrast(1.04) brightness(.92);
      }
      .tz-identity-tour-section.is-tour-active .tz-identity-story-media{
        animation:tzIdentityStoryDrift 12s ease-in-out infinite alternate;
      }
      .tz-identity-story-embed::before{
        content:"";
        position:absolute;
        inset:0;
        z-index:2;
        pointer-events:none;
        background:linear-gradient(180deg, rgba(0,0,0,.12), transparent 30%, rgba(0,0,0,.34));
      }
      .tz-identity-story-embed::after{
        content:"";
        position:absolute;
        inset:0;
        z-index:3;
        pointer-events:none;
        background:radial-gradient(ellipse at center, transparent 46%, rgba(0,0,0,.46) 100%);
      }
      .tz-identity-story-empty{
        position:absolute;
        inset:0;
        display:grid;
        place-items:center;
        background:radial-gradient(520px 280px at 50% 0%, rgba(65,153,255,.22), transparent 62%), linear-gradient(180deg,#09111d,#02050a);
      }
      .tz-identity-story-empty span{
        color:rgba(255,255,255,.62);
        font-size:13px;
        font-weight:850;
      }
      @keyframes tzIdentityStoryDrift{
        from{transform:scale(1.015) translate3d(-1.5%,0,0)}
        to{transform:scale(1.09) translate3d(1.5%,-1%,0)}
      }
        72%,100%{transform:translateX(125%)}
      }

      .tz-identity-tour-section{
        min-height:430px!important;
      }
      .tz-identity-tour-section.is-tour-active{
        min-height:430px!important;
      }
      .tz-identity-tour-section .tz-identity-tour-screen{
        min-height:430px!important;
      }
      @media(max-width:560px){
        .tz-identity-tour-section,
        .tz-identity-tour-section.is-tour-active,
        .tz-identity-tour-section .tz-identity-tour-screen{
          min-height:410px!important;
        }
      }

      .tz-edit-top-save{
        appearance:none;
        -webkit-appearance:none;
        border:1px solid rgba(255,255,255,.20);
        cursor:pointer;
        font:inherit;
        font-weight:950;
      }
      .tz-edit-savebar{
        display:none!important;
      }
      @media(max-width:700px){
        .tz-edit-actions{grid-template-columns:1fr!important;}
      }

      /* Final premium edit profile polish */
      body{
        background:#000;
      }

      .wrap.tz-edit-wrap{
        max-width:1120px;
        padding-top:22px;
      }

      .tz-edit-shell{
        gap:18px;
      }

      .tz-edit-hero,
      .tz-edit-section{
        position:relative;
        isolation:isolate;
      }

      .tz-edit-hero{
        min-height:274px;
        padding:32px;
        border-color:rgba(133,205,255,.18);
        background:
          radial-gradient(620px 330px at 76% 15%, rgba(93,180,255,.16), transparent 56%),
          radial-gradient(420px 240px at 18% 6%, rgba(255,255,255,.055), transparent 54%),
          linear-gradient(180deg, rgba(13,17,26,.96), rgba(2,3,7,1));
        box-shadow:
          0 24px 70px rgba(0,0,0,.54),
          0 0 0 1px rgba(255,255,255,.035) inset,
          0 0 42px rgba(72,162,255,.08);
      }

      .tz-edit-hero-bg{
        opacity:.96;
        background:
          radial-gradient(340px 210px at 72% 20%, rgba(210,240,255,.13), transparent 62%),
          radial-gradient(470px 250px at 28% 0%, rgba(83,178,255,.16), transparent 58%),
          linear-gradient(125deg, rgba(255,255,255,.035), transparent 34%),
          repeating-radial-gradient(circle at 18% 16%, rgba(255,255,255,.05) 0 1px, transparent 1px 13px);
        mix-blend-mode:screen;
      }

      .tz-edit-hero::before{
        content:"";
        position:absolute;
        inset:auto 26px 22px 26px;
        height:1px;
        border-radius:999px;
        background:linear-gradient(90deg, transparent, rgba(126,205,255,.36), transparent);
        z-index:1;
        pointer-events:none;
      }

      .tz-edit-hero-top{
        min-height:210px;
        align-items:flex-end;
      }

      .tz-edit-kicker{
        display:inline-flex;
        align-items:center;
        min-height:34px;
        padding:0 13px;
        border-radius:999px;
        border:1px solid rgba(126,205,255,.16);
        background:rgba(7,12,20,.52);
        color:rgba(226,239,255,.82);
        font-size:11px;
        letter-spacing:.16em;
        margin-bottom:16px;
        backdrop-filter:blur(12px);
      }

      .tz-edit-title{
        font-size:clamp(42px, 6vw, 70px);
        line-height:.95;
        letter-spacing:0;
        text-shadow:0 12px 30px rgba(0,0,0,.42);
      }

      .tz-edit-subtitle{
        max-width:560px;
        color:rgba(236,245,255,.72);
        font-size:17px;
        line-height:1.55;
      }

      .tz-edit-actions{
        align-self:flex-start;
      }

      .tz-edit-btn{
        min-height:44px;
        border-radius:999px;
        padding:0 18px;
        background:rgba(255,255,255,.075);
        border-color:rgba(255,255,255,.13);
        backdrop-filter:blur(14px);
      }

      .tz-edit-section{
        padding:24px;
        border-radius:30px;
        border-color:rgba(255,255,255,.095);
        background:
          radial-gradient(480px 230px at 82% 0%, rgba(78,168,255,.105), transparent 58%),
          linear-gradient(180deg, rgba(17,22,32,.94), rgba(4,6,10,.98));
        box-shadow:
          0 18px 48px rgba(0,0,0,.34),
          0 0 0 1px rgba(255,255,255,.035) inset;
      }

      .tz-edit-section-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:18px;
        margin-bottom:20px;
        padding-bottom:16px;
        border-bottom:1px solid rgba(255,255,255,.075);
      }

      .tz-edit-section-head h3{
        font-size:clamp(23px, 3vw, 31px);
        line-height:1.05;
        letter-spacing:0;
      }

      .tz-edit-section-head p{
        max-width:420px;
        margin-top:3px;
        color:rgba(224,235,255,.62);
        font-size:14px;
        line-height:1.45;
        text-align:right;
      }

      .tz-edit-grid{
        gap:14px;
      }

      .tz-field{
        gap:7px;
      }

      .tz-field label,
      .tz-edit-upload-box > .tz-field{
        color:rgba(220,232,255,.74);
        font-size:12px;
        font-weight:900;
        letter-spacing:.08em;
        text-transform:uppercase;
      }

      .tz-field input,
      .tz-field textarea,
      .tz-upload-input{
        min-height:54px;
        border-radius:18px;
        border-color:rgba(174,218,255,.15);
        background:rgba(5,8,14,.72);
        color:#fff;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.035),
          0 10px 24px rgba(0,0,0,.13);
        transition:border-color .18s ease, box-shadow .18s ease, background .18s ease;
      }

      .tz-field textarea{
        min-height:124px;
        line-height:1.55;
      }

      .tz-field input:focus,
      .tz-field textarea:focus,
      .tz-upload-input:focus{
        border-color:rgba(116,200,255,.76);
        background:rgba(8,12,20,.86);
        box-shadow:
          0 0 0 3px rgba(91,185,255,.13),
          0 0 30px rgba(91,185,255,.12),
          inset 0 1px 0 rgba(255,255,255,.055);
      }

      .tz-edit-upload-wrap{
        grid-template-columns:minmax(260px, .82fr) 1fr;
        gap:16px;
      }

      .tz-edit-photo-card,
      .tz-edit-upload-box{
        border-radius:26px;
        border-color:rgba(255,255,255,.095);
        background:linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.018));
      }

      .tz-edit-photo-card{
        padding:18px;
      }

      .tz-edit-photo-preview{
        width:118px;
        height:118px;
        border-radius:27px;
        border-color:rgba(126,205,255,.34);
        box-shadow:
          0 0 0 1px rgba(255,255,255,.05) inset,
          0 0 24px rgba(85,177,255,.20),
          0 16px 32px rgba(0,0,0,.30);
      }

      .tz-edit-photo-title{
        font-size:19px;
        letter-spacing:0;
      }

      .tz-edit-photo-sub,
      .tz-switch-copy span{
        color:rgba(223,234,255,.64);
      }

      .tz-photo-pick-btn{
        border-radius:18px;
        border-color:rgba(126,205,255,.20);
        background:linear-gradient(135deg, rgba(31,198,255,.20), rgba(42,91,255,.18));
        box-shadow:0 16px 38px rgba(42,123,255,.16);
      }

      .tz-photo-crop-note{
        border-color:rgba(126,205,255,.16);
        background:rgba(126,205,255,.055);
        color:rgba(225,238,255,.68);
      }

      .tz-toggle-list{
        gap:14px;
      }

      .tz-toggle-row{
        min-height:60px;
        border-radius:20px;
        border-color:rgba(255,255,255,.095);
        background:rgba(255,255,255,.045);
      }

      .tz-toggle-row input[type="checkbox"],
      .tz-check-wrap input[type="checkbox"]{
        appearance:none;
        -webkit-appearance:none;
        position:relative;
        width:48px;
        height:30px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(255,255,255,.12);
        box-shadow:inset 0 1px 4px rgba(0,0,0,.34);
        cursor:pointer;
      }

      .tz-toggle-row input[type="checkbox"]::after,
      .tz-check-wrap input[type="checkbox"]::after{
        content:"";
        position:absolute;
        width:22px;
        height:22px;
        left:3px;
        top:3px;
        border-radius:999px;
        background:#fff;
        box-shadow:0 4px 10px rgba(0,0,0,.28);
        transition:transform .18s ease;
      }

      .tz-toggle-row input[type="checkbox"]:checked,
      .tz-check-wrap input[type="checkbox"]:checked{
        border-color:rgba(76,210,255,.55);
        background:linear-gradient(135deg, #2ed0ff, #2456ff);
      }

      .tz-toggle-row input[type="checkbox"]:checked::after,
      .tz-check-wrap input[type="checkbox"]:checked::after{
        transform:translateX(18px);
      }

      .tz-edit-savebar{
        position:sticky;
        bottom:14px;
        z-index:30;
        margin-top:2px;
        padding:10px;
        border-radius:26px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(0,0,0,.70);
        backdrop-filter:blur(18px);
        box-shadow:0 -18px 54px rgba(0,0,0,.34);
      }

      .tz-edit-savebtn{
        min-height:58px;
        border-radius:20px;
        border:1px solid rgba(255,255,255,.70);
        background:linear-gradient(180deg, #ffffff, #dff1ff);
        color:#020611;
        box-shadow:
          0 16px 36px rgba(77,174,255,.18),
          inset 0 1px 0 rgba(255,255,255,.88);
      }

      .tz-edit-savebtn:hover,
      .tz-edit-savebtn:focus-visible{
        color:#020611;
        background:linear-gradient(180deg, #ffffff, #d8edff);
        border-color:rgba(150,220,255,.95);
      }

      @media(max-width:820px){
        .tz-edit-upload-wrap{
          grid-template-columns:1fr;
        }

        .tz-edit-section-head{
          display:block;
        }

        .tz-edit-section-head p{
          max-width:none;
          text-align:left;
          margin-top:8px;
        }
      }

      @media(max-width:700px){
        .tz-edit-hero{
          min-height:230px;
          padding:22px;
        }

        .tz-edit-hero-top{
          min-height:186px;
          align-items:flex-end;
        }

        .tz-edit-title{
          font-size:40px;
          letter-spacing:0;
        }

        .tz-edit-subtitle{
          font-size:15px;
          line-height:1.45;
        }

        .tz-edit-section{
          padding:18px;
        }

        .tz-edit-section-head h3{
          font-size:25px;
        }

        .tz-field input,
        .tz-field textarea,
        .tz-upload-input{
          font-size:16px;
        }

        .tz-edit-savebar{
          bottom:10px;
          border-radius:24px;
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
        var photoPickTrigger = document.querySelector('[data-photo-pick-trigger]');
        var selectedUrl = '';
        var dragging = false;
        var lastX = 0;
        var lastY = 0;
        var state = { tx:0, ty:0, scale:1 };
        var pointers = {};
        var lastDistance = 0;
        var lockedScrollY = 0;

        if (modal && modal.parentNode !== document.body) {
          document.body.appendChild(modal);
        }

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
          lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
          modal.classList.add('is-open');
          modal.setAttribute('aria-hidden', 'false');
          modal.style.setProperty('display', 'flex', 'important');
          modal.style.setProperty('position', 'fixed', 'important');
          modal.style.setProperty('inset', '0', 'important');
          modal.style.setProperty('z-index', '999999', 'important');
          modal.style.setProperty('height', '100dvh', 'important');
          document.documentElement.style.overflow = 'hidden';
          document.body.style.overflow = 'hidden';
          document.body.style.position = 'fixed';
          document.body.style.top = '-' + lockedScrollY + 'px';
          document.body.style.left = '0';
          document.body.style.right = '0';
          document.body.style.width = '100%';
        }
        function closeModal(){
          if (!modal) return;
          modal.classList.remove('is-open');
          modal.setAttribute('aria-hidden', 'true');
          modal.style.display = '';
          modal.style.height = '';
          document.documentElement.style.overflow = '';
          document.documentElement.style.overflowX = 'hidden';
          document.body.style.overflow = '';
          document.body.style.overflowX = 'hidden';
          document.body.style.position = '';
          document.body.style.top = '';
          document.body.style.left = '';
          document.body.style.right = '';
          document.body.style.width = '';
          window.scrollTo(0, lockedScrollY || 0);
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
        if (photoPickTrigger && file) {
          photoPickTrigger.addEventListener('click', function(e){
            e.preventDefault();
            try { file.click(); } catch(_) {}
          });
        }

        function getDistance(){
          var ids = Object.keys(pointers);
          if (ids.length < 2) return 0;
          var a = pointers[ids[0]], b = pointers[ids[1]];
          var dx = a.x - b.x, dy = a.y - b.y;
          return Math.sqrt(dx*dx + dy*dy);
        }
        if (stage) {
          if (window.PointerEvent) {
            stage.addEventListener('pointerdown', function(e){
              if (!selectedUrl) return;
              e.preventDefault();
              pointers[e.pointerId] = {x:e.clientX, y:e.clientY};
              try { stage.setPointerCapture(e.pointerId); } catch(_) {}
              if (Object.keys(pointers).length === 1) {
                dragging = true;
                lastX = e.clientX;
                lastY = e.clientY;
              }
              if (Object.keys(pointers).length >= 2) lastDistance = getDistance();
            });
            stage.addEventListener('pointermove', function(e){
              if (!selectedUrl || !pointers[e.pointerId]) return;
              e.preventDefault();
              pointers[e.pointerId] = {x:e.clientX, y:e.clientY};
              var ids = Object.keys(pointers);
              if (ids.length >= 2) {
                var d = getDistance();
                if (lastDistance > 0 && d > 0) state.scale = clamp(state.scale * (d / lastDistance), 1, 2.4);
                lastDistance = d;
              } else if (dragging) {
                state.tx += e.clientX - lastX;
                state.ty += e.clientY - lastY;
                lastX = e.clientX;
                lastY = e.clientY;
              }
              applyTransforms();
            });
            function endPointerCrop(e){
              delete pointers[e.pointerId];
              try { stage.releasePointerCapture(e.pointerId); } catch(_) {}
              lastDistance = getDistance();
              if (!Object.keys(pointers).length) dragging = false;
              if (Object.keys(pointers).length === 1) {
                var remaining = pointers[Object.keys(pointers)[0]];
                lastX = remaining.x;
                lastY = remaining.y;
                dragging = true;
              }
            }
            stage.addEventListener('pointerup', endPointerCrop);
            stage.addEventListener('pointercancel', endPointerCrop);
          }
          stage.addEventListener('mousedown', function(e){
            if (window.PointerEvent) return;
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
            if (window.PointerEvent) return;
            if (!selectedUrl) return;
            e.preventDefault();
            for (var i=0;i<e.changedTouches.length;i++) pointers[e.changedTouches[i].identifier] = {x:e.changedTouches[i].clientX,y:e.changedTouches[i].clientY};
            if (e.touches.length === 1) { lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }
            if (e.touches.length >= 2) lastDistance = getDistance();
          }, {passive:false});
          stage.addEventListener('touchmove', function(e){
            if (window.PointerEvent) return;
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
            if (window.PointerEvent) return;
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
            selectedUrl = dataUrl;
            state = { tx:0, ty:0, scale:1 };
            if (x) x.value = '50';
            if (y) y.value = '50';
            if (scaleInput) scaleInput.value = '100';
            var preview = ensurePreview();
            if (preview) {
              preview.src = dataUrl;
              preview.style.objectPosition = '50% 50%';
              preview.style.transform = 'scale(1)';
            }
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

      (function(){
        function bootIdentityTour(){
          const identity = document.querySelector('[data-identity-tour]');
          if (!identity || identity.dataset.tourReady === '1') return;
          identity.dataset.tourReady = '1';
          const screen = identity.querySelector('[data-identity-tour-screen]');
          let tapCount = 0;
          let tapTimer = null;
          const activate = () => {
            identity.classList.add('is-tour-active');
            if (screen) screen.setAttribute('aria-hidden', 'false');
          };
          const deactivate = () => {
            identity.classList.remove('is-tour-active');
            if (screen) screen.setAttribute('aria-hidden', 'true');
            tapCount = 0;
            if (tapTimer) window.clearTimeout(tapTimer);
          };
          window.setTimeout(activate, 5000);
          if (screen) {
            screen.addEventListener('pointerdown', function(){
              tapCount += 1;
              if (tapTimer) window.clearTimeout(tapTimer);
              tapTimer = window.setTimeout(function(){ tapCount = 0; }, 900);
              if (tapCount >= 3) deactivate();
            });
          }
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootIdentityTour, { once:true });
        else bootIdentityTour();
      })();
    </script>

    `;



    res.send(

      renderShell(`Edit • ${profile.username} • Tapzy Network™`, body, "", {

        currentProfile: req.currentProfile || null,

        pageTitle: "Edit Profile",

        pageType: "edit",

        storiesBottomNav: true,

        storiesTopNavActive: "profile",

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
    let savedCroppedPhoto = false;

    async function saveCroppedPhotoData(dataUrl) {
      const value = String(dataUrl || "");
      const match = value.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
      if (!match) return null;
      const sourceType = match[1].toLowerCase();
      const mimeExt = sourceType === "png" ? "png" : sourceType === "webp" ? "webp" : "jpg";
      const contentType = mimeExt === "png" ? "image/png" : mimeExt === "webp" ? "image/webp" : "image/jpeg";
      const buffer = Buffer.from(match[2], "base64");
      if (!buffer.length || buffer.length > 8 * 1024 * 1024) return null;
      if (isCloudinaryConfigured()) {
        try {
          const uploaded = await uploadBufferToCloudinary(buffer, {
            resourceType: "image",
            contentType,
            filename: `tapzy-profile-photo.${mimeExt}`,
            publicId: `profile-${profile.id || profile.username}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
          });
          if (uploaded && uploaded.url) return uploaded.url;
        } catch (error) {
          console.warn("Profile cropped photo cloud upload failed; using local fallback.", error && error.message ? error.message : error);
        }
      }
      fs.mkdirSync(uploadsDir, { recursive: true });
      const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-cropped.${mimeExt}`;
      fs.writeFileSync(path.join(uploadsDir, filename), buffer);
      return publicAbsoluteUrl(req, `/uploads/${filename}`);
    }

    async function saveUploadedProfilePhoto(file) {
      if (!file) return null;
      if (isCloudinaryConfigured() && file.path) {
        try {
          const uploaded = await uploadFileToCloudinary(file.path, {
            resourceType: "image",
            contentType: file.mimetype || "image/jpeg",
            filename: file.originalname || file.filename || "tapzy-profile-photo.jpg",
            publicId: `profile-${profile.id || profile.username}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
          });
          if (uploaded && uploaded.url) return uploaded.url;
        } catch (error) {
          console.warn("Profile photo cloud upload failed; using local fallback.", error && error.message ? error.message : error);
        }
      }
      return publicAbsoluteUrl(req, `/uploads/${file.filename}`);
    }

    if (removePhoto) {

      photo = null;

    } else {

      const croppedPhotoUrl = await saveCroppedPhotoData(req.body.croppedPhotoData);
      if (croppedPhotoUrl) {
        photo = croppedPhotoUrl;
        savedCroppedPhoto = true;
      } else if (req.file) {
        photo = await saveUploadedProfilePhoto(req.file);
      }

    }



    const bool = (name) => !!req.body[name];

    const clampPercent = (value, fallback = 50) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(0, Math.min(100, Math.round(n)));
    };



    const profilePhotoFitData = {
      profilePhotoPositionX: savedCroppedPhoto ? 50 : clampPercent(req.body.profilePhotoPositionX, 50),
      profilePhotoPositionY: savedCroppedPhoto ? 50 : clampPercent(req.body.profilePhotoPositionY, 50),
      profilePhotoScale: savedCroppedPhoto ? 100 : Math.max(100, Math.min(180, Math.round(Number(req.body.profilePhotoScale || 100) || 100))),
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

    

      /* Actual QR page premium animated rebuild */
      .tz-qr-wrap{
        max-width:980px!important;
      }

      .tz-qr-hero,
      .tz-qr-card{
        border-color:rgba(126,205,255,.18)!important;
        background:
          radial-gradient(620px 330px at 76% 15%, rgba(93,180,255,.14), transparent 56%),
          radial-gradient(420px 240px at 18% 6%, rgba(255,255,255,.045), transparent 54%),
          linear-gradient(180deg, rgba(13,17,26,.96), rgba(2,3,7,1))!important;
        box-shadow:
          0 24px 70px rgba(0,0,0,.54),
          0 0 0 1px rgba(255,255,255,.035) inset,
          0 0 42px rgba(72,162,255,.08)!important;
        isolation:isolate;
      }

      .tz-qr-hero::before,
      .tz-qr-card::before{
        content:"";
        position:absolute;
        inset:0;
        border-radius:inherit;
        pointer-events:none;
        opacity:.052;
        background-image:radial-gradient(rgba(255,255,255,.95) .65px, transparent .65px);
        background-size:12px 12px;
        z-index:0;
      }

      .tz-qr-hero::after,
      .tz-qr-card::after{
        content:"";
        position:absolute;
        inset:1px;
        border-radius:inherit;
        pointer-events:none;
        background:
          linear-gradient(180deg, rgba(255,255,255,.032), transparent 32%, rgba(0,0,0,.20)),
          radial-gradient(520px 210px at 74% 10%, rgba(126,205,255,.075), transparent 62%);
        z-index:0;
      }

      .tz-qr-hero > *,
      .tz-qr-card > *{
        position:relative;
        z-index:2;
      }

      .tz-qr-kicker{
        display:inline-flex!important;
        align-items:center;
        min-height:34px;
        padding:0 13px;
        border-radius:999px;
        border:1px solid rgba(126,205,255,.16)!important;
        background:rgba(7,12,20,.52)!important;
        color:rgba(226,239,255,.82)!important;
        font-size:11px!important;
        letter-spacing:.16em!important;
        backdrop-filter:blur(12px);
      }

      .tz-qr-title{
        font-size:clamp(44px, 7vw, 72px)!important;
        letter-spacing:0!important;
        text-shadow:0 12px 30px rgba(0,0,0,.42);
      }

      .tz-qr-subtitle{
        color:rgba(236,245,255,.72)!important;
      }

      .tz-qr-btn,
      .tz-qr-action{
        min-height:48px!important;
        border-radius:18px!important;
        border:1px solid rgba(115,194,255,.92)!important;
        background:
          radial-gradient(circle at 50% 0%, rgba(115,194,255,.18), transparent 56%),
          rgba(10,38,66,.38)!important;
        color:#fff!important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.14),
          0 0 18px rgba(87,170,255,.30),
          0 0 46px rgba(48,110,255,.22),
          0 12px 26px rgba(0,0,0,.20)!important;
        backdrop-filter:blur(18px) saturate(1.15);
      }

      .tz-qr-btn-dark,
      .tz-qr-action-dark{
        background:rgba(10,38,66,.24)!important;
      }

      .tz-qr-frame{
        position:relative!important;
        width:min(100%, 540px);
        margin:6px auto 0;
        padding:18px!important;
        border-radius:42px!important;
        background:linear-gradient(135deg, rgba(116,204,255,.98), rgba(45,105,255,.96))!important;
        box-shadow:
          0 0 26px rgba(87,170,255,.34),
          0 0 70px rgba(48,110,255,.24),
          0 22px 60px rgba(0,0,0,.46)!important;
        overflow:visible!important;
        animation:tzQrFrameBreath 3.6s ease-in-out infinite alternate;
      }

      .tz-qr-frame::before{
        content:"";
        position:absolute;
        inset:-16px;
        border-radius:50px;
        pointer-events:none;
        background:radial-gradient(circle at 50% 50%, rgba(90,178,255,.42), transparent 66%);
        filter:blur(18px);
        opacity:.68;
        animation:tzQrOuterAura 4.8s ease-in-out infinite alternate;
      }

      .tz-qr-frame::after{
        content:"";
        position:absolute;
        inset:8px;
        border-radius:34px;
        pointer-events:none;
        border:1px solid rgba(255,255,255,.20);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.22);
      }

      .tz-qr-frame-inner{
        position:relative!important;
        width:100%!important;
        padding:16px!important;
        border-radius:30px!important;
        background:#fff!important;
        overflow:hidden!important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.85),
          0 18px 38px rgba(0,0,0,.26)!important;
      }

      .tz-qr-frame-inner::before{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        background:linear-gradient(110deg, transparent 0 38%, rgba(255,255,255,.34) 48%, transparent 58%);
        transform:translateX(-130%);
        animation:tzQrScanSheen 4.2s ease-in-out infinite;
        z-index:2;
        mix-blend-mode:screen;
      }

      .tz-qr-image{
        position:relative;
        z-index:1;
        border-radius:22px!important;
      }

      .tz-qr-meta-name{
        font-size:28px!important;
        letter-spacing:0!important;
        text-shadow:0 10px 24px rgba(0,0,0,.35);
      }

      @keyframes tzQrFrameBreath{0%{filter:saturate(1);transform:translateZ(0) scale(.996)}100%{filter:saturate(1.15);transform:translateZ(0) scale(1.004)}}
      @keyframes tzQrOuterAura{0%{opacity:.44;transform:scale(.98)}100%{opacity:.78;transform:scale(1.03)}}
      @keyframes tzQrScanSheen{0%,38%{transform:translateX(-135%)}62%,100%{transform:translateX(135%)}}

      @media(max-width:700px){
        .tz-qr-frame{
          width:100%;
          padding:12px!important;
          border-radius:30px!important;
        }
        .tz-qr-frame::before{
          inset:-10px;
          border-radius:38px;
        }
        .tz-qr-frame::after{
          inset:6px;
          border-radius:24px;
        }
        .tz-qr-frame-inner{
          padding:12px!important;
          border-radius:22px!important;
        }
        .tz-qr-image{
          border-radius:16px!important;
        }
      }

      /* End actual QR page premium animated rebuild */





      /* QR image-three animated frame final */
      .tz-qr-card{
        padding:30px 24px 28px!important;
        background:
          radial-gradient(650px 360px at 50% -6%, rgba(88,170,255,.15), transparent 46%),
          linear-gradient(180deg, rgba(11,16,26,.98), rgba(1,3,7,1))!important;
      }

      .tz-qr-frame{
        width:min(100%, 560px)!important;
        margin:6px auto 0!important;
        padding:12px!important;
        border-radius:42px!important;
        background:linear-gradient(135deg, #75cfff 0%, #2d72ff 72%, #1d4fd5 100%)!important;
        box-shadow:
          0 0 24px rgba(111,199,255,.46),
          0 0 78px rgba(50,121,255,.32),
          0 24px 70px rgba(0,0,0,.56)!important;
        animation:tzQrFrameBreath 2.8s ease-in-out infinite alternate!important;
      }

      .tz-qr-frame::before{
        inset:-18px!important;
        border-radius:52px!important;
        background:
          radial-gradient(circle at 50% 50%, rgba(89,181,255,.54), transparent 64%),
          radial-gradient(circle at 50% 100%, rgba(47,111,255,.38), transparent 62%)!important;
        filter:blur(18px)!important;
        opacity:.86!important;
        animation:tzQrOuterAura 3.8s ease-in-out infinite alternate!important;
      }

      .tz-qr-frame::after{
        inset:8px!important;
        border-radius:34px!important;
        border:1px solid rgba(255,255,255,.30)!important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.25),
          inset 0 -1px 0 rgba(255,255,255,.08)!important;
      }

      .tz-qr-frame-inner{
        position:relative!important;
        padding:14px!important;
        border-radius:32px!important;
        background:#fff!important;
        overflow:hidden!important;
      }

      .tz-qr-image{
        border-radius:22px!important;
        display:block!important;
        width:100%!important;
      }

      .tz-qr-logo-overlay{
        position:absolute;
        left:50%;
        top:50%;
        width:18%;
        max-width:92px;
        min-width:58px;
        aspect-ratio:1 / 1;
        transform:translate(-50%, -50%);
        border-radius:22%;
        display:flex;
        align-items:center;
        justify-content:center;
        background:
          radial-gradient(circle at 50% 0%, rgba(255,255,255,.10), transparent 55%),
          linear-gradient(180deg, #171b22, #05070b);
        border:4px solid #fff;
        box-shadow:
          0 0 0 1px rgba(0,0,0,.20),
          0 10px 24px rgba(0,0,0,.30),
          0 0 26px rgba(75,166,255,.24);
        z-index:4;
        pointer-events:none;
        animation:tzQrLogoPulse 3.2s ease-in-out infinite alternate;
      }

      .tz-qr-logo-overlay img{
        width:68%;
        height:68%;
        object-fit:contain;
        display:block;
        filter:drop-shadow(0 2px 5px rgba(0,0,0,.42));
      }

      .tz-qr-frame-inner::before{
        opacity:.55!important;
      }

      @keyframes tzQrLogoPulse{0%{box-shadow:0 0 0 1px rgba(0,0,0,.20),0 10px 24px rgba(0,0,0,.30),0 0 18px rgba(75,166,255,.18)}100%{box-shadow:0 0 0 1px rgba(0,0,0,.20),0 12px 28px rgba(0,0,0,.34),0 0 34px rgba(75,166,255,.34)}}

      @media(max-width:700px){
        .tz-qr-card{
          padding:22px 16px 24px!important;
        }
        .tz-qr-frame{
          width:100%!important;
          padding:10px!important;
          border-radius:31px!important;
        }
        .tz-qr-frame::before{
          inset:-10px!important;
          border-radius:40px!important;
        }
        .tz-qr-frame::after{
          inset:6px!important;
          border-radius:25px!important;
        }
        .tz-qr-frame-inner{
          padding:10px!important;
          border-radius:24px!important;
        }
        .tz-qr-image{
          border-radius:17px!important;
        }
        .tz-qr-logo-overlay{
          border-width:3px;
          min-width:50px;
        }
      }

      /* End QR image-three animated frame final */


      /* Fresh QR page redesign */
      html,
      body{
        background:#000!important;
      }

      .tz-qr-wrap{
        width:100%;
        max-width:680px!important;
        padding-top:16px!important;
        padding-bottom:120px!important;
      }

      .tz-qr-shell{
        gap:14px!important;
      }

      .tz-qr-hero{
        min-height:0!important;
        padding:20px!important;
        border-radius:28px!important;
        display:block!important;
        background:
          radial-gradient(420px 180px at 78% 0%, rgba(92,188,255,.16), transparent 58%),
          linear-gradient(180deg, rgba(12,17,27,.96), rgba(3,5,10,.98))!important;
      }

      .tz-qr-hero-glow{
        opacity:.45!important;
      }

      .tz-qr-hero-top{
        width:100%!important;
        display:flex!important;
        align-items:flex-end!important;
        justify-content:space-between!important;
        gap:14px!important;
      }

      .tz-qr-kicker{
        min-height:30px!important;
        padding:0 12px!important;
        margin-bottom:12px!important;
        letter-spacing:.18em!important;
      }

      .tz-qr-title{
        font-size:clamp(38px, 8vw, 54px)!important;
        line-height:.98!important;
        margin:0!important;
      }

      .tz-qr-subtitle{
        margin-top:10px!important;
        font-size:16px!important;
        line-height:1.45!important;
        max-width:420px!important;
      }

      .tz-qr-hero-actions{
        flex:0 0 auto!important;
        gap:10px!important;
      }

      .tz-qr-btn,
      .tz-qr-action{
        min-height:44px!important;
        border-radius:17px!important;
        padding:0 16px!important;
        font-size:13px!important;
      }

      .tz-qr-card{
        padding:18px!important;
        border-radius:30px!important;
        background:
          radial-gradient(520px 230px at 50% 0%, rgba(87,174,255,.16), transparent 48%),
          linear-gradient(180deg, rgba(10,15,24,.98), rgba(1,3,7,1))!important;
      }

      .tz-qr-frame{
        width:min(100%, 500px)!important;
        padding:9px!important;
        border-radius:32px!important;
        background:linear-gradient(135deg, #73c9ff 0%, #2d72ff 72%, #1f4fd6 100%)!important;
        box-shadow:
          0 0 18px rgba(105,196,255,.36),
          0 0 52px rgba(46,115,255,.24),
          0 18px 44px rgba(0,0,0,.46)!important;
        animation:tzQrFrameBreath 3.2s ease-in-out infinite alternate!important;
      }

      .tz-qr-frame::before{
        inset:-10px!important;
        border-radius:40px!important;
        opacity:.56!important;
        filter:blur(14px)!important;
      }

      .tz-qr-frame::after{
        inset:5px!important;
        border-radius:25px!important;
        border-color:rgba(255,255,255,.18)!important;
      }

      .tz-qr-frame-inner{
        padding:9px!important;
        border-radius:24px!important;
        background:#fff!important;
        box-shadow:0 14px 30px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.86)!important;
      }

      .tz-qr-frame-inner::before{
        opacity:.20!important;
        animation:tzQrScanSheen 5.2s ease-in-out infinite!important;
      }

      .tz-qr-image{
        border-radius:17px!important;
      }

      .tz-qr-logo-overlay{
        width:13%!important;
        min-width:42px!important;
        max-width:64px!important;
        border-width:3px!important;
        border-radius:24%!important;
        background:
          radial-gradient(circle at 50% 0%, rgba(255,255,255,.13), transparent 56%),
          linear-gradient(180deg, #151a22, #05070b)!important;
        box-shadow:
          0 0 0 1px rgba(0,0,0,.28),
          0 8px 18px rgba(0,0,0,.32),
          0 0 18px rgba(75,166,255,.22)!important;
      }

      .tz-qr-meta{
        margin-top:16px!important;
      }

      .tz-qr-meta-name{
        font-size:25px!important;
        line-height:1.05!important;
      }

      .tz-qr-meta-handle{
        margin-top:5px!important;
      }

      .tz-qr-meta-caption{
        margin-top:8px!important;
        font-size:13px!important;
        color:rgba(216,228,255,.62)!important;
      }

      .tz-qr-actions{
        margin-top:16px!important;
      }

      @media(max-width:700px){
        .tz-qr-wrap{
          padding:14px 18px 120px!important;
        }

        .tz-qr-hero{
          padding:18px!important;
          border-radius:26px!important;
        }

        .tz-qr-hero-top{
          display:block!important;
        }

        .tz-qr-hero-actions{
          margin-top:16px!important;
          display:grid!important;
          grid-template-columns:1fr 1fr!important;
          width:100%!important;
        }

        .tz-qr-btn,
        .tz-qr-action{
          width:100%!important;
          min-width:0!important;
          white-space:nowrap!important;
        }

        .tz-qr-card{
          padding:16px!important;
          border-radius:28px!important;
        }

        .tz-qr-frame{
          width:100%!important;
          padding:8px!important;
          border-radius:28px!important;
        }

        .tz-qr-frame::before{
          inset:-8px!important;
          border-radius:34px!important;
        }

        .tz-qr-frame::after{
          inset:5px!important;
          border-radius:22px!important;
        }

        .tz-qr-frame-inner{
          padding:8px!important;
          border-radius:21px!important;
        }

        .tz-qr-image{
          border-radius:15px!important;
        }

        .tz-qr-logo-overlay{
          width:12.5%!important;
          min-width:40px!important;
          border-width:3px!important;
        }
      }

      /* End fresh QR page redesign */


      /* Calm scan-first QR redesign */
      html,
      body{
        background:#000!important;
      }

      .tz-qr-wrap{
        width:100%!important;
        max-width:620px!important;
        padding-top:14px!important;
        padding-bottom:120px!important;
      }

      .tz-qr-shell{
        gap:14px!important;
      }

      .tz-qr-hero{
        min-height:0!important;
        padding:18px!important;
        border-radius:28px!important;
        background:
          radial-gradient(420px 180px at 78% 0%, rgba(92,188,255,.12), transparent 58%),
          linear-gradient(180deg, rgba(12,17,27,.96), rgba(3,5,10,.98))!important;
        box-shadow:
          0 16px 42px rgba(0,0,0,.38),
          0 0 0 1px rgba(255,255,255,.035) inset!important;
      }

      .tz-qr-hero::before,
      .tz-qr-hero::after{
        opacity:.035!important;
      }

      .tz-qr-hero-glow{
        display:none!important;
      }

      .tz-qr-hero-top{
        display:block!important;
      }

      .tz-qr-kicker{
        min-height:28px!important;
        padding:0 11px!important;
        margin-bottom:10px!important;
        font-size:10px!important;
        letter-spacing:.16em!important;
        color:rgba(220,234,255,.72)!important;
        background:rgba(7,12,20,.42)!important;
      }

      .tz-qr-title{
        font-size:36px!important;
        line-height:1!important;
        letter-spacing:0!important;
        margin:0!important;
      }

      .tz-qr-subtitle{
        margin-top:9px!important;
        max-width:430px!important;
        font-size:15px!important;
        line-height:1.42!important;
        color:rgba(228,238,255,.68)!important;
      }

      .tz-qr-hero-actions{
        margin-top:15px!important;
        display:grid!important;
        grid-template-columns:1fr 1fr!important;
        gap:10px!important;
        width:100%!important;
      }

      .tz-qr-btn,
      .tz-qr-action{
        width:100%!important;
        min-height:44px!important;
        border-radius:17px!important;
        padding:0 12px!important;
        font-size:13px!important;
        font-weight:900!important;
        border:1px solid rgba(115,194,255,.62)!important;
        background:rgba(5,13,22,.68)!important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.10),
          0 0 14px rgba(87,170,255,.18),
          0 8px 18px rgba(0,0,0,.22)!important;
        backdrop-filter:blur(14px) saturate(1.08)!important;
      }

      .tz-qr-card{
        padding:18px!important;
        border-radius:30px!important;
        background:
          radial-gradient(420px 200px at 50% -4%, rgba(87,174,255,.10), transparent 50%),
          linear-gradient(180deg, rgba(9,14,23,.98), rgba(1,3,7,1))!important;
        box-shadow:
          0 18px 48px rgba(0,0,0,.42),
          0 0 0 1px rgba(255,255,255,.035) inset!important;
      }

      .tz-qr-card::before,
      .tz-qr-card::after{
        opacity:.035!important;
      }

      .tz-qr-frame{
        width:min(100%, 500px)!important;
        margin:0 auto!important;
        padding:0!important;
        border-radius:30px!important;
        background:#fff!important;
        box-shadow:
          0 0 0 1px rgba(115,194,255,.38),
          0 0 26px rgba(82,170,255,.18),
          0 18px 38px rgba(0,0,0,.36)!important;
        animation:none!important;
        overflow:hidden!important;
      }

      .tz-qr-frame::before,
      .tz-qr-frame::after{
        display:none!important;
        content:none!important;
      }

      .tz-qr-frame-inner{
        width:100%!important;
        padding:12px!important;
        border-radius:30px!important;
        background:#fff!important;
        box-shadow:none!important;
        overflow:hidden!important;
      }

      .tz-qr-frame-inner::before{
        display:none!important;
        content:none!important;
      }

      .tz-qr-image{
        width:100%!important;
        border-radius:20px!important;
        background:#fff!important;
      }

      .tz-qr-logo-overlay{
        width:11%!important;
        min-width:38px!important;
        max-width:54px!important;
        border-width:3px!important;
        border-radius:12px!important;
        background:linear-gradient(180deg, #151a22, #05070b)!important;
        box-shadow:
          0 0 0 1px rgba(0,0,0,.24),
          0 7px 16px rgba(0,0,0,.28),
          0 0 16px rgba(75,166,255,.16)!important;
        animation:none!important;
      }

      .tz-qr-logo-overlay img{
        width:64%!important;
        height:64%!important;
      }

      .tz-qr-meta{
        margin-top:16px!important;
      }

      .tz-qr-meta-name{
        font-size:24px!important;
        line-height:1.08!important;
      }

      .tz-qr-meta-handle{
        margin-top:5px!important;
        color:rgba(224,234,255,.66)!important;
      }

      .tz-qr-meta-caption{
        margin-top:8px!important;
        font-size:12px!important;
        color:rgba(216,228,255,.52)!important;
      }

      .tz-qr-actions{
        margin-top:15px!important;
        display:grid!important;
        grid-template-columns:1fr 1fr!important;
        gap:10px!important;
      }

      @media(max-width:700px){
        .tz-qr-wrap{
          padding:14px 18px 120px!important;
        }
        .tz-qr-hero,
        .tz-qr-card{
          border-radius:28px!important;
          padding:16px!important;
        }
        .tz-qr-title{
          font-size:34px!important;
        }
        .tz-qr-frame{
          border-radius:24px!important;
        }
        .tz-qr-frame-inner{
          padding:9px!important;
          border-radius:24px!important;
        }
        .tz-qr-image{
          border-radius:16px!important;
        }
        .tz-qr-logo-overlay{
          width:10.5%!important;
          min-width:34px!important;
          border-radius:10px!important;
        }
      }

      /* End calm scan-first QR redesign */

      /* Tapzy living QR redesign */
      body{
        background:
          radial-gradient(circle at 50% 0%, rgba(68, 167, 255, .10), transparent 34%),
          #000 !important;
      }

      .tz-qr-wrap{
        max-width: 620px !important;
        padding: 14px 18px 124px !important;
      }

      .tz-qr-shell{ gap: 16px !important; }

      .tz-qr-hero{
        min-height: 0 !important;
        padding: 20px !important;
        border-radius: 30px !important;
        overflow: hidden !important;
        background:
          radial-gradient(420px 220px at 74% -14%, rgba(93, 188, 255, .20), transparent 60%),
          radial-gradient(320px 190px at 0% 100%, rgba(39, 126, 255, .12), transparent 64%),
          linear-gradient(180deg, rgba(13, 20, 32, .98), rgba(2, 4, 10, .98)) !important;
        box-shadow:
          0 20px 46px rgba(0, 0, 0, .42),
          inset 0 0 0 1px rgba(126, 201, 255, .18),
          inset 0 1px 0 rgba(255, 255, 255, .08) !important;
      }

      .tz-qr-hero::before{ opacity: .10 !important; }
      .tz-qr-hero::after{ opacity: .05 !important; }

      .tz-qr-kicker{
        width: fit-content !important;
        min-height: 30px !important;
        padding: 0 13px !important;
        margin-bottom: 12px !important;
        border-radius: 999px !important;
        color: rgba(220, 235, 255, .78) !important;
        border: 1px solid rgba(117, 195, 255, .18) !important;
        background: rgba(3, 8, 15, .62) !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .08) !important;
      }

      .tz-qr-title{
        font-size: clamp(38px, 10vw, 54px) !important;
        line-height: .94 !important;
        letter-spacing: 0 !important;
        margin: 0 !important;
      }

      .tz-qr-subtitle{
        max-width: 450px !important;
        margin-top: 12px !important;
        font-size: 15px !important;
        line-height: 1.42 !important;
        color: rgba(226, 237, 255, .68) !important;
      }

      .tz-qr-hero-actions,
      .tz-qr-actions{
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 12px !important;
        width: 100% !important;
      }

      .tz-qr-hero-actions{ margin-top: 18px !important; }

      .tz-qr-card{
        position: relative !important;
        padding: 18px !important;
        border-radius: 32px !important;
        overflow: hidden !important;
        background:
          radial-gradient(420px 210px at 50% -8%, rgba(90, 184, 255, .16), transparent 58%),
          linear-gradient(180deg, rgba(11, 18, 30, .98), rgba(1, 3, 8, 1)) !important;
        box-shadow:
          0 22px 54px rgba(0, 0, 0, .46),
          inset 0 0 0 1px rgba(118, 198, 255, .16),
          inset 0 1px 0 rgba(255, 255, 255, .07) !important;
      }

      .tz-qr-card::before{
        content: "" !important;
        position: absolute !important;
        inset: -34% !important;
        pointer-events: none !important;
        opacity: .28 !important;
        background: conic-gradient(from 0deg, transparent, rgba(74, 174, 255, .22), transparent 32%, rgba(28, 93, 255, .18), transparent 68%) !important;
        animation: tzQrAuraSpin 9s linear infinite !important;
      }

      .tz-qr-card::after{
        content: "" !important;
        position: absolute !important;
        inset: 1px !important;
        border-radius: inherit !important;
        pointer-events: none !important;
        background:
          linear-gradient(180deg, rgba(255,255,255,.045), transparent 22%),
          radial-gradient(circle at 50% 0%, rgba(85, 180, 255, .10), transparent 44%) !important;
      }

      .tz-qr-frame,
      .tz-qr-meta,
      .tz-qr-actions{
        position: relative !important;
        z-index: 1 !important;
      }

      .tz-qr-frame{
        width: min(100%, 492px) !important;
        margin: 0 auto !important;
        padding: 8px !important;
        border-radius: 34px !important;
        background: linear-gradient(135deg, #78d7ff, #276dff 46%, #8edfff) !important;
        box-shadow:
          0 0 0 1px rgba(205, 241, 255, .45) inset,
          0 0 18px rgba(88, 185, 255, .38),
          0 0 48px rgba(41, 116, 255, .28),
          0 18px 36px rgba(0, 0, 0, .44) !important;
        overflow: visible !important;
        animation: tzQrFrameBreathe 3.8s ease-in-out infinite !important;
      }

      .tz-qr-frame::before{
        content: "" !important;
        position: absolute !important;
        inset: -11px !important;
        border-radius: 42px !important;
        pointer-events: none !important;
        background: radial-gradient(circle at 50% 50%, rgba(88, 178, 255, .34), transparent 66%) !important;
        filter: blur(12px) !important;
        opacity: .62 !important;
        z-index: -1 !important;
        animation: tzQrPulse 2.9s ease-in-out infinite !important;
      }

      .tz-qr-frame::after{ display: none !important; }

      .tz-qr-frame-inner{
        position: relative !important;
        padding: 10px !important;
        border-radius: 27px !important;
        background: #fff !important;
        box-shadow:
          inset 0 0 0 1px rgba(0, 0, 0, .05),
          inset 0 0 24px rgba(59, 151, 255, .08) !important;
        overflow: hidden !important;
      }

      .tz-qr-frame-inner::before{ display: none !important; }

      .tz-qr-image{
        display: block !important;
        width: 100% !important;
        border-radius: 18px !important;
        background: #fff !important;
      }

      .tz-qr-logo-overlay{
        width: 11.5% !important;
        min-width: 40px !important;
        max-width: 56px !important;
        border-radius: 14px !important;
        border: 3px solid rgba(255, 255, 255, .94) !important;
        background:
          radial-gradient(circle at 35% 20%, rgba(255, 255, 255, .14), transparent 36%),
          linear-gradient(180deg, #171d27, #04070c) !important;
        box-shadow:
          0 0 0 1px rgba(0, 0, 0, .26),
          0 8px 18px rgba(0, 0, 0, .34),
          0 0 18px rgba(74, 165, 255, .24) !important;
        animation: tzQrLogoFloat 3.4s ease-in-out infinite !important;
      }

      .tz-qr-logo-overlay img{
        width: 66% !important;
        height: 66% !important;
        object-fit: contain !important;
      }

      .tz-qr-meta{ margin-top: 18px !important; }

      .tz-qr-meta-name{
        font-size: 26px !important;
        line-height: 1.05 !important;
      }

      .tz-qr-meta-handle{
        margin-top: 6px !important;
        color: rgba(225, 235, 255, .66) !important;
      }

      .tz-qr-meta-caption{
        margin: 9px auto 0 !important;
        max-width: 420px !important;
        color: rgba(218, 229, 255, .50) !important;
      }

      .tz-qr-btn,
      .tz-qr-action{
        min-height: 48px !important;
        border-radius: 18px !important;
        border: 1px solid rgba(116, 198, 255, .78) !important;
        background:
          radial-gradient(circle at 50% 0%, rgba(91, 181, 255, .16), transparent 58%),
          rgba(5, 13, 23, .76) !important;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, .12),
          0 0 15px rgba(84, 177, 255, .20),
          0 10px 20px rgba(0, 0, 0, .28) !important;
      }

      @keyframes tzQrAuraSpin{ to{ transform: rotate(360deg); } }
      @keyframes tzQrFrameBreathe{
        0%, 100%{ filter: saturate(1.02) brightness(1); transform: translateZ(0) scale(1); }
        50%{ filter: saturate(1.12) brightness(1.05); transform: translateZ(0) scale(1.006); }
      }
      @keyframes tzQrPulse{
        0%, 100%{ opacity: .42; transform: scale(.99); }
        50%{ opacity: .80; transform: scale(1.02); }
      }
      @keyframes tzQrLogoFloat{
        0%, 100%{ transform: translate(-50%, -50%) scale(1); }
        50%{ transform: translate(-50%, -50%) scale(1.045); }
      }

      @media(max-width:700px){
        .tz-qr-wrap{ padding: 12px 18px 126px !important; }
        .tz-qr-hero{ padding: 18px !important; border-radius: 28px !important; }
        .tz-qr-title{ font-size: 40px !important; }
        .tz-qr-card{ padding: 16px !important; border-radius: 30px !important; }
        .tz-qr-frame{ padding: 7px !important; border-radius: 28px !important; }
        .tz-qr-frame-inner{ padding: 8px !important; border-radius: 22px !important; }
        .tz-qr-image{ border-radius: 15px !important; }
        .tz-qr-logo-overlay{ min-width: 36px !important; border-radius: 11px !important; }
        .tz-qr-actions{ grid-template-columns: 1fr !important; }
      }

      /* End Tapzy living QR redesign */

      /* Remove QR center logo */
      .tz-qr-logo-overlay{
        display: none !important;
      }

      /* End remove QR center logo */


      /* 3D glass room QR stage */
      .tz-qr-wrap{
        max-width: 640px !important;
        padding-top: 14px !important;
      }

      .tz-qr-shell{
        gap: 16px !important;
        perspective: 1500px !important;
      }

      .tz-qr-card{
        min-height: min(74vh, 720px) !important;
        padding: 22px 18px 24px !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: center !important;
        align-items: center !important;
        border-radius: 36px !important;
        overflow: hidden !important;
        transform-style: preserve-3d !important;
        background:
          radial-gradient(ellipse at 50% 38%, rgba(90, 197, 255, .18) 0%, rgba(38, 107, 255, .07) 34%, transparent 58%),
          linear-gradient(112deg, rgba(102, 201, 255, .11) 0 1px, transparent 1px 43%),
          linear-gradient(248deg, rgba(102, 201, 255, .10) 0 1px, transparent 1px 42%),
          linear-gradient(180deg, rgba(13, 24, 38, .93) 0%, rgba(3, 6, 13, .99) 48%, rgba(0, 0, 0, 1) 100%) !important;
        box-shadow:
          0 34px 86px rgba(0, 0, 0, .68),
          inset 0 0 0 1px rgba(137, 214, 255, .20),
          inset 0 1px 0 rgba(255, 255, 255, .13),
          inset 0 -90px 110px rgba(0, 0, 0, .62) !important;
      }

      .tz-qr-card::before{
        content: "" !important;
        position: absolute !important;
        left: -18% !important;
        right: -18% !important;
        bottom: -8% !important;
        height: 52% !important;
        pointer-events: none !important;
        border-radius: 50% 50% 0 0 / 24% 24% 0 0 !important;
        background:
          linear-gradient(rgba(102, 201, 255, .18) 1px, transparent 1px),
          linear-gradient(90deg, rgba(102, 201, 255, .10) 1px, transparent 1px),
          radial-gradient(ellipse at 50% 0%, rgba(89, 190, 255, .20), transparent 56%) !important;
        background-size: 100% 34px, 44px 100%, 100% 100% !important;
        transform: perspective(620px) rotateX(64deg) translateY(20px) !important;
        transform-origin: bottom center !important;
        filter: blur(.15px) !important;
        opacity: .72 !important;
        animation: tzQrRoomFloor 7s linear infinite !important;
        z-index: 0 !important;
      }

      .tz-qr-card::after{
        content: "" !important;
        position: absolute !important;
        inset: 18px !important;
        border-radius: 32px !important;
        pointer-events: none !important;
        background:
          radial-gradient(ellipse at 50% 34%, rgba(255,255,255,.18), transparent 11%, rgba(101,204,255,.09) 30%, transparent 52%),
          linear-gradient(90deg, rgba(255,255,255,.16), transparent 18%, transparent 82%, rgba(126,217,255,.12)),
          linear-gradient(180deg, rgba(255,255,255,.10), transparent 23%) !important;
        box-shadow:
          inset 0 0 0 1px rgba(175, 230, 255, .12),
          inset 0 0 52px rgba(108, 203, 255, .08) !important;
        opacity: .82 !important;
        z-index: 3 !important;
      }

      .tz-qr-frame{
        position: relative !important;
        z-index: 2 !important;
        width: min(88%, 430px) !important;
        padding: 7px !important;
        border-radius: 34px !important;
        transform: translateZ(74px) rotateX(2deg) !important;
        background:
          linear-gradient(135deg, rgba(184, 241, 255, .98), rgba(53, 132, 255, .96) 47%, rgba(190, 247, 255, .98)) !important;
        box-shadow:
          0 0 0 1px rgba(241, 253, 255, .60) inset,
          0 0 26px rgba(101, 208, 255, .48),
          0 0 72px rgba(38, 120, 255, .32),
          0 32px 58px rgba(0, 0, 0, .62) !important;
        animation: tzQrRoomFloat 4.6s ease-in-out infinite !important;
      }

      .tz-qr-frame::before{
        content: "" !important;
        position: absolute !important;
        inset: -38px !important;
        border-radius: 46% !important;
        pointer-events: none !important;
        background:
          radial-gradient(ellipse at 50% 36%, rgba(255,255,255,.20), transparent 18%, rgba(106,207,255,.20) 38%, transparent 69%) !important;
        filter: blur(6px) !important;
        opacity: .76 !important;
        z-index: -1 !important;
        animation: tzQrDomePulse 3.2s ease-in-out infinite !important;
      }

      .tz-qr-frame::after{
        content: "" !important;
        display: block !important;
        position: absolute !important;
        inset: -18px -16px -20px !important;
        border-radius: 38px !important;
        pointer-events: none !important;
        background:
          radial-gradient(ellipse at 38% 4%, rgba(255,255,255,.30), transparent 16%),
          radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(156,229,255,.18) 67%, transparent 72%) !important;
        box-shadow:
          inset 0 0 0 1px rgba(207,244,255,.18),
          inset 0 0 42px rgba(120,213,255,.12) !important;
        opacity: .70 !important;
        z-index: 4 !important;
      }

      .tz-qr-frame-inner{
        border-radius: 27px !important;
        padding: 10px !important;
        background: #fff !important;
        box-shadow:
          inset 0 0 0 1px rgba(0,0,0,.06),
          inset 0 0 22px rgba(80, 160, 255, .08) !important;
      }

      .tz-qr-image{
        border-radius: 17px !important;
      }

      .tz-qr-logo-overlay{
        display: none !important;
      }

      .tz-qr-meta,
      .tz-qr-actions{
        position: relative !important;
        z-index: 4 !important;
        transform: translateZ(46px) !important;
      }

      .tz-qr-meta{
        margin-top: 22px !important;
      }

      .tz-qr-meta-caption{
        max-width: 360px !important;
      }

      .qr-hidden .tz-qr-card{
        min-height: 260px !important;
      }

      .qr-hidden .tz-qr-frame,
      .qr-hidden .tz-qr-meta,
      .qr-hidden .tz-qr-actions{
        opacity: 0 !important;
        transform: translateZ(-120px) scale(.72) rotateX(18deg) !important;
        filter: blur(12px) !important;
        pointer-events: none !important;
      }

      .qr-hidden .tz-qr-shell::after{
        margin-top: -170px !important;
        z-index: 5 !important;
      }

      @keyframes tzQrRoomFloat{
        0%, 100%{ transform: translateZ(74px) translateY(0) rotateX(2deg) rotateY(-.7deg); }
        50%{ transform: translateZ(92px) translateY(-12px) rotateX(1deg) rotateY(.7deg); }
      }

      @keyframes tzQrDomePulse{
        0%, 100%{ opacity: .54; transform: scale(.98); }
        50%{ opacity: .86; transform: scale(1.025); }
      }

      @keyframes tzQrRoomFloor{
        from{ background-position: 0 0, 0 0, 0 0; }
        to{ background-position: 0 34px, 44px 0, 0 0; }
      }

      @media(max-width:700px){
        .tz-qr-card{
          min-height: 620px !important;
          padding: 22px 16px 24px !important;
          border-radius: 32px !important;
        }
        .tz-qr-frame{
          width: min(92%, 430px) !important;
          border-radius: 30px !important;
        }
        .tz-qr-frame-inner{
          border-radius: 23px !important;
          padding: 8px !important;
        }
        .tz-qr-frame::after{
          border-radius: 34px !important;
        }
      }

      /* End 3D glass room QR stage */


      /* QR simplified floating mode */
      .tz-qr-actions{
        display: none !important;
      }

      .tz-qr-card{
        justify-content: center !important;
      }

      .tz-qr-card::after{
        content: "" !important;
        top: auto !important;
        bottom: auto !important;
        left: 18px !important;
        right: 18px !important;
        transform: none !important;
        padding: 0 !important;
        border: 0 !important;
        background:
          radial-gradient(ellipse at 50% 34%, rgba(255,255,255,.18), transparent 11%, rgba(101,204,255,.09) 30%, transparent 52%),
          linear-gradient(90deg, rgba(255,255,255,.16), transparent 18%, transparent 82%, rgba(126,217,255,.12)),
          linear-gradient(180deg, rgba(255,255,255,.10), transparent 23%) !important;
        box-shadow:
          inset 0 0 0 1px rgba(175, 230, 255, .12),
          inset 0 0 52px rgba(108, 203, 255, .08) !important;
        opacity: .82 !important;
      }

      .tz-qr-frame{
        animation: tzQrRoomFloat 4.6s ease-in-out infinite !important;
      }

      /* End QR simplified floating mode */


      /* QR final float spacing tune */
      .tz-qr-meta{
        margin-top: 34px !important;
        transform: translateZ(46px) translateY(10px) !important;
      }

      .tz-qr-meta-caption{
        margin-top: 12px !important;
      }

      .tz-qr-frame{
        animation: tzQrFinalSoftFloat 3.2s ease-in-out infinite !important;
      }

      @keyframes tzQrFinalSoftFloat{
        0%, 100%{
          transform: translateZ(78px) translateY(-10px) rotateX(1.5deg) rotateY(-.45deg);
        }
        50%{
          transform: translateZ(96px) translateY(12px) rotateX(1deg) rotateY(.45deg);
        }
      }

      @media(max-width:700px){
        .tz-qr-meta{
          margin-top: 32px !important;
          transform: translateZ(46px) translateY(12px) !important;
        }
      }

      /* End QR final float spacing tune */


      /* Force visible QR bob */
      .tz-qr-frame{
        will-change: translate, transform !important;
        animation: tzQrVisibleBob 2.7s ease-in-out infinite !important;
      }

      .tz-qr-frame-inner{
        will-change: translate !important;
        animation: tzQrInnerVisibleBob 2.7s ease-in-out infinite !important;
      }

      @keyframes tzQrVisibleBob{
        0%, 100%{
          translate: 0 -12px;
          transform: translateZ(78px) rotateX(1.5deg) rotateY(-.45deg);
        }
        50%{
          translate: 0 14px;
          transform: translateZ(96px) rotateX(1deg) rotateY(.45deg);
        }
      }

      @keyframes tzQrInnerVisibleBob{
        0%, 100%{ translate: 0 -2px; }
        50%{ translate: 0 3px; }
      }

      /* End force visible QR bob */


      /* Restore clean glass QR look */
      .tz-qr-card{
        padding-top: 34px !important;
      }

      .tz-qr-frame{
        width: min(92%, 560px) !important;
        padding: 8px !important;
        border-radius: 36px !important;
        background:
          linear-gradient(135deg, #9beaff 0%, #55bcff 22%, #397bff 52%, #98edff 100%) !important;
        box-shadow:
          0 0 0 1px rgba(245,253,255,.58) inset,
          0 0 24px rgba(118,218,255,.56),
          0 0 72px rgba(47,124,255,.34),
          0 24px 54px rgba(0,0,0,.58) !important;
      }

      .tz-qr-frame::before{
        inset: -54px -42px -44px !important;
        border-radius: 46px !important;
        background:
          radial-gradient(ellipse at 50% 28%, rgba(255,255,255,.26), transparent 18%, rgba(126,219,255,.20) 42%, transparent 72%) !important;
        filter: blur(7px) !important;
        opacity: .78 !important;
      }

      .tz-qr-frame::after{
        inset: -34px -28px -34px !important;
        border-radius: 42px !important;
        background:
          linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,.04) 35%, transparent 70%),
          radial-gradient(ellipse at 50% 0%, rgba(190,244,255,.26), transparent 32%),
          radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(142,225,255,.20) 70%, transparent 76%) !important;
        box-shadow:
          inset 0 0 0 1px rgba(214,247,255,.20),
          inset 0 0 46px rgba(120,213,255,.13) !important;
        opacity: .82 !important;
      }

      .tz-qr-frame-inner{
        padding: 12px !important;
        border-radius: 28px !important;
        background: linear-gradient(180deg, #ffffff, #f4fbff) !important;
        box-shadow:
          inset 0 0 0 1px rgba(0,0,0,.045),
          inset 0 0 28px rgba(108,190,255,.10) !important;
      }

      .tz-qr-image{
        border-radius: 19px !important;
        background: #fff !important;
        filter: contrast(1.02) saturate(.98) !important;
      }

      @media(max-width:700px){
        .tz-qr-card{
          padding-top: 28px !important;
        }
        .tz-qr-frame{
          width: min(92%, 530px) !important;
          padding: 7px !important;
          border-radius: 32px !important;
        }
        .tz-qr-frame-inner{
          padding: 10px !important;
          border-radius: 25px !important;
        }
        .tz-qr-image{
          border-radius: 17px !important;
        }
      }

      /* End restore clean glass QR look */


      /* Restore double glass 3D QR casing */
      .tz-qr-card{
        padding-top: 38px !important;
        background:
          radial-gradient(ellipse at 50% 33%, rgba(105, 213, 255, .18), transparent 45%),
          linear-gradient(112deg, rgba(102, 201, 255, .11) 0 1px, transparent 1px 43%),
          linear-gradient(248deg, rgba(102, 201, 255, .09) 0 1px, transparent 1px 42%),
          linear-gradient(180deg, rgba(10, 22, 36, .94), rgba(0,0,0,.99)) !important;
      }

      .tz-qr-frame{
        width: min(92%, 560px) !important;
        padding: 8px !important;
        border-radius: 38px !important;
        background:
          linear-gradient(135deg, #a8efff 0%, #62caff 22%, #3679ff 52%, #a6f0ff 100%) !important;
        box-shadow:
          0 0 0 1px rgba(247,253,255,.64) inset,
          0 0 24px rgba(118,218,255,.58),
          0 0 76px rgba(47,124,255,.36),
          0 26px 56px rgba(0,0,0,.60) !important;
      }

      .tz-qr-frame::before{
        content: "" !important;
        position: absolute !important;
        inset: -58px -48px -48px !important;
        border-radius: 56px !important;
        pointer-events: none !important;
        background:
          linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,.045) 36%, rgba(102,201,255,.05) 100%),
          radial-gradient(ellipse at 50% 0%, rgba(210,248,255,.28), transparent 31%),
          radial-gradient(ellipse at 50% 52%, transparent 55%, rgba(142,225,255,.24) 68%, transparent 76%) !important;
        border: 1px solid rgba(205, 243, 255, .18) !important;
        box-shadow:
          inset 0 0 0 1px rgba(255,255,255,.08),
          inset 0 0 58px rgba(123,215,255,.13),
          0 0 34px rgba(78,179,255,.18) !important;
        filter: none !important;
        opacity: .78 !important;
        z-index: -2 !important;
        animation: tzQrDomePulse 3.2s ease-in-out infinite !important;
      }

      .tz-qr-frame::after{
        content: "" !important;
        display: block !important;
        position: absolute !important;
        inset: -28px -24px -28px !important;
        border-radius: 46px !important;
        pointer-events: none !important;
        background:
          linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,.035) 34%, transparent 72%),
          radial-gradient(ellipse at 40% 4%, rgba(255,255,255,.28), transparent 18%),
          radial-gradient(ellipse at 50% 50%, transparent 56%, rgba(150,229,255,.18) 69%, transparent 75%) !important;
        border: 1px solid rgba(220, 249, 255, .16) !important;
        box-shadow:
          inset 0 0 0 1px rgba(255,255,255,.07),
          inset 0 0 40px rgba(120,213,255,.12) !important;
        opacity: .86 !important;
        z-index: 4 !important;
      }

      .tz-qr-frame-inner{
        position: relative !important;
        padding: 12px !important;
        border-radius: 30px !important;
        background: linear-gradient(180deg, #ffffff, #f5fcff) !important;
        box-shadow:
          0 0 0 4px rgba(255,255,255,.72),
          inset 0 0 0 1px rgba(0,0,0,.045),
          inset 0 0 28px rgba(108,190,255,.10) !important;
        z-index: 2 !important;
      }

      .tz-qr-frame-inner::after{
        content: "" !important;
        position: absolute !important;
        inset: -7px !important;
        border-radius: 34px !important;
        pointer-events: none !important;
        border: 2px solid rgba(199, 244, 255, .55) !important;
        box-shadow:
          inset 0 0 18px rgba(113, 213, 255, .14),
          0 0 20px rgba(76, 176, 255, .18) !important;
      }

      .tz-qr-image{
        border-radius: 20px !important;
        background: #fff !important;
        filter: contrast(1.02) saturate(.98) !important;
      }

      @media(max-width:700px){
        .tz-qr-card{
          padding-top: 34px !important;
        }
        .tz-qr-frame{
          width: min(92%, 530px) !important;
          padding: 7px !important;
          border-radius: 34px !important;
        }
        .tz-qr-frame::before{
          inset: -48px -36px -42px !important;
          border-radius: 48px !important;
        }
        .tz-qr-frame::after{
          inset: -24px -18px -24px !important;
          border-radius: 40px !important;
        }
        .tz-qr-frame-inner{
          padding: 10px !important;
          border-radius: 27px !important;
        }
        .tz-qr-frame-inner::after{
          border-radius: 31px !important;
        }
        .tz-qr-image{
          border-radius: 18px !important;
        }
      }

      /* End restore double glass 3D QR casing */
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
