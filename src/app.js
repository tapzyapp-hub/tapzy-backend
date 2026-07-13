const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const path = require("path");

const { isAllowedOrigin } = require("./config");
const { uploadsDir } = require("./upload");
const { sessionMiddleware } = require("./middleware");

const authRoutes = require("./routes/auth");
const activateRoutes = require("./routes/activate");
const cardsRoutes = require("./routes/cards");
const profileRoutes = require("./routes/profile");
const shareRoutes = require("./routes/share");
const messagesRoutes = require("./routes/messages");
const searchRoutes = require("./routes/search");
const adminRoutes = require("./routes/admin");
const miscRoutes = require("./routes/misc");
const discoveryRoutes = require("./routes/discovery");
const assistantRoutes = require("./routes/assistantRoutes");
const pairRoutes = require("./routes/pair");
const eventsRoutes = require("./routes/events");
const storiesRoutes = require("./routes/stories");
const postsRoutes = require("./routes/posts");
const notificationsRoutes = require("./routes/notifications");
const mediaChunksRoutes = require("./routes/mediaChunks");

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(
  cors({
    credentials: true,
    origin(origin, cb) {
      if (isAllowedOrigin(origin)) {
        return cb(null, true);
      }

      console.error("Blocked CORS origin:", origin);
      return cb(new Error("Not allowed by CORS"));
    },
  })
);

app.use(compression({ threshold: 1024 }));

