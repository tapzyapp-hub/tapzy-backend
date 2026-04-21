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

function extractMentions(value) {
  const matches = String(value || "").match(/@([a-zA-Z0-9_\.]+)/g) || [];
  return Array.from(new Set(matches.map((item) => item.slice(1).toLowerCase()).filter(Boolean)));
}



function expiresIn24Hours() {

  return new Date(Date.now() + 24 * 60 * 60 * 1000);

}



function isVideoUrl(url) {

  const value = String(url || "").toLowerCase();

  return (

    value.endsWith(".mp4") ||

    value.endsWith(".mov") ||

    value.endsWith(".webm") ||

    value.includes("/video/")

  );

}




function renderVideoFrame(url, options = {}) {
  const src = escapeHtml(url || "");
  const className = escapeHtml(options.className || "story-video");
  const autoplay = options.autoplay ? ' autoplay' : '';
  const muted = options.muted ? ' muted' : '';
  const controls = options.controls === false ? '' : ' controls';
  const loop = options.loop ? ' loop' : '';
  const preload = escapeHtml(options.preload || 'metadata');
  const aria = escapeHtml(options.ariaLabel || 'Play video');
  return `
    <div class="tz-video-frame${options.autoplay ? ' is-autoplay' : ''}" data-video-frame>
      <div class="tz-video-preview" data-video-preview tabindex="0" role="button" aria-label="${aria}">
        <div class="tz-video-preview-blur"></div>
        <div class="tz-video-preview-badge">▶</div>
      </div>
      <video class="${className}" src="${src}"${controls}${autoplay}${muted}${loop} playsinline preload="${preload}"></video>
    </div>
  `;
}

function storyRing(profile, storyCount, hasLiveStory) {

  const photo = profile.photo

    ? `<img src="${escapeHtml(profile.photo)}" alt="${escapeHtml(profile.name || profile.username || "User")}" />`

    : `<span>${escapeHtml(((profile.name || profile.username || "T")[0] || "T").toUpperCase())}</span>`;



  return `

  <a class="story-ring-card" href="/stories/${escapeHtml(profile.username || "")}">

    <div class="story-ring ${hasLiveStory ? "story-ring-live" : ""}">

      <div class="story-ring-inner">${photo}</div>

    </div>

    <div class="story-ring-name">@${escapeHtml(profile.username || "user")}</div>

    <div class="story-ring-count">${storyCount} stor${storyCount === 1 ? "y" : "ies"}</div>

  </a>

  `;

}



function storyComposer(currentProfile, upcomingEvents) {

  if (!currentProfile) {

    return `

    <section class="stories-create-card">

      <div class="stories-create-head">

        <div>

          <div class="stories-kicker">Tapzy Stories</div>

          <h2 class="stories-title">Create a story</h2>

          <div class="stories-subtitle">Sign in to post photo, video, or event stories that disappear in 24 hours.</div>

        </div>

        <a class="stories-btn stories-btn-bright" href="/auth">Sign in</a>

      </div>

    </section>

    `;

  }



  return `

  <section class="stories-create-card">

    <div class="stories-create-head">

      <div>

        <div class="stories-kicker">Tapzy Stories</div>

        <h2 class="stories-title">Create a story</h2>

        <div class="stories-subtitle">Post quick updates, event plans, or live moments. Stories expire after 24 hours.</div>

      </div>

    </div>



    <form class="stories-create-form" method="POST" action="/stories" enctype="multipart/form-data">

      <div class="stories-form-grid">

        <div class="stories-field stories-field-full">

          <label>Caption</label>

          <textarea name="text" placeholder="What’s happening? Going somewhere tonight? At an event right now?"></textarea>

        </div>



        <div class="stories-field">

          <label>Media</label>

          <input type="file" name="storyMedia" accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm" />

        </div>



        <div class="stories-field">

          <label>Story Type</label>

          <select name="type">

            <option value="image">Image</option>

            <option value="video">Video</option>

            <option value="text">Text only</option>

          </select>

        </div>



        <div class="stories-field stories-field-full">

          <label>Link to event (optional)</label>

          <select name="eventId">

            <option value="">No event</option>

            ${upcomingEvents

              .map(

                (event) =>

                  `<option value="${escapeHtml(event.id)}">${escapeHtml(event.title)}${

                    event.city ? " • " + escapeHtml(event.city) : ""

                  }</option>`

              )

              .join("")}

          </select>

        </div>

      </div>



      <div class="stories-create-actions">

        <button class="stories-btn stories-btn-bright" type="submit">Post Story</button>

      </div>

    </form>

  </section>

  `;

}



