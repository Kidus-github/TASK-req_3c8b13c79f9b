# Test Coverage Audit

## Project Type Detection

- Declared project type: `web`
- Evidence: `README.md` starts with `**Project type: \`web\`**`.
- Static inference result: confirmed `web`, not `fullstack`.
- Supporting evidence:
  - `frontend/src/routes/index.ts` defines only client-side SPA routes.
  - `frontend/Dockerfile` builds static assets and serves `dist` with `serve -s`.
  - `docker-compose.yml` defines `frontend` and `e2e` only; no backend service exists.

## Backend Endpoint Inventory

Strict result: no backend/API route handlers found.

Evidence:

- No server/controller/router files were found under the repo root or `frontend/src`.
- `frontend/Dockerfile` final stage runs `serve dist -l 3000 -s`, which is a static file server, not an application API server.
- `frontend/src/routes/SDKDocs.svelte` fetches `/sdk/openapi-v1.json` and `/sdk/nebulaforge-sdk.js`, but those are static assets, not visible route handlers implemented in this repo.

Endpoint inventory table:

| Endpoint | Covered | Test type | Test files | Evidence |
|---|---|---|---|---|
| None found | N/A | N/A | N/A | Static inspection found no backend route/controller/router implementation |

## API Test Mapping Table

Strict result: no API tests exist because no backend API endpoints were found.

| Endpoint | Covered | Test type | Test files | Evidence |
|---|---|---|---|---|
| None | No applicable endpoints | None | None | No server-side `METHOD + PATH` handlers exist in repo |

## API Test Classification

1. True No-Mock HTTP: none
2. HTTP with Mocking: none for backend/API endpoints
3. Non-HTTP: present, extensively, on the frontend

Notes:

- `frontend/tests/e2e/navigation.spec.ts` and other Playwright specs exercise browser routes such as `#/cards` and `#/settings`. These are SPA navigation tests, not backend API tests.
- `frontend/tests/integration/routes-smoke.spec.ts` renders route components directly with Testing Library. These are non-HTTP frontend integration tests.

## Mock Detection

Mocked or stubbed tests found:

- `frontend/tests/integration/import-wizard-reset.spec.ts`
  - Mocks: `$lib/stores/auth.store`, `$lib/stores/cards.store`, `$lib/services/import.service`, `$lib/services/parser-rule.service`, `$lib/services/queue-runner.service`, `$lib/stores/toast.store`, `$lib/stores/jobs.store`
  - Evidence: top-level `vi.mock(...)` declarations
  - Classification impact: integration/UI test with heavy mocking, not real end-to-end logic
- `frontend/tests/integration/parser-rule-versioning-ui.spec.ts`
  - Mocks: `$lib/stores/auth.store`
  - Evidence: top-level `vi.mock(...)`
- `frontend/tests/integration/starmap-canvas-ui.spec.ts`
  - Mocks: `$lib/three/scene-manager`
  - Evidence: top-level `vi.mock(...)`
- `frontend/tests/unit/sdk-embed.spec.ts`
  - Mocks: `three`, `three/addons/controls/OrbitControls.js`
  - Evidence: top-level `vi.mock(...)`
- `frontend/tests/unit/sdk-contract-parity.spec.ts`
  - Mocks: `three`, `three/addons/controls/OrbitControls.js`
  - Evidence: top-level `vi.mock(...)`
- `frontend/tests/unit/stores/progress-drawer.spec.ts`
  - Mocked call: `requestCancelJob`
  - Evidence: `vi.spyOn(queueModule, 'requestCancelJob').mockResolvedValue(...)`
- `frontend/tests/unit/services/voyage-streak-reset.spec.ts`
  - Mocks: `$lib/utils/date`
  - Evidence: top-level `vi.mock(...)`
- `frontend/tests/integration/routes-smoke.spec.ts`
  - Stubbed global: `fetch`
  - Evidence: `vi.stubGlobal('fetch', fetchMock as any)` in `SDKDocs route` download test
- `frontend/tests/integration/backup-ui.spec.ts`
  - Mocked DOM method: `document.createElement`
  - Evidence: `vi.spyOn(document, 'createElement').mockImplementation(...)`
- `frontend/tests/unit/logging.spec.ts`
  - Mocked console methods: `console.error`, `console.warn`
  - Evidence: `vi.spyOn(...).mockImplementation(...)`

## Coverage Summary

- Total backend endpoints: `0`
- Endpoints with HTTP tests: `0`
- Endpoints with true no-mock HTTP tests: `0`
- HTTP coverage %: `N/A` because there are no backend endpoints
- True API coverage %: `N/A` because there are no backend endpoints

