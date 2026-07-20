const { searchTapzyKnowledge } = require("./tapzyKnowledgeSearch");

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

function wantsLinks(message) {
  return /\b(website|web site|link|url|directions|direction|navigate|navigation|map|maps|ticket|tickets|open page|open it|address|phone number)\b/i.test(message);
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

function cleanVisibleReply(reply, allowLinks = false) {
  let text = cleanText(reply, 5000);
  if (allowLinks) return text.trim();

  text = text
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|\/)[^)]+\)/gi, "$1")
    .replace(/https?:\/\/[^\s)]+/gi, "")
    .replace(/\bwww\.[^\s)]+/gi, "")
    .replace(/\/events\/view\/[a-z0-9_-]+/gi, "")
    .replace(/\/events\/[a-z0-9_/?=&.-]+/gi, "")
    .replace(/\/search[^\s)]*/gi, "")
    .replace(/\/u\/[a-z0-9_.-]+/gi, "")
    .replace(/\b(?:url|link|href|slug|id)\s*:\s*[^\n]+/gi, "");

  text = text
    .split("\n")
    .map((line) => line.replace(/\s+\|\s*$/g, "").replace(/\s{2,}/g, " ").trim())
    .filter((line) => line && !/^[/?=&._a-z0-9-]{8,}$/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text || "I found some options. I can show the website or directions if you want.";
}

function buildIndependentReply(message, context = {}, knowledge = {}) {
  const text = cleanText(message, 1000);
  const tone = inferTone(text);
  const events = Array.isArray(knowledge.events) ? knowledge.events : [];
  const profiles = Array.isArray(knowledge.profiles) ? knowledge.profiles : [];
  const stories = Array.isArray(knowledge.stories) ? knowledge.stories : [];
  const posts = Array.isArray(knowledge.posts) ? knowledge.posts : [];
  const mathAnswer = safeArithmetic(text);
  if (mathAnswer) return mathAnswer;

  if (/^(hi|hey|hello|yo|sup)$/i.test(text)) {
    return "Hey, I am here. Ask me anything: a plan for tonight, food nearby, a quick answer, a joke, a Bible question, math help, or what to do next on Tapzy.";
  }

  if (events.length && /\b(what|where|go|do|tonight|today|near|nearby|around|area|event|events|happening|place|places|concert|food|date|quiet|busy)\b/i.test(text)) {
    const city = cleanText(context.city || context.locationLabel || "", 80);
    const top = events.slice(0, 4).map((event, index) => {
      const detail = [event.when, event.where, event.category].filter(Boolean).join(" - ");
      return `${index + 1}. ${event.title}${detail ? ": " + detail : ""}`;
    }).join("\n");
    const opener = city ? `Here is what Tapzy found around ${city}:` : "Here is what Tapzy found near you:";
    const nextStep = context.allowLinks
      ? "\n\nTell me which one and I can help with directions, tickets, or the event page."
      : "\n\nPick one and I can help with food nearby, directions, or who to invite.";
    return opener + "\n" + top + nextStep;
  }

  if (tone === "playful") {
    return "Why did the coffee file a police report? Because it got mugged. Want a cute joke, a clean roast, or a Tapzy-style one?";
  }

  if (tone === "cute") {
    return "Cute answer: say it simple and warm. Try: 'I was thinking about you, so I had to check in. What are you doing later?'";
  }

  if (tone === "faith") {
    return "A helpful Bible angle: start with wisdom, peace, and action. Proverbs 3:5-6 is a strong one for direction: trust God, do not lean only on your own understanding, and let Him guide your path.";
  }

  if (tone === "local") {
    const city = cleanText(context.city || context.locationLabel || "", 80);
    if (!city && !context.latitude) {
      return "I can help with that. Tell me your city or allow location, then I can suggest food, events, quiet spots, busy places, hours to check, and the best next move.";
    }
    if (events.length) {
      const top = events.slice(0, 3).map((event, index) => {
        const detail = [event.when, event.where, event.category].filter(Boolean).join(" - ");
        return `${index + 1}. ${event.title}${detail ? ": " + detail : ""}`;
      }).join("\n");
      const ending = context.allowLinks ? "\n\nI can open directions or the event page when you pick one." : "\n\nPick one and I can help with food nearby, directions, or who to invite.";
      return "Here are the strongest Tapzy matches around " + (city || "your area") + ":\n" + top + ending;
    }
    return "For " + (city || "your area") + ", I would build the plan like this: pick one main activity, choose food within 10-15 minutes of it, check if the place is open now, then use Tapzy for directions and messaging anyone you want to invite.";
  }

  if (tone === "math") {
    return "Send me the exact math problem and I will solve it step by step.";
  }

  if (/\b(tapzy|profile|story|stories|message|messages|event|events|discover|discovery|qr|nfc)\b/i.test(text)) {
    const liveBits = [];
    if (events[0]) liveBits.push("events like " + events[0].title);
    if (stories[0]) liveBits.push("recent stories");
    if (posts[0]) liveBits.push("new posts");
    if (profiles[0]) liveBits.push("active profiles");
    return "Tapzy AI is learning from Tapzy itself: " + (liveBits.length ? liveBits.join(", ") : "profiles, stories, posts, events, messages, discovery, QR/NFC sharing, and search") + ". The goal is to help people find what is happening, decide where to go, connect, message, navigate, and post the moment.";
  }

  if (stories.length || posts.length) {
    return "I am seeing fresh Tapzy activity. " + [stories[0]?.title, posts[0]?.title].filter(Boolean).slice(0, 2).join(" Also: ") + ". Ask me for events, people, food, quiet spots, or a plan and I will narrow it down.";
  }

  return "I can help with that. Give me one more detail and I will use Tapzy's own data to make it useful: are you asking for a quick answer, a plan, something local, something funny, or help with Tapzy?";
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
    allowLinks: wantsLinks(message),
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
  const knowledge = await searchTapzyKnowledge({ ...context, message });
  const reply = cleanVisibleReply(buildIndependentReply(message, context, knowledge), context.allowLinks);
  remember(sessionId, "assistant", reply);

  return {
    ok: true,
    reply,
    source: "tapzy-independent",
    brainScore: getBrainScore(sessionId),
    learned: true,
    eventsUsed: Array.isArray(knowledge.events) ? knowledge.events.length : 0,
    results: {
      events: Array.isArray(knowledge.events) ? knowledge.events.length : 0,
      profiles: Array.isArray(knowledge.profiles) ? knowledge.profiles.length : 0,
      stories: Array.isArray(knowledge.stories) ? knowledge.stories.length : 0,
      posts: Array.isArray(knowledge.posts) ? knowledge.posts.length : 0,
      hasLocation: Boolean(knowledge.hasLocation),
    },
  };
}

module.exports = {
  buildTapzyAiReply,
  getBrainScore,
};
