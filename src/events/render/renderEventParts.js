const { escapeHtml } = require("../../utils");
const {
  normalizeCategory,
  getShortDescription,
  pickImage,
  getUrgencyBadge,
} = require("../helpers/eventServerUtils");
const { TOP_CITY_ORDER, TOP_CATEGORY_ORDER } = require("../config");

function formatDate(value) {
  if (!value) return "Date coming soon";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Date coming soon";
  return d.toLocaleString();
}

function getInitials(profile) {
  const source = String(profile?.name || profile?.username || "?").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || source.charAt(0).toUpperCase();
}

function renderGoingPreview(event) {
  const profiles = Array.isArray(event?.goingPreviewProfiles) ? event.goingPreviewProfiles : [];
  const count = Number(event?.goingCount || 0);

  if (!count) {
    return `<div class="event-going-preview js-going-preview" data-going-preview-id="${escapeHtml(event.id)}" style="display:none;"></div>`;
  }

  const visible = profiles.slice(0, 3);
  const avatarHtml = visible.map((profile) => {
    const username = String(profile?.username || "").trim();
    const href = username ? `/u/${encodeURIComponent(username)}` : "#";
    const label = escapeHtml(profile?.name || username || "Tapzy member");
    const photo = String(profile?.photo || "").trim();

    return `
      <a class="event-going-avatar" href="${escapeHtml(href)}" aria-label="${label}" title="${label}">
        ${photo
          ? `<img src="${escapeHtml(photo)}" alt="${label}" loading="lazy" />`
          : `<span>${escapeHtml(getInitials(profile))}</span>`}
      </a>
    `;
  }).join("");

  const extraCount = Math.max(0, count - visible.length);

  return `
    <div class="event-going-preview js-going-preview" data-going-preview-id="${escapeHtml(event.id)}">
      <div class="event-going-avatars">
        ${avatarHtml}
        ${extraCount ? `<div class="event-going-avatar event-going-avatar-more">+${extraCount}</div>` : ""}
      </div>
      <div class="event-going-copy">${count} ${count === 1 ? "person" : "people"} going</div>
    </div>
  `;
}

function renderGoingButton(event, currentProfile, goingSet, goingCounts) {
  if (!currentProfile) return "";

  const isGoing = !!goingSet?.has(event.id);
  const goingCount = Number(goingCounts?.get(event.id) || event.goingCount || 0);

  return `
    <button
      class="btn btnGhost js-going-btn ${isGoing ? "is-active" : ""}"
      type="button"
      data-going-id="${escapeHtml(event.id)}"
    >
      ${isGoing ? "Going ✓" : "I’m Going"}${goingCount ? ` • ${goingCount}` : ""}
    </button>
  `;
}

