# Deployment verification — 2026-09-10

Installed at `/opt/classquiz` on `my-vm` (194.62.248.201), from upstream
`711bdde7a7dcd2d217cfc75dbbbb2592a78582d3` plus the local changes documented in
`README.md`. Both application Docker images built successfully.

All eight services are healthy: API, frontend, background worker, PostgreSQL,
Valkey, Meilisearch, SeaweedFS, and the Nginx gateway.

The deployment smoke check passed:

- Frontend home, registration, login, authenticated dashboard, and API schema.
- Registration without email verification and password login.
- Image upload to S3, a signed URL using the public HTTPS hostname, byte-for-byte
  download through the gateway, and the correct image MIME type.
- Unsigned object reads and public object writes are denied.
- Background image metadata processing.
- Quiz creation, database persistence, search indexing, and game lobby creation.
- WebSocket host registration, player join, and live game start.
- Quiz deletion, image deletion, and multi-object S3 cleanup.

Temporary users, quizzes, and storage rows were removed; database counts were
verified as `0 / 0 / 0`. The smoke-check output is saved in `smoke.log` (Git ignored).

Nginx Proxy Manager resolves `classquiz-proxy` on `stack_default` and receives
HTTP 200 from `http://classquiz-proxy:8080/`. Its existing Nginx configuration
passes `nginx -t`. The pre-existing containers remain running with their original
uptimes; their Compose files and proxy hosts were not modified.

Generated secrets were validated, are Git ignored, and are stored locally and
remotely in `deploy/.env`. Remote directories have mode `0700` and the secrets
file has mode `0600`. Container images and digests are in `deployed-images.txt`.

Public DNS resolves to `194.62.248.201` (verified through 1.1.1.1 at 19:46 UTC).
The NPM proxy host/certificate remain for the owner to configure: public HTTP
returns NPM's default 404 and the HTTPS handshake fails. Public HTTPS is therefore
not active yet. Gateway tests used the intended public Host header, including for
S3 signature verification. See `README.md` for exact NPM settings.
