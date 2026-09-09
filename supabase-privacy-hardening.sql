-- Run this migration before deploying the matching Cloudflare Worker.

alter table public.speech_submissions
  add column if not exists age_range text,
  add column if not exists consent_version text,
  add column if not exists consented_at timestamptz,
  add column if not exists guest_access_token_hash text,
  add column if not exists guest_access_expires_at timestamptz,
  add column if not exists raw_media_deleted_at timestamptz;

alter table public.speech_submissions
  alter column video_path drop not null;

alter table public.speech_submissions enable row level security;

revoke all on table public.speech_submissions from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.speech_submissions to service_role;

create index if not exists speech_submissions_guest_expiration_idx
  on public.speech_submissions(guest_access_expires_at)
  where owner_user_id is null;

comment on column public.speech_submissions.guest_access_token_hash is
  'SHA-256 hash of the private guest feedback token. Never return this value to clients.';

comment on column public.speech_submissions.raw_media_deleted_at is
  'Time the raw video/audio object was deleted after successful transcription.';
