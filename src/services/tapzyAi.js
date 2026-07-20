const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

const brainMemory = new Map();

function cleanText(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getSessionId(input = {}) {
  return cleanText(input.sessionId || input.userId || input.username || "guest", 120) || "guest";
}

function remember(sessionId, role, content) {
  const key = getSessionId({ sessionId });
  const list = brainMemory.get(key) || [];
  list.push({ role, content: cleanText(content, 1600), at: Date.now() });
  brainMemory.set(key, list.slice(-30));
}

function getMemory(sessionId) {
  return (brainMemory.get(getSessionId({ sessionId })) || []).slice(-12);
}

function getBrainScore(sessionId) {
  const learned = getMemory(sessionId).filter((item) => item.role === "assistant").length;
  return Math.max(8, Math.min(100, 8 + learned * 3));
}

function wantsLocalHelp(message) {
  return /\b(near me|nearby|around me|around here|tonight|today|tomorrow|weekend|food|restaurant|dessert|coffee|date|event|concert|festival|club|bar|quiet|busy|open|close|closing|hours|directions|navigate|weather|rain|raining)\b/i.test(message);
}

function wantsMath(message) {
  return /\b(math|calculate|solve|plus|minus|times|divided|percent|percentage|equation|what is \d)/i.test(message) || /^[\d\s+*/().%-]+$/.test(message);
}

function safeArithmetic(message) {
  const text = cleanText(message, 160)
    .replace(/\bplus\b/gi, "+")
    .replace(/\bminus\b/gi, "-")
    .replace(/\btimes\b/gi, "*")
    .replace(/\bmultiplied by\b/gi, "*")
    .replace(/\bdivided by\b/gi, "/")
    .replace(/\bpercent of\b/gi, "% of");
  if (!/^[\d\s+*/().%-]+$/.test(text)) return "";
  try {
    const expression = text.replace(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/gi, "($1/100*$2)");
    if (!/^[\d\s+*/().-]+$/.test(expression)) return "";
    const result = Function('"use strict"; return (' + expression + ')')();
    return Number.isFinite(result) ? "That comes out to " + Number(result.toFixed(8)).toString() + "." : "";
  } catch (_) {
    return "";
  }
}

function inferTone(message) {
  if (/\b(joke|funny|make me laugh)\b/i.test(message)) return "playful";
  if (/\b(cute|sweet|flirty|crush|girlfriend|boyfriend)\b/i.test(message)) return "cute";
  if (/\b(bible|verse|god|pray|prayer|faith)\b/i.test(message)) return "faith";
  if (wantsLocalHelp(message)) return "local";
  if (wantsMath(message)) return "math";
  return "general";
}

async function getTapzyEvents({ latitude, longitude } = {}) {
  try {
    const prisma = require("../prisma");
    if (!prisma?.eventFinderItem) return [];
    const now = new Date();
    const events = await prisma.eventFinderItem.findMany({
      where: {
        OR: [{ startAt: { gte: now } }, { startAt: null }],
      },
      orderBy: [{ startAt: "asc" }],
      take: 8,
    }).catch(() => []);
    return events.map((event) => ({
      title: cleanText(event.title || event.name, 120),
      venue: cleanText(event.venueName || event.location || event.address, 120),
      city: cleanText(event.city, 80),
      startsAt: event.startAt || null,
      category: cleanText(event.category || event.type, 80),
      url: event.id ? "/events/view/" + event.id : "",
      latitude: asNumber(event.latitude),
      longitude: asNumber(event.longitude),
    })).filter((event) => event.title);
  } catch (_) {
    return [];
  }
}

function buildSystemPrompt(context = {}) {
  const locationText = context.city || context.locationLabel || (context.latitude && context.longitude ? "the user's current area" : "unknown");
  return [
    "You are Tapzy AI, the new clean brain for Tapzy.",
    "OpenAI is the strongest live model right now, but Tapzy AI is learning to become the main brain over time.",
    "Speak naturally, warmly, and clearly. Be useful first. Keep answers mobile-friendly.",
    "You can handle normal conversation, practical questions, math, science, Bible questions, jokes, cute replies, writing help, date ideas, food plans, directions, events, quiet spots, busy spots, opening hours, and Tapzy product help.",
    "For local recommendations, ask for location only if you do not have enough location context. If location exists, give a concrete plan.",
    "Use Tapzy context when relevant: Tapzy has profiles, stories, messages, events, discovery, QR/NFC identity sharing, search, and the Hey Tapzy AI room.",
    "Do not pretend to have live business hours or live crowd levels unless live data was provided. Say what to check next and give a smart plan.",
    "Current location context: " + locationText + ".",
  ].join("\n");
}

function formatEvents(events = []) {
  if (!events.length) return "No live Tapzy event rows were provided.";
  return events.map((event, index) => {
    const when = event.startsAt ? new Date(event.startsAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "time TBA";
    return `${index + 1}. ${event.title} | ${when} | ${event.venue || event.city || "location TBA"} | ${event.url || "no link"}`;
  }).join("\n");
}

function buildFallbackReply(message, context = {}, events = []) {
  const text = cleanText(message, 1000);
  const tone = inferTone(text);
  const mathAnswer = safeArithmetic(text);
  if (mathAnswer) return mathAnswer;

  if (/^(hi|hey|hello|yo|sup)$/i.test(text)) {
    return "Hey, I am here. Ask me anything: a plan for tonight, food nearby, a quick answer, a joke, a Bible question, math help, or what to do next on Tapzy.";
  }

  if (tone === "playful") {
    return "Here is one: I told my calendar I needed space, and it booked me a night out. Want a clean joke, a cute one, or a Tapzy-style roast?";
  }

  if (tone === "cute") {
    return "Cute answer: say it simple and warm. Try: 'I was thinking about you, so I had to check in. What are you doing later?'";
  }

  if (tone === "faith") {
    return "A helpful Bible angle: start with wisdom, peace, and action. Proverbs 3:5-6 is a strong one for direction: trust God, do not lean only on your own understanding, and let Him guide your path.";
  }

  if (tone === "local") {
    const city = cleanText(context.city || context.locationLabel || "", 80);
    const eventLine = events[0] ? `Tapzy has ${events[0].title}${events[0].venue ? " at " + events[0].venue : ""} as a good first option. ` : "";
    if (!city && !context.latitude) {
      return "I can help with that. Tell me your city or allow location, then I can suggest food, events, quiet spots, busy places, hours to check, and the best next move.";
    }
    return eventLine + "For " + (city || "your area") + ", I would build the plan like this: pick one main activity, choose food within 10-15 minutes of it, check if the place is open now, then use Tapzy for the event page, directions, and messaging anyone you want to invite.";
  }

  if (tone === "math") {
    return "Send me the exact math problem and I will solve it step by step.";
  }

  if (/\b(tapzy|profile|story|stories|message|messages|event|events|discover|discovery|qr|nfc)\b/i.test(text)) {
    return "Tapzy should help people turn interest into action: find what is happening, decide where to go, connect with people, share a profile, message, navigate, and post the moment. Tell me which part you want to improve and I will give you the clean next steps.";
  }

  return "I can help with that. Give me one more detail and I will make it useful: are you asking for a quick answer, a plan, something local, something funny, or help with Tapzy?";
}

function extractOpenAIText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const output = Array.isArray(data?.output) ? data.output : [];
  const parts = [];
  for (const item of output) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

async function askOpenAI(message, context, events, memory) {
  if (!OPENAI_API_KEY || typeof fetch !== "function") return "";
  const payload = {
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: buildSystemPrompt(context) },
      { role: "system", content: "Recent Tapzy events:\n" + formatEvents(events) },
      { role: "system", content: "Recent Tapzy AI memory:\n" + memory.map((item) => `${item.role}: ${item.content}`).join("\n") },
      { role: "user", content: message },
    ],
  };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout ? AbortSignal.timeout(14000) : undefined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) return "";
    return extractOpenAIText(data);
  } catch (_) {
    return "";
  }
}

