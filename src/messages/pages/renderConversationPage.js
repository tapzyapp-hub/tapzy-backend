const renderChatHeader = require("../components/renderChatHeader");

const renderChatComposer = require("../components/renderChatComposer");



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



function formatPrettyLocalClientSeed(dateValue) {

  const d = new Date(dateValue);

  if (Number.isNaN(d.getTime())) return "";



  const yyyy = d.getFullYear();

  const mm = String(d.getMonth() + 1).padStart(2, "0");

  const dd = String(d.getDate()).padStart(2, "0");

  let hh = d.getHours();

  const min = String(d.getMinutes()).padStart(2, "0");

  const ampm = hh >= 12 ? "PM" : "AM";

  hh = hh % 12;

  if (hh === 0) hh = 12;

  return `${yyyy}-${mm}-${dd} ${String(hh).padStart(2, "0")}:${min} ${ampm}`;

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



function minutesBetween(a, b) {

  const da = new Date(a).getTime();

  const db = new Date(b).getTime();

  return Math.abs(db - da) / 60000;

}



function sameSender(a, b) {

  return String(a?.senderProfileId || "") === String(b?.senderProfileId || "");

}



function getGroupPosition(messages, index) {

  const current = messages[index];

  const prev = messages[index - 1];

  const next = messages[index + 1];



  const joinsPrev =

    !!prev &&

    sameSender(prev, current) &&

    sameDay(prev.createdAt, current.createdAt) &&

    minutesBetween(prev.createdAt, current.createdAt) <= 10;



  const joinsNext =

    !!next &&

    sameSender(current, next) &&

    sameDay(current.createdAt, next.createdAt) &&

    minutesBetween(current.createdAt, next.createdAt) <= 10;



  if (!joinsPrev && !joinsNext) return "is-single";

  if (!joinsPrev && joinsNext) return "is-top";

  if (joinsPrev && joinsNext) return "is-middle";

  return "is-bottom";

}



function renderSeedBubble({ message, currentProfile, escapeHtml, groupPosition }) {

  const isMine = message.senderProfileId === currentProfile.id;

  const hasBody = !!String(message.body || "").trim();

  const hasImage = !!String(message.imageUrl || "").trim();



  const bodyHtml = hasBody

    ? `<div class="tz-chat-body">${escapeHtml(message.body)}</div>`

    : "";



  const imageHtml = hasImage

    ? `<img class="tz-chat-image" src="${escapeHtml(message.imageUrl)}" alt="Message image" />`

    : "";



  const bubbleClass = [

    "tz-chat-bubble",

    isMine ? "mine" : "other",

    groupPosition,

    hasImage && !hasBody ? "is-image-only" : "",

    hasImage && hasBody ? "has-image" : "",

  ]

    .filter(Boolean)

    .join(" ");



  return `

    <div class="tz-chat-row ${isMine ? "mine" : "other"}" data-created-at="${escapeHtml(String(message.createdAt || ""))}">

      <div class="${bubbleClass}">

        ${bodyHtml}

        ${imageHtml}

        <div class="tz-chat-time">${escapeHtml(formatPrettyLocalClientSeed(message.createdAt))}</div>

      </div>

    </div>

  `;

}



module.exports = function renderConversationPage({

  currentProfile,

  conversation,

  other,

  escapeHtml,

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

        const groupPosition = getGroupPosition(arr, index);



        return `

          ${needDivider ? `<div class="tz-chat-date-divider"><span>${escapeHtml(formatDateDivider(message.createdAt))}</span></div>` : ""}

          ${renderSeedBubble({ message, currentProfile, escapeHtml, groupPosition })}

        `;

      })

      .join("");

  }



  return `

    <div class="wrap">

      <div class="tz-chat-shell">

        ${renderChatHeader({ other, escapeHtml })}



        <div class="tz-chat-window" id="chatWindow">

          ${messagesHtml}

        </div>



        ${renderChatComposer({ conversationId: conversation.id })}

      </div>

    </div>



    <style>

      .tz-chat-shell{

        position:relative;

        max-width:1120px;

        margin:18px auto 0 auto;

        padding:14px;

        border-radius:32px;

        border:1px solid rgba(255,255,255,.08);

        background:

          radial-gradient(760px 260px at 78% 8%, rgba(32,58,110,.14), transparent 42%),

          radial-gradient(460px 190px at 14% 82%, rgba(18,34,72,.09), transparent 46%),

          linear-gradient(180deg, rgba(7,9,14,.985), rgba(3,4,8,1));

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.035),

          0 24px 60px rgba(0,0,0,.34),

          0 0 0 1px rgba(110,150,220,.02);

        backdrop-filter: blur(8px);

        overflow:hidden;

      }



      .tz-chat-shell::before{

        content:"";

        position:absolute;

        inset:0;

        pointer-events:none;

        opacity:.032;

        background-image:radial-gradient(rgba(255,255,255,.88) .6px, transparent .6px);

        background-size:10px 10px;

      }



      .tz-chat-shell::after{

        content:"";

        position:absolute;

        inset:0;

        pointer-events:none;

        background:linear-gradient(

          120deg,

          transparent 0%,

          rgba(255,255,255,.015) 32%,

          transparent 62%

        );

        opacity:.45;

      }



      .tz-chat-topbar{

        position:relative;

        z-index:2;

        display:flex;

        justify-content:space-between;

        align-items:center;

        gap:12px;

        flex-wrap:wrap;

        margin-bottom:12px;

      }



      .tz-chat-topbar-left{

        display:flex;

        align-items:center;

        gap:12px;

        min-width:0;

        flex:1;

      }



      .tz-chat-back{

        width:40px;

        height:40px;

        border-radius:999px;

        display:inline-flex;

        align-items:center;

        justify-content:center;

        text-decoration:none;

        font-size:24px;

        line-height:1;

        color:#f5f9ff;

        background:rgba(255,255,255,.05);

        border:1px solid rgba(168,184,210,.10);

        box-shadow:inset 0 1px 0 rgba(255,255,255,.03);

        flex:0 0 auto;

        transition:

          transform .16s ease,

          border-color .16s ease,

          background .16s ease,

          box-shadow .16s ease;

        -webkit-tap-highlight-color: transparent;

      }



      .tz-chat-back:hover{

        transform:translateY(-1px);

        border-color:rgba(170,190,220,.18);

        background:rgba(255,255,255,.07);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.04),

          0 0 14px rgba(120,170,235,.05);

      }



      .tz-chat-back:active{ transform:scale(.985); }



      .tz-chat-partner{

        display:flex;

        align-items:center;

        gap:12px;

        min-width:0;

      }



      .tz-chat-partner-avatar{

        width:52px;

        height:52px;

        border-radius:16px;

        overflow:hidden;

        background:

          radial-gradient(circle at 50% 0%, rgba(120,160,220,.08), transparent 55%),

          linear-gradient(180deg, rgba(10,12,18,.98), rgba(5,6,10,1));

        border:1px solid rgba(168,184,210,.10);

        display:flex;

        align-items:center;

        justify-content:center;

        color:#eef6ff;

        font-weight:800;

        font-size:18px;

        box-shadow:

          0 10px 24px rgba(0,0,0,.26),

          inset 0 1px 0 rgba(255,255,255,.03);

        transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease;

      }



      .tz-chat-partner:hover .tz-chat-partner-avatar{

        transform:translateY(-1px);

        box-shadow:

          0 12px 26px rgba(0,0,0,.28),

          0 0 16px rgba(120,170,235,.05);

      }



      .tz-chat-partner-avatar img{

        width:100%;

        height:100%;

        object-fit:cover;

      }



      .tz-chat-partner-avatar span{

        display:flex;

        align-items:center;

        justify-content:center;

        width:100%;

        height:100%;

      }



      .tz-chat-partner-copy{ min-width:0; }



      .tz-chat-partner-name-row{

        display:flex;

        align-items:center;

        gap:10px;

        min-width:0;

        flex-wrap:wrap;

      }



      .tz-chat-partner-name{

        font-size:18px;

        font-weight:800;

        color:#f8fbff;

        line-height:1.1;

        white-space:nowrap;

        overflow:hidden;

        text-overflow:ellipsis;

      }



      .tz-chat-partner-badge{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:26px;

        padding:0 10px;

        border-radius:999px;

        border:1px solid rgba(140,176,226,.18);

        background:rgba(120,160,220,.07);

        color:#dcecff;

        font-size:10px;

        font-weight:700;

        letter-spacing:.08em;

        text-transform:uppercase;

        white-space:nowrap;

      }



      .tz-chat-partner-handle{

        margin-top:4px;

        color:#8f9db3;

        font-size:12px;

        white-space:nowrap;

        overflow:hidden;

        text-overflow:ellipsis;

      }



      .tz-chat-topbar-actions{

        display:flex;

        gap:10px;

        flex-wrap:wrap;

      }



      .tz-chat-pill{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:40px;

        padding:0 15px;

        border-radius:999px;

        text-decoration:none;

        font-weight:700;

        font-size:14px;

        transition:

          transform .16s ease,

          box-shadow .16s ease,

          opacity .16s ease,

          filter .16s ease;

        -webkit-tap-highlight-color: transparent;

      }



      .tz-chat-pill:hover{ transform:translateY(-1px); }

      .tz-chat-pill:active{ transform:scale(.985); }



      .tz-chat-pill-light{

        background:linear-gradient(180deg,#ffffff,#dfe6ee);

        color:#000;

        box-shadow:0 10px 22px rgba(0,0,0,.18);

      }



      .tz-chat-window{

        position:relative;

        z-index:2;

        min-height:440px;

        max-height:62vh;

        overflow-y:auto;

        padding:14px;

        border-radius:24px;

        border:1px solid rgba(168,184,210,.10);

        background:

          radial-gradient(520px 160px at 50% 0%, rgba(24,42,78,.10), transparent 42%),

          linear-gradient(180deg, rgba(8,10,15,.99), rgba(5,6,10,1));

        display:flex;

        flex-direction:column;

        gap:2px;

        box-shadow: inset 0 1px 0 rgba(255,255,255,.02);

        transition:border-color .18s ease, box-shadow .18s ease;

      }



      .tz-chat-window:focus-within{

        border-color:rgba(164,186,220,.14);

        box-shadow:

          inset 0 1px 0 rgba(255,255,255,.02),

          0 0 0 3px rgba(130,170,230,.04);

      }



      .tz-chat-date-divider{

        display:flex;

        justify-content:center;

        margin:12px 0 10px;

      }



      .tz-chat-date-divider span{

        display:inline-flex;

        align-items:center;

        justify-content:center;

        min-height:28px;

        padding:0 12px;

        border-radius:999px;

        border:1px solid rgba(168,184,210,.10);

        background:rgba(255,255,255,.04);

        color:#a8b7cb;

        font-size:11px;

        font-weight:700;

        letter-spacing:.04em;

      }



      .tz-chat-row{

        display:flex;

        margin-top:2px;

      }



      .tz-chat-row.mine{ justify-content:flex-end; }



      .tz-chat-bubble{

        max-width:min(76%, 560px);

        padding:11px 14px;

        border-radius:18px;

        font-size:14px;

        line-height:1.5;

        word-break:break-word;

        border:1px solid rgba(168,184,210,.08);

        animation:tzFadeUp .18s ease;

        transition:transform .16s ease, box-shadow .16s ease;

      }



      .tz-chat-bubble.other{

        background:linear-gradient(180deg, rgba(18,20,28,.98), rgba(10,12,18,1));

        color:#f7fbff;

      }



      .tz-chat-bubble.mine{

        background:linear-gradient(180deg,#ffffff,#dfe6ee);

        color:#000;

        border-color:rgba(255,255,255,.24);

      }



      .tz-chat-bubble.is-single{

        margin-top:6px;

        margin-bottom:6px;

      }



      .tz-chat-bubble.is-top{

        margin-top:6px;

        margin-bottom:2px;

      }



      .tz-chat-bubble.is-middle{

        margin-top:2px;

        margin-bottom:2px;

      }



      .tz-chat-bubble.is-bottom{

        margin-top:2px;

        margin-bottom:6px;

      }



      .tz-chat-bubble.mine.is-single{

        border-radius:20px 20px 8px 20px;

      }



      .tz-chat-bubble.mine.is-top{

        border-radius:20px 20px 8px 20px;

      }



      .tz-chat-bubble.mine.is-middle{

        border-radius:20px 8px 8px 20px;

      }



      .tz-chat-bubble.mine.is-bottom{

        border-radius:20px 8px 20px 20px;

      }



      .tz-chat-bubble.other.is-single{

        border-radius:20px 20px 20px 8px;

      }



      .tz-chat-bubble.other.is-top{

        border-radius:20px 20px 20px 8px;

      }



      .tz-chat-bubble.other.is-middle{

        border-radius:8px 20px 20px 8px;

      }



      .tz-chat-bubble.other.is-bottom{

        border-radius:8px 20px 20px 20px;

      }



      .tz-chat-body{

        white-space:pre-wrap;

        word-break:break-word;

      }



      .tz-chat-bubble.has-image .tz-chat-body{

        margin-bottom:8px;

      }



      .tz-chat-bubble.is-image-only{

        padding:8px;

      }



      .tz-chat-bubble.is-image-only .tz-chat-time{

        margin-top:8px;

      }



      .tz-chat-time{

        margin-top:6px;

        font-size:11px;

        opacity:.72;

      }



      .tz-chat-image{

        max-width:240px;

        width:100%;

        border-radius:14px;

        margin-top:8px;

        border:1px solid rgba(168,184,210,.10);

        display:block;

      }



      .tz-chat-composer{

        position:sticky;

        bottom:0;

        margin-top:12px;

        z-index:2;

      }



      .tz-typing-indicator{

        display:flex;

        align-items:center;

        gap:8px;

        color:#99a8bf;

        font-size:13px;

        min-height:18px;

        margin:8px 6px 0 6px;

      }



      .tz-typing-indicator::before{

        content:"";

        width:6px;

        height:6px;

        border-radius:999px;

        background:#9db4d7;

        box-shadow:

          10px 0 0 #9db4d7,

          20px 0 0 #9db4d7;

        animation:tzTypingDots 1.1s infinite ease-in-out;

        display:inline-block;

        margin-right:18px;

      }



      @keyframes tzTypingDots{

        0%{ opacity:.35; }

        50%{ opacity:1; }

        100%{ opacity:.35; }

      }



      .tz-chat-composer-inner{

        display:flex;

        align-items:flex-end;

        gap:10px;

        padding:10px;

        border-radius:22px;

        background:rgba(8,10,15,.94);

        border:1px solid rgba(168,184,210,.10);

        backdrop-filter:blur(10px);

        transition:

          border-color .18s ease,

          box-shadow .18s ease,

          transform .18s ease,

          background .18s ease;

      }



      .tz-chat-composer-inner:focus-within{

        border-color:rgba(164,186,220,.18);

        box-shadow:

          0 0 0 3px rgba(130,170,230,.05),

          0 12px 24px rgba(0,0,0,.18);

        transform:translateY(-1px);

      }



      .tz-chat-input-wrap{

        flex:1;

        min-width:0;

      }



      .tz-chat-input{

        width:100%;

        min-height:46px;

        max-height:140px;

        resize:none;

        padding:12px 14px;

        border-radius:18px;

        border:1px solid rgba(168,184,210,.10);

        background:rgba(255,255,255,.04);

        color:#f8fbff;

        outline:none;

        font:inherit;

        line-height:1.45;

        transition:border-color .18s ease, box-shadow .18s ease, background .18s ease;

      }



      .tz-chat-input:focus{

        border-color:rgba(164,186,220,.18);

        box-shadow:0 0 0 3px rgba(130,170,230,.06);

      }



      .tz-chat-upload-pill{

        width:42px;

        height:42px;

        border-radius:999px;

        display:flex;

        align-items:center;

        justify-content:center;

        font-size:24px;

        line-height:1;

        cursor:pointer;

        color:#f5f9ff;

        background:rgba(255,255,255,.05);

        border:1px solid rgba(168,184,210,.10);

        flex:0 0 auto;

        transition:

          transform .16s ease,

          border-color .16s ease,

          background .16s ease,

          box-shadow .16s ease;

        -webkit-tap-highlight-color: transparent;

      }



      .tz-chat-upload-pill:hover{

        transform:translateY(-1px);

        border-color:rgba(170,190,220,.18);

        background:rgba(255,255,255,.07);

        box-shadow:0 0 14px rgba(120,170,235,.05);

      }



      .tz-chat-upload-pill:active{ transform:scale(.985); }



      .tz-chat-file{ display:none; }



      .tz-chat-send{

        min-height:42px;

        padding:0 16px;

        border:none;

        border-radius:999px;

        background:linear-gradient(180deg,#ffffff,#dfe6ee);

        color:#000;

        font-weight:700;

        cursor:pointer;

        box-shadow:0 10px 22px rgba(0,0,0,.18);

        flex:0 0 auto;

        transition:

          transform .16s ease,

          box-shadow .16s ease,

          opacity .16s ease,

          filter .16s ease;

        -webkit-tap-highlight-color: transparent;

      }



      .tz-chat-send:hover{ transform:translateY(-1px); }

      .tz-chat-send:active{ transform:scale(.985); }



      .tz-chat-sending{

        opacity:.7;

        pointer-events:none;

      }



      .tz-core-empty{

        border-radius:22px;

        border:1px dashed rgba(168,184,210,.12);

        background:

          radial-gradient(240px 110px at 50% 0%, rgba(26,46,84,.12), transparent 62%),

          rgba(255,255,255,.02);

        padding:24px;

        color:#9ba9bf;

        text-align:center;

      }



      .tz-core-empty h3{

        margin:0 0 8px 0;

        color:#f8fbff;

      }



      .tz-core-empty p{ margin:0; }



      @keyframes tzFadeUp{

        from{

          opacity:0;

          transform:translateY(8px) scale(.985);

        }

        to{

          opacity:1;

          transform:translateY(0) scale(1);

        }

      }



      @media(max-width:700px){

        .tz-chat-shell{

          margin-top:12px;

          padding:10px;

          border-radius:24px;

        }



        .tz-chat-topbar{ align-items:flex-start; }

        .tz-chat-topbar-actions{ width:100%; }



        .tz-chat-window{

          min-height:400px;

          max-height:56vh;

          padding:10px;

          border-radius:20px;

        }



        .tz-chat-bubble{

          max-width:88%;

          font-size:14px;

        }



        .tz-chat-partner-name{ font-size:16px; }



        .tz-chat-partner-avatar{

          width:44px;

          height:44px;

          border-radius:14px;

          font-size:16px;

        }



        .tz-chat-partner-badge{

          min-height:24px;

          padding:0 9px;

          font-size:10px;

        }



        .tz-chat-send{ padding:0 14px; }

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



        socket.emit("join_conversation", conversationId);



        function safeEscape(str) {

          return String(str || "")

            .replace(/&/g, "&amp;")

            .replace(/</g, "&lt;")

            .replace(/>/g, "&gt;")

            .replace(/"/g, "&quot;")

            .replace(/'/g, "&#39;");

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



        function minutesBetween(a, b) {

          const da = new Date(a).getTime();

          const db = new Date(b).getTime();

          return Math.abs(db - da) / 60000;

        }



        function sameSender(a, b) {

          return String(a?.senderProfileId || "") === String(b?.senderProfileId || "");

        }



        function getGroupPosition(current, previous, next) {

          const joinsPrev =

            !!previous &&

            sameSender(previous, current) &&

            sameDay(previous.createdAt, current.createdAt) &&

            minutesBetween(previous.createdAt, current.createdAt) <= 10;



          const joinsNext =

            !!next &&

            sameSender(current, next) &&

            sameDay(current.createdAt, next.createdAt) &&

            minutesBetween(current.createdAt, next.createdAt) <= 10;



          if (!joinsPrev && !joinsNext) return "is-single";

          if (!joinsPrev && joinsNext) return "is-top";

          if (joinsPrev && joinsNext) return "is-middle";

          return "is-bottom";

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



        function formatDateDivider(dt) {

          const d = new Date(dt);

          return d.toLocaleDateString(undefined, {

            weekday: "short",

            month: "short",

            day: "numeric",

            year: "numeric",

          });

        }



        function appendDateDivider(dt) {

          const divider = document.createElement("div");

          divider.className = "tz-chat-date-divider";

          divider.innerHTML = "<span>" + safeEscape(formatDateDivider(dt)) + "</span>";

          chat.appendChild(divider);

        }



        function getRows() {

          return chat.querySelectorAll(".tz-chat-row[data-created-at]");

        }



        function lastRow() {

          const rows = getRows();

          return rows.length ? rows[rows.length - 1] : null;

        }



        function extractMessageMetaFromRow(row) {

          if (!row) return null;

          return {

            senderProfileId: row.getAttribute("data-sender-id"),

            createdAt: row.getAttribute("data-created-at"),

          };

        }



        function applyBubbleGrouping() {

          const rows = Array.from(getRows());



          rows.forEach((row, index) => {

            const prev = extractMessageMetaFromRow(rows[index - 1]);

            const next = extractMessageMetaFromRow(rows[index + 1]);

            const current = extractMessageMetaFromRow(row);

            const bubble = row.querySelector(".tz-chat-bubble");

            if (!bubble || !current) return;



            bubble.classList.remove("is-single", "is-top", "is-middle", "is-bottom");

            bubble.classList.add(getGroupPosition(current, prev, next));

          });

        }



        function appendMessage(message) {

          const isMine = String(message.senderProfileId || "") === String(currentProfileId || "");

          const hasBody = !!String(message.body || "").trim();

          const hasImage = !!String(message.imageUrl || "").trim();



          const previousRow = lastRow();

          const previousMessage = extractMessageMetaFromRow(previousRow);



          if (!previousMessage || !sameDay(previousMessage.createdAt, message.createdAt)) {

            appendDateDivider(message.createdAt);

          }



          const row = document.createElement("div");

          row.className = "tz-chat-row " + (isMine ? "mine" : "other");

          row.setAttribute("data-created-at", message.createdAt);

          row.setAttribute("data-sender-id", String(message.senderProfileId || ""));



          const bubbleClass = [

            "tz-chat-bubble",

            isMine ? "mine" : "other",

            hasImage && !hasBody ? "is-image-only" : "",

            hasImage && hasBody ? "has-image" : "",

            "is-single",

          ].filter(Boolean).join(" ");



          row.innerHTML = \`

            <div class="\${bubbleClass}">

              \${hasBody ? \`<div class="tz-chat-body">\${safeEscape(message.body)}</div>\` : ""}

              \${hasImage ? \`<img class="tz-chat-image" src="\${safeEscape(message.imageUrl)}" alt="Message image" />\` : ""}

              <div class="tz-chat-time">\${safeEscape(formatPrettyLocalClient(message.createdAt))}</div>

            </div>

          \`;



          chat.appendChild(row);

          applyBubbleGrouping();

          chat.scrollTop = chat.scrollHeight;

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



        applyBubbleGrouping();



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

};