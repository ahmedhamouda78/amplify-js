# Requirements: Amplify JS DataStore Migration Guide

**Defined:** 2026-03-15
**Core Value:** Customers can confidently migrate their Gen 1 DataStore apps to Gen 2 without losing critical functionality

## v1 Requirements

Requirements for initial publication. Each maps to roadmap phases.

### Guide Structure

- [x] **STRC-01**: Guide includes decision framework (flowchart) helping users choose between API Only, Local Caching, and Offline-First strategies
- [x] **STRC-02**: Guide includes feature parity matrix showing what each strategy covers vs DataStore (updated from source code analysis)
- [x] **STRC-03**: Guide includes pre-migration, during-migration, and post-migration checklists
- [x] **STRC-04**: Every DataStore operation has a before/after code example showing the migration pattern

### Foundation (Shared Setup)

- [x] **FOUN-01**: Guide shows Apollo Client setup with AppSync (createHttpLink, InMemoryCache, auth link chain)
- [x] **FOUN-02**: Guide shows Cognito User Pools auth integration via setContext link with fetchAuthSession
- [x] **FOUN-03**: Guide shows AppSync subscription setup addressing the custom WebSocket protocol (not standard graphql-ws)
- [x] **FOUN-04**: Guide shows GraphQL operation definitions (queries, mutations, subscriptions) and explains that DataStore hid GraphQL
- [x] **FOUN-05**: Guide shows error handling link chain (onError, RetryLink) replacing DataStore's automatic retry
- [x] **FOUN-06**: Guide shows sign-out/clear data pattern (clearStore + cache purge)
- [x] **FOUN-07**: Guide addresses _version, _deleted, _lastChangedAt metadata fields for apps with conflict resolution enabled

### CRUD Migration

- [x] **CRUD-01**: Guide shows save/create migration (DataStore.save → apolloClient.mutate with CREATE mutation)
- [x] **CRUD-02**: Guide shows update migration (Model.copyOf → apolloClient.mutate with UPDATE mutation + plain objects)
- [x] **CRUD-03**: Guide shows delete migration (DataStore.delete → apolloClient.mutate with DELETE mutation)
- [x] **CRUD-04**: Guide shows query-by-ID migration (DataStore.query(Model, id) → useQuery with getModel)
- [x] **CRUD-05**: Guide shows list query migration (DataStore.query(Model) → useQuery with listModels)
- [x] **CRUD-06**: Guide shows complete predicate/filter operator mapping table (all 12 operators: eq, ne, lt, le, gt, ge, between, beginsWith, contains, notContains, in, notIn)
- [x] **CRUD-07**: Guide shows logical predicate migration (and, or, not combinations)
- [x] **CRUD-08**: Guide shows pagination migration from page-based (page+limit) to cursor-based (nextToken+limit)
- [x] **CRUD-09**: Guide shows sorting migration (server-side via @index, client-side via JS sort)
- [x] **CRUD-10**: Guide shows batch delete pattern (query-then-delete-each, since Apollo has no predicate delete)

### Relationships

- [x] **RELS-01**: Guide shows hasMany relationship migration (AsyncCollection.toArray() → nested GraphQL selection)
- [x] **RELS-02**: Guide shows belongsTo relationship migration (foreign key → nested or separate query)
- [x] **RELS-03**: Guide shows hasOne relationship migration (AsyncItem → nested GraphQL selection)
- [x] **RELS-04**: Guide shows many-to-many relationship migration (join table pattern)

### Real-Time & Observation

- [x] **RTOB-01**: Guide shows observe migration (DataStore.observe → separate onCreate/onUpdate/onDelete subscriptions)
- [x] **RTOB-02**: Guide shows observeQuery equivalent using watchQuery + subscriptions with cache-and-network policy
- [x] **RTOB-03**: Guide shows owner-based auth subscription patterns with explicit owner argument

### React Integration

- [x] **REAC-01**: Guide shows React component migration from imperative DataStore to declarative Apollo hooks (useQuery, useMutation, useSubscription)
- [x] **REAC-02**: Guide shows loading/error state handling patterns that DataStore didn't expose
- [x] **REAC-03**: Guide shows ApolloProvider setup at app root

### Strategy 2: Local Caching

- [x] **CACH-01**: Guide shows apollo3-cache-persist setup with IndexedDB storage backend
- [x] **CACH-02**: Guide shows cache restoration on app startup
- [x] **CACH-03**: Guide shows optimistic updates (optimisticResponse + cache update function)
- [x] **CACH-04**: Guide shows fetchPolicy patterns (cache-first, network-only, cache-and-network, cache-only)
- [x] **CACH-05**: Guide shows typePolicies for pagination merge and cache normalization
- [x] **CACH-06**: Guide shows cache size management and eviction patterns

### Strategy 3: Offline-First

- [x] **OFFL-01**: Guide shows offline-first architecture with component diagram (local DB, mutation queue, sync engine, conflict resolver)
- [x] **OFFL-02**: Guide shows Dexie.js local database setup with model schema mapping from DataStore models
- [x] **OFFL-03**: Guide shows mutation queue implementation (IndexedDB-backed, FIFO, deduplication by modelId)
- [x] **OFFL-04**: Guide shows sync engine with base sync and delta sync patterns against AppSync
- [x] **OFFL-05**: Guide shows conflict resolution patterns (version-based, optimistic concurrency, custom handler)
- [x] **OFFL-06**: Guide shows connectivity monitoring and sync-on-reconnect pattern
- [x] **OFFL-07**: Guide shows integration of offline data manager with Apollo Client as transport layer

