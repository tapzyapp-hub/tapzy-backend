module.exports = function renderEmptyInbox({ currentProfile }) {
  return `
    <div class="tz-core-empty">
      <h3>No conversations yet</h3>
      <p>Start a private Tapzy conversation with someone from discovery, events, or your Tapzy network.</p>
      <div style="margin-top:14px;">
        <a
          class="tz-chat-pill tz-chat-pill-light"
          href="/discovery/${encodeURIComponent(currentProfile?.username || "user")}?tab=search"
        >Find People</a>
      </div>
    </div>
  `;
};
