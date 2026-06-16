require("dotenv").config();

function cleanUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

const IS_PROD = process.env.NODE_ENV === "production";
const WEB_BASE = cleanUrl(process.env.WEB_BASE || "http://127.0.0.1:3001");
const CORS_ORIGINS = new Set(
  [
    WEB_BASE,
    process.env.PUBLIC_WEB_BASE,
    "https://tapzy.org",
    "https://tapzy-backend.onrender.com",
    "http://127.0.0.1:3001",
    "http://localhost:3001",
    "https://127.0.0.1:3001",
    "https://localhost:3001",
  ]
    .filter(Boolean)
    .map(cleanUrl)
);

function isAllowedOrigin(origin) {
  if (!origin || origin === "null") return true;
  return CORS_ORIGINS.has(cleanUrl(origin));
}

module.exports = {
  PORT: Number(process.env.PORT || 3001),
  WEB_BASE,
  CORS_ORIGINS,
  isAllowedOrigin,
  ADMIN_KEY: process.env.ADMIN_KEY || "",
  EMAIL_FROM: process.env.EMAIL_FROM || "Tapzy <support@tapzy.org>",
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "support@tapzy.org",
  SESSION_COOKIE: process.env.SESSION_COOKIE || "tapzy_session",
  SESSION_DAYS: Number(process.env.SESSION_DAYS || 30),
  IS_PROD,
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  TICKETMASTER_API_KEY: process.env.TICKETMASTER_API_KEY || "",
  EVENTBRITE_PRIVATE_TOKEN: process.env.EVENTBRITE_PRIVATE_TOKEN || "",
  SERPAPI_KEY: process.env.SERPAPI_KEY || "",
  SEATGEEK_CLIENT_ID: process.env.SEATGEEK_CLIENT_ID || "",
};
