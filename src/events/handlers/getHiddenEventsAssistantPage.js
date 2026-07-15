const { renderShell, renderTapzyAssistant } = require("../../utils");

async function getHiddenEventsAssistantPage(req, res, next) {
  try {
    const currentProfile = req.currentProfile || null;
    const body = `
      <style>
        html, body {
          background: #000 !important;
          min-height: 100%;
          overflow-x: hidden;
        }

        .events-ai-handoff {
          min-height: 100vh;
          background: radial-gradient(circle at 50% 24%, rgba(23, 104, 245, 0.18), transparent 42%), #000;
          color: #fff;
          display: grid;
          place-items: center;
          padding: 24px;
        }

        .events-ai-logo {
          width: 88px;
          height: 88px;
          border: 0;
          border-radius: 26px;
          background: linear-gradient(145deg, #2f7bff, #1455df);
          display: grid;
          place-items: center;
          box-shadow: 0 0 44px rgba(47, 123, 255, 0.42);
          animation: eventsAiPulse 1.7s ease-in-out infinite;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }

        .events-ai-logo img {
          width: 72%;
          height: 72%;
          object-fit: contain;
          display: block;
        }

        @keyframes eventsAiPulse {
          0%, 100% {
            transform: scale(0.98);
            box-shadow: 0 0 32px rgba(47, 123, 255, 0.28);
          }

          50% {
            transform: scale(1.04);
            box-shadow: 0 0 68px rgba(84, 161, 255, 0.62);
          }
        }
      </style>
      <main class="events-ai-handoff" aria-label="Tapzy events assistant">
        <button class="events-ai-logo tz-ai-trigger" type="button" data-tapzy-ai-open aria-label="Ask Tapzy about events">
          <img src="/images/tapzy-mark-white.png" alt="" aria-hidden="true" />
        </button>
      </main>
      ${renderTapzyAssistant({
        username: currentProfile?.username || "User",
        pageType: "events",
      })}
      <script>
        setTimeout(function () {
          var btn = document.querySelector("[data-tapzy-ai-open]");
          if (btn) btn.click();
        }, 250);
      </script>
    `;

    res.send(renderShell("Events", body, "", {
      currentProfile,
      pageTitle: "Events",
      activeNav: "events",
      hideTopBar: true,
    }));
  } catch (error) {
    next(error);
  }
}

module.exports = getHiddenEventsAssistantPage;