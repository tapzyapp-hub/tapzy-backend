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
      <a class="tz-msg-thread" href="/messages/${c.id}">
        <div class="tz-msg-thread-avatar">${avatarHtml}</div>

        <div class="tz-msg-thread-main">
          <div class="tz-msg-thread-top">
            <div class="tz-msg-thread-copy">
              <div class="tz-msg-thread-name">${escapeHtml(other?.name || other?.username || "Unknown")}</div>
              <div class="tz-msg-thread-user">@${escapeHtml(other?.username || "user")}</div>
            </div>

            ${
              time
                ? `<div class="tz-msg-thread-time">${escapeHtml(time)}</div>`
                : ""
            }
          </div>

          <div class="tz-msg-thread-preview">${preview}</div>
        </div>

        <div class="tz-msg-thread-arrow">›</div>
      </a>
      `;
    });

    const body = `
    <div class="wrap" style="max-width:980px;">
      <section class="tz-core-hero">
        <div class="tz-core-hero-glow tz-core-hero-glow-a"></div>
        <div class="tz-core-hero-glow tz-core-hero-glow-b"></div>

        <div class="tz-core-hero-top">
          <div>
            <div class="tz-core-kicker">Tapzy Connect</div>
            <h1 class="tz-core-title">Messages</h1>
            <div class="tz-core-subtitle">
              Premium private conversations inside Tapzy. Clean, direct, and built for real connections.
            </div>
          </div>

          <div class="tz-core-actions">
            <a class="tz-core-btn tz-core-btn-dark" href="/search">Start Conversation</a>
          </div>
        </div>
      </section>

      <section class="tz-core-section" style="margin-top:18px;">
        <div class="tz-core-section-head">
          <h3>Inbox</h3>
          <p>${conversations.length} conversation${conversations.length === 1 ? "" : "s"} in your Tapzy network.</p>
        </div>

        <div class="tz-msg-list">
          ${
            rows.length
              ? rows.join("")
              : `
                <div class="tz-core-empty">
                  <h3>No conversations yet</h3>
                  <p>Start a private Tapzy conversation with someone from search, your profile connections, or your network.</p>
                  <div style="margin-top:14px;">
                    <a class="tz-core-btn" href="/search">Find People</a>
                  </div>
                </div>
              `
          }
        </div>
      </section>
    </div>

    <style>
      .tz-msg-list{
        display:grid;
        gap:14px;
      }

      .tz-msg-thread{
        display:grid;
        grid-template-columns:auto 1fr auto;
        gap:16px;
        align-items:center;
        padding:18px;
        border-radius:24px;
        text-decoration:none;
        background:
          radial-gradient(420px 180px at 68% 20%, rgba(90,165,255,.08), transparent 42%),
          linear-gradient(180deg, rgba(22,24,32,.92), rgba(12,14,20,.98));
        border:1px solid rgba(255,255,255,.07);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.03),
          0 14px 28px rgba(0,0,0,.18);
        transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease;
      }

      .tz-msg-thread:hover{
        transform:translateY(-1px);
        border-color:rgba(127,210,255,.22);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.04),
          0 18px 34px rgba(0,0,0,.22),
          0 0 22px rgba(70,140,255,.06);
      }

      .tz-msg-thread-avatar{
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
        box-shadow:0 10px 24px rgba(0,0,0,.24);
      }

      .tz-msg-thread-avatar img{
        width:100%;
        height:100%;
        object-fit:cover;
      }

      .tz-msg-thread-main{
        min-width:0;
      }

      .tz-msg-thread-top{
        display:flex;
        justify-content:space-between;
        gap:12px;
        align-items:flex-start;
        min-width:0;
      }

      .tz-msg-thread-copy{
        min-width:0;
        flex:1;
      }

      .tz-msg-thread-name{
        font-size:18px;
        font-weight:800;
        color:#fff;
        line-height:1.15;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .tz-msg-thread-user{
        margin-top:4px;
        color:#95a5bf;
        font-size:13px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .tz-msg-thread-time{
        color:#8c96a8;
        font-size:12px;
        white-space:nowrap;
        flex:0 0 auto;
      }

      .tz-msg-thread-preview{
        margin-top:10px;
        color:#d7deea;
        font-size:14px;
        line-height:1.55;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .tz-msg-thread-arrow{
        color:#8ea1bd;
        font-size:28px;
        line-height:1;
      }

      @media(max-width:700px){
        .tz-msg-thread{
          grid-template-columns:auto 1fr;
          padding:16px;
          border-radius:20px;
        }

        .tz-msg-thread-arrow{
          display:none;
        }

        .tz-msg-thread-avatar{
          width:54px;
          height:54px;
          border-radius:16px;
          font-size:20px;
        }

        .tz-msg-thread-name{
          font-size:16px;
        }

        .tz-msg-thread-user{
          font-size:12px;
        }

        .tz-msg-thread-time{
          font-size:11px;
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
    <div class="wrap" style="max-width:980px;">
      <section class="tz-core-hero">
        <div class="tz-core-hero-glow tz-core-hero-glow-a"></div>
        <div class="tz-core-hero-glow tz-core-hero-glow-b"></div>

        <div class="tz-chat-hero-top">
          <div class="tz-chat-partner">
            <div class="tz-chat-partner-avatar">${otherAvatarHtml}</div>

            <div class="tz-chat-partner-copy">
              <div class="tz-core-kicker">Tapzy Conversation</div>
              <h1 class="tz-chat-title">
                ${escapeHtml(other?.name || other?.username || "Conversation")}
              </h1>
              <div class="tz-chat-handle">
                ${other ? `@${escapeHtml(other.username || "user")}` : ""}
              </div>
            </div>
          </div>

          <div class="tz-core-actions">
            ${
              other?.username
                ? `<a class="tz-core-btn tz-core-btn-dark" href="/u/${escapeHtml(other.username)}">View Profile</a>`
                : ""
            }
            <a class="tz-core-btn tz-core-btn-dark" href="/messages">Back</a>
          </div>
        </div>
      </section>

      <section class="tz-core-section" style="margin-top:18px;">
        <div class="tz-chat-shell">
          <div class="tz-chat-window" id="chatWindow">
            ${
              messagesHtml ||
              `<div class="tz-core-empty"><h3>No messages yet</h3><p>Say hello and start the conversation.</p></div>`
            }
          </div>

          <div id="tzTypingIndicator" class="tz-typing-indicator" style="display:none;"></div>

          <form id="tzChatForm" method="POST" action="/messages/${conversation.id}" enctype="multipart/form-data" class="tz-chat-form">
            <div class="tz-core-field">
              <label>Message</label>
              <textarea class="tz-core-textarea" id="tzMessageInput" name="text" placeholder="Type message..."></textarea>
            </div>

            <div class="tz-core-field">
              <label>Optional image</label>
              <input class="tz-core-upload" id="tzImageInput" type="file" name="image" accept="image/png,image/jpeg,image/webp" />
            </div>

            <div class="tz-chat-actions">
              <button class="tz-core-btn" id="tzSendBtn" type="submit">Send Message</button>
            </div>
          </form>
        </div>
      </section>
    </div>

    <style>
      .tz-chat-hero-top{
        position:relative;
        z-index:2;
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:16px;
        flex-wrap:wrap;
      }

      .tz-chat-partner{
        display:flex;
        align-items:flex-start;
        gap:14px;
        min-width:0;
        flex:1;
      }

      .tz-chat-partner-copy{
        min-width:0;
        flex:1;
      }

      .tz-chat-partner-avatar{
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
        flex:0 0 auto;
      }

      .tz-chat-partner-avatar img{
        width:100%;
        height:100%;
        object-fit:cover;
      }

      .tz-chat-title{
        margin:10px 0 0 0;
        font-size:38px;
        line-height:1.08;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .tz-chat-handle{
        margin-top:8px;
        color:#9fb0c9;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .tz-chat-shell{
        display:grid;
        gap:16px;
      }

      .tz-chat-window{
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

      .tz-chat-row{
        display:flex;
      }

      .tz-chat-row.mine{
        justify-content:flex-end;
      }

      .tz-chat-bubble{
        max-width:min(78%, 560px);
        padding:14px 16px;
        border-radius:20px;
        font-size:14px;
        line-height:1.55;
        word-break:break-word;
        border:1px solid rgba(255,255,255,.06);
      }

      .tz-chat-bubble.other{
        background:linear-gradient(180deg, #171a21, #11141a);
        color:#fff;
      }

      .tz-chat-bubble.mine{
        background:linear-gradient(180deg, #f4fbff, #dff4ff);
        color:#000;
        border-color:rgba(255,255,255,.24);
      }

      .tz-chat-time{
        margin-top:8px;
        font-size:11px;
        opacity:.72;
      }

      .tz-chat-image{
        max-width:240px;
        width:100%;
        border-radius:14px;
        margin-top:10px;
        border:1px solid rgba(255,255,255,.10);
        display:block;
      }

      .tz-chat-form{
        display:grid;
        gap:12px;
      }

      .tz-chat-actions{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
      }

      .tz-typing-indicator{
        color:#9fb0c9;
        font-size:13px;
        margin-top:-4px;
        min-height:18px;
      }

      .tz-chat-sending{
        opacity:.7;
        pointer-events:none;
      }

      @media(max-width:900px){
        .tz-chat-title{
          font-size:32px;
        }
      }

      @media(max-width:700px){
        .tz-chat-hero-top{
          flex-direction:column;
          align-items:stretch;
          gap:14px;
        }

        .tz-chat-partner-avatar{
          width:48px;
          height:48px;
          border-radius:14px;
          font-size:18px;
        }

        .tz-chat-title{
          font-size:26px !important;
          line-height:1.08 !important;
        }

        .tz-chat-handle{
          font-size:13px;
        }

        .tz-chat-window{
          min-height:420px;
          max-height:58vh;
          padding:12px;
          border-radius:20px;
        }

        .tz-chat-bubble{
          max-width:88%;
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
