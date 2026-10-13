# ClassQuiz: hackathon presentation walkthrough

Present slides 1–9 in about 5½ minutes, or around 6 minutes with brief pauses. Slides 10–12 are optional Q&A and deployment material. Notes are also embedded in the PowerPoint. The deck uses an original magenta-inspired design, not an official Deutsche Telekom template.

Live demo: [quiz.911bob.dev](https://quiz.911bob.dev). The presenter reports no 2FA configured. SMTP and email verification are absent in the demo setup. Authenticator-based TOTP itself does not require SMTP.

## The key fact checks

- **MPL 2.0:** permits company use, self-hosting and private modification. External distribution creates source and notice obligations for covered code. Browser-delivered code matters here.
- **Entra ID:** generic OpenID Connect support exists, but the inspected code needs compatibility work and a real tenant test. Do not claim direct, out-of-the-box Entra support.
- **Technology:** SvelteKit/TypeScript and Tailwind in the browser-facing app, Python/FastAPI and Socket.IO for quiz logic, with PostgreSQL, Valkey and Meilisearch services. Docker Compose supports deployment.
- **Theming:** reusable components and shared styles help. A basic recolor looks modest, but a full theme requires changes across screens and accessibility checks. This is an assessment, not a measured estimate.

## 1. ClassQuiz (20 seconds)

**On the slide**

- An open-source quiz platform for our company events
- Hackathon proposal for Deutsche Telekom
- Created by Mawoka and the ClassQuiz contributors

**What to say**

I would like to propose ClassQuiz for our internal events. It is an existing open-source project, created by Mawoka and its contributors. I found it while looking for a tool that fits our need, and we made some small interface changes for our use.

**Evidence**

- [Source 1](https://github.com/mawoka-myblock/ClassQuiz)
- [Source 2](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/README.md)

## 2. The need and my contribution (35 seconds)

**On the slide**

- We do not have Kahoot available.
- Our current alternative has been unreliable.
- Found a suitable open-source project.
- We simplified the UI, including removing “Why choose ClassQuiz”.
- The proposal is to evaluate ClassQuiz for an internal pilot.

**What to say**

At events, a quiz gives people an easy way to participate. We do not have Kahoot available, and our current internal alternative has been unreliable. My contribution is finding an existing solution that appears to cover the need, then helping make it more suitable for us. We removed some promotional clutter. The underlying quiz platform and its features belong to the original project.

**Evidence**

- Business need and contribution: presenter’s account in this conversation.
- UI changes: local frontend/src/routes/+page.svelte and existing Git diff.
- [Source 3](https://github.com/mawoka-myblock/ClassQuiz)

## 3. A familiar live quiz experience (50 seconds)

**On the slide**

- 1 Prepare: the host creates a quiz and starts a session.
- 2 Join: participants open a browser and enter the game PIN.
- 3 Play: answer questions and see the results together.
- Live demo: https://quiz.911bob.dev
- Demo setup: no 2FA configured, no SMTP/email verification.

**What to say**

I already have a demonstration running at quiz.911bob.dev. The host prepares a quiz, participants join in a browser using a game PIN, and everyone sees the results. The current demo has no 2FA configured and no SMTP service or email verification. Those are demo choices. A company developer would configure the authentication and services we want for a corporate deployment. This original ClassQuiz screenshot shows the play experience, and I can demonstrate the running site.

**Details for questions**

Optional demo: replace this explanation with a rehearsed 45–60 second demonstration. Have the quiz and host session ready before presenting. Keep this slide as the fallback. Do not claim large-event capacity or reliability from a short demo. Standard PIN-based participation is separate from host/account SSO. The presenter reports no 2FA configured in the demonstration. SMTP is absent and email verification is skipped in the local deployment configuration. Do not state that SMTP is required for 2FA: ClassQuiz includes authenticator-based TOTP, which does not use SMTP. The public demo is not a company deployment.

**Evidence**

- [Source 1](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/README.md)
- [Source 2](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/frontend/src/lib/play/join.svelte)
- [Source 3](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/frontend/src/lib/assets/landing_new/select_org.webp)
- [Source 4](https://quiz.911bob.dev)
- [Source 5](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/classquiz/routers/users/twofa.py)
- Demo 2FA configuration: presenter’s statement. SMTP/email-verification configuration: local deploy/README.md and deploy/compose.yaml.

## 4. MPL 2.0 permits company use (40 seconds)

**On the slide**

- We can use, self-host and modify ClassQuiz for internal company events.
- Within the organization: internal modifications do not have to be published publicly.
- If we distribute it outside: provide the covered source, including changes, to recipients under MPL terms.
- Preserve license and copyright notices. Hosting and support still have a cost.

**What to say**

ClassQuiz uses the Mozilla Public License 2.0. Mozilla explicitly allows companies to use the software and make private modifications. For use inside the organization, those changes do not need public release. If we distribute covered software outside the organization, source-sharing and notice obligations apply. This makes internal deployment possible without buying a ClassQuiz software license, while infrastructure and maintenance still need resources.

**Details for questions**

MPL is file-level copyleft. New independent files are not automatically MPL-covered. Server execution alone is not distribution, but browser-delivered HTML, CSS and JavaScript count as delivered code. External guests or a publicly accessible deployment therefore need a distribution review. Ask the company’s open-source/legal process to confirm organizational boundaries, dependencies and any external rollout. MPL does not provide trademark rights or an enterprise support commitment. Removing promotional UI is permitted, but retain source license notices. This summarizes the cited terms, not a company legal approval.

**Evidence**

- [Source 1](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/LICENSE)
- [Source 2](https://www.mozilla.org/en-US/MPL/2.0/)
- [Source 3](https://www.mozilla.org/en-US/MPL/2.0/FAQ/#using-and-distributing-software-under-the-license)
- [Source 4](https://www.mozilla.org/en-US/MPL/2.0/FAQ/#other-common-questions)

## 5. Entra ID sign-in needs integration work (45 seconds)

**On the slide**

- The foundation exists: OpenID Connect.
- ClassQuiz supports custom OpenID login.
- Microsoft Entra ID supports the same sign-in standard, including SSO.
- This version needs adaptation and testing.
- SSO means using the company sign-in. It still needs IT configuration and validation.

**What to say**

There is a useful foundation for company login. ClassQuiz has a configurable OpenID Connect integration, and Entra ID supports that standard for single sign-on. However, I would not describe this version as having ready-to-use Entra support. Its login code makes some assumptions about the identity data it receives. A developer needs to adapt those assumptions and test the flow with our tenant. IT would also register the application and decide who can access it.

**Details for questions**

Code inspection, not a tenant test: Userinfo.sub is a uuid.UUID and later uses .hex, whereas Microsoft documents sub as an opaque string. The model also requires email_verified, email and other fields, plus a refresh_token in the outer response. These are not all guaranteed by a default Entra OIDC response. Configure a tenant-specific app and validate stable identity mapping, missing claims, registration/account linking and sessions. Do not replace validation with blindly trusted email values. Entra SSO for quiz creators does not automatically restrict PIN-based participant access or every route. No internal Entra access was available for validation.

**Evidence**

- [Source 1](https://classquiz.de/docs/self-host)
- [Source 2](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/classquiz/oauth/custom.py)
- [Source 3](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/classquiz/oauth/init_oauth.py)
- [Source 4](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc)
- [Source 5](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference)

## 6. The technology in plain language (35 seconds)

**On the slide**

- Part — What it does — Technology
- Browser interface — Shows the quiz editor and
participant screens — SvelteKit / TypeScript
Tailwind CSS
- Quiz engine — Runs the game and exchanges
live answers — Python / FastAPI
Socket.IO
- Data services — Save quizzes and accounts, hold
session state and search content — PostgreSQL / Valkey
Meilisearch
- Hosting — Runs the services and serves
images over a secure connection — Docker Compose
File or S3 storage / HTTPS
- IT operates a group of services on approved company infrastructure.

**What to say**

You can think of it as a website with a game engine behind it. SvelteKit builds the screens people use. Python and FastAPI run the application, with Socket.IO keeping the quiz live. Separate services store the quizzes, hold session state and support search. Docker Compose packages the services so IT can run them together on suitable company infrastructure. Participants only need a browser.

**Details for questions**

Repository evidence: frontend/package.json, Pipfile, classquiz code and docker-compose.yml. The current local deployment uses PostgreSQL, Valkey (Redis-compatible), Meilisearch, a background worker, SeaweedFS S3-compatible storage and an Nginx gateway. Upstream also supports local file storage and uses Caddy in its example stack. Do not imply that the prototype topology is the only supported corporate architecture, or that Docker makes production operations automatic.

**Evidence**

- [Source 1](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/README.md)
- [Source 2](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/frontend/package.json)
- [Source 3](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/Pipfile)
- [Source 4](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/docker-compose.yml)
- Local deploy/compose.yaml (prototype-specific configuration).

## 7. A Telekom theme is feasible (40 seconds)

**On the slide**

- A basic recolor is a modest frontend task.
- Shared Svelte components and Tailwind/CSS styles provide a starting point.
- A complete theme needs a screen review.
- Some colors live in individual components. Check dark mode and contrast too.
- Magenta for branding. Keep answer and status colors meaningful.

**What to say**

A magenta theme looks achievable. The frontend uses reusable Svelte components and shared CSS, so a developer can change the main backgrounds, navigation and buttons without rebuilding the quiz engine. It is more specific than editing a single HTML page: some colors are also set inside individual screens. A consistent result means checking the editor, host view and participant view, including dark mode. The answer colors should still help people distinguish choices and results.

**Details for questions**

Effort is an engineering assessment, not a time estimate or completed theme. Shared styles are in frontend/src/app.css, layout colors in frontend/src/routes/+layout.svelte, and shared components under frontend/src/lib. Direct utility classes and literal colors are scattered across components. The current Tailwind 4 setup uses CSS imports and utilities, so do not promise that editing the legacy tailwind.config.cjs alone will theme the app. Establish semantic brand styles, replace decorative hard-coded colors, then rebuild and review. The presentation uses a magenta-inspired design, not an official Deutsche Telekom template or an approved app rebrand.

**Evidence**

- [Source 1](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/frontend/src/app.css)
- [Source 2](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/frontend/src/routes/+layout.svelte)
- [Source 3](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/frontend/package.json)
- [Source 4](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/frontend/src/lib/navbar.svelte)
- [Source 5](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/frontend/src/lib/assets/landing_new/edit_org.webp)

## 8. Company deployment needs an IT owner (40 seconds)

**On the slide**

- Infrastructure and data: hosting, DNS/HTTPS, database, live-session and search services, S3 storage.
- Identity and access: Entra application setup, integration fixes and access rules.
- Operations: secrets, backups, monitoring, updates and SMTP if email features are needed.
- Pilot validation: test a realistic event size, reconnects and recovery.
- I need an IT partner with access to company hosting, DNS and Entra ID.

**What to say**

The demo is already available, but company deployment needs a developer or platform team with internal permissions. Beyond authentication and an S3 storage endpoint, they need hosting, DNS and HTTPS, the database and supporting services. They also need to manage secrets, backups, monitoring and updates. Email features would need SMTP. Before wider use, we should test the event size we expect, including reconnects and recovery, and name someone to support it.

**Details for questions**

Docker Compose is a useful starting point. Production preparation remains a moderate integration and operations task, with effort depending on internal approvals and infrastructure. The local prototype notes do not configure external OAuth or scheduled backups. Do not imply company deployment, Entra testing or capacity testing has already happened. The public demo address is included at the presenter’s request. Credentials and private infrastructure details remain excluded. See the final appendix for the full deployment checklist.

**Evidence**

- [Source 1](https://classquiz.de/docs/self-host)
- [Source 2](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/docker-compose.yml)
- Presenter’s access constraints in this conversation.
- Local deploy/README.md and deploy/compose.yaml.

## 9. Proposal: one internal pilot (25 seconds)

**On the slide**

- Use one real event to decide whether ClassQuiz fits.
- An IT partner and approved hosting
- A short quiz with a representative group
- A review of reliability and hosting effort
- Build on the existing project, with clear ownership for company use.

**What to say**

My proposal is one internal pilot with an IT partner. We can try a short quiz with a representative group, check whether hosting is practical and see how the tool behaves during the event. If the pilot meets our needs, we can decide whether to adopt it more broadly. The value is using an existing project to solve a company problem, with clear ownership for the work that remains.

**Evidence**

- Proposed next step, not an approved plan.

## 10. Appendix: Entra integration details

**On the slide**

- Configuration already exists: custom provider settings, discovery URL, client ID/secret and a login callback.
- Developer review required: subject ID format, missing identity fields, account linking and token response validation.
- IT must configure the tenant: register the app, allow the redirect URI and apply appropriate access policy.
- Acceptance checks: first sign-in and repeat sign-in, logout, denied access and player access boundaries.

**What to say**

Use only for questions. The integration path exists, but tenant compatibility has not been demonstrated.

**Details for questions**

Settings: CUSTOM_OPENID_PROVIDER__CLIENT_ID, CUSTOM_OPENID_PROVIDER__CLIENT_SECRET, CUSTOM_OPENID_PROVIDER__SERVER_METADATA_URL and CUSTOM_OPENID_PROVIDER__SCOPES. Default scopes: openid email profile. Frontend: VITE_CUSTOM_OAUTH_NAME. Callback: https://<company-host>/api/v1/users/oauth/custom/auth. A tenant-specific Microsoft v2 discovery URL is https://login.microsoftonline.com/<tenant-id>/v2.0/.well-known/openid-configuration. Current Python models require sub as uuid.UUID, email_verified and refresh_token. Microsoft documents sub as a string and email as not guaranteed. A standard response can fail validation. A developer must choose safe claim mapping and account lifecycle behavior. Do not assume automatic role provisioning, tenant restriction or single logout from generic OIDC support.

**Evidence**

- [Source 1](https://classquiz.de/docs/self-host)
- [Source 2](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/classquiz/oauth/custom.py)
- [Source 3](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/classquiz/oauth/init_oauth.py)
- [Source 4](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/classquiz/config.py)
- [Source 5](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc)
- [Source 6](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference)

## 11. Appendix: likely questions

**On the slide**

- Is it free for company use? The MPL grants use rights without a royalty. Hosting and maintenance still cost time and money.
- Do we have to publish every change? Internal changes can stay private. External distribution triggers obligations for MPL-covered code.
- Is it already proven reliable for us? No company-scale result yet. The pilot should establish our event capacity and recovery needs.
- How much work is the branding? A basic recolor is relatively small. Consistent branding across all screens requires review.

**What to say**

Use these answers if questions come up after the pitch.

**Details for questions**

License scope: keep source notices and track local patches. External browser-delivered assets count as distribution. Independent files need not automatically become MPL-licensed. Company legal/open-source review should cover relevant entities, dependencies and external access. No total deployment cost, developer-day estimate or tested player capacity is available. Source revision and existing local deployment changes are documented in the walkthrough.

**Evidence**

- [Source 1](https://www.mozilla.org/en-US/MPL/2.0/)
- [Source 2](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)
- [Source 3](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/frontend/src/app.css)
- [Source 4](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/frontend/src/routes/+layout.svelte)
- Reliability and effort statements are explicit limitations/assessments, not measured results.

## 12. Appendix: company deployment checklist

**On the slide**

- Area — What the company team needs to provide
- Hosting and network — Approved VM or container platform, DNS, TLS/HTTPS,
reverse proxy with WebSocket support and network rules
- Application and data — Frontend, API and worker, PostgreSQL, Valkey, Meilisearch,
persistent data and S3-compatible storage with a bucket
- Identity and email — Entra integration and access policy, MFA policy, secrets,
SMTP/sender setup if verification or password reset is used
- Operations — Backups and restore tests, monitoring/logs, patching,
release/rollback process and a named support owner
- Company acceptance — Privacy/retention and open-source review, brand checks,
realistic event capacity, reconnect and recovery testing

**What to say**

This is the handoff checklist for the company developer or platform team. Authentication and storage are only part of the deployment.

**Details for questions**

Core services: frontend, API, worker, PostgreSQL, Redis-compatible Valkey, Meilisearch, and persistent media storage. The company can supply managed equivalents where compatible. S3 requires an endpoint, bucket, credentials with appropriate permissions, connectivity, and a browser-accessible media URL. The local prototype has an additional S3 public-URL patch that is separate from the minimal UI fork and must be evaluated if that storage topology is reused. Configure DNS, TLS, reverse proxy routing for the app/API/Socket.IO, upload size limits and timeouts. Store application signing keys and database/storage/identity credentials outside Git. Define access for hosts and participants, including any guest policy. Add SMTP and an approved sender only if local account email verification, password resets or notifications are needed. Authenticator-based TOTP does not require SMTP. Evaluate version support and dependency updates, perform database migrations, establish backup/restore and release rollback, and assign support ownership. Optional integrations such as CAPTCHA, image search and analytics are choices, not mandatory requirements for basic quiz play.

**Evidence**

- [Source 1](https://classquiz.de/docs/self-host)
- [Source 2](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/docker-compose.yml)
- [Source 3](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/classquiz/config.py)
- [Source 4](https://github.com/mawoka-myblock/ClassQuiz/blob/711bdde7a7dcd2d217cfc75dbbbb2592a78582d3/classquiz/routers/users/twofa.py)
- Local deploy/README.md and deploy/compose.yaml.
- Deployment requirements also include engineering recommendations for an internally operated service.

## Presenter preparation

Choose a short quiz that contains no confidential data. Rehearse host and participant views. If you demonstrate live, prepare the session first and keep slide 3 available as a fallback. Decide what event size you would want the IT team to test. End with the request for an IT partner and one pilot, rather than a promise of a finished corporate service.

## Review scope

Facts checked on 29 September 2026 against local revision 711bdde7a7dcd2d217cfc75dbbbb2592a78582d3, existing local changes, Mozilla’s MPL text/FAQ, ClassQuiz self-hosting documentation and Microsoft’s OIDC/claim documentation. Existing local changes include deployment/storage work as well as UI edits. The pitch focuses on the contribution described by the presenter, and does not claim authorship of the underlying platform or that company deployment is complete. No internal Entra tenant, production load test or company approval was available.

## Published UI fork

The minimal UI changes are available in [Denisko2404/ClassQuiz](https://github.com/Denisko2404/ClassQuiz), merged into master through [pull request #1](https://github.com/Denisko2404/ClassQuiz/pull/1).

Only five frontend source files differ from the upstream baseline: promotional homepage content, newsletter popup, donation/footer clutter, and two registration error messages. No credentials, deployment configuration, personal demo URLs, backend changes or presentation files were added to the fork. The production frontend build and git diff --check passed. This fork is a source handoff, not a preconfigured company deployment.
