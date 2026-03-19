---
phase: 06-validation-and-publication
plan: 01
subsystem: validation
tags: [sample-app, test-plans, migration-verification]
dependency_graph:
  requires: [guide/07-crud-operations.md, guide/08-predicates-filters.md, guide/09-relationships.md, guide/10-react-integration.md, guide/11-cache-persistence.md, guide/12-optimistic-updates.md, guide/13-offline-architecture.md, guide/14-mutation-queue.md, guide/15-sync-engine.md]
  provides: [guide/validation/sample-app-spec.md, guide/validation/test-plan-api-only.md, guide/validation/test-plan-local-caching.md, guide/validation/test-plan-offline-first.md]
  affects: []
tech_stack:
  added: []
  patterns: [sample-app-spec, migration-test-plan, feature-coverage-matrix]
key_files:
  created:
    - guide/validation/sample-app-spec.md
    - guide/validation/test-plan-api-only.md
    - guide/validation/test-plan-local-caching.md
    - guide/validation/test-plan-offline-first.md
  modified: []
decisions:
  - "28-feature matrix covers all DataStore capabilities documented in Phases 1-5"
  - "Local Caching extends API Only test plan; Offline-First is fully independent"
  - "Offline-First has 9 phases (not 10 as originally planned) after consolidating sign-out into its own phase"
metrics:
  duration: 6min
  completed: 2026-03-15T16:39:00Z
---

# Phase 6 Plan 01: Sample App Spec and Migration Test Plans Summary

Gen 1 DataStore sample app spec with 5-model schema (Post/Comment/Author/Tag/PostTag), 28-feature coverage matrix, and 7 React components; plus three strategy-specific migration test plans with step-by-step verification checklists referencing exact guide sections.

## What Was Built

### Sample App Specification (guide/validation/sample-app-spec.md)
- **Model schema**: 5 models (Post, Comment, Author, Tag, PostTag) with PostStatus enum, owner auth, all relationship types (hasMany, belongsTo, manyToMany via join table)
- **Feature coverage matrix**: 28 features across 7 categories (CRUD: 6, Predicates: 13, Pagination/Sorting: 2, Relationships: 3, Real-Time: 2, Auth: 2)
- **React component list**: 7 components (PostList, PostForm, PostDetail, CommentList, TagManager, SubscriptionMonitor, AuthGate) with key DataStore code patterns for each
- **Dependencies**: Exact npm packages for Gen 1 app
- **Verification checklist**: 19-item checklist to verify all features work before migration

### API Only Test Plan (guide/validation/test-plan-api-only.md)
- 7 migration phases with 28 steps
- Phase 1: Apollo Client Setup (6 steps -- HTTP link, auth link, error/retry links, assembly, subscriptions, GraphQL ops)
- Phase 2: CRUD Migration (6 steps -- create, query-by-ID, list, update, delete, batch delete)
- Phase 3: Predicates and Queries (6 steps -- equality, comparison, string, logical, pagination, sorting)
- Phase 4: Relationships (3 steps -- hasMany, belongsTo, manyToMany)
- Phase 5: React Integration (3 steps -- useQuery, useMutation, remove DataStore imports)
- Phase 6: Real-Time (2 steps -- observe replacement, observeQuery replacement)
- Phase 7: Auth (2 steps -- owner-based filtering, sign-out cleanup)
- Final verification checklist with 30+ items

### Local Caching Test Plan (guide/validation/test-plan-local-caching.md)
- Extends API Only (Phases 1-7 by reference)
- Phase 8: Cache Persistence (5 steps -- localforage, CachePersistor, startup gating, refresh test, fetch policies)
- Phase 9: Optimistic Updates (4 steps -- optimistic create, update, delete, rollback verification)
- Phase 10: Cache Management (3 steps -- typePolicies, eviction, size monitoring)
- Phase 11: Sign-Out Cache Cleanup (2 steps -- pause-clearStore-purge-signOut, cross-user verification)

### Offline-First Test Plan (guide/validation/test-plan-offline-first.md)
- Independent plan (does NOT extend API Only)
- Phase 1: Apollo Client Setup (3 steps)
- Phase 2: Dexie.js Local Database (3 steps -- schema, offline CRUD, React hooks)
- Phase 3: Mutation Queue (3 steps -- enqueue, process, offline verification)
- Phase 4: Connectivity Monitoring (2 steps -- monitor, wire to queue)
- Phase 5: Sync Engine (4 steps -- base sync, delta sync, full sync interval, verification)
- Phase 6: Conflict Resolution (3 steps -- version detection, concurrent edits, version tracking)
- Phase 7: Apollo Integration (3 steps -- Dexie source of truth, OfflineDataManager, component migration)
- Phase 8: Full Offline Scenario (4 steps -- CRUD offline, extended offline, rapid toggle, multi-tab)
- Phase 9: Sign-Out and Cleanup (1 step -- offline-aware sign-out)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 3f962375f | Sample app spec and API Only migration test plan |
| Task 2 | cc9f2f6fc | Local Caching and Offline-First migration test plans |

## Deviations from Plan

None -- plan executed exactly as written.

## Key Metrics

- 4 files created, 2,334 total lines
- 28 features in coverage matrix
- 3 test plans covering all 3 migration strategies
- Every test step references specific guide sections by filename
