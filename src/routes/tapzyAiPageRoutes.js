const express = require("express");
const { renderTapzyAssistant } = require("../utils");

const router = express.Router();

router.get("/tapzy-old-ai-test", (req, res) => {
  res.send(`
<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Old Tapzy AI Test</title>
</head>
<body style="margin:0;background:#000;min-height:100vh;">
  <style>
    html,body{margin:0!important;width:100%!important;min-height:100%!important;background:#000!important;overflow:hidden!important;}
    .tz-ai-launch{display:none!important}
    .tz-ai-root[data-tapzy-assistant]{display:block!important;visibility:visible!important;position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;background:#000!important;overflow:hidden!important;}
    .tz-ai-root[data-tapzy-assistant] .tz-ai-panel{position:fixed!important;inset:0!important;left:0!important;right:0!important;bottom:0!important;top:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;margin:0!important;opacity:1!important;pointer-events:auto!important;visibility:visible!important;transform:none!important;border-radius:0!important;border:0!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;}
    .tz-ai-root[data-tapzy-assistant] .tz-ai-panel:not(.tz-ai-room){background:linear-gradient(180deg,#02050a,#000)!important;}
    .tz-ai-root[data-tapzy-assistant] .tz-ai-stage{width:100%!important;min-height:0!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:visible!important;}
    .tz-ai-root[data-tapzy-assistant] .tz-ai-room-card{width:calc(100vw - 24px)!important;max-width:540px!important;margin:0 auto!important;transform:none!important;}
  </style>
  ${renderTapzyAssistant({
    username: req.session?.user?.username || "User",
    pageType: "old-ai-test"
  })}
  <script>
    setTimeout(function(){
      var panel=document.querySelector('.tz-ai-panel'); if(panel){panel.classList.add('tz-ai-room','is-open'); panel.dataset.aiState='idle';} if (window.__tapzyOpenAssistant) window.__tapzyOpenAssistant();
    }, 300);
  </script>
</body>
</html>
  `);
});

module.exports = router;