function renderEventCard(event, currentProfile, goingSet, goingCounts) {
  const image = pickImage(event);
  const when = formatDate(event.startAt);
  const category = normalizeCategory(event);
  const description = getShortDescription(event);
  const badge = getUrgencyBadge(event);

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
            <span class="event-pill">${escapeHtml(category || "Event")}</span>
            <span class="event-pill event-pill-urgency">${escapeHtml(badge)}</span>
          </div>
          ${event.priceText ? `<span class="event-pill event-pill-soft">${escapeHtml(event.priceText)}</span>` : ""}
        </div>

        <h3 class="event-title">${escapeHtml(event.title || "Untitled Event")}</h3>

        <div class="event-copy muted">${escapeHtml(description)}</div>

        <div class="event-divider"></div>

        <div class="event-meta">
          <div class="event-meta-row">
            <span class="event-meta-label">When</span>
            <span class="event-meta-value">${escapeHtml(when)}</span>
          </div>
          <div class="event-meta-row">
            <span class="event-meta-label">Where</span>
            <span class="event-meta-value">${escapeHtml(event.venueName || event.address || event.city || "Location coming soon")}</span>
          </div>
          ${event.city ? `
            <div class="event-meta-row">
              <span class="event-meta-label">City</span>
              <span class="event-meta-value">${escapeHtml(event.city)}</span>
            </div>
          ` : ""}
        </div>

        <div class="event-actions-primary">
          <a class="btn btnLuxury" href="/events/view/${escapeHtml(event.id)}">Open Event</a>
          ${event.ticketUrl ? `<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.ticketUrl)}">Tickets</a>` : ""}
        </div>

        ${renderGoingPreview({ ...event, goingCount: Number(goingCounts?.get(event.id) || event.goingCount || 0) })}
        ${currentProfile ? `<div class="event-actions-secondary">${renderGoingButton(event, currentProfile, goingSet, goingCounts)}</div>` : ""}
      </div>
    </div>
  `;
}

function renderReelItem(event, currentProfile, goingSet, goingCounts) {
  const image = pickImage(event);
  const when = formatDate(event.startAt);
  const category = normalizeCategory(event);
  const description = getShortDescription(event);
  const badge = getUrgencyBadge(event);

  return `
    <section class="reel-item js-reel-item js-event-card">
      <div class="reel-bg" style="background-image:
        linear-gradient(180deg, rgba(6,8,14,.12), rgba(6,8,14,.18) 18%, rgba(3,5,10,.50) 48%, rgba(0,0,0,.96)),
        url('${escapeHtml(image)}');"></div>

      <div class="reel-noise"></div>
      <div class="reel-glow"></div>

      <div class="reel-content">
        <div class="reel-top">
          <div class="event-pill-stack reel-pill-stack">
            <span class="event-pill">${escapeHtml(category || "Event")}</span>
            <span class="event-pill event-pill-urgency">${escapeHtml(badge)}</span>
          </div>
        </div>

        <div class="reel-body">
          <h2 class="reel-title">${escapeHtml(event.title || "Untitled Event")}</h2>
          <div class="reel-sub">${escapeHtml(description)}</div>

          <div class="reel-meta">
            <div><strong>When</strong><br>${escapeHtml(when)}</div>
            <div><strong>Where</strong><br>${escapeHtml(event.venueName || event.address || event.city || "Location coming soon")}</div>
            ${event.city ? `<div><strong>City</strong><br>${escapeHtml(event.city)}</div>` : ""}
          </div>

          <div class="reel-actions">
            <a class="btn btnLuxury" href="/events/view/${escapeHtml(event.id)}">Open Event</a>
            ${event.ticketUrl ? `<a class="btn btnDark" target="_blank" rel="noopener noreferrer" href="${escapeHtml(event.ticketUrl)}">Tickets</a>` : `<div></div>`}
          </div>

          ${renderGoingPreview({ ...event, goingCount: Number(goingCounts?.get(event.id) || event.goingCount || 0) })}
          ${currentProfile ? `<div class="event-actions-secondary" style="margin-top:12px;">${renderGoingButton(event, currentProfile, goingSet, goingCounts)}</div>` : ""}
        </div>
      </div>
    </section>
  `;
}

function renderSection(title, events, currentProfile, goingSet, goingCounts) {
  if (!Array.isArray(events) || !events.length) return "";

  return `
    <section class="events-section desktop-only">
      <div class="row-between" style="margin-bottom:14px;">
        <h2 class="events-section-title">${escapeHtml(title || "Events")}</h2>
        <div class="muted">${events.length} total</div>
      </div>

      <div class="events-grid">
        ${events.map((event) => renderEventCard(event, currentProfile, goingSet, goingCounts)).join("")}
      </div>
    </section>
  `;
}

function buildEventsQuery({ city, category, hasAdminKey, adminKey }) {
  const qs = new URLSearchParams();
  if (city) qs.set("city", city);
  if (category) qs.set("category", category);
  if (hasAdminKey && adminKey) qs.set("key", adminKey);
  const text = qs.toString();
  return text ? `/events?${text}` : "/events";
}

function renderCitySwitcher(activeCity, hasAdminKey, adminKey, category) {
  return `
    <div class="city-switcher-wrap">
      <div class="filter-chip-label">Cities</div>
      <div class="city-switcher">
        <a class="city-chip ${!activeCity ? "is-active" : ""}" href="${buildEventsQuery({ city: "", category, hasAdminKey, adminKey })}">All Cities</a>
        ${TOP_CITY_ORDER.map((city) => {
          const active = String(city).toLowerCase() === String(activeCity || "").toLowerCase();
          return `<a class="city-chip ${active ? "is-active" : ""}" href="${buildEventsQuery({ city, category, hasAdminKey, adminKey })}">${escapeHtml(city)}</a>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderCategorySwitcher(activeCategory, hasAdminKey, adminKey, city) {
  const normalizedActive = String(activeCategory || "").trim().toLowerCase();

  return `
    <div class="city-switcher-wrap category-switcher-wrap">
      <div class="filter-chip-label">Categories</div>
      <div class="city-switcher category-switcher">
        <a class="city-chip ${!normalizedActive ? "is-active" : ""}" href="${buildEventsQuery({ city, category: "", hasAdminKey, adminKey })}">All Categories</a>
        ${TOP_CATEGORY_ORDER.map((category) => {
          const active = String(category).toLowerCase() === normalizedActive;
          return `<a class="city-chip ${active ? "is-active" : ""}" href="${buildEventsQuery({ city, category, hasAdminKey, adminKey })}">${escapeHtml(category)}</a>`;
        }).join("")}
      </div>
    </div>
  `;
}

module.exports = {
  renderEventCard,
  renderReelItem,
  renderSection,
  renderCitySwitcher,
  renderCategorySwitcher,
};
