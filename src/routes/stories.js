const router = require("express").Router();
const fsp = require("fs/promises");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");



const prisma = require("../prisma");



const { upload, uploadsDir, safeUploadFilename } = require("../upload");



const {

  renderShell,

  renderTapzyAssistant,

  escapeHtml,

  publicAbsoluteUrl,

  formatPrettyLocal,

  backUrl,

} = require("../utils");
const { createNotification } = require("../services/notificationService");

function extractMentions(value) {
  const matches = String(value || "").match(/@([a-zA-Z0-9_\.]+)/g) || [];
  return Array.from(new Set(matches.map((item) => item.slice(1).toLowerCase()).filter(Boolean)));
}



function expiresIn24Hours() {

  return new Date(Date.now() + 24 * 60 * 60 * 1000);

}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function liveKitConfig() {
  const url = String(process.env.LIVEKIT_URL || "").trim();
  const apiKey = String(process.env.LIVEKIT_API_KEY || "").trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || "").trim();
  return { url, apiKey, apiSecret, configured: !!(url && apiKey && apiSecret) };
}

function signLiveKitToken({ room, identity, name, canPublish }) {
  const { apiKey, apiSecret } = liveKitConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: apiKey,
    sub: identity,
    name,
    nbf: now - 10,
    exp: now + 60 * 60 * 2,
    video: {
      room,
      roomJoin: true,
      canPublish: !!canPublish,
      canSubscribe: true,
      canPublishData: true,
    },
  };
  const body = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = crypto.createHmac("sha256", apiSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

const liveRecordingSessions = new Map();
const liveRecordUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 },
});

function liveRecordingExtension(mimetype = "") {
  const type = String(mimetype || "").toLowerCase();
  if (type.includes("mp4")) return ".mp4";
  if (type.includes("quicktime")) return ".mov";
  return ".webm";
}

async function removeLiveRecordingSession(session) {
  if (!session) return;
  liveRecordingSessions.delete(session.storyId);
  if (session.removeFile) {
    await fsp.unlink(session.finalPath).catch(() => {});
  }
}



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

function safeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function isLiveStreamUrl(value) {
  const parsed = safeUrl(value);
  if (!parsed) return false;
  return true;
}

function isNativeLiveUrl(value) {
  return /^\/stories\/live\/[a-zA-Z0-9_-]+/.test(String(value || "").trim());
}

function youtubeEmbedUrl(value) {
  const parsed = safeUrl(value);
  if (!parsed) return "";
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  let videoId = "";

  if (host === "youtu.be") {
    videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
  } else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (parsed.pathname === "/watch") {
      videoId = parsed.searchParams.get("v") || "";
    } else if (parsed.pathname.startsWith("/live/") || parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/")) {
      videoId = parsed.pathname.split("/").filter(Boolean)[1] || "";
    }
  }

  videoId = String(videoId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!videoId) return "";
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&playsinline=1&rel=0&modestbranding=1`;
}

function renderLiveStreamMedia(url, title, index = 0, className = "sf-media") {
  if (isNativeLiveUrl(url)) {
    const safeClass = escapeHtml(className);
    const previewSrc = url.includes("?") ? `${url}&embed=1` : `${url}?embed=1`;
    return `
    <a class="sf-native-live-preview ${safeClass}" href="${escapeHtml(url)}" aria-label="Open Tapzy live">
      <iframe class="sf-native-live-frame" src="${escapeHtml(previewSrc)}" title="${escapeHtml(title || "Tapzy Live")}" allow="autoplay; camera; microphone; encrypted-media; picture-in-picture" loading="${index < 2 ? "eager" : "lazy"}"></iframe>
    </a>`;
  }

  const embedUrl = youtubeEmbedUrl(url);
  const safeClass = escapeHtml(className);
  if (embedUrl) {
    return `<iframe class="${safeClass} sf-live-embed" src="${escapeHtml(embedUrl)}" title="${escapeHtml(title || "Tapzy live stream")}" allow="autoplay; encrypted-media; picture-in-picture; web-share" allowfullscreen loading="${index < 2 ? "eager" : "lazy"}"></iframe>`;
  }

  return `
  <a class="sf-live-link ${safeClass}" href="${escapeHtml(url)}" target="_blank" rel="noopener">
    <span class="sf-live-badge">LIVE</span>
    <strong>${escapeHtml(title || "Open live stream")}</strong>
    <em>Tap to watch live</em>
  </a>`;
}

function configuredCreatorStreams() {
  const raw = String(process.env.TAPZY_CREATOR_STREAMS || "").trim();
  if (!raw) return [];
  return raw
    .split(";")
    .map((item, index) => {
      const [titleRaw, urlRaw, categoryRaw] = item.split("|").map((part) => String(part || "").trim());
      if (!titleRaw || !isLiveStreamUrl(urlRaw)) return null;
      return {
        id: `creator-live-${index}`,
        title: titleRaw,
        category: categoryRaw || "Creator Live",
        description: "Featured creator live stream playing now on Tapzy.",
        venueName: "YouTube Live",
        city: "Live Now",
        liveUrl: urlRaw,
        startAt: new Date(Date.now() + index * 30000),
      };
    })
    .filter(Boolean);
}



function storyRing(profile, storyCount, hasLiveStory) {

  const photo = profile.photo

    ? `<img src="${escapeHtml(profile.photo)}" alt="${escapeHtml(profile.name || profile.username || "User")}" />`

    : `<span>${escapeHtml(((profile.name || profile.username || "T")[0] || "T").toUpperCase())}</span>`;



  return `

  <a class="story-ring-card" href="/stories/${escapeHtml(profile.username || "")}">

    <div class="story-ring ${hasLiveStory ? "story-ring-live" : ""}">

      <div class="story-ring-inner">${photo}</div>

    </div>

    <div class="story-ring-name">@${escapeHtml(profile.username || "user")}</div>

    <div class="story-ring-count">${storyCount} stor${storyCount === 1 ? "y" : "ies"}</div>

  </a>

  `;

}



function storyComposer(currentProfile, upcomingEvents) {

  if (!currentProfile) {

    return `

    <section class="stories-create-card tapzy-premium-card">

      <div class="stories-create-head">

        <div>

          <div class="stories-kicker">Tapzy Stories</div>

          <h2 class="stories-title">Create a story</h2>

          <div class="stories-subtitle">Sign in to post photo, video, or event stories that disappear in 24 hours.</div>

        </div>

        <a class="stories-btn stories-btn-bright" href="/auth">Sign in</a>

      </div>

    </section>

    `;

  }



  return `

  <section class="stories-create-card tapzy-premium-card">

    <div class="stories-create-head">

      <div>

        <div class="stories-kicker">Tapzy Stories</div>

        <h2 class="stories-title">Create a story</h2>

        <div class="stories-subtitle">Post quick updates, event plans, or live moments. Stories expire after 24 hours.</div>

      </div>

    </div>



    <form class="stories-create-form" method="POST" action="/stories" enctype="multipart/form-data" data-story-composer>

      <div class="stories-form-grid stories-form-grid-premium">

        <div class="stories-field stories-field-full">

          <label>Caption</label>

          <textarea name="text" maxlength="280" placeholder="What’s happening? Going somewhere tonight? At an event right now?"></textarea>

          <div class="stories-caption-meter"><span data-caption-count>0</span>/280</div>

        </div>



        <div class="stories-field stories-media-field">

          <label>Media</label>

          <label class="stories-upload-drop">

            <input type="file" name="storyMedia" accept="image/*,video/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif,.mov,.mp4,.m4v,.webm,.3gp,.3gpp,.avi,.hevc" />

            <span class="stories-upload-icon">＋</span>

            <span class="stories-upload-title">Add photo or video</span>

            <span class="stories-upload-subtitle" data-upload-label>Photos or videos · duration is not limited</span>

          </label>

        </div>

        <div class="stories-field stories-field-full stories-live-field">

          <label>Live stream (optional)</label>

          <input name="liveUrl" type="url" inputmode="url" placeholder="Paste a YouTube Live, Twitch, Kick, or stream link" data-live-url />

          <div class="stories-event-hint">Use this when you want the story to open as a live stream. Uploading media will take priority if both are added.</div>

        </div>



        <div class="stories-preview-card" data-story-preview>

          <div class="stories-preview-empty">Preview appears here</div>

        </div>



        <input type="hidden" name="type" value="text" />



        <div class="stories-field stories-field-full">

          <label>Add event (optional)</label>

          <select name="eventId" data-story-event-select>

            <option value="">No event</option>

            ${upcomingEvents

              .map(

                (event) =>

                  `<option value="${escapeHtml(event.id)}">Going: ${escapeHtml(event.title)}${

                    event.city ? " • " + escapeHtml(event.city) : ""

                  }</option>`

              )

              .join("")}

            <option value="__other__">Other event not in Tapzy</option>

          </select>

          <div class="stories-event-hint">Only events marked Going show here. Use Other to add something manually.</div>

          <div class="stories-manual-event" data-manual-event hidden>
            <input name="manualEventTitle" maxlength="120" placeholder="Event name" />
            <input name="manualEventLocation" maxlength="160" placeholder="Location / venue / address" data-manual-event-location />
            <div class="stories-manual-row">
              <button class="stories-mini-btn" type="button" data-use-location>Use my location</button>
              <span class="stories-location-status" data-location-status></span>
            </div>
            <input type="hidden" name="manualEventLat" data-manual-event-lat />
            <input type="hidden" name="manualEventLng" data-manual-event-lng />
          </div>

        </div>

      </div>



      <div class="stories-create-actions">

        <a class="stories-btn stories-btn-live" href="${currentProfile ? "/stories/live/new" : "/auth"}">Go Live</a>

        <button class="stories-btn stories-btn-bright" type="submit" data-story-submit>Post Story</button>

        <span class="stories-post-status" data-story-status></span>

      </div>

    </form>

  </section>

  `;

}
function profileStoryCard(profile, stories, currentProfile) {

  const firstStory = stories[0];

  const previewUrl = firstStory?.mediaUrl || "";

  const previewIsVideo = isVideoUrl(previewUrl);
  const previewIsLive = firstStory?.type === "live" && isLiveStreamUrl(previewUrl);



  const mediaHtml = previewUrl

    ? previewIsLive

      ? `<div class="stories-profile-preview-fallback">LIVE</div>`

      : previewIsVideo

      ? `<video class="stories-profile-preview-media" src="${escapeHtml(previewUrl)}" muted playsinline></video>`

      : `<img class="stories-profile-preview-media" src="${escapeHtml(previewUrl)}" alt="${escapeHtml(profile.username || "story")}" loading="lazy" decoding="async" />`

    : `<div class="stories-profile-preview-fallback">@${escapeHtml(profile.username || "user")}</div>`;



  const createdAtMs = firstStory?.createdAt ? new Date(firstStory.createdAt).getTime() : Date.now();

  const diffMs = Math.max(0, Date.now() - createdAtMs);

  const diffMinutes = Math.floor(diffMs / 60000);

  const diffHours = Math.floor(diffMs / 3600000);



  let ageLabel = "Just now";

  if (diffHours >= 1) {

    ageLabel = `${diffHours}h`;

  } else if (diffMinutes >= 1) {

    ageLabel = `${diffMinutes}m`;

  }



  const isOwnStory = !!(currentProfile && (String(currentProfile.id || "") === String(profile.id || "") || String(currentProfile.username || "").toLowerCase() === String(profile.username || "").toLowerCase()));

  const storyOwnerLabel = isOwnStory ? "Your Story" : `@${profile.username || profile.name || "user"}`;

  return `

  <a class="stories-profile-card" href="/stories/${escapeHtml(profile.username || "")}">

    <div class="stories-profile-preview">

      ${mediaHtml}

      <div class="stories-profile-overlay"></div>

    </div>

    <div class="stories-profile-meta">

      <div class="stories-profile-age">${escapeHtml(ageLabel)}</div>

      <div class="stories-profile-handle">${escapeHtml(storyOwnerLabel)}</div>

    </div>

  </a>

  `;

}

function compactFeedCount(value) {
  const count = Math.max(0, Number(value) || 0);
  if (count >= 1000000) return `${(count / 1000000).toFixed(count >= 10000000 ? 0 : 1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K`;
  return String(count);
}

function tapzyMarkImg(className = "tapzy-mark") {
  return `<img class="${escapeHtml(className)}" src="/images/tapzy-mark-white.png" alt="" aria-hidden="true" decoding="async" />`;
}

function eventStreamTone(event = {}) {
  const text = `${event.category || ""} ${event.title || ""} ${event.description || ""}`.toLowerCase();
  if (/(box|boxing|fight|mma|ufc|wrestl)/.test(text)) return "Fight Night";
  if (/(sport|game|basket|hockey|soccer|football|baseball|tennis|race)/.test(text)) return "Live Sports";
  if (/(dance|party|club|nightlife|dj|lounge)/.test(text)) return "Live Party";
  if (/(concert|music|festival|artist|band)/.test(text)) return "Live Music";
  return "Live Event";
}

function eventStreamGradient(index = 0) {
  const gradients = [
    "radial-gradient(circle at 30% 18%,rgba(45,118,255,.42),transparent 34%),radial-gradient(circle at 78% 30%,rgba(255,80,140,.26),transparent 36%),linear-gradient(180deg,#101827,#02040a)",
    "radial-gradient(circle at 25% 20%,rgba(255,184,77,.30),transparent 34%),radial-gradient(circle at 80% 24%,rgba(60,120,255,.38),transparent 38%),linear-gradient(180deg,#141017,#020204)",
    "radial-gradient(circle at 28% 18%,rgba(125,220,255,.25),transparent 36%),radial-gradient(circle at 80% 32%,rgba(102,76,255,.35),transparent 38%),linear-gradient(180deg,#0b1220,#010205)",
  ];
  return gradients[Math.abs(index) % gradients.length];
}

function fallbackEventStreams() {
  const now = Date.now();
  return [
    {
      id: "virtual-sports-live",
      title: "Live Sports Stream",
      category: "Sports",
      description: "Game-day energy, live crowd moments, and sports happening now.",
      venueName: "Tapzy Live",
      city: "Live Now",
      startAt: new Date(now),
    },
    {
      id: "virtual-fight-night",
      title: "Fight Night Watch Party",
      category: "Boxing",
      description: "Boxing, fight-night reactions, and big-screen watch party moments.",
      venueName: "Tapzy Live",
      city: "Live Now",
      startAt: new Date(now + 60000),
    },
    {
      id: "virtual-party-live",
      title: "Live Party Feed",
      category: "Dances",
      description: "Parties, DJs, dance floors, and nightlife energy from Tapzy.",
      venueName: "Tapzy Live",
      city: "Live Now",
      startAt: new Date(now + 120000),
    },
  ];
}



router.get("/stories", async (req, res) => {

  try {

    const currentProfile = req.currentProfile || null;

    const now = new Date();



    let upcomingEvents = [];

    if (currentProfile) {

      const goingRows = await prisma.eventAttendance.findMany({

        where: {

          profileId: currentProfile.id,

          status: "going",

          event: {

            OR: [{ startAt: null }, { startAt: { gte: now } }],

          },

        },

        include: { event: true },

        orderBy: [{ updatedAt: "desc" }],

        take: 30,

      });

      upcomingEvents = goingRows
        .map((row) => row.event)
        .filter(Boolean)
        .sort((a, b) => {
          const at = a.startAt ? new Date(a.startAt).getTime() : Number.MAX_SAFE_INTEGER;
          const bt = b.startAt ? new Date(b.startAt).getTime() : Number.MAX_SAFE_INTEGER;
          return at - bt;
        })
        .slice(0, 20);

    }



    const storyProfileHref = currentProfile?.username ? `/u/${currentProfile.username}` : "/auth";

    const body = `

    <div class="wrap stories-wrap">

      ${storyComposer(currentProfile, upcomingEvents)}

    </div>

    <nav class="stories-bottom-nav" aria-label="Primary navigation">
      <a class="stories-bottom-link" href="/stories/feed">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8v10h-6v-7H9v7H3V11Z"></path></svg>
        <span>Home</span>
      </a>
      <a class="stories-bottom-create is-active" href="/stories" aria-label="Create story">+</a>
      <a class="stories-bottom-link" href="${storyProfileHref}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 22c0-5 3-8 8-8s8 3 8 8"></path></svg>
        <span>Profile</span>
      </a>
    </nav>



    <style>

      .stories-wrap{

        max-width:1120px;

        padding-bottom:calc(96px + env(safe-area-inset-bottom, 0px));

      }



      .stories-create-card,

      .stories-discover-card{

        position:relative;

        overflow:hidden;

        border-radius:32px;

        border:1px solid rgba(255,255,255,.08);

        background:

          radial-gradient(700px 260px at 50% -5%, rgba(127,210,255,.08), transparent 48%),

          linear-gradient(180deg, rgba(10,12,18,.98), rgba(6,6,8,1));

        box-shadow:0 24px 70px rgba(0,0,0,.40);

        padding:24px;

      }



      .stories-discover-card{

        margin-top:18px;

      }



      .stories-kicker{

        color:#95a5bf;

        text-transform:uppercase;

        letter-spacing:4px;

        font-size:12px;

      }



      .stories-title{

        margin:10px 0 0 0;

        font-size:42px;

        line-height:1;

      }



      .stories-subtitle{

        margin-top:10px;

        max-width:680px;

        color:#bcc8d8;

        line-height:1.7;

        font-size:15px;

      }



      .stories-create-head,

      .stories-head-row{

        display:flex;

        justify-content:space-between;

        gap:16px;

        align-items:flex-start;

        flex-wrap:wrap;

      }



      .stories-create-form{

        margin-top:18px;

      }



      .stories-form-grid{

        display:grid;

        grid-template-columns:1fr 1fr;

        gap:14px;

      }



      .stories-field{

        display:flex;

        flex-direction:column;

        gap:8px;

      }



      .stories-field-full{

        grid-column:1 / -1;

      }



      .stories-field label{

        color:#fff;

        font-size:14px;

        font-weight:800;

      }



      .stories-field textarea,

      .stories-field input,

      .stories-field select{

        width:100%;

        min-height:52px;

        border-radius:18px;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(12,15,21,.98), rgba(4,6,10,1));

        color:#fff;

        padding:14px 16px;

        box-sizing:border-box;

        font-size:15px;

      }



      .stories-field textarea{

        min-height:130px;

        resize:vertical;

      }



      .stories-create-actions{

        margin-top:16px;
        display:flex;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;

      }



      .stories-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:48px;

        padding:0 18px;

        border-radius:16px;

        text-decoration:none;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(18,21,31,.96), rgba(10,12,18,.98));

        color:#fff;

        font-size:14px;

        font-weight:800;

        cursor:pointer;

      }



      .stories-btn-bright{

        border:none;

        background:

          radial-gradient(circle at 50% 0%, rgba(150,230,255,.18), transparent 55%),

          linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));

      }

      .stories-btn-live{
        border:none;
        background:
          radial-gradient(circle at 20% 0%, rgba(255,255,255,.22), transparent 42%),
          linear-gradient(135deg, #31d6ff, #2d6bff 48%, #123fbd);
        box-shadow:0 0 24px rgba(47,118,255,.30);
      }



      .stories-bottom-nav{

        position:fixed;

        z-index:20;

        left:0;

        right:0;

        bottom:0;

        height:calc(64px + env(safe-area-inset-bottom, 0px));

        padding:7px 10px env(safe-area-inset-bottom, 0px);

        display:flex;

        align-items:center;

        justify-content:space-around;

        gap:0;

        background:#030303;

        border-top:1px solid rgba(255,255,255,.08);

        box-shadow:none;

      }



      .stories-bottom-link{

        min-width:55px;

        display:flex;

        flex-direction:column;

        align-items:center;

        gap:2px;

        color:rgba(255,255,255,.72);

        text-decoration:none;

        font-size:10px;

        font-weight:650;

        -webkit-tap-highlight-color:transparent;

      }



      .stories-bottom-link svg{

        width:25px;

        height:25px;

        fill:none;

        stroke:currentColor;

        stroke-width:2;

        stroke-linecap:round;

        stroke-linejoin:round;

      }



      .stories-bottom-create{

        width:56px;

        height:38px;

        display:grid;

        place-items:center;

        border:2px solid #fff;

        border-radius:11px;

        background:linear-gradient(145deg,#2f76ff,#1145ad);

        color:#fff;

        text-decoration:none;

        font-size:29px;

        font-weight:900;

        line-height:1;

        box-shadow:0 5px 18px rgba(35,102,231,.42);

        -webkit-tap-highlight-color:transparent;

      }



      .stories-bottom-create:active{

        transform:translateY(1px) scale(.985);

      }



      .stories-profile-grid{

        display:grid;

        grid-template-columns:repeat(3, minmax(0, 1fr));

        gap:16px;

        margin-top:18px;

      }



      .stories-profile-card{

        position:relative;

        overflow:hidden;

        min-height:320px;

        border-radius:24px;

        border:1px solid rgba(255,255,255,.08);

        text-decoration:none;

        background:#0b0d14;

        box-shadow:0 16px 40px rgba(0,0,0,.28);

      }



      .stories-profile-preview{

        position:absolute;

        inset:0;

        overflow:hidden;

      }



      .stories-profile-preview-media{

        width:100%;

        height:100%;

        object-fit:cover;

        display:block;

      }



      .stories-profile-preview-fallback{

        width:100%;

        height:100%;

        display:flex;

        align-items:center;

        justify-content:center;

        font-size:34px;

        font-weight:900;

        color:#fff;

        background:

          radial-gradient(500px 300px at 50% 0%, rgba(125,214,255,.10), transparent 48%),

          linear-gradient(180deg, rgba(14,18,28,.96), rgba(8,10,16,.99));

      }



      .stories-profile-overlay{

        position:absolute;

        inset:0;

        background:linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.22) 35%, rgba(0,0,0,.76));

      }



      .stories-profile-meta{

        position:absolute;

        left:18px;

        right:18px;

        bottom:18px;

        z-index:2;

      }



      .stories-profile-age{

        color:#fff;

        font-size:18px;

        font-weight:900;

        line-height:1.1;

      }



      .stories-profile-handle{

        margin-top:8px;

        color:#dce7f6;

        font-size:14px;

        font-weight:500;

        line-height:1.2;

      }



      .stories-empty{

        margin-top:16px;

        padding:18px;

        border-radius:18px;

        border:1px solid rgba(255,255,255,.08);

        background:rgba(255,255,255,.03);

      }



      @media(max-width:900px){

        .stories-profile-grid{

          grid-template-columns:1fr 1fr;

        }

      }



      @media(max-width:700px){

        .stories-create-card,

        .stories-discover-card{

          padding:18px;

          border-radius:24px;

        }



        .stories-title{

          font-size:32px;

        }



        .stories-form-grid{

          grid-template-columns:1fr;

        }



        .stories-profile-grid{

          grid-template-columns:1fr;

        }



        .stories-profile-card{

          min-height:260px;

          border-radius:20px;

        }

      }


      .tapzy-premium-card::before{
        content:"";
        position:absolute;
        inset:-45% -25% auto -25%;
        height:260px;
        background:radial-gradient(circle, rgba(70,160,255,.18), transparent 64%);
        pointer-events:none;
      }

      .stories-create-card{
        isolation:isolate;
      }

      .stories-create-card > *,
      .stories-discover-card > *{
        position:relative;
        z-index:1;
      }

      .stories-form-grid-premium{
        grid-template-columns:minmax(0, 1.1fr) minmax(260px, .9fr);
        align-items:stretch;
      }

      .stories-caption-meter{
        align-self:flex-end;
        color:rgba(220,231,246,.58);
        font-size:12px;
        font-weight:800;
        letter-spacing:.5px;
      }

      .stories-upload-drop{
        min-height:160px;
        border-radius:22px;
        border:1px dashed rgba(160,190,230,.22);
        background:
          radial-gradient(circle at 50% 0%, rgba(125,214,255,.10), transparent 60%),
          linear-gradient(180deg, rgba(12,15,21,.98), rgba(4,6,10,1));
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:8px;
        cursor:pointer;
        text-align:center;
        padding:18px;
        transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease;
      }

      .stories-upload-drop:hover{
        transform:translateY(-1px);
        border-color:rgba(150,220,255,.42);
        box-shadow:0 16px 40px rgba(0,0,0,.22), 0 0 30px rgba(70,160,255,.08);
      }

      .stories-upload-drop input{
        display:none;
      }

      .stories-upload-icon{
        width:54px;
        height:54px;
        border-radius:18px;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:28px;
        color:#fff;
        background:linear-gradient(180deg, rgba(42,94,210,.94), rgba(18,43,98,.98));
        box-shadow:0 14px 35px rgba(36,100,255,.22);
      }

      .stories-upload-title{
        color:#fff;
        font-weight:900;
        font-size:15px;
      }

      .stories-upload-subtitle,
      .stories-post-status{
        color:#96a5bd;
        font-size:12px;
        font-weight:700;
      }

      .stories-preview-card{
        min-height:220px;
        border-radius:24px;
        border:1px solid rgba(255,255,255,.08);
        background:
          linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.015)),
          #070a10;
        overflow:hidden;
        display:flex;
        align-items:center;
        justify-content:center;
        color:#9eabc0;
        font-size:13px;
        font-weight:800;
      }

      .stories-preview-card img,
      .stories-preview-card video{
        width:100%;
        height:100%;
        min-height:220px;
        object-fit:cover;
        display:block;
      }


      .stories-event-hint{
        margin-top:8px;
        color:#91a1b8;
        font-size:12px;
        font-weight:700;
      }

      .stories-manual-event{
        margin-top:12px;
        display:grid;
        gap:10px;
      }

      .stories-manual-event[hidden]{
        display:none;
      }

      .stories-manual-event input{
        width:100%;
        min-height:44px;
        border-radius:14px;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(12,15,21,.98), rgba(4,6,10,1));
        color:#fff;
        padding:0 14px;
        box-sizing:border-box;
        font-size:14px;
      }

      .stories-manual-row{
        display:flex;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;
      }

      .stories-mini-btn{
        min-height:34px;
        padding:0 12px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.07);
        color:#fff;
        font-size:12px;
        font-weight:850;
        cursor:pointer;
      }

      .stories-location-status{
        color:#96a5bd;
        font-size:12px;
        font-weight:700;
      }

      .stories-profile-card::after{
        content:"";
        position:absolute;
        inset:0;
        border-radius:inherit;
        box-shadow:inset 0 0 0 1px rgba(255,255,255,.06), inset 0 0 40px rgba(86,170,255,.08);
        pointer-events:none;
      }

      .stories-profile-card{
        transform:translateZ(0);
      }

      @media(max-width:520px){
        .stories-create-card{
          padding:16px;
          overflow:hidden;
        }

        .stories-form-grid-premium,
        .stories-form-grid{
          display:grid;
          grid-template-columns:minmax(0, 1fr) !important;
          gap:14px;
        }

        .stories-field,
        .stories-media-field,
        .stories-preview-card{
          min-width:0;
          width:100%;
          grid-column:1 / -1;
        }

        .stories-upload-drop{
          min-height:132px;
          width:100%;
          box-sizing:border-box;
          border-radius:20px;
          padding:16px;
        }

        .stories-preview-card{
          min-height:190px;
          border-radius:22px;
        }

        .stories-field textarea,
        .stories-field select{
          font-size:16px;
        }

        .stories-create-actions{
          margin-top:14px;
        }

        .stories-create-actions .stories-btn{
          min-height:38px;
          padding:0 13px;
          border-radius:13px;
          font-size:13px;
          width:auto;
        }
      }

    </style>




    <script>
      (function(){
        const form = document.querySelector('[data-story-composer]');
        if (!form) return;
        const textarea = form.querySelector('textarea[name="text"]');
        const count = form.querySelector('[data-caption-count]');
        const file = form.querySelector('input[name="storyMedia"]');
        const liveUrl = form.querySelector('[data-live-url]');
        const label = form.querySelector('[data-upload-label]');
        const preview = form.querySelector('[data-story-preview]');
        const status = form.querySelector('[data-story-status]');
        const submit = form.querySelector('[data-story-submit]');
        const eventSelect = form.querySelector('[data-story-event-select]');
        const manualEvent = form.querySelector('[data-manual-event]');
        const useLocation = form.querySelector('[data-use-location]');
        const locationStatus = form.querySelector('[data-location-status]');
        const manualLocationInput = form.querySelector('[data-manual-event-location]');
        const manualLatInput = form.querySelector('[data-manual-event-lat]');
        const manualLngInput = form.querySelector('[data-manual-event-lng]');

        function updateCount(){
          if (count && textarea) count.textContent = String((textarea.value || '').length);
        }

        if (textarea) {
          textarea.addEventListener('input', updateCount, { passive:true });
          updateCount();
        }

        let activePreviewUrl = null;

        function clearPreviewUrl(){
          if (activePreviewUrl && window.URL && URL.revokeObjectURL) {
            try { URL.revokeObjectURL(activePreviewUrl); } catch (e) {}
          }
          activePreviewUrl = null;
        }

        function renderPreview(selected){
          if (!preview || !selected) return;
          clearPreviewUrl();

          const type = selected.type || '';
          const name = (selected.name || '').toLowerCase();
          const isVideo = type.indexOf('video/') === 0 || /\.(mov|mp4|webm|m4v|3gp|3gpp|avi|hevc)$/i.test(name);

          if (isVideo) {
            activePreviewUrl = URL.createObjectURL(selected);
            preview.innerHTML = '<video src="' + activePreviewUrl + '" playsinline webkit-playsinline preload="metadata" controls></video>';
            const video = preview.querySelector('video');
            if (video) {
              try {
                video.defaultMuted = false;
                video.muted = false;
                video.volume = 1;
                video.removeAttribute('muted');
              } catch (e) {}
              video.addEventListener('play', function(){
                try { video.defaultMuted = false; video.muted = false; video.volume = 1; video.removeAttribute('muted'); } catch (e) {}
              });
              video.addEventListener('click', function(){
                try { video.defaultMuted = false; video.muted = false; video.volume = 1; video.removeAttribute('muted'); video.play().catch(function(){}); } catch (e) {}
              });
              if (video.load) video.load();
            }
            return;
          }

          const reader = new FileReader();
          reader.onload = function(e){
            const src = e && e.target ? e.target.result : '';
            if (!src) return;
            preview.innerHTML = '<img src="' + src + '" alt="Story preview" loading="eager" decoding="async" />';
          };
          reader.onerror = function(){
            activePreviewUrl = URL.createObjectURL(selected);
            preview.innerHTML = '<img src="' + activePreviewUrl + '" alt="Story preview" loading="eager" decoding="async" />';
          };
          reader.readAsDataURL(selected);
        }

        if (file) {
          file.addEventListener('change', function(){
            const selected = file.files && file.files[0];
            if (!selected) return;
            if (label) label.textContent = selected.name || 'Media selected';
            renderPreview(selected);
          });
        }

        if (liveUrl && preview) {
          liveUrl.addEventListener('input', function(){
            const selected = file && file.files && file.files[0];
            const value = (liveUrl.value || '').trim();
            if (!value || selected) return;
            clearPreviewUrl();
            preview.innerHTML = '<div class="stories-preview-empty">Live stream story ready</div>';
          });
        }

        function syncManualEvent(){
          if (!manualEvent || !eventSelect) return;
          manualEvent.hidden = eventSelect.value !== '__other__';
        }

        if (eventSelect) {
          eventSelect.addEventListener('change', syncManualEvent);
          syncManualEvent();
        }

        if (useLocation) {
          useLocation.addEventListener('click', function(){
            if (!navigator.geolocation) {
              if (locationStatus) locationStatus.textContent = 'Location is not available on this device.';
              return;
            }
            if (locationStatus) locationStatus.textContent = 'Getting location…';
            navigator.geolocation.getCurrentPosition(function(pos){
              const lat = pos && pos.coords ? pos.coords.latitude : null;
              const lng = pos && pos.coords ? pos.coords.longitude : null;
              if (manualLatInput && lat != null) manualLatInput.value = String(lat);
              if (manualLngInput && lng != null) manualLngInput.value = String(lng);
              if (manualLocationInput && !manualLocationInput.value && lat != null && lng != null) {
                manualLocationInput.value = 'Current location: ' + lat.toFixed(5) + ', ' + lng.toFixed(5);
              }
              if (locationStatus) locationStatus.textContent = 'Location added.';
            }, function(){
              if (locationStatus) locationStatus.textContent = 'Location permission was not enabled.';
            }, { enableHighAccuracy:true, timeout:8000, maximumAge:60000 });
          });
        }

        form.addEventListener('submit', function(){
          if (form.dataset.tapzyVideoIntercepting === '1' && form.dataset.tapzyVideoPrepared !== '1') return;
          if (status) status.textContent = 'Preparing story…';
          if (submit) {
            submit.disabled = true;
            submit.textContent = 'Posting…';
          }
        });
      })();
    </script>
    ${renderTapzyAssistant({

      username: currentProfile?.username || "User",

      pageType: "stories",

    })}

    `;



    res.send(

      renderShell("Stories", body, "", {

        currentProfile,

        pageTitle: "Stories",

        pageType: "stories",

        storiesTopNavActive: "discover",

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("Stories page error");

  }

});



router.post("/stories", upload.single("storyMedia"), async (req, res) => {

  try {

    const currentProfile = req.currentProfile;

    if (!currentProfile) return res.redirect("/auth");



    const text = String(req.body.text || "").trim() || null;

    const requestedType = String(req.body.type || "").trim().toLowerCase();
    const requestedLiveUrl = String(req.body.liveUrl || "").trim();
    const chunkedMediaUrl = String(req.body.tapzyChunkedMediaUrl || "").trim();

    let eventId = String(req.body.eventId || "").trim() || null;
    const manualEventTitle = String(req.body.manualEventTitle || "").trim();
    const manualEventLocation = String(req.body.manualEventLocation || "").trim();
    const manualEventLatRaw = String(req.body.manualEventLat || "").trim();
    const manualEventLngRaw = String(req.body.manualEventLng || "").trim();

    if (eventId === "__other__") {
      eventId = null;
      if (manualEventTitle) {
        const lat = Number.parseFloat(manualEventLatRaw);
        const lng = Number.parseFloat(manualEventLngRaw);
        const manualEvent = await prisma.eventFinderItem.create({
          data: {
            source: "manual-story",
            sourceEventId: `${currentProfile.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: manualEventTitle.slice(0, 120),
            venueName: manualEventLocation ? manualEventLocation.slice(0, 160) : null,
            address: manualEventLocation ? manualEventLocation.slice(0, 160) : null,
            latitude: Number.isFinite(lat) ? lat : null,
            longitude: Number.isFinite(lng) ? lng : null,
            startAt: new Date(),
            rawPayload: { manual: true, createdFrom: "story-composer", profileId: currentProfile.id },
          },
        });
        await prisma.eventAttendance.upsert({
          where: { profileId_eventId: { profileId: currentProfile.id, eventId: manualEvent.id } },
          update: { status: "going" },
          create: { profileId: currentProfile.id, eventId: manualEvent.id, status: "going" },
        });
        eventId = manualEvent.id;
      }
    } else if (eventId) {
      const goingEvent = await prisma.eventAttendance.findFirst({
        where: { profileId: currentProfile.id, eventId, status: "going" },
        select: { id: true },
      });
      if (!goingEvent) eventId = null;
    }

    let mediaUrl = null;

    if (req.file) {

      mediaUrl = publicAbsoluteUrl(req, `/uploads/${req.file.filename}`);

    } else if (chunkedMediaUrl) {

      mediaUrl = chunkedMediaUrl;

    } else if (requestedLiveUrl && isLiveStreamUrl(requestedLiveUrl)) {

      mediaUrl = requestedLiveUrl;

    }



    let type = "text";

    if (!req.file && requestedLiveUrl && mediaUrl) type = "live";

    else if (requestedType === "video") type = "video";

    else if (requestedType === "image") type = "image";



    if (mediaUrl && isVideoUrl(mediaUrl)) type = "video";

    else if (mediaUrl && type !== "video") type = "image";



    const createdStory = await prisma.story.create({

      data: {

        profileId: currentProfile.id,

        eventId: eventId || null,

        type,

        mediaUrl,

        text,

        expiresAt: expiresIn24Hours(),

      },

    });

    const mentionedUsernames = extractMentions(text);
    if (mentionedUsernames.length) {
      const mentionedProfiles = await prisma.userProfile.findMany({
        where: { username: { in: mentionedUsernames } },
        select: { id: true, username: true },
      });

      await Promise.all(
        mentionedProfiles.map((profile) =>
          createNotification({
            profileId: profile.id,
            actorId: currentProfile.id,
            type: "story_mention",
            title: `${currentProfile.name || currentProfile.username || "Someone"} mentioned you in a story`,
            body: text ? String(text).trim().slice(0, 140) : "",
            link: currentProfile.username ? `/stories/${currentProfile.username}` : "/stories",
            entityType: "story",
            entityId: createdStory.id,
            image: String(currentProfile.photo || "").trim() || null,
            skipDuplicateWindow: false,
          })
        )
      );
    }

    res.redirect(backUrl(req, "/stories"));

  } catch (e) {

    console.error(e);

    res.status(500).send("Create story error");

  }

});

