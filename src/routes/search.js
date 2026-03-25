const router = require("express").Router();
const prisma = require("../prisma");
const { searchLimiter, followLimiter } = require("../middleware");
const {
  cleanUsername,
  escapeHtml,
  renderShell,
  renderTapzyAssistant,
  backUrl,
} = require("../utils");

function normalizeSearchQuery(value) {
  const raw = String(value || "").trim();
  const noAt = raw.replace(/^@+/, "").trim();
  return {
    raw,
    normalized: noAt,
  };
}

router.get("/search", searchLimiter, async (req, res) => {
  try {
    const currentProfile = req.currentProfile || null;
    const { raw, normalized } = normalizeSearchQuery(req.query.q || "");

    let results = [];

    if (normalized.length >= 2) {
      results = await prisma.userProfile.findMany({
        where: {
          OR: [
            { username: { contains: normalized, mode: "insensitive" } },
            { name: { contains: normalized, mode: "insensitive" } },
            { title: { contains: normalized, mode: "insensitive" } },
          ],
        },
        orderBy: { connections: "desc" },
        take: 50,
      });
    }

    const followedSet = new Set();

    if (currentProfile && results.length) {
      const rows = await prisma.follow.findMany({
        where: {
          followerProfileId: currentProfile.id,
          followingProfileId: { in: results.map((r) => r.id) },
        },
        select: { followingProfileId: true },
      });

      for (const row of rows) followedSet.add(row.followingProfileId);
    }

    const resultCards = results.map((p) => {
      const followButton =
        currentProfile && currentProfile.id !== p.id
          ? followedSet.has(p.id)
            ? `<form method="POST" action="/unfollow/${escapeHtml(p.username || "")}" style="margin:0;">
                 <button class="btn btnDark" type="submit">Following ✓</button>
               </form>`
            : `<form method="POST" action="/follow/${escapeHtml(p.username || "")}" style="margin:0;">
                 <button class="btn" type="submit">Follow</button>
               </form>`
          : "";

      const avatarHtml = p.photo
        ? `<img src="${escapeHtml(p.photo)}" alt="${escapeHtml(p.username || "user")}" />`
        : escapeHtml((p.name || p.username || "T").slice(0, 1).toUpperCase());

      return `
      <div class="search-user-card">
        <div class="search-user-left">
          <div class="search-user-avatar">${avatarHtml}</div>

          <div class="search-user-copy">
            <div class="search-user-name">${escapeHtml(p.name || p.username || "Tapzy User")}</div>
            <div class="search-user-handle">@${escapeHtml(p.username || "user")}</div>
            ${p.title ? `<div class="search-user-title">${escapeHtml(p.title)}</div>` : ""}
          </div>
        </div>

        <div class="search-user-actions">
          <a class="btn btnDark" href="/u/${escapeHtml(p.username || "")}">View</a>
          ${followButton}
        </div>
      </div>
      `;
    });

    const body = `
    <div class="wrap" style="max-width:1100px;">
      <section class="search-hero">
        <div class="search-hero-glow"></div>

        <div style="position:relative;z-index:2;">
          <div class="search-kicker">Tapzy Discovery</div>
          <h1 class="search-main-title">Search Tapzy Users</h1>
          <div class="muted" style="margin-top:10px;max-width:680px;line-height:1.7;">
            Discover people by name, username, or title inside the Tapzy network.
          </div>
        </div>

        <form method="GET" action="/search" class="search-form" style="position:relative;z-index:2;margin-top:22px;">
          <input
            class="search-input"
            name="q"
            value="${escapeHtml(raw)}"
            placeholder="Search by name, username, or title"
            required
          />
          <button class="btn" type="submit">Search</button>
        </form>
      </section>

      <section class="search-results-section">
        <div class="row-between" style="margin-bottom:14px;">
          <h2 style="margin:0;">Results</h2>
          <div class="muted">
            ${
              raw
                ? `${results.length} match${results.length === 1 ? "" : "es"}`
                : "Start your search"
            }
          </div>
        </div>

        ${
          raw
            ? (
                resultCards.length
                  ? `<div class="search-results-grid">${resultCards.join("")}</div>`
                  : `<div class="search-empty-card">No users found.</div>`
              )
            : `<div class="search-empty-card">Enter a name or username.</div>`
        }
      </section>
    </div>

    <style>
      .search-hero{
        position:relative;
        overflow:hidden;
        border-radius:30px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(850px 360px at 50% -5%, rgba(127,210,255,.10), transparent 48%),
          linear-gradient(180deg, rgba(10,12,18,.98), rgba(6,6,8,1));
        padding:28px;
        box-shadow:0 24px 70px rgba(0,0,0,.40);
      }

      .search-hero-glow{
        position:absolute;
        width:340px;
        height:340px;
        border-radius:999px;
        background:radial-gradient(circle, rgba(111,210,255,.18) 0%, rgba(111,210,255,.06) 36%, transparent 70%);
        right:-50px;
        top:-70px;
        filter:blur(12px);
      }

      .search-kicker{
        color:#95a5bf;
        text-transform:uppercase;
        letter-spacing:4px;
        font-size:13px;
      }

      .search-main-title{
        margin:10px 0 0 0;
        font-size:54px;
        line-height:1;
      }

      .search-form{
        display:grid;
        grid-template-columns:1fr auto;
        gap:12px;
      }

      .search-input{
        width:100%;
        padding:18px 20px;
        border-radius:22px;
        border:1px solid rgba(255,255,255,.08);
        background:#07090d;
        color:#fff;
        outline:none;
      }

      .search-input:focus{
        border-color:rgba(127,210,255,.28);
        box-shadow:0 0 0 3px rgba(127,210,255,.08);
      }

      .search-results-section{
        margin-top:24px;
      }

      .search-results-grid{
        display:grid;
        grid-template-columns:1fr;
        gap:16px;
      }

      .search-user-card{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
        padding:20px;
        border-radius:28px;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(18,20,28,.96), rgba(10,12,18,.98));
        box-shadow:0 18px 44px rgba(0,0,0,.28);
      }

      .search-user-left{
        display:flex;
        align-items:center;
        gap:16px;
        min-width:0;
      }

      .search-user-avatar{
        width:68px;
        height:68px;
        border-radius:20px;
        overflow:hidden;
        display:flex;
        align-items:center;
        justify-content:center;
        background:linear-gradient(180deg,#141821,#0d1118);
        border:1px solid rgba(255,255,255,.07);
        color:#fff;
        font-weight:800;
        font-size:26px;
        flex:0 0 auto;
      }

      .search-user-avatar img{
        width:100%;
        height:100%;
        object-fit:cover;
        display:block;
      }

      .search-user-copy{
        min-width:0;
      }

      .search-user-name{
        font-size:22px;
        font-weight:800;
        line-height:1.15;
      }

      .search-user-handle{
        margin-top:6px;
        color:#9aa5b8;
        font-size:14px;
      }

      .search-user-title{
        margin-top:8px;
        color:#c7d1de;
        font-size:14px;
      }

      .search-user-actions{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        justify-content:flex-end;
        flex:0 0 auto;
      }

      .search-empty-card{
        padding:22px;
        border-radius:24px;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(18,20,28,.96), rgba(10,12,18,.98));
        color:#d7dce5;
      }

      @media(max-width:900px){
        .search-main-title{
          font-size:42px;
        }
      }

      @media(max-width:700px){
        .search-hero{
          padding:18px;
          border-radius:24px;
        }

        .search-main-title{
          font-size:36px;
        }

        .search-form{
          grid-template-columns:1fr;
        }

        .search-user-card{
          flex-direction:column;
          align-items:flex-start;
          border-radius:22px;
        }

        .search-user-left{
          width:100%;
        }

        .search-user-actions{
          width:100%;
          justify-content:flex-start;
        }

        .search-user-name{
          font-size:20px;
        }
      }
    </style>

    ${renderTapzyAssistant({
      username: currentProfile?.username || "User",
      pageType: "search",
    })}
    `;

    res.send(
      renderShell("Search", body, "", {
        currentProfile,
        pageTitle: "Search",
        pageType: "search",
      })
    );
  } catch (e) {
    console.error(e);
    res.status(500).send("Search error");
  }
});

