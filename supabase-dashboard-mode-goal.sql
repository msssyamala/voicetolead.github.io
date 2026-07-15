alter table public.speech_submissions
  add column if not exists dashboard_mode text,
  add column if not exists quest_goal text;
