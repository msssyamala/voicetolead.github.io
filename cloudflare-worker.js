const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const FEEDBACK_MODEL = "gpt-4o-mini";
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set([
  "video/webm",
  "video/mp4",
]);

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (request.method === "GET") {
      const readMatch = url.pathname.match(/^\/speech-submissions\/([a-f0-9-]+)$/);

      if (readMatch) {
        return readSubmission(readMatch[1], env, corsHeaders);
      }

      return json({ error: "Not found" }, 404, corsHeaders);
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, corsHeaders);
    }

    if (url.pathname === "/speech-submissions") {
      return createSubmission(request, env, corsHeaders, ctx);
    }

    const transcribeMatch = url.pathname.match(
      /^\/speech-submissions\/([a-f0-9-]+)\/transcribe$/
    );

    if (transcribeMatch) {
      return transcribeSubmission(transcribeMatch[1], env, corsHeaders);
    }

    const feedbackMatch = url.pathname.match(
      /^\/speech-submissions\/([a-f0-9-]+)\/speech-feedback$/
    );

    if (feedbackMatch) {
      return generateSpeechFeedback(feedbackMatch[1], env, corsHeaders);
    }

    return json({ error: "Not found" }, 404, corsHeaders);
  },
};

async function createSubmission(request, env, corsHeaders, ctx) {
  try {
    const contentLength = Number(request.headers.get("Content-Length") || 0);

    if (contentLength && contentLength > MAX_VIDEO_BYTES) {
      return json({ error: "Video file is too large." }, 413, corsHeaders);
    }

    const formData = await request.formData();
    const video = formData.get("video");
    const studentName = formData.get("student_name") || null;
    const studentEmail = formData.get("student_email") || null;
    const turnstileToken = formData.get("turnstile_token");

    const turnstileResult = await verifyTurnstileToken(turnstileToken, request, env);

    if (!turnstileResult.success) {
      return json({
        error: "Bot protection check failed. Please refresh and try again.",
      }, 403, corsHeaders);
    }

    if (!video || typeof video === "string") {
      return json({ error: "Missing video file" }, 400, corsHeaders);
    }

    if (video.size > MAX_VIDEO_BYTES) {
      return json({ error: "Video file is too large." }, 413, corsHeaders);
    }

    if (!ALLOWED_VIDEO_TYPES.has(video.type)) {
      return json({ error: "Unsupported video type." }, 415, corsHeaders);
    }

    const submissionId = crypto.randomUUID();
    const extension = video.type.includes("mp4") ? "mp4" : "webm";
    const videoPath = `submissions/${submissionId}/speech.${extension}`;

    await env.SPEECH_VIDEOS.put(videoPath, video.stream(), {
      httpMetadata: {
        contentType: video.type || "video/webm",
      },
    });

    const supabaseResponse = await supabaseFetch(env, "/speech_submissions", {
      method: "POST",
      headers: {
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        id: submissionId,
        student_name: studentName,
        student_email: studentEmail,
        video_path: videoPath,
        video_mime_type: video.type || null,
        video_size_bytes: video.size || null,
        status: "uploaded",
      }),
    });

    if (!supabaseResponse.ok) {
      const details = await supabaseResponse.text();
      return json({ error: "Supabase insert failed", details }, 500, corsHeaders);
    }

    const rows = await supabaseResponse.json();
    const submission = rows[0];

    if (ctx && submission && submission.id) {
      ctx.waitUntil(processSubmission(submission.id, env));
    }

    return json({
      ok: true,
      submission,
    }, 200, corsHeaders);
  } catch (error) {
    return json({
      error: "Upload failed",
      details: error.message,
    }, 500, corsHeaders);
  }
}

async function verifyTurnstileToken(token, request, env) {
  if (!env.TURNSTILE_SECRET_KEY) {
    return { success: false };
  }

  if (!token || typeof token !== "string") {
    return { success: false };
  }

  const verificationForm = new FormData();
  verificationForm.append("secret", env.TURNSTILE_SECRET_KEY);
  verificationForm.append("response", token);

  const remoteIp = request.headers.get("CF-Connecting-IP");

  if (remoteIp) {
    verificationForm.append("remoteip", remoteIp);
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: verificationForm,
  });

  if (!response.ok) {
    return { success: false };
  }

  return response.json();
}

async function processSubmission(submissionId, env) {
  const transcribeResponse = await transcribeSubmission(submissionId, env, {});

  if (!transcribeResponse.ok) {
    return;
  }

  await generateSpeechFeedback(submissionId, env, {});
}

async function readSubmission(submissionId, env, corsHeaders) {
  try {
    const lookupResponse = await getSubmission(env, submissionId);

    if (!lookupResponse.ok) {
      const details = await lookupResponse.text();
      return json({ error: "Could not read submission", details }, 500, corsHeaders);
    }

    const rows = await lookupResponse.json();
    const submission = rows[0];

    if (!submission) {
      return json({ error: "Submission not found" }, 404, corsHeaders);
    }

    return json({
      ok: true,
      submission: {
        id: submission.id,
        created_at: submission.created_at,
        status: submission.status,
        transcript: submission.transcript,
        speech_feedback: submission.speech_feedback,
        final_feedback: submission.final_feedback,
        speech_feedback_at: submission.speech_feedback_at,
        error_message: submission.error_message,
      },
    }, 200, corsHeaders);
  } catch (error) {
    return json({
      error: "Feedback lookup failed",
      details: error.message,
    }, 500, corsHeaders);
  }
}

