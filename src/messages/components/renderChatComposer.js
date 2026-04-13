module.exports = function renderChatComposer({ conversationId }) {
  return `
    <div id="tzTypingIndicator" class="tz-typing-indicator" style="display:none;"></div>

    <form
      id="tzChatForm"
      method="POST"
      action="/messages/${conversationId}"
      enctype="multipart/form-data"
      class="tz-chat-composer"
    >
      <div class="tz-chat-composer-inner">
        <div class="tz-chat-input-wrap">
          <textarea
            class="tz-chat-input"
            id="tzMessageInput"
            name="text"
            placeholder="Message on Tapzy"
            rows="1"
          ></textarea>
        </div>

        <label
          class="tz-chat-upload-pill"
          for="tzImageInput"
          aria-label="Upload image"
          title="Upload image"
        >+</label>

        <input
          id="tzImageInput"
          class="tz-chat-file"
          type="file"
          name="image"
          accept="image/png,image/jpeg,image/webp"
        />

        <button class="tz-chat-send" id="tzSendBtn" type="submit">Send</button>
      </div>
    </form>
  `;
};