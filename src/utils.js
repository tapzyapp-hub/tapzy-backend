const crypto = require("crypto");

const { Resend } = require("resend");

const prisma = require("./prisma");

const {

  WEB_BASE,

  EMAIL_FROM,

  ADMIN_EMAIL,

  RESEND_API_KEY,

  SESSION_COOKIE,

  SESSION_DAYS,

  IS_PROD,

} = require("./config");



const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;



function cleanUsername(input) {

  return String(input || "")

    .trim()

    .toLowerCase()

    .replace(/[^a-z0-9_]/g, "");

}



async function ensureUniqueUsername(base) {

  const cleanBase = cleanUsername(base) || "user";

  let u = cleanBase;

  let tries = 0;



  while (tries < 20) {

    const exists = await prisma.userProfile.findUnique({ where: { username: u } });

    if (!exists) return u;

    tries += 1;

    u = `${cleanBase}_${Math.floor(Math.random() * 9999)}`;

  }



  return `${cleanBase}_${Date.now().toString().slice(-6)}`;

}



function formatPrettyLocal(dt) {

  const d = new Date(dt);

  const yyyy = d.getFullYear();

  const mm = String(d.getMonth() + 1).padStart(2, "0");

  const dd = String(d.getDate()).padStart(2, "0");

  let hh = d.getHours();

  const min = String(d.getMinutes()).padStart(2, "0");

  const ampm = hh >= 12 ? "PM" : "AM";

  hh %= 12;

  if (hh === 0) hh = 12;

  return `${yyyy}-${mm}-${dd} ${String(hh).padStart(2, "0")}:${min} ${ampm}`;

}



