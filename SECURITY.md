# Security

Report suspected vulnerabilities to me privately at [wizard@wizardloop.com](mailto:wizard@wizardloop.com) or [on Telegram](https://t.me/wizardloop). Include the affected page, commit if known, reproduction steps, expected impact and a safe contact method. Do not publish exploit details, credentials or personal messages in an issue.

## Scope

I maintain the static website, browser interactions, build tools and GitHub workflows in this repository. I do not operate a visitor-message endpoint, bot service or private application backend for this site. External links lead to independently operated services; report provider vulnerabilities through the relevant provider's process too.

Use a local checkout for testing. I do not authorize account access, accessing another person's data, unsolicited messages or denial-of-service testing through this document. Stop if a test reveals private information and share only the minimum necessary evidence privately. I do not offer a bug bounty or guarantee a response time.

## Public build boundary

Everything in `public/` and `dist/` is public. Never include secrets, sessions, private identifiers or personal correspondence. The website and deployment workflow require no manually configured secrets. A `PUBLIC_` environment variable is public configuration, never a secret store.

Keep dependencies locked and review upgrades. My source/build pattern checks reduce accidental exposure but are not a complete secret scan or security certification. If a credential is published accidentally, notify me privately, revoke or rotate it at the provider and assess the exposure. Deleting a file alone does not invalidate a credential.

## Publication and hosting

Merging to `main` triggers validated publication through GitHub Pages. Pull request checks use read-only permissions; only the separate deployment job receives Pages write and identity-token permissions. See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for the one-time Pages setting, verification and rollback.

I set a referrer policy through document metadata. I do not currently set a Content Security Policy. GitHub Pages does not offer arbitrary repository-defined response headers; do not claim that Permissions-Policy, HSTS or other custom header protections are enforced by these files. Verify actual responses after publication. I would review a separate proxy as a new infrastructure decision.
