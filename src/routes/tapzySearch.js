const express = require("express");
const { tapzySearchPlaces } = require("../services/tapzySearchService");
const { absorbTapzyBrain, loadTapzyBrainContext } = require("../services/tapzyBrainService");

const router = express.Router();

function safeString(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function searchParams(req) {
  const source = req.method === "GET" ? req.query : req.body;
  return {
    query: safeString(source.q || source.query || source.message, 500),
    city: safeString(source.city || source.locationCity, 120),
    username: safeString(source.username, 80),
    profileId: safeString(source.profileId, 120),
    latitude: safeNumber(source.latitude || source.lat),
    longitude: safeNumber(source.longitude || source.lng || source.lon),
    limit: Math.min(12, Math.max(1, safeNumber(source.limit) || 8)),
  };
}

async function handleSearch(req, res) {
  const params = searchParams(req);
  if (!params.query) {
    return res.status(400).json({ ok: false, error: "Search query required." });
  }

  try {
    const search = await tapzySearchPlaces(params);
    await absorbTapzyBrain({
      message: params.query,
      username: params.username,
      profileId: params.profileId,
      city: params.city,
      tapzySearch: search,
    });
    const brain = await loadTapzyBrainContext({
      message: params.query,
      username: params.username,
      profileId: params.profileId,
      city: params.city,
      limit: 8,
    });
    return res.json({ ok: true, search, brain });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Tapzy Search is temporarily unavailable.",
      detail: safeString(error && error.message ? error.message : "", 180),
    });
  }
}

router.get("/", handleSearch);
router.post("/", handleSearch);

module.exports = router;
