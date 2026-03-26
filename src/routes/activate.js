const router = require("express").Router();



const prisma = require("../prisma");

const { activateLimiter } = require("../middleware");

const {

  renderShell,

  escapeHtml,

  renderTapzyAssistant,

} = require("../utils");



function normalizeCode(value) {

  return String(value || "").trim().toUpperCase();

}



function normalizeToken(value) {

  return String(value || "").trim();

}



function buildClaimShell({

  token = "",

  code = "",

  title = "Activate Card",

  message = "",

  submessage = "",

  currentProfile = null,

  activation = null,

  claimAllowed = false,

  showManualEntry = true,

}) {

  const claimedUsername = activation?.profile?.username || "";

  const claimedName = activation?.profile?.name || claimedUsername || "Tapzy User";



  const body = `

  <div class="wrap tz-activate-wrap">

    <div class="tz-activate-shell">



      <section class="tz-activate-hero">

        <div class="tz-activate-hero-glow tz-activate-hero-glow-a"></div>

        <div class="tz-activate-hero-glow tz-activate-hero-glow-b"></div>



        <div class="tz-activate-hero-top">

          <div>

            <div class="tz-activate-kicker">TAPZY CARD ACTIVATION</div>

            <h1 class="tz-activate-title">${escapeHtml(title)}</h1>

            <div class="tz-activate-subtitle">

              ${escapeHtml(submessage || "Claim your Tapzy card and connect it to your profile.")}

            </div>

          </div>

        </div>

      </section>



      <section class="tz-activate-card">

        <div class="tz-activate-card-head">

          <div class="tz-activate-card-title">Card Status</div>

          ${

            activation

              ? `

                <div class="tz-activate-badges">

                  <span class="tz-activate-badge">${activation.claimedAt ? "Claimed" : "Unclaimed"}</span>

                  <span class="tz-activate-badge ${activation.isActive ? "is-active" : "is-inactive"}">

                    ${activation.isActive ? "Active" : "Deactivated"}

                  </span>

                </div>

              `

              : ""

          }

        </div>



        <div class="tz-activate-message">

          ${escapeHtml(message)}

        </div>



        ${

          activation?.profile?.username

            ? `

              <div class="tz-activate-linked">

                Linked profile:

                <a href="/u/${escapeHtml(activation.profile.username)}">

                  @${escapeHtml(activation.profile.username)}

                </a>

                ${claimedName && claimedName !== claimedUsername ? `• ${escapeHtml(claimedName)}` : ""}

              </div>

            `

            : ""

        }



        ${

          token

            ? `

              <div class="tz-activate-meta">

                <div><span>Public token</span><strong>${escapeHtml(token)}</strong></div>

                ${activation?.code ? `<div><span>Card code</span><strong>${escapeHtml(activation.code)}</strong></div>` : ""}

              </div>

            `

            : ""

        }



        ${

          claimAllowed

            ? `

              <form method="POST" action="/activate/claim" class="tz-activate-form">

                <input type="hidden" name="token" value="${escapeHtml(token)}" />

                <button class="tz-activate-btn" type="submit">

                  Claim This Card

                </button>

              </form>

            `

            : ""

        }



        ${

          currentProfile

            ? `

              <div class="tz-activate-signedin">

                Signed in as <strong>@${escapeHtml(currentProfile.username || "user")}</strong>

              </div>

            `

            : `

              <div class="tz-activate-warning">

                You need to sign in to claim a Tapzy card.

              </div>

            `

        }

      </section>



      ${

        showManualEntry

          ? `

            <section class="tz-activate-card">

              <div class="tz-activate-card-head">

                <div class="tz-activate-card-title">Manual Code Claim</div>

              </div>



              <div class="tz-activate-help">

                If you have a printed activation code like <strong>TZ-ABC123</strong>, enter it below.

              </div>



              <form method="POST" action="/activate/claim-by-code" class="tz-activate-form">

                <input

                  class="tz-activate-input"

                  type="text"

                  name="code"

                  value="${escapeHtml(code)}"

                  placeholder="Enter activation code"

                  autocomplete="off"

                />

                <button class="tz-activate-btn" type="submit">Claim By Code</button>

              </form>

            </section>

          `

          : ""

      }



      <section class="tz-activate-card">

        <div class="tz-activate-card-head">

          <div class="tz-activate-card-title">What happens after claim?</div>

        </div>



        <div class="tz-activate-list">

          <div class="tz-activate-list-item">Your card gets linked to your Tapzy profile.</div>

          <div class="tz-activate-list-item">Future taps can open your live Tapzy profile instantly.</div>

          <div class="tz-activate-list-item">The tap route can detect which profile owns the card.</div>

        </div>

      </section>

    </div>

  </div>



  <style>

    .tz-activate-wrap{

      max-width:920px;

    }



    .tz-activate-shell{

      display:flex;

      flex-direction:column;

      gap:16px;

    }



    .tz-activate-hero{

      position:relative;

      overflow:hidden;

      border-radius:32px;

      padding:24px;

      border:1px solid rgba(255,255,255,.07);

      background:

        radial-gradient(900px 420px at 50% 0%, rgba(255,255,255,.03), transparent 45%),

        linear-gradient(180deg, rgba(0,0,0,.995), rgba(0,0,0,1));

      box-shadow:

        0 24px 70px rgba(0,0,0,.68),

        inset 0 1px 0 rgba(255,255,255,.03),

        inset 0 0 0 1px rgba(255,255,255,.015);

    }



    .tz-activate-hero-glow{

      position:absolute;

      border-radius:999px;

      pointer-events:none;

      filter:blur(28px);

    }



    .tz-activate-hero-glow-a{

      width:220px;

      height:220px;

      right:-30px;

      top:-40px;

      background:radial-gradient(circle, rgba(170,242,255,.09) 0%, rgba(170,242,255,.03) 40%, transparent 72%);

    }



    .tz-activate-hero-glow-b{

      width:190px;

      height:190px;

      left:60px;

      bottom:-56px;

      background:radial-gradient(circle, rgba(64,136,255,.09) 0%, rgba(64,136,255,.03) 40%, transparent 75%);

    }



    .tz-activate-hero-top{

      position:relative;

      z-index:2;

      display:flex;

      align-items:flex-start;

      justify-content:space-between;

      gap:18px;

      flex-wrap:wrap;

    }



    .tz-activate-kicker{

      color:#aeb9cf;

      font-size:12px;

      letter-spacing:6px;

      text-transform:uppercase;

      margin-bottom:12px;

    }



    .tz-activate-title{

      margin:0;

      font-size:46px;

      line-height:1;

      letter-spacing:-1.4px;

      font-weight:900;

      color:#fff;

    }



    .tz-activate-subtitle{

      margin-top:12px;

      color:#ffffff;

      font-size:16px;

      line-height:1.65;

      max-width:740px;

    }



    .tz-activate-card{

      border-radius:28px;

      padding:18px;

      border:1px solid rgba(255,255,255,.06);

      background:

        radial-gradient(520px 220px at 70% 12%, rgba(255,255,255,.025), transparent 40%),

        linear-gradient(180deg, rgba(0,0,0,.99), rgba(0,0,0,1));

      box-shadow:

        inset 0 1px 0 rgba(255,255,255,.03),

        0 16px 34px rgba(0,0,0,.24);

    }



    .tz-activate-card-head{

      display:flex;

      align-items:center;

      justify-content:space-between;

      gap:12px;

      flex-wrap:wrap;

      margin-bottom:12px;

    }



    .tz-activate-card-title{

      color:#fff;

      font-size:22px;

      font-weight:900;

      letter-spacing:-.4px;

    }



    .tz-activate-badges{

      display:flex;

      gap:8px;

      flex-wrap:wrap;

    }



    .tz-activate-badge{

      display:inline-flex;

      align-items:center;

      justify-content:center;

      min-height:34px;

      padding:0 12px;

      border-radius:999px;

      border:1px solid rgba(255,255,255,.08);

      background:rgba(255,255,255,.03);

      color:#fff;

      font-size:12px;

      font-weight:800;

      letter-spacing:.3px;

      text-transform:uppercase;

    }



    .tz-activate-badge.is-active{

      border-color:rgba(120,220,160,.18);

      color:#d8ffe8;

    }



    .tz-activate-badge.is-inactive{

      border-color:rgba(255,120,120,.18);

      color:#ffd8d8;

    }



    .tz-activate-message{

      color:#ffffff;

      font-size:16px;

      line-height:1.65;

    }



    .tz-activate-linked{

      margin-top:12px;

      color:#d7dbe3;

      font-size:14px;

      line-height:1.6;

    }



    .tz-activate-linked a{

      color:#fff;

      text-decoration:none;

      font-weight:800;

    }



    .tz-activate-linked a:hover{

      text-decoration:underline;

    }



    .tz-activate-meta{

      display:grid;

      gap:10px;

      margin-top:14px;

    }



    .tz-activate-meta > div{

      display:flex;

      align-items:center;

      justify-content:space-between;

      gap:12px;

      padding:14px 16px;

      border-radius:18px;

      border:1px solid rgba(255,255,255,.06);

      background:rgba(255,255,255,.02);

    }



    .tz-activate-meta span{

      color:#c8ced7;

      font-size:13px;

      font-weight:700;

    }



    .tz-activate-meta strong{

      color:#fff;

      font-size:14px;

      font-weight:900;

      word-break:break-all;

      text-align:right;

    }



    .tz-activate-form{

      display:flex;

      flex-direction:column;

      gap:12px;

      margin-top:14px;

    }



    .tz-activate-input{

      width:100%;

      padding:15px 16px;

      border-radius:20px;

      border:1px solid rgba(255,255,255,.08);

      background:linear-gradient(180deg, rgba(5,5,5,.99), rgba(0,0,0,1));

      color:#fff;

      outline:none;

      box-sizing:border-box;

      box-shadow:inset 0 1px 0 rgba(255,255,255,.02);

      font-size:15px;

    }



    .tz-activate-input:focus{

      border-color:rgba(140,220,255,.22);

      box-shadow:0 0 0 3px rgba(140,220,255,.06);

    }



    .tz-activate-btn{

      width:100%;

      min-height:56px;

      border:none;

      border-radius:20px;

      cursor:pointer;

      font-size:16px;

      font-weight:900;

      color:#fff;

      background:

        radial-gradient(circle at 50% 0%, rgba(150,230,255,.20), transparent 55%),

        linear-gradient(180deg, rgba(32,86,210,.92), rgba(14,34,90,.98));

      box-shadow:

        0 12px 28px rgba(0,0,0,.24),

        0 0 16px rgba(80,150,255,.14),

        inset 0 1px 0 rgba(255,255,255,.14);

    }



    .tz-activate-signedin{

      margin-top:12px;

      color:#ffffff;

      font-size:14px;

      line-height:1.6;

    }



    .tz-activate-warning{

      margin-top:12px;

      color:#ffd9d9;

      font-size:14px;

      line-height:1.6;

    }



    .tz-activate-help{

      color:#ffffff;

      font-size:14px;

      line-height:1.7;

    }



    .tz-activate-help strong{

      color:#fff;

    }



    .tz-activate-list{

      display:grid;

      gap:10px;

    }



    .tz-activate-list-item{

      padding:14px 16px;

      border-radius:18px;

      border:1px solid rgba(255,255,255,.06);

      background:rgba(255,255,255,.02);

      color:#ffffff;

      font-size:14px;

      line-height:1.6;

    }



    @media(max-width:700px){

      .tz-activate-hero{

        padding:20px 16px;

        border-radius:26px;

      }



      .tz-activate-title{

        font-size:34px;

      }



      .tz-activate-subtitle{

        font-size:15px;

        line-height:1.6;

      }



      .tz-activate-card{

        padding:16px;

        border-radius:22px;

      }



      .tz-activate-btn{

        min-height:54px;

        border-radius:18px;

      }

    }

  </style>



  ${renderTapzyAssistant({

    username: currentProfile?.username || "User",

    pageType: "activate",

  })}

  `;



  return body;

}



