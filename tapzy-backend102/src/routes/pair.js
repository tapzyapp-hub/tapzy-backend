const router = require("express").Router();
const prisma = require("../prisma");
const {
  escapeHtml,
  renderShell,
  renderTapzyAssistant,
  buildSharedFieldsFromProfile,
} = require("../utils");

const MAX_PARTICIPANTS = 10;
const ROOM_MIN_PARTICIPANTS = 2;
const ROOM_TTL_MS = 15 * 60 * 1000;

function generatePairCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function getDefaultSelectedFields(profile) {
  return {
    shareNameEnabled: !!profile.shareNameEnabled,
    sharePhoneEnabled: !!profile.sharePhoneEnabled,
    shareEmailEnabled: !!profile.shareEmailEnabled,
    shareWebsiteEnabled: !!profile.shareWebsiteEnabled,
    shareInstagramEnabled: !!profile.shareInstagramEnabled,
    shareLinkedinEnabled: !!profile.shareLinkedinEnabled,
    shareTiktokEnabled: !!profile.shareTiktokEnabled,
    shareTwitterEnabled: !!profile.shareTwitterEnabled,
    shareFacebookEnabled: !!profile.shareFacebookEnabled,
    shareYoutubeEnabled: !!profile.shareYoutubeEnabled,
    shareGithubEnabled: !!profile.shareGithubEnabled,
    shareSnapchatEnabled: !!profile.shareSnapchatEnabled,
    shareWhatsappEnabled: !!profile.shareWhatsappEnabled,
    shareTelegramEnabled: !!profile.shareTelegramEnabled,
  };
}

function getSelectedFieldsFromBody(body) {
  return {
    shareNameEnabled: !!body.shareNameEnabled,
    sharePhoneEnabled: !!body.sharePhoneEnabled,
    shareEmailEnabled: !!body.shareEmailEnabled,
    shareWebsiteEnabled: !!body.shareWebsiteEnabled,
    shareInstagramEnabled: !!body.shareInstagramEnabled,
    shareLinkedinEnabled: !!body.shareLinkedinEnabled,
    shareTiktokEnabled: !!body.shareTiktokEnabled,
    shareTwitterEnabled: !!body.shareTwitterEnabled,
    shareFacebookEnabled: !!body.shareFacebookEnabled,
    shareYoutubeEnabled: !!body.shareYoutubeEnabled,
    shareGithubEnabled: !!body.shareGithubEnabled,
    shareSnapchatEnabled: !!body.shareSnapchatEnabled,
    shareWhatsappEnabled: !!body.shareWhatsappEnabled,
    shareTelegramEnabled: !!body.shareTelegramEnabled,
  };
}

function applySelectedFields(profile, selectedFields) {
  const original = buildSharedFieldsFromProfile({
    ...profile,
    quickShareEnabled: true,
  });

  return {
    sharedName: selectedFields?.shareNameEnabled ? original.sharedName : null,
    sharedPhone: selectedFields?.sharePhoneEnabled ? original.sharedPhone : null,
    sharedEmail: selectedFields?.shareEmailEnabled ? original.sharedEmail : null,
    sharedWebsite: selectedFields?.shareWebsiteEnabled ? original.sharedWebsite : null,
    sharedInstagram: selectedFields?.shareInstagramEnabled ? original.sharedInstagram : null,
    sharedLinkedin: selectedFields?.shareLinkedinEnabled ? original.sharedLinkedin : null,
    sharedTiktok: selectedFields?.shareTiktokEnabled ? original.sharedTiktok : null,
    sharedTwitter: selectedFields?.shareTwitterEnabled ? original.sharedTwitter : null,
    sharedFacebook: selectedFields?.shareFacebookEnabled ? original.sharedFacebook : null,
    sharedYoutube: selectedFields?.shareYoutubeEnabled ? original.sharedYoutube : null,
    sharedGithub: selectedFields?.shareGithubEnabled ? original.sharedGithub : null,
    sharedSnapchat: selectedFields?.shareSnapchatEnabled ? original.sharedSnapchat : null,
    sharedWhatsapp: selectedFields?.shareWhatsappEnabled ? original.sharedWhatsapp : null,
    sharedTelegram: selectedFields?.shareTelegramEnabled ? original.sharedTelegram : null,
  };
}