Strict interpretation:

- The repo cannot receive a positive API coverage assessment because there is no backend API surface to audit.
- The audit therefore shifts to frontend unit/integration/E2E sufficiency.

## Unit Test Summary

### Backend Unit Tests

- Backend unit test files: none
- Backend modules covered:
  - controllers: none
  - services: none
  - repositories: none
  - auth/guards/middleware: none
- Important backend modules not tested: none applicable, because no backend code was found

### Frontend Unit Tests

Mandatory verdict: **Frontend unit tests: PRESENT**

Evidence that the strict detection rules are satisfied:

- Identifiable frontend test files exist:
  - `frontend/tests/unit/stores/shell-preferences.spec.ts`
  - `frontend/tests/unit/stores/star-detail-modal.spec.ts`
  - `frontend/tests/unit/services/auth.service.spec.ts`
  - `frontend/tests/unit/services/card.service.spec.ts`
  - `frontend/tests/unit/utils/validation.spec.ts`
  - many more under `frontend/tests/unit/**`
- Test framework is evident:
  - `frontend/package.json` uses `vitest`
  - `frontend/vite.config.ts` configures `test.environment = 'jsdom'`
  - unit/component tests import `@testing-library/svelte`
- Tests import or render actual frontend modules/components:
  - `frontend/tests/unit/stores/shell-preferences.spec.ts` renders `Shell` and `Sidebar`
  - `frontend/tests/unit/stores/star-detail-modal.spec.ts` renders `CardDetailModal`
  - `frontend/tests/integration/login-gate.spec.ts` renders `LoginGate`, `LockoutNotice`, `ProfileBadge`

Frameworks/tools detected:

- Vitest
- jsdom
- `@testing-library/svelte`
- Playwright
- `fake-indexeddb`

Frontend modules/components covered directly by tests:

- Routes:
  - `Dashboard.svelte`, `Cards.svelte`, `Import.svelte`, `Search.svelte`, `Voyage.svelte`, `Backup.svelte`, `Jobs.svelte`, `Settings.svelte`, `SDKDocs.svelte`
  - Evidence: `frontend/tests/integration/routes-smoke.spec.ts`
- App shell/gating:
  - `App.svelte`
  - Evidence: `frontend/tests/integration/app-gating.spec.ts`
- Auth components:
  - `LoginGate.svelte`, `LockoutNotice.svelte`, `ProfileBadge.svelte`
  - Evidence: `frontend/tests/integration/login-gate.spec.ts`
- Cards components:
  - `CardEditor.svelte`, `CardList.svelte`, `CardDetail.svelte`, `CardDeleteConfirm.svelte`, `CardConflictModal.svelte`, `CardRevisionTimeline.svelte`
  - Evidence: `frontend/tests/integration/card-editing-ui.spec.ts`
- Import/search/parser/starmap/layout components:
  - `ImportWizard.svelte`, `SearchBar.svelte`, `SearchFilters.svelte`, `SearchResults.svelte`, `RuleEditor.svelte`, `CanaryRunner.svelte`, `VersionHistory.svelte`, `Topbar.svelte`, `Toaster.svelte`, `GalaxyLegend.svelte`, `StarMapCanvas.svelte`
  - Evidence: corresponding `frontend/tests/integration/*.spec.ts`
- Service/store/utils/config/logging modules:
  - `auth.service.ts`, `backup.service.ts`, `blob.service.ts`, `card.service.ts`, `import.service.ts`, `parser-rule.service.ts`, `queue-runner.service.ts`, `rbac.service.ts`, `search.service.ts`, `starmap.service.ts`, `sync.service.ts`, `voyage.service.ts`, `worker-health.service.ts`, `worker-queue.service.ts`
  - `auth.store.ts`, `cards.store.ts`, `preferences.store.ts`, `search.store.ts`, `voyage.store.ts`
  - `validation.ts`, `json-parser.ts`, `html-parser.ts`, `csv-parser.ts`, `crypto.ts`, `color.ts`, `date.ts`, `debounce.ts`
  - Evidence: matching unit specs under `frontend/tests/unit/services`, `frontend/tests/unit/stores`, `frontend/tests/unit/utils`

Important frontend components/modules not clearly directly tested:

- `frontend/src/routes/StarMap.svelte`
  - No direct route-spec evidence found; tests cover `StarMapCanvas.svelte` and `GalaxyLegend.svelte` instead
- `frontend/src/components/layout/TopbarNav.svelte`
  - No direct import found in test files
