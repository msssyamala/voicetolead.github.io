alter table public.speech_submissions
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

create index if not exists speech_submissions_owner_user_id_idx
  on public.speech_submissions(owner_user_id);
