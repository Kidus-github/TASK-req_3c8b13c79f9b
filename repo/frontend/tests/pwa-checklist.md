# PWA Offline Smoke Checklist

Run through these steps against a production build (`npm run build && npm run preview`).

## Installability

1. Open the preview URL in Chrome/Edge.
2. DevTools → Application → Manifest. Expect:
   - Name: "NebulaForge Creator Nebula"
   - Start URL: `/`, scope: `/`
   - Display: standalone
   - Theme color: `#0f172a`
   - Icons: `favicon.svg`, `icon-192.png`, `icon-512.png` load without errors
3. Install icon appears in the address bar; clicking it opens a standalone window.

## Service Worker

4. Application → Service Workers. Expect `/service-worker.js` is `activated and running`.
5. Application → Cache Storage → `nebulaforge-v1`. Expect app shell entries:
   - `/`, `/index.html`, `/manifest.webmanifest`
   - `/favicon.svg`, `/icons/icon-192.png`, `/icons/icon-512.png`
   - `/sdk/openapi-v1.json`

## Offline Mode

6. Network panel → throttling: Offline.
7. Hard-reload the app — it must still boot (navigation falls back to cached `/index.html`).
8. Navigate between routes (`/#/cards`, `/#/search`, `/#/starmap`) — all render.
9. Create, edit, delete a card; confirm all succeed while offline and persist after reload.
10. Run a search — results come from the IndexedDB-backed index, not network.

## Multi-tab Sync

11. With two tabs open, edit a card in tab A. Tab B's list updates within a second.
12. Start editing the same card in both tabs — tab B shows a "being edited in another tab" warning banner.

## Worker Queue

13. Import a CSV/JSON file. Jobs tab shows a live progress bar for `import_parse_validate` and a `DONE` log entry on completion.
14. Cancel an in-flight import — the job transitions to `cancelled` and the wizard returns to the upload step.

## Browser Smoke (manual — Playwright/Cypress is intentionally not wired up)

The items below are the things vitest + jsdom cannot verify. They must be run in
a real Chromium/Firefox build before calling a release done. When full browser
E2E lands, the cases below are the seed set.

### Service Worker / Offline reload
- DevTools → Application → Service Workers: `/service-worker.js` is activated.
- Toggle Network → Offline.
- Hard-reload `/#/cards` — the app shell still boots from the Cache Storage
  entry for `/` + `/index.html`.
- Navigate between routes while offline — all render from cache.

### WebGL star selection
- On `/#/starmap`, click one of the instanced star meshes.
  The selection panel populates with the matching card.
- The same click, in the SDK sample embed (`frontend/sdk/sample-embed.html`
  opened over `file://`), calls the `onStarClick` callback with the star
  object — parity with the in-app star map.

### BroadcastChannel multi-tab coordination
- Open two app tabs side by side.
- Edit a card in tab A → tab B's list updates within ~1s.
- Start editing the same card in both tabs → tab B shows the
  "being edited in another tab" warning banner.

## SDK Spec

15. Visit `/#/sdk-docs`. Click "Download Spec" — receives `nebulaforge-sdk-v1.1.0.json`.
    The downloaded filename, the `Spec: OpenAPI v…` label on the docs page, the
    shipped asset at `/sdk/openapi-v1.json`, and the README SDK section should
    all reference the same `1.1.0` version. The advertised event list must be
    exactly: `starClick`, `drawStart`, `drawProgress`, `drawComplete`,
    `drawCancelled`, `measureComplete`, `layerChange`.
