# Feedback service setup and review

The static website remains on GitHub Pages. `services/feedback/worker.mjs` is a separate, dependency-free Cloudflare Worker with JSDoc types. It receives feedback, verifies Cloudflare Turnstile on the server, and sends a private message through the Telegram Bot API.

**Status:** implemented and tested against mocked providers. No Worker has been deployed, no live credentials have been used, and no Telegram delivery has been tested. Repository automation must not deploy this service. Merging, deployment and a real delivery test require the owner's explicit approval.

## Local tests and mock

From the repository root, with Node 22 or later:

```sh
npm --prefix services/feedback test
npm --prefix services/feedback run dev:mock
```

The mock listens only on `http://127.0.0.1:8787/feedback`. It accepts frontend origins `http://127.0.0.1:4321`, `http://localhost:4321` and the same hostnames on port 4322. The local server explicitly sets `MODE=mock`; production requires `MODE=production`.

A mock request must use `turnstileToken: "local-mock-token"`. A successful mock result contains `mock: true` and the message `Local test complete. No message was sent to Telegram.` The frontend must display this distinction. This is not a working CAPTCHA or proof of real delivery. The mock makes no outbound requests, retains no submitted messages, and permits five requests per origin per minute in process memory.

Mock mode requires both a loopback request target and a loopback Origin. Uploading the same mock configuration onto a public Worker cannot enable this local bypass. Production refuses missing credentials, unverified Chat IDs, test Turnstile keys, missing rate-limit bindings and non-HTTPS requests. The package has no dependencies; the lockfile records that fact.

## Frontend contract

Set only the deployed endpoint URL and public Turnstile sitekey in public frontend configuration. Do not put a secret key, bot token, numeric Chat ID, or rate-limit salt in any variable prefixed `PUBLIC_` or in the Pages build.

`POST /feedback` with `Content-Type: application/json`:

```json
{
  "name": "A visitor",
  "message": "A message for WizardLoop.",
  "email": "",
  "website": "",
  "turnstileToken": "a-fresh-widget-token",
  "sourcePath": "/feedback/"
}
```

| Field | Rule |
| --- | --- |
| `name` | Required, trimmed, 1 to 80 UTF-16 code units, no line breaks |
| `message` | Required, trimmed, 1 to 2500 UTF-16 code units; line breaks permitted |
| `email` | Optional, maximum 254 code units; reasonable email syntax, no whitespace or header injection |
| `website` | Optional honeypot, must be exactly empty when supplied |
| `turnstileToken` | Required, maximum 2048 code units; each real submission requires fresh verification |
| `sourcePath` | Optional, defaults to `/feedback/`; restricted local path, no query, fragment or external URL |

Extra fields are rejected. The stream is limited to 16 KiB even without a Content-Length header; body reading has a five-second deadline. Unsupported content types, invalid UTF-8, malformed JSON and control characters are rejected.

Use Turnstile Managed mode with `action: "feedback"`. Reset the widget after every submission attempt, including network failures, validation errors and delivery errors, because a token may have been consumed. Send requests with `credentials: "omit"`. Never put feedback fields in query strings, analytics events, error reports or client logs. Use the accessible status region for the returned generic message and keep the user's text in the form on failure.

| HTTP status | Meaning | Frontend behavior |
| --- | --- | --- |
| 200, `ok: true`, `mock: false` | Telegram returned success | Show success and clear the form |
| 200, `ok: true`, `mock: true` | Local demonstration only | State explicitly that nothing was sent |
| 400 / 408 / 413 / 415 / 422 | Invalid request, timeout, size, content type or CAPTCHA | Keep entered values, display error, reset verification |
| 403 | Rejected origin or preflight | Display a general unavailable message |
| 429 | Local submission rate exceeded | Honor `Retry-After`, keep content, reset verification |
| 503 | Configuration, verification or delivery unavailable | Keep content, offer manual retry with new verification |
| 503 with `mayHaveBeenDelivered: true` | Telegram request outcome is uncertain | Say delivery could not be confirmed and ask the visitor to wait before retrying |