router.get("/a/:token", activateLimiter, async (req, res) => {

  try {

    const token = normalizeToken(req.params.token);



    if (!token) {

      return res.status(400).send("Invalid tap token");

    }



    const activation = await prisma.activationCode.findUnique({

      where: { publicToken: token },

      include: { profile: true },

    });



    if (!activation) {

      return res.status(404).send("Card not found");

    }



    if (!activation.isActive) {

      return res.redirect(`/activate?token=${encodeURIComponent(token)}&status=deactivated`);

    }



    if (!activation.claimedAt || !activation.profile) {

      return res.redirect(`/activate?token=${encodeURIComponent(token)}&status=unclaimed`);

    }



    if (activation.profile.username) {

      return res.redirect(`/u/${encodeURIComponent(activation.profile.username)}?tap=1`);

    }



    return res.redirect(`/activate?token=${encodeURIComponent(token)}&status=claimed`);

  } catch (e) {

    console.error(e);

    return res.status(500).send("Tap route error");

  }

});



router.get("/activate", activateLimiter, async (req, res) => {

  try {

    const token = normalizeToken(req.query.token);

    const code = normalizeCode(req.query.code);

    const status = String(req.query.status || "").trim();

    const currentProfile = req.currentProfile || null;



    let activation = null;



    if (token) {

      activation = await prisma.activationCode.findUnique({

        where: { publicToken: token },

        include: { profile: true },

      });

    } else if (code) {

      activation = await prisma.activationCode.findUnique({

        where: { code },

        include: { profile: true },

      });

    }



    let title = "Activate Card";

    let message = "Enter your Tapzy activation code or use a card activation link.";

    let submessage = "Claim your Tapzy card and connect it to your profile.";

    let claimAllowed = false;



    if ((token || code) && !activation) {

      title = "Card Not Found";

      message = "We could not find a Tapzy activation card matching that token or code.";

      submessage = "Check the activation link or activation code and try again.";

    } else if (activation) {

      if (!activation.isActive) {

        title = "Card Deactivated";

        message = "This Tapzy card is currently deactivated and cannot be claimed.";

        submessage = activation.deactivationReason || "Contact support or an admin if this card should be reactivated.";

      } else if (activation.claimedAt && activation.profile) {

        if (currentProfile && activation.profileId === currentProfile.id) {

          title = "Card Already Claimed";

          message = "This card is already linked to your Tapzy profile.";

          submessage = "You already own this Tapzy card.";

        } else {

          title = "Card Already Claimed";

          message = "This Tapzy card has already been claimed by another profile.";

          submessage = "Each Tapzy card can only be claimed once.";

        }

      } else {

        title = "Ready To Claim";

        message = currentProfile

          ? "This Tapzy card is unclaimed and ready to be linked to your signed-in profile."

          : "This Tapzy card is unclaimed. Sign in, then claim it to link it to your profile.";

        submessage = "Once claimed, future taps can open your live Tapzy profile.";

        claimAllowed = !!currentProfile && !!token;

      }

    } else if (status === "unclaimed") {

      message = currentProfile

        ? "This Tapzy card is unclaimed and ready to be linked to your signed-in profile."

        : "This Tapzy card is unclaimed. Sign in, then claim it to link it to your profile.";

    } else if (status === "deactivated") {

      title = "Card Deactivated";

      message = "This Tapzy card is currently deactivated and cannot be used.";

      submessage = "Contact support or an admin if this card should be reactivated.";

    }



    const body = buildClaimShell({

      token,

      code,

      title,

      message,

      submessage,

      currentProfile,

      activation,

      claimAllowed,

      showManualEntry: true,

    });



    return res.send(

      renderShell("Activate Card • Tapzy", body, "", {

        currentProfile,

        pageTitle: "Activate Card",

        pageType: "activate",

      })

    );

  } catch (e) {

    console.error(e);

    return res.status(500).send("Activate page error");

  }

});



