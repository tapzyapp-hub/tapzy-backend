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