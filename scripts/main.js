document.addEventListener('DOMContentLoaded', function () {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      links.classList.toggle('show');
    });
  }

  initSpeechCoachRecorder();
});

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
  const startButton = recorder.querySelector('.coach-start');
  const stopButton = recorder.querySelector('.coach-stop');
  const resetButton = recorder.querySelector('.coach-reset');
  const submitForm = recorder.querySelector('.coach-submit-form');
  const submitButton = recorder.querySelector('.coach-submit');
  const status = recorder.querySelector('.coach-status');
  const timer = recorder.querySelector('.coach-timer');
  const download = recorder.querySelector('.coach-download');

  let mediaRecorder;
  let stream;
  let chunks = [];
  let elapsedSeconds = 0;
  let timerId;
  let recordingBlob;
  let recordingUrl;
  let recordingExtension = 'webm';

  const setStatus = (message) => {
    status.textContent = message;
  };

  const formatTime = (seconds) => {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
    const remainingSeconds = String(seconds % 60).padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
  };

  const updateTimer = () => {
    timer.textContent = `${formatTime(elapsedSeconds)} / ${formatTime(maxSeconds)}`;
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

  const resetRecorder = () => {
    clearInterval(timerId);
    timerId = null;
    elapsedSeconds = 0;
    chunks = [];
    resetRecordingUrl();
    recordingBlob = null;
    recordingExtension = 'webm';
    stopStream();
    updateTimer();
    playback.hidden = true;
    playback.removeAttribute('src');
    submitForm.hidden = true;
    submitButton.disabled = false;
    download.hidden = true;
    download.removeAttribute('href');
    startButton.disabled = false;
    stopButton.disabled = true;
    resetButton.disabled = true;
    frame.classList.remove('has-recording');
    setStatus('Ready when you are.');
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
    submitForm.hidden = false;
    setStatus('Recording complete. Review it here, then submit it for feedback.');
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
      setStatus('Recording... it will stop automatically at 1 minute.');

      timerId = setInterval(() => {
        elapsedSeconds += 1;
        updateTimer();

        if (elapsedSeconds >= maxSeconds) {
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

    if (!recordingBlob) {
      setStatus('Please record a video before submitting.');
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
      status.innerHTML = `Submitted successfully. Save this ID: <strong>${submissionId}</strong>. <a href="${feedbackUrl}">View feedback</a>`;
    } catch (error) {
      submitButton.disabled = false;
      resetButton.disabled = false;
      startButton.disabled = false;
      setStatus(`Submission failed: ${error.message}`);
    }
  };

  updateTimer();
  startButton.addEventListener('click', startRecording);
  stopButton.addEventListener('click', stopRecording);
  resetButton.addEventListener('click', resetRecorder);
  submitForm.addEventListener('submit', submitRecording);
}
