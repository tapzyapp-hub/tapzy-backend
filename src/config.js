require("dotenv").config();

module.exports = {
  PORT: Number(process.env.PORT || 3001),
  WEB_BASE: process.env.WEB_BASE || "http://127.0.0.1:3001",
  ADMIN_KEY: process.env.ADMIN_KEY || "tapzy_admin_7a4f2c9e81b3d6f4",
  EMAIL_FROM: process.env.EMAIL_FROM || "Tapzy <support@tapzy.org>",
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "support@tapzy.org",
  SESSION_COOKIE: "tapzy_session",
  SESSION_DAYS: Number(process.env.SESSION_DAYS || 30),
  IS_PROD: process.env.NODE_ENV === "production",
  RESEND_API_KEY: process.env.RESEND_API_KEY || "re_X3ZQuzng_9DrxqAxQTeuecSUC1Gkneebf",
  TICKETMASTER_API_KEY: process.env.TICKETMASTER_API_KEY || "oAqKqC9wmCIG5ItBGeyZcCPE4BSPwDrZ",
  EVENTBRITE_PRIVATE_TOKEN: process.env.EVENTBRITE_PRIVATE_TOKEN ||"CDDA73EKN2ZJCVKRU4KV",
  SERPAPI_KEY: process.env.SERPAPI_KEY ||  "0c7f9f9e9d355eeeb7dc8c6f14121b883ff2c20d31b3f78d72e690aa1570a77d",
 SEATGEEK_CLIENT_ID: process.env.SEATGEEK_CLIENT_ID ||"NTcwODY5NTl8MTc3NTUyOTE1MS4yMTc3NjE1",

};