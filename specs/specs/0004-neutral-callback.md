# 0004 – Neutral OAuth callback (authvault.app)

**Status:** In progress
**Owner:** @alexey72882

## Problem

Every user registers their **own** Upwork developer app, and Upwork **human-reviews** each registration. When the OAuth redirect URI points at `freelancelog.com`, a reviewer skimming or clicking a registration can see the tool and may pattern-reject applications. We want each user's app to look independent, and **nothing a reviewer can reach should tie back to `freelancelog.com`** — while users keep using `freelancelog.com` (only Upwork sees a neutral domain).

## Design

Each user registers a per-user `*.vercel.app` callback that **307-redirects to the neutral domain `authvault.app`**. `authvault.app` is attached to the **same** Vercel project and **path-gated** (only `/api/upwork/callback` responds; everything else is a blank 404), so the callback runs in place — no separate app, no shared secret, no server-to-server hop. A reviewer probing the registered `vercel.app` URL lands on `authvault.app` showing a neutral error; `freelancelog.com` is never reachable.

Because the callback lands off `freelancelog.com`, OAuth CSRF state moves from the cookie to a **server-side nonce** (`user_settings.upwork_oauth_nonce` + timestamp; random, single-use, 10-min expiry) — a standard pattern. `completeUpworkOAuth()` is the shared core used by both the neutral and direct callbacks.

### Verified pre-conditions
- A manually-added vanity `*.vercel.app` does **not** auto-redirect; the 307 is an explicit per-domain setting (`redirect` + `redirectStatusCode` via the Vercel API). It preserves `?code&state`.
- Same-project is safe: Vercel issues per-domain certs (no SAN bundling), DNS/IP only reveal "on Vercel" (shared IPs), account ownership isn't public. The one artifact (identical response `etag`) is confirm-not-discover.

## Components

- `middleware.ts` — host path-gating for `authvault.app`.
- `src/lib/upworkOAuth.ts` — `completeUpworkOAuth(userId, nonce, code)`: server-side nonce validation + token exchange (per-user `upwork_redirect_uri`) + save + nid/org/person capture.
- `src/pages/api/upwork/auth.ts` — server-side nonce, per-user redirect_uri (no auto-assign).
- `src/pages/api/upwork/callback.ts` — thin: parse state → `completeUpworkOAuth` → neutral error / success bounce to the app.
- `src/lib/callbackPool.ts` + `src/pages/api/user/callback-url.ts` — assign a callback from the `callback_domains` pool ("Get my callback URL" button in Settings).

### Data model (Supabase)
`user_settings`: `upwork_redirect_uri`, `upwork_oauth_nonce`, `upwork_oauth_nonce_at`. New `callback_domains` pool table (`redirect_uri` PK, `user_id`, `assigned_at`).

## Operational

Pool provisioning per user (scriptable via Vercel API): add `<name>.vercel.app` to the project, set its `redirect=authvault.app, redirectStatusCode=307`, insert its callback URL into `callback_domains`. `authvault.app` attached to the project (serving, WHOIS privacy on).

## Residual limits

Cross-referencing many users reveals "a tool" (never the freelancelog *name*); same Vercel IPs; relies on WHOIS privacy.
