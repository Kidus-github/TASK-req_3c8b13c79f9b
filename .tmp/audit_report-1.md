1. Verdict

- Partial Pass

2. Scope and Verification Boundary

- Reviewed only the current working directory, primarily `README.md`, `frontend/package.json`, Vite config, app entry/routing, routes, components, stores, services, workers, public PWA assets, SDK files, and test files.
- Excluded `./.tmp/` and all subdirectories from evidence, search scope, and factual conclusions. This report was saved there only as output, not used as review evidence.
- Did not run the project, did not run tests, did not run Docker, did not run preview/build/dev, and did not modify application code.
- Cannot statically confirm real browser execution outcomes such as final WebGL rendering, real service-worker activation/caching behavior, installability, offline reload behavior, responsive rendering, or BroadcastChannel behavior across real tabs.
- Manual verification is still required for PWA install/offline behavior, Three.js interaction fidelity/performance, multi-tab coordination in a real browser, and final visual polish.
- Report saved to `.tmp/frontend-static-review.md`.

3. Prompt / Repository Mapping Summary

- Prompt core business goals: local-only profile gate; offline CSV/JSON import with row validation; interactive 3D star cloud; offline search/filter/sort/highlight; voyage streak tracking; IndexedDB/localStorage persistence; worker-backed heavy tasks with visible monitor/progress; parser-rule extraction/canary/versioning; backup export/restore; offline PWA; multi-tab coordination; local SDK/spec/sample embed.
- Required pages / main flow / key states / key constraints reviewed:
  - Entry gate: [frontend/src/App.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/App.svelte:37), [frontend/src/components/auth/LoginGate.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/components/auth/LoginGate.svelte:22), [frontend/src/lib/services/auth.service.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/services/auth.service.ts:16)
  - Route/app shell wiring: [frontend/src/routes/index.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/routes/index.ts:13), [frontend/src/components/layout/Shell.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/components/layout/Shell.svelte:8)
  - Import/review/commit flow: [frontend/src/components/import/ImportWizard.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/components/import/ImportWizard.svelte:52), [frontend/src/components/import/ValidationReport.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/components/import/ValidationReport.svelte:48), [frontend/src/lib/services/import.service.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/services/import.service.ts:145)
  - Star map/detail/edit flow: [frontend/src/routes/StarMap.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/routes/StarMap.svelte:22), [frontend/src/components/starmap/StarMapCanvas.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/components/starmap/StarMapCanvas.svelte:21)
  - Search/filter/sort/highlight: [frontend/src/routes/Search.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/routes/Search.svelte:22), [frontend/src/components/search/SearchFilters.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/components/search/SearchFilters.svelte:11), [frontend/src/lib/services/search.service.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/services/search.service.ts:146)
  - Voyage tracking/stardust: [frontend/src/lib/services/voyage.service.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/services/voyage.service.ts:11), [frontend/src/lib/stores/voyage.store.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/stores/voyage.store.ts:19)
  - Worker queue/monitor/progress drawer: [frontend/src/lib/services/queue-runner.service.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/services/queue-runner.service.ts:128), [frontend/src/components/layout/ProgressDrawer.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/components/layout/ProgressDrawer.svelte:71), [frontend/src/components/jobs/JobMonitor.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/components/jobs/JobMonitor.svelte:69)
  - Parser rules/canary/versioning: [frontend/src/routes/ParserRules.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/routes/ParserRules.svelte:156), [frontend/src/components/parser-rules/CanaryRunner.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/components/parser-rules/CanaryRunner.svelte:28), [frontend/src/lib/services/parser-rule.service.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/services/parser-rule.service.ts:104)
  - Backup/privacy wording: [frontend/src/components/backup/BackupExport.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/components/backup/BackupExport.svelte:44), [frontend/src/lib/services/backup.service.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/services/backup.service.ts:18)
  - PWA/SDK/multi-tab: [frontend/src/main.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/main.ts:13), [frontend/public/service-worker.js](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/public/service-worker.js:14), [frontend/src/lib/services/sync.service.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/services/sync.service.ts:43), [frontend/src/routes/SDKDocs.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/routes/SDKDocs.svelte:68)
