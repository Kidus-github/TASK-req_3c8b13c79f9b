# Bug Fix Audit Report

## Verdict

Pass

## Scope and Boundary

- Static re-audit only within the current working directory.
- Excluded `./.tmp` from evidence gathering and factual conclusions.
- Did not run the app, did not run tests, did not run Docker, and did not modify application code.
- This audit checks whether the previously reported defects are now fixed by static source, docs, and test evidence.
- Runtime behaviors such as actual WebGL interaction, service-worker activation, and BroadcastChannel behavior still require manual browser verification.

## Audited Prior Findings

### BF-01: Import `overwrite_by_id` mode previously exposed but not implemented

- Status: Fixed
- Rationale: The import commit path now resolves `overwrite_by_id` rows against existing card ids and calls `updateCard(...)` instead of always creating new cards.
- Evidence:
- `frontend/src/lib/services/import.service.ts:196-199`
- `frontend/src/lib/services/import.service.ts:253-287`
- `frontend/src/components/import/ImportWizard.svelte:263-270`
- Regression coverage:
- `frontend/tests/unit/services/import.service.spec.ts:158-207`
- `frontend/tests/unit/services/import.service.spec.ts:216-257`

### BF-02: Config/docs drift for import row cap and parser canary threshold

- Status: Fixed
- Rationale: Feature code now reads live config values instead of hardcoded literals, and the README describes the same config source of truth.
- Evidence:
- `frontend/src/components/import/ImportWizard.svelte:75`
- `frontend/src/components/import/ImportWizard.svelte:119`
- `frontend/src/components/import/ImportWizard.svelte:174`
- `frontend/src/lib/services/import.service.ts:374`
- `frontend/src/lib/services/parser-rule.service.ts:116-118`
- `frontend/src/lib/services/parser-rule.service.ts:145-147`
- `README.md:49`
- `README.md:56`
- Regression coverage:
- `frontend/tests/unit/services/import.service.spec.ts:271-291`
- `frontend/tests/unit/services/parser-rule.service.spec.ts:145-173`

### BF-03: SDK contract drift between runtime, types, docs, and OpenAPI-style spec

- Status: Fixed
- Rationale: The SDK contract has been narrowed to the runtime-supported surface. Types, docs, and spec now align on emitted events and `queryFeatures` filtering.
- Evidence:
- `frontend/src/lib/types/sdk.ts:27-55`
- `frontend/public/sdk/openapi-v1.json:336-338`
- `frontend/src/routes/SDKDocs.svelte:131-137`
- `frontend/tests/unit/sdk-embed.spec.ts:127-131`
- Regression coverage:
- `frontend/tests/unit/sdk-contract-parity.spec.ts:78-123`
- `frontend/tests/unit/sdk-contract-parity.spec.ts:166-175`

### BF-04: PWA checklist/version drift for SDK spec filename

- Status: Fixed
- Rationale: The checklist now references the same `1.1.0` SDK spec filename as the docs and README, and it adds manual-browser checks for the previously identified unverified runtime areas.
- Evidence:
- `frontend/tests/pwa-checklist.md:42-75`
- `README.md:167-170`
- Regression coverage:
- `frontend/tests/unit/sdk-contract-parity.spec.ts:166-175`

## Residual Verification Boundary

- Cannot statically confirm that service worker offline reload works in a real browser.
- Cannot statically confirm WebGL star picking and SDK `onStarClick` parity at runtime.
- Cannot statically confirm BroadcastChannel edit warnings and cross-tab refresh timing in real tabs.
- The repo now includes explicit manual-browser checks for those areas:
- `frontend/tests/pwa-checklist.md:48-66`

## Final Audit Conclusion

All four previously reported defects are closed by static evidence. The fixes are implemented in application code, reflected in documentation where relevant, and backed by focused regression tests. No replacement High or Blocker issue was identified in the audited fix scope.
