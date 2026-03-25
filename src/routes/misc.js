const router = require("express").Router();
const {
  renderShell,
  renderTapzyAssistant,
  escapeHtml,
} = require("../utils");

router.get("/", async (req, res) => {
  try {
    const currentProfile = req.currentProfile || null;
    const signedIn = !!currentProfile;
    const username = currentProfile?.username || "";

    const primaryHref = signedIn ? `/u/${username}` : "/auth";
    const primaryLabel = signedIn ? "Open My Profile" : "Get Started";

    const body = `
    <div class="wrap" style="max-width:1100px;">
      <section class="home-hero-card">
        <div class="home-kicker">Luxury Digital Identity</div>
        <h1 class="home-title">Tapzy</h1>
        <p class="home-subtitle">
         
        </p>

        <div class="home-actions">
          <a class="home-btn home-btn-light" href="${primaryHref}">
            ${escapeHtml(primaryLabel)}
          </a>

          <a class="home-btn home-btn-dark" href="/search">
            Search Users
          </a>

          <a class="home-btn home-btn-dark home-btn-center" href="${signedIn ? "/messages" : "/auth"}">
            Messages
          </a>
        </div>
      </section>
    </div>

   <style>
      .home-hero-card{
        margin-top:28px;
        min-height:620px;
        border-radius:34px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(900px 420px at 50% -10%, rgba(125,214,255,.06), transparent 45%),
          linear-gradient(180deg, rgba(9,10,15,.98), rgba(4,4,7,1));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.03),
          0 30px 80px rgba(0,0,0,.42);
        padding:72px 28px 180px;
        text-align:center;
        position:relative;
        overflow:hidden;
      }

      .home-kicker{
        color:#8f93a3;
        text-transform:uppercase;
        letter-spacing:5px;
        font-size:20px;
        margin-bottom:26px;
      }

      .home-title{
        font-size:92px;
        line-height:1;
        margin:0;
        font-weight:800;
        letter-spacing:-2px;
        color:#f4f9ff;
      }

      .home-subtitle{
        margin:26px auto 0;
        max-width:760px;
        color:#8f93a3;
        font-size:14px;
        line-height:1.35;
      }

      .home-actions{
        margin-top:44px;
        display:grid;
        grid-template-columns:repeat(2, minmax(250px, 340px));
        justify-content:center;
        gap:18px 22px;
      }

      .home-btn{
        display:flex;
        align-items:center;
        justify-content:center;
        min-height:88px;
        padding:20px 28px;
        border-radius:30px;
        text-decoration:none;
        font-size:24px;
        font-weight:800;
        letter-spacing:.2px;
        transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease;
        text-align:center;
        white-space:nowrap;
      }

      .home-btn:hover{
        transform:translateY(-1px);
      }

      .home-btn-light{
        color:#000;
        background:linear-gradient(180deg, #f7fbff, #deeffb);
        box-shadow:0 18px 36px rgba(0,0,0,.24);
      }

      .home-btn-dark{
        color:#fff;
        background:linear-gradient(180deg, rgba(22,23,31,.98), rgba(14,15,22,.98));
        border:1px solid rgba(255,255,255,.08);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
      }

      .home-btn-center{
        grid-column:1 / -1;
        justify-self:center;
        width:min(340px, 100%);
      }

      @media (max-width: 900px){
        .home-hero-card{
          min-height:560px;
          padding:56px 22px 170px;
          border-radius:28px;
        }

        .home-title{
          font-size:72px;
        }

        .home-subtitle{
          font-size:26px;
        }

        .home-kicker{
          font-size:15px;
          letter-spacing:4px;
        }

        .home-actions{
          grid-template-columns:1fr 1fr;
        }

        .home-btn{
          min-height:76px;
          font-size:21px;
          border-radius:26px;
          white-space:nowrap;
        }
      }

      @media (max-width: 640px){
        .wrap{
          padding-top:18px;
        }

        .home-hero-card{
          margin-top:18px;
          min-height:calc(100vh - 220px);
          padding:44px 18px 170px;
          border-radius:24px;
        }

        .home-kicker{
          font-size:12px;
          letter-spacing:4px;
          margin-bottom:22px;
        }

        .home-title{
          font-size:64px;
        }

        .home-subtitle{
          margin-top:22px;
          font-size:18px;
          line-height:1.45;
          max-width:320px;
        }

        .home-actions{
          margin-top:34px;
          grid-template-columns:1fr 1fr;
          gap:14px;
        }

        .home-btn{
          min-height:64px;
          font-size:14px;
          padding:14px 12px;
          border-radius:22px;
          white-space:nowrap;
        }

        .home-btn-center{
          width:min(240px, 100%);
        }
      }
    </style>

    ${renderTapzyAssistant({
      username: currentProfile?.username || "User",
      pageType: "home",
    })}
    `;

    return res.send(
      renderShell("Tapzy", body, "", {
        currentProfile,
        pageTitle: "Home",
        pageType: "home",
      })
    );
  } catch (e) {
    console.error(e);
    return res.status(500).send("Home page error");
  }
});

module.exports = router;
 