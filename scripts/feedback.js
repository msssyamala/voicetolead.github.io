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

  const renderFeedback = (submission) => {
    const feedback = submission.final_feedback || submission.speech_feedback;

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
      const response = await fetch(`${apiBase}/speech-submissions/${encodeURIComponent(cleanId)}`);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Could not load feedback.');
      }

      renderFeedback(data.submission);
    } catch (error) {
      setStatus(`Could not load feedback: ${error.message}`);
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
