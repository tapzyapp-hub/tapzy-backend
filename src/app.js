const express = require("express");

const cors = require("cors");

const helmet = require("helmet");

const cookieParser = require("cookie-parser");

const path = require("path");



const { WEB_BASE } = require("./config");

const { uploadsDir } = require("./upload");

const { sessionMiddleware } = require("./middleware");



// ROUTES

const homeRoutes = require("./routes/home"); // ✅ IMPORTANT

const authRoutes = require("./routes/auth");

const activateRoutes = require("./routes/activate");

const profileRoutes = require("./routes/profile");

const shareRoutes = require("./routes/share");

const messagesRoutes = require("./routes/messages");

const searchRoutes = require("./routes/search");

const adminRoutes = require("./routes/admin");

const miscRoutes = require("./routes/misc");

const assistantRoutes = require("./routes/assistantRoutes");

const pairRoutes = require("./routes/pair");

const eventsRoutes = require("./routes/events");



const app = express();



app.set("trust proxy", 1);



// ✅ CORS

const ALLOWED_ORIGINS = new Set(

  [

    WEB_BASE,

    "https://tapzy.org",

    "https://tapzy-backend.onrender.com",

    "http://127.0.0.1:3001",

    "http://localhost:3001",

  ]

    .filter(Boolean)

    .map((v) => String(v).replace(/\/+$/, ""))

);



app.use(

  helmet({

    contentSecurityPolicy: false,

  })

);



app.use(

  cors({

    credentials: true,

    origin(origin, cb) {

      if (!origin) return cb(null, true);

      const normalized = String(origin).replace(/\/+$/, "");

      if (ALLOWED_ORIGINS.has(normalized)) return cb(null, true);

      return cb(new Error("Not allowed by CORS"));

    },

  })

);



app.use(cookieParser());

app.use(express.json());

app.use(express.urlencoded({ extended: true }));



// ✅ STATIC FILES (LOGO FIX)

app.use(express.static(path.join(__dirname, "..", "public")));



// uploads

app.use("/uploads", express.static(uploadsDir));



// session

app.use(sessionMiddleware);



// assistant

app.use("/api/assistant", assistantRoutes);



// ✅ HOME FIRST

app.use("/", homeRoutes);



// other routes

app.use("/", authRoutes);

app.use("/", activateRoutes);

app.use("/", profileRoutes);

app.use("/", shareRoutes);

app.use("/", messagesRoutes);

app.use("/", searchRoutes);

app.use("/", adminRoutes);

app.use("/", miscRoutes);

app.use("/", pairRoutes);

app.use("/", eventsRoutes);



module.exports = app;



