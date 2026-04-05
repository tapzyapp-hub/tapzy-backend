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



function isAjax(req) {

  return req.xhr || req.get("X-Requested-With") === "XMLHttpRequest";

}



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

      <div class="tz-msg-item" data-conversation-id="${escapeHtml(c.id)}">

        <a class="tz-msg-row" href="/messages/${escapeHtml(c.id)}">

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



        <button

          type="button"

          class="tz-msg-delete-btn"

          data-conversation-id="${escapeHtml(c.id)}"

          aria-label="Delete conversation"

          title="Delete conversation"

        >

          Delete

        </button>

      </div>

      `;

    });



    const body = `

    <div class="wrap tz-msg-wrap">

      <section class="tz-msg-hero">

        <div class="tz-msg-hero-bg"></div>



        <div class="tz-msg-hero-top">

          <div>

            <div class="tz-msg-kicker">TAPZY NETWORK™</div>

            <h1 class="tz-msg-title">Messages</h1>

            <div class="tz-msg-subtitle">

              Premium private conversations built directly into your Tapzy network.

            </div>

          </div>



          <div class="tz-msg-hero-actions">

            <a class="tz-msg-btn" href="/search">Start Conversation</a>

          </div>

        </div>

      </section>



      <section class="tz-msg-panel" style="margin-top:18px;">

        <div class="tz-msg-panel-head">

          <h3>Inbox</h3>

          <p>${conversations.length} conversation${conversations.length === 1 ? "" : "s"} in your Tapzy network.</p>

        </div>



        <div class="tz-msg-list">

          ${

            rows.length

              ? rows.join("")

              : `

                <div class="tz-msg-empty">

                  <h3>No conversations yet</h3>

                  <p>Start a new Tapzy conversation from search or a profile page.</p>

                  <div style="margin-top:16px;">

                    <a class="tz-msg-btn" href="/search">Find People</a>

                  </div>

                </div>

              `

          }

        </div>

      </section>

    </div>



    <style>

      .tz-msg-wrap{

        max-width:920px;

        padding-bottom:36px;

      }



      .tz-msg-hero{

        position:relative;

        overflow:hidden;

        border-radius:34px;

        padding:28px;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(3,5,12,.98), rgba(0,0,0,1));

        box-shadow:

          0 24px 70px rgba(0,0,0,.66),

          inset 0 1px 0 rgba(255,255,255,.03);

      }



      .tz-msg-hero-bg{

        position:absolute;

        inset:0;

        pointer-events:none;

        border-radius:34px;

        background:

          radial-gradient(500px 300px at 72% 22%, rgba(36,80,125,.42), transparent 58%),

          radial-gradient(380px 220px at 18% 10%, rgba(20,42,88,.16), transparent 52%);

      }



      .tz-msg-hero-top{

        position:relative;

        z-index:2;

        display:flex;

        align-items:flex-start;

        justify-content:space-between;

        gap:18px;

        flex-wrap:wrap;

      }



      .tz-msg-kicker{

        color:#d7deeb;

        font-size:12px;

        letter-spacing:6px;

        text-transform:uppercase;

        margin-bottom:12px;

      }



      .tz-msg-title{

        margin:0;

        font-size:68px;

        line-height:.96;

        letter-spacing:-2px;

        font-weight:900;

        color:#fff;

      }



      .tz-msg-subtitle{

        margin-top:14px;

        color:#ffffff;

        font-size:18px;

        line-height:1.7;

        max-width:720px;

      }



      .tz-msg-hero-actions{

        display:flex;

        gap:10px;

        flex-wrap:wrap;

      }



      .tz-msg-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:54px;

        padding:0 22px;

        border-radius:22px;

        text-decoration:none;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(10,12,18,.98), rgba(0,0,0,1));

        color:#fff;

        font-size:15px;

        font-weight:800;

        letter-spacing:.1px;

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 8px 18px rgba(0,0,0,.18);

        transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease;

      }



      .tz-msg-btn:hover{

        transform:translateY(-1px);

        border-color:rgba(140,220,255,.18);

        box-shadow:

          0 12px 24px rgba(0,0,0,.24),

          0 0 18px rgba(80,150,255,.10),

          inset 0 1px 0 rgba(255,255,255,.05);

      }



      .tz-msg-panel{

        position:relative;

        overflow:hidden;

        border-radius:34px;

        padding:26px;

        border:1px solid rgba(255,255,255,.08);

        background:

          radial-gradient(500px 300px at 72% 22%, rgba(36,80,125,.24), transparent 58%),

          linear-gradient(180deg, rgba(3,5,12,.98), rgba(0,0,0,1));

        box-shadow:

          0 18px 40px rgba(0,0,0,.28),

          inset 0 1px 0 rgba(255,255,255,.03);

      }



      .tz-msg-panel-head h3{

        margin:0;

        color:#fff;

        font-size:28px;

        font-weight:900;

        letter-spacing:-.6px;

      }



      .tz-msg-panel-head p{

        margin:10px 0 0 0;

        color:#ffffff;

        font-size:18px;

        line-height:1.7;

        max-width:760px;

      }



      .tz-msg-list{

        display:grid;

        gap:14px;

        margin-top:20px;

      }



      .tz-msg-item{

        position:relative;

        overflow:hidden;

        border-radius:28px;

      }



      .tz-msg-row{

        position:relative;

        z-index:2;

        display:grid;

        grid-template-columns:120px minmax(0, 1fr) auto;

        align-items:center;

        gap:18px;

        padding:18px;

        border-radius:28px;

        text-decoration:none;

        border:1px solid rgba(255,255,255,.08);

        background:

          radial-gradient(500px 260px at 72% 22%, rgba(36,80,125,.14), transparent 58%),

          linear-gradient(180deg, rgba(3,5,12,.98), rgba(0,0,0,1));

        box-shadow:

          0 14px 28px rgba(0,0,0,.18),

          inset 0 1px 0 rgba(255,255,255,.03);

        transition:

          transform .18s ease,

          box-shadow .18s ease,

          border-color .18s ease,

          opacity .18s ease;

      }



      .tz-msg-row:hover{

        transform:translateY(-2px);

        border-color:rgba(140,220,255,.18);

        box-shadow:

          0 18px 36px rgba(0,0,0,.28),

          0 0 20px rgba(80,150,255,.12),

          inset 0 1px 0 rgba(255,255,255,.05);

      }



      .tz-msg-item.swiped .tz-msg-row{

        transform:translateX(-92px);

      }



      .tz-msg-row-avatar{

        width:88px;

        height:88px;

        border-radius:24px;

        overflow:hidden;

        display:flex;

        align-items:center;

        justify-content:center;

        font-size:38px;

        font-weight:900;

        color:#ffffff;

        border:1px solid rgba(255,255,255,.08);

        background:

          radial-gradient(circle at 30% 24%, rgba(255,255,255,.03), transparent 28%),

          linear-gradient(180deg, rgba(5,8,14,.98), rgba(0,0,0,1));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 0 0 1px rgba(255,255,255,.02),

          0 12px 30px rgba(0,0,0,.28);

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

        gap:14px;

      }



      .tz-msg-row-copy{

        min-width:0;

        flex:1;

        padding-right:8px;

      }



      .tz-msg-row-name{

        color:#fff;

        font-size:24px;

        line-height:1.12;

        font-weight:900;

        letter-spacing:-.8px;

        white-space:normal;

        overflow:visible;

        text-overflow:clip;

        word-break:break-word;

      }



      .tz-msg-row-user{

        margin-top:8px;

        color:#dfe7f2;

        font-size:16px;

        line-height:1.2;

        white-space:normal;

        overflow:visible;

        text-overflow:clip;

        word-break:break-word;

      }



      .tz-msg-row-time{

        color:#b7c4d8;

        font-size:12px;

        font-weight:700;

        white-space:nowrap;

        margin-left:10px;

        flex:0 0 auto;

      }



      .tz-msg-row-preview{

        margin-top:14px;

        color:#ffffff;

        font-size:15px;

        line-height:1.6;

        white-space:normal;

        overflow:visible;

        text-overflow:clip;

        word-break:break-word;

      }



      .tz-msg-row-arrow{

        color:#a7b6cb;

        font-size:28px;

        line-height:1;

        transition:transform .18s ease, opacity .18s ease;

        opacity:.78;

      }



      .tz-msg-row:hover .tz-msg-row-arrow{

        transform:translateX(4px);

        opacity:1;

      }



      .tz-msg-delete-btn{

        position:absolute;

        top:0;

        right:0;

        width:92px;

        height:100%;

        border:none;

        border-radius:0 28px 28px 0;

        background:linear-gradient(180deg, #ff6b6b, #d92f2f);

        color:#fff;

        font-size:14px;

        font-weight:900;

        letter-spacing:.2px;

        cursor:pointer;

        z-index:1;

        box-shadow:inset 0 1px 0 rgba(255,255,255,.18);

      }



      .tz-msg-delete-btn:active{

        filter:brightness(.95);

      }



      .tz-msg-empty{

        border-radius:28px;

        padding:24px;

        border:1px solid rgba(255,255,255,.08);

        background:rgba(255,255,255,.02);

      }



      .tz-msg-empty h3{

        margin:0;

        color:#fff;

        font-size:24px;

        font-weight:900;

      }



      .tz-msg-empty p{

        margin:10px 0 0 0;

        color:#ffffff;

        font-size:16px;

        line-height:1.7;

      }



      @media(max-width:700px){

        .tz-msg-hero{

          padding:20px;

          border-radius:28px;

        }



        .tz-msg-hero-bg{

          border-radius:28px;

        }



        .tz-msg-title{

          font-size:42px;

          letter-spacing:-1.3px;

          line-height:1;

        }



        .tz-msg-subtitle{

          font-size:16px;

          line-height:1.6;

        }



        .tz-msg-kicker{

          font-size:11px;

          letter-spacing:5px;

        }



        .tz-msg-panel{

          padding:20px;

          border-radius:28px;

        }



        .tz-msg-panel-head h3{

          font-size:24px;

        }



        .tz-msg-panel-head p{

          font-size:16px;

        }



        .tz-msg-row{

          grid-template-columns:74px minmax(0, 1fr);

          gap:14px;

          padding:15px;

          border-radius:24px;

        }



        .tz-msg-row-arrow{

          display:none;

        }



        .tz-msg-delete-btn{

          width:84px;

          border-radius:0 24px 24px 0;

          font-size:13px;

        }



        .tz-msg-item.swiped .tz-msg-row{

          transform:translateX(-84px);

        }



        .tz-msg-row-avatar{

          width:58px;

          height:58px;

          border-radius:18px;

          font-size:24px;

        }



        .tz-msg-row-name{

          font-size:18px;

          letter-spacing:-.4px;

          line-height:1.15;

        }



        .tz-msg-row-user{

          margin-top:5px;

          font-size:13px;

          line-height:1.2;

        }



        .tz-msg-row-time{

          font-size:11px;

        }



        .tz-msg-row-preview{

          margin-top:10px;

          font-size:14px;

        }



        .tz-msg-btn{

          min-height:46px;

          padding:0 16px;

          border-radius:18px;

          font-size:14px;

        }

      }

    </style>



    <script>

      (function(){

        const items = Array.from(document.querySelectorAll(".tz-msg-item"));

        let startX = 0;

        let activeItem = null;



        function closeAllExcept(item){

          items.forEach((el) => {

            if (el !== item) el.classList.remove("swiped");

          });

        }



        items.forEach((item) => {

          const row = item.querySelector(".tz-msg-row");

          const delBtn = item.querySelector(".tz-msg-delete-btn");



          item.addEventListener("touchstart", (e) => {

            startX = e.touches[0].clientX;

            activeItem = item;

          }, { passive: true });



          item.addEventListener("touchmove", (e) => {

            if (!activeItem) return;

            const currentX = e.touches[0].clientX;

            const diff = currentX - startX;



            if (diff < -28) {

              closeAllExcept(item);

              item.classList.add("swiped");

            } else if (diff > 20) {

              item.classList.remove("swiped");

            }

          }, { passive: true });



          item.addEventListener("touchend", () => {

            activeItem = null;

          });



          row.addEventListener("click", () => {

            closeAllExcept(null);

          });



          delBtn.addEventListener("click", async (e) => {

            e.preventDefault();

            e.stopPropagation();



            const conversationId = delBtn.getAttribute("data-conversation-id");

            const ok = window.confirm("Delete this conversation?");

            if (!ok) return;



            try {

              const res = await fetch("/messages/" + encodeURIComponent(conversationId) + "/delete", {

                method: "POST",

                headers: { "X-Requested-With": "XMLHttpRequest" }

              });



              const data = await res.json();



              if (!res.ok || !data.ok) {

                throw new Error(data.error || "Delete failed");

              }



              item.style.transition = "opacity .18s ease, transform .18s ease";

              item.style.opacity = "0";

              item.style.transform = "translateY(-10px)";

              window.setTimeout(() => item.remove(), 180);

            } catch (err) {

              alert(err.message || "Could not delete conversation");

            }

          });

        });



        document.addEventListener("click", (e) => {

          if (!e.target.closest(".tz-msg-item")) {

            items.forEach((el) => el.classList.remove("swiped"));

          }

        });

      })();

    </script>



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

      <div class="tz-chat-row ${isMine ? "mine" : "other"}" data-message-id="${escapeHtml(m.id)}">

        <div class="tz-chat-bubble ${isMine ? "mine" : "other"}">

          ${

            isMine

              ? `<button type="button" class="tz-chat-delete" data-message-id="${escapeHtml(m.id)}" aria-label="Delete message" title="Delete message">×</button>`

              : ""

          }



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

    <div class="wrap tz-chat-wrap">

      <section class="tz-chat-hero">

        <div class="tz-chat-hero-bg"></div>



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



          <div class="tz-chat-hero-actions">

            ${

              other?.username

                ? `<a class="tz-chat-btn" href="/u/${escapeHtml(other.username)}">View Profile</a>`

                : ""

            }

            <a class="tz-chat-btn" href="/messages">Back</a>

          </div>

        </div>

      </section>



      <section class="tz-chat-panel" style="margin-top:18px;">

        <div class="tz-chat-window" id="chatWindow">

          ${

            messagesHtml ||

            `<div class="tz-chat-empty"><h3>No messages yet</h3><p>Say hello and start the conversation.</p></div>`

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

              <button class="tz-chat-sendbtn" id="tzSendBtn" type="submit">Send Message</button>

            </div>

          </div>

        </form>

      </section>

    </div>



    <style>

      .tz-chat-wrap{

        max-width:920px;

        padding-bottom:36px;

      }



      .tz-chat-hero{

        position:relative;

        overflow:hidden;

        border-radius:34px;

        padding:28px;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(3,5,12,.98), rgba(0,0,0,1));

        box-shadow:

          0 24px 70px rgba(0,0,0,.66),

          inset 0 1px 0 rgba(255,255,255,.03);

      }



      .tz-chat-hero-bg{

        position:absolute;

        inset:0;

        pointer-events:none;

        border-radius:34px;

        background:

          radial-gradient(500px 300px at 72% 22%, rgba(36,80,125,.42), transparent 58%),

          radial-gradient(380px 220px at 18% 10%, rgba(20,42,88,.16), transparent 52%);

      }



      .tz-chat-hero-top{

        position:relative;

        z-index:2;

        display:flex;

        align-items:flex-start;

        justify-content:space-between;

        gap:18px;

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

        width:88px;

        height:88px;

        border-radius:24px;

        overflow:hidden;

        display:flex;

        align-items:center;

        justify-content:center;

        font-size:34px;

        font-weight:900;

        color:#ffffff;

        border:1px solid rgba(255,255,255,.08);

        background:

          radial-gradient(circle at 30% 24%, rgba(255,255,255,.03), transparent 28%),

          linear-gradient(180deg, rgba(5,8,14,.98), rgba(0,0,0,1));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 0 0 1px rgba(255,255,255,.02),

          0 12px 30px rgba(0,0,0,.28);

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

        padding-top:2px;

      }



      .tz-chat-kicker{

        color:#d7deeb;

        font-size:12px;

        letter-spacing:6px;

        text-transform:uppercase;

        margin-bottom:12px;

      }



      .tz-chat-title{

        margin:0;

        font-size:52px;

        line-height:.98;

        letter-spacing:-1.8px;

        font-weight:900;

        color:#fff;

        white-space:nowrap;

        overflow:hidden;

        text-overflow:ellipsis;

      }



      .tz-chat-handle{

        margin-top:10px;

        color:#ffffff;

        font-size:22px;

        font-weight:500;

        line-height:1.1;

        white-space:nowrap;

        overflow:hidden;

        text-overflow:ellipsis;

      }



      .tz-chat-hero-actions{

        display:flex;

        gap:10px;

        flex-wrap:wrap;

      }



      .tz-chat-btn{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:52px;

        padding:0 20px;

        border-radius:20px;

        text-decoration:none;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(10,12,18,.98), rgba(0,0,0,1));

        color:#fff;

        font-size:14px;

        font-weight:800;

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 8px 16px rgba(0,0,0,.16);

        transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease;

      }



      .tz-chat-btn:hover{

        transform:translateY(-1px);

        border-color:rgba(140,220,255,.18);

        box-shadow:

          0 12px 24px rgba(0,0,0,.24),

          0 0 18px rgba(80,150,255,.10),

          inset 0 1px 0 rgba(255,255,255,.05);

      }



      .tz-chat-panel{

        position:relative;

        overflow:hidden;

        border-radius:34px;

        padding:24px;

        border:1px solid rgba(255,255,255,.08);

        background:

          radial-gradient(500px 300px at 72% 22%, rgba(36,80,125,.24), transparent 58%),

          linear-gradient(180deg, rgba(3,5,12,.98), rgba(0,0,0,1));

        box-shadow:

          0 18px 40px rgba(0,0,0,.28),

          inset 0 1px 0 rgba(255,255,255,.03);

      }



      .tz-chat-window{

        min-height:470px;

        max-height:62vh;

        overflow-y:auto;

        padding:16px;

        border-radius:28px;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(7,10,16,.98), rgba(0,0,0,1));

        box-shadow:inset 0 1px 0 rgba(255,255,255,.02);

        display:flex;

        flex-direction:column;

        gap:12px;

        scroll-behavior:smooth;

      }



      .tz-chat-row{

        display:flex;

        transition:opacity .18s ease, transform .18s ease;

      }



      .tz-chat-row.mine{

        justify-content:flex-end;

      }



      .tz-chat-bubble{

        position:relative;

        max-width:min(78%, 560px);

        padding:14px 16px;

        border-radius:22px;

        font-size:15px;

        line-height:1.6;

        word-break:break-word;

        border:1px solid rgba(255,255,255,.08);

        backdrop-filter:blur(6px);

      }



      .tz-chat-bubble.other{

        background:

          radial-gradient(240px 120px at 20% 0%, rgba(80,150,255,.05), transparent 40%),

          linear-gradient(180deg, rgba(10,12,18,.98), rgba(0,0,0,1));

        color:#fff;

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.03),

          0 8px 18px rgba(0,0,0,.18);

      }



      .tz-chat-bubble.mine{

        background:linear-gradient(180deg, #f3f8fd, #dfe9f5);

        color:#000;

        border-color:rgba(255,255,255,.18);

        box-shadow:

          0 12px 28px rgba(0,0,0,.18),

          inset 0 1px 0 rgba(255,255,255,.75);

      }



      .tz-chat-delete{

        position:absolute;

        top:-8px;

        right:-8px;

        width:24px;

        height:24px;

        border:none;

        border-radius:999px;

        cursor:pointer;

        font-weight:900;

        background:#ff4d4f;

        color:#fff;

        font-size:12px;

        display:none;

        box-shadow:0 6px 12px rgba(0,0,0,.18);

      }



      .tz-chat-bubble.mine:hover .tz-chat-delete{

        display:block;

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

        display:flex;

        align-items:center;

        gap:10px;

        color:#ffffff;

        font-size:13px;

        min-height:22px;

        padding:10px 4px 0 6px;

      }



      .tz-typing-dots{

        display:inline-flex;

        align-items:center;

        gap:5px;

      }



      .tz-typing-dots span{

        width:6px;

        height:6px;

        border-radius:999px;

        background:#9ed6ff;

        box-shadow:0 0 10px rgba(120,200,255,.35);

        animation:tzTypingBounce 1s infinite ease-in-out;

      }



      .tz-typing-dots span:nth-child(2){ animation-delay:.15s; }

      .tz-typing-dots span:nth-child(3){ animation-delay:.3s; }



      @keyframes tzTypingBounce{

        0%, 80%, 100%{ transform:scale(.8); opacity:.5; }

        40%{ transform:scale(1.15); opacity:1; }

      }



      .tz-chat-form{

        display:grid;

        margin-top:8px;

      }



      .tz-chat-composer{

        border-radius:28px;

        padding:18px;

        border:1px solid rgba(255,255,255,.08);

        background:rgba(255,255,255,.02);

      }



      .tz-chat-field{

        display:flex;

        flex-direction:column;

        gap:8px;

        margin-bottom:16px;

      }



      .tz-chat-field label{

        margin:0;

        color:#fff;

        font-size:14px;

        font-weight:800;

        letter-spacing:.1px;

      }



      .tz-chat-input{

        width:100%;

        box-sizing:border-box;

        border:1px solid rgba(255,255,255,.08);

        background:linear-gradient(180deg, rgba(7,10,16,.98), rgba(0,0,0,1));

        color:#fff;

        outline:none;

        box-shadow:inset 0 1px 0 rgba(255,255,255,.02);

        font-size:16px;

      }



      .tz-chat-textarea{

        min-height:150px;

        resize:vertical;

        padding:17px 18px;

        border-radius:22px;

        line-height:1.6;

      }



      .tz-chat-upload{

        padding:14px;

        border-radius:20px;

      }



      .tz-chat-input::placeholder{

        color:#bfc7d4;

      }



      .tz-chat-input:focus{

        border-color:rgba(140,220,255,.22);

        box-shadow:0 0 0 3px rgba(140,220,255,.06);

      }



      .tz-chat-actions{

        display:flex;

        gap:10px;

        flex-wrap:wrap;

      }



      .tz-chat-sendbtn{

        min-height:60px;

        padding:0 24px;

        border:none;

        border-radius:24px;

        cursor:pointer;

        font-size:18px;

        font-weight:900;

        color:#000;

        background:linear-gradient(180deg, #eef4fb, #dfe9f5);

        box-shadow:

          0 12px 28px rgba(0,0,0,.24),

          inset 0 1px 0 rgba(255,255,255,.7);

        transition:transform .18s ease, box-shadow .18s ease, filter .18s ease;

      }



      .tz-chat-sendbtn:hover{

        transform:translateY(-1px);

        box-shadow:

          0 16px 34px rgba(0,0,0,.28),

          inset 0 1px 0 rgba(255,255,255,.78);

        filter:brightness(1.01);

      }



      .tz-chat-sendbtn:active{

        transform:translateY(0);

      }



      .tz-chat-sending{

        opacity:.72;

        pointer-events:none;

      }



      .tz-chat-empty{

        border-radius:28px;

        padding:24px;

        border:1px solid rgba(255,255,255,.08);

        background:rgba(255,255,255,.02);

      }



      .tz-chat-empty h3{

        margin:0;

        color:#fff;

        font-size:24px;

        font-weight:900;

      }



      .tz-chat-empty p{

        margin:10px 0 0 0;

        color:#ffffff;

        font-size:16px;

        line-height:1.7;

      }



      @media(max-width:700px){

        .tz-chat-hero{

          padding:20px;

          border-radius:28px;

        }



        .tz-chat-hero-bg{

          border-radius:28px;

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

          font-size:24px;

        }



        .tz-chat-title{

          font-size:34px;

          letter-spacing:-1.1px;

          line-height:1.02;

        }



        .tz-chat-handle{

          font-size:18px;

          margin-top:8px;

          line-height:1.1;

        }



        .tz-chat-kicker{

          font-size:11px;

          letter-spacing:5px;

        }



        .tz-chat-panel{

          padding:20px;

          border-radius:28px;

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



        .tz-chat-btn{

          min-height:46px;

          border-radius:18px;

          padding:0 16px;

        }



        .tz-chat-composer{

          padding:16px;

          border-radius:22px;

        }



        .tz-chat-textarea{

          min-height:120px;

          padding:16px;

          border-radius:20px;

          font-size:15px;

        }



        .tz-chat-upload{

          border-radius:18px;

          padding:14px;

        }



        .tz-chat-sendbtn{

          min-height:56px;

          border-radius:20px;

          font-size:16px;

        }



        .tz-chat-delete{

          display:block;

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

          row.setAttribute("data-message-id", String(message.id || ""));



          row.innerHTML = \`

            <div class="tz-chat-bubble \${isMine ? "mine" : "other"}">

              \${isMine ? \`<button type="button" class="tz-chat-delete" data-message-id="\${safeEscape(String(message.id || ""))}" aria-label="Delete message" title="Delete message">×</button>\` : ""}

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



        socket.on("delete_message", function(data){

          if (!data || String(data.conversationId || "") !== String(conversationId)) return;

          const row = document.querySelector('.tz-chat-row[data-message-id="' + CSS.escape(String(data.messageId || "")) + '"]');

          if (row) {

            row.style.opacity = "0";

            row.style.transform = "translateY(-10px)";

            window.setTimeout(() => row.remove(), 180);

          }

        });



        socket.on("typing", function(data){

          if (!typingIndicator) return;

          if (!data || String(data.conversationId || "") !== String(conversationId)) return;

          const name = data.username || "Someone";

          if (name === currentUsername) return;



          typingIndicator.innerHTML = \`

            <span>\${safeEscape(name)} is typing</span>

            <span class="tz-typing-dots"><span></span><span></span><span></span></span>

          \`;

          typingIndicator.style.display = "flex";

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

            }, 1200);

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



        document.addEventListener("click", async function(e){

          const btn = e.target.closest(".tz-chat-delete");

          if (!btn) return;



          const messageId = String(btn.getAttribute("data-message-id") || "").trim();

          if (!messageId) return;



          const ok = window.confirm("Delete this message?");

          if (!ok) return;



          try {

            const res = await fetch("/messages/" + encodeURIComponent(conversationId) + "/delete-message/" + encodeURIComponent(messageId), {

              method: "POST",

              headers: {

                "X-Requested-With": "XMLHttpRequest"

              }

            });



            const data = await res.json();



            if (!res.ok || !data.ok) {

              throw new Error(data.error || "Delete failed");

            }



            const row = document.querySelector('.tz-chat-row[data-message-id="' + CSS.escape(messageId) + '"]');

            if (row) {

              row.style.opacity = "0";

              row.style.transform = "translateY(-10px)";

              window.setTimeout(() => row.remove(), 180);

            }

          } catch (err) {

            alert(err.message || "Could not delete message");

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

      if (isAjax(req)) {

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

      if (isAjax(req)) {

        return res.status(400).json({ ok: false, error: "Message is empty" });

      }

      return res.redirect(`/messages/${id}`);

    }



    const conversation = await prisma.conversation.findUnique({

      where: { id },

      include: { members: true },

    });



    if (!conversation) {

      if (isAjax(req)) {

        return res.status(404).json({ ok: false, error: "Conversation not found" });

      }

      return res.status(404).send("Conversation not found");

    }



    const isMember = conversation.members.some((m) => m.profileId === currentProfile.id);

    if (!isMember) {

      if (isAjax(req)) {

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



    if (isAjax(req)) {

      return res.json({ ok: true, message: payload });

    }



    res.redirect(`/messages/${id}`);

  } catch (e) {

    console.error(e);



    if (isAjax(req)) {

      return res.status(500).json({ ok: false, error: "Send message error" });

    }



    res.status(500).send("Send message error");

  }

});



router.post("/messages/:id/delete-message/:messageId", async (req, res) => {

  try {

    const currentProfile = req.currentProfile;

    if (!currentProfile) {

      if (isAjax(req)) return res.status(401).json({ ok: false, error: "Please sign in first" });

      return res.redirect("/auth");

    }



    const id = String(req.params.id || "").trim();

    const messageId = String(req.params.messageId || "").trim();



    const conversation = await prisma.conversation.findUnique({

      where: { id },

      include: { members: true },

    });



    if (!conversation) {

      if (isAjax(req)) return res.status(404).json({ ok: false, error: "Conversation not found" });

      return res.status(404).send("Conversation not found");

    }



    const isMember = conversation.members.some((m) => m.profileId === currentProfile.id);

    if (!isMember) {

      if (isAjax(req)) return res.status(403).json({ ok: false, error: "Forbidden" });

      return res.status(403).send("Forbidden");

    }



    const message = await prisma.directMessage.findUnique({

      where: { id: messageId },

    });



    if (!message || message.conversationId !== id) {

      if (isAjax(req)) return res.status(404).json({ ok: false, error: "Message not found" });

      return res.status(404).send("Message not found");

    }



    if (message.senderProfileId !== currentProfile.id) {

      if (isAjax(req)) return res.status(403).json({ ok: false, error: "You can only delete your own messages" });

      return res.status(403).send("You can only delete your own messages");

    }



    await prisma.directMessage.delete({

      where: { id: messageId },

    });



    const io = req.app.get("io");

    if (io) {

      io.to(`conversation:${id}`).emit("delete_message", {

        conversationId: id,

        messageId,

      });

    }



    if (isAjax(req)) {

      return res.json({ ok: true, messageId });

    }



    res.redirect(`/messages/${id}`);

  } catch (e) {

    console.error(e);



    if (isAjax(req)) {

      return res.status(500).json({ ok: false, error: "Delete message error" });

    }



    res.status(500).send("Delete message error");

  }

});



router.post("/messages/:id/delete", async (req, res) => {

  try {

    const currentProfile = req.currentProfile;

    if (!currentProfile) {

      if (isAjax(req)) return res.status(401).json({ ok: false, error: "Please sign in first" });

      return res.redirect("/auth");

    }



    const id = String(req.params.id || "").trim();



    const conversation = await prisma.conversation.findUnique({

      where: { id },

      include: { members: true },

    });



    if (!conversation) {

      if (isAjax(req)) return res.status(404).json({ ok: false, error: "Conversation not found" });

      return res.status(404).send("Conversation not found");

    }



    const isMember = conversation.members.some((m) => m.profileId === currentProfile.id);

    if (!isMember) {

      if (isAjax(req)) return res.status(403).json({ ok: false, error: "Forbidden" });

      return res.status(403).send("Forbidden");

    }



    await prisma.$transaction(async (tx) => {

      await tx.directMessage.deleteMany({

        where: { conversationId: id },

      });



      if (tx.conversationMember?.deleteMany) {

        await tx.conversationMember.deleteMany({

          where: { conversationId: id },

        });

      }



      await tx.conversation.delete({

        where: { id },

      });

    });



    if (isAjax(req)) {

      return res.json({ ok: true, conversationId: id });

    }



    res.redirect("/messages");

  } catch (e) {

    console.error(e);



    if (isAjax(req)) {

      return res.status(500).json({ ok: false, error: "Delete conversation error" });

    }



    res.status(500).send("Delete conversation error");

  }

});



module.exports = router;