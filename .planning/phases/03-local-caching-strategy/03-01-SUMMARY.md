---
phase: 03-local-caching-strategy
plan: 01
subsystem: caching
tags: [apollo3-cache-persist, localforage, indexeddb, fetchPolicy, cache-persistence]

requires:
  - phase: 01-project-setup
    provides: Apollo Client setup with InMemoryCache, link chain, handleSignOut
provides:
  - Cache persistence guide with CachePersistor + IndexedDB setup
  - Cache restoration gate pattern for app startup
  - FetchPolicy patterns with DataStore migration mapping
  - Enhanced handleSignOut with persistor.purge()
  - Cache size management, eviction, gc, schema versioning
affects: [03-local-caching-strategy, 04-offline-first]

tech-stack:
  added: [apollo3-cache-persist v0.15.0, localforage v1.10.0]
  patterns: [CachePersistor with LocalForageWrapper, cache restoration gate, cache-and-network default fetchPolicy, pause-clear-purge-signout order]

key-files:
  created: [guide/11-cache-persistence.md]
  modified: []

key-decisions:
  - "CachePersistor over persistCache for lifecycle control (purge, pause, getSize)"
  - "cache-and-network as default fetchPolicy to match DataStore always-fresh behavior"
  - "Pause-clearStore-purge-signOut order for sign-out to prevent unnecessary persistence writes"
  - "Schema version strategy via key bumping rather than cache migration code"

patterns-established:
  - "CachePersistor setup: localforage.config() + LocalForageWrapper + schema-versioned key"
  - "Cache restoration gate: useState/useEffect loading gate before ApolloProvider renders"
  - "Sign-out order: pause persistor, clearStore, purge, signOut"
  - "DataStore-to-fetchPolicy mapping table for migration decisions"

requirements-completed: [CACH-01, CACH-02, CACH-04, CACH-06]

duration: 3min
completed: 2026-03-15
---

# Phase 3 Plan 1: Cache Persistence Guide Summary

**CachePersistor with IndexedDB persistence, cache restoration gate, fetchPolicy migration mapping, and enhanced sign-out with purge**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T14:06:18Z
- **Completed:** 2026-03-15T14:09:18Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments
- Complete cache persistence guide (470 lines) covering all 4 requirements
- CachePersistor setup with LocalForageWrapper for IndexedDB (CACH-01)
- Cache restoration gate pattern with useState/useEffect (CACH-02)
- All 6 fetchPolicy patterns with DataStore migration mapping table (CACH-04)
- Enhanced handleSignOut with pause/clearStore/purge/signOut order (CACH-06)
- Cache size monitoring, eviction, gc, and schema versioning (CACH-06)
- Complete enhanced apolloClient.ts code block for copy-paste

## Task Commits

Each task was committed atomically:

1. **Task 1: Create guide/11-cache-persistence.md** - `301a22d53` (feat)

## Files Created/Modified
- `guide/11-cache-persistence.md` - Cache persistence guide with CachePersistor setup, restoration, fetchPolicy patterns, sign-out purge, cache management, and troubleshooting

## Decisions Made
- Used CachePersistor over persistCache for lifecycle control (purge, pause, getSize needed for production)
- Set cache-and-network as default fetchPolicy to match DataStore's always-fresh behavior
- Added persistor.pause() before clearStore in sign-out to prevent unnecessary persistence writes
- Schema versioning via key bumping (simple trade: one cold start vs complex migration)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Cache persistence guide complete, ready for Plan 02 (optimistic updates + typePolicies)
- Guide references guide/12-optimistic-updates.md which will be created in Plan 02
- Enhanced apolloClient.ts has typePolicies placeholder ready for Plan 02 to fill

---
*Phase: 03-local-caching-strategy*
*Completed: 2026-03-15*