- `frontend/src/components/layout/PreferencesCarousel.svelte`
  - No direct import found in test files
- `frontend/src/components/import/FileDropZone.svelte`
  - No direct standalone test found; only indirectly exercised through `ImportWizard.svelte`
- `frontend/src/components/import/ImportProgress.svelte`
  - No direct import found in test files
- `frontend/src/components/import/ValidationReport.svelte`
  - No direct import found in test files
- `frontend/src/components/cards/CardEditModal.svelte`
  - No direct import found in test files
- `frontend/src/components/cards/SimultaneousEditWarning.svelte`
  - No direct import found in test files
- `frontend/src/components/voyage/StreakTracker.svelte`
  - No direct import found in test files

Strict gap assessment:

- Frontend unit tests are present and substantial.
- Direct coverage is uneven across the component layer.
- Because this is a `web` project, missing direct tests on several visible UI modules is a gap, but not a total frontend-test failure.

### Cross-Layer Observation

- Backend/API layer: absent
- Frontend layer: heavily tested
- Balance assessment: not backend-heavy; the repo is frontend-dominant and the tests reflect that

## API Observability Check

Backend/API observability: not applicable, because no backend endpoint tests exist.

Frontend request/response observability:

- `frontend/tests/integration/routes-smoke.spec.ts`, test `clicking Download Spec triggers a fetch against the spec URL`
  - request target is explicit: `/sdk/openapi-v1.json`
  - response is mocked, not real
  - assertion depth is limited to fetch invocation and blob URL creation
- Overall observability verdict for network behavior: weak
  - there are no real API request/response assertions through a real HTTP layer

## Test Quality & Sufficiency

Strengths:

- Strong breadth of frontend unit tests across services, stores, and utils
- Real component rendering is used in many integration tests
- Browser E2E suite exists:
  - `frontend/tests/e2e/navigation.spec.ts`
  - `frontend/tests/e2e/login.spec.ts`
  - `frontend/tests/e2e/import-search-backup.spec.ts`
  - `frontend/tests/e2e/parser-rule-flow.spec.ts`
- `run_tests.sh` is Docker-based
  - Evidence: `docker run --rm ... node:20-alpine ...`
  - Verdict under prompt rule: OK, not a local dependency failure

Weaknesses:

- No backend/API layer exists, so API coverage is impossible
- Several integration tests rely on mocks/stubs for critical collaborators, especially:
  - `import-wizard-reset.spec.ts`
  - `starmap-canvas-ui.spec.ts`
  - `parser-rule-versioning-ui.spec.ts`
- Some route/component coverage is indirect rather than direct
- `frontend/vite.config.ts` coverage thresholds exclude:
  - all `.svelte` files
  - `src/lib/three/**`
  - `src/lib/workers/**`
  - `src/lib/db/**`
  - `src/lib/sdk/**`
  - This means coverage percentages do not represent the full application surface
- Because `src/**/*.svelte` is excluded from coverage accounting, the measured thresholds are materially easier to satisfy than full-UI coverage would be

Success/failure/edge/auth assessment:

- Success paths: well represented in frontend tests
  - Example: `frontend/tests/integration/login-gate.spec.ts`, test `registers a profile from the UI, unlocking the app`
- Failure cases: present
  - Example: `frontend/tests/integration/login-gate.spec.ts`, tests for password mismatch and short passwords
- Edge cases: present in several areas
  - Example: `frontend/tests/integration/starmap-canvas-ui.spec.ts`, test `edge case: null pick does not dispatch starClick`
- Auth/permissions: present
  - Example: `frontend/tests/integration/app-gating.spec.ts`, test `route-guard toast fires when an unlocked user visits a disallowed route`
- Integration boundaries: partially represented, but often with fake worker or mocked collaborators instead of the full production boundary

## End-to-End Expectations

- Project type is `web`, not `fullstack`
- Full FE↔BE end-to-end tests are not expected because no backend exists
- Browser E2E coverage is present and materially improves confidence for this repo type
- Partial compensation verdict:
  - Strong frontend unit/integration/E2E coverage partially compensates for the absence of any API layer
  - It does not compensate for the direct-coverage gaps on several UI modules

## Tests Check

- Static-only constraint respected: yes
- Real backend API tests: none applicable
- Frontend unit tests: present
- Frontend integration tests: present
- Browser E2E tests: present
- Mock-heavy tests present: yes
- Coverage accounting excludes significant UI/runtime surface: yes

## Test Coverage Score (0–100)

`72/100`

## Score Rationale

