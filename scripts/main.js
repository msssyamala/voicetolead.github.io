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
  const drillPanel = recorder.querySelector('.coach-drills');
  const drillSelect = recorder.querySelector('.coach-drill-select');
  const drillTitle = recorder.querySelector('.coach-drill-title');
  const drillPrompt = recorder.querySelector('.coach-drill-prompt');
  const drillFocus = recorder.querySelector('.coach-drill-focus');
  const livePanel = recorder.querySelector('.coach-live-panel');
  const cueStatus = recorder.querySelector('.coach-cue-status');
  const cueEmoji = recorder.querySelector('.coach-cue-emoji');
  const cueWord = recorder.querySelector('.coach-cue-word');
  const practiceSummary = recorder.querySelector('.coach-practice-summary');
  const summaryTime = recorder.querySelector('[data-summary="time"]');
  const summarySteady = recorder.querySelector('[data-summary="steady"]');
  const summaryFiller = recorder.querySelector('[data-summary="filler"]');
  const summaryEye = recorder.querySelector('[data-summary="eye"]');
  const summaryFocus = recorder.querySelector('[data-summary="focus"]');
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
  let calibrationStartedAt = 0;
  let calibrationSamples = [];
  let volumeCalibration = null;
  let steadyStartedAt = null;
  let lastConfidenceStreakAt = 0;
  let confidenceStreakCount = 0;
  let speechRecognition;
  let speechRecognitionActive = false;
  let speechRecognitionRestartId;
  let speechStartedAt = 0;
  let recognizedWordCount = 0;
  let lastRecognizedWordCount = 0;
  let recognizedText = '';
  let lastFillerText = '';
  let lastFillerCueAt = 0;
  let lastPaceCueAt = 0;
  let speechCueHoldUntil = 0;
  let speechRecognitionStatus = 'idle';
  let nextEyeContactCueAt = 0;
  let eyeContactCueHoldUntil = 0;
  let currentMode = 'feedback';
  let chunks = [];
  let elapsedSeconds = 0;
  let timerId;
  let recordingBlob;
  let recordingUrl;
  let recordingExtension = 'webm';
  let turnstileWidgetId = null;
  const guidedDrills = {
    open: {
      title: 'Open practice',
      prompt: 'Practice any speech, answer, or idea. Focus on speaking clearly and finishing strong.',
      focus: 'steady delivery'
    },
    intro: {
      title: '30-second introduction',
      prompt: 'Introduce yourself, what you care about, and one reason the audience should keep listening.',
      focus: 'clear opening'
    },
    elevator: {
      title: 'Elevator pitch',
      prompt: 'Explain your idea in a short, persuasive way: problem, solution, and why it matters.',
      focus: 'concise message'
    },
    story: {
      title: 'Storytelling practice',
      prompt: 'Tell a short story with a beginning, challenge, turning point, and takeaway.',
      focus: 'organized story'
    },
    interview: {
      title: 'Tell me about yourself',
      prompt: 'Answer like an interview: present yourself, name your strengths, and connect them to your goal.',
      focus: 'confident answer'
    },
    debate: {
      title: 'Debate opening',
      prompt: 'Open with a claim, give one reason, preview your evidence, and close with impact.',
      focus: 'strong structure'
    }
  };
  let practiceMetrics = {
    filler: 0,
    eye: 0,
    paceFast: 0,
    paceSlow: 0,
    pause: 0,
    steady: 0
  };

  const getSelectedDrill = () => {
    const selectedKey = drillSelect && guidedDrills[drillSelect.value] ? drillSelect.value : 'open';
    return guidedDrills[selectedKey];
  };

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

  const resetPracticeMetrics = () => {
    practiceMetrics = {
      filler: 0,
      eye: 0,
      paceFast: 0,
      paceSlow: 0,
      pause: 0,
      steady: 0
    };
  };

  const hidePracticeSummary = () => {
    if (practiceSummary) {
      practiceSummary.hidden = true;
    }
  };

  const getPracticeFocus = () => {
    if (practiceMetrics.filler >= 3) {
      return 'Next focus: try fewer filler words next round.';
    }

    if (practiceMetrics.paceFast > practiceMetrics.paceSlow && practiceMetrics.paceFast > 0) {
      return 'Next focus: slow down slightly and let key ideas land.';
    }

    if (practiceMetrics.paceSlow > 0) {
      return 'Next focus: add a little more energy to your pace.';
    }

    if (practiceMetrics.pause >= 2) {
      return 'Next focus: shorten long pauses between thoughts.';
    }

    if (practiceMetrics.eye >= 3) {
      return 'Next focus: keep connecting with your audience.';
    }

    if (practiceMetrics.steady > 0) {
      return 'Next focus: keep that steady delivery going.';
    }

    return 'Next focus: try one more round and build your rhythm.';
  };

  const updateGuidedDrill = () => {
    const selectedDrill = getSelectedDrill();

    if (drillTitle) {
      drillTitle.textContent = selectedDrill.title;
    }

    if (drillPrompt) {
      drillPrompt.textContent = selectedDrill.prompt;
    }

    if (drillFocus) {
      drillFocus.textContent = `Focus: ${selectedDrill.focus}`;
    }
  };

  const showPracticeSummary = () => {
    if (!practiceSummary) {
      return;
    }

    if (summaryTime) {
      summaryTime.textContent = formatTime(elapsedSeconds);
    }

    if (summarySteady) {
      summarySteady.textContent = String(practiceMetrics.steady);
    }

    if (summaryFiller) {
      summaryFiller.textContent = String(practiceMetrics.filler);
    }

    if (summaryEye) {
      summaryEye.textContent = String(practiceMetrics.eye);
    }

    if (summaryFocus) {
      summaryFocus.textContent = `${getPracticeFocus()} Drill practiced: ${getSelectedDrill().title}.`;
    }

    practiceSummary.hidden = false;
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

  const setLiveCoachDisplay = (stateClass, cueMessage, emoji, word) => {
    if (cueStatus) {
      cueStatus.textContent = cueMessage;
    }

    if (cueEmoji) {
      cueEmoji.textContent = emoji;
    }

    if (cueWord) {
      cueWord.textContent = word;
    }

    if (livePanel) {
      livePanel.classList.remove('is-good', 'is-warning', 'is-alert', 'is-calibrating', 'is-streak', 'is-speech', 'is-eye-contact');

      if (stateClass) {
        livePanel.classList.add(stateClass);
      }

      livePanel.classList.remove('is-refreshed');
      void livePanel.offsetWidth;
      livePanel.classList.add('is-refreshed');
    }
  };

  const getPanelState = (stateClass, pauseMessage, timeMessage) => {
    if (stateClass === 'is-calibrating') {
      return 'is-calibrating';
    }

    if (stateClass === 'is-streak') {
      return 'is-streak';
    }

    if (stateClass === 'is-filler' || stateClass === 'is-pace-fast' || stateClass === 'is-pace-slow') {
      return 'is-speech';
    }

    if (stateClass === 'is-eye-contact') {
      return 'is-eye-contact';
    }

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
    if (stateClass === 'is-calibrating') {
      return { key: 'calibrate', message: 'Speak normally for a few seconds.', emoji: '🎙️', word: 'Calibrate' };
    }

    if (stateClass === 'is-streak') {
      return {
        key: `streak-${confidenceStreakCount}`,
        message: 'Steady delivery. Keep that confidence.',
        emoji: '💪',
        word: `Steady ${confidenceStreakCount}`
      };
    }

    if (stateClass === 'is-filler') {
      return { key: `filler-${lastFillerCueAt}`, message: 'Try the next sentence with fewer filler words.', emoji: '💬', word: 'Filler' };
    }

    if (stateClass === 'is-pace-fast') {
      return { key: `pace-fast-${lastPaceCueAt}`, message: 'Slow your pace slightly.', emoji: '⏱️', word: 'Slow' };
    }

    if (stateClass === 'is-pace-slow') {
      return { key: `pace-slow-${lastPaceCueAt}`, message: 'Add a little more energy to your pace.', emoji: '⚡', word: 'Pace' };
    }

    if (stateClass === 'is-eye-contact') {
      return { key: `eye-${nextEyeContactCueAt}`, message: 'Look toward your audience.', emoji: '👀', word: 'Connect' };
    }

    if (pauseMessage === 'Long pause detected') {
      return { key: 'pause', message: 'Take a breath and continue.', emoji: '🌬️', word: 'Breathe' };
    }

    if (stateClass === 'is-low') {
      return { key: 'louder', message: 'Project your voice a little more.', emoji: '🔊', word: 'Louder' };
    }

    if (stateClass === 'is-high') {
      return { key: 'softer', message: 'Lower your volume slightly.', emoji: '🤫', word: 'Softer' };
    }

    if (timeMessage === 'Start wrapping up.' || timeMessage === 'Finish your final sentence.') {
      return { key: 'wrap', message: timeMessage, emoji: '⏳', word: 'Wrap up' };
    }

    if (stateClass === 'is-good') {
      return { key: 'good', message: 'Good energy. Keep going.', emoji: '✨', word: 'Good' };
    }

    return { key: 'ready', message: 'Start recording when you are ready.', emoji: '✨', word: 'Ready' };
  };

  const getCalibratedVolumeRange = () => {
    const speakingSamples = calibrationSamples
      .filter((sample) => sample > 0.035)
      .sort((first, second) => first - second);

    if (speakingSamples.length < 3) {
      return {
        quiet: 0.08,
        loud: 0.75
      };
    }

    const middleIndex = Math.floor(speakingSamples.length / 2);
    const baseline = speakingSamples.length % 2 === 0
      ? (speakingSamples[middleIndex - 1] + speakingSamples[middleIndex]) / 2
      : speakingSamples[middleIndex];

    return {
      quiet: Math.max(0.05, baseline * 0.55),
      loud: Math.min(0.95, Math.max(0.5, baseline * 1.9))
    };
  };

  const getWords = (text) => {
    const matches = text.toLowerCase().match(/\b[a-z']+\b/g);
    return matches || [];
  };

  const hasFillerWords = (text) => {
    const normalizedText = ` ${text.toLowerCase().replace(/[^a-z'\s]/g, ' ')} `;
    const fillerPatterns = [
      /\bum+\b/,
      /\buh+\b/,
      /\ber+\b/,
      /\bah+\b/,
      /\blike\b/,
      /\byou know\b/,
      /\bi mean\b/,
      /\bkind of\b/,
      /\bsort of\b/,
      /\bbasically\b/,
      /\bactually\b/
    ];

    return fillerPatterns.some((pattern) => pattern.test(normalizedText));
  };

  const getLatestSpeechText = (event) => {
    let latestText = '';

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];

      if (result[0] && result[0].transcript) {
        latestText += ` ${result[0].transcript}`;
      }
    }

    return latestText.trim();
  };

  const shouldHoldSpeechCue = (stateClass) => {
    return stateClass === 'is-filler' || stateClass === 'is-pace-fast' || stateClass === 'is-pace-slow';
  };

  const shouldHoldEyeContactCue = (stateClass) => {
    return stateClass === 'is-eye-contact';
  };

  const getLivePracticeStatus = () => {
    if (speechRecognitionStatus === 'unsupported') {
      return 'Live practice running. Filler and pace cues work best in Chrome or Edge.';
    }

    if (speechRecognitionStatus === 'blocked') {
      return 'Live practice running. Speech recognition is blocked, so filler and pace cues are off.';
    }

    if (speechRecognitionStatus === 'listening') {
      return 'Live practice running. Speech cues are active.';
    }

    return 'Live practice running... stop whenever you are ready.';
  };

  const handleSpeechRecognitionResult = (event) => {
    if (currentMode !== 'practice') {
      return;
    }

    const now = Date.now();
    let transcript = '';
    const latestText = getLatestSpeechText(event);

    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index];

      if (result[0] && result[0].transcript) {
        transcript += ` ${result[0].transcript}`;
      }
    }

    recognizedText = transcript.trim();

    if (!recognizedText) {
      return;
    }

    if (!speechStartedAt) {
      speechStartedAt = now;
    }

    const words = getWords(recognizedText);
    recognizedWordCount = Math.max(recognizedWordCount, words.length);

    if (
      hasFillerWords(latestText || recognizedText) &&
      latestText !== lastFillerText &&
      now - lastFillerCueAt > 2500
    ) {
      lastFillerText = latestText;
      lastFillerCueAt = now;
      setLiveCoachCue('is-filler', '', getTimeMessage());
      return;
    }

    const elapsedSpeechMinutes = (now - speechStartedAt) / 60000;

    if (
      elapsedSpeechMinutes < 0.15 ||
      recognizedWordCount < 18 ||
      recognizedWordCount === lastRecognizedWordCount ||
      now - lastPaceCueAt < 9000
    ) {
      return;
    }

    const wordsPerMinute = recognizedWordCount / elapsedSpeechMinutes;

    if (wordsPerMinute > 165) {
      lastPaceCueAt = now;
      lastRecognizedWordCount = recognizedWordCount;
      setLiveCoachCue('is-pace-fast', '', getTimeMessage());
    } else if (wordsPerMinute < 105) {
      lastPaceCueAt = now;
      lastRecognizedWordCount = recognizedWordCount;
      setLiveCoachCue('is-pace-slow', '', getTimeMessage());
    }
  };

  const stopSpeechRecognition = () => {
    speechRecognitionActive = false;

    if (speechRecognitionRestartId) {
      clearTimeout(speechRecognitionRestartId);
      speechRecognitionRestartId = null;
    }

    if (speechRecognition) {
      speechRecognition.onend = null;
      speechRecognition.onerror = null;
      speechRecognition.onresult = null;

      try {
        speechRecognition.stop();
      } catch (error) {
        // The recognition session may already be stopped.
      }
    }

    speechRecognition = null;
  };

  const startSpeechRecognition = () => {
    const SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    speechRecognitionStatus = 'available';

    if (!SpeechRecognitionConstructor) {
      speechRecognitionStatus = 'unsupported';
      setStatus(getLivePracticeStatus());
      return;
    }

    stopSpeechRecognition();

    speechStartedAt = 0;
    recognizedWordCount = 0;
    lastRecognizedWordCount = 0;
    recognizedText = '';
    lastFillerText = '';
    lastFillerCueAt = 0;
    lastPaceCueAt = 0;
    speechCueHoldUntil = 0;
    speechRecognitionActive = true;
    speechRecognition = new SpeechRecognitionConstructor();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = 'en-US';
    speechRecognition.onstart = () => {
      speechRecognitionStatus = 'listening';
      setStatus(getLivePracticeStatus());
    };
    speechRecognition.onresult = handleSpeechRecognitionResult;
    speechRecognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        speechRecognitionActive = false;
        speechRecognitionStatus = 'blocked';
        setStatus(getLivePracticeStatus());
      }
    };
    speechRecognition.onend = () => {
      if (!speechRecognitionActive || currentMode !== 'practice') {
        return;
      }

      speechRecognitionRestartId = window.setTimeout(() => {
        if (!speechRecognitionActive || currentMode !== 'practice' || !speechRecognition) {
          return;
        }

        try {
          speechRecognition.start();
        } catch (error) {
          // Some browsers briefly lock recognition after it ends.
        }
      }, 400);
    };

    try {
      speechRecognition.start();
    } catch (error) {
      speechRecognitionActive = false;
      speechRecognitionStatus = 'unsupported';
      setStatus(getLivePracticeStatus());
    }
  };

  const setLiveCoachCue = (stateClass, pauseMessage, timeMessage) => {
    const nextCue = getCue(stateClass, pauseMessage, timeMessage);
    const now = Date.now();
    const isPriorityCue = stateClass === 'is-filler';
    const shouldChangeCue =
      isPriorityCue ||
      (nextCue.key !== lastCueKey && (lastCueKey === '' || now - lastCueChangeAt > 2200 || nextCue.key === 'pause'));

    if (!shouldChangeCue) {
      return;
    }

    lastCueKey = nextCue.key;
    lastCueChangeAt = now;

    if (currentMode === 'practice') {
      if (stateClass === 'is-filler') {
        practiceMetrics.filler += 1;
      } else if (stateClass === 'is-pace-fast') {
        practiceMetrics.paceFast += 1;
      } else if (stateClass === 'is-pace-slow') {
        practiceMetrics.paceSlow += 1;
      } else if (stateClass === 'is-eye-contact') {
        practiceMetrics.eye += 1;
      } else if (stateClass === 'is-streak') {
        practiceMetrics.steady += 1;
      } else if (nextCue.key === 'pause') {
        practiceMetrics.pause += 1;
      }
    }

    if (shouldHoldSpeechCue(stateClass)) {
      speechCueHoldUntil = now + (stateClass === 'is-filler' ? 5200 : 4200);
    }

    if (shouldHoldEyeContactCue(stateClass)) {
      eyeContactCueHoldUntil = now + 3600;
    }

    setLiveCoachDisplay(
      getPanelState(stateClass, pauseMessage, timeMessage),
      nextCue.message,
      nextCue.emoji,
      nextCue.word
    );
  };

  const setMode = (mode) => {
    currentMode = mode;
    recorder.classList.toggle('is-feedback', mode === 'feedback');
    recorder.classList.toggle('is-practice', mode === 'practice');
    hidePracticeSummary();

    modeButtons.forEach((button) => {
      const isActive = button.dataset.mode === mode;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });

    startButton.textContent = mode === 'feedback' ? 'Start Recording' : 'Start Live Practice';
    resetButton.textContent = mode === 'feedback' ? 'Record Again' : 'Practice Again';
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
      if (drillPanel) {
        drillPanel.hidden = false;
      }
      updateGuidedDrill();
      resetTurnstileWidget();
    } else if (drillPanel) {
      drillPanel.hidden = true;
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
    stopSpeechRecognition();
    calibrationStartedAt = 0;
    calibrationSamples = [];
    volumeCalibration = null;
    steadyStartedAt = null;
    lastConfidenceStreakAt = 0;
    confidenceStreakCount = 0;
    speechStartedAt = 0;
    recognizedWordCount = 0;
    lastRecognizedWordCount = 0;
    recognizedText = '';
    lastFillerText = '';
    lastFillerCueAt = 0;
    lastPaceCueAt = 0;
    speechCueHoldUntil = 0;
    speechRecognitionStatus = 'idle';
    nextEyeContactCueAt = 0;
    eyeContactCueHoldUntil = 0;

    if (livePanel) {
      livePanel.hidden = currentMode !== 'practice';
    }

    setLiveCoachDisplay('', 'Start recording when you are ready.', '✨', 'Ready');
  };

  const startLiveCoach = () => {
    if (!livePanel || !window.AudioContext && !window.webkitAudioContext) {
      setLiveCoachDisplay('', 'Live coach is not available in this browser.', '⚠️', 'Unavailable');
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

    setLiveCoachDisplay('', 'Listening. Begin your speech.', '✨', 'Ready');
    lastCueKey = '';
    lastCueChangeAt = 0;
    calibrationStartedAt = Date.now();
    calibrationSamples = [];
    volumeCalibration = null;
    steadyStartedAt = null;
    lastConfidenceStreakAt = 0;
    confidenceStreakCount = 0;
    speechStartedAt = 0;
    recognizedWordCount = 0;
    lastRecognizedWordCount = 0;
    recognizedText = '';
    lastFillerText = '';
    lastFillerCueAt = 0;
    lastPaceCueAt = 0;
    speechCueHoldUntil = 0;
    speechRecognitionStatus = 'idle';
    nextEyeContactCueAt = 0;
    eyeContactCueHoldUntil = 0;
    startSpeechRecognition();

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

      if (!volumeCalibration) {
        calibrationSamples.push(level);

        if (now - calibrationStartedAt < 5000) {
          setLiveCoachCue('is-calibrating', '', getTimeMessage());
          liveCoachId = requestAnimationFrame(analyzeAudio);
          return;
        }

        volumeCalibration = getCalibratedVolumeRange();
        nextEyeContactCueAt = now + 7000;
        setStatus(getLivePracticeStatus());
      }

      let pauseMessage = 'Nice flow';
      let stateClass = 'is-good';
      const timeMessage = getTimeMessage();
      const quietThreshold = volumeCalibration ? volumeCalibration.quiet : 0.08;
      const loudThreshold = volumeCalibration ? volumeCalibration.loud : 0.75;

      if (level < quietThreshold) {
        stateClass = 'is-low';
        quietStartedAt = quietStartedAt || now;

        if (now - quietStartedAt > 2500) {
          pauseMessage = 'Long pause detected';
        } else {
          pauseMessage = 'Listening';
        }
      } else {
        quietStartedAt = null;

        if (level > loudThreshold) {
          stateClass = 'is-high';
        }
      }

      if (stateClass === 'is-good') {
        steadyStartedAt = steadyStartedAt || now;

        if (now - steadyStartedAt > 6000 && now - lastConfidenceStreakAt > 9000) {
          confidenceStreakCount += 1;
          lastConfidenceStreakAt = now;
          setLiveCoachCue('is-streak', pauseMessage, timeMessage);
          liveCoachId = requestAnimationFrame(analyzeAudio);
          return;
        }
      } else {
        steadyStartedAt = null;
      }

      if (now < speechCueHoldUntil) {
        liveCoachId = requestAnimationFrame(analyzeAudio);
        return;
      }

      if (now < eyeContactCueHoldUntil) {
        liveCoachId = requestAnimationFrame(analyzeAudio);
        return;
      }

      if (nextEyeContactCueAt && now >= nextEyeContactCueAt) {
        nextEyeContactCueAt = now + 7000;
        setLiveCoachCue('is-eye-contact', pauseMessage, timeMessage);
        liveCoachId = requestAnimationFrame(analyzeAudio);
        return;
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
    mediaRecorder = null;
    stopLiveCoach();
    stopStream();
    resetPracticeMetrics();
    hidePracticeSummary();
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

  const finishPractice = () => {
    clearInterval(timerId);
    timerId = null;
    stopButton.disabled = true;
    startButton.disabled = false;
    resetButton.disabled = false;
    stopLiveCoach();
    stopStream();
    playback.hidden = true;
    playback.removeAttribute('src');
    frame.classList.remove('has-recording');
    modeButtons.forEach((button) => {
      button.disabled = false;
    });
    showPracticeSummary();
    setStatus('Live practice complete. Nothing was recorded or uploaded.');
  };

  const stopRecording = () => {
    if (currentMode === 'practice') {
      finishPractice();
      return;
    }

    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || (currentMode === 'feedback' && !window.MediaRecorder)) {
      setStatus('Video recording is not supported in this browser. Please try the latest Chrome, Edge, Firefox, or Safari.');
      return;
    }

    resetRecorder();
    resetPracticeMetrics();
    hidePracticeSummary();
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
        stopButton.disabled = false;
        setStatus('Calibrating your microphone... speak normally for a few seconds.');
      } else {
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
        setStatus('Recording for AI feedback... it will stop automatically at 1 minute.');
      }

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
  if (drillSelect) {
    drillSelect.addEventListener('change', updateGuidedDrill);
  }
}
