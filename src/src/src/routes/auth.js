const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Resend } = require("resend");

const prisma = require("../prisma");
const { WEB_BASE, EMAIL_FROM, RESEND_API_KEY } = require("../config");

const {
  ensureUniqueUsername,
  cryptoRandomSecret,
  createSessionForAccount,
  renderShell,
  renderTapzyAssistant,
  escapeHtml,
} = require("../utils");

const router = express.Router();

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

function forgotPasswordEmailHtml(resetUrl) {
  return `
    <div style="background:#0a0a0f;padding:32px;font-family:Inter,Arial,sans-serif;color:#ffffff;">
      <div style="max-width:520px;margin:0 auto;background:linear-gradient(180deg,#11131a,#0b0d12);border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:28px;">
        <div style="font-size:28px;font-weight:700;margin-bottom:8px;">Tapzy</div>
        <div style="font-size:14px;line-height:1.6;color:rgba(255,255,255,0.72);margin-bottom:22px;">
          We received a request to reset your password.
        </div>

        <a
          href="${resetUrl}"
          style="
            display:inline-block;
            padding:14px 22px;
            border-radius:999px;
            background:linear-gradient(180deg,#1f7bff,#0a84ff);
            color:#ffffff;
            text-decoration:none;
            font-weight:600;
          "
        >
          Reset Password
        </a>

        <div style="font-size:13px;line-height:1.6;color:rgba(255,255,255,0.6);margin-top:22px;">
          This link expires in 15 minutes. If you didn’t request this, you can safely ignore this email.
        </div>

        <div style="font-size:12px;line-height:1.6;color:rgba(255,255,255,0.45);margin-top:18px;word-break:break-all;">
          ${escapeHtml(resetUrl)}
        </div>
      </div>
    </div>
  `;
}

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

            <div style="margin-top:12px;text-align:right;">
              <a href="/auth/forgot-password" style="color:#9ecbff;text-decoration:none;font-size:13px;">
                Forgot password?
              </a>
            </div>
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

router.get("/auth/forgot-password", async (req, res) => {
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
            <h1 style="margin-bottom:8px;">Reset Password</h1>
            <div class="muted">Enter your email and we’ll send you a reset link.</div>
          </div>

          ${errorHtml}
          ${successHtml}

          <div class="panel">
            <form method="POST" action="/auth/forgot-password">
              <label>Email</label>
              <input name="email" type="email" placeholder="Enter your email" required />

              <button class="btn btnFull" style="margin-top:14px;" type="submit">
                Send Reset Link
              </button>
            </form>

            <div style="margin-top:12px;text-align:center;">
              <a href="/auth" style="color:#9ecbff;text-decoration:none;font-size:13px;">
                Back to login
              </a>
            </div>
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
      renderShell("Forgot Password", body, "", {
        currentProfile: req.currentProfile || null,
        pageTitle: "Forgot Password",
        pageType: "auth",
      })
    );
  } catch (e) {
    console.error(e);
    return res.status(500).send("Forgot password page error");
  }
});

router.post("/auth/forgot-password", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!email) {
      return res.redirect("/auth/forgot-password?error=Email%20is%20required");
    }

    const account = await prisma.userAccount.findUnique({
      where: { email },
    });

    // Always show success, even if account doesn't exist
    if (!account) {
      return res.redirect("/auth/forgot-password?success=If%20that%20email%20exists,%20a%20reset%20link%20has%20been%20sent");
    }

    await prisma.magicLinkToken.deleteMany({
      where: {
        email,
        usedAt: null,
      },
    });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.magicLinkToken.create({
      data: {
        token,
        email,
        userAccountId: account.id,
        expiresAt,
      },
    });

    const resetUrl = `${WEB_BASE}/auth/reset-password?token=${encodeURIComponent(token)}`;

    if (resend) {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: email,
        subject: "Reset your Tapzy password",
        html: forgotPasswordEmailHtml(resetUrl),
      });
    } else {
      console.warn("Password reset requested but RESEND_API_KEY is missing.");
      console.log("Reset URL:", resetUrl);
    }

    return res.redirect("/auth/forgot-password?success=If%20that%20email%20exists,%20a%20reset%20link%20has%20been%20sent");
  } catch (e) {
    console.error(e);
    return res.redirect("/auth/forgot-password?error=Could%20not%20send%20reset%20email");
  }
});