async function transcribeSubmission(submissionId, env, corsHeaders) {
  try {
    const lookupResponse = await getSubmission(env, submissionId);

    if (!lookupResponse.ok) {
      const details = await lookupResponse.text();
      return json({ error: "Could not read submission", details }, 500, corsHeaders);
    }

    const rows = await lookupResponse.json();
    const submission = rows[0];

    if (!submission) {
      return json({ error: "Submission not found" }, 404, corsHeaders);
    }

    await updateSubmission(env, submissionId, {
      status: "transcribing",
      error_message: null,
    });

    const videoObject = await env.SPEECH_VIDEOS.get(submission.video_path);

    if (!videoObject) {
      throw new Error("Video file was not found in R2.");
    }

    const videoBlob = await videoObject.blob();
    const fileName = submission.video_path.split("/").pop() || "speech.webm";
    const videoFile = new File([videoBlob], fileName, {
      type: submission.video_mime_type || "video/webm",
    });

    const openAiForm = new FormData();
    openAiForm.append("file", videoFile);
    openAiForm.append("model", TRANSCRIPTION_MODEL);

    const openAiResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: openAiForm,
    });

    if (!openAiResponse.ok) {
      const details = await openAiResponse.text();
      throw new Error(`OpenAI transcription failed: ${details}`);
    }

    const transcription = await openAiResponse.json();
    const transcript = transcription.text || "";

    const updateResponse = await updateSubmission(env, submissionId, {
      status: "transcribed",
      transcript,
      transcript_model: TRANSCRIPTION_MODEL,
      transcribed_at: new Date().toISOString(),
      error_message: null,
    });

    const updatedRows = await updateResponse.json();

    return json({
      ok: true,
      submission: updatedRows[0],
    }, 200, corsHeaders);
  } catch (error) {
    await updateSubmission(env, submissionId, {
      status: "failed",
      error_message: error.message,
    }).catch(() => null);

    return json({
      error: "Transcription failed",
      details: error.message,
    }, 500, corsHeaders);
  }
}

async function generateSpeechFeedback(submissionId, env, corsHeaders) {
  try {
    const lookupResponse = await getSubmission(env, submissionId);

    if (!lookupResponse.ok) {
      const details = await lookupResponse.text();
      return json({ error: "Could not read submission", details }, 500, corsHeaders);
    }

    const rows = await lookupResponse.json();
    const submission = rows[0];

    if (!submission) {
      return json({ error: "Submission not found" }, 404, corsHeaders);
    }

    if (!submission.transcript) {
      return json({ error: "Transcript is missing. Transcribe first." }, 400, corsHeaders);
    }

    await updateSubmission(env, submissionId, {
      status: "generating_feedback",
      error_message: null,
    });

    const prompt = `
You are an encouraging youth public speaking coach for VoiceToLead.

Analyze this speech transcript and return only valid JSON with this exact shape:
{
  "overall_score": 1,
  "summary": "",
  "strengths": [],
  "improvements": [],
  "filler_words": {
    "detected": [],
    "notes": ""
  },
  "organization": {
    "score": 1,
    "notes": ""
  },
  "clarity": {
    "score": 1,
    "notes": ""
  },
  "opening_and_closing": {
    "notes": ""
  },
  "top_3_next_steps": []
}

Guidelines:
- Use scores from 1 to 10.
- Be specific, kind, and age-appropriate.
- Do not mention that you are an AI model.
- Do not include markdown.
- Return JSON only.

Transcript:
${submission.transcript}
`;

    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: FEEDBACK_MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are a youth public speaking coach. Return only valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!openAiResponse.ok) {
      const details = await openAiResponse.text();
      throw new Error(`OpenAI feedback failed: ${details}`);
    }

    const openAiResult = await openAiResponse.json();
    const content = openAiResult.choices[0].message.content;
    const feedback = JSON.parse(content);

    const updateResponse = await updateSubmission(env, submissionId, {
      status: "feedback_ready",
      speech_feedback: feedback,
      final_feedback: feedback,
      speech_feedback_model: FEEDBACK_MODEL,
      speech_feedback_at: new Date().toISOString(),
      error_message: null,
    });

    const updatedRows = await updateResponse.json();

    return json({
      ok: true,
      submission: updatedRows[0],
    }, 200, corsHeaders);
  } catch (error) {
    await updateSubmission(env, submissionId, {
      status: "failed",
      error_message: error.message,
    }).catch(() => null);

    return json({
      error: "Speech feedback failed",
      details: error.message,
    }, 500, corsHeaders);
  }
}

function getSubmission(env, submissionId) {
  return supabaseFetch(env, `/speech_submissions?id=eq.${submissionId}&select=*`);
}

function supabaseFetch(env, path, options = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.headers || {}),
    },
  });
}

function updateSubmission(env, submissionId, values) {
  return supabaseFetch(env, `/speech_submissions?id=eq.${submissionId}`, {
    method: "PATCH",
    headers: {
      "Prefer": "return=representation",
    },
    body: JSON.stringify(values),
  });
}

function getCorsHeaders(request, env) {
  const requestOrigin = request.headers.get("Origin");
  const allowedOrigins = (env.ALLOWED_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const corsOrigin = allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0] || "*";

  return {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
  });
}
