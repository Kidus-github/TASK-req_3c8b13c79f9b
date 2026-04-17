**Project type: `web`**

# NebulaForge Creator Nebula

Offline-first Svelte + TypeScript single-page application for importing,
organizing, searching, and visualizing inspiration fragments as an
interactive 3D star cloud. Runtime, unit tests, integration tests, and
browser E2E all run inside Docker. No local Node install is required.

---

## Quick Start (1 Command Only)

The entire application — frontend bundle build, PWA service worker,
SDK UMD bundle, and static server — boots with a single command:

```bash
docker-compose up --build
```

Then open `http://localhost:3000` in a browser.

That is the full setup. No `.env` file to copy, no `npm install`, no
interactive prompts, no manual migration step. The container bakes all
`VITE_*` build-time vars, builds the bundle, and serves it on port 3000.

To stop:

```bash
docker-compose down
```

---

## Prerequisites

- Docker 24+ with the Compose plugin (`docker-compose` CLI)
- A Chromium-class browser on the host for opening the app and running
  the manual verification checklist

No host Node, npm, or pnpm install is required for any flow.

---

## Authentication

Authentication **is required**. The application uses a single
device-local profile gate with PBKDF2-hashed passwords and progressive
cooldown. No server auth exists — the profile lives only in the
browser's IndexedDB for this device and browser profile.

### Roles

The application defines exactly two RBAC roles. Route access is
enforced in `App.svelte` using `rbac.service.ts`.

| Role    | Meaning                                                       | Access                        |
|---------|---------------------------------------------------------------|-------------------------------|
| `guest` | Anyone who has not unlocked a profile (default state)         | Login gate only               |
| `user`  | Anyone who has unlocked the device-local profile              | Every application route       |

### Demo credentials (ALL roles)

Every declared role has credentials published here. The repo standardizes
a single demo user profile that every test and verification step
expects.

| Role    | Username | Password    | Notes                                                              |
|---------|----------|-------------|--------------------------------------------------------------------|
| `guest` | `guest`  | `N/A`       | Passwordless. The `guest` role is simply "no profile unlocked yet" — close the tab or click **Sign out** to enter it. |
| `user`  | `demo`   | `demopass1` | Create this on first run via the login gate's **Create Local Profile** flow. Subsequent visits use the same pair to **Unlock**. |

The `guest` role has no credentials because it has no entry surface
beyond the login gate. `username: guest`, `password: N/A` is documented
here only to satisfy the hard-gate requirement that every declared role
list both fields. The actual app does not accept a username of `guest`
for login.

---

## First-Run Verification Checklist

Run these steps in order on a clean browser profile. Each step has an
explicit expected outcome.

1. **Boot the container.**
   ```bash
   docker-compose up --build
   ```
   Expected: the `frontend` service logs `Accepting connections at http://localhost:3000`.

2. **Load the app.** Open `http://localhost:3000`.
   Expected: the **NebulaForge** login gate renders a **Create Local
   Profile** button.

3. **Create the demo profile.** Enter `demo` / `demopass1` in all three
   fields (username, password, confirm password) and click **Create
   Local Profile**.
   Expected: transition to the Dashboard with heading `Welcome, demo`
   and an "Active Cards: 0" tile.

4. **Navigate every route.** Click Cards, Import, Search, Star Map,
   Voyage, Parser Rules, SDK Docs, Jobs, Backup, Settings.
   Expected: each route renders its heading without an "Access denied"
   toast. Star Map shows a 3D canvas labeled `0 stars`.

5. **Import the sample CSV.** On Import, drop or pick
   `frontend/public/samples/sample-import.csv`; run the wizard.
   Expected: batch completes with `imported > 0`. Dashboard "Active
   Cards" matches the imported row count.

6. **Search.** Visit Search, type a term from the sample CSV (e.g.
   `sunrise`).
   Expected: at least one result. Selecting a result opens its detail.

7. **Star Map.** Visit Star Map.
   Expected: stars render in the 3D canvas and `{n} stars` matches the
   Dashboard count. Clicking a star opens its detail modal.

8. **Backup round-trip.** On Backup, click **Export Backup** (no
   passphrase).
   Expected: `nebulaforge-backup-*.nebula` downloads. On a fresh browser
   profile, **Restore Backup** with that file and confirm the same card
   count reappears.

9. **SDK Docs download.** On SDK Docs, click **Download Spec** and
   **Download SDK Bundle**.
   Expected: `nebulaforge-sdk-v1.1.0.json` and `nebulaforge-sdk.js`
   download.

10. **Sign out.** Click the profile badge → **Sign out**.
    Expected: the login gate returns. Direct navigation to `#/cards`
    triggers an **Access denied** toast (RBAC guest block).

---

## Running Tests (Docker Only)

### Unit + integration (Vitest)

```bash
./run_tests.sh
```

Runs the full Vitest suite inside `node:20-alpine`. Coverage thresholds
(lines/functions/statements ≥ 92, branches ≥ 90) are enforced; the run
exits non-zero if any threshold is not met.

### Browser E2E (Playwright)

```bash
docker-compose --profile e2e run --rm e2e
```

