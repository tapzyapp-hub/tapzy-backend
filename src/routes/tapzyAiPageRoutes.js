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
    .tz-ai-launch{display:none!important}
    .tz-ai-panel{opacity:1!important;pointer-events:auto!important;transform:none!important;display:flex!important;visibility:visible!important}
    .tz-ai-panel.tz-ai-room{opacity:1!important;pointer-events:auto!important;transform:none!important;display:flex!important;visibility:visible!important}
    .tz-ai-root[data-tapzy-assistant]{display:block!important;visibility:visible!important}
  </style>
  ${renderTapzyAssistant({
    username: req.session?.user?.username || "User",
    pageType: "old-ai-test"
  })}
  <script>
    setTimeout(function(){
      if (window.__tapzyOpenAssistant) window.__tapzyOpenAssistant();
    }, 300);
  </script>
</body>
</html>
  `);
});

module.exports = router;