- Major implementation areas reviewed against those requirements: docs/scripts, app shell/routing, auth, import, cards CRUD, search/indexing, voyage, worker queue, parser rules, backup, SDK, PWA assets, multi-tab sync, and test coverage.

4. High / Blocker Coverage Panel

- A. Prompt-fit / completeness blockers: Pass
  - Short reason: The prompt’s main frontend flow is statically present end to end: unlock -> import/review -> star map/search/cards -> voyage/jobs/backup/parser rules/settings/SDK.
  - Evidence or verification boundary: [frontend/src/routes/index.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/routes/index.ts:13), [frontend/src/components/import/ImportWizard.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/components/import/ImportWizard.svelte:52), [frontend/src/routes/StarMap.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/routes/StarMap.svelte:22), [frontend/src/routes/Search.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/routes/Search.svelte:22)
  - Corresponding Finding ID(s) if confirmed Blocker / High issues exist: None

- B. Static delivery / structure blockers: Pass
  - Short reason: README, scripts, entry points, route registration, and project structure are statically coherent and sufficient for local verification attempts.
  - Evidence or verification boundary: [README.md](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/README.md:13), [frontend/package.json](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/package.json:6), [frontend/src/main.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/main.ts:13), [frontend/vite.config.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/vite.config.ts:6)
  - Corresponding Finding ID(s) if confirmed Blocker / High issues exist: None

- C. Frontend-controllable interaction / state blockers: Pass
  - Short reason: Core flows have visible validation and required states for login, import, edit/delete, and search.
  - Evidence or verification boundary: [frontend/src/components/auth/LoginGate.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/components/auth/LoginGate.svelte:29), [frontend/src/lib/utils/validation.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/utils/validation.ts:5), [frontend/src/components/import/ImportWizard.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/components/import/ImportWizard.svelte:297), [frontend/src/components/search/SearchResults.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/components/search/SearchResults.svelte:27)
  - Corresponding Finding ID(s) if confirmed Blocker / High issues exist: None

- D. Data exposure / delivery-risk blockers: Pass
  - Short reason: No real tokens, API keys, or hidden default mock/demo interception were found; local-storage/IndexedDB usage matches the prompt’s local-only model.
  - Evidence or verification boundary: [frontend/src/lib/logging/index.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/logging/index.ts:20), [README.md](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/README.md:172); static grep found no real secrets in source files.
  - Corresponding Finding ID(s) if confirmed Blocker / High issues exist: None

- E. Test-critical gaps: Partial Pass
  - Short reason: The repo has substantial unit/integration coverage, but browser-executed PWA/WebGL/multi-tab verification is still manual and no E2E harness exists.
  - Evidence or verification boundary: [frontend/package.json](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/package.json:11), [README.md](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/README.md:142), [frontend/tests/pwa-checklist.md](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/tests/pwa-checklist.md:1)
  - Corresponding Finding ID(s) if confirmed Blocker / High issues exist: None

5. Confirmed Blocker / High Findings

- None confirmed from static evidence.

6. Other Findings Summary

- Severity: Medium
  - Conclusion: The import UI exposes an `overwrite_by_id` mode, but the commit path never overwrites an existing card; it still creates new cards.
  - Evidence: [frontend/src/components/import/ImportWizard.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/components/import/ImportWizard.svelte:260), [frontend/src/lib/workers/heavy-task.worker.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/workers/heavy-task.worker.ts:495), [frontend/src/lib/services/import.service.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/services/import.service.ts:223), [frontend/src/lib/services/import.service.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/services/import.service.ts:237)
  - Minimum actionable fix: Implement an actual overwrite path using `updateCard` against the matched card id, or remove/disable the `overwrite_by_id` option until supported.

