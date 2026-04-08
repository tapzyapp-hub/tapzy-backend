const router = require("express").Router();

const prisma = require("../prisma");

const {

  renderShell,

  renderTapzyAssistant,

  escapeHtml,

  cleanUsername,

  formatPrettyLocal,

  getFollowState,

} = require("../utils");



router.get("/discovery/:username", async (req, res) => {

  try {

    const username = cleanUsername(req.params.username);



    const profile = await prisma.userProfile.findUnique({

      where: { username },

      include: {

        followers: {

          include: { followerProfile: true },

          orderBy: { createdAt: "desc" },

        },

        following: {

          include: { followingProfile: true },

          orderBy: { createdAt: "desc" },

        },

      },

    });



    if (!profile) return res.status(404).send("Profile not found");



    const currentProfile = req.currentProfile || null;

    await getFollowState(currentProfile?.id, profile.id);



    const activeTabRaw = String(req.query.tab || "connections").trim().toLowerCase();

    const allowedTabs = new Set(["search", "following", "followers", "connections"]);

    const activeTab = allowedTabs.has(activeTabRaw) ? activeTabRaw : "connections";



    const searchQueryRaw = String(req.query.q || "").trim();

    const normalizedSearch = searchQueryRaw.replace(/^@+/, "").trim();



    const searchResults =

      normalizedSearch.length >= 2

        ? await prisma.userProfile.findMany({

            where: {

              OR: [

                { username: { contains: normalizedSearch, mode: "insensitive" } },

                { name: { contains: normalizedSearch, mode: "insensitive" } },

                { title: { contains: normalizedSearch, mode: "insensitive" } },

              ],

            },

            orderBy: [{ connections: "desc" }, { createdAt: "desc" }],

            take: 30,

          })

        : [];



    const followedSet = new Set();

    if (currentProfile && searchResults.length) {

      const rows = await prisma.follow.findMany({

        where: {

          followerProfileId: currentProfile.id,

          followingProfileId: { in: searchResults.map((r) => r.id) },

        },

        select: { followingProfileId: true },

      });

      for (const row of rows) followedSet.add(row.followingProfileId);

    }



    // Connections = mutual follows

    const followerIds = new Set(

      profile.followers

        .map((f) => f.followerProfile?.id)

        .filter(Boolean)

    );



    const networkRows = profile.following

      .filter((f) => f.followingProfile && followerIds.has(f.followingProfile.id))

      .map((f) => ({

        other: f.followingProfile,

        connectedAt: f.createdAt,

      }));



    function tabHref(tab) {

      const qs = new URLSearchParams();

      qs.set("tab", tab);

      if (searchQueryRaw) qs.set("q", searchQueryRaw);

      return `/discovery/${profile.username}?${qs.toString()}`;

    }



    function renderTab(label, key, count) {

      const isActive = activeTab === key;

      return `

        <a class="td-tab ${isActive ? "is-active" : ""}" href="${tabHref(key)}">

          <span class="td-tab-label">${escapeHtml(label)}</span>

          <span class="td-tab-count">${escapeHtml(String(count))}</span>

        </a>

      `;

    }



    function getInitials(p) {

      const source = String(p.name || p.username || "T").trim();

      const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);

      if (!parts.length) return "T";

      return parts.map((s) => s.charAt(0).toUpperCase()).join("");

    }



    function personCard(p, metaText = "", rightActionHtml = "", badgeHtml = "") {

      const avatarHtml = p.photo

        ? `<img src="${escapeHtml(p.photo)}" alt="${escapeHtml(p.username || "user")}" />`

        : `<span>${escapeHtml(getInitials(p))}</span>`;



      return `

        <div class="td-person-card js-tilt-card">

          <div class="td-card-glow"></div>

          <div class="td-card-shine"></div>



          <div class="td-person-left">

            <div class="td-person-avatar">${avatarHtml}</div>



            <div class="td-person-copy">

              <div class="td-person-topline">

                <div class="td-person-name">${escapeHtml(p.name || p.username || "Tapzy User")}</div>

                ${badgeHtml}

              </div>



              <div class="td-person-handle">@${escapeHtml(p.username || "user")}</div>

              ${p.title ? `<div class="td-person-title">${escapeHtml(p.title)}</div>` : ""}

              ${metaText ? `<div class="td-person-meta">${metaText}</div>` : ""}

            </div>

          </div>



          <div class="td-person-actions">

            <a class="btn td-open-btn" href="/u/${escapeHtml(p.username || "")}">Open Profile</a>

            ${rightActionHtml}

          </div>

        </div>

      `;

    }



    const searchCards = searchResults.map((p) => {

      let followButton = "";



      if (currentProfile && currentProfile.id !== p.id) {

        followButton = followedSet.has(p.id)

          ? `<form method="POST" action="/unfollow/${escapeHtml(p.username || "")}" style="margin:0;">

              <button class="btn btnDark td-follow-btn" type="submit">Following ✓</button>

            </form>`

          : `<form method="POST" action="/follow/${escapeHtml(p.username || "")}" style="margin:0;">

              <button class="btn btnDark td-follow-btn" type="submit">Follow</button>

            </form>`;

      }



      return personCard(

        p,

        `${escapeHtml(String(p.connections || 0))} connection${Number(p.connections || 0) === 1 ? "" : "s"}`,

        followButton

      );

    });



    const followingCards = profile.following.map((f) =>

      personCard(

        f.followingProfile,

        `Following since ${escapeHtml(formatPrettyLocal(f.createdAt))}`

      )

    );



    const followerCards = profile.followers.map((f) =>

      personCard(

        f.followerProfile,

        `Follower since ${escapeHtml(formatPrettyLocal(f.createdAt))}`

      )

    );



    const connectionCards = networkRows.map((row) =>

      personCard(

        row.other,

        "Mutual connection",

        "",

        `<span class="td-badge">Connected</span>`

      )

    );



    let contentHtml = "";



    if (activeTab === "search") {

      contentHtml = `

        <form method="GET" action="/discovery/${escapeHtml(profile.username || "")}" class="td-search-inline">

          <input type="hidden" name="tab" value="search" />

          <input

            class="td-search-input"

            name="q"

            value="${escapeHtml(searchQueryRaw)}"

            placeholder="Search by username, name, or title"

            autocomplete="off"

          />

          <button class="btn td-search-btn" type="submit">Search</button>

        </form>



        ${

          normalizedSearch.length >= 2

            ? (

                searchCards.length

                  ? `<div class="td-results-list">${searchCards.join("")}</div>`

                  : `<div class="td-empty"><b>No people found</b><div style="margin-top:8px;">Try another username, name, or title.</div></div>`

              )

            : `

              <div class="td-empty td-empty-search">

                <div class="td-empty-icon">⌕</div>

                <h3 style="margin:0 0 8px 0;">Search Tapzy Network</h3>

                <div>Find people by username, name, or title inside the Tapzy graph.</div>

              </div>

            `

        }

      `;

    }



    if (activeTab === "following") {

      contentHtml = followingCards.length

        ? `<div class="td-results-list">${followingCards.join("")}</div>`

        : `<div class="td-empty"><b>No following yet</b><div style="margin-top:8px;">This profile is not following anyone right now.</div></div>`;

    }



    if (activeTab === "followers") {

      contentHtml = followerCards.length

        ? `<div class="td-results-list">${followerCards.join("")}</div>`

        : `<div class="td-empty"><b>No followers yet</b><div style="margin-top:8px;">This profile has not been followed yet.</div></div>`;

    }



    if (activeTab === "connections") {

      contentHtml = connectionCards.length

        ? `<div class="td-results-list">${connectionCards.join("")}</div>`

        : `<div class="td-empty"><b>No connections yet</b><div style="margin-top:8px;">When two people follow each other back, they become a connection.</div></div>`;

    }



    const body = `

    <div class="wrap">

      <div class="td-shell">

        <section class="td-section">

          <div class="td-hub">

            <div class="td-tabs-wrap">

              <div class="td-tabs">

                ${renderTab("Connections", "connections", networkRows.length)}

                ${renderTab("Following", "following", profile.following.length)}

                ${renderTab("Followers", "followers", profile.followers.length)}

                ${renderTab("Search", "search", normalizedSearch.length >= 2 ? searchResults.length : 0)}

              </div>

            </div>



            <div class="td-content">

              <div class="td-section-head">

                <h2 class="td-section-title">

                  ${

                    activeTab === "search"

                      ? "Search"

                      : activeTab === "following"

                        ? "Following"

                        : activeTab === "followers"

                          ? "Followers"

                          : "Connections"

                  }

                </h2>



                <div class="muted">

                  ${

                    activeTab === "search"

                      ? (normalizedSearch.length >= 2

                          ? `${searchResults.length} result${searchResults.length === 1 ? "" : "s"}`

                          : "Search the network")

                      : activeTab === "following"

                        ? `${profile.following.length} total`

                        : activeTab === "followers"

                          ? `${profile.followers.length} total`

                          : `${networkRows.length} total`

                  }

                </div>

              </div>



              ${contentHtml}

            </div>

          </div>

        </section>

      </div>

    </div>



    <style>

      .td-shell{

        max-width:1120px;

        margin:0 auto;

      }



      .td-section{

        margin-top:18px;

      }



      .td-section-head{

        display:flex;

        justify-content:space-between;

        align-items:center;

        gap:12px;

        flex-wrap:wrap;

        margin-bottom:16px;

      }



      .td-section-title{

        margin:0;

        font-size:28px;

        line-height:1.05;

        letter-spacing:-.8px;

        font-weight:900;

      }



      .td-hub{

        position:relative;

        border-radius:34px;

        border:1px solid rgba(255,255,255,.08);

        background:

          radial-gradient(900px 300px at 80% 0%, rgba(90,165,255,.12), transparent 42%),

          radial-gradient(600px 280px at 10% 20%, rgba(60,120,255,.08), transparent 46%),

          linear-gradient(180deg, rgba(15,18,28,.98), rgba(9,11,16,.995));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 24px 60px rgba(0,0,0,.30),

          0 0 0 1px rgba(120,170,255,.03);

        padding:18px;

        overflow:hidden;

      }



      .td-hub::before{

        content:"";

        position:absolute;

        inset:0;

        pointer-events:none;

        opacity:.04;

        background-image:radial-gradient(rgba(255,255,255,.92) .6px, transparent .6px);

        background-size:10px 10px;

      }



      .td-tabs-wrap{

        overflow-x:auto;

        overflow-y:hidden;

        -webkit-overflow-scrolling:touch;

        scrollbar-width:none;

        margin:0 -2px;

        padding:2px;

        position:relative;

        z-index:2;

      }



      .td-tabs-wrap::-webkit-scrollbar{

        display:none;

      }



      .td-tabs{

        display:grid;

        grid-template-columns:repeat(4, minmax(0, 1fr));

        gap:12px;

      }



      .td-tab{

        display:flex;

        align-items:center;

        justify-content:space-between;

        gap:10px;

        min-height:56px;

        padding:0 16px;

        border-radius:18px;

        text-decoration:none;

        border:1px solid rgba(255,255,255,.08);

        background:

          linear-gradient(180deg, rgba(18,20,28,.95), rgba(10,12,16,.98));

        color:#fff;

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.03),

          0 8px 20px rgba(0,0,0,.10);

        transition:

          transform .18s ease,

          border-color .18s ease,

          box-shadow .18s ease,

          background .18s ease;

      }



      .td-tab:hover{

        transform:translateY(-1px);

        border-color:rgba(127,210,255,.20);

      }



      .td-tab.is-active{

        border-color:rgba(127,210,255,.34);

        background:

          radial-gradient(220px 90px at 50% 0%, rgba(111,210,255,.14), transparent 60%),

          linear-gradient(180deg, rgba(24,28,38,.98), rgba(12,14,20,.99));

        box-shadow:

          inset 0 0 0 1px rgba(127,210,255,.08),

          0 0 22px rgba(127,210,255,.11);

      }



      .td-tab-label{

        font-weight:700;

        white-space:nowrap;

        letter-spacing:.1px;

      }



      .td-tab-count{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-width:30px;

        height:30px;

        padding:0 8px;

        border-radius:999px;

        background:rgba(255,255,255,.06);

        font-size:12px;

        color:#d9e4f2;

        flex:0 0 auto;

        box-shadow:inset 0 1px 0 rgba(255,255,255,.05);

      }



      .td-content{

        margin-top:18px;

        position:relative;

        z-index:2;

      }



      .td-search-inline{

        display:grid;

        grid-template-columns:1fr auto;

        gap:12px;

        margin-bottom:18px;

      }



      .td-search-input{

        width:100%;

        padding:18px 20px;

        border-radius:22px;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(8,10,16,.98), rgba(4,6,10,1));

        color:#fff;

        outline:none;

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.03),

          0 10px 28px rgba(0,0,0,.14);

        transition:border-color .18s ease, box-shadow .18s ease, transform .18s ease;

      }



      .td-search-input:focus{

        border-color:rgba(127,210,255,.28);

        box-shadow:

          0 0 0 3px rgba(127,210,255,.08),

          0 16px 32px rgba(0,0,0,.18);

        transform:translateY(-1px);

      }



      .td-search-btn{

        min-width:140px;

      }



      .td-results-list{

        display:grid;

        gap:14px;

      }



      .td-person-card{

        position:relative;

        overflow:hidden;

        border-radius:26px;

        border:1px solid rgba(255,255,255,.08);

        background:

          radial-gradient(460px 200px at 85% 10%, rgba(90,165,255,.11), transparent 42%),

          linear-gradient(180deg, rgba(20,22,30,.97), rgba(9,11,16,.995));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.03),

          0 16px 38px rgba(0,0,0,.24);

        padding:18px;

        transition:

          transform .18s ease,

          box-shadow .18s ease,

          border-color .18s ease;

        display:flex;

        align-items:center;

        justify-content:space-between;

        gap:16px;

        min-height:108px;

      }



      .td-person-card:hover{

        transform:translateY(-2px);

        border-color:rgba(127,210,255,.18);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.03),

          0 22px 42px rgba(0,0,0,.28),

          0 0 18px rgba(90,165,255,.07);

      }



      .td-card-glow{

        position:absolute;

        width:220px;

        height:220px;

        right:-60px;

        top:-40px;

        border-radius:999px;

        background:radial-gradient(circle, rgba(86,156,255,.16), transparent 68%);

        filter:blur(16px);

        pointer-events:none;

      }



      .td-card-shine{

        content:"";

        position:absolute;

        top:0;

        bottom:0;

        left:-30%;

        width:28%;

        background:linear-gradient(90deg, transparent, rgba(255,255,255,.05), transparent);

        transform:skewX(-18deg);

        pointer-events:none;

        opacity:.45;

      }



      .td-person-left{

        display:flex;

        align-items:center;

        gap:16px;

        min-width:0;

      }



      .td-person-avatar{

        width:70px;

        height:70px;

        border-radius:22px;

        overflow:hidden;

        display:flex;

        align-items:center;

        justify-content:center;

        background:

          radial-gradient(circle at 50% 0%, rgba(130,200,255,.14), transparent 55%),

          linear-gradient(180deg,#162033,#0d1118);

        border:1px solid rgba(255,255,255,.08);

        color:#fff;

        font-weight:900;

        font-size:22px;

        letter-spacing:.5px;

        flex:0 0 auto;

        box-shadow:

          0 12px 28px rgba(0,0,0,.22),

          inset 0 1px 0 rgba(255,255,255,.05);

      }



      .td-person-avatar img{

        width:100%;

        height:100%;

        object-fit:cover;

        display:block;

      }



      .td-person-copy{

        min-width:0;

      }



      .td-person-topline{

        display:flex;

        align-items:center;

        gap:10px;

        flex-wrap:wrap;

      }



      .td-person-name{

        font-size:24px;

        font-weight:900;

        line-height:1.08;

        letter-spacing:-.4px;

      }



      .td-person-handle{

        margin-top:6px;

        color:#98a6ba;

        font-size:14px;

      }



      .td-person-title,

      .td-person-meta{

        margin-top:8px;

        color:#c8d4e3;

        font-size:14px;

        line-height:1.55;

      }



      .td-badge{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        padding:6px 10px;

        border-radius:999px;

        border:1px solid rgba(127,210,255,.18);

        background:rgba(127,210,255,.08);

        color:#dff3ff;

        font-size:11px;

        font-weight:800;

        letter-spacing:.7px;

        text-transform:uppercase;

        box-shadow:0 0 14px rgba(90,165,255,.08);

      }



      .td-person-actions{

        display:flex;

        gap:10px;

        flex-wrap:wrap;

        justify-content:flex-end;

        flex:0 0 auto;

      }



      .td-open-btn,

      .td-follow-btn{

        min-width:132px;

      }



      .td-empty{

        border-radius:24px;

        border:1px dashed rgba(255,255,255,.10);

        background:

          radial-gradient(260px 120px at 50% 0%, rgba(90,165,255,.06), transparent 62%),

          rgba(255,255,255,.03);

        padding:24px;

        color:#9fb0c8;

      }



      .td-empty-search{

        text-align:center;

        padding:40px 24px;

      }



      .td-empty-icon{

        width:58px;

        height:58px;

        margin:0 auto 14px;

        border-radius:18px;

        display:flex;

        align-items:center;

        justify-content:center;

        font-size:28px;

        color:#dff4ff;

        background:

          radial-gradient(circle at 50% 0%, rgba(150,230,255,.18), transparent 55%),

          linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));

        box-shadow:

          0 0 16px rgba(80,150,255,.16),

          inset 0 1px 0 rgba(255,255,255,.14);

      }



      @media(max-width:900px){

        .td-tabs{

          display:flex;

          flex-wrap:nowrap;

          gap:10px;

          min-width:max-content;

        }



        .td-tab{

          min-width:170px;

          min-height:50px;

          padding:0 14px;

          border-radius:16px;

          flex:0 0 auto;

        }

      }



      @media(max-width:700px){

        .td-hub{

          padding:14px;

          border-radius:24px;

        }



        .td-search-inline{

          grid-template-columns:1fr;

        }



        .td-search-btn{

          width:100%;

        }



        .td-person-card{

          flex-direction:column;

          align-items:flex-start;

          border-radius:22px;

          min-height:auto;

        }



        .td-person-left{

          width:100%;

        }



        .td-person-actions{

          width:100%;

          justify-content:flex-start;

        }



        .td-person-name{

          font-size:20px;

        }



        .td-tabs{

          display:flex;

          flex-wrap:nowrap;

          gap:10px;

          min-width:max-content;

        }



        .td-tab{

          min-width:160px;

        }

      }

    </style>



    <script>

      (function () {

        const cards = document.querySelectorAll(".js-tilt-card");

        cards.forEach((card) => {

          card.addEventListener("mousemove", (e) => {

            const rect = card.getBoundingClientRect();

            const x = e.clientX - rect.left;

            const y = e.clientY - rect.top;

            const midX = rect.width / 2;

            const midY = rect.height / 2;

            const rotateY = ((x - midX) / midX) * 1.6;

            const rotateX = -((y - midY) / midY) * 1.2;

            card.style.transform =

              "translateY(-2px) rotateX(" + rotateX + "deg) rotateY(" + rotateY + "deg)";

          });



          card.addEventListener("mouseleave", () => {

            card.style.transform = "";

          });

        });

      })();

    </script>



    ${renderTapzyAssistant({ username: profile.username || "User", pageType: "discovery" })}

    `;



    res.send(

      renderShell(`Discovery • ${profile.username}`, body, "", {

        currentProfile,

        pageTitle: "Discovery",

        pageType: "discovery",

      })

    );

  } catch (e) {

    console.error(e);

    return res.status(500).send("Discovery error");

  }

});



module.exports = router;

