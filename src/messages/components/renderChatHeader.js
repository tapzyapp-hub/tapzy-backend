function getInitials(profile) {
  const source = String(profile?.name || profile?.username || "T").trim();
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);

  if (!parts.length) return "T";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

module.exports = function renderChatHeader({ other, escapeHtml, conversationId }) {
  const name = other?.name || other?.username || "Conversation";
  const username = other?.username || "user";

  const otherAvatarHtml = other?.photo
    ? `<img src="${escapeHtml(other.photo)}" alt="${escapeHtml(username)}" />`
    : `<span>${escapeHtml(getInitials(other))}</span>`;

  const profileInner = `
    <div class="tz-chat-partner-avatar">${otherAvatarHtml}</div>
    <div class="tz-chat-partner-copy">
      <div class="tz-chat-partner-name">${escapeHtml(name)}</div>
    </div>
  `;

  const profileHtml = other?.username
    ? `<a class="tz-chat-partner tz-chat-partner-link" href="/u/${escapeHtml(username)}" aria-label="Open ${escapeHtml(name)} profile">${profileInner}</a>`
    : `<div class="tz-chat-partner">${profileInner}</div>`;

  return `
    <div class="tz-chat-topbar">
      <div class="tz-chat-topbar-left">
        <a class="tz-chat-back" href="/messages" aria-label="Back to messages">‹</a>
        ${profileHtml}
      </div>

      <div class="tz-chat-topbar-actions">
        <div class="tz-chat-pill tz-chat-pill-light">Private</div>
        <form method="POST" action="/messages/${escapeHtml(String(conversationId || ""))}/remove" onsubmit="return confirm('Remove this conversation from your inbox?');">
          <button class="tz-chat-pill tz-chat-pill-danger" type="submit">Remove</button>
        </form>
      </div>
    </div>
  `;
};
