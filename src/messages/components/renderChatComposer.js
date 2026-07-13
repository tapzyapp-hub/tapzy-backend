module.exports = function renderChatComposer({ conversationId }) {
  return `
    <div id="tzTypingIndicator" class="tz-typing-indicator" style="display:none;"></div>

    <form
      id="tzChatForm"
      data-no-page-loader
      method="POST"
      action="/messages/${conversationId}"
      enctype="multipart/form-data"
      class="tz-chat-composer"
    >
      <div class="tz-chat-composer-inner">
        <label
          class="tz-chat-upload-pill"
          for="tzMediaInput"
          aria-label="Upload media"
          title="Upload image, video, or voice note"
        >+</label>

        <div class="tz-chat-input-wrap">
          <textarea
            class="tz-chat-input"
            id="tzMessageInput"
            name="text"
            placeholder="Send a Tapzy signal..."
            rows="1"
            enterkeyhint="send"
          ></textarea>
        </div>

        <button
          class="tz-chat-upload-pill"
          id="tzRecordBtn"
          type="button"
          aria-label="Record voice message"
          title="Record voice message"
        >Mic</button>

        <input
          id="tzMediaInput"
          class="tz-chat-file"
          type="file"
          name="media"
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm,video/x-m4v,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/mp4,audio/x-m4a,audio/aac"
        />

        <button class="tz-chat-send" id="tzSendBtn" type="submit" aria-label="Send message">Send</button>
      </div>

      <div class="tz-chat-composer-subrow">
        <div id="tzMediaHint" class="tz-chat-media-hint"></div>
        <div id="tzRecordStatus" class="tz-chat-record-status"></div>
      </div>
    </form>
  `;
};