router.post("/stories/live/recorded", upload.single("media"), async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).json({ ok: false, error: "Sign in required" });
    if (!req.file) return res.status(400).json({ ok: false, error: "Missing live recording" });

    const title = String(req.body.title || "").trim() || `${currentProfile.name || currentProfile.username || "Tapzy creator"} was live`;
    const liveStoryId = String(req.body.liveStoryId || "").trim();
    const mediaUrl = publicAbsoluteUrl(req, `/uploads/${req.file.filename}`);
    const existingLiveStory = liveStoryId
      ? await prisma.story.findFirst({ where: { id: liveStoryId, profileId: currentProfile.id, type: "live" } })
      : null;
    const story = existingLiveStory
      ? await prisma.story.update({
          where: { id: existingLiveStory.id },
          data: {
            type: "video",
            mediaUrl,
            text: title.slice(0, 220),
            expiresAt: expiresIn24Hours(),
            createdAt: new Date(),
          },
        })
      : await prisma.story.create({
          data: {
            profileId: currentProfile.id,
            type: "video",
            mediaUrl,
            text: title.slice(0, 220),
            expiresAt: expiresIn24Hours(),
          },
        });

    res.json({ ok: true, storyId: story.id, mediaUrl, feedUrl: "/stories/feed" });
  } catch (error) {
    console.error("Post recorded live error:", error);
    res.status(500).json({ ok: false, error: "Could not post live recording" });
  }
});

router.post("/stories/live/recorded-url", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).json({ ok: false, error: "Sign in required" });

    const mediaUrl = String(req.body.mediaUrl || "").trim();
    if (!mediaUrl || !isVideoUrl(mediaUrl)) {
      return res.status(400).json({ ok: false, error: "Missing playable live recording" });
    }

    const title = String(req.body.title || "").trim() || `${currentProfile.name || currentProfile.username || "Tapzy creator"} was live`;
    const liveStoryId = String(req.body.liveStoryId || "").trim();
    const existingLiveStory = liveStoryId
      ? await prisma.story.findFirst({ where: { id: liveStoryId, profileId: currentProfile.id, type: "live" } })
      : null;
    const story = existingLiveStory
      ? await prisma.story.update({
          where: { id: existingLiveStory.id },
          data: {
            type: "video",
            mediaUrl,
            text: title.slice(0, 220),
            expiresAt: expiresIn24Hours(),
            createdAt: new Date(),
          },
        })
      : await prisma.story.create({
          data: {
            profileId: currentProfile.id,
            type: "video",
            mediaUrl,
            text: title.slice(0, 220),
            expiresAt: expiresIn24Hours(),
          },
        });

    res.json({ ok: true, storyId: story.id, mediaUrl, feedUrl: "/stories/feed" });
  } catch (error) {
    console.error("Post recorded live URL error:", error);
    res.status(500).json({ ok: false, error: "Could not post live recording" });
  }
});

