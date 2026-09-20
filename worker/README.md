# Vote & Rewards backend (Cloudflare Worker)

This is the small free backend that powers the "Vote" button and the
vote-claim API. GitHub Pages (the main site) can only serve static files,
so this piece lives on Cloudflare's free tier instead.

## What it does

- `GET /vote?server=<slug>&user=<name>` — shows a vote form
- `POST /vote` — records a vote (1 per player per server per 12h, plus a
  short per-IP throttle to slow down scripted abuse)
- `GET /api/vote-status?server=<slug>&user=<name>&key=<api key>` — lets a
  server's own game code check "did this player just vote for me?"
- `POST /api/vote-claim` — lets a server's own game code mark that vote as
  claimed, so it can't be reused for a second reward
- `GET /api/vote-counts` — public vote totals per server, for leaderboards
- `POST /api/admin/register-server` — issues a private API key for a server
  that wants the claim integration (protected by an admin secret only you
  know — never commit this secret to git)

Voting itself needs no cooperation from the server owner — anyone listed in
`servers.json` is votable. The claim API (in-game rewards) is opt-in per
server: only servers you've issued an API key to can check/claim votes.

## One-time setup (free)

1. Sign up at https://dash.cloudflare.com (free account, no credit card
   needed for Workers' free tier).
2. Install the CLI: `npm install -g wrangler`
3. Log in: `wrangler login` (opens a browser to authorize)
4. Create the KV store that holds votes:
   `wrangler kv namespace create VOTES`
   This prints an `id`. Paste it into `wrangler.toml` in place of
   `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.
5. Set your admin secret (used only by you, to issue API keys to servers):
   `wrangler secret put ADMIN_SECRET` (it will prompt you to type a value)
6. Deploy: `wrangler deploy`
   This prints your live URL, something like
   `https://rsps-toplist-votes.<your-subdomain>.workers.dev`
7. Put that URL into `index.html`'s `VOTE_API_BASE` constant (near the top
   of the `<script>` block) and commit.

If you'd rather not run these commands yourself, give me a Cloudflare API
token (dashboard → My Profile → API Tokens → create one scoped to Workers)
and I can run steps 3-7 for you directly.

## Issuing a server owner their vote-claim API key

Once a server owner says yes to the integration (see the submission issue
template), run:

```
curl -X POST https://<your-worker-url>/api/admin/register-server \
  -H "Content-Type: application/json" \
  -d '{"slug": "their-server-slug", "adminSecret": "<your admin secret>"}'
```

This returns `{"slug": "...", "apiKey": "..."}`. Send that `apiKey` to the
server owner privately (e.g. a DM, not a public comment) — it is never
stored in this git repo.

## Integrating on the server owner's side

This part is the server owner's own job, using their own server's language
of choice (Java, Kotlin, whatever their codebase uses) — it's a plain HTTP
call, no special library needed:

1. Player types `::vote` in game → the server sends them a link:
   `https://<your-worker-url>/vote?server=<their-slug>&user=<PlayerName>`
2. Player votes on that page.
3. Player types `::claimvote` in game → the server's own code calls:
   `GET https://<your-worker-url>/api/vote-status?server=<slug>&user=<PlayerName>&key=<their api key>`
   If `pending: true`, the server grants whatever reward it wants, then calls:
   `POST https://<your-worker-url>/api/vote-claim` with JSON body
   `{"server": "<slug>", "user": "<PlayerName>", "key": "<their api key>"}`
   to mark it claimed.

None of this touches the RSPS's actual game/server code from this side —
it's just two HTTP calls the owner adds to their own `::claimvote` command.
