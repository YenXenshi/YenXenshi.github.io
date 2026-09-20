# YenXenshi.github.io — RSPS Toplist

A free, auto-updated directory ("toplist") of RuneScape private servers (RSPS).
Server owners submit their server for free; a daily GitHub Action pings each
site to keep online/offline status current. Revenue comes from display ads
and paid "Featured" placements.

This is a directory/index of servers other people run — it does not host,
distribute, or modify any RSPS game software itself.

## How it makes money

1. **Display ads (AdSense)** — $0 to start.
   - Apply at https://www.google.com/adsense.
   - Once approved, paste your AdSense `<script>` snippet into the `<head>`
     of `index.html`, and replace the two `.ad-slot` divs with your ad units.
2. **Featured listings (paid)** — server owners pay for a pinned, highlighted
   spot at the top of the list.
   - Set your price (a common starting point in this niche is $5–20/month).
   - Take payment via a PayPal.me link, Ko-fi, or crypto address — no
     merchant account needed to start.
   - When someone pays, flip `"featured": true` on their entry in
     `servers.json` (or open a PR) and mark it in the issue thread.
3. Optional later add-ons once there's traffic: affiliate links to RSPS
   hosting providers that run referral programs, or a "verify/bump" fee for
   owners who want their listing refreshed more often.

## How submissions work

Server owners open a **Submit Server** issue (template auto-loads the
required fields: name, website, connect info, revision, description). Add
their entry to `servers.json` to publish it — no code changes needed beyond
that JSON file.

## Automation

`.github/workflows/update.yml` runs `scripts/update_status.py` once a day
(and on demand via "Run workflow"). It pings every server's website and
updates `status` (`online`/`offline`) and `last_checked` in `servers.json`,
committing the change automatically. The homepage (`index.html`) reads
`servers.json` client-side, so the site always reflects the latest run —
no rebuild step needed.

## Getting it live

1. Push this branch's changes to `main`.
2. In repo Settings → Pages, confirm Pages is serving from the `main`
   branch root (standard for a `<user>.github.io` repo).
3. Set up AdSense and your payment link for Featured slots (see above).
4. Share the "Submit Server" issue link in RSPS communities (Discord
   servers, forums, subreddits) to seed your first free listings.
