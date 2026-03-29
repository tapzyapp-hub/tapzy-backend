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



/* =========================

   PROFILE PAGE

========================= */



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



    const displayName = profile.name || profile.username || "Tapzy User";



    const photoHtml = profile.photo

      ? `<img src="${escapeHtml(profile.photo)}" />`

      : escapeHtml(displayName[0].toUpperCase());



    const showMessageButton =

      currentProfile && currentProfile.id !== profile.id;

    const showFollowButton =

      currentProfile && currentProfile.id !== profile.id;



    const body = `

<div class="wrap profile-wrap">



  <!-- HERO -->

  <section class="elite-hero">

    <div class="elite-glow"></div>



    <div class="elite-top">

      <div class="elite-avatar">${photoHtml}</div>



      <div class="elite-info">

        <h1>${escapeHtml(displayName)}</h1>

        <div class="elite-handle">@${escapeHtml(profile.username)}</div>



        <div class="elite-actions">

          ${

            showFollowButton

              ? renderFollowButton(

                  currentProfile,

                  profile,

                  followState.isFollowing

                )

              : ""

          }



          ${

            showMessageButton

              ? `

              <form method="POST" action="/messages/start/${escapeHtml(

                profile.username

              )}">

                <button class="elite-btn">Message</button>

              </form>

            `

              : ""

          }



          <a class="elite-btn" href="/qr/${escapeHtml(

            profile.username

          )}">QR</a>



          <a class="elite-btn" href="/vcard/${escapeHtml(

            profile.username

          )}">Save</a>

        </div>



        <div class="elite-signed">

          ${currentProfileNoticeHtml(currentProfile)}

        </div>

      </div>

    </div>



    <!-- STATS -->

    <div class="elite-stats">

      <div><b>${profile.connections || 0}</b><span>Connections</span></div>

      <div><b>${profile.followers?.length || 0}</b><span>Followers</span></div>

      <div><b>${profile.following?.length || 0}</b><span>Following</span></div>

    </div>

  </section>



  <!-- STATUS -->

  <section class="elite-card">

    <div class="elite-title">Status</div>

    <div class="elite-status">

      <span class="dot"></span>

      Open to networking

    </div>

  </section>



  <!-- BIO -->

  ${

    profile.title || profile.bio

      ? `

      <section class="elite-card">

        ${

          profile.title

            ? `<div class="elite-title">${escapeHtml(profile.title)}</div>`

            : ""

        }

        ${

          profile.bio

            ? `<div class="elite-text">${escapeHtml(profile.bio)}</div>`

            : ""

        }

      </section>

    `

      : ""

  }



  <!-- QUICK SHARE -->

  ${

    quickPreview.length

      ? `

      <section class="elite-card">

        <div class="elite-title">Quick Share</div>

        <div class="elite-tags">

          ${quickPreview

            .map((x) => `<span>${escapeHtml(x)}</span>`)

            .join("")}

        </div>

      </section>

    `

      : ""

  }



  <!-- LINKS -->

  <section class="elite-links">

    ${profile.phone ? linkRow("Phone", `tel:${profile.phone}`) : ""}

    ${profile.email ? linkRow("Email", `mailto:${profile.email}`) : ""}

    ${

      profile.instagram

        ? linkRow(

            "Instagram",

            `https://instagram.com/${stripAt(profile.instagram)}`

          )

        : ""

    }

    ${

      profile.website

        ? linkRow("Website", safeUrl(profile.website))

        : ""

    }

    ${

      profile.linkedin

        ? linkRow("LinkedIn", safeUrl(profile.linkedin))

        : ""

    }

  </section>



  ${

    currentProfile && currentProfile.id === profile.id

      ? `<a class="elite-edit" href="/edit/${escapeHtml(

          profile.username

        )}">Edit Profile</a>`

      : ""

  }



</div>



<style>



/* HERO */



.elite-hero{

  padding:22px;

  border-radius:26px;

  background:#07090d;

  position:relative;

  overflow:hidden;

}



.elite-glow{

  position:absolute;

  width:300px;

  height:160px;

  top:-50px;

  right:-50px;

  background:radial-gradient(circle, rgba(0,140,255,.3), transparent);

  filter:blur(40px);

}



.elite-top{

  display:flex;

  gap:16px;

}



.elite-avatar{

  width:90px;

  height:90px;

  border-radius:20px;

  overflow:hidden;

  background:#111;

}



.elite-avatar img{

  width:100%;

  height:100%;

  object-fit:cover;

}



.elite-info h1{

  font-size:28px;

  margin:0;

}



.elite-handle{

  color:#888;

  margin-top:4px;

}



/* ACTIONS */



.elite-actions{

  margin-top:10px;

  display:flex;

  gap:8px;

  flex-wrap:wrap;

}



.elite-btn{

  padding:8px 14px;

  border-radius:12px;

  background:#11151d;

  border:1px solid rgba(255,255,255,.06);

  color:#fff;

  font-weight:700;

}



/* STATS */



.elite-stats{

  margin-top:16px;

  display:flex;

  justify-content:space-around;

  text-align:center;

}



.elite-stats b{

  font-size:18px;

}



.elite-stats span{

  font-size:11px;

  color:#888;

}



/* CARDS */



.elite-card{

  margin-top:14px;

  padding:14px;

  border-radius:18px;

  background:#0c0f14;

}



.elite-title{

  font-weight:800;

  margin-bottom:8px;

}



.elite-text{

  color:#bbb;

}



/* STATUS */



.elite-status{

  display:flex;

  align-items:center;

  gap:8px;

}



.dot{

  width:8px;

  height:8px;

  background:#00ff88;

  border-radius:50%;

}



/* TAGS */



.elite-tags span{

  display:inline-block;

  margin:4px;

  padding:5px 10px;

  border-radius:999px;

  background:#111;

  font-size:12px;

}



/* LINKS */



.elite-links{

  margin-top:14px;

  display:grid;

  gap:10px;

}



.elite-link{

  display:flex;

  justify-content:space-between;

  padding:14px;

  border-radius:16px;

  background:#0f131a;

  text-decoration:none;

  color:#fff;

}



/* EDIT */



.elite-edit{

  display:block;

  margin-top:16px;

  padding:14px;

  text-align:center;

  border-radius:16px;

  background:#111;

  text-decoration:none;

  color:#fff;

}



</style>



${renderTapzyAssistant({

  username: profile.username,

  pageType: "profile",

})}

`;



    res.send(

      renderShell(`@${profile.username}`, body, "", {

        currentProfile,

        pageType: "profile",

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("Profile error");

  }

});



/* =========================

   HELPER

========================= */



function linkRow(label, href) {

  return `

  <a class="elite-link" href="${href}" target="_blank">

    <span>${label}</span>

    <span>›</span>

  </a>

  `;

}



/* =========================

   VCF

========================= */



router.get("/vcard/:username", async (req, res) => {

  try {

    const username = cleanUsername(req.params.username);

    const profile = await prisma.userProfile.findUnique({

      where: { username },

    });



    if (!profile) return res.status(404).send("Not found");



    const vcf = makeVcf(profile);



    res.setHeader("Content-Type", "text/vcard");

    res.setHeader(

      "Content-Disposition",

      `attachment; filename="${profile.username}.vcf"`

    );



    res.send(vcf);

  } catch (e) {

    res.status(500).send("VCF error");

  }

});



module.exports = router;



