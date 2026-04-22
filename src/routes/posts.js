const router = require("express").Router();

router.all(/^\/posts(?:\/.*)?$/, (req, res) => {
  return res.redirect(302, "/stories");
});

module.exports = router;
