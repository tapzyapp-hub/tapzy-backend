const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../prisma");

const {
  ensureUniqueUsername,
  cryptoRandomSecret,
  createSessionForAccount,
  renderShell,
  renderTapzyAssistant,
  escapeHtml,
} = require("../utils");

const router = express.Router();

router.get("/auth", async (req, res) => {
  try {
    if (req.currentProfile?.username) {
      return res.redirect(`/u/${req.currentProfile.username}`);
    }

    const error = String(req.query.error || "").trim();
    const success = String(req.query.success || "").trim();

    const errorHtml = error
      ? `<div class="panel" style="border-color:#5a1f1f;color:#ffcccc;background:linear-gradient(180deg,#241010,#160b0b);margin-bottom:14px;">${escapeHtml(error)}</div>`
      : "";

    const successHtml = success
      ? `<div class="success">${escapeHtml(success)}</div>`
      : "";

    const body = `
    <div class="authWrap">
      <div class="card" style="max-width:420px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:18px;">
          <h1 style="margin-bottom:8px;">Tapzy</h1>
          <div class="muted">Premium identity, sharing, and networking</div>
        </div>

        ${errorHtml}
        ${successHtml}

        <div class="panel">
          <h3 style="margin-top:0;">Create Account</h3>
          <form method="POST" action="/auth/register">
            <label>Email</label>
            <input name="email" type="email" placeholder="Enter your email" required />

            <label>Password</label>
            <input name="password" type="password" placeholder="Create a password" required />

            <button class="btn btnFull" style="margin-top:14px;" type="submit">
              Create Account
            </button>
          </form>
        </div>

        <div class="panel" style="margin-top:14px;">
          <h3 style="margin-top:0;">Login</h3>
          <form method="POST" action="/auth/login">
            <label>Email</label>
            <input name="email" type="email" placeholder="Enter your email" required />

            <label>Password</label>
            <input name="password" type="password" placeholder="Enter your password" required />

            <button class="btn btnFull" style="margin-top:14px;" type="submit">
              Login
            </button>
          </form>
        </div>
      </div>
    </div>

    ${renderTapzyAssistant({
      username: "User",
      isAuthPage: true,
      pageType: "auth",
    })}
    `;

    res.send(
      renderShell("Tapzy Auth", body, "", {
        currentProfile: req.currentProfile || null,
        pageTitle: "Auth",
        pageType: "auth",
      })
    );
  } catch (e) {
    console.error(e);
    return res.status(500).send("Auth page error");
  }
});

router.post("/auth/register", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.redirect("/auth?error=Email%20and%20password%20are%20required");
    }

    if (password.length < 8) {
      return res.redirect("/auth?error=Password%20must%20be%20at%20least%208%20characters");
    }

    const existing = await prisma.userAccount.findUnique({
      where: { email },
    });

    if (existing) {
      return res.redirect("/auth?error=An%20account%20with%20that%20email%20already%20exists");
    }

    const hash = await bcrypt.hash(password, 10);

    const baseUsername = email.split("@")[0] || "user";
    const username = await ensureUniqueUsername(baseUsername);

    const account = await prisma.userAccount.create({
      data: {
        email,
        passwordHash: hash,
        profile: {
          create: {
            username,
            editSecret: cryptoRandomSecret(),
            name: username,
          },
        },
      },
      include: {
        profile: true,
      },
    });

    await createSessionForAccount(account.id, res);

    return res.redirect(`/u/${account.profile.username}`);
  } catch (e) {
    console.error(e);
    return res.redirect("/auth?error=Internal%20server%20error");
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.redirect("/auth?error=Email%20and%20password%20are%20required");
    }

    const account = await prisma.userAccount.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (!account || !account.passwordHash) {
      return res.redirect("/auth?error=Account%20not%20found");
    }

    const ok = await bcrypt.compare(password, account.passwordHash);

    if (!ok) {
      return res.redirect("/auth?error=Wrong%20password");
    }

    await createSessionForAccount(account.id, res);

    if (account.profile?.username) {
      return res.redirect(`/u/${account.profile.username}`);
    }

    return res.redirect("/auth?success=Logged%20in");
  } catch (e) {
    console.error(e);
    return res.redirect("/auth?error=Internal%20server%20error");
  }
});

router.get("/logout", async (req, res) => {
  try {
    const { destroySession } = require("../utils");
    await destroySession(req, res);
    return res.redirect("/auth?success=Logged%20out");
  } catch (e) {
    console.error(e);
    return res.redirect("/auth?error=Logout%20failed");
  }
});

module.exports = router;