router.post("/stories/live/now", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).json({ ok: false, error: "Sign in required" });

    const title = String(req.body.title || "").trim() || `${currentProfile.name || currentProfile.username || "Tapzy creator"} is live`;
    const story = await prisma.story.create({
      data: {
        profileId: currentProfile.id,
        type: "live",
        mediaUrl: "",
        text: title.slice(0, 220),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });
    await prisma.story.update({
      where: { id: story.id },
      data: { mediaUrl: `/stories/live/${story.id}` },
    });

    res.json({ ok: true, storyId: story.id, feedUrl: "/stories/feed" });
  } catch (error) {
    console.error("Create live-now story error:", error);
    res.status(500).json({ ok: false, error: "Could not show live on Home" });
  }
});

router.post("/stories/live/now/cancel", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).json({ ok: false, error: "Sign in required" });

    const liveStoryId = String(req.body.liveStoryId || "").trim();
    if (liveStoryId) {
      await prisma.story.updateMany({
        where: { id: liveStoryId, profileId: currentProfile.id, type: "live" },
        data: { expiresAt: new Date() },
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Cancel live-now story error:", error);
    res.status(500).json({ ok: false });
  }
});

router.post("/stories/live/:id/provider-token", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const currentProfile = req.currentProfile || null;
    const story = await prisma.story.findFirst({
      where: { id, type: "live", expiresAt: { gt: new Date() } },
      include: { profile: true },
    });
    if (!story) return res.status(404).json({ ok: false, error: "Live not found" });

    const role = String(req.body.role || "viewer").toLowerCase();
    const canPublish = !!(currentProfile && story.profileId === currentProfile.id && role === "host");
    const config = liveKitConfig();
    if (!config.configured) {
      return res.json({ ok: true, configured: false });
    }

    const identity = currentProfile
      ? `${currentProfile.id}-${canPublish ? "host" : "viewer"}`
      : `guest-${crypto.randomBytes(8).toString("hex")}`;
    const name = currentProfile?.name || currentProfile?.username || "Tapzy viewer";
    const room = `tapzy-live-${story.id}`;
    const token = signLiveKitToken({ room, identity, name, canPublish });

    res.json({
      ok: true,
      configured: true,
      url: config.url,
      token,
      room,
      canPublish,
    });
  } catch (error) {
    console.error("Live provider token error:", error);
    res.status(500).json({ ok: false, error: "Could not join live provider" });
  }
});

router.get("/stories/live/new", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const displayName = currentProfile.name || currentProfile.username || "Tapzy creator";
    const defaultTitle = "";
    res.send(`<!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
      <meta name="theme-color" content="#000000" />
      <title>Go Live · Tapzy</title>
      <style>
        :root{color-scheme:dark;--safe-top:env(safe-area-inset-top,0px);--safe-bottom:env(safe-area-inset-bottom,0px)}
        *{box-sizing:border-box}
        html,body{margin:0;width:100%;height:100%;background:#000;color:#fff;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
        .tl-recorder{position:relative;height:100%;display:grid;grid-template-rows:1fr auto;background:#000;overflow:hidden}
        video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#05070c}
        .tl-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45),transparent 24%,rgba(0,0,0,.80))}
        .tl-top{position:absolute;top:calc(var(--safe-top) + 20px);left:22px;right:22px;display:flex;align-items:center;justify-content:space-between;z-index:2}
        .tl-badge{display:inline-flex;align-items:center;gap:8px;padding:9px 13px;border-radius:999px;background:rgba(15,18,26,.68);border:1px solid rgba(255,255,255,.12);font-size:12px;font-weight:950;letter-spacing:.18em}
        .tl-dot{width:9px;height:9px;border-radius:999px;background:#ff285f;box-shadow:0 0 18px rgba(255,40,95,.75)}
        .tl-close{width:54px;height:54px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.38);color:#fff;text-decoration:none;display:grid;place-items:center;font-size:30px;font-weight:300}
        .tl-copy{position:absolute;left:22px;right:22px;bottom:calc(var(--safe-bottom) + 176px);z-index:2}
        h1{margin:0 0 8px;font-size:42px;line-height:.98;letter-spacing:-.05em}
        p{margin:0;color:rgba(255,255,255,.75);font-size:16px;line-height:1.35}
        .tl-controls{position:absolute;left:18px;right:18px;bottom:calc(var(--safe-bottom) + 18px);z-index:2;display:grid;gap:12px}
        input{width:100%;min-height:52px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.56);color:#fff;font:inherit;font-weight:800;outline:none}
        .tl-buttons{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        button{min-height:56px;border:0;border-radius:999px;font:inherit;font-weight:950;font-size:17px;cursor:pointer}
        button:disabled{opacity:.45;cursor:not-allowed}
        .tl-primary{background:linear-gradient(135deg,#31d6ff,#2d6bff 52%,#123fbd);color:#fff;box-shadow:0 0 34px rgba(47,118,255,.38)}
        .tl-danger{background:linear-gradient(135deg,#ff5f7e,#e90044);color:#fff;box-shadow:0 0 28px rgba(255,30,82,.25)}
        .tl-ghost{background:rgba(255,255,255,.10);color:#fff;border:1px solid rgba(255,255,255,.12)}
        .tl-status{min-height:22px;text-align:center;color:#c9d7f2;font-size:13px;font-weight:800}
        .is-recording .tl-dot{animation:pulse 1s infinite}
        @keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.35);opacity:.72}}
      </style>
    </head>
    <body>
      <main class="tl-recorder" id="recorder">
        <video id="preview" autoplay muted playsinline webkit-playsinline></video>
        <div class="tl-shade"></div>
        <div class="tl-top">
          <div class="tl-badge"><span class="tl-dot"></span>LIVE REC</div>
          <a class="tl-close" href="/stories/feed" aria-label="Close">×</a>
        </div>
        <section class="tl-copy">
          <h1>Go Live</h1>
          <p>Record in the app. When you end it, Tapzy posts the video story for 24 hours.</p>
        </section>
        <section class="tl-controls">
          <input id="title" maxlength="120" value="${escapeHtml(defaultTitle)}" placeholder="${escapeHtml(displayName)}" autocomplete="off" />
          <div class="tl-buttons">
            <button class="tl-primary" id="startBtn" type="button">Start</button>
            <button class="tl-danger" id="stopBtn" type="button" disabled>End & Post</button>
          </div>
          <div class="tl-buttons">
            <button class="tl-ghost" id="flipBtn" type="button">Flip</button>
            <button class="tl-ghost" id="cancelBtn" type="button">Cancel</button>
          </div>
          <div class="tl-status" id="status">Starting camera...</div>
        </section>
      </main>
      <script src="/socket.io/socket.io.js"></script>
      <script>
        (function(){
          const root = document.getElementById('recorder');
          const preview = document.getElementById('preview');
          const startBtn = document.getElementById('startBtn');
          const stopBtn = document.getElementById('stopBtn');
          const flipBtn = document.getElementById('flipBtn');
          const cancelBtn = document.getElementById('cancelBtn');
          const titleInput = document.getElementById('title');
          const status = document.getElementById('status');
          const CHUNK_SIZE = 8 * 1024 * 1024;
          const DIRECT_LIMIT = 110 * 1024 * 1024;
          let stream = null;
          let recorder = null;
          let chunks = [];
          let facingMode = 'user';
          let posting = false;
          let liveStoryId = '';
          let liveReadyPromise = null;
          let socket = null;
          let providerRoom = null;
          let liveName = ${JSON.stringify(displayName)};
          const peers = new Map();
          const peerConfig = { iceServers: [{ urls:'stun:stun.l.google.com:19302' }, { urls:'stun:stun1.l.google.com:19302' }] };

          function setStatus(text){ status.textContent = text || ''; }
          function mimeType(){
            if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
            return ['video/mp4;codecs=h264,aac','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(function(type){
              return MediaRecorder.isTypeSupported(type);
            }) || '';
          }
          function inferType(file){ return file.type || 'video/webm'; }
          async function postJson(url, body){
            const res = await fetch(url, {
              method:'POST',
              headers:{ 'Accept':'application/json', 'Content-Type':'application/json' },
              body:JSON.stringify(body || {}),
            });
            const data = await res.json().catch(function(){ return {}; });
            if (!res.ok || !data.ok) throw new Error(data.error || 'Request failed');
            return data;
          }
          async function startCamera(){
            if (stream) stream.getTracks().forEach(function(track){ track.stop(); });
            stream = await navigator.mediaDevices.getUserMedia({
              video:{ facingMode:facingMode, width:{ ideal:720 }, height:{ ideal:1280 } },
              audio:true,
            });
            preview.srcObject = stream;
            await preview.play().catch(function(){});
            syncStreamToPeers();
            setStatus('Ready');
          }
          function syncStreamToPeers(){
            if (!stream) return;
            peers.forEach(function(pc){
              stream.getTracks().forEach(function(track){
                const sender = pc.getSenders().find(function(item){
                  return item.track && item.track.kind === track.kind;
                });
                if (sender) sender.replaceTrack(track).catch(function(){});
                else {
                  try { pc.addTrack(track, stream); } catch(e) {}
                }
              });
            });
          }
          function peerFor(id){
            if (peers.has(id)) return peers.get(id);
            const pc = new RTCPeerConnection(peerConfig);
            peers.set(id, pc);
            pc.onicecandidate = function(event){
              if (event.candidate && socket) socket.emit('live:ice', { storyId:liveStoryId, to:id, candidate:event.candidate });
            };
            if (stream) {
              stream.getTracks().forEach(function(track){
                try { pc.addTrack(track, stream); } catch(e) {}
              });
            }
            return pc;
          }
          function loadLiveKitClient(){
            return new Promise(function(resolve, reject){
              if (window.LivekitClient) return resolve(window.LivekitClient);
              const script = document.createElement('script');
              script.src = 'https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js';
              script.async = true;
              script.onload = function(){ window.LivekitClient ? resolve(window.LivekitClient) : reject(new Error('Live provider SDK unavailable')); };
              script.onerror = function(){ reject(new Error('Live provider SDK failed to load')); };
              document.head.appendChild(script);
            });
          }
          async function startProviderBroadcast(){
            if (!liveStoryId || !stream || providerRoom) return false;
            const tokenData = await postJson('/stories/live/' + encodeURIComponent(liveStoryId) + '/provider-token', { role:'host' });
            if (!tokenData.configured) return false;
            const LK = await loadLiveKitClient();
            const room = new LK.Room({ adaptiveStream:true, dynacast:true });
            await room.connect(tokenData.url, tokenData.token);
            for (const track of stream.getTracks()) {
              await room.localParticipant.publishTrack(track);
            }
            providerRoom = room;
            return true;
          }
          function startLiveBroadcast(){
            if (!liveStoryId || !stream || socket) return;
            startProviderBroadcast().catch(function(error){ console.error(error); });
            socket = io();
            socket.on('connect', function(){
              socket.emit('live:join', { storyId:liveStoryId, role:'host', name:liveName });
            });
            socket.on('live:viewer-joined', async function(payload){
              const viewerId = payload.viewerId;
              const pc = peerFor(viewerId);
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              socket.emit('live:offer', { storyId:liveStoryId, to:viewerId, sdp:offer });
            });
            socket.on('live:answer', async function(payload){
              const pc = peers.get(payload.from);
              if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            });
            socket.on('live:ice', async function(payload){
              const pc = peerFor(payload.from);
              try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch(e) {}
            });
          }
          function stopLiveBroadcast(){
            if (providerRoom) {
              try { providerRoom.disconnect(); } catch(e) {}
              providerRoom = null;
            }
            if (socket) {
              try { socket.emit('live:end', { storyId:liveStoryId }); } catch(e) {}
              try { socket.disconnect(); } catch(e) {}
              socket = null;
            }
            peers.forEach(function(pc){ try { pc.close(); } catch(e) {} });
            peers.clear();
          }
          async function uploadChunkWithRetry(uploadId, index, blob){
            let lastError = null;
            for (let attempt = 0; attempt < 3; attempt += 1) {
              try {
                const formData = new FormData();
                formData.append('chunk', blob, String(index) + '.part');
                const res = await fetch('/media/chunk/' + encodeURIComponent(uploadId) + '/' + index, {
                  method:'POST',
                  body:formData,
                });
                const data = await res.json().catch(function(){ return {}; });
                if (!res.ok || !data.ok) throw new Error(data.error || 'Chunk failed');
                return data;
              } catch (error) {
                lastError = error;
                await new Promise(function(resolve){ setTimeout(resolve, 500 * (attempt + 1)); });
              }
            }
            throw lastError || new Error('Chunk failed');
          }
          async function uploadChunked(file){
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
            const session = await postJson('/media/chunk/start', {
              originalName:file.name || 'tapzy-live.webm',
              type:inferType(file),
              size:file.size,
              totalChunks:totalChunks,
            });
            for (let index = 0; index < totalChunks; index += 1) {
              const start = index * CHUNK_SIZE;
              const chunk = file.slice(start, Math.min(file.size, start + CHUNK_SIZE));
              await uploadChunkWithRetry(session.uploadId, index, chunk);
              setStatus('Uploading ' + Math.round(((index + 1) / totalChunks) * 100) + '%');
            }
            return postJson('/media/chunk/' + encodeURIComponent(session.uploadId) + '/complete', {});
          }
          function uploadCloudFile(file, signature){
            return new Promise(function(resolve, reject){
              const formData = new FormData();
              formData.append('file', file, file.name || 'tapzy-live.webm');
              formData.append('api_key', signature.apiKey);
              formData.append('timestamp', String(signature.timestamp));
              formData.append('signature', signature.signature);
              if (signature.folder) formData.append('folder', signature.folder);
              const xhr = new XMLHttpRequest();
              xhr.open('POST', signature.uploadUrl);
              xhr.upload.onprogress = function(event){
                if (event.lengthComputable) setStatus('Uploading live ' + Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))) + '%');
              };
              xhr.onload = function(){
                let data = {};
                try { data = JSON.parse(xhr.responseText || '{}'); } catch(e) {}
                if (xhr.status < 200 || xhr.status >= 300 || !data.secure_url) {
                  reject(new Error(data.error && data.error.message ? data.error.message : 'Cloud upload failed'));
                  return;
                }
                resolve({ ok:true, mediaUrl:data.secure_url, originalName:file.name || 'tapzy-live.webm', mimetype:inferType(file), size:data.bytes || file.size || 0 });
              };
              xhr.onerror = function(){ reject(new Error('Cloud upload failed')); };
              xhr.ontimeout = function(){ reject(new Error('Cloud upload timed out')); };
              xhr.timeout = 30 * 60 * 1000;
              xhr.send(formData);
            });
          }
          async function uploadCloud(file){
            const signature = await postJson('/media/cloudinary/sign', {
              originalName:file.name || 'tapzy-live.webm',
              type:inferType(file),
              size:file.size,
            });
            return uploadCloudFile(file, signature);
          }
          async function uploadDirect(file){
            const formData = new FormData();
            formData.append('title', (titleInput.value || '').trim());
            formData.append('liveStoryId', liveStoryId);
            formData.append('media', file, file.name || 'tapzy-live.webm');
            const res = await fetch('/stories/live/recorded', {
              method:'POST',
              headers:{ 'Accept':'application/json' },
              body:formData,
            });
            const data = await res.json().catch(function(){ return {}; });
            if (!res.ok || !data.ok) throw new Error(data.error || 'Upload failed');
            return data;
          }
          async function postRecordedUrl(media){
            return postJson('/stories/live/recorded-url', {
              mediaUrl:media.mediaUrl,
              liveStoryId:liveStoryId,
              title:(titleInput.value || '').trim(),
            });
          }
          async function showLiveOnHome(){
            if (liveStoryId) return liveStoryId;
            if (liveReadyPromise) return liveReadyPromise;
            liveReadyPromise = postJson('/stories/live/now', {
              title:(titleInput.value || '').trim() || ${JSON.stringify(`${displayName} is live`)},
            }).then(function(data){
              liveStoryId = data.storyId || '';
              startLiveBroadcast();
              return liveStoryId;
            }).finally(function(){
              liveReadyPromise = null;
            });
            return liveReadyPromise;
          }
          async function cancelLiveOnHome(){
            if (!liveStoryId) return;
            await postJson('/stories/live/now/cancel', { liveStoryId:liveStoryId }).catch(function(){});
            liveStoryId = '';
          }
          function stopRecorder(){
            return new Promise(function(resolve){
              if (!recorder || recorder.state === 'inactive') return resolve();
              recorder.addEventListener('stop', resolve, { once:true });
              try { recorder.requestData(); } catch(e) {}
              recorder.stop();
            });
          }
          startBtn.addEventListener('click', function(){
            if (!stream || !window.MediaRecorder) {
              setStatus('Recording is not supported on this browser.');
              return;
            }
            chunks = [];
            const type = mimeType();
            recorder = new MediaRecorder(stream, type ? { mimeType:type } : undefined);
            recorder.ondataavailable = function(event){
              if (event.data && event.data.size) chunks.push(event.data);
            };
            recorder.start(1000);
            liveReadyPromise = showLiveOnHome().catch(function(error){ console.error(error); });
            root.classList.add('is-recording');
            startBtn.disabled = true;
            stopBtn.disabled = false;
            flipBtn.disabled = true;
            setStatus('Recording live. Home now shows you as live.');
          });
          stopBtn.addEventListener('click', async function(){
            if (posting) return;
            posting = true;
            stopBtn.disabled = true;
            setStatus('Preparing recording...');
            try {
              await showLiveOnHome();
              await stopRecorder();
              const type = (recorder && recorder.mimeType) || mimeType() || 'video/webm';
              const ext = type.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
              const file = new File(chunks, 'tapzy-live.' + ext, { type:type.split(';')[0] || 'video/webm' });
              if (!file.size) throw new Error('Recording is empty');
              setStatus('Uploading...');
              let posted = null;
              try {
                posted = await postRecordedUrl(await uploadCloud(file));
              } catch (cloudError) {
                console.error(cloudError);
                posted = file.size <= DIRECT_LIMIT ? await uploadDirect(file) : await postRecordedUrl(await uploadChunked(file));
              }
              stopLiveBroadcast();
              if (stream) stream.getTracks().forEach(function(track){ track.stop(); });
              location.href = posted.feedUrl || '/stories/feed';
            } catch (error) {
              console.error(error);
              posting = false;
              stopBtn.disabled = false;
              setStatus(error.message || 'Could not post recording');
            }
          });
          flipBtn.addEventListener('click', async function(){
            facingMode = facingMode === 'user' ? 'environment' : 'user';
            await startCamera().catch(function(error){ setStatus(error.message || 'Camera failed'); });
          });
          cancelBtn.addEventListener('click', function(){
            stopLiveBroadcast();
            if (stream) stream.getTracks().forEach(function(track){ track.stop(); });
            cancelLiveOnHome().finally(function(){ location.href = '/stories/feed'; });
          });
          startCamera().catch(function(error){
            setStatus(error.message || 'Camera failed');
          });
        })();
      </script>
    </body>
    </html>`);
  } catch (error) {
    console.error("Go live page error:", error);
    res.status(500).send("Go live error");
  }
});

router.post("/stories/live/start", async (req, res) => {
  res.redirect("/stories/live/new");
});

router.post("/stories/live/:id/record/start", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).json({ ok: false, error: "Sign in required" });

    const id = String(req.params.id || "").trim();
    const story = await prisma.story.findFirst({ where: { id, profileId: currentProfile.id, type: "live" } });
    if (!story) return res.status(404).json({ ok: false, error: "Live not found" });

    const mimetype = String(req.body.mimetype || "video/webm").trim();
    const ext = liveRecordingExtension(mimetype);
    const filename = safeUploadFilename(`tapzy-live-${id}${ext}`, mimetype);
    const finalPath = path.join(uploadsDir, filename);

    const existing = liveRecordingSessions.get(id);
    if (existing) {
      existing.removeFile = true;
      await removeLiveRecordingSession(existing);
    }

    await fsp.writeFile(finalPath, Buffer.alloc(0));
    liveRecordingSessions.set(id, {
      storyId: id,
      profileId: currentProfile.id,
      mimetype,
      filename,
      finalPath,
      nextIndex: 0,
      bytes: 0,
      removeFile: false,
      createdAt: Date.now(),
    });

    res.json({ ok: true, storyId: id, nextIndex: 0 });
  } catch (error) {
    console.error("Start live recording error:", error);
    res.status(500).json({ ok: false, error: "Could not start live recording" });
  }
});

