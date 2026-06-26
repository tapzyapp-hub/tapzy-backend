const router = require("express").Router();
const prisma = require("../prisma");
const { WEB_BASE } = require("../config");
const { adminLimiter, requireAdmin, activateLimiter } = require("../middleware");
const { renderShell, escapeHtml, renderTapzyAssistant } = require("../utils");

const CARD_CODE_RE = /^[A-Z0-9]{4,24}$/;
const CARD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function normalizeCardCode(value = "") {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function cardUrl(req, code) {
  const base = WEB_BASE || `${req.protocol}://${req.get("host")}`;
  return `${String(base).replace(/\/$/, "")}/c/${encodeURIComponent(code)}`;
}

function generateCardCode(length = 6) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CARD_CHARS.charAt(Math.floor(Math.random() * CARD_CHARS.length));
  }
  return out;
}

function renderActivationPage(req, card, options = {}) {
  const code = card?.code || normalizeCardCode(req.params.code);
  const mode = options.mode || "guest";
  const redirectTo = `/activate/${encodeURIComponent(code)}`;
  const authHref = `/auth?redirectTo=${encodeURIComponent(redirectTo)}`;
  const title = options.title || "Welcome to Tapzy";
  const subtitle = options.subtitle || "This card hasn't been activated yet.";
  const message = options.message || "Create an account or login, then claim this card with one tap.";

  const giftHtml = card?.giftFrom
    ? `
      <div class="nfc-gift">
        <span>Gifted by</span>
        <strong>${escapeHtml(card.giftFrom)}</strong>
        ${card.giftMessage ? `<p>${escapeHtml(card.giftMessage)}</p>` : ""}
      </div>
    `
    : "";

  const actionHtml =
    mode === "ready"
      ? `
        <form method="POST" action="/activate/${escapeHtml(code)}" class="nfc-actions">
          <button class="nfc-primary" type="submit">Activate Tapzy Card</button>
        </form>
      `
      : `
        <div class="nfc-actions">
          <a class="nfc-primary" href="${authHref}">Create Account</a>
          <a class="nfc-secondary" href="${authHref}">Login</a>
        </div>
      `;

  const signedInHtml = req.currentProfile
    ? `<div class="nfc-signed">Signed in as <strong>@${escapeHtml(req.currentProfile.username || "user")}</strong></div>`
    : "";

  const body = `
  <main class="nfc-wrap">
    <section class="nfc-card">
      <div class="nfc-orb" aria-hidden="true"><span>T</span></div>
      <div class="nfc-kicker">TAPZY FIRST TAP</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="nfc-subtitle">${escapeHtml(subtitle)}</p>
      ${giftHtml}
      <div class="nfc-code"><span>Card ID</span><strong>${escapeHtml(code)}</strong></div>
      <p class="nfc-message">${escapeHtml(message)}</p>
      ${signedInHtml}
      ${actionHtml}
    </section>
  </main>
  ${renderTapzyAssistant({ username: req.currentProfile?.username || "User", pageType: "activate" })}
  `;

  const css = `
  <style>
    body{background:#000;}
    .nfc-wrap{min-height:calc(100vh - 86px);display:grid;place-items:center;padding:38px 18px 72px;background:radial-gradient(circle at 50% 24%,rgba(45,111,255,.28),transparent 34%),linear-gradient(180deg,#02040a,#000 68%);}
    .nfc-card{width:min(520px,100%);position:relative;overflow:hidden;text-align:center;border:1px solid rgba(120,177,255,.22);border-radius:34px;padding:34px 24px;background:linear-gradient(180deg,rgba(13,24,42,.94),rgba(2,4,9,.98));box-shadow:0 28px 80px rgba(0,0,0,.65),0 0 54px rgba(31,123,255,.18);}
    .nfc-card:before{content:"";position:absolute;inset:-1px;background:radial-gradient(circle at 50% 0,rgba(108,181,255,.22),transparent 42%);pointer-events:none;}
    .nfc-card>*{position:relative;z-index:1}.nfc-orb{width:96px;height:96px;margin:0 auto 22px;border-radius:28px;display:grid;place-items:center;background:linear-gradient(180deg,#3587ff,#1558d6);box-shadow:0 0 44px rgba(42,127,255,.58),inset 0 1px 0 rgba(255,255,255,.32);animation:nfcPulse 2.4s ease-in-out infinite}.nfc-orb span{font-size:46px;font-weight:950;color:#fff;letter-spacing:-.05em}.nfc-kicker{font-size:12px;letter-spacing:.48em;color:rgba(214,226,255,.66);font-weight:900;margin-bottom:12px}.nfc-card h1{font-size:clamp(38px,8vw,62px);line-height:.94;margin:0;color:#fff;letter-spacing:-.07em}.nfc-subtitle{font-size:18px;line-height:1.45;color:rgba(235,241,255,.72);margin:18px auto 0;max-width:390px}.nfc-code,.nfc-gift,.nfc-signed{margin:22px auto 0;border:1px solid rgba(255,255,255,.1);border-radius:22px;padding:14px 16px;background:rgba(0,0,0,.28);max-width:360px}.nfc-code span,.nfc-gift span{display:block;font-size:11px;letter-spacing:.28em;color:rgba(178,198,234,.72);font-weight:900;text-transform:uppercase}.nfc-code strong,.nfc-gift strong{display:block;margin-top:6px;color:#fff;font-size:24px;letter-spacing:.16em}.nfc-gift p{margin:8px 0 0;color:rgba(255,255,255,.74)}.nfc-message{margin:20px auto 0;color:rgba(255,255,255,.7);font-size:15px;line-height:1.55;max-width:390px}.nfc-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:24px}.nfc-primary,.nfc-secondary{appearance:none;border:0;text-decoration:none;border-radius:18px;padding:15px 22px;font-size:16px;font-weight:900;cursor:pointer}.nfc-primary{background:linear-gradient(180deg,#eaf7ff,#d9f0ff);color:#020611;box-shadow:0 0 34px rgba(85,157,255,.25)}.nfc-secondary{background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);color:#fff}.nfc-signed{color:rgba(255,255,255,.72)}@keyframes nfcPulse{0%,100%{transform:scale(1);box-shadow:0 0 36px rgba(42,127,255,.48)}50%{transform:scale(1.045);box-shadow:0 0 70px rgba(42,127,255,.78)}}
  </style>`;

  return renderShell(`${title} • Tapzy`, body, css, {
    currentProfile: req.currentProfile || null,
    pageTitle: "Activate",
    pageType: "activate",
    metaDescription: "Activate your Tapzy NFC card with one tap.",
  });
}

