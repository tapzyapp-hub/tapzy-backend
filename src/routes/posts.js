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
const { createNotification } = require("../services/notificationService");

function isVideo(url) {
  const v = String(url || "").toLowerCase();
  return v.endsWith(".mp4") || v.endsWith(".mov") || v.endsWith(".webm");
}

function extractMentions(value) {
  const matches = String(value || "").match(/@([a-zA-Z0-9_\.]+)/g) || [];
  return Array.from(new Set(matches.map((item) => item.slice(1).toLowerCase()).filter(Boolean)));
}

function renderComment(comment, currentProfile, postOwnerUsername) {
  const repliesHtml = (comment.replies || []).map((reply) => `
    <div class="post-comment post-comment-reply">
      <div class="post-comment-head">
        <div class="post-comment-user">@${escapeHtml(reply.profile?.username || "user")}</div>
        <div class="post-comment-time">${escapeHtml(formatPrettyLocal(reply.createdAt))}</div>
      </div>
      <div class="post-comment-body">${escapeHtml(reply.body || "")}</div>
    </div>
  `).join("");

  return `
    <div class="post-comment">
      <div class="post-comment-head">
        <div class="post-comment-user">@${escapeHtml(comment.profile?.username || "user")}</div>
        <div class="post-comment-time">${escapeHtml(formatPrettyLocal(comment.createdAt))}</div>
      </div>
      <div class="post-comment-body">${escapeHtml(comment.body || "")}</div>
      ${repliesHtml}
      ${
        currentProfile
          ? `
          <form class="post-comment-form post-reply-form" method="POST" action="/posts/comments/${escapeHtml(comment.id)}/reply">
            <input type="text" name="body" placeholder="Reply..." />
            <button class="post-like-btn" type="submit">Reply</button>
          </form>
          `
          : ``
      }
    </div>
  `;
}