- Severity: Medium
  - Conclusion: README/config claim env-driven import-row and parser-canary thresholds, but implementation hardcodes those values in feature code.
  - Evidence: [README.md](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/README.md:36), [frontend/src/lib/config/index.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/config/index.ts:107), [frontend/src/lib/services/import.service.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/services/import.service.ts:14), [frontend/src/components/import/ImportWizard.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/components/import/ImportWizard.svelte:74), [frontend/src/lib/services/parser-rule.service.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/services/parser-rule.service.ts:9)
  - Minimum actionable fix: Replace hardcoded `1000` and `0.2` usages with `config.maxImportRows` and `config.canaryFailureThreshold`, then keep README/env docs aligned with the actual runtime source of truth.

- Severity: Medium
  - Conclusion: The Star Map SDK contract is internally inconsistent; docs/spec/types advertise events and query filters that the runtime embed implementation does not provide.
  - Evidence: [frontend/src/lib/types/sdk.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/types/sdk.ts:22), [frontend/public/sdk/openapi-v1.json](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/public/sdk/openapi-v1.json:266), [frontend/src/routes/SDKDocs.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/routes/SDKDocs.svelte:131), [frontend/src/lib/sdk/embed.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/sdk/embed.ts:246), [frontend/src/lib/sdk/embed.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/sdk/embed.ts:361)
  - Minimum actionable fix: Either implement the advertised `starHover` / `cameraChange` events and richer `queryFeatures` filtering, or narrow the types/docs/spec to the subset the SDK actually supports.

- Severity: Low
  - Conclusion: The manual PWA checklist still refers to downloading `nebulaforge-sdk-v1.0.0.json`, while the SDK docs and README use `v1.1.0`.
  - Evidence: [frontend/tests/pwa-checklist.md](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/tests/pwa-checklist.md:42), [frontend/src/routes/SDKDocs.svelte](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/routes/SDKDocs.svelte:4), [README.md](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/README.md:167)
  - Minimum actionable fix: Update the checklist to the current spec filename/version used by the UI and README.

7. Data Exposure and Delivery Risk Summary

- real sensitive information exposure: Pass
  - short evidence or verification-boundary explanation: No real tokens, API keys, or production secrets were found; logging explicitly redacts password/passphrase/token-like keys in [frontend/src/lib/logging/index.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/src/lib/logging/index.ts:20).

- hidden debug / config / demo-only surfaces: Pass
  - short evidence or verification-boundary explanation: No default-enabled mock/interceptor/demo surface was found in app code. The few `console.log` references are inside SDK sample code/docs, not app execution paths.

- undisclosed mock scope or default mock behavior: Pass
  - short evidence or verification-boundary explanation: The app is presented as local-only/offline rather than as a real backend integration, and the fake worker/database helpers are isolated under `frontend/tests/`.

- fake-success or misleading delivery behavior: Partial Pass
  - short evidence or verification-boundary explanation: Two misleading static contract issues exist: the unsupported import overwrite mode and the overstated SDK API surface; see the Medium findings above.

- visible UI / console / storage leakage risk: Pass
  - short evidence or verification-boundary explanation: IndexedDB/localStorage usage aligns with the prompt’s local-device model, and README clearly discloses that the profile gate is convenience/privacy only, not a real security boundary: [README.md](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/README.md:172).

8. Test Sufficiency Summary

Test Overview

- whether unit tests exist: Yes. Examples: [frontend/tests/unit/services/auth.service.spec.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/tests/unit/services/auth.service.spec.ts:18), [frontend/tests/unit/services/backup.service.spec.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/tests/unit/services/backup.service.spec.ts:29)
- whether component tests exist: Yes. Examples include component/store-focused tests under `frontend/tests/unit/stores/` and SDK/component-facing tests such as [frontend/tests/unit/sdk-bundle.spec.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/tests/unit/sdk-bundle.spec.ts:13)
- whether page / route integration tests exist: Yes. Examples: [frontend/tests/integration/search-import.spec.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/tests/integration/search-import.spec.ts:26), [frontend/tests/integration/parser-rule-versioning-ui.spec.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/tests/integration/parser-rule-versioning-ui.spec.ts:63), [frontend/tests/integration/voyage-progression.spec.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/tests/integration/voyage-progression.spec.ts:37)
- whether E2E tests exist: No. README explicitly says there is no Playwright/Cypress harness: [README.md](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/README.md:149)
- what the obvious test entry points are: `npm test` in [frontend/package.json](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/package.json:11), plus manual browser verification in [frontend/tests/pwa-checklist.md](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/tests/pwa-checklist.md:1)

