# Muscu Tracker sync server — M1

Backend + multi-device sync API. Currently at **M1**: auth (sign-up/sign-in/sign-out,
via [Better Auth](https://www.better-auth.com), self-hosted) and a stub `/sync`
endpoint (always returns an empty pull, no persistence yet). Real push/pull
merge logic lands in M3.

Auth is handled entirely by Better Auth, mounted under `/api/auth/*`
(`src/index.js`) and backed by the same Postgres database as everything else
via its Drizzle adapter (`src/auth/auth.js`). It supports email/password,
Google sign-in, and magic links. Emails (magic link, password reset) are sent
through your own SMTP account (`src/email/send-email.js`) — no third-party
auth or email vendor required. `/sync` and future endpoints authenticate by
calling `auth.api.getSession()` on the incoming request (see
`src/sync/routes.js`); the client attaches the session token Better Auth
returns as `Authorization: Bearer <token>` (its `bearer` plugin).

## Local development

Requires **Node 22+** (Better Auth's crypto dependencies need Node ≥20.19; a
`.nvmrc` pins 22) and a Postgres instance. Easiest way to get one locally:

```bash
podman run -d --name gymtracker-pg-dev \
  -e POSTGRES_USER=gymtracker -e POSTGRES_PASSWORD=devpassword -e POSTGRES_DB=gymtracker \
  -p 5433:5432 docker.io/library/postgres:15-alpine
```

(On this VPS there's already a system Postgres 16 cluster running on the
default port — see "Deploying to a VPS" below; you don't need a container if
you're developing directly on it.)

Then:

```bash
cd server
nvm use   # or: nvm install 22
npm install
cp .env.example .env   # fill in DATABASE_URL, BETTER_AUTH_SECRET, etc. (see below)
npx drizzle-kit generate   # only needed after changing src/db/schema.js
node src/db/migrate.js     # applies migrations in src/db/migrations/
npm run dev                 # starts the API on :3000 with --watch
```

Verify everything works end-to-end:

```bash
./scripts/smoke-test.sh
```

This exercises sign-up → duplicate-sign-up rejection → wrong-password rejection
→ sign-in → unauthenticated-sync rejection → authenticated sync → sign-out →
sync-after-sign-out rejection. All green is M1's bar for "done."

### Required `.env` values

- `BETTER_AUTH_SECRET` — a real random secret in any non-dev environment
  (`openssl rand -base64 32`). Better Auth uses this to sign sessions.
- `BETTER_AUTH_URL` — the public base URL of this API (used for OAuth
  callbacks and links in emails).
- `TRUSTED_ORIGINS` — comma-separated list of origins allowed to call the auth
  API: the deployed web app's origin, plus the Capacitor app's origins
  (`https://localhost` for Android, `capacitor://localhost` for iOS, per
  `capacitor.config.json`'s `androidScheme`).
- `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` — your SMTP
  account, used to send magic-link and password-reset emails.
- `GOOGLE_CLIENT_ID_WEB`/`GOOGLE_CLIENT_ID_ANDROID`/`GOOGLE_CLIENT_ID_IOS` +
  `GOOGLE_CLIENT_SECRET` — from **Google Cloud Console** (not Firebase): one
  OAuth 2.0 client per platform, all accepted for Google sign-in (each
  platform's client mints ID tokens verified server-side against whichever
  client ID matches). See the client-side `README.md` / `DEVELOPMENT.md` for
  what to configure on the Android/iOS side.

## Deploying to a VPS

Files in `deploy/` are templates, not automation — copy and adapt them once
SSH access to the target VPS exists:

- `deploy/Caddyfile` — reverse proxy with automatic TLS. Fill in the real
  domain, drop into `/etc/caddy/Caddyfile` (or `Caddyfile.d/`), `systemctl reload caddy`.
- `deploy/gymtracker-sync.service` — systemd unit for the Node process.
  Expects the app checked out at `/opt/gymtracker/server`, a real `.env`
  next to it (not committed — see `.env.example`), and a Node 22+ binary
  (point `ExecStart` at the nvm-installed node if the system package manager's
  Node is older — check with `node -v`).
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

- No real sync persistence — `/sync` always returns an empty pull (M3).
- No client integration (`services/sync.js` doesn't exist yet — M2/M3).
  `services/auth.js` (sign-up/sign-in/sign-out/magic-link/Google) does exist
  on the client and talks to this server's `/api/auth/*`.
