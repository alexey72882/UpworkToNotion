# Session Progress — 2026-04-13/14

## Completed

### Job feed improvements
- **Added 3 new Notion properties** to the Job Feed DB: `Job Type` (select: Hourly/Fixed), `Applied` (checkbox), `Proposal link` (URL)
- **Dropped `Currency`** field — always USD, no need to store it
- **Cross-referenced proposals with job feed**: sync now maps `jobPostingId → proposalId` and writes the proposal URL when you've already applied to a job

### Filter system overhaul
- **Replaced raw numeric IDs** (`Category IDs`, `Occupation IDs` rich-text fields) with human-readable Notion multi-select dropdowns
- **Added 10 new filter fields** to Notion Filters DB:
  - `Category` (multi-select, 12 options)
  - `Subcategory` (multi-select, 70 options with `Dev ›`, `Design ›`, etc. prefix)
  - `Duration` (multi-select: Week/Month/Quarter/Semester/Ongoing)
  - `Workload` (select: Full Time/Part Time/As Needed)
  - `Days Posted`, `Max Proposals`, `Min Client Hires`, `Min Client Rating` (numbers)
  - `Previous Clients Only`, `Enterprise Only` (checkboxes)
- **`CATEGORY_ID_MAP` + `SUBCATEGORY_ID_MAP`** in `upwork.ts` — human labels → Upwork numeric IDs, users never touch raw IDs
- **Fixed category key mismatch**: Notion doesn't allow commas in multi-select names → `"Web, Mobile & Software Dev"` → `"Web / Mobile & Software Dev"`

### Bug fixes
- Fixed `Currency` property causing all job upserts to fail (Notion 400 for unknown property)
- Fixed `Proposal link` property name mismatch (`"Proposal URL"` vs `"Proposal link"`)
- Debugged `fetchJobFeed` returning 0 jobs — root cause was `workload_eq: PART_TIME` being too restrictive with other active filters, not a code bug
- Fixed `NOTION_DIARY_DATABASE_ID` missing from `.env.local` after rename from `NOTION_CONTRACTS_DATABASE_ID`

### Deployed
- All changes live at https://upwork-to-notion.vercel.app
- 27 tests passing, zero build errors

---

## Next: Phase 2 — Hosted SaaS

See `docs/phase2.md` for the full plan. High-level:
1. Supabase Auth — user sign-up/login (email + Google)
2. Multi-tenant schema — `upwork_tokens.user_id`, new `user_settings` table
3. Upwork OAuth scoped to user — tokens saved per-user, not singleton
4. Settings page — users paste their own Notion token + DB IDs
5. Dashboard — connection status, last sync, "Sync Now" button
6. Sync fan-out — `/api/sync` iterates all configured users
7. More frequent cron — every 3 hours (requires Vercel Pro)
8. Landing page — public marketing page

---

# Phase 2 Deployment — Step-by-Step

All code is implemented and the build passes. Complete these steps in order to go live.

---

## Step 1 — Run Supabase schema migration

The multi-tenant schema requires one new column and one new table.

1. Go to https://supabase.com/dashboard → select your project → **SQL Editor** (left sidebar)
2. Paste and run:

```sql
-- Add user ownership to existing token table
ALTER TABLE upwork_tokens ADD COLUMN user_id uuid REFERENCES auth.users(id);

-- Per-user Notion settings
CREATE TABLE user_settings (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id),
  notion_token     text,
  job_feed_db_id   text,
  filters_db_id    text,
  diary_db_id      text,
  upwork_person_id text,
  last_sync_at     timestamptz,
  last_sync_result jsonb,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);
```

3. Click **Run** — you should see "Success. No rows returned."

---

## Step 2 — Get your Supabase anon key

You need two Supabase keys: the **service role key** (already in your env) and the **anon key** (new — used by the browser client).

1. Go to **Project Settings → API** in the Supabase dashboard
2. Under **Project API keys**, copy the value next to `anon` / `public`
   - It starts with `eyJ...` (same format as the service role key but a different value)
   - Do NOT use the `service_role` key for the browser — it bypasses Row Level Security

---

## Step 3 — Add new env vars to `.env.local`

