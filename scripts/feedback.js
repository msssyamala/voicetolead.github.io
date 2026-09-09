import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://gdyxyvhshltlshyfwdqd.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lX69FPCqL6G0Yztxvn7U_g_KuOQySEb';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

document.addEventListener('DOMContentLoaded', function () {
  const form = document.querySelector('.feedback-lookup');

  if (!form) {
    return;
  }

  const input = form.querySelector('input[name="submission_id"]');
  const status = document.querySelector('.feedback-status');
  const results = document.querySelector('.feedback-results');
  const apiBase = form.dataset.apiBase;

  const params = new URLSearchParams(window.location.search);
  const idFromUrl = params.get('id');
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const guestTokenFromUrl = hashParams.get('guest');

  if (idFromUrl && guestTokenFromUrl) {
    window.sessionStorage.setItem(`voiceToLeadFeedbackToken:${idFromUrl}`, guestTokenFromUrl);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }

  const setStatus = (message) => {
    status.textContent = message;
  };

  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const renderList = (items) => {
    if (!Array.isArray(items) || items.length === 0) {
      return '<p>Nothing listed yet.</p>';
    }

    return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  };

  const renderScore = (label, value) => {
    if (value === undefined || value === null || value === '') {
      return '';
    }

    return `<div class="feedback-score"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}/10</strong></div>`;
  };

  const renderLanguageFeedback = (language) => {
    if (!language) {
      return '';
    }

    const hasGrammar = Array.isArray(language.grammar_notes) && language.grammar_notes.length > 0;
    const hasVocabulary = Array.isArray(language.vocabulary_suggestions) && language.vocabulary_suggestions.length > 0;
    const hasRepeated = Array.isArray(language.repeated_or_vague_words) && language.repeated_or_vague_words.length > 0;
    const hasClearerVersion = Boolean(language.clearer_version);

    if (!hasGrammar && !hasVocabulary && !hasRepeated && !hasClearerVersion) {
      return '';
    }

    return `
      <section class="feedback-panel feedback-language">
        <h2>Language & Vocabulary</h2>
        <div class="feedback-grid feedback-language-grid">
          <div>
            <h3>Grammar Notes</h3>
            ${renderList(language.grammar_notes)}
          </div>
          <div>
            <h3>Stronger Word Choices</h3>
            ${renderList(language.vocabulary_suggestions)}
          </div>
          <div>
            <h3>Repeated or Vague Words</h3>
            ${renderList(language.repeated_or_vague_words)}
          </div>
        </div>
        ${language.clearer_version ? `<p><strong>Try saying it this way:</strong> ${escapeHtml(language.clearer_version)}</p>` : ''}
      </section>
    `;
  };

  const renderCoachingMetrics = (metrics) => {
    if (!metrics) {
      return '';
    }

    const metricItems = [
      ['Pacing', metrics.pacing],
      ['Conciseness', metrics.conciseness],
      ['Eye Contact', metrics.eye_contact],
      ['Demeanor', metrics.demeanor],
      ['Tone', metrics.tone],
    ];

    const hasMetrics = metricItems.some((item) => item[1]);

    if (!hasMetrics) {
      return '';
    }

    return `
      <section class="feedback-panel feedback-coaching-metrics">
        <h2>Coaching Metrics</h2>
        <div class="metric-grid feedback-metric-grid">
          ${metricItems.map(([label, metric]) => {
            const score = metric && metric.score !== undefined && metric.score !== null ? metric.score : '--';
            const width = typeof score === 'number' ? Math.max(0, Math.min(100, score * 10)) : 0;

            return `
              <article class="metric-card">
                <div class="metric-topline">
                  <h3>${escapeHtml(label)}</h3>
                  <strong>${escapeHtml(score)}</strong>
                </div>
                <div class="metric-bar" aria-hidden="true"><span style="width: ${width}%;"></span></div>
                <p>${escapeHtml(metric && metric.notes)}</p>
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `;
  };

  const renderFeedback = (submission) => {
    const feedback = submission.final_feedback || submission.speech_feedback;
    const drillReview = feedback && feedback.drill_review;
    const drillTitle = (drillReview && drillReview.drill_title) || submission.drill_title;
    const drillRubric = (drillReview && drillReview.rubric) || submission.drill_rubric;

    if (!feedback) {
      results.hidden = true;
      setStatus(`Status: ${submission.status || 'processing'}. Feedback is not ready yet.`);
      return;
    }

    results.hidden = false;
    setStatus('Feedback is ready.');

    results.innerHTML = `
      <div class="feedback-summary">
        ${renderScore('Overall score', feedback.overall_score)}
        <p>${escapeHtml(feedback.summary || 'Feedback has been generated.')}</p>
      </div>

      ${drillTitle ? `
        <section class="feedback-panel feedback-drill-review">
          <h2>Drill Review: ${escapeHtml(drillTitle)}</h2>
          ${drillRubric ? `<p><strong>Rubric:</strong> ${escapeHtml(drillRubric)}</p>` : ''}
          ${renderScore('Drill score', drillReview && drillReview.score)}
          <div class="feedback-grid feedback-drill-grid">
            <div>
              <h3>Covered Well</h3>
              ${renderList(drillReview && drillReview.covered_well)}
            </div>
            <div>
              <h3>Missing or Unclear</h3>
              ${renderList(drillReview && drillReview.missing_or_unclear)}
            </div>
          </div>
          ${drillReview && drillReview.next_drill_focus ? `<p><strong>Next drill focus:</strong> ${escapeHtml(drillReview.next_drill_focus)}</p>` : ''}
          ${drillReview && drillReview.stronger_example ? `<p><strong>Try this:</strong> ${escapeHtml(drillReview.stronger_example)}</p>` : ''}
        </section>
      ` : ''}

      ${renderCoachingMetrics(feedback.coaching_metrics)}

      <div class="feedback-grid">
        <section class="feedback-panel">
          <h2>Strengths</h2>
          ${renderList(feedback.strengths)}
        </section>

        <section class="feedback-panel">
          <h2>Improvements</h2>
          ${renderList(feedback.improvements)}
        </section>

        <section class="feedback-panel">
          <h2>Filler Words</h2>
          ${renderList(feedback.filler_words && feedback.filler_words.detected)}
          <p>${escapeHtml(feedback.filler_words && feedback.filler_words.notes)}</p>
        </section>

        <section class="feedback-panel">
          <h2>Organization</h2>
          ${renderScore('Score', feedback.organization && feedback.organization.score)}
          <p>${escapeHtml(feedback.organization && feedback.organization.notes)}</p>
        </section>

        <section class="feedback-panel">
          <h2>Clarity</h2>
          ${renderScore('Score', feedback.clarity && feedback.clarity.score)}
          <p>${escapeHtml(feedback.clarity && feedback.clarity.notes)}</p>
        </section>

        <section class="feedback-panel">
          <h2>Opening & Closing</h2>
          <p>${escapeHtml(feedback.opening_and_closing && feedback.opening_and_closing.notes)}</p>
        </section>
      </div>

      <section class="feedback-panel feedback-next-steps">
        <h2>Top 3 Next Steps</h2>
        ${renderList(feedback.top_3_next_steps)}
      </section>

      ${renderLanguageFeedback(feedback.language_and_vocabulary)}

      ${submission.transcript ? `
        <details class="feedback-transcript">
          <summary>View transcript</summary>
          <p>${escapeHtml(submission.transcript)}</p>
        </details>
      ` : ''}
    `;
  };

  const loadFeedback = async (submissionId) => {
    const cleanId = submissionId.trim();

    if (!cleanId) {
      setStatus('Enter a submission ID first.');
      results.hidden = true;
      return;
    }

    input.value = cleanId;
    setStatus('Loading feedback...');
    results.hidden = true;

    try {
      const headers = {};
      const { data } = await supabase.auth.getSession();
      const accountAccessToken = data && data.session ? data.session.access_token : null;
      const guestAccessToken = window.sessionStorage.getItem(`voiceToLeadFeedbackToken:${cleanId}`);

      if (accountAccessToken) {
        headers.Authorization = `Bearer ${accountAccessToken}`;
      }

      if (guestAccessToken) {
        headers['X-Submission-Token'] = guestAccessToken;
      }

      const response = await fetch(`${apiBase}/speech-submissions/${encodeURIComponent(cleanId)}`, {
        headers,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Could not load feedback.');
      }

      renderFeedback(data.submission);
    } catch (error) {
      setStatus(`Could not load feedback: ${error.message} Open the private link from your submission, or sign in to your account.`);
      results.hidden = true;
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    loadFeedback(input.value);
  });

  if (idFromUrl) {
    loadFeedback(idFromUrl);
  }
});
