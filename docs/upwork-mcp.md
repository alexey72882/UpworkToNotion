# Upwork MCP — what works, what's blocked

Findings from live probing on 2026-08-22. None of this is in Upwork's documentation, and parts of it contradict what Upwork publishes about itself. Re-check with the commands at the bottom before trusting it — Upwork can change any of this without notice.

**The question this answers:** can a Notion user pull Upwork jobs into Notion *without an Upwork API key*? Upwork does not grant API access to every user, so those users cannot use the API product at all.

**Short answer:** not through Notion. Upwork only accepts logins that come back to a domain on its approved list, and no Notion domain is on it. It does work through Claude, which is on the list.

---

## Where the connection point actually is

**`https://mcp.upwork.com/mcp`**

Not `https://www.upwork.com/ai/mcp` — that is a marketing page, and it sits behind a bot challenge that blocks any non-browser client. Pointing a program at it produces a confusing 403 that looks like an auth failure but isn't.

The real endpoint is properly built. An unauthenticated POST returns a clean `401` with a header telling the client where to go and authorize:

```
www-authenticate: Bearer error="invalid_token",
  resource_metadata="https://mcp.upwork.com/.well-known/oauth-protected-resource/mcp"
```

Related quirk: **`www.upwork.com` blocks command-line tools generally.** Testing anything on the login page needs a real browser — `curl` gets a Cloudflare challenge even with a browser user-agent string.

## Upwork publishes a wrong registration address

Upwork's OAuth settings file (`https://mcp.upwork.com/.well-known/oauth-authorization-server`) says apps should register themselves at:

```
"registration_endpoint": "https://www.upwork.com/register"
```

That is the **human signup page**. It is not an API.

