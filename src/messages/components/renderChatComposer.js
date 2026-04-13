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
          for="tzMediaInput"
          aria-label="Upload media"
          title="Upload image or voice note"
        ><span>+</span></label>

        <button
          class="tz-chat-upload-pill"
          id="tzRecordBtn"
          type="button"
          aria-label="Record voice message"
          title="Record voice message"
        >🎤</button>

        <input
          id="tzMediaInput"
          class="tz-chat-file"
          type="file"
          name="media"
          accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/mp4,audio/x-m4a,audio/aac"
        />

        <button class="tz-chat-send" id="tzSendBtn" type="submit">Send</button>
      </div>

      <div class="tz-chat-composer-subrow">
        <div id="tzMediaHint" class="tz-chat-media-hint">You can send text, images, or voice notes.</div>
        <div id="tzRecordStatus" class="tz-chat-record-status"></div>
      </div>
    </form>
  `;
};
