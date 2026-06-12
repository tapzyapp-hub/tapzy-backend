const router = require("express").Router();
const prisma = require("../prisma");
const { adminLimiter, requireAdmin } = require("../middleware");
const {
  renderShell,
  escapeHtml,
  sendAdminCodesEmail,
} = require("../utils");
const { WEB_BASE, ADMIN_KEY } = require("../config");

router.get("/admin", adminLimiter, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const codes = await prisma.activationCode.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { profile: true },
    });

    const adminKeyQuery = ADMIN_KEY
      ? `?key=${encodeURIComponent(req.query?.key || "")}`
      : "";

    const rows = codes.map((c) => {
      return `
      <div class="panel">
        <div><b>${escapeHtml(c.code)}</b></div>
        <div class="muted">${escapeHtml(c.publicToken)}</div>

        <div class="mini">
          ${c.claimedAt ? "CLAIMED" : "UNCLAIMED"} • ${c.isActive ? "ACTIVE" : "DEACTIVATED"}
        </div>

        ${c.profile?.username ? `<div class="mini">@${escapeHtml(c.profile.username)}</div>` : ""}
        ${c.deactivationReason ? `<div class="mini">${escapeHtml(c.deactivationReason)}</div>` : ""}

        <div class="row" style="margin-top:10px;">
          <a class="btn btnDark" href="${WEB_BASE}/a/${c.publicToken}" target="_blank" rel="noopener noreferrer">Tap Link</a>
          <a class="btn btnDark" href="${WEB_BASE}/activate?token=${encodeURIComponent(c.publicToken)}" target="_blank" rel="noopener noreferrer">Activate</a>
        </div>

        <div class="row" style="margin-top:10px;">
          ${
            c.isActive
              ? `
              <form method="POST" action="/admin/deactivate-card${adminKeyQuery}" style="margin:0;display:flex;gap:8px;flex-wrap:wrap;">
                <input type="hidden" name="code" value="${escapeHtml(c.code)}" />
                <input name="reason" placeholder="Reason" />
                <button class="btn btnDark" type="submit">Deactivate</button>
              </form>
              `
              : `
              <form method="POST" action="/admin/reactivate-card${adminKeyQuery}" style="margin:0;">
                <input type="hidden" name="code" value="${escapeHtml(c.code)}" />
                <button class="btn btnDark" type="submit">Reactivate</button>
              </form>
              `
          }
        </div>
      </div>
      `;
    });

    const body = `
    <div class="wrap" style="max-width:900px;">
      <div class="card">
        <div class="row-between">
          <div>
            <h2 style="margin:0;">Tapzy Admin</h2>
            <div class="muted">Activation code generator</div>
          </div>
        </div>

        <div class="panel" style="margin-top:16px;">
          <form method="POST" action="/admin/generate?key=${encodeURIComponent(req.query.key || "")}">
            <label>Number of codes</label>
            <input type="number" name="count" value="10" min="1" max="500" />
            <button class="btn btnFull" style="margin-top:10px;" type="submit">Generate Codes</button>
          </form>
        </div>

        <div style="margin-top:16px;">
          ${rows.join("")}
        </div>
      </div>
    </div>
    `;

    res.send(
      renderShell("Tapzy Admin", body, "", {
        currentProfile: req.currentProfile || null,
        pageTitle: "Admin",
        pageType: "admin",
      })
    );
  } catch (e) {
    console.error(e);
    res.status(500).send("Admin error");
  }
});

router.post("/admin/generate", adminLimiter, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    let count = Number(req.body.count || 0);
    if (!count || count < 1) count = 1;
    if (count > 500) count = 500;

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    function generateCode() {
      let code = "TZ-";
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    }

    const createdCodes = [];

    for (let i = 0; i < count; i++) {
      let created = null;
      let attempts = 0;

      while (!created && attempts < 20) {
        attempts++;
        const code = generateCode();

        try {
          created = await prisma.activationCode.create({
            data: { code },
          });
        } catch (e) {
          if (e?.code === "P2002") continue;
          throw e;
        }
      }

      if (!created) {
        return res.status(500).send("Failed to generate a unique activation code.");
      }

      createdCodes.push(created);
    }

    await sendAdminCodesEmail(createdCodes);

    res.redirect(`/admin?key=${encodeURIComponent(req.query.key || "")}`);
  } catch (e) {
    console.error(e);
    res.status(500).send("Generate codes error");
  }
});

router.post("/admin/deactivate-card", adminLimiter, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const code = String(req.body?.code || "").trim().toUpperCase();
    const reason = String(req.body?.reason || "").trim() || "Deactivated by admin";

    if (!code) return res.status(400).send("Code is required");

    await prisma.activationCode.update({
      where: { code },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        deactivationReason: reason,
      },
    });

    res.redirect(`/admin?key=${encodeURIComponent(req.query.key || "")}`);
  } catch (e) {
    console.error(e);
    res.status(500).send("Deactivate error");
  }
});

router.post("/admin/reactivate-card", adminLimiter, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!code) return res.status(400).send("Code is required");

    await prisma.activationCode.update({
      where: { code },
      data: {
        isActive: true,
        deactivatedAt: null,
        deactivationReason: null,
      },
    });

    res.redirect(`/admin?key=${encodeURIComponent(req.query.key || "")}`);
  } catch (e) {
    console.error(e);
    res.status(500).send("Reactivate error");
  }
});

module.exports = router;