router.get("/c/:code", async (req, res) => {
  try {
    const code = normalizeCardCode(req.params.code);
    if (!CARD_CODE_RE.test(code)) return res.status(404).send("Card not found");

    const card = await prisma.card.findUnique({ where: { code }, include: { owner: true } });
    if (!card || !card.owner?.username) return res.redirect(`/activate/${encodeURIComponent(code)}`);
    return res.redirect(`/u/${encodeURIComponent(card.owner.username)}?tap=1`);
  } catch (error) {
    console.error("Card tap error:", error);
    return res.status(500).send("Card tap error");
  }
});

router.get("/activate/:code", activateLimiter, async (req, res) => {
  try {
    const code = normalizeCardCode(req.params.code);
    if (!CARD_CODE_RE.test(code)) return res.status(404).send("Card not found");

    const card = await prisma.card.findUnique({ where: { code }, include: { owner: true } });
    if (!card) {
      return res.status(404).send(
        renderActivationPage(req, { code }, {
          title: "Card not found",
          subtitle: "This Tapzy card has not been added to inventory yet.",
          message: "Generate this card in the admin encoder before programming it.",
        })
      );
    }

    if (card.owner?.username) return res.redirect(`/u/${encodeURIComponent(card.owner.username)}?tap=1`);

    if (!req.currentProfile) return res.send(renderActivationPage(req, card));

    return res.send(
      renderActivationPage(req, card, {
        mode: "ready",
        title: "Activate your Tapzy Card?",
        subtitle: "Link this permanent NFC card to your Tapzy profile.",
        message: "After activation, every future tap will open your profile automatically.",
      })
    );
  } catch (error) {
    console.error("Activation page error:", error);
    return res.status(500).send("Activation page error");
  }
});

router.post("/activate/:code", activateLimiter, async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    const code = normalizeCardCode(req.params.code);
    if (!CARD_CODE_RE.test(code)) return res.status(404).send("Card not found");
    if (!currentProfile) return res.redirect(`/auth?redirectTo=${encodeURIComponent(`/activate/${code}`)}`);

    const card = await prisma.card.findUnique({ where: { code }, include: { owner: true } });
    if (!card) return res.status(404).send("Card not found");
    if (card.ownerId && card.ownerId !== currentProfile.id) return res.status(409).send("This card has already been activated.");
    if (card.ownerId === currentProfile.id) return res.redirect(`/u/${encodeURIComponent(currentProfile.username || "")}?tap=1`);

    const updated = await prisma.card.updateMany({
      where: { code, ownerId: null },
      data: { ownerId: currentProfile.id, activated: true, activatedAt: new Date() },
    });

    if (!updated.count) return res.status(409).send("This card was just activated by another account.");
    return res.redirect(`/u/${encodeURIComponent(currentProfile.username || "")}?tap=1`);
  } catch (error) {
    console.error("Card activation error:", error);
    return res.status(500).send("Could not activate card");
  }
});

