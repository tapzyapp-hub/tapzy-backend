const router = require("express").Router();
const prisma = require("../prisma");
const { upload } = require("../upload");
const { shareLimiter } = require("../middleware");
const {
  cleanUsername,
  escapeHtml,
  publicAbsoluteUrl,
  hasSharedSomething,
  buildSharedFieldsFromProfile,
  renderShell,
  renderTapzyAssistant,
  createTapMoment,
  parseOptionalFloat,
  cryptoRandomSecret,
  ensureUniqueUsername,
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

router.all(
  [
    "/connections/:username",
    "/vault/:username",
    "/map/:username",
    "/network/:username",
    "/moment/add/:username",
    "/moment-like/:id",
    "/moment-unlike/:id",
  ],
  (_req, res) => {
    res.status(410).send("This Tapzy feature has been removed.");
  }
);

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


module.exports = router;
