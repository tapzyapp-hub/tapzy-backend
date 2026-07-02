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



function isAudioMediaUrl(url) {
  const value = String(url || "").trim();
  return /\.(mp3|wav|ogg|m4a|aac)(?:[?#].*)?$/i.test(value) || /voice-note\./i.test(value);
}

function isVideoMediaUrl(url) {
  return /\.(mp4|mov|webm|m4v)(?:[?#].*)?$/i.test(String(url || "").trim());
}


function renderVideoPreviewFrame(url, escapeHtml, extra = {}) {
  const src = escapeHtml(url || "");
  const className = escapeHtml(extra.className || "tz-chat-video");
  const controls = extra.controls === false ? '' : ' controls';
  const autoplay = extra.autoplay ? ' autoplay' : '';
  const muted = extra.muted ? ' muted' : '';
  const preload = escapeHtml(extra.preload || 'metadata');
  const aria = escapeHtml(extra.ariaLabel || 'Play video');
  return `
    <div class="tz-video-frame${extra.autoplay ? ' is-autoplay' : ''}" data-video-frame>
      <div class="tz-video-preview" data-video-preview tabindex="0" role="button" aria-label="${aria}">
        <div class="tz-video-preview-blur"></div>
        <div class="tz-video-preview-badge">▶</div>
      </div>
      <video class="${className}"${controls}${autoplay}${muted} preload="${preload}" playsinline src="${src}"></video>
    </div>
  `;
}

function renderSeedBubble({ message, currentProfile, escapeHtml, groupPosition }) {

  const isMine = message.senderProfileId === currentProfile.id;

  const hasBody = !!String(message.body || "").trim();

  const fallbackAudioUrl = isAudioMediaUrl(message.imageUrl) ? String(message.imageUrl || "").trim() : "";
  const audioUrl = String(message.audioUrl || "").trim() || fallbackAudioUrl;
  const rawMediaUrl = fallbackAudioUrl ? "" : String(message.imageUrl || "").trim();
  const videoUrl = isVideoMediaUrl(rawMediaUrl) ? rawMediaUrl : "";
  const imageUrl = videoUrl ? "" : rawMediaUrl;
  const hasImage = !!imageUrl;
  const hasVideo = !!videoUrl;
  const hasAudio = !!audioUrl;



  const bodyHtml = hasBody

    ? `<div class="tz-chat-body">${escapeHtml(message.body)}</div>`

    : "";



  const imageHtml = hasImage

    ? `<img class="tz-chat-image" src="${escapeHtml(imageUrl)}" alt="Message image" loading="lazy" decoding="async" />`

    : "";



  const videoHtml = hasVideo

    ? renderVideoPreviewFrame(videoUrl, escapeHtml, { className: "tz-chat-video", ariaLabel: "Play message video" })

    : "";

  const audioHtml = hasAudio

    ? `<audio class="tz-chat-audio" controls preload="metadata" src="${escapeHtml(audioUrl)}"></audio>`

    : "";



  const bubbleClass = [

    "tz-chat-bubble",

    isMine ? "mine" : "other",

    groupPosition,

    (hasImage || hasVideo) && !hasBody && !hasAudio ? "is-image-only" : "",

    (hasImage || hasVideo) && hasBody ? "has-image" : "",

    hasAudio ? "has-audio" : "",

    hasVideo ? "has-video" : "",

  ]

    .filter(Boolean)

    .join(" ");



  const statusHtml = isMine

    ? `<div class="tz-chat-status">${escapeHtml(message.readAt ? "Seen" : "Delivered")}</div>`

    : "";



  return `

    <div class="tz-chat-row ${isMine ? "mine" : "other"}" data-created-at="${escapeHtml(String(message.createdAt || ""))}" data-sender-id="${escapeHtml(String(message.senderProfileId || ""))}" data-message-id="${escapeHtml(String(message.id || ""))}" data-read-at="${escapeHtml(String(message.readAt || ""))}">

      <div class="${bubbleClass}">

        ${bodyHtml}

        ${imageHtml}

        ${videoHtml}

        ${audioHtml}

        <div class="tz-chat-time" data-local-time="${escapeHtml(String(message.createdAt || ""))}">${escapeHtml(formatPrettyLocalClientSeed(message.createdAt))}</div>

        ${statusHtml}

      </div>

    </div>

  `;

}



module.exports = function renderConversationPage({

  currentProfile,

  conversation,

  other,

  memberSettings = {},
  blockState = {},

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

        ${renderChatHeader({ other, escapeHtml, conversationId: conversation.id, memberSettings, blockState })}



        <div class="tz-chat-window" id="chatWindow">

          ${messagesHtml}

        </div>



        ${
          blockState.iBlockedThem || blockState.theyBlockedMe
            ? `<div class="tz-chat-block-notice">${blockState.iBlockedThem ? "You blocked this user. Unblock them from Settings to send messages." : "Messaging is unavailable with this user."}</div>`
            : renderChatComposer({ conversationId: conversation.id })
        }

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

    overflow:visible;

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

    z-index:40;

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

    border-color:rgba(127,210,255,.18);

    background:rgba(255,255,255,.07);

    box-shadow:

      inset 0 1px 0 rgba(255,255,255,.04),

      0 0 14px rgba(120,170,235,.10);

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



  .tz-chat-partner:hover .tz-chat-partner-avatar,
  .tz-chat-partner-avatar-link:hover{

    transform:translateY(-1px);

    box-shadow:

      0 12px 26px rgba(0,0,0,.28),

      0 0 16px rgba(120,170,235,.08);

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

  .tz-chat-partner-avatar-link{
    text-decoration:none;
    -webkit-tap-highlight-color: transparent;
  }



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

    align-items:stretch;

  }



  .tz-chat-topbar-actions form{

    margin:0;

    display:flex;

  }

  .tz-chat-settings-menu{
    position:relative;
  }

  .tz-chat-settings-menu summary{
    list-style:none;
    cursor:pointer;
    color:#fff;
    border:1px solid rgba(127,210,255,.18);
    background:linear-gradient(180deg, rgba(22,28,40,.98), rgba(10,15,24,.98));
  }

  .tz-chat-settings-menu summary::-webkit-details-marker{
    display:none;
  }

  .tz-chat-settings-panel{
    position:absolute;
    right:0;
    top:calc(100% + 10px);
    z-index:90;
    width:min(280px, calc(100vw - 32px));
    padding:10px;
    border-radius:20px;
    border:1px solid rgba(255,255,255,.10);
    background:linear-gradient(180deg, rgba(18,22,32,.98), rgba(7,9,14,.995));
    box-shadow:0 24px 70px rgba(0,0,0,.46), 0 0 30px rgba(80,160,255,.10);
  }

  .tz-chat-settings-title{
    padding:8px 10px 10px;
    color:#f8fbff;
    font-size:13px;
    font-weight:900;
    letter-spacing:.08em;
    text-transform:uppercase;
  }

  .tz-chat-settings-panel form{
    display:block;
  }

  .tz-chat-settings-panel button,
  .tz-chat-setting-link{
    width:100%;
    min-height:42px;
    border:0;
    border-radius:14px;
    background:transparent;
    color:#dce8f8;
    display:flex;
    align-items:center;
    padding:0 12px;
    text-align:left;
    text-decoration:none;
    font:inherit;
    font-size:14px;
    font-weight:750;
    cursor:pointer;
  }

  .tz-chat-settings-panel button:hover,
  .tz-chat-setting-link:hover{
    background:rgba(120,190,255,.10);
    color:#fff;
  }

  .tz-chat-settings-panel .tz-chat-setting-danger{
    color:#ffd7df;
  }

  .tz-chat-settings-panel .tz-chat-setting-danger:hover{
    background:rgba(255,80,120,.10);
  }

  .tz-chat-block-notice{
    position:relative;
    z-index:3;
    border-radius:22px;
    border:1px solid rgba(255,120,150,.20);
    background:rgba(255,80,120,.08);
    color:#ffdce3;
    padding:16px;
    text-align:center;
    font-weight:800;
  }



  .tz-chat-pill{

    display:inline-flex;

    align-items:center;

    justify-content:center;

    min-width:112px;

    min-height:34px;

    padding:0 14px;

    border-radius:999px;

    text-decoration:none;

    font-weight:700;

    font-size:14px;

    transition:

      transform .16s ease,

      box-shadow .16s ease,

      opacity .16s ease,

      filter .16s ease,

      border-color .16s ease;

    -webkit-tap-highlight-color: transparent;

  }



  .tz-chat-pill:hover{ transform:translateY(-1px); }

  .tz-chat-pill:active{ transform:scale(.985); }



  .tz-chat-pill-light{

    color:#fff;

    background:linear-gradient(180deg, rgba(22,23,31,.98), rgba(14,15,22,.98));

    border:1px solid rgba(255,255,255,.08);

    box-shadow:

      inset 0 1px 0 rgba(255,255,255,.03),

      0 12px 26px rgba(0,0,0,.22);

  }



  .tz-chat-pill-light:hover{

    border-color:rgba(127,210,255,.28);

    box-shadow:

      inset 0 1px 0 rgba(255,255,255,.04),

      0 18px 34px rgba(0,0,0,.26),

      0 0 22px rgba(90,165,255,.16);

  }


  .tz-chat-pill-danger{

    color:#ffd8df;

    background:linear-gradient(180deg, rgba(74,20,30,.94), rgba(40,10,18,.98));

    border:1px solid rgba(255,120,150,.44);

    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.05),
      0 12px 26px rgba(0,0,0,.22),
      0 0 0 1px rgba(255,94,138,.12),
      0 0 20px rgba(255,78,124,.24);

  }



  .tz-chat-pill-danger:hover{

    border-color:rgba(255,160,188,.56);

    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.04),
      0 18px 34px rgba(0,0,0,.26),
      0 0 26px rgba(255,92,138,.32);

  }



  .tz-chat-window{

    position:relative;

    z-index:1;

    min-height:440px;

    max-height:62vh;

    overflow-y:auto;

    padding:14px;

    border-radius:24px;

    border:1px solid rgba(255,255,255,.08);

    background:

      radial-gradient(520px 180px at 80% 0%, rgba(90,165,255,.10), transparent 40%),

      linear-gradient(180deg, rgba(12,14,20,.98), rgba(7,9,14,.995));

    display:flex;

    flex-direction:column;

    gap:2px;

    box-shadow:

      inset 0 1px 0 rgba(255,255,255,.02),

      0 0 0 rgba(90,165,255,0);

    transition:border-color .18s ease, box-shadow .18s ease;

  }



  .tz-chat-window:hover,

  .tz-chat-window:focus-within{

    border-color:rgba(127,210,255,.18);

    box-shadow:

      inset 0 1px 0 rgba(255,255,255,.02),

      0 0 20px rgba(90,165,255,.12);

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

    transition:

      transform .16s ease,

      box-shadow .16s ease,

      border-color .16s ease;

  }



  .tz-chat-bubble:hover{

    transform:translateY(-1px);

    border-color:rgba(127,210,255,.18);

    box-shadow:

      0 14px 26px rgba(0,0,0,.22),

      0 0 18px rgba(90,165,255,.12);

  }



  .tz-chat-bubble.other{

    background:

      radial-gradient(320px 120px at 85% 10%, rgba(90,165,255,.08), transparent 42%),

      linear-gradient(180deg, rgba(20,22,30,.97), rgba(9,11,16,.995));

    color:#f7fbff;

  }



  .tz-chat-bubble.mine{

    background:

      radial-gradient(320px 120px at 85% 10%, rgba(90,165,255,.12), transparent 42%),

      linear-gradient(180deg, rgba(20,26,40,.98), rgba(10,14,22,1));

    color:#fff;

    border-color:rgba(127,210,255,.18);

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

  .tz-video-frame{

    position:relative;

    overflow:hidden;

    border-radius:22px;

    background:#05070d;

  }

  .tz-video-preview{

    position:absolute;

    inset:0;

    z-index:3;

    display:flex;

    align-items:center;

    justify-content:center;

    cursor:pointer;

    background:radial-gradient(circle at 50% 20%, rgba(52,116,255,.22), transparent 42%),linear-gradient(180deg, rgba(8,12,24,.96), rgba(3,5,12,.98));

    transition:opacity .22s ease, visibility .22s ease;

  }

  .tz-video-preview-blur{

    position:absolute;

    inset:0;

    backdrop-filter:blur(14px);

    -webkit-backdrop-filter:blur(14px);

  }

  .tz-video-preview-badge{

    position:relative;

    z-index:1;

    width:68px;

    height:68px;

    border-radius:999px;

    display:flex;

    align-items:center;

    justify-content:center;

    background:rgba(10,14,24,.72);

    border:1px solid rgba(255,255,255,.12);

    box-shadow:0 10px 28px rgba(0,0,0,.34);

    color:#fff;

    font-size:28px;

    line-height:1;

  }

  .tz-video-frame.is-ready .tz-video-preview,.tz-video-frame.is-playing .tz-video-preview{

    opacity:0;

    visibility:hidden;

    pointer-events:none;

  }

  .tz-chat-video{

    display:block;

    width:min(100%, 360px);

    max-width:100%;

    border-radius:22px;

    border:1px solid rgba(255,255,255,.06);

    background:#05070d;

    box-shadow:0 16px 34px rgba(0,0,0,.28);

  }


  .tz-chat-audio{

    width:100%;

    margin-top:8px;

    border-radius:14px;

    filter:drop-shadow(0 8px 18px rgba(0,0,0,.18));

  }



  .tz-chat-status{

    margin-top:5px;

    font-size:11px;

    opacity:.76;

    font-weight:700;

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

    background:

      radial-gradient(320px 120px at 85% 10%, rgba(90,165,255,.08), transparent 42%),

      linear-gradient(180deg, rgba(20,22,30,.97), rgba(9,11,16,.995));

    border:1px solid rgba(255,255,255,.08);

    backdrop-filter:blur(10px);

    transition:

      border-color .18s ease,

      box-shadow .18s ease,

      transform .18s ease,

      background .18s ease;

  }



  .tz-chat-composer-inner:focus-within{

    border-color:rgba(127,210,255,.18);

    box-shadow:

      0 0 0 3px rgba(90,165,255,.06),

      0 12px 24px rgba(0,0,0,.18),

      0 0 18px rgba(90,165,255,.12);

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

    border:1px solid rgba(255,255,255,.08);

    background:rgba(255,255,255,.04);

    color:#f8fbff;

    outline:none;

    font:inherit;

    line-height:1.45;

    transition:border-color .18s ease, box-shadow .18s ease, background .18s ease;

  }



  .tz-chat-input:focus{

    border-color:rgba(127,210,255,.18);

    box-shadow:0 0 0 3px rgba(90,165,255,.06);

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

    border-color:rgba(127,210,255,.18);

    background:rgba(255,255,255,.07);

    box-shadow:0 0 14px rgba(90,165,255,.12);

  }



  .tz-chat-upload-pill:active{ transform:scale(.985); }



  .tz-chat-file{ display:none; }



  .tz-chat-send{

    min-height:42px;

    padding:0 16px;

    border:none;

    border-radius:999px;

    color:#fff;

    background:linear-gradient(180deg, rgba(22,23,31,.98), rgba(14,15,22,.98));

    border:1px solid rgba(255,255,255,.08);

    font-weight:700;

    cursor:pointer;

    box-shadow:

      inset 0 1px 0 rgba(255,255,255,.03),

      0 12px 26px rgba(0,0,0,.22);

    flex:0 0 auto;

    transition:

      transform .16s ease,

      box-shadow .16s ease,

      opacity .16s ease,

      filter .16s ease,

      border-color .16s ease;

    -webkit-tap-highlight-color: transparent;

  }



  .tz-chat-send:hover{

    transform:translateY(-1px);

    border-color:rgba(127,210,255,.28);

    box-shadow:

      inset 0 1px 0 rgba(255,255,255,.04),

      0 18px 34px rgba(0,0,0,.26),

      0 0 22px rgba(90,165,255,.16);

  }



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



    .tz-chat-topbar{
      align-items:flex-start;
      flex-wrap:nowrap;
      gap:10px;
    }

    .tz-chat-topbar-left{
      flex:1;
      min-width:0;
      gap:10px;
    }

    .tz-chat-topbar-actions{
      width:auto;
      display:flex;
      flex-direction:row;
      gap:8px;
      align-items:flex-start;
      margin-top:0;
      flex-wrap:nowrap;
      margin-left:auto;
    }

    .tz-chat-topbar-actions form{
      width:auto;
      display:block;
      margin:0;
    }

    .tz-chat-pill{
      min-width:0;
      width:auto;
      min-width:74px;
      min-height:22px;
      height:22px;
      padding:0 9px;
      border-radius:999px;
      font-size:9px;
      font-weight:700;
      letter-spacing:.03em;
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.03),
        0 6px 14px rgba(0,0,0,.18);
    }

    .tz-chat-pill-light{
      background:rgba(120,160,220,.07);
      border:1px solid rgba(140,176,226,.18);
      color:#dcecff;
    }

    .tz-chat-pill-danger{
      color:#ffd8df;
      background:linear-gradient(180deg, rgba(74,20,30,.94), rgba(40,10,18,.98));
      border:1px solid rgba(255,120,150,.44);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.05),
        0 8px 18px rgba(0,0,0,.20),
        0 0 0 1px rgba(255,94,138,.10),
        0 0 18px rgba(255,78,124,.24);
    }



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

    .tz-chat-partner-name-row{
      gap:8px;
      flex-wrap:nowrap;
    }

    .tz-chat-partner-avatar{

      width:44px;

      height:44px;

      border-radius:14px;

      font-size:16px;

      flex:0 0 44px;

    }



    .tz-chat-partner-badge{

      min-height:24px;

      padding:0 9px;

      font-size:10px;

    }



    .tz-chat-composer-inner{
      gap:8px;
      padding:8px;
    }

    .tz-chat-input{
      min-height:42px;
      padding:11px 12px;
    }

    .tz-chat-upload-pill{
      width:34px;
      height:34px;
      font-size:19px;
    }

    #tzRecordBtn{
      font-size:15px;
    }

    .tz-chat-send{
      min-height:38px;
      padding:0 13px;
      font-size:13px;
    }

  }

  /* Tapzy premium signal redesign */
  .wrap{
    background:
      radial-gradient(760px 420px at 50% -10%, rgba(31,98,230,.18), transparent 58%),
      radial-gradient(420px 320px at 100% 16%, rgba(116,190,255,.08), transparent 56%),
      #000;
  }

  .tz-chat-shell{
    max-width:980px;
    border-radius:34px;
    border-color:rgba(116,190,255,.15);
    background:
      radial-gradient(680px 280px at 50% -6%, rgba(39,113,255,.20), transparent 54%),
      radial-gradient(460px 260px at 92% 10%, rgba(148,204,255,.075), transparent 56%),
      linear-gradient(180deg, rgba(8,12,22,.985), rgba(1,2,5,1) 78%);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.055),
      0 30px 90px rgba(0,0,0,.54),
      0 0 46px rgba(38,118,255,.08);
  }

  .tz-chat-shell::before{
    opacity:.055;
    background-image:radial-gradient(rgba(255,255,255,.78) .55px, transparent .55px);
    mask-image:radial-gradient(circle at 50% 14%, #000, transparent 74%);
    -webkit-mask-image:radial-gradient(circle at 50% 14%, #000, transparent 74%);
  }

  .tz-chat-topbar{
    padding:4px 2px 8px;
  }

  .tz-chat-back{
    width:44px;
    height:44px;
    border-color:rgba(116,190,255,.16);
    background:
      radial-gradient(90px 60px at 50% 0%, rgba(87,164,255,.16), transparent 70%),
      rgba(255,255,255,.045);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 0 18px rgba(66,140,255,.08);
  }

  .tz-chat-partner-avatar{
    width:58px;
    height:58px;
    border-radius:22px;
    border-color:rgba(137,207,255,.28);
    background:
      radial-gradient(circle at 50% 0%, rgba(92,170,255,.20), transparent 58%),
      linear-gradient(180deg,#0c111b,#020306);
    box-shadow:
      0 16px 34px rgba(0,0,0,.32),
      0 0 24px rgba(83,166,255,.18),
      inset 0 1px 0 rgba(255,255,255,.06);
  }

  .tz-chat-partner-name{
    font-size:21px;
    letter-spacing:-.055em;
  }

  .tz-chat-partner-badge{
    min-height:25px;
    border-color:rgba(121,190,255,.18);
    background:rgba(62,130,255,.09);
    color:#dcecff;
  }

  .tz-chat-pill{
    min-height:40px;
    border-color:rgba(116,190,255,.18);
    background:
      radial-gradient(120px 70px at 50% 0%, rgba(87,164,255,.18), transparent 70%),
      linear-gradient(180deg, rgba(21,27,39,.98), rgba(7,10,17,.98));
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.055),
      0 14px 30px rgba(0,0,0,.28),
      0 0 22px rgba(50,130,255,.10);
  }

  .tz-chat-pill-danger{
    background:
      radial-gradient(120px 70px at 50% 0%, rgba(255,92,138,.18), transparent 70%),
      linear-gradient(180deg, rgba(51,19,28,.98), rgba(18,7,12,.98));
  }

  .tz-chat-window{
    border-radius:28px;
    border-color:rgba(116,190,255,.12);
    background:
      radial-gradient(520px 220px at 75% -4%, rgba(56,132,255,.13), transparent 48%),
      radial-gradient(380px 240px at 18% 100%, rgba(255,255,255,.035), transparent 58%),
      linear-gradient(180deg, rgba(7,10,17,.98), rgba(2,3,7,.998));
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.035),
      inset 0 -1px 0 rgba(116,190,255,.04);
    scrollbar-color:rgba(160,174,196,.52) transparent;
  }

  .tz-chat-date-divider span{
    color:#cbd9ef;
    border-color:rgba(116,190,255,.13);
    background:rgba(255,255,255,.045);
  }

  .tz-chat-bubble{
    border-radius:22px;
    border-color:rgba(255,255,255,.08);
    box-shadow:0 14px 30px rgba(0,0,0,.20);
  }

  .tz-chat-bubble.other{
    background:
      radial-gradient(260px 120px at 80% 0%, rgba(255,255,255,.06), transparent 55%),
      linear-gradient(180deg, rgba(25,28,38,.98), rgba(9,11,17,.995));
  }

  .tz-chat-bubble.mine{
    border-color:rgba(122,196,255,.22);
    background:
      radial-gradient(320px 130px at 80% 0%, rgba(92,170,255,.20), transparent 54%),
      linear-gradient(180deg, rgba(19,45,98,.98), rgba(9,17,36,1));
    box-shadow:
      0 16px 34px rgba(0,0,0,.24),
      0 0 24px rgba(61,136,255,.10);
  }

  .tz-chat-time,
  .tz-chat-status{
    color:rgba(222,232,248,.58);
  }

  .tz-chat-composer{
    padding-top:12px;
  }

  .tz-chat-composer-inner{
    border-radius:28px;
    border-color:rgba(116,190,255,.14);
    background:
      radial-gradient(260px 110px at 80% 0%, rgba(68,144,255,.16), transparent 60%),
      linear-gradient(180deg, rgba(12,16,26,.98), rgba(4,6,11,.995));
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.045),
      0 18px 42px rgba(0,0,0,.30),
      0 0 26px rgba(58,136,255,.08);
  }

  .tz-chat-input{
    color:#f8fbff;
  }

  .tz-chat-input::placeholder{
    color:rgba(221,230,245,.48);
  }

  .tz-chat-upload-pill{
    border-color:rgba(122,196,255,.20);
    background:
      radial-gradient(80px 54px at 50% 0%, rgba(88,164,255,.22), transparent 70%),
      linear-gradient(180deg, rgba(18,25,38,.98), rgba(6,9,16,.98));
    color:#fff;
    box-shadow:0 0 18px rgba(70,150,255,.11);
  }

  .tz-chat-send{
    background:linear-gradient(180deg,#faffff,#dceeff);
    color:#050b14;
    box-shadow:0 12px 30px rgba(0,0,0,.28),0 0 24px rgba(124,198,255,.16);
  }

  .tz-typing-indicator{
    border-color:rgba(116,190,255,.14);
    background:rgba(8,12,20,.74);
    color:#dcecff;
  }

  .tz-core-empty{
    border-style:solid;
    border-color:rgba(116,190,255,.13);
    background:
      radial-gradient(320px 160px at 50% 0%, rgba(48,126,255,.16), transparent 65%),
      rgba(255,255,255,.025);
  }

  @media(max-width:700px){
    .tz-chat-shell{
      border-radius:0;
      border-left:0;
      border-right:0;
      margin-top:0;
      min-height:calc(100vh - 84px);
    }

    .tz-chat-window{
      max-height:calc(100vh - 245px);
      border-radius:24px;
    }

    .tz-chat-partner-name{
      font-size:19px;
    }
  }

  /* Compact premium mobile header so Messages fits the new Tapzy app flow */
  .tz-chat-topbar{
    border:1px solid rgba(116,190,255,.12);
    border-radius:28px;
    padding:10px;
    background:
      radial-gradient(360px 150px at 48% 0%, rgba(47,118,255,.15), transparent 58%),
      linear-gradient(180deg, rgba(8,13,24,.92), rgba(3,5,10,.76));
    box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 14px 36px rgba(0,0,0,.26);
  }

  .tz-chat-topbar-actions{
    gap:8px;
  }

  .tz-chat-pill{
    min-width:88px;
    min-height:38px;
    padding:0 16px;
    font-size:13px;
  }

  .tz-chat-pill-danger{
    color:#ffdce4;
    border-color:rgba(255,98,140,.30);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 12px 28px rgba(0,0,0,.24),0 0 18px rgba(255,65,110,.12);
  }

  @media(max-width:700px){
    .tz-chat-topbar{
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto;
      align-items:center;
      gap:8px;
      padding:9px;
      border-radius:24px;
      margin-bottom:12px;
    }

    .tz-chat-topbar-left{
      min-width:0;
      gap:8px;
    }

    .tz-chat-back{
      width:38px;
      height:38px;
      font-size:22px;
      border-radius:15px;
    }

    .tz-chat-partner{
      gap:8px;
      min-width:0;
    }

    .tz-chat-partner-avatar{
      width:42px;
      height:42px;
      border-radius:15px;
      flex:0 0 auto;
    }

    .tz-chat-partner-copy{
      min-width:0;
    }

    .tz-chat-partner-name-row{
      gap:5px;
      flex-wrap:nowrap;
    }

    .tz-chat-partner-name{
      max-width:34vw;
      font-size:14px;
      letter-spacing:-.03em;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }

    .tz-chat-partner-badge{
      min-height:24px;
      padding:0 10px;
      font-size:10px;
      letter-spacing:.14em;
    }

    .tz-chat-partner-badge:not(:first-of-type){
      display:none;
    }

    .tz-chat-topbar-actions{
      display:flex;
      gap:7px;
      margin-left:0;
      align-items:center;
      justify-content:flex-end;
      flex-wrap:nowrap;
    }

    .tz-chat-topbar-actions form{
      display:flex;
      margin:0;
    }

    .tz-chat-pill{
      min-width:58px;
      min-height:34px;
      height:34px;
      padding:0 11px;
      border-radius:14px;
      font-size:11px;
      letter-spacing:.01em;
    }

    .tz-chat-settings-panel{
      right:-66px;
    }
  }

  /* Fixed chat app layout: only the messages move */
  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav{
    height:100dvh;
    overflow:hidden;
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav > .wrap{
    height:calc(100dvh - 72px - 64px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    padding:0 14px !important;
    overflow:hidden;
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-shell{
    height:100%;
    min-height:0;
    margin:0 auto;
    display:flex;
    flex-direction:column;
    overflow:hidden;
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-topbar{
    flex:0 0 auto;
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-window{
    flex:1 1 auto;
    min-height:0;
    max-height:none;
    overflow-y:auto;
    overscroll-behavior:contain;
    -webkit-overflow-scrolling:touch;
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-composer,
  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-block-notice{
    flex:0 0 auto;
    position:relative;
    bottom:auto;
  }

  @media(max-width:700px){
    body.tz-has-stories-top-nav.tz-has-stories-bottom-nav > .wrap{
      height:calc(100dvh - 72px - 64px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
      padding:0 !important;
    }

    body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-shell{
      border-radius:0;
      padding:8px 8px 10px;
      margin:0;
    }

    body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-window{
      padding:10px;
      border-radius:22px;
    }

    body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-composer{
      margin-top:8px;
      padding-top:0;
    }
  }

  /* Final nav-matched chat color pass */
  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-shell{
    background:
      radial-gradient(520px 220px at 50% -8%, rgba(47,118,255,.20), transparent 56%),
      linear-gradient(180deg, #020306 0%, #000 68%, #000 100%);
    border-color:rgba(255,255,255,.12);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.055),
      0 0 0 1px rgba(47,118,255,.10),
      0 0 34px rgba(47,118,255,.14),
      0 18px 52px rgba(0,0,0,.48);
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-topbar,
  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-window,
  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-composer-inner{
    background:
      radial-gradient(360px 150px at 50% -4%, rgba(47,118,255,.18), transparent 62%),
      linear-gradient(180deg, rgba(3,5,10,.99), rgba(0,0,0,1));
    border-color:rgba(255,255,255,.14);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.055),
      0 0 18px rgba(47,118,255,.12),
      0 12px 32px rgba(0,0,0,.30);
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-window{
    background:
      radial-gradient(440px 190px at 80% -8%, rgba(47,118,255,.12), transparent 54%),
      linear-gradient(180deg, #010205 0%, #000 74%, #000 100%);
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-bubble.other{
    background:
      radial-gradient(220px 100px at 70% 0%, rgba(255,255,255,.055), transparent 62%),
      linear-gradient(180deg, rgba(8,10,16,.99), rgba(0,0,0,1));
    border-color:rgba(255,255,255,.16);
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-bubble.mine{
    background:
      radial-gradient(260px 120px at 75% 0%, rgba(255,255,255,.14), transparent 58%),
      linear-gradient(145deg,#2f76ff,#1145ad);
    border-color:rgba(255,255,255,.62);
    box-shadow:
      0 14px 28px rgba(0,0,0,.26),
      0 0 22px rgba(47,118,255,.34),
      inset 0 1px 0 rgba(255,255,255,.18);
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-input-wrap{
    background:linear-gradient(180deg, rgba(8,10,16,.98), rgba(0,0,0,1));
    border-color:rgba(255,255,255,.14);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 0 16px rgba(47,118,255,.08);
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-upload-pill{
    background:
      radial-gradient(80px 50px at 50% 0%, rgba(255,255,255,.14), transparent 70%),
      linear-gradient(145deg,#2f76ff,#1145ad);
    border-color:rgba(255,255,255,.62);
    box-shadow:0 0 22px rgba(47,118,255,.34), inset 0 1px 0 rgba(255,255,255,.16);
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-send{
    background:linear-gradient(180deg,#f8fdff,#dceeff);
    color:#05070d;
    border-color:rgba(255,255,255,.72);
    box-shadow:0 10px 24px rgba(0,0,0,.28),0 0 18px rgba(255,255,255,.16),0 0 24px rgba(47,118,255,.12);
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-time,
  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-status{
    color:rgba(255,255,255,.72);
  }

  /* Premium unified message redesign */
  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-shell{
    padding:10px;
    background:
      radial-gradient(760px 300px at 50% -12%, rgba(47,118,255,.24), transparent 52%),
      radial-gradient(480px 260px at 100% 16%, rgba(255,255,255,.045), transparent 58%),
      linear-gradient(180deg, #02050b 0%, #000 62%, #000 100%);
    border:1px solid rgba(255,255,255,.11);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.06),
      inset 0 -1px 0 rgba(47,118,255,.08),
      0 0 0 1px rgba(47,118,255,.06),
      0 0 46px rgba(47,118,255,.12),
      0 26px 78px rgba(0,0,0,.58);
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-topbar{
    border-radius:26px;
    border-color:rgba(255,255,255,.13);
    background:
      radial-gradient(420px 150px at 50% -18%, rgba(47,118,255,.22), transparent 62%),
      linear-gradient(180deg, rgba(6,9,16,.94), rgba(0,0,0,.92));
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.06),
      0 10px 30px rgba(0,0,0,.34),
      0 0 22px rgba(47,118,255,.10);
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-window{
    margin-top:2px;
    border-radius:28px;
    border-color:rgba(255,255,255,.10);
    background:
      radial-gradient(520px 240px at 82% 0%, rgba(47,118,255,.12), transparent 50%),
      radial-gradient(320px 260px at 12% 56%, rgba(255,255,255,.035), transparent 58%),
      linear-gradient(180deg, rgba(1,3,8,.98), #000 82%);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.035),
      inset 0 0 0 1px rgba(47,118,255,.035);
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-date-divider span{
    border-color:rgba(255,255,255,.12);
    background:rgba(255,255,255,.045);
    color:rgba(255,255,255,.76);
    box-shadow:0 8px 22px rgba(0,0,0,.24);
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-bubble{
    border-radius:24px;
    backdrop-filter:blur(14px);
    -webkit-backdrop-filter:blur(14px);
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-bubble.mine{
    color:#fff;
    background:
      radial-gradient(220px 120px at 74% 0%, rgba(255,255,255,.18), transparent 58%),
      linear-gradient(145deg, rgba(47,118,255,.96), rgba(17,69,173,.92));
    border-color:rgba(255,255,255,.72);
    box-shadow:
      0 16px 34px rgba(0,0,0,.34),
      0 0 26px rgba(47,118,255,.30),
      inset 0 1px 0 rgba(255,255,255,.24);
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-bubble.other{
    color:#fff;
    background:
      radial-gradient(220px 120px at 74% 0%, rgba(255,255,255,.06), transparent 62%),
      linear-gradient(180deg, rgba(13,15,22,.94), rgba(0,0,0,.94));
    border-color:rgba(255,255,255,.16);
    box-shadow:
      0 14px 30px rgba(0,0,0,.30),
      inset 0 1px 0 rgba(255,255,255,.045);
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-video-frame{
    border-radius:22px;
    overflow:hidden;
    background:#000;
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-composer-inner{
    border-radius:30px;
    padding:9px;
    background:
      radial-gradient(360px 130px at 48% -18%, rgba(47,118,255,.24), transparent 62%),
      linear-gradient(180deg, rgba(5,8,15,.98), #000);
    border-color:rgba(255,255,255,.15);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.06),
      0 -6px 28px rgba(47,118,255,.10),
      0 18px 38px rgba(0,0,0,.36);
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-input-wrap{
    border-radius:22px;
    background:
      radial-gradient(180px 80px at 50% 0%, rgba(255,255,255,.04), transparent 66%),
      linear-gradient(180deg, rgba(12,13,18,.96), rgba(0,0,0,.98));
    border-color:rgba(255,255,255,.15);
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-upload-pill{
    border-radius:18px;
  }

  body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-send{
    border-radius:22px;
    font-weight:900;
  }

  @media(max-width:700px){
    body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-shell{
      padding:8px 8px 10px;
    }

    body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-window{
      border-radius:26px;
    }

    body.tz-has-stories-top-nav.tz-has-stories-bottom-nav .tz-chat-bubble.mine{
      max-width:min(72%, 360px);
    }
  }

</style>


    <script src="/socket.io/socket.io.js"></script>

    <script>

      (function(){

        const chat = document.getElementById("chatWindow");

        const form = document.getElementById("tzChatForm");

        const textarea = document.getElementById("tzMessageInput");

        const mediaInput = document.getElementById("tzMediaInput");

        const recordBtn = document.getElementById("tzRecordBtn");

        const recordStatus = document.getElementById("tzRecordStatus");

        const mediaHint = document.getElementById("tzMediaHint");

        const sendBtn = document.getElementById("tzSendBtn");

        const typingIndicator = document.getElementById("tzTypingIndicator");

        const conversationId = ${JSON.stringify(conversation.id)};

        const currentProfileId = ${JSON.stringify(currentProfile.id)};

        const currentUsername = ${JSON.stringify(currentProfile.username || "user")};



        if (chat) chat.scrollTop = chat.scrollHeight;

        if (!conversationId || !chat || !form) return;



        const socket = window.io ? io({

          transports: ["websocket", "polling"],

          reconnection: true,

          reconnectionAttempts: 10,

          reconnectionDelay: 500,

        }) : null;



        let typingTimer = null;

        let isSending = false;

        let mediaRecorder = null;

        let mediaChunks = [];

        let activeStream = null;

        let lastKnownMessageAt = "";



        if (socket) socket.emit("join_conversation", conversationId);



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



        function isAudioMediaUrlClient(url) {

          const value = String(url || "").trim();

          return /\.(mp3|wav|ogg|m4a|aac|webm)(?:[?#].*)?$/i.test(value) || /voice-note\./i.test(value);

        }



        function isVideoMediaUrlClient(url) {

          return /\.(mp4|mov|webm|m4v)(?:[?#].*)?$/i.test(String(url || "").trim());

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
          if (Number.isNaN(d.getTime())) return "";

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


        function hydrateLocalTimes(root) {
          (root || document).querySelectorAll('.tz-chat-time[data-local-time]').forEach(function(node){
            const raw = node.getAttribute('data-local-time');
            if (!raw) return;
            const formatted = formatPrettyLocalClient(raw);
            if (formatted) node.textContent = formatted;
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



        function hasMessage(messageId) {

          if (!messageId) return false;

          return !!chat.querySelector('.tz-chat-row[data-message-id="' + CSS.escape(String(messageId)) + '"]');

        }



        function updateLastKnownMessageAt(value) {

          if (!value) return;

          const nextTime = new Date(value).getTime();

          const currentTime = lastKnownMessageAt ? new Date(lastKnownMessageAt).getTime() : 0;

          if (!Number.isNaN(nextTime) && nextTime > currentTime) {

            lastKnownMessageAt = value;

          }

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



        function renderVideoPreviewFrameClient(url) {
          return \`
            <div class="tz-video-frame" data-video-frame>
              <div class="tz-video-preview" data-video-preview tabindex="0" role="button" aria-label="Play message video">
                <div class="tz-video-preview-blur"></div>
                <div class="tz-video-preview-badge">▶</div>
              </div>
              <video class="tz-chat-video" controls preload="metadata" playsinline src="\${safeEscape(url)}"></video>
            </div>
          \`;
        }

        function initVideoPreviewFrames(root) {
          (root || document).querySelectorAll('[data-video-frame]').forEach(function(frame){
            if (frame.dataset.videoReady === '1') return;
            frame.dataset.videoReady = '1';
            const video = frame.querySelector('video');
            const preview = frame.querySelector('[data-video-preview]');
            if (!video || !preview) return;
            const markReady = function(){ frame.classList.add('is-ready'); };
            const markPlaying = function(){ frame.classList.add('is-playing'); frame.classList.add('is-ready'); };
            const markPaused = function(){ frame.classList.remove('is-playing'); };
            preview.addEventListener('click', function(){ video.play().catch(function(){}); });
            preview.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); video.play().catch(function(){}); } });
            video.addEventListener('loadeddata', markReady, { once: true });
            video.addEventListener('canplay', markReady, { once: true });
            video.addEventListener('play', markPlaying);
            video.addEventListener('playing', markPlaying);
            video.addEventListener('pause', markPaused);
            if (video.readyState >= 2) markReady();
          });
        }

        initVideoPreviewFrames(document);
        hydrateLocalTimes(document);

        function appendMessage(message) {

          if (!message || hasMessage(message.id)) return;

          chat.querySelectorAll(".tz-core-empty").forEach(function(empty){ empty.remove(); });

          const isMine = String(message.senderProfileId || "") === String(currentProfileId || "");

          const hasBody = !!String(message.body || "").trim();

          const fallbackAudioUrl = isAudioMediaUrlClient(message.imageUrl) ? String(message.imageUrl || "").trim() : "";

          const audioUrl = String(message.audioUrl || "").trim() || fallbackAudioUrl;

          const rawMediaUrl = fallbackAudioUrl ? "" : String(message.imageUrl || "").trim();

          const videoUrl = isVideoMediaUrlClient(rawMediaUrl) ? rawMediaUrl : "";

          const imageUrl = videoUrl ? "" : rawMediaUrl;

          const hasImage = !!imageUrl;

          const hasVideo = !!videoUrl;

          const hasAudio = !!audioUrl;



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



          const bubbleClass = [

            "tz-chat-bubble",

            isMine ? "mine" : "other",

            (hasImage || hasVideo) && !hasBody && !hasAudio ? "is-image-only" : "",

            (hasImage || hasVideo) && hasBody ? "has-image" : "",

            hasAudio ? "has-audio" : "",

            hasVideo ? "has-video" : "",

            "is-single",

          ].filter(Boolean).join(" ");



          row.innerHTML = \`

            <div class="\${bubbleClass}">

              \${hasBody ? \`<div class="tz-chat-body">\${safeEscape(message.body)}</div>\` : ""}

              \${hasImage ? \`<img class="tz-chat-image" src="\${safeEscape(imageUrl)}" alt="Message image" />\` : ""}

              \${hasVideo ? renderVideoPreviewFrameClient(videoUrl) : ""}

              \${hasAudio ? \`<audio class="tz-chat-audio" controls preload="metadata" src="\${safeEscape(audioUrl)}"></audio>\` : ""}

              <div class="tz-chat-time" data-local-time="\${safeEscape(String(message.createdAt || ""))}">\${safeEscape(formatPrettyLocalClient(message.createdAt))}</div>

              \${isMine ? \`<div class="tz-chat-status">\${safeEscape(message.readAt ? "Seen" : "Delivered")}</div>\` : ""}

            </div>

          \`;



          chat.appendChild(row);

          updateLastKnownMessageAt(message.createdAt);

          applyBubbleGrouping();

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



        applyBubbleGrouping();

        const newestSeedRow = lastRow();

        if (newestSeedRow) updateLastKnownMessageAt(newestSeedRow.getAttribute("data-created-at"));



        async function fetchNewMessages() {

          if (!document.hasFocus()) return;

          try {

            const url = "/messages/" + encodeURIComponent(conversationId) + "/live" + (lastKnownMessageAt ? "?after=" + encodeURIComponent(lastKnownMessageAt) : "");

            const res = await fetch(url, {

              headers: { "X-Requested-With": "XMLHttpRequest" },

              cache: "no-store",

            });

            const data = await res.json();

            if (!res.ok || !data.ok) return;

            (data.messages || []).forEach(appendMessage);

          } catch (err) {

            // Socket is the primary live channel; polling quietly backs it up when needed.

          }

        }



        if (socket) socket.on("receive_message", function(message){

          appendMessage(message);

          if (typingIndicator) typingIndicator.style.display = "none";

        });



        if (socket) socket.on("typing", function(data){

          if (!typingIndicator) return;

          if (!data || String(data.conversationId || "") !== String(conversationId)) return;

          const name = data.username || "Someone";

          if (name === currentUsername) return;

          typingIndicator.textContent = name + " is typing...";

          typingIndicator.style.display = "flex";

        });



        if (socket) socket.on("stop_typing", function(data){

          if (!typingIndicator) return;

          if (!data || String(data.conversationId || "") !== String(conversationId)) return;

          typingIndicator.style.display = "none";

        });



        if (socket) socket.on("messages_seen", function(data){

          if (!data || String(data.conversationId || "") !== String(conversationId)) return;

          if (String(data.readerProfileId || "") === String(currentProfileId)) return;

          markSeen(data.messageIds || []);

        });



        if (textarea) {

          autoResizeTextarea();



          textarea.addEventListener("input", function(){

            autoResizeTextarea();



            if (socket) socket.emit("typing", {

              conversationId,

              username: currentUsername,

            });



            clearTimeout(typingTimer);

            typingTimer = setTimeout(function(){

              if (socket) socket.emit("stop_typing", { conversationId });

            }, 900);

          });

        }



        if (recordBtn) {

          recordBtn.addEventListener("click", toggleRecording);

        }



        if (mediaInput) {

          mediaInput.addEventListener("change", function() {

            if (mediaInput.files && mediaInput.files[0] && mediaHint) {

              const selectedFile = mediaInput.files[0];
              if (selectedFile.type && selectedFile.type.startsWith("video/")) {
                mediaHint.textContent = "Video ready: " + selectedFile.name;
              } else if (selectedFile.type && selectedFile.type.startsWith("audio/")) {
                mediaHint.textContent = "Audio ready: " + selectedFile.name;
              } else {
                mediaHint.textContent = selectedFile.name;
              }

            }

          });

        }



        function uploadMessageWithProgress(formData) {

          return new Promise(function(resolve, reject) {

            const xhr = new XMLHttpRequest();

            xhr.open("POST", form.action);

            xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");

            xhr.upload.onprogress = function(event) {

              if (!event.lengthComputable || !sendBtn) return;

              const percent = Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100)));

              sendBtn.textContent = "Uploading " + percent + "%";

            };

            xhr.onload = function() {

              let data = {};

              try { data = JSON.parse(xhr.responseText || "{}"); } catch (_) {}

              if (xhr.status < 200 || xhr.status >= 300 || !data.ok) {

                reject(new Error(data.error || "Send failed"));

                return;

              }

              resolve(data);

            };

            xhr.onerror = function() { reject(new Error("Network upload failed")); };

            xhr.ontimeout = function() { reject(new Error("Upload timed out")); };

            // Long-form videos can take several minutes on mobile connections.
            xhr.timeout = 30 * 60 * 1000;

            xhr.send(formData);

          });

        }



        form.addEventListener("submit", async function(e){

          e.preventDefault();

          if (isSending) return;



          const text = String(textarea?.value || "").trim();

          const selectedFile = mediaInput && mediaInput.files ? mediaInput.files[0] : null;

          const hasMedia = !!selectedFile;

          if (!text && !hasMedia) return;



          setSending(true);

          if (selectedFile && selectedFile.type && selectedFile.type.startsWith("video/") && sendBtn) {

            sendBtn.textContent = "Preparing...";

            if (mediaHint) mediaHint.textContent = "Sending video — keep this page open.";

          }



          try {

            const formData = new FormData(form);

            const data = await uploadMessageWithProgress(formData);



            if (data.message) {

              appendMessage(data.message);

            }



            if (textarea) {

              textarea.value = "";

              autoResizeTextarea();

            }

            if (mediaInput) mediaInput.value = "";

            if (mediaHint) mediaHint.textContent = "";

            setRecordState("", false);

            if (recordBtn) recordBtn.textContent = "🎤";

            if (typingIndicator) typingIndicator.style.display = "none";



            if (socket) socket.emit("stop_typing", { conversationId });

          } catch (err) {

            alert(err.message || "Could not send message");

          } finally {

            setSending(false);

          }

        });



        const liveFallbackTimer = window.setInterval(() => {
          // Socket.IO is the fast path. Poll only as a quiet backup when live socket is down.
          if (!socket || !socket.connected) fetchNewMessages();
        }, 8000);

        document.addEventListener("visibilitychange", function(){

          if (!document.hidden) fetchNewMessages();

        });

        window.addEventListener("beforeunload", function(){

          window.clearInterval(liveFallbackTimer);

          if (socket) socket.emit("leave_conversation", conversationId);

        });

      })();

    </script>



    ${renderTapzyAssistant({

      username: currentProfile.username || "User",

      pageType: "messages",

    })}

  `;

};
