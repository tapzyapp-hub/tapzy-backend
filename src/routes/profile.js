const router = require("express").Router();



const prisma = require("../prisma");

const {

  cleanUsername,

  escapeHtml,

  safeUrl,

  stripAt,

  publicAbsoluteUrl,

  makeVcf,

  renderShell,

  renderTapzyAssistant,

  renderFollowButton,

  getFollowState,

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

    const isOwner = currentProfile && currentProfile.id === profile.id;



    const followState = await getFollowState(currentProfile?.id, profile.id);



    const displayName = profile.name || profile.username || "Tapzy User";



    const avatar = profile.photo

      ? `<img src="${escapeHtml(profile.photo)}" />`

      : escapeHtml(displayName[0].toUpperCase());



    const body = `

    <div class="wrap profile-wrap">



      <!-- HERO -->

      <div class="hero">

        <div class="avatar">${avatar}</div>



        <div class="hero-main">

          <h1>${escapeHtml(displayName)}</h1>

          <div class="handle">@${escapeHtml(profile.username)}</div>



          <div class="actions">

            ${

              currentProfile && !isOwner

                ? renderFollowButton(currentProfile, profile, followState.isFollowing)

                : ""

            }



            ${

              currentProfile && !isOwner

                ? `<form method="POST" action="/messages/start/${profile.username}">

                    <button class="btn">Message</button>

                  </form>`

                : ""

            }



            <a class="btn" href="/qr/${profile.username}">QR</a>

            <a class="btn" href="/vcard/${profile.username}">Save</a>



            ${

              isOwner

                ? `<a class="btn" href="/edit/${profile.username}">Edit</a>`

                : ""

            }

          </div>



          <div class="signed">

            ${

              currentProfile

                ? `Signed in as @${escapeHtml(currentProfile.username)}`

                : ""

            }

          </div>

        </div>

      </div>



      <!-- STATS -->

      <div class="stats">

        <div><b>${profile.connections || 0}</b><span>Connections</span></div>

        <div><b>${profile.followers.length}</b><span>Followers</span></div>

        <div><b>${profile.following.length}</b><span>Following</span></div>

      </div>



      ${

        profile.title

          ? `<div class="card"><b>${escapeHtml(profile.title)}</b></div>`

          : ""

      }



      ${

        profile.bio

          ? `<div class="card">${escapeHtml(profile.bio)}</div>`

          : ""

      }



      <!-- LINKS -->

      <div class="links">

        ${profile.phone ? linkRow("Phone", `tel:${profile.phone}`) : ""}

        ${profile.email ? linkRow("Email", `mailto:${profile.email}`) : ""}

        ${

          profile.instagram

            ? linkRow("Instagram", `https://instagram.com/${stripAt(profile.instagram)}`)

            : ""

        }

        ${profile.website ? linkRow("Website", safeUrl(profile.website)) : ""}

      </div>



    </div>



    <style>



      .profile-wrap{

        max-width:820px;

        padding-bottom:80px;

      }



      .hero{

        display:flex;

        gap:16px;

        padding:20px;

        border-radius:24px;

        background:linear-gradient(180deg,#0b0f16,#000);

        border:1px solid rgba(255,255,255,.06);

      }



      .avatar{

        width:90px;

        height:90px;

        border-radius:20px;

        display:flex;

        align-items:center;

        justify-content:center;

        font-size:34px;

        font-weight:900;

        background:#111;

      }



      .avatar img{

        width:100%;

        height:100%;

        object-fit:cover;

      }



      .hero-main h1{

        margin:0;

        font-size:28px;

      }



      .handle{

        color:#9aa6b2;

        margin-top:4px;

      }



      .actions{

        display:flex;

        gap:10px;

        flex-wrap:wrap;

        margin-top:10px;

      }



      .btn{

        padding:10px 14px;

        border-radius:14px;

        border:1px solid rgba(255,255,255,.08);

        background:#111;

        color:#fff;

        font-weight:700;

      }



      .signed{

        margin-top:10px;

        font-size:13px;

        color:#aaa;

      }



      .stats{

        display:flex;

        justify-content:space-between;

        margin-top:16px;

        padding:14px;

        border-radius:20px;

        background:#0b0f16;

      }



      .stats div{

        text-align:center;

      }



      .stats b{

        display:block;

        font-size:18px;

      }



      .stats span{

        font-size:12px;

        color:#888;

      }



      .card{

        margin-top:14px;

        padding:16px;

        border-radius:18px;

        background:#0b0f16;

      }



      .links{

        margin-top:14px;

        display:flex;

        flex-direction:column;

        gap:10px;

      }



      .link{

        padding:16px;

        border-radius:18px;

        background:#0b0f16;

        display:flex;

        justify-content:space-between;

        text-decoration:none;

        color:#fff;

      }



    </style>



    ${renderTapzyAssistant({

      username: profile.username,

      pageType: "profile",

    })}

    `;



    res.send(renderShell(profile.username, body, "", { currentProfile }));

  } catch (e) {

    console.error(e);

    res.status(500).send("Profile error");

  }

});



/* =========================

   EDIT PAGE (RESTORED)

========================= */



router.get("/edit/:username", async (req, res) => {

  try {

    const username = cleanUsername(req.params.username);



    const profile = await prisma.userProfile.findUnique({

      where: { username },

    });



    if (!profile) return res.status(404).send("Not found");



    if (!req.currentProfile || req.currentProfile.id !== profile.id) {

      return res.redirect(`/u/${username}`);

    }



    const body = `

    <div class="wrap" style="max-width:700px;">



      <h1>Edit Profile</h1>



      <form method="POST" action="/edit/${username}" enctype="multipart/form-data">



        <input name="name" value="${escapeHtml(profile.name || "")}" placeholder="Name" />

        <input name="title" value="${escapeHtml(profile.title || "")}" placeholder="Title" />

        <textarea name="bio">${escapeHtml(profile.bio || "")}</textarea>



        <input name="phone" value="${escapeHtml(profile.phone || "")}" />

        <input name="email" value="${escapeHtml(profile.email || "")}" />

        <input name="website" value="${escapeHtml(profile.website || "")}" />



        <input type="file" name="photo" />



        <button type="submit">Save</button>

      </form>

    </div>

    `;



    res.send(renderShell("Edit", body));

  } catch (e) {

    res.status(500).send("Edit error");

  }

});



/* ========================= */



function linkRow(label, href) {

  return `

    <a class="link" href="${escapeHtml(href)}" target="_blank">

      <span>${label}</span>

      <span>›</span>

    </a>

  `;

}



module.exports = router;

