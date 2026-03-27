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

<<<<<<< HEAD
    <div class="wrap home-wrap">

      <section class="home-hero-card">

        <div class="home-ambient home-ambient-a"></div>

        <div class="home-ambient home-ambient-b"></div>

        <div class="home-ambient home-ambient-c"></div>

        <div class="home-noise"></div>



        <div class="home-hero-inner">

          <div class="home-kicker">Luxury Digital Identity</div>



          <div class="home-logo-wrap">

            <img src="/images/tapzy-logo-white.png" alt="Tapzy" class="home-logo-img" />

          </div>



          <div class="home-galaxy-arc">

            <div class="home-galaxy-core"></div>

            <div class="home-galaxy-stars home-galaxy-stars-a"></div>

            <div class="home-galaxy-stars home-galaxy-stars-b"></div>

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

        </div>

      </section>
=======
<div class="wrap" style="max-width:1100px;">

  <section class="home-hero-card">



    <div class="home-kicker">Luxury Digital Identity</div>



    <div class="home-logo-wrap">

      <img src="/images/tapzy-logo-white.png" class="home-logo-img" />
>>>>>>> c83ff29 (Fix homepage + galaxy glow)

    </div>



<<<<<<< HEAD
<style>

  .home-wrap{

    max-width:1100px;

  }



  .home-hero-card{

    position:relative;

    overflow:hidden;

    margin-top:28px;

    min-height:700px;

    border-radius:38px;

    border:1px solid rgba(255,255,255,.07);

    background:

      linear-gradient(180deg, rgba(7,9,14,.985), rgba(2,3,7,1));

    box-shadow:

      0 40px 110px rgba(0,0,0,.62),

      inset 0 1px 0 rgba(255,255,255,.04),

      inset 0 0 0 1px rgba(255,255,255,.015);

    text-align:center;

  }



  .home-hero-inner{

    position:relative;

    z-index:3;

    padding:78px 28px 110px;
=======
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
>>>>>>> c83ff29 (Fix homepage + galaxy glow)

  }


<<<<<<< HEAD

  .home-ambient{

    position:absolute;

    border-radius:999px;

    filter:blur(48px);
=======
  background:

    radial-gradient(600px 200px at 50% 55%, rgba(80,160,255,.25), transparent 70%),

    radial-gradient(900px 420px at 50% -10%, rgba(125,214,255,.06), transparent 45%),

    linear-gradient(180deg, #05070d, #02030a);

>>>>>>> c83ff29 (Fix homepage + galaxy glow)

    pointer-events:none;

<<<<<<< HEAD
    opacity:.95;

  }



  .home-ambient-a{

    width:620px;

    height:320px;

    top:-70px;

    left:50%;
=======
  box-shadow:

    inset 0 1px 0 rgba(255,255,255,.04),

    0 40px 120px rgba(0,0,0,.6);



  padding:80px 28px 120px;

  text-align:center;

}

>>>>>>> c83ff29 (Fix homepage + galaxy glow)

    transform:translateX(-50%);

<<<<<<< HEAD
    background:

      radial-gradient(circle, rgba(55,106,255,.20) 0%, rgba(55,106,255,.09) 38%, transparent 72%);

    animation:homeFloatA 10s ease-in-out infinite;

  }



  .home-ambient-b{

    width:360px;

    height:220px;

    top:140px;

    left:24%;

    background:

      radial-gradient(circle, rgba(163,82,255,.08) 0%, rgba(163,82,255,.04) 42%, transparent 76%);

    animation:homeFloatB 12s ease-in-out infinite;

  }



  .home-ambient-c{

    width:360px;
=======
.home-kicker{

  color:#8f93a3;

  text-transform:uppercase;

  letter-spacing:5px;

  font-size:16px;

  margin-bottom:40px;

}



.home-logo-wrap{

  display:flex;

  justify-content:center;

  margin-bottom:50px;

}



.home-logo-img{

  max-width:320px;

  width:100%;
>>>>>>> c83ff29 (Fix homepage + galaxy glow)

    height:220px;

<<<<<<< HEAD
    top:190px;

    right:18%;

    background:

      radial-gradient(circle, rgba(94,211,255,.10) 0%, rgba(94,211,255,.05) 42%, transparent 76%);

    animation:homeFloatC 11s ease-in-out infinite;

  }



  .home-noise{

    position:absolute;

    inset:0;

    pointer-events:none;

    opacity:.05;

    background-image:

      radial-gradient(circle at 16% 18%, rgba(255,255,255,.18) 0 1px, transparent 1.5px),

      radial-gradient(circle at 78% 14%, rgba(255,255,255,.14) 0 1px, transparent 1.5px),

      radial-gradient(circle at 63% 39%, rgba(255,255,255,.08) 0 1px, transparent 1.5px),

      radial-gradient(circle at 22% 74%, rgba(255,255,255,.10) 0 1px, transparent 1.5px),

      radial-gradient(circle at 86% 78%, rgba(255,255,255,.08) 0 1px, transparent 1.5px);

  }
=======

  filter:

    drop-shadow(0 0 12px rgba(255,255,255,.25))

    drop-shadow(0 0 40px rgba(80,160,255,.35));

}



