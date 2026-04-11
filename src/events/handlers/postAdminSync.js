
const { requireAdmin } = require("../../middleware");
const { backUrl } = require("../../utils");
const { syncRealEvents } = require("../../services/eventSyncService");

module.exports = async function postAdminSync(req, res) {


  try {

    if (!requireAdmin(req, res)) return;



    const key = String(req.query.key || "").trim();

    const count = await syncRealEvents();



    return res.redirect(

      backUrl(req, `/events?key=${encodeURIComponent(key)}&synced=${count}`)

    );

  } catch (e) {

    console.error(e);

    return res.status(500).send("Real event sync error");

  }

};