router.post("/activate/claim", activateLimiter, async (req, res) => {

  try {

    const token = normalizeToken(req.body.token);

    const currentProfile = req.currentProfile || null;



    if (!currentProfile) {

      return res.redirect(`/activate?token=${encodeURIComponent(token)}&error=signin`);

    }



    if (!token) {

      return res.status(400).send("Missing token");

    }



    const activation = await prisma.activationCode.findUnique({

      where: { publicToken: token },

      include: { profile: true },

    });



    if (!activation) {

      return res.status(404).send("Activation card not found");

    }



    if (!activation.isActive) {

      return res.redirect(`/activate?token=${encodeURIComponent(token)}&status=deactivated`);

    }



    if (activation.claimedAt || activation.profileId) {

      if (activation.profileId === currentProfile.id) {

        return res.redirect(`/u/${encodeURIComponent(currentProfile.username)}?claimed=1`);

      }

      return res.redirect(`/activate?token=${encodeURIComponent(token)}&status=claimed`);

    }



    await prisma.activationCode.update({

      where: { publicToken: token },

      data: {

        profileId: currentProfile.id,

        claimedAt: new Date(),

        isActive: true,

      },

    });



    return res.redirect(`/u/${encodeURIComponent(currentProfile.username)}?claimed=1`);

  } catch (e) {

    console.error(e);

    return res.status(500).send("Claim error");

  }

});



