(function () {
  if (window.TapzyVideoUpload) return;

  const TARGET_BYTES = 42 * 1024 * 1024;
  const START_COMPRESS_BYTES = 12 * 1024 * 1024;
  const CHUNK_UPLOAD_BYTES = 42 * 1024 * 1024;
  const CHUNK_SIZE = 5 * 1024 * 1024;
  const MAX_EDGE = 1280;
  const FPS = 30;
  const VIDEO_BITRATE = 2400000;
  const AUDIO_BITRATE = 128000;

  function isVideoFile(file) {
    if (!file) return false;
    const type = String(file.type || "").toLowerCase();
    const name = String(file.name || "").toLowerCase();
    return type.indexOf("video/") === 0 || /\.(mp4|mov|m4v|webm|3gp|3gpp|avi|hevc)$/i.test(name);
  }

  function supportsChunkedSubmit(form) {
    try {
      const action = new URL(form.getAttribute("action") || location.href, location.href);
      return /^\/stories(?:$|\/)/.test(action.pathname) || /^\/messages\/[^/]+$/.test(action.pathname);
    } catch (_) {
      return false;
    }
  }

  function bestMimeType() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    const options = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4;codecs=h264,aac",
      "video/mp4",
    ];
    return options.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  function setStatus(form, text) {
    if (!text) return;
    const targets = [
      form.querySelector("[data-story-status]"),
      form.querySelector("[data-media-hint]"),
      form.querySelector(".media-hint"),
      form.querySelector(".upload-hint"),
    ].filter(Boolean);

    if (targets.length) {
      targets.forEach((target) => {
        target.textContent = text;
      });
      return;
    }

    let status = form.querySelector("[data-tapzy-video-status]");
    if (!status) {
      status = document.createElement("div");
      status.setAttribute("data-tapzy-video-status", "1");
      status.style.cssText = "margin-top:10px;color:#9fb4d8;font-size:13px;font-weight:800;";
      form.appendChild(status);
    }
    status.textContent = text;
  }

  function replaceInputFile(input, file) {
    if (!window.DataTransfer || !input || !file) return false;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function clearInputFile(input) {
    if (!window.DataTransfer || !input) return false;
    input.files = new DataTransfer().files;
    return true;
  }

  function upsertHidden(form, name, value) {
    let input = form.querySelector('input[name="' + name + '"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      form.appendChild(input);
    }
    input.value = value || "";
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || "Upload failed");
    return data;
  }

  async function uploadChunkWithRetry(uploadId, index, blob) {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const formData = new FormData();
        formData.append("chunk", blob, String(index) + ".part");
        const res = await fetch("/media/chunk/" + encodeURIComponent(uploadId) + "/" + index, {
          method: "POST",
          credentials: "same-origin",
          body: formData,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || "Chunk failed");
        return data;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
      }
    }
    throw lastError || new Error("Chunk failed");
  }

  async function uploadChunkedVideo(file, form, onProgress) {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const session = await postJson("/media/chunk/start", {
      originalName: file.name || "tapzy-video.webm",
      type: file.type || "video/webm",
      size: file.size,
      totalChunks,
    });

    try {
      for (let index = 0; index < totalChunks; index += 1) {
        const start = index * CHUNK_SIZE;
        const chunk = file.slice(start, Math.min(file.size, start + CHUNK_SIZE));
        await uploadChunkWithRetry(session.uploadId, index, chunk);
        if (onProgress) onProgress(Math.round(((index + 1) / totalChunks) * 100));
      }

      return await postJson("/media/chunk/" + encodeURIComponent(session.uploadId) + "/complete", {});
    } catch (error) {
      try { await postJson("/media/chunk/" + encodeURIComponent(session.uploadId) + "/cancel", {}); } catch (_) {}
      throw error;
    }
  }

  function even(value) {
    const next = Math.max(2, Math.round(value));
    return next % 2 === 0 ? next : next - 1;
  }

  function targetSize(width, height) {
    if (!width || !height) return { width: 720, height: 1280 };
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    return {
      width: even(width * scale),
      height: even(height * scale),
    };
  }

  function loadVideo(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "auto";
      video.playsInline = true;
      video.muted = false;
      video.src = url;
      video.onloadedmetadata = () => resolve({ video, url });
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Video could not be read"));
      };
    });
  }

  async function captureAudioFromVideo(video) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      try {
        const audioContext = new AudioContextClass();
        if (audioContext.state === "suspended" && audioContext.resume) {
          await audioContext.resume().catch(() => {});
        }
        const source = audioContext.createMediaElementSource(video);
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        if (destination.stream.getAudioTracks().length) {
          return {
            stream: destination.stream,
            close: () => audioContext.close && audioContext.close().catch(() => {}),
          };
        }
        if (audioContext.close) audioContext.close().catch(() => {});
      } catch (_) {}
    }

    const capture = video.captureStream || video.mozCaptureStream;
    if (capture) {
      try {
        const stream = capture.call(video);
        if (stream && stream.getAudioTracks().length) {
          return { stream, close: () => {} };
        }
      } catch (_) {}
    }

    return null;
  }

  async function compressVideo(file, onProgress) {
    const mimeType = bestMimeType();
    if (!mimeType || !navigator.mediaDevices || !window.MediaRecorder) return file;

    const loaded = await loadVideo(file);
    const video = loaded.video;
    const url = loaded.url;
    const canvas = document.createElement("canvas");
    const size = targetSize(video.videoWidth, video.videoHeight);
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx || !canvas.captureStream) {
      URL.revokeObjectURL(url);
      return file;
    }

    const canvasStream = canvas.captureStream(FPS);
    const audioCapture = await captureAudioFromVideo(video);
    const audioStream = audioCapture ? audioCapture.stream : null;

    if (!audioStream || !audioStream.getAudioTracks().length) {
      URL.revokeObjectURL(url);
      canvasStream.getTracks().forEach((track) => track.stop());
      return file;
    }

    if (audioStream) {
      audioStream.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
    }

    const chunks = [];
    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITRATE,
      audioBitsPerSecond: AUDIO_BITRATE,
    });

    const draw = () => {
      if (video.ended || video.paused) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (Number.isFinite(video.duration) && video.duration > 0 && onProgress) {
        const pct = Math.min(99, Math.round((video.currentTime / video.duration) * 100));
        onProgress(pct);
      }
      requestAnimationFrame(draw);
    };

    return await new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        try { recorder.state !== "inactive" && recorder.stop(); } catch (_) {}
        try { video.pause(); } catch (_) {}
        canvasStream.getTracks().forEach((track) => track.stop());
        if (audioStream) audioStream.getTracks().forEach((track) => track.stop());
        if (audioCapture && audioCapture.close) audioCapture.close();
        URL.revokeObjectURL(url);
        resolve(result || file);
      };

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      };

      recorder.onstop = () => {
        if (!chunks.length) return finish(file);
        const blob = new Blob(chunks, { type: mimeType.split(";")[0] || "video/webm" });
        if (!blob.size || blob.size >= file.size * 0.96) return finish(file);
        const ext = blob.type.includes("mp4") ? ".mp4" : ".webm";
        const base = String(file.name || "tapzy-video").replace(/\.[^.]+$/, "");
        finish(new File([blob], `${base}-tapzy${ext}`, { type: blob.type, lastModified: Date.now() }));
      };

      video.onended = () => {
        try { recorder.stop(); } catch (_) { finish(file); }
      };

      recorder.onerror = () => finish(file);

      recorder.start(1000);
      video.play().then(() => {
        draw();
      }).catch(() => finish(file));
    });
  }

  async function prepareForm(form, submitter) {
    if (form.dataset.tapzyVideoPrepared === "1") return true;
    const inputs = Array.from(form.querySelectorAll('input[type="file"]'));
    const videoInput = inputs.find((input) => isVideoFile(input.files && input.files[0]));
    if (!videoInput) {
      form.dataset.tapzyVideoPrepared = "1";
      return true;
    }

    const file = videoInput.files[0];
    if (!file || file.size < START_COMPRESS_BYTES) {
      form.dataset.tapzyVideoPrepared = "1";
      return true;
    }

    form.dataset.tapzyVideoPreparing = "1";
    setStatus(form, "Preparing video like TikTok — keep this page open.");
    if (submitter) submitter.disabled = true;

    try {
      const compressed = await compressVideo(file, (pct) => {
        setStatus(form, `Preparing video ${pct}% — keep this page open.`);
      });

      if (compressed && compressed !== file && compressed.size < file.size) {
        replaceInputFile(videoInput, compressed);
        const saved = Math.max(1, Math.round((1 - compressed.size / file.size) * 100));
        setStatus(form, `Video ready — compressed ${saved}% for faster upload.`);
      } else {
        setStatus(form, file.size > TARGET_BYTES ? "Uploading original video. If it fails, choose a shorter or lower-resolution clip." : "Video ready.");
      }

      const preparedFile = videoInput.files && videoInput.files[0] ? videoInput.files[0] : compressed || file;
      if (preparedFile && preparedFile.size >= CHUNK_UPLOAD_BYTES && supportsChunkedSubmit(form)) {
        setStatus(form, "Uploading video safely in pieces — keep this page open.");
        const complete = await uploadChunkedVideo(preparedFile, form, (pct) => {
          setStatus(form, `Uploading video ${pct}% — retrying pieces if needed.`);
        });
        upsertHidden(form, "tapzyChunkedMediaUrl", complete.mediaUrl || "");
        upsertHidden(form, "tapzyChunkedOriginalName", complete.originalName || preparedFile.name || "");
        upsertHidden(form, "tapzyChunkedMimeType", complete.mimetype || preparedFile.type || "");
        clearInputFile(videoInput);
        setStatus(form, "Video uploaded — posting now.");
      }
    } catch (_) {
      if (file && file.size >= CHUNK_UPLOAD_BYTES && supportsChunkedSubmit(form)) {
        try {
          setStatus(form, "Uploading original video safely in pieces — keep this page open.");
          const complete = await uploadChunkedVideo(file, form, (pct) => {
            setStatus(form, `Uploading video ${pct}% — retrying pieces if needed.`);
          });
          upsertHidden(form, "tapzyChunkedMediaUrl", complete.mediaUrl || "");
          upsertHidden(form, "tapzyChunkedOriginalName", complete.originalName || file.name || "");
          upsertHidden(form, "tapzyChunkedMimeType", complete.mimetype || file.type || "");
          clearInputFile(videoInput);
          setStatus(form, "Video uploaded — posting now.");
        } catch (chunkError) {
          setStatus(form, "Video upload failed. Please try again on a stronger connection.");
          form.dataset.tapzyVideoPrepared = "0";
          form.dataset.tapzyVideoPreparing = "0";
          if (submitter) submitter.disabled = false;
          throw chunkError;
        }
      } else {
        setStatus(form, "Uploading original video.");
      }
    }

    form.dataset.tapzyVideoPrepared = "1";
    form.dataset.tapzyVideoPreparing = "0";
    if (submitter) submitter.disabled = false;
    return true;
  }

  document.addEventListener("submit", function (event) {
    const form = event.target;
    if (!form || !form.matches || !form.matches('form[enctype="multipart/form-data"]')) return;
    if (form.dataset.tapzyVideoPrepared === "1") return;
    const submitter = event.submitter || form.querySelector('button[type="submit"],input[type="submit"]');
    const hasVideo = Array.from(form.querySelectorAll('input[type="file"]')).some((input) => isVideoFile(input.files && input.files[0]));
    if (!hasVideo) return;

    form.dataset.tapzyVideoIntercepting = "1";
    event.preventDefault();
    prepareForm(form, submitter).then(() => {
      form.dataset.tapzyVideoIntercepting = "0";
      if (submitter) submitter.disabled = false;
      if (form.requestSubmit) form.requestSubmit(submitter && !submitter.disabled ? submitter : undefined);
      else form.submit();
    }).catch(() => {
      form.dataset.tapzyVideoIntercepting = "0";
      if (submitter) submitter.disabled = false;
    });
  }, true);

  window.TapzyVideoUpload = {
    prepareForm,
    compressVideo,
  };
})();