function getRoomStatus(room) {
  if (!room) return "missing";
  if (room.completedAt) return "completed";
  if (room.expiresAt && room.expiresAt < new Date()) return "expired";
  return room.status || "waiting";
}

function isRoomHost(room, profileId) {
  return room.createdByProfileId === profileId;
}

async function markRoomExpiredIfNeeded(room) {
  if (!room) return room;
  if (room.completedAt) return room;

  if (room.expiresAt && room.expiresAt < new Date() && room.status !== "expired") {
    const updated = await prisma.pairRoom.update({
      where: { id: room.id },
      data: { status: "expired" },
    });
    return { ...room, ...updated, status: "expired" };
  }

  return room;
}

async function createCompletedPairExchange(roomId) {
  return prisma.$transaction(async (tx) => {
    const room = await tx.pairRoom.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: { profile: true },
          orderBy: { joinedAt: "asc" },
        },
      },
    });

    if (!room) return { ok: false, reason: "missing" };
    if (room.completedAt) return { ok: true, alreadyCompleted: true };

    if (room.expiresAt < new Date()) {
      await tx.pairRoom.update({
        where: { id: room.id },
        data: { status: "expired" },
      });
      return { ok: false, reason: "expired" };
    }

    if (room.participants.length < ROOM_MIN_PARTICIPANTS) {
      return { ok: false, reason: "not-enough-participants" };
    }

    if (!room.participants.every((p) => !!p.isReady)) {
      return { ok: false, reason: "not-all-ready" };
    }

    await tx.pairRoom.update({
      where: { id: room.id },
      data: { status: "pairing" },
    });

    const connectionIncrements = new Map();

    async function createConnectionIfMissing(data) {
      try {
        await tx.connection.create({ data });
        return true;
      } catch (e) {
        if (e?.code === "P2002") return false;
        throw e;
      }
    }

    for (let i = 0; i < room.participants.length; i++) {
      for (let j = i + 1; j < room.participants.length; j++) {
        const a = room.participants[i];
        const b = room.participants[j];

        const aShared = applySelectedFields(
          a.profile,
          a.selectedFields || getDefaultSelectedFields(a.profile)
        );

        const bShared = applySelectedFields(
          b.profile,
          b.selectedFields || getDefaultSelectedFields(b.profile)
        );

        const createdAB = await createConnectionIfMissing({
          senderProfileId: a.profileId,
          receiverProfileId: b.profileId,
          ...aShared,
        });

        if (createdAB) {
          connectionIncrements.set(
            a.profileId,
            (connectionIncrements.get(a.profileId) || 0) + 1
          );

          await tx.tapMoment.create({
            data: {
              senderProfileId: a.profileId,
              receiverProfileId: b.profileId,
              eventName: "Tapzy Group Pair",
              location: "Tapzy Pair Room",
              note: `Connected in Tapzy room ${room.code}`,
            },
          });
        }

        const createdBA = await createConnectionIfMissing({
          senderProfileId: b.profileId,
          receiverProfileId: a.profileId,
          ...bShared,
        });

        if (createdBA) {
          connectionIncrements.set(
            b.profileId,
            (connectionIncrements.get(b.profileId) || 0) + 1
          );

          await tx.tapMoment.create({
            data: {
              senderProfileId: b.profileId,
              receiverProfileId: a.profileId,
              eventName: "Tapzy Group Pair",
              location: "Tapzy Pair Room",
              note: `Connected in Tapzy room ${room.code}`,
            },
          });
        }
      }
    }

    for (const [profileId, incrementBy] of connectionIncrements.entries()) {
      if (incrementBy > 0) {
        await tx.userProfile.update({
          where: { id: profileId },
          data: { connections: { increment: incrementBy } },
        });
      }
    }

    await tx.pairRoom.update({
      where: { id: room.id },
      data: {
        status: "completed",
        completedAt: new Date(),
      },
    });

    return { ok: true };
  });
}

