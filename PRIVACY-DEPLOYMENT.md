# Privacy hardening deployment checklist

Apply these changes together in the order below. Deploying the Worker before the updated website will temporarily break Speech Coach submissions because the new Worker requires age and consent fields.

1. Run `supabase-privacy-hardening.sql` in the Supabase SQL editor.
2. Confirm `speech_submissions` has Row Level Security enabled and no grants for `anon` or `authenticated`.
3. If the earlier 11–12 migration was applied, run `supabase-remove-parent-consent.sql` once.
4. Publish the updated website files so browsers send the new age, consent, and private-token fields.
5. Immediately deploy the updated `cloudflare-worker.js`.
6. Add a daily Cloudflare Worker Cron Trigger so `scheduled()` deletes expired guest submissions.
7. Add an R2 lifecycle rule that expires any leftover object under `submissions/` after one day. This is a safety net for interrupted Worker runs.
8. Verify the cases below before announcing the change.

## Required verification

- A guest age selection of `under_13` cannot start an AI-feedback recording.
- An age selection of `13_17` displays the youth and parent privacy notice.
- A direct upload without `age_range` or accepted `consent` is rejected.
- A guest submission returns a private feedback link containing a URL fragment.
- The feedback page removes that fragment from the address bar after saving it for the browser session.
- The guest submission cannot be read without its private token.
- A signed-in user can read their own submission but not another account's submission.
- The raw R2 object is deleted after both successful and failed transcription attempts.
- The Supabase row records `raw_media_deleted_at` after deletion.
- A scheduled cleanup removes an expired guest row and any leftover media.

## Compatibility note

Older guest submissions do not have private access tokens. Their old ID-only feedback links will stop working after the secured Worker is deployed. Signed-in account submissions continue to use account ownership.

## Age requirement

Do not enable AI-feedback recording for anyone under age 13. Revisit legal and operational requirements before lowering this minimum age in the future.
