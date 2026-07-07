function getInitials(profile) {
  const source = String(profile?.name || profile?.username || "T").trim();
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);

  if (!parts.length) return "T";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

module.exports = function renderThreadRow({ row, escapeHtml }) {
  const other = row.other || null;
  const name = other?.name || other?.username || "Unknown";
  const username = other?.username || "user";

  const avatarHtml = other?.photo
    ? `<img src="${escapeHtml(other.photo)}" alt="${escapeHtml(username)}" loading="lazy" decoding="async" />`
    : `<span>${escapeHtml(getInitials(other))}</span>`;

  const unreadBadge = row.unreadCount
    ? `<div class="tz-msg-thread-unread">${escapeHtml(String(row.unreadCount))}</div>`
    : "";

  return `
    <a class="tz-msg-thread${row.unreadCount ? " has-unread" : ""}" href="/messages/${escapeHtml(String(row.id || ""))}">
      <div class="tz-msg-thread-shimmer" aria-hidden="true"></div>
      <div class="tz-msg-thread-glow" aria-hidden="true"></div>

      <div class="tz-msg-thread-avatar-wrap" aria-hidden="true">
        <div class="tz-msg-thread-avatar">
          ${avatarHtml}
        </div>
      </div>

      <div class="tz-msg-thread-main">
        <div class="tz-msg-thread-top">
          <div class="tz-msg-thread-copy">
            <div class="tz-msg-thread-name-row">
              <div class="tz-msg-thread-name">${escapeHtml(name)}</div>
            </div>
          </div>

          <div class="tz-msg-thread-top-right">
            ${unreadBadge}
          </div>
        </div>
      </div>
    </a>
  `;
};