router.get("/pair", async (req, res) => {
  const currentProfile = req.currentProfile;
  if (!currentProfile) return res.redirect("/auth");

  const body = `
  <div class="wrap" style="max-width:980px;">
    <div class="card">
      <div class="pair-hero">
        <div class="pair-core">
          <div class="pair-ring ring-1"></div>
          <div class="pair-ring ring-2"></div>
          <div class="pair-ring ring-3"></div>
          <div class="pair-center"></div>
        </div>

        <div style="text-align:center;margin-top:26px;">
          <div class="muted" style="letter-spacing:2px;text-transform:uppercase;">Tapzy Group Pair</div>
          <h1 style="margin:10px 0 0 0;">Premium Networking</h1>
          <div class="muted" style="max-width:620px;margin:12px auto 0 auto;line-height:1.7;">
         Seamlessly exchange contacts and socials phone-to-phone with up to               ${MAX_PARTICIPANTS} people at once.
          </div>
        </div>
      </div>

      <div class="grid-2" style="margin-top:24px;">
        <div class="panel">
          <h3 style="margin-top:0;">Create Group Room</h3>
          <div class="muted">Start a Tapzy pairing room on this device.</div>

          <form method="POST" action="/pair/create" style="margin-top:14px;">
            <button class="btn btnFull" type="submit">Create Tapzy Room</button>
          </form>
        </div>

        <div class="panel">
          <h3 style="margin-top:0;">Join Group Room</h3>
          <div class="muted">Enter the 6-character room code from the host device.</div>

          <form method="POST" action="/pair/join" style="margin-top:14px;">
            <label>Room Code</label>
            <input name="code" maxlength="6" placeholder="AB12CD" required />
            <button class="btn btnFull" style="margin-top:14px;" type="submit">Join Tapzy Room</button>
          </form>
        </div>
      </div>
    </div>
  </div>

  <style>
    .pair-hero{padding:18px 0 10px}
    .pair-core{position:relative;width:180px;height:180px;margin:0 auto;display:flex;align-items:center;justify-content:center}
    .pair-center{
      width:78px;height:78px;border-radius:999px;
      background:radial-gradient(circle at 50% 35%, rgba(186,236,255,.98) 0%, rgba(125,214,255,.62) 22%, rgba(79,155,255,.18) 48%, rgba(13,17,26,.98) 78%, rgba(8,8,10,1) 100%);
      box-shadow:0 0 26px rgba(111,210,255,.5),0 0 64px rgba(111,210,255,.22),inset 0 0 20px rgba(255,255,255,.08);
      border:1px solid rgba(255,255,255,.16);
      z-index:3;
    }
    .pair-ring{
      position:absolute;border-radius:999px;border:1px solid rgba(127,210,255,.22);
      box-shadow:0 0 22px rgba(111,210,255,.10);animation:pairPulse 2.8s ease-out infinite;
    }
    .ring-1{width:120px;height:120px;animation-delay:0s}
    .ring-2{width:150px;height:150px;animation-delay:.45s}
    .ring-3{width:180px;height:180px;animation-delay:.9s}
    @keyframes pairPulse{
      0%{transform:scale(.82);opacity:.85}
      70%{transform:scale(1.04);opacity:.16}
      100%{transform:scale(1.1);opacity:0}
    }
  </style>

  ${renderTapzyAssistant({ username: currentProfile.username || "User", pageType: "pair" })}
  `;

  res.send(
    renderShell("Tapzy Group Pair", body, "", {
      currentProfile,
      pageTitle: "Tapzy Group Pair",
      pageType: "pair",
    })
  );
});

