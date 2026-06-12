function normalize(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokenize(text) {
  return normalize(text)
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean);
}

function getLastUserIntent(memory) {
  const items = Array.isArray(memory) ? memory : [];
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item && item.role === "user" && item.content) {
      return normalize(item.content);
    }
  }
  return "";
}

function includesAny(text, words) {
  return words.some((w) => text.includes(w));
}

function isGreeting(text) {
  return (
    text === "hi" ||
    text === "hey" ||
    text === "hello" ||
    text === "yo" ||
    text === "sup" ||
    text.startsWith("hi ") ||
    text.startsWith("hey ") ||
    text.startsWith("hello ")
  );
}

function buildProfileAdvice(username) {
  return [
    "Your Tapzy profile should feel premium, clean, and immediately trustworthy.",
    "Use a short strong title. Founder of Tapzy is a strong example.",
    "Keep your bio simple and clear.",
    "A strong founder bio example is: Building premium digital identity for real-world networking.",
    username ? `You should also make sure @${username} has a polished photo, clean title, and clear bio.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildNetworkingPitch() {
  return [
    "Tapzy is premium networking made seamless.",
    "It helps people exchange contact details and socials quickly in the real world.",
    "The goal is fast, polished, phone-first networking that feels easier than traditional contact sharing.",
  ].join(" ");
}

function buildPairPitch() {
  return [
    "Tapzy Pair is designed for seamless phone-to-phone contact and social exchange.",
    "Users can join the same pairing space, choose what they want to share, and confirm a secure exchange.",
    "It works especially well for small groups, networking moments, and real-world introductions.",
  ].join(" ");
}

function buildSearchPitch() {
  return [
    "Tapzy search should feel fast and premium.",
    "Users should be able to discover people by name, username, title, or bio, then message or follow right away.",
  ].join(" ");
}

function buildMessagesPitch() {
  return [
    "Tapzy messaging should feel smooth, minimal, and premium.",
    "The best experience is fast conversation loading, instant send, live updates, and a clean mobile layout.",
  ].join(" ");
}

function buildFeatureSuggestion(message) {
  const text = normalize(message);

  if (includesAny(text, ["message", "chat", "dm"])) {
    return "The next strong upgrade for Tapzy messages is live inbox refresh, unread status, seen state, and image preview before send.";
  }

  if (includesAny(text, ["search", "find users", "discover"])) {
    return "The next strong upgrade for Tapzy search is instant results while typing, smarter ranking, suggested users, and direct message actions in results.";
  }

  if (includesAny(text, ["profile", "bio", "title"])) {
    return "The next strong upgrade for Tapzy profiles is stronger hierarchy, cleaner typography, better social cards, and AI profile improvement suggestions.";
  }

  if (includesAny(text, ["pair", "pairing"])) {
    return "The next strong upgrade for Tapzy Pair is smoother room flow, better ready states, and a premium share confirmation experience.";
  }

  return "The strongest next move is improving the user flow so Tapzy feels faster, clearer, and more premium on mobile.";
}

function extractCommandIntent(msg) {
  const text = normalize(msg);
  const tokens = tokenize(text);

  if (!text) return "empty";

  if (includesAny(text, ["help", "what can you do", "commands"])) return "help";
  if (includesAny(text, ["what is tapzy", "about tapzy"])) return "about";
  if (includesAny(text, ["who are you"])) return "who";
  if (includesAny(text, ["improve my bio", "write my bio", "bio"])) return "bio";
  if (includesAny(text, ["title", "profile title"])) return "title";

  if (
    includesAny(text, ["profile", "bio", "title"]) &&
    includesAny(text, ["better", "improve", "fix", "upgrade", "polish"])
  ) {
    return "profile-improve";
  }

  if (includesAny(text, ["search", "find users", "find people", "discover people"])) return "search";
  if (includesAny(text, ["message", "messages", "chat", "dm"])) return "messages";
  if (includesAny(text, ["pair", "pairing"])) return "pair";
  if (includesAny(text, ["event", "events"])) return "events";
  if (includesAny(text, ["networking", "network", "premium networking"])) return "networking";
  if (includesAny(text, ["share", "sharing", "contact sharing", "social exchange"])) return "sharing";
  if (includesAny(text, ["nfc", "card", "tap card", "tap phones", "tap phone"])) return "card";
  if (includesAny(text, ["qr", "show my qr", "open qr"])) return "qr";
  if (includesAny(text, ["founder"])) return "founder";
  if (includesAny(text, ["suggest", "idea", "feature", "improve tapzy"])) return "suggestion";

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

async function buildAssistantReply({
  message,
  pageType = "general",
  isAuthPage = false,
  username = "User",
  currentPath = "/",
  currentUrl = "",
  memory = [],
  currentProfile = null,
}) {
  const msg = normalize(message);
  const lastIntent = getLastUserIntent(memory);
  const intent = extractCommandIntent(msg);

  if (!msg) {
    return "I did not catch that. Try again.";
  }

  if (intent === "help") {
    return "I can help with Tapzy profiles, bios, titles, QR sharing, messaging, search, pairing, events, and networking suggestions. Try asking me to improve your profile, explain Tapzy Pair, or suggest what to upgrade next.";
  }

  if (intent === "about") {
    return "Tapzy is a premium digital identity and networking platform built for fast real-world connection, contact sharing, messaging, pairing, and discovery.";
  }

  if (intent === "who") {
    return "I’m the Tapzy Assistant. I help with navigation, profile improvement, feature explanations, and product guidance inside Tapzy.";
  }

  if (intent === "bio") {
    return "A strong Tapzy bio should be short, premium, and clear. Example: Building premium digital identity for real-world networking.";
  }

  if (intent === "title") {
    return "A strong title should be simple and credible. Founder of Tapzy is stronger than Tapzy Founder.";
  }

  if (intent === "profile-improve") {
    return buildProfileAdvice(username);
  }

  if (intent === "search") {
    return buildSearchPitch();
  }

  if (intent === "messages") {
    return buildMessagesPitch();
  }

  if (intent === "pair") {
    return buildPairPitch();
  }

  if (intent === "events") {
    return "Event Finder should help users discover nearby events quickly through a clean swipe-style experience.";
  }

  if (intent === "networking") {
    return buildNetworkingPitch();
  }

  if (intent === "sharing") {
    return "Tapzy makes contact and social sharing feel seamless, fast, and premium. The goal is real-world exchange without friction.";
  }

  if (intent === "card") {
    return "The ideal Tapzy card flow is simple: tap card, open profile, save contact, and connect instantly. Tap phones can support the same premium exchange idea digitally.";
  }

  if (intent === "qr") {
    return "Your QR flow should feel instant. Open profile, show QR, scan, save contact, and connect without friction.";
  }

  if (intent === "founder") {
    return "For a founder profile, clarity wins. Founder of Tapzy is still the strongest simple title.";
  }

  if (intent === "suggestion") {
    return buildFeatureSuggestion(message);
  }

  if (isAuthPage) {
    if (includesAny(msg, ["sign in", "login"])) {
      return "You can sign in using your Tapzy email and password. If you do not have an account yet, create one first.";
    }

    if (includesAny(msg, ["create account", "sign up"])) {
      return "To create your Tapzy account, choose a clean username, enter an email you control, and use a password with at least 8 characters.";
    }

    return "This is the Tapzy auth page. You can sign in, create an account, or ask what Tapzy does.";
  }

  if (pageType === "profile") {
    return "You are on a Tapzy profile page. I can help improve your bio, title, profile layout, QR flow, or overall branding.";
  }

  if (pageType === "edit") {
    return "You are editing your Tapzy profile. Focus on a clean title, strong bio, good profile image, and the links that matter most.";
  }

  if (pageType === "search") {
    return "You are in Tapzy search. The best flow is fast discovery, clear profile cards, and quick actions like view, follow, and message.";
  }

  if (pageType === "messages-list") {
    return "You are in your Tapzy inbox. The strongest next upgrade here is live inbox refresh, unread state, and cleaner conversation previews.";
  }

  if (pageType === "messages" || currentPath.includes("/messages")) {
    return "You are in a Tapzy conversation. Keep the chat experience fast, clean, and simple, especially on mobile.";
  }

  if (pageType === "pair") {
    return "You are on Tapzy Pair. Users should be able to join quickly, choose what to share, and confirm a premium exchange.";
  }

  if (pageType === "events") {
    return "You are in Event Finder. Keep event discovery visual, simple, and easy to browse.";
  }

  if (intent === "greeting") {
    return currentProfile?.username
      ? `Hello ${currentProfile.username}. How can I help you improve Tapzy today?`
      : `Hello ${username}. How can I help you with Tapzy today?`;
  }

  if (lastIntent.includes("bio") && msg === "yes") {
    return "A polished founder bio you can use is: Building premium digital identity for real-world networking through Tapzy.";
  }

  if (lastIntent.includes("title") && msg === "yes") {
    return "A clean title you can use is: Founder of Tapzy.";
  }

  return "I can help with Tapzy profiles, search, messaging, pairing, events, bios, titles, QR sharing, cards, and networking strategy. Ask me something specific and I’ll give you a sharper answer.";
}

module.exports = {
  buildAssistantReply,
};
