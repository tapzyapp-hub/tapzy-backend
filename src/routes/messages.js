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
        ? (lastMessage.body
            ? escapeHtml(lastMessage.body)
            : (lastMessage.imageUrl ? "Sent an image" : "No messages yet"))
        : "No messages yet";

      const time = lastMessage ? formatPrettyLocal(lastMessage.createdAt) : "";

      const avatarHtml = other?.photo
        ? `<img src="${escapeHtml(other.photo)}" alt="${escapeHtml(other.username || "user")}" />`
        : escapeHtml(((other?.name || other?.username || "T").slice(0, 1)).toUpperCase());

      return `
      <a class="message-thread-card" href="/messages/${c.id}">
        <div class="message-thread-avatar">${avatarHtml}</div>

        <div class="message-thread-main">
          <div class="message-thread-top">
            <div>
              <div class="message-thread-name">${escapeHtml(other?.name || other?.username || "Unknown")}</div>
              <div class="message-thread-user">@${escapeHtml(other?.username || "user")}</div>
            </div>

            ${
              time
                ? `<div class="message-thread-time">${escapeHtml(time)}</div>`
                : ""
            }
          </div>

          <div class="message-thread-preview">${preview}</div>
        </div>

        <div class="message-thread-arrow">›</div>
      </a>
      `;
    });

    const body = `
    <div class="wrap" style="max-width:980px;">
      <section class="messages-hero">
        <div class="messages-hero-glow"></div>

        <div class="row-between" style="position:relative;z-index:2;">
          <div>
            <div class="messages-kicker">Tapzy Connect</div>
            <h1 class="messages-title">Messages</h1>
            <div class="muted" style="margin-top:10px;max-width:620px;line-height:1.7;">
              Premium private conversations inside Tapzy.
            </div>
          </div>

          <div class="row">
            <a class="btn btnDark" href="/search">Start Conversation</a>
          </div>
        </div>
      </section>

      <section class="card" style="margin-top:18px;">
        <div class="row-between" style="margin-bottom:14px;">
          <div>
            <h2 style="margin:0;">Inbox</h2>
            <div class="muted" style="margin-top:6px;">
              ${conversations.length} conversation${conversations.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div class="messages-list">
          ${rows.length ? rows.join("") : `<div class="panel">No conversations yet.</div>`}
        </div>
      </section>
    </div>

    <style>
      .messages-hero{
        position:relative;
        overflow:hidden;
        border-radius:30px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(850px 360px at 50% -5%, rgba(127,210,255,.10), transparent 48%),
          linear-gradient(180deg, rgba(10,12,18,.98), rgba(6,6,8,1));
        padding:28px;
        box-shadow:0 24px 70px rgba(0,0,0,.40);
      }

      .messages-hero-glow{
        position:absolute;
        width:340px;
        height:340px;
        border-radius:999px;
        background:radial-gradient(circle, rgba(111,210,255,.18) 0%, rgba(111,210,255,.06) 36%, transparent 70%);
        right:-50px;
        top:-70px;
        filter:blur(12px);
      }

      .messages-kicker{
        color:#95a5bf;
        text-transform:uppercase;
        letter-spacing:4px;
        font-size:13px;
      }

      .messages-title{
        margin:10px 0 0 0;
        font-size:54px;
        line-height:1;
      }

      .messages-list{
        display:grid;
        gap:14px;
      }

      .message-thread-card{
        display:grid;
        grid-template-columns:auto 1fr auto;
        gap:16px;
        align-items:center;
        padding:18px;
        border-radius:24px;
        text-decoration:none;
        background:linear-gradient(180deg, rgba(22,24,32,.94), rgba(12,14,20,.98));
        border:1px solid rgba(255,255,255,.07);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
        transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease;
      }

      .message-thread-card:hover{
        transform:translateY(-1px);
        border-color:rgba(127,210,255,.22);
      }

      .message-thread-avatar{
        width:62px;
        height:62px;
        border-radius:18px;
        overflow:hidden;
        background:linear-gradient(180deg,#141418,#0c0c0f);
        border:1px solid rgba(255,255,255,.08);
        display:flex;
        align-items:center;
        justify-content:center;
        color:#dbefff;
        font-weight:800;
        font-size:22px;
        flex:0 0 auto;
      }

      .message-thread-avatar img{
        width:100%;
        height:100%;
        object-fit:cover;
      }

      .message-thread-main{
        min-width:0;
      }

      .message-thread-top{
        display:flex;
        justify-content:space-between;
        gap:12px;
        align-items:flex-start;
      }

      .message-thread-name{
        font-size:18px;
        font-weight:800;
        color:#fff;
      }

      .message-thread-user{
        margin-top:4px;
        color:#95a5bf;
        font-size:13px;
      }

      .message-thread-time{
        color:#8c96a8;
        font-size:12px;
        white-space:nowrap;
      }

      .message-thread-preview{
        margin-top:10px;
        color:#d7deea;
        font-size:14px;
        line-height:1.55;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .message-thread-arrow{
        color:#8ea1bd;
        font-size:28px;
        line-height:1;
      }

      .chat-shell{
        display:grid;
        gap:16px;
      }

      .chat-topbar{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        flex-wrap:wrap;
      }

      .chat-partner{
        display:flex;
        align-items:center;
        gap:14px;
      }

      .chat-partner-avatar{
        width:58px;
        height:58px;
        border-radius:18px;
        overflow:hidden;
        background:linear-gradient(180deg,#141418,#0c0c0f);
        border:1px solid rgba(255,255,255,.08);
        display:flex;
        align-items:center;
        justify-content:center;
        color:#dbefff;
        font-weight:800;
        font-size:22px;
      }

      .chat-partner-avatar img{
        width:100%;
        height:100%;
        object-fit:cover;
      }

      .chat-window{
        min-height:460px;
        max-height:62vh;
        overflow-y:auto;
        padding:16px;
        border-radius:26px;
        border:1px solid rgba(255,255,255,.07);
        background:
          radial-gradient(700px 220px at 50% 0%, rgba(127,210,255,.06), transparent 42%),
          linear-gradient(180deg, rgba(12,13,18,.98), rgba(9,10,14,1));
        display:flex;
        flex-direction:column;
        gap:12px;
      }

      .chat-bubble-row{
        display:flex;
      }

      .chat-bubble-row.mine{
        justify-content:flex-end;
      }

      .chat-bubble{
        max-width:min(78%, 560px);
        padding:14px 16px;
        border-radius:20px;
        font-size:14px;
        line-height:1.55;
        word-break:break-word;
        border:1px solid rgba(255,255,255,.06);
      }

      .chat-bubble.other{
        background:linear-gradient(180deg, #171a21, #11141a);
        color:#fff;
      }

      .chat-bubble.mine{
        background:linear-gradient(180deg, #f4fbff, #dff4ff);
        color:#000;
        border-color:rgba(255,255,255,.24);
      }

      .chat-time{
        margin-top:8px;
        font-size:11px;
        opacity:.72;
      }

      .chat-image{
        max-width:240px;
        width:100%;
        border-radius:14px;
        margin-top:10px;
        border:1px solid rgba(255,255,255,.10);
        display:block;
      }

      .chat-form{
        display:grid;
        gap:10px;
      }

      .chat-form textarea{
        min-height:110px;
      }

      .chat-actions{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
      }

      @media(max-width:900px){
        .messages-title{
          font-size:42px;
        }
      }

      @media(max-width:700px){
        .messages-hero{
          padding:18px;
          border-radius:24px;
        }

        .messages-title{
          font-size:36px;
        }

        .message-thread-card{
          grid-template-columns:auto 1fr;
        }

        .message-thread-arrow{
          display:none;
        }

        .message-thread-avatar{
          width:54px;
          height:54px;
          border-radius:16px;
          font-size:20px;
        }

        .chat-window{
          min-height:420px;
          max-height:58vh;
          padding:12px;
          border-radius:22px;
        }

        .chat-bubble{
          max-width:88%;
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
      <div class="chat-bubble-row ${isMine ? "mine" : "other"}">
        <div class="chat-bubble ${isMine ? "mine" : "other"}">
          ${m.body ? `<div>${escapeHtml(m.body)}</div>` : ""}
          ${
            m.imageUrl
              ? `<img class="chat-image" src="${escapeHtml(m.imageUrl)}" alt="Message image" />`
              : ""
          }
          <div class="chat-time">${escapeHtml(formatPrettyLocal(m.createdAt))}</div>
        </div>
      </div>
      `;
    }).join("");

    const body = `
    <div class="wrap" style="max-width:980px;">
      <section class="messages-hero">
        <div class="messages-hero-glow"></div>

        <div class="chat-topbar" style="position:relative;z-index:2;">
          <div class="chat-partner">
            <div class="chat-partner-avatar">${otherAvatarHtml}</div>

            <div>
              <div class="messages-kicker">Tapzy Conversation</div>
              <h1 class="messages-title" style="font-size:42px;margin-top:8px;">
                ${escapeHtml(other?.name || other?.username || "Conversation")}
              </h1>
              <div class="muted" style="margin-top:8px;">
                ${other ? `@${escapeHtml(other.username || "user")}` : ""}
              </div>
            </div>
          </div>

          <div class="row">
            ${
              other?.username
                ? `<a class="btn btnDark" href="/u/${escapeHtml(other.username)}">View Profile</a>`
                : ""
            }
            <a class="btn btnDark" href="/messages">Back</a>
          </div>
        </div>
      </section>

      <section class="card" style="margin-top:18px;">
        <div class="chat-shell">
          <div class="chat-window" id="chatWindow">
            ${messagesHtml || `<div class="muted">No messages yet.</div>`}
          </div>

          <form method="POST" action="/messages/${conversation.id}" enctype="multipart/form-data" class="chat-form">
            <textarea name="text" placeholder="Type message..."></textarea>
            <input type="file" name="image" accept="image/png,image/jpeg,image/webp" />
            <div class="chat-actions">
              <button class="btn" type="submit">Send Message</button>
            </div>
          </form>
        </div>
      </section>
    </div>

    <style>
      .messages-hero{
        position:relative;
        overflow:hidden;
        border-radius:30px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(850px 360px at 50% -5%, rgba(127,210,255,.10), transparent 48%),
          linear-gradient(180deg, rgba(10,12,18,.98), rgba(6,6,8,1));
        padding:28px;
        box-shadow:0 24px 70px rgba(0,0,0,.40);
      }

      .messages-hero-glow{
        position:absolute;
        width:340px;
        height:340px;
        border-radius:999px;
        background:radial-gradient(circle, rgba(111,210,255,.18) 0%, rgba(111,210,255,.06) 36%, transparent 70%);
        right:-50px;
        top:-70px;
        filter:blur(12px);
      }

      .messages-kicker{
        color:#95a5bf;
        text-transform:uppercase;
        letter-spacing:4px;
        font-size:13px;
      }

      .messages-title{
        margin:10px 0 0 0;
        font-size:54px;
        line-height:1;
      }

      .chat-topbar{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        flex-wrap:wrap;
      }

      .chat-partner{
        display:flex;
        align-items:center;
        gap:14px;
      }

      .chat-partner-avatar{
        width:58px;
        height:58px;
        border-radius:18px;
        overflow:hidden;
        background:linear-gradient(180deg,#141418,#0c0c0f);
        border:1px solid rgba(255,255,255,.08);
        display:flex;
        align-items:center;
        justify-content:center;
        color:#dbefff;
        font-weight:800;
        font-size:22px;
      }

      .chat-partner-avatar img{
        width:100%;
        height:100%;
        object-fit:cover;
      }

      .chat-shell{
        display:grid;
        gap:16px;
      }

      .chat-window{
        min-height:460px;
        max-height:62vh;
        overflow-y:auto;
        padding:16px;
        border-radius:26px;
        border:1px solid rgba(255,255,255,.07);
        background:
          radial-gradient(700px 220px at 50% 0%, rgba(127,210,255,.06), transparent 42%),
          linear-gradient(180deg, rgba(12,13,18,.98), rgba(9,10,14,1));
        display:flex;
        flex-direction:column;
        gap:12px;
      }

      .chat-bubble-row{
        display:flex;
      }

      .chat-bubble-row.mine{
        justify-content:flex-end;
      }

      .chat-bubble{
        max-width:min(78%, 560px);
        padding:14px 16px;
        border-radius:20px;
        font-size:14px;
        line-height:1.55;
        word-break:break-word;
        border:1px solid rgba(255,255,255,.06);
      }

      .chat-bubble.other{
        background:linear-gradient(180deg, #171a21, #11141a);
        color:#fff;
      }

      .chat-bubble.mine{
        background:linear-gradient(180deg, #f4fbff, #dff4ff);
        color:#000;
        border-color:rgba(255,255,255,.24);
      }

      .chat-time{
        margin-top:8px;
        font-size:11px;
        opacity:.72;
      }

      .chat-image{
        max-width:240px;
        width:100%;
        border-radius:14px;
        margin-top:10px;
        border:1px solid rgba(255,255,255,.10);
        display:block;
      }

      .chat-form{
        display:grid;
        gap:10px;
      }

      .chat-form textarea{
        min-height:110px;
      }

      .chat-actions{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
      }

      @media(max-width:900px){
        .messages-title{
          font-size:42px;
        }
      }

      @media(max-width:700px){
        .messages-hero{
          padding:18px;
          border-radius:24px;
        }

        .messages-title{
          font-size:32px !important;
        }

        .chat-window{
          min-height:420px;
          max-height:58vh;
          padding:12px;
          border-radius:22px;
        }

        .chat-bubble{
          max-width:88%;
        }
      }
    </style>

    <script>
      (function(){
        const chat = document.getElementById("chatWindow");
        if (chat) chat.scrollTop = chat.scrollHeight;
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
    if (!currentProfile) return res.redirect("/auth");

    const id = String(req.params.id || "").trim();
    const text = String(req.body.text || "").trim() || null;
    const imageUrl = req.file
      ? publicAbsoluteUrl(req, `/uploads/${req.file.filename}`)
      : null;

    if (!text && !imageUrl) return res.redirect(`/messages/${id}`);

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { members: true },
    });

    if (!conversation) return res.status(404).send("Conversation not found");

    const isMember = conversation.members.some((m) => m.profileId === currentProfile.id);
    if (!isMember) return res.status(403).send("Forbidden");

    await prisma.directMessage.create({
      data: {
        conversationId: id,
        senderProfileId: currentProfile.id,
        body: text,
        imageUrl,
      },
    });

    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    res.redirect(`/messages/${id}`);
  } catch (e) {
    console.error(e);
    res.status(500).send("Send message error");
  }
});

module.exports = router;