router.post("/pair/create", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    let room = null;
    let tries = 0;

    while (!room && tries < 10) {
      tries++;
      const code = generatePairCode();

      try {
        room = await prisma.pairRoom.create({
          data: {
            code,
            createdByProfileId: currentProfile.id,
            status: "waiting",
            expiresAt: new Date(Date.now() + ROOM_TTL_MS),
            participants: {
              create: {
                profileId: currentProfile.id,
                selectedFields: getDefaultSelectedFields(currentProfile),
                isReady: false,
                confirmedAt: null,
              },
            },
          },
        });
      } catch (e) {
        if (e?.code !== "P2002") throw e;
      }
    }

    if (!room) return res.status(500).send("Could not create pair room.");
    return res.redirect(`/pair/${room.code}`);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Create pair room error");
  }
});

router.post("/pair/join", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const code = String(req.body.code || "").trim().toUpperCase();
    if (!code) return res.redirect("/pair");

    let room = await prisma.pairRoom.findUnique({
      where: { code },
      include: { participants: true },
    });

    room = await markRoomExpiredIfNeeded(room);

    if (!room) return res.status(404).send("Pair room not found.");
    if (getRoomStatus(room) === "completed") {
      return res.status(400).send("This pair room is already completed.");
    }
    if (getRoomStatus(room) === "expired") {
      return res.status(400).send("This pair room expired.");
    }

    const alreadyIn = room.participants.some((p) => p.profileId === currentProfile.id);

    if (!alreadyIn && room.participants.length >= MAX_PARTICIPANTS) {
      return res.status(400).send("This pair room is full.");
    }

    if (!alreadyIn) {
      await prisma.pairParticipant.create({
        data: {
          roomId: room.id,
          profileId: currentProfile.id,
          selectedFields: getDefaultSelectedFields(currentProfile),
          isReady: false,
          confirmedAt: null,
        },
      });

      if (room.status !== "waiting") {
        await prisma.pairRoom.update({
          where: { id: room.id },
          data: { status: "waiting" },
        });
      }
    }

    return res.redirect(`/pair/${room.code}`);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Join pair room error");
  }
});