router.post("/stories/live/:id/record/chunk", liveRecordUpload.single("chunk"), async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).json({ ok: false, error: "Sign in required" });

    const id = String(req.params.id || "").trim();
    const index = Number(req.body.index || 0);
    const session = liveRecordingSessions.get(id);

    if (!session || session.profileId !== currentProfile.id) {
      return res.status(404).json({ ok: false, error: "Recording session not found" });
    }
    if (!Number.isInteger(index) || index !== session.nextIndex) {
      return res.status(409).json({ ok: false, error: "Invalid recording chunk order", nextIndex: session.nextIndex });
    }
    if (!req.file) return res.status(400).json({ ok: false, error: "Missing recording chunk" });

    await fsp.appendFile(session.finalPath, req.file.buffer);
    session.bytes += req.file.size || 0;
    session.nextIndex += 1;

    res.json({ ok: true, nextIndex: session.nextIndex, bytes: session.bytes });
  } catch (error) {
    console.error("Live recording chunk error:", error);
    res.status(500).json({ ok: false, error: "Could not save recording chunk" });
  }
});

router.post("/stories/live/:id/record/finish", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).json({ ok: false, error: "Sign in required" });

    const id = String(req.params.id || "").trim();
    const session = liveRecordingSessions.get(id);
    if (!session || session.profileId !== currentProfile.id) {
      return res.status(404).json({ ok: false, error: "Recording session not found" });
    }
    if (!session.bytes) {
      session.removeFile = true;
      await removeLiveRecordingSession(session);
      return res.status(400).json({ ok: false, error: "Recording was empty" });
    }

    const story = await prisma.story.findFirst({ where: { id, profileId: currentProfile.id, type: "live" } });
    if (!story) return res.status(404).json({ ok: false, error: "Live not found" });

    const mediaUrl = publicAbsoluteUrl(req, `/uploads/${session.filename}`);
    const caption = String(req.body.text || story.text || "").trim();
    await prisma.story.update({
      where: { id },
      data: {
        type: "video",
        mediaUrl,
        text: caption ? caption.slice(0, 220) : story.text,
        expiresAt: expiresIn24Hours(),
        createdAt: new Date(),
      },
    });

    liveRecordingSessions.delete(id);
    res.json({ ok: true, mediaUrl, feedUrl: "/stories/feed" });
  } catch (error) {
    console.error("Finish live recording error:", error);
    res.status(500).json({ ok: false, error: "Could not finish live recording" });
  }
});

router.post("/stories/live/:id/record/cancel", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    const id = String(req.params.id || "").trim();
    const session = liveRecordingSessions.get(id);
    if (session && currentProfile && session.profileId === currentProfile.id) {
      session.removeFile = true;
      await removeLiveRecordingSession(session);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("Cancel live recording error:", error);
    res.status(500).json({ ok: false });
  }
});

router.post("/stories/live/:id/end", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).json({ ok: false });
    const id = String(req.params.id || "").trim();
    const story = await prisma.story.findFirst({ where: { id, profileId: currentProfile.id, type: "live" } });
    if (!story) return res.status(404).json({ ok: false });
    await prisma.story.update({
      where: { id },
      data: {
        type: "live",
        expiresAt: new Date(),
      },
    });
    res.json({ ok: true, feedUrl: "/stories/feed" });
  } catch (error) {
    console.error("End live error:", error);
    res.status(500).json({ ok: false });
  }
});

router.post("/stories/live/:id/replay", upload.single("replayMedia"), async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    const wantsHtml = String(req.headers.accept || "").includes("text/html");
    if (!currentProfile) {
      if (wantsHtml) return res.redirect("/auth");
      return res.status(401).json({ ok: false });
    }

    const id = String(req.params.id || "").trim();
    const editUrl = `/stories/live/${encodeURIComponent(id)}/edit`;
    const story = await prisma.story.findFirst({
      where: {
        id,
        profileId: currentProfile.id,
        type: { in: ["live", "live_replay_draft"] },
      },
    });
    if (!story) {
      if (wantsHtml) return res.status(404).send("Live replay not found");
      return res.status(404).json({ ok: false });
    }

    const data = {
      type: "live_replay_draft",
      expiresAt: new Date(),
    };

    if (req.file) {
      data.mediaUrl = publicAbsoluteUrl(req, `/uploads/${req.file.filename}`);
    }

    const caption = String(req.body.text || "").trim();
    if (caption) data.text = caption.slice(0, 220);

    await prisma.story.update({ where: { id }, data });
    if (wantsHtml) return res.redirect(editUrl);
    res.json({ ok: true, editUrl });
  } catch (error) {
    console.error("Save live replay error:", error);
    if (String(req.headers.accept || "").includes("text/html")) {
      return res.status(500).send("Could not save live replay");
    }
    res.status(500).json({ ok: false, error: "Could not save live replay" });
  }
});

router.get("/stories/live/:id/edit", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const id = String(req.params.id || "").trim();
    const story = await prisma.story.findFirst({
      where: {
        id,
        profileId: currentProfile.id,
        type: { in: ["live_replay_draft", "live", "video"] },
      },
    });
    if (!story) return res.status(404).send("Live replay not found");

    const hasReplay = !!story.mediaUrl && isVideoUrl(story.mediaUrl);
    const body = `
      <div class="wrap live-edit-wrap">
        <section class="live-edit-card">
          <div class="live-edit-kicker">Finished Live</div>
          <h1>Edit Live Replay</h1>
          <p>Review your finished live, update the caption, then post it to the home page. Posted live replays stay live for 24 hours.</p>

          <div class="live-edit-preview">
            ${
              hasReplay
                ? `<video src="${escapeHtml(story.mediaUrl)}" controls playsinline preload="metadata"></video>`
                : `<div class="live-edit-empty">Replay is still processing or was not recorded on this device.</div>`
            }
          </div>

          <form class="live-edit-form live-edit-upload" method="POST" action="/stories/live/${escapeHtml(story.id)}/replay" enctype="multipart/form-data">
            <label>${hasReplay ? "Replace replay video" : "Save replay video"}</label>
            <input class="live-edit-file" type="file" name="replayMedia" accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v">
            <input type="hidden" name="text" value="${escapeHtml(story.text || "")}">
            <button class="live-edit-secondary" type="submit">${hasReplay ? "Replace Replay" : "Save Replay"}</button>
            ${hasReplay ? "" : `<div class="live-edit-note">If the automatic save did not attach the replay, choose the video from your phone, save it here, then post.</div>`}
          </form>

          <form class="live-edit-form" method="POST" action="/stories/live/${escapeHtml(story.id)}/post">
            <label>Caption</label>
            <textarea name="text" maxlength="220" rows="3" placeholder="Add a caption...">${escapeHtml(story.text || "")}</textarea>
            <div class="live-edit-actions">
              <button class="live-edit-primary" type="submit" ${hasReplay ? "" : "disabled"}>Post Live Replay</button>
              <a class="live-edit-secondary" href="/stories/feed">Not now</a>
            </div>
          </form>

          <form method="POST" action="/stories/live/${escapeHtml(story.id)}/discard" class="live-edit-discard" onsubmit="return confirm('Discard this live replay?');">
            <button type="submit">Discard replay</button>
          </form>
        </section>
      </div>

      <style>
        .live-edit-wrap{max-width:760px;padding-bottom:110px;}
        .live-edit-card{
          margin-top:18px;
          border-radius:28px;
          border:1px solid rgba(255,255,255,.10);
          background:radial-gradient(520px 240px at 50% 0%,rgba(47,118,255,.18),transparent 58%),linear-gradient(180deg,rgba(11,15,24,.98),rgba(3,5,10,1));
          box-shadow:0 24px 70px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.04);
          padding:22px;
        }
        .live-edit-kicker{color:#9fbaff;font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;margin-bottom:10px;}
        .live-edit-card h1{margin:0;color:#fff;font-size:34px;line-height:1;font-weight:950;letter-spacing:-.04em;}
        .live-edit-card p{margin:10px 0 18px;color:rgba(226,236,255,.76);line-height:1.45;}
        .live-edit-preview{overflow:hidden;border-radius:22px;background:#05070d;border:1px solid rgba(255,255,255,.10);aspect-ratio:9/16;max-height:560px;}
        .live-edit-preview video{width:100%;height:100%;object-fit:cover;display:block;background:#000;}
        .live-edit-empty{height:100%;display:grid;place-items:center;padding:24px;text-align:center;color:#aebbd4;font-weight:800;}
        .live-edit-form{margin-top:18px;}
        .live-edit-form label{display:block;margin-bottom:8px;color:#dce8ff;font-weight:900;}
        .live-edit-form textarea{width:100%;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:#05070d;color:#fff;padding:14px;font:inherit;resize:vertical;outline:none;}
        .live-edit-file{width:100%;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:#05070d;color:#dce8ff;padding:13px;font:inherit;margin-bottom:12px;}
        .live-edit-upload{padding:14px;border-radius:20px;border:1px solid rgba(98,168,255,.18);background:rgba(16,32,58,.34);}
        .live-edit-note{margin-top:10px;color:#aebbd4;font-size:14px;line-height:1.35;font-weight:750;}
        .live-edit-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;}
        .live-edit-primary,.live-edit-secondary,.live-edit-discard button{
          min-height:48px;border-radius:999px;padding:0 18px;font:inherit;font-weight:900;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;
        }
        .live-edit-primary{border:0;background:linear-gradient(135deg,#31d6ff,#2d6bff 52%,#123fbd);color:#fff;box-shadow:0 0 30px rgba(47,118,255,.32);}
        .live-edit-primary:disabled{opacity:.45;box-shadow:none;}
        .live-edit-secondary{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;}
        .live-edit-discard{margin:14px 0 0;}
        .live-edit-discard button{border:1px solid rgba(255,85,120,.24);background:rgba(255,45,85,.10);color:#ffc8d4;}
      </style>
    `;

    res.send(renderShell("Edit Live Replay", body, "", {
      currentProfile,
      pageTitle: "Edit Live",
      pageType: "stories",
      storiesBottomNav: true,
    }));
  } catch (error) {
    console.error("Edit live replay error:", error);
    res.status(500).send("Edit live replay error");
  }
});

router.post("/stories/live/:id/post", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const id = String(req.params.id || "").trim();
    const story = await prisma.story.findFirst({
      where: {
        id,
        profileId: currentProfile.id,
        type: { in: ["live_replay_draft", "live", "video"] },
      },
    });
    if (!story) return res.status(404).send("Live replay not found");
    if (!story.mediaUrl || !isVideoUrl(story.mediaUrl)) return res.redirect(`/stories/live/${encodeURIComponent(id)}/edit`);

    const text = String(req.body.text || "").trim();
    await prisma.story.update({
      where: { id },
      data: {
        type: "video",
        text: text ? text.slice(0, 220) : story.text,
        expiresAt: expiresIn24Hours(),
        createdAt: new Date(),
      },
    });

    res.redirect("/stories/feed");
  } catch (error) {
    console.error("Post live replay error:", error);
    res.status(500).send("Post live replay error");
  }
});

router.post("/stories/live/:id/discard", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");
    const id = String(req.params.id || "").trim();
    await prisma.story.deleteMany({
      where: {
        id,
        profileId: currentProfile.id,
        type: { in: ["live_replay_draft", "live", "video"] },
      },
    });
    res.redirect("/stories/feed");
  } catch (error) {
    console.error("Discard live replay error:", error);
    res.status(500).send("Discard live replay error");
  }
});

