# SolYan PDF — Cloudflare Autopilot control plane

**Status: code/test lane, not yet deployed or connected to an AI coding service.**
Cloudflare coordinates work even when both Windows PCs are off. It does *not*
call a personal ChatGPT conversation. No API keys, Codex auth tokens, paid
containers or cloud deployment credentials are stored in this repository.

## Supported workflow

GitHub `workflow_run.completed` events are checked using the original raw-body
HMAC-SHA256 signature, repository identity, source branch and *live HEAD*.
A SQLite Durable Object stores delivery deduplication and the D5/D6 queue.
`CI PASS` on exact task SHA advances that task; `CI FAIL` creates
`repair_ready` (not a speculative repair). The next task is shown as ready
but **no AI runner is connected**, so code changes are not yet automatic.

A cron every 15 minutes checks GitHub's repo-wide run list to recover
missed webhook deliveries. Neither cron nor webhook consumes any AI tokens.

## Deployment — only after obtaining Cloudflare account access

1. From `cloudflare-autopilot/`, run `npm install` and
   `npx wrangler deploy` in an authenticated Cloudflare environment.
   CI uses `wrangler deploy --dry-run` and never performs a production deploy.
2. Configure encrypted Worker secrets with `wrangler secret put`:
   `GITHUB_WEBHOOK_SECRET` and `STATUS_TOKEN` (two separate strong random
   strings). Optional read-only `GITHUB_TOKEN` improves GitHub API limits.
   Never send secrets to the assistant or commit them.
3. With appropriate GitHub repository admin rights, register a webhook:
   URL `https://<worker>.workers.dev/github/webhook`,
   content-type `application/json`, event **Workflow runs**,
   secret matching `GITHUB_WEBHOOK_SECRET`.
4. Check `GET /health`; query `GET /status` using an
   `Authorization: Bearer <STATUS_TOKEN>` header after first cron.
   Do not publish the secret-bearing URL or token.

## Boundaries

- No writes to source, main, releases or GitHub Actions.
- No access token/API key required for public read-only GitHub API; public
  unauthenticated rate limits can delay reconciliation. Fail closed on errors.
- A PASS for an individual workflow is **not** complete product acceptance.
- The previous Windows Task Scheduler lane on `feat/autopilot-engine` is
  not required and should remain disabled; never run two orchestrators
  against the same source branch.
- Before claiming full autonomy, a separately authenticated *AI coding
  runner* must be integrated and actually tested end-to-end. The currently
  documented ChatGPT Plus entitlement does not by itself provide an
  unattended API to wake arbitrary Chat conversations.
- `AGENTS.md` remains the policy source of truth. No loosening CI gates.

Local tests: `node --test tests/*.test.mjs`.

## Cloudflare dashboard build configuration

For the `solyan-pdf-autopilot` Worker connected to `solyan842/SolYan-PDF`, set
**Production branch** to `feat/autopilot-cloudflare`, **Root directory** to
`/cloudflare-autopilot`, and **Deploy command** to `npx wrangler deploy`.
Use a dedicated Workers Builds token; avoid reusing credentials from other
applications. After changing the production branch, the next push to that
branch initiates the new production build; retrying an old `main` commit is
not an equivalent trigger. A green build only verifies the Worker deployment,
not GitHub webhook delivery or unattended AI execution.