router.get("/pair/:code", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const code = String(req.params.code || "").trim().toUpperCase();

    let room = await prisma.pairRoom.findUnique({
      where: { code },
      include: {
        participants: {
          include: { profile: true },
          orderBy: { joinedAt: "asc" },
        },
      },
    });

    room = await markRoomExpiredIfNeeded(room);

    if (!room) return res.status(404).send("Pair room not found.");

    const me = room.participants.find((p) => p.profileId === currentProfile.id);
    if (!me) return res.redirect("/pair");

    const defaults = me.selectedFields || getDefaultSelectedFields(currentProfile);
    const isHost = isRoomHost(room, currentProfile.id);
    const roomStatus = getRoomStatus(room);

    const body = `
    <div class="wrap" style="max-width:1180px;">
      <div class="card">
        <div class="room-top">
          <div>
            <div class="muted" style="letter-spacing:2px;text-transform:uppercase;">Tapzy Group Room</div>
            <h1 style="margin:8px 0 0 0;">Room ${escapeHtml(room.code)}</h1>
            <div class="muted" style="margin-top:10px;line-height:1.7;">
              Up to ${MAX_PARTICIPANTS} people can join this room and exchange contacts instantly.
            </div>
          </div>

          <div class="room-code-card">
            <div class="muted-2">Room Code</div>
            <div class="room-code-value">${escapeHtml(room.code)}</div>
            <div class="muted-2" style="margin-top:8px;">
              <span id="joinedCountText">${room.participants.length}</span> / ${MAX_PARTICIPANTS} joined
            </div>
          </div>
        </div>

        <div class="grid-2" style="margin-top:26px;align-items:start;">
          <div class="panel">
            <h3 style="margin-top:0;">Participants</h3>
            <div class="muted">Everyone in this Tapzy room appears here live.</div>
            <div id="participantGrid" class="member-grid" style="margin-top:16px;"></div>
          </div>

          <div class="panel">
            <h3 style="margin-top:0;">Your Share Selection</h3>
            <div class="muted">Choose exactly what your Tapzy profile shares in this room.</div>

            <form method="POST" action="/pair/${escapeHtml(room.code)}/ready" style="margin-top:14px;">
              <div class="grid-2">
                <div>
                  <label class="row"><input type="checkbox" name="shareNameEnabled" ${defaults.shareNameEnabled ? "checked" : ""} style="width:auto;" /> Share Name</label>
                  <label class="row"><input type="checkbox" name="sharePhoneEnabled" ${defaults.sharePhoneEnabled ? "checked" : ""} style="width:auto;" /> Share Phone</label>
                  <label class="row"><input type="checkbox" name="shareEmailEnabled" ${defaults.shareEmailEnabled ? "checked" : ""} style="width:auto;" /> Share Email</label>
                  <label class="row"><input type="checkbox" name="shareWebsiteEnabled" ${defaults.shareWebsiteEnabled ? "checked" : ""} style="width:auto;" /> Share Website</label>
                  <label class="row"><input type="checkbox" name="shareInstagramEnabled" ${defaults.shareInstagramEnabled ? "checked" : ""} style="width:auto;" /> Share Instagram</label>
                  <label class="row"><input type="checkbox" name="shareLinkedinEnabled" ${defaults.shareLinkedinEnabled ? "checked" : ""} style="width:auto;" /> Share LinkedIn</label>
                  <label class="row"><input type="checkbox" name="shareTiktokEnabled" ${defaults.shareTiktokEnabled ? "checked" : ""} style="width:auto;" /> Share TikTok</label>
                </div>
                <div>
                  <label class="row"><input type="checkbox" name="shareTwitterEnabled" ${defaults.shareTwitterEnabled ? "checked" : ""} style="width:auto;" /> Share X</label>
                  <label class="row"><input type="checkbox" name="shareFacebookEnabled" ${defaults.shareFacebookEnabled ? "checked" : ""} style="width:auto;" /> Share Facebook</label>
                  <label class="row"><input type="checkbox" name="shareYoutubeEnabled" ${defaults.shareYoutubeEnabled ? "checked" : ""} style="width:auto;" /> Share YouTube</label>
                  <label class="row"><input type="checkbox" name="shareGithubEnabled" ${defaults.shareGithubEnabled ? "checked" : ""} style="width:auto;" /> Share GitHub</label>
                  <label class="row"><input type="checkbox" name="shareSnapchatEnabled" ${defaults.shareSnapchatEnabled ? "checked" : ""} style="width:auto;" /> Share Snapchat</label>
                  <label class="row"><input type="checkbox" name="shareWhatsappEnabled" ${defaults.shareWhatsappEnabled ? "checked" : ""} style="width:auto;" /> Share WhatsApp</label>
                  <label class="row"><input type="checkbox" name="shareTelegramEnabled" ${defaults.shareTelegramEnabled ? "checked" : ""} style="width:auto;" /> Share Telegram</label>
                </div>
              </div>

              <button class="btn btnFull" style="margin-top:16px;" type="submit">I'm Ready</button>
            </form>

            ${
              isHost
                ? `
                <form method="POST" action="/pair/${escapeHtml(room.code)}/connect" style="margin-top:12px;">
                  <button class="btn btnDark btnFull" type="submit">Connect Everyone</button>
                </form>
                <div class="muted" style="margin-top:10px;">
                  Only the host can complete the room.
                </div>
              `
                : `
                <div class="panel" style="margin-top:12px;padding:14px;">
                  <div class="muted">
                    Waiting for the host to connect everyone once all participants are ready.
                  </div>
                </div>
              `
            }
          </div>
        </div>

        <div class="panel" style="margin-top:18px;">
          <h3 style="margin-top:0;">Live Room Status</h3>
          <div id="pairLiveState" class="muted">Syncing room state...</div>

          <div class="stats-grid" style="margin-top:16px;">
            <div class="stat-card">
              <div class="muted-2">Room Status</div>
              <div id="roomStatusText" class="stat-value">${escapeHtml(roomStatus)}</div>
            </div>
            <div class="stat-card">
              <div class="muted-2">Ready Count</div>
              <div id="readyCountText" class="stat-value">0 / 0</div>
            </div>
            <div class="stat-card">
              <div class="muted-2">Connection Mesh</div>
              <div id="connectionCountText" class="stat-value">0 possible</div>
            </div>
          </div>

          <div id="pairCompleteBanner" class="success" style="display:${roomStatus === "completed" ? "block" : "none"};margin-top:16px;">
            Tapzy Group Pair complete. Everyone in the room was connected.
          </div>
        </div>
      </div>
    </div>

    <style>
      .room-top{
        display:flex;justify-content:space-between;gap:18px;align-items:center;flex-wrap:wrap;
      }
      .room-code-card{
        min-width:220px;padding:18px;border-radius:22px;border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(17,18,23,.98), rgba(10,10,14,.98));
        box-shadow:0 0 24px rgba(111,210,255,.08);
      }
      .room-code-value{
        font-size:34px;font-weight:900;letter-spacing:5px;margin-top:8px;
      }
      .member-grid{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:14px;
      }
      .member-card{
        border-radius:20px;
        padding:16px;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(17,18,23,.98), rgba(10,10,14,.98));
      }
      .member-card.ready{
        box-shadow:0 0 24px rgba(111,210,255,.12), inset 0 0 16px rgba(111,210,255,.04);
        border-color:rgba(111,210,255,.28);
      }
      .member-top{
        display:flex;gap:12px;align-items:center;
      }
      .member-avatar{
        width:48px;height:48px;border-radius:999px;display:flex;align-items:center;justify-content:center;
        font-weight:800;font-size:18px;color:#fff;
        background:radial-gradient(circle at 50% 35%, rgba(186,236,255,.95) 0%, rgba(125,214,255,.54) 24%, rgba(79,155,255,.16) 52%, rgba(14,18,28,.98) 80%, rgba(8,8,10,1) 100%);
        border:1px solid rgba(255,255,255,.14);box-shadow:0 0 26px rgba(111,210,255,.20);
      }
      .member-name{
        font-weight:800;font-size:16px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;
      }
      .member-sub{
        margin-top:4px;color:#aab4c4;font-size:13px;
      }
      .member-state{
        margin-top:14px;font-size:13px;color:#d4dfef;
      }
      .chip{
        display:inline-flex;align-items:center;justify-content:center;
        padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700;
        background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.08);
      }
      .chipBlue{
        background:rgba(111,210,255,.12);
        border-color:rgba(111,210,255,.22);
        color:#c9eeff;
      }
      .stats-grid{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:14px;
      }
      .stat-card{
        border-radius:18px;
        padding:16px;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(17,18,23,.98), rgba(10,10,14,.98));
      }
      .stat-value{
        margin-top:8px;font-size:24px;font-weight:800;
      }
      @media(max-width:900px){
        .member-grid{grid-template-columns:1fr}
        .stats-grid{grid-template-columns:1fr}
      }
    </style>

    <script>
      function escapeUnsafe(value) {
        return String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function meshCount(n) {
        return n >= 2 ? (n * (n - 1)) / 2 : 0;
      }

      function participantCardHtml(p, hostId, meId) {
        const displayName = p.name || p.username || "Tapzy User";
        const username = p.username ? "@" + p.username : "Tapzy Member";
        const initials = (displayName || "T").slice(0, 1).toUpperCase();
        const youBadge = p.profileId === meId ? '<span class="chip">You</span>' : "";
        const hostBadge = p.profileId === hostId ? '<span class="chip chipBlue">Host</span>' : "";

        return \`
          <div class="member-card \${p.isReady ? "ready" : ""}">
            <div class="member-top">
              <div class="member-avatar">\${escapeUnsafe(initials)}</div>
              <div>
                <div class="member-name">
                  \${escapeUnsafe(displayName)}
                  \${youBadge}
                  \${hostBadge}
                </div>
                <div class="member-sub">\${escapeUnsafe(username)}</div>
              </div>
            </div>
            <div class="member-state">\${p.isReady ? "Ready" : "Not ready"}</div>
          </div>
        \`;
      }

      async function refreshPairState() {
        try {
          const res = await fetch("/pair/${escapeHtml(room.code)}/state", { cache: "no-store" });
          const data = await res.json();
          if (!data || !data.ok) return;

          const readyCount = data.participants.filter((p) => p.isReady).length;

          document.getElementById("participantGrid").innerHTML = data.participants
            .map((p) => participantCardHtml(p, data.room.hostProfileId, data.viewer.profileId))
            .join("");

          document.getElementById("joinedCountText").textContent = data.participants.length;
          document.getElementById("roomStatusText").textContent = data.room.status;
          document.getElementById("readyCountText").textContent = readyCount + " / " + data.participants.length;
          document.getElementById("connectionCountText").textContent = meshCount(data.participants.length) + " possible";

          const liveState = document.getElementById("pairLiveState");
          const completeBanner = document.getElementById("pairCompleteBanner");

          if (data.room.status === "completed") {
            liveState.textContent = "Tapzy Group Pair complete.";
            completeBanner.style.display = "block";
          } else if (data.room.status === "expired") {
            liveState.textContent = "This room expired.";
            completeBanner.style.display = "none";
          } else if (data.participants.length < 2) {
            liveState.textContent = "Waiting for more people to join...";
            completeBanner.style.display = "none";
          } else if (readyCount === data.participants.length) {
            liveState.textContent = data.viewer.isHost
              ? "Everyone is ready. You can connect the room now."
              : "Everyone is ready. Waiting for the host.";
            completeBanner.style.display = "none";
          } else {
            liveState.textContent = "Participants are joining and setting what they want to share...";
            completeBanner.style.display = "none";
          }
        } catch {}
      }

      setInterval(refreshPairState, 2000);
      refreshPairState();
    </script>

    ${renderTapzyAssistant({ username: currentProfile.username || "User", pageType: "pair-room" })}
    `;

    res.send(
      renderShell(`Tapzy Pair • ${room.code}`, body, "", {
        currentProfile,
        pageTitle: "Tapzy Pair Room",
        pageType: "pair-room",
      })
    );
  } catch (e) {
    console.error(e);
    return res.status(500).send("Pair room error");
  }
});