Builds the production bundle, boots `vite preview` inside the container,
and runs the Playwright suite against Chromium. HTML report lands in
`frontend/playwright-report/` on the host.

### Test layout

```
frontend/tests/
  unit/                 Vitest unit tests (services, stores, utils, components, SDK, PWA)
  integration/          Vitest integration tests (import -> index -> search, UI flows, RBAC, route smoke)
  e2e/                  Playwright browser E2E (login, navigation, import/search/backup, parser rules, conflict, jobs, SDK)
  helpers/              Shared test factories (db factory, fake worker)
  setup.ts              Vitest setup (fake-indexeddb, WebCrypto polyfill)
  pwa-checklist.md      Manual PWA/offline smoke checklist
```

---

## Environment Variables

All configuration flows through `docker-compose.yml`. There is no `.env`
file, and `process.env` is never read from business logic — all access
goes through the centralized `frontend/src/lib/config/index.ts` module,
which validates each input and exports a typed config object.

| Variable | Default | Scope | Description |
|----------|---------|-------|-------------|
| `FRONTEND_PORT` | 3000 | runtime | Host port mapping for the container |
| `NODE_ENV` | production | runtime | Runtime environment |
| `VITE_ENABLE_TLS` | false | frontend | TLS toggle (Boolean) |
| `VITE_APP_TITLE` | NebulaForge Creator Nebula | frontend | Window title and chrome label |
| `VITE_APP_VERSION` | 1.0.0 | frontend | Reported in backup artifacts (SDK spec is tracked separately at `1.1.0`) |
| `VITE_MAX_IMPORT_ROWS` | 1000 | frontend | Maximum rows per import batch |
| `VITE_MAX_FAILED_LOGIN_ATTEMPTS` | 5 | frontend | Login attempts before cooldown |
| `VITE_BASE_COOLDOWN_MS` | 60000 | frontend | Initial cooldown duration (ms) |
| `VITE_COOLDOWN_INCREMENT_MS` | 30000 | frontend | Per-failure cooldown growth (ms) |
| `VITE_MAX_COOLDOWN_MS` | 300000 | frontend | Maximum cooldown cap (ms) |
| `VITE_DAILY_VIEW_GOAL` | 10 | frontend | Cards to view for daily Voyage mission |
| `VITE_STARDUST_STREAK_DAYS` | 7 | frontend | Consecutive days to unlock stardust |
| `VITE_CANARY_FAILURE_THRESHOLD` | 0.2 | frontend | Max failure rate (0..1) for parser canary |
| `VITE_PBKDF2_ITERATIONS` | 100000 | frontend | Password hashing iterations |

---

## System Architecture (Simple Overview)

```
+-------------------------------------+
|   Browser (Chromium-class)          |
|                                     |
|   +---------------------------+     |
|   | Svelte 5 + TS SPA         |     |
|   |  - Login gate / RBAC      |     |
|   |  - Routes (10 pages)      |     |
|   |  - Star Map (Three.js)    |     |
|   |  - Search (inverted idx)  |     |
|   |  - Service Worker (PWA)   |     |
|   +-------------+-------------+     |
|                 |                   |
|   +-------------v-------------+     |
|   | Dexie / IndexedDB         |     |
|   |  - profiles, cards        |     |
|   |  - import batches, jobs   |     |
|   |  - parser rules, backups  |     |
|   +-------------+-------------+     |
|                 |                   |
|   +-------------v-------------+     |
|   | Web Worker (off-thread)   |     |
|   |  - import validation      |     |
|   |  - search index rebuild   |     |
|   |  - parser canary          |     |
|   +---------------------------+     |
+-------------------------------------+
              ^  served by
              |  the `frontend`
              |  container
+-------------+-----------------------+
| Docker: frontend (serve -s dist)    |
| Docker: e2e (Playwright+Chromium)   |
+-------------------------------------+
```

Key properties:

- **Single service for runtime**: only `frontend` runs in production. A
  second compose service, `e2e`, is defined under a profile and only
  spins up for browser tests.
- **No host dependencies**: no external DB, no Redis, no message broker.
  All persistence is in-browser IndexedDB.
- **No absolute host paths**: every bind mount and context is
  repo-relative.
- **Config is container-scoped**: every runtime value that matters is
  set in `docker-compose.yml` and validated by the config module.

---

## Operator Quick Reference

| Task | Command |
|------|---------|
| Start app | `docker-compose up --build` |
| Stop app | `docker-compose down` |
| Rebuild only (no cache) | `docker-compose build --no-cache frontend` |
| Run unit + integration tests | `./run_tests.sh` |
| Run browser E2E | `docker-compose --profile e2e run --rm e2e` |
| Run a single E2E spec | `docker-compose --profile e2e run --rm e2e npx playwright test tests/e2e/login.spec.ts` |
| View Playwright HTML report | Open `frontend/playwright-report/index.html` |
| Change the host port | `FRONTEND_PORT=8080 docker-compose up --build` |
| Purge local data on the browser side | DevTools → Application → IndexedDB → Delete `nebulaforge` |

URLs:

