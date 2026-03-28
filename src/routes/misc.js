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

/* ---------- CONTAINER ---------- */

.home-wrap{

  max-width:1100px;

}



/* ---------- HERO CARD ---------- */

.home-hero-card{

  margin-top:28px;

  min-height:620px;

  border-radius:34px;

  border:1px solid rgba(255,255,255,.08);



  /* 🔥 Galaxy + depth */

  background:

    radial-gradient(500px 260px at 50% 35%, rgba(125,214,255,.08), transparent 60%),

    radial-gradient(900px 420px at 50% -10%, rgba(125,214,255,.06), transparent 45%),

    linear-gradient(180deg, rgba(9,10,15,.98), rgba(4,4,7,1));



  box-shadow:

    inset 0 1px 0 rgba(255,255,255,.03),

    0 30px 80px rgba(0,0,0,.45);



  padding:80px 28px 110px;

  text-align:center;

  position:relative;

  overflow:hidden;

}



/* ---------- TITLE ---------- */

.home-kicker{

  color:#8f93a3;

  text-transform:uppercase;

  letter-spacing:5px;

  font-size:18px;

  margin-bottom:36px;

}



/* ---------- LOGO ---------- */

.home-logo-wrap{

  display:flex;

  justify-content:center;

  align-items:center;

  margin-bottom:30px;

}



.home-logo-img{

  display:block;

  width:min(92vw, 380px); /* 🔥 responsive scaling */

  height:auto;

  object-fit:contain;

  margin:0 auto;



  /* 🔥 Apple glow */

  filter:

    brightness(1.22)

    contrast(1.1)

    drop-shadow(0 0 12px rgba(255,255,255,.28))

    drop-shadow(0 12px 40px rgba(255,255,255,.12));



  /* 🔥 subtle entrance */

  animation:fadeIn 0.9s ease;

}



/* ---------- BUTTONS ---------- */

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

  min-height:72px;

  padding:16px 22px;

  border-radius:28px;

  text-decoration:none;

  font-size:18px;

  font-weight:800;



  transition:all .25s ease;

}



.home-btn:hover{

  transform:translateY(-3px);

}



/* 🔥 LIGHT BUTTON (PRIMARY) */

.home-btn-light{

  color:#000;

  background:linear-gradient(180deg, #ffffff, #dfefff);

  box-shadow:

    0 18px 36px rgba(0,0,0,.25),

    inset 0 1px 0 rgba(255,255,255,.6);

}



/* 🔥 DARK BUTTONS */

.home-btn-dark{

  color:#fff;

  background:linear-gradient(180deg, rgba(22,23,31,.98), rgba(14,15,22,.98));

  border:1px solid rgba(255,255,255,.08);

  box-shadow:0 12px 30px rgba(0,0,0,.4);

}



/* CENTER BUTTON */

.home-btn-center{

  grid-column:1 / -1;

  width:100%;

  max-width:240px;

  margin:0 auto;

}



/* ---------- MOBILE ---------- */

@media (max-width: 640px){



  .home-hero-card{

    margin-top:18px;

    min-height:calc(100vh - 220px);

    padding:50px 18px 90px;

    border-radius:24px;

  }



  .home-kicker{

    font-size:12px;

    letter-spacing:4px;

    margin-bottom:30px;

  }



  .home-logo-img{

    width:min(92vw, 360px); /* 🔥 bigger mobile */

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



/* ---------- ANIMATION ---------- */

@keyframes fadeIn{

  from{

    opacity:0;

    transform:translateY(10px);

  }

  to{

    opacity:1;

    transform:translateY(0);

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

