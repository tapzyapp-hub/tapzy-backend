const router = require("express").Router();

const prisma = require("../prisma");

const { upload } = require("../upload");

const {

  cleanUsername,

  escapeHtml,

  formatPrettyLocal,

  renderShell,

  renderTapzyAssistant,

  getOrCreateConversationBetween,

  publicAbsoluteUrl,

} = require("../utils");



router.post("/messages/start/:username", async (req, res) => {

  try {

    const currentProfile = req.currentProfile;

    if (!currentProfile) return res.redirect("/auth");



    const username = cleanUsername(req.params.username);

    const other = await prisma.userProfile.findUnique({

      where: { username },

    });



    if (!other) return res.status(404).send("User not found");

    if (other.id === currentProfile.id) return res.redirect("/messages");



    const conversation = await getOrCreateConversationBetween(

      currentProfile.id,

      other.id

    );



    return res.redirect(`/messages/${conversation.id}`);

  } catch (e) {

    console.error(e);

    return res.status(500).send("Start conversation error");

  }

});



router.get("/messages", async (req, res) => {

  try {

    const currentProfile = req.currentProfile;

    if (!currentProfile) return res.redirect("/auth");



    const conversations = await prisma.conversation.findMany({

      where: {

        members: {

          some: { profileId: currentProfile.id },

        },

      },

      include: {

        members: {

          include: { profile: true },

        },

        messages: {

          orderBy: { createdAt: "desc" },

          take: 1,

          include: { sender: true },

        },

      },

      orderBy: { updatedAt: "desc" },

    });



    const rows = conversations.map((c) => {

      const otherMember = c.members.find((m) => m.profileId !== currentProfile.id);

      const other = otherMember?.profile;

      const lastMessage = c.messages[0];



      const preview = lastMessage

        ? (

            lastMessage.body

              ? escapeHtml(lastMessage.body)

              : (lastMessage.imageUrl ? "Sent an image" : "No messages yet")

          )

        : "No messages yet";



      const time = lastMessage ? formatPrettyLocal(lastMessage.createdAt) : "";



      const avatarHtml = other?.photo

        ? `<img src="${escapeHtml(other.photo)}" alt="${escapeHtml(other.username || "user")}" />`

        : escapeHtml(((other?.name || other?.username || "T").slice(0, 1)).toUpperCase());



      return `

      <a class="tz-msg-row" href="/messages/${c.id}">

        <div class="tz-msg-row-avatar">${avatarHtml}</div>



        <div class="tz-msg-row-main">

          <div class="tz-msg-row-top">

            <div class="tz-msg-row-copy">

              <div class="tz-msg-row-name">${escapeHtml(other?.name || other?.username || "Unknown")}</div>

              <div class="tz-msg-row-user">@${escapeHtml(other?.username || "user")}</div>

            </div>



            ${

              time

                ? `<div class="tz-msg-row-time">${escapeHtml(time)}</div>`

                : ""

            }

          </div>



          <div class="tz-msg-row-preview">${preview}</div>

        </div>



        <div class="tz-msg-row-arrow">›</div>

      </a>

      `;

    });



    const body = `

    <div class="wrap tz-page-wrap" style="max-width:980px;">

      <section class="tz-premium-card tz-premium-hero">

        <div class="tz-premium-glow tz-premium-glow-a"></div>

        <div class="tz-premium-glow tz-premium-glow-b"></div>



        <div class="tz-premium-kicker">TAPZY NETWORK™</div>

        <h1 class="tz-premium-title">Messages</h1>

        <div class="tz-premium-subtitle">

          Premium private conversations built directly into your Tapzy network.

        </div>



        <div class="tz-premium-actions">

          <a class="tz-premium-btn" href="/search">Start Conversation</a>

        </div>

      </section>



      <section class="tz-premium-card tz-premium-section" style="margin-top:18px;">

        <div class="tz-premium-section-head">

          <h3>Inbox</h3>

          <p>${conversations.length} conversation${conversations.length === 1 ? "" : "s"} in your Tapzy network.</p>

        </div>



        <div class="tz-msg-list">

          ${

            rows.length

              ? rows.join("")

              : `

                <div class="tz-premium-empty">

                  <h3>No conversations yet</h3>

                  <p>Start a new Tapzy conversation from search or a profile page.</p>

                  <div style="margin-top:16px;">

                    <a class="tz-premium-btn" href="/search">Find People</a>

                  </div>

                </div>

              `

          }

        </div>

      </section>

    </div>



    <style>

      .tz-page-wrap{

        padding-top:18px;

        padding-bottom:36px;

      }



      .tz-premium-card{

        position:relative;

        overflow:hidden;

        border-radius:34px;

        border:1px solid rgba(255,255,255,.06);

        background:

          radial-gradient(720px 340px at 73% 17%, rgba(18,74,160,.34), transparent 40%),

          radial-gradient(520px 240px at 20% 0%, rgba(0,58,160,.10), transparent 42%),

          linear-gradient(180deg, rgba(5,7,12,.985), rgba(1,2,6,1));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.03),

          0 0 0 1px rgba(255,255,255,.015),

          0 18px 48px rgba(0,0,0,.34);

      }



      .tz-premium-hero{

        padding:42px 40px 34px 40px;

      }



      .tz-premium-section{

        padding:32px 28px 24px 28px;

      }



      .tz-premium-glow{

        position:absolute;

        border-radius:999px;

        pointer-events:none;

        filter:blur(24px);

        opacity:.65;

      }



      .tz-premium-glow-a{

        width:340px;

        height:240px;

        right:90px;

        top:10px;

        background:radial-gradient(circle, rgba(36,114,230,.26) 0%, rgba(36,114,230,0) 72%);

      }



      .tz-premium-glow-b{

        width:170px;

        height:170px;

        left:-34px;

        top:-40px;

        background:radial-gradient(circle, rgba(33,104,219,.12) 0%, rgba(33,104,219,0) 72%);

      }



      .tz-premium-kicker{

        position:relative;

        z-index:1;

        margin:0 0 16px 0;

        color:#d9e8ff;

        text-transform:uppercase;

        letter-spacing:.28em;

        font-size:17px;

      }



      .tz-premium-title{

        position:relative;

        z-index:1;

        margin:0;

        color:#fff;

        font-weight:900;

        font-size:68px;

        line-height:.96;

        letter-spacing:-.045em;

      }



      .tz-premium-subtitle{

        position:relative;

        z-index:1;

        margin-top:18px;

        max-width:720px;

        color:#edf4ff;

        font-size:22px;

        line-height:1.5;

      }



      .tz-premium-actions{

        position:relative;

        z-index:1;

        display:flex;

        gap:14px;

        flex-wrap:wrap;

        margin-top:28px;

      }



      .tz-premium-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:64px;

        padding:0 28px;

        border-radius:24px;

        text-decoration:none;

        color:#fff;

        font-weight:800;

        font-size:18px;

        background:linear-gradient(180deg, rgba(8,10,16,.98), rgba(4,6,11,.98));

        border:1px solid rgba(255,255,255,.07);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 10px 24px rgba(0,0,0,.28);

        transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease;

      }



      .tz-premium-btn:hover{

        transform:translateY(-1px);

        border-color:rgba(111,190,255,.22);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.05),

          0 16px 30px rgba(0,0,0,.30),

          0 0 22px rgba(43,124,255,.08);

      }



      .tz-premium-section-head h3{

        margin:0;

        color:#fff;

        font-size:28px;

        font-weight:800;

      }



      .tz-premium-section-head p{

        margin:10px 0 0 0;

        color:#cfd9ea;

        font-size:18px;

        line-height:1.55;

      }



      .tz-premium-empty{

        margin-top:20px;

        border-radius:28px;

        padding:26px;

        border:1px solid rgba(255,255,255,.06);

        background:linear-gradient(180deg, rgba(7,9,14,.96), rgba(2,3,8,.98));

      }



      .tz-premium-empty h3{

        margin:0;

        color:#fff;

        font-size:24px;

      }



      .tz-premium-empty p{

        margin:10px 0 0 0;

        color:#c8d5ea;

        font-size:16px;

        line-height:1.6;

      }



      .tz-msg-list{

        display:grid;

        gap:14px;

        margin-top:22px;

      }



      .tz-msg-row{

        display:grid;

        grid-template-columns:auto 1fr auto;

        align-items:center;

        gap:16px;

        padding:18px;

        border-radius:26px;

        text-decoration:none;

        background:

          radial-gradient(420px 180px at 82% 18%, rgba(40,110,220,.10), transparent 42%),

          linear-gradient(180deg, rgba(8,10,16,.985), rgba(3,5,9,1));

        border:1px solid rgba(255,255,255,.06);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.03),

          0 10px 24px rgba(0,0,0,.22);

        transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease;

      }



      .tz-msg-row:hover{

        transform:translateY(-1px);

        border-color:rgba(111,190,255,.20);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 16px 30px rgba(0,0,0,.28),

          0 0 20px rgba(45,120,240,.08);

      }



      .tz-msg-row-avatar{

        width:68px;

        height:68px;

        border-radius:22px;

        overflow:hidden;

        display:flex;

        align-items:center;

        justify-content:center;

        background:linear-gradient(180deg, #090c14, #02040a);

        border:1px solid rgba(255,255,255,.07);

        color:#fff;

        font-size:26px;

        font-weight:900;

        box-shadow:0 10px 20px rgba(0,0,0,.26);

      }



      .tz-msg-row-avatar img{

        width:100%;

        height:100%;

        object-fit:cover;

      }



      .tz-msg-row-main{

        min-width:0;

      }



      .tz-msg-row-top{

        display:flex;

        justify-content:space-between;

        align-items:flex-start;

        gap:12px;

      }



      .tz-msg-row-copy{

        min-width:0;

        flex:1;

      }



      .tz-msg-row-name{

        color:#fff;

        font-size:22px;

        font-weight:800;

        line-height:1.15;

        white-space:nowrap;

        overflow:hidden;

        text-overflow:ellipsis;

      }



      .tz-msg-row-user{

        margin-top:6px;

        color:#b9c8df;

        font-size:15px;

        white-space:nowrap;

        overflow:hidden;

        text-overflow:ellipsis;

      }



      .tz-msg-row-time{

        color:#8ea1bf;

        font-size:12px;

        white-space:nowrap;

        margin-left:8px;

      }



      .tz-msg-row-preview{

        margin-top:12px;

        color:#edf4ff;

        font-size:15px;

        line-height:1.55;

        white-space:nowrap;

        overflow:hidden;

        text-overflow:ellipsis;

      }



      .tz-msg-row-arrow{

        color:#8da4c6;

        font-size:28px;

        line-height:1;

      }



      @media(max-width:900px){

        .tz-premium-hero{

          padding:34px 28px 28px 28px;

        }



        .tz-premium-section{

          padding:26px 22px 20px 22px;

        }



        .tz-premium-title{

          font-size:52px;

        }



        .tz-premium-subtitle{

          font-size:19px;

        }

      }



      @media(max-width:700px){

        .tz-page-wrap{

          padding-top:14px;

        }



        .tz-premium-card{

          border-radius:28px;

        }



        .tz-premium-hero{

          padding:28px 20px 24px 20px;

        }



        .tz-premium-section{

          padding:22px 16px 16px 16px;

        }



        .tz-premium-kicker{

          font-size:13px;

          letter-spacing:.24em;

        }



        .tz-premium-title{

          font-size:42px;

          line-height:1;

        }



        .tz-premium-subtitle{

          margin-top:14px;

          font-size:16px;

          line-height:1.6;

        }



        .tz-premium-btn{

          min-height:56px;

          padding:0 20px;

          border-radius:20px;

          font-size:16px;

        }



        .tz-premium-section-head h3{

          font-size:24px;

        }



        .tz-premium-section-head p{

          font-size:15px;

        }



        .tz-msg-row{

          grid-template-columns:auto 1fr;

          gap:14px;

          padding:15px;

          border-radius:22px;

        }



        .tz-msg-row-arrow{

          display:none;

        }



        .tz-msg-row-avatar{

          width:56px;

          height:56px;

          border-radius:18px;

          font-size:22px;

        }



        .tz-msg-row-name{

          font-size:18px;

        }



        .tz-msg-row-user{

          font-size:13px;

        }



        .tz-msg-row-time{

          font-size:11px;

        }



        .tz-msg-row-preview{

          margin-top:10px;

          font-size:14px;

        }

      }

    </style>



    ${renderTapzyAssistant({

      username: currentProfile.username || "User",

      pageType: "messages-list",

    })}

    `;



    res.send(

      renderShell("Messages", body, "", {

        currentProfile,

        pageTitle: "Messages",

        pageType: "messages-list",

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("Messages page error");

  }

});



router.get("/messages/:id", async (req, res) => {

  try {

    const currentProfile = req.currentProfile;

    if (!currentProfile) return res.redirect("/auth");



    const id = String(req.params.id || "").trim();



    const conversation = await prisma.conversation.findUnique({

      where: { id },

      include: {

        members: {

          include: { profile: true },

        },

        messages: {

          orderBy: { createdAt: "asc" },

          take: 200,

          include: { sender: true },

        },

      },

    });



    if (!conversation) return res.status(404).send("Conversation not found");



    const isMember = conversation.members.some((m) => m.profileId === currentProfile.id);

    if (!isMember) return res.status(403).send("Forbidden");



    const otherMember = conversation.members.find((m) => m.profileId !== currentProfile.id);

    const other = otherMember?.profile;



    const otherAvatarHtml = other?.photo

      ? `<img src="${escapeHtml(other.photo)}" alt="${escapeHtml(other.username || "user")}" />`

      : escapeHtml(((other?.name || other?.username || "T").slice(0, 1)).toUpperCase());



    const messagesHtml = conversation.messages.map((m) => {

      const isMine = m.senderProfileId === currentProfile.id;



      return `

      <div class="tz-chat-row ${isMine ? "mine" : "other"}">

        <div class="tz-chat-bubble ${isMine ? "mine" : "other"}">

          ${m.body ? `<div>${escapeHtml(m.body)}</div>` : ""}

          ${

            m.imageUrl

              ? `<img class="tz-chat-image" src="${escapeHtml(m.imageUrl)}" alt="Message image" />`

              : ""

          }

          <div class="tz-chat-time">${escapeHtml(formatPrettyLocal(m.createdAt))}</div>

        </div>

      </div>

      `;

    }).join("");



    const body = `

    <div class="wrap tz-page-wrap" style="max-width:980px;">

      <section class="tz-premium-card tz-chat-hero">

        <div class="tz-premium-glow tz-premium-glow-a"></div>

        <div class="tz-premium-glow tz-premium-glow-b"></div>



        <div class="tz-chat-hero-top">

          <div class="tz-chat-identity">

            <div class="tz-chat-avatar">${otherAvatarHtml}</div>



            <div class="tz-chat-identity-copy">

              <div class="tz-chat-kicker">TAPZY CONVERSATION</div>

              <h1 class="tz-chat-title">${escapeHtml(other?.name || other?.username || "Conversation")}</h1>

              <div class="tz-chat-handle">

                ${other ? `@${escapeHtml(other.username || "user")}` : ""}

              </div>

            </div>

          </div>



          <div class="tz-chat-header-actions">

            ${

              other?.username

                ? `<a class="tz-premium-btn tz-chat-btn-small" href="/u/${escapeHtml(other.username)}">View Profile</a>`

                : ""

            }

            <a class="tz-premium-btn tz-chat-btn-small" href="/messages">Back</a>

          </div>

        </div>

      </section>



      <section class="tz-premium-card tz-chat-main" style="margin-top:18px;">

        <div class="tz-chat-window" id="chatWindow">

          ${

            messagesHtml ||

            `<div class="tz-premium-empty"><h3>No messages yet</h3><p>Say hello and start the conversation.</p></div>`

          }

        </div>



        <div id="tzTypingIndicator" class="tz-typing-indicator" style="display:none;"></div>



        <form id="tzChatForm" method="POST" action="/messages/${conversation.id}" enctype="multipart/form-data" class="tz-chat-form">

          <div class="tz-chat-composer">

            <div class="tz-chat-field">

              <label>Message</label>

              <textarea class="tz-chat-input tz-chat-textarea" id="tzMessageInput" name="text" placeholder="Type message..."></textarea>

            </div>



            <div class="tz-chat-field">

              <label>Optional image</label>

              <input class="tz-chat-input tz-chat-upload" id="tzImageInput" type="file" name="image" accept="image/png,image/jpeg,image/webp" />

            </div>



            <div class="tz-chat-actions">

              <button class="tz-premium-btn tz-chat-send-btn" id="tzSendBtn" type="submit">Send Message</button>

            </div>

          </div>

        </form>

      </section>

    </div>



    <style>

      .tz-page-wrap{

        padding-top:18px;

        padding-bottom:36px;

      }



      .tz-premium-card{

        position:relative;

        overflow:hidden;

        border-radius:34px;

        border:1px solid rgba(255,255,255,.06);

        background:

          radial-gradient(720px 340px at 73% 17%, rgba(18,74,160,.34), transparent 40%),

          radial-gradient(520px 240px at 20% 0%, rgba(0,58,160,.10), transparent 42%),

          linear-gradient(180deg, rgba(5,7,12,.985), rgba(1,2,6,1));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.03),

          0 0 0 1px rgba(255,255,255,.015),

          0 18px 48px rgba(0,0,0,.34);

      }



      .tz-premium-glow{

        position:absolute;

        border-radius:999px;

        pointer-events:none;

        filter:blur(24px);

        opacity:.65;

      }



      .tz-premium-glow-a{

        width:340px;

        height:240px;

        right:90px;

        top:10px;

        background:radial-gradient(circle, rgba(36,114,230,.26) 0%, rgba(36,114,230,0) 72%);

      }



      .tz-premium-glow-b{

        width:170px;

        height:170px;

        left:-34px;

        top:-40px;

        background:radial-gradient(circle, rgba(33,104,219,.12) 0%, rgba(33,104,219,0) 72%);

      }



      .tz-premium-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:64px;

        padding:0 28px;

        border-radius:24px;

        text-decoration:none;

        color:#fff;

        font-weight:800;

        font-size:18px;

        background:linear-gradient(180deg, rgba(8,10,16,.98), rgba(4,6,11,.98));

        border:1px solid rgba(255,255,255,.07);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 10px 24px rgba(0,0,0,.28);

        transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease;

        cursor:pointer;

      }



      .tz-premium-btn:hover{

        transform:translateY(-1px);

        border-color:rgba(111,190,255,.22);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.05),

          0 16px 30px rgba(0,0,0,.30),

          0 0 22px rgba(43,124,255,.08);

      }



      .tz-chat-hero{

        padding:34px 30px 28px 30px;

      }



      .tz-chat-hero-top{

        position:relative;

        z-index:1;

        display:flex;

        justify-content:space-between;

        align-items:flex-start;

        gap:16px;

        flex-wrap:wrap;

      }



      .tz-chat-identity{

        display:flex;

        gap:16px;

        align-items:flex-start;

        min-width:0;

        flex:1;

      }



      .tz-chat-avatar{

        width:72px;

        height:72px;

        border-radius:22px;

        overflow:hidden;

        display:flex;

        align-items:center;

        justify-content:center;

        background:linear-gradient(180deg, #090c14, #02040a);

        border:1px solid rgba(255,255,255,.07);

        color:#fff;

        font-size:28px;

        font-weight:900;

        box-shadow:0 10px 20px rgba(0,0,0,.26);

        flex:0 0 auto;

      }



      .tz-chat-avatar img{

        width:100%;

        height:100%;

        object-fit:cover;

      }



      .tz-chat-identity-copy{

        min-width:0;

        flex:1;

      }



      .tz-chat-kicker{

        color:#d9e8ff;

        text-transform:uppercase;

        letter-spacing:.26em;

        font-size:15px;

      }



      .tz-chat-title{

        margin:12px 0 0 0;

        color:#fff;

        font-weight:900;

        font-size:52px;

        line-height:.98;

        letter-spacing:-.04em;

        white-space:nowrap;

        overflow:hidden;

        text-overflow:ellipsis;

      }



      .tz-chat-handle{

        margin-top:10px;

        color:#c9d7ea;

        font-size:18px;

        white-space:nowrap;

        overflow:hidden;

        text-overflow:ellipsis;

      }



      .tz-chat-header-actions{

        display:flex;

        gap:12px;

        flex-wrap:wrap;

      }



      .tz-chat-btn-small{

        min-height:56px;

        padding:0 20px;

        border-radius:22px;

        font-size:16px;

      }



      .tz-chat-main{

        padding:20px;

      }



      .tz-chat-window{

        min-height:470px;

        max-height:62vh;

        overflow-y:auto;

        padding:16px;

        border-radius:28px;

        border:1px solid rgba(255,255,255,.06);

        background:

          radial-gradient(520px 200px at 74% 10%, rgba(35,100,220,.08), transparent 40%),

          linear-gradient(180deg, rgba(7,9,14,.98), rgba(2,3,8,1));

        box-shadow:inset 0 1px 0 rgba(255,255,255,.03);

        display:flex;

        flex-direction:column;

        gap:12px;

      }



      .tz-chat-row{

        display:flex;

      }



      .tz-chat-row.mine{

        justify-content:flex-end;

      }



      .tz-chat-bubble{

        max-width:min(78%, 560px);

        padding:14px 16px;

        border-radius:22px;

        font-size:15px;

        line-height:1.6;

        word-break:break-word;

        border:1px solid rgba(255,255,255,.06);

      }



      .tz-chat-bubble.other{

        background:linear-gradient(180deg, rgba(13,16,24,.98), rgba(7,9,14,.98));

        color:#fff;

        box-shadow:inset 0 1px 0 rgba(255,255,255,.03);

      }



      .tz-chat-bubble.mine{

        background:linear-gradient(180deg, #f5fbff, #dff3ff);

        color:#000;

        border-color:rgba(255,255,255,.22);

        box-shadow:0 8px 18px rgba(0,0,0,.16);

      }



      .tz-chat-time{

        margin-top:8px;

        font-size:11px;

        opacity:.72;

      }



      .tz-chat-image{

        max-width:240px;

        width:100%;

        display:block;

        margin-top:10px;

        border-radius:16px;

        border:1px solid rgba(255,255,255,.10);

      }



      .tz-typing-indicator{

        color:#c9d7eb;

        font-size:13px;

        min-height:18px;

        padding:10px 4px 0 6px;

      }



      .tz-chat-form{

        display:grid;

        margin-top:8px;

      }



      .tz-chat-composer{

        border-radius:28px;

        padding:18px;

        border:1px solid rgba(255,255,255,.06);

        background:

          radial-gradient(420px 170px at 82% 18%, rgba(34,100,220,.08), transparent 42%),

          linear-gradient(180deg, rgba(7,9,14,.98), rgba(2,3,8,1));

        box-shadow:inset 0 1px 0 rgba(255,255,255,.03);

      }



      .tz-chat-field{

        display:grid;

        gap:10px;

        margin-bottom:16px;

      }



      .tz-chat-field label{

        color:#fff;

        font-size:15px;

        font-weight:800;

      }



      .tz-chat-input{

        width:100%;

        box-sizing:border-box;

        border:none;

        outline:none;

        color:#fff;

        background:linear-gradient(180deg, rgba(2,4,9,.99), rgba(1,2,6,1));

        border:1px solid rgba(255,255,255,.055);

        box-shadow:inset 0 1px 0 rgba(255,255,255,.02);

      }



      .tz-chat-textarea{

        min-height:120px;

        resize:vertical;

        padding:18px;

        border-radius:24px;

        font-size:16px;

        line-height:1.55;

      }



      .tz-chat-upload{

        padding:16px;

        border-radius:22px;

        font-size:15px;

      }



      .tz-chat-textarea::placeholder{

        color:#95a8c5;

      }



      .tz-chat-actions{

        display:flex;

        gap:10px;

        flex-wrap:wrap;

      }



      .tz-chat-send-btn{

        min-height:60px;

        padding:0 24px;

        border-radius:22px;

        font-size:17px;

      }



      .tz-chat-sending{

        opacity:.72;

        pointer-events:none;

      }



      .tz-premium-empty{

        border-radius:24px;

        padding:24px;

        border:1px solid rgba(255,255,255,.06);

        background:linear-gradient(180deg, rgba(7,9,14,.96), rgba(2,3,8,.98));

      }



      .tz-premium-empty h3{

        margin:0;

        color:#fff;

        font-size:24px;

      }



      .tz-premium-empty p{

        margin:10px 0 0 0;

        color:#c8d5ea;

        font-size:16px;

        line-height:1.6;

      }



      @media(max-width:900px){

        .tz-chat-title{

          font-size:40px;

        }

      }



      @media(max-width:700px){

        .tz-page-wrap{

          padding-top:14px;

        }



        .tz-premium-card{

          border-radius:28px;

        }



        .tz-chat-hero{

          padding:24px 20px 22px 20px;

        }



        .tz-chat-main{

          padding:16px;

        }



        .tz-chat-hero-top{

          flex-direction:column;

          align-items:stretch;

          gap:14px;

        }



        .tz-chat-avatar{

          width:58px;

          height:58px;

          border-radius:18px;

          font-size:22px;

        }



        .tz-chat-kicker{

          font-size:13px;

          letter-spacing:.22em;

        }



        .tz-chat-title{

          font-size:34px;

          line-height:1;

          margin-top:10px;

        }



        .tz-chat-handle{

          margin-top:8px;

          font-size:15px;

        }



        .tz-chat-btn-small{

          min-height:52px;

          padding:0 18px;

          border-radius:20px;

          font-size:15px;

        }



        .tz-chat-window{

          min-height:420px;

          max-height:58vh;

          padding:12px;

          border-radius:22px;

        }



        .tz-chat-bubble{

          max-width:88%;

          font-size:14px;

          border-radius:18px;

        }



        .tz-chat-composer{

          padding:16px;

          border-radius:22px;

        }



        .tz-chat-textarea{

          min-height:110px;

          padding:16px;

          border-radius:20px;

          font-size:15px;

        }



        .tz-chat-upload{

          padding:14px;

          border-radius:18px;

        }



        .tz-chat-send-btn{

          min-height:56px;

          padding:0 22px;

          border-radius:20px;

          font-size:16px;

        }

      }

    </style>



    <script src="/socket.io/socket.io.js"></script>

    <script>

      (function(){

        const chat = document.getElementById("chatWindow");

        const form = document.getElementById("tzChatForm");

        const textarea = document.getElementById("tzMessageInput");

        const imageInput = document.getElementById("tzImageInput");

        const sendBtn = document.getElementById("tzSendBtn");

        const typingIndicator = document.getElementById("tzTypingIndicator");

        const conversationId = ${JSON.stringify(conversation.id)};

        const currentProfileId = ${JSON.stringify(currentProfile.id)};

        const currentUsername = ${JSON.stringify(currentProfile.username || "user")};



        if (chat) {

          chat.scrollTop = chat.scrollHeight;

        }



        if (!conversationId || !chat || !form) return;



        const socket = io();

        let typingTimer = null;

        let isSending = false;



        socket.emit("join_conversation", conversationId);



        function safeEscape(str) {

          return String(str || "")

            .replace(/&/g, "&amp;")

            .replace(/</g, "&lt;")

            .replace(/>/g, "&gt;")

            .replace(/"/g, "&quot;")

            .replace(/'/g, "&#39;");

        }



        function formatPrettyLocalClient(dt) {

          const d = new Date(dt);

          const yyyy = d.getFullYear();

          const mm = String(d.getMonth() + 1).padStart(2, "0");

          const dd = String(d.getDate()).padStart(2, "0");

          let hh = d.getHours();

          const min = String(d.getMinutes()).padStart(2, "0");

          const ampm = hh >= 12 ? "PM" : "AM";

          hh = hh % 12;

          if (hh === 0) hh = 12;

          return \`\${yyyy}-\${mm}-\${dd} \${String(hh).padStart(2, "0")}:\${min} \${ampm}\`;

        }



        function appendMessage(message) {

          const isMine = String(message.senderProfileId || "") === String(currentProfileId || "");



          const row = document.createElement("div");

          row.className = "tz-chat-row " + (isMine ? "mine" : "other");



          row.innerHTML = \`

            <div class="tz-chat-bubble \${isMine ? "mine" : "other"}">

              \${message.body ? \`<div>\${safeEscape(message.body)}</div>\` : ""}

              \${message.imageUrl ? \`<img class="tz-chat-image" src="\${safeEscape(message.imageUrl)}" alt="Message image" />\` : ""}

              <div class="tz-chat-time">\${safeEscape(formatPrettyLocalClient(message.createdAt))}</div>

            </div>

          \`;



          chat.appendChild(row);

          chat.scrollTop = chat.scrollHeight;

        }



        function setSending(state) {

          isSending = state;

          if (state) {

            form.classList.add("tz-chat-sending");

            if (sendBtn) sendBtn.textContent = "Sending...";

          } else {

            form.classList.remove("tz-chat-sending");

            if (sendBtn) sendBtn.textContent = "Send Message";

          }

        }



        socket.on("receive_message", function(message){

          appendMessage(message);

          if (typingIndicator) typingIndicator.style.display = "none";

        });



        socket.on("typing", function(data){

          if (!typingIndicator) return;

          if (!data || String(data.conversationId || "") !== String(conversationId)) return;

          const name = data.username || "Someone";

          if (name === currentUsername) return;

          typingIndicator.textContent = name + " is typing...";

          typingIndicator.style.display = "block";

        });



        socket.on("stop_typing", function(data){

          if (!typingIndicator) return;

          if (!data || String(data.conversationId || "") !== String(conversationId)) return;

          typingIndicator.style.display = "none";

        });



        if (textarea) {

          textarea.addEventListener("input", function(){

            socket.emit("typing", {

              conversationId,

              username: currentUsername,

            });



            clearTimeout(typingTimer);

            typingTimer = setTimeout(function(){

              socket.emit("stop_typing", { conversationId });

            }, 900);

          });

        }



        form.addEventListener("submit", async function(e){

          e.preventDefault();

          if (isSending) return;



          const text = String(textarea?.value || "").trim();

          const hasImage = !!(imageInput && imageInput.files && imageInput.files[0]);



          if (!text && !hasImage) return;



          setSending(true);



          try {

            const formData = new FormData(form);



            const res = await fetch(form.action, {

              method: "POST",

              body: formData,

              headers: {

                "X-Requested-With": "XMLHttpRequest"

              }

            });



            const data = await res.json();



            if (!res.ok || !data.ok) {

              throw new Error(data.error || "Send failed");

            }



            if (textarea) textarea.value = "";

            if (imageInput) imageInput.value = "";

            if (typingIndicator) typingIndicator.style.display = "none";



            socket.emit("stop_typing", { conversationId });

          } catch (err) {

            alert(err.message || "Could not send message");

          } finally {

            setSending(false);

          }

        });



        window.addEventListener("beforeunload", function(){

          socket.emit("leave_conversation", conversationId);

        });

      })();

    </script>



    ${renderTapzyAssistant({

      username: currentProfile.username || "User",

      pageType: "messages",

    })}

    `;



    res.send(

      renderShell("Conversation", body, "", {

        currentProfile,

        pageTitle: "Conversation",

        pageType: "messages",

      })

    );

  } catch (e) {

    console.error(e);

    res.status(500).send("Conversation error");

  }

});



router.post("/messages/:id", upload.single("image"), async (req, res) => {

  try {

    const currentProfile = req.currentProfile;

    if (!currentProfile) {

      if (req.xhr || req.get("X-Requested-With") === "XMLHttpRequest") {

        return res.status(401).json({ ok: false, error: "Please sign in first" });

      }

      return res.redirect("/auth");

    }



    const id = String(req.params.id || "").trim();

    const text = String(req.body.text || "").trim() || null;

    const imageUrl = req.file

      ? publicAbsoluteUrl(req, `/uploads/${req.file.filename}`)

      : null;



    if (!text && !imageUrl) {

      if (req.xhr || req.get("X-Requested-With") === "XMLHttpRequest") {

        return res.status(400).json({ ok: false, error: "Message is empty" });

      }

      return res.redirect(`/messages/${id}`);

    }



    const conversation = await prisma.conversation.findUnique({

      where: { id },

      include: { members: true },

    });



    if (!conversation) {

      if (req.xhr || req.get("X-Requested-With") === "XMLHttpRequest") {

        return res.status(404).json({ ok: false, error: "Conversation not found" });

      }

      return res.status(404).send("Conversation not found");

    }



    const isMember = conversation.members.some((m) => m.profileId === currentProfile.id);

    if (!isMember) {

      if (req.xhr || req.get("X-Requested-With") === "XMLHttpRequest") {

        return res.status(403).json({ ok: false, error: "Forbidden" });

      }

      return res.status(403).send("Forbidden");

    }



    const createdMessage = await prisma.directMessage.create({

      data: {

        conversationId: id,

        senderProfileId: currentProfile.id,

        body: text,

        imageUrl,

      },

      include: {

        sender: true,

      },

    });



    await prisma.conversation.update({

      where: { id },

      data: { updatedAt: new Date() },

    });



    const payload = {

      id: createdMessage.id,

      conversationId: createdMessage.conversationId,

      body: createdMessage.body,

      imageUrl: createdMessage.imageUrl,

      createdAt: createdMessage.createdAt,

      senderProfileId: createdMessage.senderProfileId,

      senderName: createdMessage.sender?.name || createdMessage.sender?.username || "User",

      senderUsername: createdMessage.sender?.username || "user",

    };



    const io = req.app.get("io");

    if (io) {

      io.to(`conversation:${id}`).emit("receive_message", payload);

      io.to(`conversation:${id}`).emit("stop_typing", {

        conversationId: id,

      });

    }



    if (req.xhr || req.get("X-Requested-With") === "XMLHttpRequest") {

      return res.json({ ok: true, message: payload });

    }



    res.redirect(`/messages/${id}`);

  } catch (e) {

    console.error(e);



    if (req.xhr || req.get("X-Requested-With") === "XMLHttpRequest") {

      return res.status(500).json({ ok: false, error: "Send message error" });

    }



    res.status(500).send("Send message error");

  }

});



module.exports = router;