router.post("/follow/:username", followLimiter, async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).send("Please sign in first.");

    const username = cleanUsername(req.params.username);
    const target = await prisma.userProfile.findUnique({ where: { username } });

    if (!target) return res.status(404).send("Profile not found");
    if (target.id === currentProfile.id) return res.status(400).send("You cannot follow yourself.");

    await prisma.follow.upsert({
      where: {
        followerProfileId_followingProfileId: {
          followerProfileId: currentProfile.id,
          followingProfileId: target.id,
        },
      },
      update: {},
      create: {
        followerProfileId: currentProfile.id,
        followingProfileId: target.id,
      },
    });

    res.redirect(backUrl(req, `/u/${target.username}?followed=1`));
  } catch (e) {
    console.error(e);
    res.status(500).send("Follow failed");
  }
});

router.post("/unfollow/:username", followLimiter, async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.status(401).send("Please sign in first.");

    const username = cleanUsername(req.params.username);
    const target = await prisma.userProfile.findUnique({ where: { username } });

    if (!target) return res.status(404).send("Profile not found");

    await prisma.follow.deleteMany({
      where: {
        followerProfileId: currentProfile.id,
        followingProfileId: target.id,
      },
    });

    res.redirect(backUrl(req, `/u/${target.username}?unfollowed=1`));
  } catch (e) {
    console.error(e);
    res.status(500).send("Unfollow failed");
  }
});

module.exports = router;