function safeUrl(u) {

  const s = String(u || "").trim();

  if (!s) return "";

  if (/^https?:\/\//i.test(s)) return s;

  return `https://${s}`;

}



function stripAt(handle) {

  let s = String(handle || "").trim();

  if (!s) return "";



  s = s.replace(/^@/, "");

  s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");

  s = s.replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, "");

  s = s.replace(/^https?:\/\/(www\.)?x\.com\//i, "");

  s = s.replace(/^https?:\/\/(www\.)?twitter\.com\//i, "");

  s = s.replace(/^https?:\/\/(www\.)?facebook\.com\//i, "");

  s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, "");

  s = s.replace(/^https?:\/\/(www\.)?t\.me\//i, "");

  s = s.replace(/^https?:\/\/(www\.)?youtube\.com\/@/i, "");

  s = s.replace(/^https?:\/\/(www\.)?youtube\.com\//i, "");

  s = s.replace(/^https?:\/\/(www\.)?snapchat\.com\/add\//i, "");



  s = s.split("?")[0].split("#")[0].split("/")[0];

  return s.trim();

}



function escapeHtml(input) {

  return String(input || "")

    .replace(/&/g, "&amp;")

    .replace(/</g, "&lt;")

    .replace(/>/g, "&gt;")

    .replace(/"/g, "&quot;")

    .replace(/'/g, "&#39;");

}



function publicAbsoluteUrl(req, relativePath) {

  if (!relativePath) return "";

  if (/^https?:\/\//i.test(relativePath)) return relativePath;



  const rel = String(relativePath).startsWith("/") ? relativePath : `/${relativePath}`;

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();

  const protocol = forwardedProto || (req.secure ? "https" : "http");

  const host = String(req.get("host") || "").trim();



  if (host) return `${protocol}://${host}${rel}`;



  const fallbackBase = WEB_BASE.replace(/\/+$/, "");

  return `${fallbackBase}${rel}`;

}



function makeVcf(profile) {

  const name = profile.name || profile.username || "Tapzy User";

  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${name}`];



  if (profile.name) lines.push(`N:${profile.name};;;;`);

  if (profile.phone) lines.push(`TEL;TYPE=CELL:${profile.phone}`);

  if (profile.email) lines.push(`EMAIL;TYPE=INTERNET:${profile.email}`);

  if (profile.website) lines.push(`URL:${safeUrl(profile.website)}`);



  lines.push("END:VCARD");

  return lines.join("\n");

}



function cryptoRandomSecret() {

  return crypto.randomBytes(24).toString("hex");

}



function makeSessionToken() {

  return crypto.randomBytes(32).toString("hex");

}



function parseOptionalFloat(value) {

  const n = Number(value);

  return Number.isFinite(n) ? n : null;

}



function buildQuickSharePreview(profile) {

  const out = [];

  if (profile.shareNameEnabled && profile.name) out.push("Name");

  if (profile.sharePhoneEnabled && profile.phone) out.push("Phone");

  if (profile.shareEmailEnabled && profile.email) out.push("Email");

  if (profile.shareWebsiteEnabled && profile.website) out.push("Website");

  if (profile.shareInstagramEnabled && profile.instagram) out.push("Instagram");

  if (profile.shareLinkedinEnabled && profile.linkedin) out.push("LinkedIn");

  if (profile.shareTiktokEnabled && profile.tiktok) out.push("TikTok");

  if (profile.shareTwitterEnabled && profile.twitter) out.push("X");

  if (profile.shareFacebookEnabled && profile.facebook) out.push("Facebook");

  if (profile.shareYoutubeEnabled && profile.youtube) out.push("YouTube");

  if (profile.shareGithubEnabled && profile.github) out.push("GitHub");

  if (profile.shareSnapchatEnabled && profile.snapchat) out.push("Snapchat");

  if (profile.shareWhatsappEnabled && profile.whatsapp) out.push("WhatsApp");

  if (profile.shareTelegramEnabled && profile.telegram) out.push("Telegram");

  return out;

}



function buildSharedFieldsFromProfile(profile) {

  return {

    sharedName:

      profile.quickShareEnabled && profile.shareNameEnabled

        ? String(profile.name || "").trim() || null

        : null,

    sharedPhone:

      profile.quickShareEnabled && profile.sharePhoneEnabled

        ? String(profile.phone || "").trim() || null

        : null,

    sharedEmail:

      profile.quickShareEnabled && profile.shareEmailEnabled

        ? String(profile.email || "").trim() || null

        : null,

    sharedWebsite:

      profile.quickShareEnabled && profile.shareWebsiteEnabled

        ? String(profile.website || "").trim() || null

        : null,

    sharedInstagram:

      profile.quickShareEnabled && profile.shareInstagramEnabled

        ? String(profile.instagram || "").trim() || null

        : null,

    sharedLinkedin:

      profile.quickShareEnabled && profile.shareLinkedinEnabled

        ? String(profile.linkedin || "").trim() || null

        : null,

    sharedTiktok:

      profile.quickShareEnabled && profile.shareTiktokEnabled

        ? String(profile.tiktok || "").trim() || null

        : null,

    sharedTwitter:

      profile.quickShareEnabled && profile.shareTwitterEnabled

        ? String(profile.twitter || "").trim() || null

        : null,

    sharedFacebook:

      profile.quickShareEnabled && profile.shareFacebookEnabled

        ? String(profile.facebook || "").trim() || null

        : null,

    sharedYoutube:

      profile.quickShareEnabled && profile.shareYoutubeEnabled

        ? String(profile.youtube || "").trim() || null

        : null,

    sharedGithub:

      profile.quickShareEnabled && profile.shareGithubEnabled

        ? String(profile.github || "").trim() || null

        : null,

    sharedSnapchat:

      profile.quickShareEnabled && profile.shareSnapchatEnabled

        ? String(profile.snapchat || "").trim() || null

        : null,

    sharedWhatsapp:

      profile.quickShareEnabled && profile.shareWhatsappEnabled

        ? String(profile.whatsapp || "").trim() || null

        : null,

    sharedTelegram:

      profile.quickShareEnabled && profile.shareTelegramEnabled

        ? String(profile.telegram || "").trim() || null

        : null,

  };

}



function hasSharedSomething(shared) {

  return Object.values(shared).some(Boolean);

}



function socialLabel(platform) {

  switch (platform) {

    case "Instagram":

      return "Follow on Instagram";

    case "LinkedIn":

      return "Connect on LinkedIn";

    case "TikTok":

      return "Follow on TikTok";

    case "X (Twitter)":

      return "Follow on X";

    case "Facebook":

      return "Follow on Facebook";

    case "YouTube":

      return "Subscribe on YouTube";

    case "GitHub":

      return "View GitHub";

    case "Snapchat":

      return "Add on Snapchat";

    case "WhatsApp":

      return "Chat on WhatsApp";

    case "Telegram":

      return "Message on Telegram";

    case "Website":

      return "Visit Website";

    default:

      return platform;

  }

}



function buildConnectionActions(connection) {

  const actions = [];



  if (connection.sharedPhone) {

    actions.push({ label: "Call", url: `tel:${String(connection.sharedPhone).trim()}` });

  }

  if (connection.sharedInstagram) {

    actions.push({

      label: "Follow on Instagram",

      url: `https://instagram.com/${stripAt(connection.sharedInstagram)}`,

    });

  }

  if (connection.sharedLinkedin) {

    actions.push({ label: "Connect on LinkedIn", url: safeUrl(connection.sharedLinkedin) });

  }

  if (connection.sharedTiktok) {

    actions.push({

      label: "Follow on TikTok",

      url: `https://www.tiktok.com/@${stripAt(connection.sharedTiktok)}`,

    });

  }

  if (connection.sharedTwitter) {

    actions.push({ label: "Follow on X", url: `https://x.com/${stripAt(connection.sharedTwitter)}` });

  }

  if (connection.sharedFacebook) {

    actions.push({

      label: "Follow on Facebook",

      url: `https://facebook.com/${stripAt(connection.sharedFacebook)}`,

    });

  }

  if (connection.sharedYoutube) {

    actions.push({

      label: "Subscribe on YouTube",

      url: `https://youtube.com/@${stripAt(connection.sharedYoutube)}`,

    });

  }

  if (connection.sharedGithub) {

    actions.push({ label: "View GitHub", url: `https://github.com/${stripAt(connection.sharedGithub)}` });

  }

  if (connection.sharedSnapchat) {

    actions.push({

      label: "Add on Snapchat",

      url: `https://www.snapchat.com/add/${stripAt(connection.sharedSnapchat)}`,

    });

  }

  if (connection.sharedWhatsapp) {

    actions.push({

      label: "Chat on WhatsApp",

      url: `https://wa.me/${String(connection.sharedWhatsapp).replace(/[^\d]/g, "")}`,

    });

  }

  if (connection.sharedTelegram) {

    actions.push({ label: "Message on Telegram", url: `https://t.me/${stripAt(connection.sharedTelegram)}` });

  }

  if (connection.sharedWebsite) {

    actions.push({ label: "Visit Website", url: safeUrl(connection.sharedWebsite) });

  }

  if (connection.sharedEmail) {

    actions.push({ label: "Email", url: `mailto:${String(connection.sharedEmail).trim()}` });

  }



  return actions;

}



function backUrl(req, fallback = "/") {

  const ref = String(req.get("referer") || "").trim();

  if (!ref) return fallback;

  try {

    const u = new URL(ref);

    return `${u.pathname}${u.search || ""}`;

  } catch {

    return fallback;

  }

}



function ownerKeyQuery(req, profile) {

  const key = String(req.query?.key || req.body?.key || "").trim();

  if (key && key === String(profile.editSecret || "").trim()) {

    return `?key=${encodeURIComponent(key)}`;

  }

  return "";

}



function currentProfileNoticeHtml(profile) {

  if (!profile) {

    return `<div class="mini" style="margin-top:8px;">No Tapzy account signed in yet.</div>`;

  }

  return `<div class="mini" style="margin-top:8px;">Signed in as @${escapeHtml(profile.username || "user")}</div>`;

}



function hasOwnerAccess(profile, req) {

  const key = String(req.query?.key || req.body?.key || "").trim();

  if (key && key === String(profile.editSecret || "").trim()) return true;

  if (req.currentProfile && req.currentProfile.id === profile.id) return true;

  return false;

}



function requireOwnerAccess(profile, req, res) {

  if (hasOwnerAccess(profile, req)) return true;



  res.status(403).send(`

  <html>

  <head>

    <title>Access denied</title>

    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />

    <script>
      (function(){
        var lastTouchEnd = 0;
        function stopZoom(event){ if(event && event.preventDefault) event.preventDefault(); }
        document.addEventListener('gesturestart', stopZoom, { passive:false });
        document.addEventListener('gesturechange', stopZoom, { passive:false });
        document.addEventListener('gestureend', stopZoom, { passive:false });
        document.addEventListener('touchend', function(event){
          var now = Date.now();
          if (now - lastTouchEnd <= 300) stopZoom(event);
          lastTouchEnd = now;
        }, { passive:false });
        document.addEventListener('wheel', function(event){ if(event.ctrlKey) stopZoom(event); }, { passive:false });
      })();
    </script>

    <style>

      body{font-family:Arial,sans-serif;background:#050505;color:#fff;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}

      .card{max-width:520px;width:100%;background:#111;border:1px solid #242424;border-radius:24px;padding:24px;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,.45)}

      .muted{color:#bdbdbd;margin-top:10px;line-height:1.6}

      .btn{display:inline-block;margin-top:18px;padding:12px 16px;border-radius:14px;background:#fff;color:#000;text-decoration:none;font-weight:800}

    </style>

  </head>

  <body>

    <div class="card">

      <h2 style="margin:0;">Owner access required</h2>

      <div class="muted">Sign in to your Tapzy account or use your secure owner link.</div>

      <a class="btn" href="/auth">Sign in</a>

    </div>

  </body>

  </html>

  `);

  return false;

}



function navLink(label, href, isActive = false) {

  return `<a class="tz-nav-tile${isActive ? " active" : ""}" href="${href}">${label}</a>`;

}



function renderTopBar({ currentProfile = null, pageTitle = "Tapzy Network™", pageType = "general" } = {}) {

  const username = currentProfile?.username || "";

  const signedIn = !!currentProfile;



  const links = [

    { key: "home", label: "Home", href: "/" },
    
    { key: "discovery", label: "Discovery", href: signedIn ? `/discovery/${username}?tab=search` : "/auth" },

    { key: "messages-list", label: "Messages", href: signedIn ? "/messages" : "/auth" },

    { key: "profile", label: "My Profile", href: signedIn ? `/u/${username}` : "/auth" },

    { key: "edit", label: "Edit Profile", href: signedIn ? `/edit/${username}` : "/auth" },
   
    { key: "events", label: "Events", href: "/events" },

    { key: "stories", label: "Stories", href: "/stories/feed" },

    { key: "settings", label: "Settings", href: signedIn ? "/settings" : "/auth" },

    { key: "admin", label: "Admin", href: "/admin" },

  ];



  return `

  <header class="tz-topbar">

    <div class="tz-topbar-inner">

      <button class="tz-brand tz-ai-trigger" type="button" data-tapzy-ai-open aria-label="Ask Tapzy">

        <span class="tz-brand-mark"><img src="/images/tapzy-mark-white.png" alt="" aria-hidden="true" decoding="async" /></span>

        <span class="tz-brand-word">Tapzy <span class="tz-brand-network">Network™</span></span>

      </button>



      <div class="tz-topbar-right">

        <div class="tz-page-chip">${escapeHtml(pageTitle)}</div>



        <button class="tz-menu-btn" id="tzMenuBtn" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="tzMenuPanel">

          <span></span><span></span><span></span>

        </button>

      </div>

    </div>

  </header>



  <div class="tz-menu-overlay" id="tzMenuOverlay"></div>



  <div class="tz-menu-panel" id="tzMenuPanel" aria-hidden="true">

    <div class="tz-menu-panel-inner">

      <div class="tz-menu-head">

        <div>

          <div class="tz-menu-title">Navigation</div>

          <div class="tz-menu-subtitle">Tapzy Network Control Center</div>

        </div>



        <button class="tz-menu-close" id="tzMenuClose" type="button" aria-label="Close navigation">&times;</button>

      </div>



      <div class="tz-menu-grid">

        ${links.map((l) => navLink(l.label, l.href, l.key === pageType)).join("")}

      </div>



      <div class="tz-menu-divider"></div>



      <div class="tz-menu-footer">

        ${

          signedIn

            ? `

              <div class="tz-menu-user">Signed in as @${escapeHtml(username)}</div>

              <a class="tz-menu-secondary" href="/logout">Log out</a>

            `

            : `

              <div class="tz-menu-user">Not signed in</div>

              <a class="tz-menu-secondary" href="/auth">Sign in / Create account</a>

            `

        }

      </div>

    </div>

  </div>

  `;

}



function renderStoriesBottomNav({ currentProfile = null } = {}) {
  const profileHref = currentProfile?.username ? `/u/${escapeHtml(currentProfile.username)}` : "/auth";

  return `
  <nav class="tz-stories-bottom-nav" aria-label="Primary navigation">
    <a class="tz-stories-bottom-link" href="/stories/feed">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8v10h-6v-7H9v7H3V11Z"></path></svg>
      <span>Home</span>
    </a>
    <a class="tz-stories-bottom-create" href="/stories" aria-label="Create story">+</a>
    <a class="tz-stories-bottom-link" href="${profileHref}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 22c0-5 3-8 8-8s8 3 8 8"></path></svg>
      <span>Profile</span>
    </a>
  </nav>
  `;
}

function renderStoriesTopNav({ currentProfile = null, active = "discover" } = {}) {
  const username = currentProfile?.username ? escapeHtml(currentProfile.username) : "";
  const searchHref = username ? `/discovery/${username}?tab=search` : "/auth";
  const activeKey = String(active || "").toLowerCase();

  return `
  <header class="tz-story-top-nav" data-story-ambient-nav>
    <canvas class="tz-story-ambient-canvas" width="24" height="8" aria-hidden="true"></canvas>
    <span class="tz-story-ambient-frost" aria-hidden="true"></span>
    <button class="tz-story-brand tz-ai-trigger" type="button" data-tapzy-ai-open aria-label="Ask Tapzy">
      <img src="/images/tapzy-mark-white.png" alt="" aria-hidden="true" decoding="async" />
    </button>
    <nav class="tz-story-tabs" aria-label="Primary sections">
      <a class="tz-story-tab${activeKey === "events" ? " is-active" : ""}" href="/events">Events</a>
      <a class="tz-story-tab${activeKey === "following" ? " is-active" : ""}" href="/stories/feed?filter=following">Following</a>
      <a class="tz-story-tab${activeKey === "discover" ? " is-active" : ""}" href="/stories/feed">Discover</a>
      <a class="tz-story-tab${activeKey === "messages" ? " is-active" : ""}" href="/messages">Messages</a>
    </nav>
    <a class="tz-story-search" href="${searchHref}" aria-label="Search Tapzy">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m16.5 16.5 4 4"></path></svg>
    </a>
  </header>
  `;
}

function renderStoriesTopNavCss() {
  return `
.tz-story-top-nav{position:fixed;z-index:60;top:0;left:0;right:0;min-height:72px;display:flex;align-items:center;justify-content:center;gap:26px;padding:calc(env(safe-area-inset-top, 0px) + 18px) 58px 16px;background:linear-gradient(180deg,rgba(0,0,0,.82),rgba(0,0,0,.56),rgba(0,0,0,.08));isolation:isolate;overflow:hidden}
.tz-story-ambient-canvas{position:absolute;inset:-18px -18px -10px;width:calc(100% + 36px);height:calc(100% + 28px);opacity:0;filter:blur(18px) saturate(1.22) brightness(.95);transform:scale(1.08);transform-origin:center top;transition:opacity .38s ease;pointer-events:none;z-index:0}
.tz-story-top-nav.has-video-ambient .tz-story-ambient-canvas{opacity:.72}
.tz-story-ambient-frost{position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.52),rgba(1,5,13,.31) 52%,rgba(0,0,0,.08));box-shadow:inset 0 -1px 0 rgba(255,255,255,.07)}
.tz-story-brand{position:absolute;z-index:2;left:16px;top:calc(env(safe-area-inset-top, 0px) + 16px);width:38px;height:38px;display:grid;place-items:center;border:2px solid rgba(255,255,255,.9);border-radius:12px;color:#fff;text-decoration:none;background:rgba(3,6,12,.24);box-shadow:0 10px 26px rgba(0,0,0,.22);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.tz-story-brand::before,.tz-story-brand::after{content:"";position:absolute;inset:-7px;border-radius:inherit;border:1px solid rgba(82,166,255,.46);box-shadow:0 0 22px rgba(47,118,255,.26);animation:tzStoryBrandPulse 2.4s ease-out infinite;pointer-events:none}.tz-story-brand::after{inset:-13px;animation-delay:.8s;opacity:.45}
.tz-story-brand img{position:relative;z-index:1;width:72%;height:72%;object-fit:contain;display:block}
.tz-story-tabs{position:relative;z-index:2;display:flex;gap:18px;align-items:center;min-width:0}
@keyframes tzStoryBrandPulse{0%{transform:scale(.88);opacity:.82}72%{transform:scale(1.16);opacity:.12}100%{transform:scale(1.2);opacity:0}}
.tz-story-tab{position:relative;border:0;background:none;padding:8px 0;color:rgba(255,255,255,.68);font-weight:750;font-size:15px;text-decoration:none;white-space:nowrap}
.tz-story-tab.is-active{color:#fff}
.tz-story-tab.is-active::after{content:"";position:absolute;left:50%;bottom:-5px;width:26px;height:3px;border-radius:5px;background:#fff;transform:translateX(-50%)}
.tz-story-search{position:absolute;z-index:2;right:4px;top:calc(env(safe-area-inset-top, 0px) + 8px);display:grid;place-items:center;width:56px;height:56px;padding:13px;color:#fff;text-decoration:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.tz-story-search svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
@media(max-width:430px){.tz-story-top-nav{min-height:66px;gap:12px;padding:calc(env(safe-area-inset-top, 0px) + 15px) 50px 14px}.tz-story-brand{left:14px;top:calc(env(safe-area-inset-top, 0px) + 14px);width:36px;height:36px;border-radius:12px}.tz-story-tabs{gap:12px}.tz-story-tab{font-size:13px;font-weight:800;padding:7px 0}.tz-story-tab.is-active::after{bottom:-4px;width:24px;height:3px}.tz-story-search{right:2px;top:calc(env(safe-area-inset-top, 0px) + 7px);width:54px;height:54px;padding:12px}}
@media(max-width:360px){.tz-story-top-nav{gap:5px;padding-left:36px;padding-right:34px}.tz-story-brand{width:30px;height:30px;border-width:2px}.tz-story-tabs{gap:5px}.tz-story-tab{font-size:10px}.tz-story-search{right:0;width:50px;height:50px;padding:12px}}
@media(max-width:320px){.tz-story-top-nav{gap:4px;padding-left:32px;padding-right:30px}.tz-story-brand{left:6px;width:28px;height:28px;border-radius:9px}.tz-story-tabs{gap:4px}.tz-story-tab{font-size:9.4px}.tz-story-search{right:0;width:48px;height:48px;padding:12px}}
`;
}

function renderShell(title, body, extraHead = "", shellOptions = {}) {

  const currentProfile = shellOptions.currentProfile || null;

  const pageTitle = shellOptions.pageTitle || "Tapzy Network™";

  const pageType = shellOptions.pageType || "general";
  const showStoriesBottomNav = !!shellOptions.storiesBottomNav;
  const hideTopBar = shellOptions.hideTopBar === true;
  const bodyClass = String(shellOptions.bodyClass || "").trim();
  const storiesTopNavActive = shellOptions.storiesTopNavActive || "";

  const resolvedTitle = title || "Tapzy Network™ — Your Digital Identity";

  const resolvedDescription =

    shellOptions.metaDescription ||

    "Tapzy Network™ is your digital identity. Tap to connect instantly with a premium real-world networking experience.";

  const assistantHtml = shellOptions.assistant === false || String(body || "").includes("data-tapzy-assistant")

    ? ""

    : renderTapzyAssistant({

        username: currentProfile?.username || "User",

        pageType,

        isAuthPage: pageType === "auth",

      });



  return `

  <html>

  <head>

    <title>${escapeHtml(resolvedTitle)}</title>

    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />

    <script>
      (function(){
        var lastTouchEnd = 0;
        function stopZoom(event){ if(event && event.preventDefault) event.preventDefault(); }
        document.addEventListener('gesturestart', stopZoom, { passive:false });
        document.addEventListener('gesturechange', stopZoom, { passive:false });
        document.addEventListener('gestureend', stopZoom, { passive:false });
        document.addEventListener('touchend', function(event){
          var now = Date.now();
          if (now - lastTouchEnd <= 300) stopZoom(event);
          lastTouchEnd = now;
        }, { passive:false });
        document.addEventListener('wheel', function(event){ if(event.ctrlKey) stopZoom(event); }, { passive:false });
      })();
    </script>

    <meta name="description" content="${escapeHtml(resolvedDescription)}" />

    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />

    <meta property="og:title" content="${escapeHtml(resolvedTitle)}" />

    <meta property="og:description" content="${escapeHtml(resolvedDescription)}" />

    <meta property="og:type" content="website" />

    <meta name="twitter:card" content="summary_large_image" />

    <meta name="twitter:title" content="${escapeHtml(resolvedTitle)}" />

    <meta name="twitter:description" content="${escapeHtml(resolvedDescription)}" />

    <script>
      (function(){
        try {
          var root = document.documentElement;
          root.setAttribute("data-tapzy-compact", localStorage.getItem("tapzy_pref_compact") === "1" ? "1" : "0");
          root.setAttribute("data-tapzy-reduce-motion", localStorage.getItem("tapzy_pref_reduce_motion") === "1" ? "1" : "0");
          root.setAttribute("data-tapzy-contrast", localStorage.getItem("tapzy_pref_contrast") === "1" ? "1" : "0");
        } catch (_) {}
      })();
    </script>

    <style data-tapzy-page-loader>
      html.tapzy-page-loading,
      html.tapzy-page-loading body{background:#000!important;overflow:hidden!important;overscroll-behavior:none!important;}
      html.tapzy-page-loading body>*{visibility:hidden!important;}
  html.tapzy-page-loading::before{content:"";position:fixed;inset:0;z-index:2147483644;background:radial-gradient(circle at 50% 38%,rgba(47,118,255,.34),rgba(47,118,255,0) 31%),radial-gradient(circle at 50% 47%,rgba(111,210,255,.16),rgba(111,210,255,0) 45%),linear-gradient(180deg,#06101f 0%,#02050b 48%,#000 100%);pointer-events:none;}
      html.tapzy-page-loading::after{content:"";position:fixed;left:50%;top:50%;z-index:2147483645;width:86px;height:86px;transform:translate(-50%,-50%);border-radius:26px;background:url('/images/tapzy-mark-white.png') center / 62% 62% no-repeat,linear-gradient(145deg,#2f7bff 0%,#1959e6 52%,#0d34a8 100%);box-shadow:0 24px 76px rgba(47,118,255,.46),0 0 44px rgba(111,210,255,.34),0 0 0 1px rgba(255,255,255,.22) inset;animation:tapzyPageLoaderPulse 1.45s ease-in-out infinite;pointer-events:none;}
      @keyframes tapzyPageLoaderPulse{0%,100%{opacity:.86;transform:translate(-50%,-50%) scale(.94);box-shadow:0 18px 58px rgba(47,118,255,.30),0 0 0 0 rgba(80,152,255,.36),0 0 0 1px rgba(255,255,255,.18) inset;}50%{opacity:1;transform:translate(-50%,-50%) scale(1.08);box-shadow:0 28px 92px rgba(47,118,255,.58),0 0 0 18px rgba(80,152,255,.08),0 0 0 1px rgba(255,255,255,.24) inset;}}
    </style>
    <script data-tapzy-page-loader>
      (function(){
        var root=document.documentElement;
        var minMs=600;
        var shownAt=Date.now();
        var hideTimer=null;
        var navigating=false;
        function showLoader(){shownAt=Date.now();if(hideTimer)window.clearTimeout(hideTimer);root.classList.add('tapzy-page-loading');root.classList.remove('tapzy-page-ready');}
        function hideLoader(){if(navigating)return;if(hideTimer)window.clearTimeout(hideTimer);var wait=Math.max(0,minMs-(Date.now()-shownAt));hideTimer=window.setTimeout(function(){root.classList.remove('tapzy-page-loading');root.classList.add('tapzy-page-ready');},wait);}
        function samePageHash(url){return url.pathname===location.pathname&&url.search===location.search&&url.hash;}
        window.__tapzyShowPageLoader=showLoader;window.__tapzyHidePageLoader=hideLoader;showLoader();
        if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){window.requestAnimationFrame(hideLoader);},{once:true});else window.requestAnimationFrame(hideLoader);
        window.addEventListener('load',hideLoader,{once:true});window.addEventListener('pageshow',function(){navigating=false;hideLoader();});window.addEventListener('beforeunload',showLoader);window.addEventListener('pagehide',showLoader);
        document.addEventListener('click',function(event){var link=event.target&&event.target.closest?event.target.closest('a[href]'):null;if(!link||event.defaultPrevented)return;if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;if(link.target&&link.target!=='_self')return;if(link.hasAttribute('download')||link.hasAttribute('data-no-page-loader'))return;var url;try{url=new URL(link.href,location.href);}catch(_){return;}if(url.origin!==location.origin||samePageHash(url))return;event.preventDefault();navigating=true;showLoader();window.setTimeout(function(){location.href=url.href;},minMs);},true);
        document.addEventListener('submit',function(event){var form=event.target;if(!form||form.hasAttribute('data-no-page-loader')||form.getAttribute('data-tapzy-loader-submitting')==='1')return;event.preventDefault();form.setAttribute('data-tapzy-loader-submitting','1');navigating=true;showLoader();window.setTimeout(function(){HTMLFormElement.prototype.submit.call(form);},minMs);},true);
      })();
    </script>

    ${extraHead}
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="preconnect" href="https://res.cloudinary.com" crossorigin />
    <link rel="dns-prefetch" href="//res.cloudinary.com" />
    <script defer src="/js/tapzy-performance.js?v=20260713-zoom-lock"></script>
    <script defer src="/js/tapzy-video-upload.js?v=20260712-video-compat"></script>

    <style>

      :root{

        --bg:#050505;

        --bg-soft:#0a0a0a;

        --panel:#0f0f10;

        --panel-2:#141416;

        --panel-3:#18181b;

        --border:#252528;

        --border-soft:#1f1f22;

        --text:#ffffff;

        --muted:#b8b8be;

        --muted-2:#8f8f98;

        --accent:#9fd8ff;

        --accent-2:#6ebdff;

        --brand-white:#f5fbff;

        --brand-blue:#7fd2ff;

        --accent-text:#04070a;

        --success:#b7f4ba;

        --success-bg:#112614;

        --success-border:#27502a;

        --radius:18px;

        --radius-lg:24px;

        --radius-xl:30px;

        --shadow:0 20px 60px rgba(0,0,0,.46);

        --shadow-soft:0 12px 32px rgba(0,0,0,.28);



        --tz-core-bg-1:rgba(10,13,20,.98);

        --tz-core-bg-2:rgba(6,8,12,1);

        --tz-core-panel-1:rgba(16,21,32,.96);

        --tz-core-panel-2:rgba(10,13,20,.99);

        --tz-core-soft:rgba(255,255,255,.02);

        --tz-core-soft-2:rgba(255,255,255,.03);

        --tz-core-border:rgba(140,198,255,.10);

        --tz-core-border-strong:rgba(145,203,255,.16);

        --tz-core-text:#ffffff;

        --tz-core-muted:#a7b0c0;

        --tz-core-muted-2:#94a1b6;

        --tz-core-blue-1:rgba(40,92,210,.92);

        --tz-core-blue-2:rgba(18,41,92,.98);

        --tz-core-glow-1:rgba(170,242,255,.09);

        --tz-core-glow-2:rgba(64,136,255,.09);

      }



      *{box-sizing:border-box}

      html,
      body,
      *{
        scrollbar-width:none!important;
        -ms-overflow-style:none!important;
      }

      html::-webkit-scrollbar,
      body::-webkit-scrollbar,
      *::-webkit-scrollbar{
        width:0!important;
        height:0!important;
        display:none!important;
        background:transparent!important;
      }


      html[data-tapzy-reduce-motion="1"] *,
      html[data-tapzy-reduce-motion="1"] *::before,
      html[data-tapzy-reduce-motion="1"] *::after{
        animation-duration:.001ms !important;
        animation-iteration-count:1 !important;
        scroll-behavior:auto !important;
        transition-duration:.001ms !important;
      }

      html[data-tapzy-contrast="1"]{
        --muted:#d5deea;
        --muted-2:#b7c5d8;
        --border:#3a536f;
        --border-soft:#2d425d;
      }

      html[data-tapzy-compact="1"] .wrap{
        padding-top:14px;
      }

      html[data-tapzy-compact="1"] .card,
      html[data-tapzy-compact="1"] .panel{
        border-radius:18px;
        padding:14px;
      }

      html{
        scroll-behavior:smooth;
        width:100%;
        max-width:100%;
        overflow-x:hidden;
      }

      body{

        font-family:Arial,sans-serif;

        background:

          radial-gradient(900px 520px at 50% -180px, rgba(120,205,255,.06), transparent 45%),

          radial-gradient(900px 600px at 100% 0%, rgba(255,255,255,.02), transparent 35%),

          linear-gradient(180deg,#050505 0%,#070707 34%,#090909 100%);

        color:var(--text);

        margin:0;

        min-height:100vh;
        width:100%;
        max-width:100%;
        overflow-x:hidden;
        position:relative;

      }



      a{color:inherit}

      img{max-width:100%}

      button,input,textarea,select{font:inherit}



      .tz-topbar{

        position:sticky;
        width:100%;
        max-width:100%;
        overflow-x:hidden;

        top:0;

        z-index:9000;

        backdrop-filter:blur(18px);

        background:rgba(3,5,10,.82);

        border-bottom:1px solid rgba(140,198,255,.08);

        box-shadow:0 8px 24px rgba(0,0,0,.22);

      }



      .tz-topbar-inner{

        max-width:1180px;
        width:100%;

        margin:0 auto;

        padding:12px 16px;

        display:flex;

        align-items:center;

        justify-content:space-between;

        gap:14px;

      }



      .tz-brand{

        display:flex;

        align-items:center;

        gap:12px;

        text-decoration:none;

        min-width:0;

      }



      .tz-brand-word{

        font-size:24px;

        font-weight:800;

        letter-spacing:.3px;

        color:#eef9ff;

        text-shadow:0 0 18px rgba(120,205,255,.08);

      }



      .tz-brand-network{

        font-weight:400;

        opacity:.82;

        margin-left:4px;

      }



      .tz-topbar-right{

        display:flex;

        align-items:center;

        gap:10px;

      }



      .tz-page-chip{

        padding:10px 14px;

        border-radius:999px;

        background:rgba(255,255,255,.03);

        border:1px solid rgba(255,255,255,.07);

        color:var(--muted);

        font-size:12px;

        letter-spacing:.7px;

        text-transform:uppercase;

        white-space:nowrap;

      }



      .tz-menu-btn{

        width:52px;

        height:52px;

        border-radius:18px;

        border:1px solid rgba(140,198,255,.12);

        background:linear-gradient(180deg, rgba(18,21,31,.96), rgba(10,12,18,.98));

        cursor:pointer;

        display:flex;

        flex-direction:column;

        align-items:center;

        justify-content:center;

        gap:4px;

        box-shadow:

          0 12px 28px rgba(0,0,0,.28),

          inset 0 1px 0 rgba(255,255,255,.03);

      }



      .tz-menu-btn span{

        width:18px;

        height:2px;

        border-radius:999px;

        background:#fff;

        opacity:.92;

        transition:transform .2s ease, opacity .2s ease;

      }



      .tz-menu-btn.open span:nth-child(1){transform:translateY(6px) rotate(45deg)}

      .tz-menu-btn.open span:nth-child(2){opacity:0}

      .tz-menu-btn.open span:nth-child(3){transform:translateY(-6px) rotate(-45deg)}



      .tz-menu-overlay{

        position:fixed;

        inset:0;

        background:rgba(0,0,0,.26);

        backdrop-filter:blur(5px);

        opacity:0;

        pointer-events:none;

        transition:opacity .26s ease;

        z-index:9050;

      }



      .tz-menu-overlay.open{

        opacity:1;

        pointer-events:auto;

      }



      .tz-menu-panel{

        position:fixed;

        top:0;

        left:50%;

        transform:translate(-50%, -110%);

        width:min(1100px, calc(100vw - 24px));

        max-height:min(94dvh, 860px);

        overflow:auto;

        -webkit-overflow-scrolling:touch;

        background:rgba(8,10,16,.97);

        border:1px solid rgba(140,198,255,.10);

        border-top:none;

        border-radius:0 0 28px 28px;

        box-shadow:0 24px 64px rgba(0,0,0,.52);

        transition:transform .36s cubic-bezier(.22,.8,.25,1);

        z-index:9100;

      }



      .tz-menu-panel.open{

        transform:translate(-50%, 0);

      }



      .tz-menu-panel-inner{

        padding:18px;

        min-height:100%;

        display:flex;

        flex-direction:column;

      }



      .tz-menu-head{

        display:flex;

        align-items:flex-start;

        justify-content:space-between;

        gap:12px;

        margin-bottom:14px;

      }



      .tz-menu-title{

        color:#fff;

        font-weight:800;

        font-size:13px;

        letter-spacing:1px;

        text-transform:uppercase;

      }



      .tz-menu-subtitle{

        margin-top:6px;

        color:#8f98a8;

        font-size:12px;

      }



      .tz-menu-close{

        width:38px;

        height:38px;

        border-radius:14px;

        border:1px solid rgba(255,255,255,.08);

        background:rgba(255,255,255,.03);

        color:#fff;

        cursor:pointer;

        font-size:22px;

        line-height:1;

        flex:0 0 auto;

      }



      .tz-menu-grid{

        display:grid;

        grid-template-columns:repeat(3, minmax(0, 1fr));

        gap:14px 16px;

      }



      .tz-nav-tile{

        display:flex;

        align-items:center;

        justify-content:center;

        min-height:54px;

        padding:12px 13px;

        border-radius:18px;

        background:linear-gradient(180deg, rgba(20,24,34,.94), rgba(11,14,22,.98));

        border:1px solid rgba(140,198,255,.10);

        color:#f2f6ff;

        font-weight:700;

        font-size:16px;

        text-decoration:none;

        text-align:center;

        transition:.18s ease;

        box-shadow:inset 0 1px 0 rgba(255,255,255,.02);

      }



      .tz-nav-tile:hover{

        transform:translateY(-2px);

        border-color:rgba(127,210,255,.28);

        background:linear-gradient(180deg,#23262e,#15171d);

      }



      .tz-nav-tile.active{

        background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,.05));

        border-color:rgba(127,210,255,.35);

        box-shadow:inset 0 0 0 1px rgba(127,210,255,.08);

      }



      .tz-menu-footer{

        margin-top:16px;

        padding-top:14px;

        padding-bottom:calc(8px + env(safe-area-inset-bottom));

        display:flex;

        align-items:center;

        justify-content:space-between;

        gap:12px;

        flex-wrap:wrap;

        border-top:1px solid rgba(255,255,255,.07);

      }



      .tz-menu-user{

        color:var(--muted);

        font-size:12px;

      }



      .tz-menu-secondary{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:42px;

        padding:10px 14px;

        border-radius:14px;

        text-decoration:none;

        background:linear-gradient(180deg, #1a1a1d, #111114);

        color:#fff;

        border:1px solid #2a2a30;

        font-weight:700;

      }



      .wrap{max-width:1180px;width:100%;margin:0 auto;padding:24px 16px 120px;overflow-x:hidden}

      .card{

        background:linear-gradient(180deg, rgba(18,18,20,.96), rgba(12,12,14,.98));

        border:1px solid var(--border);

        border-radius:var(--radius-xl);

        padding:20px;

        box-shadow:var(--shadow);

      }

      .card + .card{margin-top:16px}



      .panel{

        background:linear-gradient(180deg, rgba(24,24,27,.94), rgba(15,15,17,.98));

        border:1px solid var(--border-soft);

        border-radius:20px;

        padding:16px;

        box-shadow:inset 0 1px 0 rgba(255,255,255,.02);

      }

      .panel + .panel{margin-top:14px}



      h1,h2,h3{margin-top:0;letter-spacing:.1px}

      .muted{color:var(--muted);font-size:13px}

      .muted-2{color:var(--muted-2);font-size:13px}



      .grid{display:grid;gap:12px}

      .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}

      .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}

      .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}

      .row-between{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}



      .btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        text-decoration:none;

        text-align:center;

        min-height:46px;

        padding:0 16px;

        border-radius:16px;

        background:linear-gradient(180deg, #ffffff, #dff4ff);

        color:#000;

        font-weight:800;

        border:0;

        cursor:pointer;

        box-shadow:0 10px 24px rgba(0,0,0,.18);

      }



      .btnDark{

        background:linear-gradient(180deg, #1a1a1d, #111114);

        color:#fff;

        border:1px solid #2a2a30;

        box-shadow:none;

      }



      .btnFull{width:100%}



      input,textarea,select{

        width:100%;

        padding:13px 14px;

        border-radius:14px;

        border:1px solid var(--border);

        background:#0d0d0f;

        color:#fff;

        box-sizing:border-box;

        outline:none;

      }



      input:focus, textarea:focus, select:focus{

        border-color:rgba(127,210,255,.26);

        box-shadow:0 0 0 3px rgba(127,210,255,.07);

      }



      textarea{min-height:88px;resize:vertical}

      label{display:block;margin-top:12px;color:var(--muted);font-size:12px;letter-spacing:.2px}



      .success{

        background:var(--success-bg);

        border:1px solid var(--success-border);

        color:var(--success);

        padding:12px;

        border-radius:16px;

        margin-bottom:14px;

        font-weight:600;

      }



      .pill{

        display:inline-block;

        padding:7px 11px;

        border:1px solid var(--border);

        border-radius:999px;

        background:#111113;

        color:#d8d8de;

        font-size:12px;

      }



      .stat{

        background:linear-gradient(180deg, #151518, #101013);

        border:1px solid #25252b;

        border-radius:18px;

        padding:14px;

      }



      .statNum{font-size:22px;font-weight:800}

      .statLabel{font-size:12px;color:#9a9aa2;margin-top:4px}



      .divider{border-top:1px solid var(--border);margin-top:16px;padding-top:14px}



      .miniTag{

        display:inline-block;

        padding:6px 10px;

        border:1px solid var(--border);

        border-radius:999px;

        background:#101012;

        color:#d1d1d7;

        font-size:12px;

        margin-right:8px;

        margin-top:8px;

      }



      .avatar{

        width:88px;

        height:88px;

        border-radius:22px;

        border:1px solid var(--border);

        background:linear-gradient(180deg,#141418,#0c0c0f);

        overflow:hidden;

        display:flex;

        align-items:center;

        justify-content:center;

        color:#888;

        font-weight:800;

        flex:0 0 auto;

        box-shadow:0 12px 28px rgba(0,0,0,.28);

      }



      .avatar img{width:100%;height:100%;object-fit:cover}

      .authWrap{max-width:900px;margin:0 auto;padding:28px 16px 120px}

      details > summary{cursor:pointer}

      .mini{font-size:12px;color:var(--muted)}



      .tz-core-hero{

        position:relative;

        overflow:hidden;

        border-radius:32px;

        padding:24px;

        border:1px solid var(--tz-core-border);

        background:

          radial-gradient(900px 420px at 50% 0%, rgba(24,59,93,.30), transparent 45%),

          linear-gradient(180deg, var(--tz-core-bg-1), var(--tz-core-bg-2));

        box-shadow:

          0 24px 70px rgba(0,0,0,.56),

          inset 0 1px 0 rgba(255,255,255,.03),

          inset 0 0 0 1px rgba(120,200,255,.02);

      }



      .tz-core-hero-glow{

        position:absolute;

        border-radius:999px;

        pointer-events:none;

        filter:blur(28px);

      }



      .tz-core-hero-glow-a{

        width:220px;

        height:220px;

        right:-30px;

        top:-40px;

        background:radial-gradient(circle, var(--tz-core-glow-1) 0%, rgba(170,242,255,.03) 40%, transparent 72%);

      }



      .tz-core-hero-glow-b{

        width:190px;

        height:190px;

        left:60px;

        bottom:-56px;

        background:radial-gradient(circle, var(--tz-core-glow-2) 0%, rgba(64,136,255,.03) 40%, transparent 75%);

      }



      .tz-core-hero-top{

        position:relative;

        z-index:2;

        display:flex;

        align-items:flex-start;

        justify-content:space-between;

        gap:18px;

        flex-wrap:wrap;

      }



      .tz-core-kicker{

        color:#aeb9cf;

        font-size:12px;

        letter-spacing:6px;

        text-transform:uppercase;

        margin-bottom:12px;

      }



      .tz-core-title{

        margin:0;

        font-size:48px;

        line-height:1;

        letter-spacing:-1.4px;

        font-weight:900;

        color:var(--tz-core-text);

      }



      .tz-core-subtitle{

        margin-top:10px;

        color:var(--tz-core-muted);

        font-size:17px;

        line-height:1.65;

        max-width:720px;

      }



      .tz-core-actions{

        display:flex;

        gap:10px;

        flex-wrap:wrap;

      }



      .tz-core-section{

        border-radius:28px;

        padding:18px;

        border:1px solid rgba(140,198,255,.08);

        background:

          radial-gradient(520px 220px at 70% 12%, rgba(95,182,255,.10), transparent 40%),

          linear-gradient(180deg, var(--tz-core-panel-1), var(--tz-core-panel-2));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.03),

          0 16px 34px rgba(0,0,0,.20);

      }



      .tz-core-section + .tz-core-section{margin-top:16px}



      .tz-core-section-head{margin-bottom:14px}



      .tz-core-section-head h2,

      .tz-core-section-head h3{

        margin:0;

        color:#fff;

        font-size:22px;

        font-weight:900;

        letter-spacing:-.4px;

      }



      .tz-core-section-head p{

        margin:6px 0 0;

        color:var(--tz-core-muted-2);

        font-size:13px;

        line-height:1.6;

      }



      .tz-core-card{

        border-radius:24px;

        border:1px solid rgba(255,255,255,.07);

        background:

          radial-gradient(420px 180px at 68% 20%, rgba(90,165,255,.08), transparent 42%),

          linear-gradient(180deg, rgba(22,24,32,.92), rgba(12,14,20,.98));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.03),

          0 14px 28px rgba(0,0,0,.18);

        padding:18px;

      }



      .tz-core-card-soft{

        border-radius:20px;

        border:1px solid rgba(255,255,255,.06);

        background:var(--tz-core-soft);

        padding:16px;

      }



      .tz-core-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:46px;

        padding:0 18px;

        border:none;

        border-radius:16px;

        text-decoration:none;

        cursor:pointer;

        font-weight:800;

        font-size:14px;

        color:#fff;

        background:

          radial-gradient(circle at 50% 0%, rgba(150,230,255,.18), transparent 55%),

          linear-gradient(180deg, var(--tz-core-blue-1), var(--tz-core-blue-2));

        box-shadow:

          0 0 16px rgba(80,150,255,.16),

          inset 0 1px 0 rgba(255,255,255,.14);

      }



      .tz-core-btn:hover{transform:translateY(-1px)}



      .tz-core-btn-dark{

        background:linear-gradient(180deg, rgba(32,35,45,.94), rgba(14,16,23,.98));

        border:1px solid rgba(145,203,255,.12);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 8px 16px rgba(0,0,0,.16);

      }



      .tz-core-btn-full{width:100%}



      .tz-core-field{

        display:flex;

        flex-direction:column;

        gap:8px;

      }



      .tz-core-field label{

        margin:0;

        color:#b7c3d6;

        font-size:13px;

        font-weight:700;

        letter-spacing:.1px;

      }



      .tz-core-input,

      .tz-core-textarea,

      .tz-core-select{

        width:100%;

        padding:15px 16px;

        border-radius:20px;

        border:1px solid rgba(145,203,255,.10);

        background:linear-gradient(180deg, rgba(7,10,16,.98), rgba(4,6,10,1));

        color:#fff;

        outline:none;

        box-sizing:border-box;

        box-shadow:inset 0 1px 0 rgba(255,255,255,.02);

      }



      .tz-core-input:focus,

      .tz-core-textarea:focus,

      .tz-core-select:focus{

        border-color:rgba(127,210,255,.28);

        box-shadow:0 0 0 3px rgba(127,210,255,.07);

      }



      .tz-core-textarea{

        min-height:130px;

        resize:vertical;

      }



      .tz-core-upload{

        width:100%;

        padding:14px;

        border-radius:18px;

        border:1px solid rgba(145,203,255,.10);

        background:linear-gradient(180deg, rgba(7,10,16,.98), rgba(4,6,10,1));

        color:#fff;

        box-sizing:border-box;

      }



      .tz-core-pill{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:32px;

        padding:0 11px;

        border-radius:999px;

        border:1px solid rgba(255,255,255,.08);

        background:rgba(255,255,255,.04);

        color:#dbe6f5;

        font-size:12px;

        font-weight:700;

      }



      .tz-core-empty{

        border-radius:24px;

        border:1px solid rgba(255,255,255,.06);

        background:

          radial-gradient(420px 180px at 70% 10%, rgba(95,182,255,.08), transparent 42%),

          linear-gradient(180deg, rgba(18,22,30,.96), rgba(10,13,20,.99));

        padding:22px;

        text-align:left;

      }



      .tz-core-empty h3{

        margin:0;

        font-size:20px;

        font-weight:900;

        color:#fff;

      }



      .tz-core-empty p{

        margin:8px 0 0;

        color:#97a4b8;

        line-height:1.65;

        font-size:14px;

      }



      .tz-core-stat-grid{

        display:grid;

        grid-template-columns:repeat(3,minmax(0,1fr));

        gap:14px;

      }



      .tz-core-stat-card{

        border-radius:20px;

        padding:16px;

        border:1px solid rgba(255,255,255,.07);

        background:

          radial-gradient(220px 140px at 50% 0%, rgba(88,155,255,.07), transparent 60%),

          linear-gradient(180deg, rgba(20,24,34,.94), rgba(11,14,22,.98));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.03),

          0 10px 24px rgba(0,0,0,.14);

      }



      .tz-core-stat-label{

        color:#9fb0c9;

        font-size:12px;

      }



      .tz-core-stat-value{

        margin-top:8px;

        color:#fff;

        font-size:26px;

        font-weight:900;

        line-height:1;

      }



      .tz-core-toggle{

        display:flex;

        align-items:center;

        justify-content:space-between;

        gap:14px;

        padding:14px 16px;

        border-radius:18px;

        border:1px solid rgba(255,255,255,.06);

        background:rgba(255,255,255,.02);

        color:#fff;

        font-size:14px;

        font-weight:700;

      }



      .tz-core-toggle input[type="checkbox"]{

        appearance:none;

        -webkit-appearance:none;

        width:46px;

        height:28px;

        border-radius:999px;

        background:#20242d;

        border:1px solid rgba(255,255,255,.10);

        position:relative;

        cursor:pointer;

        box-shadow:inset 0 0 0 1px rgba(255,255,255,.02);

        transition:background .18s ease,border-color .18s ease;

        flex:0 0 auto;

      }



      .tz-core-toggle input[type="checkbox"]::after{

        content:"";

        position:absolute;

        top:3px;

        left:3px;

        width:20px;

        height:20px;

        border-radius:999px;

        background:#fff;

        box-shadow:0 4px 10px rgba(0,0,0,.22);

        transition:transform .18s ease;

      }



      .tz-core-toggle input[type="checkbox"]:checked{

        background:linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));

        border-color:rgba(145,203,255,.24);

      }



      .tz-core-toggle input[type="checkbox"]:checked::after{

        transform:translateX(18px);

      }



      .tz-core-check{

        display:flex;

        align-items:center;

        gap:10px;

        color:#dbe6f5;

        font-size:14px;

        font-weight:600;

      }



      .tz-core-check input[type="checkbox"]{

        width:18px;

        height:18px;

        flex:0 0 auto;

      }



      .tz-core-link-card{

        position:relative;

        overflow:hidden;

        display:flex;

        align-items:center;

        justify-content:space-between;

        gap:12px;

        text-decoration:none;

        padding:18px 20px;

        border-radius:22px;

        background:

          radial-gradient(420px 180px at 68% 20%, rgba(90,165,255,.10), transparent 42%),

          linear-gradient(180deg, rgba(22,24,32,.92), rgba(12,14,20,.98));

        border:1px solid rgba(140,200,255,.12);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.03),

          0 14px 28px rgba(0,0,0,.18);

        color:#ffffff;

        font-size:18px;

        font-weight:700;

        transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease;

      }



      .tz-core-link-card:hover{

        transform:translateY(-1px);

        border-color:rgba(150,220,255,.22);

      }



      .tz-stories-bottom-nav{

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

        background:#030303;

        border-top:1px solid rgba(255,255,255,.08);

      }



      .tz-stories-bottom-link{

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



      .tz-stories-bottom-link svg{

        width:25px;

        height:25px;

        fill:none;

        stroke:currentColor;

        stroke-width:2;

        stroke-linecap:round;

        stroke-linejoin:round;

      }



      .tz-stories-bottom-create{

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



      .tz-stories-bottom-create:active{

        transform:translateY(1px) scale(.985);

      }



      ${renderStoriesTopNavCss()}

      body.tz-has-stories-top-nav > .tz-topbar{

        display:none !important;

      }

      @media(max-width:430px){
        .tz-story-top-nav{
          min-height:66px;
          gap:12px;
          padding:calc(env(safe-area-inset-top, 0px) + 15px) 50px 14px;
        }

        .tz-story-brand{
          left:14px;
          top:calc(env(safe-area-inset-top, 0px) + 14px);
          width:36px;
          height:36px;
          border-radius:12px;
        }

        .tz-story-tabs{
          gap:12px;
        }

        .tz-story-tab{
          font-size:13px;
          font-weight:800;
          padding:7px 0;
        }

        .tz-story-tab.is-active::after{
          bottom:-4px;
          width:24px;
          height:3px;
        }

        .tz-story-search{
          right:2px;
          top:calc(env(safe-area-inset-top, 0px) + 7px);
          width:54px;
          height:54px;
          padding:12px;
        }
      }

      @media(max-width:360px){
        .tz-story-top-nav{
          gap:5px;
          padding-left:36px;
          padding-right:34px;
        }

        .tz-story-brand{
          width:30px;
          height:30px;
          border-width:2px;
        }

        .tz-story-tabs{
          gap:5px;
        }

        .tz-story-tab{
          font-size:10px;
        }

        .tz-story-search{
          right:0;
          width:50px;
          height:50px;
          padding:12px;
        }
      }

      @media(max-width:320px){
        .tz-story-top-nav{
          gap:4px;
          padding-left:32px;
          padding-right:30px;
        }

        .tz-story-brand{
          left:6px;
          width:28px;
          height:28px;
          border-radius:9px;
        }

        .tz-story-tabs{
          gap:4px;
        }

        .tz-story-tab{
          font-size:9.4px;
        }

        .tz-story-search{
          right:0;
          width:48px;
          height:48px;
          padding:12px;
        }
      }



      body.tz-has-stories-top-nav{

        background:#000;

      }



      /* tz-story-content-offset: keep shared fixed header from covering page content */
      body.tz-has-stories-top-nav:not(.events-story-shell) > .wrap,
      body.tz-has-stories-top-nav:not(.events-story-shell) > .container,
      body.tz-has-stories-top-nav:not(.events-story-shell) > main{
        padding-top:calc(env(safe-area-inset-top, 0px) + 92px);
      }

      @media(max-width:430px){
        body.tz-has-stories-top-nav:not(.events-story-shell) > .wrap,
        body.tz-has-stories-top-nav:not(.events-story-shell) > .container,
        body.tz-has-stories-top-nav:not(.events-story-shell) > main{
          padding-top:calc(env(safe-area-inset-top, 0px) + 84px);
        }
      }

      body.tz-has-stories-bottom-nav .wrap,
      body.tz-has-stories-bottom-nav .container,
      body.tz-has-stories-bottom-nav main{

        padding-bottom:calc(84px + env(safe-area-inset-bottom, 0px));

      }



      .tz-core-arrow{

        color:#8ea1bd;

        font-size:24px;

        line-height:1;

        flex:0 0 auto;

      }



      @media(max-width:900px){

        .grid-3{grid-template-columns:1fr}

        .tz-core-stat-grid{grid-template-columns:1fr}

      }



      @media(max-width:700px){

        .tz-topbar-inner{padding:10px 12px}

        .tz-brand-word{font-size:22px}

        .tz-page-chip{display:none}

        .tz-menu-panel{

          width:calc(100vw - 12px);

          max-height:94dvh;

          border-radius:0 0 22px 22px;

        }

        .tz-menu-panel-inner{padding:14px}

        .tz-menu-grid{

          grid-template-columns:repeat(3, minmax(0, 1fr));

          gap:10px;

        }

        .tz-nav-tile{

          min-height:46px;

          padding:10px 8px;

          border-radius:14px;

          font-size:12px;

          line-height:1.15;

        }

        .wrap{width:100%;max-width:100%;padding:18px 12px 120px;overflow-x:hidden}

        .card{padding:16px;border-radius:22px}

        .panel{padding:14px;border-radius:18px}

        .grid-2,.grid-3{grid-template-columns:1fr}

        .avatar{width:76px;height:76px;border-radius:20px}



        .tz-core-hero{

          padding:20px 16px;

          border-radius:26px;

        }



        .tz-core-kicker{

          font-size:11px;

          letter-spacing:5px;

        }



        .tz-core-title{

          font-size:34px;

        }



        .tz-core-subtitle{

          font-size:15px;

          line-height:1.6;

        }



        .tz-core-section{

          padding:16px;

          border-radius:22px;

        }



        .tz-core-link-card{

          font-size:16px;

          padding:16px 18px;

          border-radius:18px;

        }

      }

    </style>

  </head>

  <body class="${[showStoriesBottomNav ? "tz-has-stories-bottom-nav" : "", storiesTopNavActive ? "tz-has-stories-top-nav" : "", escapeHtml(bodyClass)].filter(Boolean).join(" ")}">

    ${hideTopBar ? "" : renderTopBar({ currentProfile, pageTitle, pageType })}

    ${storiesTopNavActive ? renderStoriesTopNav({ currentProfile, active: storiesTopNavActive }) : ""}

    ${body}

    ${assistantHtml}

    ${showStoriesBottomNav ? renderStoriesBottomNav({ currentProfile }) : ""}



    <script>

      (function(){

        const btn = document.getElementById("tzMenuBtn");

        const panel = document.getElementById("tzMenuPanel");

        const overlay = document.getElementById("tzMenuOverlay");

        const closeBtn = document.getElementById("tzMenuClose");



        if (!btn || !panel || !overlay || !closeBtn) return;



        function openMenu() {

          panel.classList.add("open");

          overlay.classList.add("open");

          btn.classList.add("open");

          btn.setAttribute("aria-expanded", "true");

          panel.setAttribute("aria-hidden", "false");

          document.body.style.overflow = "hidden";

        }



        function closeMenu() {

          panel.classList.remove("open");

          overlay.classList.remove("open");

          btn.classList.remove("open");

          btn.setAttribute("aria-expanded", "false");

          panel.setAttribute("aria-hidden", "true");

          document.body.style.overflow = "";

        }



        btn.addEventListener("click", function(){

          if (panel.classList.contains("open")) closeMenu();

          else openMenu();

        });



        closeBtn.addEventListener("click", closeMenu);

        overlay.addEventListener("click", closeMenu);



        document.addEventListener("keydown", function(e){

          if (e.key === "Escape") closeMenu();

        });



        panel.querySelectorAll("a").forEach(function(link){

          link.addEventListener("click", closeMenu);

        });

      })();

    </script>

  </body>

  </html>

  `;

}



async function createSessionForAccount(userAccountId, res) {

  const token = makeSessionToken();

  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);



  await prisma.userSession.create({

    data: { token, userAccountId, expiresAt },

  });



  res.cookie(SESSION_COOKIE, token, {

    httpOnly: true,

    sameSite: "lax",

    secure: IS_PROD,

    expires: expiresAt,

  });



  return token;

}



async function destroySession(req, res) {

  const token = String(req.cookies?.[SESSION_COOKIE] || "").trim();

  if (token) {

    await prisma.userSession.deleteMany({ where: { token } });

  }

  res.clearCookie(SESSION_COOKIE, {

    httpOnly: true,

    sameSite: "lax",

    secure: IS_PROD,

  });

}



async function createTapMoment({

  senderProfileId,

  receiverProfileId,

  note = null,

  eventName = null,

  location = null,

  latitude = null,

  longitude = null,

  snapshotUrl = null,

}) {

  try {

    return await prisma.tapMoment.create({

      data: {

        senderProfileId,

        receiverProfileId,

        note: note || null,

        eventName: eventName || null,

        location: location || null,

        latitude: latitude ?? null,

        longitude: longitude ?? null,

        snapshotUrl: snapshotUrl || null,

      },

    });

  } catch (e) {

    console.error("Tap moment create failed:", e);

    return null;

  }

}



async function sendAdminCodesEmail(createdCodes) {

  if (!resend || !createdCodes.length) return;



  const timestamp = formatPrettyLocal(new Date());

  const codeLines = createdCodes

    .map((c) => `${c.code} | token: ${c.publicToken} | created: ${formatPrettyLocal(c.createdAt)}`)

    .join("\n");

  const tapLines = createdCodes.map((c) => `${WEB_BASE}/a/${c.publicToken}`).join("\n");

  const activationLines = createdCodes

    .map((c) => `${WEB_BASE}/activate?token=${encodeURIComponent(c.publicToken)}`)

    .join("\n");



  await resend.emails.send({

    from: EMAIL_FROM,

    to: ADMIN_EMAIL,

    subject: `Tapzy activation codes generated (${createdCodes.length})`,

    text: [

      "Tapzy activation codes generated",

      "",

      `Time: ${timestamp}`,

      `Count: ${createdCodes.length}`,

      "",

      "Codes:",

      codeLines,

      "",

      "Tap links:",

      tapLines,

      "",

      "Activation links:",

      activationLines,

      "",

      `Admin: ${WEB_BASE}/admin`,

    ].join("\n"),

  });

}



async function sendActivationOwnerEmail(profile, activationRow) {

  if (!resend) return;



  const timestamp = formatPrettyLocal(new Date());



  await resend.emails.send({

    from: EMAIL_FROM,

    to: ADMIN_EMAIL,

    subject: `Tapzy profile activated: @${profile.username}`,

    text: [

      "A Tapzy profile was activated.",

      "",

      `Time: ${timestamp}`,

      `Username: ${profile.username}`,

      `Profile ID: ${profile.id}`,

      `Activation code: ${activationRow.code}`,

      `Public token: ${activationRow.publicToken}`,

      "",

      `Public profile: ${WEB_BASE}/u/${profile.username}`,

      `Secure edit URL: ${WEB_BASE}/edit/${profile.username}?key=${profile.editSecret || ""}`,

    ].join("\n"),

  });

}



async function getFollowState(viewerProfileId, targetProfileId) {

  if (!viewerProfileId || !targetProfileId || viewerProfileId === targetProfileId) {

    return { isFollowing: false };

  }



  const row = await prisma.follow.findUnique({

    where: {

      followerProfileId_followingProfileId: {

        followerProfileId: viewerProfileId,

        followingProfileId: targetProfileId,

      },

    },

  });



  return { isFollowing: !!row };

}



function renderFollowButton(currentProfile, targetProfile, isFollowing) {

  if (!currentProfile) return `<a class="btn btnDark" href="/auth">Sign in to Follow</a>`;

  if (!currentProfile.id || currentProfile.id === targetProfile.id) return "";



  if (isFollowing) {

    return `<form method="POST" action="/unfollow/${targetProfile.username}" style="margin:0;"><button class="btn btnFull" type="submit">Following ✓</button></form>`;

  }



  return `<form method="POST" action="/follow/${targetProfile.username}" style="margin:0;"><button class="btn btnFull" type="submit">Follow</button></form>`;

}



function renderMomentLikeButton(currentProfile, moment, isLiked, compact = false) {

  const count = moment?._count?.likes || 0;

  if (!moment?.id) return "";



  const label = isLiked ? `Liked ♥ ${count}` : `Like ♡ ${count}`;

  const cls = compact ? "btn btnDark" : "btn btnDark";



  if (!currentProfile) {

    return `<a class="${cls}" href="/auth">Sign in to like • ${count}</a>`;

  }



  if (isLiked) {

    return `<form method="POST" action="/moment-unlike/${moment.id}" style="margin:0;"><button class="${cls}" type="submit">${label}</button></form>`;

  }



  return `<form method="POST" action="/moment-like/${moment.id}" style="margin:0;"><button class="${cls}" type="submit">${label}</button></form>`;

}



async function getOrCreateConversationBetween(profileAId, profileBId) {

  const existing = await prisma.conversation.findFirst({

    where: {

      members: { some: { profileId: profileAId } },

      AND: [{ members: { some: { profileId: profileBId } } }],

    },

    include: { members: true },

    orderBy: { updatedAt: "desc" },

  });



  if (existing) {

    const ids = existing.members.map((m) => m.profileId);

    if (ids.includes(profileAId) && ids.includes(profileBId) && ids.length === 2) {

      return existing;

    }

  }



  return prisma.conversation.create({

    data: {

      members: {

        create: [{ profileId: profileAId }, { profileId: profileBId }],

      },

    },

    include: { members: true },

  });

}



function renderTapzyAssistant(options = {}) {
  const safeUsername = escapeHtml(options.username || "User");
  const safePageType = escapeHtml(options.pageType || "general");
  const isAuth = options.isAuthPage ? "true" : "false";
  return `\n<style data-tapzy-assistant>\n  .tz-ai-launch{display:none!important}\n  .tz-ai-launch span{display:none!important}\n  .tz-ai-trigger{appearance:none;-webkit-appearance:none;font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}.tz-brand.tz-ai-trigger{border:0;background:transparent;padding:0}.tz-story-brand.tz-ai-trigger{padding:0}\n  .tz-brand-mark{width:38px;height:38px;display:grid;place-items:center;border:2px solid rgba(255,255,255,.9);border-radius:12px;background:rgba(3,6,12,.24);box-shadow:0 10px 26px rgba(0,0,0,.22);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);flex:0 0 auto}\n  .tz-brand-mark img{width:72%;height:72%;object-fit:contain;display:block}\n  @keyframes tzAiPulse{0%,100%{box-shadow:0 16px 48px rgba(40,112,255,.32),0 0 0 0 rgba(92,166,255,.22),0 0 0 1px rgba(255,255,255,.16) inset;transform:scale(.98)}50%{box-shadow:0 22px 70px rgba(40,112,255,.58),0 0 0 14px rgba(92,166,255,.07),0 0 0 1px rgba(255,255,255,.22) inset;transform:scale(1.04)}}\n  .tz-ai-panel{position:fixed;left:12px;right:12px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:2147483001;max-width:520px;margin:0 auto;border:1px solid rgba(116,198,255,.24);border-radius:28px;background:radial-gradient(circle at 50% 0%,rgba(47,118,255,.28),transparent 38%),linear-gradient(180deg,rgba(7,15,29,.98),rgba(0,0,0,.98));box-shadow:0 28px 100px rgba(0,0,0,.72),0 0 44px rgba(55,137,255,.2);color:#fff;overflow:hidden;transform:translateY(18px) scale(.98);opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif}\n  .tz-ai-panel.is-open{opacity:1;pointer-events:auto;transform:translateY(0) scale(1)}\n  .tz-ai-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 16px 12px;border-bottom:1px solid rgba(255,255,255,.08)}\n  .tz-ai-title{display:flex;align-items:center;gap:10px;min-width:0;font-size:15px;font-weight:900}.tz-ai-title img{width:34px;height:34px;border-radius:12px;background:#1768f5;box-shadow:0 0 24px rgba(52,132,255,.45)}\n  .tz-ai-close{width:40px;height:40px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.05);color:#fff;font-size:24px;line-height:1;cursor:pointer}\n  .tz-ai-body{max-height:min(58vh,560px);overflow-x:hidden;overflow-y:auto;padding:14px 14px 10px;scrollbar-width:none}.tz-ai-body::-webkit-scrollbar{display:none}\n  .tz-ai-msg{max-width:88%;min-width:0;margin:0 0 10px;padding:12px 13px;border-radius:18px;font-size:14px;line-height:1.46;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}.tz-ai-msg.bot{width:fit-content;max-width:100%;background:rgba(255,255,255,.075);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.92)}.tz-ai-msg.user{margin-left:auto;background:linear-gradient(145deg,#2f7bff,#154fd8);box-shadow:0 12px 34px rgba(34,108,255,.24)}\n  .tz-ai-prompts{display:flex;gap:8px;overflow-x:auto;padding:0 14px 12px;scrollbar-width:none}.tz-ai-prompts::-webkit-scrollbar{display:none}.tz-ai-chip{flex:0 0 auto;border:1px solid rgba(137,205,255,.22);border-radius:999px;background:rgba(255,255,255,.06);color:#fff;padding:9px 11px;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap}\n  .tz-ai-form{display:flex;align-items:flex-end;gap:8px;padding:12px;border-top:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.28)}.tz-ai-input{flex:1;min-height:44px;max-height:100px;resize:none;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(255,255,255,.06);color:#fff;padding:12px;font:600 15px/1.25 Inter,system-ui,sans-serif;outline:none}.tz-ai-input::placeholder{color:rgba(255,255,255,.48)}\n  .tz-ai-send,.tz-ai-mic{width:44px;height:44px;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(255,255,255,.08);color:#fff;font-weight:900;cursor:pointer}.tz-ai-send{background:linear-gradient(145deg,#2f7bff,#164ed4)}.tz-ai-mic.is-listening{box-shadow:0 0 0 7px rgba(47,123,255,.16);border-color:rgba(115,198,255,.6)}\n  .tz-ai-status{padding:0 14px 12px;color:rgba(255,255,255,.55);font-size:12px;font-weight:700;min-height:14px}\n
  .tz-ai-panel.tz-ai-room{inset:0!important;left:0!important;right:0!important;bottom:0!important;max-width:none!important;width:100vw!important;height:100dvh!important;margin:0!important;border:0!important;border-radius:0!important;display:flex!important;flex-direction:column!important;background:radial-gradient(circle at 50% 34%,rgba(49,130,255,.18),transparent 32%),linear-gradient(180deg,#02050a,#000 72%)!important;box-shadow:none!important;transform:scale(1.015)!important;overflow:hidden!important;}
  .tz-ai-panel.tz-ai-room.is-open{transform:none!important;}
  .tz-ai-panel.tz-ai-room::before{content:"";position:absolute;inset:-20%;background:linear-gradient(rgba(123,199,255,.052) 1px,transparent 1px),linear-gradient(90deg,rgba(123,199,255,.042) 1px,transparent 1px),radial-gradient(circle at 52% 42%,rgba(66,150,255,.2),transparent 28%);background-size:54px 54px,54px 54px,100% 100%;animation:tzAiRoomGrid 18s linear infinite;opacity:.75;pointer-events:none;}
  .tz-ai-panel.tz-ai-room::after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 52%,transparent 0 45%,rgba(0,0,0,.42) 76%,rgba(0,0,0,.88) 100%);pointer-events:none;}
  .tz-ai-room .tz-ai-head{position:relative;z-index:4;padding:calc(18px + env(safe-area-inset-top)) 18px 12px;background:linear-gradient(180deg,rgba(5,10,20,.72),rgba(5,10,20,.18))!important;backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);}
  .tz-ai-stage{position:relative;z-index:2;display:grid;place-items:center;min-height:0;flex:1 1 auto;padding:12px 14px 8px;}
  .tz-ai-room-card{position:relative;width:min(92vw,540px);height:min(58vh,610px);min-height:390px;border:1px solid rgba(150,210,255,.18);border-radius:34px;overflow:hidden;background:linear-gradient(180deg,rgba(14,28,48,.42),rgba(0,0,0,.28));box-shadow:0 30px 120px rgba(0,0,0,.72),inset 0 1px 0 rgba(255,255,255,.08);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);}
  .tz-ai-room-card::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,rgba(65,144,255,.18),transparent 30%),linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);background-size:100% 100%,42px 42px,42px 42px;animation:tzAiRoomGrid 16s linear infinite;}
  .tz-ai-room-card::after{content:"";position:absolute;inset:0;background:linear-gradient(120deg,transparent 0 38%,rgba(132,203,255,.16) 48%,transparent 58%);transform:translateX(-120%);animation:tzAiGlassSweep 9s ease-in-out infinite;}
  .tz-ai-particles{position:absolute;inset:0;pointer-events:none;z-index:1;background:radial-gradient(circle at 18% 22%,rgba(180,220,255,.5) 0 1px,transparent 2px),radial-gradient(circle at 82% 30%,rgba(120,190,255,.42) 0 1px,transparent 2px),radial-gradient(circle at 68% 74%,rgba(255,255,255,.36) 0 1px,transparent 2px),radial-gradient(circle at 32% 70%,rgba(80,160,255,.34) 0 1px,transparent 2px);animation:tzAiParticles 13s ease-in-out infinite alternate;opacity:.55;}
  .tz-ai-orb{position:absolute;left:50%;top:42%;width:min(42vw,180px);aspect-ratio:1/1;transform:translate(-50%,-50%);display:grid;place-items:center;filter:drop-shadow(0 30px 76px rgba(0,0,0,.72));animation:tzAiFloat 6.4s ease-in-out infinite;z-index:2;isolation:isolate;}
  .tz-ai-orb::before{content:"";position:absolute;inset:-4%;border-radius:50%;background:radial-gradient(circle,rgba(83,163,255,.22),rgba(8,18,34,.2) 48%,transparent 72%);box-shadow:0 0 50px rgba(48,129,255,.32),0 0 105px rgba(48,129,255,.16);animation:tzAiGlow 4.8s ease-in-out infinite;z-index:0;}
  .tz-ai-orb::after{content:"";position:absolute;inset:1%;border-radius:50%;border:1px solid rgba(147,213,255,.2);box-shadow:inset 0 0 36px rgba(96,171,255,.1),0 0 22px rgba(68,148,255,.18);animation:tzAiRing 11s linear infinite;z-index:3;}
  .tz-ai-face{position:relative;width:92%;aspect-ratio:1/1;border-radius:50%;overflow:hidden;background:#07090d;transform:perspective(900px) rotateX(0deg) rotateY(-3deg);animation:tzAiFaceBreathe 5.4s ease-in-out infinite;box-shadow:inset 0 0 0 1px rgba(255,255,255,.07),inset 0 0 42px rgba(65,144,255,.1),0 0 44px rgba(206,230,255,.14);z-index:2;}
  .tz-ai-face img{position:absolute;left:50%;top:50%;width:114%;height:114%;transform:translate(-50%,-50%) scale(.96);object-fit:cover;opacity:.84;filter:grayscale(1) brightness(.98) contrast(1.1);mix-blend-mode:screen;}
  .tz-ai-face::before{content:"";position:absolute;inset:0;background:linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px),radial-gradient(circle at 50% 50%,transparent 0 58%,rgba(0,0,0,.28) 78%,rgba(0,0,0,.7) 100%);background-size:10px 10px,10px 10px,100% 100%;opacity:.24;animation:tzAiPixelDrift 8s linear infinite;}
  .tz-ai-face::after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(ellipse at 58% 69%,rgba(0,0,0,.22),transparent 13%);opacity:.38;animation:tzAiMouthIdle 4.2s ease-in-out infinite;}
  .tz-ai-eye{display:none!important}
  .tz-ai-waveform{position:absolute;left:50%;top:50%;width:100%;height:100%;transform:translate(-50%,-50%);border-radius:50%;border:1px solid rgba(108,184,255,.16);opacity:0;z-index:1;pointer-events:none;}.tz-ai-waveform span{display:none!important}.tz-ai-waveform span:nth-child(1){transform:translate(-50%,-50%) rotate(0deg);animation-delay:0ms}.tz-ai-waveform span:nth-child(2){transform:translate(-50%,-50%) rotate(36deg);animation-delay:80ms}.tz-ai-waveform span:nth-child(3){transform:translate(-50%,-50%) rotate(72deg);animation-delay:160ms}.tz-ai-waveform span:nth-child(4){transform:translate(-50%,-50%) rotate(108deg);animation-delay:240ms}.tz-ai-waveform span:nth-child(5){transform:translate(-50%,-50%) rotate(144deg);animation-delay:320ms}.tz-ai-waveform span:nth-child(6){transform:translate(-50%,-50%) rotate(180deg);animation-delay:400ms}.tz-ai-waveform span:nth-child(7){transform:translate(-50%,-50%) rotate(216deg);animation-delay:480ms}.tz-ai-waveform span:nth-child(8){transform:translate(-50%,-50%) rotate(252deg);animation-delay:560ms}.tz-ai-waveform span:nth-child(9){transform:translate(-50%,-50%) rotate(288deg);animation-delay:640ms}.tz-ai-waveform span:nth-child(10){transform:translate(-50%,-50%) rotate(324deg);animation-delay:720ms}
  .tz-ai-state{position:absolute;left:18px;right:18px;bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;z-index:3}.tz-ai-state-pill{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:0 13px;border:1px solid rgba(155,217,255,.18);border-radius:999px;background:rgba(0,0,0,.26);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font-size:12px;font-weight:900;color:rgba(239,247,255,.86)}.tz-ai-state-dot{width:8px;height:8px;border-radius:50%;background:#4aa3ff;box-shadow:0 0 16px #4aa3ff}.tz-ai-mini-copy{font-size:12px;font-weight:800;color:rgba(232,242,255,.58);text-align:right}
  .tz-ai-room .tz-ai-body{position:relative;z-index:4;display:block!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;max-height:17vh!important;padding:0 16px 8px!important;}.tz-ai-room .tz-ai-msg{display:block!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;font-size:13px!important;line-height:1.42!important;padding:11px 13px!important;border-radius:18px!important;background:rgba(18,22,32,.58)!important;border:1px solid rgba(180,210,255,.1)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)!important;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);}.tz-ai-room .tz-ai-prompts{position:relative;z-index:4;display:flex!important;align-items:center!important;height:36px!important;min-height:36px!important;max-height:36px!important;padding:0 16px 4px!important;gap:10px!important;overflow-x:auto!important;overflow-y:hidden!important;transition:opacity .32s ease!important;will-change:opacity;mask-image:linear-gradient(90deg,transparent 0,#000 18px,#000 calc(100% - 18px),transparent 100%);-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 18px,#000 calc(100% - 18px),transparent 100%)}.tz-ai-room .tz-ai-chip{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:32px!important;padding:0 14px!important;border-radius:999px!important;font-size:10px!important;font-weight:900!important;letter-spacing:1px!important;text-transform:uppercase!important;background:rgba(10,18,34,.58)!important;border:1px solid rgba(156,214,255,.22)!important;color:#eef7ff!important;box-shadow:none!important;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:transform .16s ease,border-color .16s ease,background .16s ease,color .16s ease!important}.tz-ai-room .tz-ai-chip:active{transform:scale(.96)}.tz-ai-room .tz-ai-chip:hover{background:rgba(111,210,255,.12)!important;border-color:rgba(111,210,255,.32)!important;color:#fff!important;box-shadow:none!important}.tz-ai-room .tz-ai-form{position:relative;z-index:4;margin:0 14px;padding:8px!important;gap:8px!important;align-items:center!important;border:1px solid rgba(155,195,255,.14)!important;border-radius:22px!important;background:rgba(8,12,20,.76)!important;box-shadow:0 18px 44px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.05);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}.tz-ai-room .tz-ai-input{min-height:42px!important;max-height:76px!important;border-radius:16px!important;background:rgba(255,255,255,.045)!important;border:1px solid rgba(255,255,255,.08)!important;padding:10px 12px!important;font-size:14px!important;font-weight:650!important}.tz-ai-room .tz-ai-mic,.tz-ai-room .tz-ai-send{width:48px!important;height:48px!important;border-radius:17px!important;font-size:15px!important;flex:0 0 48px!important}.tz-ai-room .tz-ai-send{box-shadow:0 8px 28px rgba(35,105,255,.32),inset 0 1px 0 rgba(255,255,255,.18)!important}.tz-ai-room .tz-ai-status{position:relative;z-index:4;padding:6px 18px calc(10px + env(safe-area-inset-bottom))!important;font-size:12px!important;color:rgba(220,232,255,.56)!important;}
  /* Ask Tapzy readable answer card */
  .tz-ai-room .tz-ai-body{max-height:min(25vh,210px)!important;min-height:132px!important;overflow-y:auto!important;overscroll-behavior:contain!important;padding:0 16px 8px!important;scrollbar-width:none!important;}
  .tz-ai-room .tz-ai-body::-webkit-scrollbar{display:none!important;}
  .tz-ai-room .tz-ai-msg.bot{display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important;max-height:min(23vh,194px)!important;white-space:pre-wrap!important;word-break:normal!important;overflow-wrap:break-word!important;writing-mode:horizontal-tb!important;text-orientation:mixed!important;letter-spacing:0!important;overflow-y:auto!important;overscroll-behavior:contain!important;padding:13px 14px!important;font-size:13px!important;line-height:1.34!important;}
  .tz-ai-room .tz-ai-msg.bot::-webkit-scrollbar{display:none!important;}
  .tz-ai-room .tz-ai-link-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:8px;width:100%;}
  .tz-ai-room .tz-ai-link-chip{display:flex;align-items:center;justify-content:center;min-height:25px;padding:5px 9px;border-radius:999px;border:1px solid rgba(112,178,255,.28);background:rgba(45,119,255,.16);color:#dcecff!important;text-decoration:none!important;font-size:11px!important;line-height:1!important;font-weight:900;}\n  .tz-ai-room .tz-ai-card-stack{display:grid;gap:8px;margin-top:10px;width:100%;}\n  .tz-ai-room .tz-ai-result-card{border:1px solid rgba(142,202,255,.18);border-radius:16px;background:linear-gradient(145deg,rgba(17,27,44,.92),rgba(7,10,18,.94));box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 10px 26px rgba(0,0,0,.18);padding:10px 11px;display:grid;gap:7px;}\n  .tz-ai-room .tz-ai-result-title{color:#fff;font-weight:950;font-size:13px;line-height:1.18;letter-spacing:.01em;}\n  .tz-ai-room .tz-ai-result-detail{color:rgba(232,241,255,.72);font-size:11.5px;line-height:1.28;}\n  .tz-ai-room .tz-ai-result-actions{display:flex;gap:6px;flex-wrap:wrap;}\n  .tz-ai-room .tz-ai-result-action{display:inline-flex;align-items:center;justify-content:center;min-height:24px;padding:5px 9px;border-radius:999px;border:1px solid rgba(112,178,255,.3);background:rgba(34,99,210,.2);color:#e4f1ff!important;text-decoration:none!important;font-size:10.5px!important;font-weight:950;line-height:1;}
  .tz-ai-room .tz-ai-input,.tz-ai-room .tz-ai-send,.tz-ai-room .tz-ai-mic{position:relative!important;z-index:9!important;pointer-events:auto!important;touch-action:manipulation!important;}
  .tz-ai-room .tz-ai-prompts{z-index:6!important;} .tz-ai-prompts.is-idle-hidden{opacity:0;pointer-events:none!important}
  .tz-ai-room .tz-ai-form{z-index:7!important;}
  @media(max-width:520px){.tz-ai-room .tz-ai-body{max-height:210px!important;min-height:132px!important}.tz-ai-room .tz-ai-msg.bot{max-height:194px!important;font-size:12.5px!important;line-height:1.32!important}}
  .tz-ai-room[data-ai-state="listening"] .tz-ai-waveform{opacity:1}.tz-ai-room[data-ai-state="listening"] .tz-ai-orb::before{box-shadow:0 0 76px rgba(62,154,255,.72),0 0 150px rgba(62,154,255,.28)}.tz-ai-room[data-ai-state="thinking"] .tz-ai-orb::after{animation-duration:1.65s;border-color:rgba(195,229,255,.42)}.tz-ai-room[data-ai-state="thinking"] .tz-ai-face{transform:perspective(900px) rotateX(-3deg) rotateY(-4deg)}.tz-ai-room[data-ai-state="speaking"] .tz-ai-face::after{animation:tzAiMouthSpeak .72s ease-in-out infinite}.tz-ai-room[data-ai-state="speaking"] .tz-ai-face{animation:tzAiFaceSpeak 1.8s ease-in-out infinite}
  @keyframes tzAiRoomGrid{to{background-position:0 54px,54px 0,center}}@keyframes tzAiParticles{0%{transform:translate3d(-1%,1%,0) scale(1)}100%{transform:translate3d(1.5%,-1%,0) scale(1.04)}}@keyframes tzAiGlassSweep{0%,62%,100%{transform:translateX(-120%)}78%{transform:translateX(120%)}}@keyframes tzAiFloat{0%,100%{transform:translate(-50%,-50%) translateY(0)}50%{transform:translate(-50%,-50%) translateY(-12px)}}@keyframes tzAiGlow{0%,100%{opacity:.72;transform:scale(.98)}50%{opacity:1;transform:scale(1.05)}}@keyframes tzAiRing{to{transform:rotate(360deg)}}@keyframes tzAiFaceBreathe{0%,100%{transform:perspective(900px) rotateX(0deg) rotateY(-4deg) translateY(0)}50%{transform:perspective(900px) rotateX(1deg) rotateY(3deg) translateY(-4px)}}@keyframes tzAiFaceSpeak{0%,100%{transform:perspective(900px) rotateX(0deg) rotateY(-4deg) translateY(0)}50%{transform:perspective(900px) rotateX(-1deg) rotateY(2deg) translateY(-2px)}}@keyframes tzAiPixelDrift{to{background-position:12px 24px,24px 12px}}@keyframes tzAiMouthIdle{0%,100%{opacity:.28;transform:scale(.98)}50%{opacity:.46;transform:scale(1.02)}}@keyframes tzAiMouthSpeak{0%,100%{opacity:.22;transform:scale(.98)}35%{opacity:.62;transform:scale(1.035)}65%{opacity:.4;transform:scale(1.01)}}@keyframes tzAiBlink{0%,92%,100%{height:3%}94%,96%{height:.5%}}@keyframes tzAiWaveBars{0%,100%{height:24px;opacity:.3}50%{height:56px;opacity:.9}}
  @media(max-width:520px){.tz-ai-panel.tz-ai-room{left:0!important;right:0!important;bottom:0!important;border-radius:0!important}.tz-ai-room-card{width:calc(100vw - 24px);height:min(50vh,500px);min-height:330px;border-radius:30px}.tz-ai-orb{width:min(42vw,160px);top:39%}.tz-ai-room .tz-ai-status{padding-bottom:calc(88px + env(safe-area-inset-bottom))!important}.tz-ai-mini-copy{display:none}}

  @media(max-width:520px){.tz-ai-panel{left:10px;right:10px;bottom:calc(86px + env(safe-area-inset-bottom));border-radius:24px}.tz-ai-body{max-height:52vh}}\n</style>\n<div class=\"tz-ai-root\" data-tapzy-assistant data-username=\"__USERNAME__\" data-page-type=\"__PAGETYPE__\" data-auth-page=\"__ISAUTH__\">\n  <button class=\"tz-ai-launch\" type=\"button\" aria-label=\"Ask Tapzy\"><span>Ask Tapzy</span></button>\n  <section class=\"tz-ai-panel\" aria-label=\"Ask Tapzy assistant\" role=\"dialog\" aria-modal=\"false\">\n    <div class=\"tz-ai-head\"><div class=\"tz-ai-title\"><img src=\"/images/tapzy-mark-white.png\" alt=\"\" aria-hidden=\"true\"/><span>Ask Tapzy</span></div><button class=\"tz-ai-close\" type=\"button\" aria-label=\"Close\">&times;</button></div>\n    <div class=\"tz-ai-body\"><div class=\"tz-ai-msg bot\">Ask me anything. We can have a real conversation, search the web, talk Tapzy, find places, plan your night, check weather, or get directions.</div></div>\n    <div class=\"tz-ai-prompts\"><button class=\"tz-ai-chip\" type=\"button\" data-prompt=\"What is going on tonight?\">What is going on tonight?</button><button class=\"tz-ai-chip\" type=\"button\" data-prompt=\"Find concerts near me\">Find concerts near me</button><button class=\"tz-ai-chip\" type=\"button\" data-prompt=\"Who is at Ribfest tonight?\">Who is at Ribfest tonight?</button><button class=\"tz-ai-chip\" type=\"button\" data-prompt=\"Plan me a first date under $80\">Plan me a first date under $80</button><button class=\"tz-ai-chip\" type=\"button\" data-prompt=\"I want Italian food under $40\">I want Italian food under $40</button><button class=\"tz-ai-chip\" type=\"button\" data-prompt=\"Late night snacks near me\">Late night snacks near me</button><button class=\"tz-ai-chip\" type=\"button\" data-prompt=\"It is raining. What should we do?\">It is raining. What should we do?</button><button class=\"tz-ai-chip\" type=\"button\" data-prompt=\"Find a quiet place to relax\">Find a quiet place to relax</button><button class=\"tz-ai-chip\" type=\"button\" data-prompt=\"I have three hours free\">I have three hours free</button><button class=\"tz-ai-chip\" type=\"button\" data-prompt=\"Show me car meets tonight\">Show me car meets tonight</button><button class=\"tz-ai-chip\" type=\"button\" data-prompt=\"Anyone nearby want to play soccer?\">Anyone nearby want to play soccer?</button><button class=\"tz-ai-chip\" type=\"button\" data-prompt=\"Find a study group\">Find a study group</button><button class=\"tz-ai-chip\" type=\"button\" data-prompt=\"Navigate me to the best event nearby\">Navigate me to the best event nearby</button><button class=\"tz-ai-chip\" type=\"button\" data-prompt=\"What is the weather right now?\">What is the weather right now?</button><button class=\"tz-ai-chip\" type=\"button\" data-prompt=\"What can I do with my girl tonight?\">What can I do with my girl tonight?</button></div>\n    <form class=\"tz-ai-form\" action=\"javascript:void(0)\" autocomplete=\"off\" data-no-page-loader><button class=\"tz-ai-mic\" type=\"button\" aria-label=\"Voice input\">Mic</button><textarea class=\"tz-ai-input\" rows=\"1\" enterkeyhint=\"send\" placeholder=\"Ask Tapzy anything...\"></textarea><button class=\"tz-ai-send\" type=\"button\" aria-label=\"Send\">Go</button></form>\n    <div class=\"tz-ai-status\"></div>\n  </section>\n</div>\n<script data-tapzy-assistant>\n(function(){\n  var roots=document.querySelectorAll('.tz-ai-root[data-tapzy-assistant]');\n  roots.forEach(function(root){\n    if(root.dataset.ready==='1')return;root.dataset.ready='1';\n    var launch=root.querySelector('.tz-ai-launch'),panel=root.querySelector('.tz-ai-panel'),close=root.querySelector('.tz-ai-close'),body=root.querySelector('.tz-ai-body'),form=root.querySelector('.tz-ai-form'),input=root.querySelector('.tz-ai-input'),status=root.querySelector('.tz-ai-status'),mic=root.querySelector('.tz-ai-mic'),send=root.querySelector('.tz-ai-send'),stateText=null;\n    var memory=[],geo=null,geoAsked=false,busy=false,stateTimer=null,lastQuestion='',pillTimer=null,tapWindow=0,tapCount=0;
    var browserTimeZone=(function(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch(_){return '';}})();
    function buildAiRoom(){
      if(!panel||panel.dataset.roomReady==='1')return;panel.dataset.roomReady='1';panel.classList.add('tz-ai-room');panel.dataset.aiState='idle';
      var particles=document.createElement('div');particles.className='tz-ai-particles';particles.setAttribute('aria-hidden','true');panel.insertBefore(particles,panel.firstChild);
      var stage=document.createElement('main');stage.className='tz-ai-stage';stage.innerHTML='<div class="tz-ai-room-card"><div class="tz-ai-orb" aria-hidden="true"><div class="tz-ai-waveform"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><div class="tz-ai-face"><img src="/images/tapzy-identity-digital-face.jpg" alt=""/><span class="tz-ai-eye left"></span><span class="tz-ai-eye right"></span></div></div><div class="tz-ai-state"><div class="tz-ai-state-pill"><span class="tz-ai-state-dot"></span><span class="tz-ai-state-text">Idle</span></div><div class="tz-ai-mini-copy">Tapzy AI is ready.</div></div></div>';
      var head=panel.querySelector('.tz-ai-head');if(head&&head.nextSibling)panel.insertBefore(stage,head.nextSibling);else panel.appendChild(stage);stateText=stage.querySelector('.tz-ai-state-text');
      var title=panel.querySelector('.tz-ai-title span');if(title)title.textContent='Ask Tapzy Room';
    }
    function setVisualState(state,label){if(!panel)return;panel.dataset.aiState=state||'idle';if(stateText)stateText.textContent=label||state||'Idle';}
    function settleIdle(delay){window.clearTimeout(stateTimer);stateTimer=window.setTimeout(function(){if(!busy&&!(mic&&mic.classList.contains('is-listening')))setVisualState('idle','Idle');},delay||1200);}
    buildAiRoom();\n    function showPills(){var prompts=root.querySelector('.tz-ai-prompts');if(prompts)prompts.classList.remove('is-idle-hidden');resetPillTimer();}function hidePills(){var prompts=root.querySelector('.tz-ai-prompts');if(prompts)prompts.classList.add('is-idle-hidden');}function resetPillTimer(){window.clearTimeout(pillTimer);pillTimer=window.setTimeout(function(){if(panel&&panel.classList.contains('is-open'))hidePills();},20000);}function open(){panel.classList.add('is-open');setVisualState('idle','Idle');showPills();setTimeout(function(){input&&input.focus&&input.focus();},120);}function shut(){panel.classList.remove('is-open');window.clearTimeout(pillTimer);if(launch)launch.style.display='';}\n    function beautifyBotText(text){return String(text||'').replace(/\\s+(\\d+\\.\\s)/g,'\\n$1').replace(/\\s+(Best first tap:)/gi,'\\n\\n$1').replace(/\\s+(Directions:)/gi,'\\n$1').replace(/\\s+(If people mark themselves)/gi,'\\n\\n$1').replace(/\\n{3,}/g,'\\n\\n').trim();}
    function compactLinkLabel(url){var value=String(url||'');if(value.indexOf('ticketmaster.')>-1)return 'Tickets';if(value.indexOf('google.com/maps')>-1)return 'Directions';if(value.charAt(0)==='/'||value.indexOf('tapzy.')>-1)return 'Open on Tapzy';return 'Open link';}\n    function extractBotLinks(text){try{var source=String(text||'');var re=new RegExp('https?://[^\\s|]+|www\\.[^\\s|]+|/(?:events|profile|posts|stories)/[^\\s|]+','g');var found=source.match(re)||[];return found.slice(0,6).map(function(raw){return String(raw).replace(/[),.;]+$/,'');});}catch(_){return[];}}\n    function stripUrlJunk(value){var text=String(value||'');text=text.replace(/https?:\\/\\/[^\\s|]+/gi,'');text=text.replace(/www\\.[^\\s|]+/gi,'');text=text.replace(/\\b[a-z0-9.-]+\\.(?:com|ca|org|net|io)[^\\s|]*/gi,'');text=text.replace(/\\b(?:api=1|destination=|query=|event\\/|concert\\/|tickets?\\/info|direction:?|openlink|open on tapzy)[:\\w%?&=./-]*/gi,'');text=text.replace(/%[0-9a-f]{2}/gi,' ');text=text.replace(/[?&=]{1,}/g,' ');text=text.replace(/\\s*\\|\\s*/g,'\\n');return text;}\n    function cleanBotText(text,links){var display=String(text||'').replace(/\*\*/g,'').replace(/__+/g,'');display=stripUrlJunk(display);(links||[]).forEach(function(url){display=display.split(url).join('');});display=display.replace(/\\s*(tickets\\/info|tickets|directions|link|url)\\s*:\\s*(Tickets|Directions|Open on Tapzy|Open link)/gi,'');display=display.replace(/(?:Tickets|Directions|Open on Tapzy|Open link)(?:\\s+(?:Tickets|Directions|Open on Tapzy|Open link))+/g,'');display=display.split('\\n').map(function(line){return line.replace(/[^a-z0-9)]+$/i,'').trim();}).filter(function(line){if(!line)return false;var plain=line.replace(/^[\\s·•*\\-–—.]+/,'').trim();if(/^(Tickets|Directions|Open on Tapzy|Open link)(\\s+(Tickets|Directions|Open on Tapzy|Open link))*$/i.test(plain))return false;if(/[/%?=&]/.test(line))return false;if(line.length>28&&!/\\s/.test(line))return false;if(line.length>110&&/[_]/.test(line))return false;return true;}).slice(0,5).join('\\n');display=display.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/,{2,}/g,',').replace(/\\s{2,}/g,' ').replace(/\\n{3,}/g,'\\n\\n').trim();var shortLines=display.split('\\n').filter(function(line){return line.trim();});if(shortLines.length>3&&shortLines.filter(function(line){return line.trim().length<=2;}).length/shortLines.length>.6){display=shortLines.join('').replace(/\\s{2,}/g,' ').trim();}if(!display||display.length<12||(/[/%?=&]/.test(display)&&display.length>30))display='I found a few good options. Tap an action below.';return display;}\n    function decorateBotLinks(msg,links){try{links=links||[];if(!links.length)return;var seenLabels={};var row=document.createElement('span');row.className='tz-ai-link-row';links.forEach(function(clean){var label=compactLinkLabel(clean);if(seenLabels[label])return;seenLabels[label]=true;var a=document.createElement('a');a.className='tz-ai-link-chip';a.href=clean;a.setAttribute('data-no-page-loader','');if(clean.charAt(0)!=='/'){a.target='_blank';a.rel='noopener noreferrer';}a.textContent=label;a.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();if(clean.charAt(0)==='/'){window.location.href=clean;}else{var opened=window.open(clean,'_blank','noopener');if(!opened)window.location.href=clean;}});row.appendChild(a);});msg.appendChild(row);}catch(_){}}\n    function renderTapzyCards(cards){try{cards=Array.isArray(cards)?cards.slice(0,4):[];if(!cards.length)return null;var stack=document.createElement('div');stack.className='tz-ai-card-stack';cards.forEach(function(card){if(!card||!card.title)return;var item=document.createElement('div');item.className='tz-ai-result-card';var title=document.createElement('div');title.className='tz-ai-result-title';title.textContent=(card.rank?card.rank+'. ':'')+String(card.title||'Tapzy pick');var detail=document.createElement('div');detail.className='tz-ai-result-detail';detail.textContent=String(card.detail||card.subtitle||'').slice(0,180);item.appendChild(title);if(detail.textContent)item.appendChild(detail);var actions=Array.isArray(card.actions)?card.actions.slice(0,3):[];if(actions.length){var row=document.createElement('div');row.className='tz-ai-result-actions';actions.forEach(function(act){if(!act||!act.url)return;var a=document.createElement('a');a.className='tz-ai-result-action';a.href=String(act.url);a.textContent=String(act.label||'Open');a.setAttribute('data-no-page-loader','');if(a.href.indexOf(location.origin)!==0&&String(act.url).charAt(0)!=='/'){a.target='_blank';a.rel='noopener noreferrer';}a.addEventListener('click',function(e){e.stopPropagation();});row.appendChild(a);});item.appendChild(row);}stack.appendChild(item);});return stack.childNodes.length?stack:null;}catch(_){return null;}}\n    function showBot(text,save,cards){body.innerHTML='';var msg=document.createElement('div');msg.className='tz-ai-msg bot';var raw=String(text||'');var display=raw==='Thinking...'?raw:beautifyBotText(raw);var links=raw==='Thinking...'?[]:extractBotLinks(display);display=raw==='Thinking...'?raw:cleanBotText(display,links);msg.textContent=display;decorateBotLinks(msg,links);body.appendChild(msg);var cardStack=renderTapzyCards(cards);if(cardStack)body.appendChild(cardStack);body.scrollTop=0;window.setTimeout(function(){msg.scrollTop=0;body.scrollTop=0;},0);if(save!==false){memory.push({role:'assistant',content:String(text||'')});memory=memory.slice(-24);}}
    function add(role,text,cards){if(role==='user'){lastQuestion=String(text||'');memory.push({role:'user',content:lastQuestion});memory=memory.slice(-24);return;}showBot(text,true,cards);}
    function pickOfflineVoice(){try{var voices=window.speechSynthesis&&window.speechSynthesis.getVoices?window.speechSynthesis.getVoices():[];var preferred=['Samantha','Karen','Daniel','Moira','Tessa','Google US English','Microsoft Aria','Microsoft Jenny'];for(var i=0;i<preferred.length;i++){var hit=voices.find(function(v){return v&&v.name&&v.name.toLowerCase().indexOf(preferred[i].toLowerCase())>=0;});if(hit)return hit;}return voices.find(function(v){return v&&/^en[-_]/i.test(v.lang||'');})||voices[0]||null;}catch(_){return null;}}
    function speakOffline(text){try{if(!('speechSynthesis'in window)||!window.SpeechSynthesisUtterance)return;var clean=String(text||'').replace(new RegExp('https?:\\/\\/\\S+','g'),'').replace(new RegExp('\\s+','g'),' ').trim();if(!clean)return;var voice=pickOfflineVoice();if(!voice&&window.speechSynthesis&&window.speechSynthesis.onvoiceschanged!==null){window.speechSynthesis.onvoiceschanged=function(){window.speechSynthesis.onvoiceschanged=null;speakOffline(text);};window.speechSynthesis.getVoices&&window.speechSynthesis.getVoices();}window.speechSynthesis.cancel();window.speechSynthesis.resume&&window.speechSynthesis.resume();var parts=clean.match(/.{1,220}(?:\\s|$)/g)||[clean.slice(0,220)];var idx=0;setVisualState('speaking','Speaking');function speakNext(){if(idx>=parts.length){settleIdle(700);return;}var utter=new SpeechSynthesisUtterance(String(parts[idx++]||'').trim());if(voice)utter.voice=voice;utter.rate=.96;utter.pitch=.94;utter.volume=1;utter.onend=speakNext;utter.onerror=function(){if(idx<parts.length)speakNext();else settleIdle(700);};window.speechSynthesis.speak(utter);}speakNext();}catch(_){}}
    function getSpeechRecognition(){return window.SpeechRecognition||window.webkitSpeechRecognition||null;}\n    function stripWakePhrase(text){var spoken=String(text||'').trim();var cleaned=spoken.replace(new RegExp('^(?:hey\\s+)?tapzy[,.!?:;-]*\\s*','i'),'').trim();return cleaned&&cleaned!==spoken?cleaned:'';}\n    function setStatus(text){if(status)status.textContent=text||'';}\n    function wantsLocation(text){return new RegExp('\\b(near me|nearby|around me|around here|tonight|today|tomorrow|this weekend|weather|forecast|temperature|rain|raining|food|restaurant|coffee|snack|date|directions|navigate|event|events|concert|festival|bar|club|nightlife|where should|what should|things to do)\\b','i').test(String(text||''));}
    function getLocation(force){return new Promise(function(resolve){if(geo)return resolve(geo);if(geoAsked&&!force)return resolve(null);geoAsked=true;if(!navigator.geolocation){setStatus('Location is not available in this browser.');return resolve(null);}if(!window.isSecureContext&&location.hostname!=='localhost'){setStatus('Location needs HTTPS. Open tapzy.org securely, then try again.');return resolve(null);}setStatus('Allow location to get nearby Tapzy answers.');navigator.geolocation.getCurrentPosition(function(pos){geo={latitude:pos.coords.latitude,longitude:pos.coords.longitude};setStatus('Location on.');window.setTimeout(function(){setStatus('');},1200);resolve(geo);},function(err){var msg='Location is off. Allow location for tapzy.org in your browser settings, then try again.';if(err&&err.code===1)msg='Location permission is blocked. Enable location for tapzy.org in site settings, then try again.';if(err&&err.code===2)msg='Your phone could not find location yet. Check GPS/Wi-Fi and try again.';if(err&&err.code===3)msg='Location took too long. Try again once GPS/Wi-Fi is ready.';setStatus(msg);resolve(null);},{enableHighAccuracy:false,timeout:6500,maximumAge:300000});});}\n    function ask(text,speakAnswer){showPills();text=(text||'').trim();if(!text||busy)return;busy=true;add('user',text);input.value='';showBot('Thinking...',false);setVisualState('thinking','Thinking');setStatus('Thinking...');getLocation(wantsLocation(text)).then(function(loc){return fetch('/api/assistant/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,pageType:root.dataset.pageType||'general',username:root.dataset.username||'User',isAuthPage:root.dataset.authPage==='true',currentPath:location.pathname,currentUrl:location.href,memory:memory,latitude:loc&&loc.latitude,longitude:loc&&loc.longitude,timeZone:browserTimeZone})});}).then(function(res){return res.json().catch(function(){return{};});}).then(function(data){setVisualState('speaking','Speaking');var reply=(data&&data.reply)||'Tapzy Assistant is temporarily unavailable.';var cards=data&&data.tapzySearch&&Array.isArray(data.tapzySearch.cards)?data.tapzySearch.cards:[];add('bot',reply,cards);if(speakAnswer)speakOffline(reply);settleIdle(2200);}).catch(function(){setVisualState('speaking','Speaking');var reply='Tapzy Assistant is temporarily unavailable. Try again in a moment.';add('bot',reply);if(speakAnswer)speakOffline(reply);settleIdle(1800);}).finally(function(){busy=false;setStatus('');});}\n    launch&&launch.addEventListener('click',function(e){e&&e.preventDefault&&e.preventDefault();open();});window.__tapzyOpenAssistant=function(){var root=document.querySelector('.tz-ai-root[data-tapzy-assistant]');if(!root)return false;var panel=root.querySelector('.tz-ai-panel');var input=root.querySelector('.tz-ai-input');if(!panel)return false;panel.classList.add('is-open');panel.dataset.aiState='idle';setTimeout(function(){input&&input.focus&&input.focus();},120);return true;};if(!window.__tapzyAiTopTriggerBound){window.__tapzyAiTopTriggerBound=true;['pointerdown','click','touchend'].forEach(function(type){document.addEventListener(type,function(e){var target=e.target;if(!target||!target.closest)return;var btn=target.closest('[data-tapzy-ai-open],.tz-ai-trigger,.tz-brand,.tz-story-brand,.events-story-brand,.event-feed-brand');if(!btn)return;e.preventDefault();e.stopPropagation();window.__tapzyOpenAssistant&&window.__tapzyOpenAssistant();},true);});}close&&close.addEventListener('click',shut);document.addEventListener('pointerdown',function(){if(!panel||!panel.classList.contains('is-open'))return;var now=Date.now();if(now-tapWindow>650){tapWindow=now;tapCount=0;}tapCount+=1;if(tapCount>=3){tapCount=0;tapWindow=0;showPills();}},true);form&&form.addEventListener('submit',function(e){e.preventDefault();showPills();ask(input&&input.value);});send&&send.addEventListener('click',function(e){e.preventDefault();showPills();ask(input&&input.value);});\n    root.querySelectorAll('.tz-ai-chip').forEach(function(chip){chip.addEventListener('click',function(){showPills();open();ask(chip.dataset.prompt||chip.textContent||'');});});\n    input&&input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask(input.value);}});input&&input.addEventListener('focus',function(){showPills();if(!busy)setVisualState('listening','Listening');});input&&input.addEventListener('blur',function(){settleIdle(900);});\n    var realtime={pc:null,dc:null,stream:null,audio:null,session:null,active:false,offlineRec:null};\n    function stopRealtime(){try{realtime.offlineRec&&realtime.offlineRec.abort&&realtime.offlineRec.abort();}catch(_){}try{realtime.session&&typeof realtime.session.close==='function'&&realtime.session.close();}catch(_){}try{realtime.session&&typeof realtime.session.disconnect==='function'&&realtime.session.disconnect();}catch(_){}try{realtime.dc&&realtime.dc.close();}catch(_){}try{realtime.pc&&realtime.pc.close();}catch(_){}try{realtime.stream&&realtime.stream.getTracks().forEach(function(t){t.stop();});}catch(_){}if(realtime.audio){try{realtime.audio.pause();}catch(_){}realtime.audio.remove();}realtime={pc:null,dc:null,stream:null,audio:null,session:null,active:false};mic&&mic.classList.remove('is-listening');if(mic)mic.textContent='Mic';setStatus('');setVisualState('idle','Idle');}\n    function waitForIceGathering(pc){return new Promise(function(resolve){if(pc.iceGatheringState==='complete'){resolve();return;}var done=function(){if(pc.iceGatheringState==='complete'){pc.removeEventListener('icegatheringstatechange',done);resolve();}};pc.addEventListener('icegatheringstatechange',done);setTimeout(function(){pc.removeEventListener('icegatheringstatechange',done);resolve();},2200);});}
    function startOfflineVoice(reason){var Rec=getSpeechRecognition();if(!Rec){setStatus('Offline voice can talk back, but this browser does not support speech input. Type a question and Tapzy can still answer.');return;}try{stopRealtime();var rec=new Rec();rec.lang='en-US';rec.interimResults=false;rec.continuous=false;mic&&mic.classList.add('is-listening');if(mic)mic.textContent='End';setVisualState('listening','Listening');setStatus(reason?'OpenAI voice is unavailable, using Tapzy offline voice.':'Tapzy offline voice is listening.');rec.onresult=function(event){var transcript='';try{transcript=event.results&&event.results[0]&&event.results[0][0]&&event.results[0][0].transcript||'';}catch(_){}mic&&mic.classList.remove('is-listening');if(mic)mic.textContent='Mic';if(transcript){transcript=String(transcript||'').trim();var wakeText=stripWakePhrase(transcript);if(!wakeText){setStatus('Say Hey Tapzy first, then your question.');settleIdle(1200);return;}if(wakeText.length<3){setStatus('I did not catch the question after Hey Tapzy.');settleIdle(900);return;}setStatus('Tapzy offline voice is answering.');ask(wakeText,true);}else{setStatus('I did not catch that. Try again.');settleIdle(900);}};rec.onerror=function(){mic&&mic.classList.remove('is-listening');if(mic)mic.textContent='Mic';setVisualState('idle','Idle');setStatus('Offline voice did not catch that. You can type instead.');};rec.onend=function(){if(!busy){mic&&mic.classList.remove('is-listening');if(mic)mic.textContent='Mic';}};realtime.offlineRec=rec;rec.start();}catch(_){mic&&mic.classList.remove('is-listening');if(mic)mic.textContent='Mic';setStatus('Offline voice could not start. Typing still works.');}}
    async function startRealtime(){if(realtime.active){stopRealtime();return;}if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.RTCPeerConnection){setStatus('Live voice is not supported in this browser yet. Typing still works.');return;}try{mic&&mic.classList.add('is-listening');if(mic)mic.textContent='End';setVisualState('listening','Listening');setStatus('Checking location...');if(!geo){try{geo=await getLocation(true);}catch(_){}}if(!geo){mic&&mic.classList.remove('is-listening');if(mic)mic.textContent='Mic';setVisualState('idle','Idle');setStatus('Please allow location so Tapzy voice can answer nearby questions.');return;}setStatus('Starting live voice with your location...');var stream=await navigator.mediaDevices.getUserMedia({audio:true});var pc=new RTCPeerConnection();realtime.pc=pc;realtime.stream=stream;stream.getTracks().forEach(function(track){pc.addTrack(track,stream);});var audio=document.createElement('audio');audio.autoplay=true;audio.playsInline=true;audio.style.display='none';root.appendChild(audio);realtime.audio=audio;pc.ontrack=function(event){try{audio.srcObject=event.streams&&event.streams[0];audio.play&&audio.play().catch(function(){});}catch(_){}};var dc=pc.createDataChannel('tapzy-events');realtime.dc=dc;dc.onopen=function(){setVisualState('listening','Listening');setStatus('Live voice is on with location. Say Hey Tapzy first.');};pc.onconnectionstatechange=function(){if(pc.connectionState==='failed'||pc.connectionState==='disconnected'||pc.connectionState==='closed'){if(realtime.active){stopRealtime();setStatus('Live voice disconnected. Tap Mic to reconnect.');}}};var tokenRes=await fetch('/api/assistant/realtime-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageType:root.dataset.pageType||'general',username:root.dataset.username||'User',currentPath:location.pathname,currentUrl:location.href,latitude:geo&&geo.latitude,longitude:geo&&geo.longitude,timeZone:browserTimeZone})});var tokenData=await tokenRes.json().catch(function(){return{};});if(!tokenRes.ok||!tokenData||!tokenData.clientSecret){throw new Error((tokenData&&tokenData.error)||'OpenAI voice session could not start.');}var offer=await pc.createOffer();await pc.setLocalDescription(offer);await waitForIceGathering(pc);var offerSdp=(pc.localDescription&&pc.localDescription.sdp)||offer.sdp||'';if(!offerSdp||offerSdp.indexOf('v=0')!==0||offerSdp.indexOf('m=audio')<0){throw new Error('Realtime voice offer was incomplete. Tap Mic again.');}var realtimeUrl='https://api.openai.com/v1/realtime/calls';var directRes=await fetch(realtimeUrl,{method:'POST',headers:{'Authorization':'Bearer '+tokenData.clientSecret,'Content-Type':'application/sdp','Accept':'application/sdp'},body:offerSdp});var answerSdp=await directRes.text().catch(function(){return'';});if(!directRes.ok||!answerSdp){throw new Error(answerSdp||'Realtime voice connection failed.');}await pc.setRemoteDescription({type:'answer',sdp:answerSdp});realtime.active=true;setVisualState('listening','Listening');setStatus(tokenData.locationLabel?'Live voice is on near '+tokenData.locationLabel+'. Say Hey Tapzy first.':'Live voice is on with location. Say Hey Tapzy first.');}catch(error){stopRealtime();var msg=(error&&error.message)?error.message:'Live voice could not start.';setStatus('Live voice issue: '+msg+' You can type instead.');setVisualState('idle','Idle');if(mic){mic.classList.remove('is-listening');mic.textContent='Mic';}}}
    mic&&mic.addEventListener('click',function(e){e.preventDefault();startRealtime();});\n  });\n})();\n</script><script data-tapzy-assistant-typing-fix>\n(function(){\n  function unlockTapzyTyping(){document.querySelectorAll('.tz-ai-root[data-tapzy-assistant]').forEach(function(root){var input=root.querySelector('.tz-ai-input');if(!input)return;input.disabled=false;input.readOnly=false;input.removeAttribute('disabled');input.removeAttribute('readonly');input.setAttribute('aria-disabled','false');});}\n  document.addEventListener('pointerdown',function(e){unlockTapzyTyping();var send=e.target&&e.target.closest&&e.target.closest('.tz-ai-send');if(send){var root=send.closest('.tz-ai-root[data-tapzy-assistant]');var input=root&&root.querySelector('.tz-ai-input');if(input&&!String(input.value||'').trim()){setTimeout(function(){input.focus&&input.focus();},40);}}},true);\n  document.addEventListener('focusin',unlockTapzyTyping,true);\n  setInterval(unlockTapzyTyping,1200);\n  unlockTapzyTyping();\n})();\n</script>`.replace(/__USERNAME__/g, safeUsername).replace(/__PAGETYPE__/g, safePageType).replace(/__ISAUTH__/g, isAuth);
}



module.exports = {

  cleanUsername,

  ensureUniqueUsername,

  formatPrettyLocal,

  safeUrl,

  stripAt,

  escapeHtml,

  publicAbsoluteUrl,

  makeVcf,

  cryptoRandomSecret,

  makeSessionToken,

  parseOptionalFloat,

  buildQuickSharePreview,

  buildSharedFieldsFromProfile,

  hasSharedSomething,

  socialLabel,

  buildConnectionActions,

  backUrl,

  ownerKeyQuery,

  currentProfileNoticeHtml,

  hasOwnerAccess,

  requireOwnerAccess,

  navLink,

  renderTopBar,


  renderStoriesTopNav,

  renderStoriesTopNavCss,
  renderShell,

  renderTapzyAssistant,

  createSessionForAccount,

  destroySession,

  createTapMoment,

  sendAdminCodesEmail,

  sendActivationOwnerEmail,

  getFollowState,

  renderFollowButton,

  renderMomentLikeButton,

  getOrCreateConversationBetween,

};