Open `.env.local` in your editor and add two lines:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key...
```

- `NEXT_PUBLIC_SUPABASE_URL` is the same URL as `SUPABASE_URL` already in your file
- The `NEXT_PUBLIC_` prefix makes these values available to browser-side code (they are safe to expose)

---

## Step 4 — Add new env vars to Vercel

1. Go to https://vercel.com → select the **upworktonotion** project
2. Go to **Settings → Environment Variables**
3. Add two new variables (set scope to **Production, Preview, Development** for both):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Same as your `SUPABASE_URL` value |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key from Step 2 |

4. Click **Save** after each

---

## Step 5 — Enable Google OAuth in Supabase (optional)

Skip this step if you only want email/password sign-in.

1. Go to **Authentication → Providers** in the Supabase dashboard
2. Click **Google**
3. Toggle **Enable Sign in with Google**
4. You need a Google OAuth client — create one at https://console.cloud.google.com/apis/credentials:
   - Create an **OAuth 2.0 Client ID** → type: **Web application**
   - Authorized redirect URI: `https://your-project-ref.supabase.co/auth/v1/callback`
   - Copy the **Client ID** and **Client Secret**
5. Paste them into the Supabase Google provider form → **Save**

---

## Step 6 — Add `API_SECRET` to GitHub Actions secrets

The GitHub Actions workflow calls `/api/sync` with a Bearer token. It needs to know your secret.

1. Go to your GitHub repo → **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Name: `API_SECRET`
4. Value: same value as `API_SECRET` in your `.env.local`
5. Click **Add secret**

To verify the GitHub Actions workflow file is in place:
```bash
cat .github/workflows/sync.yml
```
You should see the `*/30 * * * *` cron schedule.

---

## Step 7 — Deploy to Vercel

```bash
npx vercel --prod
```

Wait for the deployment to complete. Check the output URL — it should be `https://upwork-to-notion.vercel.app`.

Verify the deployment:
```bash
curl -s https://upwork-to-notion.vercel.app/api/ping | jq .
# expect: {"ok":true,"service":"UpworkToNotion","version":"v0.1"}
```

---

## Step 8 — Sign up and connect your accounts

1. Open https://upwork-to-notion.vercel.app in your browser
2. Click **Get started free** → you'll land on the sign-in page
3. Sign up with your email (or Google if you did Step 5)
4. Check your email for the confirmation link → click it → you'll be redirected to `/dashboard`

---

## Step 9 — Connect Upwork

1. From the dashboard, click **Edit settings** (or go to `/settings`)
2. Click **Connect Upwork** — this starts the OAuth flow
3. Log in to Upwork if prompted, then click **Allow access**
4. You'll be redirected back to the settings page — Upwork should now show **✓ Connected**

---

## Step 10 — Configure Notion settings

Still on the Settings page, fill in:

| Field | Where to find it |
|---|---|
| **Notion Integration Token** | https://www.notion.so/my-integrations → select your integration → copy the **Internal Integration Secret** |
| **Job Feed Database ID** | Open your Job Feed DB in Notion → copy the 32-char hex from the URL: `notion.so/workspace/`**`<hex>`**`?v=...` |
| **Filters Database ID** | Same, for your Filters DB |
| **Work Diary Database ID** | Same, for your Diary DB |
| **Upwork Person ID** | `540749103839944704` (your existing value) |

Click **Save settings**.

Make sure each Notion DB is shared with your integration:
- Open the DB in Notion → top-right `...` → **Connections** → find your integration → connect

---

## Step 11 — Migrate your existing Upwork token

Your old token was saved as a "singleton" row without a `user_id`. Link it to your new account.

1. Find your Supabase user ID:
   - Go to **Authentication → Users** in the Supabase dashboard
   - Copy the UUID next to your email

2. Run in **SQL Editor**:

```sql
UPDATE upwork_tokens
SET user_id = '<paste-your-uuid-here>'
WHERE id = 'singleton';
```

3. Click **Run** — you should see "Success. 1 row affected."

---

## Step 12 — Test the full flow

```bash
# Check the sync endpoint with your session (click "Sync now" in Dashboard)
# Or test via API_SECRET (what GitHub Actions uses):
export API_SECRET=<your-secret>
curl -s -H "Authorization: Bearer $API_SECRET" \
  https://upwork-to-notion.vercel.app/api/sync | jq .
# expect: {"ok":true,"jobs":{...},"contracts":{...},"durationMs":...}
```

From the dashboard, click **Sync now** — you should see "Done — N jobs created" within a few seconds.

---

## Step 13 — Verify GitHub Actions cron

1. Go to your GitHub repo → **Actions** tab
2. You should see the **Sync** workflow listed
3. Click it → **Run workflow** (manual trigger) to test immediately
4. Check the run log — the curl step should return `{"ok":true,...}`

