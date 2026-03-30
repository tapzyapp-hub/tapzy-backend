const router = require("express").Router();
const prisma = require("../prisma");
const { upload } = require("../upload");

const {
  renderShell,
  renderTapzyAssistant,
  escapeHtml,
  publicAbsoluteUrl,
  formatPrettyLocal,
  backUrl,
} = require("../utils");

function isVideo(url) {
  const v = String(url || "").toLowerCase();
  return v.endsWith(".mp4") || v.endsWith(".mov") || v.endsWith(".webm");
}

function postCard(post, currentProfile, likedSet) {
  const media = post.mediaUrl
    ? isVideo(post.mediaUrl)
      ? `<video src="${escapeHtml(post.mediaUrl)}" controls playsinline></video>`
      : `<img src="${escapeHtml(post.mediaUrl)}" alt="Post media" />`
    : "";

  return `
  <div class="post-card">
    ${
      media
        ? `<div class="post-media">${media}</div>`
        : ""
    }

    <div class="post-body">
      <div class="post-top">
        <div class="post-user">@${escapeHtml(post.profile.username || "user")}</div>
        <div class="post-time">${escapeHtml(formatPrettyLocal(post.createdAt))}</div>
      </div>

      ${
        post.text
          ? `<div class="post-text">${escapeHtml(post.text)}</div>`
          : ""
      }

      ${
        post.event
          ? `<a class="post-event" href="/events">${escapeHtml(post.event.title)}</a>`
          : ""
      }

      <div class="post-actions">
        ${
          currentProfile
            ? `
            <form method="POST" action="/posts/${post.id}/like">
              <button class="post-like-btn" type="submit">${likedSet.has(post.id) ? "Liked ✓" : "Like"}</button>
            </form>
            `
            : `<a class="post-like-btn" href="/auth">Like</a>`
        }
      </div>
    </div>
  </div>
  `;
}

