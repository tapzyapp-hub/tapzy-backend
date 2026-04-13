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
    hasImage && !hasBody ? "is-image-only" : "",
    hasImage && hasBody ? "has-image" : "",
    hasAudio ? "has-audio" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <div class="tz-chat-row ${isMine ? "mine" : "other"}">
      <div class="${bubbleClass}">
        ${bodyHtml}
        ${imageHtml}
        ${audioHtml}
        <div class="tz-chat-time">${escapeHtml(formatPrettyLocal(message.createdAt))}</div>
      </div>
    </div>
  `;
};