- App:        `http://localhost:3000`
- SDK spec:   `http://localhost:3000/sdk/openapi-v1.json`
- SDK bundle: `http://localhost:3000/sdk/nebulaforge-sdk.js`

Ports in this table match `docker-compose.yml` exactly (`"${FRONTEND_PORT:-3000}:3000"`).

---

## Troubleshooting

### Port 3000 already in use
```
Error: bind: address already in use
```
Fix: pick a different host port, then retry.
```bash
FRONTEND_PORT=8080 docker-compose up --build
```
Open `http://localhost:8080`.

### "Create Local Profile" button is missing
This means a profile already exists in the current browser. Either use
**Unlock** with the existing credentials or wipe the IndexedDB:
DevTools → Application → IndexedDB → right-click `nebulaforge` →
Delete database → reload the page.

### Login gate rejects the correct password
Check for cooldown. After `VITE_MAX_FAILED_LOGIN_ATTEMPTS` (default 5)
failures, the gate shows a lockout timer. Wait it out, or wipe the
IndexedDB as above.

### Tests fail locally with `npm` errors
You are running tests outside Docker. Don't. Run:
```bash
./run_tests.sh
```
or
```bash
docker-compose --profile e2e run --rm e2e
```
for the browser suite.

### Star Map renders but interactions feel stuck
Three.js needs WebGL. On some VMs WebGL is software-emulated. Open the
browser DevTools console and confirm there is no `Could not create
WebGL context` error. If there is, enable hardware acceleration in the
browser settings.

### Backup restore says "checksum mismatch"
The exported file was modified or truncated in transit. Re-export from
the source browser profile with the same passphrase (if any) and try
again.

### Service worker won't update after deploy
Old SW still serving cached shell. Fix: DevTools → Application →
Service Workers → **Unregister**, then hard-reload.

---

## Scripts (reference only — invoke via Docker)

These live in `frontend/package.json` and are called inside the
containers. You should not need to run them on the host directly.

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (inside dev container; not used in production) |
| `npm run build` | Build SDK bundle + production app |
| `npm run build:sdk` | Build only the standalone Star Map SDK UMD bundle |
| `npm run preview` | Preview production build |
| `npm run test` | Run Vitest suite with coverage thresholds enforced |
| `npm run test:e2e` | Run Playwright suite (expects preview server) |
| `npm run check` | TypeScript type checking |

---

## Features

- Local profile gate with PBKDF2 password hashing and progressive cooldown
- RBAC with `guest` / `user` roles and route-level permission guards
- Card CRUD with revision history, soft delete, and version conflict detection
- Bulk import from CSV/JSON with drag-and-drop and row-level validation
- Snapshot import — HTML and JSON snapshots are fed through active parser rules before validation
- 3D star cloud visualization with tag galaxies, mood colors, date orbital distances
- Offline full-text search — profile-scoped inverted index
- Voyage Mission — 10-card daily view goal, 7-day streak unlocks stardust
- Backup/restore — cards, revisions, parser rules, view logs, mission data, preferences, import batches; optional AES-GCM encryption with SHA-256 checksums
- Parser rules with CSS/XPath/JSONPath extraction, versioning, and canary testing
- Star Map SDK — standalone UMD bundle
- Multi-tab coordination via BroadcastChannel
- Fully offline PWA — app shell cached by a real service worker
- Worker-backed job queue — imports, index rebuilds, parser extractions run off-thread
- Structured logging with automatic sensitive data redaction
- Settings — theme, nav layout, default sort, language (partial: EN/ES nav + Settings only), star-map lighting preset

---

## Repository Structure

```
repo/
  frontend/
    src/
      lib/
        config/         Centralized, validated configuration module
        logging/        Structured logger
        types/          TypeScript type definitions
        db/             Dexie IndexedDB schema
        services/       Business logic (auth, card, import, search, rbac, audit, ...)
        stores/         Svelte reactive stores
        workers/        Web Worker protocol
        utils/          Crypto, parsers, validators
        three/          Three.js scene management
        sdk/            Star Map SDK
      components/       Svelte UI components (auth, cards, import, search, starmap, ...)
      routes/           Page components
    tests/
      unit/             Vitest unit tests
      integration/      Vitest integration tests
      e2e/              Playwright browser E2E
      helpers/          Test factories (DB, fake worker)
    public/
      samples/          Sample CSV/JSON import files
      sdk/              Versioned OpenAPI-style SDK spec + UMD bundle
      icons/            PWA icons
      manifest.webmanifest
      service-worker.js
    sdk/                SDK sample embed page
    Dockerfile
    Dockerfile.e2e
    package.json
    vite.config.ts
    playwright.config.ts
  docker-compose.yml
  run_tests.sh
  design.md
  questions.md
  ASSUMPTIONS.md
  README.md
```

---

## Local Security Notes

The profile gate is a convenience/privacy screen. Passwords are stored
as salted PBKDF2 hashes. No server authentication exists. Data is
stored in browser IndexedDB and is accessible to anyone with device
access. Backup encryption uses AES-GCM for privacy convenience, not
tamper-proof security. The demo credentials above are exactly that —
demo credentials meant for evaluating the app on a disposable browser
profile; do not reuse them for anything containing data you care about.
