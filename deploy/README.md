# ClassQuiz on my-vm

Public URL: https://quiz.911bob.dev

## Current deployment (since 2026-09-17)

The VM's services were migrated to `/srv/services`. The live stack is
`/srv/services/classquiz/compose.yaml` (Compose project `svc-classquiz`), with source in
`/srv/services/classquiz/src`, secrets in `secrets/` and data in `data/`. The original
`/opt/classquiz` project below is stopped and kept only as a rollback boundary; do not
start it. Read `/srv/services/OPERATIONS.md` and `/srv/services/classquiz/README.md` on
the VM before changing anything.

To ship a frontend change, upload the committed source and build it under a new tag; never
overwrite a `migration-*` tag:

```sh
# Locally
git archive --format=tar.gz -o frontend.tar.gz master frontend
scp frontend.tar.gz my-vm:/tmp/
# On the VM: unpack to src/frontend, then
docker build -t vm-services/classquiz-frontend:<tag> -f src/deploy/Dockerfile.frontend src/frontend
```

Point the `frontend` image in `compose.yaml` and the `classquiz/frontend` record in
`/srv/services/ops/catalog.json` (`image`, `image_id`) at the new tag, then run
`/srv/services/ops/service.sh classquiz up`. The gateway config is
`/srv/services/classquiz/config/nginx.conf`, a single-file bind mount: overwrite it in place
(`cat new > nginx.conf`) and run `nginx -s reload` in the proxy container.

A backend change works the same way. Copy the changed files into `src/`
(`git archive master <paths> | ssh my-vm 'tar -x -C /srv/services/classquiz/src'`), build
`docker build -t vm-services/classquiz-api:<tag> ./src` in `/srv/services/classquiz`, tag the
same image as `vm-services/classquiz-worker:<tag>`, and point both `image` lines in
`compose.yaml` and the `classquiz/api` and `classquiz/worker` catalog records at it before
`service.sh classquiz up`. The backend runs `telekom-75ca9652` (answer storage fix) since
2026-10-14; `migration-bf7768ea4d9b` is kept for rollback.

`/srv/services/ops/backup.sh` stops every application on the VM while it copies, not only
ClassQuiz, so schedule it rather than running it as part of a deploy.

The sections below describe the original `/opt/classquiz` installation.

Local source: `C:\Users\Denis\Documents\AntiGravity\ClassQuiz`

Remote source and Compose project: `/opt/classquiz` on `ssh my-vm`.
Upstream revision: `711bdde7a7dcd2d217cfc75dbbbb2592a78582d3` (2026-08-30).

## DNS and Nginx Proxy Manager

Create the DNS record:

| Type | Name | Value |
| --- | --- | --- |
| A | quiz | 194.62.248.201 |

Add a Proxy Host to the existing Nginx Proxy Manager:

| Setting | Value |
| --- | --- |
| Domain Names | quiz.911bob.dev |
| Scheme | http |
| Forward Hostname / IP | classquiz-proxy |
| Forward Port | 8080 |
| Cache Assets | Off |
| Websockets Support | On |
| Access List | Publicly Accessible |
| SSL Certificate | Request a new Let's Encrypt certificate after DNS resolves |
| Force SSL | On |
| HTTP/2 Support | On |

Under **Advanced**, add:

```nginx
client_max_body_size 100m;
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
```

No custom locations or additional CDN domain are needed. The gateway routes the
frontend, `/api/`, `/socket.io/`, and signed S3 object reads under `/classquiz/`.
The hostname `classquiz-proxy` resolves inside the existing `stack_default` Docker
network shared with `stack-npm-1`. Do not enter `localhost` or `127.0.0.1` in NPM.

After HTTPS is enabled, open `/account/register` and create your account.
Email verification is skipped as requested. SMTP, password-reset delivery,
external OAuth, CAPTCHA, Pixabay, Sentry, and telemetry are not configured.
No third-party API keys are required for normal quiz creation and play.

## Credentials

All generated credentials are in `deploy/.env` locally and at
`/opt/classquiz/deploy/.env` on the VM (remote permissions: `0600`). This file is
ignored by Git and excluded from Docker build contexts and source archives.
It contains the database password, application signing secret, and S3 keys.
There is no pre-created owner account; register your own through the website.

The S3 keys seed SeaweedFS's `mini` identity on first initialization. To rotate
them later, update the SeaweedFS identity as well as the environment; changing
only the environment does not rotate an identity already stored on disk.
Similarly, PostgreSQL initialization variables do not change an existing database
password. Keep `.env` together with backups and avoid regenerating it.

## Services and persistence

The `classquiz` Compose project is separate from `/root/stack`. Only its gateway
joins NPM's network. Database, queue, search, and storage have no published ports.
The gateway is also available at `127.0.0.1:8088` on the VM for SSH diagnostics.