router.post("/activate/claim-by-code", activateLimiter, async (req, res) => {

  try {

    const code = normalizeCode(req.body.code);

    const currentProfile = req.currentProfile || null;



    if (!currentProfile) {

      return res.redirect(`/activate?code=${encodeURIComponent(code)}&error=signin`);

    }



    if (!code) {

      return res.status(400).send("Missing code");

    }



    const activation = await prisma.activationCode.findUnique({

      where: { code },

      include: { profile: true },

    });



    if (!activation) {

      return res.redirect(`/activate?code=${encodeURIComponent(code)}&error=notfound`);

    }



    if (!activation.isActive) {

      return res.redirect(`/activate?code=${encodeURIComponent(code)}&status=deactivated`);

    }



    if (activation.claimedAt || activation.profileId) {

      if (activation.profileId === currentProfile.id) {

        return res.redirect(`/u/${encodeURIComponent(currentProfile.username)}?claimed=1`);

      }

      return res.redirect(`/activate?code=${encodeURIComponent(code)}&status=claimed`);

    }



    await prisma.activationCode.update({

      where: { id: activation.id },

      data: {

        profileId: currentProfile.id,

        claimedAt: new Date(),

        isActive: true,

      },

    });



    return res.redirect(`/u/${encodeURIComponent(currentProfile.username)}?claimed=1`);

  } catch (e) {

    console.error(e);

    return res.status(500).send("Claim by code error");

  }

});



module.exports = router;