const { escapeHtml } = require('../../utils');
const { normalizeCategory, getShortDescription, getUrgencyBadge, pickImage } = require('../helpers/eventServerUtils');

function formatEventDate(value) {
  if (!value) return 'Not listed by source';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not listed by source';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function sourceLocation(event) {
  return String(event?.venueName || event?.address || event?.city || 'Not listed by source').trim();
}

function renderGoingButton(event, currentProfile, goingSet) {
  if (!currentProfile) return '';
  const isGoing = goingSet && goingSet.has(event.id);
  const label = isGoing ? "Going ✓" : 'Going';
  return `
    <form method="POST" action="/events/${encodeURIComponent(event.id)}/going" class="js-save-form" data-no-page-loader data-event-id="${escapeHtml(event.id)}" style="margin:0;">
      <button class="btn btnGhost js-save-btn${isGoing ? ' is-going' : ''}" data-event-id="${escapeHtml(event.id)}" type="submit">${escapeHtml(label)}</button>
    </form>
  `;
}

function renderEventCard(event, currentProfile, goingSet, goingCounts) {
  const image = pickImage(event);
  const when = formatEventDate(event.startAt);
  const categoryText = normalizeCategory(event) || 'Event';
  const shortDescription = getShortDescription(event);
  const badge = getUrgencyBadge(event);
  const goingCount = goingCounts?.get(event.id) || 0;

  return `
    <div class="event-card js-event-card">
      <div class="event-media" style="background-image:
        linear-gradient(180deg, rgba(6,8,14,.06), rgba(6,8,14,.18) 22%, rgba(3,5,10,.62) 60%, rgba(0,0,0,.94)),
        url('${escapeHtml(image)}');"></div>
      <div class="event-card-noise"></div>
      <div class="event-card-glow"></div>
      <div class="event-card-edge"></div>

      <div class="event-content">
        <div class="event-topline">
          <div class="event-pill-stack">
            <span class="event-pill">${escapeHtml(categoryText)}</span>
            <span class="event-pill event-pill-urgency">${escapeHtml(badge)}</span>
          </div>
          ${event.priceText ? `<span class="event-pill event-pill-soft">${escapeHtml(event.priceText)}</span>` : ''}
        </div>

        <h3 class="event-title">${escapeHtml(event.title || 'Untitled Event')}</h3>
        <div class="event-copy muted">${escapeHtml(shortDescription)}</div>
        <div class="event-divider"></div>

        <div class="event-meta">
          <div class="event-meta-row"><span class="event-meta-label">When</span><span class="event-meta-value">${escapeHtml(when)}</span></div>
          <div class="event-meta-row"><span class="event-meta-label">Where</span><span class="event-meta-value">${escapeHtml(sourceLocation(event))}</span></div>
          ${event.city ? `<div class="event-meta-row"><span class="event-meta-label">City</span><span class="event-meta-value">${escapeHtml(event.city)}</span></div>` : ''}
        </div>

        <div class="event-actions-primary">
          <a class="btn btnLuxury" href="/events/view/${encodeURIComponent(event.id)}">Open Event</a>
          ${event.ticketUrl ? `<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.ticketUrl)}">Tickets</a>` : ''}
        </div>

        <div class="event-actions-secondary">
          ${renderGoingButton(event, currentProfile, goingSet)}
          <div class="event-going-count muted js-going-count" data-event-id="${escapeHtml(event.id)}">${goingCount ? `${goingCount} going` : ""}</div>
        </div>
      </div>
    </div>
  `;
}

function renderReelItem(event, currentProfile, goingSet, goingCounts) {
  const image = pickImage(event);
  const when = formatEventDate(event.startAt);
  const date = event.startAt ? new Date(event.startAt) : null;
  const dateMonth = date ? date.toLocaleString('en-US', { month: 'short' }).toUpperCase() : 'SOON';
  const dateDay = date ? date.getDate() : '•';
  const categoryText = normalizeCategory(event) || 'Event';
  const shortDescription = getShortDescription(event);
  const badge = getUrgencyBadge(event);
  const goingCount = goingCounts?.get(event.id) || 0;
  const isGoing = !!(goingSet && goingSet.has(event.id));

  return `
    <section class="reel-item js-reel-item" data-event-id="${escapeHtml(event.id)}">
      <div class="reel-bg" style="background-image:url('${escapeHtml(image)}');"></div>
      <div class="reel-ambient" style="background-image:url('${escapeHtml(image)}');"></div>
      <div class="reel-vignette"></div>
      <div class="reel-grain"></div>

      <div class="reel-content">
        <div class="reel-top">
          <div class="reel-date">
            <span>${escapeHtml(dateMonth)}</span>
            <strong>${escapeHtml(dateDay)}</strong>
          </div>
          <div class="reel-top-pills">
            <span class="reel-chip">${escapeHtml(categoryText)}</span>
            ${event.priceText ? `<span class="reel-chip reel-chip-price">${escapeHtml(event.priceText)}</span>` : ''}
          </div>
        </div>

        <aside class="reel-action-rail" aria-label="Event actions">
          ${currentProfile ? `
            <form method="POST" action="/events/${encodeURIComponent(event.id)}/going" class="js-save-form reel-rail-form" data-no-page-loader data-event-id="${escapeHtml(event.id)}">
              <button class="reel-rail-action js-save-btn${isGoing ? ' is-going' : ''}" data-event-id="${escapeHtml(event.id)}" type="submit" aria-label="${isGoing ? 'Remove Going' : 'Mark Going'}">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/><path d="m8 14 2.4 2.4L16 11"/></svg>
                <span>${isGoing ? 'Going' : 'Join'}</span>
              </button>
            </form>
          ` : `
            <a class="reel-rail-action" href="/auth" aria-label="Sign in to mark going">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/></svg>
              <span>Join</span>
            </a>
          `}
          <button class="reel-rail-action" type="button" data-event-share="/events/view/${encodeURIComponent(event.id)}" aria-label="Share event">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 16-8-6 16-3-6-7-2Zm7 2 9-10"/></svg>
            <span>Share</span>
          </button>
          ${event.ticketUrl ? `
            <a class="reel-rail-action" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.ticketUrl)}" aria-label="Buy tickets">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7a2 2 0 0 0 0 4v6h16v-6a2 2 0 0 0 0-4V5H4v2Z"/><path d="M13 5v12"/></svg>
              <span>Tickets</span>
            </a>
          ` : ''}
        </aside>

        <div class="reel-body">
          <div class="reel-eyebrow">
            <span class="reel-live-dot"></span>
            ${escapeHtml(badge)}
          </div>
          <h2 class="reel-title">${escapeHtml(event.title || 'Untitled Event')}</h2>
          <div class="reel-sub">${escapeHtml(shortDescription)}</div>
          <div class="reel-location">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-12A7 7 0 1 0 5 9c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>
            <span>${escapeHtml(sourceLocation(event))}</span>
          </div>
          <div class="reel-time">${escapeHtml(when)}</div>
          <div class="reel-footer-row">
            <a class="reel-open-btn" href="/events/view/${encodeURIComponent(event.id)}">View event <span>→</span></a>
            <div class="reel-attendance js-going-count" data-event-id="${escapeHtml(event.id)}">${goingCount ? `${goingCount} going` : 'Be the first to join'}</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderSection(title = '', items = [], currentProfile, goingSet, goingCounts) {
  if (!Array.isArray(items) || !items.length) return '';
  return `
    <section class="events-section desktop-only">
      <div class="row-between" style="margin-bottom:14px;">
        <h2 class="events-section-title">${escapeHtml(title)}</h2>
        <div class="muted">${items.length} shown</div>
      </div>
      <div class="events-grid">
        ${items.map((event) => renderEventCard(event, currentProfile, goingSet, goingCounts)).join('')}
      </div>
    </section>
  `;
}

function chipHref({ city = '', category = '', key = '' }) {
  const qs = new URLSearchParams();
  if (city) qs.set('city', city);
  if (category) qs.set('category', category);
  if (key) qs.set('key', key);
  const str = qs.toString();
  return `/events${str ? `?${str}` : ''}`;
}

function renderCitySwitcher(activeCity = '', hasAdminKey = false, adminKey = '', activeCategory = '') {
  const cities = ['All Cities', 'Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton'];
  const key = hasAdminKey ? adminKey : '';
  return `
    <section class="events-chip-wrap">
      <div class="events-chip-row">
        ${cities.map((city) => {
          const value = city === 'All Cities' ? '' : city;
          const isActive = String(activeCity || '').toLowerCase() === String(value || '').toLowerCase();
          return `<a class="events-chip${(!activeCity && !value) || isActive ? ' is-active' : ''}" href="${chipHref({ city: value, key })}">${escapeHtml(city)}</a>`;
        }).join('')}
      </div>
    </section>
  `;
}

module.exports = {
  renderEventCard,
  renderReelItem,
  renderSection,
  renderCitySwitcher,
};
