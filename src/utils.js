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

    <meta name="viewport" content="width=device-width, initial-scale=1" />

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

    { key: "search", label: "Search", href: "/search" },

    { key: "messages-list", label: "Messages", href: signedIn ? "/messages" : "/auth" },

    { key: "profile", label: "My Profile", href: signedIn ? `/u/${username}` : "/auth" },

    { key: "edit", label: "Edit Profile", href: signedIn ? `/edit/${username}` : "/auth" },

    { key: "network", label: "Network", href: signedIn ? `/network/${username}` : "/auth" },

    { key: "connections", label: "Connections", href: signedIn ? `/connections/${username}` : "/auth" },

    { key: "pair", label: "Pair", href: signedIn ? "/pair" : "/auth" },

    { key: "events", label: "Events", href: "/events" },

    { key: "stories", label: "Stories", href: "/stories" },

    { key: "posts", label: "Posts", href: "/posts" },

    { key: "admin", label: "Admin", href: "/admin" },

  ];



  return `

  <header class="tz-topbar">

    <div class="tz-topbar-inner">

      <a class="tz-brand" href="/">

        <span class="tz-brand-word">Tapzy <span class="tz-brand-network">Network™</span></span>

      </a>



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



        <button class="tz-menu-close" id="tzMenuClose" type="button" aria-label="Close navigation">×</button>

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



function renderShell(title, body, extraHead = "", shellOptions = {}) {

  const currentProfile = shellOptions.currentProfile || null;

  const pageTitle = shellOptions.pageTitle || "Tapzy Network™";

  const pageType = shellOptions.pageType || "general";

  const resolvedTitle = title || "Tapzy Network™ — Your Digital Identity";

  const resolvedDescription =

    shellOptions.metaDescription ||

    "Tapzy Network™ is your digital identity. Tap to connect instantly with a premium real-world networking experience.";



  return `

  <html>

  <head>

    <title>${escapeHtml(resolvedTitle)}</title>

    <meta name="viewport" content="width=device-width, initial-scale=1" />

    <meta name="description" content="${escapeHtml(resolvedDescription)}" />

    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />

    <meta property="og:title" content="${escapeHtml(resolvedTitle)}" />

    <meta property="og:description" content="${escapeHtml(resolvedDescription)}" />

    <meta property="og:type" content="website" />

    <meta name="twitter:card" content="summary_large_image" />

    <meta name="twitter:title" content="${escapeHtml(resolvedTitle)}" />

    <meta name="twitter:description" content="${escapeHtml(resolvedDescription)}" />

    ${extraHead}

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

      html{scroll-behavior:smooth}

      body{

        font-family:Arial,sans-serif;

        background:

          radial-gradient(900px 520px at 50% -180px, rgba(120,205,255,.06), transparent 45%),

          radial-gradient(900px 600px at 100% 0%, rgba(255,255,255,.02), transparent 35%),

          linear-gradient(180deg,#050505 0%,#070707 34%,#090909 100%);

        color:var(--text);

        margin:0;

        min-height:100vh;

      }



      a{color:inherit}

      img{max-width:100%}

      button,input,textarea,select{font:inherit}



      .tz-topbar{

        position:sticky;

        top:0;

        z-index:9000;

        backdrop-filter:blur(18px);

        background:rgba(3,5,10,.82);

        border-bottom:1px solid rgba(140,198,255,.08);

        box-shadow:0 8px 24px rgba(0,0,0,.22);

      }



      .tz-topbar-inner{

        max-width:1180px;

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



      .wrap{max-width:1180px;margin:0 auto;padding:24px 16px 120px}

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

        .wrap{padding:18px 12px 120px}

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

  <body>

    ${renderTopBar({ currentProfile, pageTitle, pageType })}

    ${body}



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

      `Connections: ${WEB_BASE}/connections/${profile.username}?key=${profile.editSecret || ""}`,

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



function renderTapzyAssistant() {

  return "";

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