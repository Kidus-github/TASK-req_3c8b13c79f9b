# NebulaForge Creator Nebula - Design Document

## 1. System Overview

NebulaForge Creator Nebula is an offline-first single-page application that allows creators, planners, and writers to collect, organize, and visualize inspiration fragments as an interactive 3D star cloud. The application is fully client-side with zero network dependencies at runtime.

## 2. Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Browser Runtime                     │
├──────────────┬──────────────┬────────────────────────┤
│  Svelte UI   │  Three.js    │  Service Worker (PWA)  │
│  Components  │  Star Map    │  Offline Caching        │
├──────────────┴──────────────┴────────────────────────┤
│                  Svelte Stores                        │
│  (auth, cards, search, starmap, voyage, jobs, prefs) │
├──────────────────────────────────────────────────────┤
│              Service Layer (Business Logic)           │
│  auth | card | import | search | voyage | backup     │
│  parser-rule | worker-queue | sync | audit | rbac    │
├──────────┬────────────┬──────────────────────────────┤
│ IndexedDB│ localStorage│    Web Workers               │
│ (Dexie)  │ (prefs)    │ (import, search, encryption) │
└──────────┴────────────┴──────────────────────────────┘
```

### 2.2 Layered Architecture

Dependencies flow strictly downward:

1. **Routes** (page components) - top-level views
2. **Components** (reusable UI elements) - presentation layer
3. **Stores** (Svelte reactive state) - state management
4. **Services** (business logic) - domain logic, validation, orchestration
5. **DB / Workers / Utils** (infrastructure) - persistence, background processing
6. **Types** (shared contracts) - TypeScript interfaces
7. **Config** (centralized settings) - single source of truth
8. **Logging** (structured logger) - observability

### 2.3 Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Svelte 5 | Compile-time reactivity, small bundle, runes for explicit state |
| 3D Engine | Three.js InstancedMesh | Native raycasting, per-instance color, efficient for 1000+ stars |
| DB Access | Dexie 4 | Typed IndexedDB wrapper with compound indices, liveQuery support |
| Routing | svelte-spa-router (hash) | Offline-first: hash routes work without server config |
| Styling | Tailwind CSS 4 + Skeleton UI | Utility-first with prebuilt component library |
| Crypto | Web Crypto API (native) | No dependencies, AES-GCM + PBKDF2 built-in |

## 3. Data Model

### 3.1 IndexedDB Schema (17 tables)

| Table | Primary Key | Key Indices | Purpose |
|-------|-------------|-------------|---------|
| profiles | &id | &username | Device-local credentials |
| cards | &id | profileId, *tags, mood, date, [profileId+deletedAt] | Inspiration cards |
| cardRevisions | &id | cardId, version | Immutable edit history |
| importBatches | &id | profileId, status | Import tracking |
| importRowResults | &id | importBatchId, rowNumber | Row validation results |
| searchIndex | &cardId | mood, dateEpochDay, *tagTerms | Inverted search index |
| viewLogs | &id | [profileId+dateLocal] | Card view tracking for Voyage |
| missionDayActivities | &id | [profileId+dateLocal] | Daily mission progress |
| missionStreaks | &id | &profileId | Streak state |
| workerJobs | &id | type, status, [status+priority] | Job queue persistence |
| workerJobLogs | &id | jobId | Operational logs |
| monitorSnapshots | &id | jobType | Monitor metrics |
| backupArtifacts | &id | profileId | Backup metadata |
| parsingRuleSets | &id | profileId, name, status | Parser rules |
| parsingCanaryRuns | &id | ruleSetId | Canary test results |
| parserRuleVersions | &id | ruleSetId, version | Rule version history |
| auditEvents | &id | type, timestamp, profileId | Audit trail |

### 3.2 localStorage (preferences only)

Key: `nebulaforge_preferences`
Contents: theme, navigationLayout, footerText, language, lightingPreset, defaultSort, defaultFilters

## 4. Security Model

### 4.1 Profile Gate

- Device-local convenience gate (not a security boundary)
- Password stored as PBKDF2 hash (100,000 iterations) with random 16-byte salt
- Progressive cooldown: 60s base after 5 failures, +30s per additional failure, max 300s

### 4.2 RBAC

| Role | Permissions | Description |
|------|-------------|-------------|
| guest | (none) | Unauthenticated, locked screen only |
| user | enter_app, manage_cards, import_cards, manage_rules, run_jobs, export_data, import_backups, use_sdk, change_preferences, view_monitor | Authenticated local user |

Route guards enforce RBAC on every navigation.

### 4.3 Backup Encryption

- Optional AES-GCM encryption with PBKDF2-derived key
- Random 16-byte salt + 12-byte IV prepended to ciphertext
- SHA-256 checksum for corruption detection
- UI explicitly states this is privacy convenience, not tamper-proof security

## 5. 3D Visualization

### 5.1 Star Mapping

- Each active card = one star (Three.js InstancedMesh instance)
- Galaxy grouping: first normalized tag -> deterministic spherical position via tag hash
- Mood -> color: 5-step palette (blue, cyan, lime, yellow, orange)
- Date -> orbital distance: normalized linear interpolation within min/max date range
- Same data always produces same star positions (deterministic)

### 5.2 Interaction

- OrbitControls: orbit, pan, zoom with damping
- Raycaster: click star to open detail modal
- Highlight sync: search results dim non-matching stars

## 6. Search Architecture

- Inverted index stored per-card in IndexedDB
- Weighted field scoring: title (3.0), tags (2.0), body (1.0)
- Partial token matching at 0.5x weight for fuzzy results
- Filters (tag, mood range, date range) applied post-query
- 7 sort options: relevance, date asc/desc, title asc/desc, mood asc/desc

## 7. Background Processing

- Import parsing and validation
- Search index rebuild
- Backup encryption/decryption
- Parser canary testing
- All jobs tracked in IndexedDB with full lifecycle states
- Interrupted jobs surfaced on app restart

## 8. Multi-Tab Coordination

- BroadcastChannel: EDIT_LOCK, EDIT_UNLOCK, DATA_CHANGED, TAB_HEARTBEAT
- Optimistic version conflict detection on card saves
- View refresh propagation for card create/update/delete
