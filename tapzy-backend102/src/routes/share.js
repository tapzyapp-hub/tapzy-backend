const router = require("express").Router();
const prisma = require("../prisma");
const { upload } = require("../upload");
const { shareLimiter, likeLimiter, momentLimiter } = require("../middleware");
const {
  cleanUsername,
  escapeHtml,
  formatPrettyLocal,
  safeUrl,
  publicAbsoluteUrl,
  ownerKeyQuery,
  requireOwnerAccess,
  hasSharedSomething,
  buildSharedFieldsFromProfile,
  buildConnectionActions,
  renderShell,
  renderTapzyAssistant,
  renderMomentLikeButton,
  createTapMoment,
  parseOptionalFloat,
  getFollowState,
  renderFollowButton,
  cryptoRandomSecret,
  ensureUniqueUsername,
  backUrl,
} = require("../utils");

function extractCoordinatesFromInput(input) {
  const raw = String(input || "").trim();
  if (!raw) return { location: null, latitude: null, longitude: null };

  const coordMatch = raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coordMatch) {
    return {
      location: raw,
      latitude: Number(coordMatch[1]),
      longitude: Number(coordMatch[2]),
    };
  }

  const atMatch = raw.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    return {
      location: raw,
      latitude: Number(atMatch[1]),
      longitude: Number(atMatch[2]),
    };
  }

  try {
    const url = new URL(raw);
    const q = url.searchParams.get("q") || url.searchParams.get("query") || "";
    const qMatch = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (qMatch) {
      return {
        location: raw,
        latitude: Number(qMatch[1]),
        longitude: Number(qMatch[2]),
      };
    }
  } catch {}

  return {
    location: raw,
    latitude: null,
    longitude: null,
  };
}

function renderPremiumSectionStyles() {
  return `
  <style>
    .tz-page-shell{
      max-width:1100px;
      margin:0 auto;
    }

    .tz-premium-hero{
      position:relative;
      overflow:hidden;
      border-radius:30px;
      border:1px solid rgba(255,255,255,.08);
      background:
        radial-gradient(880px 360px at 50% -5%, rgba(127,210,255,.10), transparent 48%),
        linear-gradient(180deg, rgba(10,12,18,.98), rgba(6,6,8,1));
      padding:28px;
      box-shadow:0 24px 70px rgba(0,0,0,.40);
    }

    .tz-premium-hero-glow{
      position:absolute;
      width:360px;
      height:360px;
      border-radius:999px;
      background:radial-gradient(circle, rgba(111,210,255,.18) 0%, rgba(111,210,255,.06) 36%, transparent 70%);
      right:-50px;
      top:-70px;
      filter:blur(14px);
      pointer-events:none;
    }

    .tz-kicker{
      color:#95a5bf;
      text-transform:uppercase;
      letter-spacing:4px;
      font-size:12px;
      margin-bottom:10px;
    }

    .tz-title{
      margin:0;
      font-size:44px;
      line-height:1;
      letter-spacing:-1px;
    }

    .tz-subtitle{
      margin-top:12px;
      max-width:740px;
      color:#a1afc3;
      line-height:1.7;
      font-size:14px;
    }

    .tz-section{
      margin-top:22px;
    }

    .tz-section-title{
      margin:0;
      font-size:24px;
      line-height:1.1;
    }

    .tz-section-head{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:12px;
      flex-wrap:wrap;
      margin-bottom:14px;
    }

    .tz-soft-card{
      border-radius:24px;
      border:1px solid rgba(255,255,255,.08);
      background:
        linear-gradient(180deg, rgba(18,20,28,.95), rgba(10,12,16,.98));
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.03),
        0 16px 40px rgba(0,0,0,.24);
      padding:18px;
    }

    .tz-list{
      display:grid;
      gap:14px;
    }

    .tz-mini-stat-grid{
      display:grid;
      grid-template-columns:repeat(3, minmax(0, 1fr));
      gap:14px;
      margin-top:18px;
    }

    .tz-mini-stat{
      border-radius:22px;
      border:1px solid rgba(255,255,255,.08);
      background:
        linear-gradient(180deg, rgba(20,22,30,.94), rgba(10,12,16,.98));
      padding:18px;
      text-align:center;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
    }

    .tz-mini-stat-num{
      font-size:28px;
      font-weight:800;
      line-height:1;
    }

    .tz-mini-stat-label{
      margin-top:8px;
      color:#93a0b4;
      font-size:12px;
      text-transform:uppercase;
      letter-spacing:1px;
    }

    .tz-action-grid{
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      margin-top:14px;
    }

    .tz-line-list{
      display:grid;
      gap:12px;
      margin-top:12px;
    }

    .tz-line-item{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:12px;
      padding:14px 0;
      border-top:1px solid rgba(255,255,255,.06);
      flex-wrap:wrap;
    }

    .tz-line-item:first-child{
      border-top:none;
      padding-top:0;
    }

    .tz-value-stack{
      display:grid;
      gap:8px;
      margin-top:12px;
      line-height:1.7;
      font-size:14px;
    }

    .tz-tag-row{
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      margin-top:12px;
    }

    .tz-tag{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      padding:7px 11px;
      border-radius:999px;
      border:1px solid rgba(255,255,255,.08);
      background:rgba(255,255,255,.04);
      color:#d9e4f2;
      font-size:12px;
    }

    .tz-form-grid{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:12px;
      margin-top:12px;
    }

    .tz-full{
      grid-column:1 / -1;
    }

    .tz-moment-card{
      border-radius:24px;
      border:1px solid rgba(255,255,255,.08);
      background:
        linear-gradient(180deg, rgba(20,22,30,.96), rgba(10,12,16,.98));
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.03),
        0 16px 38px rgba(0,0,0,.24);
      overflow:hidden;
    }

    .tz-moment-body{
      padding:18px;
    }

    .tz-map-frame{
      height:70vh;
      min-height:440px;
      border-radius:24px;
      margin-top:18px;
      overflow:hidden;
      border:1px solid rgba(255,255,255,.08);
      box-shadow:0 16px 40px rgba(0,0,0,.22);
    }

    .tz-empty{
      border-radius:22px;
      border:1px dashed rgba(255,255,255,.10);
      background:rgba(255,255,255,.03);
      padding:18px;
      color:#9fb0c8;
    }

    .tz-link{
      color:#dff4ff;
      text-decoration:none;
    }

    .tz-link:hover{
      text-decoration:underline;
    }

    details.tz-details{
      margin-top:10px;
      border-radius:18px;
      border:1px solid rgba(255,255,255,.08);
      background:rgba(255,255,255,.03);
      padding:12px 14px;
    }

    details.tz-details summary{
      cursor:pointer;
      font-weight:700;
      color:#eef6ff;
    }

    @media(max-width:900px){
      .tz-mini-stat-grid{
        grid-template-columns:1fr;
      }
    }

    @media(max-width:700px){
      .tz-premium-hero{
        padding:20px;
        border-radius:24px;
      }

      .tz-title{
        font-size:34px;
      }

      .tz-form-grid{
        grid-template-columns:1fr;
      }

      .tz-map-frame{
        min-height:360px;
      }
    }
  </style>
  `;
}