router.get("/pair/:code/state", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.json({ ok: false });

    const code = String(req.params.code || "").trim().toUpperCase();

    let room = await prisma.pairRoom.findUnique({
      where: { code },
      include: {
        participants: {
          include: { profile: true },
          orderBy: { joinedAt: "asc" },
        },
      },
    });

    room = await markRoomExpiredIfNeeded(room);

    if (!room) return res.json({ ok: false });

    const me = room.participants.find((p) => p.profileId === currentProfile.id);
    if (!me) return res.json({ ok: false });

    const participantCount = room.participants.length;
    const readyCount = room.participants.filter((p) => !!p.isReady).length;

    let derivedStatus = getRoomStatus(room);
    if (derivedStatus !== "completed" && derivedStatus !== "expired") {
      derivedStatus =
        participantCount >= ROOM_MIN_PARTICIPANTS && readyCount === participantCount
          ? "ready"
          : "waiting";
    }

    return res.json({
      ok: true,
      room: {
        code: room.code,
        status: derivedStatus,
        completedAt: room.completedAt,
        expiresAt: room.expiresAt,
        hostProfileId: room.createdByProfileId,
        maxParticipants: MAX_PARTICIPANTS,
      },
      viewer: {
        profileId: currentProfile.id,
        isHost: isRoomHost(room, currentProfile.id),
      },
      participants: room.participants.map((p) => ({
        profileId: p.profileId,
        username: p.profile?.username || "",
        name: p.profile?.name || "",
        isReady: !!p.isReady,
        confirmedAt: p.confirmedAt,
      })),
    });
  } catch (e) {
    console.error(e);
    return res.json({ ok: false });
  }
});

