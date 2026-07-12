alter table public.speech_submissions
  add column if not exists drill_type text,
  add column if not exists drill_title text,
  add column if not exists drill_rubric text;
