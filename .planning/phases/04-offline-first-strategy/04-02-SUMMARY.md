---
phase: 04-offline-first-strategy
plan: 02
subsystem: offline
tags: [mutation-queue, connectivity, dexie, indexeddb, fifo, dedup, offline-first]

# Dependency graph
requires:
  - phase: 04-offline-first-strategy-01
    provides: Dexie.js database setup, MutationQueueEntry interface, OfflineDatabase class
provides:
  - enqueueMutation() with modelId-based deduplication
  - processMutationQueue() with FIFO drain and version propagation
  - ConnectivityMonitor class with 5s stabilization delay
  - OfflineDataManager write path (save, delete, query)
  - dequeueAndSyncVersions() for _version propagation
  - Sign-out clearOfflineState() pattern
affects: [04-offline-first-strategy-03, sync-engine, conflict-resolution]

# Tech tracking
tech-stack:
  added: []
  patterns: [mutation-queue-dedup, version-propagation, connectivity-monitoring, offline-write-path]

key-files:
  created: [guide/14-mutation-queue.md]
  modified: []

key-decisions:
  - "5-second stabilization delay on both online event and socket disconnect (matches DataStore)"
  - "Jittered exponential backoff with 5-minute max for network retries"
  - "inProgress lock flag to prevent duplicate mutation sends"
  - "Startup recovery for stuck inProgress entries"

patterns-established:
  - "Two-step write: local DB put + enqueueMutation (explicit over implicit)"
  - "dequeueAndSyncVersions propagates _version in same transaction as dequeue"
  - "ConnectivityMonitor subscribe pattern with immediate state emit"
  - "getMutationForOperation registry pattern for model-to-GraphQL mapping"

requirements-completed: [OFFL-03, OFFL-06]

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 4 Plan 02: Mutation Queue Summary

**Mutation queue with FIFO dedup by modelId, connectivity monitor with 5s stabilization, and queue processor with version propagation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T14:44:01Z
- **Completed:** 2026-03-15T14:47:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- enqueueMutation() with full dedup logic: CREATE+UPDATE=merge, CREATE+DELETE=remove, UPDATE+UPDATE=replace
- processMutationQueue() with FIFO drain, jittered backoff, conflict handling preview, and version propagation via dequeueAndSyncVersions()
- ConnectivityMonitor class with navigator.onLine events, WebSocket disconnect detection, and 5-second stabilization delay
- OfflineDataManager write path showing save(), delete(), and query() facade methods
- Sign-out pattern clearing mutation queue + all Dexie.js tables
- Testing guide with DevTools walkthrough and common issues table

## Task Commits

Each task was committed atomically:

1. **Task 1: Create guide/14-mutation-queue.md** - `2a5112d9f` (feat)

## Files Created/Modified
- `guide/14-mutation-queue.md` - Mutation queue implementation, connectivity monitoring, queue processor, write path facade, testing guidance (964 lines)

## Decisions Made
- 5-second stabilization delay on both `online` event and socket disconnect, matching DataStore's `datastoreConnectivity.ts` pattern
- Jittered exponential backoff (base 100ms, max 5 min) for network retries in queue processor
- `inProgress` boolean lock flag on queue entries to prevent duplicate sends during processing
- Startup recovery step to clear stuck `inProgress` entries after app crash
- Two-step write pattern (local put + enqueueMutation) rather than single atomic operation, giving developers control over when to enqueue

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Mutation queue and connectivity monitor are complete and ready for integration with sync engine
- Forward references to guide/15-sync-engine.md are in place for conflict resolution and sync patterns
- The OfflineDataManager facade needs sync engine integration (query path reads from Dexie.js, write path queues mutations)

---
*Phase: 04-offline-first-strategy*
*Completed: 2026-03-15*
