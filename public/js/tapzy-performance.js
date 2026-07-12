(function () {
  if (window.__tapzyPerformanceLoaded) return;
  window.__tapzyPerformanceLoaded = true;

  var pageCache = new Map();
  var PREFETCH_TTL = 1000 * 60 * 2;
  var MAX_PAGE_CACHE = 6;

  function idle(fn) {
    if ("requestIdleCallback" in window) return window.requestIdleCallback(fn, { timeout: 1200 });
    return window.setTimeout(fn, 250);
  }

  function optimizeMedia(root) {
    root = root || document;
    var images = Array.prototype.slice.call(root.querySelectorAll("img:not([loading])"));
    images.forEach(function (img, index) {
      var firstScreen = index < 3 || !!img.closest(".profile-showcase,.authCard,.event-card,.js-event-card:first-child,.stories-profile-card");
      img.setAttribute("loading", firstScreen ? "eager" : "lazy");
      img.setAttribute("decoding", "async");
      if (firstScreen && !img.hasAttribute("fetchpriority")) img.setAttribute("fetchpriority", "high");
    });
    root.querySelectorAll('img[loading="lazy"]:not([fetchpriority])').forEach(function (img) {
      img.setAttribute("fetchpriority", "low");
    });
    root.querySelectorAll("video").forEach(function (video) {
      if (!video.hasAttribute("preload")) video.setAttribute("preload", "metadata");
      video.setAttribute("playsinline", "");
    });
  }

  function isAndroidBrowser() {
    return /Android/i.test(navigator.userAgent || "");
  }

  function isFullDocumentRoute(url) {
    return /^\/(?:events|messages)(?:$|[/?#])/.test((url && (url.pathname + url.search + url.hash)) || "");
  }

  function shouldConserveResources() {
    var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection && (connection.saveData || /(?:2g|slow-2g)/i.test(connection.effectiveType || ""))) return true;
    if (navigator.deviceMemory && navigator.deviceMemory <= 2) return true;
    return false;
  }

  var STORY_MEDIA_CACHE = "tapzy-story-media-v1";
  var storyBlobUrls = new Map();
  var storyMediaPending = new Map();
  var MAX_STORY_MEDIA_WARM = 36;

  function isStoryMediaUrl(src) {
    if (!src || /^blob:/i.test(src) || /^data:/i.test(src)) return false;
    try {
      var url = new URL(src, location.href);
      return /\.(?:mp4|mov|m4v|webm|3gp|3gpp|hevc)(?:$|[?#])/i.test(url.pathname) || /res\.cloudinary\.com\/.*\/video\/upload\//i.test(url.href);
    } catch (_) {
      return false;
    }
  }

  function isStoryVideoElement(video) {
    return !!(video && video.matches && (
      video.hasAttribute("data-keep-video-live") ||
      video.hasAttribute("data-recover-if-blank") ||
      video.closest("[data-profile-story-stage], .sf-feed, .story-view-shell")
    ));
  }

  function storyOriginalSrc(video) {
    if (!video) return "";
    var saved = video.dataset && video.dataset.tapzyStoryOriginalSrc;
    if (saved) return saved;
    var src = video.currentSrc || video.getAttribute("src") || "";
    if (!/^blob:/i.test(src) && video.dataset) video.dataset.tapzyStoryOriginalSrc = src;
    return /^blob:/i.test(src) ? "" : src;
  }

  function cacheRequestForStoryMedia(src) {
    var url = new URL(src, location.href);
    return new Request(url.href, {
      mode: url.origin === location.origin ? "same-origin" : "cors",
      credentials: url.origin === location.origin ? "same-origin" : "omit",
      cache: "force-cache"
    });
  }

  function cachedStoryBlobUrl(src) {
    if (!isStoryMediaUrl(src) || !("caches" in window) || !("fetch" in window) || !("URL" in window)) return Promise.resolve(null);
    if (storyBlobUrls.has(src)) return Promise.resolve(storyBlobUrls.get(src));
    if (storyMediaPending.has(src)) return storyMediaPending.get(src);
    var request;
    try { request = cacheRequestForStoryMedia(src); } catch (_) { return Promise.resolve(null); }
    var pending = caches.open(STORY_MEDIA_CACHE).then(function(cache){
      return cache.match(request, { ignoreVary:true }).then(function(cached){
        if (cached) return cached;
        return fetch(request).then(function(response){
          if (response && response.ok) cache.put(request, response.clone()).catch(function(){});
          return response;
        });
      });
    }).then(function(response){
      if (!response || !response.ok) return null;
      return response.blob();
    }).then(function(blob){
      if (!blob || !blob.size) return null;
      var blobUrl = URL.createObjectURL(blob);
      storyBlobUrls.set(src, blobUrl);
      return blobUrl;
    }).catch(function(){
      return null;
    }).finally(function(){
      storyMediaPending.delete(src);
    });
    storyMediaPending.set(src, pending);
    return pending;
  }

  function applyCachedStoryVideo(video) {
    if (!isStoryVideoElement(video)) return;
    var src = storyOriginalSrc(video);
    if (!isStoryMediaUrl(src)) return;
    cachedStoryBlobUrl(src).then(function(blobUrl){
      if (!blobUrl || !video.isConnected) return;
      var current = video.currentSrc || video.getAttribute("src") || "";
      if (/^blob:/i.test(current) || (video.dataset && video.dataset.tapzyStoryBlobApplied === blobUrl)) return;
      if (!video.paused && video.readyState >= 2) return;
      if (video.dataset) video.dataset.tapzyStoryBlobApplied = blobUrl;
      video.setAttribute("src", blobUrl);
      video.preload = "auto";
      try { video.load(); } catch (_) {}
      if (video.autoplay || video.closest(".sf-slide, [data-profile-story-stage], .story-view-shell")) {
        video.play().catch(function(){});
      }
    });
  }

  function warmStoryMedia(root) {
    root = root || document;
    var count = 0;
    Array.prototype.slice.call(root.querySelectorAll("video")).forEach(function(video){
      if (count >= MAX_STORY_MEDIA_WARM) return;
      if (!isStoryVideoElement(video)) return;
      count += 1;
      applyCachedStoryVideo(video);
    });
    Array.prototype.slice.call(root.querySelectorAll("script[data-profile-story-items]")).forEach(function(script){
      if (count >= MAX_STORY_MEDIA_WARM) return;
      try {
        (JSON.parse(script.textContent || "[]") || []).forEach(function(item){
          if (count >= MAX_STORY_MEDIA_WARM) return;
          if (item && item.isVideo && isStoryMediaUrl(item.mediaUrl)) {
            count += 1;
            cachedStoryBlobUrl(item.mediaUrl);
          }
        });
      } catch (_) {}
    });
  }

  function rememberPage(key, html) {
    if (!html) return;
    pageCache.set(key, { html: html, time: Date.now() });
    while (pageCache.size > MAX_PAGE_CACHE) {
      var first = pageCache.keys().next().value;
      if (!first) break;
      pageCache.delete(first);
    }
  }

  function canPrefetch(url) {
    if (!url || url.origin !== location.origin) return false;
    if (isAndroidBrowser()) return false;
    if (isFullDocumentRoute(url)) return false;
    if (shouldConserveResources()) return false;
    if (url.hash && url.pathname === location.pathname && url.search === location.search) return false;
    if (/\.(?:jpg|jpeg|png|webp|gif|mp4|mov|webm|m4v|mp3|wav|ogg|m4a|aac|pdf|zip)$/i.test(url.pathname)) return false;
    if (/^\/(?:auth|logout|admin|api)\b/i.test(url.pathname)) return false;
    return true;
  }

  function showProgress() {
    var bar = document.getElementById("tapzyPageProgress");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "tapzyPageProgress";
      bar.style.cssText = "position:fixed;left:0;top:0;height:2px;width:0;background:linear-gradient(90deg,#7fd2ff,#fff);z-index:999999;box-shadow:0 0 18px rgba(127,210,255,.75);transition:width .22s ease,opacity .22s ease;opacity:0;";
      document.documentElement.appendChild(bar);
    }
    bar.style.opacity = "1";
    bar.style.width = "38%";
    setTimeout(function () { bar.style.width = "72%"; }, 140);
  }

  function hideProgress() {
    var bar = document.getElementById("tapzyPageProgress");
    if (!bar) return;
    bar.style.width = "100%";
    setTimeout(function () { bar.style.opacity = "0"; bar.style.width = "0"; }, 220);
  }

  function cacheKey(url) {
    return url.pathname + url.search;
  }

  function prefetchDocument(url) {
    if (!canPrefetch(url)) return Promise.resolve(null);
    var key = cacheKey(url);
    var cached = pageCache.get(key);
    if (cached && Date.now() - cached.time < PREFETCH_TTL) return Promise.resolve(cached.html);

    return fetch(url.href, {
      method: "GET",
      credentials: "same-origin",
      headers: { "X-Tapzy-Prefetch": "1" },
    }).then(function (res) {
      var type = res.headers.get("content-type") || "";
      if (!res.ok || type.indexOf("text/html") === -1) throw new Error("Not HTML");
      return res.text();
    }).then(function (html) {
      if (!/<body[\s>]/i.test(html)) return null;
      rememberPage(key, html);
      return html;
    }).catch(function () { return null; });
  }

  function renderFetchedPage(html, url) {
    if (!html) {
      location.href = url.href;
      return;
    }
    history.pushState({ tapzy: true }, "", url.href);
    document.open();
    document.write(html);
    document.close();
  }

  function installInstantNavigation() {
    if (shouldConserveResources()) return;
    var hoverTimer = null;

    document.addEventListener("mouseover", function (event) {
      var a = event.target && event.target.closest ? event.target.closest("a[href]") : null;
      if (!a) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(function () {
        try { prefetchDocument(new URL(a.href, location.href)); } catch (_) {}
      }, 80);
    }, { passive: true });

    document.addEventListener("touchstart", function (event) {
      var a = event.target && event.target.closest ? event.target.closest("a[href]") : null;
      if (!a) return;
      try { prefetchDocument(new URL(a.href, location.href)); } catch (_) {}
    }, { passive: true });

    document.addEventListener("click", function (event) {
      var a = event.target && event.target.closest ? event.target.closest("a[href]") : null;
      if (!a || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || a.target === "_blank" || a.hasAttribute("download")) return;
      var url;
      try { url = new URL(a.href, location.href); } catch (_) { return; }
      if (!canPrefetch(url)) return;
      event.preventDefault();
      showProgress();
      var cached = pageCache.get(cacheKey(url));
      if (cached && Date.now() - cached.time < PREFETCH_TTL) {
        hideProgress();
        renderFetchedPage(cached.html, url);
        return;
      }
      prefetchDocument(url).then(function (html) {
        hideProgress();
        renderFetchedPage(html, url);
      }).catch(function () {
        location.href = url.href;
      });
    });

    window.addEventListener("popstate", function () {
      location.reload();
    });
  }

  function fileToCompressedImage(file, maxSide, quality) {
    if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type)) return Promise.resolve(file);
    if (file.size < 650 * 1024) return Promise.resolve(file);

    return new Promise(function (resolve) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        var scale = Math.min(1, maxSide / Math.max(w, h));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          if (!blob || blob.size >= file.size) return resolve(file);
          var ext = blob.type === "image/webp" ? ".webp" : ".jpg";
          var cleanName = String(file.name || "tapzy-image").replace(/\.[^.]+$/, "") + ext;
          resolve(new File([blob], cleanName, { type: blob.type || "image/jpeg", lastModified: Date.now() }));
        }, "image/webp", quality);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  function getVideoDuration(file) {
    return new Promise(function (resolve) {
      if (!file || !/^video\//i.test(file.type)) return resolve(0);
      var video = document.createElement("video");
      var url = URL.createObjectURL(file);
      video.preload = "metadata";
      video.onloadedmetadata = function () {
        var duration = Number(video.duration || 0);
        URL.revokeObjectURL(url);
        resolve(duration);
      };
      video.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(0);
      };
      video.src = url;
    });
  }

  function setUploadStatus(form, text) {
    var status = form.querySelector("[data-tapzy-upload-status]");
    if (!status) {
      status = document.createElement("div");
      status.setAttribute("data-tapzy-upload-status", "1");
      status.style.cssText = "margin-top:8px;color:#9fd8ff;font-size:12px;font-weight:700;letter-spacing:.2px;";
      form.appendChild(status);
    }
    status.textContent = text || "";
  }

  function isDedicatedMediaUploadForm(form) {
    try {
      var action = new URL(form.getAttribute("action") || location.href, location.href);
      return /^\/stories(?:$|\/)/.test(action.pathname) || /^\/messages\/[^/]+$/.test(action.pathname);
    } catch (_) {
      return false;
    }
  }

  function installServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext && location.hostname !== "localhost") return;
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  }

  function installOffscreenVideoSaver() {
    if (!("IntersectionObserver" in window)) return null;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var video = entry.target;
        if (!video || video.srcObject || video.closest("[data-keep-video-live]")) return;
        if (entry.isIntersecting) {
          if (video.dataset.tapzyPausedOffscreen === "1" && (video.autoplay || video.closest(".is-autoplay") || video.closest(".sf-slide") || video.closest(".story-view-panel"))) {
            video.dataset.tapzyPausedOffscreen = "0";
            video.play().catch(function () {});
          }
          return;
        }
        if (!video.paused && !video.closest("[data-video-frame].is-playing")) {
          video.dataset.tapzyPausedOffscreen = "1";
          video.pause();
        }
      });
    }, { rootMargin: "180px 0px", threshold: 0.01 });

    function watch(root) {
      (root || document).querySelectorAll("video").forEach(function (video) {
        if (video.__tapzyVideoObserved) return;
        video.__tapzyVideoObserved = true;
        observer.observe(video);
      });
    }

    watch(document);
    return watch;
  }

  function installSmartUploads() {
    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!form || !form.matches || !form.matches('form[enctype="multipart/form-data"]')) return;
      if (isDedicatedMediaUploadForm(form)) return;
      if (form.__tapzyPrepared) return;
      var input = form.querySelector('input[type="file"]');
      if (!input || !input.files || !input.files[0]) return;

      var file = input.files[0];
      var isTapzyMedia = /^(media|storyMedia|photo|momentPhoto)$/i.test(input.name || "");
      if (!isTapzyMedia) return;

      event.preventDefault();
      setUploadStatus(form, "Preparing media…");

      Promise.resolve(file)
        .then(function (original) {
          return fileToCompressedImage(original, input.name === "photo" ? 1400 : 1600, input.name === "photo" ? 0.82 : 0.78);
        })
        .then(function (prepared) {
          if (prepared !== file) {
            var dt = new DataTransfer();
            dt.items.add(prepared);
            input.files = dt.files;
            setUploadStatus(form, "Image optimized — sending…");
          } else if (/^video\//i.test(file.type)) {
            return getVideoDuration(file).then(function (seconds) {
              var durationLabel = seconds > 0
                ? " (" + Math.max(1, Math.round(seconds / 60)) + " min)"
                : "";
              setUploadStatus(form, "Uploading video" + durationLabel + "… keep this page open.");
            });
          } else {
            setUploadStatus(form, "Sending…");
          }
        })
        .catch(function () { setUploadStatus(form, "Sending…"); })
        .finally(function () {
          form.__tapzyPrepared = true;
          if (form.requestSubmit) form.requestSubmit();
          else form.submit();
        });
    }, true);
  }

  optimizeMedia(document);
  warmStoryMedia(document);
  var watchNewVideos = installOffscreenVideoSaver();
  idle(installInstantNavigation);
  idle(installSmartUploads);
  idle(installServiceWorker);

  if ("MutationObserver" in window) {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes && mutation.addedNodes.forEach(function (node) {
          if (node && node.nodeType === 1) optimizeMedia(node);
          if (node && node.nodeType === 1) warmStoryMedia(node);
          if (node && node.nodeType === 1 && watchNewVideos) watchNewVideos(node);
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