router.get("/auth/reset-password", async (req, res) => {
  try {
    if (req.currentProfile?.username) {
      return res.redirect(`/u/${req.currentProfile.username}`);
    }

    const token = String(req.query.token || "").trim();
    const error = String(req.query.error || "").trim();
    const success = String(req.query.success || "").trim();

    if (!token) {
      return res.redirect("/auth?error=Missing%20reset%20token");
    }

    const tokenRecord = await prisma.magicLinkToken.findUnique({
      where: { token },
    });

    const invalid =
      !tokenRecord ||
      !!tokenRecord.usedAt ||
      tokenRecord.expiresAt < new Date();

    const errorHtml = error
      ? `<div class="panel" style="border-color:#5a1f1f;color:#ffcccc;background:linear-gradient(180deg,#241010,#160b0b);margin-bottom:14px;">${escapeHtml(error)}</div>`
      : "";

    const successHtml = success
      ? `<div class="success">${escapeHtml(success)}</div>`
      : "";

    const formHtml = invalid
      ? `
        <div class="panel" style="border-color:#5a1f1f;color:#ffcccc;background:linear-gradient(180deg,#241010,#160b0b);">
          This reset link is invalid or has expired.
        </div>
        <div style="margin-top:14px;text-align:center;">
          <a href="/auth/forgot-password" style="color:#9ecbff;text-decoration:none;font-size:13px;">
            Request a new reset link
          </a>
        </div>
      `
      : `
        <div class="panel">
          <form method="POST" action="/auth/reset-password">
            <input type="hidden" name="token" value="${escapeHtml(token)}" />

            <label>New Password</label>
            <input name="password" type="password" placeholder="Enter a new password" required />

            <label>Confirm Password</label>
            <input name="confirmPassword" type="password" placeholder="Confirm your new password" required />

            <button class="btn btnFull" style="margin-top:14px;" type="submit">
              Update Password
            </button>
          </form>
        </div>
      `;

    const body = `
      <div class="authWrap">
        <div class="card" style="max-width:420px;margin:0 auto;">
          <div style="text-align:center;margin-bottom:18px;">
            <h1 style="margin-bottom:8px;">Choose New Password</h1>
            <div class="muted">Secure your Tapzy account with a new password.</div>
          </div>

          ${errorHtml}
          ${successHtml}
          ${formHtml}
        </div>
      </div>

      ${renderTapzyAssistant({
        username: "User",
        isAuthPage: true,
        pageType: "auth",
      })}
    `;

    res.send(
      renderShell("Reset Password", body, "", {
        currentProfile: req.currentProfile || null,
        pageTitle: "Reset Password",
        pageType: "auth",
      })
    );
  } catch (e) {
    console.error(e);
    return res.status(500).send("Reset password page error");
  }
});

router.post("/auth/reset-password", async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    if (!token) {
      return res.redirect("/auth?error=Missing%20reset%20token");
    }

    if (!password || !confirmPassword) {
      return res.redirect(`/auth/reset-password?token=${encodeURIComponent(token)}&error=All%20fields%20are%20required`);
    }

    if (password.length < 8) {
      return res.redirect(`/auth/reset-password?token=${encodeURIComponent(token)}&error=Password%20must%20be%20at%20least%208%20characters`);
    }

    if (password !== confirmPassword) {
      return res.redirect(`/auth/reset-password?token=${encodeURIComponent(token)}&error=Passwords%20do%20not%20match`);
    }

    const tokenRecord = await prisma.magicLinkToken.findUnique({
      where: { token },
      include: { userAccount: true },
    });

    if (!tokenRecord || tokenRecord.usedAt || tokenRecord.expiresAt < new Date()) {
      return res.redirect("/auth/forgot-password?error=Reset%20link%20is%20invalid%20or%20expired");
    }

    if (!tokenRecord.userAccountId) {
      return res.redirect("/auth/forgot-password?error=Reset%20link%20is%20invalid");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.$transaction([
      prisma.userAccount.update({
        where: { id: tokenRecord.userAccountId },
        data: { passwordHash },
      }),
      prisma.magicLinkToken.update({
        where: { token },
        data: { usedAt: new Date() },
      }),
      prisma.userSession.deleteMany({
        where: { userAccountId: tokenRecord.userAccountId },
      }),
    ]);

    return res.redirect("/auth?success=Password%20updated.%20Please%20log%20in");
  } catch (e) {
    console.error(e);
    return res.redirect("/auth?error=Could%20not%20reset%20password");
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