async function buildTapzyAiReply(input = {}) {
  const message = cleanText(input.message, 3000);
  const sessionId = getSessionId(input);
  const context = {
    username: cleanText(input.username || "there", 80),
    city: cleanText(input.city, 80),
    locationLabel: cleanText(input.locationLabel, 120),
    latitude: asNumber(input.latitude),
    longitude: asNumber(input.longitude),
    currentPath: cleanText(input.currentPath, 300),
    currentUrl: cleanText(input.currentUrl, 600),
    timeZone: cleanText(input.timeZone, 80),
  };

  if (!message) {
    return {
      ok: true,
      reply: "Ask me anything and I will answer here.",
      source: "tapzy-ai",
      brainScore: getBrainScore(sessionId),
    };
  }

  remember(sessionId, "user", message);
  const events = await getTapzyEvents(context);
  const memory = getMemory(sessionId);
  const openAiReply = await askOpenAI(message, context, events, memory);
  const reply = openAiReply || buildFallbackReply(message, context, events);
  remember(sessionId, "assistant", reply);

  return {
    ok: true,
    reply,
    source: openAiReply ? "openai-attached" : "tapzy-brain",
    brainScore: getBrainScore(sessionId),
    learned: Boolean(openAiReply),
    eventsUsed: events.length,
  };
}

module.exports = {
  buildTapzyAiReply,
  getBrainScore,
};