| Service | Persistent Docker volume |
| --- | --- |
| PostgreSQL 16 | classquiz_postgres-data |
| Valkey 8 | classquiz_redis-data |
| Meilisearch 0.28 (upstream-compatible API) | classquiz_search-data |
| SeaweedFS 4.46 S3 storage | classquiz_storage-data |

SeaweedFS is used because the MinIO community repository was archived in April
2026. It exposes the S3 API privately at `http://storage:8333`; authenticated,
expiring download links use `https://quiz.911bob.dev/classquiz/...`.
This serves media from this VM; it is not a geographically distributed CDN.

References: [ClassQuiz self-hosting](https://classquiz.de/docs/self-host),
[SeaweedFS mini](https://github.com/seaweedfs/seaweedfs/wiki/Quick-Start-with-weed-mini),
[MinIO status](https://github.com/minio/minio).

## Deployment and maintenance

Upload the current local source and credentials from PowerShell:

```powershell
./deploy/upload.ps1
```

On the VM:

```sh
cd /opt/classquiz
docker compose --env-file deploy/.env -f deploy/compose.yaml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yaml build
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --wait --wait-timeout 180
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
docker compose --env-file deploy/.env -f deploy/compose.yaml logs --tail 100 api worker
```

Do not use `down -v`: that deletes persistent data. Restart with `restart`, or
apply configuration changes with `up -d`. Back up the credentials, source changes,
PostgreSQL and SeaweedFS data before upgrades. No scheduled backup was created.

Run the deployment checks (creates and then removes temporary users, quizzes,
and images; does not send email):

```sh
cd /opt/classquiz
docker compose --env-file deploy/.env -f deploy/compose.yaml exec -T api python - < deploy/smoke.py
```

### Experimental Rust rooms

The backend image includes the Rust binary. The separate `realtime` service runs
its Python supervisor; API workers discover it through `RUST_REALTIME_URL`.
The gateway sends `/socket.io-rust/` to this service and keeps `/socket.io/` on
Python. The host setting is available only when the native service is healthy.
The guide at `/docs/large-audiences` explains feature restrictions and measured
capacity. Existing Python rooms do not switch engines.

Captcha is configured at runtime for both engines. Set `CAPTCHA_PROVIDER`
(`hcaptcha`, the default, or `recaptcha_v3`), `CAPTCHA_SITE_KEY` and
`CAPTCHA_SECRET_KEY` in `deploy/.env`; set `CAPTCHA_ALLOWED_HOSTNAMES` to the
public hostname for v3. Recreate `api`, `worker` and `realtime` after changes.
The secret is never passed to the frontend. Missing configuration disables the
host checkbox and protected-room creation fails closed. Rust verifies directly
with a shared native HTTP client; ordinary Python rooms use the repaired Python
verifier. See [native captcha setup and test limits](../tools/realtime-rust/CAPTCHA.md).

Run one native owner per Redis database. A Redis lease prevents overlapping
owners; after a crash, replacement may wait up to 15 seconds before acquiring it.
Rooms, identities and accepted answers recover from Redis, while question clocks
continue running. Clients reconnect automatically. Preserve the Redis volume:
this recovery does not replace Redis persistence or backups. The supplied AOF
configuration can lose roughly the last second of writes on a storage/VM crash.

Monitor `docker compose --env-file deploy/.env -f deploy/compose.yaml logs realtime`
and its container health. `/health` and `/metrics` are internal native endpoints;
do not publish port 81 directly. Before an upgrade, let native quizzes finish,
then rebuild the backend and recreate `api`, `worker` and `realtime` together.
Updating the frontend/proxy configuration is also required when enabling this
integration for the first time. No rolling upgrade or active-active failover is
provided. Adjust `RUST_REALTIME_THREADS` and the documented native resource caps
only after measuring the target machine.

To access the local diagnostic gateway from your computer:

```powershell
ssh -N -L 8088:127.0.0.1:8088 my-vm
```

Use the public HTTPS hostname for normal use. Login callbacks, browser security
features, and signed media URLs are configured for that hostname.

## Local changes

- Separate Compose stack and NPM gateway, health checks, persistent volumes,
  bounded container logs, private service ports, and generated credentials.
- Custom frontend Dockerfile disables optional hosted-service integrations and
  runs the built server as the unprivileged `node` user.
- Backend startup normalizes shell-script line endings for Windows checkouts.
- Added `S3_PUBLIC_URL`, separate from `S3_BASE_URL`; the internal SDK respects
  HTTP/HTTPS and presigning uses the public hostname with an explicit region.
- S3 uploads preserve media MIME types; multi-object deletion processes every
  object; the storage deletion route passes a list instead of a string.
- `deploy/smoke.py` checks registration/login, frontend routes, S3 media round
  trips and access controls, worker metadata, quiz search, live WebSockets,
  deletion, and cleanup.

Keep these patches when updating upstream. Use the deployed revision and local
diff together to reproduce this installation; `master` may change later.
