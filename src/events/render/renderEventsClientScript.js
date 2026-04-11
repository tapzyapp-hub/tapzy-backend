module.exports = function renderEventsClientScript({ FEED_PAGE_SIZE, category, city, citySections, currentProfile }) {
  return `
<script>
(function () {
  const FEED_PAGE_SIZE = ${JSON.stringify(FEED_PAGE_SIZE)};
  const category = ${JSON.stringify(category || "")};
  const activeCity = ${JSON.stringify(city || "")};
  const cities = ${JSON.stringify(citySections.map((s) => s.cityName))};
  const HAS_CURRENT_PROFILE = ${JSON.stringify(!!currentProfile)};

  function escapeUnsafe(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getClientCategory(event) {
    const raw = String(event.category || "").trim();
    const value = raw.toLowerCase();

    if (!raw || value === "undefined" || value === "miscellaneous" || value === "other") {
      const haystack = String([event.title || "", event.description || "", event.venueName || ""].join(" ")).toLowerCase();
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
    if (categoryText.includes("nightlife") || categoryText.includes("party") || categoryText.includes("club") || categoryText.includes("dj")) {
      return "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1400&q=80";
    }
    if (categoryText.includes("concert") || categoryText.includes("music") || categoryText.includes("festival")) {
      return "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1400&q=80";
    }
    if (categoryText.includes("sport") || categoryText.includes("hockey") || categoryText.includes("basketball") || categoryText.includes("football") || categoryText.includes("soccer") || categoryText.includes("baseball") || categoryText.includes("mma") || categoryText.includes("ufc")) {
      return "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1400&q=80";
    }
    if (categoryText.includes("convention") || categoryText.includes("expo") || categoryText.includes("comic") || categoryText.includes("fan")) {
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
    if (!HAS_CURRENT_PROFILE) return "";
    const count = Number(event.goingCount || 0);
    return [
      '<button class="btn btnGhost js-going-btn ' + (event.isGoing ? 'is-active' : '') + '" type="button" data-going-id="' + escapeUnsafe(event.id) + '">',
      (event.isGoing ? 'Going ✓' : 'I\'m Going') + (count ? ' • ' + count : ''),
      '</button>'
    ].join('');
  }


  function getPreviewInitials(profile) {
    const source = String((profile && (profile.name || profile.username)) || '?').trim();
    if (!source) return '?';
    const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
    return (parts.map((part) => part.charAt(0).toUpperCase()).join('') || source.charAt(0).toUpperCase());
  }

  function renderClientGoingPreview(event) {
    const count = Number(event.goingCount || 0);
    const profiles = Array.isArray(event.goingPreviewProfiles) ? event.goingPreviewProfiles : [];
    if (!count) {
      return '<div class="event-going-preview js-going-preview" data-going-preview-id="' + escapeUnsafe(event.id) + '" style="display:none;"></div>';
    }

    const visible = profiles.slice(0, 3).map((profile) => {
      const username = String((profile && profile.username) || '').trim();
      const label = escapeUnsafe((profile && (profile.name || username)) || 'Tapzy member');
      const photo = String((profile && profile.photo) || '').trim();
      const href = username ? '/u/' + encodeURIComponent(username) : '#';
      return [
        '<a class="event-going-avatar" href="' + escapeUnsafe(href) + '" aria-label="' + label + '" title="' + label + '">',
        photo ? '<img src="' + escapeUnsafe(photo) + '" alt="' + label + '" loading="lazy" />' : '<span>' + escapeUnsafe(getPreviewInitials(profile)) + '</span>',
        '</a>'
      ].join('');
    }).join('');

    const extra = Math.max(0, count - Math.min(3, profiles.length));

    return [
      '<div class="event-going-preview js-going-preview" data-going-preview-id="' + escapeUnsafe(event.id) + '">',
      '<div class="event-going-avatars">',
      visible,
      extra ? '<div class="event-going-avatar event-going-avatar-more">+' + extra + '</div>' : '',
      '</div>',
      '<div class="event-going-copy">' + count + ' ' + (count === 1 ? 'person' : 'people') + ' going</div>',
      '</div>'
    ].join('');
  }

  function renderClientCard(event) {
    const image = event.imageUrl || pickFallbackImage(event);
    const when = formatClientDate(event.startAt);
    const categoryText = getClientCategory(event);
    const shortDescription = getClientDescription(event);
    const badge = event.urgencyBadge || getClientBadge(event);

    return [
      '<div class="event-card js-event-card">',
        '<div class="event-media" style="background-image: linear-gradient(180deg, rgba(6,8,14,.06), rgba(6,8,14,.18) 22%, rgba(3,5,10,.62) 60%, rgba(0,0,0,.94)), url(\'' + escapeUnsafe(image) + '\');"></div>',
        '<div class="event-card-noise"></div>',
        '<div class="event-card-glow"></div>',
        '<div class="event-card-edge"></div>',
        '<div class="event-content">',
          '<div class="event-topline">',
            '<div class="event-pill-stack">',
              '<span class="event-pill">' + escapeUnsafe(categoryText || 'Event') + '</span>',
              '<span class="event-pill event-pill-urgency">' + escapeUnsafe(badge) + '</span>',
            '</div>',
            event.priceText ? '<span class="event-pill event-pill-soft">' + escapeUnsafe(event.priceText) + '</span>' : '',
          '</div>',
          '<h3 class="event-title">' + escapeUnsafe(event.title || 'Untitled Event') + '</h3>',
          '<div class="event-copy muted">' + escapeUnsafe(shortDescription) + '</div>',
          '<div class="event-divider"></div>',
          '<div class="event-meta">',
            '<div class="event-meta-row"><span class="event-meta-label">When</span><span class="event-meta-value">' + escapeUnsafe(when) + '</span></div>',
            '<div class="event-meta-row"><span class="event-meta-label">Where</span><span class="event-meta-value">' + escapeUnsafe(event.venueName || event.address || event.city || 'Location coming soon') + '</span></div>',
            event.city ? '<div class="event-meta-row"><span class="event-meta-label">City</span><span class="event-meta-value">' + escapeUnsafe(event.city) + '</span></div>' : '',
          '</div>',
          '<div class="event-actions-primary">',
            '<a class="btn btnLuxury" href="/events/view/' + escapeUnsafe(event.id) + '">Open Event</a>',
            event.ticketUrl ? '<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="' + escapeUnsafe(event.ticketUrl) + '">Tickets</a>' : '',
          '</div>',
          renderClientGoingPreview(event),
          HAS_CURRENT_PROFILE ? '<div class="event-actions-secondary">' + renderClientGoing(event) + '</div>' : '',
        '</div>',
      '</div>'
    ].join('');
  }

  function renderClientReel(event) {
    const image = event.imageUrl || pickFallbackImage(event);
    const when = formatClientDate(event.startAt);
    const categoryText = getClientCategory(event);
    const shortDescription = getClientDescription(event);
    const badge = event.urgencyBadge || getClientBadge(event);

    return [
      '<section class="reel-item js-reel-item js-event-card">',
        '<div class="reel-bg" style="background-image: linear-gradient(180deg, rgba(6,8,14,.12), rgba(6,8,14,.18) 18%, rgba(3,5,10,.50) 48%, rgba(0,0,0,.96)), url(\'' + escapeUnsafe(image) + '\');"></div>',
        '<div class="reel-noise"></div>',
        '<div class="reel-glow"></div>',
        '<div class="reel-content">',
          '<div class="reel-top">',
            '<div class="event-pill-stack reel-pill-stack">',
              '<span class="event-pill">' + escapeUnsafe(categoryText) + '</span>',
              '<span class="event-pill event-pill-urgency">' + escapeUnsafe(badge) + '</span>',
            '</div>',
          '</div>',
          '<div class="reel-body">',
            '<h2 class="reel-title">' + escapeUnsafe(event.title || 'Untitled Event') + '</h2>',
            '<div class="reel-sub">' + escapeUnsafe(shortDescription) + '</div>',
            '<div class="reel-meta">',
              '<div><strong>When</strong><br>' + escapeUnsafe(when) + '</div>',
              '<div><strong>Where</strong><br>' + escapeUnsafe(event.venueName || event.address || event.city || 'Location coming soon') + '</div>',
              event.city ? '<div><strong>City</strong><br>' + escapeUnsafe(event.city) + '</div>' : '',
            '</div>',
            '<div class="reel-actions">',
              '<a class="btn btnLuxury" href="/events/view/' + escapeUnsafe(event.id) + '">Open Event</a>',
              event.ticketUrl ? '<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="' + escapeUnsafe(event.ticketUrl) + '">Tickets</a>' : '<div></div>',
            '</div>',
            renderClientGoingPreview(event),
            HAS_CURRENT_PROFILE ? '<div class="event-actions-secondary" style="margin-top:12px;">' + renderClientGoing(event) + '</div>' : '',
          '</div>',
        '</div>',
      '</section>'
    ].join('');
  }

  function setSpotGlowPosition(card, clientX, clientY) {
    const rect = card.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mx', x + '%');
    card.style.setProperty('--my', y + '%');
  }

  function bindCardMotion(scope) {
    const root = scope || document;
    const cards = root.querySelectorAll('.js-event-card');

    cards.forEach((card) => {
      if (card.dataset.motionBound === '1') return;
      card.dataset.motionBound = '1';

      card.addEventListener('mousemove', (e) => {
        setSpotGlowPosition(card, e.clientX, e.clientY);
      });

      card.addEventListener('mouseenter', () => {
        card.classList.add('is-touch-active');
      });

      card.addEventListener('mouseleave', () => {
        card.classList.remove('is-touch-active');
      });

      card.addEventListener('touchstart', (e) => {
        const touch = e.touches && e.touches[0];
        if (touch) setSpotGlowPosition(card, touch.clientX, touch.clientY);
        card.classList.add('is-touch-active');
      }, { passive: true });

      card.addEventListener('touchmove', (e) => {
        const touch = e.touches && e.touches[0];
        if (touch) setSpotGlowPosition(card, touch.clientX, touch.clientY);
      }, { passive: true });

      card.addEventListener('touchend', () => {
        setTimeout(() => card.classList.remove('is-touch-active'), 180);
      }, { passive: true });

      card.addEventListener('touchcancel', () => {
        card.classList.remove('is-touch-active');
      }, { passive: true });
    });
  }

  function bindCardReveal(scope) {
    const root = scope || document;
    const cards = root.querySelectorAll('.js-event-card');
    const reelFeed = document.getElementById('reelFeed');

    const viewportObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          viewportObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    const reelObserver = reelFeed ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          reelObserver.unobserve(entry.target);
        }
      });
    }, { root: reelFeed, threshold: 0.12 }) : null;

    cards.forEach((card) => {
      if (card.dataset.revealBound === '1') return;
      card.dataset.revealBound = '1';
      if (reelObserver && card.classList.contains('js-reel-item')) {
        reelObserver.observe(card);
      } else {
        viewportObserver.observe(card);
      }
    });
  }

  function updateGoingButton(btn, going, count) {
    btn.classList.toggle('is-active', !!going);
    btn.textContent = (going ? 'Going ✓' : 'I\'m Going') + (count ? ' • ' + count : '');
  }


  function updateGoingPreview(node, data) {
    if (!node) return;
    const count = Number((data && data.goingCount) || 0);
    if (!count) {
      node.innerHTML = '';
      node.style.display = 'none';
      return;
    }
    node.style.display = '';
    node.innerHTML = renderClientGoingPreview({
      id: node.getAttribute('data-going-preview-id') || '',
      goingCount: count,
      goingPreviewProfiles: Array.isArray(data && data.goingPreviewProfiles) ? data.goingPreviewProfiles : []
    }).replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '');
  }

  function bindGoingActions(scope) {
    if (document.body.dataset.goingDelegated === '1') return;
    document.body.dataset.goingDelegated = '1';

    document.addEventListener('click', async function (e) {
      const btn = e.target && e.target.closest ? e.target.closest('.js-going-btn') : null;
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const eventId = btn.getAttribute('data-going-id');
      if (!eventId || btn.dataset.loading === '1') return;

      btn.dataset.loading = '1';
      btn.classList.add('is-animating');

      try {
        const res = await fetch('/events/' + encodeURIComponent(eventId) + '/going', {
          method: 'POST',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json'
          },
          credentials: 'same-origin'
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Going update failed');

        const nextCount = Number(data.goingCount || 0);
        document.querySelectorAll('.js-going-btn[data-going-id="' + eventId.replace(/"/g, '\"') + '"]').forEach((node) => {
          updateGoingButton(node, !!data.going, nextCount);
        });
        document.querySelectorAll('.js-going-preview[data-going-preview-id="' + eventId.replace(/"/g, '\"') + '"]').forEach((node) => {
          updateGoingPreview(node, data);
        });
      } catch (err) {
        console.error(err);
      } finally {
        btn.classList.remove('is-animating');
        delete btn.dataset.loading;
      }
    }, true);
  }

  function setupReelActiveState() {
    const feed = document.getElementById('reelFeed');
    if (!feed || feed.dataset.activeBound === '1') return;
    feed.dataset.activeBound = '1';

    function refreshActive() {
      const all = Array.from(feed.querySelectorAll('.js-reel-item'));
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

      all.forEach((item) => item.classList.remove('is-active'));
      if (best) best.classList.add('is-active');
    }

    feed.addEventListener('scroll', () => requestAnimationFrame(refreshActive), { passive: true });
    refreshActive();
    feed.refreshActive = refreshActive;
  }

  function enhance(scope) {
    bindCardMotion(scope);
    bindCardReveal(scope);
    bindGoingActions(scope);
  }

  function setupMainFeedInfinite() {
    const grid = document.getElementById('mainFeedGrid');
    const sentinel = document.getElementById('mainFeedSentinel');
    const loader = document.getElementById('mainFeedLoader');
    const end = document.getElementById('mainFeedEnd');
    if (!grid || !sentinel || !loader || !end) return;

    let page = 2;
    let loading = false;
    let hasMore = loader.style.display !== 'none';

    async function loadMore() {
      if (loading || !hasMore) return;
      loading = true;
      loader.style.display = 'block';

      try {
        const qs = new URLSearchParams({ page: String(page), limit: String(FEED_PAGE_SIZE), city: activeCity, category: category });
        const res = await fetch('/events/feed?' + qs.toString(), { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load more events');

        const items = Array.isArray(data.items) ? data.items : [];
        if (!items.length) {
          hasMore = false;
          loader.style.display = 'none';
          end.style.display = 'block';
          return;
        }

        const wrapper = document.createElement('div');
        wrapper.innerHTML = items.map(renderClientCard).join('');
        Array.from(wrapper.children).forEach((node) => grid.appendChild(node));
        enhance(wrapper);
        page += 1;
        hasMore = !!data.hasMore;
        loader.style.display = hasMore ? 'block' : 'none';
        end.style.display = hasMore ? 'none' : 'block';
      } catch (err) {
        console.error(err);
        loader.style.display = 'none';
      } finally {
        loading = false;
      }
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) loadMore();
      });
    }, { rootMargin: '800px 0px' });

    observer.observe(sentinel);
  }

  function setupCityInfinite(cityName) {
    const grid = document.getElementById('cityGrid-' + cityName);
    const sentinel = document.getElementById('citySentinel-' + cityName);
    const loader = document.getElementById('cityLoader-' + cityName);
    const end = document.getElementById('cityEnd-' + cityName);
    if (!grid || !sentinel || !loader || !end) return;

    let page = 2;
    let loading = false;
    let hasMore = loader.style.display !== 'none';

    async function loadMore() {
      if (loading || !hasMore) return;
      loading = true;
      loader.style.display = 'block';

      try {
        const qs = new URLSearchParams({ page: String(page), limit: String(FEED_PAGE_SIZE), city: cityName, category: category });
        const res = await fetch('/events/feed?' + qs.toString(), { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load more events');

        const items = Array.isArray(data.items) ? data.items : [];
        if (!items.length) {
          hasMore = false;
          loader.style.display = 'none';
          end.style.display = 'block';
          return;
        }

        const wrapper = document.createElement('div');
        wrapper.innerHTML = items.map(renderClientCard).join('');
        Array.from(wrapper.children).forEach((node) => grid.appendChild(node));
        enhance(wrapper);
        page += 1;
        hasMore = !!data.hasMore;
        loader.style.display = hasMore ? 'block' : 'none';
        end.style.display = hasMore ? 'none' : 'block';
      } catch (err) {
        console.error(err);
        loader.style.display = 'none';
      } finally {
        loading = false;
      }
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) loadMore();
      });
    }, { rootMargin: '800px 0px' });

    observer.observe(sentinel);
  }

  function setupReelInfinite() {
    const feed = document.getElementById('reelFeed');
    const sentinel = document.getElementById('reelSentinel');
    const loader = document.getElementById('reelLoader');
    const end = document.getElementById('reelEnd');
    if (!feed || !sentinel || !loader || !end) return;

    let page = 2;
    let loading = false;
    let hasMore = loader.style.display !== 'none';

    async function loadMore() {
      if (loading || !hasMore) return;
      loading = true;
      loader.style.display = 'block';

      try {
        const qs = new URLSearchParams({ page: String(page), limit: String(FEED_PAGE_SIZE), city: activeCity, category: category });
        const res = await fetch('/events/feed?' + qs.toString(), { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load more events');

        const items = Array.isArray(data.items) ? data.items : [];
        if (!items.length) {
          hasMore = false;
          loader.style.display = 'none';
          end.style.display = 'block';
          return;
        }

        const wrapper = document.createElement('div');
        wrapper.innerHTML = items.map(renderClientReel).join('');
        Array.from(wrapper.children).forEach((node) => feed.insertBefore(node, sentinel));
        enhance(wrapper);
        if (typeof feed.refreshActive === 'function') feed.refreshActive();
        page += 1;
        hasMore = !!data.hasMore;
        loader.style.display = hasMore ? 'block' : 'none';
        end.style.display = hasMore ? 'none' : 'block';
      } catch (err) {
        console.error(err);
        loader.style.display = 'none';
      } finally {
        loading = false;
      }
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) loadMore();
      });
    }, { root: feed, rootMargin: '800px 0px' });

    observer.observe(sentinel);
  }

  enhance(document);
  setupReelActiveState();
  setupMainFeedInfinite();
  setupReelInfinite();
  cities.forEach(setupCityInfinite);
})();
</script>`;
};