.home-actions{

  display:grid;

  grid-template-columns:1fr 1fr;

  gap:18px;

  justify-content:center;

}



.home-btn{

  display:flex;

  align-items:center;

  justify-content:center;

  min-height:70px;
>>>>>>> c83ff29 (Fix homepage + galaxy glow)

  border-radius:30px;

  font-weight:700;

<<<<<<< HEAD
  .home-kicker{

    color:#9ca4b7;

    text-transform:uppercase;

    letter-spacing:6px;

    font-size:17px;

    margin-bottom:50px;

    text-shadow:0 0 18px rgba(255,255,255,.04);

  }



  .home-logo-wrap{

    display:flex;

    justify-content:center;

    align-items:center;

    margin-bottom:8px;

  }



  .home-logo-img{

    display:block;
=======
  font-size:16px;

  text-decoration:none;

}



/* WHITE BUTTON */

.home-btn-light{

  background:linear-gradient(180deg, #ffffff, #e8eefc);

  color:#000;

}



/* DARK BUTTONS */

.home-btn-dark{

  background:rgba(20,22,32,.85);

  color:#fff;

  border:1px solid rgba(255,255,255,.08);

  backdrop-filter:blur(10px);

}

>>>>>>> c83ff29 (Fix homepage + galaxy glow)

    width:min(100%, 520px);

<<<<<<< HEAD
    max-width:520px;

    height:auto;

    object-fit:contain;

    filter:

      drop-shadow(0 10px 30px rgba(255,255,255,.08))

      drop-shadow(0 0 50px rgba(80,140,255,.35));

    animation:homeLogoIn 1s ease;
=======
/* CENTER BUTTON */

.home-btn-center{

  grid-column:1 / -1;

  max-width:260px;

  margin:0 auto;

}

>>>>>>> c83ff29 (Fix homepage + galaxy glow)

  }

/* MOBILE */

<<<<<<< HEAD

  .home-galaxy-arc{

    position:relative;

    width:min(100%, 760px);
=======
@media (max-width:640px){

  .home-logo-img{

    max-width:240px;

  }
>>>>>>> c83ff29 (Fix homepage + galaxy glow)

    height:170px;

    margin:2px auto 34px;

<<<<<<< HEAD
    pointer-events:none;

    overflow:visible;

  }
=======
  .home-btn{

    font-size:14px;

    min-height:60px;
>>>>>>> c83ff29 (Fix homepage + galaxy glow)

  }

}

<<<<<<< HEAD
  .home-galaxy-core{

    position:absolute;

    inset:0;

    border-radius:999px;

    background:

      radial-gradient(circle at 14% 58%, rgba(178,90,255,.42) 0%, transparent 18%),

      radial-gradient(circle at 28% 70%, rgba(118,123,255,.38) 0%, transparent 20%),

      radial-gradient(circle at 44% 78%, rgba(157,202,255,.30) 0%, transparent 18%),

      radial-gradient(circle at 56% 78%, rgba(138,208,255,.32) 0%, transparent 18%),

      radial-gradient(circle at 72% 70%, rgba(98,162,255,.34) 0%, transparent 20%),

      radial-gradient(circle at 86% 58%, rgba(109,223,255,.40) 0%, transparent 18%),

      radial-gradient(ellipse at 50% 78%, rgba(166,220,255,.55) 0%, rgba(128,175,255,.18) 24%, transparent 52%);

    filter:blur(24px);

    opacity:.95;

    mask-image: radial-gradient(ellipse at 50% 78%, #000 0 48%, transparent 68%);

    -webkit-mask-image: radial-gradient(ellipse at 50% 78%, #000 0 48%, transparent 68%);

    animation:homeNebulaPulse 8s ease-in-out infinite;

  }



  .home-galaxy-stars{

    position:absolute;

    inset:0;

    border-radius:999px;

    opacity:.75;

    mask-image: radial-gradient(ellipse at 50% 78%, #000 0 50%, transparent 70%);

    -webkit-mask-image: radial-gradient(ellipse at 50% 78%, #000 0 50%, transparent 70%);

  }



  .home-galaxy-stars-a{

    background-image:

      radial-gradient(circle at 18% 61%, rgba(255,255,255,.95) 0 1.2px, transparent 2px),

      radial-gradient(circle at 22% 66%, rgba(255,255,255,.8) 0 1px, transparent 1.8px),

      radial-gradient(circle at 26% 71%, rgba(173,212,255,.85) 0 1px, transparent 1.8px),

      radial-gradient(circle at 34% 75%, rgba(255,255,255,.75) 0 1px, transparent 1.8px),

      radial-gradient(circle at 41% 78%, rgba(188,224,255,.75) 0 1px, transparent 1.8px),

      radial-gradient(circle at 49% 79%, rgba(255,255,255,.8) 0 1.1px, transparent 2px),

      radial-gradient(circle at 57% 78%, rgba(183,220,255,.8) 0 1px, transparent 1.8px),

      radial-gradient(circle at 65% 75%, rgba(255,255,255,.75) 0 1px, transparent 1.8px),

      radial-gradient(circle at 73% 70%, rgba(166,213,255,.85) 0 1px, transparent 1.8px),

      radial-gradient(circle at 81% 63%, rgba(255,255,255,.9) 0 1.2px, transparent 2px);

    filter:blur(.25px);

  }



  .home-galaxy-stars-b{

    background-image:

      radial-gradient(circle at 16% 63%, rgba(144,106,255,.45) 0 2px, transparent 5px),

      radial-gradient(circle at 31% 74%, rgba(120,170,255,.40) 0 2px, transparent 5px),

      radial-gradient(circle at 46% 79%, rgba(157,212,255,.38) 0 2px, transparent 5px),

      radial-gradient(circle at 62% 77%, rgba(116,173,255,.40) 0 2px, transparent 5px),

      radial-gradient(circle at 84% 61%, rgba(96,209,255,.42) 0 2px, transparent 5px);

    filter:blur(8px);

    opacity:.9;

  }



  .home-actions{

    display:grid;

    grid-template-columns:repeat(2, minmax(230px, 290px));

    justify-content:center;

    gap:16px 18px;

  }



  .home-btn{

    display:flex;

    align-items:center;

    justify-content:center;

    min-height:74px;

    padding:16px 22px;

    border-radius:26px;

    text-decoration:none;

    font-size:18px;

    font-weight:800;

    letter-spacing:.15px;

    transition:

      transform .22s ease,

      box-shadow .22s ease,

      border-color .22s ease,

      background .22s ease;

    backdrop-filter:blur(10px);

    -webkit-backdrop-filter:blur(10px);

  }



  .home-btn:hover{

    transform:translateY(-3px);

  }



  .home-btn-light{

    color:#05070b;

    background:

      linear-gradient(180deg, rgba(248,252,255,.99), rgba(227,238,248,.98));

    box-shadow:

      0 18px 36px rgba(0,0,0,.28),

      inset 0 1px 0 rgba(255,255,255,.92);

  }



  .home-btn-dark{

    color:#fff;

    border:1px solid rgba(255,255,255,.08);

    background:

      linear-gradient(180deg, rgba(20,24,36,.82), rgba(10,12,20,.90));

    box-shadow:

      inset 0 1px 0 rgba(255,255,255,.05),

      0 12px 24px rgba(0,0,0,.20);

  }



  .home-btn-dark:hover{

    border-color:rgba(255,255,255,.12);

    background:

      linear-gradient(180deg, rgba(24,29,43,.88), rgba(12,15,24,.94));

    box-shadow:

      inset 0 1px 0 rgba(255,255,255,.06),

      0 16px 30px rgba(0,0,0,.26),

      0 0 26px rgba(87,169,255,.06);

  }



  .home-btn-center{

    grid-column:1 / -1;

    width:min(290px, 100%);

    justify-self:center;

  }



  @keyframes homeLogoIn{

    0%{

      opacity:0;

      transform:translateY(14px) scale(.97);

    }

    100%{

      opacity:1;

      transform:none;

    }

  }



  @keyframes homeFloatA{

    0%,100%{

      transform:translateX(-50%) translateY(0);

    }

    50%{

      transform:translateX(-50%) translateY(10px);

    }

  }



  @keyframes homeFloatB{

    0%,100%{

      transform:translateY(0);

    }

    50%{

      transform:translateY(-8px);

    }

  }



  @keyframes homeFloatC{

    0%,100%{

      transform:translateY(0);

    }

    50%{

      transform:translateY(10px);

    }

  }



  @keyframes homeNebulaPulse{

    0%,100%{

      opacity:.82;

      transform:scale(1);

    }

    50%{

      opacity:1;

      transform:scale(1.03);

    }

  }



  @media (max-width: 900px){

    .home-hero-card{

      min-height:620px;

      border-radius:30px;

    }



    .home-hero-inner{

      padding:68px 22px 105px;

    }



    .home-kicker{

      font-size:14px;

      letter-spacing:5px;

      margin-bottom:42px;

    }



    .home-logo-img{

      max-width:420px;

    }



    .home-galaxy-arc{

      height:138px;

      margin-bottom:32px;

      width:min(100%, 580px);

    }



    .home-actions{

      grid-template-columns:1fr 1fr;

    }



    .home-btn{

      min-height:70px;

      font-size:17px;

      border-radius:24px;

    }

  }



  @media (max-width: 640px){

    .home-wrap{

      padding-top:18px;

    }



    .home-hero-card{

      margin-top:18px;

      min-height:calc(100vh - 220px);

      border-radius:26px;

    }



    .home-hero-inner{

      padding:56px 18px 96px;

    }



    .home-kicker{

      font-size:12px;

      letter-spacing:4px;

      margin-bottom:34px;

    }



    .home-logo-wrap{

      margin-bottom:8px;

    }



    .home-logo-img{

      max-width:280px;

    }



    .home-galaxy-arc{

      height:96px;

      margin-bottom:24px;

      width:min(100%, 320px);

    }



    .home-actions{

      grid-template-columns:1fr 1fr;

      gap:14px;

    }



    .home-btn{

      min-height:60px;

      font-size:14px;

      padding:14px 10px;

      border-radius:22px;

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

=======
</style>



${renderTapzyAssistant({

  username: currentProfile?.username || "User",

  pageType: "home",

})}

>>>>>>> c83ff29 (Fix homepage + galaxy glow)
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

<<<<<<< HEAD
=======


module.exports = router;



>>>>>>> c83ff29 (Fix homepage + galaxy glow)