const LOCKED_VIEWPORT = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
const TAPZY_PAGE_LOADER_HEAD = "<style data-tapzy-page-loader>\n  html.tapzy-page-loading,\n  html.tapzy-page-loading body{background:#000!important;overflow:hidden!important;overscroll-behavior:none!important;}\n  html.tapzy-page-loading body::before{content:\"\";position:fixed;inset:0;z-index:2147483644;background:radial-gradient(circle at 50% 38%,rgba(47,118,255,.32),rgba(47,118,255,0) 30%),radial-gradient(circle at 50% 46%,rgba(111,210,255,.14),rgba(111,210,255,0) 46%),linear-gradient(180deg,#06101f 0%,#02050b 48%,#000 100%);pointer-events:none;}\n  html.tapzy-page-loading body::after{content:\"\";position:fixed;left:50%;top:50%;z-index:2147483645;width:86px;height:86px;transform:translate(-50%,-50%);border-radius:26px;background:url('/images/tapzy-mark-white.png') center / 62% 62% no-repeat,linear-gradient(145deg,#2f7bff 0%,#1959e6 52%,#0d34a8 100%);box-shadow:0 24px 76px rgba(47,118,255,.46),0 0 44px rgba(111,210,255,.34),0 0 0 1px rgba(255,255,255,.22) inset;animation:tapzyPageLoaderPulse 1.45s ease-in-out infinite;pointer-events:none;}\n  @keyframes tapzyPageLoaderPulse{0%,100%{opacity:.86;transform:translate(-50%,-50%) scale(.94);box-shadow:0 18px 58px rgba(47,118,255,.30),0 0 0 0 rgba(80,152,255,.36),0 0 0 1px rgba(255,255,255,.18) inset;}50%{opacity:1;transform:translate(-50%,-50%) scale(1.08);box-shadow:0 28px 92px rgba(47,118,255,.58),0 0 0 18px rgba(80,152,255,.08),0 0 0 1px rgba(255,255,255,.24) inset;}}\n</style>\n<script data-tapzy-page-loader>\n  (function(){\n    var root=document.documentElement;\n    var minMs=900;\n    var shownAt=Date.now();\n    var hideTimer=null;\n    var navigating=false;\n    function showLoader(){shownAt=Date.now();if(hideTimer)window.clearTimeout(hideTimer);root.classList.add('tapzy-page-loading');root.classList.remove('tapzy-page-ready');}\n    function hideLoader(){if(navigating)return;if(hideTimer)window.clearTimeout(hideTimer);var wait=Math.max(0,minMs-(Date.now()-shownAt));hideTimer=window.setTimeout(function(){root.classList.remove('tapzy-page-loading');root.classList.add('tapzy-page-ready');},wait);}\n    function samePageHash(url){return url.pathname===location.pathname&&url.search===location.search&&url.hash;}\n    window.__tapzyShowPageLoader=showLoader;window.__tapzyHidePageLoader=hideLoader;showLoader();\n    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){window.requestAnimationFrame(hideLoader);},{once:true});else window.requestAnimationFrame(hideLoader);\n    window.addEventListener('load',hideLoader,{once:true});window.addEventListener('pageshow',function(){navigating=false;hideLoader();});window.addEventListener('beforeunload',showLoader);window.addEventListener('pagehide',showLoader);\n    document.addEventListener('click',function(event){var link=event.target&&event.target.closest?event.target.closest('a[href]'):null;if(!link||event.defaultPrevented)return;if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;if(link.target&&link.target!=='_self')return;if(link.hasAttribute('download')||link.hasAttribute('data-no-page-loader'))return;var url;try{url=new URL(link.href,location.href);}catch(_){return;}if(url.origin!==location.origin||samePageHash(url))return;event.preventDefault();navigating=true;showLoader();window.setTimeout(function(){location.href=url.href;},minMs);},true);\n    document.addEventListener('submit',function(event){var form=event.target;if(!form||form.hasAttribute('data-no-page-loader')||form.getAttribute('data-tapzy-loader-submitting')==='1')return;event.preventDefault();form.setAttribute('data-tapzy-loader-submitting','1');navigating=true;showLoader();window.setTimeout(function(){HTMLFormElement.prototype.submit.call(form);},minMs);},true);\n  })();\n</script>";
const HORIZONTAL_LOCK_HEAD = `
<style data-tapzy-horizontal-lock>
  html,
  body,
  *{
    scrollbar-width:none!important;
    -ms-overflow-style:none!important;
  }
  html::-webkit-scrollbar,
  body::-webkit-scrollbar,
  *::-webkit-scrollbar{
    width:0!important;
    height:0!important;
    display:none!important;
    background:transparent!important;
  }
  html,
  body{
    max-width:100%!important;
    overflow-x:hidden!important;
    overscroll-behavior-x:none!important;
  }
</style>
<script data-tapzy-horizontal-lock>
  (function(){
    var edgeSwipe = null;
    function startEdgeSwipe(event){
      if (!event.touches || event.touches.length !== 1) { edgeSwipe = null; return; }
      var touch = event.touches[0];
      var width = window.innerWidth || document.documentElement.clientWidth || 0;
      var edge = touch.clientX <= 36 ? "left" : (width && touch.clientX >= width - 36 ? "right" : "");
      edgeSwipe = edge ? { edge: edge, x: touch.clientX, y: touch.clientY } : null;
      if (edgeSwipe && event.cancelable) event.preventDefault();
    }
    function stopEdgeSwipe(event){
      if (!edgeSwipe || !event.touches || event.touches.length !== 1) return;
      var touch = event.touches[0];
      var dx = touch.clientX - edgeSwipe.x;
      var dy = touch.clientY - edgeSwipe.y;
      var isBrowserSwipe = (edgeSwipe.edge === "left" && dx > 8) || (edgeSwipe.edge === "right" && dx < -8);
      if (isBrowserSwipe && Math.abs(dx) > Math.abs(dy) * 1.15) {
        event.preventDefault();
        pinHorizontalScroll();
      }
    }
    document.addEventListener("touchstart", startEdgeSwipe, { passive:false });
    document.addEventListener("touchmove", stopEdgeSwipe, { passive:false });
    document.addEventListener("touchend", function(){ edgeSwipe = null; }, { passive:true });
    document.addEventListener("touchcancel", function(){ edgeSwipe = null; }, { passive:true });
    function pinHorizontalScroll(){
      if (window.scrollX || document.documentElement.scrollLeft || document.body.scrollLeft) {
        document.documentElement.scrollLeft = 0;
        document.body.scrollLeft = 0;
        window.scrollTo(0, window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0);
      }
    }
    window.addEventListener("scroll", pinHorizontalScroll, { passive:true });
    window.addEventListener("resize", pinHorizontalScroll, { passive:true });
    window.addEventListener("orientationchange", function(){ window.setTimeout(pinHorizontalScroll, 60); }, { passive:true });
    document.addEventListener("touchmove", function(){ window.requestAnimationFrame(pinHorizontalScroll); }, { passive:true });
    pinHorizontalScroll();
  })();
</script>`;

