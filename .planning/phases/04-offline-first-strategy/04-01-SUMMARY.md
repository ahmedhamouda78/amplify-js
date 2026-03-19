---
phase: 04-offline-first-strategy
plan: 01
subsystem: offline-architecture
tags: [offline-first, dexie, indexeddb, architecture, local-database]
dependency_graph:
  requires: [guide/04-apollo-setup.md, guide/01-decision-framework.md]
  provides: [guide/13-offline-architecture.md]
  affects: [guide/14-mutation-queue.md, guide/15-sync-engine.md]
tech_stack:
  added: [dexie@4.x]
  patterns: [OfflineDatabase, MutationQueueEntry, SyncMetadata, facade-pattern]
key_files:
  created: [guide/13-offline-architecture.md]
  modified: []
decisions:
  - "Dexie.js is source of truth, Apollo Client is transport only"
  - "Two internal tables: _mutationQueue and _syncMetadata"
  - "Only indexed fields in Dexie stores() definition"
  - "Phase 4 replaces Phase 3 entirely -- do not combine"
metrics:
  duration: 2min
  completed: 2026-03-15
---

# Phase 4 Plan 01: Architecture Overview and Dexie.js Setup Summary

Offline-first architecture overview with ASCII component diagram and Dexie.js v4 local database setup with typed interfaces for Post, Comment, MutationQueueEntry, and SyncMetadata tables.

## What Was Done

### Task 1: Create guide/13-offline-architecture.md (429 lines)

Created the complete offline-first architecture guide covering six sections:

1. **When You Need Offline-First** -- positioned Phase 4 relative to API Only and Local Caching, identified use cases (field workers, intermittent connectivity), established Dexie.js as source of truth
2. **Architecture Overview** -- ASCII component diagram showing all layers (App -> OfflineDataManager -> Mutation Queue + Sync Engine + Conflict Resolver + Connectivity Monitor -> Dexie.js -> Apollo Client + Amplify -> AppSync), three data flow paths (write, read, sync)
3. **What DataStore Does Under the Hood** -- mapped DataStore's 5 internal components to guide equivalents (SyncEngine -> OfflineDataManager, MutationEventOutbox -> _mutationQueue, etc.)
4. **Dexie.js Local Database Setup** -- TypeScript interfaces for all data structures, OfflineDatabase class with version(1).stores(), schema mapping table, before/after DataStore comparison, adding new models, version migrations with upgrade callbacks
5. **Comparing with Phase 3** -- side-by-side table covering source of truth, offline reads/writes, sync mechanism, conflict resolution, complexity
6. **Next Steps** -- forward references to mutation queue and sync engine guides

**Commit:** `e7e97bb92`
**Files:** `guide/13-offline-architecture.md`

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **Dexie.js is source of truth, Apollo Client is transport only** -- established clearly in architecture overview and comparison table
2. **Two internal tables (_mutationQueue, _syncMetadata)** -- matching DataStore's MutationEvent and ModelMetadata tables
3. **Only indexed fields in stores() definition** -- explicit guidance that Dexie stores all fields but only indexes those listed
4. **Phase 4 replaces Phase 3 entirely** -- clear guidance to not combine cache persistence with Dexie.js

## Verification Results

- Guide file exists: PASS (429 lines, minimum 350)
- ai:section markers: 7 present
- OfflineDatabase class: present (6 references)
- MutationQueueEntry interface: present (6 references)
- SyncMetadata interface: present (6 references)
- Forward reference to guide/14: present (4 references)
- Forward reference to guide/15: present (3 references)
- Back-reference to guide/04-apollo-setup: present (1 reference)

## Self-Check: PASSED

- guide/13-offline-architecture.md: FOUND
- 04-01-SUMMARY.md: FOUND
- Commit e7e97bb92: FOUND
