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
