---
phase: 01-foundation-and-guide-structure
plan: 02
subsystem: api
tags: [apollo-client, appsync, cognito, graphql, _version, conflict-resolution]

# Dependency graph
requires:
  - phase: none
    provides: none (first content plan)
provides:
  - Prerequisites page with GraphQL operations, _version metadata handling, and filterDeleted helper
  - Apollo Client setup page with auth link, error link, retry link, sign-out pattern
  - Complete copy-pasteable src/apolloClient.ts setup file
affects: [03-prerequisites-consumers, 04-apollo-setup-consumers, phase-02-api-only, phase-03-local-caching]

# Tech tracking
tech-stack:
  added: ["@apollo/client@^3.14.0", "graphql"]
  patterns: [hybrid-apollo-amplify, link-chain-composition, version-metadata-handling, fragment-based-operations]

key-files:
  created:
    - guide/03-prerequisites.md
    - guide/04-apollo-setup.md
  modified: []

key-decisions:
  - "Apollo Client v3 (not v4) for apollo3-cache-persist compatibility in Phase 3"
  - "handleSignOut naming convention to avoid recursive call bug from WIP guide"
  - "BatchHttpLink warning included in guide despite being a banned package (documentation warns against it)"

patterns-established:
  - "PostDetails fragment pattern: all operations use shared fragment including _version/_deleted/_lastChangedAt"
  - "Link chain order: RetryLink -> ErrorLink -> AuthLink -> HttpLink"
  - "filterDeleted helper for soft-deleted record filtering"
  - "AI-friendly section markers: <!-- ai:section-name --> convention"

requirements-completed: [FOUN-01, FOUN-02, FOUN-04, FOUN-05, FOUN-06, FOUN-07]

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 1 Plan 02: Prerequisites and Apollo Setup Summary

**Prerequisites page with _version metadata handling and complete Apollo Client setup with Cognito auth, error/retry links, and handleSignOut pattern**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T12:31:25Z
- **Completed:** 2026-03-15T12:34:05Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Prerequisites page with schema retrieval, GraphQL operations using PostDetails fragment, and comprehensive _version metadata section
- Apollo Client setup page with complete link chain (HTTP, Auth, Error, Retry), React integration, and sign-out cleanup
- Full copy-pasteable `src/apolloClient.ts` file readers can drop into their project
- filterDeleted helper utility for soft-deleted record filtering

## Task Commits

Each task was committed atomically:

1. **Task 1: Create prerequisites page with schema retrieval and _version metadata** - `9000835df` (feat)
2. **Task 2: Create Apollo Client setup page with auth, error handling, and sign-out** - `b523c5a22` (feat)

## Files Created/Modified
- `guide/03-prerequisites.md` - Prerequisites: install, schema retrieval, GraphQL operations with fragments, _version metadata handling
- `guide/04-apollo-setup.md` - Apollo Client setup: link chain, auth, errors, retry, sign-out, complete setup file

## Decisions Made
- Apollo Client v3 pinned at `@^3.14.0` for `apollo3-cache-persist` compatibility (Phase 3)
- Function named `handleSignOut` (not `signOut`) to avoid recursive call bug documented in WIP guide
- Included `BatchHttpLink` warning in Apollo setup page -- the string appears in guide as a "do NOT use" warning, not as recommended usage

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Prerequisites and Apollo Client setup pages complete
- Ready for Plan 01-03 (subscriptions, checklists, or remaining Phase 1 content)
- `_version` metadata patterns established for all subsequent CRUD examples

## Self-Check: PASSED

- All 3 files exist (guide/03-prerequisites.md, guide/04-apollo-setup.md, 01-02-SUMMARY.md)
- Both task commits verified (9000835df, b523c5a22)

---
*Phase: 01-foundation-and-guide-structure*
*Completed: 2026-03-15*
