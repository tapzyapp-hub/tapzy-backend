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

} = require("../utils");



function profileLinkRow(label, href) {

  return `

    <a class="profile-simple-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">

      <span>${escapeHtml(label)}</span>

      <span class="profile-simple-arrow">›</span>

    </a>

  `;

}



router.get("/u/:username", async (req, res) => {

  try {

    const username = cleanUsername(req.params.username);



    const profile = await prisma.userProfile.findUnique({

      where: { username },

      include: {

        followers: true,

        following: true,

      },

    });



    if (!profile) {

      return res.status(404).send("Profile not found");

    }



    const currentProfile = req.currentProfile || null;

    const followState = await getFollowState(currentProfile?.id, profile.id);

    const quickPreview = buildQuickSharePreview(profile);



    const photoHtml = profile.photo

      ? `<img src="${escapeHtml(profile.photo)}" alt="${escapeHtml(profile.name || profile.username || "Tapzy User")}" />`

      : escapeHtml((profile.name || profile.username || "T").slice(0, 1).toUpperCase());



    const showMessageButton = currentProfile && currentProfile.id !== profile.id;

    const showFollowButton = !!(currentProfile && currentProfile.id !== profile.id);



    const body = `

    <div class="wrap profile-wrap">

      <section class="profile-showcase">

        <div class="profile-showcase-stars"></div>

        <div class="profile-showcase-glow profile-showcase-glow-a"></div>

        <div class="profile-showcase-glow profile-showcase-glow-b"></div>

        <div class="profile-showcase-edge"></div>



        <div class="profile-showcase-top">

          <div class="profile-showcase-avatar-wrap">

            <div class="profile-showcase-avatar">${photoHtml}</div>

          </div>



          <div class="profile-showcase-main">

            <div class="profile-showcase-name">${escapeHtml(profile.name || profile.username || "Tapzy User")}</div>

            <div class="profile-showcase-handle">@${escapeHtml(profile.username || "user")}</div>



            <div class="profile-showcase-actions">

              ${

                showFollowButton

                  ? renderFollowButton(currentProfile, profile, followState.isFollowing)

                  : ""

              }



              ${

                showMessageButton

                  ? `

                    <form method="POST" action="/messages/start/${escapeHtml(profile.username || "")}" style="margin:0;">

                      <button class="profile-pill-btn profile-pill-btn-dark" type="submit">Message</button>

                    </form>

                  `

                  : ""

              }



              <a class="profile-pill-btn profile-pill-btn-dark" href="/qr/${escapeHtml(profile.username || "")}">QR</a>

              <a class="profile-pill-btn profile-pill-btn-dark" href="/vcard/${escapeHtml(profile.username || "")}">Save Contact</a>

            </div>



            <div class="profile-showcase-signed">

              ${currentProfileNoticeHtml(currentProfile)}

            </div>

          </div>

        </div>



        <div class="profile-stats-row">

          <div class="profile-stat-chip">

            <div class="profile-stat-chip-num">${profile.connections || 0}</div>

            <div class="profile-stat-chip-label">Connections</div>

          </div>



          <div class="profile-stat-chip">

            <div class="profile-stat-chip-num">${profile.followers?.length || 0}</div>

            <div class="profile-stat-chip-label">Followers</div>

          </div>



          <div class="profile-stat-chip">

            <div class="profile-stat-chip-num">${profile.following?.length || 0}</div>

            <div class="profile-stat-chip-label">Following</div>

          </div>

        </div>

      </section>



      ${

        profile.title || profile.bio

          ? `

            <section class="card" style="margin-top:18px;">

              ${profile.title ? `<div style="font-size:18px;font-weight:800;">${escapeHtml(profile.title)}</div>` : ""}

              ${profile.bio ? `<div class="muted" style="margin-top:${profile.title ? "10px" : "0"};max-width:760px;line-height:1.75;">${escapeHtml(profile.bio)}</div>` : ""}

            </section>

          `

          : ""

      }



      ${

        quickPreview.length

          ? `

            <section class="panel profile-preview-panel" style="margin-top:18px;">

              <h3 style="margin-top:0;">Quick Share Preview</h3>

              <div class="muted">Fields currently enabled for Tapzy quick sharing.</div>

              <div style="margin-top:10px;">

                ${quickPreview.map((item) => `<span class="miniTag">${escapeHtml(item)}</span>`).join("")}

              </div>

            </section>

          `

          : ""

      }



      <div class="profile-simple-links" style="margin-top:18px;">

        ${profile.phone ? profileLinkRow("Phone", `tel:${profile.phone}`) : ""}

        ${profile.email ? profileLinkRow("Email", `mailto:${profile.email}`) : ""}

        ${profile.instagram ? profileLinkRow("Instagram", `https://instagram.com/${stripAt(profile.instagram)}`) : ""}

        ${profile.tiktok ? profileLinkRow("TikTok", `https://www.tiktok.com/@${stripAt(profile.tiktok)}`) : ""}

        ${profile.website ? profileLinkRow("Website", safeUrl(profile.website)) : ""}

        ${profile.linkedin ? profileLinkRow("LinkedIn", safeUrl(profile.linkedin)) : ""}

        ${profile.twitter ? profileLinkRow("X", `https://x.com/${stripAt(profile.twitter)}`) : ""}

        ${profile.facebook ? profileLinkRow("Facebook", `https://facebook.com/${stripAt(profile.facebook)}`) : ""}

        ${profile.youtube ? profileLinkRow("YouTube", `https://youtube.com/@${stripAt(profile.youtube)}`) : ""}

        ${profile.github ? profileLinkRow("GitHub", `https://github.com/${stripAt(profile.github)}`) : ""}

        ${profile.snapchat ? profileLinkRow("Snapchat", `https://www.snapchat.com/add/${stripAt(profile.snapchat)}`) : ""}

        ${profile.whatsapp ? profileLinkRow("WhatsApp", `https://wa.me/${String(profile.whatsapp).replace(/[^\d]/g, "")}`) : ""}

        ${profile.telegram ? profileLinkRow("Telegram", `https://t.me/${stripAt(profile.telegram)}`) : ""}

      </div>



      ${

        currentProfile && currentProfile.id === profile.id

          ? `

            <div class="row" style="margin-top:18px;">

              <a class="btn" href="/edit/${escapeHtml(profile.username || "")}">Edit Profile</a>

            </div>

          `

          : ""

      }

    </div>



    <style>

      .profile-wrap{

        max-width:920px;

      }



      .profile-showcase{

        position:relative;

        overflow:hidden;

        border-radius:34px;

        padding:26px 26px 22px;

        border:1px solid rgba(255,255,255,.06);

        background:

          radial-gradient(900px 420px at 50% 0%, rgba(20,38,74,.18), transparent 42%),

          linear-gradient(180deg, rgba(4,6,12,.985), rgba(2,3,8,1));

        box-shadow:

          0 24px 70px rgba(0,0,0,.56),

          inset 0 1px 0 rgba(255,255,255,.03),

          inset 0 0 0 1px rgba(120,200,255,.015);

      }



      .profile-showcase-stars{

        position:absolute;

        inset:0;

        pointer-events:none;

        opacity:.10;

        background-image:

          radial-gradient(circle at 14% 22%, rgba(170,220,255,.12) 0 1px, transparent 1.5px),

          radial-gradient(circle at 78% 16%, rgba(170,220,255,.07) 0 1px, transparent 1.5px),

          radial-gradient(circle at 62% 46%, rgba(170,220,255,.05) 0 1px, transparent 1.5px),

          radial-gradient(circle at 24% 72%, rgba(170,220,255,.04) 0 1px, transparent 1.5px),

          radial-gradient(circle at 88% 82%, rgba(170,220,255,.04) 0 1px, transparent 1.5px);

      }



      .profile-showcase-glow{

        position:absolute;

        border-radius:999px;

        pointer-events:none;

        filter:blur(26px);

      }



      .profile-showcase-glow-a{

        width:220px;

        height:220px;

        right:-30px;

        top:-36px;

        background:radial-gradient(circle, rgba(120,170,255,.06) 0%, rgba(120,170,255,.02) 38%, transparent 72%);

      }



      .profile-showcase-glow-b{

        width:170px;

        height:170px;

        left:70px;

        bottom:-48px;

        background:radial-gradient(circle, rgba(80,140,255,.05) 0%, rgba(80,140,255,.02) 40%, transparent 75%);

      }



      .profile-showcase-edge{

        position:absolute;

        top:0;

        right:0;

        width:150px;

        height:150px;

        border-top-right-radius:34px;

        pointer-events:none;

        background:radial-gradient(circle at 100% 0%, rgba(120,170,255,.08) 0%, rgba(120,170,255,.025) 22%, transparent 60%);

        opacity:.5;

      }



      .profile-showcase-top{

        position:relative;

        z-index:2;

        display:grid;

        grid-template-columns:146px minmax(0, 1fr);

        gap:22px;

        align-items:center;

      }



      .profile-showcase-avatar-wrap{

        position:relative;

      }



      .profile-showcase-avatar{

        width:146px;

        height:146px;

        border-radius:28px;

        overflow:hidden;

        display:flex;

        align-items:center;

        justify-content:center;

        font-size:54px;

        font-weight:900;

        color:#d9e7ff;

        border:1px solid rgba(255,255,255,.07);

        background:

          radial-gradient(circle at 30% 24%, rgba(100,150,255,.04), transparent 28%),

          linear-gradient(180deg, rgba(7,10,18,.99), rgba(3,5,10,1));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 0 0 1px rgba(95,180,255,.03),

          0 0 16px rgba(62,138,255,.06);

      }



      .profile-showcase-avatar img{

        width:100%;

        height:100%;

        object-fit:cover;

      }



      .profile-showcase-main{

        min-width:0;

      }



      .profile-showcase-name{

        font-size:40px;

        line-height:1;

        font-weight:900;

        letter-spacing:-1.2px;

        color:#ffffff;

        text-shadow:0 0 18px rgba(120,205,255,.02);

        white-space:nowrap;

        overflow:hidden;

        text-overflow:ellipsis;

      }



      .profile-showcase-handle{

        margin-top:10px;

        color:#c8d3e5;

        font-size:18px;

        white-space:nowrap;

        overflow:hidden;

        text-overflow:ellipsis;

      }



      .profile-showcase-actions{

        display:flex;

        gap:10px;

        flex-wrap:wrap;

        align-items:center;

        margin-top:16px;

      }



      .profile-pill-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:42px;

        padding:0 18px;

        border-radius:15px;

        text-decoration:none;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(18,21,32,.96), rgba(10,12,20,.99));

        color:#ffffff;

        font-size:14px;

        font-weight:800;

        letter-spacing:.1px;

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 8px 16px rgba(0,0,0,.16);

      }



      .profile-pill-btn-dark{

        background:linear-gradient(180deg, rgba(18,21,32,.96), rgba(10,12,20,.99));

      }



      .profile-showcase-actions form{

        margin:0;

      }



      .profile-showcase-actions form .btn,

      .profile-showcase-actions .btn{

        min-height:42px;

        padding:0 18px;

        border-radius:15px;

        font-size:14px;

        font-weight:800;

        border:1px solid rgba(255,255,255,.08);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 8px 16px rgba(0,0,0,.16);

      }



      .profile-showcase-actions form .btn{

        width:auto;

      }



      .profile-showcase-actions .btn.btnDark,

      .profile-showcase-actions form .btn.btnDark{

        background:linear-gradient(180deg, rgba(18,21,32,.96), rgba(10,12,20,.99));

        color:#fff;

      }



      .profile-showcase-actions form .btn:not(.btnDark),

      .profile-showcase-actions .btn:not(.btnDark){

        background:

          radial-gradient(circle at 50% 0%, rgba(130,180,255,.16), transparent 55%),

          linear-gradient(180deg, rgba(22,45,95,.95), rgba(10,20,48,.99));

        color:#fff;

        border-color:rgba(140,220,255,.14);

        box-shadow:

          0 0 16px rgba(80,150,255,.10),

          inset 0 1px 0 rgba(255,255,255,.10);

      }



      .profile-showcase-signed .mini{

        margin-top:12px !important;

        color:#c4cede;

        font-size:14px;

      }



      .profile-stats-row{

        position:relative;

        z-index:2;

        display:grid;

        grid-template-columns:repeat(3, minmax(0, 1fr));

        gap:14px;

        margin-top:20px;

      }



      .profile-stat-chip{

        position:relative;

        overflow:hidden;

        min-height:94px;

        border-radius:22px;

        padding:16px 18px;

        border:1px solid rgba(255,255,255,.06);

        background:

          radial-gradient(220px 140px at 50% 0%, rgba(55,95,180,.08), transparent 60%),

          linear-gradient(180deg, rgba(8,11,20,.96), rgba(4,6,12,.99));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.03),

          0 10px 24px rgba(0,0,0,.14);

        text-align:center;

      }



      .profile-stat-chip::after{

        content:"";

        position:absolute;

        left:50%;

        bottom:-20px;

        transform:translateX(-50%);

        width:72px;

        height:36px;

        background:radial-gradient(circle, rgba(100,160,255,.10) 0%, rgba(100,160,255,.03) 40%, transparent 75%);

        filter:blur(8px);

        pointer-events:none;

      }



      .profile-stat-chip-num{

        font-size:28px;

        line-height:1;

        font-weight:900;

        color:#fff;

        letter-spacing:-.6px;

      }



      .profile-stat-chip-label{

        margin-top:8px;

        color:#c6d0df;

        font-size:14px;

      }



      .profile-preview-panel{

        position:relative;

        overflow:hidden;

        background:

          radial-gradient(520px 220px at 70% 18%, rgba(70,110,190,.10), transparent 42%),

          linear-gradient(180deg, rgba(8,11,20,.96), rgba(4,6,12,.99));

        border:1px solid rgba(255,255,255,.06);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.03),

          0 16px 34px rgba(0,0,0,.20);

      }



      .profile-preview-panel::before{

        content:"";

        position:absolute;

        inset:auto auto -40px 22%;

        width:120px;

        height:70px;

        border-radius:999px;

        background:radial-gradient(circle, rgba(100,160,255,.10) 0%, rgba(100,160,255,.03) 45%, transparent 75%);

        filter:blur(10px);

        pointer-events:none;

      }



      .profile-simple-links{

        display:grid;

        gap:12px;

      }



      .profile-simple-link{

        position:relative;

        overflow:hidden;

        display:flex;

        align-items:center;

        justify-content:space-between;

        gap:12px;

        text-decoration:none;

        padding:18px 20px;

        border-radius:22px;

        background:

          radial-gradient(420px 180px at 68% 20%, rgba(70,110,190,.10), transparent 42%),

          linear-gradient(180deg, rgba(8,11,20,.96), rgba(4,6,12,.99));

        border:1px solid rgba(255,255,255,.06);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.03),

          0 14px 28px rgba(0,0,0,.18);

        color:#ffffff;

        font-size:18px;

        font-weight:700;

        transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease;

      }



      .profile-simple-link::before{

        content:"";

        position:absolute;

        width:110px;

        height:56px;

        left:20%;

        bottom:-24px;

        border-radius:999px;

        background:radial-gradient(circle, rgba(100,160,255,.10) 0%, rgba(100,160,255,.03) 42%, transparent 74%);

        filter:blur(8px);

        pointer-events:none;

      }



      .profile-simple-link:hover{

        transform:translateY(-1px);

        border-color:rgba(255,255,255,.10);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 16px 34px rgba(0,0,0,.22),

          0 0 24px rgba(70,140,255,.05);

      }



      .profile-simple-arrow{

        color:#9db0cb;

        font-size:24px;

        line-height:1;

        flex:0 0 auto;

      }



      @media(max-width:700px){

        .profile-showcase{

          padding:22px 18px 20px;

          border-radius:28px;

        }



        .profile-showcase-top{

          grid-template-columns:86px minmax(0, 1fr);

          gap:14px;

          align-items:start;

        }



        .profile-showcase-avatar{

          width:86px;

          height:86px;

          border-radius:22px;

          font-size:34px;

        }



        .profile-showcase-name{

          font-size:28px;

        }



        .profile-showcase-handle{

          font-size:15px;

          margin-top:8px;

        }



        .profile-showcase-actions{

          margin-top:14px;

          gap:8px;

        }



        .profile-showcase-actions form .btn,

        .profile-showcase-actions .btn,

        .profile-pill-btn{

          min-height:40px;

          padding:0 14px;

          border-radius:14px;

          font-size:13px;

        }



        .profile-showcase-signed .mini{

          font-size:13px;

        }



        .profile-stats-row{

          grid-template-columns:repeat(3, minmax(0, 1fr));

          gap:10px;

          margin-top:18px;

        }



        .profile-stat-chip{

          min-height:84px;

          text-align:center;

          padding:14px 10px;

          border-radius:18px;

        }



        .profile-stat-chip::after{

          left:50%;

        }



        .profile-stat-chip-num{

          font-size:30px;

        }



        .profile-stat-chip-label{

          font-size:13px;

          margin-top:8px;

          line-height:1.2;

        }



        .profile-simple-link{

          font-size:16px;

          padding:16px 18px;

          border-radius:18px;

        }

      }

    </style>



    ${renderTapzyAssistant({

      username: profile.username || "User",

      pageType: "profile",

    })}

    `;



    res.send(

      renderShell(`@${profile.username} • Tapzy`, body, "", {

        currentProfile,

        pageTitle: profile.username || "Profile",

        pageType: "profile",

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("Profile page error");

  }

});



router.get("/edit/:username", async (req, res) => {

  try {

    const username = cleanUsername(req.params.username);

    const profile = await prisma.userProfile.findUnique({ where: { username } });



    if (!profile) return res.status(404).send("Profile not found");

    if (!requireOwnerAccess(profile, req, res)) return;



    const keyQuery = ownerKeyQuery(req, profile);



    const currentPhotoHtml = profile.photo

      ? `

        <div class="tz-edit-photo-card">

          <div class="tz-edit-photo-preview">

            <img src="${escapeHtml(profile.photo)}" alt="Current profile photo" />

          </div>

          <div class="tz-edit-photo-meta">

            <div class="tz-edit-photo-title">Current profile photo</div>

            <div class="tz-edit-photo-sub">Your current Tapzy profile image.</div>

          </div>

        </div>

      `

      : `

        <div class="tz-edit-photo-card">

          <div class="tz-edit-photo-preview tz-edit-photo-empty">No photo</div>

          <div class="tz-edit-photo-meta">

            <div class="tz-edit-photo-title">Current profile photo</div>

            <div class="tz-edit-photo-sub">No profile image uploaded yet.</div>

          </div>

        </div>

      `;



    const body = `

    <div class="wrap tz-edit-wrap">

      <div class="tz-edit-shell">



        <section class="tz-edit-hero">

          <div class="tz-edit-hero-glow tz-edit-hero-glow-a"></div>

          <div class="tz-edit-hero-glow tz-edit-hero-glow-b"></div>



          <div class="tz-edit-hero-top">

            <div>

              <h1 class="tz-edit-title">Edit Profile</h1>

              <div class="tz-edit-subtitle">

                Update your Tapzy identity and quick share settings.

              </div>

            </div>



            <div class="tz-edit-actions">

              <a class="tz-edit-btn" href="/u/${escapeHtml(profile.username || "")}">View Profile</a>

              <a class="tz-edit-btn" href="/qr/${escapeHtml(profile.username || "")}">QR</a>

            </div>

          </div>

        </section>



        <form method="POST" action="/edit/${escapeHtml(profile.username || "")}${keyQuery}" enctype="multipart/form-data" class="tz-edit-form">



          <section class="tz-edit-section">

            <div class="tz-edit-section-head">

              <h3>Identity</h3>

              <p>Main public details people see first.</p>

            </div>



            <div class="tz-edit-grid tz-edit-grid-one">

              <div class="tz-field">

                <label>Name</label>

                <input name="name" value="${escapeHtml(profile.name || "")}" placeholder="Your name" />

              </div>



              <div class="tz-field">

                <label>Title</label>

                <input name="title" value="${escapeHtml(profile.title || "")}" placeholder="Founder of Tapzy" />

              </div>



              <div class="tz-field">

                <label>Bio</label>

                <textarea name="bio" placeholder="Short premium bio">${escapeHtml(profile.bio || "")}</textarea>

              </div>

            </div>

          </section>



          <section class="tz-edit-section">

            <div class="tz-edit-section-head">

              <h3>Profile Photo</h3>

              <p>Manage your Tapzy profile image.</p>

            </div>



            <div class="tz-edit-upload-wrap">

              ${currentPhotoHtml}



              <div class="tz-edit-upload-box">

                <label class="tz-field">Upload New Profile Photo</label>

                <input class="tz-upload-input" type="file" name="photo" accept="image/png,image/jpeg,image/webp" />



                <label class="tz-switch-row">

                  <div class="tz-switch-copy">

                    <strong>Remove current photo</strong>

                    <span>Turn this on if you want the current profile photo removed when you save.</span>

                  </div>



                  <span class="tz-check-wrap">

                    <input type="checkbox" name="removePhoto" />

                  </span>

                </label>

              </div>

            </div>

          </section>



          <section class="tz-edit-section">

            <div class="tz-edit-section-head">

              <h3>Contact Details</h3>

              <p>Your core contact information.</p>

            </div>



            <div class="tz-edit-grid">

              <div class="tz-field">

                <label>Phone</label>

                <input name="phone" value="${escapeHtml(profile.phone || "")}" />

              </div>



              <div class="tz-field">

                <label>Email</label>

                <input name="email" value="${escapeHtml(profile.email || "")}" />

              </div>



              <div class="tz-field tz-field-full">

                <label>Website</label>

                <input name="website" value="${escapeHtml(profile.website || "")}" />

              </div>

            </div>

          </section>



          <section class="tz-edit-section">

            <div class="tz-edit-section-head">

              <h3>Social Links</h3>

              <p>Connect your social presence to your Tapzy profile.</p>

            </div>



            <div class="tz-edit-grid">

              <div class="tz-field">

                <label>Instagram</label>

                <input name="instagram" value="${escapeHtml(profile.instagram || "")}" />

              </div>



              <div class="tz-field">

                <label>LinkedIn</label>

                <input name="linkedin" value="${escapeHtml(profile.linkedin || "")}" />

              </div>



              <div class="tz-field">

                <label>TikTok</label>

                <input name="tiktok" value="${escapeHtml(profile.tiktok || "")}" />

              </div>



              <div class="tz-field">

                <label>X / Twitter</label>

                <input name="twitter" value="${escapeHtml(profile.twitter || "")}" />

              </div>



              <div class="tz-field">

                <label>Facebook</label>

                <input name="facebook" value="${escapeHtml(profile.facebook || "")}" />

              </div>



              <div class="tz-field">

                <label>YouTube</label>

                <input name="youtube" value="${escapeHtml(profile.youtube || "")}" />

              </div>



              <div class="tz-field">

                <label>GitHub</label>

                <input name="github" value="${escapeHtml(profile.github || "")}" />

              </div>



              <div class="tz-field">

                <label>Snapchat</label>

                <input name="snapchat" value="${escapeHtml(profile.snapchat || "")}" />

              </div>



              <div class="tz-field">

                <label>WhatsApp</label>

                <input name="whatsapp" value="${escapeHtml(profile.whatsapp || "")}" />

              </div>



              <div class="tz-field">

                <label>Telegram</label>

                <input name="telegram" value="${escapeHtml(profile.telegram || "")}" />

              </div>

            </div>

          </section>



          <section class="tz-edit-section">

            <div class="tz-edit-section-head">

              <h3>Quick Share Settings</h3>

              <p>Choose what Tapzy shares instantly.</p>

            </div>



            <div class="tz-toggle-list">

              <label class="tz-toggle-row">

                <span>Enable Quick Share</span>

                <input type="checkbox" name="quickShareEnabled" ${profile.quickShareEnabled ? "checked" : ""} />

              </label>



              <div class="tz-edit-grid">

                <label class="tz-toggle-row"><span>Share Name</span><input type="checkbox" name="shareNameEnabled" ${profile.shareNameEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share Phone</span><input type="checkbox" name="sharePhoneEnabled" ${profile.sharePhoneEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share Email</span><input type="checkbox" name="shareEmailEnabled" ${profile.shareEmailEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share Website</span><input type="checkbox" name="shareWebsiteEnabled" ${profile.shareWebsiteEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share Instagram</span><input type="checkbox" name="shareInstagramEnabled" ${profile.shareInstagramEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share LinkedIn</span><input type="checkbox" name="shareLinkedinEnabled" ${profile.shareLinkedinEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share TikTok</span><input type="checkbox" name="shareTiktokEnabled" ${profile.shareTiktokEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share X</span><input type="checkbox" name="shareTwitterEnabled" ${profile.shareTwitterEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share Facebook</span><input type="checkbox" name="shareFacebookEnabled" ${profile.shareFacebookEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share YouTube</span><input type="checkbox" name="shareYoutubeEnabled" ${profile.shareYoutubeEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share GitHub</span><input type="checkbox" name="shareGithubEnabled" ${profile.shareGithubEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share Snapchat</span><input type="checkbox" name="shareSnapchatEnabled" ${profile.shareSnapchatEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share WhatsApp</span><input type="checkbox" name="shareWhatsappEnabled" ${profile.shareWhatsappEnabled ? "checked" : ""} /></label>

                <label class="tz-toggle-row"><span>Share Telegram</span><input type="checkbox" name="shareTelegramEnabled" ${profile.shareTelegramEnabled ? "checked" : ""} /></label>

              </div>

            </div>

          </section>



          <div class="tz-edit-savebar">

            <button class="tz-edit-savebtn" type="submit">Save Profile</button>

          </div>

        </form>

      </div>

    </div>



    <style>

      .tz-edit-wrap{

        max-width:920px;

      }



      .tz-edit-shell{

        display:flex;

        flex-direction:column;

        gap:16px;

      }



      .tz-edit-hero{

        position:relative;

        overflow:hidden;

        border-radius:32px;

        padding:24px;

        border:1px solid rgba(140,198,255,.10);

        background:

          radial-gradient(900px 420px at 50% 0%, rgba(24,59,93,.30), transparent 45%),

          linear-gradient(180deg, rgba(10,13,20,.98), rgba(6,8,12,1));

        box-shadow:

          0 24px 70px rgba(0,0,0,.56),

          inset 0 1px 0 rgba(255,255,255,.03),

          inset 0 0 0 1px rgba(120,200,255,.02);

      }



      .tz-edit-hero-glow{

        position:absolute;

        border-radius:999px;

        pointer-events:none;

        filter:blur(28px);

      }



      .tz-edit-hero-glow-a{

        width:220px;

        height:220px;

        right:-30px;

        top:-40px;

        background:radial-gradient(circle, rgba(170,242,255,.09) 0%, rgba(170,242,255,.03) 40%, transparent 72%);

      }



      .tz-edit-hero-glow-b{

        width:190px;

        height:190px;

        left:60px;

        bottom:-56px;

        background:radial-gradient(circle, rgba(64,136,255,.09) 0%, rgba(64,136,255,.03) 40%, transparent 75%);

      }



      .tz-edit-hero-top{

        position:relative;

        z-index:2;

        display:flex;

        align-items:flex-start;

        justify-content:space-between;

        gap:18px;

        flex-wrap:wrap;

      }



      .tz-edit-title{

        margin:0;

        font-size:48px;

        line-height:1;

        letter-spacing:-1.4px;

        font-weight:900;

        color:#fff;

      }



      .tz-edit-subtitle{

        margin-top:10px;

        color:#a7b0c0;

        font-size:17px;

        line-height:1.65;

        max-width:720px;

      }



      .tz-edit-actions{

        display:flex;

        gap:10px;

        flex-wrap:wrap;

      }



      .tz-edit-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:46px;

        padding:0 18px;

        border-radius:16px;

        text-decoration:none;

        border:1px solid rgba(145,203,255,.12);

        background:linear-gradient(180deg, rgba(32,35,45,.94), rgba(14,16,23,.98));

        color:#fff;

        font-size:14px;

        font-weight:800;

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 8px 16px rgba(0,0,0,.16);

      }



      .tz-edit-form{

        display:flex;

        flex-direction:column;

        gap:16px;

      }



      .tz-edit-section{

        border-radius:28px;

        padding:18px;

        border:1px solid rgba(140,198,255,.08);

        background:

          radial-gradient(520px 220px at 70% 12%, rgba(95,182,255,.10), transparent 40%),

          linear-gradient(180deg, rgba(16,21,32,.96), rgba(10,13,20,.99));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.03),

          0 16px 34px rgba(0,0,0,.20);

      }



      .tz-edit-section-head{

        margin-bottom:14px;

      }



      .tz-edit-section-head h3{

        margin:0;

        color:#fff;

        font-size:22px;

        font-weight:900;

        letter-spacing:-.4px;

      }



      .tz-edit-section-head p{

        margin:6px 0 0;

        color:#94a1b6;

        font-size:13px;

        line-height:1.6;

      }



      .tz-edit-grid{

        display:grid;

        grid-template-columns:1fr 1fr;

        gap:14px;

      }



      .tz-edit-grid-one{

        grid-template-columns:1fr;

      }



      .tz-field{

        display:flex;

        flex-direction:column;

        gap:8px;

      }



      .tz-field-full{

        grid-column:1 / -1;

      }



      .tz-field label{

        margin:0;

        color:#b7c3d6;

        font-size:13px;

        font-weight:700;

        letter-spacing:.1px;

      }



      .tz-field input,

      .tz-field textarea{

        width:100%;

        padding:15px 16px;

        border-radius:20px;

        border:1px solid rgba(145,203,255,.10);

        background:linear-gradient(180deg, rgba(7,10,16,.98), rgba(4,6,10,1));

        color:#fff;

        outline:none;

        box-sizing:border-box;

        box-shadow:inset 0 1px 0 rgba(255,255,255,.02);

      }



      .tz-field input:focus,

      .tz-field textarea:focus{

        border-color:rgba(127,210,255,.28);

        box-shadow:0 0 0 3px rgba(127,210,255,.07);

      }



      .tz-field textarea{

        min-height:150px;

        resize:vertical;

      }



      .tz-edit-upload-wrap{

        display:grid;

        grid-template-columns:1fr;

        gap:14px;

      }



      .tz-edit-photo-card,

      .tz-edit-upload-box{

        border-radius:22px;

        padding:16px;

        border:1px solid rgba(255,255,255,.06);

        background:rgba(255,255,255,.02);

      }



      .tz-edit-photo-card{

        display:flex;

        align-items:center;

        gap:14px;

        flex-wrap:wrap;

      }



      .tz-edit-photo-preview{

        width:108px;

        height:108px;

        border-radius:24px;

        overflow:hidden;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg,#141824,#0b0f17);

        display:flex;

        align-items:center;

        justify-content:center;

        color:#9db1cb;

        font-weight:800;

        flex:0 0 auto;

      }



      .tz-edit-photo-preview img{

        width:100%;

        height:100%;

        object-fit:cover;

      }



      .tz-edit-photo-title{

        color:#fff;

        font-size:16px;

        font-weight:800;

      }



      .tz-edit-photo-sub{

        color:#8f9bb0;

        font-size:13px;

        margin-top:5px;

      }



      .tz-upload-input{

        width:100%;

        padding:14px;

        border-radius:18px;

        border:1px solid rgba(145,203,255,.10);

        background:linear-gradient(180deg, rgba(7,10,16,.98), rgba(4,6,10,1));

        color:#fff;

        box-sizing:border-box;

      }



      .tz-switch-row{

        margin-top:14px;

        display:flex;

        align-items:center;

        justify-content:space-between;

        gap:14px;

        flex-wrap:wrap;

      }



      .tz-switch-copy strong{

        display:block;

        color:#fff;

        font-size:15px;

      }



      .tz-switch-copy span{

        display:block;

        margin-top:4px;

        color:#8f9bb0;

        font-size:13px;

        line-height:1.55;

        max-width:620px;

      }



      .tz-check-wrap{

        flex:0 0 auto;

      }



      .tz-check-wrap input{

        width:22px;

        height:22px;

      }



      .tz-toggle-list{

        display:flex;

        flex-direction:column;

        gap:12px;

      }



      .tz-toggle-row{

        display:flex;

        align-items:center;

        justify-content:space-between;

        gap:14px;

        padding:14px 16px;

        border-radius:18px;

        border:1px solid rgba(255,255,255,.06);

        background:rgba(255,255,255,.02);

        color:#fff;

        font-size:14px;

        font-weight:700;

      }



      .tz-toggle-row input{

        width:20px;

        height:20px;

        flex:0 0 auto;

      }



      .tz-edit-savebar{

        margin-top:4px;

      }



      .tz-edit-savebtn{

        width:100%;

        min-height:56px;

        border:none;

        border-radius:20px;

        cursor:pointer;

        font-size:16px;

        font-weight:900;

        color:#fff;

        background:

          radial-gradient(circle at 50% 0%, rgba(150,230,255,.22), transparent 55%),

          linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));

        box-shadow:

          0 12px 28px rgba(0,0,0,.24),

          0 0 16px rgba(80,150,255,.16),

          inset 0 1px 0 rgba(255,255,255,.14);

      }



      @media(max-width:700px){

        .tz-edit-hero{

          padding:20px 16px;

          border-radius:26px;

        }



        .tz-edit-title{

          font-size:34px;

        }



        .tz-edit-subtitle{

          font-size:15px;

          line-height:1.6;

        }



        .tz-edit-section{

          padding:16px;

          border-radius:22px;

        }



        .tz-edit-grid{

          grid-template-columns:1fr;

        }



        .tz-edit-photo-card{

          align-items:flex-start;

        }



        .tz-edit-savebtn{

          min-height:54px;

          border-radius:18px;

        }

      }

    </style>



    ${renderTapzyAssistant({

      username: profile.username || "User",

      pageType: "edit",

    })}

    `;



    res.send(

      renderShell(`Edit • ${profile.username}`, body, "", {

        currentProfile: req.currentProfile || null,

        pageTitle: "Edit Profile",

        pageType: "edit",

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("Edit page error");

  }

});



router.post("/edit/:username", upload.single("photo"), async (req, res) => {

  try {

    const username = cleanUsername(req.params.username);

    const profile = await prisma.userProfile.findUnique({ where: { username } });



    if (!profile) return res.status(404).send("Profile not found");

    if (!requireOwnerAccess(profile, req, res)) return;



    const keyQuery = ownerKeyQuery(req, profile);

    const removePhoto = !!req.body.removePhoto;



    let photo = profile.photo;



    if (removePhoto) {

      photo = null;

    } else if (req.file) {

      photo = publicAbsoluteUrl(req, `/uploads/${req.file.filename}`);

    }



    const bool = (name) => !!req.body[name];



    await prisma.userProfile.update({

      where: { id: profile.id },

      data: {

        name: String(req.body.name || "").trim() || null,

        title: String(req.body.title || "").trim() || null,

        bio: String(req.body.bio || "").trim() || null,

        photo,



        phone: String(req.body.phone || "").trim() || null,

        email: String(req.body.email || "").trim() || null,

        website: String(req.body.website || "").trim() || null,

        instagram: String(req.body.instagram || "").trim() || null,

        linkedin: String(req.body.linkedin || "").trim() || null,

        tiktok: String(req.body.tiktok || "").trim() || null,

        twitter: String(req.body.twitter || "").trim() || null,

        facebook: String(req.body.facebook || "").trim() || null,

        youtube: String(req.body.youtube || "").trim() || null,

        github: String(req.body.github || "").trim() || null,

        snapchat: String(req.body.snapchat || "").trim() || null,

        whatsapp: String(req.body.whatsapp || "").trim() || null,

        telegram: String(req.body.telegram || "").trim() || null,



        quickShareEnabled: bool("quickShareEnabled"),

        shareNameEnabled: bool("shareNameEnabled"),

        sharePhoneEnabled: bool("sharePhoneEnabled"),

        shareEmailEnabled: bool("shareEmailEnabled"),

        shareWebsiteEnabled: bool("shareWebsiteEnabled"),

        shareInstagramEnabled: bool("shareInstagramEnabled"),

        shareLinkedinEnabled: bool("shareLinkedinEnabled"),

        shareTiktokEnabled: bool("shareTiktokEnabled"),

        shareTwitterEnabled: bool("shareTwitterEnabled"),

        shareFacebookEnabled: bool("shareFacebookEnabled"),

        shareYoutubeEnabled: bool("shareYoutubeEnabled"),

        shareGithubEnabled: bool("shareGithubEnabled"),

        shareSnapchatEnabled: bool("shareSnapchatEnabled"),

        shareWhatsappEnabled: bool("shareWhatsappEnabled"),

        shareTelegramEnabled: bool("shareTelegramEnabled"),

      },

    });



    res.redirect(`/u/${profile.username}${keyQuery ? keyQuery : ""}`);

  } catch (e) {

    console.error(e);

    res.status(500).send("Update failed");

  }

});



router.get("/qr/:username", async (req, res) => {

  try {

    const username = cleanUsername(req.params.username);



    const profile = await prisma.userProfile.findUnique({

      where: { username },

    });



    if (!profile) return res.status(404).send("Profile not found");



    const currentProfile = req.currentProfile || null;

    const profileUrl = `/u/${profile.username}`;

    const displayName = profile.name || profile.username || "Tapzy User";

    const isOwner = !!(currentProfile && currentProfile.id === profile.id);



    const body = `

    <div class="wrap tz-qr-wrap">

      <section class="tz-qr-shell">



        <section class="tz-qr-hero">

          <div class="tz-qr-hero-glow tz-qr-hero-glow-a"></div>

          <div class="tz-qr-hero-glow tz-qr-hero-glow-b"></div>



          <div class="tz-qr-hero-top">

            <div class="tz-qr-hero-copy">

              <div class="tz-qr-kicker">TAPZY SHARE</div>

              <h1 class="tz-qr-title">Tapzy QR</h1>

              <div class="tz-qr-subtitle">

                Instantly share <strong>@${escapeHtml(profile.username || "user")}</strong> with one clean scan.

              </div>

            </div>



            <div class="tz-qr-hero-actions">

              <a class="tz-qr-btn" href="/u/${escapeHtml(profile.username || "")}">Back to Profile</a>

              <a class="tz-qr-btn tz-qr-btn-dark" href="/vcard/${escapeHtml(profile.username || "")}">Save Contact</a>

            </div>

          </div>

        </section>



        <section class="tz-qr-card">

          <div class="tz-qr-frame">

            <div class="tz-qr-frame-inner">

              <img

                src="https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(profileUrl)}"

                alt="Tapzy QR"

                class="tz-qr-image"

              />

            </div>

          </div>



          <div class="tz-qr-meta">

            <div class="tz-qr-meta-name">${escapeHtml(displayName)}</div>

            <div class="tz-qr-meta-handle">@${escapeHtml(profile.username || "user")}</div>

            <div class="tz-qr-meta-caption">Scan to open ${escapeHtml(profileUrl)}</div>

          </div>



          <div class="tz-qr-actions">

            <a class="tz-qr-action" href="${escapeHtml(profileUrl)}">Open Profile</a>

            ${

              isOwner

                ? `<a class="tz-qr-action tz-qr-action-dark" href="/edit/${escapeHtml(profile.username || "")}">Edit Profile</a>`

                : `<a class="tz-qr-action tz-qr-action-dark" href="/vcard/${escapeHtml(profile.username || "")}">Download VCF</a>`

            }

          </div>

        </section>

      </section>

    </div>



    <style>

      .tz-qr-wrap{

        max-width:920px;

      }



      .tz-qr-shell{

        display:flex;

        flex-direction:column;

        gap:18px;

      }



      .tz-qr-hero{

        position:relative;

        overflow:hidden;

        border-radius:34px;

        padding:24px;

        border:1px solid rgba(140,198,255,.10);

        background:

          radial-gradient(900px 420px at 70% 10%, rgba(24,59,93,.34), transparent 45%),

          linear-gradient(180deg, rgba(10,13,20,.98), rgba(6,8,12,1));

        box-shadow:

          0 24px 70px rgba(0,0,0,.56),

          inset 0 1px 0 rgba(255,255,255,.03),

          inset 0 0 0 1px rgba(120,200,255,.02);

      }



      .tz-qr-hero-glow{

        position:absolute;

        border-radius:999px;

        pointer-events:none;

        filter:blur(28px);

      }



      .tz-qr-hero-glow-a{

        width:220px;

        height:220px;

        right:-28px;

        top:-40px;

        background:radial-gradient(circle, rgba(170,242,255,.09) 0%, rgba(170,242,255,.03) 40%, transparent 72%);

      }



      .tz-qr-hero-glow-b{

        width:180px;

        height:180px;

        left:70px;

        bottom:-50px;

        background:radial-gradient(circle, rgba(64,136,255,.08) 0%, rgba(64,136,255,.03) 42%, transparent 75%);

      }



      .tz-qr-hero-top{

        position:relative;

        z-index:2;

        display:flex;

        align-items:flex-start;

        justify-content:space-between;

        gap:18px;

        flex-wrap:wrap;

      }



      .tz-qr-kicker{

        color:#aeb9cf;

        font-size:12px;

        letter-spacing:6px;

        text-transform:uppercase;

        margin-bottom:12px;

      }



      .tz-qr-title{

        margin:0;

        font-size:50px;

        line-height:1;

        letter-spacing:-1.5px;

        font-weight:900;

        color:#fff;

      }



      .tz-qr-subtitle{

        margin-top:12px;

        max-width:680px;

        color:#a7b0c0;

        font-size:18px;

        line-height:1.65;

      }



      .tz-qr-hero-actions{

        display:flex;

        gap:10px;

        flex-wrap:wrap;

      }



      .tz-qr-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:46px;

        padding:0 18px;

        border-radius:16px;

        text-decoration:none;

        border:1px solid rgba(145,203,255,.12);

        background:

          radial-gradient(circle at 50% 0%, rgba(150,230,255,.18), transparent 55%),

          linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));

        color:#fff;

        font-size:14px;

        font-weight:800;

        box-shadow:

          0 0 16px rgba(80,150,255,.16),

          inset 0 1px 0 rgba(255,255,255,.14);

      }



      .tz-qr-btn-dark{

        background:linear-gradient(180deg, rgba(32,35,45,.94), rgba(14,16,23,.98));

        border:1px solid rgba(145,203,255,.12);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 8px 16px rgba(0,0,0,.16);

      }



      .tz-qr-card{

        position:relative;

        overflow:hidden;

        border-radius:34px;

        padding:26px;

        border:1px solid rgba(140,198,255,.10);

        background:

          radial-gradient(720px 360px at 50% 0%, rgba(95,182,255,.10), transparent 42%),

          linear-gradient(180deg, rgba(14,18,28,.96), rgba(8,10,16,.99));

        box-shadow:

          0 24px 70px rgba(0,0,0,.46),

          inset 0 1px 0 rgba(255,255,255,.03);

      }



      .tz-qr-frame{

        display:flex;

        justify-content:center;

      }



      .tz-qr-frame-inner{

        width:min(100%, 480px);

        padding:18px;

        border-radius:34px;

        background:linear-gradient(180deg, #ffffff, #eef6ff);

        box-shadow:

          0 18px 40px rgba(0,0,0,.22),

          inset 0 1px 0 rgba(255,255,255,.8);

      }



      .tz-qr-image{

        display:block;

        width:100%;

        max-width:100%;

        border-radius:24px;

        background:#fff;

      }



      .tz-qr-meta{

        text-align:center;

        margin-top:18px;

      }



      .tz-qr-meta-name{

        color:#fff;

        font-size:24px;

        font-weight:900;

        letter-spacing:-.4px;

      }



      .tz-qr-meta-handle{

        margin-top:6px;

        color:#b8c4d7;

        font-size:16px;

      }



      .tz-qr-meta-caption{

        margin-top:10px;

        color:#96a2b7;

        font-size:15px;

      }



      .tz-qr-actions{

        display:flex;

        gap:12px;

        justify-content:center;

        flex-wrap:wrap;

        margin-top:20px;

      }



      .tz-qr-action{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:46px;

        padding:0 18px;

        border-radius:16px;

        text-decoration:none;

        border:1px solid rgba(145,203,255,.12);

        background:

          radial-gradient(circle at 50% 0%, rgba(150,230,255,.18), transparent 55%),

          linear-gradient(180deg, rgba(40,92,210,.92), rgba(18,41,92,.98));

        color:#fff;

        font-size:14px;

        font-weight:800;

        box-shadow:

          0 0 16px rgba(80,150,255,.16),

          inset 0 1px 0 rgba(255,255,255,.14);

      }



      .tz-qr-action-dark{

        background:linear-gradient(180deg, rgba(32,35,45,.94), rgba(14,16,23,.98));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 8px 16px rgba(0,0,0,.16);

      }



      @media(max-width:700px){

        .tz-qr-hero,

        .tz-qr-card{

          padding:20px 16px;

          border-radius:28px;

        }



        .tz-qr-title{

          font-size:34px;

        }



        .tz-qr-subtitle{

          font-size:15px;

          line-height:1.6;

        }



        .tz-qr-kicker{

          font-size:11px;

          letter-spacing:5px;

        }



        .tz-qr-frame-inner{

          padding:14px;

          border-radius:24px;

        }



        .tz-qr-meta-name{

          font-size:21px;

        }



        .tz-qr-meta-handle,

        .tz-qr-meta-caption{

          font-size:14px;

        }



        .tz-qr-btn,

        .tz-qr-action{

          min-height:44px;

          padding:0 16px;

          border-radius:14px;

          font-size:13px;

        }

      }

    </style>



    ${renderTapzyAssistant({

      username: profile.username || "User",

      pageType: "qr",

    })}

    `;



    res.send(

      renderShell(`QR • ${profile.username}`, body, "", {

        currentProfile: currentProfile,

        pageTitle: "QR",

        pageType: "qr",

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("QR error");

  }

});



router.get("/vcard/:username", async (req, res) => {

  try {

    const username = cleanUsername(req.params.username);



    const profile = await prisma.userProfile.findUnique({

      where: { username },

    });



    if (!profile) return res.status(404).send("Profile not found");



    const vcf = makeVcf(profile);



    res.setHeader("Content-Type", "text/vcard; charset=utf-8");

    res.setHeader("Content-Disposition", `attachment; filename="${profile.username || "tapzy"}.vcf"`);

    return res.send(vcf);

  } catch (e) {

    console.error(e);

    return res.status(500).send("VCF error");

  }

});



router.post("/logout", async (req, res) => {

  return res.redirect(backUrl(req, "/"));

});



module.exports = router;