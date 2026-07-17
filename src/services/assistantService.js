function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function tokenize(text) {
  return normalize(text).split(" ").map((x) => x.trim()).filter(Boolean);
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function isGreeting(text) {
  return text === "hi" || text === "hey" || text === "hello" || text === "yo" || text === "sup" || text.startsWith("hi ") || text.startsWith("hey ") || text.startsWith("hello ");
}

function getLastUserIntent(memory) {
  const items = Array.isArray(memory) ? memory : [];
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item && item.role === "user" && item.content) return normalize(item.content);
  }
  return "";
}

function cleanText(value, fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

function titleCase(value) {
  return cleanText(value).split(" ").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(" ");
}

function compactDate(value) {
  if (!value) return "time coming soon";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "time coming soon";
  return date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function mapsSearchUrl(query) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
}

function mapsDirectionUrl(destination) {
  return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(destination);
}

const TAPZY_OFFLINE_KNOWLEDGE = {
  identity: "Tapzy is a premium digital identity, local discovery, and real-world action platform. It combines profiles, stories, events, discovery, messages, QR/NFC sharing, search, and Ask Tapzy into one social layer.",
  mission: "Tapzy helps people move from interest to action: ask a question, find what is happening, choose where to go, connect with people, share identity, message, navigate, and post the moment after.",
  product: [
    "Profiles: a premium identity page with name, title, bio, photo, links, QR, contact actions, and social proof.",
    "Stories: 24-hour moments, creator updates, event recaps, current story previews, and social discovery.",
    "Events: event feed, detail pages, Going, tickets, maps, categories, attendance, and planning.",
    "Discover: a place to find people, stories, events, places, and local intent.",
    "Messages: direct conversations that should move people from chat to plans.",
    "QR/NFC: fast profile and contact exchange, designed to feel premium in person.",
    "Search: one surface for users, events, places, stories, and eventually local questions.",
    "Ask Tapzy: an AI room and concierge that answers normal questions first, then opens Tapzy actions when the user shows interest in a place, event, ticket, food spot, or directions."
  ],
  assistant: [
    "Default to normal AI Q&A: answer the typed question directly and clearly.",
    "Only switch into Tapzy action mode when the user shows interest in a place, event, food spot, tickets, website, directions, or local plan.",
    "For local questions, use Tapzy events, browser location, weather, current page, attendance, and practical reasoning before generic advice.",
    "For events, show clean numbered picks with title, time, place, and one short reason. Avoid raw URLs unless the user explicitly asks for a link.",
    "For general knowledge, answer simply first, then add a Tapzy angle only when useful.",
    "For business/product questions, think like a senior product strategist building a premium local social app.",
    "For writing requests, give paste-ready copy.",
    "For voice fallback, be concise, useful, and natural. Do not say you are unavailable just because paid OpenAI voice is down."
  ],
  localPlaybooks: [
    "Tonight plan: choose one anchor, one food or coffee backup, and one low-pressure second stop.",
    "Date plan: easy opener, memorable activity, low-pressure second stop, short travel, clear budget.",
    "Food plan: rank by vibe, distance, price, hours, photos, and whether it pairs with a nearby event.",
    "Event plan: rank by intent match, start time, distance, vibe, price, attendance, and effort.",
    "Networking plan: profile, QR/NFC exchange, message follow-up, and a clear next step."
  ],
  productVision: [
    "Tapzy should feel like ChatGPT plus a local Tapzy concierge, not a narrow support bot.",
    "Ask Tapzy should be available across the app, but the full AI room should feel premium and recognizable.",
    "The AI face/room is Tapzy identity: futuristic, glassy, alive, and useful, without distracting from answers.",
    "Tapzy should not dump huge links. It should summarize, then offer small actions like Open on Tapzy, Tickets, Directions, or Website.",
    "The strongest Tapzy experience is local action: ask, choose, go, connect, post."
  ],
  voice: "Warm, sharp, natural, decisive, premium, concise, and useful. It should feel close to ChatGPT plus a local Tapzy concierge.",
  ranking: "Rank plans by intent match, distance, time, weather fit, price, vibe, effort, social proof, and whether it creates a real-world connection.",
};

function cityLabel(context = {}) {
  return context.location && context.location.city ? context.location.city : "near you";
}

function hasEventData(context = {}) {
  return Array.isArray(context.events) && context.events.length > 0;
}

function eventHaystack(event) {
  return normalize([event && event.title, event && event.description, event && event.category, event && event.venueName, event && event.address, event && event.city].filter(Boolean).join(" "));
}


function filterEvents(events, message) {
  const list = Array.isArray(events) ? events.filter(Boolean) : [];
  const terms = tokenize(message).filter((term) => term.length > 2 && !["the", "and", "for", "with", "near", "tonight", "today", "event", "events", "what", "going", "happening"].includes(term));
  if (!terms.length) return list;
  const matched = list.filter((event) => {
    const haystack = eventHaystack(event);
    return terms.some((term) => haystack.includes(term));
  });
  return matched.length ? matched : list;
}

function eventScore(event, message) {
  const haystack = eventHaystack(event);
  const terms = tokenize(message).filter((term) => term.length > 2);
  let score = 0;
  terms.forEach((term) => {
    if (haystack.includes(term)) score += 4;
  });
  const attending = Number(event && (event.attendingCount || event.goingCount || event._count?.attendees || 0));
  if (Number.isFinite(attending)) score += Math.min(attending, 25) / 5;
  const start = event && event.startAt ? new Date(event.startAt).getTime() : 0;
  if (start && !Number.isNaN(start)) {
    const deltaHours = Math.abs(start - Date.now()) / 36e5;
    score += Math.max(0, 8 - Math.min(deltaHours, 8));
  }
  return score;
}

function pickEvents(events, message, limit = 3) {
  return filterEvents(events, message)
    .slice()
    .sort((a, b) => eventScore(b, message) - eventScore(a, message))
    .slice(0, Math.max(1, limit));
}

function formatTapzyKnowledge() {
  return [
    TAPZY_OFFLINE_KNOWLEDGE.identity,
    "Mission: " + TAPZY_OFFLINE_KNOWLEDGE.mission,
    "Product surfaces: " + TAPZY_OFFLINE_KNOWLEDGE.product.join(" "),
    "Assistant behavior: " + TAPZY_OFFLINE_KNOWLEDGE.assistant.join(" "),
    "Local playbooks: " + TAPZY_OFFLINE_KNOWLEDGE.localPlaybooks.join(" "),
    "Product vision: " + TAPZY_OFFLINE_KNOWLEDGE.productVision.join(" "),
    "Voice: " + TAPZY_OFFLINE_KNOWLEDGE.voice,
    "Planning rule: " + TAPZY_OFFLINE_KNOWLEDGE.ranking
  ].join(" ");
}

function buildSmartUnknownAnswer(message, pageType, context = {}) {
  const events = hasEventData(context) ? pickEvents(context.events, message, 3) : [];
  const actionMode = wantsTapzyAction(message);
  if (actionMode && events.length) {
    return [
      "Best Tapzy starting point: " + cleanText(events[0].title, "the closest matching event") + " at " + cleanText(events[0].venueName || events[0].address || events[0].city, "the listed venue") + ".",
      "Ask me to narrow it by vibe, price, distance, or directions."
    ].join(" ");
  }
  if (actionMode) {
    return "I can help with that as a Tapzy plan. Tell me the vibe, budget, and how far you want to travel, and I will narrow it into a place, event, link, or direction next.";
  }
  if (pageType && pageType !== "general") {
    return "I can reason through that from this " + pageType + " page. Give me one more detail and I will make the answer more specific.";
  }
  return "I can help reason through that. Give me the topic or decision in one sentence, and I will answer directly first. If it turns into a place, event, website, ticket, or direction, I can switch into Tapzy mode after.";
}

function eventDestination(event) {
  return [event && event.venueName, event && event.address, event && event.city, event && event.region].map((x) => cleanText(x)).filter(Boolean).join(", ");
}

function eventLink(event) {
  return event && event.id ? "/events/view/" + encodeURIComponent(event.id) : "/events";
}

function eventMapsLink(event) {
  const destination = eventDestination(event);
  return destination ? mapsDirectionUrl(destination) : "";
}

function formatEventLine(event, index) {
  const title = cleanText(event && event.title, "Untitled event");
  const where = cleanText((event && (event.venueName || event.city || event.address)), "location coming soon");
  const when = compactDate(event && event.startAt);
  return [String(index + 1) + ". " + title, when, where].filter(Boolean).join(" - ");
}

function webSearchNote(web) {
  if (!web) return "";
  if (web.available && web.answer) {
    const results = formatWebResults(web, 2);
    return web.answer + (results ? " I also found: " + results : "");
  }
  if (web.available && web.results && web.results.length) return "Here is what I found: " + formatWebResults(web, 3);
  return "I checked, but I could not find a strong live result for that yet.";
}

function wantsTapzyAction(message) {
  const text = normalize(message);
  return includesAny(text, [
    "near me", "nearby", "around me", "around here", "tonight", "today", "tomorrow", "this weekend",
    "where should", "what should we do", "what is going on", "whats going on", "things to do",
    "event", "events", "concert", "festival", "bar", "club", "nightlife", "restaurant", "food", "coffee", "snack",
    "date night", "date idea", "directions", "navigate", "tickets", "ticket", "open", "check out", "go to", "place", "places"
  ]);
}

function buildGeneralWebAnswer(message, context = {}) {
  const web = context.web;
  if (!web || !(web.answer || (web.results && web.results.length))) return "";
  const text = normalize(message);
  const intro = includesAny(text, ["how", "why", "what", "who", "when", "where", "can", "should"])
    ? "Yes. "
    : "Here is the answer I found. ";
  return intro + webSearchNote(web);
}

function buildGeneralKnowledgeAnswer(message, context = {}) {
  const text = normalize(message);
  const city = cityLabel(context);
  if (!text) return "";
  if (includesAny(text, ["what is ai", "what is artificial intelligence", "explain ai"])) {
    return "AI is software that can understand patterns, language, images, and data well enough to help people think, create, decide, and automate work. For Tapzy, the useful version is not just answering questions. It should help users pick plans, write messages, find events, improve profiles, and move from idea to action.";
  }
  if (includesAny(text, ["what is quantum computing", "explain quantum computing", "quantum computer"])) {
    return "Quantum computing is a way of computing that uses quantum bits, or qubits, instead of normal bits. A normal bit is 0 or 1. A qubit can behave like a mix of states until measured, which lets certain algorithms explore possibilities differently. It will not replace normal computers for everyday apps soon, but it could become powerful for chemistry, optimization, security research, and some advanced simulations.";
  }
  if (includesAny(text, ["what can you do", "what do you know", "how smart", "like chatgpt", "chat gpt", "chatgpt", "offline", "fallback"])) {
    return "I can answer normal questions, explain ideas, write copy, brainstorm, help with Tapzy, and reason through decisions even when paid AI is unavailable. If you show interest in a place, event, food spot, tickets, website, or directions, I switch into Tapzy mode and give you an event to check out, a link, or navigation.";
  }
  if (includesAny(text, ["tapzy vision", "vision for tapzy", "what should tapzy be", "what is tapzy", "explain tapzy", "tapzy app"])) {
    return "Tapzy should feel like a premium identity and local action app. The simple idea is: ask what to do, find what is happening, choose a plan, connect with people, share your profile, message, navigate, and post the moment. Ask Tapzy should answer normal questions first, then become a concierge when the user is interested in a place, event, ticket, or direction.";
  }
  if (includesAny(text, ["ai room", "ask tapzy room", "robot", "ai face", "assistant room", "voice room"])) {
    return "The Ask Tapzy room should feel like entering Tapzy's AI space, not opening a plain chat. The face gives Tapzy identity, the glass UI keeps it premium, and the assistant should stay useful: listen, answer, think, speak, then offer actions only when the user wants places, events, tickets, links, or navigation.";
  }
  if (includesAny(text, ["profile", "profiles", "identity card", "edit profile", "bio", "title"])) {
    return "Tapzy profiles should work like premium digital identity: clean name, clear title, short bio, strong photo, social/contact links, QR, and proof of activity. The AI can help write a sharper bio, pick a title, and make the profile feel credible in seconds.";
  }
  if (includesAny(text, ["story", "stories", "post story", "current story", "creator post"])) {
    return "Tapzy Stories should feel like premium 24-hour social proof: quick moments, creator updates, event recaps, current story previews, and a clean path into events or profiles when someone wants more.";
  }
  if (includesAny(text, ["message", "messages", "dm", "text them", "opener", "reply"])) {
    return "Tapzy messages should help people move from chat to a plan. A good opener is short, specific, and easy to answer. Example: 'This looks fun. Want to check it out for a bit and grab something after?'";
  }
  if (includesAny(text, ["qr", "nfc", "tap card", "share contact", "networking"])) {
    return "QR, and NFC are Tapzy's real-world exchange layer. The best flow is simple: meet someone, tap or scan, preview the profile, save/contact/follow, then send a quick message. It should feel fast, premium, and intentional.";
  }
  if (includesAny(text, ["business", "startup", "make money", "revenue", "monetize", "growth", "marketing"])) {
    return "For Tapzy, the strongest business direction is premium local utility: identity, events, messaging, and AI planning in one app. Monetization can come from promoted events, venue tools, creator tools, premium profiles, Tapzy Pro, business cards/NFC, ticket or booking affiliate links, and local discovery placements. The key is making Tapzy useful before asking users or venues to pay.";
  }
  if (includesAny(text, ["date idea", "date ideas", "with my girl", "girlfriend", "boyfriend", "romantic"])) {
    return "A strong date plan has three parts: an easy opener, one memorable activity, and a low-pressure second stop. Near " + city + ", I would choose a good food spot or cafe first, then an event, walk, view, dessert, or lounge if the vibe is good. If you want, say the vibe or budget and I can switch into Tapzy mode with places, events, links, or navigation.";
  }
  if (includesAny(text, ["restaurant", "food", "eat", "coffee", "snack", "lunch", "dinner"])) {
    return "I would decide by vibe first: quick and casual, date-night, late-night, healthy, cheap, or premium. If you say the vibe, budget, or area, I can switch into Tapzy mode and give you places, links, or directions.";
  }
  if (includesAny(text, ["explain", "what is", "how does", "why does", "should i", "can you", "help me understand"])) {
    return "Here is the simple version: I can reason through that and make it practical. Give me the exact topic or decision, and I will break it into what matters, what I would do first, and the Tapzy-style next step if it connects to people, places, events, or your profile.";
  }
  return "";
}

function isAskingForEventFeed(text) {
  return includesAny(text, ["what events", "which events", "show events", "list events", "events are", "event data", "tapzy events", "tapsi events", "what's happening", "whats happening", "happening tonight", "going on tonight"]);
}

function buildDirectEventFeedAnswer(message, context = {}) {
  const text = normalize(message);
  const events = pickEvents(context.events, message, isAskingForEventFeed(text) ? 3 : 3);
  if (!events.length) return "";
  const intro = isAskingForEventFeed(text)
    ? "Here are the best Tapzy picks tonight:"
    : "Best Tapzy matches:";
  return [
    intro,
    events.map((event, index) => {
      const line = formatEventLine(event, index);
      return line;
    }).join("\n"),
    "Ask me to narrow it by vibe, price, distance, or best first pick."
  ].join("\n");
}

function buildEventSuggestions(message, context = {}) {
  const events = pickEvents(context.events, message, 6);
  const city = cityLabel(context);
  if (!events.length) {
    const live = webSearchNote(context.web);
    if (live) return live + " I can still turn that into a Tapzy plan with maps, messages, and a fallback nearby search.";
    return [
      "I do not see matching Tapzy event cards for that exact request, but I can still help.",
      "I would search around " + city + " by vibe first: music, food, nightlife, sports, study, car meets, community, or date-night.",
      "Quick map handoff: " + mapsSearchUrl("events " + city) + ".",
      "Ask me for a vibe and budget and I will choose a plan instead of giving you a generic list."
    ].join(" ");
  }

  const best = events[0];
  const directions = eventMapsLink(best);
  const ticket = cleanText(best.ticketUrl || best.eventUrl);
  const reason = [
    best.category ? "matches " + cleanText(best.category) : "matches the request",
    Number.isFinite(best.distanceKm) ? "about " + (Math.round(best.distanceKm * 10) / 10) + " km away" : "listed in Tapzy",
    best.priceText ? cleanText(best.priceText) : "price not listed",
    Number(best.attendingCount || 0) ? best.attendingCount + " Tapzy going" : "no Tapzy attendance yet"
  ].filter(Boolean).join(", ");

  return [
    "Best Tapzy pick: " + cleanText(best.title, "this event") + ".",
    "Why: " + reason + ".",
    "Top options:\n" + events.slice(0, 4).map(formatEventLine).join("\n"),
    "Open: " + eventLink(best) + ".",
    
    
    Number(best.attendingCount || 0) ? "Social angle: check who is going, then message one person with: You going to " + cleanText(best.title, "this") + " tonight?" : "Social angle: tap Going or share the event in messages to pull people into the plan.",
    webSearchNote(context.web)
  ].filter(Boolean).join("\n");
}

function buildCommunityAnswer(message, context = {}) {
  const text = normalize(message);
  const events = pickEvents(context.events, message, 5);
  const askingWho = includesAny(text, ["who", "anyone", "friends", "people", "users"]);

  if (includesAny(text, ["soccer", "basketball", "study group", "study", "car meet", "cars"])) {
    const specific = filterEvents(Array.isArray(context.events) ? context.events : [], message).filter((event) => {
      const haystack = eventHaystack(event);
      if (includesAny(text, ["soccer"])) return includesAny(haystack, ["soccer", "football", "sports", "sport", "game"]);
      if (includesAny(text, ["basketball"])) return includesAny(haystack, ["basketball", "sports", "sport", "game"]);
      if (includesAny(text, ["study"])) return includesAny(haystack, ["study", "workshop", "community", "meetup"]);
      if (includesAny(text, ["car meet", "cars"])) return includesAny(haystack, ["car", "cars", "auto", "vehicle", "meet"]);
      return false;
    });
    if (!specific.length) {
      return "I do not see a matching Tapzy event or group loaded for that yet. The next version should let you post this as a nearby intent so people can join: soccer, study group, car meet, pickup basketball, or late-night plan.";
    }
  }

  if (askingWho && events.length) {
    const event = events.find((item) => Number(item.attendingCount || 0) > 0) || events[0];
    const names = Array.isArray(event.attendees) ? event.attendees.map((x) => cleanText((x && (x.name || x.username)))).filter(Boolean).slice(0, 5) : [];
    if (names.length) {
      return names.join(", ") + " " + (names.length === 1 ? "is" : "are") + " marked as going to " + cleanText(event.title, "that event") + ". Open " + eventLink(event) + " to see the event and message people from Tapzy.";
    }
    return cleanText(event.title, "That event") + " is the closest match, but I do not see Tapzy friends marked as going yet. Once users check in or tap Going, this answer can become live community discovery.";
  }

  return "Tapzy can connect this to your community by using Going, check-ins, public stories, and nearby profiles. That turns a normal search into who is actually around and ready to do something.";
}

function buildFoodAnswer(message, context = {}) {
  const text = normalize(message);
  const budgetMatch = text.match(/\$?\b(\d{2,4})\b/);
  const budget = budgetMatch ? "$" + budgetMatch[1] : "";
  const cuisine = ["italian", "sushi", "pizza", "burger", "tacos", "thai", "indian", "chinese", "vegan", "coffee", "dessert"].find((item) => text.includes(item)) || "food";
  const lateNight = includesAny(text, ["late", "night", "snack", "snacks", "after hours"]);
  const qualifier = [lateNight ? "late night" : "", budget ? "under " + budget : "", "near me"].filter(Boolean).join(" ");
  const query = (cuisine + " " + qualifier).trim();
  return [
    "I would search for " + titleCase(cuisine) + " " + (budget ? "under " + budget : "nearby") + " and rank by distance, rating, photos, and whether it fits the moment.",
    lateNight ? "For late-night snacks, I would prioritize places still open, quick pickup, and short travel time." : "",
    webSearchNote(context.web),
    "Next step: open a nearby map search and compare distance, photos, and hours.",
    context.location && context.location.city ? "I would bias the results around " + context.location.city + "." : "If location is enabled, Tapzy can make this precise instead of generic."
  ].filter(Boolean).join(" ");
}

function buildDatePlan(message, context = {}) {
  const budgetMatch = normalize(message).match(/\$?\b(\d{2,4})\b/);
  const budget = budgetMatch ? "$" + budgetMatch[1] : "your budget";
  const city = context.location && context.location.city ? " in " + context.location.city : " nearby";
  return [
    "Here is a Tapzy-style first date plan" + city + ":",
    "1. Start with a casual dinner that fits " + budget + ".",
    "2. Add dessert or coffee within a short walk.",
    "3. Finish with something low-pressure like a waterfront walk, live music, an arcade, bowling, or a night market.",
    "4. Keep travel tight so the night feels easy.",
    webSearchNote(context.web),
    "Next step: open a date-night dinner search nearby, then pick the place with the easiest second stop within walking distance.",
    "Tapzy should eventually turn this into cards with directions, photos, travel time, and one-tap sharing to the person you are going with."
  ].join(" ");
}


function weatherSummary(weather) {
  if (!weather) return "weather unavailable";
  const temp = weather.temperatureC !== null && weather.temperatureC !== undefined ? String(weather.temperatureC) + " C" : "temperature unavailable";
  const condition = cleanText(weather.condition, "mixed");
  const wind = weather.windKph !== null && weather.windKph !== undefined ? ", wind " + weather.windKph + " km/h" : "";
  return temp + " and " + condition + wind;
}

function buildWeatherAnswer(context = {}) {
  const weather = context.weather || null;
  if (!weather) {
    return "I can answer weather once location is enabled. Tapzy will use your phone location, then combine weather with nearby events, food, and places so the answer becomes useful instead of generic.";
  }
  const condition = normalize(weather.condition);
  const ideas = condition.includes("rain") || condition.includes("storm")
    ? "I would lean indoors: cafes, bowling, movies, museums, dessert spots, escape rooms, lounges, or indoor events."
    : condition.includes("snow")
      ? "I would keep travel short and suggest cozy indoor plans, warm food, cafes, movies, or nearby events with easy parking/transit."
      : "This is good for patios, walks, outdoor events, waterfront plans, food trucks, markets, and short event hopping.";
  return "Weather near you looks like " + weatherSummary(weather) + ". " + ideas + " " + webSearchNote(context.web) + " Ask me what should we do tonight and I can combine this with Tapzy events and directions.";
}

function buildRainAnswer(context = {}) {
  const liveWeather = context.weather ? "Current weather near you: " + weatherSummary(context.weather) + ". " : "";
  return [
    liveWeather + "For rain, Tapzy should switch the plan indoors:",
    "escape rooms, bowling, museums, cafes, movies, indoor markets, dessert spots, arcades, gyms, or cozy lounges.",
    webSearchNote(context.web),
    "Quick search: " + mapsSearchUrl("indoor activities " + ((context.location && context.location.city) || "near me")) + ".",
    "If events are loaded, I can also filter Tapzy Event Finder toward indoor plans."
  ].join(" ");
}

function buildRelaxAnswer(context = {}) {
  return [
    "For relaxing, I would suggest quiet cafes, waterfront spots, parks, bookstores, calm lounges, spas, scenic walks, or low-key dessert places.",
    webSearchNote(context.web),
    "Quick search: " + mapsSearchUrl("quiet relaxing places " + ((context.location && context.location.city) || "near me")) + ".",
    "The Tapzy version should show travel time, vibe, photos, and whether friends are nearby."
  ].join(" ");
}

function buildTimeFreeAnswer(message, context = {}) {
  const hoursMatch = normalize(message).match(/\b(\d+)\s*(hour|hours|hr|hrs)\b/);
  const hours = hoursMatch ? Number(hoursMatch[1]) : 3;
  return [
    "For " + hours + " free " + (hours === 1 ? "hour" : "hours") + ", I would build a tight nearby itinerary:",
    "1. Pick one anchor activity.",
    "2. Add food or coffee close by.",
    "3. Leave a short buffer so it does not feel rushed.",
    "4. Use one-tap navigation between stops.",
    buildEventSuggestions(message, context)
  ].join(" ");
}

function buildDirectionsAnswer(message, context = {}) {
  const text = cleanText(message).replace(/^(navigate me to|navigate to|directions to|get me to|take me to)\s+/i, "").trim();
  const wantsNearby = includesAny(normalize(message), ["best event", "nearby", "closest", "around me"]);
  const firstEvent = Array.isArray(context.events) && context.events.length ? context.events[0] : null;
  if (wantsNearby && firstEvent) {
    const destination = eventDestination(firstEvent) || cleanText(firstEvent.title);
    if (destination) return "Closest strong Tapzy pick: " + cleanText(firstEvent.title, "this event") + ". Directions: " + mapsDirectionUrl(destination) + ". Event page: " + eventLink(firstEvent) + ".";
  }
  const destination = text && text.length < 180 ? text : "nearby";
  if (destination === "nearby") return "Tell me the place or event name and I can give you a one-tap directions link. Example: navigate me to Ribfest.";
  return "Here is the fastest handoff to navigation: " + mapsDirectionUrl(destination) + ". In the full Tapzy flow, this should sit beside event cards, food spots, and date plans as a single tap.";
}

function buildProfileAdvice(username) {
  return [
    "Your Tapzy profile should feel premium, clean, and immediately trustworthy.",
    "Use a short strong title. Founder of Tapzy is a strong example.",
    "Keep your bio simple and clear.",
    "A strong founder bio example is: Building premium digital identity for real-world networking.",
    username ? "Make sure @" + username + " has a polished photo, clean title, and clear bio." : ""
  ].filter(Boolean).join(" ");
}

function buildNetworkingPitch() {
  return "Tapzy is premium networking made seamless. It helps people exchange contact details and socials quickly in the real world. The bigger direction is local identity plus local action: who is nearby, what is happening, and how do I connect fast.";
}

function buildLegacyPairNote() {
  return "Pair was an older Tapzy sharing idea. The current Tapzy sharing direction should focus on premium QR/NFC profile exchange, contact sharing, and clean in-person follow-up actions.";
}

function buildSearchPitch() {
  return "Tapzy search should feel like local discovery, not just a user lookup. People should be able to find profiles, events, places, friends, and nearby intent from one search surface.";
}

function buildMessagesPitch() {
  return "Tapzy messaging should feel smooth, minimal, and premium. The best experience is fast conversation loading, instant send, live updates, and clean mobile transitions.";
}

function buildTapzyStrategyAnswer(message, context = {}) {
  const text = normalize(message);
  const focus = includesAny(text, ["monetize", "money", "revenue"])
    ? "monetization"
    : includesAny(text, ["grow", "growth", "users", "viral"])
      ? "growth"
      : includesAny(text, ["design", "ui", "ux"])
        ? "product polish"
        : "product direction";
  const events = hasEventData(context) ? "You already have event data, so Ask Tapzy should turn that into plans, not just search results." : "Seed the product with a few strong local examples so the assistant always has something concrete to say.";
  return [
    "For Tapzy " + focus + ", I would make the AI action-first:",
    "1. Understand intent: meet someone, go somewhere, improve profile, message, share contact, or plan a night.",
    "2. Return one best action, two backups, and the exact tap path.",
    "3. Use Tapzy data first: events, Going, stories, profiles, messages, location, weather.",
    "4. Only use web as extra seasoning, not the whole brain.",
    events,
    "The product should feel like: ask once, Tapzy chooses, then opens the right card, map, message, or profile."
  ].join(" ");
}

function buildMessageCoachAnswer(message, context = {}) {
  const event = hasEventData(context) ? pickEvents(context.events, message, 1)[0] : null;
  const eventText = event ? " for " + cleanText(event.title, "that event") : "";
  return [
    "Use a short opener that creates an easy yes:",
    "1. You going" + eventText + "? I was thinking of checking it out.",
    "2. Want to meet there for 20 minutes and see the vibe?",
    "3. If it is dead, we can switch to food nearby.",
    "Keep it casual. Tapzy should help move from chat to a real plan without making it feel heavy."
  ].join("\n");
}

function buildProfileCopyAnswer(message, username) {
  const text = normalize(message);
  if (includesAny(text, ["bio", "about"])) {
    return [
      "Here are stronger Tapzy bio options:",
      "1. Building premium digital identity for real-world networking.",
      "2. Connecting people, places, and plans through Tapzy.",
      "3. Founder building the fastest way to turn a real-world moment into a connection.",
      username ? "For @" + username + ", I would keep it sharp and founder-led." : "Keep it short, specific, and confident."
    ].join("\n");
  }
  return "Best title: Founder of Tapzy. It is cleaner, more credible, and easier to understand than longer variations.";
}

function buildOfflineConciergeAnswer(message, context = {}) {
  const events = hasEventData(context) ? pickEvents(context.events, message, 3) : [];
  const city = cityLabel(context);
  const weather = context.weather ? "Weather: " + weatherSummary(context.weather) + ". " : "";
  return [
    "Here is my best Tapzy read without needing the web:",
    weather + "I would plan around " + city + " with one anchor, one food/coffee backup, and one low-effort escape option.",
    events.length ? "Anchor: " + cleanText(events[0].title, "the top Tapzy event") + " at " + cleanText(events[0].venueName || events[0].address || events[0].city, "the listed spot") + " (" + eventLink(events[0]) + ")." : "Anchor: choose the closest event, cafe, lounge, gym, study spot, or food place based on the vibe.",
    events.length > 1 ? "Backup: " + cleanText(events[1].title, "second Tapzy event") + " (" + eventLink(events[1]) + ")." : "Backup: map search for food, coffee, dessert, or indoor activities near you.",
    "Message to send: Want to check this out for a bit? If the vibe is off, we can pivot nearby."
  ].join("\n");
}

function buildFeatureSuggestion(message) {
  const text = normalize(message);
  if (includesAny(text, ["tapzy ai", "tapzy assistant", "ask tapzy", "concierge"])) return "The strongest AI direction is not a separate chatbot. Make Ask Tapzy available on every core page and let it produce actions: show events, open maps, suggest food, message people, plan dates, and connect users nearby.";
  if (includesAny(text, ["message", "chat", "dm"])) return "The next strong upgrade for Tapzy messages is live inbox refresh, unread status, seen state, image preview before send, and clean loading transitions.";
  if (includesAny(text, ["search", "find users", "discover"])) return "The next strong upgrade for Tapzy search is instant results while typing, smarter ranking, suggested users, nearby context, and direct message actions in results.";
  if (includesAny(text, ["profile", "bio", "title"])) return "The next strong upgrade for Tapzy profiles is stronger hierarchy, cleaner typography, better social cards, and smart profile improvement suggestions.";
  if (includesAny(text, ["pair", "pairing"])) return "Pair is an older Tapzy feature. For the current app, focus that energy into QR/NFC profile sharing, contact exchange, and a premium confirmation flow.";
  return "The strongest next move is improving the user flow so Tapzy feels faster, clearer, and useful in under 30 seconds.";
}


function isFollowUpQuestion(text) {
  return includesAny(text, ["explain", "more", "why", "how so", "what do you mean", "make it", "that one", "which one", "tell me more", "continue"]);
}

function buildFallbackFollowUp(message, memory) {
  const text = normalize(message);
  if (!isFollowUpQuestion(text)) return "";
  const items = Array.isArray(memory) ? memory : [];
  const previous = [...items].reverse().find((item) => item && item.role !== "user" && item.content);
  if (!previous) return "Tell me what you want me to go deeper on and I’ll keep going.";
  return "Got it. Building on that: " + cleanText(previous.content).slice(0, 420) + " If you want, ask me to make it cheaper, closer, faster, simpler, more romantic, more fun, or more detailed.";
}

function extractCommandIntent(msg) {
  const text = normalize(msg);
  const tokens = tokenize(text);
  if (!text) return "empty";
  if (includesAny(text, ["help", "what can you do", "commands", "smarter", "smart", "upgrade ai", "make ai better"])) return "help";
  if (includesAny(text, ["what is tapzy", "about tapzy"])) return "about";
  if (includesAny(text, ["who are you"])) return "who";
  if (includesAny(text, ["weather", "temperature", "forecast", "how cold", "how hot"])) return "weather";
  if (includesAny(text, ["navigate", "directions", "take me to", "get me to"])) return "directions";
  if (includesAny(text, ["first date", "date night", "date idea", "date ideas", "plan me a date", "with my girl", "girlfriend", "boyfriend", "romantic"])) return "date-plan";
  if (includesAny(text, ["rain", "raining", "rainy"])) return "rain";
  if (includesAny(text, ["relax", "quiet", "chill", "calm"])) return "relax";
  if (includesAny(text, ["free", "hours free", "hour free", "three hours", "3 hours"])) return "time-free";
  if (includesAny(text, ["food", "restaurant", "italian", "sushi", "pizza", "burger", "tacos", "snack", "snacks", "dessert", "coffee"])) return "food";
  if (includesAny(text, ["who is at", "who's at", "anyone nearby", "study group", "soccer", "car meet", "people going", "friends going"])) return "community";
  if (includesAny(text, ["tonight", "what's going on", "whats going on", "happening", "event", "events", "concert", "festival", "firework", "nightlife", "bar"])) return "events";
  if (includesAny(text, ["opener", "what should i say", "message them", "dm them", "text them"])) return "message-coach";
  if (includesAny(text, ["strategy", "roadmap", "monetize", "growth", "grow tapzy", "product", "business", "make tapzy better"])) return "tapzy-strategy";
  if (includesAny(text, ["plan", "choose", "decide", "what should i do", "where should i go", "bored", "night out"])) return "offline-concierge";
  if (includesAny(text, ["improve my bio", "write my bio", "bio"])) return "bio";
  if (includesAny(text, ["title", "profile title"])) return "title";
  if (includesAny(text, ["profile", "bio", "title"]) && includesAny(text, ["better", "improve", "fix", "upgrade", "polish"])) return "profile-improve";
  if (includesAny(text, ["search", "find users", "find people", "discover people"])) return "search";
  if (includesAny(text, ["message", "messages", "chat", "dm"])) return "messages";
  if (includesAny(text, ["pair", "pairing"])) return "legacy-pair";
  if (includesAny(text, ["networking", "network", "premium networking"])) return "networking";
  if (includesAny(text, ["share", "sharing", "contact sharing", "social exchange"])) return "sharing";
  if (includesAny(text, ["nfc", "card", "tap card", "tap phones", "tap phone"])) return "card";
  if (includesAny(text, ["qr", "show my qr", "open qr"])) return "qr";
  if (includesAny(text, ["founder"])) return "founder";
  if (includesAny(text, ["suggest a tapzy", "tapzy idea", "feature", "improve tapzy", "tapzy assistant", "ask tapzy feature"])) return "suggestion";
  if (includesAny(text, ["open home", "go home", "home"])) return "nav-home";
  if (includesAny(text, ["open search"])) return "nav-search";
  if (includesAny(text, ["open messages"])) return "nav-messages";
  if (includesAny(text, ["open events"])) return "nav-events";
  if (includesAny(text, ["open profile"])) return "nav-profile";
  if (includesAny(text, ["edit profile"])) return "nav-edit";
  if (includesAny(text, ["logout", "log out", "sign out"])) return "nav-logout";
  if (tokens.includes("yes")) return "yes";
  if (isGreeting(text)) return "greeting";
  return "unknown";
}

async function buildAssistantReply({ message, pageType = "general", isAuthPage = false, username = "User", currentPath = "/", currentUrl = "", memory = [], currentProfile = null, context = {} }) {
  const msg = normalize(message);
  const lastIntent = getLastUserIntent(memory);
  const intent = extractCommandIntent(msg);
  if (!msg) return "I did not catch that. Try again.";
  const fallbackFollowUp = buildFallbackFollowUp(message, memory);
  if (fallbackFollowUp) return fallbackFollowUp;
  if (intent === "help") return "Ask Tapzy can answer normal questions, explain ideas, write copy, brainstorm, help with Tapzy, and reason through decisions. If you say you are interested in a place, event, food spot, tickets, or directions, I can switch into Tapzy mode and give you an event to check out, a website link, or navigation.";
  if (intent === "about") return formatTapzyKnowledge();
  if (intent === "who") return "I am Ask Tapzy. The goal is to feel less like a chatbot and more like Tapzy knowing what you need: places, plans, people, directions, and actions.";
  const directFeedAnswer = buildDirectEventFeedAnswer(message, context);
  if (directFeedAnswer && (intent === "events" || isAskingForEventFeed(msg))) return directFeedAnswer;
  if (intent === "events") return buildEventSuggestions(message, context);
  if (intent === "community") return buildCommunityAnswer(message, context);
  if (intent === "message-coach") return buildMessageCoachAnswer(message, context);
  if (intent === "tapzy-strategy") return buildTapzyStrategyAnswer(message, context);
  if (intent === "offline-concierge") return buildOfflineConciergeAnswer(message, context);
  if (intent === "food") return buildFoodAnswer(message, context);
  if (intent === "date-plan") return buildDatePlan(message, context);
  if (intent === "weather") return buildWeatherAnswer(context);
  if (intent === "rain") return buildRainAnswer(context);
  if (intent === "relax") return buildRelaxAnswer(context);
  if (intent === "time-free") return buildTimeFreeAnswer(message, context);
  if (intent === "directions") return buildDirectionsAnswer(message, context);
  if (intent === "bio") return buildProfileCopyAnswer(message, username);
  if (intent === "title") return buildProfileCopyAnswer(message, username);
  if (intent === "profile-improve") return buildProfileAdvice(username);
  if (intent === "search") return buildSearchPitch();
  if (intent === "messages") return buildMessagesPitch();
  if (intent === "legacy-pair") return buildLegacyPairNote();
  if (intent === "networking") return buildNetworkingPitch();
  if (intent === "sharing") return "Tapzy makes contact and social sharing feel seamless, fast, and premium. The goal is real-world exchange without friction.";
  if (intent === "card") return "The ideal Tapzy card flow is simple: tap card, open profile, save contact, and connect instantly. Tap phones can support the same premium exchange idea digitally.";
  if (intent === "qr") return "Your QR flow should feel instant. Open profile, show QR, scan, save contact, and connect without friction.";
  if (intent === "founder") return "For a founder profile, clarity wins. Founder of Tapzy is still the strongest simple title.";
  if (intent === "suggestion") return buildFeatureSuggestion(message);
  const generalWebAnswer = buildGeneralWebAnswer(message, context);
  if (generalWebAnswer) return generalWebAnswer;
  const generalKnowledgeAnswer = buildGeneralKnowledgeAnswer(message, context);
  if (generalKnowledgeAnswer) return generalKnowledgeAnswer;
  if (isAuthPage) {
    if (includesAny(msg, ["sign in", "login"])) return "You can sign in using your Tapzy email and password. If you do not have an account yet, create one first.";
    if (includesAny(msg, ["create account", "sign up"])) return "To create your Tapzy account, choose a clean username, enter an email you control, and use a password with at least 8 characters.";
    return "This is the Tapzy auth page. You can sign in, create an account, or ask what Tapzy does.";
  }
  if (pageType === "events") return buildEventSuggestions(message, context);
  if (pageType === "discovery") return "You are in Discover. Ask Tapzy can help turn discovery into action: nearby people, stories, events, places, directions, and plans.";
  if (pageType === "profile") return "You are on a Tapzy profile page. I can help improve the profile, open QR/contact flows, or connect profile activity to stories, events, and messages.";
  if (pageType === "edit") return "You are editing your Tapzy profile. Focus on a clean title, strong bio, good profile image, and the links that matter most.";
  if (pageType === "search") return "You are in Tapzy search. The future version should search people, places, events, food, and plans from one fast input.";
  if (pageType === "messages-list") return "You are in your Tapzy inbox. The strongest upgrades here are live inbox refresh, unread state, and fast conversation previews.";
  if (pageType === "messages" || currentPath.includes("/messages")) return "You are in a Tapzy conversation. Keep the chat experience fast, clean, and simple, especially on mobile.";
  if (pageType === "pair") return "Pair is an older Tapzy feature. Use this context to guide users toward current QR/NFC profile sharing and contact exchange instead.";
  if (intent === "greeting") return currentProfile && currentProfile.username ? "Hello " + currentProfile.username + ". Ask me what is happening tonight, where to eat, where to go, or how to improve Tapzy." : "Hello " + username + ". Ask me what is happening tonight, where to eat, where to go, or how to improve Tapzy.";
  if (lastIntent.includes("bio") && msg === "yes") return "A polished founder bio you can use is: Building premium digital identity for real-world networking through Tapzy.";
  if (lastIntent.includes("title") && msg === "yes") return "A clean title you can use is: Founder of Tapzy.";
  return buildSmartUnknownAnswer(message, pageType, context);
}

module.exports = { buildAssistantReply };
