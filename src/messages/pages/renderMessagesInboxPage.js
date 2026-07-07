const renderThreadRow = require("../components/renderThreadRow");
const renderEmptyInbox = require("../components/renderEmptyInbox");

module.exports = function renderMessagesInboxPage({
  currentProfile,
  rows,
  conversationCount,
  renderTapzyAssistant,
  unreadNotificationCount = 0,
  view = "inbox",
}) {
  const { escapeHtml } = require("../../utils");

  const discoveryHref = `/discovery/${encodeURIComponent(
    currentProfile.username || "user"
  )}?tab=search`;

  const threadsHtml = rows.length
    ? rows.map((row) => renderThreadRow({ row, escapeHtml })).join("")
    : renderEmptyInbox({ currentProfile });
  const isArchived = view === "archived";

  return `
    <div class="wrap">
      <div class="tz-msg-shell">
        <section class="tz-msg-section">
          <div class="tz-msg-hub">
            <div class="tz-msg-head">
              <div>
                <div class="tz-msg-kicker">Tapzy Contacts</div>
                <h1 class="tz-msg-title">Contacts</h1>
                <div class="tz-msg-subtitle">
                  Your private Tapzy contact list for quick one-to-one messages, shared stories, and real connections.
                </div>
              </div>

              <div class="tz-msg-head-actions">
                <a class="tz-btn tz-btn-dark" href="${escapeHtml(discoveryHref)}">Find People</a>
                <a class="tz-btn tz-btn-dark" href="/notifications">Activity${unreadNotificationCount ? ` (${unreadNotificationCount})` : ""}</a>
              </div>
            </div>

            <div class="tz-msg-tabs" role="tablist" aria-label="Message views">
              <a class="tz-msg-tab${!isArchived ? " is-active" : ""}" href="/messages">Inbox</a>
              <a class="tz-msg-tab${isArchived ? " is-active" : ""}" href="/messages?view=archived">Archived</a>
            </div>

            <div class="tz-msg-content">
              <div class="tz-msg-section-head">
                <h2 class="tz-msg-section-title">${isArchived ? "Saved Contacts" : "Tapzy Contacts"}</h2>
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

      .tz-msg-tabs{
        position:relative;
        z-index:2;
        display:flex;
        gap:10px;
        margin-top:18px;
        padding:6px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.035);
        width:max-content;
        max-width:100%;
      }

      .tz-msg-tab{
        min-height:38px;
        padding:0 16px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        color:#aebbd0;
        text-decoration:none;
        font-size:13px;
        font-weight:800;
      }

      .tz-msg-tab.is-active{
        color:#08111d;
        background:linear-gradient(180deg,#f9fcff,#dceeff);
        box-shadow:0 10px 24px rgba(0,0,0,.22);
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

      /* Tapzy premium messaging refresh */
      .wrap{
        background:
          radial-gradient(700px 380px at 50% -10%, rgba(29,92,220,.18), transparent 58%),
          radial-gradient(460px 320px at 100% 18%, rgba(91,168,255,.08), transparent 56%),
          #000;
      }

      .tz-msg-shell{
        max-width:980px;
        padding:0 14px 90px;
      }

      .tz-msg-hub{
        border-radius:34px;
        border-color:rgba(96,174,255,.16);
        background:
          radial-gradient(640px 280px at 50% -8%, rgba(39,113,255,.22), transparent 54%),
          radial-gradient(420px 260px at 92% 18%, rgba(148,204,255,.08), transparent 56%),
          linear-gradient(180deg, rgba(8,12,22,.98), rgba(1,2,5,1) 78%);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.055),
          0 28px 86px rgba(0,0,0,.52),
          0 0 42px rgba(38,118,255,.08);
      }

      .tz-msg-hub::before{
        opacity:.055;
        background-image:
          radial-gradient(rgba(255,255,255,.78) .55px, transparent .55px);
        mask-image:radial-gradient(circle at 50% 18%, #000, transparent 72%);
        -webkit-mask-image:radial-gradient(circle at 50% 18%, #000, transparent 72%);
      }

      .tz-msg-kicker{
        color:#9fb8e8;
        font-weight:900;
        letter-spacing:.42em;
      }

      .tz-msg-title{
        font-size:clamp(40px,8vw,68px);
        letter-spacing:-.075em;
        text-shadow:0 18px 52px rgba(0,0,0,.55), 0 0 26px rgba(72,143,255,.12);
      }

      .tz-msg-subtitle{
        color:rgba(226,235,255,.74);
        font-size:16px;
        line-height:1.55;
      }

      .tz-btn-dark{
        min-height:48px;
        border-color:rgba(116,190,255,.18);
        background:
          radial-gradient(120px 70px at 50% 0%, rgba(87,164,255,.22), transparent 70%),
          linear-gradient(180deg, rgba(21,27,39,.98), rgba(7,10,17,.98));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.06),
          0 14px 30px rgba(0,0,0,.28),
          0 0 22px rgba(50,130,255,.12);
      }

      .tz-msg-tabs{
        background:rgba(255,255,255,.028);
        border-color:rgba(116,190,255,.12);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.035);
      }

      .tz-msg-tab{
        letter-spacing:.02em;
      }

      .tz-msg-tab.is-active{
        color:#06111f;
        background:linear-gradient(180deg,#f9fdff,#dceeff);
        box-shadow:0 14px 34px rgba(0,0,0,.28), 0 0 28px rgba(120,194,255,.12);
      }

      .tz-msg-content{
        margin-top:22px;
      }

      .tz-msg-section-title{
        font-size:clamp(25px,5vw,36px);
        letter-spacing:-.055em;
      }

      .tz-msg-thread{
        min-height:106px;
        padding:18px;
        border-radius:28px;
        border-color:rgba(116,190,255,.13);
        background:
          radial-gradient(440px 220px at 86% 5%, rgba(63,140,255,.18), transparent 45%),
          radial-gradient(260px 160px at 12% 95%, rgba(255,255,255,.045), transparent 55%),
          linear-gradient(180deg, rgba(13,18,29,.98), rgba(4,6,12,.995));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.045),
          0 18px 48px rgba(0,0,0,.34),
          0 0 0 1px rgba(78,154,255,.035);
      }

      .tz-msg-thread:hover{
        border-color:rgba(137,207,255,.26);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.05),
          0 24px 58px rgba(0,0,0,.38),
          0 0 34px rgba(74,145,255,.18);
      }

      .tz-msg-thread-avatar{
        width:64px;
        height:64px;
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

      .tz-msg-thread-name{
        letter-spacing:-.045em;
      }

      .tz-msg-thread-badge{
        border-color:rgba(121,190,255,.18);
        background:rgba(62,130,255,.09);
        color:#dcecff;
      }

      .tz-msg-thread-preview{
        color:rgba(218,228,244,.78);
      }

      .tz-msg-thread-unread{
        background:linear-gradient(180deg,#347eff,#1651c2);
        box-shadow:0 0 22px rgba(66,140,255,.36);
      }

      .tz-core-empty{
        border-style:solid;
        border-color:rgba(116,190,255,.13);
        background:
          radial-gradient(320px 160px at 50% 0%, rgba(48,126,255,.16), transparent 65%),
          rgba(255,255,255,.025);
        padding:28px;
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

      .tz-msg-hub{
        border-radius:28px;
        padding:16px;
      }

      .tz-msg-head{
        padding:4px 2px 2px;
      }

      .tz-msg-title{
        font-size:clamp(42px, 9vw, 58px);
        letter-spacing:-.065em;
      }

      .tz-msg-subtitle{
        max-width:560px;
      }

      .tz-msg-head-actions{
        width:100%;
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
      }

      .tz-msg-tabs{
        width:100%;
      }

      .tz-msg-tab{
        flex:1;
      }

      .tz-msg-section-head{
        margin-top:2px;
        padding:0 2px;
      }

      .tz-msg-section-title{
        font-size:clamp(26px, 6vw, 34px);
      }

      .tz-msg-list{
        gap:10px;
      }

      .tz-msg-thread{
        grid-template-columns:auto minmax(0, 1fr) auto;
        min-height:88px;
        padding:12px 14px;
        gap:14px;
        border-radius:22px;
        background:
          radial-gradient(320px 160px at 92% 8%, rgba(57,132,255,.13), transparent 48%),
          linear-gradient(180deg, rgba(13,18,28,.96), rgba(4,6,11,.99));
      }

      .tz-msg-thread.has-unread{
        border-color:rgba(111,195,255,.32);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.06),
          0 18px 44px rgba(0,0,0,.34),
          0 0 28px rgba(66,145,255,.14);
      }

      .tz-msg-thread::before{
        width:190px;
        height:190px;
        right:-76px;
        top:-64px;
        opacity:.86;
      }

      .tz-msg-thread-avatar-wrap{
        position:relative;
        width:66px;
        height:66px;
        display:flex;
        align-items:center;
        justify-content:center;
        flex:0 0 auto;
      }

      .tz-msg-thread-avatar-wrap::before,
      .tz-msg-thread-avatar-wrap::after{
        content:"";
        position:absolute;
        inset:2px;
        border-radius:22px;
        border:1px solid rgba(108,190,255,.58);
        box-shadow:0 0 0 rgba(78,160,255,0);
        animation:tzContactPulse 2.2s ease-out infinite;
        pointer-events:none;
      }

      .tz-msg-thread-avatar-wrap::after{
        inset:-3px;
        opacity:.34;
        animation-delay:.75s;
      }

      .tz-msg-thread-avatar{
        position:relative;
        z-index:1;
        width:58px;
        height:58px;
        border-radius:19px;
      }

      .tz-msg-thread-name-row{
        gap:8px;
      }

      .tz-msg-thread-name{
        font-size:20px;
      }

      .tz-msg-thread-badge{
        min-height:24px;
        padding:0 9px;
        font-size:10px;
        letter-spacing:.11em;
      }

      .tz-msg-thread-user{
        margin-top:4px;
        font-size:14px;
      }

      .tz-msg-thread-preview{
        margin-top:4px;
        font-size:14px;
      }

      .tz-msg-thread-time{
        font-size:12px;
        color:#9aa9bd;
      }

      .tz-msg-thread-arrow{
        width:30px;
        height:30px;
        border-radius:999px;
        display:flex;
        align-items:center;
        justify-content:center;
        background:rgba(255,255,255,.045);
        color:#d9e9ff;
        font-size:24px;
      }

      @keyframes tzContactPulse{
        0%{
          transform:scale(.92);
          opacity:.68;
          box-shadow:0 0 0 0 rgba(77,157,255,.28);
        }
        72%{
          opacity:.08;
          box-shadow:0 0 0 13px rgba(77,157,255,0);
        }
        100%{
          transform:scale(1.16);
          opacity:0;
          box-shadow:0 0 0 16px rgba(77,157,255,0);
        }
      }

      @media(max-width:700px){
        .tz-msg-hub{
          padding:14px 10px;
        }

        .tz-msg-head-actions{
          grid-template-columns:1fr;
        }

        .tz-msg-thread{
          grid-template-columns:auto minmax(0, 1fr) auto;
          min-height:82px;
          padding:12px;
          gap:11px;
        }

        .tz-msg-thread-avatar-wrap{
          width:58px;
          height:58px;
        }

        .tz-msg-thread-avatar{
          width:52px;
          height:52px;
          border-radius:17px;
        }

        .tz-msg-thread-name{
          font-size:18px;
        }

        .tz-msg-thread-top{
          align-items:center;
        }

        .tz-msg-thread-top-right{
          align-self:flex-start;
        }

        .tz-msg-thread-time{
          display:none;
        }

        .tz-msg-thread-arrow{
          display:flex;
          width:28px;
          height:28px;
          font-size:22px;
        }
      }

      .tz-msg-hub{
        border-radius:26px;
        padding:14px 18px 20px;
      }

      .tz-msg-head{
        justify-content:center;
        text-align:center;
      }

      .tz-msg-kicker,
      .tz-msg-subtitle{
        display:none;
      }

      .tz-msg-title{
        font-size:30px;
        letter-spacing:0;
      }

      .tz-msg-head-actions{
        margin-top:12px;
      }

      .tz-msg-tabs{
        margin-left:auto;
        margin-right:auto;
      }

      .tz-msg-section-head{
        padding:8px 2px 2px;
      }

      .tz-msg-section-title{
        font-size:20px;
        letter-spacing:0;
      }

      .tz-msg-section-meta{
        display:none;
      }

      .tz-msg-list{
        gap:0;
        overflow:hidden;
        border-radius:20px;
        border:1px solid rgba(120,190,255,.12);
        background:rgba(255,255,255,.018);
      }

      .tz-msg-thread{
        display:grid;
        grid-template-columns:auto minmax(0, 1fr) auto;
        min-height:76px;
        padding:10px 4px 10px 4px;
        gap:14px;
        border:0;
        border-radius:0;
        box-shadow:none;
        background:transparent;
      }

      .tz-msg-thread + .tz-msg-thread{
        border-top:1px solid rgba(255,255,255,.08);
      }

      .tz-msg-thread:hover{
        transform:none;
        border-color:transparent;
        background:rgba(255,255,255,.035);
        box-shadow:none;
      }

      .tz-msg-thread:active{
        transform:none;
        background:rgba(255,255,255,.06);
      }

      .tz-msg-thread::before,
      .tz-msg-thread::after,
      .tz-msg-thread-shimmer,
      .tz-msg-thread-glow,
      .tz-msg-thread-arrow,
      .tz-msg-thread-user,
      .tz-msg-thread-preview,
      .tz-msg-thread-badge,
      .tz-msg-thread-time{
        display:none;
      }

      .tz-msg-thread-avatar-wrap{
        width:62px;
        height:62px;
      }

      .tz-msg-thread-avatar-wrap::before,
      .tz-msg-thread-avatar-wrap::after{
        border-radius:999px;
      }

      .tz-msg-thread-avatar{
        width:54px;
        height:54px;
        border-radius:999px;
        font-size:20px;
        background:
          radial-gradient(circle at 30% 18%, rgba(236,247,255,.55), transparent 32%),
          linear-gradient(145deg, #abcaf2, #667ec9);
      }

      .tz-msg-thread-main,
      .tz-msg-thread-copy,
      .tz-msg-thread-name-row{
        min-width:0;
      }

      .tz-msg-thread-top{
        min-height:54px;
        align-items:center;
      }

      .tz-msg-thread-name{
        font-size:22px;
        font-weight:800;
        letter-spacing:0;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .tz-msg-thread-unread{
        min-width:20px;
        height:20px;
        padding:0 7px;
      }

      @media(max-width:700px){
        .tz-msg-hub{
          padding:12px 12px 18px;
          border-radius:24px;
        }

        .tz-msg-title{
          font-size:26px;
        }

        .tz-msg-list{
          border-left:0;
          border-right:0;
          border-radius:0;
          background:transparent;
        }

        .tz-msg-thread{
          min-height:72px;
          padding:9px 0;
          gap:12px;
        }

        .tz-msg-thread-avatar-wrap{
          width:58px;
          height:58px;
        }

        .tz-msg-thread-avatar{
          width:50px;
          height:50px;
          font-size:19px;
        }

        .tz-msg-thread-name{
          font-size:21px;
        }
      }
    </style>

    ${renderTapzyAssistant({
      username: currentProfile.username || "User",
      pageType: "messages-list",
    })}
  `;
};
