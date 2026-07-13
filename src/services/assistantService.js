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

function eventDestination(event) {
  return [event && event.venueName, event && event.address, event && event.city, event && event.region].map((x) => cleanText(x)).filter(Boolean).join(", ");
}

function eventLink(event) {
  return event && event.id ? "/events/" + encodeURIComponent(event.id) : "/events";
}

function eventMapsLink(event) {
  const destination = eventDestination(event);
  return destination ? mapsDirectionUrl(destination) : "";
}

function formatEventLine(event, index) {
  const title = cleanText(event && event.title, "Untitled event");
  const where = cleanText((event && (event.venueName || event.address || event.city)), "location coming soon");
  const when = compactDate(event && event.startAt);
  const price = cleanText(event && event.priceText);
  const attending = Number((event && event.attendingCount) || 0);
  const parts = [String(index + 1) + ". " + title, when, where];
  if (price) parts.push(price);
  if (attending) parts.push(String(attending) + " going");
  return parts.join(" - ");
}

function filterEvents(events, message) {
  const text = normalize(message);
  const items = Array.isArray(events) ? events : [];
  if (!items.length) return [];

  const buckets = [
    { match: ["concert", "music", "live music", "dj", "nightlife", "bar", "club", "dance", "dances", "party"], terms: ["concert", "music", "dj", "nightlife", "bar", "club", "dance", "party", "afterparty"] },
    { match: ["sports", "soccer", "basketball", "hockey", "baseball", "football", "game"], terms: ["sports", "sport", "soccer", "basketball", "hockey", "baseball", "football", "game"] },
    { match: ["car meet", "cars", "car show", "meet"], terms: ["car", "cars", "auto", "vehicle", "meet"] },
    { match: ["firework", "fireworks"], terms: ["firework", "fireworks"] },
    { match: ["food", "food truck", "ribfest", "festival", "market"], terms: ["food", "truck", "ribfest", "festival", "market", "taste"] },
    { match: ["study", "study group", "community"], terms: ["study", "workshop", "community", "meetup"] },
  ];

  const bucket = buckets.find((item) => includesAny(text, item.match));
  if (!bucket) return items;

  const filtered = items.filter((event) => {
    const haystack = normalize([event.title, event.description, event.category, event.venueName, event.city].filter(Boolean).join(" "));
    return includesAny(haystack, bucket.terms);
  });
  return filtered.length ? filtered : items;
}

function pickEvents(events, message, limit = 4) {
  return filterEvents(events, message).slice(0, limit);
}


