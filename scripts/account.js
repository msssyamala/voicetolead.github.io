import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://gdyxyvhshltlshyfwdqd.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lX69FPCqL6G0Yztxvn7U_g_KuOQySEb';
const SPEECH_COACH_API_BASE = 'https://speech-coach-api.voicetolead.workers.dev';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

window.VoiceToLeadAuth = {
  async getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data && data.session ? data.session.access_token : null;
  },
};

const authForm = document.querySelector('[data-auth-form]');
const authStatus = document.querySelector('[data-auth-status]');
const authSubmitButton = document.querySelector('[data-auth-submit]');
const dashboardStatus = document.querySelector('[data-dashboard-status]');
const dashboardContent = document.querySelector('[data-dashboard-content]');
const userEmail = document.querySelector('[data-user-email]');
const signOutButton = document.querySelector('[data-sign-out]');
const dashboardHistory = document.querySelector('[data-dashboard-history]');
const dashboardHistoryCount = document.querySelector('[data-dashboard-history-count]');
const savedSummary = document.querySelector('[data-dashboard-saved-summary]');
const profileForm = document.querySelector('[data-profile-form]');
const profileStatus = document.querySelector('[data-profile-status]');
const profileMessage = document.querySelector('[data-profile-message]');
const onboardingPanel = document.querySelector('[data-onboarding-panel]');
const modeButtons = Array.from(document.querySelectorAll('[data-dashboard-mode-button]'));
const modePanels = Array.from(document.querySelectorAll('[data-dashboard-mode-panel]'));
const questGoalButtons = Array.from(document.querySelectorAll('[data-quest-goal]'));
const recorderTitle = document.querySelector('[data-recorder-title]');
const recorderNote = document.querySelector('[data-recorder-note]');
const recorderBadge = document.querySelector('[data-recorder-badge]');
const recorderModeNote = document.querySelector('[data-recorder-mode-note]');
const questLevels = [
  'Brave Starter',
  'Clear Communicator',
  'Confident Speaker',
  'Story Builder',
  'Voice Leader',
];
const questGoals = {
  confidence: {
    name: 'Speak with confidence',
    challenge: '30-second intro',
    note: 'Start with a short introduction and practice sounding steady from the first sentence.',
    drill: 'intro',
  },
  interviews: {
    name: 'Get ready for interviews',
    challenge: 'Tell me about yourself',
    note: 'Practice who you are, one strength, and one goal you are working toward.',
    drill: 'interview',
  },
  speech_debate: {
    name: 'Prepare for speech/debate',
    challenge: 'Debate opening',
    note: 'Make one clear claim, give a reason, and end with impact.',
    drill: 'debate',
  },
  stories: {
    name: 'Tell better stories',
    challenge: 'Storytelling practice',
    note: 'Tell a short story with a beginning, challenge, turning point, and takeaway.',
    drill: 'story',
  },
  fillers: {
    name: 'Reduce filler words',
    challenge: 'Fewer fillers challenge',
    note: 'Try one short answer where every pause is silent instead of filled with filler words.',
    drill: 'open',
  },
};
let selectedQuestGoalKey = 'confidence';
let dashboardSubmissionsCache = [];

const setText = (element, message) => {
  if (element) {
    element.textContent = message;
  }
};