router.post("/pair/:code/ready", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const code = String(req.params.code || "").trim().toUpperCase();

    let room = await prisma.pairRoom.findUnique({
      where: { code },
      include: { participants: true },
    });

    room = await markRoomExpiredIfNeeded(room);

    if (!room) return res.status(404).send("Pair room not found.");
    if (getRoomStatus(room) === "completed") {
      return res.status(400).send("This pair room is already completed.");
    }
    if (getRoomStatus(room) === "expired") {
      return res.status(400).send("This pair room expired.");
    }

    const me = room.participants.find((p) => p.profileId === currentProfile.id);
    if (!me) return res.status(403).send("Forbidden");

    const selectedFields = getSelectedFieldsFromBody(req.body);
    const hasAnySelection = Object.values(selectedFields).some(Boolean);

    if (!hasAnySelection) {
      return res.status(400).send("Select at least one field to share.");
    }

    await prisma.pairParticipant.update({
      where: { id: me.id },
      data: {
        isReady: true,
        confirmedAt: new Date(),
        selectedFields,
      },
    });

    const refreshed = await prisma.pairRoom.findUnique({
      where: { id: room.id },
      include: { participants: true },
    });

    const everyoneReady =
      refreshed.participants.length >= ROOM_MIN_PARTICIPANTS &&
      refreshed.participants.every((p) => !!p.isReady);

    const nextStatus = everyoneReady ? "ready" : "waiting";

    if (!refreshed.completedAt && refreshed.status !== nextStatus) {
      await prisma.pairRoom.update({
        where: { id: room.id },
        data: { status: nextStatus },
      });
    }

    return res.redirect(`/pair/${room.code}`);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Ready state error");
  }
});