The worker retries a transient Siteverify failure once using the same idempotency key. It rejects unsuccessful or replayed verification and requires the returned hostname to equal the request Origin's hostname and the returned action to equal `feedback`. This follows [Cloudflare's server-side validation contract](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/). There is no client-only verification shortcut.

## Create and verify the private Telegram destination

Use a dedicated bot created through [Telegram's BotFather](https://t.me/BotFather). Keep its token in a password manager. Do not paste the token into a browser URL, command argument, screenshot, public issue or chat with this assistant.

Run the local helper in a private interactive terminal:

```sh
npm --prefix services/feedback run setup:chat
```

It prompts for the token without echoing it or accepting command-line arguments. It calls `getMe` and `getWebhookInfo`, refuses a bot with an active webhook, then prints a random one-time phrase. Open the verified bot from the `@wizardloop` account, press Start and send the phrase manually. After Enter, the helper reads at most 100 updates and requires exactly one private message containing that phrase from `@wizardloop`, with matching sender and chat IDs. It confirms the private chat using `getChat`.

The numeric Chat ID is printed only in the local terminal so the owner can copy it into the secret manager. The token is never printed. No files are written, no update offsets are acknowledged, no webhook is changed and no message is sent by the helper. Clear the terminal if it is shared. Use a fresh dedicated bot to avoid existing webhook integrations and update backlogs. If the private username changes, review and update the expected username in this helper intentionally.

Set `TELEGRAM_CHAT_ID_VERIFIED=true` only after this verification. The flag records an operator check, not a cryptographic proof. Starting a conversation permits a bot to reply, but blocked bots and revoked tokens can still fail later. Actual send capability requires one separately approved live test. The API takes a numeric private Chat ID, not the owner's personal username; see the official [Telegram sendMessage and getUpdates documentation](https://core.telegram.org/bots/api).

## Configuration and secrets

Review `services/feedback/wrangler.jsonc`. All routes, workers.dev serving and preview URLs are disabled initially. No account ID, DNS change or public endpoint is included.

| Name | Storage | Value |
| --- | --- | --- |
| `MODE` | Worker variable | `production` |
| `ALLOWED_ORIGINS` | Worker variable | Exact comma-separated HTTPS origins, initially `https://wizardloop.com` |
| `TURNSTILE_HOSTNAMES` | Worker variable | Exact comma-separated verified hostnames, initially `wizardloop.com` |
| `TELEGRAM_CHAT_ID_VERIFIED` | Worker variable | `true` only after private-chat verification |
| `TURNSTILE_SECRET_KEY` | Worker secret | Secret from the Managed Turnstile widget |
| `TELEGRAM_BOT_TOKEN` | Worker secret | Dedicated bot's token |
| `TELEGRAM_CHAT_ID` | Worker secret | Verified positive numeric private Chat ID |
| `RATE_LIMIT_SALT` | Worker secret | Independently generated high-entropy random value of at least 32 bytes |
| `RATE_LIMITER` | Worker binding | Cloudflare Rate Limiting binding |

Generate the salt with a trusted password manager. Never commit `.dev.vars`, `.env` files, tokens, session files or personal Chat IDs. The directory's `.gitignore` excludes them. `.env.example` contains empty placeholders only. Local real-credential testing is deliberately not enabled by the mock server.

The Turnstile widget must allow the production hostname. Do not add localhost to a production widget. Public test keys belong only in a dedicated test setup; this production worker intentionally rejects the documented dummy secret patterns. See [Cloudflare testing guidance](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

For the rate-limit binding, select an unused positive `namespace_id` within the owner's Cloudflare account; `1001` is a configuration example, not a provisioned account resource. The configured threshold is five attempts per minute. Missing or failed rate-limit infrastructure fails closed. The key is a daily HMAC of the Cloudflare-provided IP with a secret salt; neither the raw IP nor the key is sent to Telegram or application logs. No tracking cookie is created.

Cloudflare's rate-limit binding is approximate and local to each Cloudflare location. It is not a strict worldwide quota. This anonymous form has no account identifier, so a transient IP-derived key is used with the known tradeoff that people sharing a connection can share a limit. A strict global limit would require additional state such as a Durable Object. See [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Approved deployment procedure

Do not execute this section until the owner separately approves production changes. The main site's CNAME and GitHub Pages deployment remain separate.

1. Review the tests and configuration, choose the endpoint without changing `wizardloop.com` DNS, and obtain approval for the exact external Worker endpoint and cost settings.
2. Use a current, pinned Wrangler 4 release supporting `ratelimits` (at least 4.36.0). Install it as local development tooling in this service and retain its lockfile update for review. It is unnecessary for the dependency-free local mock and unit tests.
3. Configure the secrets through Cloudflare's secret manager. **`wrangler secret put` immediately deploys a Worker version.** On an existing Worker, `wrangler versions secret put NAME` creates a version without deploying it. Do not treat uploading secrets as a harmless read-only setup action. Cloudflare's [secret management documentation](https://developers.cloudflare.com/workers/configuration/secrets/) explains the difference.
4. Choose the approved route or explicitly enable the approved workers.dev endpoint. Keep `MODE=production`, exact origin and hostname lists, and the configured rate-limit binding. Do not enable wildcard CORS or allow localhost in the public production configuration.
5. Review an uploaded version and deploy only through the approved release process. The Worker code does not require a bundling step or Node compatibility flags.
6. Set the static website's public feedback endpoint and public sitekey. Update its CSP `connect-src` with that exact endpoint and permit only the required Turnstile hosts in the appropriate directives.
7. With explicit permission, submit one clearly labeled non-sensitive test from the real production website and confirm receipt in the intended private chat. Test invalid CAPTCHA, bad Origin and a rate-limit response as well. Record the date and observed results without visitor messages, bot tokens or Chat IDs.
8. Keep the form unavailable or clearly local-only until delivery is verified. Do not claim that Telegram sending works based only on these mocks.

For rollback, restore the previous reviewed Worker version through Cloudflare and disable the public form endpoint in the static configuration if needed. Rotating a bot token or secret is an external change requiring the same explicit operational approval. No deployment workflow is supplied here.

## Data flow and known limits

The submitted name, message and optional email pass through Cloudflare to the owner's private Telegram conversation. The message contains the verified site origin plus a restricted source path and a UTC receipt time. HTML metacharacters are escaped, URL previews are disabled, and `protect_content` is requested. These settings do not guarantee that a recipient or provider cannot retain content.

There is no database, queue, mail provider or application log containing submissions. The worker does not send IP addresses to Telegram and omits optional `remoteip` from Siteverify. Cloudflare still handles connection metadata and performs security processing, and Telegram stores the resulting message under its own service rules. The owner must choose an actual message-retention and deletion practice before publishing the privacy policy. This implementation does not enforce deletion from the Telegram conversation.

No automatic retry of `sendMessage` occurs: a timeout may happen after delivery, and the API call has no application idempotency key here. The user can retry with a new CAPTCHA after a clear warning. A queue and durable delivery ledger would be needed for stronger delivery guarantees. Message limits keep the resulting formatted text below Telegram's 4096-character limit after parsing.

CORS and Origin checks limit browser callers but are not authentication for arbitrary clients; Turnstile and rate limiting remain required. The honeypot is supplemental. All API responses carry `no-store`, no-referrer, `nosniff`, restrictive CSP and frame protection. These are this Worker's response headers, not a claim that GitHub Pages serves those same headers. Cloudflare observability is disabled in this initial configuration; platform-level security records may still exist.

## Automated evidence

The offline test suite covers successful escaped delivery, required fields, injection attempts, body byte limits, malformed JSON, exact Origin checks, preflight restrictions, missing configuration, disabled and failed rate-limit bindings, daily key rotation, invalid and replayed CAPTCHA, hostname/action mismatch, bounded verification retries, provider timeout, manual retry after Telegram failure, ambiguous delivery, security headers, local-only mock restrictions and mock rate limits.

Tests use fake credentials and mocked network transports. They are not evidence of a deployed Cloudflare binding, real Turnstile operation, legal compliance or a successful Telegram message. Preserve the final test output with the repository's QA report.
