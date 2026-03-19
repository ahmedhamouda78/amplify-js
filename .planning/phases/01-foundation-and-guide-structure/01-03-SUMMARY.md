---
phase: 01-foundation-and-guide-structure
plan: 03
subsystem: docs
tags: [subscriptions, apollo-client, amplify-gen2, migration-checklist, appsync-websocket, real-time]

# Dependency graph
requires:
  - phase: 01-foundation-and-guide-structure
    provides: "Apollo Client setup (04-apollo-setup.md), PostDetails fragment (03-prerequisites.md)"
provides:
  - "Subscription setup guide with hybrid Apollo + Amplify approach (guide/05-subscriptions.md)"
  - "Pre/during/post migration checklists with 39 checkbox items (guide/06-migration-checklist.md)"
  - "Complete Phase 1 foundation -- all 7 guide files (00-06) now exist"
affects: [02-api-only-strategy, 03-local-caching, 04-offline-first]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Hybrid subscription: Amplify generateClient() for subscriptions, Apollo for queries/mutations", "Refetch pattern as primary real-time approach", "Subscription array cleanup on unmount"]

key-files:
  created:
    - guide/05-subscriptions.md
    - guide/06-migration-checklist.md
  modified: []

key-decisions:
  - "Refetch pattern is primary (recommended), direct cache update is advanced (secondary)"
  - "Subscription payloads use minimal fields (just id) for refetch pattern, full fields for cache update"
  - "39 checklist items across pre (11), during (15), and post (13) migration phases"

patterns-established:
  - "Hybrid client pattern: amplifyClient for subscriptions, apolloClient for everything else"
  - "Subscription array pattern for managing multiple subscriptions in useEffect"
  - "AI-friendly section markers: ai:pattern:refetch, ai:pattern:cache-update, ai:comparison:observe, ai:checklist:*"

requirements-completed: [FOUN-03, STRC-03]

# Metrics
duration: 2min
completed: 2026-03-15
---

# Phase 1 Plan 3: Subscriptions & Migration Checklists Summary

**Hybrid Apollo + Amplify subscription setup with refetch pattern, plus 39-item pre/during/post migration checklists completing all Phase 1 foundation content**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T12:36:08Z
- **Completed:** 2026-03-15T12:38:30Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- Subscriptions page explains why Apollo subscriptions fail with AppSync (custom WebSocket protocol) and shows the hybrid Amplify approach
- Two subscription patterns documented: refetch (recommended) and direct cache update (advanced)
- Migration checklists with 39 checkbox items across pre-migration (11), during migration (15), and post-migration (13) phases
- All Phase 1 guide content is now complete (7 files: 00-introduction through 06-migration-checklist)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create subscriptions page** - `408638999` (feat)
2. **Task 2: Create migration checklists** - `66bbafa66` (feat)

## Files Created/Modified
- `guide/05-subscriptions.md` - Real-time subscriptions page with hybrid Apollo + Amplify approach, refetch and cache update patterns, DataStore comparison table, troubleshooting section
- `guide/06-migration-checklist.md` - Pre/during/post migration checklists with 39 checkbox items, strategy-specific additions section

## Decisions Made
- Refetch pattern as primary (recommended), direct cache update as secondary (advanced) -- per locked CONTEXT.md decision
- Subscription payloads use minimal fields (just `id`) in refetch pattern since full data is refetched anyway
- Checklist items cross-reference all other guide pages for easy navigation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Phase 1 foundation content complete (7 guide files: 00-06)
- Phase 2 (API Only strategy) can build on this foundation
- Strategy-specific guides will add detailed CRUD migration patterns, relationship handling, and advanced queries
- The migration checklists reference forward to Phase 3 (Local Caching) and Phase 4 (Offline-First) for strategy-specific additions

---
*Phase: 01-foundation-and-guide-structure*
*Completed: 2026-03-15*
