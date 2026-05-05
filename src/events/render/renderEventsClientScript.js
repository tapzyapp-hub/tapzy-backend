module.exports = function renderEventsClientScript({ FEED_PAGE_SIZE, category, isHotNearbyMode, citySections, currentProfile, liveLat, liveLng, radiusKm, usingClosestAreaFallback, closestAreaFallback }) {
  return `
<script>
(function () {

        const FEED_PAGE_SIZE = ${JSON.stringify(FEED_PAGE_SIZE)};

        const category = ${JSON.stringify(category || "")};
        const IS_HOT_NEARBY_MODE = ${JSON.stringify(!!isHotNearbyMode)};

        const cities = ${JSON.stringify(citySections.map((s) => s.cityName))};

        const HAS_CURRENT_PROFILE = ${JSON.stringify(!!currentProfile)};
        const LIVE_LAT = ${JSON.stringify(liveLat)};
        const LIVE_LNG = ${JSON.stringify(liveLng)};
        const RADIUS_KM = ${JSON.stringify(radiusKm)};
        const HAS_LIVE_LOCATION = Number.isFinite(Number(LIVE_LAT)) && Number.isFinite(Number(LIVE_LNG));
        const USING_CLOSEST_AREA_FALLBACK = ${JSON.stringify(!!usingClosestAreaFallback)};
        const CLOSEST_AREA_NAME = ${JSON.stringify((closestAreaFallback && closestAreaFallback.areaName) || "")};
        const IS_MOBILE_FEED = window.matchMedia && window.matchMedia("(max-width: 700px)").matches;



        function escapeUnsafe(value) {

          return String(value || "")

            .replace(/&/g, "&amp;")

            .replace(/</g, "&lt;")

            .replace(/>/g, "&gt;")

            .replace(/"/g, "&quot;")

            .replace(/'/g, "&#39;");

        }



        function getClientCategory(event) {

          const raw = String(event.category || "").trim();

          const value = raw.toLowerCase();



          if (!raw || value === "undefined" || value === "miscellaneous" || value === "other") {

            const haystack = String(

              [event.title || "", event.description || "", event.venueName || ""].join(" ")

            ).toLowerCase();



            if (haystack.includes("concert") || haystack.includes("music") || haystack.includes("festival")) return "Concerts";

            if (haystack.includes("sports") || haystack.includes("hockey") || haystack.includes("basketball") || haystack.includes("football") || haystack.includes("soccer") || haystack.includes("baseball") || haystack.includes("mma") || haystack.includes("ufc") || haystack.includes("game")) return "Sports";

            if (haystack.includes("nightlife") || haystack.includes("party") || haystack.includes("club") || haystack.includes("dj") || haystack.includes("rave")) return "Dances";

            if (haystack.includes("convention") || haystack.includes("expo") || haystack.includes("comic con") || haystack.includes("fan expo") || haystack.includes("conference")) return "Conventions";

            return "Event";

          }



          return raw;

        }



        function getClientDescription(event) {

          const text = String(event.description || "").replace(/\s+/g, " ").trim();

          if (!text) return "Premium event discovery inside Tapzy Network™.";

          if (text.length <= 120) return text;

          return text.slice(0, 117).trim() + "...";

        }



        function getClientBadge(event) {

          if (!event || !event.startAt) return "Trending";

          const diffHours = (new Date(event.startAt).getTime() - Date.now()) / 3600000;

          if (diffHours >= 0 && diffHours <= 18) return "Tonight";

          if (diffHours > 18 && diffHours <= 72) return "Hot";

          if (diffHours > 72 && diffHours <= 168) return "This Week";

          return "Trending";

        }



        function pickFallbackImage(event) {

          const categoryText = getClientCategory(event).toLowerCase();



          if (

            categoryText.includes("nightlife") ||

            categoryText.includes("party") ||

            categoryText.includes("club") ||

            categoryText.includes("dj")

          ) {

            return "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1600&q=88";

          }



          if (

            categoryText.includes("concert") ||

            categoryText.includes("music") ||

            categoryText.includes("festival")

          ) {

            return "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1600&q=88";

          }



          if (

            categoryText.includes("sport") ||

            categoryText.includes("hockey") ||

            categoryText.includes("basketball") ||

            categoryText.includes("football") ||

            categoryText.includes("soccer") ||

            categoryText.includes("baseball") ||

            categoryText.includes("mma") ||

            categoryText.includes("ufc")

          ) {

            return "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1600&q=88";

          }



          if (

            categoryText.includes("convention") ||

            categoryText.includes("expo") ||

            categoryText.includes("comic") ||

            categoryText.includes("fan")

          ) {

            return "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1400&q=80";

          }



          return "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1400&q=80";

        }



        function formatClientDate(value) {

          if (!value) return "Date coming soon";

          const d = new Date(value);

          if (Number.isNaN(d.getTime())) return "Date coming soon";

          return d.toLocaleString();

        }



        function renderClientGoing(event) {

          if (!HAS_CURRENT_PROFILE) {

            return "";

          }

          const isGoing = !!event.isGoing;
          const label = isGoing ? "I'm Going" : "Going";

          return \`

            <form method="POST" action="/events/\${escapeUnsafe(event.id)}/save" class="js-save-form" data-event-id="\${escapeUnsafe(event.id)}" style="margin:0;">

              <button class="btn btnGhost js-save-btn\${isGoing ? " is-going" : ""}" data-event-id="\${escapeUnsafe(event.id)}" type="submit">\${label}</button>

            </form>

          \`;

        }



        function renderClientCard(event) {

          const image = event.imageUrl || pickFallbackImage(event);

          const when = formatClientDate(event.startAt);

          const categoryText = getClientCategory(event);

          const shortDescription = getClientDescription(event);

          const badge = event.urgencyBadge || getClientBadge(event);



          return \`

            <div class="event-card js-event-card">

              <div class="event-media" style="background-image:

                linear-gradient(180deg, rgba(6,8,14,.06), rgba(6,8,14,.18) 22%, rgba(3,5,10,.62) 60%, rgba(0,0,0,.94)),

                url('\${escapeUnsafe(image)}');"></div>



              <div class="event-card-noise"></div>

              <div class="event-card-glow"></div>

              <div class="event-card-edge"></div>



              <div class="event-content">

                <div class="event-topline">

                  <div class="event-pill-stack">

                    <span class="event-pill">\${escapeUnsafe(categoryText || "Event")}</span>

                    <span class="event-pill event-pill-urgency">\${escapeUnsafe(badge)}</span>

                  </div>

                  \${event.priceText ? \`<span class="event-pill event-pill-soft">\${escapeUnsafe(event.priceText)}</span>\` : ""}

                </div>



                <h3 class="event-title">\${escapeUnsafe(event.title || "Untitled Event")}</h3>



                <div class="event-copy muted">

                  \${escapeUnsafe(shortDescription)}

                </div>



                <div class="event-divider"></div>



                <div class="event-meta">

                  <div class="event-meta-row">

                    <span class="event-meta-label">When</span>

                    <span class="event-meta-value">\${escapeUnsafe(when)}</span>

                  </div>

                  <div class="event-meta-row">

                    <span class="event-meta-label">Where</span>

                    <span class="event-meta-value">\${escapeUnsafe(event.venueName || event.address || event.city || "Location coming soon")}</span>

                  </div>

                  \${event.city ? \`

                    <div class="event-meta-row">

                      <span class="event-meta-label">City</span>

                      <span class="event-meta-value">\${escapeUnsafe(event.city)}</span>

                    </div>

                  \` : ""}

                </div>



                <div class="event-actions-primary">

                  <a class="btn btnLuxury" href="/events/view/\${escapeUnsafe(event.id)}">Open Event</a>

                  \${event.ticketUrl ? \`<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="\${escapeUnsafe(event.ticketUrl)}">Tickets</a>\` : ""}

                </div>



                <div class="event-actions-secondary">

                  \${renderClientGoing(event)}

                </div>

              </div>

            </div>

          \`;

        }



        function renderClientReel(event) {

          const image = event.imageUrl || pickFallbackImage(event);

          const when = formatClientDate(event.startAt);

          const categoryText = getClientCategory(event);

          const shortDescription = getClientDescription(event);

          const badge = event.urgencyBadge || getClientBadge(event);



          return \`

            <section class="reel-item js-reel-item">

              <div class="reel-bg" style="background-image:

                linear-gradient(180deg, rgba(6,8,14,.12), rgba(6,8,14,.18) 18%, rgba(3,5,10,.50) 48%, rgba(0,0,0,.96)),

                url('\${escapeUnsafe(image)}');"></div>



              <div class="reel-noise"></div>

              <div class="reel-glow"></div>



              <div class="reel-content">

                <div class="reel-top">

                  <div class="event-pill-stack">

                    <span class="event-pill">\${escapeUnsafe(categoryText)}</span>

                    <span class="event-pill event-pill-urgency">\${escapeUnsafe(badge)}</span>

                  </div>

                  \${event.priceText ? \`<span class="event-pill event-pill-soft">\${escapeUnsafe(event.priceText)}</span>\` : ""}

                </div>



                <div class="reel-body">

                  <h2 class="reel-title">\${escapeUnsafe(event.title)}</h2>

                  <div class="reel-sub">\${escapeUnsafe(shortDescription)}</div>



                  <div class="reel-meta">

                    <div>\${escapeUnsafe(when)}</div>

                    <div>\${escapeUnsafe(event.venueName || event.city || "Location coming soon")}</div>

                  </div>



                  <div class="reel-actions">

                    <a class="btn btnLuxury" href="/events/view/\${escapeUnsafe(event.id)}">Open Event</a>

                    \${event.ticketUrl ? \`<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="\${escapeUnsafe(event.ticketUrl)}">Tickets</a>\` : ""}

                    \${renderClientGoing(event)}

                  </div>

                </div>

              </div>

            </section>

          \`;

        }



        function bindCardMotion(scope) {

          const root = scope || document;

          const cards = root.querySelectorAll(".js-event-card");



          cards.forEach((card) => {

            if (card.dataset.motionBound === "1") return;

            card.dataset.motionBound = "1";



            card.addEventListener("mousemove", (e) => {

              const rect = card.getBoundingClientRect();

              const x = ((e.clientX - rect.left) / rect.width) * 100;

              const y = ((e.clientY - rect.top) / rect.height) * 100;

              card.style.setProperty("--mx", x + "%");

              card.style.setProperty("--my", y + "%");

            });



            const lightCard = (clientX, clientY) => {

              const rect = card.getBoundingClientRect();

              const x = ((clientX - rect.left) / rect.width) * 100;

              const y = ((clientY - rect.top) / rect.height) * 100;

              card.style.setProperty("--mx", Math.max(0, Math.min(100, x)) + "%");

              card.style.setProperty("--my", Math.max(0, Math.min(100, y)) + "%");

              card.classList.add("is-touch-active");

            };



            card.addEventListener("pointerdown", (e) => {

              lightCard(e.clientX, e.clientY);

            }, { passive: true });



            card.addEventListener("pointermove", (e) => {

              if (!IS_MOBILE_FEED && card.classList.contains("is-touch-active")) lightCard(e.clientX, e.clientY);

            }, { passive: true });



            card.addEventListener("pointerup", () => {

              setTimeout(() => card.classList.remove("is-touch-active"), 170);

            }, { passive: true });



            card.addEventListener("pointercancel", () => {

              card.classList.remove("is-touch-active");

            }, { passive: true });



            card.addEventListener("touchstart", (e) => {

              const touch = e.touches && e.touches[0];

              if (touch) lightCard(touch.clientX, touch.clientY);

            }, { passive: true });



            card.addEventListener("touchmove", (e) => {

              if (!IS_MOBILE_FEED) {
                const touch = e.touches && e.touches[0];
                if (touch) lightCard(touch.clientX, touch.clientY);
              }

            }, { passive: true });



            card.addEventListener("touchend", () => {

              setTimeout(() => card.classList.remove("is-touch-active"), 170);

            }, { passive: true });



            card.addEventListener("touchcancel", () => {

              card.classList.remove("is-touch-active");

            }, { passive: true });

          });

        }



        function bindCardReveal(scope) {

          const root = scope || document;

          const cards = root.querySelectorAll(".js-event-card");



          const observer = new IntersectionObserver((entries) => {

            entries.forEach((entry) => {

              if (entry.isIntersecting) {

                entry.target.classList.add("is-revealed");

                observer.unobserve(entry.target);

              }

            });

          }, { threshold: 0.12 });



          cards.forEach((card) => {

            if (card.dataset.revealBound === "1") return;

            card.dataset.revealBound = "1";

            observer.observe(card);

          });

        }



        function bindGoingActions(scope) {

          const root = scope || document;
          const bindNode = root === document ? document.body : root;

          if (bindNode.dataset.goingBound === "1") return;
          bindNode.dataset.goingBound = "1";

          bindNode.addEventListener("submit", async (e) => {
            const form = e.target.closest(".js-save-form");
            if (!form) return;

            e.preventDefault();
            if (form.dataset.submitting === "1") return;

            const btn = form.querySelector(".js-save-btn");
            const eventId = form.dataset.eventId || (btn && btn.dataset.eventId) || "";
            if (!btn || !eventId) return;

            form.dataset.submitting = "1";
            btn.disabled = true;
            btn.classList.add("is-animating");

            try {
              const res = await fetch(form.action, {
                method: "POST",
                headers: { "X-Requested-With": "XMLHttpRequest" },
                credentials: "same-origin",
              });

              if (res.status === 401) {
                window.location.href = "/auth";
                return;
              }

              const data = await res.json();
              if (!res.ok || !data.ok) throw new Error(data.error || "Going toggle failed");

              const isGoing = !!data.going;
              document.querySelectorAll(\`.js-save-form[data-event-id="\${CSS.escape(eventId)}"] .js-save-btn\`).forEach((node) => {
                node.textContent = isGoing ? "I'm Going" : "Going";
                node.classList.toggle("is-going", isGoing);
              });
            } catch (err) {
              console.error(err);
            } finally {
              btn.disabled = false;
              btn.classList.remove("is-animating");
              form.dataset.submitting = "0";
            }
          });

        }



        function setupReelActiveState() {

          const feed = document.getElementById("reelFeed");

          if (!feed || feed.dataset.activeBound === "1") return;

          feed.dataset.activeBound = "1";



          function refreshActive() {

            const all = Array.from(feed.querySelectorAll(".js-reel-item"));

            let best = null;

            let bestDelta = Infinity;



            all.forEach((item) => {

              const rect = item.getBoundingClientRect();

              const center = rect.top + rect.height / 2;

              const delta = Math.abs(center - window.innerHeight / 2);



              if (delta < bestDelta) {

                bestDelta = delta;

                best = item;

              }

            });



            all.forEach((item) => item.classList.remove("is-active"));

            if (best) best.classList.add("is-active");

          }



          feed.addEventListener("scroll", () => {

            requestAnimationFrame(refreshActive);

          }, { passive: true });



          refreshActive();

          feed.refreshActive = refreshActive;

        }



        function enhance(scope) {

          bindCardMotion(scope);

          bindCardReveal(scope);

          bindGoingActions(scope);

        }



        function setupMainFeedInfinite() {

          const grid = document.getElementById("mainFeedGrid");

          const sentinel = document.getElementById("mainFeedSentinel");

          const loader = document.getElementById("mainFeedLoader");

          const end = document.getElementById("mainFeedEnd");



          if (!grid || !sentinel || !loader || !end) return;



          let page = 2;

          let loading = false;

          let hasMore = loader.style.display !== "none";



          async function loadMore() {

            if (loading || !hasMore) return;

            loading = true;

            loader.style.display = "block";



            try {

              const qs = new URLSearchParams({

                page: String(page),

                limit: String(FEED_PAGE_SIZE),

                city: "",
                category,
              });
              if (IS_HOT_NEARBY_MODE && HAS_LIVE_LOCATION) {
                qs.set("lat", String(LIVE_LAT));
                qs.set("lng", String(LIVE_LNG));
                qs.set("radiusKm", String(RADIUS_KM || 85));
              }



              const res = await fetch("/events/feed?" + qs.toString(), {

                cache: "no-store",

              });



              const data = await res.json();



              if (!res.ok || !data.ok) throw new Error(data.error || "Could not load more events");



              const items = Array.isArray(data.items) ? data.items : [];

              if (!items.length) {

                hasMore = false;

                loader.style.display = "none";

                end.style.display = "block";

                return;

              }



              const wrapper = document.createElement("div");

              wrapper.innerHTML = items.map(renderClientCard).join("");

              Array.from(wrapper.children).forEach((node) => grid.appendChild(node));

              enhance(wrapper);



              page += 1;

              hasMore = !!data.hasMore;



              if (!hasMore) {

                loader.style.display = "none";

                end.style.display = "block";

              }

            } catch (err) {

              console.error(err);

              loader.innerHTML = "Could not load more events";

              hasMore = false;

              end.style.display = "none";

            } finally {

              loading = false;

            }

          }



          const observer = new IntersectionObserver((entries) => {

            const first = entries[0];

            if (first && first.isIntersecting) loadMore();

          }, { rootMargin: "300px 0px" });



          observer.observe(sentinel);

        }



        function setupCityInfinite(cityName) {

          const grid = document.getElementById("cityGrid-" + cityName);

          const sentinel = document.getElementById("citySentinel-" + cityName);

          const loader = document.getElementById("cityLoader-" + cityName);

          const end = document.getElementById("cityEnd-" + cityName);



          if (!grid || !sentinel || !loader || !end) return;



          let page = 2;

          let loading = false;

          let hasMore = loader.style.display !== "none";



          async function loadMore() {

            if (loading || !hasMore) return;

            loading = true;

            loader.style.display = "block";



            try {

              const qs = new URLSearchParams({

                page: String(page),

                limit: String(FEED_PAGE_SIZE),

                city: cityName,
                category,
              });
              if (IS_HOT_NEARBY_MODE && HAS_LIVE_LOCATION) {
                qs.set("lat", String(LIVE_LAT));
                qs.set("lng", String(LIVE_LNG));
                qs.set("radiusKm", String(RADIUS_KM || 85));
              }



              const res = await fetch("/events/feed?" + qs.toString(), {

                cache: "no-store",

              });



              const data = await res.json();



              if (!res.ok || !data.ok) throw new Error(data.error || "Could not load more events");



              const items = Array.isArray(data.items) ? data.items : [];

              if (!items.length) {

                hasMore = false;

                loader.style.display = "none";

                end.style.display = "block";

                return;

              }



              const wrapper = document.createElement("div");

              wrapper.innerHTML = items.map(renderClientCard).join("");

              Array.from(wrapper.children).forEach((node) => grid.appendChild(node));

              enhance(wrapper);



              page += 1;

              hasMore = !!data.hasMore;



              if (!hasMore) {

                loader.style.display = "none";

                end.style.display = "block";

              }

            } catch (err) {

              console.error(err);

              loader.innerHTML = "Could not load more events";

              hasMore = false;

              end.style.display = "none";

            } finally {

              loading = false;

            }

          }



          const observer = new IntersectionObserver((entries) => {

            const first = entries[0];

            if (first && first.isIntersecting) loadMore();

          }, { rootMargin: "300px 0px" });



          observer.observe(sentinel);

        }




        function setupMobileFeedInfinite() {
          const grid = document.getElementById("mobileFeedGrid");
          const loader = document.getElementById("mobileFeedLoader");
          const end = document.getElementById("mobileFeedEnd");
          const button = document.getElementById("mobileLoadMoreBtn");

          if (!grid || !loader || !end) return;

          const PRELOAD_AHEAD_PAGES = 8;
          const CACHE_TTL_MS = 1000 * 60 * 60 * 8;
          const MAX_STORED_PAGES = 80;
          const feedBase = {
            limit: String(FEED_PAGE_SIZE),
            city: "",
            category: category || "all"
          };
          if (IS_HOT_NEARBY_MODE && HAS_LIVE_LOCATION) {
            feedBase.lat = String(LIVE_LAT);
            feedBase.lng = String(LIVE_LNG);
            feedBase.radiusKm = String(RADIUS_KM || 85);
          }

          const feedCacheKey = "tapzy:events:mobile-feed:" + [
            feedBase.category,
            feedBase.city,
            feedBase.lat || "",
            feedBase.lng || "",
            feedBase.radiusKm || ""
          ].join(":");

          let page = 2;
          let loading = false;
          let hasMore = loader.dataset.hasMore === "1";
          let scrollTicking = false;
          let preloadRunning = false;
          let lastLoadAt = 0;
          let cachedPages = loadStoredFeedCache();

          function readStoredJson(key) {
            try {
              const raw = window.localStorage && window.localStorage.getItem(key);
              return raw ? JSON.parse(raw) : null;
            } catch (_) {
              return null;
            }
          }

          function writeStoredJson(key, value) {
            try {
              if (!window.localStorage) return;
              window.localStorage.setItem(key, JSON.stringify(value));
            } catch (_) {}
          }

          function loadStoredFeedCache() {
            const cached = readStoredJson(feedCacheKey);
            if (!cached || !cached.pages || !cached.savedAt) return {};
            if (Date.now() - Number(cached.savedAt) > CACHE_TTL_MS) return {};
            return cached.pages || {};
          }

          function saveStoredFeedCache() {
            const pageNumbers = Object.keys(cachedPages).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
            while (pageNumbers.length > MAX_STORED_PAGES) {
              const remove = pageNumbers.shift();
              delete cachedPages[String(remove)];
            }
            writeStoredJson(feedCacheKey, { savedAt: Date.now(), pages: cachedPages });
          }

          function cacheEventImages(items) {
            if (!Array.isArray(items) || !("caches" in window)) return;
            const urls = items
              .map((event) => event && (event.imageUrl || pickFallbackImage(event)))
              .filter(Boolean)
              .slice(0, 24);
            if (!urls.length) return;
            window.caches.open("tapzy-events-images-v1").then((cache) => {
              urls.forEach((url, index) => {
                window.setTimeout(() => {
                  fetch(url, { mode: "no-cors", cache: "force-cache" })
                    .then((res) => cache.put(url, res.clone()).catch(() => null))
                    .catch(() => null);
                }, index * 80);
              });
            }).catch(() => null);
          }

          function setPageCache(pageNumber, data) {
            if (!data || !Array.isArray(data.items)) return;
            cachedPages[String(pageNumber)] = {
              items: data.items,
              hasMore: !!data.hasMore,
              total: data.total || 0,
              cachedAt: Date.now()
            };
            saveStoredFeedCache();
            cacheEventImages(data.items);
          }

          function getPageCache(pageNumber) {
            const cached = cachedPages[String(pageNumber)];
            if (!cached || !Array.isArray(cached.items)) return null;
            return cached;
          }

          function buildFeedUrl(pageNumber) {
            const qs = new URLSearchParams(feedBase);
            qs.set("page", String(pageNumber));
            return "/events/feed?" + qs.toString();
          }

          async function fetchPage(pageNumber, preferCache) {
            const cached = getPageCache(pageNumber);
            if (preferCache && cached) return cached;

            try {
              const res = await fetch(buildFeedUrl(pageNumber), {
                cache: "force-cache",
                headers: { "X-Requested-With": "XMLHttpRequest" }
              });
              const data = await res.json();
              if (!res.ok || !data.ok) throw new Error(data.error || "Could not load more events");
              setPageCache(pageNumber, data);
              return data;
            } catch (err) {
              if (cached) return cached;
              throw err;
            }
          }

          function setLoading(value) {
            loading = value;
            loader.style.display = value && hasMore ? "block" : "none";
          }

          function syncFooter() {
            loader.style.display = hasMore ? "block" : "none";
            end.style.display = hasMore ? "none" : "block";
            if (button) button.style.display = "none";
          }

          function getBottomDistance() {
            const doc = document.documentElement;
            const body = document.body;
            const scrollTop = window.pageYOffset || doc.scrollTop || body.scrollTop || 0;
            const height = Math.max(body.scrollHeight, doc.scrollHeight, body.offsetHeight, doc.offsetHeight);
            return height - (scrollTop + window.innerHeight);
          }

          function shouldLoadSoon() {
            return hasMore && !loading && getBottomDistance() < 1800;
          }

          function appendItems(items) {
            const wrapper = document.createElement("div");
            wrapper.innerHTML = items.map(renderClientCard).join("");
            const children = Array.from(wrapper.children);
            const frag = document.createDocumentFragment();
            children.forEach((node) => frag.appendChild(node));
            grid.appendChild(frag);
            enhance(wrapper);
          }

          async function preloadPages(fromPage) {
            if (preloadRunning || !hasMore) return;
            preloadRunning = true;
            try {
              let preloadPage = fromPage;
              for (let i = 0; i < PRELOAD_AHEAD_PAGES; i += 1) {
                if (getPageCache(preloadPage)) {
                  const cached = getPageCache(preloadPage);
                  if (!cached.hasMore) break;
                  preloadPage += 1;
                  continue;
                }
                const data = await fetchPage(preloadPage, false);
                if (!data || !data.hasMore) break;
                preloadPage += 1;
                await new Promise((resolve) => window.setTimeout(resolve, 120));
              }
            } catch (err) {
              console.warn("Tapzy event preload paused", err);
            } finally {
              preloadRunning = false;
            }
          }

          async function loadMore(source) {
            if (loading || !hasMore) return;
            if (Date.now() - lastLoadAt < 220) return;
            lastLoadAt = Date.now();
            setLoading(true);

            try {
              const data = await fetchPage(page, true);
              const items = Array.isArray(data.items) ? data.items : [];

              if (!items.length) {
                hasMore = false;
                syncFooter();
                return;
              }

              appendItems(items);
              page += 1;
              hasMore = !!data.hasMore;
              syncFooter();

              // Keep the next pages ready before the user reaches them.
              window.setTimeout(() => preloadPages(page), 80);

              // If cached/offline pages were appended and we are still near the bottom, keep flowing.
              if (hasMore && shouldLoadSoon()) {
                window.setTimeout(() => loadMore("chain"), 260);
              }
            } catch (err) {
              console.error(err);
              hasMore = false;
              loader.style.display = "none";
              end.style.display = "block";
              end.textContent = navigator.onLine === false
                ? "Offline cache ended. Reconnect to refresh events."
                : "Could not load more events. Refresh and try again.";
            } finally {
              loading = false;
              if (hasMore) loader.style.display = "block";
            }
          }

          function scheduleCheck() {
            if (!hasMore || loading || scrollTicking) return;
            scrollTicking = true;
            window.requestAnimationFrame(() => {
              scrollTicking = false;
              if (shouldLoadSoon()) loadMore("scroll");
            });
          }

          window.addEventListener("scroll", scheduleCheck, { passive: true });
          window.addEventListener("resize", scheduleCheck, { passive: true });
          window.addEventListener("orientationchange", () => window.setTimeout(scheduleCheck, 350), { passive: true });
          window.addEventListener("online", () => preloadPages(page), { passive: true });

          if (button) button.addEventListener("click", () => loadMore("button"));

          syncFooter();
          window.setTimeout(() => preloadPages(page), 250);
          window.setTimeout(scheduleCheck, 500);
        }

        function requestTapzyLocation(ev) {
          if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
          const status = document.getElementById("locationPromptStatus");
          const notice = document.getElementById("liveLocationNotice");
          const button = document.getElementById("enableLocationBtn");

          if (button) {
            button.disabled = true;
            button.classList.add("is-loading");
          }

          function unlockButton() {
            if (button) {
              button.disabled = false;
              button.classList.remove("is-loading");
            }
          }

          if (!window.isSecureContext && location.hostname !== "localhost") {
            if (status) status.textContent = "Location needs HTTPS. Open Tapzy from https://tapzy.org and try again.";
            if (notice) notice.textContent = "Location permission needs a secure Tapzy page.";
            unlockButton();
            return false;
          }

          if (!navigator.geolocation) {
            if (status) status.textContent = "This browser does not support location. Try Safari, Chrome, or enabling location in settings.";
            if (notice) notice.textContent = "Location is not available in this browser.";
            unlockButton();
            return false;
          }

          if (status) status.textContent = "Requesting location permission… tap Allow when your phone asks.";
          if (notice) notice.textContent = "Waiting for your location permission…";

          navigator.geolocation.getCurrentPosition((pos) => {
            if (status) status.textContent = "Location enabled. Loading nearby events…";
            const url = new URL(window.location.href);
            url.searchParams.set("lat", String(pos.coords.latitude));
            url.searchParams.set("lng", String(pos.coords.longitude));
            url.searchParams.set("radiusKm", String(RADIUS_KM || 85));
            window.location.assign(url.toString());
          }, (err) => {
            unlockButton();
            let message = "Location is off. Turn it on for this browser, then tap Enable Location again.";
            if (err && err.code === 1) message = "Location permission was blocked. Enable location for Safari/Chrome in your phone settings, then tap again.";
            if (err && err.code === 2) message = "Your phone could not find your location yet. Check GPS/Wi‑Fi and tap again.";
            if (err && err.code === 3) message = "Location request timed out. Tap Enable Location again.";
            if (status) status.textContent = message;
            if (notice) notice.textContent = message;
          }, { enableHighAccuracy: true, timeout: 18000, maximumAge: 60000 });
          return false;
        }

        window.requestTapzyLocation = requestTapzyLocation;

        function setupLiveLocationGate() {
          const button = document.getElementById("enableLocationBtn");
          const status = document.getElementById("locationPromptStatus");
          const notice = document.getElementById("liveLocationNotice");

          if (!IS_HOT_NEARBY_MODE) {
            if (notice) notice.textContent = "";
            return;
          }

          if (HAS_LIVE_LOCATION) {
            if (notice && USING_CLOSEST_AREA_FALLBACK && CLOSEST_AREA_NAME) {
              notice.textContent = "No local events yet — automatically showing the closest active area: " + CLOSEST_AREA_NAME + ".";
            }
            return;
          }

          if (button) {
            button.addEventListener("click", requestTapzyLocation);
            button.addEventListener("touchend", requestTapzyLocation, { passive:false });
            button.addEventListener("pointerup", requestTapzyLocation);
          }

          if (status) {
            status.textContent = "Tap Enable Location and allow permission to unlock nearby events.";
          }
        }

        function setupReelInfinite() {

          const feed = document.getElementById("reelFeed");

          const sentinel = document.getElementById("reelSentinel");

          const loader = document.getElementById("reelLoader");

          const end = document.getElementById("reelEnd");



          if (!feed || !sentinel || !loader || !end) return;



          let page = 2;

          let loading = false;

          let hasMore = loader.style.display !== "none";



          async function loadMore() {

            if (loading || !hasMore) return;

            loading = true;

            loader.style.display = "block";



            try {

              const qs = new URLSearchParams({

                page: String(page),

                limit: String(FEED_PAGE_SIZE),

                city: "",
                category,
              });
              if (IS_HOT_NEARBY_MODE && HAS_LIVE_LOCATION) {
                qs.set("lat", String(LIVE_LAT));
                qs.set("lng", String(LIVE_LNG));
                qs.set("radiusKm", String(RADIUS_KM || 85));
              }



              const res = await fetch("/events/feed?" + qs.toString(), {

                cache: "no-store",

              });



              const data = await res.json();



              if (!res.ok || !data.ok) throw new Error(data.error || "Could not load more events");



              const items = Array.isArray(data.items) ? data.items : [];

              if (!items.length) {

                hasMore = false;

                loader.style.display = "none";

                end.style.display = "block";

                return;

              }



              const html = items.map(renderClientReel).join("");

              sentinel.insertAdjacentHTML("beforebegin", html);

              bindGoingActions(feed);



              if (typeof feed.refreshActive === "function") {

                requestAnimationFrame(feed.refreshActive);

              }



              page += 1;

              hasMore = !!data.hasMore;



              if (!hasMore) {

                loader.style.display = "none";

                end.style.display = "block";

              }

            } catch (err) {

              console.error(err);

              loader.innerHTML = "Could not load more events";

              hasMore = false;

              end.style.display = "none";

            } finally {

              loading = false;

            }

          }



          const observer = new IntersectionObserver((entries) => {

            const first = entries[0];

            if (first && first.isIntersecting) loadMore();

          }, { rootMargin: "600px 0px" });



          observer.observe(sentinel);

        }



        enhance(document);

        setupLiveLocationGate();
        if (IS_MOBILE_FEED) {
          setupMobileFeedInfinite();
        } else {
          setupMainFeedInfinite();
          cities.forEach(setupCityInfinite);
        }

      })();
</script>`;
};
