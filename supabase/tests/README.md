# RLS isolation test

`rls_isolation_test.sql` proves one practice cannot read or write another
practice's data.

**How to run:** open the Supabase dashboard - SQL Editor, paste the file,
Run. Read the Messages/Notices panel: every line ends PASS or FAIL, with a
final verdict. The script wraps everything in BEGIN/ROLLBACK, so it creates
no permanent data and is safe to run on production.

**When to run:** after any change to RLS policies, the scoping helper
functions (`user_practice_ids`, `is_practice_admin`, `clinician_in_my_practice`,
`clinician_admin_check`), or whenever you add a new practice-scoped table —
add a check for the new table to the script at the same time.

This lives in `tests/`, NOT `migrations/`, so the deploy GitHub Action does
not apply it to the database.
