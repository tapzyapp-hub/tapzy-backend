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

    const identityStoryEmbedHtml = `<div class="tz-identity-pixel-face exact-rebuild full-hologram" aria-label="Animated full pixel identity hologram"><span class="tz-identity-pixel-tile" style="--c:0;--r:0;--cols:44;--rows:26;--dx:-182px;--dy:-129px;--rz:-75deg;--z:70px;--d:0ms;--ps:0.72;background-size:4400% 2600%;background-position:0% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:0;--cols:44;--rows:26;--dx:-158px;--dy:-106px;--rz:-62deg;--z:68px;--d:13ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:0;--cols:44;--rows:26;--dx:-134px;--dy:-83px;--rz:-50deg;--z:67px;--d:26ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:0;--cols:44;--rows:26;--dx:-109px;--dy:-109px;--rz:-68deg;--z:65px;--d:39ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:0;--cols:44;--rows:26;--dx:-140px;--dy:-86px;--rz:-55deg;--z:63px;--d:52ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:0;--cols:44;--rows:26;--dx:-116px;--dy:-112px;--rz:-42deg;--z:62px;--d:65ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:0;--cols:44;--rows:26;--dx:-92px;--dy:-89px;--rz:-61deg;--z:60px;--d:78ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:0;--cols:44;--rows:26;--dx:-123px;--dy:-115px;--rz:-48deg;--z:59px;--d:91ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:0;--cols:44;--rows:26;--dx:-98px;--dy:-92px;--rz:-35deg;--z:57px;--d:104ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:0;--cols:44;--rows:26;--dx:-74px;--dy:-118px;--rz:-54deg;--z:55px;--d:117ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:0;--cols:44;--rows:26;--dx:-105px;--dy:-95px;--rz:-41deg;--z:54px;--d:130ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:0;--cols:44;--rows:26;--dx:-81px;--dy:-121px;--rz:-28deg;--z:52px;--d:143ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:0;--cols:44;--rows:26;--dx:-56px;--dy:-98px;--rz:-46deg;--z:50px;--d:156ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:0;--cols:44;--rows:26;--dx:-87px;--dy:-124px;--rz:-34deg;--z:49px;--d:169ms;--ps:0.72;background-size:4400% 2600%;background-position:30.23255813953488% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:0;--cols:44;--rows:26;--dx:-63px;--dy:-101px;--rz:-21deg;--z:47px;--d:182ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:0;--cols:44;--rows:26;--dx:-39px;--dy:-127px;--rz:-39deg;--z:46px;--d:195ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:0;--cols:44;--rows:26;--dx:-15px;--dy:-104px;--rz:-26deg;--z:44px;--d:208ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:0;--cols:44;--rows:26;--dx:-45px;--dy:-81px;--rz:-45deg;--z:42px;--d:221ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:0;--cols:44;--rows:26;--dx:-21px;--dy:-107px;--rz:-32deg;--z:41px;--d:234ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:0;--cols:44;--rows:26;--dx:3px;--dy:-84px;--rz:-19deg;--z:39px;--d:247ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:0;--cols:44;--rows:26;--dx:-28px;--dy:-110px;--rz:-38deg;--z:37px;--d:260ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:0;--cols:44;--rows:26;--dx:-4px;--dy:-87px;--rz:-25deg;--z:36px;--d:273ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:0;--cols:44;--rows:26;--dx:21px;--dy:-113px;--rz:-12deg;--z:36px;--d:286ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:0;--cols:44;--rows:26;--dx:-10px;--dy:-90px;--rz:-30deg;--z:37px;--d:299ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:0;--cols:44;--rows:26;--dx:14px;--dy:-116px;--rz:-18deg;--z:39px;--d:312ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:0;--cols:44;--rows:26;--dx:38px;--dy:-93px;--rz:-5deg;--z:41px;--d:325ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:0;--cols:44;--rows:26;--dx:7px;--dy:-119px;--rz:-23deg;--z:42px;--d:338ms;--ps:0.72;background-size:4400% 2600%;background-position:60.46511627906976% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:0;--cols:44;--rows:26;--dx:32px;--dy:-96px;--rz:-11deg;--z:44px;--d:351ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:0;--cols:44;--rows:26;--dx:56px;--dy:-122px;--rz:2deg;--z:46px;--d:364ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:0;--cols:44;--rows:26;--dx:80px;--dy:-99px;--rz:-16deg;--z:47px;--d:377ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:0;--cols:44;--rows:26;--dx:49px;--dy:-125px;--rz:-3deg;--z:49px;--d:390ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:0;--cols:44;--rows:26;--dx:73px;--dy:-102px;--rz:-22deg;--z:50px;--d:403ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:0;--cols:44;--rows:26;--dx:98px;--dy:-128px;--rz:-9deg;--z:52px;--d:416ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:0;--cols:44;--rows:26;--dx:67px;--dy:-105px;--rz:4deg;--z:54px;--d:429ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:0;--cols:44;--rows:26;--dx:91px;--dy:-82px;--rz:-14deg;--z:55px;--d:442ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:0;--cols:44;--rows:26;--dx:115px;--dy:-108px;--rz:-2deg;--z:57px;--d:455ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:0;--cols:44;--rows:26;--dx:85px;--dy:-85px;--rz:11deg;--z:59px;--d:468ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:0;--cols:44;--rows:26;--dx:109px;--dy:-111px;--rz:-7deg;--z:60px;--d:481ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:0;--cols:44;--rows:26;--dx:133px;--dy:-88px;--rz:5deg;--z:62px;--d:494ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:0;--cols:44;--rows:26;--dx:102px;--dy:-114px;--rz:18deg;--z:63px;--d:507ms;--ps:0.72;background-size:4400% 2600%;background-position:90.69767441860465% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:0;--cols:44;--rows:26;--dx:126px;--dy:-91px;--rz:0deg;--z:65px;--d:520ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:0;--cols:44;--rows:26;--dx:151px;--dy:-117px;--rz:13deg;--z:67px;--d:533ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:0;--cols:44;--rows:26;--dx:175px;--dy:-94px;--rz:25deg;--z:68px;--d:546ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:0;--cols:44;--rows:26;--dx:144px;--dy:-120px;--rz:7deg;--z:70px;--d:559ms;--ps:1;background-size:4400% 2600%;background-position:100% 0%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:1;--cols:44;--rows:26;--dx:-149px;--dy:-89px;--rz:-54deg;--z:67px;--d:572ms;--ps:1;background-size:4400% 2600%;background-position:0% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:1;--cols:44;--rows:26;--dx:-125px;--dy:-115px;--rz:-41deg;--z:66px;--d:585ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:1;--cols:44;--rows:26;--dx:-156px;--dy:-92px;--rz:-60deg;--z:64px;--d:598ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:1;--cols:44;--rows:26;--dx:-131px;--dy:-118px;--rz:-47deg;--z:62px;--d:611ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:1;--cols:44;--rows:26;--dx:-107px;--dy:-95px;--rz:-65deg;--z:61px;--d:624ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:1;--cols:44;--rows:26;--dx:-138px;--dy:-121px;--rz:-53deg;--z:59px;--d:637ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:1;--cols:44;--rows:26;--dx:-114px;--dy:-98px;--rz:-40deg;--z:57px;--d:650ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:1;--cols:44;--rows:26;--dx:-90px;--dy:-75px;--rz:-58deg;--z:56px;--d:663ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:1;--cols:44;--rows:26;--dx:-120px;--dy:-101px;--rz:-45deg;--z:54px;--d:676ms;--ps:0.72;background-size:4400% 2600%;background-position:18.6046511627907% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:1;--cols:44;--rows:26;--dx:-96px;--dy:-78px;--rz:-33deg;--z:53px;--d:689ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:1;--cols:44;--rows:26;--dx:-72px;--dy:-104px;--rz:-51deg;--z:51px;--d:702ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:1;--cols:44;--rows:26;--dx:-103px;--dy:-81px;--rz:-38deg;--z:49px;--d:715ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:1;--cols:44;--rows:26;--dx:-78px;--dy:-107px;--rz:-26deg;--z:48px;--d:728ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:1;--cols:44;--rows:26;--dx:-54px;--dy:-84px;--rz:-44deg;--z:46px;--d:741ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:1;--cols:44;--rows:26;--dx:-30px;--dy:-110px;--rz:-31deg;--z:44px;--d:754ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:1;--cols:44;--rows:26;--dx:-61px;--dy:-87px;--rz:-18deg;--z:43px;--d:767ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:1;--cols:44;--rows:26;--dx:-37px;--dy:-113px;--rz:-37deg;--z:41px;--d:780ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:1;--cols:44;--rows:26;--dx:-12px;--dy:-90px;--rz:-24deg;--z:40px;--d:793ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:1;--cols:44;--rows:26;--dx:-43px;--dy:-116px;--rz:-42deg;--z:38px;--d:806ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:1;--cols:44;--rows:26;--dx:-19px;--dy:-93px;--rz:-29deg;--z:36px;--d:819ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:1;--cols:44;--rows:26;--dx:5px;--dy:-119px;--rz:-17deg;--z:35px;--d:832ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:1;--cols:44;--rows:26;--dx:-26px;--dy:-96px;--rz:-35deg;--z:33px;--d:845ms;--ps:0.72;background-size:4400% 2600%;background-position:48.837209302325576% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:1;--cols:44;--rows:26;--dx:-1px;--dy:-73px;--rz:-22deg;--z:33px;--d:858ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:1;--cols:44;--rows:26;--dx:23px;--dy:-99px;--rz:-10deg;--z:35px;--d:871ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:1;--cols:44;--rows:26;--dx:-8px;--dy:-76px;--rz:-28deg;--z:36px;--d:884ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:1;--cols:44;--rows:26;--dx:16px;--dy:-102px;--rz:-15deg;--z:38px;--d:897ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:1;--cols:44;--rows:26;--dx:40px;--dy:-79px;--rz:-2deg;--z:40px;--d:910ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:1;--cols:44;--rows:26;--dx:65px;--dy:-105px;--rz:-21deg;--z:41px;--d:923ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:1;--cols:44;--rows:26;--dx:34px;--dy:-82px;--rz:-8deg;--z:43px;--d:936ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:1;--cols:44;--rows:26;--dx:58px;--dy:-108px;--rz:5deg;--z:44px;--d:949ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:1;--cols:44;--rows:26;--dx:82px;--dy:-85px;--rz:-14deg;--z:46px;--d:962ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:1;--cols:44;--rows:26;--dx:51px;--dy:-111px;--rz:-1deg;--z:48px;--d:975ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:1;--cols:44;--rows:26;--dx:76px;--dy:-88px;--rz:12deg;--z:49px;--d:988ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:1;--cols:44;--rows:26;--dx:100px;--dy:-114px;--rz:-6deg;--z:51px;--d:1001ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:1;--cols:44;--rows:26;--dx:69px;--dy:-91px;--rz:6deg;--z:53px;--d:1014ms;--ps:0.72;background-size:4400% 2600%;background-position:79.06976744186046% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:1;--cols:44;--rows:26;--dx:93px;--dy:-117px;--rz:-12deg;--z:54px;--d:1027ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:1;--cols:44;--rows:26;--dx:118px;--dy:-94px;--rz:1deg;--z:56px;--d:1040ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:1;--cols:44;--rows:26;--dx:87px;--dy:-120px;--rz:14deg;--z:57px;--d:1053ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:1;--cols:44;--rows:26;--dx:111px;--dy:-97px;--rz:-5deg;--z:59px;--d:1066ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:1;--cols:44;--rows:26;--dx:135px;--dy:-74px;--rz:8deg;--z:61px;--d:1079ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:1;--cols:44;--rows:26;--dx:159px;--dy:-100px;--rz:21deg;--z:62px;--d:1092ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:1;--cols:44;--rows:26;--dx:129px;--dy:-77px;--rz:2deg;--z:64px;--d:1105ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:1;--cols:44;--rows:26;--dx:153px;--dy:-103px;--rz:15deg;--z:66px;--d:1118ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:1;--cols:44;--rows:26;--dx:177px;--dy:-80px;--rz:28deg;--z:67px;--d:1131ms;--ps:1;background-size:4400% 2600%;background-position:100% 4%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:2;--cols:44;--rows:26;--dx:-171px;--dy:-97px;--rz:-64deg;--z:64px;--d:1144ms;--ps:1;background-size:4400% 2600%;background-position:0% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:2;--cols:44;--rows:26;--dx:-147px;--dy:-74px;--rz:-52deg;--z:63px;--d:1157ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:2;--cols:44;--rows:26;--dx:-123px;--dy:-100px;--rz:-39deg;--z:61px;--d:1170ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:2;--cols:44;--rows:26;--dx:-153px;--dy:-77px;--rz:-57deg;--z:60px;--d:3ms;--ps:0.72;background-size:4400% 2600%;background-position:6.976744186046512% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:2;--cols:44;--rows:26;--dx:-129px;--dy:-103px;--rz:-44deg;--z:58px;--d:16ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:2;--cols:44;--rows:26;--dx:-105px;--dy:-80px;--rz:-63deg;--z:56px;--d:29ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:2;--cols:44;--rows:26;--dx:-136px;--dy:-106px;--rz:-50deg;--z:55px;--d:42ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:2;--cols:44;--rows:26;--dx:-112px;--dy:-83px;--rz:-37deg;--z:53px;--d:55ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:2;--cols:44;--rows:26;--dx:-87px;--dy:-109px;--rz:-56deg;--z:51px;--d:68ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:2;--cols:44;--rows:26;--dx:-63px;--dy:-86px;--rz:-43deg;--z:50px;--d:81ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:2;--cols:44;--rows:26;--dx:-94px;--dy:-112px;--rz:-30deg;--z:48px;--d:94ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:2;--cols:44;--rows:26;--dx:-70px;--dy:-89px;--rz:-48deg;--z:46px;--d:107ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:2;--cols:44;--rows:26;--dx:-45px;--dy:-66px;--rz:-36deg;--z:45px;--d:120ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:2;--cols:44;--rows:26;--dx:-76px;--dy:-92px;--rz:-23deg;--z:43px;--d:133ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:2;--cols:44;--rows:26;--dx:-52px;--dy:-69px;--rz:-41deg;--z:42px;--d:146ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:2;--cols:44;--rows:26;--dx:-28px;--dy:-95px;--rz:-29deg;--z:40px;--d:159ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:2;--cols:44;--rows:26;--dx:-59px;--dy:-72px;--rz:-16deg;--z:38px;--d:172ms;--ps:0.72;background-size:4400% 2600%;background-position:37.2093023255814% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:2;--cols:44;--rows:26;--dx:-34px;--dy:-98px;--rz:-34deg;--z:37px;--d:185ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:2;--cols:44;--rows:26;--dx:-10px;--dy:-75px;--rz:-21deg;--z:35px;--d:198ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:2;--cols:44;--rows:26;--dx:-41px;--dy:-101px;--rz:-9deg;--z:33px;--d:211ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:2;--cols:44;--rows:26;--dx:-17px;--dy:-78px;--rz:-27deg;--z:32px;--d:224ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:2;--cols:44;--rows:26;--dx:7px;--dy:-104px;--rz:-14deg;--z:30px;--d:237ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:2;--cols:44;--rows:26;--dx:-23px;--dy:-81px;--rz:-32deg;--z:30px;--d:250ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:2;--cols:44;--rows:26;--dx:1px;--dy:-107px;--rz:-20deg;--z:32px;--d:263ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:2;--cols:44;--rows:26;--dx:25px;--dy:-84px;--rz:-7deg;--z:33px;--d:276ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:2;--cols:44;--rows:26;--dx:49px;--dy:-110px;--rz:-25deg;--z:35px;--d:289ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:2;--cols:44;--rows:26;--dx:18px;--dy:-87px;--rz:-13deg;--z:37px;--d:302ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:2;--cols:44;--rows:26;--dx:43px;--dy:-64px;--rz:0deg;--z:38px;--d:315ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:2;--cols:44;--rows:26;--dx:67px;--dy:-90px;--rz:-18deg;--z:40px;--d:328ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:2;--cols:44;--rows:26;--dx:36px;--dy:-67px;--rz:-5deg;--z:42px;--d:341ms;--ps:0.72;background-size:4400% 2600%;background-position:67.44186046511628% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:2;--cols:44;--rows:26;--dx:60px;--dy:-93px;--rz:7deg;--z:43px;--d:354ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:2;--cols:44;--rows:26;--dx:84px;--dy:-70px;--rz:-11deg;--z:45px;--d:367ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:2;--cols:44;--rows:26;--dx:54px;--dy:-96px;--rz:2deg;--z:46px;--d:380ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:2;--cols:44;--rows:26;--dx:78px;--dy:-73px;--rz:14deg;--z:48px;--d:393ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:2;--cols:44;--rows:26;--dx:102px;--dy:-99px;--rz:-4deg;--z:50px;--d:406ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:2;--cols:44;--rows:26;--dx:71px;--dy:-76px;--rz:9deg;--z:51px;--d:419ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:2;--cols:44;--rows:26;--dx:96px;--dy:-102px;--rz:-9deg;--z:53px;--d:432ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:2;--cols:44;--rows:26;--dx:120px;--dy:-79px;--rz:3deg;--z:55px;--d:445ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:2;--cols:44;--rows:26;--dx:144px;--dy:-105px;--rz:16deg;--z:56px;--d:458ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:2;--cols:44;--rows:26;--dx:113px;--dy:-82px;--rz:-2deg;--z:58px;--d:471ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:2;--cols:44;--rows:26;--dx:137px;--dy:-108px;--rz:11deg;--z:60px;--d:484ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:2;--cols:44;--rows:26;--dx:162px;--dy:-85px;--rz:23deg;--z:61px;--d:497ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:2;--cols:44;--rows:26;--dx:131px;--dy:-111px;--rz:5deg;--z:63px;--d:510ms;--ps:0.72;background-size:4400% 2600%;background-position:97.67441860465115% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:2;--cols:44;--rows:26;--dx:155px;--dy:-88px;--rz:18deg;--z:64px;--d:523ms;--ps:1;background-size:4400% 2600%;background-position:100% 8%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:3;--cols:44;--rows:26;--dx:-138px;--dy:-57px;--rz:-43deg;--z:62px;--d:536ms;--ps:1;background-size:4400% 2600%;background-position:0% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:3;--cols:44;--rows:26;--dx:-169px;--dy:-83px;--rz:-62deg;--z:60px;--d:549ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:3;--cols:44;--rows:26;--dx:-145px;--dy:-60px;--rz:-49deg;--z:58px;--d:562ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:3;--cols:44;--rows:26;--dx:-120px;--dy:-86px;--rz:-36deg;--z:57px;--d:575ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:3;--cols:44;--rows:26;--dx:-151px;--dy:-63px;--rz:-55deg;--z:55px;--d:588ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:3;--cols:44;--rows:26;--dx:-127px;--dy:-89px;--rz:-42deg;--z:53px;--d:601ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:3;--cols:44;--rows:26;--dx:-103px;--dy:-66px;--rz:-29deg;--z:52px;--d:614ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:3;--cols:44;--rows:26;--dx:-79px;--dy:-92px;--rz:-47deg;--z:50px;--d:627ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:3;--cols:44;--rows:26;--dx:-109px;--dy:-69px;--rz:-35deg;--z:49px;--d:640ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:3;--cols:44;--rows:26;--dx:-85px;--dy:-95px;--rz:-53deg;--z:47px;--d:653ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:3;--cols:44;--rows:26;--dx:-61px;--dy:-72px;--rz:-40deg;--z:45px;--d:666ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:3;--cols:44;--rows:26;--dx:-92px;--dy:-98px;--rz:-28deg;--z:44px;--d:679ms;--ps:0.72;background-size:4400% 2600%;background-position:25.581395348837212% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:3;--cols:44;--rows:26;--dx:-67px;--dy:-75px;--rz:-46deg;--z:42px;--d:692ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:3;--cols:44;--rows:26;--dx:-43px;--dy:-101px;--rz:-33deg;--z:40px;--d:705ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:3;--cols:44;--rows:26;--dx:-74px;--dy:-78px;--rz:-20deg;--z:39px;--d:718ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:3;--cols:44;--rows:26;--dx:-50px;--dy:-104px;--rz:-39deg;--z:37px;--d:731ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:3;--cols:44;--rows:26;--dx:-26px;--dy:-81px;--rz:-26deg;--z:36px;--d:744ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:3;--cols:44;--rows:26;--dx:-56px;--dy:-58px;--rz:-13deg;--z:34px;--d:757ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:3;--cols:44;--rows:26;--dx:-32px;--dy:-84px;--rz:-32deg;--z:32px;--d:770ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:3;--cols:44;--rows:26;--dx:-8px;--dy:-61px;--rz:-19deg;--z:31px;--d:783ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:3;--cols:44;--rows:26;--dx:16px;--dy:-87px;--rz:-6deg;--z:29px;--d:796ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:3;--cols:44;--rows:26;--dx:-15px;--dy:-64px;--rz:-24deg;--z:27px;--d:809ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:3;--cols:44;--rows:26;--dx:10px;--dy:-90px;--rz:-12deg;--z:27px;--d:822ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:3;--cols:44;--rows:26;--dx:34px;--dy:-67px;--rz:-30deg;--z:29px;--d:835ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:3;--cols:44;--rows:26;--dx:3px;--dy:-93px;--rz:-17deg;--z:31px;--d:848ms;--ps:0.72;background-size:4400% 2600%;background-position:55.81395348837209% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:3;--cols:44;--rows:26;--dx:27px;--dy:-70px;--rz:-4deg;--z:32px;--d:861ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:3;--cols:44;--rows:26;--dx:51px;--dy:-96px;--rz:-23deg;--z:34px;--d:874ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:3;--cols:44;--rows:26;--dx:21px;--dy:-73px;--rz:-10deg;--z:36px;--d:887ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:3;--cols:44;--rows:26;--dx:45px;--dy:-99px;--rz:3deg;--z:37px;--d:900ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:3;--cols:44;--rows:26;--dx:69px;--dy:-76px;--rz:-16deg;--z:39px;--d:913ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:3;--cols:44;--rows:26;--dx:38px;--dy:-102px;--rz:-3deg;--z:40px;--d:926ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:3;--cols:44;--rows:26;--dx:62px;--dy:-79px;--rz:10deg;--z:42px;--d:939ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:3;--cols:44;--rows:26;--dx:87px;--dy:-56px;--rz:-8deg;--z:44px;--d:952ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:3;--cols:44;--rows:26;--dx:56px;--dy:-82px;--rz:4deg;--z:45px;--d:965ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:3;--cols:44;--rows:26;--dx:80px;--dy:-59px;--rz:17deg;--z:47px;--d:978ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:3;--cols:44;--rows:26;--dx:104px;--dy:-85px;--rz:-1deg;--z:49px;--d:991ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:3;--cols:44;--rows:26;--dx:129px;--dy:-62px;--rz:11deg;--z:50px;--d:1004ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:3;--cols:44;--rows:26;--dx:98px;--dy:-88px;--rz:24deg;--z:52px;--d:1017ms;--ps:0.72;background-size:4400% 2600%;background-position:86.04651162790698% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:3;--cols:44;--rows:26;--dx:122px;--dy:-65px;--rz:6deg;--z:53px;--d:1030ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:3;--cols:44;--rows:26;--dx:146px;--dy:-91px;--rz:19deg;--z:55px;--d:1043ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:3;--cols:44;--rows:26;--dx:115px;--dy:-68px;--rz:0deg;--z:57px;--d:1056ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:3;--cols:44;--rows:26;--dx:140px;--dy:-94px;--rz:13deg;--z:58px;--d:1069ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:3;--cols:44;--rows:26;--dx:164px;--dy:-71px;--rz:26deg;--z:60px;--d:1082ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:3;--cols:44;--rows:26;--dx:133px;--dy:-97px;--rz:8deg;--z:62px;--d:1095ms;--ps:1;background-size:4400% 2600%;background-position:100% 12%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:4;--cols:44;--rows:26;--dx:-160px;--dy:-65px;--rz:-54deg;--z:59px;--d:1108ms;--ps:1;background-size:4400% 2600%;background-position:0% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:4;--cols:44;--rows:26;--dx:-136px;--dy:-91px;--rz:-41deg;--z:57px;--d:1121ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:4;--cols:44;--rows:26;--dx:-167px;--dy:-68px;--rz:-59deg;--z:56px;--d:1134ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:4;--cols:44;--rows:26;--dx:-142px;--dy:-94px;--rz:-46deg;--z:54px;--d:1147ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:4;--cols:44;--rows:26;--dx:-118px;--dy:-71px;--rz:-34deg;--z:52px;--d:1160ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:4;--cols:44;--rows:26;--dx:-94px;--dy:-48px;--rz:-52deg;--z:51px;--d:1173ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:4;--cols:44;--rows:26;--dx:-125px;--dy:-74px;--rz:-39deg;--z:49px;--d:6ms;--ps:0.72;background-size:4400% 2600%;background-position:13.953488372093023% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:4;--cols:44;--rows:26;--dx:-101px;--dy:-51px;--rz:-27deg;--z:47px;--d:19ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:4;--cols:44;--rows:26;--dx:-76px;--dy:-77px;--rz:-45deg;--z:46px;--d:32ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:4;--cols:44;--rows:26;--dx:-107px;--dy:-54px;--rz:-32deg;--z:44px;--d:45ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:4;--cols:44;--rows:26;--dx:-83px;--dy:-80px;--rz:-50deg;--z:43px;--d:58ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:4;--cols:44;--rows:26;--dx:-59px;--dy:-57px;--rz:-38deg;--z:41px;--d:71ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:4;--cols:44;--rows:26;--dx:-89px;--dy:-83px;--rz:-25deg;--z:39px;--d:84ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:4;--cols:44;--rows:26;--dx:-65px;--dy:-60px;--rz:-43deg;--z:38px;--d:97ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:4;--cols:44;--rows:26;--dx:-41px;--dy:-86px;--rz:-31deg;--z:36px;--d:110ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:4;--cols:44;--rows:26;--dx:-72px;--dy:-63px;--rz:-18deg;--z:34px;--d:123ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:4;--cols:44;--rows:26;--dx:-48px;--dy:-89px;--rz:-36deg;--z:33px;--d:136ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:4;--cols:44;--rows:26;--dx:-23px;--dy:-66px;--rz:-23deg;--z:31px;--d:149ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:4;--cols:44;--rows:26;--dx:1px;--dy:-92px;--rz:-11deg;--z:29px;--d:162ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:4;--cols:44;--rows:26;--dx:-30px;--dy:-69px;--rz:-29deg;--z:28px;--d:175ms;--ps:0.72;background-size:4400% 2600%;background-position:44.18604651162791% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:4;--cols:44;--rows:26;--dx:-6px;--dy:-95px;--rz:-16deg;--z:26px;--d:188ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:4;--cols:44;--rows:26;--dx:18px;--dy:-72px;--rz:-4deg;--z:25px;--d:201ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:4;--cols:44;--rows:26;--dx:-12px;--dy:-49px;--rz:-22deg;--z:25px;--d:214ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:4;--cols:44;--rows:26;--dx:12px;--dy:-75px;--rz:-9deg;--z:26px;--d:227ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:4;--cols:44;--rows:26;--dx:36px;--dy:-52px;--rz:4deg;--z:28px;--d:240ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:4;--cols:44;--rows:26;--dx:5px;--dy:-78px;--rz:-15deg;--z:29px;--d:253ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:4;--cols:44;--rows:26;--dx:29px;--dy:-55px;--rz:-2deg;--z:31px;--d:266ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:4;--cols:44;--rows:26;--dx:54px;--dy:-81px;--rz:-20deg;--z:33px;--d:279ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:4;--cols:44;--rows:26;--dx:23px;--dy:-58px;--rz:-7deg;--z:34px;--d:292ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:4;--cols:44;--rows:26;--dx:47px;--dy:-84px;--rz:5deg;--z:36px;--d:305ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:4;--cols:44;--rows:26;--dx:71px;--dy:-61px;--rz:-13deg;--z:38px;--d:318ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:4;--cols:44;--rows:26;--dx:95px;--dy:-87px;--rz:0deg;--z:39px;--d:331ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:4;--cols:44;--rows:26;--dx:65px;--dy:-64px;--rz:12deg;--z:41px;--d:344ms;--ps:0.72;background-size:4400% 2600%;background-position:74.4186046511628% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:4;--cols:44;--rows:26;--dx:89px;--dy:-90px;--rz:-6deg;--z:43px;--d:357ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:4;--cols:44;--rows:26;--dx:113px;--dy:-67px;--rz:7deg;--z:44px;--d:370ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:4;--cols:44;--rows:26;--dx:82px;--dy:-93px;--rz:20deg;--z:46px;--d:383ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:4;--cols:44;--rows:26;--dx:107px;--dy:-70px;--rz:1deg;--z:47px;--d:396ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:4;--cols:44;--rows:26;--dx:131px;--dy:-47px;--rz:14deg;--z:49px;--d:409ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:4;--cols:44;--rows:26;--dx:100px;--dy:-73px;--rz:27deg;--z:51px;--d:422ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:4;--cols:44;--rows:26;--dx:124px;--dy:-50px;--rz:8deg;--z:52px;--d:435ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:4;--cols:44;--rows:26;--dx:148px;--dy:-76px;--rz:21deg;--z:54px;--d:448ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:4;--cols:44;--rows:26;--dx:118px;--dy:-53px;--rz:3deg;--z:56px;--d:461ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:4;--cols:44;--rows:26;--dx:142px;--dy:-79px;--rz:16deg;--z:57px;--d:474ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:4;--cols:44;--rows:26;--dx:166px;--dy:-56px;--rz:28deg;--z:59px;--d:487ms;--ps:1;background-size:4400% 2600%;background-position:100% 16%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:5;--cols:44;--rows:26;--dx:-182px;--dy:-74px;--rz:-64deg;--z:56px;--d:500ms;--ps:1;background-size:4400% 2600%;background-position:0% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:5;--cols:44;--rows:26;--dx:-158px;--dy:-51px;--rz:-51deg;--z:54px;--d:513ms;--ps:0.72;background-size:4400% 2600%;background-position:2.3255813953488373% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:5;--cols:44;--rows:26;--dx:-134px;--dy:-77px;--rz:-38deg;--z:53px;--d:526ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:5;--cols:44;--rows:26;--dx:-109px;--dy:-54px;--rz:-57deg;--z:51px;--d:539ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:5;--cols:44;--rows:26;--dx:-140px;--dy:-80px;--rz:-44deg;--z:49px;--d:552ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:5;--cols:44;--rows:26;--dx:-116px;--dy:-57px;--rz:-31deg;--z:48px;--d:565ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:5;--cols:44;--rows:26;--dx:-92px;--dy:-83px;--rz:-49deg;--z:46px;--d:578ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:5;--cols:44;--rows:26;--dx:-123px;--dy:-60px;--rz:-37deg;--z:45px;--d:591ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:5;--cols:44;--rows:26;--dx:-98px;--dy:-86px;--rz:-24deg;--z:43px;--d:604ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:5;--cols:44;--rows:26;--dx:-74px;--dy:-63px;--rz:-42deg;--z:41px;--d:617ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:5;--cols:44;--rows:26;--dx:-105px;--dy:-40px;--rz:-30deg;--z:40px;--d:630ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:5;--cols:44;--rows:26;--dx:-81px;--dy:-66px;--rz:-17deg;--z:38px;--d:643ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:5;--cols:44;--rows:26;--dx:-56px;--dy:-43px;--rz:-35deg;--z:36px;--d:656ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:5;--cols:44;--rows:26;--dx:-87px;--dy:-69px;--rz:-22deg;--z:35px;--d:669ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:5;--cols:44;--rows:26;--dx:-63px;--dy:-46px;--rz:-41deg;--z:33px;--d:682ms;--ps:0.72;background-size:4400% 2600%;background-position:32.55813953488372% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:5;--cols:44;--rows:26;--dx:-39px;--dy:-72px;--rz:-28deg;--z:32px;--d:695ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:5;--cols:44;--rows:26;--dx:-15px;--dy:-49px;--rz:-15deg;--z:30px;--d:708ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:5;--cols:44;--rows:26;--dx:-45px;--dy:-75px;--rz:-34deg;--z:28px;--d:721ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:5;--cols:44;--rows:26;--dx:-21px;--dy:-52px;--rz:-21deg;--z:27px;--d:734ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:5;--cols:44;--rows:26;--dx:3px;--dy:-78px;--rz:-8deg;--z:25px;--d:747ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:5;--cols:44;--rows:26;--dx:-28px;--dy:-55px;--rz:-26deg;--z:23px;--d:760ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:5;--cols:44;--rows:26;--dx:-4px;--dy:-81px;--rz:-14deg;--z:22px;--d:773ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:5;--cols:44;--rows:26;--dx:21px;--dy:-58px;--rz:-1deg;--z:22px;--d:786ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:5;--cols:44;--rows:26;--dx:-10px;--dy:-84px;--rz:-19deg;--z:23px;--d:799ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:5;--cols:44;--rows:26;--dx:14px;--dy:-61px;--rz:-6deg;--z:25px;--d:812ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:5;--cols:44;--rows:26;--dx:38px;--dy:-87px;--rz:6deg;--z:27px;--d:825ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:5;--cols:44;--rows:26;--dx:7px;--dy:-64px;--rz:-12deg;--z:28px;--d:838ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:5;--cols:44;--rows:26;--dx:32px;--dy:-41px;--rz:1deg;--z:30px;--d:851ms;--ps:0.72;background-size:4400% 2600%;background-position:62.7906976744186% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:5;--cols:44;--rows:26;--dx:56px;--dy:-67px;--rz:-18deg;--z:32px;--d:864ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:5;--cols:44;--rows:26;--dx:80px;--dy:-44px;--rz:-5deg;--z:33px;--d:877ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:5;--cols:44;--rows:26;--dx:49px;--dy:-70px;--rz:8deg;--z:35px;--d:890ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:5;--cols:44;--rows:26;--dx:73px;--dy:-47px;--rz:-10deg;--z:36px;--d:903ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:5;--cols:44;--rows:26;--dx:98px;--dy:-73px;--rz:2deg;--z:38px;--d:916ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:5;--cols:44;--rows:26;--dx:67px;--dy:-50px;--rz:15deg;--z:40px;--d:929ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:5;--cols:44;--rows:26;--dx:91px;--dy:-76px;--rz:-3deg;--z:41px;--d:942ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:5;--cols:44;--rows:26;--dx:115px;--dy:-53px;--rz:9deg;--z:43px;--d:955ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:5;--cols:44;--rows:26;--dx:85px;--dy:-79px;--rz:22deg;--z:45px;--d:968ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:5;--cols:44;--rows:26;--dx:109px;--dy:-56px;--rz:4deg;--z:46px;--d:981ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:5;--cols:44;--rows:26;--dx:133px;--dy:-82px;--rz:17deg;--z:48px;--d:994ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:5;--cols:44;--rows:26;--dx:102px;--dy:-59px;--rz:29deg;--z:49px;--d:1007ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:5;--cols:44;--rows:26;--dx:126px;--dy:-85px;--rz:11deg;--z:51px;--d:1020ms;--ps:0.72;background-size:4400% 2600%;background-position:93.02325581395348% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:5;--cols:44;--rows:26;--dx:151px;--dy:-62px;--rz:24deg;--z:53px;--d:1033ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:5;--cols:44;--rows:26;--dx:175px;--dy:-39px;--rz:36deg;--z:54px;--d:1046ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:5;--cols:44;--rows:26;--dx:144px;--dy:-65px;--rz:18deg;--z:56px;--d:1059ms;--ps:1;background-size:4400% 2600%;background-position:100% 20%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:6;--cols:44;--rows:26;--dx:-149px;--dy:-34px;--rz:-43deg;--z:53px;--d:1072ms;--ps:1;background-size:4400% 2600%;background-position:0% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:6;--cols:44;--rows:26;--dx:-125px;--dy:-60px;--rz:-61deg;--z:52px;--d:1085ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:6;--cols:44;--rows:26;--dx:-156px;--dy:-37px;--rz:-49deg;--z:50px;--d:1098ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:6;--cols:44;--rows:26;--dx:-131px;--dy:-63px;--rz:-36deg;--z:48px;--d:1111ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:6;--cols:44;--rows:26;--dx:-107px;--dy:-40px;--rz:-54deg;--z:47px;--d:1124ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:6;--cols:44;--rows:26;--dx:-138px;--dy:-66px;--rz:-41deg;--z:45px;--d:1137ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:6;--cols:44;--rows:26;--dx:-114px;--dy:-43px;--rz:-29deg;--z:43px;--d:1150ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:6;--cols:44;--rows:26;--dx:-90px;--dy:-69px;--rz:-47deg;--z:42px;--d:1163ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:6;--cols:44;--rows:26;--dx:-120px;--dy:-46px;--rz:-34deg;--z:40px;--d:1176ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:6;--cols:44;--rows:26;--dx:-96px;--dy:-72px;--rz:-21deg;--z:39px;--d:9ms;--ps:0.72;background-size:4400% 2600%;background-position:20.930232558139537% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:6;--cols:44;--rows:26;--dx:-72px;--dy:-49px;--rz:-40deg;--z:37px;--d:22ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:6;--cols:44;--rows:26;--dx:-103px;--dy:-75px;--rz:-27deg;--z:35px;--d:35ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:6;--cols:44;--rows:26;--dx:-78px;--dy:-52px;--rz:-14deg;--z:34px;--d:48ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:6;--cols:44;--rows:26;--dx:-54px;--dy:-78px;--rz:-33deg;--z:32px;--d:61ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:6;--cols:44;--rows:26;--dx:-30px;--dy:-55px;--rz:-20deg;--z:30px;--d:74ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:6;--cols:44;--rows:26;--dx:-61px;--dy:-32px;--rz:-38deg;--z:29px;--d:87ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:6;--cols:44;--rows:26;--dx:-37px;--dy:-58px;--rz:-25deg;--z:27px;--d:100ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:6;--cols:44;--rows:26;--dx:-12px;--dy:-35px;--rz:-13deg;--z:26px;--d:113ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:6;--cols:44;--rows:26;--dx:-43px;--dy:-61px;--rz:-31deg;--z:24px;--d:126ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:6;--cols:44;--rows:26;--dx:-19px;--dy:-38px;--rz:-18deg;--z:22px;--d:139ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:6;--cols:44;--rows:26;--dx:5px;--dy:-64px;--rz:-6deg;--z:21px;--d:152ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:6;--cols:44;--rows:26;--dx:-26px;--dy:-41px;--rz:-24deg;--z:19px;--d:165ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:6;--cols:44;--rows:26;--dx:-1px;--dy:-67px;--rz:-11deg;--z:19px;--d:178ms;--ps:0.72;background-size:4400% 2600%;background-position:51.162790697674424% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:6;--cols:44;--rows:26;--dx:23px;--dy:-44px;--rz:2deg;--z:21px;--d:191ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:6;--cols:44;--rows:26;--dx:-8px;--dy:-70px;--rz:-17deg;--z:22px;--d:204ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:6;--cols:44;--rows:26;--dx:16px;--dy:-47px;--rz:-4deg;--z:24px;--d:217ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:6;--cols:44;--rows:26;--dx:40px;--dy:-73px;--rz:9deg;--z:26px;--d:230ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:6;--cols:44;--rows:26;--dx:65px;--dy:-50px;--rz:-9deg;--z:27px;--d:243ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:6;--cols:44;--rows:26;--dx:34px;--dy:-76px;--rz:3deg;--z:29px;--d:256ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:6;--cols:44;--rows:26;--dx:58px;--dy:-53px;--rz:16deg;--z:30px;--d:269ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:6;--cols:44;--rows:26;--dx:82px;--dy:-79px;--rz:-2deg;--z:32px;--d:282ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:6;--cols:44;--rows:26;--dx:51px;--dy:-56px;--rz:10deg;--z:34px;--d:295ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:6;--cols:44;--rows:26;--dx:76px;--dy:-33px;--rz:-8deg;--z:35px;--d:308ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:6;--cols:44;--rows:26;--dx:100px;--dy:-59px;--rz:5deg;--z:37px;--d:321ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:6;--cols:44;--rows:26;--dx:69px;--dy:-36px;--rz:18deg;--z:39px;--d:334ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:6;--cols:44;--rows:26;--dx:93px;--dy:-62px;--rz:-1deg;--z:40px;--d:347ms;--ps:0.72;background-size:4400% 2600%;background-position:81.3953488372093% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:6;--cols:44;--rows:26;--dx:118px;--dy:-39px;--rz:12deg;--z:42px;--d:360ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:6;--cols:44;--rows:26;--dx:87px;--dy:-65px;--rz:25deg;--z:43px;--d:373ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:6;--cols:44;--rows:26;--dx:111px;--dy:-42px;--rz:6deg;--z:45px;--d:386ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:6;--cols:44;--rows:26;--dx:135px;--dy:-68px;--rz:19deg;--z:47px;--d:399ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:6;--cols:44;--rows:26;--dx:159px;--dy:-45px;--rz:32deg;--z:48px;--d:412ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:6;--cols:44;--rows:26;--dx:129px;--dy:-71px;--rz:14deg;--z:50px;--d:425ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:6;--cols:44;--rows:26;--dx:153px;--dy:-48px;--rz:26deg;--z:52px;--d:438ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:6;--cols:44;--rows:26;--dx:177px;--dy:-74px;--rz:39deg;--z:53px;--d:451ms;--ps:1;background-size:4400% 2600%;background-position:100% 24%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:7;--cols:44;--rows:26;--dx:-171px;--dy:-42px;--rz:-53deg;--z:50px;--d:464ms;--ps:1;background-size:4400% 2600%;background-position:0% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:7;--cols:44;--rows:26;--dx:-147px;--dy:-68px;--rz:-40deg;--z:49px;--d:477ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:7;--cols:44;--rows:26;--dx:-123px;--dy:-45px;--rz:-59deg;--z:47px;--d:490ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:7;--cols:44;--rows:26;--dx:-153px;--dy:-22px;--rz:-46deg;--z:46px;--d:503ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:7;--cols:44;--rows:26;--dx:-129px;--dy:-48px;--rz:-33deg;--z:44px;--d:516ms;--ps:0.72;background-size:4400% 2600%;background-position:9.30232558139535% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:7;--cols:44;--rows:26;--dx:-105px;--dy:-25px;--rz:-52deg;--z:42px;--d:529ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:7;--cols:44;--rows:26;--dx:-136px;--dy:-51px;--rz:-39deg;--z:41px;--d:542ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:7;--cols:44;--rows:26;--dx:-112px;--dy:-28px;--rz:-26deg;--z:39px;--d:555ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:7;--cols:44;--rows:26;--dx:-87px;--dy:-54px;--rz:-44deg;--z:37px;--d:568ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:7;--cols:44;--rows:26;--dx:-63px;--dy:-31px;--rz:-32deg;--z:36px;--d:581ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:7;--cols:44;--rows:26;--dx:-94px;--dy:-57px;--rz:-19deg;--z:34px;--d:594ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:7;--cols:44;--rows:26;--dx:-70px;--dy:-34px;--rz:-37deg;--z:32px;--d:607ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:7;--cols:44;--rows:26;--dx:-45px;--dy:-60px;--rz:-24deg;--z:31px;--d:620ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:7;--cols:44;--rows:26;--dx:-76px;--dy:-37px;--rz:-12deg;--z:29px;--d:633ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:7;--cols:44;--rows:26;--dx:-52px;--dy:-63px;--rz:-30deg;--z:28px;--d:646ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:7;--cols:44;--rows:26;--dx:-28px;--dy:-40px;--rz:-17deg;--z:26px;--d:659ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:7;--cols:44;--rows:26;--dx:-59px;--dy:-66px;--rz:-5deg;--z:24px;--d:672ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:7;--cols:44;--rows:26;--dx:-34px;--dy:-43px;--rz:-23deg;--z:23px;--d:685ms;--ps:0.72;background-size:4400% 2600%;background-position:39.53488372093023% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:7;--cols:44;--rows:26;--dx:-10px;--dy:-69px;--rz:-10deg;--z:21px;--d:698ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:7;--cols:44;--rows:26;--dx:-41px;--dy:-46px;--rz:-28deg;--z:19px;--d:711ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:7;--cols:44;--rows:26;--dx:-17px;--dy:-23px;--rz:-16deg;--z:18px;--d:724ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:7;--cols:44;--rows:26;--dx:7px;--dy:-49px;--rz:-3deg;--z:16px;--d:737ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:7;--cols:44;--rows:26;--dx:-23px;--dy:-26px;--rz:-21deg;--z:16px;--d:750ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:7;--cols:44;--rows:26;--dx:1px;--dy:-52px;--rz:-9deg;--z:18px;--d:763ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:7;--cols:44;--rows:26;--dx:25px;--dy:-29px;--rz:4deg;--z:19px;--d:776ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:7;--cols:44;--rows:26;--dx:49px;--dy:-55px;--rz:-14deg;--z:21px;--d:789ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:7;--cols:44;--rows:26;--dx:18px;--dy:-32px;--rz:-1deg;--z:23px;--d:802ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:7;--cols:44;--rows:26;--dx:43px;--dy:-58px;--rz:11deg;--z:24px;--d:815ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:7;--cols:44;--rows:26;--dx:67px;--dy:-35px;--rz:-7deg;--z:26px;--d:828ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:7;--cols:44;--rows:26;--dx:36px;--dy:-61px;--rz:6deg;--z:28px;--d:841ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:7;--cols:44;--rows:26;--dx:60px;--dy:-38px;--rz:19deg;--z:29px;--d:854ms;--ps:0.72;background-size:4400% 2600%;background-position:69.76744186046511% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:7;--cols:44;--rows:26;--dx:84px;--dy:-64px;--rz:0deg;--z:31px;--d:867ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:7;--cols:44;--rows:26;--dx:54px;--dy:-41px;--rz:13deg;--z:32px;--d:880ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:7;--cols:44;--rows:26;--dx:78px;--dy:-67px;--rz:-5deg;--z:34px;--d:893ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:7;--cols:44;--rows:26;--dx:102px;--dy:-44px;--rz:7deg;--z:36px;--d:906ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:7;--cols:44;--rows:26;--dx:71px;--dy:-70px;--rz:20deg;--z:37px;--d:919ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:7;--cols:44;--rows:26;--dx:96px;--dy:-47px;--rz:2deg;--z:39px;--d:932ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:7;--cols:44;--rows:26;--dx:120px;--dy:-24px;--rz:15deg;--z:41px;--d:945ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:7;--cols:44;--rows:26;--dx:144px;--dy:-50px;--rz:27deg;--z:42px;--d:958ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:7;--cols:44;--rows:26;--dx:113px;--dy:-27px;--rz:9deg;--z:44px;--d:971ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:7;--cols:44;--rows:26;--dx:137px;--dy:-53px;--rz:22deg;--z:46px;--d:984ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:7;--cols:44;--rows:26;--dx:162px;--dy:-30px;--rz:34deg;--z:47px;--d:997ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:7;--cols:44;--rows:26;--dx:131px;--dy:-56px;--rz:16deg;--z:49px;--d:1010ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:7;--cols:44;--rows:26;--dx:155px;--dy:-33px;--rz:29deg;--z:50px;--d:1023ms;--ps:0.72;background-size:4400% 2600%;background-position:100% 28.000000000000004%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:8;--cols:44;--rows:26;--dx:-138px;--dy:-51px;--rz:-32deg;--z:48px;--d:1036ms;--ps:1;background-size:4400% 2600%;background-position:0% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:8;--cols:44;--rows:26;--dx:-169px;--dy:-28px;--rz:-51deg;--z:46px;--d:1049ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:8;--cols:44;--rows:26;--dx:-145px;--dy:-54px;--rz:-38deg;--z:44px;--d:1062ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:8;--cols:44;--rows:26;--dx:-120px;--dy:-31px;--rz:-25deg;--z:43px;--d:1075ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:8;--cols:44;--rows:26;--dx:-151px;--dy:-57px;--rz:-43deg;--z:41px;--d:1088ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:8;--cols:44;--rows:26;--dx:-127px;--dy:-34px;--rz:-31deg;--z:39px;--d:1101ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:8;--cols:44;--rows:26;--dx:-103px;--dy:-60px;--rz:-49deg;--z:38px;--d:1114ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:8;--cols:44;--rows:26;--dx:-79px;--dy:-37px;--rz:-36deg;--z:36px;--d:1127ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:8;--cols:44;--rows:26;--dx:-109px;--dy:-14px;--rz:-24deg;--z:35px;--d:1140ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:8;--cols:44;--rows:26;--dx:-85px;--dy:-40px;--rz:-42deg;--z:33px;--d:1153ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:8;--cols:44;--rows:26;--dx:-61px;--dy:-17px;--rz:-29deg;--z:31px;--d:1166ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:8;--cols:44;--rows:26;--dx:-92px;--dy:-43px;--rz:-16deg;--z:30px;--d:1179ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:8;--cols:44;--rows:26;--dx:-67px;--dy:-20px;--rz:-35deg;--z:28px;--d:12ms;--ps:0.72;background-size:4400% 2600%;background-position:27.906976744186046% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:8;--cols:44;--rows:26;--dx:-43px;--dy:-46px;--rz:-22deg;--z:26px;--d:25ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:8;--cols:44;--rows:26;--dx:-74px;--dy:-23px;--rz:-9deg;--z:25px;--d:38ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:8;--cols:44;--rows:26;--dx:-50px;--dy:-49px;--rz:-27deg;--z:23px;--d:51ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:8;--cols:44;--rows:26;--dx:-26px;--dy:-26px;--rz:-15deg;--z:22px;--d:64ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:8;--cols:44;--rows:26;--dx:-56px;--dy:-52px;--rz:-2deg;--z:20px;--d:77ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:8;--cols:44;--rows:26;--dx:-32px;--dy:-29px;--rz:-20deg;--z:18px;--d:90ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:8;--cols:44;--rows:26;--dx:-8px;--dy:-55px;--rz:-8deg;--z:17px;--d:103ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:8;--cols:44;--rows:26;--dx:16px;--dy:-32px;--rz:-26deg;--z:15px;--d:116ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:8;--cols:44;--rows:26;--dx:-15px;--dy:-58px;--rz:-13deg;--z:13px;--d:129ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:8;--cols:44;--rows:26;--dx:10px;--dy:-35px;--rz:0deg;--z:13px;--d:142ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:8;--cols:44;--rows:26;--dx:34px;--dy:-61px;--rz:-19deg;--z:15px;--d:155ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:8;--cols:44;--rows:26;--dx:3px;--dy:-38px;--rz:-6deg;--z:17px;--d:168ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:8;--cols:44;--rows:26;--dx:27px;--dy:-15px;--rz:7deg;--z:18px;--d:181ms;--ps:0.72;background-size:4400% 2600%;background-position:58.139534883720934% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:8;--cols:44;--rows:26;--dx:51px;--dy:-41px;--rz:-12deg;--z:20px;--d:194ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:8;--cols:44;--rows:26;--dx:21px;--dy:-18px;--rz:1deg;--z:22px;--d:207ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:8;--cols:44;--rows:26;--dx:45px;--dy:-44px;--rz:14deg;--z:23px;--d:220ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:8;--cols:44;--rows:26;--dx:69px;--dy:-21px;--rz:-4deg;--z:25px;--d:233ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:8;--cols:44;--rows:26;--dx:38px;--dy:-47px;--rz:8deg;--z:26px;--d:246ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:8;--cols:44;--rows:26;--dx:62px;--dy:-24px;--rz:21deg;--z:28px;--d:259ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:8;--cols:44;--rows:26;--dx:87px;--dy:-50px;--rz:3deg;--z:30px;--d:272ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:8;--cols:44;--rows:26;--dx:56px;--dy:-27px;--rz:16deg;--z:31px;--d:285ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:8;--cols:44;--rows:26;--dx:80px;--dy:-53px;--rz:28deg;--z:33px;--d:298ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:8;--cols:44;--rows:26;--dx:104px;--dy:-30px;--rz:10deg;--z:35px;--d:311ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:8;--cols:44;--rows:26;--dx:129px;--dy:-56px;--rz:23deg;--z:36px;--d:324ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:8;--cols:44;--rows:26;--dx:98px;--dy:-33px;--rz:4deg;--z:38px;--d:337ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:8;--cols:44;--rows:26;--dx:122px;--dy:-59px;--rz:17deg;--z:39px;--d:350ms;--ps:0.72;background-size:4400% 2600%;background-position:88.37209302325581% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:8;--cols:44;--rows:26;--dx:146px;--dy:-36px;--rz:30deg;--z:41px;--d:363ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:8;--cols:44;--rows:26;--dx:115px;--dy:-62px;--rz:12deg;--z:43px;--d:376ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:8;--cols:44;--rows:26;--dx:140px;--dy:-39px;--rz:24deg;--z:44px;--d:389ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:8;--cols:44;--rows:26;--dx:164px;--dy:-16px;--rz:37deg;--z:46px;--d:402ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:8;--cols:44;--rows:26;--dx:133px;--dy:-42px;--rz:19deg;--z:48px;--d:415ms;--ps:1;background-size:4400% 2600%;background-position:100% 32%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:9;--cols:44;--rows:26;--dx:-160px;--dy:-10px;--rz:-42deg;--z:45px;--d:428ms;--ps:1;background-size:4400% 2600%;background-position:0% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:9;--cols:44;--rows:26;--dx:-136px;--dy:-36px;--rz:-30deg;--z:43px;--d:441ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:9;--cols:44;--rows:26;--dx:-167px;--dy:-13px;--rz:-48deg;--z:42px;--d:454ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:9;--cols:44;--rows:26;--dx:-142px;--dy:-39px;--rz:-35deg;--z:40px;--d:467ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:9;--cols:44;--rows:26;--dx:-118px;--dy:-16px;--rz:-23deg;--z:38px;--d:480ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:9;--cols:44;--rows:26;--dx:-94px;--dy:-42px;--rz:-41deg;--z:37px;--d:493ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:9;--cols:44;--rows:26;--dx:-125px;--dy:-19px;--rz:-28deg;--z:35px;--d:506ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:9;--cols:44;--rows:26;--dx:-101px;--dy:-45px;--rz:-46deg;--z:33px;--d:519ms;--ps:0.72;background-size:4400% 2600%;background-position:16.27906976744186% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:9;--cols:44;--rows:26;--dx:-76px;--dy:-22px;--rz:-34deg;--z:32px;--d:532ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:9;--cols:44;--rows:26;--dx:-107px;--dy:-48px;--rz:-21deg;--z:30px;--d:545ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:9;--cols:44;--rows:26;--dx:-83px;--dy:-25px;--rz:-39deg;--z:29px;--d:558ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:9;--cols:44;--rows:26;--dx:-59px;--dy:-51px;--rz:-27deg;--z:27px;--d:571ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:9;--cols:44;--rows:26;--dx:-89px;--dy:-28px;--rz:-14deg;--z:25px;--d:584ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:9;--cols:44;--rows:26;--dx:-65px;--dy:-5px;--rz:-32deg;--z:24px;--d:597ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:9;--cols:44;--rows:26;--dx:-41px;--dy:-31px;--rz:-19deg;--z:22px;--d:610ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:9;--cols:44;--rows:26;--dx:-72px;--dy:-8px;--rz:-7deg;--z:20px;--d:623ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:9;--cols:44;--rows:26;--dx:-48px;--dy:-34px;--rz:-25deg;--z:19px;--d:636ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:9;--cols:44;--rows:26;--dx:-23px;--dy:-11px;--rz:-12deg;--z:17px;--d:649ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:9;--cols:44;--rows:26;--dx:1px;--dy:-37px;--rz:1deg;--z:15px;--d:662ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:9;--cols:44;--rows:26;--dx:-30px;--dy:-14px;--rz:-18deg;--z:14px;--d:675ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:9;--cols:44;--rows:26;--dx:-6px;--dy:-40px;--rz:-5deg;--z:12px;--d:688ms;--ps:0.72;background-size:4400% 2600%;background-position:46.51162790697674% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:9;--cols:44;--rows:26;--dx:18px;--dy:-17px;--rz:8deg;--z:11px;--d:701ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:9;--cols:44;--rows:26;--dx:-12px;--dy:-43px;--rz:-11deg;--z:11px;--d:714ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:9;--cols:44;--rows:26;--dx:12px;--dy:-20px;--rz:2deg;--z:12px;--d:727ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:9;--cols:44;--rows:26;--dx:36px;--dy:-46px;--rz:-16deg;--z:14px;--d:740ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:9;--cols:44;--rows:26;--dx:5px;--dy:-23px;--rz:-3deg;--z:15px;--d:753ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:9;--cols:44;--rows:26;--dx:29px;--dy:-49px;--rz:9deg;--z:17px;--d:766ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:9;--cols:44;--rows:26;--dx:54px;--dy:-26px;--rz:-9deg;--z:19px;--d:779ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:9;--cols:44;--rows:26;--dx:23px;--dy:-52px;--rz:4deg;--z:20px;--d:792ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:9;--cols:44;--rows:26;--dx:47px;--dy:-29px;--rz:16deg;--z:22px;--d:805ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:9;--cols:44;--rows:26;--dx:71px;--dy:-6px;--rz:-2deg;--z:24px;--d:818ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:9;--cols:44;--rows:26;--dx:95px;--dy:-32px;--rz:11deg;--z:25px;--d:831ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:9;--cols:44;--rows:26;--dx:65px;--dy:-9px;--rz:24deg;--z:27px;--d:844ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:9;--cols:44;--rows:26;--dx:89px;--dy:-35px;--rz:5deg;--z:29px;--d:857ms;--ps:0.72;background-size:4400% 2600%;background-position:76.74418604651163% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:9;--cols:44;--rows:26;--dx:113px;--dy:-12px;--rz:18deg;--z:30px;--d:870ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:9;--cols:44;--rows:26;--dx:82px;--dy:-38px;--rz:31deg;--z:32px;--d:883ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:9;--cols:44;--rows:26;--dx:107px;--dy:-15px;--rz:13deg;--z:33px;--d:896ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:9;--cols:44;--rows:26;--dx:131px;--dy:-41px;--rz:25deg;--z:35px;--d:909ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:9;--cols:44;--rows:26;--dx:100px;--dy:-18px;--rz:7deg;--z:37px;--d:922ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:9;--cols:44;--rows:26;--dx:124px;--dy:-44px;--rz:20deg;--z:38px;--d:935ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:9;--cols:44;--rows:26;--dx:148px;--dy:-21px;--rz:32deg;--z:40px;--d:948ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:9;--cols:44;--rows:26;--dx:118px;--dy:-47px;--rz:14deg;--z:42px;--d:961ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:9;--cols:44;--rows:26;--dx:142px;--dy:-24px;--rz:27deg;--z:43px;--d:974ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:9;--cols:44;--rows:26;--dx:166px;--dy:-50px;--rz:40deg;--z:45px;--d:987ms;--ps:1;background-size:4400% 2600%;background-position:100% 36%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:10;--cols:44;--rows:26;--dx:-182px;--dy:-19px;--rz:-53deg;--z:42px;--d:1000ms;--ps:1;background-size:4400% 2600%;background-position:0% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:10;--cols:44;--rows:26;--dx:-158px;--dy:-45px;--rz:-40deg;--z:40px;--d:1013ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:10;--cols:44;--rows:26;--dx:-134px;--dy:-22px;--rz:-27deg;--z:39px;--d:1026ms;--ps:0.72;background-size:4400% 2600%;background-position:4.651162790697675% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:10;--cols:44;--rows:26;--dx:-109px;--dy:1px;--rz:-45deg;--z:37px;--d:1039ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:10;--cols:44;--rows:26;--dx:-140px;--dy:-25px;--rz:-33deg;--z:35px;--d:1052ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:10;--cols:44;--rows:26;--dx:-116px;--dy:-2px;--rz:-20deg;--z:34px;--d:1065ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:10;--cols:44;--rows:26;--dx:-92px;--dy:-28px;--rz:-38deg;--z:32px;--d:1078ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:10;--cols:44;--rows:26;--dx:-123px;--dy:-5px;--rz:-26deg;--z:31px;--d:1091ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:10;--cols:44;--rows:26;--dx:-98px;--dy:-31px;--rz:-13deg;--z:29px;--d:1104ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:10;--cols:44;--rows:26;--dx:-74px;--dy:-8px;--rz:-31deg;--z:27px;--d:1117ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:10;--cols:44;--rows:26;--dx:-105px;--dy:-34px;--rz:-18deg;--z:26px;--d:1130ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:10;--cols:44;--rows:26;--dx:-81px;--dy:-11px;--rz:-37deg;--z:24px;--d:1143ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:10;--cols:44;--rows:26;--dx:-56px;--dy:-37px;--rz:-24deg;--z:22px;--d:1156ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:10;--cols:44;--rows:26;--dx:-87px;--dy:-14px;--rz:-11deg;--z:21px;--d:1169ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:10;--cols:44;--rows:26;--dx:-63px;--dy:-40px;--rz:-30deg;--z:19px;--d:2ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:10;--cols:44;--rows:26;--dx:-39px;--dy:-17px;--rz:-17deg;--z:18px;--d:15ms;--ps:0.72;background-size:4400% 2600%;background-position:34.883720930232556% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:10;--cols:44;--rows:26;--dx:-15px;--dy:-43px;--rz:-4deg;--z:16px;--d:28ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:10;--cols:44;--rows:26;--dx:-45px;--dy:-20px;--rz:-22deg;--z:14px;--d:41ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:10;--cols:44;--rows:26;--dx:-21px;--dy:3px;--rz:-10deg;--z:13px;--d:54ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:10;--cols:44;--rows:26;--dx:3px;--dy:-23px;--rz:3deg;--z:11px;--d:67ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:10;--cols:44;--rows:26;--dx:-28px;--dy:0px;--rz:-15deg;--z:9px;--d:80ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:10;--cols:44;--rows:26;--dx:-4px;--dy:-26px;--rz:-2deg;--z:8px;--d:93ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:10;--cols:44;--rows:26;--dx:21px;--dy:-3px;--rz:10deg;--z:8px;--d:106ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:10;--cols:44;--rows:26;--dx:-10px;--dy:-29px;--rz:-8deg;--z:9px;--d:119ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:10;--cols:44;--rows:26;--dx:14px;--dy:-6px;--rz:5deg;--z:11px;--d:132ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:10;--cols:44;--rows:26;--dx:38px;--dy:-32px;--rz:-14deg;--z:13px;--d:145ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:10;--cols:44;--rows:26;--dx:7px;--dy:-9px;--rz:-1deg;--z:14px;--d:158ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:10;--cols:44;--rows:26;--dx:32px;--dy:-35px;--rz:12deg;--z:16px;--d:171ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:10;--cols:44;--rows:26;--dx:56px;--dy:-12px;--rz:-6deg;--z:18px;--d:184ms;--ps:0.72;background-size:4400% 2600%;background-position:65.11627906976744% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:10;--cols:44;--rows:26;--dx:80px;--dy:-38px;--rz:6deg;--z:19px;--d:197ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:10;--cols:44;--rows:26;--dx:49px;--dy:-15px;--rz:19deg;--z:21px;--d:210ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:10;--cols:44;--rows:26;--dx:73px;--dy:-41px;--rz:1deg;--z:22px;--d:223ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:10;--cols:44;--rows:26;--dx:98px;--dy:-18px;--rz:13deg;--z:24px;--d:236ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:10;--cols:44;--rows:26;--dx:67px;--dy:-44px;--rz:26deg;--z:26px;--d:249ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:10;--cols:44;--rows:26;--dx:91px;--dy:-21px;--rz:8deg;--z:27px;--d:262ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:10;--cols:44;--rows:26;--dx:115px;--dy:2px;--rz:21deg;--z:29px;--d:275ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:10;--cols:44;--rows:26;--dx:85px;--dy:-24px;--rz:33deg;--z:31px;--d:288ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:10;--cols:44;--rows:26;--dx:109px;--dy:-1px;--rz:15deg;--z:32px;--d:301ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:10;--cols:44;--rows:26;--dx:133px;--dy:-27px;--rz:28deg;--z:34px;--d:314ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:10;--cols:44;--rows:26;--dx:102px;--dy:-4px;--rz:41deg;--z:35px;--d:327ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:10;--cols:44;--rows:26;--dx:126px;--dy:-30px;--rz:22deg;--z:37px;--d:340ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:10;--cols:44;--rows:26;--dx:151px;--dy:-7px;--rz:35deg;--z:39px;--d:353ms;--ps:0.72;background-size:4400% 2600%;background-position:95.34883720930233% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:10;--cols:44;--rows:26;--dx:175px;--dy:-33px;--rz:17deg;--z:40px;--d:366ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:10;--cols:44;--rows:26;--dx:144px;--dy:-10px;--rz:29deg;--z:42px;--d:379ms;--ps:1;background-size:4400% 2600%;background-position:100% 40%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:11;--cols:44;--rows:26;--dx:-149px;--dy:-28px;--rz:-32deg;--z:39px;--d:392ms;--ps:1;background-size:4400% 2600%;background-position:0% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:11;--cols:44;--rows:26;--dx:-125px;--dy:-5px;--rz:-50deg;--z:38px;--d:405ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:11;--cols:44;--rows:26;--dx:-156px;--dy:-31px;--rz:-37deg;--z:36px;--d:418ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:11;--cols:44;--rows:26;--dx:-131px;--dy:-8px;--rz:-25deg;--z:34px;--d:431ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:11;--cols:44;--rows:26;--dx:-107px;--dy:-34px;--rz:-43deg;--z:33px;--d:444ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:11;--cols:44;--rows:26;--dx:-138px;--dy:-11px;--rz:-30deg;--z:31px;--d:457ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:11;--cols:44;--rows:26;--dx:-114px;--dy:-37px;--rz:-17deg;--z:29px;--d:470ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:11;--cols:44;--rows:26;--dx:-90px;--dy:-14px;--rz:-36deg;--z:28px;--d:483ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:11;--cols:44;--rows:26;--dx:-120px;--dy:9px;--rz:-23deg;--z:26px;--d:496ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:11;--cols:44;--rows:26;--dx:-96px;--dy:-17px;--rz:-10deg;--z:25px;--d:509ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:11;--cols:44;--rows:26;--dx:-72px;--dy:6px;--rz:-29deg;--z:23px;--d:522ms;--ps:0.72;background-size:4400% 2600%;background-position:23.25581395348837% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:11;--cols:44;--rows:26;--dx:-103px;--dy:-20px;--rz:-16deg;--z:21px;--d:535ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:11;--cols:44;--rows:26;--dx:-78px;--dy:3px;--rz:-34deg;--z:20px;--d:548ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:11;--cols:44;--rows:26;--dx:-54px;--dy:-23px;--rz:-21deg;--z:18px;--d:561ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:11;--cols:44;--rows:26;--dx:-30px;--dy:0px;--rz:-9deg;--z:16px;--d:574ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:11;--cols:44;--rows:26;--dx:-61px;--dy:-26px;--rz:-27deg;--z:15px;--d:587ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:11;--cols:44;--rows:26;--dx:-37px;--dy:-3px;--rz:-14deg;--z:13px;--d:600ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:11;--cols:44;--rows:26;--dx:-12px;--dy:-29px;--rz:-2deg;--z:12px;--d:613ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:11;--cols:44;--rows:26;--dx:-43px;--dy:-6px;--rz:-20deg;--z:10px;--d:626ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:11;--cols:44;--rows:26;--dx:-19px;--dy:-32px;--rz:-7deg;--z:8px;--d:639ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:11;--cols:44;--rows:26;--dx:5px;--dy:-9px;--rz:6deg;--z:7px;--d:652ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:11;--cols:44;--rows:26;--dx:-26px;--dy:-35px;--rz:-13deg;--z:5px;--d:665ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:11;--cols:44;--rows:26;--dx:-1px;--dy:-12px;--rz:0deg;--z:5px;--d:678ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:11;--cols:44;--rows:26;--dx:23px;--dy:11px;--rz:13deg;--z:7px;--d:691ms;--ps:0.72;background-size:4400% 2600%;background-position:53.48837209302325% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:11;--cols:44;--rows:26;--dx:-8px;--dy:-15px;--rz:-5deg;--z:8px;--d:704ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:11;--cols:44;--rows:26;--dx:16px;--dy:8px;--rz:7deg;--z:10px;--d:717ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:11;--cols:44;--rows:26;--dx:40px;--dy:-18px;--rz:20deg;--z:12px;--d:730ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:11;--cols:44;--rows:26;--dx:65px;--dy:5px;--rz:2deg;--z:13px;--d:743ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:11;--cols:44;--rows:26;--dx:34px;--dy:-21px;--rz:14deg;--z:15px;--d:756ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:11;--cols:44;--rows:26;--dx:58px;--dy:2px;--rz:-4deg;--z:16px;--d:769ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:11;--cols:44;--rows:26;--dx:82px;--dy:-24px;--rz:9deg;--z:18px;--d:782ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:11;--cols:44;--rows:26;--dx:51px;--dy:-1px;--rz:22deg;--z:20px;--d:795ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:11;--cols:44;--rows:26;--dx:76px;--dy:-27px;--rz:3deg;--z:21px;--d:808ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:11;--cols:44;--rows:26;--dx:100px;--dy:-4px;--rz:16deg;--z:23px;--d:821ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:11;--cols:44;--rows:26;--dx:69px;--dy:-30px;--rz:29deg;--z:25px;--d:834ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:11;--cols:44;--rows:26;--dx:93px;--dy:-7px;--rz:10deg;--z:26px;--d:847ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:11;--cols:44;--rows:26;--dx:118px;--dy:-33px;--rz:23deg;--z:28px;--d:860ms;--ps:0.72;background-size:4400% 2600%;background-position:83.72093023255815% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:11;--cols:44;--rows:26;--dx:87px;--dy:-10px;--rz:36deg;--z:29px;--d:873ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:11;--cols:44;--rows:26;--dx:111px;--dy:-36px;--rz:18deg;--z:31px;--d:886ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:11;--cols:44;--rows:26;--dx:135px;--dy:-13px;--rz:30deg;--z:33px;--d:899ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:11;--cols:44;--rows:26;--dx:159px;--dy:10px;--rz:43deg;--z:34px;--d:912ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:11;--cols:44;--rows:26;--dx:129px;--dy:-16px;--rz:25deg;--z:36px;--d:925ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:11;--cols:44;--rows:26;--dx:153px;--dy:7px;--rz:38deg;--z:38px;--d:938ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:11;--cols:44;--rows:26;--dx:177px;--dy:-19px;--rz:19deg;--z:39px;--d:951ms;--ps:1;background-size:4400% 2600%;background-position:100% 44%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:12;--cols:44;--rows:26;--dx:-171px;--dy:13px;--rz:-42deg;--z:36px;--d:964ms;--ps:1;background-size:4400% 2600%;background-position:0% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:12;--cols:44;--rows:26;--dx:-147px;--dy:-13px;--rz:-29deg;--z:35px;--d:977ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:12;--cols:44;--rows:26;--dx:-123px;--dy:10px;--rz:-47deg;--z:33px;--d:990ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:12;--cols:44;--rows:26;--dx:-153px;--dy:-16px;--rz:-35deg;--z:32px;--d:1003ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:12;--cols:44;--rows:26;--dx:-129px;--dy:7px;--rz:-22deg;--z:30px;--d:1016ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:12;--cols:44;--rows:26;--dx:-105px;--dy:-19px;--rz:-40deg;--z:28px;--d:1029ms;--ps:0.72;background-size:4400% 2600%;background-position:11.627906976744185% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:12;--cols:44;--rows:26;--dx:-136px;--dy:4px;--rz:-28deg;--z:27px;--d:1042ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:12;--cols:44;--rows:26;--dx:-112px;--dy:-22px;--rz:-15deg;--z:25px;--d:1055ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:12;--cols:44;--rows:26;--dx:-87px;--dy:1px;--rz:-33deg;--z:23px;--d:1068ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:12;--cols:44;--rows:26;--dx:-63px;--dy:-25px;--rz:-20deg;--z:22px;--d:1081ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:12;--cols:44;--rows:26;--dx:-94px;--dy:-2px;--rz:-8deg;--z:20px;--d:1094ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:12;--cols:44;--rows:26;--dx:-70px;--dy:-28px;--rz:-26deg;--z:18px;--d:1107ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:12;--cols:44;--rows:26;--dx:-45px;--dy:-5px;--rz:-13deg;--z:17px;--d:1120ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:12;--cols:44;--rows:26;--dx:-76px;--dy:18px;--rz:-1deg;--z:15px;--d:1133ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:12;--cols:44;--rows:26;--dx:-52px;--dy:-8px;--rz:-19deg;--z:14px;--d:1146ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:12;--cols:44;--rows:26;--dx:-28px;--dy:15px;--rz:-6deg;--z:12px;--d:1159ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:12;--cols:44;--rows:26;--dx:-59px;--dy:-11px;--rz:-24deg;--z:10px;--d:1172ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:12;--cols:44;--rows:26;--dx:-34px;--dy:12px;--rz:-12deg;--z:9px;--d:5ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:12;--cols:44;--rows:26;--dx:-10px;--dy:-14px;--rz:1deg;--z:7px;--d:18ms;--ps:0.72;background-size:4400% 2600%;background-position:41.86046511627907% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:12;--cols:44;--rows:26;--dx:-41px;--dy:9px;--rz:-17deg;--z:5px;--d:31ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:12;--cols:44;--rows:26;--dx:-17px;--dy:-17px;--rz:-5deg;--z:4px;--d:44ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:12;--cols:44;--rows:26;--dx:7px;--dy:6px;--rz:8deg;--z:2px;--d:57ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:12;--cols:44;--rows:26;--dx:-23px;--dy:-20px;--rz:-10deg;--z:2px;--d:70ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:12;--cols:44;--rows:26;--dx:1px;--dy:3px;--rz:3deg;--z:4px;--d:83ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:12;--cols:44;--rows:26;--dx:25px;--dy:-23px;--rz:15deg;--z:5px;--d:96ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:12;--cols:44;--rows:26;--dx:49px;--dy:0px;--rz:-3deg;--z:7px;--d:109ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:12;--cols:44;--rows:26;--dx:18px;--dy:-26px;--rz:10deg;--z:9px;--d:122ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:12;--cols:44;--rows:26;--dx:43px;--dy:-3px;--rz:23deg;--z:10px;--d:135ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:12;--cols:44;--rows:26;--dx:67px;--dy:20px;--rz:4deg;--z:12px;--d:148ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:12;--cols:44;--rows:26;--dx:36px;--dy:-6px;--rz:17deg;--z:14px;--d:161ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:12;--cols:44;--rows:26;--dx:60px;--dy:17px;--rz:-1deg;--z:15px;--d:174ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:12;--cols:44;--rows:26;--dx:84px;--dy:-9px;--rz:11deg;--z:17px;--d:187ms;--ps:0.72;background-size:4400% 2600%;background-position:72.09302325581395% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:12;--cols:44;--rows:26;--dx:54px;--dy:14px;--rz:24deg;--z:18px;--d:200ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:12;--cols:44;--rows:26;--dx:78px;--dy:-12px;--rz:6deg;--z:20px;--d:213ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:12;--cols:44;--rows:26;--dx:102px;--dy:11px;--rz:19deg;--z:22px;--d:226ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:12;--cols:44;--rows:26;--dx:71px;--dy:-15px;--rz:31deg;--z:23px;--d:239ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:12;--cols:44;--rows:26;--dx:96px;--dy:8px;--rz:13deg;--z:25px;--d:252ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:12;--cols:44;--rows:26;--dx:120px;--dy:-18px;--rz:26deg;--z:27px;--d:265ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:12;--cols:44;--rows:26;--dx:144px;--dy:5px;--rz:38deg;--z:28px;--d:278ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:12;--cols:44;--rows:26;--dx:113px;--dy:-21px;--rz:20deg;--z:30px;--d:291ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:12;--cols:44;--rows:26;--dx:137px;--dy:2px;--rz:33deg;--z:32px;--d:304ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:12;--cols:44;--rows:26;--dx:162px;--dy:-24px;--rz:46deg;--z:33px;--d:317ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:12;--cols:44;--rows:26;--dx:131px;--dy:-1px;--rz:27deg;--z:35px;--d:330ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:12;--cols:44;--rows:26;--dx:155px;--dy:-27px;--rz:40deg;--z:36px;--d:343ms;--ps:1;background-size:4400% 2600%;background-position:100% 48%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:13;--cols:44;--rows:26;--dx:-138px;--dy:4px;--rz:-21deg;--z:36px;--d:356ms;--ps:0.72;background-size:4400% 2600%;background-position:0% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:13;--cols:44;--rows:26;--dx:-169px;--dy:27px;--rz:-39deg;--z:35px;--d:369ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:13;--cols:44;--rows:26;--dx:-145px;--dy:1px;--rz:-27deg;--z:33px;--d:382ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:13;--cols:44;--rows:26;--dx:-120px;--dy:24px;--rz:-45deg;--z:32px;--d:395ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:13;--cols:44;--rows:26;--dx:-151px;--dy:-2px;--rz:-32deg;--z:30px;--d:408ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:13;--cols:44;--rows:26;--dx:-127px;--dy:21px;--rz:-19deg;--z:28px;--d:421ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:13;--cols:44;--rows:26;--dx:-103px;--dy:-5px;--rz:-38deg;--z:27px;--d:434ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:13;--cols:44;--rows:26;--dx:-79px;--dy:18px;--rz:-25deg;--z:25px;--d:447ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:13;--cols:44;--rows:26;--dx:-109px;--dy:-8px;--rz:-12deg;--z:23px;--d:460ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:13;--cols:44;--rows:26;--dx:-85px;--dy:15px;--rz:-31deg;--z:22px;--d:473ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:13;--cols:44;--rows:26;--dx:-61px;--dy:-11px;--rz:-18deg;--z:20px;--d:486ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:13;--cols:44;--rows:26;--dx:-92px;--dy:12px;--rz:-5deg;--z:18px;--d:499ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:13;--cols:44;--rows:26;--dx:-67px;--dy:-14px;--rz:-23deg;--z:17px;--d:512ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:13;--cols:44;--rows:26;--dx:-43px;--dy:9px;--rz:-11deg;--z:15px;--d:525ms;--ps:0.72;background-size:4400% 2600%;background-position:30.23255813953488% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:13;--cols:44;--rows:26;--dx:-74px;--dy:-17px;--rz:2deg;--z:14px;--d:538ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:13;--cols:44;--rows:26;--dx:-50px;--dy:6px;--rz:-16deg;--z:12px;--d:551ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:13;--cols:44;--rows:26;--dx:-26px;--dy:-20px;--rz:-4deg;--z:10px;--d:564ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:13;--cols:44;--rows:26;--dx:-56px;--dy:3px;--rz:-22deg;--z:9px;--d:577ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:13;--cols:44;--rows:26;--dx:-32px;--dy:26px;--rz:-9deg;--z:7px;--d:590ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:13;--cols:44;--rows:26;--dx:-8px;--dy:0px;--rz:4deg;--z:5px;--d:603ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:13;--cols:44;--rows:26;--dx:16px;--dy:23px;--rz:-15deg;--z:4px;--d:616ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:13;--cols:44;--rows:26;--dx:-15px;--dy:-3px;--rz:-2deg;--z:2px;--d:629ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:13;--cols:44;--rows:26;--dx:10px;--dy:20px;--rz:11deg;--z:2px;--d:642ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:13;--cols:44;--rows:26;--dx:34px;--dy:-6px;--rz:-7deg;--z:4px;--d:655ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:13;--cols:44;--rows:26;--dx:3px;--dy:17px;--rz:5deg;--z:5px;--d:668ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:13;--cols:44;--rows:26;--dx:27px;--dy:-9px;--rz:18deg;--z:7px;--d:681ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:13;--cols:44;--rows:26;--dx:51px;--dy:14px;--rz:0deg;--z:9px;--d:694ms;--ps:0.72;background-size:4400% 2600%;background-position:60.46511627906976% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:13;--cols:44;--rows:26;--dx:21px;--dy:-12px;--rz:12deg;--z:10px;--d:707ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:13;--cols:44;--rows:26;--dx:45px;--dy:11px;--rz:25deg;--z:12px;--d:720ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:13;--cols:44;--rows:26;--dx:69px;--dy:-15px;--rz:7deg;--z:14px;--d:733ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:13;--cols:44;--rows:26;--dx:38px;--dy:8px;--rz:20deg;--z:15px;--d:746ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:13;--cols:44;--rows:26;--dx:62px;--dy:-18px;--rz:32deg;--z:17px;--d:759ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:13;--cols:44;--rows:26;--dx:87px;--dy:5px;--rz:14deg;--z:18px;--d:772ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:13;--cols:44;--rows:26;--dx:56px;--dy:28px;--rz:27deg;--z:20px;--d:785ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:13;--cols:44;--rows:26;--dx:80px;--dy:2px;--rz:8deg;--z:22px;--d:798ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:13;--cols:44;--rows:26;--dx:104px;--dy:25px;--rz:21deg;--z:23px;--d:811ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:13;--cols:44;--rows:26;--dx:129px;--dy:-1px;--rz:34deg;--z:25px;--d:824ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:13;--cols:44;--rows:26;--dx:98px;--dy:22px;--rz:16deg;--z:27px;--d:837ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:13;--cols:44;--rows:26;--dx:122px;--dy:-4px;--rz:28deg;--z:28px;--d:850ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:13;--cols:44;--rows:26;--dx:146px;--dy:19px;--rz:41deg;--z:30px;--d:863ms;--ps:0.72;background-size:4400% 2600%;background-position:90.69767441860465% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:13;--cols:44;--rows:26;--dx:115px;--dy:-7px;--rz:23deg;--z:32px;--d:876ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:13;--cols:44;--rows:26;--dx:140px;--dy:16px;--rz:35deg;--z:33px;--d:889ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:13;--cols:44;--rows:26;--dx:164px;--dy:-10px;--rz:48deg;--z:35px;--d:902ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:13;--cols:44;--rows:26;--dx:133px;--dy:13px;--rz:30deg;--z:36px;--d:915ms;--ps:1;background-size:4400% 2600%;background-position:100% 52%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:14;--cols:44;--rows:26;--dx:-160px;--dy:-4px;--rz:-31deg;--z:39px;--d:928ms;--ps:1;background-size:4400% 2600%;background-position:0% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:14;--cols:44;--rows:26;--dx:-136px;--dy:19px;--rz:-19deg;--z:38px;--d:941ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:14;--cols:44;--rows:26;--dx:-167px;--dy:-7px;--rz:-37deg;--z:36px;--d:954ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:14;--cols:44;--rows:26;--dx:-142px;--dy:16px;--rz:-24deg;--z:34px;--d:967ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:14;--cols:44;--rows:26;--dx:-118px;--dy:-10px;--rz:-42deg;--z:33px;--d:980ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:14;--cols:44;--rows:26;--dx:-94px;--dy:13px;--rz:-30deg;--z:31px;--d:993ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:14;--cols:44;--rows:26;--dx:-125px;--dy:36px;--rz:-17deg;--z:29px;--d:1006ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:14;--cols:44;--rows:26;--dx:-101px;--dy:10px;--rz:-35deg;--z:28px;--d:1019ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:14;--cols:44;--rows:26;--dx:-76px;--dy:33px;--rz:-22deg;--z:26px;--d:1032ms;--ps:0.72;background-size:4400% 2600%;background-position:18.6046511627907% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:14;--cols:44;--rows:26;--dx:-107px;--dy:7px;--rz:-10deg;--z:25px;--d:1045ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:14;--cols:44;--rows:26;--dx:-83px;--dy:30px;--rz:-28deg;--z:23px;--d:1058ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:14;--cols:44;--rows:26;--dx:-59px;--dy:4px;--rz:-15deg;--z:21px;--d:1071ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:14;--cols:44;--rows:26;--dx:-89px;--dy:27px;--rz:-3deg;--z:20px;--d:1084ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:14;--cols:44;--rows:26;--dx:-65px;--dy:1px;--rz:-21deg;--z:18px;--d:1097ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:14;--cols:44;--rows:26;--dx:-41px;--dy:24px;--rz:-8deg;--z:16px;--d:1110ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:14;--cols:44;--rows:26;--dx:-72px;--dy:-2px;--rz:5deg;--z:15px;--d:1123ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:14;--cols:44;--rows:26;--dx:-48px;--dy:21px;--rz:-14deg;--z:13px;--d:1136ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:14;--cols:44;--rows:26;--dx:-23px;--dy:-5px;--rz:-1deg;--z:12px;--d:1149ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:14;--cols:44;--rows:26;--dx:1px;--dy:18px;--rz:12deg;--z:10px;--d:1162ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:14;--cols:44;--rows:26;--dx:-30px;--dy:-8px;--rz:-7deg;--z:8px;--d:1175ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:14;--cols:44;--rows:26;--dx:-6px;--dy:15px;--rz:6deg;--z:7px;--d:8ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:14;--cols:44;--rows:26;--dx:18px;--dy:-11px;--rz:-12deg;--z:5px;--d:21ms;--ps:0.72;background-size:4400% 2600%;background-position:48.837209302325576% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:14;--cols:44;--rows:26;--dx:-12px;--dy:12px;--rz:1deg;--z:5px;--d:34ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:14;--cols:44;--rows:26;--dx:12px;--dy:35px;--rz:13deg;--z:7px;--d:47ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:14;--cols:44;--rows:26;--dx:36px;--dy:9px;--rz:-5deg;--z:8px;--d:60ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:14;--cols:44;--rows:26;--dx:5px;--dy:32px;--rz:8deg;--z:10px;--d:73ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:14;--cols:44;--rows:26;--dx:29px;--dy:6px;--rz:21deg;--z:12px;--d:86ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:14;--cols:44;--rows:26;--dx:54px;--dy:29px;--rz:2deg;--z:13px;--d:99ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:14;--cols:44;--rows:26;--dx:23px;--dy:3px;--rz:15deg;--z:15px;--d:112ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:14;--cols:44;--rows:26;--dx:47px;--dy:26px;--rz:28deg;--z:16px;--d:125ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:14;--cols:44;--rows:26;--dx:71px;--dy:0px;--rz:9deg;--z:18px;--d:138ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:14;--cols:44;--rows:26;--dx:95px;--dy:23px;--rz:22deg;--z:20px;--d:151ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:14;--cols:44;--rows:26;--dx:65px;--dy:-3px;--rz:35deg;--z:21px;--d:164ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:14;--cols:44;--rows:26;--dx:89px;--dy:20px;--rz:17deg;--z:23px;--d:177ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:14;--cols:44;--rows:26;--dx:113px;--dy:-6px;--rz:29deg;--z:25px;--d:190ms;--ps:0.72;background-size:4400% 2600%;background-position:79.06976744186046% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:14;--cols:44;--rows:26;--dx:82px;--dy:17px;--rz:11deg;--z:26px;--d:203ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:14;--cols:44;--rows:26;--dx:107px;--dy:-9px;--rz:24deg;--z:28px;--d:216ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:14;--cols:44;--rows:26;--dx:131px;--dy:14px;--rz:36deg;--z:29px;--d:229ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:14;--cols:44;--rows:26;--dx:100px;--dy:37px;--rz:18deg;--z:31px;--d:242ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:14;--cols:44;--rows:26;--dx:124px;--dy:11px;--rz:31deg;--z:33px;--d:255ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:14;--cols:44;--rows:26;--dx:148px;--dy:34px;--rz:44deg;--z:34px;--d:268ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:14;--cols:44;--rows:26;--dx:118px;--dy:8px;--rz:25deg;--z:36px;--d:281ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:14;--cols:44;--rows:26;--dx:142px;--dy:31px;--rz:38deg;--z:38px;--d:294ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:14;--cols:44;--rows:26;--dx:166px;--dy:5px;--rz:51deg;--z:39px;--d:307ms;--ps:1;background-size:4400% 2600%;background-position:100% 56.00000000000001%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:15;--cols:44;--rows:26;--dx:-182px;--dy:36px;--rz:-41deg;--z:42px;--d:320ms;--ps:1;background-size:4400% 2600%;background-position:0% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:15;--cols:44;--rows:26;--dx:-158px;--dy:10px;--rz:-29deg;--z:40px;--d:333ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:15;--cols:44;--rows:26;--dx:-134px;--dy:33px;--rz:-16deg;--z:39px;--d:346ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:15;--cols:44;--rows:26;--dx:-109px;--dy:7px;--rz:-34deg;--z:37px;--d:359ms;--ps:0.72;background-size:4400% 2600%;background-position:6.976744186046512% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:15;--cols:44;--rows:26;--dx:-140px;--dy:30px;--rz:-22deg;--z:35px;--d:372ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:15;--cols:44;--rows:26;--dx:-116px;--dy:4px;--rz:-9deg;--z:34px;--d:385ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:15;--cols:44;--rows:26;--dx:-92px;--dy:27px;--rz:-27deg;--z:32px;--d:398ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:15;--cols:44;--rows:26;--dx:-123px;--dy:1px;--rz:-14deg;--z:31px;--d:411ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:15;--cols:44;--rows:26;--dx:-98px;--dy:24px;--rz:-33deg;--z:29px;--d:424ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:15;--cols:44;--rows:26;--dx:-74px;--dy:-2px;--rz:-20deg;--z:27px;--d:437ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:15;--cols:44;--rows:26;--dx:-105px;--dy:21px;--rz:-7deg;--z:26px;--d:450ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:15;--cols:44;--rows:26;--dx:-81px;--dy:44px;--rz:-25deg;--z:24px;--d:463ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:15;--cols:44;--rows:26;--dx:-56px;--dy:18px;--rz:-13deg;--z:22px;--d:476ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:15;--cols:44;--rows:26;--dx:-87px;--dy:41px;--rz:0deg;--z:21px;--d:489ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:15;--cols:44;--rows:26;--dx:-63px;--dy:15px;--rz:-18deg;--z:19px;--d:502ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:15;--cols:44;--rows:26;--dx:-39px;--dy:38px;--rz:-6deg;--z:18px;--d:515ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:15;--cols:44;--rows:26;--dx:-15px;--dy:12px;--rz:7deg;--z:16px;--d:528ms;--ps:0.72;background-size:4400% 2600%;background-position:37.2093023255814% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:15;--cols:44;--rows:26;--dx:-45px;--dy:35px;--rz:-11deg;--z:14px;--d:541ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:15;--cols:44;--rows:26;--dx:-21px;--dy:9px;--rz:2deg;--z:13px;--d:554ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:15;--cols:44;--rows:26;--dx:3px;--dy:32px;--rz:14deg;--z:11px;--d:567ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:15;--cols:44;--rows:26;--dx:-28px;--dy:6px;--rz:-4deg;--z:9px;--d:580ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:15;--cols:44;--rows:26;--dx:-4px;--dy:29px;--rz:9deg;--z:8px;--d:593ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:15;--cols:44;--rows:26;--dx:21px;--dy:3px;--rz:-10deg;--z:8px;--d:606ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:15;--cols:44;--rows:26;--dx:-10px;--dy:26px;--rz:3deg;--z:9px;--d:619ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:15;--cols:44;--rows:26;--dx:14px;--dy:0px;--rz:16deg;--z:11px;--d:632ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:15;--cols:44;--rows:26;--dx:38px;--dy:23px;--rz:-2deg;--z:13px;--d:645ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:15;--cols:44;--rows:26;--dx:7px;--dy:-3px;--rz:10deg;--z:14px;--d:658ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:15;--cols:44;--rows:26;--dx:32px;--dy:20px;--rz:23deg;--z:16px;--d:671ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:15;--cols:44;--rows:26;--dx:56px;--dy:43px;--rz:5deg;--z:18px;--d:684ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:15;--cols:44;--rows:26;--dx:80px;--dy:17px;--rz:18deg;--z:19px;--d:697ms;--ps:0.72;background-size:4400% 2600%;background-position:67.44186046511628% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:15;--cols:44;--rows:26;--dx:49px;--dy:40px;--rz:30deg;--z:21px;--d:710ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:15;--cols:44;--rows:26;--dx:73px;--dy:14px;--rz:12deg;--z:22px;--d:723ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:15;--cols:44;--rows:26;--dx:98px;--dy:37px;--rz:25deg;--z:24px;--d:736ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:15;--cols:44;--rows:26;--dx:67px;--dy:11px;--rz:37deg;--z:26px;--d:749ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:15;--cols:44;--rows:26;--dx:91px;--dy:34px;--rz:19deg;--z:27px;--d:762ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:15;--cols:44;--rows:26;--dx:115px;--dy:8px;--rz:32deg;--z:29px;--d:775ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:15;--cols:44;--rows:26;--dx:85px;--dy:31px;--rz:45deg;--z:31px;--d:788ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:15;--cols:44;--rows:26;--dx:109px;--dy:5px;--rz:26deg;--z:32px;--d:801ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:15;--cols:44;--rows:26;--dx:133px;--dy:28px;--rz:39deg;--z:34px;--d:814ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:15;--cols:44;--rows:26;--dx:102px;--dy:2px;--rz:21deg;--z:35px;--d:827ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:15;--cols:44;--rows:26;--dx:126px;--dy:25px;--rz:33deg;--z:37px;--d:840ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:15;--cols:44;--rows:26;--dx:151px;--dy:-1px;--rz:46deg;--z:39px;--d:853ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:15;--cols:44;--rows:26;--dx:175px;--dy:22px;--rz:28deg;--z:40px;--d:866ms;--ps:0.72;background-size:4400% 2600%;background-position:97.67441860465115% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:15;--cols:44;--rows:26;--dx:144px;--dy:45px;--rz:41deg;--z:42px;--d:879ms;--ps:1;background-size:4400% 2600%;background-position:100% 60%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:16;--cols:44;--rows:26;--dx:-149px;--dy:27px;--rz:-21deg;--z:45px;--d:892ms;--ps:1;background-size:4400% 2600%;background-position:0% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:16;--cols:44;--rows:26;--dx:-125px;--dy:50px;--rz:-39deg;--z:43px;--d:905ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:16;--cols:44;--rows:26;--dx:-156px;--dy:24px;--rz:-26deg;--z:42px;--d:918ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:16;--cols:44;--rows:26;--dx:-131px;--dy:47px;--rz:-13deg;--z:40px;--d:931ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:16;--cols:44;--rows:26;--dx:-107px;--dy:21px;--rz:-32deg;--z:38px;--d:944ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:16;--cols:44;--rows:26;--dx:-138px;--dy:44px;--rz:-19deg;--z:37px;--d:957ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:16;--cols:44;--rows:26;--dx:-114px;--dy:18px;--rz:-6deg;--z:35px;--d:970ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:16;--cols:44;--rows:26;--dx:-90px;--dy:41px;--rz:-25deg;--z:33px;--d:983ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:16;--cols:44;--rows:26;--dx:-120px;--dy:15px;--rz:-12deg;--z:32px;--d:996ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:16;--cols:44;--rows:26;--dx:-96px;--dy:38px;--rz:-30deg;--z:30px;--d:1009ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:16;--cols:44;--rows:26;--dx:-72px;--dy:12px;--rz:-17deg;--z:29px;--d:1022ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:16;--cols:44;--rows:26;--dx:-103px;--dy:35px;--rz:-5deg;--z:27px;--d:1035ms;--ps:0.72;background-size:4400% 2600%;background-position:25.581395348837212% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:16;--cols:44;--rows:26;--dx:-78px;--dy:9px;--rz:-23deg;--z:25px;--d:1048ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:16;--cols:44;--rows:26;--dx:-54px;--dy:32px;--rz:-10deg;--z:24px;--d:1061ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:16;--cols:44;--rows:26;--dx:-30px;--dy:6px;--rz:3deg;--z:22px;--d:1074ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:16;--cols:44;--rows:26;--dx:-61px;--dy:29px;--rz:-16deg;--z:20px;--d:1087ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:16;--cols:44;--rows:26;--dx:-37px;--dy:52px;--rz:-3deg;--z:19px;--d:1100ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:16;--cols:44;--rows:26;--dx:-12px;--dy:26px;--rz:10deg;--z:17px;--d:1113ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:16;--cols:44;--rows:26;--dx:-43px;--dy:49px;--rz:-9deg;--z:15px;--d:1126ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:16;--cols:44;--rows:26;--dx:-19px;--dy:23px;--rz:4deg;--z:14px;--d:1139ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:16;--cols:44;--rows:26;--dx:5px;--dy:46px;--rz:17deg;--z:12px;--d:1152ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:16;--cols:44;--rows:26;--dx:-26px;--dy:20px;--rz:-1deg;--z:11px;--d:1165ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:16;--cols:44;--rows:26;--dx:-1px;--dy:43px;--rz:11deg;--z:11px;--d:1178ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:16;--cols:44;--rows:26;--dx:23px;--dy:17px;--rz:24deg;--z:12px;--d:11ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:16;--cols:44;--rows:26;--dx:-8px;--dy:40px;--rz:6deg;--z:14px;--d:24ms;--ps:0.72;background-size:4400% 2600%;background-position:55.81395348837209% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:16;--cols:44;--rows:26;--dx:16px;--dy:14px;--rz:18deg;--z:15px;--d:37ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:16;--cols:44;--rows:26;--dx:40px;--dy:37px;--rz:0deg;--z:17px;--d:50ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:16;--cols:44;--rows:26;--dx:65px;--dy:11px;--rz:13deg;--z:19px;--d:63ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:16;--cols:44;--rows:26;--dx:34px;--dy:34px;--rz:26deg;--z:20px;--d:76ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:16;--cols:44;--rows:26;--dx:58px;--dy:8px;--rz:7deg;--z:22px;--d:89ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:16;--cols:44;--rows:26;--dx:82px;--dy:31px;--rz:20deg;--z:24px;--d:102ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:16;--cols:44;--rows:26;--dx:51px;--dy:5px;--rz:33deg;--z:25px;--d:115ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:16;--cols:44;--rows:26;--dx:76px;--dy:28px;--rz:15deg;--z:27px;--d:128ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:16;--cols:44;--rows:26;--dx:100px;--dy:51px;--rz:27deg;--z:29px;--d:141ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:16;--cols:44;--rows:26;--dx:69px;--dy:25px;--rz:40deg;--z:30px;--d:154ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:16;--cols:44;--rows:26;--dx:93px;--dy:48px;--rz:22deg;--z:32px;--d:167ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:16;--cols:44;--rows:26;--dx:118px;--dy:22px;--rz:34deg;--z:33px;--d:180ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:16;--cols:44;--rows:26;--dx:87px;--dy:45px;--rz:47deg;--z:35px;--d:193ms;--ps:0.72;background-size:4400% 2600%;background-position:86.04651162790698% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:16;--cols:44;--rows:26;--dx:111px;--dy:19px;--rz:29deg;--z:37px;--d:206ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:16;--cols:44;--rows:26;--dx:135px;--dy:42px;--rz:42deg;--z:38px;--d:219ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:16;--cols:44;--rows:26;--dx:159px;--dy:16px;--rz:23deg;--z:40px;--d:232ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:16;--cols:44;--rows:26;--dx:129px;--dy:39px;--rz:36deg;--z:42px;--d:245ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:16;--cols:44;--rows:26;--dx:153px;--dy:13px;--rz:49deg;--z:43px;--d:258ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:16;--cols:44;--rows:26;--dx:177px;--dy:36px;--rz:30deg;--z:45px;--d:271ms;--ps:1;background-size:4400% 2600%;background-position:100% 64%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:17;--cols:44;--rows:26;--dx:-171px;--dy:19px;--rz:-31deg;--z:48px;--d:284ms;--ps:1;background-size:4400% 2600%;background-position:0% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:17;--cols:44;--rows:26;--dx:-147px;--dy:42px;--rz:-18deg;--z:46px;--d:297ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:17;--cols:44;--rows:26;--dx:-123px;--dy:16px;--rz:-36deg;--z:44px;--d:310ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:17;--cols:44;--rows:26;--dx:-153px;--dy:39px;--rz:-24deg;--z:43px;--d:323ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:17;--cols:44;--rows:26;--dx:-129px;--dy:62px;--rz:-11deg;--z:41px;--d:336ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:17;--cols:44;--rows:26;--dx:-105px;--dy:36px;--rz:-29deg;--z:39px;--d:349ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:17;--cols:44;--rows:26;--dx:-136px;--dy:59px;--rz:-16deg;--z:38px;--d:362ms;--ps:0.72;background-size:4400% 2600%;background-position:13.953488372093023% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:17;--cols:44;--rows:26;--dx:-112px;--dy:33px;--rz:-4deg;--z:36px;--d:375ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:17;--cols:44;--rows:26;--dx:-87px;--dy:56px;--rz:-22deg;--z:35px;--d:388ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:17;--cols:44;--rows:26;--dx:-63px;--dy:30px;--rz:-9deg;--z:33px;--d:401ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:17;--cols:44;--rows:26;--dx:-94px;--dy:53px;--rz:3deg;--z:31px;--d:414ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:17;--cols:44;--rows:26;--dx:-70px;--dy:27px;--rz:-15deg;--z:30px;--d:427ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:17;--cols:44;--rows:26;--dx:-45px;--dy:50px;--rz:-2deg;--z:28px;--d:440ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:17;--cols:44;--rows:26;--dx:-76px;--dy:24px;--rz:-20deg;--z:26px;--d:453ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:17;--cols:44;--rows:26;--dx:-52px;--dy:47px;--rz:-8deg;--z:25px;--d:466ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:17;--cols:44;--rows:26;--dx:-28px;--dy:21px;--rz:5deg;--z:23px;--d:479ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:17;--cols:44;--rows:26;--dx:-59px;--dy:44px;--rz:-13deg;--z:22px;--d:492ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:17;--cols:44;--rows:26;--dx:-34px;--dy:18px;--rz:0deg;--z:20px;--d:505ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:17;--cols:44;--rows:26;--dx:-10px;--dy:41px;--rz:12deg;--z:18px;--d:518ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:17;--cols:44;--rows:26;--dx:-41px;--dy:15px;--rz:-6deg;--z:17px;--d:531ms;--ps:0.72;background-size:4400% 2600%;background-position:44.18604651162791% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:17;--cols:44;--rows:26;--dx:-17px;--dy:38px;--rz:7deg;--z:15px;--d:544ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:17;--cols:44;--rows:26;--dx:7px;--dy:61px;--rz:19deg;--z:13px;--d:557ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:17;--cols:44;--rows:26;--dx:-23px;--dy:35px;--rz:1deg;--z:13px;--d:570ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:17;--cols:44;--rows:26;--dx:1px;--dy:58px;--rz:14deg;--z:15px;--d:583ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:17;--cols:44;--rows:26;--dx:25px;--dy:32px;--rz:27deg;--z:17px;--d:596ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:17;--cols:44;--rows:26;--dx:49px;--dy:55px;--rz:8deg;--z:18px;--d:609ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:17;--cols:44;--rows:26;--dx:18px;--dy:29px;--rz:21deg;--z:20px;--d:622ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:17;--cols:44;--rows:26;--dx:43px;--dy:52px;--rz:3deg;--z:22px;--d:635ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:17;--cols:44;--rows:26;--dx:67px;--dy:26px;--rz:15deg;--z:23px;--d:648ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:17;--cols:44;--rows:26;--dx:36px;--dy:49px;--rz:28deg;--z:25px;--d:661ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:17;--cols:44;--rows:26;--dx:60px;--dy:23px;--rz:10deg;--z:26px;--d:674ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:17;--cols:44;--rows:26;--dx:84px;--dy:46px;--rz:23deg;--z:28px;--d:687ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:17;--cols:44;--rows:26;--dx:54px;--dy:20px;--rz:35deg;--z:30px;--d:700ms;--ps:0.72;background-size:4400% 2600%;background-position:74.4186046511628% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:17;--cols:44;--rows:26;--dx:78px;--dy:43px;--rz:17deg;--z:31px;--d:713ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:17;--cols:44;--rows:26;--dx:102px;--dy:17px;--rz:30deg;--z:33px;--d:726ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:17;--cols:44;--rows:26;--dx:71px;--dy:40px;--rz:43deg;--z:35px;--d:739ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:17;--cols:44;--rows:26;--dx:96px;--dy:14px;--rz:24deg;--z:36px;--d:752ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:17;--cols:44;--rows:26;--dx:120px;--dy:37px;--rz:37deg;--z:38px;--d:765ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:17;--cols:44;--rows:26;--dx:144px;--dy:60px;--rz:50deg;--z:39px;--d:778ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:17;--cols:44;--rows:26;--dx:113px;--dy:34px;--rz:31deg;--z:41px;--d:791ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:17;--cols:44;--rows:26;--dx:137px;--dy:57px;--rz:44deg;--z:43px;--d:804ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:17;--cols:44;--rows:26;--dx:162px;--dy:31px;--rz:57deg;--z:44px;--d:817ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:17;--cols:44;--rows:26;--dx:131px;--dy:54px;--rz:39deg;--z:46px;--d:830ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:17;--cols:44;--rows:26;--dx:155px;--dy:28px;--rz:51deg;--z:48px;--d:843ms;--ps:1;background-size:4400% 2600%;background-position:100% 68%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:18;--cols:44;--rows:26;--dx:-138px;--dy:59px;--rz:-41deg;--z:50px;--d:856ms;--ps:1;background-size:4400% 2600%;background-position:0% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:18;--cols:44;--rows:26;--dx:-169px;--dy:33px;--rz:-28deg;--z:49px;--d:869ms;--ps:0.72;background-size:4400% 2600%;background-position:2.3255813953488373% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:18;--cols:44;--rows:26;--dx:-145px;--dy:56px;--rz:-15deg;--z:47px;--d:882ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:18;--cols:44;--rows:26;--dx:-120px;--dy:30px;--rz:-34deg;--z:46px;--d:895ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:18;--cols:44;--rows:26;--dx:-151px;--dy:53px;--rz:-21deg;--z:44px;--d:908ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:18;--cols:44;--rows:26;--dx:-127px;--dy:27px;--rz:-8deg;--z:42px;--d:921ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:18;--cols:44;--rows:26;--dx:-103px;--dy:50px;--rz:-27deg;--z:41px;--d:934ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:18;--cols:44;--rows:26;--dx:-79px;--dy:24px;--rz:-14deg;--z:39px;--d:947ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:18;--cols:44;--rows:26;--dx:-109px;--dy:47px;--rz:-1deg;--z:37px;--d:960ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:18;--cols:44;--rows:26;--dx:-85px;--dy:70px;--rz:-19deg;--z:36px;--d:973ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:18;--cols:44;--rows:26;--dx:-61px;--dy:44px;--rz:-7deg;--z:34px;--d:986ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:18;--cols:44;--rows:26;--dx:-92px;--dy:67px;--rz:6deg;--z:32px;--d:999ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:18;--cols:44;--rows:26;--dx:-67px;--dy:41px;--rz:-12deg;--z:31px;--d:1012ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:18;--cols:44;--rows:26;--dx:-43px;--dy:64px;--rz:0deg;--z:29px;--d:1025ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:18;--cols:44;--rows:26;--dx:-74px;--dy:38px;--rz:-18deg;--z:28px;--d:1038ms;--ps:0.72;background-size:4400% 2600%;background-position:32.55813953488372% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:18;--cols:44;--rows:26;--dx:-50px;--dy:61px;--rz:-5deg;--z:26px;--d:1051ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:18;--cols:44;--rows:26;--dx:-26px;--dy:35px;--rz:8deg;--z:24px;--d:1064ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:18;--cols:44;--rows:26;--dx:-56px;--dy:58px;--rz:-11deg;--z:23px;--d:1077ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:18;--cols:44;--rows:26;--dx:-32px;--dy:32px;--rz:2deg;--z:21px;--d:1090ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:18;--cols:44;--rows:26;--dx:-8px;--dy:55px;--rz:15deg;--z:19px;--d:1103ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:18;--cols:44;--rows:26;--dx:16px;--dy:29px;--rz:-3deg;--z:18px;--d:1116ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:18;--cols:44;--rows:26;--dx:-15px;--dy:52px;--rz:9deg;--z:16px;--d:1129ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:18;--cols:44;--rows:26;--dx:10px;--dy:26px;--rz:22deg;--z:16px;--d:1142ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:18;--cols:44;--rows:26;--dx:34px;--dy:49px;--rz:4deg;--z:18px;--d:1155ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:18;--cols:44;--rows:26;--dx:3px;--dy:23px;--rz:16deg;--z:19px;--d:1168ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:18;--cols:44;--rows:26;--dx:27px;--dy:46px;--rz:29deg;--z:21px;--d:1ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:18;--cols:44;--rows:26;--dx:51px;--dy:69px;--rz:11deg;--z:23px;--d:14ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:18;--cols:44;--rows:26;--dx:21px;--dy:43px;--rz:24deg;--z:24px;--d:27ms;--ps:0.72;background-size:4400% 2600%;background-position:62.7906976744186% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:18;--cols:44;--rows:26;--dx:45px;--dy:66px;--rz:36deg;--z:26px;--d:40ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:18;--cols:44;--rows:26;--dx:69px;--dy:40px;--rz:18deg;--z:28px;--d:53ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:18;--cols:44;--rows:26;--dx:38px;--dy:63px;--rz:31deg;--z:29px;--d:66ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:18;--cols:44;--rows:26;--dx:62px;--dy:37px;--rz:12deg;--z:31px;--d:79ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:18;--cols:44;--rows:26;--dx:87px;--dy:60px;--rz:25deg;--z:32px;--d:92ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:18;--cols:44;--rows:26;--dx:56px;--dy:34px;--rz:38deg;--z:34px;--d:105ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:18;--cols:44;--rows:26;--dx:80px;--dy:57px;--rz:20deg;--z:36px;--d:118ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:18;--cols:44;--rows:26;--dx:104px;--dy:31px;--rz:32deg;--z:37px;--d:131ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:18;--cols:44;--rows:26;--dx:129px;--dy:54px;--rz:45deg;--z:39px;--d:144ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:18;--cols:44;--rows:26;--dx:98px;--dy:28px;--rz:27deg;--z:41px;--d:157ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:18;--cols:44;--rows:26;--dx:122px;--dy:51px;--rz:40deg;--z:42px;--d:170ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:18;--cols:44;--rows:26;--dx:146px;--dy:25px;--rz:52deg;--z:44px;--d:183ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:18;--cols:44;--rows:26;--dx:115px;--dy:48px;--rz:34deg;--z:46px;--d:196ms;--ps:0.72;background-size:4400% 2600%;background-position:93.02325581395348% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:18;--cols:44;--rows:26;--dx:140px;--dy:22px;--rz:47deg;--z:47px;--d:209ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:18;--cols:44;--rows:26;--dx:164px;--dy:45px;--rz:59deg;--z:49px;--d:222ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:18;--cols:44;--rows:26;--dx:133px;--dy:68px;--rz:41deg;--z:50px;--d:235ms;--ps:1;background-size:4400% 2600%;background-position:100% 72%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:19;--cols:44;--rows:26;--dx:-160px;--dy:51px;--rz:-20deg;--z:53px;--d:248ms;--ps:1;background-size:4400% 2600%;background-position:0% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:19;--cols:44;--rows:26;--dx:-136px;--dy:74px;--rz:-38deg;--z:52px;--d:261ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:19;--cols:44;--rows:26;--dx:-167px;--dy:48px;--rz:-26deg;--z:50px;--d:274ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:19;--cols:44;--rows:26;--dx:-142px;--dy:71px;--rz:-13deg;--z:48px;--d:287ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:19;--cols:44;--rows:26;--dx:-118px;--dy:45px;--rz:-31deg;--z:47px;--d:300ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:19;--cols:44;--rows:26;--dx:-94px;--dy:68px;--rz:-18deg;--z:45px;--d:313ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:19;--cols:44;--rows:26;--dx:-125px;--dy:42px;--rz:-6deg;--z:43px;--d:326ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:19;--cols:44;--rows:26;--dx:-101px;--dy:65px;--rz:-24deg;--z:42px;--d:339ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:19;--cols:44;--rows:26;--dx:-76px;--dy:39px;--rz:-11deg;--z:40px;--d:352ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:19;--cols:44;--rows:26;--dx:-107px;--dy:62px;--rz:1deg;--z:39px;--d:365ms;--ps:0.72;background-size:4400% 2600%;background-position:20.930232558139537% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:19;--cols:44;--rows:26;--dx:-83px;--dy:36px;--rz:-17deg;--z:37px;--d:378ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:19;--cols:44;--rows:26;--dx:-59px;--dy:59px;--rz:-4deg;--z:35px;--d:391ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:19;--cols:44;--rows:26;--dx:-89px;--dy:33px;--rz:9deg;--z:34px;--d:404ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:19;--cols:44;--rows:26;--dx:-65px;--dy:56px;--rz:-10deg;--z:32px;--d:417ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:19;--cols:44;--rows:26;--dx:-41px;--dy:79px;--rz:3deg;--z:30px;--d:430ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:19;--cols:44;--rows:26;--dx:-72px;--dy:53px;--rz:16deg;--z:29px;--d:443ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:19;--cols:44;--rows:26;--dx:-48px;--dy:76px;--rz:-3deg;--z:27px;--d:456ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:19;--cols:44;--rows:26;--dx:-23px;--dy:50px;--rz:10deg;--z:26px;--d:469ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:19;--cols:44;--rows:26;--dx:1px;--dy:73px;--rz:-8deg;--z:24px;--d:482ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:19;--cols:44;--rows:26;--dx:-30px;--dy:47px;--rz:5deg;--z:22px;--d:495ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:19;--cols:44;--rows:26;--dx:-6px;--dy:70px;--rz:17deg;--z:21px;--d:508ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:19;--cols:44;--rows:26;--dx:18px;--dy:44px;--rz:-1deg;--z:19px;--d:521ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:19;--cols:44;--rows:26;--dx:-12px;--dy:67px;--rz:12deg;--z:19px;--d:534ms;--ps:0.72;background-size:4400% 2600%;background-position:51.162790697674424% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:19;--cols:44;--rows:26;--dx:12px;--dy:41px;--rz:25deg;--z:21px;--d:547ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:19;--cols:44;--rows:26;--dx:36px;--dy:64px;--rz:6deg;--z:22px;--d:560ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:19;--cols:44;--rows:26;--dx:5px;--dy:38px;--rz:19deg;--z:24px;--d:573ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:19;--cols:44;--rows:26;--dx:29px;--dy:61px;--rz:32deg;--z:26px;--d:586ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:19;--cols:44;--rows:26;--dx:54px;--dy:35px;--rz:13deg;--z:27px;--d:599ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:19;--cols:44;--rows:26;--dx:23px;--dy:58px;--rz:26deg;--z:29px;--d:612ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:19;--cols:44;--rows:26;--dx:47px;--dy:32px;--rz:39deg;--z:30px;--d:625ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:19;--cols:44;--rows:26;--dx:71px;--dy:55px;--rz:21deg;--z:32px;--d:638ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:19;--cols:44;--rows:26;--dx:95px;--dy:78px;--rz:33deg;--z:34px;--d:651ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:19;--cols:44;--rows:26;--dx:65px;--dy:52px;--rz:15deg;--z:35px;--d:664ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:19;--cols:44;--rows:26;--dx:89px;--dy:75px;--rz:28deg;--z:37px;--d:677ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:19;--cols:44;--rows:26;--dx:113px;--dy:49px;--rz:40deg;--z:39px;--d:690ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:19;--cols:44;--rows:26;--dx:82px;--dy:72px;--rz:22deg;--z:40px;--d:703ms;--ps:0.72;background-size:4400% 2600%;background-position:81.3953488372093% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:19;--cols:44;--rows:26;--dx:107px;--dy:46px;--rz:35deg;--z:42px;--d:716ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:19;--cols:44;--rows:26;--dx:131px;--dy:69px;--rz:48deg;--z:43px;--d:729ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:19;--cols:44;--rows:26;--dx:100px;--dy:43px;--rz:29deg;--z:45px;--d:742ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:19;--cols:44;--rows:26;--dx:124px;--dy:66px;--rz:42deg;--z:47px;--d:755ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:19;--cols:44;--rows:26;--dx:148px;--dy:40px;--rz:55deg;--z:48px;--d:768ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:19;--cols:44;--rows:26;--dx:118px;--dy:63px;--rz:37deg;--z:50px;--d:781ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:19;--cols:44;--rows:26;--dx:142px;--dy:37px;--rz:49deg;--z:52px;--d:794ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:19;--cols:44;--rows:26;--dx:166px;--dy:60px;--rz:62deg;--z:53px;--d:807ms;--ps:1;background-size:4400% 2600%;background-position:100% 76%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:20;--cols:44;--rows:26;--dx:-182px;--dy:42px;--rz:-30deg;--z:56px;--d:820ms;--ps:1;background-size:4400% 2600%;background-position:0% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:20;--cols:44;--rows:26;--dx:-158px;--dy:65px;--rz:-17deg;--z:54px;--d:833ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:20;--cols:44;--rows:26;--dx:-134px;--dy:39px;--rz:-5deg;--z:53px;--d:846ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:20;--cols:44;--rows:26;--dx:-109px;--dy:62px;--rz:-23deg;--z:51px;--d:859ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:20;--cols:44;--rows:26;--dx:-140px;--dy:85px;--rz:-10deg;--z:49px;--d:872ms;--ps:0.72;background-size:4400% 2600%;background-position:9.30232558139535% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:20;--cols:44;--rows:26;--dx:-116px;--dy:59px;--rz:-29deg;--z:48px;--d:885ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:20;--cols:44;--rows:26;--dx:-92px;--dy:82px;--rz:-16deg;--z:46px;--d:898ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:20;--cols:44;--rows:26;--dx:-123px;--dy:56px;--rz:-3deg;--z:45px;--d:911ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:20;--cols:44;--rows:26;--dx:-98px;--dy:79px;--rz:-21deg;--z:43px;--d:924ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:20;--cols:44;--rows:26;--dx:-74px;--dy:53px;--rz:-9deg;--z:41px;--d:937ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:20;--cols:44;--rows:26;--dx:-105px;--dy:76px;--rz:4deg;--z:40px;--d:950ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:20;--cols:44;--rows:26;--dx:-81px;--dy:50px;--rz:-14deg;--z:38px;--d:963ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:20;--cols:44;--rows:26;--dx:-56px;--dy:73px;--rz:-2deg;--z:36px;--d:976ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:20;--cols:44;--rows:26;--dx:-87px;--dy:47px;--rz:11deg;--z:35px;--d:989ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:20;--cols:44;--rows:26;--dx:-63px;--dy:70px;--rz:-7deg;--z:33px;--d:1002ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:20;--cols:44;--rows:26;--dx:-39px;--dy:44px;--rz:6deg;--z:32px;--d:1015ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:20;--cols:44;--rows:26;--dx:-15px;--dy:67px;--rz:18deg;--z:30px;--d:1028ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:20;--cols:44;--rows:26;--dx:-45px;--dy:41px;--rz:0deg;--z:28px;--d:1041ms;--ps:0.72;background-size:4400% 2600%;background-position:39.53488372093023% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:20;--cols:44;--rows:26;--dx:-21px;--dy:64px;--rz:13deg;--z:27px;--d:1054ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:20;--cols:44;--rows:26;--dx:3px;--dy:87px;--rz:-6deg;--z:25px;--d:1067ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:20;--cols:44;--rows:26;--dx:-28px;--dy:61px;--rz:7deg;--z:23px;--d:1080ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:20;--cols:44;--rows:26;--dx:-4px;--dy:84px;--rz:20deg;--z:22px;--d:1093ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:20;--cols:44;--rows:26;--dx:21px;--dy:58px;--rz:2deg;--z:22px;--d:1106ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:20;--cols:44;--rows:26;--dx:-10px;--dy:81px;--rz:14deg;--z:23px;--d:1119ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:20;--cols:44;--rows:26;--dx:14px;--dy:55px;--rz:27deg;--z:25px;--d:1132ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:20;--cols:44;--rows:26;--dx:38px;--dy:78px;--rz:9deg;--z:27px;--d:1145ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:20;--cols:44;--rows:26;--dx:7px;--dy:52px;--rz:22deg;--z:28px;--d:1158ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:20;--cols:44;--rows:26;--dx:32px;--dy:75px;--rz:34deg;--z:30px;--d:1171ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:20;--cols:44;--rows:26;--dx:56px;--dy:49px;--rz:16deg;--z:32px;--d:4ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:20;--cols:44;--rows:26;--dx:80px;--dy:72px;--rz:29deg;--z:33px;--d:17ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:20;--cols:44;--rows:26;--dx:49px;--dy:46px;--rz:41deg;--z:35px;--d:30ms;--ps:0.72;background-size:4400% 2600%;background-position:69.76744186046511% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:20;--cols:44;--rows:26;--dx:73px;--dy:69px;--rz:23deg;--z:36px;--d:43ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:20;--cols:44;--rows:26;--dx:98px;--dy:43px;--rz:36deg;--z:38px;--d:56ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:20;--cols:44;--rows:26;--dx:67px;--dy:66px;--rz:49deg;--z:40px;--d:69ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:20;--cols:44;--rows:26;--dx:91px;--dy:40px;--rz:30deg;--z:41px;--d:82ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:20;--cols:44;--rows:26;--dx:115px;--dy:63px;--rz:43deg;--z:43px;--d:95ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:20;--cols:44;--rows:26;--dx:85px;--dy:86px;--rz:25deg;--z:45px;--d:108ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:20;--cols:44;--rows:26;--dx:109px;--dy:60px;--rz:37deg;--z:46px;--d:121ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:20;--cols:44;--rows:26;--dx:133px;--dy:83px;--rz:50deg;--z:48px;--d:134ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:20;--cols:44;--rows:26;--dx:102px;--dy:57px;--rz:32deg;--z:49px;--d:147ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:20;--cols:44;--rows:26;--dx:126px;--dy:80px;--rz:45deg;--z:51px;--d:160ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:20;--cols:44;--rows:26;--dx:151px;--dy:54px;--rz:57deg;--z:53px;--d:173ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:20;--cols:44;--rows:26;--dx:175px;--dy:77px;--rz:39deg;--z:54px;--d:186ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:20;--cols:44;--rows:26;--dx:144px;--dy:51px;--rz:52deg;--z:56px;--d:199ms;--ps:0.72;background-size:4400% 2600%;background-position:100% 80%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:21;--cols:44;--rows:26;--dx:-149px;--dy:82px;--rz:-9deg;--z:59px;--d:212ms;--ps:1;background-size:4400% 2600%;background-position:0% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:21;--cols:44;--rows:26;--dx:-125px;--dy:56px;--rz:-28deg;--z:57px;--d:225ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:21;--cols:44;--rows:26;--dx:-156px;--dy:79px;--rz:-15deg;--z:56px;--d:238ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:21;--cols:44;--rows:26;--dx:-131px;--dy:53px;--rz:-2deg;--z:54px;--d:251ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:21;--cols:44;--rows:26;--dx:-107px;--dy:76px;--rz:-20deg;--z:52px;--d:264ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:21;--cols:44;--rows:26;--dx:-138px;--dy:50px;--rz:-8deg;--z:51px;--d:277ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:21;--cols:44;--rows:26;--dx:-114px;--dy:73px;--rz:-26deg;--z:49px;--d:290ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:21;--cols:44;--rows:26;--dx:-90px;--dy:47px;--rz:-13deg;--z:47px;--d:303ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:21;--cols:44;--rows:26;--dx:-120px;--dy:70px;--rz:-1deg;--z:46px;--d:316ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:21;--cols:44;--rows:26;--dx:-96px;--dy:93px;--rz:-19deg;--z:44px;--d:329ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:21;--cols:44;--rows:26;--dx:-72px;--dy:67px;--rz:-6deg;--z:43px;--d:342ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:21;--cols:44;--rows:26;--dx:-103px;--dy:90px;--rz:7deg;--z:41px;--d:355ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:21;--cols:44;--rows:26;--dx:-78px;--dy:64px;--rz:-12deg;--z:39px;--d:368ms;--ps:0.72;background-size:4400% 2600%;background-position:27.906976744186046% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:21;--cols:44;--rows:26;--dx:-54px;--dy:87px;--rz:1deg;--z:38px;--d:381ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:21;--cols:44;--rows:26;--dx:-30px;--dy:61px;--rz:14deg;--z:36px;--d:394ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:21;--cols:44;--rows:26;--dx:-61px;--dy:84px;--rz:-5deg;--z:34px;--d:407ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:21;--cols:44;--rows:26;--dx:-37px;--dy:58px;--rz:8deg;--z:33px;--d:420ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:21;--cols:44;--rows:26;--dx:-12px;--dy:81px;--rz:21deg;--z:31px;--d:433ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:21;--cols:44;--rows:26;--dx:-43px;--dy:55px;--rz:3deg;--z:29px;--d:446ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:21;--cols:44;--rows:26;--dx:-19px;--dy:78px;--rz:15deg;--z:28px;--d:459ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:21;--cols:44;--rows:26;--dx:5px;--dy:52px;--rz:28deg;--z:26px;--d:472ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:21;--cols:44;--rows:26;--dx:-26px;--dy:75px;--rz:10deg;--z:25px;--d:485ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:21;--cols:44;--rows:26;--dx:-1px;--dy:49px;--rz:23deg;--z:25px;--d:498ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:21;--cols:44;--rows:26;--dx:23px;--dy:72px;--rz:4deg;--z:26px;--d:511ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:21;--cols:44;--rows:26;--dx:-8px;--dy:95px;--rz:17deg;--z:28px;--d:524ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:21;--cols:44;--rows:26;--dx:16px;--dy:69px;--rz:30deg;--z:29px;--d:537ms;--ps:0.72;background-size:4400% 2600%;background-position:58.139534883720934% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:21;--cols:44;--rows:26;--dx:40px;--dy:92px;--rz:11deg;--z:31px;--d:550ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:21;--cols:44;--rows:26;--dx:65px;--dy:66px;--rz:24deg;--z:33px;--d:563ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:21;--cols:44;--rows:26;--dx:34px;--dy:89px;--rz:37deg;--z:34px;--d:576ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:21;--cols:44;--rows:26;--dx:58px;--dy:63px;--rz:19deg;--z:36px;--d:589ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:21;--cols:44;--rows:26;--dx:82px;--dy:86px;--rz:31deg;--z:38px;--d:602ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:21;--cols:44;--rows:26;--dx:51px;--dy:60px;--rz:44deg;--z:39px;--d:615ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:21;--cols:44;--rows:26;--dx:76px;--dy:83px;--rz:26deg;--z:41px;--d:628ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:21;--cols:44;--rows:26;--dx:100px;--dy:57px;--rz:38deg;--z:43px;--d:641ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:21;--cols:44;--rows:26;--dx:69px;--dy:80px;--rz:51deg;--z:44px;--d:654ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:21;--cols:44;--rows:26;--dx:93px;--dy:54px;--rz:33deg;--z:46px;--d:667ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:21;--cols:44;--rows:26;--dx:118px;--dy:77px;--rz:46deg;--z:47px;--d:680ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:21;--cols:44;--rows:26;--dx:87px;--dy:51px;--rz:27deg;--z:49px;--d:693ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:21;--cols:44;--rows:26;--dx:111px;--dy:74px;--rz:40deg;--z:51px;--d:706ms;--ps:0.72;background-size:4400% 2600%;background-position:88.37209302325581% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:21;--cols:44;--rows:26;--dx:135px;--dy:48px;--rz:53deg;--z:52px;--d:719ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:21;--cols:44;--rows:26;--dx:159px;--dy:71px;--rz:34deg;--z:54px;--d:732ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:21;--cols:44;--rows:26;--dx:129px;--dy:94px;--rz:47deg;--z:56px;--d:745ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:21;--cols:44;--rows:26;--dx:153px;--dy:68px;--rz:60deg;--z:57px;--d:758ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:21;--cols:44;--rows:26;--dx:177px;--dy:91px;--rz:42deg;--z:59px;--d:771ms;--ps:1;background-size:4400% 2600%;background-position:100% 84%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:22;--cols:44;--rows:26;--dx:-171px;--dy:74px;--rz:-20deg;--z:62px;--d:784ms;--ps:1;background-size:4400% 2600%;background-position:0% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:22;--cols:44;--rows:26;--dx:-147px;--dy:97px;--rz:-7deg;--z:60px;--d:797ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:22;--cols:44;--rows:26;--dx:-123px;--dy:71px;--rz:-25deg;--z:58px;--d:810ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:22;--cols:44;--rows:26;--dx:-153px;--dy:94px;--rz:-12deg;--z:57px;--d:823ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:22;--cols:44;--rows:26;--dx:-129px;--dy:68px;--rz:0deg;--z:55px;--d:836ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:22;--cols:44;--rows:26;--dx:-105px;--dy:91px;--rz:-18deg;--z:53px;--d:849ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:22;--cols:44;--rows:26;--dx:-136px;--dy:65px;--rz:-5deg;--z:52px;--d:862ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:22;--cols:44;--rows:26;--dx:-112px;--dy:88px;--rz:8deg;--z:50px;--d:875ms;--ps:0.72;background-size:4400% 2600%;background-position:16.27906976744186% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:22;--cols:44;--rows:26;--dx:-87px;--dy:62px;--rz:-11deg;--z:49px;--d:888ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:22;--cols:44;--rows:26;--dx:-63px;--dy:85px;--rz:2deg;--z:47px;--d:901ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:22;--cols:44;--rows:26;--dx:-94px;--dy:59px;--rz:-16deg;--z:45px;--d:914ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:22;--cols:44;--rows:26;--dx:-70px;--dy:82px;--rz:-4deg;--z:44px;--d:927ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:22;--cols:44;--rows:26;--dx:-45px;--dy:56px;--rz:9deg;--z:42px;--d:940ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:22;--cols:44;--rows:26;--dx:-76px;--dy:79px;--rz:-9deg;--z:40px;--d:953ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:22;--cols:44;--rows:26;--dx:-52px;--dy:102px;--rz:4deg;--z:39px;--d:966ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:22;--cols:44;--rows:26;--dx:-28px;--dy:76px;--rz:16deg;--z:37px;--d:979ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:22;--cols:44;--rows:26;--dx:-59px;--dy:99px;--rz:-2deg;--z:36px;--d:992ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:22;--cols:44;--rows:26;--dx:-34px;--dy:73px;--rz:11deg;--z:34px;--d:1005ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:22;--cols:44;--rows:26;--dx:-10px;--dy:96px;--rz:23deg;--z:32px;--d:1018ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:22;--cols:44;--rows:26;--dx:-41px;--dy:70px;--rz:5deg;--z:31px;--d:1031ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:22;--cols:44;--rows:26;--dx:-17px;--dy:93px;--rz:18deg;--z:29px;--d:1044ms;--ps:0.72;background-size:4400% 2600%;background-position:46.51162790697674% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:22;--cols:44;--rows:26;--dx:7px;--dy:67px;--rz:31deg;--z:27px;--d:1057ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:22;--cols:44;--rows:26;--dx:-23px;--dy:90px;--rz:12deg;--z:27px;--d:1070ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:22;--cols:44;--rows:26;--dx:1px;--dy:64px;--rz:25deg;--z:29px;--d:1083ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:22;--cols:44;--rows:26;--dx:25px;--dy:87px;--rz:7deg;--z:31px;--d:1096ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:22;--cols:44;--rows:26;--dx:49px;--dy:61px;--rz:20deg;--z:32px;--d:1109ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:22;--cols:44;--rows:26;--dx:18px;--dy:84px;--rz:32deg;--z:34px;--d:1122ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:22;--cols:44;--rows:26;--dx:43px;--dy:58px;--rz:14deg;--z:36px;--d:1135ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:22;--cols:44;--rows:26;--dx:67px;--dy:81px;--rz:27deg;--z:37px;--d:1148ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:22;--cols:44;--rows:26;--dx:36px;--dy:104px;--rz:39deg;--z:39px;--d:1161ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:22;--cols:44;--rows:26;--dx:60px;--dy:78px;--rz:21deg;--z:40px;--d:1174ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:22;--cols:44;--rows:26;--dx:84px;--dy:101px;--rz:34deg;--z:42px;--d:7ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:22;--cols:44;--rows:26;--dx:54px;--dy:75px;--rz:47deg;--z:44px;--d:20ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:22;--cols:44;--rows:26;--dx:78px;--dy:98px;--rz:28deg;--z:45px;--d:33ms;--ps:0.72;background-size:4400% 2600%;background-position:76.74418604651163% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:22;--cols:44;--rows:26;--dx:102px;--dy:72px;--rz:41deg;--z:47px;--d:46ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:22;--cols:44;--rows:26;--dx:71px;--dy:95px;--rz:54deg;--z:49px;--d:59ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:22;--cols:44;--rows:26;--dx:96px;--dy:69px;--rz:35deg;--z:50px;--d:72ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:22;--cols:44;--rows:26;--dx:120px;--dy:92px;--rz:48deg;--z:52px;--d:85ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:22;--cols:44;--rows:26;--dx:144px;--dy:66px;--rz:61deg;--z:53px;--d:98ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:22;--cols:44;--rows:26;--dx:113px;--dy:89px;--rz:43deg;--z:55px;--d:111ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:22;--cols:44;--rows:26;--dx:137px;--dy:63px;--rz:55deg;--z:57px;--d:124ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:22;--cols:44;--rows:26;--dx:162px;--dy:86px;--rz:37deg;--z:58px;--d:137ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:22;--cols:44;--rows:26;--dx:131px;--dy:60px;--rz:50deg;--z:60px;--d:150ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:22;--cols:44;--rows:26;--dx:155px;--dy:83px;--rz:62deg;--z:62px;--d:163ms;--ps:1;background-size:4400% 2600%;background-position:100% 88%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:23;--cols:44;--rows:26;--dx:-138px;--dy:65px;--rz:-30deg;--z:64px;--d:176ms;--ps:1;background-size:4400% 2600%;background-position:0% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:23;--cols:44;--rows:26;--dx:-169px;--dy:88px;--rz:-17deg;--z:63px;--d:189ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:23;--cols:44;--rows:26;--dx:-145px;--dy:111px;--rz:-4deg;--z:61px;--d:202ms;--ps:0.72;background-size:4400% 2600%;background-position:4.651162790697675% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:23;--cols:44;--rows:26;--dx:-120px;--dy:85px;--rz:-23deg;--z:60px;--d:215ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:23;--cols:44;--rows:26;--dx:-151px;--dy:108px;--rz:-10deg;--z:58px;--d:228ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:23;--cols:44;--rows:26;--dx:-127px;--dy:82px;--rz:3deg;--z:56px;--d:241ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:23;--cols:44;--rows:26;--dx:-103px;--dy:105px;--rz:-15deg;--z:55px;--d:254ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:23;--cols:44;--rows:26;--dx:-79px;--dy:79px;--rz:-3deg;--z:53px;--d:267ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:23;--cols:44;--rows:26;--dx:-109px;--dy:102px;--rz:10deg;--z:51px;--d:280ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:23;--cols:44;--rows:26;--dx:-85px;--dy:76px;--rz:-8deg;--z:50px;--d:293ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:23;--cols:44;--rows:26;--dx:-61px;--dy:99px;--rz:5deg;--z:48px;--d:306ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:23;--cols:44;--rows:26;--dx:-92px;--dy:73px;--rz:-14deg;--z:46px;--d:319ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:23;--cols:44;--rows:26;--dx:-67px;--dy:96px;--rz:-1deg;--z:45px;--d:332ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:23;--cols:44;--rows:26;--dx:-43px;--dy:70px;--rz:12deg;--z:43px;--d:345ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:23;--cols:44;--rows:26;--dx:-74px;--dy:93px;--rz:-7deg;--z:42px;--d:358ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:23;--cols:44;--rows:26;--dx:-50px;--dy:67px;--rz:6deg;--z:40px;--d:371ms;--ps:0.72;background-size:4400% 2600%;background-position:34.883720930232556% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:23;--cols:44;--rows:26;--dx:-26px;--dy:90px;--rz:19deg;--z:38px;--d:384ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:23;--cols:44;--rows:26;--dx:-56px;--dy:64px;--rz:1deg;--z:37px;--d:397ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:23;--cols:44;--rows:26;--dx:-32px;--dy:87px;--rz:13deg;--z:35px;--d:410ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:23;--cols:44;--rows:26;--dx:-8px;--dy:110px;--rz:26deg;--z:33px;--d:423ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:23;--cols:44;--rows:26;--dx:16px;--dy:84px;--rz:8deg;--z:32px;--d:436ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:23;--cols:44;--rows:26;--dx:-15px;--dy:107px;--rz:20deg;--z:30px;--d:449ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:23;--cols:44;--rows:26;--dx:10px;--dy:81px;--rz:33deg;--z:30px;--d:462ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:23;--cols:44;--rows:26;--dx:34px;--dy:104px;--rz:15deg;--z:32px;--d:475ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:23;--cols:44;--rows:26;--dx:3px;--dy:78px;--rz:28deg;--z:33px;--d:488ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:23;--cols:44;--rows:26;--dx:27px;--dy:101px;--rz:40deg;--z:35px;--d:501ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:23;--cols:44;--rows:26;--dx:51px;--dy:75px;--rz:22deg;--z:37px;--d:514ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:23;--cols:44;--rows:26;--dx:21px;--dy:98px;--rz:35deg;--z:38px;--d:527ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:23;--cols:44;--rows:26;--dx:45px;--dy:72px;--rz:17deg;--z:40px;--d:540ms;--ps:0.72;background-size:4400% 2600%;background-position:65.11627906976744% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:23;--cols:44;--rows:26;--dx:69px;--dy:95px;--rz:29deg;--z:42px;--d:553ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:23;--cols:44;--rows:26;--dx:38px;--dy:69px;--rz:42deg;--z:43px;--d:566ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:23;--cols:44;--rows:26;--dx:62px;--dy:92px;--rz:24deg;--z:45px;--d:579ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:23;--cols:44;--rows:26;--dx:87px;--dy:66px;--rz:36deg;--z:46px;--d:592ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:23;--cols:44;--rows:26;--dx:56px;--dy:89px;--rz:49deg;--z:48px;--d:605ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:23;--cols:44;--rows:26;--dx:80px;--dy:112px;--rz:31deg;--z:50px;--d:618ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:23;--cols:44;--rows:26;--dx:104px;--dy:86px;--rz:44deg;--z:51px;--d:631ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:23;--cols:44;--rows:26;--dx:129px;--dy:109px;--rz:56deg;--z:53px;--d:644ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:23;--cols:44;--rows:26;--dx:98px;--dy:83px;--rz:38deg;--z:55px;--d:657ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:23;--cols:44;--rows:26;--dx:122px;--dy:106px;--rz:51deg;--z:56px;--d:670ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:23;--cols:44;--rows:26;--dx:146px;--dy:80px;--rz:63deg;--z:58px;--d:683ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:23;--cols:44;--rows:26;--dx:115px;--dy:103px;--rz:45deg;--z:60px;--d:696ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:23;--cols:44;--rows:26;--dx:140px;--dy:77px;--rz:58deg;--z:61px;--d:709ms;--ps:0.72;background-size:4400% 2600%;background-position:95.34883720930233% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:23;--cols:44;--rows:26;--dx:164px;--dy:100px;--rz:40deg;--z:63px;--d:722ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:23;--cols:44;--rows:26;--dx:133px;--dy:74px;--rz:52deg;--z:64px;--d:735ms;--ps:1;background-size:4400% 2600%;background-position:100% 92%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:24;--cols:44;--rows:26;--dx:-160px;--dy:106px;--rz:-9deg;--z:67px;--d:748ms;--ps:1;background-size:4400% 2600%;background-position:0% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:24;--cols:44;--rows:26;--dx:-136px;--dy:80px;--rz:-27deg;--z:66px;--d:761ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:24;--cols:44;--rows:26;--dx:-167px;--dy:103px;--rz:-14deg;--z:64px;--d:774ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:24;--cols:44;--rows:26;--dx:-142px;--dy:77px;--rz:-2deg;--z:62px;--d:787ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:24;--cols:44;--rows:26;--dx:-118px;--dy:100px;--rz:-20deg;--z:61px;--d:800ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:24;--cols:44;--rows:26;--dx:-94px;--dy:74px;--rz:-7deg;--z:59px;--d:813ms;--ps:1;background-size:4400% 2600%;background-position:11.627906976744185% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:24;--cols:44;--rows:26;--dx:-125px;--dy:97px;--rz:5deg;--z:57px;--d:826ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:24;--cols:44;--rows:26;--dx:-101px;--dy:120px;--rz:-13deg;--z:56px;--d:839ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:24;--cols:44;--rows:26;--dx:-76px;--dy:94px;--rz:0deg;--z:54px;--d:852ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:24;--cols:44;--rows:26;--dx:-107px;--dy:117px;--rz:13deg;--z:53px;--d:865ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:24;--cols:44;--rows:26;--dx:-83px;--dy:91px;--rz:-6deg;--z:51px;--d:878ms;--ps:0.72;background-size:4400% 2600%;background-position:23.25581395348837% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:24;--cols:44;--rows:26;--dx:-59px;--dy:114px;--rz:7deg;--z:49px;--d:891ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:24;--cols:44;--rows:26;--dx:-89px;--dy:88px;--rz:20deg;--z:48px;--d:904ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:24;--cols:44;--rows:26;--dx:-65px;--dy:111px;--rz:2deg;--z:46px;--d:917ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:24;--cols:44;--rows:26;--dx:-41px;--dy:85px;--rz:14deg;--z:44px;--d:930ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:24;--cols:44;--rows:26;--dx:-72px;--dy:108px;--rz:-4deg;--z:43px;--d:943ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:24;--cols:44;--rows:26;--dx:-48px;--dy:82px;--rz:9deg;--z:41px;--d:956ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:24;--cols:44;--rows:26;--dx:-23px;--dy:105px;--rz:21deg;--z:40px;--d:969ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:24;--cols:44;--rows:26;--dx:1px;--dy:79px;--rz:3deg;--z:38px;--d:982ms;--ps:1;background-size:4400% 2600%;background-position:41.86046511627907% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:24;--cols:44;--rows:26;--dx:-30px;--dy:102px;--rz:16deg;--z:36px;--d:995ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:24;--cols:44;--rows:26;--dx:-6px;--dy:76px;--rz:29deg;--z:35px;--d:1008ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:24;--cols:44;--rows:26;--dx:18px;--dy:99px;--rz:10deg;--z:33px;--d:1021ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:24;--cols:44;--rows:26;--dx:-12px;--dy:73px;--rz:23deg;--z:33px;--d:1034ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:24;--cols:44;--rows:26;--dx:12px;--dy:96px;--rz:36deg;--z:35px;--d:1047ms;--ps:0.72;background-size:4400% 2600%;background-position:53.48837209302325% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:24;--cols:44;--rows:26;--dx:36px;--dy:119px;--rz:17deg;--z:36px;--d:1060ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:24;--cols:44;--rows:26;--dx:5px;--dy:93px;--rz:30deg;--z:38px;--d:1073ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:24;--cols:44;--rows:26;--dx:29px;--dy:116px;--rz:43deg;--z:40px;--d:1086ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:24;--cols:44;--rows:26;--dx:54px;--dy:90px;--rz:25deg;--z:41px;--d:1099ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:24;--cols:44;--rows:26;--dx:23px;--dy:113px;--rz:37deg;--z:43px;--d:1112ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:24;--cols:44;--rows:26;--dx:47px;--dy:87px;--rz:19deg;--z:44px;--d:1125ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:24;--cols:44;--rows:26;--dx:71px;--dy:110px;--rz:32deg;--z:46px;--d:1138ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:24;--cols:44;--rows:26;--dx:95px;--dy:84px;--rz:45deg;--z:48px;--d:1151ms;--ps:1;background-size:4400% 2600%;background-position:72.09302325581395% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:24;--cols:44;--rows:26;--dx:65px;--dy:107px;--rz:26deg;--z:49px;--d:1164ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:24;--cols:44;--rows:26;--dx:89px;--dy:81px;--rz:39deg;--z:51px;--d:1177ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:24;--cols:44;--rows:26;--dx:113px;--dy:104px;--rz:52deg;--z:53px;--d:10ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:24;--cols:44;--rows:26;--dx:82px;--dy:78px;--rz:33deg;--z:54px;--d:23ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:24;--cols:44;--rows:26;--dx:107px;--dy:101px;--rz:46deg;--z:56px;--d:36ms;--ps:0.72;background-size:4400% 2600%;background-position:83.72093023255815% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:24;--cols:44;--rows:26;--dx:131px;--dy:75px;--rz:59deg;--z:57px;--d:49ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:24;--cols:44;--rows:26;--dx:100px;--dy:98px;--rz:41deg;--z:59px;--d:62ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:24;--cols:44;--rows:26;--dx:124px;--dy:121px;--rz:53deg;--z:61px;--d:75ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:24;--cols:44;--rows:26;--dx:148px;--dy:95px;--rz:66deg;--z:62px;--d:88ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:24;--cols:44;--rows:26;--dx:118px;--dy:118px;--rz:48deg;--z:64px;--d:101ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:24;--cols:44;--rows:26;--dx:142px;--dy:92px;--rz:60deg;--z:66px;--d:114ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:24;--cols:44;--rows:26;--dx:166px;--dy:115px;--rz:73deg;--z:67px;--d:127ms;--ps:1;background-size:4400% 2600%;background-position:100% 96%;"></span><span class="tz-identity-pixel-tile" style="--c:0;--r:25;--cols:44;--rows:26;--dx:-182px;--dy:97px;--rz:-19deg;--z:70px;--d:140ms;--ps:1;background-size:4400% 2600%;background-position:0% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:1;--r:25;--cols:44;--rows:26;--dx:-158px;--dy:120px;--rz:-6deg;--z:68px;--d:153ms;--ps:1;background-size:4400% 2600%;background-position:2.3255813953488373% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:2;--r:25;--cols:44;--rows:26;--dx:-134px;--dy:94px;--rz:-25deg;--z:67px;--d:166ms;--ps:1;background-size:4400% 2600%;background-position:4.651162790697675% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:3;--r:25;--cols:44;--rows:26;--dx:-109px;--dy:117px;--rz:-12deg;--z:65px;--d:179ms;--ps:1;background-size:4400% 2600%;background-position:6.976744186046512% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:4;--r:25;--cols:44;--rows:26;--dx:-140px;--dy:91px;--rz:1deg;--z:63px;--d:192ms;--ps:1;background-size:4400% 2600%;background-position:9.30232558139535% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:5;--r:25;--cols:44;--rows:26;--dx:-116px;--dy:114px;--rz:-17deg;--z:62px;--d:205ms;--ps:0.72;background-size:4400% 2600%;background-position:11.627906976744185% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:6;--r:25;--cols:44;--rows:26;--dx:-92px;--dy:88px;--rz:-5deg;--z:60px;--d:218ms;--ps:1;background-size:4400% 2600%;background-position:13.953488372093023% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:7;--r:25;--cols:44;--rows:26;--dx:-123px;--dy:111px;--rz:8deg;--z:59px;--d:231ms;--ps:1;background-size:4400% 2600%;background-position:16.27906976744186% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:8;--r:25;--cols:44;--rows:26;--dx:-98px;--dy:85px;--rz:-10deg;--z:57px;--d:244ms;--ps:1;background-size:4400% 2600%;background-position:18.6046511627907% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:9;--r:25;--cols:44;--rows:26;--dx:-74px;--dy:108px;--rz:2deg;--z:55px;--d:257ms;--ps:1;background-size:4400% 2600%;background-position:20.930232558139537% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:10;--r:25;--cols:44;--rows:26;--dx:-105px;--dy:82px;--rz:15deg;--z:54px;--d:270ms;--ps:1;background-size:4400% 2600%;background-position:23.25581395348837% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:11;--r:25;--cols:44;--rows:26;--dx:-81px;--dy:105px;--rz:-3deg;--z:52px;--d:283ms;--ps:1;background-size:4400% 2600%;background-position:25.581395348837212% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:12;--r:25;--cols:44;--rows:26;--dx:-56px;--dy:128px;--rz:10deg;--z:50px;--d:296ms;--ps:1;background-size:4400% 2600%;background-position:27.906976744186046% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:13;--r:25;--cols:44;--rows:26;--dx:-87px;--dy:102px;--rz:22deg;--z:49px;--d:309ms;--ps:1;background-size:4400% 2600%;background-position:30.23255813953488% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:14;--r:25;--cols:44;--rows:26;--dx:-63px;--dy:125px;--rz:4deg;--z:47px;--d:322ms;--ps:1;background-size:4400% 2600%;background-position:32.55813953488372% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:15;--r:25;--cols:44;--rows:26;--dx:-39px;--dy:99px;--rz:17deg;--z:46px;--d:335ms;--ps:1;background-size:4400% 2600%;background-position:34.883720930232556% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:16;--r:25;--cols:44;--rows:26;--dx:-15px;--dy:122px;--rz:-1deg;--z:44px;--d:348ms;--ps:1;background-size:4400% 2600%;background-position:37.2093023255814% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:17;--r:25;--cols:44;--rows:26;--dx:-45px;--dy:96px;--rz:11deg;--z:42px;--d:361ms;--ps:1;background-size:4400% 2600%;background-position:39.53488372093023% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:18;--r:25;--cols:44;--rows:26;--dx:-21px;--dy:119px;--rz:24deg;--z:41px;--d:374ms;--ps:0.72;background-size:4400% 2600%;background-position:41.86046511627907% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:19;--r:25;--cols:44;--rows:26;--dx:3px;--dy:93px;--rz:6deg;--z:39px;--d:387ms;--ps:1;background-size:4400% 2600%;background-position:44.18604651162791% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:20;--r:25;--cols:44;--rows:26;--dx:-28px;--dy:116px;--rz:18deg;--z:37px;--d:400ms;--ps:1;background-size:4400% 2600%;background-position:46.51162790697674% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:21;--r:25;--cols:44;--rows:26;--dx:-4px;--dy:90px;--rz:31deg;--z:36px;--d:413ms;--ps:1;background-size:4400% 2600%;background-position:48.837209302325576% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:22;--r:25;--cols:44;--rows:26;--dx:21px;--dy:113px;--rz:13deg;--z:36px;--d:426ms;--ps:1;background-size:4400% 2600%;background-position:51.162790697674424% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:23;--r:25;--cols:44;--rows:26;--dx:-10px;--dy:87px;--rz:26deg;--z:37px;--d:439ms;--ps:1;background-size:4400% 2600%;background-position:53.48837209302325% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:24;--r:25;--cols:44;--rows:26;--dx:14px;--dy:110px;--rz:38deg;--z:39px;--d:452ms;--ps:1;background-size:4400% 2600%;background-position:55.81395348837209% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:25;--r:25;--cols:44;--rows:26;--dx:38px;--dy:84px;--rz:20deg;--z:41px;--d:465ms;--ps:1;background-size:4400% 2600%;background-position:58.139534883720934% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:26;--r:25;--cols:44;--rows:26;--dx:7px;--dy:107px;--rz:33deg;--z:42px;--d:478ms;--ps:1;background-size:4400% 2600%;background-position:60.46511627906976% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:27;--r:25;--cols:44;--rows:26;--dx:32px;--dy:81px;--rz:45deg;--z:44px;--d:491ms;--ps:1;background-size:4400% 2600%;background-position:62.7906976744186% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:28;--r:25;--cols:44;--rows:26;--dx:56px;--dy:104px;--rz:27deg;--z:46px;--d:504ms;--ps:1;background-size:4400% 2600%;background-position:65.11627906976744% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:29;--r:25;--cols:44;--rows:26;--dx:80px;--dy:127px;--rz:40deg;--z:47px;--d:517ms;--ps:1;background-size:4400% 2600%;background-position:67.44186046511628% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:30;--r:25;--cols:44;--rows:26;--dx:49px;--dy:101px;--rz:53deg;--z:49px;--d:530ms;--ps:1;background-size:4400% 2600%;background-position:69.76744186046511% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:31;--r:25;--cols:44;--rows:26;--dx:73px;--dy:124px;--rz:34deg;--z:50px;--d:543ms;--ps:0.72;background-size:4400% 2600%;background-position:72.09302325581395% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:32;--r:25;--cols:44;--rows:26;--dx:98px;--dy:98px;--rz:47deg;--z:52px;--d:556ms;--ps:1;background-size:4400% 2600%;background-position:74.4186046511628% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:33;--r:25;--cols:44;--rows:26;--dx:67px;--dy:121px;--rz:29deg;--z:54px;--d:569ms;--ps:1;background-size:4400% 2600%;background-position:76.74418604651163% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:34;--r:25;--cols:44;--rows:26;--dx:91px;--dy:95px;--rz:42deg;--z:55px;--d:582ms;--ps:1;background-size:4400% 2600%;background-position:79.06976744186046% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:35;--r:25;--cols:44;--rows:26;--dx:115px;--dy:118px;--rz:54deg;--z:57px;--d:595ms;--ps:1;background-size:4400% 2600%;background-position:81.3953488372093% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:36;--r:25;--cols:44;--rows:26;--dx:85px;--dy:92px;--rz:36deg;--z:59px;--d:608ms;--ps:1;background-size:4400% 2600%;background-position:83.72093023255815% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:37;--r:25;--cols:44;--rows:26;--dx:109px;--dy:115px;--rz:49deg;--z:60px;--d:621ms;--ps:1;background-size:4400% 2600%;background-position:86.04651162790698% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:38;--r:25;--cols:44;--rows:26;--dx:133px;--dy:89px;--rz:61deg;--z:62px;--d:634ms;--ps:1;background-size:4400% 2600%;background-position:88.37209302325581% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:39;--r:25;--cols:44;--rows:26;--dx:102px;--dy:112px;--rz:43deg;--z:63px;--d:647ms;--ps:1;background-size:4400% 2600%;background-position:90.69767441860465% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:40;--r:25;--cols:44;--rows:26;--dx:126px;--dy:86px;--rz:56deg;--z:65px;--d:660ms;--ps:1;background-size:4400% 2600%;background-position:93.02325581395348% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:41;--r:25;--cols:44;--rows:26;--dx:151px;--dy:109px;--rz:69deg;--z:67px;--d:673ms;--ps:1;background-size:4400% 2600%;background-position:95.34883720930233% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:42;--r:25;--cols:44;--rows:26;--dx:175px;--dy:83px;--rz:50deg;--z:68px;--d:686ms;--ps:1;background-size:4400% 2600%;background-position:97.67441860465115% 100%;"></span><span class="tz-identity-pixel-tile" style="--c:43;--r:25;--cols:44;--rows:26;--dx:144px;--dy:106px;--rz:63deg;--z:70px;--d:699ms;--ps:1;background-size:4400% 2600%;background-position:100% 100%;"></span></div>`;






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

              <a class="tz-edit-btn" href="/qr/${escapeHtml(profile.username || "")}">QR</a>

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
              <div class="tz-identity-story-embed" aria-label="Tapzy digital identity visual">
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

      .tz-identity-story-screen.frosted-story-screen .tz-identity-story-media,
      .tz-identity-story-screen .tz-identity-story-media{
        display:none!important;
      }
      .tz-identity-story-screen .tz-identity-story-embed{
        isolation:isolate;
        background:
          radial-gradient(ellipse at 62% 44%, rgba(255,255,255,.095), transparent 20%),
          radial-gradient(ellipse at 34% 48%, rgba(135,170,205,.065), transparent 38%),
          #000!important;
        box-shadow:inset 0 0 0 1px rgba(255,255,255,.055), inset 0 0 110px rgba(0,0,0,.92)!important;
      }
      .tz-identity-pixel-face.exact-rebuild{
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
        z-index:2;
        overflow:hidden;
        transform:none;
        transform-origin:50% 56%;
        transform-style:preserve-3d;
        perspective:none;
        filter:drop-shadow(0 0 22px rgba(255,255,255,.18)) drop-shadow(0 0 82px rgba(190,215,238,.11));
        animation:tzIdentityAliveBreath 14s ease-in-out infinite;
      }
      .tz-identity-pixel-face.exact-rebuild::before,
      .tz-identity-pixel-face.exact-rebuild::after{
        content:"";
        position:absolute;
        inset:-13%;
        pointer-events:none;
      }
      .tz-identity-pixel-face.exact-rebuild::before{
        z-index:1;
        background-image:url('/images/tapzy-identity-digital-face.jpg');
        background-size:100% 100%;
        background-position:center;
        opacity:.08;
        filter:blur(18px) brightness(1.55) contrast(1.22);
        mix-blend-mode:screen;
        animation:tzIdentityGhostBloom 10.8s ease-in-out infinite;
      }
      .tz-identity-pixel-face.exact-rebuild::after{
        z-index:5;
        background:
          radial-gradient(ellipse at 64% 43%, rgba(255,255,255,.42), rgba(255,255,255,.16) 7%, transparent 19%),
          radial-gradient(ellipse at 30% 30%, rgba(255,255,255,.16), transparent 26%),
          linear-gradient(90deg, transparent 0 42%, rgba(255,255,255,.18) 50%, transparent 60% 100%);
        opacity:.28;
        filter:blur(2px);
        mix-blend-mode:screen;
        animation:tzIdentityCorePulse 4.8s ease-in-out infinite;
      }
      .tz-identity-pixel-tile{
        position:absolute;
        left:calc(var(--c) * 100% / var(--cols));
        top:calc(var(--r) * 100% / var(--rows));
        width:calc(100% / var(--cols) + 1.8px);
        height:calc(100% / var(--rows) + 1.8px);
        background-image:url('/images/tapzy-identity-digital-face.jpg');
        background-repeat:no-repeat;
        border-radius:999px;
        overflow:hidden;
        opacity:.94;
        transform:translate3d(0,0,0) rotate(0deg) scale(1);
        transform-origin:50% 68%;
        box-shadow:0 0 10px rgba(255,255,255,.075), inset 0 0 0 .25px rgba(255,255,255,.08);
        animation:tzIdentityAliveTile 14s ease-in-out infinite, tzIdentityPremiumFlicker 7.5s ease-in-out infinite;
        animation-delay:calc(var(--d) * -1), calc(var(--d) * -1);
        will-change:transform, opacity, filter, box-shadow;
      }
      .tz-identity-story-screen .tz-identity-story-embed::before{
        background:
          radial-gradient(circle at 18% 24%, rgba(255,255,255,.12) 0 1px, transparent 2px),
          radial-gradient(circle at 42% 65%, rgba(255,255,255,.09) 0 1px, transparent 2px),
          radial-gradient(circle at 82% 18%, rgba(255,255,255,.07) 0 1px, transparent 2px),
          linear-gradient(90deg, transparent 0 28px, rgba(255,255,255,.025) 28px 29px, transparent 29px 58px),
          linear-gradient(0deg, transparent 0 28px, rgba(255,255,255,.018) 28px 29px, transparent 29px 58px),
          radial-gradient(ellipse at center, transparent 56%, rgba(0,0,0,.72) 100%)!important;
        background-size:96px 96px,140px 140px,170px 170px,58px 58px,58px 58px,100% 100%!important;
        background-position:0 0,0 0,0 0,0 0,0 0,center!important;
        mix-blend-mode:screen;
        opacity:.2;
        z-index:3!important;
        animation:tzIdentityPremiumField 36s linear infinite;
      }
      .tz-identity-story-screen .tz-identity-story-embed::after{
        z-index:4!important;
        background:
          linear-gradient(90deg, transparent 0 36%, rgba(255,255,255,.16) 49%, transparent 62% 100%),
          repeating-linear-gradient(0deg, rgba(255,255,255,.024) 0 1px, transparent 1px 11px),
          radial-gradient(ellipse at 61% 44%, transparent 24%, rgba(255,255,255,.055) 26%, transparent 34%),
          radial-gradient(ellipse at center, transparent 56%, rgba(0,0,0,.74) 100%)!important;
        background-size:260% 100%,100% 16px,100% 100%,100% 100%!important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.12), inset 0 -1px 0 rgba(255,255,255,.045), inset 0 0 62px rgba(0,0,0,.7)!important;
        animation:tzIdentityPremiumScan 30s ease-in-out infinite;
      }
      @keyframes tzIdentityAliveTile{
        0%,100%{opacity:.96;filter:brightness(.9) contrast(1.14) blur(.03px);transform:translate3d(0,0,0) skewY(0deg) scale(var(--ps))}
        30%{opacity:.98;filter:brightness(1) contrast(1.09) blur(.015px);transform:translate3d(calc(var(--dx) * .0008), -1px, 0) skewY(-.25deg) scale(calc(1.002 * var(--ps)))}
        52%{opacity:1;filter:brightness(1.1) contrast(1.06) blur(0);transform:translate3d(calc(var(--dx) * -.001), -2px, 0) skewY(-.65deg) scale(calc(1.006 * var(--ps)))}
        72%{opacity:.98;filter:brightness(.98) contrast(1.1) blur(.01px);transform:translate3d(calc(var(--dx) * .0007), 1px, 0) skewY(.2deg) scale(calc(1.001 * var(--ps)))}
      }
      @keyframes tzIdentityPremiumFlicker{
        0%,100%{box-shadow:0 0 7px rgba(255,255,255,.05), inset 0 0 0 .22px rgba(255,255,255,.08)}
        50%{box-shadow:0 0 15px rgba(255,255,255,.13), 0 0 28px rgba(190,215,238,.07), inset 0 0 0 .32px rgba(255,255,255,.14)}
      }
      @keyframes tzIdentityAliveBreath{
        0%,100%{transform:none;filter:drop-shadow(0 0 18px rgba(255,255,255,.14)) drop-shadow(0 0 70px rgba(190,215,238,.1))}
        50%{transform:skewY(-.18deg);filter:drop-shadow(0 0 30px rgba(255,255,255,.22)) drop-shadow(0 0 98px rgba(190,215,238,.14))}
        70%{transform:skewY(.08deg);filter:drop-shadow(0 0 22px rgba(255,255,255,.17)) drop-shadow(0 0 80px rgba(190,215,238,.11))}
      }
      @keyframes tzIdentityGhostBloom{
        0%,100%{opacity:.03;transform:scale(.96);filter:blur(24px) brightness(1.2) contrast(1.1)}
        38%,78%{opacity:.13;transform:scale(1.04);filter:blur(16px) brightness(1.8) contrast(1.24)}
      }
      @keyframes tzIdentityCorePulse{
        0%,100%{opacity:.14;transform:translate3d(-1.4%,.6%,0) scale(.96);filter:blur(5px)}
        38%,64%{opacity:.46;transform:translate3d(.5%,-.3%,0) scale(1.06);filter:blur(1.9px)}
        78%{opacity:.24;transform:translate3d(1.2%,0,0) scale(.98);filter:blur(3.6px)}
      }
      @keyframes tzIdentityPremiumField{
        0%{background-position:0 0,0 0,0 0,0 0,0 0,center;opacity:.08;transform:scale(1.02)}
        45%,72%{opacity:.12;transform:scale(1.01)}
        100%{background-position:24px -16px,-20px 24px,30px -22px,14px -10px,-12px 14px,center;opacity:.08;transform:scale(1.02)}
      }
      @keyframes tzIdentityPremiumScan{
        0%{opacity:.05;background-position:-145% 0,0 0,0 0,0 0}
        38%{opacity:.18;background-position:18% 0,0 4px,0 0,0 0}
        70%{opacity:.1;background-position:78% 0,0 -4px,0 0,0 0}
        100%{opacity:.05;background-position:260% 0,0 0,0 0,0 0}
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
