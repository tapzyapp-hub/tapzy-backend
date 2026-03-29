const router = require("express").Router();

const prisma = require("../prisma");
const { upload } = require("../upload");
const {
  cleanUsername,
  escapeHtml,
  safeUrl,
  stripAt,
  publicAbsoluteUrl,
  makeVcf,
  buildQuickSharePreview,
  renderShell,
  renderTapzyAssistant,
  renderFollowButton,
  getFollowState,
  ownerKeyQuery,
  requireOwnerAccess,
  currentProfileNoticeHtml,
  backUrl,
  formatPrettyLocal,
} = require("../utils");

/* ---------- HELPERS ---------- */

function profileLinkRow(label, href) {
  return `
    <a class="profile-simple-link" href="${escapeHtml(href)}" target="_blank">
      <span>${escapeHtml(label)}</span>
      <span>›</span>
    </a>
  `;
}

function isVideo(url) {
  return /\.(mp4|webm|mov)$/i.test(String(url || ""));
}

/* ---------- STORIES ---------- */

function renderStories(profile) {
  if (!profile.stories?.length) return "";

  return `
  <section class="profile-panel">
    <h3 class="profile-panel-heading">Stories</h3>

    <div class="story-row">
      ${profile.stories
        .map((s) => {
          const media = isVideo(s.mediaUrl)
            ? `<video src="${escapeHtml(s.mediaUrl)}" muted playsinline></video>`
            : `<img src="${escapeHtml(s.mediaUrl)}"/>`;

          return `
          <a class="story-card" href="/stories/${escapeHtml(profile.username)}">
            ${media}
          </a>
          `;
        })
        .join("")}
    </div>
  </section>
  `;
}

/* ---------- POSTS ---------- */

function renderPosts(profile, currentProfile) {
  if (!profile.posts?.length) return "";

  return `
  <section class="profile-panel">
    <h3 class="profile-panel-heading">Posts</h3>

    <div class="post-grid">
      ${profile.posts
        .map((p) => {
          const media = p.mediaUrl
            ? isVideo(p.mediaUrl)
              ? `<video src="${escapeHtml(p.mediaUrl)}" controls></video>`
              : `<img src="${escapeHtml(p.mediaUrl)}"/>`
            : "";

          return `
          <div class="post-card">
            ${media}
            <div class="post-body">
              <div class="post-time">${formatPrettyLocal(p.createdAt)}</div>
              ${
                p.caption
                  ? `<div class="post-caption">${escapeHtml(p.caption)}</div>`
                  : ""
              }
            </div>
          </div>
          `;
        })
        .join("")}
    </div>
  </section>
  `;
}

/* ---------- ATTENDING ---------- */

function renderAttending(attendance) {
  if (!attendance?.event) return "";

  const e = attendance.event;

  return `
  <section class="profile-attending">
    <div class="attending-title">Attending</div>
    <div class="attending-name">${escapeHtml(e.title)}</div>
    <div class="attending-meta">
      ${formatPrettyLocal(e.startAt)} • ${escapeHtml(e.city || "")}
    </div>
  </section>
  `;
}

/* ---------- PROFILE ---------- */

router.get("/u/:username", async (req, res) => {
  try {
    const username = cleanUsername(req.params.username);

    const profile = await prisma.userProfile.findUnique({
      where: { username },
      include: {
        followers: true,
        following: true,
        stories: {
          where: { expiresAt: { gt: new Date() } },
        },
        posts: {
          orderBy: { createdAt: "desc" },
          take: 12,
        },
        eventAttendances: {
          where: { status: "going" },
          include: { event: true },
          take: 1,
        },
      },
    });

    if (!profile) return res.status(404).send("Profile not found");

    const currentProfile = req.currentProfile || null;
    const followState = await getFollowState(currentProfile?.id, profile.id);

    const displayName = profile.name || profile.username;

    const body = `
    <div class="wrap">

      <h1>${escapeHtml(displayName)}</h1>
      <div>@${escapeHtml(profile.username)}</div>

      ${
        renderFollowButton(currentProfile, profile, followState.isFollowing) ||
        ""
      }

      ${renderAttending(profile.eventAttendances?.[0])}

      ${renderStories(profile)}

      ${renderPosts(profile, currentProfile)}

      <div class="links">
        ${profile.phone ? profileLinkRow("Phone", `tel:${profile.phone}`) : ""}
        ${profile.email ? profileLinkRow("Email", `mailto:${profile.email}`) : ""}
      </div>

    </div>
    `;

    res.send(renderShell("Profile", body));
  } catch (e) {
    console.error(e);
    res.status(500).send("Error");
  }
});

module.exports = router;
