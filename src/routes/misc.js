const router = require("express").Router();



const {

  renderShell,

  renderTapzyAssistant,

  escapeHtml,

} = require("../utils");



router.get("/", async (req, res) => {
  try {
    const currentProfile = req.currentProfile || null;
    if (!currentProfile) return res.redirect("/auth");
    return res.redirect(`/discovery/${encodeURIComponent(currentProfile.username || "user")}`);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Home redirect error");
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
