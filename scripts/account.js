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
const dashboardStatus = document.querySelector('[data-dashboard-status]');
const dashboardContent = document.querySelector('[data-dashboard-content]');
const userEmail = document.querySelector('[data-user-email]');
const signOutButton = document.querySelector('[data-sign-out]');
const dashboardHistory = document.querySelector('[data-dashboard-history]');
const dashboardHistoryCount = document.querySelector('[data-dashboard-history-count]');
const savedSummary = document.querySelector('[data-dashboard-saved-summary]');

const setText = (element, message) => {
  if (element) {
    element.textContent = message;
  }
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
  setText(document.querySelector(`[data-dashboard-stat="${key}"]`), value);
  setText(document.querySelector(`[data-dashboard-stat-note="${key}"]`), note);
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

const updateDashboardFromSubmissions = (submissions) => {
  const readySubmissions = submissions.filter((submission) => getFeedback(submission));
  const latestReady = readySubmissions[0];
  const latestFeedback = latestReady ? getFeedback(latestReady) : null;

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

    ['pacing', 'conciseness', 'eye_contact', 'demeanor', 'tone'].forEach((key) => {
      setMetricCard(key, getMetric(latestFeedback, key));
    });

    setText(savedSummary, `${readySubmissions.length} feedback report${readySubmissions.length === 1 ? '' : 's'} ready in your account.`);
  } else if (submissions.length > 0) {
    setStat('focus', 'Processing', 'Your newest recording is being transcribed and reviewed.');
    setText(savedSummary, 'Your recording was saved. Feedback is still being prepared.');
  } else {
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
    setText(dashboardStatus, 'Please sign in to view your dashboard.');
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

  loadDashboardSubmissions();
};

if (authForm) {
  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(authForm);
    const email = String(formData.get('email') || '').trim();

    if (!email) {
      setText(authStatus, 'Enter your email address first.');
      return;
    }

    setText(authStatus, 'Sending your secure sign-in link...');

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getDashboardUrl(),
      },
    });

    if (error) {
      setText(authStatus, `Could not send sign-in link: ${error.message}`);
      return;
    }

    authForm.reset();
    setText(authStatus, 'Check your email for the VoiceToLead sign-in link.');
  });
}

if (signOutButton) {
  signOutButton.addEventListener('click', async () => {
    setText(dashboardStatus, 'Signing you out...');
    await supabase.auth.signOut();
    window.location.href = 'auth.html';
  });
}

window.addEventListener('voicetolead:account-submission-saved', () => {
  window.setTimeout(loadDashboardSubmissions, 1200);
});

handleAuthLanding().then(() => {
  showAuthPage();
  showDashboard();
});
