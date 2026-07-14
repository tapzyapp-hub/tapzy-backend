const express = require("express");
const prisma = require("../prisma");
const { buildAssistantReply } = require("../services/assistantService");

const SERPAPI_KEY = process.env.SERPAPI_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

const router = express.Router();

function asSafeString(value, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function asSafeBool(value) {
  return value === true || value === "true";
}

function asSafeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}


function getDistanceKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const toRad = (value) => (value * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function weatherConditionFromCode(code) {
  const value = Number(code);
  if ([0].includes(value)) return "clear";
  if ([1, 2].includes(value)) return "sunny";
  if ([3, 45, 48].includes(value)) return "cloudy";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(value)) return "snow";
  if ([95, 96, 99].includes(value)) return "storm";
  return "mixed";
}

async function fetchCurrentWeather(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || typeof fetch !== "function") return null;
  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + encodeURIComponent(latitude) + "&longitude=" + encodeURIComponent(longitude) + "&current=temperature_2m,weather_code,is_day,precipitation,wind_speed_10m&timezone=auto";
    const response = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(4500) : undefined });
    const data = await response.json().catch(() => null);
    const current = data && data.current ? data.current : null;
    if (!response.ok || !current) return null;
    const temp = Number(current.temperature_2m);
    const code = Number(current.weather_code);
    return {
      temperatureC: Number.isFinite(temp) ? Math.round(temp) : null,
      condition: weatherConditionFromCode(code),
      weatherCode: Number.isFinite(code) ? code : null,
      isDay: current.is_day === 1,
      precipitation: Number.isFinite(Number(current.precipitation)) ? Number(current.precipitation) : null,
      windKph: Number.isFinite(Number(current.wind_speed_10m)) ? Math.round(Number(current.wind_speed_10m)) : null,
    };
  } catch (_) {
    return null;
  }
}


const ASSISTANT_CITY_POINTS = [
  { city: "Toronto", latitude: 43.6532, longitude: -79.3832 },
  { city: "Barrie", latitude: 44.3894, longitude: -79.6903 },
  { city: "Mississauga", latitude: 43.589, longitude: -79.6441 },
  { city: "Brampton", latitude: 43.7315, longitude: -79.7624 },
  { city: "Hamilton", latitude: 43.2557, longitude: -79.8711 },
  { city: "Montreal", latitude: 45.5017, longitude: -73.5673 },
  { city: "Vancouver", latitude: 49.2827, longitude: -123.1207 },
  { city: "Calgary", latitude: 51.0447, longitude: -114.0719 },
  { city: "Edmonton", latitude: 53.5461, longitude: -113.4938 },
  { city: "New York", latitude: 40.7128, longitude: -74.006 },
  { city: "Los Angeles", latitude: 34.0522, longitude: -118.2437 },
  { city: "Chicago", latitude: 41.8781, longitude: -87.6298 },
];

function inferCity(latitude, longitude, fallback = "") {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return fallback;
  let best = null;
  for (const point of ASSISTANT_CITY_POINTS) {
    const distanceKm = getDistanceKm(latitude, longitude, point.latitude, point.longitude);
    if (distanceKm === null) continue;
    if (!best || distanceKm < best.distanceKm) best = { ...point, distanceKm };
  }
  return best && best.distanceKm <= 180 ? best.city : fallback;
}

function isLocalWebIntent(text) {
  return /(near me|nearby|around me|around here|tonight|today|tomorrow|this weekend|food|restaurant|snack|coffee|date spot|date night|weather|forecast|event|events|concert|festival|bar|club|nightlife|car meet|study group|soccer|basketball|things to do|where should|what should we do|places?|directions?)/i.test(text);
}

function shouldFetchWebSearch(message) {
  const text = String(message || "").trim();
  if (!text || text.length < 3 || !SERPAPI_KEY || typeof fetch !== "function") return false;
  if (/^(hi|hey|hello|yo|sup|yes|no|ok|okay)$/i.test(text)) return false;
  return true;
}