const setTextAll = (selector, message) => {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = message;
  });
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatDate = (value) => {
  if (!value) {
    return 'Recent practice';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Recent practice';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const getFeedback = (submission) => submission.final_feedback || submission.speech_feedback || null;

const getMetric = (feedback, key) => feedback && feedback.coaching_metrics
  ? feedback.coaching_metrics[key]
  : null;

const setStat = (key, value, note) => {
  setTextAll(`[data-dashboard-stat="${key}"]`, value);
  setTextAll(`[data-dashboard-stat-note="${key}"]`, note);
};

const setMetricCard = (key, metric) => {
  const card = document.querySelector(`[data-metric-card="${key}"]`);

  if (!card || !metric) {
    return;
  }

  const scoreElement = card.querySelector('[data-metric-score]');
  const bar = card.querySelector('[data-metric-bar]');
  const note = card.querySelector('[data-metric-note]');
  const score = metric.score;
  const hasScore = typeof score === 'number';

  setText(scoreElement, hasScore ? `${score}/10` : '--');
  setText(note, metric.notes || 'More feedback will appear here after analysis.');

  if (bar) {
    bar.style.width = hasScore ? `${Math.max(0, Math.min(100, score * 10))}%` : '0%';
  }
};

const getSelectedQuestGoal = () => questGoals[selectedQuestGoalKey] || questGoals.confidence;

const setQuestGoal = (goalKey, options = {}) => {
  selectedQuestGoalKey = questGoals[goalKey] ? goalKey : 'confidence';
  const goal = getSelectedQuestGoal();

  questGoalButtons.forEach((button) => {
    const isActive = button.dataset.questGoal === selectedQuestGoalKey;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  setText(document.querySelector('[data-quest-goal-name]'), goal.name);
  setText(document.querySelector('[data-quest-goal-note]'), goal.note);

  if (options.save !== false) {
    window.localStorage.setItem('voiceToLeadQuestGoal', selectedQuestGoalKey);
  }

  document.dispatchEvent(new CustomEvent('voicetolead:quest-goal-change', {
    detail: {
      goal: selectedQuestGoalKey,
      drill: goal.drill,
    },
  }));
};

const setDashboardMode = (mode) => {
  const nextMode = mode === 'coach' ? 'coach' : 'quest';
  const isCoachMode = nextMode === 'coach';

  modeButtons.forEach((button) => {
    const isActive = button.dataset.dashboardModeButton === nextMode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  modePanels.forEach((panel) => {
    const isActive = panel.dataset.dashboardModePanel === nextMode;
    panel.classList.toggle('is-active', isActive);
    panel.hidden = !isActive;
  });

  setText(recorderTitle, isCoachMode ? 'Record Account Practice' : 'Start a Voice Quest');
  setText(recorderNote, isCoachMode
    ? 'Record up to 1 minute. This version saves feedback to your signed-in account.'
    : 'Pick a mission. Record up to 1 minute. Submit for coach notes.');
  setText(recorderBadge, isCoachMode ? 'Account-aware recording' : 'Student recording');
  setText(recorderModeNote, isCoachMode
    ? 'Record up to 1 minute, then submit for saved AI feedback.'
    : 'Choose a drill, record, then submit.');

  document.dispatchEvent(new CustomEvent('voicetolead:dashboard-mode-change', {
    detail: { mode: nextMode },
  }));

  if (!isCoachMode) {
    setQuestGoal(selectedQuestGoalKey, { save: false });
  }

  window.localStorage.setItem('voiceToLeadDashboardMode', nextMode);
};

const updateQuestMode = (submissions, latestFeedback) => {
  const readyCount = submissions.filter((submission) => getFeedback(submission)).length;
  const levelIndex = Math.min(questLevels.length - 1, readyCount);
  const level = questLevels[levelIndex];
  const firstStrength = latestFeedback && Array.isArray(latestFeedback.strengths) && latestFeedback.strengths[0]
    ? latestFeedback.strengths[0]
    : 'Waiting for your first quest';
  const firstNextStep = latestFeedback && Array.isArray(latestFeedback.top_3_next_steps) && latestFeedback.top_3_next_steps[0]
    ? latestFeedback.top_3_next_steps[0]
    : 'Tell us who you are and one thing you care about.';
  const goal = getSelectedQuestGoal();
  const earnedBadges = ['First Practice'];

  if (readyCount >= 1) {
    earnedBadges.push('Clear Voice');
  }

  if (readyCount >= 2) {
    earnedBadges.push('Strong Finish');
  }

  if (readyCount >= 3) {
    earnedBadges.push('Practice Streak');
  }

  setTextAll('[data-quest-level]', level);
  setTextAll('[data-quest-message]', readyCount > 0
    ? `You have completed ${readyCount} quest${readyCount === 1 ? '' : 's'}. Keep building your voice.`
    : 'Start your first quest. Every try counts.');
  setTextAll('[data-quest-count]', String(readyCount));
  setTextAll('[data-quest-strength]', firstStrength);
  setTextAll('[data-quest-challenge]', latestFeedback ? 'Your next quest' : goal.challenge);
  setTextAll('[data-quest-challenge-note]', latestFeedback ? firstNextStep : goal.note);
  setTextAll('[data-quest-badge]', earnedBadges[earnedBadges.length - 1]);
  setTextAll('[data-quest-badge-count]', `${earnedBadges.length} earned`);

  const badgeShelf = document.querySelector('[data-badge-shelf]');

  if (badgeShelf) {
    badgeShelf.innerHTML = earnedBadges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join('');
  }
};

const updateDashboardFromSubmissions = (submissions) => {
  const readySubmissions = submissions.filter((submission) => getFeedback(submission));
  const latestReady = readySubmissions[0];
  const latestFeedback = latestReady ? getFeedback(latestReady) : null;

  updateQuestMode(submissions, latestFeedback);

  setStat(
    'sessions',
    String(submissions.length),
    submissions.length === 1 ? '1 account recording saved.' : `${submissions.length} account recordings saved.`
  );

  if (latestFeedback) {
    const nextStep = Array.isArray(latestFeedback.top_3_next_steps) && latestFeedback.top_3_next_steps[0]
      ? latestFeedback.top_3_next_steps[0]
      : 'Keep practicing with one focused drill.';

    setStat('focus', latestReady.drill_title || 'Next step', nextStep);
    setStat('mentor', readySubmissions.length >= 3 ? 'Ready soon' : 'Building', 'Save a few feedback sessions before requesting mentor review.');
    setStat(
      'strength',
      Array.isArray(latestFeedback.strengths) && latestFeedback.strengths[0] ? 'Identified' : 'Ready',
      Array.isArray(latestFeedback.strengths) && latestFeedback.strengths[0]
        ? latestFeedback.strengths[0]
        : 'Your strengths are included in the latest saved feedback.'
    );
    setStat(
      'growth',
      Array.isArray(latestFeedback.improvements) && latestFeedback.improvements[0] ? 'Focus found' : 'Next step',
      Array.isArray(latestFeedback.improvements) && latestFeedback.improvements[0]
        ? latestFeedback.improvements[0]
        : nextStep
    );

    ['pacing', 'conciseness', 'eye_contact', 'demeanor', 'tone'].forEach((key) => {
      setMetricCard(key, getMetric(latestFeedback, key));
    });

    setText(savedSummary, `${readySubmissions.length} feedback report${readySubmissions.length === 1 ? '' : 's'} ready in your account.`);
  } else if (submissions.length > 0) {
    setStat('focus', 'Processing', 'Your newest recording is being transcribed and reviewed.');
    setStat('strength', 'Processing', 'Strengths will appear when feedback is ready.');
    setStat('growth', 'Processing', 'Growth area will appear when feedback is ready.');
    setText(savedSummary, 'Your recording was saved. Feedback is still being prepared.');
  } else {
    setStat('strength', 'Not yet', 'Your strongest speaking habit will appear after feedback is ready.');
    setStat('growth', 'Not yet', 'Your next improvement focus will appear after feedback is ready.');
    setText(savedSummary, 'Your saved AI Speech Coach feedback will appear here after your first account recording is processed.');
  }
};

const renderFeedbackList = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p>Nothing listed yet.</p>';
  }

  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
};

const renderSubmissionCard = (submission) => {
  const feedback = getFeedback(submission);
  const title = submission.drill_title || 'Open practice';
  const status = submission.status || 'processing';

  if (!feedback) {
    return `
      <article class="dashboard-history-card is-processing">
        <div class="dashboard-history-topline">
          <div>
            <h3>${escapeHtml(title)}</h3>
            <span>${escapeHtml(formatDate(submission.created_at))}</span>
          </div>
          <strong>${escapeHtml(status.replace(/_/g, ' '))}</strong>
        </div>
        <p>Your feedback is still being prepared. Refresh this dashboard in a little while.</p>
      </article>
    `;
  }

  const metrics = feedback.coaching_metrics || {};
  const metricLine = ['pacing', 'conciseness', 'tone']
    .map((key) => {
      const metric = metrics[key];
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      return metric && typeof metric.score === 'number' ? `${label}: ${metric.score}/10` : `${label}: --`;
    })
    .join(' | ');

  return `
    <article class="dashboard-history-card">
      <div class="dashboard-history-topline">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <span>${escapeHtml(formatDate(submission.created_at))}</span>
        </div>
        <strong>${escapeHtml(feedback.overall_score ? `${feedback.overall_score}/10` : 'Ready')}</strong>
      </div>
      <p>${escapeHtml(feedback.summary || 'Feedback is ready.')}</p>
      <p class="dashboard-history-metrics">${escapeHtml(metricLine)}</p>
      <details>
        <summary>View coaching details</summary>
        <div class="dashboard-history-details">
          <h4>Strengths</h4>
          ${renderFeedbackList(feedback.strengths)}
          <h4>Next Steps</h4>
          ${renderFeedbackList(feedback.top_3_next_steps)}
          ${feedback.language_and_vocabulary && feedback.language_and_vocabulary.clearer_version ? `<h4>Try saying it this way</h4><p>${escapeHtml(feedback.language_and_vocabulary.clearer_version)}</p>` : ''}
        </div>
      </details>
    </article>
  `;
};

const getProfilePayload = () => {
  if (!profileForm) {
    return {};
  }

  const formData = new FormData(profileForm);

  return {
    user_role: String(formData.get('user_role') || ''),
    age_range: String(formData.get('age_range') || ''),
    main_goal: String(formData.get('main_goal') || ''),
    experience_level: String(formData.get('experience_level') || ''),
    hardest_part: String(formData.get('hardest_part') || ''),
    mentor_interest: String(formData.get('mentor_interest') || ''),
  };
};

const fillProfileForm = (profile) => {
  if (!profileForm || !profile) {
    return;
  }

  ['user_role', 'age_range', 'main_goal', 'experience_level', 'hardest_part', 'mentor_interest'].forEach((key) => {
    const field = profileForm.elements[key];
    if (field && profile[key]) {
      field.value = profile[key];
    }
  });
};

const loadAccountProfile = async () => {
  if (!profileForm) {
    return;
  }

  setText(profileStatus, 'Optional');

  try {
    const accessToken = await window.VoiceToLeadAuth.getAccessToken();

    if (!accessToken) {
      return;
    }

    const response = await fetch(`${SPEECH_COACH_API_BASE}/account/profile`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 404) {
        setText(profileStatus, 'Optional');
        setText(profileMessage, 'Profile questions are being set up and will be available soon.');
        return;
      }

      throw new Error(data.error || 'Could not load profile.');
    }

    if (data.profile) {
      fillProfileForm(data.profile);
      setText(profileStatus, 'Saved');
      setText(profileMessage, 'Your coaching preferences are saved. You can update them anytime.');

      if (onboardingPanel) {
        onboardingPanel.open = false;
      }

      if (data.profile.main_goal && questGoals[data.profile.main_goal]) {
        setQuestGoal(data.profile.main_goal, { save: true });
        updateDashboardFromSubmissions(dashboardSubmissionsCache);
      }
    }
  } catch (error) {
    setText(profileStatus, 'Optional');
    setText(profileMessage, `Could not load preferences: ${error.message}`);
  }
};

const saveAccountProfile = async () => {
  if (!profileForm) {
    return;
  }

  const submitButton = profileForm.querySelector('button[type="submit"]');

  try {
    const accessToken = await window.VoiceToLeadAuth.getAccessToken();

    if (!accessToken) {
      throw new Error('Please sign in again.');
    }

    if (submitButton) {
      submitButton.disabled = true;
    }

    setText(profileStatus, 'Saving');
    setText(profileMessage, 'Saving your coaching preferences...');

    const payload = getProfilePayload();
    const response = await fetch(`${SPEECH_COACH_API_BASE}/account/profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Profile questions are still being set up. Please try again later.');
      }

      throw new Error(data.error || 'Could not save profile.');
    }

    setText(profileStatus, 'Saved');
    setText(profileMessage, 'Saved. We will use this to personalize your coaching.');

    if (payload.main_goal && questGoals[payload.main_goal]) {
      setQuestGoal(payload.main_goal);
      updateDashboardFromSubmissions(dashboardSubmissionsCache);
    }
  } catch (error) {
    setText(profileStatus, 'Try again');
    setText(profileMessage, `Could not save preferences: ${error.message}`);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
};

const loadDashboardSubmissions = async () => {
  if (!dashboardHistory) {
    return;
  }

  setText(dashboardHistoryCount, 'Loading');
  dashboardHistory.innerHTML = '<p class="dashboard-empty">Loading your saved feedback...</p>';

  try {
    const accessToken = await window.VoiceToLeadAuth.getAccessToken();

    if (!accessToken) {
      throw new Error('Please sign in again.');
    }

    const response = await fetch(`${SPEECH_COACH_API_BASE}/account/speech-submissions`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Could not load saved feedback.');
    }

    const submissions = Array.isArray(data.submissions) ? data.submissions : [];

    dashboardSubmissionsCache = submissions;
    updateDashboardFromSubmissions(submissions);
    setText(dashboardHistoryCount, `${submissions.length} saved`);

    if (submissions.length === 0) {
      dashboardHistory.innerHTML = '<p class="dashboard-empty">No saved feedback yet. Record an account practice video above to start your history.</p>';
      return;
    }

    dashboardHistory.innerHTML = submissions.map(renderSubmissionCard).join('');
  } catch (error) {
    setText(dashboardHistoryCount, 'Unavailable');
    dashboardHistory.innerHTML = `<p class="dashboard-empty">Could not load saved feedback: ${escapeHtml(error.message)}</p>`;
  }
};

const getDashboardUrl = () => `${window.location.origin}/dashboard.html`;

const isDashboardPage = () => window.location.pathname.endsWith('/dashboard.html');

const getAuthUrlState = () => {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  return {
    code: searchParams.get('code'),
    accessToken: hashParams.get('access_token'),
    refreshToken: hashParams.get('refresh_token'),
    hasAuthError: searchParams.has('error') || hashParams.has('error'),
  };
};

const handleAuthLanding = async () => {
  const authState = getAuthUrlState();

  if (isDashboardPage() || authState.hasAuthError) {
    return;
  }

  if (authState.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(authState.code);

    if (!error) {
      window.location.replace(getDashboardUrl());
    }

    return;
  }

  if (authState.accessToken && authState.refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: authState.accessToken,
      refresh_token: authState.refreshToken,
    });

    if (!error) {
      window.location.replace(getDashboardUrl());
    }
  }
};

const showAuthPage = async () => {
  if (!authForm) {
    return;
  }

  const { data } = await supabase.auth.getSession();

  if (data && data.session) {
    setText(authStatus, 'You are already signed in. Opening your dashboard...');
    window.setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 700);
  }
};

const showDashboard = async () => {
  if (!dashboardStatus) {
    return;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    setText(dashboardStatus, `Could not check your account: ${error.message}`);
    return;
  }

  const session = data && data.session;

  if (!session) {
    setText(dashboardStatus, 'Opening sign in so your practice can be saved.');
    window.setTimeout(() => {
      window.location.href = 'auth.html';
    }, 900);
    return;
  }

  setText(dashboardStatus, 'You are signed in.');
  setText(userEmail, session.user.email || 'Signed-in user');

  if (dashboardContent) {
    dashboardContent.hidden = false;
  }

  loadAccountProfile();
  loadDashboardSubmissions();
};

if (authForm) {
  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(authForm);
    const email = String(formData.get('email') || '').trim();

    if (!email) {
      setText(authStatus, 'Enter your email first.');
      return;
    }

    setText(authStatus, 'Sending your dashboard link...');

    if (authSubmitButton) {
      authSubmitButton.disabled = true;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getDashboardUrl(),
      },
    });

    if (error) {
      const isRateLimit = /rate limit/i.test(error.message || '');
      setText(authStatus, isRateLimit
        ? 'Too many links were requested. Wait a few minutes, then try again.'
        : `Could not send the link: ${error.message}`);
      if (authSubmitButton) {
        authSubmitButton.disabled = false;
      }
      return;
    }

    authForm.reset();
    if (authSubmitButton) {
      authSubmitButton.disabled = false;
    }
    setText(authStatus, 'Email sent. Open the link in your inbox to continue to your dashboard.');
  });
}

if (signOutButton) {
  signOutButton.addEventListener('click', async () => {
    setText(dashboardStatus, 'Signing you out...');
    await supabase.auth.signOut();
    window.location.href = 'auth.html';
  });
}

if (profileForm) {
  profileForm.addEventListener('submit', (event) => {
    event.preventDefault();
    saveAccountProfile();
  });
}

if (modeButtons.length > 0) {
  const savedMode = window.localStorage.getItem('voiceToLeadDashboardMode');
  setDashboardMode(savedMode || 'quest');
  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setDashboardMode(button.dataset.dashboardModeButton);
    });
  });
}

if (questGoalButtons.length > 0) {
  setQuestGoal(window.localStorage.getItem('voiceToLeadQuestGoal') || 'confidence', { save: false });
  questGoalButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setQuestGoal(button.dataset.questGoal);
      updateDashboardFromSubmissions(dashboardSubmissionsCache);
    });
  });
}

window.addEventListener('voicetolead:account-submission-saved', () => {
  window.setTimeout(loadDashboardSubmissions, 1200);
});

handleAuthLanding().then(() => {
  showAuthPage();
  showDashboard();
});
