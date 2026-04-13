module.exports = function renderEventsClientScript({ FEED_PAGE_SIZE, category, citySections, currentProfile }) {
  return `
<script>
(function () {

        const FEED_PAGE_SIZE = ${JSON.stringify(FEED_PAGE_SIZE)};

        const category = ${JSON.stringify(category)};

        const cities = ${JSON.stringify(citySections.map((s) => s.cityName))};

        const HAS_CURRENT_PROFILE = ${JSON.stringify(!!currentProfile)};



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

            if (haystack.includes("nightlife") || haystack.includes("party") || haystack.includes("club") || haystack.includes("dj") || haystack.includes("rave")) return "Nightlife";

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

            return "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1400&q=80";

          }



          if (

            categoryText.includes("concert") ||

            categoryText.includes("music") ||

            categoryText.includes("festival")

          ) {

            return "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1400&q=80";

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

            return "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1400&q=80";

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

            return '<a class="btn btnGhost" href="/auth">Sign in to save</a>';

          }



         const label = event.isGoing ? "Goingd ✓" : "Going";

          return \`

            <form method="POST" action="/events/\${escapeUnsafe(event.id)}/save" class="js-save-form" style="margin:0;">

              <button class="btn btnGhost js-save-btn" type="submit">\${label}</button>

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



            card.addEventListener("touchstart", () => {

              card.classList.add("is-touch-active");

            }, { passive: true });



            card.addEventListener("touchend", () => {

              setTimeout(() => card.classList.remove("is-touch-active"), 120);

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

          const forms = root.querySelectorAll(".js-save-form");



          forms.forEach((form) => {

            if (form.dataset.saveBound === "1") return;

            form.dataset.saveBound = "1";



            form.addEventListener("submit", (e) => {

              const btn = form.querySelector(".js-save-btn");

              if (!btn || form.dataset.submitting === "1") return;

              form.dataset.submitting = "1";

              e.preventDefault();

              btn.classList.add("is-animating");

              setTimeout(() => form.submit(), 180);

            });

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

        setupMainFeedInfinite();

        cities.forEach(setupCityInfinite);

        setupReelActiveState();

        setupReelInfinite();

      })();
</script>`;
};
