const renderChatHeader = require("../components/renderChatHeader");
const renderChatComposer = require("../components/renderChatComposer");
const renderChatBubble = require("../components/renderChatBubble");
const { formatPrettyLocal, escapeHtml } = require("../../utils");

function formatDateDivider(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function sameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

module.exports = function renderConversationPage({
  currentProfile,
  conversation,
  other,
  renderTapzyAssistant,
}) {
  let messagesHtml = "";

  if (!conversation.messages.length) {
    messagesHtml = `
      <div class="tz-core-empty">
        <h3>No messages yet</h3>
        <p>Say hello and start the conversation.</p>
      </div>
    `;
  } else {
    messagesHtml = conversation.messages
      .map((message, index, arr) => {
        const prev = arr[index - 1];
        const needDivider = !prev || !sameDay(prev.createdAt, message.createdAt);
        return `
          ${needDivider ? `<div class="tz-chat-date-divider"><span>${escapeHtml(formatDateDivider(message.createdAt))}</span></div>` : ""}
          ${renderChatBubble({
            message,
            currentProfile,
            escapeHtml,
            formatPrettyLocal,
          })}
        `;
      })
      .join("");
  }

  return `
    <div class="wrap">
      <div class="tz-chat-shell">
        ${renderChatHeader({ other, escapeHtml, conversationId: conversation.id })}

        <div class="tz-chat-window" id="chatWindow">
          ${messagesHtml}
        </div>

        ${renderChatComposer({ conversationId: conversation.id })}
      </div>
    </div>


    <style>
      .tz-chat-shell{
        max-width:940px;
        margin:0 auto;
        border-radius:34px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(760px 260px at 78% 8%, rgba(42,92,200,.16), transparent 42%),
          linear-gradient(180deg, rgba(7,9,14,.985), rgba(3,4,8,1));
        box-shadow:0 24px 70px rgba(0,0,0,.36);
        overflow:hidden;
      }

      .tz-chat-topbar{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:14px;
        padding:16px 18px;
        border-bottom:1px solid rgba(255,255,255,.06);
        background:linear-gradient(180deg, rgba(10,12,18,.96), rgba(8,10,16,.92));
      }

      .tz-chat-topbar-left{
        display:flex;
        align-items:center;
        gap:12px;
        min-width:0;
        flex:1;
      }

      .tz-chat-back{
        width:42px;
        height:42px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        color:#fff;
        background:rgba(255,255,255,.05);
        border:1px solid rgba(255,255,255,.08);
        font-size:28px;
        line-height:1;
        flex:0 0 auto;
      }

      .tz-chat-partner{
        display:flex;
        align-items:center;
        gap:12px;
        min-width:0;
        flex:1;
      }

      .tz-chat-partner-avatar{
        width:48px;
        height:48px;
        border-radius:18px;
        overflow:hidden;
        background:rgba(255,255,255,.07);
        display:flex;
        align-items:center;
        justify-content:center;
        color:#fff;
        font-weight:800;
        border:1px solid rgba(255,255,255,.08);
        flex:0 0 auto;
      }

      .tz-chat-partner-avatar img{width:100%;height:100%;object-fit:cover;}
      .tz-chat-partner-copy{min-width:0;}
      .tz-chat-partner-name-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
      .tz-chat-partner-name{color:#fff;font-size:18px;font-weight:800;line-height:1.1;}
      .tz-chat-partner-badge,.tz-chat-pill{
        min-height:38px;
        padding:0 14px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        border:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.04);
        color:#d7e3f6;
        text-decoration:none;
        font-size:13px;
        font-weight:800;
        white-space:nowrap;
      }
      .tz-chat-pill-danger{background:rgba(255,90,90,.08);color:#ffd3d3;}
      .tz-chat-topbar-actions{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        justify-content:flex-end;
        align-items:center;
      }
      .tz-chat-topbar-actions form{margin:0;}
      .tz-chat-partner-handle{margin-top:4px;color:#9fb1c9;font-size:13px;line-height:1.2;}

      .tz-chat-window{
        height:min(68vh, 720px);
        overflow-y:auto;
        padding:18px 18px 10px;
        -webkit-overflow-scrolling:touch;
        background:
          radial-gradient(900px 300px at 50% -20%, rgba(40,96,215,.08), transparent 45%),
          linear-gradient(180deg, rgba(0,0,0,.03), rgba(0,0,0,0));
      }

      .tz-chat-date-divider{
        display:flex;
        justify-content:center;
        margin:14px 0;
      }
      .tz-chat-date-divider span{
        padding:8px 14px;
        border-radius:999px;
        background:rgba(255,255,255,.05);
        border:1px solid rgba(255,255,255,.08);
        color:#9fb1c9;
        font-size:12px;
        font-weight:700;
      }

      .tz-chat-row{display:flex;margin:10px 0;}
      .tz-chat-row.mine{justify-content:flex-end;}
      .tz-chat-row.other{justify-content:flex-start;}

      .tz-chat-bubble{
        max-width:min(82%, 560px);
        padding:14px 16px 12px;
        border-radius:24px;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.08);
        color:#fff;
        box-shadow:0 10px 24px rgba(0,0,0,.12);
      }
      .tz-chat-bubble.mine{
        background:linear-gradient(180deg, rgba(50,105,225,.96), rgba(27,63,136,.98));
        border-color:rgba(104,154,255,.34);
      }
      .tz-chat-bubble.other{
        background:rgba(255,255,255,.05);
      }
      .tz-chat-body{white-space:pre-wrap;line-height:1.55;font-size:15px;}
      .tz-chat-image{
        width:100%;
        max-width:320px;
        border-radius:18px;
        display:block;
        margin-top:10px;
        background:#000;
      }
      .tz-chat-audio{
        width:100%;
        max-width:320px;
        margin-top:10px;
      }
      .tz-chat-time{margin-top:8px;color:rgba(255,255,255,.72);font-size:11px;}
      .tz-chat-status{margin-top:4px;color:rgba(255,255,255,.85);font-size:11px;font-weight:700;}

      .tz-core-empty{
        min-height:260px;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        text-align:center;
        color:#b8c4d7;
      }
      .tz-core-empty h3{margin:0 0 8px 0;color:#fff;}

      .tz-chat-composer{
        border-top:1px solid rgba(255,255,255,.06);
        padding:14px 18px 18px;
        background:linear-gradient(180deg, rgba(10,12,18,.96), rgba(6,8,12,1));
      }
      .tz-chat-composer-inner{
        display:grid;
        grid-template-columns:minmax(0,1fr) 56px 56px 108px;
        gap:10px;
        align-items:center;
      }
      .tz-chat-input-wrap{
        min-width:0;
        grid-column:1 / 2;
      }
      .tz-chat-input{
        width:100%;
        min-height:56px;
        max-height:136px;
        border-radius:22px;
        border:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.05);
        color:#fff;
        padding:15px 18px;
        resize:none;
        font:inherit;
        line-height:1.45;
        box-sizing:border-box;
      }
      .tz-chat-input::placeholder{color:#93a6c3;}
      .tz-chat-upload-pill,
      .tz-chat-send{
        min-height:56px;
        width:100%;
        padding:0 14px;
        border-radius:20px;
        border:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.05);
        color:#fff;
        font-weight:800;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        box-sizing:border-box;
      }
      .tz-chat-upload-pill{
        font-size:28px;
      }
      .tz-chat-send{
        font-size:18px;
        background:linear-gradient(180deg, rgba(43,98,220,.94), rgba(23,56,122,.99));
        border-color:rgba(104,154,255,.32);
      }
      .tz-chat-file{display:none;}
      .tz-chat-composer-subrow{
        display:flex;
        justify-content:space-between;
        gap:12px;
        flex-wrap:wrap;
        margin-top:10px;
      }
      .tz-chat-media-hint,.tz-chat-record-status,.tz-typing-indicator{
        color:#9fb1c9;
        font-size:12px;
        font-weight:700;
        line-height:1.4;
      }
      .tz-chat-record-status.is-live{color:#ffb3b3;}
      .tz-chat-sending .tz-chat-send{opacity:.7;pointer-events:none;}

      @media(max-width:700px){
        .wrap{padding-left:0;padding-right:0;}
        .tz-chat-shell{
          border-radius:0;
          border-left:none;
          border-right:none;
          max-width:100%;
        }
        .tz-chat-topbar{
          padding:12px 14px;
          flex-direction:column;
          align-items:stretch;
        }
        .tz-chat-topbar-left{
          width:100%;
          align-items:flex-start;
        }
        .tz-chat-partner{
          align-items:flex-start;
        }
        .tz-chat-topbar-actions{
          width:100%;
          justify-content:flex-start;
          padding-left:54px;
        }
        .tz-chat-pill,
        .tz-chat-partner-badge{
          min-height:36px;
          padding:0 12px;
          font-size:12px;
        }
        .tz-chat-window{
          height:calc(100dvh - 330px);
          min-height:360px;
          padding:14px 14px 8px;
        }
        .tz-chat-bubble{
          max-width:76%;
          border-radius:22px;
        }
        .tz-chat-composer{
          padding:12px 14px 14px;
          position:sticky;
          bottom:0;
          z-index:2;
          background:linear-gradient(180deg, rgba(8,10,16,.92), rgba(4,6,10,.98));
          backdrop-filter:blur(10px);
        }
        .tz-chat-composer-inner{
          grid-template-columns:minmax(0,1fr) 54px 54px 90px;
          gap:8px;
        }
        .tz-chat-input{
          min-height:54px;
          padding:14px 16px;
          border-radius:20px;
        }
        .tz-chat-upload-pill,
        .tz-chat-send{
          min-height:54px;
          border-radius:18px;
        }
        .tz-chat-send{font-size:17px;}
      }
    </style>


    <script src="/socket.io/socket.io.js"></script>
    <script>
      (function(){
        const chat = document.getElementById("chatWindow");
        const form = document.getElementById("tzChatForm");
        const textarea = document.getElementById("tzMessageInput");
        const mediaInput = document.getElementById("tzMediaInput");
        const sendBtn = document.getElementById("tzSendBtn");
        const typingIndicator = document.getElementById("tzTypingIndicator");
        const recordBtn = document.getElementById("tzRecordBtn");
        const recordStatus = document.getElementById("tzRecordStatus");
        const mediaHint = document.getElementById("tzMediaHint");
        const conversationId = ${JSON.stringify(conversation.id)};
        const currentProfileId = ${JSON.stringify(currentProfile.id)};
        const currentUsername = ${JSON.stringify(currentProfile.username || "user")};

        if (chat) chat.scrollTop = chat.scrollHeight;
        if (!conversationId || !chat || !form) return;

        const socket = io({
          transports: ["websocket"],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 500,
        });

        let typingTimer = null;
        let isSending = false;
        let mediaRecorder = null;
        let mediaChunks = [];
        let activeStream = null;

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
          return yyyy + '-' + mm + '-' + dd + ' ' + String(hh).padStart(2, '0') + ':' + min + ' ' + ampm;
        }

        function formatDateDivider(dt) {
          const d = new Date(dt);
          return d.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          });
        }

        function sameDay(a, b) {
          const da = new Date(a);
          const db = new Date(b);
          return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
        }

        function appendDateDivider(dt) {
          const divider = document.createElement("div");
          divider.className = "tz-chat-date-divider";
          divider.innerHTML = "<span>" + safeEscape(formatDateDivider(dt)) + "</span>";
          chat.appendChild(divider);
        }

        function lastRow() {
          const rows = chat.querySelectorAll(".tz-chat-row[data-created-at]");
          return rows.length ? rows[rows.length - 1] : null;
        }

        function extractMessageMetaFromRow(row) {
          if (!row) return null;
          return {
            createdAt: row.getAttribute("data-created-at"),
          };
        }

        function appendMessage(message) {
          const isMine = String(message.senderProfileId || "") === String(currentProfileId || "");
          const hasBody = !!String(message.body || "").trim();
          const hasImage = !!String(message.imageUrl || "").trim();
          const hasAudio = !!String(message.audioUrl || "").trim();

          const previousRow = lastRow();
          const previousMessage = extractMessageMetaFromRow(previousRow);

          if (!previousMessage || !sameDay(previousMessage.createdAt, message.createdAt)) {
            appendDateDivider(message.createdAt);
          }

          const row = document.createElement("div");
          row.className = "tz-chat-row " + (isMine ? "mine" : "other");
          row.setAttribute("data-created-at", message.createdAt);
          row.setAttribute("data-sender-id", String(message.senderProfileId || ""));
          row.setAttribute("data-message-id", String(message.id || ""));
          row.setAttribute("data-read-at", String(message.readAt || ""));

          row.innerHTML =
            '<div class="tz-chat-bubble ' + (isMine ? 'mine' : 'other') + ' ' + (hasAudio ? 'has-audio' : '') + '">' +
              (hasBody ? '<div class="tz-chat-body">' + safeEscape(message.body) + '</div>' : '') +
              (hasImage ? '<img class="tz-chat-image" src="' + safeEscape(message.imageUrl) + '" alt="Message image" />' : '') +
              (hasAudio ? '<audio class="tz-chat-audio" controls preload="metadata" src="' + safeEscape(message.audioUrl) + '"></audio>' : '') +
              '<div class="tz-chat-time">' + safeEscape(formatPrettyLocalClient(message.createdAt)) + '</div>' +
              (isMine ? '<div class="tz-chat-status">' + safeEscape(message.readAt ? 'Seen' : 'Delivered') + '</div>' : '') +
            '</div>';

          chat.appendChild(row);
          chat.scrollTop = chat.scrollHeight;
        }

        function markSeen(messageIds) {
          const ids = new Set((messageIds || []).map(String));
          document.querySelectorAll('.tz-chat-row.mine[data-message-id]').forEach((row) => {
            const messageId = String(row.getAttribute("data-message-id") || "");
            if (!ids.size || ids.has(messageId)) {
              row.setAttribute("data-read-at", new Date().toISOString());
              const status = row.querySelector(".tz-chat-status");
              if (status) status.textContent = "Seen";
            }
          });
        }

        function setSending(state) {
          isSending = state;
          if (state) {
            form.classList.add("tz-chat-sending");
            if (sendBtn) sendBtn.textContent = "Sending...";
          } else {
            form.classList.remove("tz-chat-sending");
            if (sendBtn) sendBtn.textContent = "Send";
          }
        }

        function autoResizeTextarea() {
          if (!textarea) return;
          textarea.style.height = "auto";
          textarea.style.height = Math.min(textarea.scrollHeight, 140) + "px";
        }

        function setRecordState(text, live) {
          if (!recordStatus) return;
          recordStatus.textContent = text || "";
          recordStatus.classList.toggle("is-live", !!live);
        }

        async function toggleRecording() {
          if (!recordBtn) return;
          if (!navigator.mediaDevices || !window.MediaRecorder) {
            alert("Voice recording is not supported on this device.");
            return;
          }

          if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
            return;
          }

          try {
            activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaChunks = [];
            mediaRecorder = new MediaRecorder(activeStream);

            mediaRecorder.ondataavailable = function(event) {
              if (event.data && event.data.size) mediaChunks.push(event.data);
            };

            mediaRecorder.onstop = function() {
              const blob = new Blob(mediaChunks, { type: mediaRecorder.mimeType || "audio/webm" });
              const ext = (mediaRecorder.mimeType || "").includes("mp4") ? "m4a" : "webm";
              const file = new File([blob], 'voice-note.' + ext, { type: mediaRecorder.mimeType || 'audio/webm' });
              const dt = new DataTransfer();
              dt.items.add(file);
              mediaInput.files = dt.files;
              if (mediaHint) mediaHint.textContent = "Voice note ready to send.";
              setRecordState("Voice note ready", false);
              if (recordBtn) recordBtn.textContent = "🎤";
              if (activeStream) activeStream.getTracks().forEach((track) => track.stop());
              activeStream = null;
            };

            mediaRecorder.start();
            setRecordState("Recording voice note...", true);
            if (recordBtn) recordBtn.textContent = "■";
            if (mediaHint) mediaHint.textContent = "Tap stop, then send.";
          } catch (err) {
            console.error(err);
            alert("Could not access microphone.");
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
          typingIndicator.style.display = "flex";
        });

        socket.on("stop_typing", function(data){
          if (!typingIndicator) return;
          if (!data || String(data.conversationId || "") !== String(conversationId)) return;
          typingIndicator.style.display = "none";
        });

        socket.on("messages_seen", function(data){
          if (!data || String(data.conversationId || "") !== String(conversationId)) return;
          if (String(data.readerProfileId || "") === String(currentProfileId)) return;
          markSeen(data.messageIds || []);
        });

        if (textarea) {
          autoResizeTextarea();

          textarea.addEventListener("input", function(){
            autoResizeTextarea();

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

        if (recordBtn) {
          recordBtn.addEventListener("click", toggleRecording);
        }

        if (mediaInput) {
          mediaInput.addEventListener("change", function() {
            if (mediaInput.files && mediaInput.files[0] && mediaHint) {
              mediaHint.textContent = mediaInput.files[0].name;
            }
          });
        }

        form.addEventListener("submit", async function(e){
          e.preventDefault();
          if (isSending) return;

          const text = String(textarea?.value || "").trim();
          const hasMedia = !!(mediaInput && mediaInput.files && mediaInput.files[0]);
          if (!text && !hasMedia) return;

          setSending(true);

          try {
            const formData = new FormData(form);

            const res = await fetch(form.action, {
              method: "POST",
              body: formData,
              headers: { "X-Requested-With": "XMLHttpRequest" }
            });

            const data = await res.json();
            if (!res.ok || !data.ok) {
              throw new Error(data.error || "Send failed");
            }

            if (textarea) {
              textarea.value = "";
              autoResizeTextarea();
            }
            if (mediaInput) mediaInput.value = "";
            if (mediaHint) mediaHint.textContent = "You can send text, images, or voice notes.";
            setRecordState("", false);
            if (recordBtn) recordBtn.textContent = "🎤";
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
};