- `0` backend endpoints means no positive API coverage score can be awarded, but this is structural rather than an omission.
- Frontend test presence is strong across unit, integration, and E2E layers.
- Score is reduced for:
  - multiple mock-heavy integration specs
  - several important UI modules without clear direct tests
  - coverage thresholds that exclude `.svelte` files and several runtime-heavy subsystems

## Key Gaps

- No backend/API surface exists, so API coverage sections are structurally empty.
- Several visible UI modules lack clear direct tests:
  - `StarMap.svelte`
  - `TopbarNav.svelte`
  - `PreferencesCarousel.svelte`
  - `ImportProgress.svelte`
  - `ValidationReport.svelte`
  - `CardEditModal.svelte`
  - `SimultaneousEditWarning.svelte`
  - `StreakTracker.svelte`
- Some integration coverage is softened by mocks replacing important collaborators.
- Reported coverage thresholds do not include `.svelte` UI files, so the numeric coverage gate is not a full-app quality signal.

## Confidence & Assumptions

- Confidence: high
- Assumptions:
  - Static assets under `/sdk/*` are not counted as backend endpoints because no route handler implementation exists in repo.
  - SPA hash routes are not treated as HTTP API endpoints.

# README Audit

## README Location

- Required file: `repo/README.md`
- Result: present

## Hard Gate Evaluation

### Formatting

- Pass
- Evidence: `README.md` is structured with headings, tables, fenced commands, architecture, verification checklist, troubleshooting, and repository layout.

### Startup Instructions

- Pass
- Evidence:
  - Quick start includes `docker-compose up --build`
  - Stop command includes `docker-compose down`
- Web-project adequacy: sufficient

### Access Method

- Pass
- Evidence:
  - `Then open http://localhost:3000 in a browser.`
  - Operator Quick Reference lists app URL and port

### Verification Method

- Pass
- Evidence:
  - `First-Run Verification Checklist` provides explicit browser/UI validation steps and expected outcomes

### Environment Rules

- Partial compliance, with one strict issue
- Positive evidence:
  - README repeatedly states no host `npm install` or local dependency setup is required
  - Startup and test flows are Docker-contained
- Strict issue:
  - `README.md` contains host-side command examples that are not Docker commands:
    - `FRONTEND_PORT=8080 docker-compose up --build`
    - `npm run dev`, `npm run build`, `npm run preview`, `npm run test`, `npm run test:e2e`, `npm run check` in the `Scripts` section
  - Although the README says these are "reference only" and "invoke via Docker", the commands are still published in host-invokable form
- Hard-gate judgment: not a hard failure, but a medium-severity compliance weakness because the file does not fully confine examples to Docker commands

### Demo Credentials

- Pass, with wording caveat
- Evidence:
  - Auth is explicitly declared required
  - README provides role table and demo credentials table
  - `user` role includes username and password
  - `guest` role is documented with `guest / N/A` and explanatory note
- Caveat:
  - `guest` is not a real login identity; this satisfies documentation formality more than executable authentication reality

## Engineering Quality

Strengths:

- Tech stack is clear
- Architecture is described at the right level for operators
- Testing instructions are explicit
- Security/auth model is explained
- Verification flow is unusually specific and auditable
- Presentation quality is strong

Weaknesses:

- README overstates isolation slightly by saying "That is the full setup" while `run_tests.sh` still performs `npm ci` inside a throwaway container
- Script examples expose raw `npm run ...` commands even though the README insists users should avoid host-side Node flows
- Project description says "offline-first" and "No server auth exists", but the README does not explicitly say there is no backend/API service; that omission can mislead readers expecting one because `/sdk/openapi-v1.json` is referenced elsewhere

## High Priority Issues

- None

## Medium Priority Issues

- `README.md` includes host-style `npm run ...` script examples in the `Scripts` section despite the stated Docker-only operating model.
- `README.md` does not explicitly state that there is no backend/API service, which matters because the project still exposes static `/sdk/*` URLs and an OpenAPI-style spec file.

## Low Priority Issues

- The `guest` credential row is documentation-only and not a real login path; this is acceptable but slightly artificial.
- The README claims "That is the full setup" while test execution still performs dependency installation inside containers.

## Hard Gate Failures

- None

## README Verdict

`PASS`

Reason:

- All core hard gates for a `web` project are satisfied:
  - project type declared
  - Docker startup instruction present
  - URL/port access method present
  - verification method present
  - authentication requirements and demo credentials documented
- Remaining issues are quality/compliance weaknesses, not hard-gate breaks.
