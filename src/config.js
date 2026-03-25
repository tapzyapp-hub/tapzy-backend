require("dotenv").config();

module.exports = {
  PORT: Number(process.env.PORT || 3001),
  WEB_BASE: process.env.WEB_BASE || "http://127.0.0.1:3001",
  ADMIN_KEY: process.env.ADMIN_KEY || "",
  EMAIL_FROM: process.env.EMAIL_FROM || "Tapzy <support@tapzy.org>",
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "support@tapzy.org",
  SESSION_COOKIE: "tapzy_session",
  SESSION_DAYS: Number(process.env.SESSION_DAYS || 30),
  IS_PROD: process.env.NODE_ENV === "production",
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  TICKETMASTER_API_KEY: process.env.TICKETMASTER_API_KEY || "oAqKqC9wmCIG5ItBGeyZcCPE4BSPwDrZ",
  EVENTBRITE_PRIVATE_TOKEN: process.env.EVENTBRITE_PRIVATE_TOKEN ||"",
};