router.post("/share-back/:username", shareLimiter, upload.single("momentPhoto"), async (req, res) => {
  try {
    const username = cleanUsername(req.params.username);
    const receiver = await prisma.userProfile.findUnique({ where: { username } });
    if (!receiver) return res.status(404).send("Profile not found");

    const shared = {
      sharedName: String(req.body.name || "").trim() || null,
      sharedPhone: String(req.body.phone || "").trim() || null,
      sharedEmail: String(req.body.email || "").trim() || null,
      sharedWebsite: String(req.body.website || "").trim() || null,
      sharedInstagram: String(req.body.instagram || "").trim() || null,
      sharedLinkedin: String(req.body.linkedin || "").trim() || null,
      sharedTiktok: String(req.body.tiktok || "").trim() || null,
      sharedTwitter: String(req.body.twitter || "").trim() || null,
      sharedFacebook: String(req.body.facebook || "").trim() || null,
      sharedYoutube: String(req.body.youtube || "").trim() || null,
      sharedGithub: String(req.body.github || "").trim() || null,
      sharedSnapchat: String(req.body.snapchat || "").trim() || null,
      sharedWhatsapp: String(req.body.whatsapp || "").trim() || null,
      sharedTelegram: String(req.body.telegram || "").trim() || null,
    };

    if (!hasSharedSomething(shared)) {
      return res.status(400).send("Choose at least one thing to share.");
    }

    const momentNote = String(req.body.note || "").trim() || null;
    const momentEvent = String(req.body.eventName || "").trim() || null;
    const locationInput = String(req.body.locationInput || req.body.location || req.body.locationLabel || "").trim();
    const parsedLocation = extractCoordinatesFromInput(locationInput);

    const momentLocation = parsedLocation.location;
    const snapshotUrl = req.file
      ? publicAbsoluteUrl(req, `/uploads/${req.file.filename}`)
      : (String(req.body.snapshotUrl || "").trim() || null);

    const latitude = parsedLocation.latitude ?? parseOptionalFloat(req.body.latitude);
    const longitude = parsedLocation.longitude ?? parseOptionalFloat(req.body.longitude);

    let senderProfile = null;
    const senderUsername = cleanUsername(req.body.senderUsername || "");
    if (senderUsername) {
      senderProfile = await prisma.userProfile.findUnique({ where: { username: senderUsername } });
    }

    if (!senderProfile) {
      const guestName = shared.sharedName || "Tapzy Guest";
      const base = cleanUsername(guestName.replace(/\s+/g, "_")) || "guest";
      const newUsername = await ensureUniqueUsername(base);

      senderProfile = await prisma.userProfile.create({
        data: {
          username: newUsername,
          editSecret: cryptoRandomSecret(),
          name: shared.sharedName,
          phone: shared.sharedPhone,
          email: shared.sharedEmail,
          website: shared.sharedWebsite,
          instagram: shared.sharedInstagram,
          linkedin: shared.sharedLinkedin,
          tiktok: shared.sharedTiktok,
          twitter: shared.sharedTwitter,
          facebook: shared.sharedFacebook,
          youtube: shared.sharedYoutube,
          github: shared.sharedGithub,
          snapchat: shared.sharedSnapchat,
          whatsapp: shared.sharedWhatsapp,
          telegram: shared.sharedTelegram,
        },
      });
    }

    await prisma.connection.create({
      data: {
        senderProfileId: senderProfile.id,
        receiverProfileId: receiver.id,
        ...shared,
      },
    });

    await prisma.userProfile.update({
      where: { id: receiver.id },
      data: { connections: { increment: 1 } },
    });

    await createTapMoment({
      senderProfileId: senderProfile.id,
      receiverProfileId: receiver.id,
      note: momentNote,
      eventName: momentEvent,
      location: momentLocation,
      latitude,
      longitude,
      snapshotUrl,
    });

    return res.redirect(302, `/u/${receiver.username}?shared=1`);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Share back error");
  }
});

