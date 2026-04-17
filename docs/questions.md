# NebulaForge Creator Nebula - Questions & Clarifications

## Resolved Questions

### Q1: Cooldown behavior after repeated login failures
**Question:** What is the exact cooldown progression after failed login attempts?
**Resolution:** Progressive cooldown starting after 5 consecutive failures. Base cooldown is 60 seconds, each additional failure adds 30 seconds, capped at 5 minutes maximum. Successful login resets the counter.

### Q2: Tag galaxy behavior for multi-tag cards
**Question:** How should a card with multiple tags be positioned in the 3D star map? Should it appear in multiple galaxies?
**Resolution:** Primary galaxy assignment uses the first normalized tag only. No multi-galaxy duplication. Additional tags remain searchable metadata but do not affect visual galaxy placement.

### Q3: Date-to-orbit distance formula
**Question:** How should card dates be mapped to orbital distances in the star map?
**Resolution:** Normalized min/max date mapping. Older dates map to smaller orbital distances (nearer to galaxy center), newer dates map to larger orbital distances (farther from center). When all cards share the same date, all use the median orbital band.

### Q4: What constitutes a "viewed card" for Voyage Mission
**Question:** When does a card view count toward the daily Voyage Mission goal?
**Resolution:** A card view is counted when the user opens the card detail modal. Simply seeing a card in a list does not count. The same card opened multiple times on the same day counts as one distinct view.

### Q5: Stardust unlock persistence
**Question:** Is the stardust visual effect permanent or does it reset when the streak breaks?
**Resolution:** Once unlocked (after 7 consecutive completed days), stardust remains permanently available for that device profile. Breaking the streak does not remove the unlock.

### Q6: Duplicate import behavior
**Question:** How should the system handle duplicate cards during bulk import?
**Resolution:** Three modes: (1) `create_new` (default) - always create new cards; (2) `skip_exact_duplicate` - skip if normalized title+body+date+mood+sorted(tags) matches an existing active card; (3) `overwrite_by_id` - overwrite if source provides matching ID.

### Q7: Worker retry policy
**Question:** Should failed background jobs retry automatically?
**Resolution:** Manual retry by default. Automatic retry is allowed only for worker boot initialization failures (max 1 retry). User can manually retry or discard failed/interrupted jobs.

### Q8: Canary test threshold
**Question:** At what failure rate should canary testing block full extraction?
**Resolution:** Full apply is blocked when the sample failure rate exceeds 20% (strictly greater than). Sample size is minimum 5 records or all available up to 20.

### Q9: Backup restore merge vs replace semantics
**Question:** How should conflicting data be handled during backup restore?
**Resolution:** Merge mode (default): backup card wins if its `updatedAt` timestamp is newer than the local card; otherwise local version is kept. New cards from backup are always inserted. Replace mode: all existing profile data is deleted before inserting backup data, behind an explicit confirmation dialog.

### Q10: Authorization model scope
**Question:** What authorization model applies given there's no server?
**Resolution:** Local capability-based model with two roles: `guest` (unauthenticated, can only see login screen) and `user` (authenticated, has all capabilities). Route guards enforce permissions client-side.

## Open Questions (Deferred)

### Q11: Data purge for soft-deleted cards
**Status:** Deferred to future release.
**Context:** Soft-deleted cards remain in IndexedDB indefinitely. A purge feature to permanently remove deleted cards and their revisions may be added in a future version.

### Q12: IndexedDB storage quota management
**Status:** Deferred.
**Context:** Browsers impose storage limits on IndexedDB. A future version should monitor usage via `navigator.storage.estimate()` and warn users approaching limits.

### Q13: Fuzzy/semantic search
**Status:** Out of scope per PRD.
**Context:** Current search uses exact and partial token matching. Fuzzy matching (edit distance) and semantic search (embeddings) are explicitly out of scope.

### Q14: Multi-device sync
**Status:** Explicitly out of scope per PRD.
**Context:** The PRD explicitly excludes cloud sync, remote APIs, and multi-device data sharing.

### Q15: Password recovery
**Status:** Not required per PRD.
**Context:** No password recovery feature exists. Users who forget their password can reset their local profile, which may render existing encrypted backups inaccessible.
