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

function safeAuthRedirect(value = "") {
  const text = String(value || "").trim();
  if (!text || !text.startsWith("/") || text.startsWith("//") || /^\\/i.test(text)) return "";
  return text;
}

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
    const redirectTo = safeAuthRedirect(req.query.redirectTo || req.body?.redirectTo || "");
    const redirectInput = redirectTo ? `<input type="hidden" name="redirectTo" value="${escapeHtml(redirectTo)}" />` : "";

    const errorHtml = error
      ? `<div class="panel" style="border-color:#5a1f1f;color:#ffcccc;background:linear-gradient(180deg,#241010,#160b0b);margin-bottom:14px;">${escapeHtml(error)}</div>`
      : "";

    const successHtml = success
      ? `<div class="success">${escapeHtml(success)}</div>`
      : "";

    const isCreateMode = String(req.query.mode || "").toLowerCase() === "create" || /account|exists/i.test(error);
    const authErrorMessage = error ? '<div class="authMessage authMessage-error">' + escapeHtml(error) + '</div>' : "";
    const authSuccessMessage = success ? '<div class="authMessage authMessage-success">' + escapeHtml(success) + '</div>' : "";
    const authCss = `
      <style>
        body.auth-page-shell,html:has(body.auth-page-shell){background:#000;color:#fff;}
        body.auth-page-shell header,body.auth-page-shell .topbar,body.auth-page-shell .siteHeader,body.auth-page-shell .nav,body.auth-page-shell .tz-menu,body.auth-page-shell .tz-menu-bar,body.auth-page-shell .tz-brand,body.auth-page-shell .tz-menu-btn,body.auth-page-shell .tz-stories-top-nav,body.auth-page-shell .tz-stories-bottom-nav{display:none!important;}
        body.auth-page-shell .siteShell,body.auth-page-shell main,body.auth-page-shell .pageShell{min-height:100svh;background:#000!important;}
        .authWrap{max-width:480px;margin:0 auto;padding:10px 14px 112px;}
        .authBrand{display:flex;align-items:center;justify-content:space-between;margin:0 2px 14px;color:#fff;}
        .authBrandMark{display:flex;align-items:center;gap:10px;font-weight:950;font-size:19px;letter-spacing:0;}
        .authBrandMark span:last-child{color:rgba(231,238,255,.64);font-weight:750;}
        .authLogoMini{width:42px;height:42px;border-radius:14px;border:1px solid rgba(255,255,255,.18);display:grid;place-items:center;background:rgba(255,255,255,.06);box-shadow:0 12px 28px rgba(0,0,0,.22);}
        .authLogoMini img{width:74%;height:74%;object-fit:contain;}
        .authHelpLink{color:rgba(223,238,255,.72);text-decoration:none;font-size:13px;font-weight:850;}
        .authCard{position:relative;overflow:hidden;border-radius:30px;padding:24px;background:linear-gradient(180deg,rgba(16,20,29,.98),rgba(3,4,7,1));border:1px solid rgba(255,255,255,.10);box-shadow:0 24px 70px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.08);}
        .authCard::before{content:"";position:absolute;inset:-48% -25% auto;height:250px;background:radial-gradient(circle at 50% 0%,rgba(82,164,255,.16),transparent 64%);pointer-events:none;}
        .authCard::after{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.12) .7px,transparent .7px);background-size:11px 11px;opacity:.08;pointer-events:none;}
        .authHero,.authModeSwitch,.authPanel,.authMessage,.authSpeedNote{position:relative;z-index:1;}
        .authHero{text-align:left;margin-bottom:18px;}
        .authBadge{display:inline-flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 11px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.11);color:rgba(230,240,255,.76);font-size:12px;font-weight:900;}
        .authBadge::before{content:"";width:7px;height:7px;border-radius:999px;background:#62d8ff;box-shadow:0 0 16px rgba(98,216,255,.9);}
        .authHero h1{margin:0;font-size:clamp(36px,11vw,48px);line-height:.95;letter-spacing:0;font-weight:950;}
        .authHero p{margin:12px 0 0;max-width:360px;color:rgba(232,240,255,.72);font-size:15px;line-height:1.42;}
        .authModeSwitch{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:5px;margin:18px 0;border-radius:18px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.10);}
        .authModeSwitch button{appearance:none;border:0;border-radius:14px;min-height:44px;background:transparent;color:rgba(255,255,255,.72);font-weight:900;font-size:15px;cursor:pointer;}
        .authModeSwitch button.is-active{background:#fff;color:#06101d;box-shadow:0 8px 24px rgba(120,190,255,.18);}
        .authPanel{display:none;position:relative;padding:18px;border-radius:24px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.10);}
        .authPanel.is-active{display:block;}
        .authPanel h2{margin:0 0 6px;font-size:26px;line-height:1.05;letter-spacing:0;font-weight:950;}
        .authHint{margin:0 0 16px;color:rgba(255,255,255,.62);font-size:14px;line-height:1.35;}
        .authPanel label{display:block;margin:12px 0 7px;color:rgba(255,255,255,.76);font-size:13px;font-weight:850;}
        .authInputWrap{position:relative;}
        .authPanel input{width:100%;min-height:54px;border-radius:17px;border:1px solid rgba(190,225,255,.24);background:rgba(3,8,14,.50);color:#fff;padding:0 16px;font-size:16px;font-weight:800;outline:none;box-sizing:border-box;}
        .authInputWrap input[data-password-input]{padding-right:76px;}
        .authPasswordToggle{position:absolute;right:8px;top:8px;min-height:38px;padding:0 12px;border:0;border-radius:12px;background:rgba(255,255,255,.08);color:#dfefff;font:inherit;font-size:12px;font-weight:950;}
        .authPanel input:focus{border-color:rgba(130,205,255,.68);box-shadow:0 0 0 3px rgba(72,165,255,.14);}
        .authPrimary{width:100%;min-height:56px;margin-top:16px;border:0;border-radius:18px;background:linear-gradient(180deg,#fff,#dceeff);color:#06101d;font-size:17px;font-weight:950;box-shadow:0 14px 32px rgba(112,190,255,.20);}
        .authForgot{display:block;width:max-content;margin:13px auto 0;color:#9fd2ff;text-decoration:none;font-size:14px;font-weight:800;}
        .authFinePrint{margin:14px 2px 0;color:rgba(255,255,255,.46);font-size:12px;line-height:1.35;text-align:center;}
        .authMessage{border-radius:18px;padding:12px 14px;margin-bottom:14px;font-size:14px;font-weight:800;line-height:1.35;}
        .authMessage-error{border:1px solid rgba(255,111,111,.26);color:#ffd6d6;background:rgba(70,16,24,.58);}
        .authMessage-success{border:1px solid rgba(103,255,178,.22);color:#ccffe5;background:rgba(16,70,44,.42);}
        .authSpeedNote{display:flex;gap:8px;align-items:center;justify-content:center;margin-top:14px;color:rgba(225,238,255,.54);font-size:12px;font-weight:800;}
        .authSpeedNote span{width:6px;height:6px;border-radius:99px;background:#62d8ff;box-shadow:0 0 12px rgba(98,216,255,.85);}
        @media(max-width:430px){.authWrap{padding:10px 12px 96px}.authCard{padding:18px;border-radius:24px}.authPanel{padding:15px;border-radius:20px}.authHero h1{font-size:40px}.authLogo{width:50px;height:50px;border-radius:16px;font-size:28px}.authModeSwitch button{font-size:14px;min-height:42px}.authPanel h2{font-size:23px}.authPanel input,.authPrimary{min-height:52px}}
      </style>
    `;

    const body = `
      <div class="authWrap">
        <div class="authBrand"><div class="authBrandMark"><span class="authLogoMini"><img src="/images/tapzy-mark-white.png" alt="" /></span><strong>Tapzy</strong><span>Network</span></div><a class="authHelpLink" href="/">Home</a></div>
        <div class="authCard" data-auth-card>
          <div class="authHero">
            <div class="authBadge">Secure account access</div>
            <h1>Your Tapzy starts here.</h1>
            <p>Log in or create an account to keep your profile, events, messages, and stories synced.</p>
          </div>

          ${authErrorMessage}
          ${authSuccessMessage}

          <div class="authModeSwitch" role="tablist" aria-label="Choose account action">
            <button type="button" class="${isCreateMode ? "" : "is-active"}" data-auth-tab="login" aria-selected="${isCreateMode ? "false" : "true"}">Log in</button>
            <button type="button" class="${isCreateMode ? "is-active" : ""}" data-auth-tab="create" aria-selected="${isCreateMode ? "true" : "false"}">Create</button>
          </div>

          <section class="authPanel ${isCreateMode ? "" : "is-active"}" data-auth-panel="login">
            <h2>Welcome back</h2>
            <p class="authHint">Use the email and password for your Tapzy account.</p>
            <form method="POST" action="/auth/login" autocomplete="on">
              ${redirectInput}
              <label for="loginEmail">Email</label>
              <div class="authInputWrap"><input id="loginEmail" name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" required /></div>
              <label for="loginPassword">Password</label>
              <div class="authInputWrap"><input id="loginPassword" name="password" type="password" autocomplete="current-password" placeholder="Your password" data-password-input required /><button class="authPasswordToggle" type="button" data-password-toggle="loginPassword">Show</button></div>
              <button class="authPrimary" type="submit">Log in</button>
            </form>
            <a class="authForgot" href="/auth/forgot-password">Forgot password?</a>
          </section>

          <section class="authPanel ${isCreateMode ? "is-active" : ""}" data-auth-panel="create">
            <h2>Create account</h2>
            <p class="authHint">Start with your email and a password. You can finish your profile after.</p>
            <form method="POST" action="/auth/register" autocomplete="on">
              ${redirectInput}
              <label for="createEmail">Email</label>
              <div class="authInputWrap"><input id="createEmail" name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" required /></div>
              <label for="createPassword">Password</label>
              <div class="authInputWrap"><input id="createPassword" name="password" type="password" autocomplete="new-password" placeholder="At least 8 characters" minlength="8" data-password-input required /><button class="authPasswordToggle" type="button" data-password-toggle="createPassword">Show</button></div>
              <button class="authPrimary" type="submit">Create account</button>
            </form>
            <p class="authFinePrint">Already have an account? Tap Log in above.</p>
          </section>
          <div class="authSpeedNote"><span></span>Fast sign-in, saved on this device</div>
        </div>
      </div>

      <script>
        (function(){
          var card = document.querySelector('[data-auth-card]');
          if (!card) return;
          var tabs = card.querySelectorAll('[data-auth-tab]');
          var panels = card.querySelectorAll('[data-auth-panel]');
          card.querySelectorAll('[data-password-toggle]').forEach(function(button){
            button.addEventListener('click', function(){
              var input = document.getElementById(button.getAttribute('data-password-toggle'));
              if (!input) return;
              var show = input.type === 'password';
              input.type = show ? 'text' : 'password';
              button.textContent = show ? 'Hide' : 'Show';
            });
          });
          tabs.forEach(function(tab){
            tab.addEventListener('click', function(){
              var mode = tab.getAttribute('data-auth-tab');
              tabs.forEach(function(item){
                var active = item === tab;
                item.classList.toggle('is-active', active);
                item.setAttribute('aria-selected', active ? 'true' : 'false');
              });
              panels.forEach(function(panel){ panel.classList.toggle('is-active', panel.getAttribute('data-auth-panel') === mode); });
              var input = card.querySelector('[data-auth-panel="' + mode + '"] input');
              if (input) setTimeout(function(){ input.focus({ preventScroll:true }); }, 80);
            });
          });
        })();
      </script>

      ${renderTapzyAssistant({
        username: "User",
        isAuthPage: true,
        pageType: "auth",
      })}
    `;

    res.send(
      renderShell("Tapzy Auth", body, authCss, {
        currentProfile: req.currentProfile || null,
        pageTitle: "Auth",
        pageType: "auth",
        bodyClass: "auth-page-shell",
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
    const redirectTo = safeAuthRedirect(req.body.redirectTo);

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

    if (redirectTo) return res.redirect(redirectTo);

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
    const redirectTo = safeAuthRedirect(req.body.redirectTo);

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

    if (redirectTo) return res.redirect(redirectTo);

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
