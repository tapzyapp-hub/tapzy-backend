const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Resend } = require("resend");
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

const WEB_BASE = String(
  process.env.WEB_BASE ||
    process.env.APP_BASE_URL ||
    process.env.PUBLIC_BASE_URL ||
    "http://localhost:3001"
).replace(/\/+$/, "");

const EMAIL_FROM = String(
  process.env.EMAIL_FROM || "Tapzy <support@tapzy.org>"
).trim();

const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function createRawResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

function authRedirect(res, params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, String(value));
  }
  const qs = search.toString();
  return res.redirect(qs ? `/auth?${qs}` : "/auth");
}

async function createPasswordResetToken(userAccountId) {
  const rawToken = createRawResetToken();
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  await prisma.passwordResetToken.deleteMany({
    where: { userAccountId },
  });

  await prisma.passwordResetToken.create({
    data: {
      tokenHash,
      userAccountId,
      expiresAt,
    },
  });

  return rawToken;
}

async function findValidPasswordResetToken(rawToken) {
  const tokenHash = sha256(rawToken);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: {
      userAccount: {
        include: {
          profile: true,
        },
      },
    },
  });

  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;

  return record;
}

async function sendPasswordResetEmail({ to, name, rawToken }) {
  const resetUrl = `${WEB_BASE}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;

  if (!resend) {
    console.log("Password reset requested but RESEND_API_KEY is not configured.");
    console.log("Reset link for testing:", resetUrl);
    return;
  }

  await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: "Reset your Tapzy password",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111111;">
        <h2 style="margin:0 0 12px;">Reset your Tapzy password</h2>
        <p style="margin:0 0 12px;">Hi${name ? ` ${escapeHtml(name)}` : ""},</p>
        <p style="margin:0 0 12px;">
          We received a request to reset your Tapzy password.
        </p>
        <p style="margin:18px 0;">
          <a
            href="${resetUrl}"
            style="display:inline-block;padding:12px 18px;border-radius:10px;background:#111111;color:#ffffff;text-decoration:none;font-weight:600;"
          >
            Reset password
          </a>
        </p>
        <p style="margin:0 0 10px;">This link expires in 1 hour.</p>
        <p style="margin:0;">If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

function renderAuthPage({
  req,
  error = "",
  success = "",
  forgotSuccess = "",
}) {
  const errorHtml = error
    ? `<div class="panel" style="border-color:#5a1f1f;color:#ffcccc;background:linear-gradient(180deg,#241010,#160b0b);margin-bottom:14px;">${escapeHtml(error)}</div>`
    : "";

  const successHtml = success
    ? `<div class="success">${escapeHtml(success)}</div>`
    : "";

  const forgotHtml = forgotSuccess
    ? `<div class="success">${escapeHtml(forgotSuccess)}</div>`
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
        ${forgotHtml}

        <div class="panel">
          <h3 style="margin-top:0;">Create Account</h3>
          <form method="POST" action="/auth/register">
            <label>Email</label>
            <input name="email" type="email" placeholder="Enter your email" required />

            <label>Password</label>
            <input name="password" type="password" placeholder="Create a password" required minlength="8" />

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

            <div style="margin-top:10px;text-align:right;">
              <a href="/auth/forgot-password" class="muted" style="text-decoration:none;">Forgot password?</a>
            </div>

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

  return renderShell("Tapzy Auth", body, "", {
    currentProfile: req.currentProfile || null,
    pageTitle: "Auth",
    pageType: "auth",
  });
}

function renderForgotPasswordPage(req, message = "") {
  const messageHtml = message
    ? `<div class="success" style="margin-bottom:14px;">${escapeHtml(message)}</div>`
    : "";

  const body = `
    <div class="authWrap">
      <div class="card" style="max-width:420px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:18px;">
          <h1 style="margin-bottom:8px;">Forgot Password</h1>
          <div class="muted">Enter your email and we’ll send you a reset link</div>
        </div>

        ${messageHtml}

        <div class="panel">
          <form method="POST" action="/auth/forgot-password">
            <label>Email</label>
            <input name="email" type="email" placeholder="Enter your email" required />

            <button class="btn btnFull" style="margin-top:14px;" type="submit">
              Send Reset Link
            </button>
          </form>

          <div style="margin-top:14px;text-align:center;">
            <a href="/auth" class="muted" style="text-decoration:none;">Back to login</a>
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

  return renderShell("Forgot Password", body, "", {
    currentProfile: req.currentProfile || null,
    pageTitle: "Forgot Password",
    pageType: "auth",
  });
}

