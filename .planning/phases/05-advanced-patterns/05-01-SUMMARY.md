---
phase: 05-advanced-patterns
plan: 01
subsystem: guide
tags: [composite-keys, codegen, whats-lost, hub-events, typepolicies]
dependency_graph:
  requires: [guide/07-crud-operations.md, guide/04-apollo-setup.md]
  provides: [guide/16-advanced-patterns.md]
  affects: []
tech_stack:
  added: []
  patterns: [TypedDocumentNode wrapping, typePolicies keyFields, ampx codegen]
key_files:
  created: [guide/16-advanced-patterns.md]
  modified: []
decisions:
  - TypedDocumentNode wrapping pattern over raw gql strings for type safety
  - Honest 7-of-9 Hub events gap documented without minimization
  - typePolicies keyFields as required configuration for composite key models
metrics:
  duration: 3min
  completed: 2026-03-15
---

# Phase 5 Plan 01: Advanced Patterns Guide Summary

Complete advanced patterns guide covering composite key migration (3 identifier modes with before/after code), GraphQL codegen with TypedDocumentNode wrapping to eliminate `any` casts, and honest accounting of all 9 Hub events where 7 have no Apollo equivalent.

## What Was Done

### Task 1: Write advanced patterns guide
**Commit:** f1efcd041

Created `guide/16-advanced-patterns.md` (662 lines) with three major sections:

**Section 1 -- Composite and Custom Primary Keys:**
- All three identifier modes documented: ManagedIdentifier (default), OptionallyManagedIdentifier (user-provided ID), CompositeIdentifier (multi-field PK)
- Before/after code examples for each mode showing DataStore vs Apollo Client
- StoreBranch composite key example with tenantId + branchName
- Apollo InMemoryCache typePolicies with keyFields configuration for composite key cache normalization
- Warning about cache normalization failure without keyFields

**Section 2 -- GraphQL Codegen:**
- `npx ampx generate graphql-client-code --format graphql-codegen --statement-target typescript` command
- Generated output format showing plain string constants (not TypedDocumentNode)
- Complete wrapping pattern: import string -> gql() -> TypedDocumentNode generic
- Type-safe hook usage eliminating (post: any) casts from Phase 2
- Alternative mention: @graphql-codegen/cli for full end-to-end codegen

**Section 3 -- What Is Lost:**
- All 9 Hub events cataloged individually with workaround ratings
- Selective sync (syncExpressions) coverage with honest "no equivalent" for API Only/Caching
- 3 lifecycle methods (start, stop, clear) with Apollo equivalents noted
- Conflict handler configuration shown as fully replaced
- Summary table: 1 fully replaced, 4 partially replaced, 9 no equivalent
- Practical guidance closing paragraph

### Task 2: Validate guide completeness
**Commit:** (same as Task 1 -- validation only, no file changes)

All requirement checks passed:
- ADVN-01: 3 identifier modes, before/after code, typePolicies, mutation input shapes
- ADVN-02: codegen command, gql() wrapping, TypedDocumentNode, typed hooks
- ADVN-03: 9 Hub events, selective sync, lifecycle methods, summary table
- Guide: 662 lines (well over 200 minimum)

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **TypedDocumentNode wrapping pattern:** Used the research-recommended approach of wrapping ampx-generated string constants with gql() and TypedDocumentNode generics, rather than requiring teams to set up a separate codegen toolchain
2. **Honest gap documentation:** Documented 7 of 9 Hub events as having no Apollo equivalent, with clear explanation that Apollo is not a sync engine
3. **typePolicies keyFields as required config:** Positioned this as a critical configuration step that is easy to miss, with warning signs section

## Verification Results

- 3 ai: section markers present (composite-keys, codegen-setup, whats-lost)
- All 9 Hub events documented by name
- 27 occurrences of key technical terms (CompositeIdentifier, keyFields, TypedDocumentNode, etc.)
- 662 lines total

## Self-Check: PASSED

- guide/16-advanced-patterns.md: FOUND
- 05-01-SUMMARY.md: FOUND
- Commit f1efcd041: FOUND
