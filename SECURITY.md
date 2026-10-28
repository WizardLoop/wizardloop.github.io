# Security

Report suspected vulnerabilities privately to [wizard@wizardloop.com](mailto:wizard@wizardloop.com) or [WizardLoop on Telegram](https://t.me/wizardloop). Include the affected page, commit if known, reproduction steps, expected impact and a safe contact method. Do not publish exploit details, credentials or personal messages in an issue.

## Scope

Relevant code includes the static website, browser interactions, build tools and GitHub workflows. There is no visitor-message endpoint, bot service or private application backend. External links lead to independently operated services; report provider vulnerabilities through the relevant provider's process too.

Use a local checkout for testing. This document does not authorize account access, accessing another person's data, unsolicited messages or denial-of-service testing. Stop if a test reveals private information and share only the minimum necessary evidence privately. There is no bug bounty or guaranteed response time.

## Public build boundary

Everything in `public/` and `dist/` is public. Never include secrets, sessions, private identifiers or personal correspondence. The website and deployment workflow require no manually configured secrets. A `PUBLIC_` environment variable is public configuration, never a secret store.

Keep dependencies locked and review upgrades. Source/build pattern checks reduce accidental exposure but are not a complete secret scan or security certification. If a credential is published accidentally, notify the owner privately, revoke or rotate it at the provider and assess the exposure. Deleting a file alone does not invalidate a credential.

## Publication and hosting

Merging to `main` triggers validated publication through GitHub Pages. Pull request checks use read-only permissions; only the separate deployment job receives Pages write and identity-token permissions. See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for the one-time Pages setting, verification and rollback.

The source sets a referrer policy through document metadata. It does not currently set a Content Security Policy. GitHub Pages does not offer arbitrary repository-defined response headers; do not claim that Permissions-Policy, HSTS or other custom header protections are enforced by these files. Verify actual responses after publication. Adding a separate proxy would be a new infrastructure decision.
