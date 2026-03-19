---
phase: 06-validation-and-publication
plan: 02
subsystem: documentation-mdx
tags: [mdx, docs-site, publication, amplify-docs]
dependency_graph:
  requires: [all 17 guide files from phases 1-5]
  provides: [8 MDX pages, directory entry snippet]
  affects: [docs.amplify.aws publication]
tech_stack:
  added: [MDX, Amplify docs components]
  patterns: [getCustomStaticPath, getChildPageNodes, InlineFilter, Callout, Accordion, Overview]
key_files:
  created:
    - guide/mdx/migrate-from-datastore/index.mdx
    - guide/mdx/migrate-from-datastore/choose-strategy/index.mdx
    - guide/mdx/migrate-from-datastore/set-up-apollo/index.mdx
    - guide/mdx/migrate-from-datastore/migrate-crud-operations/index.mdx
    - guide/mdx/migrate-from-datastore/migrate-relationships/index.mdx
    - guide/mdx/migrate-from-datastore/add-local-caching/index.mdx
    - guide/mdx/migrate-from-datastore/build-offline-support/index.mdx
    - guide/mdx/migrate-from-datastore/advanced-patterns/index.mdx
    - guide/mdx/directory-entry.mjs
  modified: []
decisions:
  - InlineFilter used only for genuinely React-specific content (hooks, ApolloProvider, component examples)
  - Accordion used for lengthy implementation details and troubleshooting sections to reduce visual weight
  - Mermaid diagrams converted to text-based indented decision trees
  - All HTML comments stripped; ai: tags preserved only in source markdown, not in MDX output
metrics:
  duration: 12min
  completed: "2026-03-15T16:45:00Z"
---

# Phase 6 Plan 02: MDX Pages for Amplify Docs Site Summary

8 publication-ready MDX pages created from 17 guide files, with correct Amplify docs site boilerplate, platform filters, navigation entry, and zero HTML comments.

## What Was Done

### Task 1: Parent page, choose-strategy, set-up-apollo, and directory entry
**Commit:** 9a54871b2

Created 3 MDX pages and the directory entry snippet:

- **index.mdx** (parent page): Combined guide/00-introduction.md overview content with guide/06-migration-checklist.md checklists. Uses `getChildPageNodes` and `Overview` component. Includes pre-migration, during-migration, and post-migration checklists with strategy-specific additions in Accordion components.

- **choose-strategy/index.mdx**: Combined guide/01-decision-framework.md and guide/02-parity-matrix.md. Mermaid flowchart converted to text-based decision tree. Includes full feature parity matrix table and all three strategy descriptions with effort estimates.

- **set-up-apollo/index.mdx**: Combined guide/03-prerequisites.md, guide/04-apollo-setup.md, and guide/05-subscriptions.md. Covers installation, GraphQL operations, _version metadata, link chain configuration, React connection (InlineFilter-gated), sign-out cleanup, subscription setup with refetch pattern, and troubleshooting.

- **directory-entry.mjs**: JavaScript snippet with the exact entry to add to docs site directory.mjs, listing all 7 child page paths.

### Task 2: CRUD, relationships, caching, offline, and advanced pattern pages
**Commit:** 5b4b46591

Created 5 MDX leaf pages:

- **migrate-crud-operations/index.mdx**: Combined guide/07-crud-operations.md and guide/08-predicates-filters.md. Before/after patterns for all CRUD operations, complete filter operator mapping table, in/notIn workarounds, cursor-based pagination with Load More pattern, client-side sorting, and common mistakes in Accordion.

- **migrate-relationships/index.mdx**: guide/09-relationships.md content. Covers hasMany, belongsTo, hasOne, manyToMany with eager/lazy loading patterns, join table operations, N+1 query prevention, and performance recommendations.

- **add-local-caching/index.mdx**: Combined guide/11-cache-persistence.md and guide/12-optimistic-updates.md. CachePersistor setup, cache restoration gating, fetch policy patterns, enhanced sign-out (pause-clearStore-purge-signOut order), optimistic create/update/delete, typePolicies for pagination and _deleted filtering.

- **build-offline-support/index.mdx**: Combined guide/13-offline-architecture.md, guide/14-mutation-queue.md, and guide/15-sync-engine.md. Architecture overview, Dexie.js setup, mutation queue with deduplication, connectivity monitor with 5s stabilization, sync engine (base/delta), conflict resolution, OfflineDataManager facade, sign-out cleanup. Uses Accordion extensively for implementation details.

- **advanced-patterns/index.mdx**: Combined guide/10-react-integration.md and guide/16-advanced-patterns.md. React component migration (InlineFilter-gated for react/nextjs/react-native), DataStore.observe and observeQuery migration, owner-based auth subscriptions, composite keys with typePolicies keyFields, GraphQL codegen with TypedDocumentNode, and honest "what is lost" documentation.

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **InlineFilter scope**: Used `filters={["react", "nextjs", "react-native"]}` only for genuinely React-specific content (hooks, ApolloProvider, component JSX examples). All imperative Apollo Client patterns are shown to all platforms.

2. **Accordion usage**: Applied liberally on the build-offline-support page (longest content) for implementation code blocks. Also used for troubleshooting sections, complete setup files, and helper function details across all pages.

3. **Mermaid conversion**: Converted the decision framework flowchart to an indented text-based decision tree format that renders correctly in MDX without a Mermaid renderer.

4. **Architecture diagram**: Kept the ASCII box diagram in build-offline-support as a code block, which renders correctly in MDX.

5. **Link format**: Used Amplify docs site relative link format (`/[platform]/build-a-backend/data/migrate-from-datastore/...`) for cross-page links rather than file-relative paths.

## Verification Results

- All 8 MDX files exist under guide/mdx/migrate-from-datastore/
- directory-entry.mjs exists with 8 path entries (1 parent + 7 children)
- Zero HTML comments in any MDX file
- All 7 leaf pages have getCustomStaticPath boilerplate
- Parent page has getChildPageNodes and Overview component
- All 17 guide files represented across the 8 pages
- Platforms array is JS-only (6 platforms) in every page

## File Inventory

| File | Lines | Source Guide Files |
|------|-------|--------------------|
| index.mdx | ~165 | 00-introduction + 06-migration-checklist |
| choose-strategy/index.mdx | ~175 | 01-decision-framework + 02-parity-matrix |
| set-up-apollo/index.mdx | ~420 | 03-prerequisites + 04-apollo-setup + 05-subscriptions |
| migrate-crud-operations/index.mdx | ~470 | 07-crud-operations + 08-predicates-filters |
| migrate-relationships/index.mdx | ~340 | 09-relationships |
| add-local-caching/index.mdx | ~370 | 11-cache-persistence + 12-optimistic-updates |
| build-offline-support/index.mdx | ~500 | 13-offline-architecture + 14-mutation-queue + 15-sync-engine |
| advanced-patterns/index.mdx | ~420 | 10-react-integration + 16-advanced-patterns |
| directory-entry.mjs | ~38 | N/A (navigation config) |

## Self-Check: PASSED

All 9 created files verified on disk. Both task commits (9a54871b2, 5b4b46591) verified in git log.
