const renderThreadRow = require("../components/renderThreadRow");
const renderEmptyInbox = require("../components/renderEmptyInbox");

module.exports = function renderMessagesInboxPage({
  currentProfile,
  rows,
  conversationCount,
  renderTapzyAssistant,
  unreadNotificationCount = 0,
}) {
  const { escapeHtml } = require("../../utils");

  const discoveryHref = `/discovery/${encodeURIComponent(
    currentProfile.username || "user"
  )}?tab=search`;

  const threadsHtml = rows.length
    ? rows.map((row) => renderThreadRow({ row, escapeHtml })).join("")
    : renderEmptyInbox({ currentProfile });

  return `
    <div class="wrap">
      <div class="tz-msg-shell">
        <section class="tz-msg-section">
          <div class="tz-msg-hub">
            <div class="tz-msg-head">
              <div>
                <div class="tz-msg-kicker">Tapzy Connect</div>
                <h1 class="tz-msg-title">Messages</h1>
                <div class="tz-msg-subtitle">
                  Private conversations inside your Tapzy network.
                </div>
              </div>

              <div class="tz-msg-head-actions">
                <a class="tz-btn tz-btn-dark" href="${escapeHtml(discoveryHref)}">Start Conversation</a>
                <a class="tz-btn tz-btn-dark" href="/notifications">Notifications <span class="tz-btn-notif-count" data-live-notification-badge ${unreadNotificationCount ? "" : "hidden"}>${unreadNotificationCount ? `${unreadNotificationCount}` : "0"}</span></a>
              </div>
            </div>

            <div class="tz-msg-content">
              <div class="tz-msg-section-head">
                <h2 class="tz-msg-section-title">Inbox</h2>
                <div class="tz-msg-section-meta">
                  ${conversationCount} conversation${conversationCount === 1 ? "" : "s"}
                </div>
              </div>

              <div class="tz-msg-list" id="tzInboxList">
                ${threadsHtml}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <style>
      .tz-msg-shell{
        max-width:1120px;
        margin:0 auto;
      }

      .tz-msg-section{
        margin-top:18px;
      }

      .tz-msg-hub{
        position:relative;
        overflow:hidden;
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
        padding:18px;
      }

      .tz-msg-hub::before{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        opacity:.032;
        background-image:radial-gradient(rgba(255,255,255,.88) .6px, transparent .6px);
        background-size:10px 10px;
      }

      .tz-msg-hub::after{
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

      .tz-msg-head{
        position:relative;
        z-index:2;
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:16px;
        flex-wrap:wrap;
      }

      .tz-msg-kicker{
        color:#9aacc7;
        text-transform:uppercase;
        letter-spacing:4px;
        font-size:11px;
        margin-bottom:10px;
      }

      .tz-msg-title{
        margin:0;
        font-size:46px;
        line-height:1;
        letter-spacing:-1.6px;
        color:#f7fbff;
      }

      .tz-msg-subtitle{
        margin-top:14px;
        max-width:620px;
        color:#aab6c9;
        line-height:1.7;
        font-size:15px;
      }

      .tz-msg-head-actions{
        position:relative;
        z-index:2;
        display:flex;
        gap:10px;
        flex-wrap:wrap;
      }

      .tz-btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:46px;
        padding:0 18px;
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

      .tz-btn:hover{
        transform:translateY(-1px);
      }

      .tz-btn:active{
        transform:scale(.985);
      }

      .tz-btn-dark{
        color:#fff;
        background:linear-gradient(180deg, rgba(22,23,31,.98), rgba(14,15,22,.98));
        border:1px solid rgba(255,255,255,.08);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.03),
          0 12px 26px rgba(0,0,0,.22);
      }

      .tz-btn-dark:hover{
        border-color:rgba(127,210,255,.28);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.04),
          0 18px 34px rgba(0,0,0,.26),
          0 0 22px rgba(90,165,255,.16);
      }

      .tz-msg-content{
        position:relative;
        z-index:2;
        margin-top:18px;
      }

      .tz-msg-section-head{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        flex-wrap:wrap;
        margin-bottom:14px;
      }

      .tz-msg-section-title{
        margin:0;
        font-size:26px;
        line-height:1.08;
        letter-spacing:-.5px;
        color:#f7fbff;
      }

      .tz-msg-section-meta{
        color:#96a4ba;
        font-size:13px;
      }

      .tz-msg-list{
        display:grid;
        gap:12px;
      }

      .tz-msg-thread{
        position:relative;
        overflow:hidden;
        display:grid;
        grid-template-columns:auto 1fr auto;
        gap:14px;
        align-items:center;
        padding:16px;
        border-radius:22px;
        text-decoration:none;
        background:
          radial-gradient(460px 200px at 85% 10%, rgba(90,165,255,.11), transparent 42%),
          linear-gradient(180deg, rgba(20,22,30,.97), rgba(9,11,16,.995));
        border:1px solid rgba(255,255,255,.08);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.03),
          0 16px 38px rgba(0,0,0,.24);
        transition:
          transform .18s ease,
          box-shadow .18s ease,
          border-color .18s ease;
        min-height:94px;
        -webkit-tap-highlight-color: transparent;
      }

      .tz-msg-thread::before{
        content:"";
        position:absolute;
        width:220px;
        height:220px;
        right:-60px;
        top:-40px;
        border-radius:999px;
        background:radial-gradient(circle, rgba(86,156,255,.16), transparent 68%);
        filter:blur(16px);
        pointer-events:none;
      }

      .tz-msg-thread::after{
        content:"";
        position:absolute;
        top:0;
        bottom:0;
        left:-30%;
        width:28%;
        background:linear-gradient(90deg, transparent, rgba(255,255,255,.05), transparent);
        transform:skewX(-18deg);
        pointer-events:none;
        opacity:.45;
      }

      .tz-msg-thread:hover{
        transform:translateY(-2px);
        border-color:rgba(127,210,255,.18);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.03),
          0 22px 42px rgba(0,0,0,.28),
          0 0 20px rgba(90,165,255,.15);
      }

      .tz-msg-thread:active{
        transform:scale(.985);
      }

      .tz-msg-thread-avatar{
        width:62px;
        height:62px;
        border-radius:18px;
        overflow:hidden;
        display:flex;
        align-items:center;
        justify-content:center;
        background:
          radial-gradient(circle at 50% 0%, rgba(130,200,255,.14), transparent 55%),
          linear-gradient(180deg,#162033,#0d1118);
        border:1px solid rgba(255,255,255,.08);
        color:#fff;
        font-weight:900;
        font-size:21px;
        letter-spacing:.5px;
        flex:0 0 auto;
        box-shadow:
          0 12px 28px rgba(0,0,0,.22),
          0 0 14px rgba(120,200,255,.08),
          inset 0 1px 0 rgba(255,255,255,.06);
      }

      .tz-msg-thread-avatar img{
        width:100%;
        height:100%;
        object-fit:cover;
      }

      .tz-msg-thread-avatar span{
        display:flex;
        align-items:center;
        justify-content:center;
        width:100%;
        height:100%;
      }

      .tz-msg-thread-main{
        min-width:0;
      }

      .tz-msg-thread-top{
        display:flex;
        justify-content:space-between;
        gap:10px;
        align-items:flex-start;
      }

      .tz-msg-thread-copy{
        min-width:0;
        flex:1;
      }

      .tz-msg-thread-name-row{
        display:flex;
        align-items:center;
        gap:10px;
        min-width:0;
        flex-wrap:wrap;
      }

      .tz-msg-thread-name{
        font-size:22px;
        font-weight:900;
        line-height:1.06;
        letter-spacing:-.35px;
        color:#f8fbff;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .tz-msg-thread-badge{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:28px;
        padding:0 10px;
        border-radius:999px;
        border:1px solid rgba(140,176,226,.20);
        background:rgba(120,160,220,.08);
        color:#dcecff;
        font-size:11px;
        font-weight:700;
        letter-spacing:.08em;
        text-transform:uppercase;
        white-space:nowrap;
      }

      .tz-msg-thread-user{
        margin-top:5px;
        color:#98a6ba;
        font-size:14px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .tz-msg-thread-time{
        color:#8794a8;
        font-size:11px;
        white-space:nowrap;
        flex:0 0 auto;
      }

      .tz-msg-thread-preview{
        margin-top:7px;
        color:#c8d4e3;
        font-size:14px;
        line-height:1.5;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .tz-msg-thread-arrow{
        color:#8492a8;
        font-size:24px;
        line-height:1;
      }

      .tz-core-empty{
        border-radius:22px;
        border:1px dashed rgba(255,255,255,.10);
        background:
          radial-gradient(260px 120px at 50% 0%, rgba(90,165,255,.06), transparent 62%),
          rgba(255,255,255,.03);
        padding:22px;
        color:#9fb0c8;
        text-align:center;
      }

      .tz-core-empty h3{
        margin:0 0 8px 0;
        color:#f8fbff;
      }

      .tz-core-empty p{
        margin:0;
      }

      @media(max-width:900px){
        .tz-msg-title{
          font-size:38px;
        }
      }


      .tz-msg-thread-wrap{
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        gap:12px;
        align-items:center;
      }

      .tz-msg-thread-top-right{
        display:flex;
        align-items:center;
        gap:10px;
      }

      .tz-msg-thread-unread{
        min-width:24px;
        height:24px;
        padding:0 8px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        background:linear-gradient(180deg, rgba(47,113,255,.96), rgba(22,57,125,.98));
        color:#fff;
        font-size:12px;
        font-weight:800;
        box-shadow:0 0 14px rgba(66,140,255,.18);
      }

      .tz-msg-thread-remove-form{
        margin:0;
      }

      .tz-msg-thread-remove{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:42px;
        padding:0 14px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.04);
        color:#d7e3f6;
        font-size:13px;
        font-weight:700;
        cursor:pointer;
      }

      .tz-msg-thread-remove:hover{
        background:rgba(255,255,255,.07);
      }

      @media(max-width:700px){
        .tz-msg-thread-wrap{
          grid-template-columns:1fr;
        }

        .tz-msg-thread-remove{
          width:100%;
        }

        .tz-msg-hub{
          padding:12px;
          border-radius:24px;
        }

        .tz-msg-title{
          font-size:32px;
          letter-spacing:-1.2px;
        }

        .tz-msg-subtitle{
          font-size:14px;
          margin-top:10px;
        }

        .tz-msg-head-actions{
          width:100%;
        }

        .tz-btn-dark{
          width:100%;
        }

        .tz-msg-thread{
          grid-template-columns:auto 1fr;
          padding:14px;
          border-radius:20px;
        }

        .tz-msg-thread-arrow{
          display:none;
        }

        .tz-msg-thread-avatar{
          width:56px;
          height:56px;
          border-radius:16px;
          font-size:18px;
        }

        .tz-msg-thread-name{
          font-size:18px;
        }

        .tz-msg-thread-badge{
          min-height:26px;
          padding:0 9px;
          font-size:10px;
        }
      }
    </style>



    <script>
      (function(){
        const profileId = ${JSON.stringify(currentProfile.id)};
        const inboxList = document.getElementById('tzInboxList');
        const socket = window.__tapzyLiveSocket;
        if (!profileId || !inboxList || !socket) return;

        function esc(value) {
          return String(value || '').replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; });
        }

        function initials(profile) {
          const source = String((profile && (profile.name || profile.username)) || 'T').trim();
          const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
          if (!parts.length) return 'T';
          return parts.map(function(part){ return part.charAt(0).toUpperCase(); }).join('');
        }

        function renderRow(row) {
          const other = row.other || null;
          const name = (other && (other.name || other.username)) || 'Unknown';
          const username = (other && other.username) || 'user';
          const avatarHtml = other && other.photo
            ? '<img src="' + esc(other.photo) + '" alt="' + esc(username) + '" />'
            : '<span>' + esc(initials(other)) + '</span>';
          const connectedBadge = row.isConnected ? '<div class="tz-msg-thread-badge">⚡ Connected</div>' : '';
          const unreadBadge = row.unreadCount ? '<div class="tz-msg-thread-unread">' + esc(String(row.unreadCount)) + '</div>' : '';
          const timeHtml = row.time ? '<div class="tz-msg-thread-time">' + esc(row.time) + '</div>' : '';
          return '<a class="tz-msg-thread" data-conversation-id="' + esc(String(row.id || '')) + '" href="/messages/' + esc(String(row.id || '')) + '">' +
            '<div class="tz-msg-thread-shimmer" aria-hidden="true"></div>' +
            '<div class="tz-msg-thread-glow" aria-hidden="true"></div>' +
            '<div class="tz-msg-thread-avatar">' + avatarHtml + '</div>' +
            '<div class="tz-msg-thread-main"><div class="tz-msg-thread-top"><div class="tz-msg-thread-copy"><div class="tz-msg-thread-name-row"><div class="tz-msg-thread-name">' + esc(name) + '</div>' + connectedBadge + '</div><div class="tz-msg-thread-user">@' + esc(username) + '</div></div><div class="tz-msg-thread-top-right">' + timeHtml + unreadBadge + '</div></div><div class="tz-msg-thread-preview">' + esc(row.preview || 'No messages yet') + '</div></div><div class="tz-msg-thread-arrow" aria-hidden="true">›</div></a>';
        }

        socket.on('conversation_updated', function(payload){
          if (!payload || String(payload.profileId || '') !== String(profileId) || !payload.row) return;
          const row = payload.row;
          const existing = inboxList.querySelector('.tz-msg-thread[data-conversation-id="' + String(row.id || '').replace(/"/g, '&quot;') + '"]');
          if (existing) existing.remove();
          inboxList.insertAdjacentHTML('afterbegin', renderRow(row));
        });
      })();
    </script>


    ${renderTapzyAssistant({
      username: currentProfile.username || "User",
      pageType: "messages-list",
    })}
  `;
};