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
      ? `<video src="${escapeHtml(post.mediaUrl)}" controls></video>`
      : `<img src="${escapeHtml(post.mediaUrl)}" />`
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
              <button class="btn">${likedSet.has(post.id) ? "Liked ✓" : "Like"}</button>
            </form>
            `
            : `<a class="btn" href="/auth">Like</a>`
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
      const ids = posts.map(p => p.id);

      const liked = await prisma.postLike.findMany({
        where: {
          profileId: currentProfile.id,
          postId: { in: ids },
        },
        select: { postId: true },
      });

      likedSet = new Set(liked.map(x => x.postId));
    }

    const body = `
    <div class="wrap" style="max-width:900px;">

      <section class="post-create">

        ${
          currentProfile
            ? `
            <form method="POST" action="/posts" enctype="multipart/form-data">

              <textarea name="text" placeholder="Share something..."></textarea>

              <input type="file" name="media" />

              <button class="btn">Post</button>

            </form>
            `
            : `<a class="btn" href="/auth">Sign in to post</a>`
        }

      </section>

      <section class="post-feed">
        ${posts.map(p => postCard(p, currentProfile, likedSet)).join("")}
      </section>

    </div>

    <style>

    .post-card{
      border-radius:24px;
      overflow:hidden;
      border:1px solid rgba(255,255,255,.08);
      margin-top:18px;
      background:#0d0f14;
    }

    .post-media img,
    .post-media video{
      width:100%;
      display:block;
    }

    .post-body{
      padding:16px;
    }

    .post-user{
      font-weight:800;
    }

    .post-text{
      margin-top:10px;
    }

    .post-actions{
      margin-top:14px;
    }

    textarea{
      width:100%;
      min-height:100px;
      margin-bottom:10px;
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