function profileStoryCard(profile, stories) {

  const firstStory = stories[0];

  const previewUrl = firstStory?.mediaUrl || "";

  const previewIsVideo = isVideoUrl(previewUrl);



  const mediaHtml = previewUrl

    ? previewIsVideo

      ? renderVideoFrame(previewUrl, { className: "stories-profile-preview-media", controls: false, muted: true, preload: "metadata", ariaLabel: "Preview story video" })

      : `<img class="stories-profile-preview-media" src="${escapeHtml(previewUrl)}" alt="${escapeHtml(profile.username || "story")}" />`

    : `<div class="stories-profile-preview-fallback">@${escapeHtml(profile.username || "user")}</div>`;



  const createdAtMs = firstStory?.createdAt ? new Date(firstStory.createdAt).getTime() : Date.now();

  const diffMs = Math.max(0, Date.now() - createdAtMs);

  const diffMinutes = Math.floor(diffMs / 60000);

  const diffHours = Math.floor(diffMs / 3600000);



  let ageLabel = "Just now";

  if (diffHours >= 1) {

    ageLabel = `${diffHours}h`;

  } else if (diffMinutes >= 1) {

    ageLabel = `${diffMinutes}m`;

  }



  return `

  <a class="stories-profile-card" href="/stories/${escapeHtml(profile.username || "")}">

    <div class="stories-profile-preview">

      ${mediaHtml}

      <div class="stories-profile-overlay"></div>

    </div>

    <div class="stories-profile-meta">

      <div class="stories-profile-age">${escapeHtml(ageLabel)}</div>

      <div class="stories-profile-handle">${stories.length === 1 ? "Your Story" : `${stories.length} Stories`}</div>

    </div>

  </a>

  `;

}



