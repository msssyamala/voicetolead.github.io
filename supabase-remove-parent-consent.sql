-- Run this once if the earlier 11-12 parent-consent migration was already applied.
-- The AI Speech Coach now requires every speaker to be age 13 or older.

begin;

alter table public.speech_submissions
  drop column if exists parent_consent_request_id;

drop table if exists public.parent_consent_requests;

commit;