router.get("/admin/encoder", adminLimiter, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const [total, activated, nextCard, recent] = await Promise.all([
      prisma.card.count(),
      prisma.card.count({ where: { ownerId: { not: null } } }),
      prisma.card.findFirst({ where: { ownerId: null }, orderBy: { createdAt: "asc" } }),
      prisma.card.findMany({ orderBy: { createdAt: "desc" }, take: 12, include: { owner: true } }),
    ]);

    const currentUrl = nextCard ? cardUrl(req, nextCard.code) : "Generate cards first";
    const key = encodeURIComponent(req.query.key || "");
    const rows = recent
      .map((card) => `<tr><td>${escapeHtml(card.code)}</td><td>${card.owner?.username ? `@${escapeHtml(card.owner.username)}` : "Unclaimed"}</td><td>${card.activated ? "Active" : "Ready"}</td></tr>`)
      .join("");

    const body = `
    <div class="wrap" style="max-width:900px;">
      <div class="card">
        <div class="row-between">
          <div>
            <div class="mini">TAPZY NFC ENCODER</div>
            <h1 style="margin:.2em 0 0;">First Tap Activation</h1>
            <div class="muted">Encoding card ${Math.min(activated + 1, total || 1)} / ${total || 0}</div>
          </div>
        </div>

        <div class="panel" style="margin-top:18px;">
          <label>Current code</label>
          <div style="font-size:34px;font-weight:900;letter-spacing:.14em;">${escapeHtml(nextCard?.code || "NONE")}</div>
          <label style="margin-top:14px;">URL</label>
          <input readonly value="${escapeHtml(currentUrl)}" />
          <button class="btn btnFull" type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.dataset.url);this.textContent='✓ Copied / Write Card';" data-url="${escapeHtml(currentUrl)}" style="margin-top:12px;">WRITE CARD</button>
        </div>

        <div class="panel" style="margin-top:18px;">
          <form method="POST" action="/admin/cards/generate?key=${key}">
            <label>Generate cards</label>
            <input name="count" type="number" min="1" max="500" value="100" />
            <button class="btn btnFull" style="margin-top:10px;" type="submit">Generate NFC URLs</button>
          </form>
          <div style="margin-top:12px;"><a class="btn btnDark" href="/admin/cards.csv?key=${key}">Download CSV</a></div>
        </div>

        <div class="panel" style="margin-top:18px;">
          <h3>Recent cards</h3>
          <table style="width:100%;border-collapse:collapse;"><tbody>${rows || `<tr><td class="muted">No cards yet.</td></tr>`}</tbody></table>
        </div>
      </div>
    </div>`;

    res.send(renderShell("Tapzy Encoder", body, "", {
      currentProfile: req.currentProfile || null,
      pageTitle: "Encoder",
      pageType: "admin",
    }));
  } catch (error) {
    console.error("Encoder error:", error);
    res.status(500).send("Encoder error");
  }
});

router.post("/admin/cards/generate", adminLimiter, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    let count = Number(req.body.count || 0);
    if (!count || count < 1) count = 1;
    if (count > 500) count = 500;

    for (let i = 0; i < count; i += 1) {
      let created = false;
      for (let attempts = 0; attempts < 30 && !created; attempts += 1) {
        try {
          await prisma.card.create({ data: { code: generateCardCode(6) } });
          created = true;
        } catch (error) {
          if (error?.code !== "P2002") throw error;
        }
      }
      if (!created) throw new Error("Could not generate unique card code");
    }

    res.redirect(`/admin/encoder?key=${encodeURIComponent(req.query.key || "")}`);
  } catch (error) {
    console.error("Generate cards error:", error);
    res.status(500).send("Generate cards error");
  }
});

router.get("/admin/cards.csv", adminLimiter, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const cards = await prisma.card.findMany({ orderBy: { createdAt: "asc" } });
    const lines = ["code,url", ...cards.map((card) => `${card.code},${cardUrl(req, card.code)}`)];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="tapzy-cards.csv"');
    res.send(lines.join("\n"));
  } catch (error) {
    console.error("Cards CSV error:", error);
    res.status(500).send("Cards CSV error");
  }
});

module.exports = router;