router.post("/pair/:code/connect", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const code = String(req.params.code || "").trim().toUpperCase();

    let room = await prisma.pairRoom.findUnique({
      where: { code },
      include: {
        participants: {
          include: { profile: true },
          orderBy: { joinedAt: "asc" },
        },
      },
    });

    room = await markRoomExpiredIfNeeded(room);

    if (!room) return res.status(404).send("Pair room not found.");
    if (!isRoomHost(room, currentProfile.id)) {
      return res.status(403).send("Only the host can connect the room.");
    }
    if (getRoomStatus(room) === "completed") {
      return res.redirect(`/pair/${room.code}`);
    }
    if (getRoomStatus(room) === "expired") {
      return res.status(400).send("This pair room expired.");
    }
    if (room.participants.length < ROOM_MIN_PARTICIPANTS) {
      return res.status(400).send("At least 2 participants are required.");
    }
    if (!room.participants.every((p) => !!p.isReady)) {
      return res.status(400).send("All participants must be ready first.");
    }

    const result = await createCompletedPairExchange(room.id);

    if (!result.ok && !result.alreadyCompleted) {
      return res.status(400).send("Could not complete group pairing.");
    }

    return res.redirect(`/pair/${room.code}`);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Connect room error");
  }
});

module.exports = router;