Core Coverage

- happy path: covered
  - evidence: [frontend/tests/integration/search-import.spec.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/tests/integration/search-import.spec.ts:27), [frontend/tests/integration/voyage-progression.spec.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/tests/integration/voyage-progression.spec.ts:38)
  - minimum necessary supplemental test recommendation: Add one browser-level happy-path smoke test covering unlock -> import -> search -> star-map selection.

- key failure paths: partially covered
  - evidence: [frontend/tests/unit/services/auth.service.spec.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/tests/unit/services/auth.service.spec.ts:79), [frontend/tests/unit/services/backup.service.spec.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/tests/unit/services/backup.service.spec.ts:158)
  - minimum necessary supplemental test recommendation: Add tests for the exposed-but-broken import overwrite mode and for SDK doc/spec/runtime parity.

- interaction / state coverage: partially covered
  - evidence: [frontend/tests/integration/live-import-progress.spec.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/tests/integration/live-import-progress.spec.ts:29), [frontend/tests/unit/pwa-assets.spec.ts](/abs/path/C:/Users/kidus/OneDrive/Desktop/TASK-req_3c8b13c79f9b/repo/frontend/tests/unit/pwa-assets.spec.ts:12)
  - minimum necessary supplemental test recommendation: Add real-browser tests for service worker install/offline behavior, multi-tab edit warnings, and WebGL picking/highlight behavior.

Major Gaps

- No browser E2E harness for service-worker registration, offline reload, installability, or route traversal under offline conditions.
- No real-browser verification of Three.js picking, orbit/pan/zoom behavior, or SDK canvas interaction.
- No automated browser test for BroadcastChannel-based simultaneous-edit warnings and cross-tab refresh.
- No test covering the exposed `overwrite_by_id` import mode.
- No test asserting SDK docs/spec/types remain aligned with runtime implementation.

Final Test Verdict

- Partial Pass

9. Engineering Quality Summary

- The project is organized as a coherent application with reasonable separation across routes, components, stores, services, workers, and persistence layers. Static architecture is materially stronger than a demo-only SPA.
- Maintainability risk is concentrated in contract drift rather than structural chaos: some behavior is duplicated/hardcoded outside the config module, and some SDK/import options are exposed more broadly than they are actually implemented.
- No major architecture-level blocker was confirmed statically.

10. Visual and Interaction Summary

- Static structure supports a differentiated application shell, multiple functional areas, modal/detail flows, validation feedback, progress surfaces, and persistent preferences. Route/component separation and state branches suggest a plausible real application rather than disconnected mock screens.
- Static evidence is not enough to strongly judge final rendering quality, motion quality, responsiveness, WebGL performance, or whether hover/disabled/current-state styling feels polished in a browser.
- Manual verification is specifically needed for star-map usability, modal layering, service-worker/offline UX, and mobile layout behavior.

11. Next Actions

- Implement actual overwrite behavior for `overwrite_by_id`, or remove that option from the import UI until it is real.
- Replace hardcoded import/canary thresholds with the config module values and keep README/env docs in sync.
- Bring the SDK runtime, types, OpenAPI-style spec, and docs onto the same contract; do not advertise events/filters the runtime does not emit/support.
- Update the manual PWA checklist to the current SDK spec filename/version.
- Add at least one browser-level smoke test for service worker install/offline reload and one for WebGL star selection.
- Add a browser test for BroadcastChannel simultaneous-edit warnings and cross-tab refresh.
- Add an automated test specifically for the import overwrite mode.