After this, the workflow will run automatically every 30 minutes.

---

## Checklist

- [ ] Step 1: Supabase schema migration run
- [ ] Step 2: Anon key copied
- [ ] Step 3: `.env.local` updated with `NEXT_PUBLIC_*` vars
- [ ] Step 4: Vercel env vars added
- [ ] Step 5: Google OAuth enabled (optional)
- [ ] Step 6: `API_SECRET` added to GitHub secrets
- [ ] Step 7: Deployed to Vercel, ping returns ok
- [ ] Step 8: Signed up at the live URL
- [ ] Step 9: Upwork connected via OAuth
- [ ] Step 10: Notion settings saved, DBs shared with integration
- [ ] Step 11: Singleton token row linked to your user ID
- [ ] Step 12: Sync now works from dashboard
- [ ] Step 13: GitHub Actions cron verified

---

# Resume Supabase & Connect Upwork

## 1. Create a new Supabase project (old one expired)

The old project (`vctzugtikknscgddwwmz`) was paused >90 days and can't be restored via dashboard. Create a new one:

1. Go to https://supabase.com/dashboard/projects
2. Click **New Project**
3. Name it `upwork-to-notion` (or whatever you like)
4. Choose a region close to your Vercel deployment (e.g. US East)
5. Set a database password and click **Create new project**
6. Wait for provisioning (~2 minutes)

### Download backup from old project (optional)

If you had data in the old project you want to keep:
1. Go to the old project in the dashboard
2. Click **Download backup** to save a copy

## 2. Create the `upwork_tokens` table

1. In your **new** project, go to **SQL Editor** (left sidebar)
2. Run:

```sql
CREATE TABLE upwork_tokens (
  id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  scope TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

## 3. Update `.env.local` with new credentials

1. Go to **Project Settings > API** in the new project
2. Copy the **Project URL** → replace `SUPABASE_URL` in `.env.local`
3. Copy the **service_role key** (under "Project API keys") → replace `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`

## 4. Update Vercel environment variables

The Vercel deployment needs the same env vars as local. Update them in the dashboard:

1. Go to https://vercel.com → select the **upworktonotion** project
2. Go to **Settings > Environment Variables**
3. Update or add each variable below (apply to **Production**, **Preview**, and **Development**):

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | Your new Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your new service_role key |
| `NOTION_DATABASE_ID` | `29671440d42e80b6bad5dd9c1a671a28` |
| `NOTION_TOKEN` | Your Notion integration token |
| `UPWORK_CLIENT_ID` | Your Upwork OAuth client ID |
| `UPWORK_CLIENT_SECRET` | Your Upwork OAuth client secret |
| `UPWORK_REDIRECT_URI` | `https://upwork-to-notion.vercel.app/api/upwork/callback` |
| `API_SECRET` | Same value as in `.env.local` |

4. If an old `NOTION_DB_ID` variable exists, delete it
5. After saving, **redeploy**: go to **Deployments** tab → click the `...` menu on the latest deployment → **Redeploy**

## 5. Verify redirect URI on Upwork

Make sure the callback URL is registered in your Upwork OAuth app:

1. Go to https://www.upwork.com/developer/keys
2. Find your app and click edit
3. Verify the **Redirect URI** is exactly `https://upwork-to-notion.vercel.app/api/upwork/callback`

## 6. Run the Upwork OAuth flow (via Vercel)

1. Open in browser: `https://upwork-to-notion.vercel.app/api/upwork/auth`
2. Authorize the app on Upwork
3. You'll be redirected to the callback — look for `{"ok":true,"saved":true}`
4. If you see `"error":"invalid_grant"`, double-check that the redirect URI in step 5 matches exactly

## 7. Test the full pipeline

After OAuth succeeds, test from your terminal:

```bash
export API_SECRET=<your-secret>

# Verify deployment is live
curl -s https://upwork-to-notion.vercel.app/api/ping | jq .

# Test Notion connectivity
curl -s https://upwork-to-notion.vercel.app/api/notion-debug | jq .

# Test Upwork connection
curl -s -H "Authorization: Bearer $API_SECRET" \
  'https://upwork-to-notion.vercel.app/api/upwork/fetch?path=contracts?limit=1' | jq .

# Test full sync (Upwork → Notion)
curl -s -H "Authorization: Bearer $API_SECRET" \
  https://upwork-to-notion.vercel.app/api/sync | jq .
```
