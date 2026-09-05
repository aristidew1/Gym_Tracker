# Muscu Tracker sync server — M1

Backend + multi-device sync API. Currently at **M1**: auth (register/login/logout)
and a stub `/sync` endpoint (always returns an empty pull, no persistence yet).
Real push/pull merge logic lands in M3 — see
`/home/aris/.claude/plans/ancient-tumbling-meerkat.md` for the full phased plan.

## Local development

Requires Node 20+ and a Postgres instance. Easiest way to get one locally:

```bash
podman run -d --name gymtracker-pg-dev \
  -e POSTGRES_USER=gymtracker -e POSTGRES_PASSWORD=devpassword -e POSTGRES_DB=gymtracker \
  -p 5433:5432 docker.io/library/postgres:15-alpine
```

Then:

```bash
cd server
npm install
cp .env.example .env   # edit DATABASE_URL to point at the dev container above (port 5433)
npx drizzle-kit generate   # only needed after changing src/db/schema.js
node src/db/migrate.js     # applies migrations in src/db/migrations/
npm run dev                 # starts the API on :3000 with --watch
```

Verify everything works end-to-end:

```bash
./scripts/smoke-test.sh
```

This exercises register → duplicate-register rejection → wrong-password rejection
→ login → unauthenticated-sync rejection → authenticated sync → logout →
sync-after-logout rejection. All green is M1's bar for "done."

## Deploying to a VPS

Files in `deploy/` are templates, not automation — copy and adapt them once
SSH access to the target VPS exists:

- `deploy/Caddyfile` — reverse proxy with automatic TLS. Fill in the real
  domain, drop into `/etc/caddy/Caddyfile` (or `Caddyfile.d/`), `systemctl reload caddy`.
- `deploy/gymtracker-sync.service` — systemd unit for the Node process.
  Expects the app checked out at `/opt/gymtracker/server` and a real `.env`
  next to it (not committed — see `.env.example`). Install with
  `systemctl enable --now gymtracker-sync`.
- `deploy/pg-backup.sh` + `gymtracker-backup.service` + `gymtracker-backup.timer` —
  daily `pg_dump`, pruned after 14 days locally. **The off-box copy step in
  `pg-backup.sh` is a TODO** — fill in an `rclone` remote or `scp` target
  before relying on this; a backup that never leaves the VPS doesn't survive
  disk failure or losing the account. Install with
  `systemctl enable --now gymtracker-backup.timer`, and actually run
  `pg_restore` against a scratch database once to confirm the dumps are usable —
  an untested backup is not a backup.

Firewall: `ufw default deny incoming`, `ufw allow 22/tcp` (ideally rate-limited:
`ufw limit 22/tcp`), `ufw allow 80,443/tcp`. Postgres should stay bound to
`localhost` only (default `listen_addresses` in `postgresql.conf`) — never
open 5432 externally.

Database setup on the VPS (as the `postgres` user):

```sql
CREATE ROLE gymtracker WITH LOGIN PASSWORD '<real password>';
CREATE DATABASE gymtracker OWNER gymtracker;
```

## What's deliberately not here yet

- No password reset flow (needs SMTP infra — explicitly deferred, see plan).
- No real sync persistence — `/sync` always returns an empty pull (M3).
- No client integration (`services/sync.js` doesn't exist yet — M2/M3).
