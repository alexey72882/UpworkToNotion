# What is UpworkToNotion?

UpworkToNotion is a web app for freelancers who use Upwork to find work and Notion to organize their life. It automatically pulls job listings and work activity from Upwork and saves them into Notion — so everything shows up in one place without any manual copy-pasting.

---

## The problem it solves

Upwork has a job feed, but it's noisy and you can't customize how it's organized or filter it the way you want. You also can't see your tracked hours, earnings, or job history in Notion alongside your notes and tasks. Freelancers end up switching between tabs, copying job links manually, and losing track of what they've applied to.

UpworkToNotion fixes this by keeping Notion updated automatically, every few minutes.

---

## What it actually does

### 1. Finds matching jobs and saves them to Notion

You set up a search filter — things like "UX/UI design jobs, hourly rate $50–150/hr, verified payment only, Expert level." The app runs that search on Upwork every 2 minutes and saves any new matching jobs into a Notion database. Each job entry includes the title, description, job type, budget, client's country, and a direct link to the Upwork listing.

If you've already submitted a proposal for a job, the app automatically marks it as "Applied" in Notion and adds the proposal link.

### 2. Tracks your work diary

For each active contract, the app records how many minutes you tracked per day and saves that into a separate Notion database. This gives you a daily log of hours worked across all your contracts — useful for invoicing, planning, or just knowing where your time goes.

### 3. Keeps everything in sync automatically

There's no "sync" button to click. A cron job runs every 2 minutes and updates Notion silently in the background. If a job already exists in Notion, it's updated rather than duplicated.

---

## How a user sets it up

1. **Sign up** at the website with an email address.
2. **Register a free Upwork API app** at upwork.com/developer/keys (takes about 2 minutes). Paste the Client Key and Client Secret into the app's Settings page.
3. **Click Connect** — this starts the Upwork login flow. After you authorize, the app saves your tokens automatically.
4. **Connect Notion** — paste your Notion integration token and the IDs of your Notion databases (Job Feed DB and Work Diary DB).
5. **Set your filters** — use the Filters page to pick what kinds of jobs to look for: category, subcategory, job type, budget range, experience level, project length, client history, and more.
6. **Done.** Notion starts filling up with jobs within 2 minutes.

---

## Key features

- **Automatic sync every 2 minutes** — new jobs appear in Notion almost instantly
- **12 filter options** — category, subcategory (70 options), job type, hourly rate range, fixed budget range, experience level, project duration, client payment verification, number of proposals, client hire history
- **Applied job tracking** — jobs you've already proposed on are automatically flagged in Notion
- **Work diary** — daily time tracking log per contract saved to Notion
- **Each user connects their own accounts** — your Upwork credentials and Notion workspace stay private; they're never shared
- **No browser extension needed** — runs in the cloud, works 24/7 even when your computer is off

---

## What it does NOT do

- It does not send proposals or apply to jobs on your behalf
- It does not read or write your Upwork messages
- It does not access payment or earnings data (Upwork blocks this at the API level)
- It cannot fetch more than ~10 jobs per search query (an Upwork API limitation)
- It does not create the Notion databases for you — you set those up once manually

---

## Who it's for

Freelancers on Upwork who:
- Already use Notion as their primary workspace
- Want to track job opportunities without manually copying links
- Want a searchable, filterable job log they control
- Want their work hours visible inside Notion alongside their other content