router.post("/share-back-auth/:username", shareLimiter, upload.single("momentPhoto"), async (req, res) => {
  try {
    const receiverUsername = cleanUsername(req.params.username);
    const receiver = await prisma.userProfile.findUnique({ where: { username: receiverUsername } });
    if (!receiver) return res.status(404).send("Receiver profile not found");

    const sender = req.currentProfile;
    if (!sender) return res.status(401).send("Please sign in first.");
    if (sender.id === receiver.id) return res.status(400).send("You cannot share your profile back to yourself.");

    const shared = buildSharedFieldsFromProfile(sender);
    if (!hasSharedSomething(shared)) {
      return res.status(400).send("Your Tapzy account has no Quick Share fields enabled.");
    }

    const momentNote = String(req.body.note || "").trim() || null;
    const momentEvent = String(req.body.eventName || "").trim() || null;
    const locationInput = String(req.body.locationInput || req.body.location || req.body.locationLabel || "").trim();
    const parsedLocation = extractCoordinatesFromInput(locationInput);

    const momentLocation = parsedLocation.location;
    const snapshotUrl = req.file
      ? publicAbsoluteUrl(req, `/uploads/${req.file.filename}`)
      : (String(req.body.snapshotUrl || "").trim() || null);

    const latitude = parsedLocation.latitude ?? parseOptionalFloat(req.body.latitude);
    const longitude = parsedLocation.longitude ?? parseOptionalFloat(req.body.longitude);

    await prisma.connection.create({
      data: {
        senderProfileId: sender.id,
        receiverProfileId: receiver.id,
        ...shared,
      },
    });

    await prisma.userProfile.update({
      where: { id: receiver.id },
      data: { connections: { increment: 1 } },
    });

    await createTapMoment({
      senderProfileId: sender.id,
      receiverProfileId: receiver.id,
      note: momentNote,
      eventName: momentEvent,
      location: momentLocation,
      latitude,
      longitude,
      snapshotUrl,
    });

    return res.redirect(302, `/u/${receiver.username}?shared=1&quick=1`);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Quick share error");
  }
});