function postCard(post, currentProfile, likedSet) {
  const media = post.mediaUrl
    ? isVideo(post.mediaUrl)
      ? `<video src="${escapeHtml(post.mediaUrl)}" controls playsinline></video>`
      : `<img src="${escapeHtml(post.mediaUrl)}" alt="Post media" />`
    : "";

  const topLevelComments = (post.comments || []).filter((c) => !c.parentId);
  const commentCount = (post.comments || []).length;

  return `
  <div class="post-card">
    ${media ? `<div class="post-media">${media}</div>` : ""}

    <div class="post-body">
      <div class="post-top">
        <div class="post-user">@${escapeHtml(post.profile.username || "user")}</div>
        <div class="post-time">${escapeHtml(formatPrettyLocal(post.createdAt))}</div>
      </div>

      ${post.caption ? `<div class="post-text">${escapeHtml(post.caption)}</div>` : ""}

      ${post.event ? `<a class="post-event" href="/events">${escapeHtml(post.event.title)}</a>` : ""}

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

        <div class="post-comment-count">${commentCount} comment${commentCount === 1 ? "" : "s"}</div>

        ${
          currentProfile && currentProfile.id === post.profileId
            ? `
            <form method="POST" action="/posts/${post.id}/delete" onsubmit="return confirm('Delete this post?');">
              <button class="post-like-btn" type="submit">Delete</button>
            </form>
            `
            : ""
        }
      </div>

      ${
        currentProfile
          ? `
          <form class="post-comment-form" method="POST" action="/posts/${post.id}/comment">
            <input type="text" name="body" placeholder="Write a comment..." />
            <button class="post-like-btn" type="submit">Comment</button>
          </form>
          `
          : `<div class="post-comment-signin"><a href="/auth">Sign in</a> to comment.</div>`
      }

      ${
        topLevelComments.length
          ? `<div class="post-comments">${topLevelComments.map((comment) => renderComment(comment, currentProfile, post.profile?.username || "")).join("")}</div>`
          : ""
      }
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
        comments: {
          include: {
            profile: true,
            replies: {
              include: {
                profile: true,
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
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
                  <textarea name="caption" placeholder="Share something..."></textarea>
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
      .posts-wrap{max-width:900px;}
      .posts-create-card,.posts-feed-card{
        position:relative;overflow:hidden;border-radius:32px;border:1px solid rgba(255,255,255,.08);
        background:radial-gradient(700px 260px at 50% -5%, rgba(127,210,255,.08), transparent 48%),linear-gradient(180deg, rgba(10,12,18,.98), rgba(6,6,8,1));
        box-shadow:0 24px 70px rgba(0,0,0,.40);padding:24px;
      }
      .posts-feed-card{margin-top:18px;}
      .posts-kicker{color:#95a5bf;text-transform:uppercase;letter-spacing:4px;font-size:12px;}
      .posts-title{margin:10px 0 0 0;font-size:42px;line-height:1;color:#fff;}
      .posts-title-small{font-size:34px;}
      .posts-subtitle{margin-top:10px;max-width:680px;color:#bcc8d8;line-height:1.7;font-size:15px;}
      .posts-create-head,.posts-feed-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;}
      .posts-create-form{margin-top:18px;}
      .posts-form-grid{display:grid;grid-template-columns:1fr;gap:14px;}
      .posts-field{display:flex;flex-direction:column;gap:8px;}
      .posts-field-full{grid-column:1 / -1;}
      .posts-field label{color:#fff;font-size:14px;font-weight:800;}
      .posts-field textarea,.posts-field input{
        width:100%;border-radius:18px;border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(12,15,21,.98), rgba(4,6,10,1));color:#fff;padding:14px 16px;box-sizing:border-box;font-size:15px;
      }
      .posts-field textarea{min-height:140px;resize:vertical;}
      .posts-field input[type="file"]{min-height:56px;padding:14px;}
      .posts-create-actions,.posts-signin-wrap{margin-top:16px;}
      .posts-btn,.post-like-btn{
        display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border-radius:14px;text-decoration:none;
        border:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg, rgba(18,21,31,.96), rgba(10,12,18,.98));
        color:#fff;font-size:14px;font-weight:800;cursor:pointer;
      }
      .posts-btn{min-height:48px;padding:0 22px;border-radius:16px;}
      .posts-btn-bright{
        border:none;background:radial-gradient(circle at 50% 0%, rgba(150,230,255,.18), transparent 55%),linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));
        box-shadow:0 0 16px rgba(80,150,255,.16), inset 0 1px 0 rgba(255,255,255,.14);
      }
      .posts-empty{margin-top:16px;padding:18px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:#dbe6f5;}
      .post-card{
        border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,.08);margin-top:18px;
        background:radial-gradient(420px 180px at 68% 20%, rgba(36,80,125,.14), transparent 48%),linear-gradient(180deg, rgba(13,15,20,.98), rgba(7,9,14,1));
        box-shadow:inset 0 1px 0 rgba(255,255,255,.03),0 14px 28px rgba(0,0,0,.22);
      }
      .post-media img,.post-media video{width:100%;display:block;max-height:560px;object-fit:cover;background:#000;}
      .post-body{padding:18px;}
      .post-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;}
      .post-user{color:#fff;font-weight:800;font-size:16px;}
      .post-time{color:#b8c4d7;font-size:13px;}
      .post-text{margin-top:12px;color:#fff;font-size:15px;line-height:1.7;}
      .post-event{display:inline-flex;align-items:center;justify-content:center;margin-top:14px;min-height:34px;padding:0 12px;border-radius:999px;text-decoration:none;color:#fff;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.08);font-size:12px;font-weight:800;}
      .post-actions{margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;}
      .post-actions form{margin:0;}
      .post-comment-count{color:#bcc8d8;font-size:13px;font-weight:700;}
      .post-comment-form{margin-top:14px;display:flex;gap:10px;align-items:center;}
      .post-comment-form input{flex:1;min-height:44px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#fff;padding:0 14px;}
      .post-comments{margin-top:16px;display:flex;flex-direction:column;gap:12px;}
      .post-comment{padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);}
      .post-comment-reply{margin-top:10px;margin-left:18px;background:rgba(255,255,255,.03);}
      .post-comment-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;}
      .post-comment-user{color:#fff;font-size:13px;font-weight:800;}
      .post-comment-time{color:#9fb1c9;font-size:12px;}
      .post-comment-body{margin-top:8px;color:#eaf2ff;font-size:14px;line-height:1.55;}
      .post-comment-signin{margin-top:14px;color:#bcc8d8;}
      .post-comment-signin a{color:#fff;}
      @media(max-width:700px){
        .posts-create-card,.posts-feed-card{padding:18px;border-radius:24px;}
        .posts-title{font-size:32px;}
        .posts-title-small{font-size:28px;}
        .posts-field textarea{min-height:120px;}
        .post-body{padding:16px;}
        .post-comment-form{flex-direction:column;align-items:stretch;}
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

    const createdPost = await prisma.post.create({
      data: {
        profileId: currentProfile.id,
        caption: String(req.body.caption || "").trim() || null,
        mediaUrl,
      },
      include: {
        profile: {
          select: { username: true },
        },
      },
    });

    const mentionedUsernames = extractMentions(req.body.caption || "");
    if (mentionedUsernames.length) {
      const mentionedProfiles = await prisma.userProfile.findMany({
        where: { username: { in: mentionedUsernames } },
        select: { id: true },
      });

      await Promise.all(
        mentionedProfiles.map((profile) =>
          createNotification({
            profileId: profile.id,
            actorId: currentProfile.id,
            type: "post_mention",
            title: `${currentProfile.name || currentProfile.username || "Someone"} mentioned you in a post`,
            body: String(req.body.caption || "").trim().slice(0, 140),
            link: "/posts",
            entityType: "post",
            entityId: createdPost.id,
            image: String(currentProfile.photo || "").trim() || null,
            skipDuplicateWindow: false,
          })
        )
      );
    }

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
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        profile: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!post) {
      return res.status(404).send("Post not found");
    }

    await prisma.postLike.upsert({
      where: {
        postId_profileId: {
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

    await createNotification({
      profileId: post.profileId,
      actorId: currentProfile.id,
      type: "post_like",
      title: `${currentProfile.name || currentProfile.username || "Someone"} liked your post`,
      body: post.caption ? String(post.caption).trim().slice(0, 120) : "",
      link: post.profile?.username ? `/u/${post.profile.username}` : "/posts",
      entityType: "post",
      entityId: post.id,
      image: String(currentProfile.photo || "").trim() || null,
      skipDuplicateWindow: true,
    });

    res.redirect(backUrl(req, "/posts"));
  } catch (e) {
    console.error(e);
    res.status(500).send("Like error");
  }
});

router.post("/posts/:id/comment", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const postId = String(req.params.id || "").trim();
    const body = String(req.body.body || "").trim();
    if (!body) return res.redirect(backUrl(req, "/posts"));

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        profile: { select: { id: true, username: true } },
      },
    });

    if (!post) return res.status(404).send("Post not found");

    const comment = await prisma.postComment.create({
      data: {
        postId,
        profileId: currentProfile.id,
        body,
      },
    });

    await createNotification({
      profileId: post.profileId,
      actorId: currentProfile.id,
      type: "post_comment",
      title: `${currentProfile.name || currentProfile.username || "Someone"} commented on your post`,
      body: body.slice(0, 140),
      link: "/posts",
      entityType: "post_comment",
      entityId: comment.id,
      image: String(currentProfile.photo || "").trim() || null,
      skipDuplicateWindow: false,
    });

    const mentionedUsernames = extractMentions(body);
    if (mentionedUsernames.length) {
      const mentionedProfiles = await prisma.userProfile.findMany({
        where: { username: { in: mentionedUsernames } },
        select: { id: true },
      });

      await Promise.all(
        mentionedProfiles.map((profile) =>
          createNotification({
            profileId: profile.id,
            actorId: currentProfile.id,
            type: "post_comment_mention",
            title: `${currentProfile.name || currentProfile.username || "Someone"} mentioned you in a comment`,
            body: body.slice(0, 140),
            link: "/posts",
            entityType: "post_comment",
            entityId: comment.id,
            image: String(currentProfile.photo || "").trim() || null,
            skipDuplicateWindow: false,
          })
        )
      );
    }

    res.redirect(backUrl(req, "/posts"));
  } catch (e) {
    console.error(e);
    res.status(500).send("Post comment error");
  }
});

router.post("/posts/comments/:id/reply", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const parentId = String(req.params.id || "").trim();
    const body = String(req.body.body || "").trim();
    if (!body) return res.redirect(backUrl(req, "/posts"));

    const parent = await prisma.postComment.findUnique({
      where: { id: parentId },
      include: {
        profile: { select: { id: true, username: true } },
        post: {
          include: {
            profile: { select: { id: true, username: true } },
          },
        },
      },
    });

    if (!parent) return res.status(404).send("Comment not found");

    const reply = await prisma.postComment.create({
      data: {
        postId: parent.postId,
        profileId: currentProfile.id,
        parentId: parent.id,
        body,
      },
    });

    await createNotification({
      profileId: parent.profileId,
      actorId: currentProfile.id,
      type: "post_reply",
      title: `${currentProfile.name || currentProfile.username || "Someone"} replied to your comment`,
      body: body.slice(0, 140),
      link: "/posts",
      entityType: "post_comment",
      entityId: reply.id,
      image: String(currentProfile.photo || "").trim() || null,
      skipDuplicateWindow: false,
    });

    if (parent.post && parent.post.profileId !== parent.profileId) {
      await createNotification({
        profileId: parent.post.profileId,
        actorId: currentProfile.id,
        type: "post_comment",
        title: `${currentProfile.name || currentProfile.username || "Someone"} replied on your post`,
        body: body.slice(0, 140),
        link: "/posts",
        entityType: "post_comment",
        entityId: reply.id,
        image: String(currentProfile.photo || "").trim() || null,
        skipDuplicateWindow: false,
      });
    }

    const mentionedUsernames = extractMentions(body);
    if (mentionedUsernames.length) {
      const mentionedProfiles = await prisma.userProfile.findMany({
        where: { username: { in: mentionedUsernames } },
        select: { id: true },
      });

      await Promise.all(
        mentionedProfiles.map((profile) =>
          createNotification({
            profileId: profile.id,
            actorId: currentProfile.id,
            type: "post_reply_mention",
            title: `${currentProfile.name || currentProfile.username || "Someone"} mentioned you in a reply`,
            body: body.slice(0, 140),
            link: "/posts",
            entityType: "post_comment",
            entityId: reply.id,
            image: String(currentProfile.photo || "").trim() || null,
            skipDuplicateWindow: false,
          })
        )
      );
    }

    res.redirect(backUrl(req, "/posts"));
  } catch (e) {
    console.error(e);
    res.status(500).send("Post reply error");
  }
});

router.post("/posts/:id/delete", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const postId = String(req.params.id || "").trim();

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, profileId: true },
    });

    if (!post) return res.redirect(backUrl(req, "/posts"));
    if (post.profileId !== currentProfile.id) {
      return res.status(403).send("Not allowed");
    }

    await prisma.post.delete({
      where: { id: postId },
    });

    res.redirect(backUrl(req, "/posts"));
  } catch (e) {
    console.error(e);
    res.status(500).send("Delete post error");
  }
});

module.exports = router;