### Identifiers & Advanced

- [x] **ADVN-01**: Guide covers composite/custom primary key migration patterns
- [x] **ADVN-02**: Guide covers GraphQL codegen setup for type-safe operations and hooks
- [x] **ADVN-03**: Guide documents what is lost and has no equivalent (Hub events, selective sync, sync lifecycle monitoring) with workarounds where possible

### Sample Apps & Validation

- [x] **VALD-01**: Gen 1 DataStore sample app created covering CRUD, relationships, subscriptions, and auth
- [x] **VALD-02**: Sample app successfully migrated to Gen 2 using API Only strategy following guide instructions
- [x] **VALD-03**: Sample app successfully migrated to Gen 2 using Local Caching strategy following guide instructions
- [x] **VALD-04**: Sample app successfully migrated to Gen 2 using Offline-First strategy following guide instructions

### Publication

- [x] **PUBL-01**: Guide published on docs.amplify.aws in correct MDX format under data/migrate-from-datastore/
- [x] **PUBL-02**: AI-friendly single markdown version created, optimized for pasting into AI agent context
- [x] **PUBL-03**: AI-friendly version structured for future agentskills.io format conversion with clear decision trees and machine-parseable patterns

## v2 Requirements

Deferred to future iteration. Tracked but not in current roadmap.

### Multi-Platform

- **PLAT-01**: React Native-specific migration patterns (AsyncStorage, native lifecycle)
- **PLAT-02**: Next.js SSR-specific patterns (server components, hydration, streaming)

### Extended Auth

- **AUTH-01**: Full multi-auth mode migration patterns (API key, IAM, OIDC, Lambda)
- **AUTH-02**: Custom auth provider migration from DataStore authProviders config

### Tooling

- **TOOL-01**: Automated DataStore usage audit tool (analyze codebase, recommend strategy)
- **TOOL-02**: Agent Skill (agentskills.io format) for automated migration assistance

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backend migration (defineData dataStoreConfiguration) | Separate workstream with own timeline and team |
| Non-Apollo alternatives in depth (RxDB, WatermelonDB, PouchDB) | Decision made: Apollo Client is the replacement. Brief mention only. |
| Automatic migration codemods | Fragile, hard to maintain, limited ROI |
| Client-side AWS scalar validation replication | AppSync validates server-side; unnecessary client-side code |
| Custom storage adapter guidance | DataStore concept that doesn't apply to Apollo |
| Replicating DataStore's immer-based immutability pattern | Apollo uses plain objects; brief mention of change only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| STRC-01 | Phase 1 | Complete |
| STRC-02 | Phase 1 | Complete |
| STRC-03 | Phase 1 | Complete |
| STRC-04 | Phase 1 | Complete |
| FOUN-01 | Phase 1 | Complete |
| FOUN-02 | Phase 1 | Complete |
| FOUN-03 | Phase 1 | Complete |
| FOUN-04 | Phase 1 | Complete |
| FOUN-05 | Phase 1 | Complete |
| FOUN-06 | Phase 1 | Complete |
| FOUN-07 | Phase 1 | Complete |
| CRUD-01 | Phase 2 | Complete |
| CRUD-02 | Phase 2 | Complete |
| CRUD-03 | Phase 2 | Complete |
| CRUD-04 | Phase 2 | Complete |
| CRUD-05 | Phase 2 | Complete |
| CRUD-06 | Phase 2 | Complete |
| CRUD-07 | Phase 2 | Complete |
| CRUD-08 | Phase 2 | Complete |
| CRUD-09 | Phase 2 | Complete |
| CRUD-10 | Phase 2 | Complete |
| RELS-01 | Phase 2 | Complete |
| RELS-02 | Phase 2 | Complete |
| RELS-03 | Phase 2 | Complete |
| RELS-04 | Phase 2 | Complete |
| RTOB-01 | Phase 2 | Complete |
| RTOB-02 | Phase 2 | Complete |
| RTOB-03 | Phase 2 | Complete |
| REAC-01 | Phase 2 | Complete |
| REAC-02 | Phase 2 | Complete |
| REAC-03 | Phase 2 | Complete |
| CACH-01 | Phase 3 | Complete |
| CACH-02 | Phase 3 | Complete |
| CACH-03 | Phase 3 | Complete |
| CACH-04 | Phase 3 | Complete |
| CACH-05 | Phase 3 | Complete |
| CACH-06 | Phase 3 | Complete |
| OFFL-01 | Phase 4 | Complete |
| OFFL-02 | Phase 4 | Complete |
| OFFL-03 | Phase 4 | Complete |
| OFFL-04 | Phase 4 | Complete |
| OFFL-05 | Phase 4 | Complete |
| OFFL-06 | Phase 4 | Complete |
| OFFL-07 | Phase 4 | Complete |
| ADVN-01 | Phase 5 | Complete |
| ADVN-02 | Phase 5 | Complete |
| ADVN-03 | Phase 5 | Complete |
| VALD-01 | Phase 6 | Complete |
| VALD-02 | Phase 6 | Complete |
| VALD-03 | Phase 6 | Complete |
| VALD-04 | Phase 6 | Complete |
| PUBL-01 | Phase 6 | Complete |
| PUBL-02 | Phase 6 | Complete |
| PUBL-03 | Phase 6 | Complete |

**Coverage:**
- v1 requirements: 54 total
- Mapped to phases: 54
- Unmapped: 0

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after roadmap creation*
