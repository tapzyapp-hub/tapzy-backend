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
    <div class="wrap home-wrap">
      <section class="home-hero-card">
        <div class="home-kicker">Luxury Digital Identity</div>

        <div class="home-logo-wrap">
          <img src="/images/tapzy-logo-white.png" alt="Tapzy" class="home-logo-img" />
        </div>

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
  .home-wrap{
    max-width:1100px;
  }

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
    padding:80px 28px 120px;
    text-align:center;
    position:relative;
    overflow:hidden;
  }

  .home-kicker{
    color:#8f93a3;
    text-transform:uppercase;
    letter-spacing:5px;
    font-size:18px;
    margin-bottom:40px;
  }

  .home-logo-wrap{
    display:flex;
    justify-content:center;
    align-items:center;
    margin-bottom:40px;
  }

  .home-logo-img{
    width:100%;
    max-width:340px;
    height:auto;
    object-fit:contain;
    filter:drop-shadow(0 10px 30px rgba(255,255,255,.08));
  }

  .home-actions{
    display:grid;
    grid-template-columns:repeat(2, minmax(230px, 290px));
    justify-content:center;
    gap:18px 18px;
  }

  .home-btn{
    display:flex;
    align-items:center;
    justify-content:center;
    min-height:70px;
    padding:16px 22px;
    border-radius:26px;
    text-decoration:none;
    font-size:18px;
    font-weight:800;
    transition:all .2s ease;
  }

  .home-btn:hover{
    transform:translateY(-2px);
  }

  .home-btn-light{
    color:#000;
    background:linear-gradient(180deg, #f7fbff, #deeffb);
    box-shadow:0 18px 36px rgba(0,0,0,.25);
  }

  .home-btn-dark{
    color:#fff;
    background:linear-gradient(180deg, rgba(22,23,31,.98), rgba(14,15,22,.98));
    border:1px solid rgba(255,255,255,.08);
  }

  .home-btn-center{
    grid-column:1 / -1;
    width:100%;
    max-width:240px;
    margin:0 auto;
  }

  @media (max-width: 640px){
    .home-hero-card{
      margin-top:18px;
      min-height:calc(100vh - 220px);
      padding:50px 18px 100px;
      border-radius:24px;
    }

    .home-kicker{
      font-size:12px;
      letter-spacing:4px;
      margin-bottom:34px;
    }

    .home-logo-wrap{
      margin-bottom:42px;
    }

    .home-logo-img{
      max-width:340px;
    }

    .home-actions{
      grid-template-columns:1fr 1fr;
      gap:14px;
    }

    .home-btn{
      font-size:14px;
      min-height:64px;
      padding:14px 10px;
      border-radius:22px;
    }

    .home-btn-center{
      max-width:240px;
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