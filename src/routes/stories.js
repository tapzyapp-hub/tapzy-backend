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

    <section class="stories-create-card tapzy-premium-card">

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

  <section class="stories-create-card tapzy-premium-card">

    <div class="stories-create-head">

      <div>

        <div class="stories-kicker">Tapzy Stories</div>

        <h2 class="stories-title">Create a story</h2>

        <div class="stories-subtitle">Post quick updates, event plans, or live moments. Stories expire after 24 hours.</div>

      </div>

    </div>



    <form class="stories-create-form" method="POST" action="/stories" enctype="multipart/form-data" data-story-composer>

      <div class="stories-form-grid stories-form-grid-premium">

        <div class="stories-field stories-field-full">

          <label>Caption</label>

          <textarea name="text" maxlength="280" placeholder="What’s happening? Going somewhere tonight? At an event right now?"></textarea>

          <div class="stories-caption-meter"><span data-caption-count>0</span>/280</div>

        </div>



        <div class="stories-field stories-media-field">

          <label>Media</label>

          <label class="stories-upload-drop">

            <input type="file" name="storyMedia" accept="image/*,video/*,.heic,.heif,.mov,.mp4,.webm" />

            <span class="stories-upload-icon">＋</span>

            <span class="stories-upload-title">Add photo or video</span>

            <span class="stories-upload-subtitle" data-upload-label>Photos or videos · duration is not limited</span>

          </label>

        </div>



        <div class="stories-preview-card" data-story-preview>

          <div class="stories-preview-empty">Preview appears here</div>

        </div>



        <input type="hidden" name="type" value="text" />



        <div class="stories-field stories-field-full">

          <label>Add event (optional)</label>

          <select name="eventId" data-story-event-select>

            <option value="">No event</option>

            ${upcomingEvents

              .map(

                (event) =>

                  `<option value="${escapeHtml(event.id)}">Going: ${escapeHtml(event.title)}${

                    event.city ? " • " + escapeHtml(event.city) : ""

                  }</option>`

              )

              .join("")}

            <option value="__other__">Other event not in Tapzy</option>

          </select>

          <div class="stories-event-hint">Only events marked Going show here. Use Other to add something manually.</div>

          <div class="stories-manual-event" data-manual-event hidden>
            <input name="manualEventTitle" maxlength="120" placeholder="Event name" />
            <input name="manualEventLocation" maxlength="160" placeholder="Location / venue / address" data-manual-event-location />
            <div class="stories-manual-row">
              <button class="stories-mini-btn" type="button" data-use-location>Use my location</button>
              <span class="stories-location-status" data-location-status></span>
            </div>
            <input type="hidden" name="manualEventLat" data-manual-event-lat />
            <input type="hidden" name="manualEventLng" data-manual-event-lng />
          </div>

        </div>

      </div>



      <div class="stories-create-actions">

        <button class="stories-btn stories-btn-bright" type="submit" data-story-submit>Post Story</button>

        <span class="stories-post-status" data-story-status></span>

      </div>

    </form>

  </section>

  `;

}
function profileStoryCard(profile, stories, currentProfile) {

  const firstStory = stories[0];

  const previewUrl = firstStory?.mediaUrl || "";

  const previewIsVideo = isVideoUrl(previewUrl);



  const mediaHtml = previewUrl

    ? previewIsVideo

      ? `<video class="stories-profile-preview-media" src="${escapeHtml(previewUrl)}" muted playsinline></video>`

      : `<img class="stories-profile-preview-media" src="${escapeHtml(previewUrl)}" alt="${escapeHtml(profile.username || "story")}" loading="lazy" decoding="async" />`

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



  const isOwnStory = !!(currentProfile && (String(currentProfile.id || "") === String(profile.id || "") || String(currentProfile.username || "").toLowerCase() === String(profile.username || "").toLowerCase()));

  const storyOwnerLabel = isOwnStory ? "Your Story" : `@${profile.username || profile.name || "user"}`;

  return `

  <a class="stories-profile-card" href="/stories/${escapeHtml(profile.username || "")}">

    <div class="stories-profile-preview">

      ${mediaHtml}

      <div class="stories-profile-overlay"></div>

    </div>

    <div class="stories-profile-meta">

      <div class="stories-profile-age">${escapeHtml(ageLabel)}</div>

      <div class="stories-profile-handle">${escapeHtml(storyOwnerLabel)}</div>

    </div>

  </a>

  `;

}

function compactFeedCount(value) {
  const count = Math.max(0, Number(value) || 0);
  if (count >= 1000000) return `${(count / 1000000).toFixed(count >= 10000000 ? 0 : 1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K`;
  return String(count);
}

function tapzyMarkImg(className = "tapzy-mark") {
  return `<img class="${escapeHtml(className)}" src="/images/tapzy-mark-white.png" alt="" aria-hidden="true" decoding="async" />`;
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

      const goingRows = await prisma.eventAttendance.findMany({

        where: {

          profileId: currentProfile.id,

          status: "going",

          event: {

            OR: [{ startAt: null }, { startAt: { gte: now } }],

          },

        },

        include: { event: true },

        orderBy: [{ updatedAt: "desc" }],

        take: 30,

      });

      upcomingEvents = goingRows
        .map((row) => row.event)
        .filter(Boolean)
        .sort((a, b) => {
          const at = a.startAt ? new Date(a.startAt).getTime() : Number.MAX_SAFE_INTEGER;
          const bt = b.startAt ? new Date(b.startAt).getTime() : Number.MAX_SAFE_INTEGER;
          return at - bt;
        })
        .slice(0, 20);

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

          <a class="stories-btn stories-btn-bright" href="/stories/feed">Open story feed</a>

        </div>



        ${

          groups.length

            ? `

            <div class="stories-profile-grid">

              ${groups.map((group) => profileStoryCard(group.profile, group.stories, currentProfile)).join("")}

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


      .tapzy-premium-card::before{
        content:"";
        position:absolute;
        inset:-45% -25% auto -25%;
        height:260px;
        background:radial-gradient(circle, rgba(70,160,255,.18), transparent 64%);
        pointer-events:none;
      }

      .stories-create-card{
        isolation:isolate;
      }

      .stories-create-card > *,
      .stories-discover-card > *{
        position:relative;
        z-index:1;
      }

      .stories-form-grid-premium{
        grid-template-columns:minmax(0, 1.1fr) minmax(260px, .9fr);
        align-items:stretch;
      }

      .stories-caption-meter{
        align-self:flex-end;
        color:rgba(220,231,246,.58);
        font-size:12px;
        font-weight:800;
        letter-spacing:.5px;
      }

      .stories-upload-drop{
        min-height:160px;
        border-radius:22px;
        border:1px dashed rgba(160,190,230,.22);
        background:
          radial-gradient(circle at 50% 0%, rgba(125,214,255,.10), transparent 60%),
          linear-gradient(180deg, rgba(12,15,21,.98), rgba(4,6,10,1));
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:8px;
        cursor:pointer;
        text-align:center;
        padding:18px;
        transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease;
      }

      .stories-upload-drop:hover{
        transform:translateY(-1px);
        border-color:rgba(150,220,255,.42);
        box-shadow:0 16px 40px rgba(0,0,0,.22), 0 0 30px rgba(70,160,255,.08);
      }

      .stories-upload-drop input{
        display:none;
      }

      .stories-upload-icon{
        width:54px;
        height:54px;
        border-radius:18px;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:28px;
        color:#fff;
        background:linear-gradient(180deg, rgba(42,94,210,.94), rgba(18,43,98,.98));
        box-shadow:0 14px 35px rgba(36,100,255,.22);
      }

      .stories-upload-title{
        color:#fff;
        font-weight:900;
        font-size:15px;
      }

      .stories-upload-subtitle,
      .stories-post-status{
        color:#96a5bd;
        font-size:12px;
        font-weight:700;
      }

      .stories-preview-card{
        min-height:220px;
        border-radius:24px;
        border:1px solid rgba(255,255,255,.08);
        background:
          linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.015)),
          #070a10;
        overflow:hidden;
        display:flex;
        align-items:center;
        justify-content:center;
        color:#9eabc0;
        font-size:13px;
        font-weight:800;
      }

      .stories-preview-card img,
      .stories-preview-card video{
        width:100%;
        height:100%;
        min-height:220px;
        object-fit:cover;
        display:block;
      }


      .stories-event-hint{
        margin-top:8px;
        color:#91a1b8;
        font-size:12px;
        font-weight:700;
      }

      .stories-manual-event{
        margin-top:12px;
        display:grid;
        gap:10px;
      }

      .stories-manual-event[hidden]{
        display:none;
      }

      .stories-manual-event input{
        width:100%;
        min-height:44px;
        border-radius:14px;
        border:1px solid rgba(255,255,255,.08);
        background:linear-gradient(180deg, rgba(12,15,21,.98), rgba(4,6,10,1));
        color:#fff;
        padding:0 14px;
        box-sizing:border-box;
        font-size:14px;
      }

      .stories-manual-row{
        display:flex;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;
      }

      .stories-mini-btn{
        min-height:34px;
        padding:0 12px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.07);
        color:#fff;
        font-size:12px;
        font-weight:850;
        cursor:pointer;
      }

      .stories-location-status{
        color:#96a5bd;
        font-size:12px;
        font-weight:700;
      }

      .stories-profile-card::after{
        content:"";
        position:absolute;
        inset:0;
        border-radius:inherit;
        box-shadow:inset 0 0 0 1px rgba(255,255,255,.06), inset 0 0 40px rgba(86,170,255,.08);
        pointer-events:none;
      }

      .stories-profile-card{
        transform:translateZ(0);
      }

      @media(max-width:520px){
        .stories-create-card{
          padding:16px;
          overflow:hidden;
        }

        .stories-form-grid-premium,
        .stories-form-grid{
          display:grid;
          grid-template-columns:minmax(0, 1fr) !important;
          gap:14px;
        }

        .stories-field,
        .stories-media-field,
        .stories-preview-card{
          min-width:0;
          width:100%;
          grid-column:1 / -1;
        }

        .stories-upload-drop{
          min-height:132px;
          width:100%;
          box-sizing:border-box;
          border-radius:20px;
          padding:16px;
        }

        .stories-preview-card{
          min-height:190px;
          border-radius:22px;
        }

        .stories-field textarea,
        .stories-field select{
          font-size:16px;
        }

        .stories-create-actions{
          margin-top:14px;
        }

        .stories-create-actions .stories-btn{
          min-height:38px;
          padding:0 13px;
          border-radius:13px;
          font-size:13px;
          width:auto;
        }
      }

    </style>




    <script>
      (function(){
        const form = document.querySelector('[data-story-composer]');
        if (!form) return;
        const textarea = form.querySelector('textarea[name="text"]');
        const count = form.querySelector('[data-caption-count]');
        const file = form.querySelector('input[name="storyMedia"]');
        const label = form.querySelector('[data-upload-label]');
        const preview = form.querySelector('[data-story-preview]');
        const status = form.querySelector('[data-story-status]');
        const submit = form.querySelector('[data-story-submit]');
        const eventSelect = form.querySelector('[data-story-event-select]');
        const manualEvent = form.querySelector('[data-manual-event]');
        const useLocation = form.querySelector('[data-use-location]');
        const locationStatus = form.querySelector('[data-location-status]');
        const manualLocationInput = form.querySelector('[data-manual-event-location]');
        const manualLatInput = form.querySelector('[data-manual-event-lat]');
        const manualLngInput = form.querySelector('[data-manual-event-lng]');

        function updateCount(){
          if (count && textarea) count.textContent = String((textarea.value || '').length);
        }

        if (textarea) {
          textarea.addEventListener('input', updateCount, { passive:true });
          updateCount();
        }

        let activePreviewUrl = null;

        function clearPreviewUrl(){
          if (activePreviewUrl && window.URL && URL.revokeObjectURL) {
            try { URL.revokeObjectURL(activePreviewUrl); } catch (e) {}
          }
          activePreviewUrl = null;
        }

        function renderPreview(selected){
          if (!preview || !selected) return;
          clearPreviewUrl();

          const type = selected.type || '';
          const name = (selected.name || '').toLowerCase();
          const isVideo = type.indexOf('video/') === 0 || /\.(mov|mp4|webm|m4v)$/i.test(name);

          if (isVideo) {
            activePreviewUrl = URL.createObjectURL(selected);
            preview.innerHTML = '<video src="' + activePreviewUrl + '" muted playsinline webkit-playsinline preload="metadata" controls></video>';
            const video = preview.querySelector('video');
            if (video && video.load) video.load();
            return;
          }

          const reader = new FileReader();
          reader.onload = function(e){
            const src = e && e.target ? e.target.result : '';
            if (!src) return;
            preview.innerHTML = '<img src="' + src + '" alt="Story preview" loading="eager" decoding="async" />';
          };
          reader.onerror = function(){
            activePreviewUrl = URL.createObjectURL(selected);
            preview.innerHTML = '<img src="' + activePreviewUrl + '" alt="Story preview" loading="eager" decoding="async" />';
          };
          reader.readAsDataURL(selected);
        }

        if (file) {
          file.addEventListener('change', function(){
            const selected = file.files && file.files[0];
            if (!selected) return;
            if (label) label.textContent = selected.name || 'Media selected';
            renderPreview(selected);
          });
        }

        function syncManualEvent(){
          if (!manualEvent || !eventSelect) return;
          manualEvent.hidden = eventSelect.value !== '__other__';
        }

        if (eventSelect) {
          eventSelect.addEventListener('change', syncManualEvent);
          syncManualEvent();
        }

        if (useLocation) {
          useLocation.addEventListener('click', function(){
            if (!navigator.geolocation) {
              if (locationStatus) locationStatus.textContent = 'Location is not available on this device.';
              return;
            }
            if (locationStatus) locationStatus.textContent = 'Getting location…';
            navigator.geolocation.getCurrentPosition(function(pos){
              const lat = pos && pos.coords ? pos.coords.latitude : null;
              const lng = pos && pos.coords ? pos.coords.longitude : null;
              if (manualLatInput && lat != null) manualLatInput.value = String(lat);
              if (manualLngInput && lng != null) manualLngInput.value = String(lng);
              if (manualLocationInput && !manualLocationInput.value && lat != null && lng != null) {
                manualLocationInput.value = 'Current location: ' + lat.toFixed(5) + ', ' + lng.toFixed(5);
              }
              if (locationStatus) locationStatus.textContent = 'Location added.';
            }, function(){
              if (locationStatus) locationStatus.textContent = 'Location permission was not enabled.';
            }, { enableHighAccuracy:true, timeout:8000, maximumAge:60000 });
          });
        }

        form.addEventListener('submit', function(){
          if (status) status.textContent = 'Preparing story…';
          if (submit) {
            submit.disabled = true;
            submit.textContent = 'Posting…';
          }
        });
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

    let eventId = String(req.body.eventId || "").trim() || null;
    const manualEventTitle = String(req.body.manualEventTitle || "").trim();
    const manualEventLocation = String(req.body.manualEventLocation || "").trim();
    const manualEventLatRaw = String(req.body.manualEventLat || "").trim();
    const manualEventLngRaw = String(req.body.manualEventLng || "").trim();

    if (eventId === "__other__") {
      eventId = null;
      if (manualEventTitle) {
        const lat = Number.parseFloat(manualEventLatRaw);
        const lng = Number.parseFloat(manualEventLngRaw);
        const manualEvent = await prisma.eventFinderItem.create({
          data: {
            source: "manual-story",
            sourceEventId: `${currentProfile.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: manualEventTitle.slice(0, 120),
            venueName: manualEventLocation ? manualEventLocation.slice(0, 160) : null,
            address: manualEventLocation ? manualEventLocation.slice(0, 160) : null,
            latitude: Number.isFinite(lat) ? lat : null,
            longitude: Number.isFinite(lng) ? lng : null,
            startAt: new Date(),
            rawPayload: { manual: true, createdFrom: "story-composer", profileId: currentProfile.id },
          },
        });
        await prisma.eventAttendance.upsert({
          where: { profileId_eventId: { profileId: currentProfile.id, eventId: manualEvent.id } },
          update: { status: "going" },
          create: { profileId: currentProfile.id, eventId: manualEvent.id, status: "going" },
        });
        eventId = manualEvent.id;
      }
    } else if (eventId) {
      const goingEvent = await prisma.eventAttendance.findFirst({
        where: { profileId: currentProfile.id, eventId, status: "going" },
        select: { id: true },
      });
      if (!goingEvent) eventId = null;
    }

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

router.get("/stories/feed", async (req, res) => {
  try {
    const currentProfile = req.currentProfile || null;
    const now = new Date();
    const followingIds = new Set();

    if (currentProfile) {
      const following = await prisma.follow.findMany({
        where: { followerProfileId: currentProfile.id },
        select: { followingProfileId: true },
      });
      following.forEach((row) => followingIds.add(row.followingProfileId));
    }

    const stories = await prisma.story.findMany({
      where: { expiresAt: { gt: now } },
      include: {
        profile: true,
        event: true,
        _count: { select: { likes: true, replies: true, views: true } },
        likes: currentProfile
          ? { where: { profileId: currentProfile.id }, select: { id: true } }
          : false,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
    });

    if (currentProfile && stories.length) {
      const unseen = await prisma.storyView.findMany({
        where: {
          viewerId: currentProfile.id,
          storyId: { in: stories.map((story) => story.id) },
        },
        select: { storyId: true },
      });
      const seenIds = new Set(unseen.map((row) => row.storyId));
      const viewRows = stories
        .filter((story) => !seenIds.has(story.id))
        .map((story) => ({ storyId: story.id, viewerId: currentProfile.id }));
      if (viewRows.length) {
        await prisma.storyView.createMany({ data: viewRows, skipDuplicates: true });
      }
    }

    const slides = stories.map((story, index) => {
      const profile = story.profile || {};
      const username = profile.username || "tapzy";
      const displayName = profile.name || `@${username}`;
      const isVideo = story.mediaUrl && isVideoUrl(story.mediaUrl);
      const isFollowing =
        currentProfile &&
        (currentProfile.id === story.profileId || followingIds.has(story.profileId));
      const liked = !!(currentProfile && story.likes && story.likes.length);
      const avatar = profile.photo
        ? `<img src="${escapeHtml(profile.photo)}" alt="" />`
        : `<span>${escapeHtml((displayName[0] || "T").toUpperCase())}</span>`;
      const media = story.mediaUrl
        ? isVideo
          ? `<video class="sf-media" src="${escapeHtml(story.mediaUrl)}" muted loop playsinline webkit-playsinline preload="${index < 2 ? "auto" : "metadata"}"></video>`
          : `<img class="sf-media" src="${escapeHtml(story.mediaUrl)}" alt="${escapeHtml(story.text || `${displayName}'s story`)}" loading="${index < 2 ? "eager" : "lazy"}" decoding="async" />`
        : `<div class="sf-text-story"><span>${escapeHtml(story.text || `${displayName}'s story`)}</span></div>`;
      const eventLabel = story.event?.title
        ? `<a class="sf-event" href="/events#event-${escapeHtml(story.event.id)}">${escapeHtml(story.event.title)}</a>`
        : "";
      const ageHours = Math.max(0, Math.floor((Date.now() - new Date(story.createdAt).getTime()) / 3600000));
      const age = ageHours < 1 ? "Just now" : `${ageHours}h`;

      return `
      <article class="sf-slide" data-story="${escapeHtml(story.id)}" data-following="${isFollowing ? "1" : "0"}" data-event="${story.event ? "1" : "0"}">
        <div class="sf-media-wrap">${media}<div class="sf-shade"></div></div>

        <div class="sf-copy">
          ${eventLabel}
          <a class="sf-author" href="/u/${escapeHtml(username)}">${escapeHtml(displayName)}</a>
          ${story.text ? `<p>${escapeHtml(story.text)}</p>` : ""}
          <div class="sf-meta">${escapeHtml(age)} · Tapzy Story</div>
        </div>

        <aside class="sf-actions" aria-label="Story actions">
          <a class="sf-avatar" href="/u/${escapeHtml(username)}">${avatar}</a>
          <form method="POST" action="/stories/${escapeHtml(story.id)}/like" class="sf-action-form">
            <button class="sf-action ${liked ? "is-active" : ""}" type="submit" aria-label="${liked ? "Unlike" : "Like"} story">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.7-9C.7 8.8 2.2 5 6 4.4c2.2-.3 4.1.8 5 2.2.9-1.4 2.8-2.5 5-2.2 3.8.6 5.3 4.4 3.7 7.6C17.5 16.4 12 21 12 21Z"/></svg>
              <span>${compactFeedCount(story._count.likes)}</span>
            </button>
          </form>
          <a class="sf-action" href="/stories/${escapeHtml(username)}#reply" aria-label="Reply to story">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z"/></svg>
            <span>${compactFeedCount(story._count.replies)}</span>
          </a>
          <button class="sf-action sf-save" type="button" data-save="${escapeHtml(story.id)}" aria-label="Save story">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4V3Z"/></svg>
            <span>Save</span>
          </button>
          <button class="sf-action" type="button" data-share="/stories/${escapeHtml(username)}" aria-label="Share story">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 16-8-6 16-3-6-7-2Zm7 2 9-10"/></svg>
            <span>Share</span>
          </button>
          ${isVideo ? `
          <button class="sf-sound" type="button" data-sound aria-label="Turn sound on">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12-1c1.4 1.2 1.4 6.8 0 8m3-11c3 3 3 11 0 14"/></svg>
          </button>` : ""}
        </aside>
      </article>`;
    }).join("");

    const profileHref = currentProfile?.username ? `/u/${currentProfile.username}` : "/auth";
    const emptyMessage = stories.length
      ? ""
      : `<div class="sf-empty"><div class="sf-empty-mark">${tapzyMarkImg("tapzy-mark tapzy-mark-empty")}</div><h1>No live stories yet</h1><p>Be the first to share what is happening.</p><a href="/stories">Post a story</a></div>`;

    res.send(`<!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="theme-color" content="#000000" />
      <title>Story Feed · Tapzy</title>
      <style>
        :root{color-scheme:dark;--safe-top:env(safe-area-inset-top,0px);--safe-bottom:env(safe-area-inset-bottom,0px)}
        *{box-sizing:border-box}
        html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        button,a{font:inherit;-webkit-tap-highlight-color:transparent}
        button{color:inherit}
        .sf-app{position:relative;width:100%;height:100%;background:#000;overflow:hidden}
        .sf-feed{height:100%;overflow-y:auto;scroll-snap-type:y mandatory;overscroll-behavior-y:contain;scrollbar-width:none}
        .sf-feed::-webkit-scrollbar{display:none}
        .sf-slide{position:relative;width:100%;height:100%;min-height:100%;scroll-snap-align:start;scroll-snap-stop:always;background:#090909;overflow:hidden}
        .sf-slide[hidden]{display:none}
        .sf-media-wrap,.sf-media,.sf-shade{position:absolute;inset:0;width:100%;height:100%}
        .sf-media{object-fit:cover;background:#111}
        .sf-shade{pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.42) 0,transparent 24%,transparent 54%,rgba(0,0,0,.12) 65%,rgba(0,0,0,.9) 100%)}
        .sf-text-story{position:absolute;inset:0;display:grid;place-items:center;padding:52px 44px 180px;background:radial-gradient(circle at 30% 20%,#27376b 0,#14172a 35%,#06070c 78%);font-size:clamp(28px,7vw,48px);font-weight:850;line-height:1.08;text-align:center}
        .sf-top{position:fixed;z-index:20;top:0;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:26px;padding:calc(var(--safe-top) + 18px) 58px 16px;background:linear-gradient(180deg,rgba(0,0,0,.54),transparent)}
        .sf-brand{position:absolute;left:16px;top:calc(var(--safe-top) + 16px);display:grid;place-items:center;width:38px;height:38px;border:2px solid rgba(255,255,255,.9);border-radius:12px;color:#fff;text-decoration:none;background:rgba(3,6,12,.24);box-shadow:0 10px 26px rgba(0,0,0,.22);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
        .tapzy-mark{display:block;width:72%;height:72%;object-fit:contain}
        .sf-tabs{display:flex;gap:22px;align-items:center}
        .sf-tab{position:relative;border:0;background:none;padding:8px 0;color:rgba(255,255,255,.68);font-weight:750;font-size:15px;cursor:pointer}
        .sf-tab.is-active{color:#fff}
        .sf-tab.is-active::after{content:"";position:absolute;left:50%;bottom:-5px;width:26px;height:3px;border-radius:5px;background:#fff;transform:translateX(-50%)}
        .sf-search{position:absolute;right:15px;top:calc(var(--safe-top) + 16px);width:40px;height:40px;border:0;background:none;padding:7px;cursor:pointer}
        .sf-search svg,.sf-action svg,.sf-sound svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        .sf-copy{position:absolute;z-index:4;left:18px;right:92px;bottom:calc(var(--safe-bottom) + 82px);text-shadow:0 2px 12px rgba(0,0,0,.7)}
        .sf-author{display:block;width:max-content;max-width:100%;margin-bottom:8px;color:#fff;text-decoration:none;font-size:17px;font-weight:850}
        .sf-copy p{margin:0 0 8px;font-size:15px;line-height:1.35}
        .sf-meta{font-size:13px;color:rgba(255,255,255,.8)}
        .sf-event{display:inline-flex;margin-bottom:11px;padding:7px 10px;border-radius:9px;background:rgba(12,18,35,.64);backdrop-filter:blur(12px);color:#fff;text-decoration:none;font-size:12px;font-weight:800;border:1px solid rgba(255,255,255,.18)}
        .sf-actions{position:absolute;z-index:5;right:10px;bottom:calc(var(--safe-bottom) + 76px);display:flex;flex-direction:column;align-items:center;gap:16px;width:62px}
        .sf-avatar{width:48px;height:48px;border:2px solid #fff;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#1f55d5;color:#fff;text-decoration:none;font-weight:900}
        .sf-avatar img{width:100%;height:100%;object-fit:cover}
        .sf-action-form{margin:0}
        .sf-action{display:flex;flex-direction:column;align-items:center;gap:3px;width:58px;padding:0;border:0;background:none;color:#fff;text-decoration:none;font-size:12px;font-weight:700;cursor:pointer;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))}
        .sf-action svg{width:34px;height:34px;fill:#fff;stroke:#fff}
        .sf-action.is-active svg{fill:#ff315f;stroke:#ff315f}
        .sf-save.is-saved svg{fill:#2f76ff;stroke:#fff}
        .sf-sound{width:43px;height:43px;border-radius:50%;border:2px solid rgba(255,255,255,.65);background:rgba(0,0,0,.4);padding:10px;cursor:pointer}
        .sf-bottom{position:fixed;z-index:20;left:0;right:0;bottom:0;height:calc(64px + var(--safe-bottom));padding:7px 10px var(--safe-bottom);display:flex;align-items:center;justify-content:space-around;background:#030303;border-top:1px solid rgba(255,255,255,.08)}
        .sf-nav{min-width:55px;display:flex;flex-direction:column;align-items:center;gap:2px;color:rgba(255,255,255,.72);text-decoration:none;font-size:10px;font-weight:650}
        .sf-nav.is-active{color:#fff}
        .sf-nav svg{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        .sf-create{width:56px;height:38px;display:grid;place-items:center;border:2px solid #fff;border-radius:11px;background:linear-gradient(145deg,#2f76ff,#1145ad);color:#fff;text-decoration:none;font-size:29px;font-weight:900;line-height:1;box-shadow:0 5px 18px rgba(35,102,231,.42)}
        .sf-empty{height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:30px;text-align:center;background:radial-gradient(circle at 50% 30%,#172753,#07080c 54%,#000)}
        .sf-empty-mark{position:relative;display:grid;place-items:center;width:74px;height:74px;border-radius:24px;background:linear-gradient(145deg,#2f76ff,#1145ad);color:#fff;box-shadow:0 18px 44px rgba(35,102,231,.34),inset 0 1px 0 rgba(255,255,255,.16);animation:sfLogoPulse 2.25s ease-in-out infinite;will-change:transform,box-shadow}
        .sf-empty-mark::before{content:"";position:absolute;inset:-12px;border-radius:32px;background:radial-gradient(circle,rgba(47,118,255,.36),rgba(47,118,255,0) 70%);animation:sfLogoHalo 2.25s ease-out infinite;z-index:-1}
        .sf-empty-mark::after{content:"";position:absolute;inset:0;border-radius:24px;background:linear-gradient(135deg,rgba(255,255,255,.22),rgba(255,255,255,0) 45%);pointer-events:none}
        .tapzy-mark-empty{width:66%;height:66%;filter:drop-shadow(0 3px 8px rgba(0,0,0,.22));animation:sfLogoInnerPulse 2.25s ease-in-out infinite}
        @keyframes sfLogoPulse{0%,100%{transform:scale(1);box-shadow:0 18px 44px rgba(35,102,231,.34),inset 0 1px 0 rgba(255,255,255,.16)}50%{transform:scale(1.075);box-shadow:0 22px 62px rgba(35,102,231,.58),0 0 32px rgba(79,145,255,.38),inset 0 1px 0 rgba(255,255,255,.22)}}
        @keyframes sfLogoHalo{0%{opacity:.48;transform:scale(.86)}60%{opacity:.16;transform:scale(1.32)}100%{opacity:0;transform:scale(1.45)}}
        @keyframes sfLogoInnerPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}
        .sf-empty h1{margin:22px 0 8px;font-size:clamp(32px,8vw,46px);line-height:1.04;font-weight:860;letter-spacing:-.033em;color:#fff;text-wrap:balance;text-shadow:0 1px 18px rgba(255,255,255,.1),0 14px 34px rgba(0,0,0,.42);font-feature-settings:"kern" 1,"ss01" 1}
        .sf-empty p{max-width:340px;margin:0;color:rgba(224,231,246,.75);font-size:clamp(17px,4.25vw,22px);line-height:1.32;font-weight:460;letter-spacing:-.012em;text-wrap:balance;text-shadow:0 10px 28px rgba(0,0,0,.35)}
        .sf-empty a{position:relative;display:inline-flex;align-items:center;justify-content:center;margin-top:24px;min-width:158px;min-height:48px;padding:12px 22px;border:1px solid rgba(255,255,255,.18);border-radius:16px;background:linear-gradient(180deg,#3d86ff 0%,#2567ed 56%,#1c4fd1 100%);color:#fff;text-decoration:none;font-size:18px;font-weight:820;letter-spacing:-.022em;box-shadow:0 14px 32px rgba(29,89,226,.36),0 1px 0 rgba(255,255,255,.24) inset,0 -1px 0 rgba(2,13,64,.22) inset;overflow:hidden;transform:translateZ(0);transition:transform .18s ease,box-shadow .18s ease,filter .18s ease;animation:sfButtonPulse 2.8s ease-in-out infinite;will-change:transform,box-shadow,filter}
        .sf-empty a::before{content:"";position:absolute;inset:1px;border-radius:15px;background:linear-gradient(135deg,rgba(255,255,255,.28),rgba(255,255,255,.05) 44%,rgba(255,255,255,0) 72%);pointer-events:none}
        .sf-empty a::after{content:"";position:absolute;top:-45%;bottom:-45%;width:34px;left:-48px;border-radius:999px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.62),rgba(255,255,255,0));filter:blur(1px);transform:rotate(18deg);animation:sfButtonSheen 3.6s ease-in-out infinite;pointer-events:none}
        .sf-empty a:hover{filter:saturate(1.06) brightness(1.035);box-shadow:0 17px 38px rgba(29,89,226,.46),0 1px 0 rgba(255,255,255,.3) inset,0 -1px 0 rgba(2,13,64,.2) inset}
        .sf-empty a:active{transform:translateY(1px) scale(.985);box-shadow:0 10px 24px rgba(29,89,226,.34),0 1px 0 rgba(255,255,255,.2) inset}
        @keyframes sfButtonPulse{0%,100%{box-shadow:0 14px 32px rgba(29,89,226,.36),0 1px 0 rgba(255,255,255,.24) inset,0 -1px 0 rgba(2,13,64,.22) inset;filter:saturate(1)}50%{box-shadow:0 18px 42px rgba(29,89,226,.52),0 0 22px rgba(87,151,255,.28),0 1px 0 rgba(255,255,255,.3) inset,0 -1px 0 rgba(2,13,64,.18) inset;filter:saturate(1.08) brightness(1.03)}}
        @keyframes sfButtonSheen{0%,46%{left:-52px;opacity:0}55%{opacity:.85}72%{left:calc(100% + 20px);opacity:0}100%{left:calc(100% + 20px);opacity:0}}
        .sf-no-results{position:fixed;z-index:12;inset:0;display:none;place-items:center;padding:30px;text-align:center;background:#090909;color:#c8ccda}
        .sf-no-results.is-visible{display:grid}
        @media(min-width:760px){
          .sf-app{max-width:520px;margin:0 auto;box-shadow:0 0 80px rgba(0,0,0,.8)}
          body{background:#111}
        }
        @media(max-width:390px){.sf-tabs{gap:14px}.sf-tab{font-size:14px}.sf-top{padding-left:50px;padding-right:50px}.sf-copy{left:14px}}
      </style>
    </head>
    <body>
      <main class="sf-app">
        <header class="sf-top">
          <a class="sf-brand" href="/stories" aria-label="Back to Stories">${tapzyMarkImg("tapzy-mark tapzy-mark-brand")}</a>
          <nav class="sf-tabs" aria-label="Story feed filters">
            <button class="sf-tab" type="button" data-filter="event">Events</button>
            <button class="sf-tab" type="button" data-filter="following">Following</button>
            <button class="sf-tab is-active" type="button" data-filter="all">Discover</button>
          </nav>
          <button class="sf-search" type="button" data-search aria-label="Search Tapzy">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m16.5 16.5 4 4"></path></svg>
          </button>
        </header>

        <section class="sf-feed" aria-label="Tapzy story feed">${slides || emptyMessage}</section>
        <div class="sf-no-results">No stories in this section yet.</div>

        <nav class="sf-bottom" aria-label="Primary navigation">
          <a class="sf-nav is-active" href="/">
            <svg viewBox="0 0 24 24"><path d="m3 11 9-8 9 8v10h-6v-7H9v7H3V11Z"></path></svg><span>Home</span>
          </a>
          <a class="sf-create" href="${currentProfile ? "/stories" : "/auth"}" aria-label="Create story">+</a>
          <a class="sf-nav" href="${profileHref}">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"></circle><path d="M4 22c0-5 3-8 8-8s8 3 8 8"></path></svg><span>Profile</span>
          </a>
        </nav>
      </main>
      <script>
        (function(){
          var feed = document.querySelector('.sf-feed');
          var slides = Array.prototype.slice.call(document.querySelectorAll('.sf-slide'));
          var tabs = Array.prototype.slice.call(document.querySelectorAll('.sf-tab'));
          var empty = document.querySelector('.sf-no-results');
          var observer = new IntersectionObserver(function(entries){
            entries.forEach(function(entry){
              var video = entry.target.querySelector('video');
              if (!video) return;
              if (entry.isIntersecting && entry.intersectionRatio > .65) {
                video.play().catch(function(){});
              } else {
                video.pause();
              }
            });
          }, { root: feed, threshold: [.2,.65] });
          slides.forEach(function(slide){ observer.observe(slide); });

          tabs.forEach(function(tab){
            tab.addEventListener('click', function(){
              var filter = tab.getAttribute('data-filter');
              var visible = 0;
              tabs.forEach(function(item){ item.classList.toggle('is-active', item === tab); });
              slides.forEach(function(slide){
                var show = filter === 'all' || slide.getAttribute('data-' + filter) === '1';
                slide.hidden = !show;
                if (show) visible += 1;
              });
              empty.classList.toggle('is-visible', visible === 0);
              feed.scrollTop = 0;
            });
          });

          document.addEventListener('click', function(event){
            var sound = event.target.closest('[data-sound]');
            if (sound) {
              var video = sound.closest('.sf-slide').querySelector('video');
              if (video) {
                video.muted = !video.muted;
                sound.classList.toggle('is-active', !video.muted);
                sound.setAttribute('aria-label', video.muted ? 'Turn sound on' : 'Mute story');
              }
              return;
            }
            var save = event.target.closest('[data-save]');
            if (save) {
              var key = 'tapzy_saved_story_' + save.getAttribute('data-save');
              var next = localStorage.getItem(key) !== '1';
              localStorage.setItem(key, next ? '1' : '0');
              save.classList.toggle('is-saved', next);
              save.querySelector('span').textContent = next ? 'Saved' : 'Save';
              return;
            }
            var share = event.target.closest('[data-share]');
            if (share) {
              var url = location.origin + share.getAttribute('data-share');
              if (navigator.share) navigator.share({ title: 'Tapzy Story', url: url }).catch(function(){});
              else navigator.clipboard.writeText(url).then(function(){
                var label = share.querySelector('span');
                label.textContent = 'Copied';
                setTimeout(function(){ label.textContent = 'Share'; }, 1400);
              });
              return;
            }
            if (event.target.closest('[data-search]')) {
              location.href = '${currentProfile?.username ? `/discovery/${escapeHtml(currentProfile.username)}?tab=search` : "/auth"}';
            }
          });

          document.querySelectorAll('[data-save]').forEach(function(save){
            var saved = localStorage.getItem('tapzy_saved_story_' + save.getAttribute('data-save')) === '1';
            if (saved) {
              save.classList.add('is-saved');
              save.querySelector('span').textContent = 'Saved';
            }
          });
        })();
      </script>
    </body>
    </html>`);
  } catch (error) {
    console.error("Story feed error:", error);
    res.status(500).send("Story feed error");
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

        _count: { select: { views: true } },

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

        const isVideoStory = story.mediaUrl && isVideoUrl(story.mediaUrl);

        const media = story.mediaUrl

          ? isVideoStory

            ? `<video class="story-view-media" src="${escapeHtml(story.mediaUrl)}" autoplay muted playsinline webkit-playsinline preload="metadata"></video>`

            : `<img class="story-view-media" src="${escapeHtml(story.mediaUrl)}" alt="Story media" loading="eager" decoding="async" />`

          : `<div class="story-view-text-only">${escapeHtml(story.text || "@"+(profile.username || "user"))}</div>`;

        const likeCount = storyLikeCounts.get(story.id) || 0;
        const viewCount = story._count?.views || 0;



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
                <div class="story-metric">${escapeHtml(String(likeCount))} like${likeCount === 1 ? "" : "s"}</div>
                <div class="story-metric">${escapeHtml(String(viewCount))} view${viewCount === 1 ? "" : "s"}</div>
                <div class="story-social-spacer"></div>
                ${isVideoStory ? `<button class="story-sound-btn" type="button" data-story-sound>Tap for sound</button>` : ""}
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

        width:0%;

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
        flex-wrap:nowrap;
        width:100%;
        pointer-events:auto;
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

      .story-metric{
        color:rgba(255,255,255,.84);
        font-size:13px;
        font-weight:800;
        white-space:nowrap;
      }

      .story-social-spacer{
        flex:1 1 auto;
        min-width:8px;
      }


        .story-sound-btn{
          min-height:34px;
          padding:0 12px;
          font-size:11px;
        }

        .stories-form-grid-premium{
          grid-template-columns:1fr;
        }

        .stories-preview-card{
          min-height:190px;
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




      .story-view-shell::before{
        content:"";
        position:absolute;
        inset:0;
        background:
          radial-gradient(600px 240px at 50% 0%, rgba(90,180,255,.14), transparent 58%),
          radial-gradient(420px 280px at 100% 100%, rgba(80,120,255,.10), transparent 62%);
        pointer-events:none;
        z-index:1;
      }

      .story-panel{
        transform:translateZ(0);
      }

      .story-progress-fill{
        background:linear-gradient(90deg, #fff, #9edcff);
        box-shadow:0 0 14px rgba(125,214,255,.55);
      }

      .story-header-handle::before{
        content:"";
        display:inline-block;
        width:8px;
        height:8px;
        margin-right:8px;
        border-radius:999px;
        background:#71d8ff;
        box-shadow:0 0 16px rgba(113,216,255,.9);
        vertical-align:middle;
      }

      .story-sound-btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:38px;
        padding:0 14px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(8,10,16,.62);
        color:#fff;
        font-size:12px;
        font-weight:900;
        cursor:pointer;
        backdrop-filter:blur(12px);
        box-shadow:0 12px 30px rgba(0,0,0,.28);
        white-space:nowrap;
      }

      .story-like-btn,
      .story-event-pill,
      .story-close-btn,
      .story-delete-btn{
        transition:transform .16s ease, background .16s ease, border-color .16s ease;
      }

      .story-like-btn:hover,
      .story-event-pill:hover,
      .story-close-btn:hover,
      .story-delete-btn:hover{
        transform:translateY(-1px);
        border-color:rgba(160,220,255,.28);
        background:rgba(255,255,255,.14);
      }

      .story-reply-form{
        position:relative;
        z-index:4;
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
        const shell = document.querySelector(".story-view-shell");
        let index = 0;
        let timer = null;
        let raf = null;
        let startX = 0;

        function currentPanel(){
          return panels[index] || null;
        }

        function currentVideo(){
          const panel = currentPanel();
          return panel ? panel.querySelector("video") : null;
        }

        function activeFills(){
          const panel = currentPanel();
          return panel ? Array.from(panel.querySelectorAll(".story-progress-fill")) : [];
        }

        function stopProgress(){
          if (timer) clearTimeout(timer);
          if (raf) cancelAnimationFrame(raf);
          timer = null;
          raf = null;
        }

        function paintProgress(percent){
          const fills = activeFills();
          fills.forEach((fill, i) => {
            fill.classList.toggle("story-progress-fill-active", i === index);
            fill.style.transition = "none";
            if (i < index) fill.style.width = "100%";
            else if (i > index) fill.style.width = "0%";
            else fill.style.width = Math.max(0, Math.min(100, percent)) + "%";
          });
        }

        function resetAllVisibleBars(){
          panels.forEach((panel) => {
            Array.from(panel.querySelectorAll(".story-progress-fill")).forEach((fill) => {
              fill.classList.remove("story-progress-fill-active");
              fill.style.transition = "none";
              fill.style.width = "0%";
            });
          });
        }

        function pauseInactiveVideos(){
          panels.forEach((panel, i) => {
            const video = panel.querySelector("video");
            if (!video) return;
            if (i !== index) {
              video.onloadedmetadata = null;
              video.ontimeupdate = null;
              video.onended = null;
              try { video.pause(); video.currentTime = 0; } catch(e) {}
            }
          });
        }

        function preloadNext(nextIndex){
          const nextPanel = panels[nextIndex + 1];
          if (!nextPanel) return;
          const media = nextPanel.querySelector("video, img");
          if (!media) return;
          if (media.tagName === "VIDEO") media.preload = "metadata";
          if (media.tagName === "IMG" && media.loading) media.loading = "eager";
        }

        function goNext(){
          stopProgress();
          if (index + 1 < panels.length) activate(index + 1);
          else paintProgress(100);
        }

        function startImageProgress(){
          const duration = 7000;
          const startedAt = performance.now();
          function tick(now){
            const pct = ((now - startedAt) / duration) * 100;
            paintProgress(pct);
            if (pct >= 100) return goNext();
            raf = requestAnimationFrame(tick);
          }
          raf = requestAnimationFrame(tick);
        }

        function startVideoProgress(video){
          function duration(){
            return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
          }

          function tick(){
            const d = duration();
            if (d > 0) paintProgress((video.currentTime / d) * 100);
            raf = requestAnimationFrame(tick);
          }

          video.onloadedmetadata = function(){
            paintProgress(0);
          };
          video.onended = goNext;
          video.ontimeupdate = function(){
            const d = duration();
            if (d > 0) paintProgress((video.currentTime / d) * 100);
          };

          try { video.currentTime = 0; } catch(e) {}
          video.play().catch(function(){});
          raf = requestAnimationFrame(tick);
        }

        function activate(nextIndex){
          if (nextIndex < 0 || nextIndex >= panels.length) return;
          stopProgress();
          index = nextIndex;

          panels.forEach((panel, i) => {
            panel.classList.toggle("story-panel-active", i === nextIndex);
          });

          resetAllVisibleBars();
          paintProgress(0);
          pauseInactiveVideos();
          preloadNext(nextIndex);

          const video = currentVideo();
          if (video) startVideoProgress(video);
          else startImageProgress();
        }

        document.addEventListener("click", function(e){
          const soundButton = e.target.closest("[data-story-sound]");
          if (soundButton) {
            const video = currentVideo();
            if (video) {
              video.muted = !video.muted;
              video.play().catch(function(){});
              soundButton.textContent = video.muted ? "Tap for sound" : "Sound on";
            }
            return;
          }

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

        if (shell) {
          shell.addEventListener("touchstart", function(e){
            startX = e.touches && e.touches[0] ? e.touches[0].clientX : 0;
          }, { passive:true });

          shell.addEventListener("touchend", function(e){
            const endX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : 0;
            const diff = endX - startX;
            if (Math.abs(diff) < 48) return;
            if (diff > 0 && index > 0) activate(index - 1);
            if (diff < 0 && index + 1 < panels.length) activate(index + 1);
          }, { passive:true });
        }

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
