document.addEventListener('DOMContentLoaded', function () {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      links.classList.toggle('show');
    });
  }

  initSpeechCoachRecorder();
  registerServiceWorker();
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // Installation still works as a normal website if service workers are unavailable.
    });
  });
}

function initSpeechCoachRecorder() {
  const recorder = document.querySelector('.coach-recorder');

  if (!recorder) {
    return;
  }

  const maxSeconds = Number(recorder.dataset.maxSeconds) || 60;
  const uploadUrl = recorder.dataset.uploadUrl;
  const preview = recorder.querySelector('.coach-preview');
  const playback = recorder.querySelector('.coach-playback');
  const frame = recorder.querySelector('.coach-video-frame');
  const modeButtons = Array.from(recorder.querySelectorAll('.coach-mode'));
  const startButton = recorder.querySelector('.coach-start');
  const stopButton = recorder.querySelector('.coach-stop');
  const resetButton = recorder.querySelector('.coach-reset');
  const submitForm = recorder.querySelector('.coach-submit-form');
  const resultActions = recorder.querySelector('.coach-result-actions');
  const submitButton = recorder.querySelector('.coach-submit');
  const status = recorder.querySelector('.coach-status');
  const timer = recorder.querySelector('.coach-timer');
  const download = recorder.querySelector('.coach-download');
  const modeNote = recorder.querySelector('.coach-mode-note');
  const livePanel = recorder.querySelector('.coach-live-panel');
  const cueStatus = recorder.querySelector('.coach-cue-status');
  const cueEmoji = recorder.querySelector('.coach-cue-emoji');
  const turnstileContainer = recorder.querySelector('.coach-turnstile');
  const turnstileToken = recorder.querySelector('.coach-turnstile-token');

  let mediaRecorder;
  let stream;
  let audioContext;
  let audioAnalyser;
  let audioData;
  let liveCoachId;
  let quietStartedAt;
  let lastLiveCoachUpdate = 0;
  let lastCueKey = '';
  let lastCueChangeAt = 0;
  let currentMode = 'feedback';
  let chunks = [];
  let elapsedSeconds = 0;
  let timerId;
  let recordingBlob;
  let recordingUrl;
  let recordingExtension = 'webm';
  let turnstileWidgetId = null;

  const setStatus = (message) => {
    status.textContent = message;
  };

  const formatTime = (seconds) => {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
    const remainingSeconds = String(seconds % 60).padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
  };

  const updateTimer = () => {
    timer.textContent = currentMode === 'feedback'
      ? `${formatTime(elapsedSeconds)} / ${formatTime(maxSeconds)}`
      : formatTime(elapsedSeconds);
  };

  const getTimeMessage = () => {
    if (currentMode === 'practice') {
      return 'Practice as long as you need.';
    }

    const remainingSeconds = maxSeconds - elapsedSeconds;

    if (remainingSeconds <= 5) {
      return 'Finish your final sentence.';
    }

    if (remainingSeconds <= 15) {
      return 'Start wrapping up.';
    }

    return 'You have time. Keep going.';
  };

  const resetRecordingUrl = () => {
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
      recordingUrl = null;
    }
  };

  const stopStream = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    preview.srcObject = null;
    frame.classList.remove('is-previewing');
  };

  const setLiveCoachDisplay = (stateClass, cueMessage, emoji) => {
    if (cueStatus) {
      cueStatus.textContent = cueMessage;
    }

    if (cueEmoji) {
      cueEmoji.textContent = emoji;
    }

    if (livePanel) {
      livePanel.classList.remove('is-good', 'is-warning', 'is-alert');

      if (stateClass) {
        livePanel.classList.add(stateClass);
      }

      livePanel.classList.remove('is-refreshed');
      void livePanel.offsetWidth;
      livePanel.classList.add('is-refreshed');
    }
  };

  const getPanelState = (stateClass, pauseMessage, timeMessage) => {
    if (stateClass === 'is-high' || pauseMessage === 'Long pause detected') {
      return 'is-alert';
    }

    if (stateClass === 'is-low' || timeMessage === 'Start wrapping up.' || timeMessage === 'Finish your final sentence.') {
      return 'is-warning';
    }

    if (stateClass === 'is-good') {
      return 'is-good';
    }

    return '';
  };

  const getCue = (stateClass, pauseMessage, timeMessage) => {
    if (pauseMessage === 'Long pause detected') {
      return { key: 'pause', message: 'Take a breath and continue.', emoji: '🌬️' };
    }

    if (stateClass === 'is-low') {
      return { key: 'louder', message: 'Project your voice a little more.', emoji: '🔊' };
    }

    if (stateClass === 'is-high') {
      return { key: 'softer', message: 'Lower your volume slightly.', emoji: '🤏' };
    }

    if (timeMessage === 'Start wrapping up.' || timeMessage === 'Finish your final sentence.') {
      return { key: 'wrap', message: timeMessage, emoji: '⏳' };
    }

    if (stateClass === 'is-good') {
      return { key: 'good', message: 'Good energy. Keep going.', emoji: '✨' };
    }

    return { key: 'ready', message: 'Start recording when you are ready.', emoji: '✨' };
  };

  const setLiveCoachCue = (stateClass, pauseMessage, timeMessage) => {
    const nextCue = getCue(stateClass, pauseMessage, timeMessage);
    const now = Date.now();
    const shouldChangeCue =
      nextCue.key !== lastCueKey && (lastCueKey === '' || now - lastCueChangeAt > 2200 || nextCue.key === 'pause');

    if (!shouldChangeCue) {
      return;
    }

    lastCueKey = nextCue.key;
    lastCueChangeAt = now;

    setLiveCoachDisplay(
      getPanelState(stateClass, pauseMessage, timeMessage),
      nextCue.message,
      nextCue.emoji
    );
  };

  const setMode = (mode) => {
    currentMode = mode;
    recorder.classList.toggle('is-feedback', mode === 'feedback');
    recorder.classList.toggle('is-practice', mode === 'practice');

    modeButtons.forEach((button) => {
      const isActive = button.dataset.mode === mode;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });

    startButton.textContent = mode === 'feedback' ? 'Start Recording' : 'Start Live Practice';
    submitButton.textContent = 'Submit for Feedback';
    updateTimer();
    stopLiveCoach();
    if (livePanel) {
      livePanel.hidden = mode !== 'practice';
    }
    if (mode === 'practice') {
      submitForm.hidden = true;
      if (resultActions) {
        resultActions.hidden = true;
      }
      resetTurnstileWidget();
    }
    if (modeNote) {
      modeNote.textContent = mode === 'feedback'
        ? 'Record up to 1 minute, then submit for written AI feedback.'
        : 'Practice delivery with real-time coaching. No 1-minute limit and nothing uploads.';
    }
    setStatus('');
  };

  const stopLiveCoach = () => {
    if (liveCoachId) {
      cancelAnimationFrame(liveCoachId);
      liveCoachId = null;
    }

    if (audioContext) {
      audioContext.close().catch(() => null);
      audioContext = null;
    }

    audioAnalyser = null;
    audioData = null;
    quietStartedAt = null;
    lastLiveCoachUpdate = 0;
    lastCueKey = '';
    lastCueChangeAt = 0;

    if (livePanel) {
      livePanel.hidden = currentMode !== 'practice';
    }

    setLiveCoachDisplay('', 'Start recording when you are ready.', '✨');
  };

  const startLiveCoach = () => {
    if (!livePanel || !window.AudioContext && !window.webkitAudioContext) {
      setLiveCoachDisplay('', 'Live coach is not available in this browser.', '⚠️');
      return;
    }

    livePanel.hidden = false;

    if (liveCoachId) {
      cancelAnimationFrame(liveCoachId);
      liveCoachId = null;
    }

    if (audioContext) {
      audioContext.close().catch(() => null);
      audioContext = null;
    }

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextConstructor();
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 1024;
    audioAnalyser.smoothingTimeConstant = 0.75;
    audioData = new Uint8Array(audioAnalyser.fftSize);

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(audioAnalyser);

    setLiveCoachDisplay('', 'Listening. Begin your speech.', '✨');
    lastCueKey = '';
    lastCueChangeAt = 0;

    const analyzeAudio = () => {
      audioAnalyser.getByteTimeDomainData(audioData);

      let sumSquares = 0;
      for (let index = 0; index < audioData.length; index += 1) {
        const centeredSample = (audioData[index] - 128) / 128;
        sumSquares += centeredSample * centeredSample;
      }

      const rms = Math.sqrt(sumSquares / audioData.length);
      const level = Math.min(rms * 5, 1);
      const now = Date.now();

      if (now - lastLiveCoachUpdate < 1200) {
        liveCoachId = requestAnimationFrame(analyzeAudio);
        return;
      }

      lastLiveCoachUpdate = now;

      let pauseMessage = 'Nice flow';
      let stateClass = 'is-good';
      const timeMessage = getTimeMessage();

      if (level < 0.08) {
        stateClass = 'is-low';
        quietStartedAt = quietStartedAt || now;

        if (now - quietStartedAt > 2500) {
          pauseMessage = 'Long pause detected';
        } else {
          pauseMessage = 'Listening';
        }
      } else {
        quietStartedAt = null;

        if (level > 0.75) {
          stateClass = 'is-high';
        }
      }

      setLiveCoachCue(stateClass, pauseMessage, timeMessage);
      liveCoachId = requestAnimationFrame(analyzeAudio);
    };

    liveCoachId = requestAnimationFrame(analyzeAudio);
  };

  const resetTurnstileWidget = () => {
    if (turnstileToken) {
      turnstileToken.value = '';
    }

    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
  };

  const renderTurnstileWidget = () => {
    if (!turnstileContainer || !turnstileToken || turnstileWidgetId !== null) {
      return;
    }

    if (!window.turnstile) {
      window.setTimeout(renderTurnstileWidget, 300);
      return;
    }

    turnstileWidgetId = window.turnstile.render(turnstileContainer, {
      sitekey: turnstileContainer.dataset.sitekey,
      callback: (token) => {
        turnstileToken.value = token;
      },
      'expired-callback': () => {
        turnstileToken.value = '';
      },
      'error-callback': () => {
        turnstileToken.value = '';
        setStatus('Bot protection could not load. Please refresh the page and try again.');
      }
    });
  };

  const resetRecorder = () => {
    clearInterval(timerId);
    timerId = null;
    elapsedSeconds = 0;
    chunks = [];
    resetRecordingUrl();
    recordingBlob = null;
    recordingExtension = 'webm';
    stopLiveCoach();
    stopStream();
    updateTimer();
    playback.hidden = true;
    playback.removeAttribute('src');
    submitForm.hidden = true;
    if (resultActions) {
      resultActions.hidden = true;
    }
    resetTurnstileWidget();
    submitButton.disabled = false;
    download.hidden = true;
    download.removeAttribute('href');
    startButton.disabled = false;
    stopButton.disabled = true;
    resetButton.disabled = true;
    modeButtons.forEach((button) => {
      button.disabled = false;
    });
    frame.classList.remove('has-recording');
    setStatus('');
  };

  const getSupportedMimeType = () => {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4'
    ];

    return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  };

  const finishRecording = () => {
    clearInterval(timerId);
    timerId = null;
    stopButton.disabled = true;
    startButton.disabled = false;
    resetButton.disabled = false;
    stopLiveCoach();
    stopStream();

    const mimeType = mediaRecorder && mediaRecorder.mimeType ? mediaRecorder.mimeType : 'video/webm';
    const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(chunks, { type: mimeType });

    recordingBlob = blob;
    recordingExtension = extension;
    resetRecordingUrl();
    recordingUrl = URL.createObjectURL(blob);
    playback.src = recordingUrl;
    playback.hidden = false;
    playback.muted = false;
    frame.classList.add('has-recording');
    download.href = recordingUrl;
    download.download = `voice-to-lead-speech-coach.${extension}`;
    download.hidden = false;
    modeButtons.forEach((button) => {
      button.disabled = false;
    });

    if (currentMode === 'feedback') {
      submitForm.hidden = false;
      if (resultActions) {
        resultActions.hidden = false;
      }
      submitButton.hidden = false;
      renderTurnstileWidget();
      setStatus('Recording complete. Review it here, then submit it for feedback.');
    } else {
      submitForm.hidden = true;
      if (resultActions) {
        resultActions.hidden = true;
      }
      submitButton.hidden = true;
      download.hidden = true;
      setStatus('Live practice complete. Review your recording here. Nothing was uploaded.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      setStatus('Video recording is not supported in this browser. Please try the latest Chrome, Edge, Firefox, or Safari.');
      return;
    }

    resetRecorder();
    startButton.disabled = true;
    modeButtons.forEach((button) => {
      button.disabled = true;
    });
    setStatus('Opening your camera and microphone...');

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: 'user'
        }
      });

      preview.srcObject = stream;
      preview.hidden = false;
      await preview.play();
      frame.classList.add('is-previewing');
      if (currentMode === 'practice') {
        startLiveCoach();
      }

      const mimeType = getSupportedMimeType();
      mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      });

      mediaRecorder.addEventListener('stop', finishRecording, { once: true });
      mediaRecorder.start();
      stopButton.disabled = false;
      setStatus(currentMode === 'feedback'
        ? 'Recording for AI feedback... it will stop automatically at 1 minute.'
        : 'Live practice running... stop whenever you are ready.');

      timerId = setInterval(() => {
        elapsedSeconds += 1;
        updateTimer();

        if (currentMode === 'feedback' && elapsedSeconds >= maxSeconds) {
          stopRecording();
        }
      }, 1000);
    } catch (error) {
      resetRecorder();
      setStatus('Camera or microphone access was not available. Please allow access and try again.');
    }
  };

  const submitRecording = async (event) => {
    event.preventDefault();

    if (currentMode !== 'feedback') {
      submitForm.hidden = true;
      submitButton.hidden = true;
      setStatus('Live Practice does not upload or submit recordings.');
      return;
    }

    if (!submitForm.reportValidity()) {
      return;
    }

    if (!recordingBlob) {
      setStatus('Please record a video before submitting.');
      return;
    }

    if (turnstileToken && !turnstileToken.value) {
      setStatus('Please complete the bot protection check before submitting.');
      return;
    }

    if (!uploadUrl) {
      setStatus('The upload endpoint is not configured yet.');
      return;
    }

    const formData = new FormData(submitForm);
    formData.append('video', recordingBlob, `speech.${recordingExtension}`);

    submitButton.disabled = true;
    resetButton.disabled = true;
    startButton.disabled = true;
    setStatus('Submitting your recording for feedback...');

    try {
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed.');
      }

      const submissionId = result.submission && result.submission.id ? result.submission.id : 'received';
      const feedbackUrl = `feedback.html?id=${encodeURIComponent(submissionId)}`;
      submitForm.hidden = true;
      resetButton.disabled = false;
      startButton.disabled = false;
      status.innerHTML = `Submitted successfully. Save this ID: <strong>${submissionId}</strong>. Feedback is being prepared. <a href="${feedbackUrl}">View feedback</a>`;
    } catch (error) {
      submitButton.disabled = false;
      resetButton.disabled = false;
      startButton.disabled = false;
      resetTurnstileWidget();
      setStatus(`Submission failed: ${error.message}`);
    }
  };

  updateTimer();
  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.mode && button.dataset.mode !== currentMode) {
        resetRecorder();
        setMode(button.dataset.mode);
      }
    });
  });
  setMode(currentMode);
  startButton.addEventListener('click', startRecording);
  stopButton.addEventListener('click', stopRecording);
  resetButton.addEventListener('click', resetRecorder);
  submitForm.addEventListener('submit', submitRecording);
}
