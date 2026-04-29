const { escapeHtml } = require('../../utils');
const { normalizeCategory, getShortDescription, getUrgencyBadge, pickImage } = require('../helpers/eventServerUtils');

function renderGoingButton(event, currentProfile, goingSet) {
  if (!currentProfile) return '';
  const isGoing = goingSet && goingSet.has(event.id);
  const label = isGoing ? "I'm Going" : 'Going';
  return `
    <form method="POST" action="/events/${encodeURIComponent(event.id)}/save" class="js-save-form" data-event-id="${escapeHtml(event.id)}" style="margin:0;">
      <button class="btn btnGhost js-save-btn${isGoing ? ' is-going' : ''}" data-event-id="${escapeHtml(event.id)}" type="submit">${escapeHtml(label)}</button>
    </form>
  `;
}

function renderEventCard(event, currentProfile, goingSet, goingCounts) {
  const image = pickImage(event);
  const when = event.startAt ? new Date(event.startAt).toLocaleString() : 'Date coming soon';
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
          <div class="event-meta-row"><span class="event-meta-label">Where</span><span class="event-meta-value">${escapeHtml(event.venueName || event.address || event.city || 'Location coming soon')}</span></div>
          ${event.city ? `<div class="event-meta-row"><span class="event-meta-label">City</span><span class="event-meta-value">${escapeHtml(event.city)}</span></div>` : ''}
        </div>

        <div class="event-actions-primary">
          <a class="btn btnLuxury" href="/events/view/${encodeURIComponent(event.id)}">Open Event</a>
          ${event.ticketUrl ? `<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.ticketUrl)}">Tickets</a>` : ''}
        </div>

        <div class="event-actions-secondary">
          ${renderGoingButton(event, currentProfile, goingSet)}
          ${goingCount ? `<div class="event-going-count muted">${goingCount} going</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderReelItem(event, currentProfile, goingSet, goingCounts) {
  const image = pickImage(event);
  const when = event.startAt ? new Date(event.startAt).toLocaleString() : 'Date coming soon';
  const categoryText = normalizeCategory(event) || 'Event';
  const shortDescription = getShortDescription(event);
  const badge = getUrgencyBadge(event);
  const goingCount = goingCounts?.get(event.id) || 0;

  return `
    <section class="reel-item js-reel-item">
      <div class="reel-bg" style="background-image:
        linear-gradient(180deg, rgba(6,8,14,.12), rgba(6,8,14,.18) 18%, rgba(3,5,10,.50) 48%, rgba(0,0,0,.96)),
        url('${escapeHtml(image)}');"></div>
      <div class="reel-noise"></div>
      <div class="reel-glow"></div>

      <div class="reel-content">
        <div class="reel-top">
          <div class="event-pill-stack">
            <span class="event-pill">${escapeHtml(categoryText)}</span>
            <span class="event-pill event-pill-urgency">${escapeHtml(badge)}</span>
          </div>
          ${event.priceText ? `<span class="event-pill event-pill-soft">${escapeHtml(event.priceText)}</span>` : ''}
        </div>

        <div class="reel-body">
          <h2 class="reel-title">${escapeHtml(event.title || 'Untitled Event')}</h2>
          <div class="reel-sub">${escapeHtml(shortDescription)}</div>
          <div class="reel-meta">
            <div>${escapeHtml(when)}</div>
            <div>${escapeHtml(event.venueName || event.city || 'Location coming soon')}</div>
            ${event.city ? `<div>${escapeHtml(event.city)}</div>` : ''}
          </div>
          <div class="reel-actions">
            <a class="btn btnLuxury" href="/events/view/${encodeURIComponent(event.id)}">Open Event</a>
            ${event.ticketUrl ? `<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.ticketUrl)}">Tickets</a>` : ''}
            ${renderGoingButton(event, currentProfile, goingSet)}
          </div>
          ${goingCount ? `<div class="event-going-count muted">${goingCount} going</div>` : ''}
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
