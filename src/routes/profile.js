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



    if (!profile) return res.status(404).send("Profile not found");



    const currentProfile = req.currentProfile || null;

    const followState = await getFollowState(currentProfile?.id, profile.id);

    const quickPreview = buildQuickSharePreview(profile);



    const isTapOpen = String(req.query.tap || "") === "1";

    const displayName = profile.name || profile.username || "Tapzy User";

    const vcardUrl = `/vcard/${profile.username}`;



    const isOwner = currentProfile && currentProfile.id === profile.id;



    const photoHtml = profile.photo

      ? `<img src="${escapeHtml(profile.photo)}" />`

      : `<span>${escapeHtml(displayName[0].toUpperCase())}</span>`;



    const body = `

    <div class="wrap profile-wrap">



      ${

        isTapOpen

          ? `

          <div id="tapOverlay" class="tap-overlay">

            <div class="tap-card">Tap detected</div>

          </div>

        `

          : ""

      }



      <!-- PROFILE -->

      <section class="profile">



        <div class="profile-top">



          <div class="avatar">

            ${photoHtml}

          </div>



          <div class="info">

            <div class="name">${escapeHtml(displayName)}</div>

            <div class="handle">@${escapeHtml(profile.username)}</div>



            <div class="actions">



              ${

                isOwner

                  ? `<a class="btn" href="/edit/${profile.username}">Edit</a>`

                  : renderFollowButton(currentProfile, profile, followState.isFollowing)

              }



              <a class="btn" href="/qr/${profile.username}">QR</a>

              <a class="btn" href="${vcardUrl}">Save</a>



            </div>



            <div class="signed">

              ${currentProfileNoticeHtml(currentProfile)}

            </div>

          </div>



        </div>



        <div class="stats">

          <div><strong>${profile.connections || 0}</strong><span>Connections</span></div>

          <div><strong>${profile.followers.length}</strong><span>Followers</span></div>

          <div><strong>${profile.following.length}</strong><span>Following</span></div>

        </div>



      </section>



      <!-- STATUS -->

      ${

        profile.bio

          ? `<div class="card"><span class="dot"></span>${escapeHtml(profile.bio)}</div>`

          : ""

      }



      <!-- TITLE -->

      ${

        profile.title

          ? `<div class="card">${escapeHtml(profile.title)}</div>`

          : ""

      }



      <!-- QUICK SHARE -->

      ${

        quickPreview.length

          ? `

        <div class="card">

          <div class="title">Quick Share</div>

          <div class="tags">

            ${quickPreview.map(t => `<span>${t}</span>`).join("")}

          </div>

        </div>`

          : ""

      }



      <!-- LINKS -->

      <div class="links">



        ${profile.phone ? profileLinkRow("Phone", `tel:${profile.phone}`) : ""}

        ${profile.email ? profileLinkRow("Email", `mailto:${profile.email}`) : ""}

        ${profile.instagram ? profileLinkRow("Instagram", `https://instagram.com/${stripAt(profile.instagram)}`) : ""}

        ${profile.tiktok ? profileLinkRow("TikTok", `https://tiktok.com/@${stripAt(profile.tiktok)}`) : ""}

        ${profile.website ? profileLinkRow("Website", safeUrl(profile.website)) : ""}

        ${profile.linkedin ? profileLinkRow("LinkedIn", safeUrl(profile.linkedin)) : ""}

        ${profile.twitter ? profileLinkRow("X", `https://x.com/${stripAt(profile.twitter)}`) : ""}

        ${profile.facebook ? profileLinkRow("Facebook", `https://facebook.com/${stripAt(profile.facebook)}`) : ""}

        ${profile.youtube ? profileLinkRow("YouTube", `https://youtube.com/@${stripAt(profile.youtube)}`) : ""}

        ${profile.github ? profileLinkRow("GitHub", `https://github.com/${stripAt(profile.github)}`) : ""}

        ${profile.snapchat ? profileLinkRow("Snapchat", `https://snapchat.com/add/${stripAt(profile.snapchat)}`) : ""}

        ${profile.whatsapp ? profileLinkRow("WhatsApp", `https://wa.me/${profile.whatsapp}`) : ""}

        ${profile.telegram ? profileLinkRow("Telegram", `https://t.me/${stripAt(profile.telegram)}`) : ""}



      </div>



    </div>



    <style>



    body{

      background:#000;

      color:#fff;

    }



    .profile-wrap{

      max-width:600px;

      margin:auto;

    }



    .profile{

      padding:20px;

      border-radius:24px;

      background:#0b0f1a;

      margin-bottom:16px;

    }



    .profile-top{

      display:flex;

      gap:16px;

    }



    .avatar{

      width:90px;

      height:90px;

      border-radius:20px;

      background:#111;

      display:flex;

      align-items:center;

      justify-content:center;

      overflow:hidden;

      font-size:28px;

      font-weight:800;

    }



    .avatar img{

      width:100%;

      height:100%;

      object-fit:cover;

    }



    .name{

      font-size:24px;

      font-weight:800;

    }



    .handle{

      font-size:14px;

      color:#888;

      margin-top:4px;

    }



    .actions{

      display:flex;

      gap:8px;

      margin-top:10px;

      flex-wrap:wrap;

    }



    .btn{

      padding:8px 14px;

      border-radius:12px;

      background:#111;

      text-decoration:none;

      color:#fff;

      font-size:13px;

    }



    .signed{

      font-size:12px;

      margin-top:8px;

      color:#666;

    }



    .stats{

      display:flex;

      justify-content:space-between;

      margin-top:14px;

      color:#aaa;

    }



    .stats strong{

      display:block;

      color:#fff;

    }



    .card{

      background:#0a0a0a;

      padding:16px;

      border-radius:16px;

      margin-bottom:12px;

    }



    .dot{

      width:8px;

      height:8px;

      background:#00ff88;

      border-radius:50%;

      display:inline-block;

      margin-right:8px;

    }



    .title{

      font-weight:700;

      margin-bottom:8px;

    }



    .tags span{

      background:#111;

      padding:6px 10px;

      border-radius:12px;

      margin:4px;

      display:inline-block;

      font-size:12px;

    }



    .links{

      display:flex;

      flex-direction:column;

      gap:10px;

    }



    .profile-simple-link{

      padding:16px;

      border-radius:16px;

      background:#0a0a0a;

      display:flex;

      justify-content:space-between;

      color:#fff;

      text-decoration:none;

    }



    </style>



    ${

      isTapOpen

        ? `

        <script>

          setTimeout(()=>{

            const overlay = document.getElementById("tapOverlay");

            if(overlay) overlay.remove();

          },1200);

        </script>

      `

        : ""

    }



    ${renderTapzyAssistant({

      username: profile.username,

      pageType: "profile",

    })}

    `;



    res.send(

      renderShell(`@${profile.username}`, body, "", {

        currentProfile,

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("Profile error");

  }

});