router.get("/connections/:username", async (req, res) => {
  try {
    const username = cleanUsername(req.params.username);
    const profile = await prisma.userProfile.findUnique({ where: { username } });
    if (!profile) return res.status(404).send("Profile not found");
    if (!requireOwnerAccess(profile, req, res)) return;

    const keyQuery = ownerKeyQuery(req, profile);

    const receivedConnections = await prisma.connection.findMany({
      where: { receiverProfileId: profile.id },
      include: { senderProfile: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const body = `
    <div class="wrap">
      <div class="tz-page-shell">
        <section class="tz-premium-hero">
          <div class="tz-premium-hero-glow"></div>

          <div class="row-between" style="position:relative;z-index:2;">
            <div>
              <div class="tz-kicker">Tapzy Storage</div>
              <h1 class="tz-title">Connections</h1>
              <div class="tz-subtitle">
                Saved contact details and social actions from people who shared with you through Tapzy.
              </div>
            </div>

            <div class="row">
              <a class="btn" href="/edit/${profile.username}${keyQuery}">Back to Edit</a>
            
            </div>
          </div>
        </section>

        <section class="tz-section">
          <div class="tz-section-head">
            <h2 class="tz-section-title">Saved Connections</h2>
            <div class="muted">${receivedConnections.length} saved</div>
          </div>

          <div class="tz-list">
            ${
              receivedConnections.length
                ? receivedConnections.map((c) => {
                    const senderName = c.senderProfile?.name || c.sharedName || c.senderProfile?.username || "Tapzy Connection";
                    const actions = buildConnectionActions(c);

                    return `
                    <div class="tz-soft-card">
                      <div class="row-between">
                        <div>
                          <div class="muted">${escapeHtml(formatPrettyLocal(c.createdAt))}</div>
                          <div style="font-size:22px;font-weight:800;margin-top:6px;">${escapeHtml(senderName)}</div>
                          <div class="muted" style="margin-top:6px;">
                            ${c.senderProfile?.username ? `@${escapeHtml(c.senderProfile.username)}` : "Guest Tapzy profile"}
                          </div>
                        </div>
                        ${
                          c.senderProfile?.username
                            ? `<a class="btn btnDark" href="/u/${escapeHtml(c.senderProfile.username)}">Open Profile</a>`
                            : ""
                        }
                      </div>

                      <div class="tz-value-stack">
                        ${c.sharedName ? `<div><b>Name:</b> ${escapeHtml(c.sharedName)}</div>` : ""}
                        ${c.sharedPhone ? `<div><b>Phone:</b> ${escapeHtml(c.sharedPhone)}</div>` : ""}
                        ${c.sharedEmail ? `<div><b>Email:</b> ${escapeHtml(c.sharedEmail)}</div>` : ""}
                        ${
                          c.sharedWebsite
                            ? `<div><b>Website:</b> <a class="tz-link" target="_blank" rel="noopener noreferrer" href="${escapeHtml(safeUrl(c.sharedWebsite))}">${escapeHtml(safeUrl(c.sharedWebsite))}</a></div>`
                            : ""
                        }
                      </div>

                      <div class="tz-tag-row">
                        ${c.sharedInstagram ? `<span class="tz-tag">Instagram</span>` : ""}
                        ${c.sharedLinkedin ? `<span class="tz-tag">LinkedIn</span>` : ""}
                        ${c.sharedTiktok ? `<span class="tz-tag">TikTok</span>` : ""}
                        ${c.sharedTwitter ? `<span class="tz-tag">X</span>` : ""}
                        ${c.sharedFacebook ? `<span class="tz-tag">Facebook</span>` : ""}
                        ${c.sharedYoutube ? `<span class="tz-tag">YouTube</span>` : ""}
                        ${c.sharedGithub ? `<span class="tz-tag">GitHub</span>` : ""}
                        ${c.sharedSnapchat ? `<span class="tz-tag">Snapchat</span>` : ""}
                        ${c.sharedWhatsapp ? `<span class="tz-tag">WhatsApp</span>` : ""}
                        ${c.sharedTelegram ? `<span class="tz-tag">Telegram</span>` : ""}
                      </div>

                      <div class="tz-action-grid">
                        ${
                          actions.length
                            ? actions.map((a) => `<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="${escapeHtml(a.url)}">${escapeHtml(a.label)}</a>`).join("")
                            : `<div class="muted">No actions saved for this connection yet.</div>`
                        }
                      </div>
                    </div>
                    `;
                  }).join("")
                : `<div class="tz-empty">No saved connections yet.</div>`
            }
          </div>
        </section>
      </div>
    </div>
    ${renderPremiumSectionStyles()}
    ${renderTapzyAssistant({ username: profile.username || "User", pageType: "connections" })}
    `;

    res.send(renderShell(`Connections • ${profile.username}`, body, "", {
      currentProfile: req.currentProfile || null,
      pageTitle: "Connections",
      pageType: "connections",
    }));
  } catch (e) {
    console.error(e);
    return res.status(500).send("Connections error");
  }
});

router.post("/moment-like/:id", likeLimiter, async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).send("Please sign in first.");

    const id = String(req.params.id || "").trim();
    const moment = await prisma.tapMoment.findUnique({ where: { id } });
    if (!moment) return res.status(404).send("Moment not found.");

    await prisma.tapMomentLike.upsert({
      where: {
        profileId_momentId: {
          profileId: currentProfile.id,
          momentId: id,
        },
      },
      update: {},
      create: {
        profileId: currentProfile.id,
        momentId: id,
      },
    });

    return res.redirect(302, backUrl(req, "/"));
  } catch (e) {
    console.error(e);
    return res.status(500).send("Moment like error");
  }
});