router.get("/stories", async (req, res) => {

  try {

    const currentProfile = req.currentProfile || null;

    const now = new Date();



    const activeStories = await prisma.story.findMany({

      where: {

        expiresAt: { gt: now },

      },

      include: {

        profile: true,

        event: true,

      },

      orderBy: [{ createdAt: "desc" }],

      take: 200,

    });



    const grouped = new Map();

    for (const story of activeStories) {

      if (!story.profile?.username) continue;

      const key = story.profile.username;

      if (!grouped.has(key)) grouped.set(key, []);

      grouped.get(key).push(story);

    }



    const groups = Array.from(grouped.entries()).map(([username, stories]) => ({

      username,

      profile: stories[0].profile,

      stories,

    }));



    let upcomingEvents = [];

    if (currentProfile) {

      upcomingEvents = await prisma.eventFinderItem.findMany({

        where: {

          startAt: { gte: now },

        },

        orderBy: [{ startAt: "asc" }],

        take: 20,

      });

    }



    const body = `

    <div class="wrap stories-wrap">

      ${storyComposer(currentProfile, upcomingEvents)}



      <section class="stories-discover-card">

        <div class="stories-head-row">

          <div>

            <div class="stories-kicker">Live Now</div>

            <h2 class="stories-title">Story feed</h2>

            <div class="stories-subtitle">View Tapzy stories from people, places, and events happening now.</div>

          </div>

        </div>



        ${

          groups.length

            ? `

            <div class="stories-profile-grid">

              ${groups.map((group) => profileStoryCard(group.profile, group.stories)).join("")}

            </div>

            `

            : `<div class="stories-empty">No active stories right now.</div>`

        }

      </section>

    </div>



    <style>

      .stories-wrap{

        max-width:1120px;

      }



      .stories-create-card,

      .stories-discover-card{

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



      .stories-discover-card{

        margin-top:18px;

      }



      .stories-kicker{

        color:#95a5bf;

        text-transform:uppercase;

        letter-spacing:4px;

        font-size:12px;

      }



      .stories-title{

        margin:10px 0 0 0;

        font-size:42px;

        line-height:1;

      }



      .stories-subtitle{

        margin-top:10px;

        max-width:680px;

        color:#bcc8d8;

        line-height:1.7;

        font-size:15px;

      }



      .stories-create-head,

      .stories-head-row{

        display:flex;

        justify-content:space-between;

        gap:16px;

        align-items:flex-start;

        flex-wrap:wrap;

      }



      .stories-create-form{

        margin-top:18px;

      }



      .stories-form-grid{

        display:grid;

        grid-template-columns:1fr 1fr;

        gap:14px;

      }



      .stories-field{

        display:flex;

        flex-direction:column;

        gap:8px;

      }



      .stories-field-full{

        grid-column:1 / -1;

      }



      .stories-field label{

        color:#fff;

        font-size:14px;

        font-weight:800;

      }



      .stories-field textarea,

      .stories-field input,

      .stories-field select{

        width:100%;

        min-height:52px;

        border-radius:18px;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(12,15,21,.98), rgba(4,6,10,1));

        color:#fff;

        padding:14px 16px;

        box-sizing:border-box;

        font-size:15px;

      }



      .stories-field textarea{

        min-height:130px;

        resize:vertical;

      }



      .stories-create-actions{

        margin-top:16px;

      }



      .stories-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:48px;

        padding:0 18px;

        border-radius:16px;

        text-decoration:none;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(18,21,31,.96), rgba(10,12,18,.98));

        color:#fff;

        font-size:14px;

        font-weight:800;

        cursor:pointer;

      }



      .stories-btn-bright{

        border:none;

        background:

          radial-gradient(circle at 50% 0%, rgba(150,230,255,.18), transparent 55%),

          linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));

      }



      .stories-profile-grid{

        display:grid;

        grid-template-columns:repeat(3, minmax(0, 1fr));

        gap:16px;

        margin-top:18px;

      }



      .stories-profile-card{

        position:relative;

        overflow:hidden;

        min-height:320px;

        border-radius:24px;

        border:1px solid rgba(255,255,255,.08);

        text-decoration:none;

        background:#0b0d14;

        box-shadow:0 16px 40px rgba(0,0,0,.28);

      }



      .stories-profile-preview{

        position:absolute;

        inset:0;

        overflow:hidden;

      }



      .stories-profile-preview-media{

        width:100%;

        height:100%;

        object-fit:cover;

        display:block;

      }



      .stories-profile-preview-fallback{

        width:100%;

        height:100%;

        display:flex;

        align-items:center;

        justify-content:center;

        font-size:34px;

        font-weight:900;

        color:#fff;

        background:

          radial-gradient(500px 300px at 50% 0%, rgba(125,214,255,.10), transparent 48%),

          linear-gradient(180deg, rgba(14,18,28,.96), rgba(8,10,16,.99));

      }



      .stories-profile-overlay{

        position:absolute;

        inset:0;

        background:linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.22) 35%, rgba(0,0,0,.76));

      }



      .stories-profile-meta{

        position:absolute;

        left:18px;

        right:18px;

        bottom:18px;

        z-index:2;

      }



      .stories-profile-age{

        color:#fff;

        font-size:18px;

        font-weight:900;

        line-height:1.1;

      }



      .stories-profile-handle{

        margin-top:8px;

        color:#dce7f6;

        font-size:14px;

        font-weight:500;

        line-height:1.2;

      }



      .stories-empty{

        margin-top:16px;

        padding:18px;

        border-radius:18px;

        border:1px solid rgba(255,255,255,.08);

        background:rgba(255,255,255,.03);

      }



      @media(max-width:900px){

        .stories-profile-grid{

          grid-template-columns:1fr 1fr;

        }

      }



      @media(max-width:700px){

        .stories-create-card,

        .stories-discover-card{

          padding:18px;

          border-radius:24px;

        }



        .stories-title{

          font-size:32px;

        }



        .stories-form-grid{

          grid-template-columns:1fr;

        }



        .stories-profile-grid{

          grid-template-columns:1fr;

        }



        .stories-profile-card{

          min-height:260px;

          border-radius:20px;

        }

      }

    </style>

    <script>
      (function(){
        function initVideoPreviewFrames(root){
          (root || document).querySelectorAll('[data-video-frame]').forEach(function(frame){
            if (frame.dataset.videoReady === '1') return;
            frame.dataset.videoReady = '1';
            const video = frame.querySelector('video');
            const preview = frame.querySelector('[data-video-preview]');
            if (!video || !preview) return;
            const markReady = function(){ frame.classList.add('is-ready'); };
            const markPlaying = function(){ frame.classList.add('is-playing'); frame.classList.add('is-ready'); };
            const markPaused = function(){ frame.classList.remove('is-playing'); };
            preview.addEventListener('click', function(){ video.play().catch(function(){}); });
            preview.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); video.play().catch(function(){}); } });
            video.addEventListener('loadeddata', markReady, { once: true });
            video.addEventListener('canplay', markReady, { once: true });
            video.addEventListener('play', markPlaying);
            video.addEventListener('playing', markPlaying);
            video.addEventListener('pause', markPaused);
            if (video.readyState >= 2) markReady();
          });
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', function(){ initVideoPreviewFrames(document); }, { once: true });
        } else {
          initVideoPreviewFrames(document);
        }
      })();
    </script>

    ${renderTapzyAssistant({

      username: currentProfile?.username || "User",

      pageType: "stories",

    })}

    `;



    res.send(

      renderShell("Stories", body, "", {

        currentProfile,

        pageTitle: "Stories",

        pageType: "stories",

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("Stories page error");

  }

});



router.post("/stories", upload.single("storyMedia"), async (req, res) => {

  try {

    const currentProfile = req.currentProfile;

    if (!currentProfile) return res.redirect("/auth");



    const text = String(req.body.text || "").trim() || null;

    const requestedType = String(req.body.type || "").trim().toLowerCase();

    const eventId = String(req.body.eventId || "").trim() || null;



    let mediaUrl = null;

    if (req.file) {

      mediaUrl = publicAbsoluteUrl(req, `/uploads/${req.file.filename}`);

    }



    let type = "text";

    if (requestedType === "video") type = "video";

    else if (requestedType === "image") type = "image";



    if (mediaUrl && isVideoUrl(mediaUrl)) type = "video";

    else if (mediaUrl && type !== "video") type = "image";



    const createdStory = await prisma.story.create({

      data: {

        profileId: currentProfile.id,

        eventId: eventId || null,

        type,

        mediaUrl,

        text,

        expiresAt: expiresIn24Hours(),

      },

    });

    const mentionedUsernames = extractMentions(text);
    if (mentionedUsernames.length) {
      const mentionedProfiles = await prisma.userProfile.findMany({
        where: { username: { in: mentionedUsernames } },
        select: { id: true, username: true },
      });

      await Promise.all(
        mentionedProfiles.map((profile) =>
          createNotification({
            profileId: profile.id,
            actorId: currentProfile.id,
            type: "story_mention",
            title: `${currentProfile.name || currentProfile.username || "Someone"} mentioned you in a story`,
            body: text ? String(text).trim().slice(0, 140) : "",
            link: currentProfile.username ? `/stories/${currentProfile.username}` : "/stories",
            entityType: "story",
            entityId: createdStory.id,
            image: String(currentProfile.photo || "").trim() || null,
            skipDuplicateWindow: false,
          })
        )
      );
    }

    res.redirect(backUrl(req, "/stories"));

  } catch (e) {

    console.error(e);

    res.status(500).send("Create story error");

  }

});



router.get("/stories/:username", async (req, res) => {

  try {

    const username = String(req.params.username || "").trim().toLowerCase();

    const currentProfile = req.currentProfile || null;

    const now = new Date();



    const profile = await prisma.userProfile.findUnique({

      where: { username },

    });



    if (!profile) return res.status(404).send("Profile not found");



    const stories = await prisma.story.findMany({

      where: {

        profileId: profile.id,

        expiresAt: { gt: now },

      },

      include: {

        event: true,

        views: currentProfile

          ? {

              where: { viewerId: currentProfile.id },

              select: { id: true },

            }

          : false,

      },

      orderBy: { createdAt: "asc" },

      take: 50,

    });



    if (!stories.length) {

      return res.send(

        renderShell(

          `@${profile.username} Stories`,

          `

          <div class="wrap" style="max-width:840px;">

            <div class="stories-empty-view">

              <h2 style="margin:0;">No active stories</h2>

              <div class="muted" style="margin-top:10px;">@${escapeHtml(profile.username || "user")} does not have any active stories right now.</div>

              <div style="margin-top:16px;">

                <a class="story-view-btn" href="/stories">Back to Stories</a>

              </div>

            </div>

          </div>

          <style>

            .stories-empty-view{

              padding:26px;

              border-radius:28px;

              border:1px solid rgba(255,255,255,.08);

              background:linear-gradient(180deg, rgba(10,12,18,.98), rgba(6,6,8,1));

            }

            .story-view-btn{

              display:inline-flex;

              align-items:center;

              justify-content:center;

              min-height:46px;

              padding:0 18px;

              border-radius:16px;

              text-decoration:none;

              border:1px solid rgba(255,255,255,.08);

              background:linear-gradient(180deg, rgba(18,21,31,.96), rgba(10,12,18,.98));

              color:#fff;

              font-size:14px;

              font-weight:800;

            }

          </style>

          `,

          "",

          {

            currentProfile,

            pageTitle: "Stories",

            pageType: "stories",

          }

        )

      );

    }



    if (currentProfile) {

      for (const story of stories) {

        if (!story.views || story.views.length) continue;

        try {

          await prisma.storyView.create({

            data: {

              storyId: story.id,

              viewerId: currentProfile.id,

            },

          });

        } catch (e) {

          if (e?.code !== "P2002") throw e;

        }

      }

    }



    const storyIds = stories.map((story) => story.id);

    const likeRows = currentProfile && storyIds.length
      ? await prisma.storyLike.findMany({
          where: { storyId: { in: storyIds } },
          select: { storyId: true, profileId: true },
        })
      : storyIds.length
        ? await prisma.storyLike.findMany({
            where: { storyId: { in: storyIds } },
            select: { storyId: true, profileId: true },
          })
        : [];

    const storyLikeCounts = new Map();
    const likedStoryIds = new Set();

    for (const row of likeRows) {
      storyLikeCounts.set(row.storyId, (storyLikeCounts.get(row.storyId) || 0) + 1);
      if (currentProfile && row.profileId === currentProfile.id) likedStoryIds.add(row.storyId);
    }

    const storyItems = stories

      .map((story, index) => {

        const media = story.mediaUrl

          ? isVideoUrl(story.mediaUrl)

            ? renderVideoFrame(story.mediaUrl, { className: "story-view-media", autoplay: true, muted: true, controls: true, preload: index === 0 ? "metadata" : "none", ariaLabel: "Play story video" })

            : `<img class="story-view-media" src="${escapeHtml(story.mediaUrl)}" alt="Story media" />`

          : `<div class="story-view-text-only">${escapeHtml(story.text || "@"+(profile.username || "user"))}</div>`;



        const eventPill = story.event

          ? `<a class="story-event-pill" href="/events#event-${escapeHtml(story.event.id)}">${escapeHtml(story.event.title)}</a>`

          : "";



        return `

        <div class="story-panel ${index === 0 ? "story-panel-active" : ""}" data-story-index="${index}">

          <div class="story-progress-wrap">

            ${stories

              .map(

                (_, i) =>

                  `<div class="story-progress-bar"><span class="story-progress-fill ${i === 0 ? "story-progress-fill-active" : ""}" data-progress-index="${i}"></span></div>`

              )

              .join("")}

          </div>



          <div class="story-header">

            <div class="story-header-left">

              <div class="story-header-handle">@${escapeHtml(profile.username || "user")}</div>

            </div>



            <div class="story-header-actions">

              ${

                currentProfile && currentProfile.id === profile.id

                  ? `

                  <form method="POST" action="/stories/${story.id}/delete" onsubmit="return confirm('Delete this story?');" style="margin:0;">

                    <button class="story-delete-btn" type="submit">Delete</button>

                  </form>

                  `

                  : ""

              }

              <a class="story-close-btn" href="/stories">Close</a>

            </div>

          </div>



          <div class="story-stage">

            ${media}

            <div class="story-stage-overlay"></div>



            <div class="story-stage-bottom">

              ${eventPill}

              ${story.text ? `<div class="story-caption">${escapeHtml(story.text)}</div>` : ""}

              <div class="story-social-row">
                ${
                  currentProfile
                    ? `<form method="POST" action="/stories/${escapeHtml(story.id)}/like" style="margin:0;">
                         <button class="story-like-btn" type="submit">${likedStoryIds.has(story.id) ? "Liked ✓" : "Like"}</button>
                       </form>`
                    : `<a class="story-like-btn" href="/auth">Like</a>`
                }
                <div class="story-like-count">${escapeHtml(String(storyLikeCounts.get(story.id) || 0))} like${(storyLikeCounts.get(story.id) || 0) === 1 ? "" : "s"}</div>
              </div>

            </div>

          </div>

        </div>

        `;

      })

      .join("");



    const replyForm = currentProfile

      ? `

      <form class="story-reply-form" method="POST" action="/stories/${escapeHtml(profile.username || "")}/reply">

        <input type="text" name="body" placeholder="Reply to story..." />

        <button type="submit">Send</button>

      </form>

      `

      : `<div class="story-reply-signin"><a href="/auth">Sign in</a> to reply.</div>`;



    const body = `

    <div class="wrap story-view-wrap">

      <div class="story-view-shell">

        ${storyItems}

        ${replyForm}

      </div>

    </div>



    <style>

      .story-view-wrap{

        max-width:780px;

      }



      .story-view-shell{

        position:relative;

        overflow:hidden;

        border-radius:32px;

        border:1px solid rgba(255,255,255,.08);

        background:#05070d;

        box-shadow:0 24px 70px rgba(0,0,0,.46);

      }



      .story-panel{

        display:none;

        position:relative;

        min-height:78vh;

      }



      .story-panel-active{

        display:block;

      }



      .story-progress-wrap{

        position:absolute;

        top:16px;

        left:16px;

        right:16px;

        z-index:5;

        display:grid;

        grid-template-columns:repeat(${stories.length}, minmax(0, 1fr));

        gap:8px;

      }



      .story-progress-bar{

        height:4px;

        border-radius:999px;

        background:rgba(255,255,255,.18);

        overflow:hidden;

      }



      .story-progress-fill{

        display:block;

        width:0%;

        height:100%;

        background:#fff;

      }



      .story-progress-fill-active{

        animation:storyProgress 7s linear forwards;

      }



      .story-header{

        position:absolute;

        top:34px;

        left:18px;

        right:18px;

        z-index:6;

        display:flex;

        justify-content:space-between;

        align-items:flex-start;

        gap:12px;

      }



      .story-header-left{

        min-width:0;

        flex:1;

        padding-right:10px;

        padding-top:4px;

      }



      .story-header-actions{

        display:flex;

        align-items:center;

        justify-content:flex-end;

        gap:8px;

        flex-wrap:nowrap;

        flex-shrink:0;

      }



      .story-header-handle{

        color:#fff;

        font-size:17px;

        font-weight:900;

        line-height:1.05;

        word-break:break-word;

        text-shadow:0 2px 10px rgba(0,0,0,.35);

      }



      .story-close-btn,

      .story-delete-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:40px;

        padding:0 14px;

        border-radius:14px;

        border:1px solid rgba(255,255,255,.10);

        background:rgba(10,12,18,.68);

        color:#fff;

        text-decoration:none;

        cursor:pointer;

        font-size:13px;

        font-weight:800;

        backdrop-filter:blur(10px);

        white-space:nowrap;

      }



      .story-stage{

        position:relative;

        min-height:78vh;

        overflow:hidden;

      }



      .tz-video-frame{

        position:relative;

        overflow:hidden;

        background:#05070d;

      }

      .tz-video-preview{

        position:absolute;

        inset:0;

        z-index:4;

        display:flex;

        align-items:center;

        justify-content:center;

        cursor:pointer;

        background:radial-gradient(circle at 50% 20%, rgba(52,116,255,.22), transparent 42%),linear-gradient(180deg, rgba(8,12,24,.96), rgba(3,5,12,.98));

        transition:opacity .22s ease, visibility .22s ease;

      }

      .tz-video-preview-blur{

        position:absolute;

        inset:0;

        backdrop-filter:blur(16px);

        -webkit-backdrop-filter:blur(16px);

      }

      .tz-video-preview-badge{

        position:relative;

        z-index:1;

        width:84px;

        height:84px;

        border-radius:999px;

        display:flex;

        align-items:center;

        justify-content:center;

        background:rgba(10,14,24,.72);

        border:1px solid rgba(255,255,255,.12);

        box-shadow:0 10px 28px rgba(0,0,0,.34);

        color:#fff;

        font-size:30px;

        line-height:1;

      }

      .tz-video-frame.is-ready .tz-video-preview,.tz-video-frame.is-playing .tz-video-preview{

        opacity:0;

        visibility:hidden;

        pointer-events:none;

      }

      .story-view-media,

      .story-view-text-only{

        width:100%;

        min-height:78vh;

        height:78vh;

        display:block;

        object-fit:cover;

        background:#0b0e16;

      }



      .story-view-text-only{

        display:flex;

        align-items:center;

        justify-content:center;

        padding:40px;

        text-align:center;

        color:#fff;

        font-size:28px;

        font-weight:900;

        line-height:1.3;

        background:

          radial-gradient(700px 260px at 50% 0%, rgba(127,210,255,.12), transparent 48%),

          linear-gradient(180deg, rgba(10,12,18,.98), rgba(6,6,8,1));

      }



      .story-stage-overlay{

        position:absolute;

        inset:0;

        background:linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.02) 28%, rgba(0,0,0,.36) 70%, rgba(0,0,0,.78));

        pointer-events:none;

      }



      .story-stage-bottom{

        position:absolute;

        left:18px;

        right:18px;

        bottom:18px;

        z-index:5;

        pointer-events:none;

      }



      .story-event-pill{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:34px;

        padding:0 12px;

        border-radius:999px;

        text-decoration:none;

        color:#fff;

        background:rgba(255,255,255,.12);

        border:1px solid rgba(255,255,255,.12);

        font-size:12px;

        font-weight:800;

        backdrop-filter:blur(10px);

        pointer-events:auto;

      }



      .story-caption{

        margin-top:12px;

        color:#fff;

        font-size:16px;

        line-height:1.65;

        max-width:92%;

      }



      .story-social-row{
        display:flex;
        align-items:center;
        gap:12px;
        margin-top:14px;
        flex-wrap:wrap;
      }

      .story-like-btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:36px;
        padding:0 14px;
        border-radius:999px;
        text-decoration:none;
        border:1px solid rgba(255,255,255,.12);
        background:rgba(255,255,255,.08);
        color:#fff;
        font-size:13px;
        font-weight:800;
        cursor:pointer;
      }

      .story-like-count{
        color:rgba(255,255,255,.78);
        font-size:13px;
        font-weight:700;
      }

      .story-reply-form{

        display:grid;

        grid-template-columns:1fr auto;

        gap:10px;

        padding:16px;

        border-top:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(10,12,18,.98), rgba(6,6,8,1));

      }



      .story-reply-form input{

        min-height:50px;

        border-radius:16px;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(12,15,21,.98), rgba(4,6,10,1));

        color:#fff;

        padding:0 14px;

        box-sizing:border-box;

      }



      .story-reply-form button{

        min-height:50px;

        padding:0 18px;

        border:none;

        border-radius:16px;

        color:#fff;

        font-size:14px;

        font-weight:800;

        cursor:pointer;

        background:

          radial-gradient(circle at 50% 0%, rgba(150,230,255,.18), transparent 55%),

          linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));

      }



      .story-reply-signin{

        padding:18px;

        border-top:1px solid rgba(255,255,255,.08);

        color:#d6e2f1;

      }



      .story-reply-signin a{

        color:#fff;

        font-weight:800;

      }



      @keyframes storyProgress{

        from{ width:0%; }

        to{ width:100%; }

      }



      @media(max-width:700px){

        .story-view-shell{

          border-radius:22px;

        }



        .story-panel,

        .story-stage,

        .story-view-media,

        .story-view-text-only{

          min-height:72vh;

          height:72vh;

        }



        .story-header{

          top:26px;

          left:12px;

          right:12px;

          gap:10px;

        }



        .story-header-left{

          padding-right:8px;

          padding-top:2px;

        }



        .story-header-handle{

          font-size:14px;

          line-height:1.05;

        }



        .story-close-btn,

        .story-delete-btn{

          min-height:34px;

          padding:0 11px;

          border-radius:12px;

          font-size:12px;

        }



        .story-caption{

          font-size:15px;

        }



        .story-social-row{
        display:flex;
        align-items:center;
        gap:12px;
        margin-top:14px;
        flex-wrap:wrap;
      }

      .story-like-btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:36px;
        padding:0 14px;
        border-radius:999px;
        text-decoration:none;
        border:1px solid rgba(255,255,255,.12);
        background:rgba(255,255,255,.08);
        color:#fff;
        font-size:13px;
        font-weight:800;
        cursor:pointer;
      }

      .story-like-count{
        color:rgba(255,255,255,.78);
        font-size:13px;
        font-weight:700;
      }

      .story-reply-form{

          grid-template-columns:1fr;

        }

      }

    </style>



    <script>

      (function(){

        const panels = Array.from(document.querySelectorAll(".story-panel"));

        const fills = Array.from(document.querySelectorAll(".story-progress-fill"));

        let index = 0;

        let timer = null;

        function initVideoPreviewFrames(root){
          (root || document).querySelectorAll('[data-video-frame]').forEach(function(frame){
            if (frame.dataset.videoReady === '1') return;
            frame.dataset.videoReady = '1';
            const video = frame.querySelector('video');
            const preview = frame.querySelector('[data-video-preview]');
            if (!video || !preview) return;
            const markReady = function(){ frame.classList.add('is-ready'); };
            const markPlaying = function(){ frame.classList.add('is-playing'); frame.classList.add('is-ready'); };
            const markPaused = function(){ frame.classList.remove('is-playing'); };
            preview.addEventListener('click', function(){ video.play().catch(function(){}); });
            preview.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); video.play().catch(function(){}); } });
            video.addEventListener('loadeddata', markReady, { once: true });
            video.addEventListener('canplay', markReady, { once: true });
            video.addEventListener('play', markPlaying);
            video.addEventListener('playing', markPlaying);
            video.addEventListener('pause', markPaused);
            if (video.readyState >= 2) markReady();
          });
        }



        function activate(nextIndex){

          if (nextIndex < 0 || nextIndex >= panels.length) return;



          panels.forEach((panel, i) => {

            panel.classList.toggle("story-panel-active", i === nextIndex);

          });



          fills.forEach((fill, i) => {

            fill.classList.remove("story-progress-fill-active");

            fill.style.width = i < nextIndex ? "100%" : "0%";

          });



          if (fills[nextIndex]) {

            void fills[nextIndex].offsetWidth;

            fills[nextIndex].classList.add("story-progress-fill-active");

          }



          index = nextIndex;



          if (timer) clearTimeout(timer);

          timer = setTimeout(function(){

            if (index + 1 < panels.length) activate(index + 1);

          }, 7000);

        }



        document.addEventListener("click", function(e){

          const shell = document.querySelector(".story-view-shell");

          if (!shell) return;



          const interactive = e.target.closest(

            "video, .story-close-btn, .story-delete-btn, .story-reply-form, input, button, a"

          );

          if (interactive) return;



          const bounds = shell.getBoundingClientRect();

          const x = e.clientX - bounds.left;



          if (x < bounds.width * 0.35) {

            if (index > 0) activate(index - 1);

          } else if (x > bounds.width * 0.65) {

            if (index + 1 < panels.length) activate(index + 1);

          }

        });



        initVideoPreviewFrames(document);

        activate(0);

      })();

    </script>



    ${renderTapzyAssistant({

      username: currentProfile?.username || "User",

      pageType: "stories",

    })}

    `;



    res.send(

      renderShell(`@${profile.username} Stories`, body, "", {

        currentProfile,

        pageTitle: "Stories",

        pageType: "stories",

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("Story viewer error");

  }

});



router.post("/stories/:id/delete", async (req, res) => {

  try {

    const currentProfile = req.currentProfile;

    if (!currentProfile) return res.redirect("/auth");



    const storyId = String(req.params.id || "").trim();



    const story = await prisma.story.findUnique({

      where: { id: storyId },

      select: { id: true, profileId: true },

    });



    if (!story) return res.redirect(backUrl(req, "/stories"));

    if (story.profileId !== currentProfile.id) {

      return res.status(403).send("Not allowed");

    }



    await prisma.story.delete({

      where: { id: storyId },

    });



    res.redirect(backUrl(req, "/stories"));

  } catch (e) {

    console.error(e);

    res.status(500).send("Delete story error");

  }

});



router.post("/stories/:username/reply", async (req, res) => {

  try {

    const currentProfile = req.currentProfile;

    if (!currentProfile) return res.redirect("/auth");



    const username = String(req.params.username || "").trim().toLowerCase();

    const body = String(req.body.body || "").trim();



    if (!body) return res.redirect(backUrl(req, `/stories/${username}`));



    const profile = await prisma.userProfile.findUnique({

      where: { username },

    });



    if (!profile) return res.status(404).send("Profile not found");



    const story = await prisma.story.findFirst({

      where: {

        profileId: profile.id,

        expiresAt: { gt: new Date() },

      },

      orderBy: { createdAt: "desc" },

    });



    if (!story) return res.redirect(backUrl(req, `/stories/${username}`));



    const reply = await prisma.storyReply.create({

      data: {

        storyId: story.id,

        senderProfileId: currentProfile.id,

        body,

      },

    });

    await createNotification({
      profileId: profile.id,
      actorId: currentProfile.id,
      type: "story_reply",
      title: `${currentProfile.name || currentProfile.username || "Someone"} replied to your story`,
      body,
      link: `/stories/${username}`,
      entityType: "story",
      entityId: story.id,
      image: String(currentProfile.photo || "").trim() || null,
      skipDuplicateWindow: false,
    });



    res.redirect(backUrl(req, `/stories/${username}`));

  } catch (e) {

    console.error(e);

    res.status(500).send("Story reply error");

  }

});



router.post("/stories/:id/like", async (req, res) => {
  try {
    const currentProfile = req.currentProfile;
    if (!currentProfile) return res.redirect("/auth");

    const storyId = String(req.params.id || "").trim();
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      include: {
        profile: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!story) return res.status(404).send("Story not found");

    const existing = await prisma.storyLike.findFirst({
      where: { storyId, profileId: currentProfile.id },
      select: { id: true },
    });

    if (existing) {
      await prisma.storyLike.delete({ where: { id: existing.id } });
    } else {
      await prisma.storyLike.create({
        data: {
          storyId,
          profileId: currentProfile.id,
        },
      });

      await createNotification({
        profileId: story.profileId,
        actorId: currentProfile.id,
        type: "story_like",
        title: `${currentProfile.name || currentProfile.username || "Someone"} liked your story`,
        body: story.text ? String(story.text).trim().slice(0, 120) : "",
        link: story.profile?.username ? `/stories/${story.profile.username}` : "/stories",
        entityType: "story",
        entityId: story.id,
        image: String(currentProfile.photo || "").trim() || null,
        skipDuplicateWindow: true,
      });
    }

    const fallback = story.profile?.username ? `/stories/${story.profile.username}` : "/stories";
    return res.redirect(backUrl(req, fallback));
  } catch (e) {
    console.error(e);
    return res.status(500).send("Story like error");
  }
});

module.exports = router;

