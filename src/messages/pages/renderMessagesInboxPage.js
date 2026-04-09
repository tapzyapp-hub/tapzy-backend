const renderThreadRow = require("../components/renderThreadRow");
const renderEmptyInbox = require("../components/renderEmptyInbox");

module.exports = function renderMessagesInboxPage({
  currentProfile,
  rows,
  conversationCount,
  renderTapzyAssistant,
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
                <a class="tz-btn tz-btn-primary" href="${escapeHtml(discoveryHref)}">Start Conversation</a>
              </div>
            </div>

            <div class="tz-msg-content">
              <div class="tz-msg-section-head">
                <h2 class="tz-msg-section-title">Inbox</h2>
                <div class="tz-msg-section-meta">
                  ${conversationCount} conversation${conversationCount === 1 ? "" : "s"}
                </div>
              </div>

              <div class="tz-msg-list">
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
        transition:transform .16s ease, box-shadow .16s ease, opacity .16s ease, filter .16s ease;
        -webkit-tap-highlight-color: transparent;
      }

      .tz-btn:hover{
        transform:translateY(-1px);
      }

      .tz-btn:active{
        transform:scale(.985);
      }

      .tz-btn-primary{
        background:linear-gradient(180deg,#ffffff,#dfe6ee);
        color:#000;
        box-shadow:0 10px 22px rgba(0,0,0,.18);
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
        display:grid;
        grid-template-columns:auto 1fr auto;
        gap:14px;
        align-items:center;
        padding:14px;
        border-radius:24px;
        text-decoration:none;
        background:
          radial-gradient(380px 150px at 78% 14%, rgba(30, 52, 96, .10), transparent 40%),
          linear-gradient(180deg, rgba(12,14,20,.96), rgba(7,9,14,.99));
        border:1px solid rgba(168, 184, 210, .10);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.025),
          0 14px 28px rgba(0,0,0,.22);
        transition:
          transform .18s ease,
          border-color .18s ease,
          box-shadow .18s ease,
          background .18s ease;
        -webkit-tap-highlight-color: transparent;
      }

      .tz-msg-thread:hover{
        transform:translateY(-2px);
        border-color:rgba(170, 190, 220, .16);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.03),
          0 18px 34px rgba(0,0,0,.25),
          0 0 18px rgba(120,170,235,.05);
      }

      .tz-msg-thread:active{
        transform:scale(.992);
      }

      .tz-msg-thread-avatar{
        width:56px;
        height:56px;
        border-radius:16px;
        overflow:hidden;
        background:
          radial-gradient(circle at 50% 0%, rgba(120,160,220,.08), transparent 55%),
          linear-gradient(180deg, rgba(10,12,18,.98), rgba(5,6,10,1));
        border:1px solid rgba(168, 184, 210, .10);
        display:flex;
        align-items:center;
        justify-content:center;
        color:#eef6ff;
        font-weight:800;
        font-size:20px;
        box-shadow:
          0 10px 24px rgba(0,0,0,.26),
          inset 0 1px 0 rgba(255,255,255,.03);
        transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease;
      }

      .tz-msg-thread:hover .tz-msg-thread-avatar{
        transform:translateY(-1px);
        box-shadow:
          0 12px 26px rgba(0,0,0,.28),
          0 0 16px rgba(120,170,235,.05);
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
        font-size:17px;
        font-weight:800;
        color:#f8fbff;
        line-height:1.1;
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
        margin-top:4px;
        color:#8f9db3;
        font-size:12px;
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
        margin-top:8px;
        color:#d5deea;
        font-size:14px;
        line-height:1.45;
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
        border-radius:24px;
        border:1px dashed rgba(168, 184, 210, .12);
        background:
          radial-gradient(240px 110px at 50% 0%, rgba(26, 46, 84, .12), transparent 62%),
          rgba(255,255,255,.02);
        padding:24px;
        color:#9ba9bf;
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

      @media(max-width:700px){
        .tz-msg-hub{
          padding:14px;
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

        .tz-btn-primary{
          width:100%;
        }

        .tz-msg-head-actions{
          width:100%;
        }

        .tz-msg-thread{
          grid-template-columns:auto 1fr;
          padding:12px;
          border-radius:20px;
        }

        .tz-msg-thread-arrow{
          display:none;
        }

        .tz-msg-thread-avatar{
          width:50px;
          height:50px;
          border-radius:14px;
          font-size:18px;
        }

        .tz-msg-thread-name{
          font-size:16px;
        }

        .tz-msg-thread-badge{
          min-height:26px;
          padding:0 9px;
          font-size:10px;
        }
      }
    </style>

    ${renderTapzyAssistant({
      username: currentProfile.username || "User",
      pageType: "messages-list",
    })}
  `;
};

