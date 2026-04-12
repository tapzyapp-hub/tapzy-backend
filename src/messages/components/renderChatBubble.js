module.exports = function renderChatBubble({
  message,
  currentProfile,
  escapeHtml,
  formatPrettyLocal,
}) {
  const isMine = message.senderProfileId === currentProfile.id;
  const hasBody = !!String(message.body || "").trim();
  const hasImage = !!String(message.imageUrl || "").trim();
  const hasAudio = !!String(message.audioUrl || "").trim();

  const bodyHtml = hasBody
    ? `<div class="tz-chat-body">${escapeHtml(message.body)}</div>`
    : "";

  const imageHtml = hasImage
    ? `<img class="tz-chat-image" src="${escapeHtml(message.imageUrl)}" alt="Message image" />`
    : "";

  const audioHtml = hasAudio
    ? `<audio class="tz-chat-audio" controls preload="metadata" src="${escapeHtml(message.audioUrl)}"></audio>`
    : "";

  const bubbleClass = [
    "tz-chat-bubble",
    isMine ? "mine" : "other",
    hasImage && !hasBody && !hasAudio ? "is-image-only" : "",
    hasImage && hasBody ? "has-image" : "",
    hasAudio ? "has-audio" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const statusHtml = isMine
    ? `<div class="tz-chat-status">${escapeHtml(message.readAt ? "Seen" : "Delivered")}</div>`
    : "";

  return `
    <div class="tz-chat-row ${isMine ? "mine" : "other"}" data-created-at="${escapeHtml(String(message.createdAt || ""))}" data-sender-id="${escapeHtml(String(message.senderProfileId || ""))}" data-message-id="${escapeHtml(String(message.id || ""))}" data-read-at="${escapeHtml(String(message.readAt || ""))}">
      <div class="${bubbleClass}">
        ${bodyHtml}
        ${imageHtml}
        ${audioHtml}
        <div class="tz-chat-time">${escapeHtml(formatPrettyLocal(message.createdAt))}</div>
        ${statusHtml}
      </div>
    </div>
  `;
};