app.use((req, res, next) => {
  const originalSend = res.send.bind(res);
  res.send = function patchedSend(body) {
    const contentType = String(res.getHeader("Content-Type") || "");
    const looksHtml = typeof body === "string" && /<html|<!doctype html|<head/i.test(body);
    if (looksHtml && (!contentType || /html/i.test(contentType))) {
      if (/<meta\s+name=["']viewport["'][^>]*>/i.test(body)) {
        body = body.replace(/<meta\s+name=["']viewport["'][^>]*>/gi, '<meta name="viewport" content="' + LOCKED_VIEWPORT + '" />');
      } else if (/<head[^>]*>/i.test(body)) {
        body = body.replace(/<head([^>]*)>/i, '<head$1>\n<meta name="viewport" content="' + LOCKED_VIEWPORT + '" />');
      }
      if (!/data-tapzy-page-loader/i.test(body) && /<head[^>]*>/i.test(body)) {
        body = body.replace(/<head([^>]*)>/i, "<head$1>\n" + TAPZY_PAGE_LOADER_HEAD);
      }
      if (!/data-tapzy-horizontal-lock/i.test(body) && /<head[^>]*>/i.test(body)) {
        body = body.replace(/<head([^>]*)>/i, "<head$1>\n" + HORIZONTAL_LOCK_HEAD);
      }
    }
    return originalSend(body);
  };
  next();
});

app.use(cookieParser());
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));

// Speed pass: browser-cache static Tapzy assets so repeat visits feel much faster.
// Server-rendered HTML still stays dynamic because this only affects static files.
const staticCache = {
  etag: true,
  maxAge: "7d",
  setHeaders(res, filePath) {
    if (filePath && (/\/sw\.js$/i.test(filePath) || /\.(?:html?)$/i.test(filePath))) {
      res.setHeader("Cache-Control", "no-cache");
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  },
};

const uploadsCache = {
  etag: true,
  maxAge: "30d",
  setHeaders(res, filePath) {
    if (filePath && /\.(?:mp4|mov|m4v|webm|3gp|3gpp|avi|hevc)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
  },
};

app.use(express.static(path.join(__dirname, "..", "public"), staticCache));
app.use("/uploads", express.static(uploadsDir, uploadsCache));

app.use(sessionMiddleware);

app.use("/api/assistant", assistantRoutes);

app.use("/", authRoutes);
app.use("/", cardsRoutes);
app.use("/", activateRoutes);
app.use("/", profileRoutes);
app.use("/", shareRoutes);
app.use("/", messagesRoutes);
app.use("/", searchRoutes);
app.use("/", adminRoutes);
app.use("/", miscRoutes);
app.use("/", discoveryRoutes);
app.use("/", pairRoutes);
app.use("/", eventsRoutes);
app.use("/", mediaChunksRoutes);
app.use("/", storiesRoutes);
app.use("/", postsRoutes);
app.use("/", notificationsRoutes);

app.use((err, req, res, next) => {
  if (!err || err.code !== "LIMIT_FILE_SIZE") return next(err);
  const message = "This video is still too large after Tapzy's upload prep. Try exporting it at 1080p or lower, then post again.";
  const isAjax = req.xhr || req.get("X-Requested-With") === "XMLHttpRequest";
  if (isAjax) return res.status(413).json({ ok: false, error: message });
  return res.status(413).send(message);
});

module.exports = app;
