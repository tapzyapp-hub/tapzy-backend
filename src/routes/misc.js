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

          <a class="home-btn home-btn-dark home-btn-glow-1" href="${primaryHref}">

            ${escapeHtml(primaryLabel)}

          </a>



          <a class="home-btn home-btn-dark home-btn-glow-2" href="${signedIn ? `/discovery/${username}?tab=search` : "/auth"}">

            Search Users

          </a>



          <a class="home-btn home-btn-dark home-btn-glow-3 home-btn-center" href="${signedIn ? "/messages" : "/auth"}">

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

      radial-gradient(700px 260px at 50% -5%, rgba(127,210,255,.08), transparent 48%),

      linear-gradient(180deg, rgba(10,12,18,.98), rgba(6,6,8,1));

    box-shadow:

      inset 0 1px 0 rgba(255,255,255,.03),

      0 30px 80px rgba(0,0,0,.42);

    padding:80px 28px 120px;

    text-align:center;

    position:relative;

    overflow:hidden;

    transition:

      box-shadow .22s ease,

      border-color .22s ease,

      transform .22s ease;

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

    max-width:300px;

    height:auto;

    object-fit:contain;

    animation:logoPulse 2.8s ease-in-out infinite;

    transform-origin:center center;

  }



  .home-actions{

    display:grid;

    grid-template-columns:repeat(2, minmax(230px, 290px));

    justify-content:center;

    justify-items:center;

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

    transition:

      transform .18s ease,

      box-shadow .18s ease,

      border-color .18s ease,

      background .18s ease,

      filter .18s ease;

    position:relative;

    isolation:isolate;

    width:100%;

  }



  .home-btn:hover{

    transform:translateY(-2px);

  }



  .home-btn-dark{

    color:#fff;

    background:linear-gradient(180deg, rgba(22,23,31,.98), rgba(14,15,22,.98));

    border:1px solid rgba(255,255,255,.08);

    box-shadow:

      inset 0 1px 0 rgba(255,255,255,.03),

      0 12px 26px rgba(0,0,0,.22);

  }



  .home-btn::after{

    content:"";

    position:absolute;

    inset:-3px;

    border-radius:30px;

    z-index:-1;

    opacity:.85;

    pointer-events:none;

    filter:blur(12px);

    background:

      radial-gradient(circle, rgba(78,156,255,.42) 0%, rgba(78,156,255,.18) 36%, rgba(78,156,255,0) 72%);

    animation:buttonBluePulse 3.2s ease-in-out infinite;

  }



  .home-btn-glow-1::after{

    animation-delay:0s;

  }



  .home-btn-glow-2::after{

    animation-delay:1.05s;

  }



  .home-btn-glow-3::after{

    animation-delay:2.1s;

  }



  .home-btn:hover::after{

    opacity:1;

    filter:blur(14px);

  }



  .home-btn-dark:hover{

    border-color:rgba(110,170,255,.35);

    box-shadow:

      inset 0 1px 0 rgba(255,255,255,.04),

      0 14px 30px rgba(0,0,0,.26),

      0 0 0 1px rgba(95,165,255,.18),

      0 0 24px rgba(65,135,255,.20);

  }



  .home-btn-center{

    grid-column:1 / -1;

    max-width:190px;

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

      max-width:330px;

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



    .home-btn::after{

      inset:-2px;

      border-radius:26px;

      opacity:.95;

      filter:blur(11px);

    }



    .home-btn-center{

      max-width:190px;

      width:100%;

    }

  }



  @keyframes logoPulse{

    0%, 100%{

      transform:scale(1);

    }

    50%{

      transform:scale(1.018);

    }

  }



  @keyframes buttonBluePulse{

    0%{

      opacity:.30;

      transform:scale(.985);

    }

    50%{

      opacity:.95;

      transform:scale(1.02);

    }

    100%{

      opacity:.30;

      transform:scale(.985);

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

router.get("/settings", async (req, res) => {
  try {
    const currentProfile = req.currentProfile || null;
    if (!currentProfile) return res.redirect("/auth");

    const username = currentProfile.username || "user";
    const profileHref = `/u/${encodeURIComponent(username)}`;
    const editHref = `/edit/${encodeURIComponent(username)}`;
    const discoveryHref = `/discovery/${encodeURIComponent(username)}?tab=search`;
    let blockedRows = [];

    try {
      blockedRows = await req.app.locals?.prisma?.userBlock?.findMany?.({
        where: { blockerId: currentProfile.id },
        include: { blocked: true },
        orderBy: { createdAt: "desc" },
      }) || [];
    } catch (_) {
      try {
        const prisma = require("../prisma");
        blockedRows = await prisma.userBlock.findMany({
          where: { blockerId: currentProfile.id },
          include: { blocked: true },
          orderBy: { createdAt: "desc" },
        });
      } catch (_) {
        blockedRows = [];
      }
    }

    const blockedUsersHtml = blockedRows.length
      ? blockedRows.map((row) => `
          <form class="settings-blocked-row" method="POST" action="/messages/block/${escapeHtml(String(row.blockedId || row.blocked?.id || ""))}">
            <input type="hidden" name="action" value="unblock" />
            <span>${escapeHtml(row.blocked?.name || row.blocked?.username || "Tapzy user")}</span>
            <button type="submit">Unblock</button>
          </form>
        `).join("")
      : `<div class="settings-empty">No blocked users.</div>`;

    const body = `
      <div class="wrap settings-wrap">
        <section class="settings-hero">
          <div>
            <div class="settings-kicker">Tapzy Control Center</div>
            <h1>Settings</h1>
            <p>Manage your profile, messages, privacy, notifications, and app feel.</p>
          </div>
          <a class="settings-avatar" href="${profileHref}" aria-label="Open your profile">
            ${
              currentProfile.photo
                ? `<img src="${escapeHtml(currentProfile.photo)}" alt="${escapeHtml(username)}" />`
                : `<span>${escapeHtml((currentProfile.name || username || "T").slice(0, 1).toUpperCase())}</span>`
            }
          </a>
        </section>

        <section class="settings-grid">
          <div class="settings-card settings-account">
            <div class="settings-card-head">
              <div>
                <div class="settings-label">Account</div>
                <h2>${escapeHtml(currentProfile.name || username)}</h2>
                <p>@${escapeHtml(username)}</p>
              </div>
            </div>
            <div class="settings-actions">
              <a href="${profileHref}">View profile</a>
              <a href="${editHref}">Edit profile</a>
              <a href="/qr/${encodeURIComponent(username)}">My QR code</a>
              <a href="/logout" class="settings-danger">Log out</a>
            </div>
          </div>

          <div class="settings-card">
            <div class="settings-label">Messages</div>
            <h2>Chats</h2>
            <p>Manage your inbox, archived chats, and notification behavior.</p>
            <div class="settings-actions">
              <a href="/messages">Inbox</a>
              <a href="/messages?view=archived">Archived chats</a>
              <a href="${discoveryHref}">Start conversation</a>
            </div>
          </div>

          <div class="settings-card">
            <div class="settings-label">Privacy</div>
            <h2>Sharing</h2>
            <p>Control what Tapzy shares when someone taps or interacts with your profile.</p>
            <div class="settings-actions">
              <a href="${editHref}#quick-share">Quick share fields</a>
              <a href="/messages">Message privacy</a>
              <a href="/settings#blocked-users">Blocked users</a>
            </div>
          </div>

          <div class="settings-card" id="blocked-users">
            <div class="settings-label">Privacy</div>
            <h2>Blocked users</h2>
            <p>People you block cannot message you on Tapzy.</p>
            <div class="settings-blocked-list">
              ${blockedUsersHtml}
            </div>
          </div>

          <div class="settings-card">
            <div class="settings-label">Notifications</div>
            <h2>Alerts</h2>
            <p>Review message, story, and network notifications.</p>
            <div class="settings-actions">
              <a href="/notifications">Notification center</a>
              <a href="/stories">Stories</a>
              <a href="/events">Events</a>
            </div>
          </div>

          <div class="settings-card settings-device">
            <div class="settings-label">App Feel</div>
            <h2>Device settings</h2>
            <p>These preferences are saved on this phone.</p>

            <label class="settings-toggle">
              <span>
                <strong>Compact phone layout</strong>
                <em>Tighter cards and spacing on this device.</em>
              </span>
              <input type="checkbox" data-setting-toggle="compact" />
            </label>

            <label class="settings-toggle">
              <span>
                <strong>Reduce motion</strong>
                <em>Calmer transitions and less animation.</em>
              </span>
              <input type="checkbox" data-setting-toggle="reduceMotion" />
            </label>

            <label class="settings-toggle">
              <span>
                <strong>Stronger contrast</strong>
                <em>Brighter borders and text for dark mode.</em>
              </span>
              <input type="checkbox" data-setting-toggle="contrast" />
            </label>
          </div>

          <div class="settings-card">
            <div class="settings-label">Support</div>
            <h2>Help</h2>
            <p>Jump to key Tapzy tools and account recovery.</p>
            <div class="settings-actions">
              <a href="/auth/forgot-password">Reset password</a>
              <a href="/">Home</a>
              <a href="/admin">Admin</a>
            </div>
          </div>
        </section>
      </div>

      <style>
        .settings-wrap{
          max-width:980px;
        }

        .settings-hero{
          margin-top:18px;
          border-radius:32px;
          border:1px solid rgba(255,255,255,.09);
          background:
            radial-gradient(520px 240px at 82% 0%, rgba(90,170,255,.18), transparent 54%),
            linear-gradient(180deg, rgba(11,15,24,.98), rgba(4,6,10,1));
          box-shadow:0 24px 70px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.04);
          padding:24px;
          display:flex;
          justify-content:space-between;
          gap:18px;
          align-items:center;
        }

        .settings-kicker{
          color:#9fb7d4;
          font-size:12px;
          text-transform:uppercase;
          letter-spacing:3px;
          font-weight:800;
          margin-bottom:10px;
        }

        .settings-hero h1{
          margin:0;
          font-size:44px;
          line-height:.98;
          letter-spacing:-1.4px;
        }

        .settings-hero p,
        .settings-card p{
          color:#aebbd0;
          line-height:1.55;
          margin:10px 0 0;
        }

        .settings-avatar{
          width:82px;
          height:82px;
          border-radius:24px;
          overflow:hidden;
          border:1px solid rgba(140,210,255,.24);
          background:linear-gradient(180deg,#172236,#090d16);
          color:#fff;
          display:flex;
          align-items:center;
          justify-content:center;
          text-decoration:none;
          font-size:32px;
          font-weight:900;
          flex:0 0 auto;
          box-shadow:0 16px 36px rgba(0,0,0,.30), 0 0 24px rgba(80,160,255,.14);
        }

        .settings-avatar img{
          width:100%;
          height:100%;
          object-fit:cover;
        }

        .settings-grid{
          display:grid;
          grid-template-columns:repeat(2, minmax(0, 1fr));
          gap:14px;
          margin-top:14px;
        }

        .settings-card{
          border-radius:24px;
          border:1px solid rgba(255,255,255,.08);
          background:
            radial-gradient(360px 170px at 90% 0%, rgba(100,180,255,.10), transparent 52%),
            linear-gradient(180deg, rgba(17,20,29,.98), rgba(7,9,14,.995));
          box-shadow:0 18px 46px rgba(0,0,0,.26), inset 0 1px 0 rgba(255,255,255,.035);
          padding:18px;
          min-height:210px;
        }

        .settings-label{
          color:#9fb7d4;
          font-size:11px;
          text-transform:uppercase;
          letter-spacing:2px;
          font-weight:900;
          margin-bottom:10px;
        }

        .settings-card h2{
          margin:0;
          font-size:24px;
          letter-spacing:-.5px;
        }

        .settings-actions{
          display:grid;
          gap:9px;
          margin-top:16px;
        }

        .settings-blocked-list{
          display:grid;
          gap:10px;
          margin-top:16px;
        }

        .settings-blocked-row{
          margin:0;
          min-height:48px;
          border-radius:16px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.04);
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          padding:8px 10px 8px 14px;
        }

        .settings-blocked-row span{
          color:#f3f8ff;
          font-weight:800;
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }

        .settings-blocked-row button{
          min-height:34px;
          border-radius:999px;
          border:1px solid rgba(255,255,255,.10);
          background:rgba(255,255,255,.06);
          color:#fff;
          padding:0 12px;
          font-weight:800;
          cursor:pointer;
        }

        .settings-empty{
          margin-top:16px;
          color:#9daabd;
          border-radius:16px;
          border:1px dashed rgba(255,255,255,.10);
          padding:14px;
        }

        .settings-actions a{
          min-height:46px;
          border-radius:16px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.045);
          color:#f3f8ff;
          text-decoration:none;
          display:flex;
          align-items:center;
          padding:0 14px;
          font-weight:800;
        }

        .settings-actions a:hover{
          border-color:rgba(127,210,255,.28);
          background:rgba(127,210,255,.08);
        }

        .settings-actions .settings-danger{
          color:#ffd7df;
          border-color:rgba(255,120,150,.24);
          background:rgba(255,70,110,.08);
        }

        .settings-toggle{
          min-height:64px;
          margin-top:12px;
          border-radius:18px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.035);
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:14px;
          padding:12px 14px;
          color:#fff;
        }

        .settings-toggle span{
          min-width:0;
        }

        .settings-toggle strong,
        .settings-toggle em{
          display:block;
        }

        .settings-toggle strong{
          font-size:14px;
        }

        .settings-toggle em{
          color:#9daabd;
          font-size:12px;
          font-style:normal;
          margin-top:4px;
          line-height:1.35;
        }

        .settings-toggle input{
          width:46px;
          height:28px;
          flex:0 0 auto;
          accent-color:#73c2ff;
        }

        @media(max-width:720px){
          .settings-wrap{
            padding-left:12px;
            padding-right:12px;
          }

          .settings-hero{
            border-radius:26px;
            padding:20px;
            align-items:flex-start;
          }

          .settings-hero h1{
            font-size:38px;
          }

          .settings-avatar{
            width:68px;
            height:68px;
            border-radius:20px;
          }

          .settings-grid{
            grid-template-columns:1fr;
            gap:12px;
          }

          .settings-card{
            min-height:0;
            border-radius:22px;
            padding:16px;
          }
        }
      </style>

      <script>
        (function(){
          var map = {
            compact: "tapzy_pref_compact",
            reduceMotion: "tapzy_pref_reduce_motion",
            contrast: "tapzy_pref_contrast"
          };

          function apply(key, enabled){
            try { localStorage.setItem(map[key], enabled ? "1" : "0"); } catch (_) {}
            var attr = key === "reduceMotion" ? "data-tapzy-reduce-motion" : "data-tapzy-" + key;
            document.documentElement.setAttribute(attr, enabled ? "1" : "0");
          }

          document.querySelectorAll("[data-setting-toggle]").forEach(function(input){
            var key = input.getAttribute("data-setting-toggle");
            var stored = "0";
            try { stored = localStorage.getItem(map[key]) || "0"; } catch (_) {}
            input.checked = stored === "1";
            apply(key, input.checked);
            input.addEventListener("change", function(){ apply(key, input.checked); });
          });
        })();
      </script>

      ${renderTapzyAssistant({
        username: currentProfile.username || "User",
        pageType: "settings",
      })}
    `;

    return res.send(
      renderShell("Settings", body, "", {
        currentProfile,
        pageTitle: "Settings",
        pageType: "settings",
      })
    );
  } catch (e) {
    console.error(e);
    return res.status(500).send("Settings page error");
  }
});



module.exports = router;