router.get("/posts", async (req, res) => {
  try {
    const currentProfile = req.currentProfile || null;

    const posts = await prisma.post.findMany({
      include: {
        profile: true,
        event: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    let likedSet = new Set();

    if (currentProfile && posts.length) {
      const ids = posts.map((p) => p.id);

      const liked = await prisma.postLike.findMany({
        where: {
          profileId: currentProfile.id,
          postId: { in: ids },
        },
        select: { postId: true },
      });

      likedSet = new Set(liked.map((x) => x.postId));
    }

    const body = `
    <div class="wrap posts-wrap">

      <section class="posts-create-card">
        <div class="posts-create-head">
          <div>
            <div class="posts-kicker">Tapzy Posts</div>
            <h2 class="posts-title">Create a post</h2>
            <div class="posts-subtitle">Share a photo, update, or event moment with your network.</div>
          </div>
        </div>

        ${
          currentProfile
            ? `
            <form class="posts-create-form" method="POST" action="/posts" enctype="multipart/form-data">
              <div class="posts-form-grid">
                <div class="posts-field posts-field-full">
                  <label>Caption</label>
                  <textarea name="text" placeholder="Share something..."></textarea>
                </div>

                <div class="posts-field posts-field-full">
                  <label>Media</label>
                  <input type="file" name="media" accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm" />
                </div>
              </div>

              <div class="posts-create-actions">
                <button class="posts-btn posts-btn-bright" type="submit">Post</button>
              </div>
            </form>
            `
            : `
            <div class="posts-signin-wrap">
              <a class="posts-btn posts-btn-bright" href="/auth">Sign in to post</a>
            </div>
            `
        }
      </section>

      <section class="posts-feed-card">
        <div class="posts-feed-head">
          <div>
            <div class="posts-kicker">Latest</div>
            <h2 class="posts-title posts-title-small">Post feed</h2>
            <div class="posts-subtitle">Recent updates from the Tapzy network.</div>
          </div>
        </div>

        ${
          posts.length
            ? posts.map((p) => postCard(p, currentProfile, likedSet)).join("")
            : `<div class="posts-empty">No posts yet.</div>`
        }
      </section>

    </div>

    <style>
      .posts-wrap{
        max-width:900px;
      }

      .posts-create-card,
      .posts-feed-card{
        position:relative;
        overflow:hidden;
        border-radius:32px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(700px 260px at 50% -5%, rgba(127,210,255,.08), transparent 48%),
          linear-gradient(180deg, rgba(10,12,18,.98), rgba(6,6,8,1));
        box-shadow:0 24px 70px rgba(0,0,0,.40);
        padding:24px;
      }

      .posts-feed-card{
        margin-top:18px;
      }

      .posts-kicker{
        color:#95a5bf;
        text-transform:uppercase;
        letter-spacing:4px;
        font-size:12px;
      }

      .posts-title{
        margin:10px 0 0 0;
        font-size:42px;
        line-height:1;
        color:#fff;
      }

      .posts-title-small{
        font-size:34px;
      }

      .posts-subtitle{
        margin-top:10px;
        max-width:680px;
        color:#bcc8d8;
        line-height:1.7;
        font-size:15px;
      }

      .posts-create-head,
      .posts-feed-head{
        display:flex;
        justify-content:space-between;
        gap:16px;
        align-items:flex-start;
        flex-wrap:wrap;
      }

      .posts-create-form{
        margin-top:18px;
      }

      .posts-form-grid{
        display:grid;
        grid-template-columns:1fr;
        gap:14px;
      }

      .posts-field{
        display:flex;
        flex-direction:column;
        gap:8px;
      }

      .posts-field-full{
        grid-column:1 / -1;
      }

      .posts-field label{
        color:#fff;
        font-size:14px;
        font-weight:800;
      }

      .posts-field textarea,
      .posts-field input{
        width:100%;
        border-radius:18px;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(12,15,21,.98), rgba(4,6,10,1));
        color:#fff;
        padding:14px 16px;
        box-sizing:border-box;
        font-size:15px;
      }

      .posts-field textarea{
        min-height:140px;
        resize:vertical;
      }

      .posts-field input[type="file"]{
        min-height:56px;
        padding:14px;
      }

      .posts-create-actions,
      .posts-signin-wrap{
        margin-top:16px;
      }

      .posts-btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:48px;
        padding:0 22px;
        border-radius:16px;
        text-decoration:none;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(18,21,31,.96), rgba(10,12,18,.98));
        color:#fff;
        font-size:14px;
        font-weight:800;
        cursor:pointer;
      }

      .posts-btn-bright{
        border:none;
        background:
          radial-gradient(circle at 50% 0%, rgba(150,230,255,.18), transparent 55%),
          linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));
        box-shadow:
          0 0 16px rgba(80,150,255,.16),
          inset 0 1px 0 rgba(255,255,255,.14);
      }

      .posts-empty{
        margin-top:16px;
        padding:18px;
        border-radius:18px;
        border:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.03);
        color:#dbe6f5;
      }

      .post-card{
        border-radius:24px;
        overflow:hidden;
        border:1px solid rgba(255,255,255,.08);
        margin-top:18px;
        background:
          radial-gradient(420px 180px at 68% 20%, rgba(36,80,125,.14), transparent 48%),
          linear-gradient(180deg, rgba(13,15,20,.98), rgba(7,9,14,1));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.03),
          0 14px 28px rgba(0,0,0,.22);
      }

      .post-media img,
      .post-media video{
        width:100%;
        display:block;
        max-height:560px;
        object-fit:cover;
        background:#000;
      }

      .post-body{
        padding:18px;
      }

      .post-top{
        display:flex;
        justify-content:space-between;
        gap:12px;
        align-items:flex-start;
        flex-wrap:wrap;
      }

      .post-user{
        color:#fff;
        font-weight:800;
        font-size:16px;
      }

      .post-time{
        color:#b8c4d7;
        font-size:13px;
      }

      .post-text{
        margin-top:12px;
        color:#fff;
        font-size:15px;
        line-height:1.7;
      }

      .post-event{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        margin-top:14px;
        min-height:34px;
        padding:0 12px;
        border-radius:999px;
        text-decoration:none;
        color:#fff;
        background:rgba(255,255,255,.08);
        border:1px solid rgba(255,255,255,.08);
        font-size:12px;
        font-weight:800;
      }

      .post-actions{
        margin-top:16px;
      }

      .post-actions form{
        margin:0;
      }

      .post-like-btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:42px;
        padding:0 16px;
        border-radius:14px;
        text-decoration:none;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(18,21,31,.96), rgba(10,12,18,.98));
        color:#fff;
        font-size:14px;
        font-weight:800;
        cursor:pointer;
      }

      @media(max-width:700px){
        .posts-create-card,
        .posts-feed-card{
          padding:18px;
          border-radius:24px;
        }

        .posts-title{
          font-size:32px;
        }

        .posts-title-small{
          font-size:28px;
        }

        .posts-field textarea{
          min-height:120px;
        }

        .post-body{
          padding:16px;
        }
      }
    </style>

    ${renderTapzyAssistant({
      username: currentProfile?.username || "User",
      pageType: "posts",
    })}
    `;

    res.send(
      renderShell("Posts", body, "", {
        currentProfile,
        pageTitle: "Posts",
        pageType: "posts",
      })
    );
  } catch (e) {
    console.error(e);
    res.status(500).send("Posts error");
  }
});

router.post("/posts", upload.single("media"), async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    let mediaUrl = null;

    if (req.file) {
      mediaUrl = publicAbsoluteUrl(req, `/uploads/${req.file.filename}`);
    }

    await prisma.post.create({
      data: {
        profileId: currentProfile.id,
        text: String(req.body.text || "").trim() || null,
        mediaUrl,
      },
    });

    res.redirect("/posts");
  } catch (e) {
    console.error(e);
    res.status(500).send("Create post error");
  }
});

router.post("/posts/:id/like", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const postId = String(req.params.id);

    await prisma.postLike.upsert({
      where: {
        profileId_postId: {
          profileId: currentProfile.id,
          postId,
        },
      },
      update: {},
      create: {
        profileId: currentProfile.id,
        postId,
      },
    });

    res.redirect(backUrl(req, "/posts"));
  } catch (e) {
    console.error(e);
    res.status(500).send("Like error");
  }
});

module.exports = router;
