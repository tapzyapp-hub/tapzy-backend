function getInitials(profile) {
  const source = String(profile?.name || profile?.username || "T").trim();
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);

  if (!parts.length) return "T";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

module.exports = function renderChatHeader({ other, escapeHtml, conversationId, memberSettings = {}, blockState = {} }) {
  const name = other?.name || other?.username || "Conversation";
  const username = other?.username || "user";
  const profileHref = other?.username ? `/u/${escapeHtml(username)}` : "#";
  const avatarLabel = other?.username ? `Open ${name}'s profile` : `${name} avatar`;
  const isPinned = !!memberSettings.pinnedAt;
  const mutedUntil = memberSettings.mutedUntil ? new Date(memberSettings.mutedUntil) : null;
  const isMuted = mutedUntil && mutedUntil.getTime() > Date.now();
  const isArchived = !!memberSettings.archivedAt;
  const iBlockedThem = !!blockState.iBlockedThem;
  const theyBlockedMe = !!blockState.theyBlockedMe;

  const avatarInnerHtml = other?.photo
    ? `<img src="${escapeHtml(other.photo)}" alt="${escapeHtml(username)}" loading="lazy" decoding="async" />`
    : `<span>${escapeHtml(getInitials(other))}</span>`;

  const otherAvatarHtml = other?.username
    ? `<a class="tz-chat-partner-avatar tz-chat-partner-avatar-link" href="${profileHref}" aria-label="${escapeHtml(avatarLabel)}">${avatarInnerHtml}</a>`
    : `<div class="tz-chat-partner-avatar">${avatarInnerHtml}</div>`;

  return `
    <div class="tz-chat-topbar">
      <div class="tz-chat-topbar-left">
        <a class="tz-chat-back" href="/messages" aria-label="Back to messages">‹</a>

        <div class="tz-chat-partner">
          ${otherAvatarHtml}

          <div class="tz-chat-partner-copy">
            <div class="tz-chat-partner-name-row">
              <div class="tz-chat-partner-name">${escapeHtml(name)}</div>
              <div class="tz-chat-partner-badge">Contact</div>
              ${isPinned ? `<div class="tz-chat-partner-badge">Pinned</div>` : ""}
              ${isMuted ? `<div class="tz-chat-partner-badge">Muted</div>` : ""}
              ${iBlockedThem ? `<div class="tz-chat-partner-badge">Blocked</div>` : ""}
              ${theyBlockedMe ? `<div class="tz-chat-partner-badge">Unavailable</div>` : ""}
            </div>
          </div>
        </div>
      </div>

      <div class="tz-chat-topbar-actions">
        <details class="tz-chat-settings-menu">
          <summary class="tz-chat-pill" aria-label="Open chat settings">More</summary>
          <div class="tz-chat-settings-panel">
            <div class="tz-chat-settings-title">Signal Controls</div>
            <a class="tz-chat-setting-link" href="${profileHref}">View profile</a>

            <form method="POST" action="/messages/${escapeHtml(String(conversationId || ""))}/settings">
              <input type="hidden" name="action" value="${isPinned ? "unpin" : "pin"}" />
              <button type="submit">${isPinned ? "Unpin chat" : "Pin chat"}</button>
            </form>

            <form method="POST" action="/messages/${escapeHtml(String(conversationId || ""))}/settings">
              <input type="hidden" name="action" value="${isMuted ? "unmute" : "mute-8h"}" />
              <button type="submit">${isMuted ? "Unmute notifications" : "Mute for 8 hours"}</button>
            </form>

            ${!isMuted ? `
              <form method="POST" action="/messages/${escapeHtml(String(conversationId || ""))}/settings">
                <input type="hidden" name="action" value="mute-1w" />
                <button type="submit">Mute for 1 week</button>
              </form>
              <form method="POST" action="/messages/${escapeHtml(String(conversationId || ""))}/settings">
                <input type="hidden" name="action" value="mute-always" />
                <button type="submit">Mute always</button>
              </form>
            ` : ""}

            <form method="POST" action="/messages/${escapeHtml(String(conversationId || ""))}/settings">
              <input type="hidden" name="action" value="${isArchived ? "unarchive" : "archive"}" />
              <button type="submit">${isArchived ? "Move to inbox" : "Archive chat"}</button>
            </form>

            ${other?.id ? `
              <form method="POST" action="/messages/block/${escapeHtml(String(other.id))}" onsubmit="return confirm('${iBlockedThem ? "Unblock this Tapzy user?" : "Block this Tapzy user? They will not be able to message you."}');">
                <input type="hidden" name="action" value="${iBlockedThem ? "unblock" : "block"}" />
                <button class="tz-chat-setting-danger" type="submit">${iBlockedThem ? "Unblock user" : "Block user"}</button>
              </form>
            ` : ""}
          </div>
        </details>
        <form method="POST" action="/messages/${escapeHtml(String(conversationId || ""))}/remove" onsubmit="return confirm('Remove this conversation from your inbox?');">
          <button class="tz-chat-pill tz-chat-pill-danger" type="submit">Clear</button>
        </form>
      </div>
    </div>
  `;
};
