function getInitials(profile) {
  const source = String(profile?.name || profile?.username || "T").trim();
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);

  if (!parts.length) return "T";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function safePreview(value) {
  const text = String(value || "").trim();
  if (!text) return "No messages yet";
  return text;
}

module.exports = function renderThreadRow({ row, escapeHtml }) {
  const other = row.other || null;
  const name = other?.name || other?.username || "Unknown";
  const username = other?.username || "user";
  const preview = safePreview(row.preview);

  const timeHtml = row.time
    ? `<div class="tz-msg-thread-time">${escapeHtml(row.time)}</div>`
    : "";

  const avatarHtml = other?.photo
    ? `<img src="${escapeHtml(other.photo)}" alt="${escapeHtml(username)}" />`
    : `<span>${escapeHtml(getInitials(other))}</span>`;

  const connectedBadge = row.isConnected
    ? `<div class="tz-msg-thread-badge">⚡ Connected</div>`
    : "";

  return `
    <a class="tz-msg-thread" href="/messages/${escapeHtml(String(row.id || ""))}">
      <div class="tz-msg-thread-shimmer" aria-hidden="true"></div>
      <div class="tz-msg-thread-glow" aria-hidden="true"></div>

      <div class="tz-msg-thread-avatar">
        ${avatarHtml}
      </div>

      <div class="tz-msg-thread-main">
        <div class="tz-msg-thread-top">
          <div class="tz-msg-thread-copy">
            <div class="tz-msg-thread-name-row">
              <div class="tz-msg-thread-name">${escapeHtml(name)}</div>
              ${connectedBadge}
            </div>
            <div class="tz-msg-thread-user">@${escapeHtml(username)}</div>
          </div>

          ${timeHtml}
        </div>

        <div class="tz-msg-thread-preview">${escapeHtml(preview)}</div>
      </div>

      <div class="tz-msg-thread-arrow" aria-hidden="true">›</div>
    </a>
  `;
};