function formatWebResults(web, limit = 3) {
  if (!web || !Array.isArray(web.results) || !web.results.length) return "";
  return web.results.slice(0, limit).map((item, index) => {
    const details = [cleanText(item.snippet), item.rating ? "rating " + item.rating : "", item.reviews ? item.reviews + " reviews" : ""].filter(Boolean).join(" - ");
    return String(index + 1) + ". " + cleanText(item.title, "Result") + (details ? " - " + details : "") + (item.link ? " - " + item.link : "");
  }).join(" ");
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

function buildGeneralWebAnswer(message, context = {}) {
  const web = context.web;
  if (!web || !(web.answer || (web.results && web.results.length))) return "";
  const text = normalize(message);
  const intro = includesAny(text, ["how", "why", "what", "who", "when", "where", "can", "should"])
    ? "Yes. "
    : "Here is the answer I found. ";
  return intro + webSearchNote(web);
}

function buildEventSuggestions(message, context = {}) {
  const events = pickEvents(context.events, message, 4);
  if (!events.length) {
    const live = webSearchNote(context.web);
    if (live) return live + " Tapzy can still open maps or Event Finder from here.";
    return [
      "I can help you find what is happening, but I do not see fresh event results loaded into Tapzy for this request yet.",
      "Open Event Finder, enable location, and Tapzy can rank concerts, festivals, nightlife, sports, food events, and community plans nearby.",
      "Try: what is going on tonight, show me car meets, find live music, or who is at Ribfest tonight."
    ].join(" ");
  }

  const first = events[0];
  const directions = eventMapsLink(first);
  const communityHint = Number(first.attendingCount || 0) ? " I can also use Tapzy attendance to show who is going." : " If people mark themselves as going, Tapzy can turn this into a community answer too.";
  return [
    "Here are the strongest Tapzy picks I found:",
    events.map(formatEventLine).join(" "),
    "Best first tap: " + cleanText(first.title, "the first event") + " (" + eventLink(first) + ").",
    directions ? "Directions: " + directions + "." : "",
    communityHint,
    webSearchNote(context.web)
  ].filter(Boolean).join(" ");
}

function buildCommunityAnswer(message, context = {}) {
  const text = normalize(message);
  const events = pickEvents(context.events, message, 5);
  const askingWho = includesAny(text, ["who", "anyone", "friends", "people", "users"]);

  if (includesAny(text, ["soccer", "basketball", "study group", "study", "car meet", "cars"])) {
    const specific = filterEvents(Array.isArray(context.events) ? context.events : [], message).filter((event) => {
      const haystack = normalize([event.title, event.description, event.category, event.venueName, event.city].filter(Boolean).join(" "));
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
    "One-tap map search: " + mapsSearchUrl(query) + ".",
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
    "Open a dinner search: " + mapsSearchUrl("restaurants for date night " + ((context.location && context.location.city) || "near me")) + ".",
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

function buildPairPitch() {
  return "Tapzy Pair is designed for seamless phone-to-phone contact and social exchange. Users can join the same pairing space, choose what they want to share, and confirm a secure exchange. It works especially well for small groups, networking moments, and real-world introductions.";
}

function buildSearchPitch() {
  return "Tapzy search should feel like local discovery, not just a user lookup. People should be able to find profiles, events, places, friends, and nearby intent from one search surface.";
}

function buildMessagesPitch() {
  return "Tapzy messaging should feel smooth, minimal, and premium. The best experience is fast conversation loading, instant send, live updates, and clean mobile transitions.";
}

function buildFeatureSuggestion(message) {
  const text = normalize(message);
  if (includesAny(text, ["ai", "assistant", "ask tapzy", "concierge"])) return "The strongest AI direction is not a separate chatbot. Make Ask Tapzy available on every core page and let it produce actions: show events, open maps, suggest food, message people, plan dates, and connect users nearby.";
  if (includesAny(text, ["message", "chat", "dm"])) return "The next strong upgrade for Tapzy messages is live inbox refresh, unread status, seen state, image preview before send, and clean loading transitions.";
  if (includesAny(text, ["search", "find users", "discover"])) return "The next strong upgrade for Tapzy search is instant results while typing, smarter ranking, suggested users, nearby context, and direct message actions in results.";
  if (includesAny(text, ["profile", "bio", "title"])) return "The next strong upgrade for Tapzy profiles is stronger hierarchy, cleaner typography, better social cards, and smart profile improvement suggestions.";
  if (includesAny(text, ["pair", "pairing"])) return "The next strong upgrade for Tapzy Pair is smoother room flow, better ready states, and a premium share confirmation experience.";
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
  if (includesAny(text, ["help", "what can you do", "commands"])) return "help";
  if (includesAny(text, ["what is tapzy", "about tapzy"])) return "about";
  if (includesAny(text, ["who are you"])) return "who";
  if (includesAny(text, ["weather", "temperature", "forecast", "how cold", "how hot"])) return "weather";
  if (includesAny(text, ["navigate", "directions", "take me to", "get me to"])) return "directions";
  if (includesAny(text, ["first date", "date night", "plan me a date", "with my girl", "girlfriend"])) return "date-plan";
  if (includesAny(text, ["rain", "raining", "rainy"])) return "rain";
  if (includesAny(text, ["relax", "quiet", "chill", "calm"])) return "relax";
  if (includesAny(text, ["free", "hours free", "hour free", "three hours", "3 hours"])) return "time-free";
  if (includesAny(text, ["food", "restaurant", "italian", "sushi", "pizza", "burger", "tacos", "snack", "snacks", "dessert", "coffee"])) return "food";
  if (includesAny(text, ["who is at", "who's at", "anyone nearby", "study group", "soccer", "car meet", "people going", "friends going"])) return "community";
  if (includesAny(text, ["tonight", "what's going on", "whats going on", "happening", "event", "events", "concert", "festival", "firework", "nightlife", "bar"])) return "events";
  if (includesAny(text, ["improve my bio", "write my bio", "bio"])) return "bio";
  if (includesAny(text, ["title", "profile title"])) return "title";
  if (includesAny(text, ["profile", "bio", "title"]) && includesAny(text, ["better", "improve", "fix", "upgrade", "polish"])) return "profile-improve";
  if (includesAny(text, ["search", "find users", "find people", "discover people"])) return "search";
  if (includesAny(text, ["message", "messages", "chat", "dm"])) return "messages";
  if (includesAny(text, ["pair", "pairing"])) return "pair";
  if (includesAny(text, ["networking", "network", "premium networking"])) return "networking";
  if (includesAny(text, ["share", "sharing", "contact sharing", "social exchange"])) return "sharing";
  if (includesAny(text, ["nfc", "card", "tap card", "tap phones", "tap phone"])) return "card";
  if (includesAny(text, ["qr", "show my qr", "open qr"])) return "qr";
  if (includesAny(text, ["founder"])) return "founder";
  if (includesAny(text, ["suggest", "idea", "feature", "improve tapzy", "assistant", "ai"])) return "suggestion";
  if (includesAny(text, ["open home", "go home", "home"])) return "nav-home";
  if (includesAny(text, ["open search"])) return "nav-search";
  if (includesAny(text, ["open messages"])) return "nav-messages";
  if (includesAny(text, ["open events"])) return "nav-events";
  if (includesAny(text, ["open pair"])) return "nav-pair";
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
  if (intent === "help") return "Ask Tapzy can help with what is happening tonight, food nearby, date plans, directions, rainy-day ideas, profile help, messages, search, pairing, QR sharing, and community questions like who is going or anyone nearby want to play soccer.";
  if (intent === "about") return "Tapzy is a premium digital identity, local discovery, and social connection platform built around profiles, stories, messaging, events, maps, sharing, and real-world networking.";
  if (intent === "who") return "I am Ask Tapzy. The goal is to feel less like a chatbot and more like Tapzy knowing what you need: places, plans, people, directions, and actions.";
  if (intent === "events") return buildEventSuggestions(message, context);
  if (intent === "community") return buildCommunityAnswer(message, context);
  if (intent === "food") return buildFoodAnswer(message, context);
  if (intent === "date-plan") return buildDatePlan(message, context);
  if (intent === "weather") return buildWeatherAnswer(context);
  if (intent === "rain") return buildRainAnswer(context);
  if (intent === "relax") return buildRelaxAnswer(context);
  if (intent === "time-free") return buildTimeFreeAnswer(message, context);
  if (intent === "directions") return buildDirectionsAnswer(message, context);
  if (intent === "bio") return "A strong Tapzy bio should be short, premium, and clear. Example: Building premium digital identity for real-world networking.";
  if (intent === "title") return "A strong title should be simple and credible. Founder of Tapzy is stronger than Tapzy Founder.";
  if (intent === "profile-improve") return buildProfileAdvice(username);
  if (intent === "search") return buildSearchPitch();
  if (intent === "messages") return buildMessagesPitch();
  if (intent === "pair") return buildPairPitch();
  if (intent === "networking") return buildNetworkingPitch();
  if (intent === "sharing") return "Tapzy makes contact and social sharing feel seamless, fast, and premium. The goal is real-world exchange without friction.";
  if (intent === "card") return "The ideal Tapzy card flow is simple: tap card, open profile, save contact, and connect instantly. Tap phones can support the same premium exchange idea digitally.";
  if (intent === "qr") return "Your QR flow should feel instant. Open profile, show QR, scan, save contact, and connect without friction.";
  if (intent === "founder") return "For a founder profile, clarity wins. Founder of Tapzy is still the strongest simple title.";
  if (intent === "suggestion") return buildFeatureSuggestion(message);
  const generalWebAnswer = buildGeneralWebAnswer(message, context);
  if (generalWebAnswer) return generalWebAnswer;
  if (isAuthPage) {
    if (includesAny(msg, ["sign in", "login"])) return "You can sign in using your Tapzy email and password. If you do not have an account yet, create one first.";
    if (includesAny(msg, ["create account", "sign up"])) return "To create your Tapzy account, choose a clean username, enter an email you control, and use a password with at least 8 characters.";
    return "This is the Tapzy auth page. You can sign in, create an account, or ask what Tapzy does.";
  }
  if (pageType === "events") return "You are in Event Finder. Ask things like what is going on tonight, show me concerts, who is at Ribfest, or find car meets.";
  if (pageType === "discovery") return "You are in Discover. Ask Tapzy can help turn discovery into action: nearby people, stories, events, places, directions, and plans.";
  if (pageType === "profile") return "You are on a Tapzy profile page. I can help improve the profile, open QR/contact flows, or connect profile activity to stories, events, and messages.";
  if (pageType === "edit") return "You are editing your Tapzy profile. Focus on a clean title, strong bio, good profile image, and the links that matter most.";
  if (pageType === "search") return "You are in Tapzy search. The future version should search people, places, events, food, and plans from one fast input.";
  if (pageType === "messages-list") return "You are in your Tapzy inbox. The strongest upgrades here are live inbox refresh, unread state, and fast conversation previews.";
  if (pageType === "messages" || currentPath.includes("/messages")) return "You are in a Tapzy conversation. Keep the chat experience fast, clean, and simple, especially on mobile.";
  if (pageType === "pair") return "You are on Tapzy Pair. Users should be able to join quickly, choose what to share, and confirm a premium exchange.";
  if (intent === "greeting") return currentProfile && currentProfile.username ? "Hello " + currentProfile.username + ". Ask me what is happening tonight, where to eat, where to go, or how to improve Tapzy." : "Hello " + username + ". Ask me what is happening tonight, where to eat, where to go, or how to improve Tapzy.";
  if (lastIntent.includes("bio") && msg === "yes") return "A polished founder bio you can use is: Building premium digital identity for real-world networking through Tapzy.";
  if (lastIntent.includes("title") && msg === "yes") return "A clean title you can use is: Founder of Tapzy.";
  return "Ask me anything. I can answer normal questions, search the web when current info is needed, and also help with Tapzy, local plans, events, food, directions, weather, date ideas, profiles, messaging, and community discovery.";
}

module.exports = { buildAssistantReply };