router.post("/moment-unlike/:id", likeLimiter, async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).send("Please sign in first.");

    const id = String(req.params.id || "").trim();

    await prisma.tapMomentLike.deleteMany({
      where: {
        profileId: currentProfile.id,
        momentId: id,
      },
    });

    return res.redirect(302, backUrl(req, "/"));
  } catch (e) {
    console.error(e);
    return res.status(500).send("Moment unlike error");
  }
});

router.get("/vault/:username", async (req, res) => {
  try {
    const username = cleanUsername(req.params.username);
    const profile = await prisma.userProfile.findUnique({ where: { username } });
    if (!profile) return res.status(404).send("Profile not found");
    if (!requireOwnerAccess(profile, req, res)) return;

    const keyQuery = ownerKeyQuery(req, profile);

    const moments = await prisma.tapMoment.findMany({
      where: {
        OR: [{ senderProfileId: profile.id }, { receiverProfileId: profile.id }],
      },
      include: {
        senderProfile: true,
        receiverProfile: true,
        _count: { select: { likes: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const currentProfile = req.currentProfile || null;
    const likedSet = new Set();

    if (currentProfile && moments.length) {
      const likedRows = await prisma.tapMomentLike.findMany({
        where: {
          profileId: currentProfile.id,
          momentId: { in: moments.map((m) => m.id) },
        },
        select: { momentId: true },
      });
      for (const row of likedRows) likedSet.add(row.momentId);
    }

    const body = `
    <div class="wrap">
      <div class="tz-page-shell">
        <section class="tz-premium-hero">
          <div class="tz-premium-hero-glow"></div>

          <div class="row-between" style="position:relative;z-index:2;">
            <div>
              <div class="tz-kicker">Tapzy Timeline</div>
              <h1 class="tz-title">Vault</h1>
              <div class="tz-subtitle">
                Your private Tapzy Moments timeline for @${escapeHtml(profile.username || "user")}.
              </div>
            </div>

            <div class="row">
              <a class="btn" href="/edit/${profile.username}${keyQuery}">Back to Edit</a>
              <a class="btn btnDark" href="/connections/${profile.username}${keyQuery}">Connections</a>
              <a class="btn btnDark" href="/map/${profile.username}${keyQuery}">Map</a>
            </div>
          </div>
        </section>

        <section class="tz-section">
          <div class="tz-soft-card">
            <div class="tz-section-head" style="margin-bottom:8px;">
              <h2 class="tz-section-title">Add Manual Moment</h2>
              <div class="muted">Create a premium entry for your Tapzy history</div>
            </div>

            <form method="POST" action="/moment/add/${profile.username}${keyQuery}" enctype="multipart/form-data">
              <div class="tz-form-grid">
                <input name="withUsername" placeholder="Other Tapzy username (optional)" />
                <input name="eventName" placeholder="Event / place" />
                <input class="tz-full" name="locationInput" placeholder="Paste address or Google Maps link" />
              </div>

              <details class="tz-details">
                <summary>Optional manual coordinates</summary>
                <div class="tz-form-grid" style="margin-top:12px;">
                  <input name="latitude" placeholder="Latitude" />
                  <input name="longitude" placeholder="Longitude" />
                </div>
              </details>

              <div class="tz-form-grid">
                <input class="tz-full" name="snapshotUrl" placeholder="Snapshot URL" />
                <input class="tz-full" type="file" name="momentPhoto" accept="image/png,image/jpeg,image/webp" capture="user" />
                <textarea class="tz-full" name="note" placeholder="Short note"></textarea>
              </div>

              <button class="btn btnFull" style="margin-top:12px;" type="submit">Save Moment</button>
            </form>
          </div>
        </section>

        <section class="tz-section">
          <div class="tz-section-head">
            <h2 class="tz-section-title">Recent Moments</h2>
            <div class="muted">${moments.length} total</div>
          </div>

          <div class="tz-list">
            ${
              moments.length
                ? moments.map((m) => {
                    const other = m.senderProfileId === profile.id ? m.receiverProfile : m.senderProfile;

                    return `
                    <div class="tz-moment-card">
                      ${m.snapshotUrl ? `<img src="${escapeHtml(m.snapshotUrl)}" alt="Tapzy snapshot" style="display:block;width:100%;max-height:380px;object-fit:cover;" />` : ""}
                      <div class="tz-moment-body">
                        <div class="muted">${escapeHtml(formatPrettyLocal(m.createdAt))}</div>
                        <div style="font-size:22px;font-weight:800;margin-top:6px;">
                          ${escapeHtml(other?.name || other?.username || "Tapzy connection")}
                        </div>

                        <div class="tz-value-stack">
                          ${other?.username ? `<div><b>Profile:</b> <a class="tz-link" href="/u/${escapeHtml(other.username)}">@${escapeHtml(other.username)}</a></div>` : ""}
                          ${m.eventName ? `<div><b>Event:</b> ${escapeHtml(m.eventName)}</div>` : ""}
                          ${m.location ? `<div><b>Location:</b> ${escapeHtml(m.location)}</div>` : ""}
                          ${m.note ? `<div><b>Note:</b> ${escapeHtml(m.note)}</div>` : ""}
                          ${(m.latitude !== null && m.longitude !== null) ? `<div><b>Coords:</b> ${escapeHtml(String(m.latitude))}, ${escapeHtml(String(m.longitude))}</div>` : ""}
                        </div>

                        <div style="margin-top:14px;">
                          ${renderMomentLikeButton(currentProfile, m, likedSet.has(m.id), false)}
                        </div>
                      </div>
                    </div>
                    `;
                  }).join("")
                : `<div class="tz-empty">No moments yet.</div>`
            }
          </div>
        </section>
      </div>
    </div>
    ${renderPremiumSectionStyles()}
    ${renderTapzyAssistant({ username: profile.username || "User", pageType: "vault" })}
    `;

    res.send(renderShell(`Vault • ${profile.username}`, body, "", {
      currentProfile,
      pageTitle: "Vault",
      pageType: "vault",
    }));
  } catch (e) {
    console.error(e);
    return res.status(500).send("Vault error");
  }
});

router.post("/moment/add/:username", momentLimiter, upload.single("momentPhoto"), async (req, res) => {
  try {
    const username = cleanUsername(req.params.username);
    const profile = await prisma.userProfile.findUnique({ where: { username } });
    if (!profile) return res.status(404).send("Profile not found");
    if (!requireOwnerAccess(profile, req, res)) return;

    const keyQuery = ownerKeyQuery(req, profile);
    const withUsername = cleanUsername(req.body.withUsername || "");

    let other = null;
    if (withUsername) other = await prisma.userProfile.findUnique({ where: { username: withUsername } });
    if (!other) other = profile;

    const snapshotUrl = req.file
      ? publicAbsoluteUrl(req, `/uploads/${req.file.filename}`)
      : (String(req.body.snapshotUrl || "").trim() || null);

    const locationInput = String(req.body.locationInput || req.body.location || "").trim();
    const parsedLocation = extractCoordinatesFromInput(locationInput);

    await createTapMoment({
      senderProfileId: profile.id,
      receiverProfileId: other.id,
      note: String(req.body.note || "").trim() || null,
      eventName: String(req.body.eventName || "").trim() || null,
      location: parsedLocation.location,
      latitude: parsedLocation.latitude ?? parseOptionalFloat(req.body.latitude),
      longitude: parsedLocation.longitude ?? parseOptionalFloat(req.body.longitude),
      snapshotUrl,
    });

    return res.redirect(302, `/vault/${profile.username}${keyQuery}`);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Moment add error");
  }
});

router.get("/map/:username", async (req, res) => {
  try {
    const username = cleanUsername(req.params.username);
    const profile = await prisma.userProfile.findUnique({ where: { username } });
    if (!profile) return res.status(404).send("Profile not found");
    if (!requireOwnerAccess(profile, req, res)) return;

    const keyQuery = ownerKeyQuery(req, profile);

    const moments = await prisma.tapMoment.findMany({
      where: {
        OR: [{ senderProfileId: profile.id }, { receiverProfileId: profile.id }],
        latitude: { not: null },
        longitude: { not: null },
      },
      include: {
        senderProfile: true,
        receiverProfile: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const pins = moments.map((m) => {
      const other = m.senderProfileId === profile.id ? m.receiverProfile : m.senderProfile;
      return {
        lat: m.latitude,
        lng: m.longitude,
        title: other?.name || other?.username || "Tapzy connection",
        username: other?.username || "",
        eventName: m.eventName || "",
        location: m.location || "",
        note: m.note || "",
        createdAt: formatPrettyLocal(m.createdAt),
      };
    });

    const body = `
    <div class="wrap">
      <div class="tz-page-shell">
        <section class="tz-premium-hero">
          <div class="tz-premium-hero-glow"></div>

          <div class="row-between" style="position:relative;z-index:2;">
            <div>
              <div class="tz-kicker">Tapzy Geo Layer</div>
              <h1 class="tz-title">Connection Map</h1>
              <div class="tz-subtitle">
                Pins from Tapzy Moments with saved coordinates. Add a Google Maps link, address, or manual coordinates when saving a moment.
              </div>
            </div>

            <div class="row">
              <a class="btn" href="/edit/${profile.username}${keyQuery}">Back to Edit</a>
              <a class="btn btnDark" href="/vault/${profile.username}${keyQuery}">Vault</a>
              <a class="btn btnDark" href="/connections/${profile.username}${keyQuery}">Connections</a>
            </div>
          </div>
        </section>

        <section class="tz-section">
          <div class="tz-soft-card">
            <div class="row-between">
              <div>
                <h2 class="tz-section-title" style="margin:0;">Mapped Moments</h2>
                <div class="muted" style="margin-top:8px;">${pins.length} pin${pins.length === 1 ? "" : "s"} available</div>
              </div>
            </div>

            <div id="map" class="tz-map-frame"></div>
          </div>
        </section>
      </div>
    </div>

    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const pins = ${JSON.stringify(pins)};

      function esc(s) {
        return String(s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      const map = L.map("map").setView([43.6532, -79.3832], pins.length ? 10 : 5);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
      }).addTo(map);

      if (pins.length) {
        const bounds = [];
        for (const p of pins) {
          const marker = L.marker([p.lat, p.lng]).addTo(map);
          marker.bindPopup(
            "<b>" + esc(p.title || "Tapzy connection") + "</b><br/>" +
            (p.username ? "@" + esc(p.username) + "<br/>" : "") +
            (p.eventName ? "Event: " + esc(p.eventName) + "<br/>" : "") +
            (p.location ? "Location: " + esc(p.location) + "<br/>" : "") +
            (p.note ? "Note: " + esc(p.note) + "<br/>" : "") +
            "Saved: " + esc(p.createdAt)
          );
          bounds.push([p.lat, p.lng]);
        }
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    </script>
    ${renderPremiumSectionStyles()}
    ${renderTapzyAssistant({ username: profile.username || "User", pageType: "map" })}
    `;

    res.send(renderShell(`Map • ${profile.username}`, body, "", {
      currentProfile: req.currentProfile || null,
      pageTitle: "Map",
      pageType: "map",
    }));
  } catch (e) {
    console.error(e);
    return res.status(500).send("Map error");
  }
});

router.get("/network/:username", async (req, res) => {
  try {
    const username = cleanUsername(req.params.username);

    const profile = await prisma.userProfile.findUnique({
      where: { username },
      include: {
        followers: {
          include: { followerProfile: true },
          orderBy: { createdAt: "desc" },
        },
        following: {
          include: { followingProfile: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!profile) return res.status(404).send("Profile not found");

    const connections = await prisma.connection.findMany({
      where: {
        OR: [{ senderProfileId: profile.id }, { receiverProfileId: profile.id }],
      },
      include: { senderProfile: true, receiverProfile: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const moments = await prisma.tapMoment.findMany({
      where: {
        OR: [{ senderProfileId: profile.id }, { receiverProfileId: profile.id }],
      },
      include: {
        senderProfile: true,
        receiverProfile: true,
        _count: { select: { likes: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const currentProfile = req.currentProfile || null;
    const followState = await getFollowState(currentProfile?.id, profile.id);

    const likedSet = new Set();
    if (currentProfile && moments.length) {
      const likedRows = await prisma.tapMomentLike.findMany({
        where: {
          profileId: currentProfile.id,
          momentId: { in: moments.map((m) => m.id) },
        },
        select: { momentId: true },
      });
      for (const row of likedRows) likedSet.add(row.momentId);
    }

    const momentMap = new Map();
    for (const m of moments) {
      const otherId = m.senderProfileId === profile.id ? m.receiverProfileId : m.senderProfileId;
      if (!momentMap.has(otherId)) momentMap.set(otherId, m);
    }

    const seen = new Set();
    const networkRows = [];
    for (const c of connections) {
      const other = c.senderProfileId === profile.id ? c.receiverProfile : c.senderProfile;
      if (!other || seen.has(other.id)) continue;
      seen.add(other.id);

      const moment = momentMap.get(other.id) || null;
      const isLiked = !!(moment && likedSet.has(moment.id));

      networkRows.push({
        other,
        connectedAt: c.createdAt,
        moment,
        isLiked,
      });
    }

    const body = `
    <div class="wrap">
      <div class="tz-page-shell">
        <section class="tz-premium-hero">
          <div class="tz-premium-hero-glow"></div>

          <div class="row-between" style="position:relative;z-index:2;">
            <div>
              <div class="tz-kicker">Tapzy Graph</div>
              <h1 class="tz-title">Network</h1>
              <div class="tz-subtitle">
                Real-world connections, follow relationships, and recent Tapzy activity for @${escapeHtml(profile.username || "user")}.
              </div>
            </div>

            <div class="row">
              <a class="btn btnDark" href="/u/${profile.username}">Back to Profile</a>
              ${renderFollowButton(currentProfile, profile, followState.isFollowing)}
            </div>
          </div>
        </section>

        <section class="tz-section">
          <div class="tz-mini-stat-grid">
            <div class="tz-mini-stat">
              <div class="tz-mini-stat-num">${networkRows.length}</div>
              <div class="tz-mini-stat-label">Connections</div>
            </div>
            <div class="tz-mini-stat">
              <div class="tz-mini-stat-num">${profile.following.length}</div>
              <div class="tz-mini-stat-label">Following</div>
            </div>
            <div class="tz-mini-stat">
              <div class="tz-mini-stat-num">${profile.followers.length}</div>
              <div class="tz-mini-stat-label">Followers</div>
            </div>
          </div>
        </section>

        <section class="tz-section">
          <div class="tz-form-grid">
            <div class="tz-soft-card">
              <div class="tz-section-head" style="margin-bottom:8px;">
                <h2 class="tz-section-title">Following</h2>
                <div class="muted">${profile.following.length}</div>
              </div>

              <div class="tz-line-list">
                ${
                  profile.following.length
                    ? profile.following.slice(0, 20).map((f) => `
                      <div class="tz-line-item">
                        <div>
                          <div style="font-weight:800;">@${escapeHtml(f.followingProfile.username || "user")}</div>
                          <div class="muted" style="margin-top:6px;">${escapeHtml(f.followingProfile.name || "")}</div>
                        </div>
                        <a class="btn btnDark" href="/u/${escapeHtml(f.followingProfile.username || "")}">View</a>
                      </div>
                    `).join("")
                    : `<div class="tz-empty">No following yet.</div>`
                }
              </div>
            </div>

            <div class="tz-soft-card">
              <div class="tz-section-head" style="margin-bottom:8px;">
                <h2 class="tz-section-title">Followers</h2>
                <div class="muted">${profile.followers.length}</div>
              </div>

              <div class="tz-line-list">
                ${
                  profile.followers.length
                    ? profile.followers.slice(0, 20).map((f) => `
                      <div class="tz-line-item">
                        <div>
                          <div style="font-weight:800;">@${escapeHtml(f.followerProfile.username || "user")}</div>
                          <div class="muted" style="margin-top:6px;">${escapeHtml(f.followerProfile.name || "")}</div>
                        </div>
                        <a class="btn btnDark" href="/u/${escapeHtml(f.followerProfile.username || "")}">View</a>
                      </div>
                    `).join("")
                    : `<div class="tz-empty">No followers yet.</div>`
                }
              </div>
            </div>
          </div>
        </section>

        <section class="tz-section">
          <div class="tz-section-head">
            <h2 class="tz-section-title">Recent Connections</h2>
            <div class="muted">${networkRows.length} shown</div>
          </div>

          <div class="tz-list">
            ${
              networkRows.length
                ? networkRows.map((row) => `
                  <div class="tz-soft-card">
                    <div class="row-between">
                      <div>
                        <div style="font-size:22px;font-weight:800;">${escapeHtml(row.other.name || "Tapzy User")}</div>
                        <div class="muted" style="margin-top:6px;">@${escapeHtml(row.other.username || "user")}</div>
                      </div>

                      <div class="muted">${escapeHtml(formatPrettyLocal(row.connectedAt))}</div>
                    </div>

                    <div class="tz-value-stack">
                      <div><b>Connected:</b> ${escapeHtml(formatPrettyLocal(row.connectedAt))}</div>
                      ${row.moment?.eventName ? `<div><b>Event:</b> ${escapeHtml(row.moment.eventName)}</div>` : ""}
                      ${row.moment?.location ? `<div><b>Location:</b> ${escapeHtml(row.moment.location)}</div>` : ""}
                      ${row.moment?.note ? `<div><b>Note:</b> ${escapeHtml(row.moment.note)}</div>` : ""}
                    </div>

                    <div class="tz-action-grid">
                      <a class="btn" href="/u/${escapeHtml(row.other.username || "")}">Open Profile</a>
                      <a class="btn btnDark" href="/network/${escapeHtml(row.other.username || "")}">View Network</a>
                      ${row.moment ? renderMomentLikeButton(currentProfile, row.moment, row.isLiked, true) : ""}
                    </div>
                  </div>
                `).join("")
                : `<div class="tz-empty">No connections yet.</div>`
            }
          </div>
        </section>
      </div>
    </div>
    ${renderPremiumSectionStyles()}
    ${renderTapzyAssistant({ username: profile.username || "User", pageType: "network" })}
    `;

    res.send(renderShell(`Network • ${profile.username}`, body, "", {
      currentProfile,
      pageTitle: "Network",
      pageType: "network",
    }));
  } catch (e) {
    console.error(e);
    return res.status(500).send("Network error");
  }
});

module.exports = router;
