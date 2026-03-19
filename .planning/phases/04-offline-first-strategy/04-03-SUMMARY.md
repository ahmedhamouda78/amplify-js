---
phase: 04-offline-first-strategy
plan: 03
subsystem: offline-sync-engine
tags: [sync-engine, conflict-resolution, apollo-integration, offline-first, dexie]
dependency_graph:
  requires: [04-01, 04-02]
  provides: [sync-engine, conflict-resolution, offline-data-manager]
  affects: [guide/15-sync-engine.md]
tech_stack:
  added: []
  patterns: [base-delta-sync, version-based-conflict, outbox-aware-merge, live-query-hooks]
key_files:
  created: [guide/15-sync-engine.md]
  modified: []
decisions:
  - "Approach A (bypass Apollo cache, read from Dexie) recommended over Approach B (update Apollo cache)"
  - "Models synced in topological order (parents before children)"
  - "Sync-then-drain order on reconnect reduces conflicts by bringing _version updates before sending mutations"
  - "mergeSubscriptionEvent skips records with pending local mutations (outbox-aware)"
metrics:
  duration: 4min
  completed: 2026-03-15
---

# Phase 4 Plan 3: Sync Engine and Conflict Resolution Summary

Sync engine with base/delta sync via AppSync syncPosts queries, three conflict resolution strategies (_version-based), Apollo Client integration with two approaches, and complete OfflineDataManager facade wiring all offline components together.

## What Was Built

### guide/15-sync-engine.md (1159 lines)

Eight sections covering the complete sync and conflict resolution layer:

1. **How DataStore's Sync Engine Works** -- Explains base sync vs delta sync, syncPosts vs listPosts distinction, fullSyncInterval safety net, topological model ordering
2. **Sync Query GraphQL Definitions** -- SYNC_POSTS and SYNC_COMMENTS query documents with $lastSync, $nextToken, startedAt, full selection sets, and fallback note for schemas without conflict resolution
3. **Sync Engine Implementation** -- syncModel() with base/delta determination, paginated download loop, mergeItemsIntoLocal() with outbox-aware merging (skips records with pending mutations), syncAllModels() with topological ordering
4. **Conflict Resolution** -- Three strategies (last writer wins, server wins/optimistic concurrency, custom field-level merge), max 10 retry attempts, DISCARD flow, version propagation reminder
5. **Apollo Client Integration** -- Approach A (bypass cache, read from Dexie with useDexieQuery hook using liveQuery + useSyncExternalStore) and Approach B (update Apollo cache from Dexie for incremental migration)
6. **Complete OfflineDataManager** -- Full facade with start(), stop(), save(), delete(), query(), observe(), mergeSubscriptionEvent(), sync-on-reconnect wiring, and stuck mutation recovery
7. **Anti-Patterns and Troubleshooting** -- Six anti-patterns with explanations, eight-row troubleshooting table mapping symptoms to causes and fixes
8. **Summary and What's Next** -- Component mapping table (DataStore internal vs guide equivalent), what you gained/gave up

## Key Links Verified

- **guide/13-offline-architecture.md**: Imports db, OfflineDatabase, SyncMetadata, MutationQueueEntry types
- **guide/14-mutation-queue.md**: Imports enqueueMutation, processMutationQueue, dequeueAndSyncVersions, ConnectivityMonitor, handleConflict
- **guide/04-apollo-setup.md**: Uses apolloClient for sync queries (fetchPolicy: 'network-only') and mutations

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | e08513c37 | Sync engine, conflict resolution, and Apollo integration guide |

## Self-Check: PASSED