function buildWebQuery(message, city, weather) {
  const text = String(message || "").trim();
  const local = isLocalWebIntent(text);
  const place = city ? " in " + city : " near me";
  if (/weather|forecast|temperature|rain|raining/i.test(text)) return "current weather" + place;
  if (/food|restaurant|italian|sushi|pizza|burger|tacos|snack|dessert|coffee/i.test(text)) return text + place;
  if (/date|girl|girlfriend/i.test(text)) return "best date night ideas restaurants dessert live music" + place;
  if (/event|events|tonight|concert|festival|bar|club|nightlife|car meet|things to do/i.test(text)) return text + place;
  return local ? text + place : text;
}

function compactWebItem(item) {
  const title = asSafeString(item?.title || item?.name || "", 160);
  const link = asSafeString(item?.link || item?.website || item?.directions || "", 500);
  const snippet = asSafeString(item?.snippet || item?.description || item?.address || item?.type || "", 260);
  const rating = asSafeString(item?.rating || "", 40);
  const reviews = asSafeString(item?.reviews || "", 40);
  if (!title) return null;
  return { title, link, snippet, rating, reviews };
}

async function fetchAssistantWebSearch(message, location, weather) {
  if (!shouldFetchWebSearch(message)) return null;
  const city = location?.city || "";
  const query = buildWebQuery(message, city, weather);
  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", query);
    url.searchParams.set("hl", "en");
    url.searchParams.set("gl", city && ["Toronto", "Barrie", "Mississauga", "Brampton", "Hamilton", "Montreal", "Vancouver", "Calgary", "Edmonton"].includes(city) ? "ca" : "us");
    url.searchParams.set("num", "6");
    url.searchParams.set("api_key", SERPAPI_KEY);
    if (city) url.searchParams.set("location", city);
    const response = await fetch(url.toString(), { signal: AbortSignal.timeout ? AbortSignal.timeout(5200) : undefined });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) return { available: false, query, results: [] };
    const organic = Array.isArray(data.organic_results) ? data.organic_results : [];
    const local = Array.isArray(data.local_results?.places) ? data.local_results.places : [];
    const top = [...local, ...organic].map(compactWebItem).filter(Boolean).slice(0, 5);
    return {
      available: true,
      query,
      answer: asSafeString(data.answer_box?.answer || data.answer_box?.snippet || data.knowledge_graph?.description || "", 420),
      results: top,
    };
  } catch (error) {
    console.error("Assistant web search failed:", error?.message || error);
    return { available: false, query, results: [] };
  }
}

function asSafeMemory(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => ({
      role: asSafeString(item?.role, 40),
      content: asSafeString(item?.content, 2000),
    }))
    .filter((item) => item.role && item.content)
    .slice(-12);
}

