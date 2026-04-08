const router = require("express").Router();
const prisma = require("../prisma");
const {
  renderShell,
  renderTapzyAssistant,
  escapeHtml,
  cleanUsername,
  formatPrettyLocal,
  getFollowState,
  renderFollowButton,
  renderMomentLikeButton,
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
    const followState = await getFollowState(currentProfile?.id, profile.id);

    const activeTabRaw = String(req.query.tab || "search").trim().toLowerCase();
    const allowedTabs = new Set(["search", "following", "followers", "connections"]);
    const activeTab = allowedTabs.has(activeTabRaw) ? activeTabRaw : "search";

    const searchQueryRaw = String(req.query.q || "").trim();
    const normalizedSearch = searchQueryRaw.replace(/^@+/, "").trim();

    const [connections, moments, searchResults] = await Promise.all([
      prisma.connection.findMany({
        where: {
          OR: [{ senderProfileId: profile.id }, { receiverProfileId: profile.id }],
        },
        include: {
          senderProfile: true,
          receiverProfile: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.tapMoment.findMany({
        where: {
          OR: [{ senderProfileId: profile.id }, { receiverProfileId: profile.id }],
        },
        include: {
          senderProfile: true,
          receiverProfile: true,
          _count: { select: { likes: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      normalizedSearch.length >= 2
        ? prisma.userProfile.findMany({
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
        : [],
    ]);

    const likedSet = new Set();
    if (currentProfile && moments.length) {
      const likedRows = await prisma.tapMomentLike.findMany({
        where: {
          profileId: currentProfile.id,
          momentId: { in: moments.map((m) => m.id) },
        },
        select: { momentId: true },
      });
      for (const row of likedRows) likedSet.add(row.momentId);
    }

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

    const momentMap = new Map();
    for (const m of moments) {
      const otherId = m.senderProfileId === profile.id ? m.receiverProfileId : m.senderProfileId;
      if (!momentMap.has(otherId)) momentMap.set(otherId, m);
    }

    const seen = new Set();
    const networkRows = [];
    for (const c of connections) {
      const other = c.senderProfileId === profile.id ? c.receiverProfile : c.senderProfile;
      if (!other || seen.has(other.id)) continue;
      seen.add(other.id);

      const moment = momentMap.get(other.id) || null;
      const isLiked = !!(moment && likedSet.has(moment.id));

      networkRows.push({
        other,
        connectedAt: c.createdAt,
        moment,
        isLiked,
      });
    }

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
          <span>${escapeHtml(label)}</span>
          <span class="td-tab-count">${escapeHtml(String(count))}</span>
        </a>
      `;
    }

    function personCard(p, metaText = "", rightActionHtml = "") {
      const avatarHtml = p.photo
        ? `<img src="${escapeHtml(p.photo)}" alt="${escapeHtml(p.username || "user")}" />`
        : escapeHtml((p.name || p.username || "T").slice(0, 1).toUpperCase());

      return `
        <div class="td-person-card js-tilt-card">
          <div class="td-card-glow"></div>

          <div class="td-person-left">
            <div class="td-person-avatar">${avatarHtml}</div>

            <div class="td-person-copy">
              <div class="td-person-name">${escapeHtml(p.name || p.username || "Tapzy User")}</div>
              <div class="td-person-handle">@${escapeHtml(p.username || "user")}</div>
              ${p.title ? `<div class="td-person-title">${escapeHtml(p.title)}</div>` : ""}
              ${metaText ? `<div class="td-person-meta">${metaText}</div>` : ""}
            </div>
          </div>

          <div class="td-person-actions">
            <a class="btn btnDark" href="/u/${escapeHtml(p.username || "")}">View</a>
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
              <button class="btn" type="submit">Following ✓</button>
            </form>`
          : `<form method="POST" action="/follow/${escapeHtml(p.username || "")}" style="margin:0;">
              <button class="btn" type="submit">Follow</button>
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

    const connectionCards = networkRows.map((row) => `
      <div class="td-connection-card js-tilt-card">
        <div class="td-card-glow"></div>

        <div class="td-connection-top">
          <div>
            <div class="td-connection-name">${escapeHtml(row.other.name || "Tapzy User")}</div>
            <div class="td-connection-handle">@${escapeHtml(row.other.username || "user")}</div>
          </div>

          <div class="td-connection-time">${escapeHtml(formatPrettyLocal(row.connectedAt))}</div>
        </div>

        <div class="td-connection-meta">
          <div>
            <span>Connected</span>
            <strong>${escapeHtml(formatPrettyLocal(row.connectedAt))}</strong>
          </div>
          ${row.moment?.eventName ? `
            <div>
              <span>Event</span>
              <strong>${escapeHtml(row.moment.eventName)}</strong>
            </div>
          ` : ""}
          ${row.moment?.location ? `
            <div>
              <span>Location</span>
              <strong>${escapeHtml(row.moment.location)}</strong>
            </div>
          ` : ""}
        </div>

        <div class="td-connection-actions">
          <a class="btn" href="/u/${escapeHtml(row.other.username || "")}">Open Profile</a>
          <a class="btn btnDark" href="/discovery/${escapeHtml(row.other.username || "")}">Discovery</a>
          ${row.moment ? renderMomentLikeButton(currentProfile, row.moment, row.isLiked, true) : ""}
        </div>
      </div>
    `);

    let contentHtml = "";

    if (activeTab === "search") {
      contentHtml = normalizedSearch.length >= 2
        ? (
            searchCards.length
              ? `<div class="td-results-list">${searchCards.join("")}</div>`
              : `<div class="td-empty"><b>No people found</b><div style="margin-top:8px;">Try another username, name, or title.</div></div>`
          )
        : `
          <div class="td-empty td-empty-search">
            <div class="td-empty-icon">⌕</div>
            <h3 style="margin:0 0 8px 0;">Search Tapzy Discovery</h3>
            <div>Find people by username, name, or title inside the Tapzy graph.</div>
          </div>
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
        : `<div class="td-empty"><b>No Tapzy connections yet</b><div style="margin-top:8px;">Real-world Tapzy connections will show here.</div></div>`;
    }

    const body = `
    <div class="wrap">
      <div class="td-shell">
        <section class="td-hero">
          <div class="td-hero-glow td-hero-glow-a"></div>
          <div class="td-hero-glow td-hero-glow-b"></div>
          <div class="td-hero-noise"></div>

          <div class="row-between" style="position:relative;z-index:2;">
            <div>
              <div class="td-kicker">Tapzy Discovery</div>
              <h1 class="td-title">Discover People</h1>
              <div class="td-subtitle">
                Search the Tapzy graph, explore your audience, and surface real-world connections for @${escapeHtml(profile.username || "user")}.
              </div>
            </div>

            <div class="row td-hero-actions">
              <a class="btn btnDark" href="/u/${profile.username}">Back to Profile</a>
              ${renderFollowButton(currentProfile, profile, followState.isFollowing)}
            </div>
          </div>

          <form method="GET" action="/discovery/${escapeHtml(profile.username || "")}" class="td-search">
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

          <div class="td-stat-row">
            <div class="td-stat-card">
              <div class="td-stat-num">${networkRows.length}</div>
              <div class="td-stat-label">Connections</div>
            </div>
            <div class="td-stat-card">
              <div class="td-stat-num">${profile.following.length}</div>
              <div class="td-stat-label">Following</div>
            </div>
            <div class="td-stat-card">
              <div class="td-stat-num">${profile.followers.length}</div>
              <div class="td-stat-label">Followers</div>
            </div>
          </div>
        </section>

        <section class="td-section">
          <div class="td-hub">
            <div class="td-tabs">
              ${renderTab("Search", "search", searchResults.length)}
              ${renderTab("Following", "following", profile.following.length)}
              ${renderTab("Followers", "followers", profile.followers.length)}
              ${renderTab("Connections", "connections", networkRows.length)}
            </div>

            <div class="td-content">
              <div class="td-section-head">
                <h2 class="td-section-title">
                  ${
                    activeTab === "search"
                      ? "Search Results"
                      : activeTab === "following"
                        ? "Following"
                        : activeTab === "followers"
                          ? "Followers"
                          : "Recent Connections"
                  }
                </h2>

                <div class="muted">
                  ${
                    activeTab === "search"
                      ? (normalizedSearch.length >= 2 ? `${searchResults.length} result${searchResults.length === 1 ? "" : "s"}` : "Type to search")
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

      .td-kicker{
        color:#9bb0cf;
        text-transform:uppercase;
        letter-spacing:5px;
        font-size:12px;
        margin-bottom:10px;
      }

      .td-title{
        margin:0;
        font-size:54px;
        line-height:1;
        letter-spacing:-1.8px;
      }

      .td-subtitle{
        margin-top:14px;
        max-width:760px;
        color:#aab9cd;
        line-height:1.8;
        font-size:15px;
      }

      .td-section{
        margin-top:24px;
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
        font-size:26px;
        line-height:1.1;
        letter-spacing:-.5px;
      }

      .td-hero{
        position:relative;
        overflow:hidden;
        border-radius:36px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(1000px 460px at 50% -8%, rgba(97,164,255,.13), transparent 46%),
          radial-gradient(420px 260px at 10% 20%, rgba(24,56,120,.18), transparent 55%),
          linear-gradient(180deg, rgba(8,10,18,.98), rgba(3,4,8,1));
        padding:30px;
        box-shadow:
          0 32px 90px rgba(0,0,0,.44),
          inset 0 1px 0 rgba(255,255,255,.04),
          inset 0 0 0 1px rgba(127,210,255,.03);
      }

      .td-hero-noise{
        position:absolute;
        inset:0;
        opacity:.045;
        pointer-events:none;
        background-image:radial-gradient(rgba(255,255,255,.9) .6px, transparent .6px);
        background-size:8px 8px;
      }

      .td-hero-glow{
        position:absolute;
        border-radius:999px;
        pointer-events:none;
        filter:blur(18px);
      }

      .td-hero-glow-a{
        width:360px;
        height:360px;
        right:-40px;
        top:-80px;
        background:radial-gradient(circle, rgba(111,210,255,.18) 0%, rgba(111,210,255,.05) 42%, transparent 72%);
      }

      .td-hero-glow-b{
        width:260px;
        height:260px;
        left:-30px;
        bottom:-60px;
        background:radial-gradient(circle, rgba(87,144,255,.12) 0%, rgba(87,144,255,.04) 42%, transparent 72%);
      }

      .td-hero-actions{
        position:relative;
        z-index:2;
      }

      .td-search{
        position:relative;
        z-index:2;
        display:grid;
        grid-template-columns:1fr auto;
        gap:12px;
        margin-top:24px;
      }

      .td-search-input{
        width:100%;
        padding:19px 22px;
        border-radius:24px;
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

      .td-stat-row{
        position:relative;
        z-index:2;
        display:grid;
        grid-template-columns:repeat(3, minmax(0, 1fr));
        gap:14px;
        margin-top:20px;
      }

      .td-stat-card{
        border-radius:26px;
        padding:20px;
        text-align:center;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(220px 140px at 50% 0%, rgba(88,155,255,.08), transparent 60%),
          linear-gradient(180deg, rgba(20,24,34,.94), rgba(11,14,22,.98));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.03),
          0 12px 28px rgba(0,0,0,.16);
        transition:transform .2s ease, border-color .2s ease, box-shadow .2s ease;
      }

      .td-stat-card:hover{
        transform:translateY(-2px);
        border-color:rgba(127,210,255,.16);
      }

      .td-stat-num{
        font-size:34px;
        font-weight:900;
        line-height:1;
      }

      .td-stat-label{
        margin-top:8px;
        color:#93a0b4;
        font-size:12px;
        text-transform:uppercase;
        letter-spacing:1.1px;
      }

      .td-hub{
        border-radius:32px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(700px 240px at 80% 0%, rgba(90,165,255,.08), transparent 42%),
          linear-gradient(180deg, rgba(18,20,28,.96), rgba(10,12,16,.98));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.03),
          0 20px 46px rgba(0,0,0,.24);
        padding:18px;
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
        min-height:58px;
        padding:0 16px;
        border-radius:20px;
        text-decoration:none;
        border:1px solid rgba(255,255,255,.08);
        background:
          linear-gradient(180deg, rgba(18,20,28,.95), rgba(10,12,16,.98));
        color:#fff;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.03),
          0 8px 20px rgba(0,0,0,.10);
        transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease, background .18s ease;
      }

      .td-tab:hover{
        transform:translateY(-1px);
        border-color:rgba(127,210,255,.20);
      }

      .td-tab.is-active{
        border-color:rgba(127,210,255,.30);
        background:
          radial-gradient(220px 90px at 50% 0%, rgba(111,210,255,.11), transparent 60%),
          linear-gradient(180deg, rgba(24,28,38,.98), rgba(12,14,20,.99));
        box-shadow:
          inset 0 0 0 1px rgba(127,210,255,.08),
          0 0 18px rgba(127,210,255,.08);
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
      }

      .td-content{
        margin-top:18px;
      }

      .td-results-list{
        display:grid;
        gap:16px;
      }

      .td-person-card,
      .td-connection-card{
        position:relative;
        overflow:hidden;
        border-radius:28px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(420px 180px at 80% 10%, rgba(90,165,255,.10), transparent 42%),
          linear-gradient(180deg, rgba(20,22,30,.96), rgba(10,12,16,.98));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.03),
          0 16px 38px rgba(0,0,0,.24);
        padding:20px;
        transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease;
      }

      .td-person-card:hover,
      .td-connection-card:hover{
        transform:translateY(-2px);
        border-color:rgba(127,210,255,.18);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.03),
          0 22px 42px rgba(0,0,0,.28);
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

      .td-person-card{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
      }

      .td-person-left{
        display:flex;
        align-items:center;
        gap:16px;
        min-width:0;
      }

      .td-person-avatar{
        width:74px;
        height:74px;
        border-radius:22px;
        overflow:hidden;
        display:flex;
        align-items:center;
        justify-content:center;
        background:linear-gradient(180deg,#141821,#0d1118);
        border:1px solid rgba(255,255,255,.07);
        color:#fff;
        font-weight:800;
        font-size:28px;
        flex:0 0 auto;
        box-shadow:0 12px 28px rgba(0,0,0,.22);
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

      .td-person-name{
        font-size:22px;
        font-weight:800;
        line-height:1.12;
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

      .td-person-actions{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        justify-content:flex-end;
        flex:0 0 auto;
      }

      .td-connection-top{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:14px;
        flex-wrap:wrap;
      }

      .td-connection-name{
        font-size:22px;
        font-weight:800;
      }

      .td-connection-handle{
        margin-top:6px;
        color:#98a6ba;
        font-size:14px;
      }

      .td-connection-time{
        color:#98a6ba;
        font-size:13px;
      }

      .td-connection-meta{
        display:grid;
        gap:12px;
        margin-top:16px;
      }

      .td-connection-meta > div{
        display:flex;
        flex-direction:column;
        gap:3px;
      }

      .td-connection-meta span{
        font-size:10px;
        text-transform:uppercase;
        letter-spacing:1px;
        color:#92a3bc;
      }

      .td-connection-meta strong{
        font-size:14px;
        line-height:1.55;
        color:#f4f8ff;
      }

      .td-connection-actions{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        margin-top:18px;
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
        padding:36px 24px;
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
        .td-stat-row{
          grid-template-columns:1fr;
        }

        .td-tabs{
          grid-template-columns:1fr 1fr;
        }
      }

      @media(max-width:700px){
        .td-hero{
          padding:20px;
          border-radius:26px;
        }

        .td-title{
          font-size:38px;
        }

        .td-subtitle{
          font-size:14px;
        }

        .td-search{
          grid-template-columns:1fr;
        }

        .td-search-btn{
          width:100%;
        }

        .td-hub{
          padding:14px;
          border-radius:24px;
        }

        .td-person-card{
          flex-direction:column;
          align-items:flex-start;
          border-radius:22px;
        }

        .td-person-left{
          width:100%;
        }

        .td-person-actions{
          width:100%;
          justify-content:flex-start;
        }

        .td-person-name,
        .td-connection-name{
          font-size:20px;
        }

        .td-tabs{
          grid-template-columns:1fr;
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
            card.style.transform = "translateY(-2px) rotateX(" + rotateX + "deg) rotateY(" + rotateY + "deg)";
          });

          card.addEventListener("mouseleave", () => {
            card.style.transform = "";
          });
        });
      })();
    </script>

    ${renderTapzyAssistant({ username: profile.username || "User", pageType: "discovery" })}
    `;

    res.send(renderShell(`Discovery • ${profile.username}`, body, "", {
      currentProfile,
      pageTitle: "Discovery",
      pageType: "discovery",
    }));
  } catch (e) {
    console.error(e);
    return res.status(500).send("Discovery error");
  }
});

module.exports = router;