function renderResetPasswordPage(req, token, error = "") {
  const errorHtml = error
    ? `<div class="panel" style="border-color:#5a1f1f;color:#ffcccc;background:linear-gradient(180deg,#241010,#160b0b);margin-bottom:14px;">${escapeHtml(error)}</div>`
    : "";

  const body = `
    <div class="authWrap">
      <div class="card" style="max-width:420px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:18px;">
          <h1 style="margin-bottom:8px;">Reset Password</h1>
          <div class="muted">Choose a new password for your Tapzy account</div>
        </div>

        ${errorHtml}

        <div class="panel">
          <form method="POST" action="/auth/reset-password">
            <input type="hidden" name="token" value="${escapeHtml(token)}" />

            <label>New Password</label>
            <input name="password" type="password" placeholder="Enter a new password" required minlength="8" />

            <label>Confirm Password</label>
            <input name="confirmPassword" type="password" placeholder="Confirm your new password" required minlength="8" />

            <button class="btn btnFull" style="margin-top:14px;" type="submit">
              Update Password
            </button>
          </form>

          <div style="margin-top:14px;text-align:center;">
            <a href="/auth" class="muted" style="text-decoration:none;">Back to login</a>
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

  return renderShell("Reset Password", body, "", {
    currentProfile: req.currentProfile || null,
    pageTitle: "Reset Password",
    pageType: "auth",
  });
}

router.get("/auth", async (req, res) => {
  try {
    if (req.currentProfile?.username) {
      return res.redirect(`/u/${req.currentProfile.username}`);
    }

    const error = String(req.query.error || "").trim();
    const success = String(req.query.success || "").trim();
    const forgotSuccess = String(req.query.forgotSuccess || "").trim();

    return res.send(
      renderAuthPage({
        req,
        error,
        success,
        forgotSuccess,
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
      return authRedirect(res, {
        error: "Email and password are required",
      });
    }

    if (password.length < 8) {
      return authRedirect(res, {
        error: "Password must be at least 8 characters",
      });
    }

    const existing = await prisma.userAccount.findUnique({
      where: { email },
    });

    if (existing) {
      return authRedirect(res, {
        error: "An account with that email already exists",
      });
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
    return authRedirect(res, {
      error: "Internal server error",
    });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return authRedirect(res, {
        error: "Email and password are required",
      });
    }

    const account = await prisma.userAccount.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (!account || !account.passwordHash) {
      return authRedirect(res, {
        error: "Account not found",
      });
    }

    const ok = await bcrypt.compare(password, account.passwordHash);

    if (!ok) {
      return authRedirect(res, {
        error: "Wrong password",
      });
    }

    await createSessionForAccount(account.id, res);

    if (account.profile?.username) {
      return res.redirect(`/u/${account.profile.username}`);
    }

    return authRedirect(res, {
      success: "Logged in",
    });
  } catch (e) {
    console.error(e);
    return authRedirect(res, {
      error: "Internal server error",
    });
  }
});

router.get("/auth/forgot-password", async (req, res) => {
  try {
    if (req.currentProfile?.username) {
      return res.redirect(`/u/${req.currentProfile.username}`);
    }

    return res.send(renderForgotPasswordPage(req));
  } catch (e) {
    console.error(e);
    return res.status(500).send("Forgot password page error");
  }
});

router.post("/auth/forgot-password", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();

    if (email) {
      const account = await prisma.userAccount.findUnique({
        where: { email },
        include: { profile: true },
      });

      if (account) {
        const rawToken = await createPasswordResetToken(account.id);

        await sendPasswordResetEmail({
          to: account.email,
          name: account.profile?.name || account.profile?.username || "",
          rawToken,
        });
      }
    }

    return authRedirect(res, {
      forgotSuccess:
        "If an account exists for that email, a reset link has been sent",
    });
  } catch (e) {
    console.error(e);
    return authRedirect(res, {
      error: "Unable to process password reset request",
    });
  }
});

router.get("/auth/reset-password", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();

    if (!token) {
      return authRedirect(res, {
        error: "Missing reset token",
      });
    }

    const record = await findValidPasswordResetToken(token);

    if (!record) {
      return authRedirect(res, {
        error: "This reset link is invalid or has expired",
      });
    }

    return res.send(renderResetPasswordPage(req, token));
  } catch (e) {
    console.error(e);
    return authRedirect(res, {
      error: "Unable to open reset link",
    });
  }
});

router.post("/auth/reset-password", async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    if (!token) {
      return authRedirect(res, {
        error: "Missing reset token",
      });
    }

    if (password.length < 8) {
      return res.send(
        renderResetPasswordPage(req, token, "Password must be at least 8 characters")
      );
    }

    if (password !== confirmPassword) {
      return res.send(
        renderResetPasswordPage(req, token, "Passwords do not match")
      );
    }

    const record = await findValidPasswordResetToken(token);

    if (!record) {
      return authRedirect(res, {
        error: "This reset link is invalid or has expired",
      });
    }

    const newHash = await bcrypt.hash(password, 10);

    await prisma.$transaction([
      prisma.userAccount.update({
        where: { id: record.userAccountId },
        data: { passwordHash: newHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.deleteMany({
        where: {
          userAccountId: record.userAccountId,
          id: { not: record.id },
        },
      }),
    ]);

    return authRedirect(res, {
      success: "Password updated. You can now log in",
    });
  } catch (e) {
    console.error(e);
    return authRedirect(res, {
      error: "Unable to reset password",
    });
  }
});

router.get("/logout", async (req, res) => {
  try {
    const { destroySession } = require("../utils");
    await destroySession(req, res);
    return authRedirect(res, {
      success: "Logged out",
    });
  } catch (e) {
    console.error(e);
    return authRedirect(res, {
      error: "Logout failed",
    });
  }
});

module.exports = router;

Also make sure your Prisma schema includes this model and relation:

model PasswordResetToken {
  id            String      @id @default(cuid())
  tokenHash     String      @unique
  userAccountId String
  userAccount   UserAccount @relation(fields: [userAccountId], references: [id], onDelete: Cascade)

  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())

  @@index([userAccountId], map: "passwordresettoken_userAccountId_idx")
  @@index([expiresAt], map: "passwordresettoken_expiresAt_idx")
  @@index([usedAt], map: "passwordresettoken_usedAt_idx")
}