async function buildAssistantContext(body) {
  const now = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const latitude = asSafeNumber(body.latitude ?? body.lat);
  const longitude = asSafeNumber(body.longitude ?? body.lng);
  const rawCity = asSafeString(body.city || body.locationCity || "", 120);
  const city = inferCity(latitude, longitude, rawCity);
  const weather = await fetchCurrentWeather(latitude, longitude);

  const rows = await prisma.eventFinderItem.findMany({
    where: {
      OR: [
        { startAt: null },
        { startAt: { gte: now } },
      ],
    },
    orderBy: [
      { startAt: "asc" },
      { createdAt: "desc" },
    ],
    take: 80,
    select: {
      id: true,
      title: true,
      description: true,
      venueName: true,
      address: true,
      city: true,
      region: true,
      country: true,
      category: true,
      startAt: true,
      endAt: true,
      latitude: true,
      longitude: true,
      priceText: true,
      eventUrl: true,
      ticketUrl: true,
      attendingBy: {
        where: { status: "going" },
        take: 8,
        select: {
          profile: {
            select: {
              username: true,
              name: true,
              photo: true,
            },
          },
        },
      },
    },
  });

  const web = await fetchAssistantWebSearch(body.message || "", { latitude, longitude, city }, weather);

  const events = rows.map((event) => {
    const distanceKm = getDistanceKm(latitude, longitude, event.latitude, event.longitude);
    return {
      ...event,
      distanceKm,
      attendingCount: event.attendingBy.length,
      attendees: event.attendingBy.map((row) => row.profile).filter(Boolean),
      attendingBy: undefined,
    };
  }).sort((a, b) => {
    if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
    if (a.distanceKm !== null) return -1;
    if (b.distanceKm !== null) return 1;
    const aTime = a.startAt ? new Date(a.startAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.startAt ? new Date(b.startAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  return {
    location: {
      latitude,
      longitude,
      city,
    },
    weather,
    web,
    events,
  };
}


function compactAssistantContext(context) {
  const parts = [];
  const location = context?.location || {};
  if (location.city || Number.isFinite(location.latitude)) {
    parts.push("Location: " + [location.city, Number.isFinite(location.latitude) && Number.isFinite(location.longitude) ? location.latitude + "," + location.longitude : ""].filter(Boolean).join(" "));
  }
  const weather = context?.weather;
  if (weather) {
    parts.push("Weather: " + [weather.temperatureC !== null && weather.temperatureC !== undefined ? weather.temperatureC + " C" : "", weather.condition, weather.windKph !== null && weather.windKph !== undefined ? "wind " + weather.windKph + " km/h" : ""].filter(Boolean).join(", "));
  }
  const events = Array.isArray(context?.events) ? context.events.slice(0, 6) : [];
  if (events.length) {
    parts.push("Tapzy events: " + events.map((event, index) => {
      const place = [event.venueName, event.city].filter(Boolean).join(" / ");
      const time = event.startAt ? new Date(event.startAt).toISOString() : "time unknown";
      const attending = event.attendingCount ? event.attendingCount + " going" : "";
      return (index + 1) + ". " + [event.title, place, time, event.priceText, attending, event.id ? "/events/" + event.id : ""].filter(Boolean).join(" | ");
    }).join(" || "));
  }
  const web = context?.web;
  if (web) {
    if (web.answer) parts.push("Web answer: " + web.answer);
    if (Array.isArray(web.results) && web.results.length) {
      parts.push("Web results: " + web.results.slice(0, 5).map((item, index) => (index + 1) + ". " + [item.title, item.snippet, item.rating ? "rating " + item.rating : "", item.link].filter(Boolean).join(" | ")).join(" || "));
    }
  }
  return parts.join("\n\n").slice(0, 7000);
}

function asOpenAIMemory(memory, message) {
  const safe = asSafeMemory(memory).filter((item) => item.content !== message).slice(-10);
  return safe.map((item) => ({
    role: item.role === "assistant" ? "assistant" : "user",
    content: item.content,
  }));
}

function extractResponseText(data) {
  if (!data) return "";
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  if (Array.isArray(data.output)) {
    const pieces = [];
    for (const item of data.output) {
      const content = Array.isArray(item?.content) ? item.content : [];
      for (const part of content) {
        if (typeof part?.text === "string") pieces.push(part.text);
        else if (typeof part?.output_text === "string") pieces.push(part.output_text);
      }
    }
    return pieces.join(" ").trim();
  }
  return "";
}

async function fetchOpenAIConversation({ message, pageType, username, currentPath, memory, context }) {
  if (!OPENAI_API_KEY || typeof fetch !== "function") return "";
  try {
    const contextText = compactAssistantContext(context);
    const input = [
      {
        role: "developer",
        content: [
          "You are Ask Tapzy, the built-in assistant inside Tapzy.",
          "Be natural, warm, concise, and conversational.",
          "You can answer normal questions, follow-ups, local planning questions, Tapzy questions, directions, food, weather, events, and community discovery.",
          "Use the provided Tapzy context and web results when relevant.",
          "If live data is missing, say so plainly and give the best next step.",
          "Do not pretend to know private user data that was not provided.",
          "Keep answers mobile-friendly, usually 1-4 short paragraphs.",
          "When giving lists, put each numbered item on its own line with the name, time, and place. Keep directions on a separate line.",
          "When useful, suggest one clear action."
        ].join(" ")
      },
      {
        role: "user",
        content: [
          "Current Tapzy context:",
          contextText || "No live context available.",
          "Page: " + (pageType || "unknown"),
          "Path: " + (currentPath || "unknown"),
          "Username: " + (username || "guest")
        ].join("\n")
      },
      ...asOpenAIMemory(memory, message),
      { role: "user", content: message },
    ];
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input,
        max_output_tokens: 650,
      }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("OpenAI assistant failed:", data?.error?.message || response.status);
      return "";
    }
    return asSafeString(extractResponseText(data), 5000);
  } catch (error) {
    console.error("OpenAI assistant error:", error?.message || error);
    return "";
  }
}

async function handleAssistantRequest(req, res) {
  try {
    const body = req.body || {};

    const message = asSafeString(body.message, 4000);
    const pageType = asSafeString(body.pageType || "general", 80);
    const isAuthPage = asSafeBool(body.isAuthPage);
    const username = asSafeString(body.username || "User", 80);
    const currentPath = asSafeString(body.currentPath || "/", 300);
    const currentUrl = asSafeString(body.currentUrl || "", 500);
    const memory = asSafeMemory(body.memory);

    if (!message) {
      return res.status(400).json({
        ok: false,
        reply: "Please enter a message.",
      });
    }

    const context = await buildAssistantContext(body);

    const conversationalReply = await fetchOpenAIConversation({
      message,
      pageType,
      username,
      currentPath,
      memory,
      context,
    });

    if (conversationalReply) {
      return res.json({ ok: true, reply: conversationalReply });
    }

    const reply = await buildAssistantReply({
      message,
      pageType,
      isAuthPage,
      username,
      currentPath,
      currentUrl,
      memory,
      currentProfile: req.currentProfile || null,
      context,
    });

    return res.json({
      ok: true,
      reply:
        typeof reply === "string" && reply.trim()
          ? reply.trim()
          : "Tapzy Assistant is temporarily unavailable.",
    });
  } catch (error) {
    console.error("Assistant route error:", error);
    return res.status(500).json({
      ok: false,
      reply: "Tapzy Assistant is temporarily unavailable.",
    });
  }
}


function extractRealtimeClientSecret(data) {
  return String(
    data?.client_secret?.value ||
    data?.client_secret ||
    data?.value ||
    data?.secret ||
    ""
  ).trim();
}

async function requestRealtimeSessionFromOpenAI() {
  const instructions = [
    "You are Ask Tapzy, the built-in real-time voice assistant inside Tapzy.",
    "Be warm, quick, natural, and useful.",
    "Help with Tapzy, local events, places, plans, food, directions, weather, and normal questions.",
    "Keep spoken answers concise unless the user asks for detail."
  ].join(" ");

  const attempts = [
    {
      url: "https://api.openai.com/v1/realtime/client_secrets",
      body: {
        session: {
          type: "realtime",
          model: OPENAI_REALTIME_MODEL,
          instructions,
          audio: {
            output: { voice: OPENAI_REALTIME_VOICE }
          }
        }
      }
    },
    {
      url: "https://api.openai.com/v1/realtime/sessions",
      body: {
        model: OPENAI_REALTIME_MODEL,
        voice: OPENAI_REALTIME_VOICE,
        instructions,
        modalities: ["text", "audio"]
      }
    }
  ];

  let lastError = "Realtime session unavailable.";
  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + OPENAI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(attempt.body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        lastError = data?.error?.message || ("Realtime session failed with status " + response.status);
        continue;
      }
      const clientSecret = extractRealtimeClientSecret(data);
      if (clientSecret) {
        return {
          clientSecret,
          model: data?.model || attempt.body.model || attempt.body.session?.model || OPENAI_REALTIME_MODEL,
          voice: OPENAI_REALTIME_VOICE,
        };
      }
      lastError = "Realtime session did not return a client secret.";
    } catch (error) {
      lastError = error?.message || lastError;
    }
  }

  const error = new Error(lastError);
  error.status = 502;
  throw error;
}

async function handleRealtimeSessionRequest(req, res) {
  try {
    if (!OPENAI_API_KEY || typeof fetch !== "function") {
      return res.status(503).json({ ok: false, error: "Realtime voice needs OPENAI_API_KEY on the server." });
    }
    const session = await requestRealtimeSessionFromOpenAI();
    return res.json({ ok: true, ...session });
  } catch (error) {
    console.error("OpenAI realtime session error:", error?.message || error);
    return res.status(error.status || 500).json({
      ok: false,
      error: error?.message || "Realtime voice is temporarily unavailable.",
    });
  }
}

router.post("/chat", handleAssistantRequest);
router.post("/reply", handleAssistantRequest);
router.post("/realtime-session", handleRealtimeSessionRequest);

module.exports = router;