router.get("/stories/live/:id", async (req, res) => {
  try {
    const currentProfile = req.currentProfile || null;
    const id = String(req.params.id || "").trim();
    const story = await prisma.story.findUnique({
      where: { id },
      include: { profile: true },
    });
    if (!story || story.type !== "live") return res.status(404).send("Live not found");

    const isHost = !!(currentProfile && currentProfile.id === story.profileId && req.query.host === "1");
    const displayName = story.profile?.name || story.profile?.username || "Tapzy Live";
    const viewerName = currentProfile?.name || currentProfile?.username || "Viewer";
    const isEmbed = String(req.query.embed || "") === "1";

    res.send(`<!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
      <meta name="theme-color" content="#000000" />
      <title>${escapeHtml(story.text || "Tapzy Live")}</title>
      <style>
        :root{color-scheme:dark;--safe-top:env(safe-area-inset-top,0px);--safe-bottom:env(safe-area-inset-bottom,0px)}
        *{box-sizing:border-box}
        html,body{margin:0;width:100%;height:100%;background:#000;color:#fff;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
        button,a{font:inherit;-webkit-tap-highlight-color:transparent}
        .tl-room{position:relative;width:100%;height:100%;background:#000;overflow:hidden}
        video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#05070c}
        .tl-wait{position:absolute;inset:0;display:grid;place-items:center;padding:28px;text-align:center;background:radial-gradient(circle at 50% 24%,rgba(47,118,255,.28),transparent 34%),linear-gradient(180deg,#080b12,#000)}
        .tl-wait-card{max-width:340px}
        .tl-live-pill{position:fixed;z-index:5;top:calc(var(--safe-top) + 18px);left:16px;display:inline-flex;align-items:center;gap:8px;padding:8px 11px;border-radius:999px;background:rgba(0,0,0,.42);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(14px);font-size:12px;font-weight:950;letter-spacing:.12em}
        .tl-dot{width:8px;height:8px;border-radius:50%;background:#ff2d55;box-shadow:0 0 16px #ff2d55;animation:pulse 1.2s ease-in-out infinite}
        @keyframes pulse{50%{transform:scale(1.35);opacity:.65}}
        .tl-top{position:fixed;z-index:5;top:calc(var(--safe-top) + 18px);right:14px;display:flex;gap:10px}
        .tl-icon{width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.42);color:#fff;display:grid;place-items:center;text-decoration:none;backdrop-filter:blur(14px)}
        .tl-copy{position:fixed;z-index:5;left:18px;right:86px;bottom:calc(var(--safe-bottom) + 26px);text-shadow:0 2px 16px rgba(0,0,0,.72)}
        .tl-copy strong{display:block;font-size:19px;font-weight:950;margin-bottom:6px}
        .tl-copy p{margin:0;color:rgba(255,255,255,.82);font-size:14px}
        .tl-actions{position:fixed;z-index:6;right:12px;bottom:calc(var(--safe-bottom) + 28px);display:flex;flex-direction:column;gap:12px}
        .tl-action{width:52px;height:52px;border-radius:50%;border:1px solid rgba(255,255,255,.20);background:rgba(0,0,0,.46);color:#fff;font-size:20px;font-weight:950;backdrop-filter:blur(14px);cursor:pointer}
        .tl-end{background:linear-gradient(135deg,#ff3b5f,#b5002f);border:0}
        .tl-status{position:fixed;z-index:7;left:50%;bottom:calc(var(--safe-bottom) + 108px);transform:translateX(-50%);padding:9px 12px;border-radius:999px;background:rgba(0,0,0,.54);border:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.86);font-size:12px;font-weight:850;white-space:nowrap}
        .tl-room::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.68),transparent 24%,transparent 58%,rgba(0,0,0,.86));z-index:2}
        .tl-wait{z-index:3}
        .tl-story-tabs{position:fixed;z-index:8;top:calc(var(--safe-top) + 76px);left:18px;right:18px;display:flex;align-items:center;justify-content:center;gap:22px;font-size:16px;font-weight:950;text-shadow:0 2px 14px rgba(0,0,0,.7)}
        .tl-story-tabs a{color:rgba(255,255,255,.62);text-decoration:none;white-space:nowrap}
        .tl-story-tabs .is-active{position:relative;color:#fff}
        .tl-story-tabs .is-active::after{content:"";position:absolute;left:18%;right:18%;bottom:-10px;height:3px;border-radius:999px;background:#fff}
        .tl-viewers{position:fixed;z-index:8;top:calc(var(--safe-top) + 58px);left:18px;display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;background:rgba(0,0,0,.42);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(14px);font-size:12px;font-weight:900}
        .tl-chat{position:fixed;z-index:8;left:16px;right:88px;bottom:calc(var(--safe-bottom) + 174px);height:148px;display:flex;flex-direction:column;justify-content:flex-end;gap:7px;pointer-events:none;overflow:hidden}
        .tl-chat-row{width:max-content;max-width:100%;padding:8px 10px;border-radius:16px;background:rgba(0,0,0,.36);backdrop-filter:blur(12px);font-size:13px;line-height:1.25;text-shadow:0 2px 10px #000;animation:tlChatIn .18s ease both}
        .tl-chat-row strong{font-weight:950;margin-right:6px}
        .tl-chat-row.is-gift{background:linear-gradient(135deg,rgba(255,45,85,.76),rgba(47,118,255,.72));box-shadow:0 0 24px rgba(255,45,85,.24)}
        @keyframes tlChatIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .tl-chat-form{position:fixed;z-index:10;left:14px;right:88px;bottom:calc(var(--safe-bottom) + 18px);display:grid;grid-template-columns:1fr auto;gap:8px}
        .tl-chat-form input{min-height:42px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(0,0,0,.48);color:#fff;padding:0 14px;outline:none;backdrop-filter:blur(14px)}
        .tl-chat-form button{min-width:58px;border:0;border-radius:999px;background:#fff;color:#000;font-weight:950}
        .tl-gift-panel{position:fixed;z-index:20;left:0;right:0;bottom:0;padding:18px 14px calc(var(--safe-bottom) + 18px);border-radius:28px 28px 0 0;background:linear-gradient(180deg,rgba(20,24,34,.98),rgba(2,3,7,.99));border-top:1px solid rgba(255,255,255,.12);box-shadow:0 -20px 70px rgba(0,0,0,.58);transform:translateY(110%);transition:transform .22s ease}
        .tl-gift-panel.is-open{transform:translateY(0)}
        .tl-gift-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
        .tl-gift-head strong{font-size:20px;letter-spacing:-.03em}
        .tl-gift-close{width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff}
        .tl-gifts{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        .tl-gift{min-height:92px;border:1px solid rgba(255,255,255,.10);border-radius:20px;background:radial-gradient(circle at 50% 0,rgba(47,118,255,.22),transparent 55%),rgba(255,255,255,.06);color:#fff;font-weight:950;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}
        .tl-gift span{font-size:28px}.tl-gift small{font-size:12px;color:rgba(255,255,255,.7);font-weight:800}
        .tl-toast{position:fixed;z-index:22;left:50%;top:42%;transform:translate(-50%,-50%) scale(.92);padding:14px 18px;border-radius:999px;background:linear-gradient(135deg,#ff2d55,#2f76ff);box-shadow:0 0 60px rgba(255,45,85,.32);font-weight:1000;opacity:0;pointer-events:none}
        .tl-toast.show{animation:tlGiftPop 1.8s ease both}@keyframes tlGiftPop{0%{opacity:0;transform:translate(-50%,-35%) scale(.82)}16%,75%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-70%) scale(.96)}}
        .tl-action[data-gifts]{background:linear-gradient(135deg,#ff2d55,#2f76ff);border:0}
        .tl-live-pill{
          top:calc(var(--safe-top) + 28px);
          left:18px;
          padding:8px 13px;
          background:rgba(16,16,18,.58);
          border:1px solid rgba(255,255,255,.10);
          box-shadow:0 10px 28px rgba(0,0,0,.28);
          letter-spacing:.16em;
        }
        .tl-viewers{
          top:calc(var(--safe-top) + 72px);
          left:18px;
          padding:8px 12px;
          background:rgba(16,16,18,.54);
          box-shadow:0 10px 28px rgba(0,0,0,.24);
        }
        .tl-story-tabs{
          top:calc(var(--safe-top) + 120px);
          left:18px;
          right:18px;
          justify-content:space-between;
          gap:12px;
          font-size:15px;
          letter-spacing:-.02em;
        }
        .tl-top{
          top:calc(var(--safe-top) + 28px);
          right:18px;
          z-index:10;
        }
        .tl-icon{
          width:48px;
          height:48px;
          background:rgba(0,0,0,.42);
          border-color:rgba(255,255,255,.16);
          font-size:24px;
        }
        .tl-copy{
          bottom:calc(var(--safe-bottom) + 84px);
          right:94px;
        }
        .tl-copy strong{
          font-size:24px;
          letter-spacing:-.05em;
          line-height:.95;
        }
        .tl-copy p{
          margin-top:4px;
          font-size:14px;
          color:rgba(255,255,255,.76);
        }
        .tl-actions{
          right:18px;
          bottom:calc(var(--safe-bottom) + 92px);
          gap:14px;
        }
        .tl-action{
          width:54px;
          height:54px;
          border:0;
          background:rgba(0,0,0,.36);
          box-shadow:0 10px 24px rgba(0,0,0,.25);
        }
        .tl-end{
          width:60px;
          height:60px;
          font-size:28px;
          background:linear-gradient(135deg,#ff3b68,#f00648);
          box-shadow:0 14px 36px rgba(255,0,72,.28);
        }
        .tl-chat{
          left:18px;
          right:96px;
          bottom:calc(var(--safe-bottom) + 182px);
          height:124px;
          gap:6px;
        }
        .tl-chat-row{
          max-width:min(100%, 360px);
          padding:9px 12px;
          border-radius:18px;
          background:rgba(0,0,0,.38);
          font-size:13px;
        }
        .tl-chat-form{
          left:18px;
          right:112px;
          bottom:calc(var(--safe-bottom) + 20px);
          grid-template-columns:minmax(0,1fr) 76px;
          gap:10px;
        }
        .tl-chat-form input{
          min-height:48px;
          background:rgba(0,0,0,.52);
          border-color:rgba(255,255,255,.10);
          box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 12px 30px rgba(0,0,0,.22);
        }
        .tl-chat-form button{
          min-height:48px;
          min-width:76px;
          font-size:18px;
          box-shadow:0 12px 30px rgba(0,0,0,.22);
        }
        .tl-status{
          left:50%;
          bottom:calc(var(--safe-bottom) + 132px);
          background:rgba(0,0,0,.44);
          border:0;
          box-shadow:0 10px 26px rgba(0,0,0,.24);
        }
        .tl-status:empty{display:none}
        .tl-embed .tl-live-pill,.tl-embed .tl-story-tabs,.tl-embed .tl-top,.tl-embed .tl-viewers,.tl-embed .tl-chat,.tl-embed .tl-copy,.tl-embed .tl-actions,.tl-embed .tl-chat-form,.tl-embed .tl-gift-panel,.tl-embed .tl-toast{display:none!important}
        .tl-embed .tl-wait{background:linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.55));padding:22px}
        .tl-embed .tl-wait-card{transform:translateY(32%)}
        .tl-embed .tl-wait h1{font-size:22px;letter-spacing:-.03em}
        .tl-embed .tl-wait p{font-size:13px}
        /* final live polish */
        .tl-room:not(.tl-embed) .tl-wait{z-index:4;background:radial-gradient(circle at 50% 26%,rgba(35,94,220,.22),transparent 36%),linear-gradient(180deg,rgba(0,0,0,.34),rgba(0,0,0,.72))}
        .tl-room:not(.tl-embed) .tl-live-pill:not(.tl-wait .tl-live-pill){top:calc(var(--safe-top) + 30px);left:22px;height:42px;padding:0 15px;font-size:12px;background:rgba(18,18,20,.62);border-color:rgba(255,255,255,.08)}
        .tl-bars{font-size:11px;letter-spacing:1px;opacity:.9}
        .tl-room:not(.tl-embed) .tl-viewers{top:calc(var(--safe-top) + 80px);left:22px;height:40px;padding:0 15px;border-radius:999px;background:rgba(18,18,20,.56);border-color:rgba(255,255,255,.08)}
        .tl-room:not(.tl-embed) .tl-story-tabs{top:calc(var(--safe-top) + 134px);left:22px;right:22px;font-size:15px;gap:14px}
        .tl-room:not(.tl-embed) .tl-top{top:calc(var(--safe-top) + 30px);right:22px}
        .tl-room:not(.tl-embed) .tl-icon{width:52px;height:52px;font-size:28px;background:rgba(0,0,0,.34)}
        .tl-room:not(.tl-embed) .tl-chat{left:22px;right:116px;bottom:calc(var(--safe-bottom) + 178px);height:116px;gap:6px}
        .tl-room:not(.tl-embed) .tl-chat-row{padding:8px 12px;border-radius:18px;background:rgba(10,10,12,.42);font-size:13px;box-shadow:0 8px 22px rgba(0,0,0,.16)}
        .tl-room:not(.tl-embed) .tl-copy{left:22px;right:112px;bottom:calc(var(--safe-bottom) + 98px)}
        .tl-room:not(.tl-embed) .tl-copy strong{font-size:25px;line-height:.95}
        .tl-room:not(.tl-embed) .tl-copy p{font-size:14px;line-height:1.25}
        .tl-room:not(.tl-embed) .tl-status{bottom:calc(var(--safe-bottom) + 152px);font-size:12px;padding:8px 13px;opacity:.92}
        .tl-room:not(.tl-embed) .tl-actions{right:22px;bottom:calc(var(--safe-bottom) + 116px);gap:16px}
        .tl-room:not(.tl-embed) .tl-action{width:56px;height:56px;font-size:17px;background:rgba(0,0,0,.34)}
        .tl-room:not(.tl-embed) .tl-end{width:64px;height:64px;font-size:30px}
        .tl-room:not(.tl-embed) .tl-chat-form{left:22px;right:22px;bottom:calc(var(--safe-bottom) + 18px);grid-template-columns:minmax(0,1fr) 86px;gap:12px;align-items:center}
        .tl-room:not(.tl-embed) .tl-chat-form input{width:100%;min-width:0;min-height:54px;padding:0 18px;border-radius:999px;background:rgba(0,0,0,.58);font-size:16px!important;line-height:1.2}
        .tl-room:not(.tl-embed) .tl-chat-form button{width:86px;min-width:86px;min-height:54px;border-radius:999px;font-size:18px}
        .tl-room.tl-keyboard .tl-actions,.tl-room.tl-keyboard .tl-status{display:none!important}
        .tl-room.tl-keyboard .tl-chat{bottom:calc(var(--safe-bottom) + 150px);right:22px;height:78px}
        .tl-room.tl-keyboard .tl-copy{bottom:calc(var(--safe-bottom) + 82px);right:22px}
        .tl-room.tl-keyboard .tl-copy strong{font-size:22px}
        .tl-room.tl-keyboard .tl-copy p{font-size:13px}
        .tl-room.tl-keyboard .tl-chat-form{left:18px;right:18px;bottom:calc(var(--safe-bottom) + 12px);grid-template-columns:minmax(0,1fr) 82px}
        .tl-room.tl-keyboard .tl-chat-form input{min-height:52px;font-size:16px!important}
        .tl-room.tl-keyboard .tl-chat-form button{width:82px;min-width:82px;min-height:52px}
        .tl-room.tl-keyboard .tl-story-tabs,.tl-room.tl-keyboard .tl-live-pill,.tl-room.tl-keyboard .tl-viewers{opacity:.18;pointer-events:none}
        @media(max-width:390px){
          .tl-story-tabs{font-size:14px;gap:10px}
          .tl-chat-form{right:102px;grid-template-columns:minmax(0,1fr) 68px}
          .tl-chat-form button{min-width:68px;font-size:16px}
          .tl-copy strong{font-size:22px}
        }
      </style>
    </head>
    <body>
      <main class="tl-room ${isEmbed ? "tl-embed" : ""}" data-story-id="${escapeHtml(story.id)}" data-role="${isHost ? "host" : "viewer"}" data-name="${escapeHtml(viewerName)}">
        <video id="liveVideo" ${isHost ? "muted" : "autoplay"} playsinline webkit-playsinline></video>
        <div class="tl-wait" id="waitLayer">
          <div class="tl-wait-card">
            <div class="tl-live-pill" style="position:static;margin:0 auto 18px;width:max-content"><span class="tl-dot"></span>LIVE</div>
            <h1>${isEmbed ? "Tap to watch LIVE" : isHost ? "Preparing your live" : "Joining live"}</h1>
            <p>${isEmbed ? "Live preview" : isHost ? "Allow camera and microphone to start broadcasting." : "Waiting for the host video."}</p>
          </div>
        </div>
        <div class="tl-live-pill"><span class="tl-dot"></span>LIVE</div>
        <nav class="tl-story-tabs" aria-label="Live sections">
          <a href="/events">Community</a>
          <a href="/stories/feed?filter=nearby">Simcoe</a>
          <a href="/stories/feed?filter=following">Following</a>
          <a class="is-active" href="/stories/feed">Discover</a>
        </nav>
        <div class="tl-viewers">▮▮ <span id="viewerCount">1</span> watching</div>
        <div class="tl-top"><a class="tl-icon" href="/stories/feed" aria-label="Close">×</a></div>
        <section class="tl-chat" id="liveChat" aria-live="polite"></section>
        <div class="tl-copy"><strong>${escapeHtml(displayName)}</strong><p>${escapeHtml(story.text || "Tapzy Live")}</p></div>
        <div class="tl-actions">
          ${isHost ? `<button class="tl-action" type="button" data-flip>&#8635;</button><button class="tl-action" type="button" data-mute>Mic</button><button class="tl-action tl-end" type="button" data-end>&times;</button>` : `<button class="tl-action" type="button" data-sound>&#128266;</button><button class="tl-action" type="button" data-gifts>Gift</button><button class="tl-action" type="button" data-share>&#8599;</button>`}
        </div>
        <form class="tl-chat-form" id="chatForm">
          <input id="chatInput" maxlength="220" placeholder="Say something nice…" autocomplete="off" />
          <button type="submit">Send</button>
        </form>
        <div class="tl-status" id="liveStatus">${isHost ? "Starting camera…" : "Connecting…"}</div>
        <section class="tl-gift-panel" id="giftPanel" aria-hidden="true">
          <div class="tl-gift-head"><strong>Send a gift</strong><button class="tl-gift-close" type="button" data-gift-close>x</button></div>
          <div class="tl-gifts">
            <button class="tl-gift" type="button" data-gift="Rose" data-amount="1"><span>Rose</span>Rose<small>$1</small></button>
            <button class="tl-gift" type="button" data-gift="Glow" data-amount="3"><span>Glow</span>Glow<small>$3</small></button>
            <button class="tl-gift" type="button" data-gift="Crown" data-amount="5"><span>Crown</span>Crown<small>$5</small></button>
            <button class="tl-gift" type="button" data-gift="Fire" data-amount="10"><span>Fire</span>Fire<small>$10</small></button>
            <button class="tl-gift" type="button" data-gift="Diamond" data-amount="25"><span>Diamond</span>Diamond<small>$25</small></button>
            <button class="tl-gift" type="button" data-gift="Universe" data-amount="50"><span>Universe</span>Universe<small>$50</small></button>
          </div>
        </section>
        <div class="tl-toast" id="giftToast"></div>
      </main>
      <script src="/socket.io/socket.io.js"></script>
      <script>
        (function(){
          const room = document.querySelector('.tl-room');
          const storyId = room.getAttribute('data-story-id');
          const role = room.getAttribute('data-role');
          const name = room.getAttribute('data-name') || 'Viewer';
          const video = document.getElementById('liveVideo');
          const wait = document.getElementById('waitLayer');
          const status = document.getElementById('liveStatus');
          const chat = document.getElementById('liveChat');
          const chatForm = document.getElementById('chatForm');
          const chatInput = document.getElementById('chatInput');
          const giftPanel = document.getElementById('giftPanel');
          const giftToast = document.getElementById('giftToast');
          const viewerCount = document.getElementById('viewerCount');
          const socket = io();
          const peers = new Map();
          let localStream = null;
          let facingMode = 'user';
          let replayRecorder = null;
          let recordingMimeType = '';
          let recordingStarted = false;
          let recordingFailed = false;
          let recordingIndex = 0;
          let recordingQueue = Promise.resolve();
          let endingLive = false;
          let liveExitPosted = false;
          const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

          function setStatus(text){ if (status) status.textContent = (text || '').trim(); }
          function hideWait(){ if (wait) wait.style.display = 'none'; }
          async function postJson(url, body){
            const res = await fetch(url, {
              method:'POST',
              headers:{ 'Accept':'application/json', 'Content-Type':'application/json' },
              body:JSON.stringify(body || {}),
            });
            const data = await res.json().catch(function(){ return {}; });
            if (!res.ok || !data.ok) throw new Error(data.error || 'Request failed');
            return data;
          }
          function replayMimeType(){
            if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
            return ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4;codecs=h264,aac','video/mp4'].find(function(type){
              return MediaRecorder.isTypeSupported(type);
            }) || '';
          }
          function stopReplayRecorder(){
            return new Promise(function(resolve){
              if (!replayRecorder || replayRecorder.state === 'inactive') return resolve();
              var recorder = replayRecorder;
              recorder.addEventListener('stop', function(){ resolve(); }, { once:true });
              try { recorder.stop(); } catch(e) { resolve(); }
            });
          }
          async function ensureLiveRecordingSession(mimeType){
            if (recordingStarted) return;
            await postJson('/stories/live/' + encodeURIComponent(storyId) + '/record/start', {
              mimetype: (mimeType || 'video/webm').split(';')[0] || 'video/webm',
            });
            recordingStarted = true;
            recordingFailed = false;
            recordingIndex = 0;
            recordingQueue = Promise.resolve();
          }
          function enqueueLiveRecordingChunk(blob){
            if (!blob || !blob.size || recordingFailed || !recordingStarted) return;
            const index = recordingIndex;
            recordingIndex += 1;
            recordingQueue = recordingQueue.then(async function(){
              if (recordingFailed) return;
              let lastError = null;
              for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                  const formData = new FormData();
                  formData.append('index', String(index));
                  formData.append('chunk', blob, 'tapzy-live-' + index + '.webm');
                  const res = await fetch('/stories/live/' + encodeURIComponent(storyId) + '/record/chunk', {
                    method:'POST',
                    headers:{ 'Accept':'application/json' },
                    body:formData,
                  });
                  const data = await res.json().catch(function(){ return {}; });
                  if (!res.ok || !data.ok) throw new Error(data.error || 'Recording chunk failed');
                  return;
                } catch (error) {
                  lastError = error;
                  await new Promise(function(resolve){ setTimeout(resolve, 450 * (attempt + 1)); });
                }
              }
              throw lastError || new Error('Recording chunk failed');
            }).catch(function(error){
              recordingFailed = true;
              console.error(error);
              setStatus('Live recording stopped. Ending live will not post a black replay.');
            });
          }
          async function startReplayRecorder(stream){
            if (role !== 'host' || !stream || !window.MediaRecorder) return;
            await stopReplayRecorder();
            const mimeType = recordingMimeType || replayMimeType();
            recordingMimeType = mimeType || 'video/webm';
            try {
              await ensureLiveRecordingSession(recordingMimeType);
              replayRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
              replayRecorder.ondataavailable = function(event){
                enqueueLiveRecordingChunk(event.data);
              };
              replayRecorder.start(3000);
              setStatus('Recording live...');
            } catch (error) {
              recordingFailed = true;
              replayRecorder = null;
              setStatus('Live recording unavailable.');
            }
          }
          async function finishLiveRecording(){
            if (!recordingStarted || recordingFailed) return '';
            await stopReplayRecorder();
            await recordingQueue;
            if (recordingFailed || !recordingIndex) return '';
            const data = await postJson('/stories/live/' + encodeURIComponent(storyId) + '/record/finish', {
              text:${JSON.stringify(story.text || "")},
            });
            return data.feedUrl || '/stories/feed';
          }
          function postLiveToStoriesBeacon(){
            if (liveExitPosted) return;
            liveExitPosted = true;
            try { socket.emit('live:end', { storyId }); } catch(e) {}
            try {
              const endpoint = '/stories/live/' + encodeURIComponent(storyId) + '/end';
              if (navigator.sendBeacon) {
                const payload = new Blob(['ended=1'], { type:'application/x-www-form-urlencoded' });
                navigator.sendBeacon(endpoint, payload);
              } else {
                fetch(endpoint, { method:'POST', keepalive:true, headers:{ 'Accept':'application/json' } }).catch(function(){});
              }
            } catch(e) {}
          }
          async function postLiveToStoriesOnExit(){
            if (liveExitPosted) return '/stories/feed';
            liveExitPosted = true;
            try { socket.emit('live:end', { storyId }); } catch(e) {}
            try {
              const recordedFeedUrl = await finishLiveRecording();
              if (recordedFeedUrl) {
                if (localStream) localStream.getTracks().forEach(function(track){ track.stop(); });
                return recordedFeedUrl;
              }
            } catch (error) {
              console.error(error);
            }
            if (localStream) localStream.getTracks().forEach(function(track){ track.stop(); });
            try {
              const endpoint = '/stories/live/' + encodeURIComponent(storyId) + '/end';
              if (navigator.sendBeacon) {
                const payload = new Blob(['ended=1'], { type:'application/x-www-form-urlencoded' });
                navigator.sendBeacon(endpoint, payload);
                return '/stories/feed';
              }
              const res = await fetch(endpoint, { method:'POST', keepalive:true, headers:{ 'Accept':'application/json' } });
              const data = await res.json().catch(function(){ return {}; });
              return data.feedUrl || '/stories/feed';
            } catch (error) {}
            return '/stories/feed';
          }
          async function finishLiveAndOpenEditor(){
            if (endingLive) return;
            endingLive = true;
            setStatus('Posting live to stories...');
            const feedUrl = await postLiveToStoriesOnExit();
            location.href = feedUrl || '/stories/feed';
          }
          if (role === 'host') {
            window.addEventListener('pagehide', function(){
              postLiveToStoriesBeacon();
            });
          }
          function addChat(nameText, message, gift){
            if (!chat) return;
            const row = document.createElement('div');
            row.className = 'tl-chat-row' + (gift ? ' is-gift' : '');
            const strong = document.createElement('strong');
            strong.textContent = nameText || 'Viewer';
            const span = document.createElement('span');
            span.textContent = message || '';
            row.appendChild(strong);
            row.appendChild(span);
            chat.appendChild(row);
            while (chat.children.length > 6) chat.removeChild(chat.firstElementChild);
          }
          function showGift(text){
            if (!giftToast) return;
            giftToast.textContent = text;
            giftToast.classList.remove('show');
            void giftToast.offsetWidth;
            giftToast.classList.add('show');
          }

          function syncLocalStreamToPeers(){
            if (role !== 'host' || !localStream) return;
            const tracks = localStream.getTracks();
            peers.forEach(function(pc){
              tracks.forEach(function(track){
                const sender = pc.getSenders().find(function(item){
                  return item.track && item.track.kind === track.kind;
                });
                if (sender) {
                  sender.replaceTrack(track).catch(function(){});
                } else {
                  try { pc.addTrack(track, localStream); } catch(e) {}
                }
              });
            });
          }

          async function getCamera(){
            const oldStream = localStream;
            localStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode }, audio:true });
            video.srcObject = localStream;
            video.muted = true;
            await video.play().catch(function(){
              video.muted = true;
              video.play().catch(function(){});
            });
            syncLocalStreamToPeers();
            if (oldStream) oldStream.getTracks().forEach(track => track.stop());
            await startReplayRecorder(localStream);
            hideWait();
            setStatus('');
          }

          function peerFor(id){
            if (peers.has(id)) return peers.get(id);
            const pc = new RTCPeerConnection(config);
            peers.set(id, pc);
            pc.onicecandidate = event => {
              if (event.candidate) socket.emit('live:ice', { storyId, to:id, candidate:event.candidate });
            };
            pc.ontrack = event => {
              if (role !== 'host') {
                video.srcObject = event.streams[0];
                video.muted = false;
                video.play().catch(function(){});
                hideWait();
                setStatus('');
              }
            };
            if (role === 'host' && localStream) {
              localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            }
            return pc;
          }

          async function startHost(){
            await getCamera();
            socket.emit('live:join', { storyId, role:'host', name });
            addChat('Tapzy', 'You are live. Viewers can chat and send gifts.');
          }

          function loadLiveKitClient(){
            return new Promise(function(resolve, reject){
              if (window.LivekitClient) return resolve(window.LivekitClient);
              const script = document.createElement('script');
              script.src = 'https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js';
              script.async = true;
              script.onload = function(){ window.LivekitClient ? resolve(window.LivekitClient) : reject(new Error('Live provider SDK unavailable')); };
              script.onerror = function(){ reject(new Error('Live provider SDK failed to load')); };
              document.head.appendChild(script);
            });
          }

          async function startProviderViewer(){
            const res = await fetch('/stories/live/' + encodeURIComponent(storyId) + '/provider-token', {
              method:'POST',
              headers:{ 'Accept':'application/json', 'Content-Type':'application/json' },
              body:JSON.stringify({ role:'viewer' }),
            });
            const tokenData = await res.json().catch(function(){ return {}; });
            if (!res.ok || !tokenData.ok || !tokenData.configured) return false;
            const LK = await loadLiveKitClient();
            const room = new LK.Room({ adaptiveStream:true, dynacast:true });
            room.on(LK.RoomEvent.TrackSubscribed, function(track){
              if (track.kind === 'video') {
                track.attach(video);
                video.muted = false;
                video.play().catch(function(){});
                hideWait();
                setStatus('');
              } else if (track.kind === 'audio') {
                const audio = track.attach();
                audio.autoplay = true;
                audio.style.display = 'none';
                document.body.appendChild(audio);
              }
            });
            await room.connect(tokenData.url, tokenData.token);
            return true;
          }

          async function startViewer(){
            startProviderViewer().then(function(joined){
              if (joined) addChat('Tapzy', 'Welcome to the live.');
            }).catch(function(error){ console.error(error); });
            socket.emit('live:join', { storyId, role:'viewer', name });
            addChat('Tapzy', 'Welcome to the live.');
          }

          socket.on('connect', function(){
            if (role === 'host') startHost().catch(function(){ setStatus('Camera permission needed'); });
            else startViewer();
          });

          socket.on('live:viewer-joined', async function(payload){
            if (role !== 'host') return;
            const viewerId = payload.viewerId;
            const pc = peerFor(viewerId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('live:offer', { storyId, to:viewerId, sdp:offer });
            setStatus('');
          });

          socket.on('live:offer', async function(payload){
            if (role === 'host') return;
            const pc = peerFor(payload.from);
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('live:answer', { storyId, to:payload.from, sdp:answer });
          });

          socket.on('live:answer', async function(payload){
            const pc = peers.get(payload.from);
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          });

          socket.on('live:ice', async function(payload){
            const pc = peerFor(payload.from);
            try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch(e) {}
          });

          socket.on('live:waiting', function(){ setStatus(''); });
          socket.on('live:ended', function(){
            setStatus('Live ended');
            if (wait) wait.style.display = 'grid';
            addChat('Tapzy', 'The live has ended.');
          });

          socket.on('live:count', function(payload){
            if (viewerCount) viewerCount.textContent = String(Math.max(1, Number(payload.count || 0)));
          });

          socket.on('live:chat', function(payload){
            addChat(payload.name, payload.message);
          });

          socket.on('live:gift', function(payload){
            const giftText = (payload.gift || 'Gift') + (payload.amount ? ' $' + payload.amount : '');
            addChat(payload.name, 'sent ' + giftText, true);
            showGift((payload.name || 'Viewer') + ' sent ' + giftText);
          });

          if (chatInput) {
            chatInput.addEventListener('focus', function(){ room.classList.add('tl-keyboard'); });
            chatInput.addEventListener('blur', function(){ setTimeout(function(){ room.classList.remove('tl-keyboard'); }, 120); });
          }

          if (chatForm) chatForm.addEventListener('submit', function(event){
            event.preventDefault();
            const text = (chatInput.value || '').trim();
            if (!text) return;
            socket.emit('live:chat', { storyId, name, message:text });
            chatInput.value = '';
          });

          document.addEventListener('click', async function(event){
            if (event.target.closest('[data-sound]')) {
              video.muted = !video.muted;
              video.volume = 1;
              video.play().catch(function(){});
              return;
            }
            if (event.target.closest('[data-mute]') && localStream) {
              localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
              return;
            }
            if (event.target.closest('[data-flip]')) {
              facingMode = facingMode === 'user' ? 'environment' : 'user';
              await getCamera().catch(function(){});
              return;
            }
            if (event.target.closest('[data-end]')) {
              finishLiveAndOpenEditor();
              return;
            }
            if (event.target.closest('[data-gifts]')) {
              if (giftPanel) { giftPanel.classList.add('is-open'); giftPanel.setAttribute('aria-hidden','false'); }
              return;
            }
            if (event.target.closest('[data-gift-close]')) {
              if (giftPanel) { giftPanel.classList.remove('is-open'); giftPanel.setAttribute('aria-hidden','true'); }
              return;
            }
            const giftButton = event.target.closest('[data-gift]');
            if (giftButton) {
              const gift = giftButton.getAttribute('data-gift');
              const amount = Number(giftButton.getAttribute('data-amount') || 0);
              socket.emit('live:gift', { storyId, name, gift, amount });
              if (giftPanel) giftPanel.classList.remove('is-open');
              return;
            }
            if (event.target.closest('[data-share]')) {
              if (navigator.share) navigator.share({ title: document.title, url: location.href }).catch(function(){});
              else if (navigator.clipboard) navigator.clipboard.writeText(location.href);
            }
          });
        })();
      </script>
    </body>
    </html>`);
  } catch (error) {
    console.error("Live room error:", error);
    res.status(500).send("Live room error");
  }
});

router.get("/stories/feed", async (req, res) => {
  try {
    const currentProfile = req.currentProfile || null;
    const now = new Date();
    const followingIds = new Set();

    if (currentProfile) {
      const following = await prisma.follow.findMany({
        where: { followerProfileId: currentProfile.id },
        select: { followingProfileId: true },
      });
      following.forEach((row) => followingIds.add(row.followingProfileId));
    }

    let stories = await prisma.story.findMany({
      where: { expiresAt: { gt: now } },
      include: {
        profile: true,
        event: true,
        _count: { select: { likes: true, replies: true, views: true } },
        likes: currentProfile
          ? { where: { profileId: currentProfile.id }, select: { id: true } }
          : false,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
    });
    const eventStreams = [];
    const fallbackVideos = [];

    if (currentProfile && stories.length) {
      const unseen = await prisma.storyView.findMany({
        where: {
          viewerId: currentProfile.id,
          storyId: { in: stories.map((story) => story.id) },
        },
        select: { storyId: true },
      });
      const seenIds = new Set(unseen.map((row) => row.storyId));
      const viewRows = stories
        .filter((story) => !seenIds.has(story.id))
        .map((story) => ({ storyId: story.id, viewerId: currentProfile.id }));
      if (viewRows.length) {
        await prisma.storyView.createMany({ data: viewRows, skipDuplicates: true });
      }
    }

    const storySlides = stories.map((story, index) => {
      const profile = story.profile || {};
      const username = profile.username || "tapzy";
      const displayName = profile.name || `@${username}`;
      const isVideo = story.mediaUrl && isVideoUrl(story.mediaUrl);
      const isLive = story.type === "live" && (!story.mediaUrl || isLiveStreamUrl(story.mediaUrl) || isNativeLiveUrl(story.mediaUrl));
      const isFollowing =
        currentProfile &&
        (currentProfile.id === story.profileId || followingIds.has(story.profileId));
      const liked = !!(currentProfile && story.likes && story.likes.length);
      const avatar = profile.photo
        ? `<img src="${escapeHtml(profile.photo)}" alt="" />`
        : `<span>${escapeHtml((displayName[0] || "T").toUpperCase())}</span>`;
      const media = isLive && !story.mediaUrl
        ? `<div class="sf-text-story sf-live-now-card"><span>LIVE NOW</span></div>`
        : story.mediaUrl
        ? isLive
          ? renderLiveStreamMedia(story.mediaUrl, story.text || `${displayName}'s live`, index)
          : isVideo
          ? `<video class="sf-media" src="${escapeHtml(story.mediaUrl)}" autoplay loop playsinline webkit-playsinline preload="metadata"></video>`
          : `<img class="sf-media" src="${escapeHtml(story.mediaUrl)}" alt="${escapeHtml(story.text || `${displayName}'s story`)}" loading="${index < 2 ? "eager" : "lazy"}" decoding="async" />`
        : `<div class="sf-text-story"><span>${escapeHtml(story.text || `${displayName}'s story`)}</span></div>`;
      const eventLabel = story.event?.title
        ? `<a class="sf-event" href="/events#event-${escapeHtml(story.event.id)}">${escapeHtml(story.event.title)}</a>`
        : isLive
        ? `<span class="sf-event">LIVE</span>`
        : "";
      const ageHours = Math.max(0, Math.floor((Date.now() - new Date(story.createdAt).getTime()) / 3600000));
      const age = ageHours < 1 ? "Just now" : `${ageHours}h`;

      return `
      <article class="sf-slide" data-story="${escapeHtml(story.id)}" data-following="${isFollowing ? "1" : "0"}" data-event="${story.event ? "1" : "0"}">
        <div class="sf-media-wrap">${media}<div class="sf-shade"></div></div>

        <div class="sf-copy">
          ${eventLabel}
          <a class="sf-author" href="/u/${escapeHtml(username)}">${escapeHtml(displayName)}</a>
          ${story.text ? `<p>${escapeHtml(story.text)}</p>` : ""}
          <div class="sf-meta">${escapeHtml(age)} · Tapzy Story</div>
        </div>

        <aside class="sf-actions" aria-label="Story actions">
          <a class="sf-avatar" href="/u/${escapeHtml(username)}">${avatar}</a>
          <form method="POST" action="/stories/${escapeHtml(story.id)}/like" class="sf-action-form">
            <button class="sf-action ${liked ? "is-active" : ""}" type="submit" aria-label="${liked ? "Unlike" : "Like"} story">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.7-9C.7 8.8 2.2 5 6 4.4c2.2-.3 4.1.8 5 2.2.9-1.4 2.8-2.5 5-2.2 3.8.6 5.3 4.4 3.7 7.6C17.5 16.4 12 21 12 21Z"/></svg>
              <span>${compactFeedCount(story._count.likes)}</span>
            </button>
          </form>
          <a class="sf-action" href="/stories/${escapeHtml(username)}#reply" aria-label="Reply to story">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z"/></svg>
            <span>${compactFeedCount(story._count.replies)}</span>
          </a>
          ${currentProfile && currentProfile.id === story.profileId ? `
          <form method="POST" action="/stories/${escapeHtml(story.id)}/delete" class="sf-action-form" onsubmit="return confirm('Remove this story?');">
            <button class="sf-action" type="submit" aria-label="Remove story">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6h10l-1 15H8L7 6Zm2-3h6l1 2H8l1-2Zm-4 2h14v2H5V5Z"/></svg>
              <span>Remove</span>
            </button>
          </form>` : ""}
          <button class="sf-action sf-save" type="button" data-save="${escapeHtml(story.id)}" aria-label="Save story">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4V3Z"/></svg>
            <span>Save</span>
          </button>
          <button class="sf-action" type="button" data-share="/stories/${escapeHtml(username)}" aria-label="Share story">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 16-8-6 16-3-6-7-2Zm7 2 9-10"/></svg>
            <span>Share</span>
          </button>
          ${isVideo ? `
          <button class="sf-sound is-active" type="button" data-sound aria-label="Mute story">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12-1c1.4 1.2 1.4 6.8 0 8m3-11c3 3 3 11 0 14"/></svg>
          </button>` : ""}
        </aside>
      </article>`;
    }).join("");

    const eventSlides = !stories.length
      ? eventStreams.map((event, index) => {
        const title = event.title || "Live Event Stream";
        const category = eventStreamTone(event);
        const location = event.venueName || event.address || event.city || "Live now";
        const liveUrl = String(event.liveUrl || "").trim();
        const eventHref = liveUrl && isLiveStreamUrl(liveUrl)
          ? liveUrl
          : event.id && !String(event.id).startsWith("virtual-")
          ? `/events#event-${escapeHtml(event.id)}`
          : "/events";
        const eventHrefAttr = escapeHtml(eventHref);
        const eventMedia = String(event.imageUrl || "").trim();
        const eventVideo = eventMedia && isVideoUrl(eventMedia) ? eventMedia : "";
        const recycledVideo = fallbackVideos.length
          ? String(fallbackVideos[index % fallbackVideos.length].mediaUrl || "").trim()
          : "";
        const videoUrl = eventVideo || recycledVideo;
        const media = liveUrl && isLiveStreamUrl(liveUrl)
          ? renderLiveStreamMedia(liveUrl, title, index)
          : videoUrl
          ? `<video class="sf-media sf-stream-video" src="${escapeHtml(videoUrl)}" loop playsinline webkit-playsinline preload="metadata"></video>`
          : `<div class="sf-virtual-stream sf-virtual-motion" style="--stream-bg:${escapeHtml(eventStreamGradient(index))}"><span>${escapeHtml(category)}</span></div>`;
        const when = event.startAt ? formatPrettyLocal(event.startAt) : "Live now";
        const text = event.description || `${category} from Tapzy events happening now.`;

        return `
        <article class="sf-slide sf-stream-slide" data-story="event-${escapeHtml(event.id || index)}" data-following="0" data-event="1">
          <div class="sf-media-wrap">${media}<div class="sf-shade"></div></div>
          <div class="sf-copy">
            <a class="sf-event" href="${eventHrefAttr}">${escapeHtml(category)}</a>
            <a class="sf-author" href="${eventHrefAttr}">${escapeHtml(title)}</a>
            <p>${escapeHtml(text)}</p>
            <div class="sf-meta">${escapeHtml(when)} Â· ${escapeHtml(location)}</div>
          </div>
          <aside class="sf-actions" aria-label="Live event actions">
            <a class="sf-avatar sf-avatar-tapzy" href="/events">T</a>
            <a class="sf-action" href="${eventHrefAttr}" aria-label="Open event">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7a2 2 0 0 0 0 4v6h16v-6a2 2 0 0 0 0-4V5H4v2Z"/><path d="M13 5v12"/></svg>
              <span>Open</span>
            </a>
            <button class="sf-action" type="button" data-share="${eventHrefAttr}" aria-label="Share event stream">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 16-8-6 16-3-6-7-2Zm7 2 9-10"/></svg>
              <span>Share</span>
            </button>
            ${videoUrl ? `
            <button class="sf-sound is-active" type="button" data-sound aria-label="Mute stream">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12-1c1.4 1.2 1.4 6.8 0 8m3-11c3 3 3 11 0 14"/></svg>
            </button>` : ""}
          </aside>
        </article>`;
      }).join("")
      : "";

    const slides = storySlides || eventSlides;

    const profileHref = currentProfile?.username ? `/u/${currentProfile.username}` : "/auth";
    const emptyMessage = slides
      ? ""
      : `<div class="sf-empty"><div class="sf-empty-mark">${tapzyMarkImg("tapzy-mark tapzy-mark-empty")}</div><h1>No live stories yet</h1><p>Be the first to share what is happening.</p></div>`;

    res.send(`<!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="theme-color" content="#000000" />
      <title>Story Feed · Tapzy</title>
      <style>
        :root{color-scheme:dark;--safe-top:env(safe-area-inset-top,0px);--safe-bottom:env(safe-area-inset-bottom,0px)}
        *{box-sizing:border-box}
        html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        button,a{font:inherit;-webkit-tap-highlight-color:transparent}
        button{color:inherit}
        .sf-app{position:relative;width:100%;height:100%;background:#000;overflow:hidden}
        .sf-feed{height:100%;overflow-y:auto;scroll-snap-type:y mandatory;overscroll-behavior-y:contain;scrollbar-width:none}
        .sf-feed::-webkit-scrollbar{display:none}
        .sf-slide{position:relative;width:100%;height:100%;min-height:100%;scroll-snap-align:start;scroll-snap-stop:always;background:#090909;overflow:hidden}
        .sf-slide[hidden]{display:none}
        .sf-media-wrap,.sf-media,.sf-shade{position:absolute;inset:0;width:100%;height:100%}
        .sf-media{object-fit:cover;background:#111}
        .sf-live-embed{border:0;background:#000}
        .sf-native-live-preview{position:absolute;inset:0;display:block;overflow:hidden;background:#000;color:#fff;text-decoration:none}
        .sf-native-live-frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000;pointer-events:none}
        .sf-live-link{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:10px;padding:44px;text-decoration:none;color:#fff;background:radial-gradient(circle at 28% 24%,rgba(47,118,255,.38),transparent 36%),radial-gradient(circle at 82% 34%,rgba(255,255,255,.12),transparent 34%),linear-gradient(180deg,#101827,#02040a)}
        .sf-live-link::before{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.16) .7px,transparent .7px);background-size:10px 10px;opacity:.14}
        .sf-live-link strong,.sf-live-link em,.sf-live-badge{position:relative;z-index:1}
        .sf-live-link strong{max-width:11ch;font-size:clamp(42px,13vw,72px);line-height:.92;font-weight:950;letter-spacing:-.075em;text-transform:uppercase;text-shadow:0 18px 48px rgba(0,0,0,.65)}
        .sf-live-link em{font-style:normal;color:rgba(226,236,255,.78);font-weight:800}
        .sf-live-badge{display:inline-flex;width:max-content;padding:7px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.20);background:rgba(255,255,255,.12);font-size:11px;font-weight:950;letter-spacing:.18em}
        .sf-virtual-stream{position:absolute;inset:0;display:grid;place-items:center;padding:44px;background:var(--stream-bg);overflow:hidden;text-align:center}
        .sf-virtual-stream::before{content:"";position:absolute;inset:-12%;background-image:radial-gradient(rgba(255,255,255,.18) .7px,transparent .7px);background-size:10px 10px;opacity:.16}
        .sf-virtual-stream::after{content:"LIVE";position:absolute;top:calc(var(--safe-top) + 96px);left:20px;padding:7px 10px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);font-size:11px;font-weight:900;letter-spacing:.18em;color:#fff}
        .sf-virtual-motion{animation:sfStreamDrift 7s ease-in-out infinite alternate}
        .sf-virtual-motion::before{animation:sfStreamNoise 12s linear infinite}
        .sf-virtual-stream span{position:relative;z-index:1;max-width:10ch;font-size:clamp(42px,14vw,78px);line-height:.9;font-weight:950;letter-spacing:-.08em;text-transform:uppercase;text-shadow:0 16px 44px rgba(0,0,0,.62)}
        @keyframes sfStreamDrift{0%{background-position:0 0;filter:saturate(1)}100%{background-position:22px -28px;filter:saturate(1.18) brightness(1.05)}}
        @keyframes sfStreamNoise{0%{transform:translate3d(0,0,0)}100%{transform:translate3d(-28px,24px,0)}}
        .sf-shade{pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.42) 0,transparent 24%,transparent 54%,rgba(0,0,0,.12) 65%,rgba(0,0,0,.9) 100%)}
        .sf-text-story{position:absolute;inset:0;display:grid;place-items:center;padding:52px 44px 180px;background:radial-gradient(circle at 30% 20%,#27376b 0,#14172a 35%,#06070c 78%);font-size:clamp(28px,7vw,48px);font-weight:850;line-height:1.08;text-align:center}
        .sf-live-now-card{background:radial-gradient(circle at 50% 30%,rgba(255,40,95,.28),transparent 32%),radial-gradient(circle at 40% 70%,rgba(47,118,255,.24),transparent 36%),#05060b;color:#fff;letter-spacing:.02em}
        .sf-top{position:fixed;z-index:20;top:0;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:26px;padding:calc(var(--safe-top) + 18px) 58px 16px;background:linear-gradient(180deg,rgba(0,0,0,.54),transparent)}
        .sf-brand{position:absolute;left:16px;top:calc(var(--safe-top) + 16px);display:grid;place-items:center;width:38px;height:38px;border:2px solid rgba(255,255,255,.9);border-radius:12px;color:#fff;text-decoration:none;background:rgba(3,6,12,.24);box-shadow:0 10px 26px rgba(0,0,0,.22);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
        .tapzy-mark{display:block;width:72%;height:72%;object-fit:contain}
        .sf-tabs{display:flex;gap:18px;align-items:center}
        .sf-tab{position:relative;border:0;background:none;padding:8px 0;color:rgba(255,255,255,.68);font-weight:750;font-size:15px;cursor:pointer}
        .sf-tab.is-active{color:#fff}
        .sf-tab.is-active::after{content:"";position:absolute;left:50%;bottom:-5px;width:26px;height:3px;border-radius:5px;background:#fff;transform:translateX(-50%)}
        .sf-search{position:absolute;right:15px;top:calc(var(--safe-top) + 16px);width:40px;height:40px;border:0;background:none;padding:7px;cursor:pointer}
        .sf-search svg,.sf-action svg,.sf-sound svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        .sf-copy{position:absolute;z-index:4;left:18px;right:92px;bottom:calc(var(--safe-bottom) + 82px);text-shadow:0 2px 12px rgba(0,0,0,.7)}
        .sf-author{display:block;width:max-content;max-width:100%;margin-bottom:8px;color:#fff;text-decoration:none;font-size:17px;font-weight:850}
        .sf-copy p{margin:0 0 8px;font-size:15px;line-height:1.35}
        .sf-meta{font-size:13px;color:rgba(255,255,255,.8)}
        .sf-event{display:inline-flex;margin-bottom:11px;padding:7px 10px;border-radius:9px;background:rgba(12,18,35,.64);backdrop-filter:blur(12px);color:#fff;text-decoration:none;font-size:12px;font-weight:800;border:1px solid rgba(255,255,255,.18)}
        .sf-actions{position:absolute;z-index:5;right:9px;bottom:calc(var(--safe-bottom) + 78px);display:flex;flex-direction:column;align-items:center;gap:10px;width:58px;padding:8px 3px;border-radius:29px;background:linear-gradient(180deg,rgba(5,8,14,.16),rgba(5,8,14,.04));backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
        .sf-avatar{position:relative;width:46px;height:46px;border:2px solid rgba(255,255,255,.90);border-radius:50%;overflow:visible;display:grid;place-items:center;background:linear-gradient(180deg,#111827,#02040a);color:#fff;text-decoration:none;font-weight:950;box-shadow:0 12px 26px rgba(0,0,0,.32),0 0 0 1px rgba(255,255,255,.10) inset}
        .sf-avatar::before,.sf-avatar::after{content:"";position:absolute;inset:-5px;border-radius:inherit;border:1px solid rgba(82,166,255,.54);box-shadow:0 0 18px rgba(47,118,255,.30);animation:sfAvatarPulse 2.2s ease-out infinite;pointer-events:none}
        .sf-avatar::after{inset:-10px;animation-delay:.75s;opacity:.42}
        .sf-avatar-tapzy{background:linear-gradient(145deg,#2f76ff,#1145ad);box-shadow:0 0 24px rgba(47,118,255,.34)}
        .sf-avatar img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block}
        @keyframes sfAvatarPulse{0%{transform:scale(.88);opacity:.86}70%{transform:scale(1.16);opacity:.12}100%{transform:scale(1.2);opacity:0}}
        .sf-action-form{margin:0}
        .sf-action{display:flex;flex-direction:column;align-items:center;gap:3px;width:54px;padding:4px 0;border:0;border-radius:18px;background:rgba(255,255,255,.02);color:#fff;text-decoration:none;font-size:11px;font-weight:850;cursor:pointer;text-shadow:0 2px 10px rgba(0,0,0,.7);filter:drop-shadow(0 7px 14px rgba(0,0,0,.32))}
        .sf-action svg{width:28px;height:28px;fill:#fff;stroke:#fff;filter:drop-shadow(0 7px 14px rgba(0,0,0,.48))}
        .sf-action span{line-height:1;letter-spacing:.01em}
        .sf-action.is-active svg{fill:#ff315f;stroke:#ff315f}
        .sf-save.is-saved svg{fill:#2f76ff;stroke:#fff}
        .sf-sound{width:43px;height:43px;border-radius:50%;border:2px solid rgba(255,255,255,.65);background:rgba(0,0,0,.4);padding:10px;cursor:pointer}
        .sf-bottom{position:fixed;z-index:20;left:0;right:0;bottom:0;height:calc(64px + var(--safe-bottom));padding:7px 10px var(--safe-bottom);display:flex;align-items:center;justify-content:space-around;background:#030303;border-top:1px solid rgba(255,255,255,.08)}
        .sf-nav{min-width:55px;display:flex;flex-direction:column;align-items:center;gap:2px;color:rgba(255,255,255,.72);text-decoration:none;font-size:10px;font-weight:650}
        button.sf-nav{border:0;background:none;padding:0;cursor:default}
        .sf-nav.is-active{color:#fff}
        .sf-nav svg{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        .sf-create{width:56px;height:38px;display:grid;place-items:center;border:2px solid #fff;border-radius:11px;background:linear-gradient(145deg,#2f76ff,#1145ad);color:#fff;text-decoration:none;font-size:29px;font-weight:900;line-height:1;box-shadow:0 5px 18px rgba(35,102,231,.42)}
        .sf-empty{height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:30px;text-align:center;background:radial-gradient(circle at 50% 30%,#172753,#07080c 54%,#000)}
        .sf-empty-mark{position:relative;display:grid;place-items:center;width:74px;height:74px;border-radius:24px;background:linear-gradient(145deg,#2f76ff,#1145ad);color:#fff;box-shadow:0 18px 44px rgba(35,102,231,.34),inset 0 1px 0 rgba(255,255,255,.16);animation:sfLogoPulse 2.25s ease-in-out infinite;will-change:transform,box-shadow}
        .sf-empty-mark::before{content:"";position:absolute;inset:-12px;border-radius:32px;background:radial-gradient(circle,rgba(47,118,255,.36),rgba(47,118,255,0) 70%);animation:sfLogoHalo 2.25s ease-out infinite;z-index:-1}
        .sf-empty-mark::after{content:"";position:absolute;inset:0;border-radius:24px;background:linear-gradient(135deg,rgba(255,255,255,.22),rgba(255,255,255,0) 45%);pointer-events:none}
        .tapzy-mark-empty{width:66%;height:66%;filter:drop-shadow(0 3px 8px rgba(0,0,0,.22));animation:sfLogoInnerPulse 2.25s ease-in-out infinite}
        @keyframes sfLogoPulse{0%,100%{transform:scale(1);box-shadow:0 18px 44px rgba(35,102,231,.34),inset 0 1px 0 rgba(255,255,255,.16)}50%{transform:scale(1.075);box-shadow:0 22px 62px rgba(35,102,231,.58),0 0 32px rgba(79,145,255,.38),inset 0 1px 0 rgba(255,255,255,.22)}}
        @keyframes sfLogoHalo{0%{opacity:.48;transform:scale(.86)}60%{opacity:.16;transform:scale(1.32)}100%{opacity:0;transform:scale(1.45)}}
        @keyframes sfLogoInnerPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}
        .sf-empty h1{margin:22px 0 8px;font-size:clamp(32px,8vw,46px);line-height:1.04;font-weight:860;letter-spacing:-.033em;color:#fff;text-wrap:balance;text-shadow:0 1px 18px rgba(255,255,255,.1),0 14px 34px rgba(0,0,0,.42);font-feature-settings:"kern" 1,"ss01" 1}
        .sf-empty p{max-width:340px;margin:0;color:rgba(224,231,246,.75);font-size:clamp(17px,4.25vw,22px);line-height:1.32;font-weight:460;letter-spacing:-.012em;text-wrap:balance;text-shadow:0 10px 28px rgba(0,0,0,.35)}
        .sf-no-results{position:fixed;z-index:12;inset:0;display:none;place-items:center;padding:30px;text-align:center;background:#090909;color:#c8ccda}
        .sf-no-results.is-visible{display:grid}
        @media(min-width:760px){
          .sf-app{max-width:520px;margin:0 auto;box-shadow:0 0 80px rgba(0,0,0,.8)}
          body{background:#111}
        }
        @media(max-width:430px){.sf-tabs{gap:12px}.sf-tab{font-size:13px}.sf-top{padding-left:50px;padding-right:50px}.sf-copy{left:14px}}
      </style>
    </head>
    <body>
      <main class="sf-app">
        <header class="sf-top">
          <a class="sf-brand" href="/stories" aria-label="Back to Stories">${tapzyMarkImg("tapzy-mark tapzy-mark-brand")}</a>
          <nav class="sf-tabs" aria-label="Story feed filters">
            <a class="sf-tab" href="/events">Events</a>
            <button class="sf-tab" type="button" data-filter="following">Following</button>
            <button class="sf-tab is-active" type="button" data-filter="all">Discover</button>
            <a class="sf-tab" href="/messages">Messages</a>
          </nav>
          <button class="sf-search" type="button" data-search aria-label="Search Tapzy">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m16.5 16.5 4 4"></path></svg>
          </button>
        </header>

        <section class="sf-feed" aria-label="Tapzy story feed">${slides || emptyMessage}</section>
        <div class="sf-no-results">No stories in this section yet.</div>

        <nav class="sf-bottom" aria-label="Primary navigation">
          <button class="sf-nav is-active" type="button" aria-current="page">
            <svg viewBox="0 0 24 24"><path d="m3 11 9-8 9 8v10h-6v-7H9v7H3V11Z"></path></svg><span>Home</span>
          </button>
          <a class="sf-create" href="${currentProfile ? "/stories" : "/auth"}" aria-label="Create story">+</a>
          <a class="sf-nav" href="${profileHref}">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"></circle><path d="M4 22c0-5 3-8 8-8s8 3 8 8"></path></svg><span>Profile</span>
          </a>
        </nav>
      </main>
      <script>
        (function(){
          var feed = document.querySelector('.sf-feed');
          var slides = Array.prototype.slice.call(document.querySelectorAll('.sf-slide'));
          var tabs = Array.prototype.slice.call(document.querySelectorAll('.sf-tab[data-filter]'));
          var empty = document.querySelector('.sf-no-results');
          var tapzySoundUnlocked = localStorage.getItem('tapzy_story_sound') === '1';
          function forceSound(video){
            if (!video) return;
            try { video.defaultMuted = false; } catch(e) {}
            video.muted = false;
            video.volume = 1;
            video.removeAttribute('muted');
            tapzySoundUnlocked = true;
            localStorage.setItem('tapzy_story_sound', '1');
          }
          function activateVideoSound(slide){
            var video = slide && slide.querySelector ? slide.querySelector('video') : null;
            if (!video) return;
            forceSound(video);
            var sound = slide.querySelector('[data-sound]');
            if (sound) {
              sound.classList.add('is-active');
              sound.setAttribute('aria-label', 'Mute story');
            }
            video.play().catch(function(){});
          }
          var observer = new IntersectionObserver(function(entries){
            entries.forEach(function(entry){
              var video = entry.target.querySelector('video');
              if (!video) return;
              if (entry.isIntersecting && entry.intersectionRatio > .65) {
                if (tapzySoundUnlocked) activateVideoSound(entry.target);
                else video.play().catch(function(){});
              } else {
                video.pause();
              }
            });
          }, { root: feed, threshold: [.2,.65] });
          slides.forEach(function(slide){ observer.observe(slide); });

          tabs.forEach(function(tab){
            tab.addEventListener('click', function(){
              var filter = tab.getAttribute('data-filter');
              var visible = 0;
              tabs.forEach(function(item){ item.classList.toggle('is-active', item === tab); });
              slides.forEach(function(slide){
                var show = filter === 'all' || slide.getAttribute('data-' + filter) === '1';
                slide.hidden = !show;
                if (show) visible += 1;
              });
              empty.classList.toggle('is-visible', visible === 0);
              feed.scrollTop = 0;
            });
          });

          document.addEventListener('click', function(event){
            var sound = event.target.closest('[data-sound]');
            if (sound) {
              var video = sound.closest('.sf-slide').querySelector('video');
              if (video) {
                if (!tapzySoundUnlocked || video.muted) {
                  forceSound(video);
                } else {
                  video.muted = true;
                  localStorage.setItem('tapzy_story_sound', '0');
                  tapzySoundUnlocked = false;
                }
                video.play().catch(function(){});
                sound.classList.toggle('is-active', !video.muted);
                sound.setAttribute('aria-label', video.muted ? 'Turn sound on' : 'Mute story');
              }
              return;
            }
            var tappedSlide = event.target.closest('.sf-slide');
            if (tappedSlide && event.target.closest('video,.sf-media-wrap')) {
              activateVideoSound(tappedSlide);
              return;
            }
            var save = event.target.closest('[data-save]');
            if (save) {
              var key = 'tapzy_saved_story_' + save.getAttribute('data-save');
              var next = localStorage.getItem(key) !== '1';
              localStorage.setItem(key, next ? '1' : '0');
              save.classList.toggle('is-saved', next);
              save.querySelector('span').textContent = next ? 'Saved' : 'Save';
              return;
            }
            var share = event.target.closest('[data-share]');
            if (share) {
              var shareTarget = share.getAttribute('data-share') || '';
              var url = /^https?:\/\//i.test(shareTarget) ? shareTarget : location.origin + shareTarget;
              if (navigator.share) navigator.share({ title: 'Tapzy Story', url: url }).catch(function(){});
              else navigator.clipboard.writeText(url).then(function(){
                var label = share.querySelector('span');
                label.textContent = 'Copied';
                setTimeout(function(){ label.textContent = 'Share'; }, 1400);
              });
              return;
            }
            if (event.target.closest('[data-search]')) {
              location.href = '${currentProfile?.username ? `/discovery/${escapeHtml(currentProfile.username)}?tab=search` : "/auth"}';
            }
          });

          document.querySelectorAll('[data-save]').forEach(function(save){
            var saved = localStorage.getItem('tapzy_saved_story_' + save.getAttribute('data-save')) === '1';
            if (saved) {
              save.classList.add('is-saved');
              save.querySelector('span').textContent = 'Saved';
            }
          });
        })();
      </script>
    </body>
    </html>`);
  } catch (error) {
    console.error("Story feed error:", error);
    res.status(500).send("Story feed error");
  }
});



