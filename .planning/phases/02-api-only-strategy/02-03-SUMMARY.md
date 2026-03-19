---
phase: 02-api-only-strategy
plan: 03
subsystem: documentation
tags: [graphql, relationships, hasMany, belongsTo, hasOne, manyToMany, apollo-client, datastore-migration]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: PostDetails fragment pattern and _version metadata conventions
provides:
  - Complete relationship migration guide covering all 4 relationship types
  - GraphQL query patterns for nested selections (eager and lazy loading)
  - Join table query pattern for manyToMany relationships
  - Creating and removing related records patterns
affects: [02-api-only-strategy, 03-local-caching, 04-offline-first]

# Tech tracking
tech-stack:
  added: []
  patterns: [eager-vs-lazy-loading, join-table-queries, nested-graphql-selections, _deleted-filtering-on-nested-items]

key-files:
  created: [guide/09-relationships.md]
  modified: []

key-decisions:
  - "Showed both eager (nested selection) and lazy (separate query) patterns for hasMany to give developers flexibility"
  - "Filtered _deleted on join records (PostTag) not just leaf records for manyToMany correctness"

patterns-established:
  - "Eager loading pattern: nest related fields in GraphQL selection for always-needed data"
  - "Lazy loading pattern: separate query with filter for on-demand data"
  - "Join table pattern: query through PostTag with nested tag selection for manyToMany"
  - "Foreign key pattern: pass ID directly instead of model instance when creating related records"

requirements-completed: [RELS-01, RELS-02, RELS-03, RELS-04]

# Metrics
duration: 2min
completed: 2026-03-15
---

# Phase 2 Plan 3: Relationships Migration Guide Summary

**Complete before/after migration guide for hasMany, belongsTo, hasOne, and manyToMany relationships with eager/lazy loading patterns and join table queries**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T13:15:13Z
- **Completed:** 2026-03-15T13:16:56Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created guide/09-relationships.md with all 9 sections and 8 ai: markers
- Before/after code examples for all 4 relationship types (hasMany, belongsTo, hasOne, manyToMany)
- GraphQL query definitions with nested selections showing items wrapper, _deleted filtering, and _version fields
- Both eager loading (nested selection) and lazy loading (separate query) patterns for hasMany
- Creating and removing manyToMany associations via PostTag join model
- Quick reference table mapping DataStore to Apollo access patterns
- Performance considerations covering N+1 problem and eager/lazy tradeoffs

## Task Commits

Each task was committed atomically:

1. **Task 1: Write guide/09-relationships.md** - `354f08cac` (feat)

## Files Created/Modified
- `guide/09-relationships.md` - Complete relationship migration guide with all 4 types, before/after examples, and performance guidance

## Decisions Made
- Showed both eager (nested selection) and lazy (separate query) patterns for hasMany to give developers flexibility matching DataStore's lazy-load behavior
- Filtered _deleted on join records (PostTag) not just leaf records, since a deleted join record means the association was removed even if the Tag still exists

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Relationship guide complete, references prerequisites (03) fragment patterns
- Ready for remaining Phase 2 plans (predicates/filters, React integration)
- Navigation links point to 08-predicates-filters.md and 10-react-integration.md (to be created)

---
*Phase: 02-api-only-strategy*
*Completed: 2026-03-15*
