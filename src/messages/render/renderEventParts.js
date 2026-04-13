
const { escapeHtml, formatPrettyLocal } = require("../../utils");
const {
  normalizeCategory,
  getShortDescription,
  pickImage,
  getUrgencyBadge,
} = require("../helpers/eventServerUtils");

function renderGoingButton(eventId, currentProfile, isGoing, goingCount) {
  return currentProfile
    ? `
      <button class="btn btnGhost js-going-btn ${isGoing ? "is-active" : ""}" type="button" data-going-id="${escapeHtml(eventId)}">${isGoing ? "Going ✓" : "I’m Going"}${goingCount ? ` • ${goingCount}` : ""}</button>
    `
    : `<a class="btn btnGhost" href="/auth">Sign in to go</a>`;
}

module.exports = {
    renderEventCard,
  renderReelItem,
  renderSection,
  renderCitySwitcher,
};