The real registration endpoint is **`POST https://mcp.upwork.com/register`**, and it works — it returns a proper client ID. It is simply not the address Upwork advertises, so any client that follows the published settings (Notion's does) fails at the first step with "couldn't register".

The same settings file also advertises support for logging in **without a secret** (public client with PKCE) and for the newer "point at a public file describing yourself" method. See below for what happened when we tried that.

## The blocker: Upwork keeps a list of approved return addresses

When you register, you tell Upwork where to send the user back after they click "allow". Upwork checks that address against a list. Everything else is rejected with `invalid_redirect_uri`.

| Return address offered | Result |
|---|---|
| a local machine — `http://localhost:8080/callback` | **accepted** |
| Claude — `https://claude.ai/api/mcp/auth_callback` | **accepted** |
| ChatGPT — `https://chatgpt.com/...` (two different paths) | **accepted** |
| Cursor — `https://cursor.com/api/auth/mcp/callback` | **accepted** |
| Claude's other domain — `https://claude.com/api/mcp/auth_callback` | rejected |
| Notion — `https://app.notion.com/workflows/mcp/oauth/callback` | rejected |
| Notion — any other `notion.com` / `notion.so` address | rejected |
| Gemini — `gemini.google.com`, `vertexai.cloud.google.com` | rejected |
| Slack — `app.slack.com` | rejected |
| anything else — `example.com` | rejected |

**It's the domain that matters, not the path.** Two different ChatGPT paths both work. And `claude.ai` works while `claude.com` doesn't — that is how narrow the list is.

Upwork's own MCP page says "any agent that supports remote MCP servers with OAuth can connect." That is not what the server does.

## What this rules out

**Notion Custom Agents.** Notion's connection dialog does accept a custom server URL, an optional client ID, and an *optional* secret — and its return address is the same for every workspace (`https://app.notion.com/workflows/mcp/oauth/callback`). That's a promising shape. But the address is rejected, so the flow dies on Upwork's login page with "Client not found or disabled."

**Notion Workers.** Same wall. Each deployed Worker gets its own Notion-hosted return address, and Notion domains are rejected.

**Registering our own Upwork app doesn't help.** The return address would still be the rejected Notion one. The block is on the address, not on who's asking.

**The "public file" method doesn't work either.** Upwork advertises `client_id_metadata_document_supported: true` — meaning the client ID can be a web address pointing at a file describing the app, with no registration required. We built and served that file, and:

- Upwork **did fetch it** — we caught the request in the logs: `user-agent: okhttp/5.4.0` from `52.89.103.56` (AWS Oregon, Upwork's Java backend), timed exactly to the login attempt.
- Upwork then rejected the login anyway: *"Client not found or disabled."*
- **Claude Code's own equivalent file** (`https://claude.ai/oauth/claude-code-client-metadata`) — which is field-for-field the same shape and known to work elsewhere — gets the **same rejection**.

So the feature is advertised but not honored. The endpoint we built for this lived on branch `spike/mcp-dynamic-auth`, which was deleted after this was written; it's ~25 lines to recreate if Upwork ever turns the feature on.

## What does work: Claude as the engine

Proven end to end on 2026-08-22. Upwork's connector authorizes in Claude with an ordinary browser click — no API key, no developer app, no approval queue. Then jobs go into Notion through Claude's Notion connector.

Test result: three real jobs pulled via Upwork's `find_jobs` and written into a fresh Notion database with client country, rating, hire count, applicant count, posting time, and link all populated. Proof database: https://app.notion.com/p/0af7bc47ee3c449c9bbe4cdb8560c675

Upwork's connector covers the freelancer side — `find_jobs`, `list_freelancer_proposals`, `manage_proposals`, `get_draft` / `update_draft` / `confirm_draft`. Proposal submission is draft-then-confirm, so the write path is human-gated by Upwork itself.

**Three things to know before building on this:**

1. **Dropdown options must already exist.** The model can only pick from options defined in the database schema — it cannot create them. Our first write failed on the `Skills` multi-select. Either pre-seed every option in the template, or make the column plain text.

2. **Nothing prevents duplicate rows.** There is no automatic dedup key. The model has to look up the External ID before writing, and it will not always get that right. See `engineering-notes.md` § Dedup for how badly this went the last time duplicates crept into the job feed.

3. **It is a language model retyping data, not a pipe.** There is no way to connect two MCP services directly — MCP runs between a client and a server, and the client *is* the model. So it sits in the middle reading one and writing to the other. That means it can drop a field, garble a number, or repeat itself, in a way that ordinary code cannot.

**Who pays:** the user's own Claude subscription, not us. That is the real unlock — an agent-driven sync billed per token would cost roughly $85–430 per user per month at a 15-minute cadence, which is absurd for copying rows. Under a flat subscription with a handful of runs per day, it's viable.

**Where this fits:** it's the option for users who cannot get an Upwork API key at all. It is slower and less reliable than the API product. It is not a replacement for it.

## What to send Upwork

Two separate issues, both concrete and verifiable from their side:

> **1. Notion's callback is rejected.** Your MCP registration endpoint at `mcp.upwork.com/register` accepts `https://claude.ai/api/mcp/auth_callback`, `https://chatgpt.com/connector_platform_oauth_redirect`, and loopback addresses, but rejects `https://app.notion.com/workflows/mcp/oauth/callback` with `invalid_redirect_uri`. Your MCP page states that any OAuth-capable agent can connect; Notion Custom Agents currently cannot. Please add Notion's MCP callback to the allowlist.
>
> **2. Your advertised registration endpoint is wrong.** `https://mcp.upwork.com/.well-known/oauth-authorization-server` publishes `"registration_endpoint": "https://www.upwork.com/register"`, which is your human signup page. The working endpoint is `POST https://mcp.upwork.com/register`. Clients that follow the published metadata can never discover it — this is why Notion's automatic registration fails.

Worth also asking whether `client_id_metadata_document_supported: true` is actually implemented, since a correctly-formed document is fetched and then rejected.

## How to re-check this

Both commands are read-only and need no credentials.

**Is the registration endpoint still real, and is the allowlist unchanged?**

```bash
curl -s -X POST https://mcp.upwork.com/register \
  -H 'Content-Type: application/json' \
  -d '{"client_name":"probe","redirect_uris":["https://app.notion.com/workflows/mcp/oauth/callback"],
       "grant_types":["authorization_code","refresh_token"],
       "response_types":["code"],"token_endpoint_auth_method":"none"}'
```

`{"error":"invalid_redirect_uri"}` means Notion is still blocked. A response containing `client_id` means Upwork has allowlisted it and the Notion route is open — that changes the product.

Swap the address for `http://localhost:8080/callback` as a control: it should always return a `client_id`. If *that* starts failing, the endpoint itself changed, not the allowlist.

**Has the published settings file been corrected?**

```bash
curl -s https://mcp.upwork.com/.well-known/oauth-authorization-server
```

Check whether `registration_endpoint` still points at `www.upwork.com/register`.