router.get("/stories/:username", async (req, res) => {

  try {

    const username = String(req.params.username || "").trim().toLowerCase();

    const currentProfile = req.currentProfile || null;

    const now = new Date();



    const profile = await prisma.userProfile.findUnique({

      where: { username },

    });



    if (!profile) return res.status(404).send("Profile not found");



    let stories = await prisma.story.findMany({

      where: {

        profileId: profile.id,

        expiresAt: { gt: now },

      },

      include: {

        event: true,

        _count: { select: { views: true } },

        views: currentProfile

          ? {

              where: { viewerId: currentProfile.id },

              select: { id: true },

            }

          : false,

      },

      orderBy: { createdAt: "asc" },

      take: 50,

    });


    if (!stories.length) {

      return res.send(

        renderShell(

          `@${profile.username} Stories`,

          `

          <div class="wrap" style="max-width:840px;">

            <div class="stories-empty-view">

              <h2 style="margin:0;">No active stories</h2>

              <div class="muted" style="margin-top:10px;">@${escapeHtml(profile.username || "user")} does not have any active stories right now.</div>

              <div style="margin-top:16px;">

                <a class="story-view-btn" href="/stories">Back to Stories</a>

              </div>

            </div>

          </div>

          <style>

            .stories-empty-view{

              padding:26px;

              border-radius:28px;

              border:1px solid rgba(255,255,255,.08);

              background:linear-gradient(180deg, rgba(10,12,18,.98), rgba(6,6,8,1));

            }

            .story-view-btn{

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

          </style>

          `,

          "",

          {

            currentProfile,

            pageTitle: "Stories",

            pageType: "stories",

          }

        )

      );

    }



    if (currentProfile) {

      for (const story of stories) {

        if (!story.views || story.views.length) continue;

        try {

          await prisma.storyView.create({

            data: {

              storyId: story.id,

              viewerId: currentProfile.id,

            },

          });

        } catch (e) {

          if (e?.code !== "P2002") throw e;

        }

      }

    }



    const storyIds = stories.map((story) => story.id);

    const likeRows = currentProfile && storyIds.length
      ? await prisma.storyLike.findMany({
          where: { storyId: { in: storyIds } },
          select: { storyId: true, profileId: true },
        })
      : storyIds.length
        ? await prisma.storyLike.findMany({
            where: { storyId: { in: storyIds } },
            select: { storyId: true, profileId: true },
          })
        : [];

    const storyLikeCounts = new Map();
    const likedStoryIds = new Set();

    for (const row of likeRows) {
      storyLikeCounts.set(row.storyId, (storyLikeCounts.get(row.storyId) || 0) + 1);
      if (currentProfile && row.profileId === currentProfile.id) likedStoryIds.add(row.storyId);
    }

    const storyItems = stories

      .map((story, index) => {

        const isVideoStory = story.mediaUrl && isVideoUrl(story.mediaUrl);
        const isLiveStory = story.mediaUrl && story.type === "live" && (isLiveStreamUrl(story.mediaUrl) || isNativeLiveUrl(story.mediaUrl));

        const media = story.mediaUrl

          ? isLiveStory

            ? renderLiveStreamMedia(story.mediaUrl, story.text || "Tapzy live story", index, "story-view-media")

            : isVideoStory

            ? `<video class="story-view-media" src="${escapeHtml(story.mediaUrl)}" autoplay playsinline webkit-playsinline preload="metadata"></video>`

            : `<img class="story-view-media" src="${escapeHtml(story.mediaUrl)}" alt="Story media" loading="eager" decoding="async" />`

          : `<div class="story-view-text-only">${escapeHtml(story.text || "@"+(profile.username || "user"))}</div>`;

        const likeCount = storyLikeCounts.get(story.id) || 0;
        const viewCount = story._count?.views || 0;



        const eventPill = story.event

          ? `<a class="story-event-pill" href="/events#event-${escapeHtml(story.event.id)}">${escapeHtml(story.event.title)}</a>`

          : "";



        return `

        <div class="story-panel ${index === 0 ? "story-panel-active" : ""}" data-story-index="${index}">

          <div class="story-progress-wrap">

            ${stories

              .map(

                (_, i) =>

                  `<div class="story-progress-bar"><span class="story-progress-fill ${i === 0 ? "story-progress-fill-active" : ""}" data-progress-index="${i}"></span></div>`

              )

              .join("")}

          </div>



          <div class="story-header">

            <div class="story-header-left">

              <div class="story-header-handle">@${escapeHtml(profile.username || "user")}</div>

            </div>



            <div class="story-header-actions">

              ${

                currentProfile && currentProfile.id === profile.id

                  ? `

                  <form method="POST" action="/stories/${story.id}/delete" onsubmit="return confirm('Delete this story?');" style="margin:0;">

                    <button class="story-delete-btn" type="submit">Delete</button>

                  </form>

                  `

                  : ""

              }

              <a class="story-close-btn" href="/stories">Close</a>

            </div>

          </div>



          <div class="story-stage">

            ${media}

            <div class="story-stage-overlay"></div>



            <div class="story-stage-bottom">

              ${eventPill}

              ${story.text ? `<div class="story-caption">${escapeHtml(story.text)}</div>` : ""}

              <div class="story-social-row">
                ${
                  currentProfile
                    ? `<form method="POST" action="/stories/${escapeHtml(story.id)}/like" style="margin:0;">
                         <button class="story-like-btn" type="submit">${likedStoryIds.has(story.id) ? "Liked ✓" : "Like"}</button>
                       </form>`
                    : `<a class="story-like-btn" href="/auth">Like</a>`
                }
                <div class="story-metric">${escapeHtml(String(likeCount))} like${likeCount === 1 ? "" : "s"}</div>
                <div class="story-metric">${escapeHtml(String(viewCount))} view${viewCount === 1 ? "" : "s"}</div>
                <div class="story-social-spacer"></div>
                ${isVideoStory ? `<button class="story-sound-btn" type="button" data-story-sound>Mute</button>` : ""}
              </div>

            </div>

          </div>

        </div>

        `;

      })

      .join("");



    const replyForm = currentProfile

      ? `

      <form class="story-reply-form" method="POST" action="/stories/${escapeHtml(profile.username || "")}/reply">

        <input type="text" name="body" placeholder="Reply to story..." />

        <button type="submit">Send</button>

      </form>

      `

      : `<div class="story-reply-signin"><a href="/auth">Sign in</a> to reply.</div>`;



    const body = `

    <div class="wrap story-view-wrap">

      <div class="story-view-shell">

        ${storyItems}

        ${replyForm}

      </div>

    </div>



    <style>

      .story-view-wrap{

        max-width:780px;

      }



      .story-view-shell{

        position:relative;

        overflow:hidden;

        border-radius:32px;

        border:1px solid rgba(255,255,255,.08);

        background:#05070d;

        box-shadow:0 24px 70px rgba(0,0,0,.46);

      }



      .story-panel{

        display:none;

        position:relative;

        min-height:78vh;

      }



      .story-panel-active{

        display:block;

      }



      .story-progress-wrap{

        position:absolute;

        top:16px;

        left:16px;

        right:16px;

        z-index:5;

        display:grid;

        grid-template-columns:repeat(${stories.length}, minmax(0, 1fr));

        gap:8px;

      }



      .story-progress-bar{

        height:4px;

        border-radius:999px;

        background:rgba(255,255,255,.18);

        overflow:hidden;

      }



      .story-progress-fill{

        display:block;

        width:0%;

        height:100%;

        background:#fff;

      }



      .story-progress-fill-active{

        width:0%;

      }



      .story-header{

        position:absolute;

        top:34px;

        left:18px;

        right:18px;

        z-index:6;

        display:flex;

        justify-content:space-between;

        align-items:flex-start;

        gap:12px;

      }



      .story-header-left{

        min-width:0;

        flex:1;

        padding-right:10px;

        padding-top:4px;

      }



      .story-header-actions{

        display:flex;

        align-items:center;

        justify-content:flex-end;

        gap:8px;

        flex-wrap:nowrap;

        flex-shrink:0;

      }



      .story-header-handle{

        color:#fff;

        font-size:17px;

        font-weight:900;

        line-height:1.05;

        word-break:break-word;

        text-shadow:0 2px 10px rgba(0,0,0,.35);

      }



      .story-close-btn,

      .story-delete-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:40px;

        padding:0 14px;

        border-radius:14px;

        border:1px solid rgba(255,255,255,.10);

        background:rgba(10,12,18,.68);

        color:#fff;

        text-decoration:none;

        cursor:pointer;

        font-size:13px;

        font-weight:800;

        backdrop-filter:blur(10px);

        white-space:nowrap;

      }



      .story-stage{

        position:relative;

        min-height:78vh;

        overflow:hidden;

      }



      .story-view-media,

      .story-view-text-only{

        width:100%;

        min-height:78vh;

        height:78vh;

        display:block;

        object-fit:cover;

        background:#0b0e16;

      }

      .story-view-media.sf-live-embed{
        border:0;
      }

      .story-view-media.sf-live-link{
        display:flex;
        flex-direction:column;
        justify-content:center;
        align-items:flex-start;
        gap:10px;
        padding:34px;
        color:#fff;
        text-decoration:none;
        background:radial-gradient(circle at 28% 24%,rgba(47,118,255,.38),transparent 36%),radial-gradient(circle at 82% 34%,rgba(255,255,255,.12),transparent 34%),linear-gradient(180deg,#101827,#02040a);
      }

      .story-view-media.sf-live-link strong{
        max-width:11ch;
        font-size:clamp(40px,12vw,70px);
        line-height:.92;
        font-weight:950;
        letter-spacing:-.075em;
        text-transform:uppercase;
      }

      .story-view-media.sf-live-link em{
        font-style:normal;
        color:rgba(226,236,255,.78);
        font-weight:800;
      }

      .story-view-media .sf-live-badge{
        display:inline-flex;
        width:max-content;
        padding:7px 10px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.20);
        background:rgba(255,255,255,.12);
        font-size:11px;
        font-weight:950;
        letter-spacing:.18em;
      }



      .story-view-text-only{

        display:flex;

        align-items:center;

        justify-content:center;

        padding:40px;

        text-align:center;

        color:#fff;

        font-size:28px;

        font-weight:900;

        line-height:1.3;

        background:

          radial-gradient(700px 260px at 50% 0%, rgba(127,210,255,.12), transparent 48%),

          linear-gradient(180deg, rgba(10,12,18,.98), rgba(6,6,8,1));

      }



      .story-stage-overlay{

        position:absolute;

        inset:0;

        background:linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.02) 28%, rgba(0,0,0,.36) 70%, rgba(0,0,0,.78));

        pointer-events:none;

      }



      .story-stage-bottom{

        position:absolute;

        left:18px;

        right:18px;

        bottom:18px;

        z-index:5;

        pointer-events:none;

      }



      .story-event-pill{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:34px;

        padding:0 12px;

        border-radius:999px;

        text-decoration:none;

        color:#fff;

        background:rgba(255,255,255,.12);

        border:1px solid rgba(255,255,255,.12);

        font-size:12px;

        font-weight:800;

        backdrop-filter:blur(10px);

        pointer-events:auto;

      }



      .story-caption{

        margin-top:12px;

        color:#fff;

        font-size:16px;

        line-height:1.65;

        max-width:92%;

      }



      .story-social-row{
        display:flex;
        align-items:center;
        gap:12px;
        margin-top:14px;
        flex-wrap:nowrap;
        width:100%;
        pointer-events:auto;
      }

      .story-like-btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:36px;
        padding:0 14px;
        border-radius:999px;
        text-decoration:none;
        border:1px solid rgba(255,255,255,.12);
        background:rgba(255,255,255,.08);
        color:#fff;
        font-size:13px;
        font-weight:800;
        cursor:pointer;
      }

      .story-metric{
        color:rgba(255,255,255,.84);
        font-size:13px;
        font-weight:800;
        white-space:nowrap;
      }

      .story-social-spacer{
        flex:1 1 auto;
        min-width:8px;
      }


        .story-sound-btn{
          min-height:34px;
          padding:0 12px;
          font-size:11px;
        }

        .stories-form-grid-premium{
          grid-template-columns:1fr;
        }

        .stories-preview-card{
          min-height:190px;
        }
      .story-reply-form{

        display:grid;

        grid-template-columns:1fr auto;

        gap:10px;

        padding:16px;

        border-top:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(10,12,18,.98), rgba(6,6,8,1));

      }



      .story-reply-form input{

        min-height:50px;

        border-radius:16px;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(12,15,21,.98), rgba(4,6,10,1));

        color:#fff;

        padding:0 14px;

        box-sizing:border-box;

      }



      .story-reply-form button{

        min-height:50px;

        padding:0 18px;

        border:none;

        border-radius:16px;

        color:#fff;

        font-size:14px;

        font-weight:800;

        cursor:pointer;

        background:

          radial-gradient(circle at 50% 0%, rgba(150,230,255,.18), transparent 55%),

          linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));

      }



      .story-reply-signin{

        padding:18px;

        border-top:1px solid rgba(255,255,255,.08);

        color:#d6e2f1;

      }



      .story-reply-signin a{

        color:#fff;

        font-weight:800;

      }




      .story-view-shell::before{
        content:"";
        position:absolute;
        inset:0;
        background:
          radial-gradient(600px 240px at 50% 0%, rgba(90,180,255,.14), transparent 58%),
          radial-gradient(420px 280px at 100% 100%, rgba(80,120,255,.10), transparent 62%);
        pointer-events:none;
        z-index:1;
      }

      .story-panel{
        transform:translateZ(0);
      }

      .story-progress-fill{
        background:linear-gradient(90deg, #fff, #9edcff);
        box-shadow:0 0 14px rgba(125,214,255,.55);
      }

      .story-header-handle::before{
        content:"";
        display:inline-block;
        width:8px;
        height:8px;
        margin-right:8px;
        border-radius:999px;
        background:#71d8ff;
        box-shadow:0 0 16px rgba(113,216,255,.9);
        vertical-align:middle;
      }

      .story-sound-btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:38px;
        padding:0 14px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(8,10,16,.62);
        color:#fff;
        font-size:12px;
        font-weight:900;
        cursor:pointer;
        backdrop-filter:blur(12px);
        box-shadow:0 12px 30px rgba(0,0,0,.28);
        white-space:nowrap;
      }

      .story-like-btn,
      .story-event-pill,
      .story-close-btn,
      .story-delete-btn{
        transition:transform .16s ease, background .16s ease, border-color .16s ease;
      }

      .story-like-btn:hover,
      .story-event-pill:hover,
      .story-close-btn:hover,
      .story-delete-btn:hover{
        transform:translateY(-1px);
        border-color:rgba(160,220,255,.28);
        background:rgba(255,255,255,.14);
      }

      .story-reply-form{
        position:relative;
        z-index:4;
      }
      @media(max-width:700px){

        .story-view-shell{

          border-radius:22px;

        }



        .story-panel,

        .story-stage,

        .story-view-media,

        .story-view-text-only{

          min-height:72vh;

          height:72vh;

        }



        .story-header{

          top:26px;

          left:12px;

          right:12px;

          gap:10px;

        }



        .story-header-left{

          padding-right:8px;

          padding-top:2px;

        }



        .story-header-handle{

          font-size:14px;

          line-height:1.05;

        }



        .story-close-btn,

        .story-delete-btn{

          min-height:34px;

          padding:0 11px;

          border-radius:12px;

          font-size:12px;

        }



        .story-caption{

          font-size:15px;

        }



        .story-social-row{
        display:flex;
        align-items:center;
        gap:12px;
        margin-top:14px;
        flex-wrap:wrap;
      }

      .story-like-btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:36px;
        padding:0 14px;
        border-radius:999px;
        text-decoration:none;
        border:1px solid rgba(255,255,255,.12);
        background:rgba(255,255,255,.08);
        color:#fff;
        font-size:13px;
        font-weight:800;
        cursor:pointer;
      }

      .story-like-count{
        color:rgba(255,255,255,.78);
        font-size:13px;
        font-weight:700;
      }

      .story-reply-form{

          grid-template-columns:1fr;

        }

      }

    </style>



    <script>

      (function(){

        const panels = Array.from(document.querySelectorAll(".story-panel"));
        const shell = document.querySelector(".story-view-shell");
        let index = 0;
        let timer = null;
        let raf = null;
        let tapzyViewerSoundUnlocked = localStorage.getItem('tapzy_story_sound') === '1';
        function forceViewerSound(video){
          if (!video) return;
          try { video.defaultMuted = false; } catch(e) {}
          video.muted = false;
          video.volume = 1;
          video.removeAttribute('muted');
          tapzyViewerSoundUnlocked = true;
          localStorage.setItem("tapzy_story_sound", "1");
        }
        let startX = 0;

        function currentPanel(){
          return panels[index] || null;
        }

        function currentVideo(){
          const panel = currentPanel();
          return panel ? panel.querySelector("video") : null;
        }

        function activeFills(){
          const panel = currentPanel();
          return panel ? Array.from(panel.querySelectorAll(".story-progress-fill")) : [];
        }

        function stopProgress(){
          if (timer) clearTimeout(timer);
          if (raf) cancelAnimationFrame(raf);
          timer = null;
          raf = null;
        }

        function paintProgress(percent){
          const fills = activeFills();
          fills.forEach((fill, i) => {
            fill.classList.toggle("story-progress-fill-active", i === index);
            fill.style.transition = "none";
            if (i < index) fill.style.width = "100%";
            else if (i > index) fill.style.width = "0%";
            else fill.style.width = Math.max(0, Math.min(100, percent)) + "%";
          });
        }

        function resetAllVisibleBars(){
          panels.forEach((panel) => {
            Array.from(panel.querySelectorAll(".story-progress-fill")).forEach((fill) => {
              fill.classList.remove("story-progress-fill-active");
              fill.style.transition = "none";
              fill.style.width = "0%";
            });
          });
        }

        function pauseInactiveVideos(){
          panels.forEach((panel, i) => {
            const video = panel.querySelector("video");
            if (!video) return;
            if (i !== index) {
              video.onloadedmetadata = null;
              video.ontimeupdate = null;
              video.onended = null;
              try { video.pause(); video.currentTime = 0; } catch(e) {}
            }
          });
        }

        function preloadNext(nextIndex){
          const nextPanel = panels[nextIndex + 1];
          if (!nextPanel) return;
          const media = nextPanel.querySelector("video, img");
          if (!media) return;
          if (media.tagName === "VIDEO") media.preload = "metadata";
          if (media.tagName === "IMG" && media.loading) media.loading = "eager";
        }

        function goNext(){
          stopProgress();
          if (index + 1 < panels.length) activate(index + 1);
          else paintProgress(100);
        }

        function startImageProgress(){
          const duration = 7000;
          const startedAt = performance.now();
          function tick(now){
            const pct = ((now - startedAt) / duration) * 100;
            paintProgress(pct);
            if (pct >= 100) return goNext();
            raf = requestAnimationFrame(tick);
          }
          raf = requestAnimationFrame(tick);
        }

        function startVideoProgress(video){
          function duration(){
            return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
          }

          function tick(){
            const d = duration();
            if (d > 0) paintProgress((video.currentTime / d) * 100);
            raf = requestAnimationFrame(tick);
          }

          video.onloadedmetadata = function(){
            paintProgress(0);
          };
          video.onended = goNext;
          video.ontimeupdate = function(){
            const d = duration();
            if (d > 0) paintProgress((video.currentTime / d) * 100);
          };

          try { video.currentTime = 0; } catch(e) {}
          const soundButton = currentPanel() ? currentPanel().querySelector("[data-story-sound]") : null;
          if (tapzyViewerSoundUnlocked) {
            forceViewerSound(video);
            if (soundButton) soundButton.textContent = "Mute";
            video.play().catch(function(){
              video.muted = true;
              tapzyViewerSoundUnlocked = false;
              localStorage.setItem("tapzy_story_sound", "0");
              if (soundButton) soundButton.textContent = "Sound on";
            });
          } else {
            video.muted = true;
            if (soundButton) soundButton.textContent = "Sound on";
            video.play().catch(function(){});
          }
          raf = requestAnimationFrame(tick);
        }

        function activate(nextIndex){
          if (nextIndex < 0 || nextIndex >= panels.length) return;
          stopProgress();
          index = nextIndex;

          panels.forEach((panel, i) => {
            panel.classList.toggle("story-panel-active", i === nextIndex);
          });

          resetAllVisibleBars();
          paintProgress(0);
          pauseInactiveVideos();
          preloadNext(nextIndex);

          const video = currentVideo();
          if (video) startVideoProgress(video);
          else startImageProgress();
        }

        document.addEventListener("click", function(e){
          const soundButton = e.target.closest("[data-story-sound]");
          if (soundButton) {
            const video = currentVideo();
            if (video) {
              if (!tapzyViewerSoundUnlocked || video.muted || soundButton.textContent !== "Mute") {
                forceViewerSound(video);
              } else {
                video.muted = true;
                tapzyViewerSoundUnlocked = false;
                localStorage.setItem("tapzy_story_sound", "0");
              }
              video.play().catch(function(){
                video.muted = true;
                tapzyViewerSoundUnlocked = false;
                localStorage.setItem("tapzy_story_sound", "0");
              });
              soundButton.textContent = video.muted ? "Sound on" : "Mute";
            }
            return;
          }

          if (!shell) return;
          const interactive = e.target.closest(
            "video, .story-close-btn, .story-delete-btn, .story-reply-form, input, button, a"
          );
          if (interactive) return;
          const bounds = shell.getBoundingClientRect();
          const x = e.clientX - bounds.left;
          if (x < bounds.width * 0.35) {
            if (index > 0) activate(index - 1);
          } else if (x > bounds.width * 0.65) {
            if (index + 1 < panels.length) activate(index + 1);
          }
        });

        if (shell) {
          shell.addEventListener("touchstart", function(e){
            startX = e.touches && e.touches[0] ? e.touches[0].clientX : 0;
          }, { passive:true });

          shell.addEventListener("touchend", function(e){
            const endX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : 0;
            const diff = endX - startX;
            if (Math.abs(diff) < 48) return;
            if (diff > 0 && index > 0) activate(index - 1);
            if (diff < 0 && index + 1 < panels.length) activate(index + 1);
          }, { passive:true });
        }

        activate(0);

      })();

    </script>



    ${renderTapzyAssistant({

      username: currentProfile?.username || "User",

      pageType: "stories",

    })}

    `;



    res.send(

      renderShell(`@${profile.username} Stories`, body, "", {

        currentProfile,

        pageTitle: "Stories",

        pageType: "stories",

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("Story viewer error");

  }

});



router.post("/stories/:id/delete", async (req, res) => {

  try {

    const currentProfile = req.currentProfile;

    if (!currentProfile) return res.redirect("/auth");



    const storyId = String(req.params.id || "").trim();



    const story = await prisma.story.findUnique({

      where: { id: storyId },

      select: { id: true, profileId: true },

    });



    if (!story) return res.redirect(backUrl(req, "/stories"));

    if (story.profileId !== currentProfile.id) {

      return res.status(403).send("Not allowed");

    }



    await prisma.story.delete({

      where: { id: storyId },

    });



    res.redirect(backUrl(req, "/stories"));

  } catch (e) {

    console.error(e);

    res.status(500).send("Delete story error");

  }

});



router.post("/stories/:username/reply", async (req, res) => {

  try {

    const currentProfile = req.currentProfile;

    if (!currentProfile) return res.redirect("/auth");



    const username = String(req.params.username || "").trim().toLowerCase();

    const body = String(req.body.body || "").trim();



    if (!body) return res.redirect(backUrl(req, `/stories/${username}`));



    const profile = await prisma.userProfile.findUnique({

      where: { username },

    });



    if (!profile) return res.status(404).send("Profile not found");



    const story = await prisma.story.findFirst({

      where: {

        profileId: profile.id,

        expiresAt: { gt: new Date() },

      },

      orderBy: { createdAt: "desc" },

    });



    if (!story) return res.redirect(backUrl(req, `/stories/${username}`));



    const reply = await prisma.storyReply.create({

      data: {

        storyId: story.id,

        senderProfileId: currentProfile.id,

        body,

      },

    });

    await createNotification({
      profileId: profile.id,
      actorId: currentProfile.id,
      type: "story_reply",
      title: `${currentProfile.name || currentProfile.username || "Someone"} replied to your story`,
      body,
      link: `/stories/${username}`,
      entityType: "story",
      entityId: story.id,
      image: String(currentProfile.photo || "").trim() || null,
      skipDuplicateWindow: false,
    });



    res.redirect(backUrl(req, `/stories/${username}`));

  } catch (e) {

    console.error(e);

    res.status(500).send("Story reply error");

  }

});



router.post("/stories/:id/like", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const storyId = String(req.params.id || "").trim();
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      include: {
        profile: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!story) return res.status(404).send("Story not found");

    const existing = await prisma.storyLike.findFirst({
      where: { storyId, profileId: currentProfile.id },
      select: { id: true },
    });

    if (existing) {
      await prisma.storyLike.delete({ where: { id: existing.id } });
    } else {
      await prisma.storyLike.create({
        data: {
          storyId,
          profileId: currentProfile.id,
        },
      });

      await createNotification({
        profileId: story.profileId,
        actorId: currentProfile.id,
        type: "story_like",
        title: `${currentProfile.name || currentProfile.username || "Someone"} liked your story`,
        body: story.text ? String(story.text).trim().slice(0, 120) : "",
        link: story.profile?.username ? `/stories/${story.profile.username}` : "/stories",
        entityType: "story",
        entityId: story.id,
        image: String(currentProfile.photo || "").trim() || null,
        skipDuplicateWindow: true,
      });
    }

    const fallback = story.profile?.username ? `/stories/${story.profile.username}` : "/stories";
    return res.redirect(backUrl(req, fallback));
  } catch (e) {
    console.error(e);
    return res.status(500).send("Story like error");
  }
});

module.exports = router;
