# Security

Report suspected vulnerabilities privately to [wizard@wizardloop.com](mailto:wizard@wizardloop.com) or [WizardLoop on Telegram](https://t.me/wizardloop). These are the contact details published by the owner. Do not create a public issue containing exploit details, credentials, personal feedback or private account identifiers.

Include the affected page/component, commit/version if known, concise reproduction, expected impact and a safe way to contact you. Redact tokens, cookies, sessions, chat IDs and personal messages. Do not send real credentials as proof.

## Scope and safe reporting

Relevant code includes the static site, build pipeline and optional profile, posts and feedback services. Bugs in Telegram, Cloudflare, GitHub or a dependency should also be reported through that provider's process where appropriate.

Use a local checkout, fixtures and the mock to investigate. This document does not authorize production testing, unsolicited messages, account access, accessing another person's data, sustained traffic or denial-of-service testing. Stop if a test exposes private information and report the minimum necessary evidence privately.

There is no bug bounty or guaranteed response time. The rebuild is an unreleased candidate, and no support promise is made for a historical version. Fixes should be reviewed on the current development line; deployed-version handling depends on the actual production state.

## Credential and data boundaries

- Pages output is public. Never put tokens, API hashes, private chat IDs, sessions or secret keys in `public/`, content, `dist/`, issue attachments or `PUBLIC_` environment variables.
- Keep service credentials in the deployment host's secret store. Personal Telegram sessions are not supported by the profile service.
- Run real service tests only with owner approval. Local feedback uses an explicit mock and sends no Telegram message.
- Keep provider responses and visitor submissions out of CI logs and public artifacts. Use non-sensitive fixtures and generic failure messages.
- Review dependency upgrades and lockfile changes. Pattern checks are guardrails, not a complete secret scan or security certification.

If a credential is published accidentally, notify the owner privately. The owner should revoke or rotate it at the provider, assess use and remove it from accessible artifacts as appropriate. Deleting a file or commit alone does not invalidate a leaked credential. Production credential or service changes still follow the owner's operational authorization.

## Hosting limitations

The site includes a document-level CSP where applicable. GitHub Pages does not provide a general repository-defined response-header configuration. Do not claim that Permissions-Policy, HSTS or header-only CSP directives are set by this source alone. Audit real responses after approved deployment. A separate CDN/proxy requires an approved infrastructure decision.

See [integration feasibility](docs/INTEGRATION-FEASIBILITY.md), [feedback setup](docs/FEEDBACK-SETUP.md), [profile sync](docs/PROFILE-SYNC.md) and [deployment](docs/DEPLOYMENT.md) for implementation boundaries and remaining live checks.
