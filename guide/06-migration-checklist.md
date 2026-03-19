<!-- ai:migration-checklist -->

# Migration Checklists

These checklists help you plan and track your migration from DataStore to Apollo Client. They are organized into three phases: before you start coding, during the migration, and after you finish. Use them as a living document -- check items off as you complete them, and refer back to them when you need to verify your progress.

Each checklist item links to the relevant section of this guide where you can find detailed instructions and code examples.

<!-- ai:checklist:pre-migration -->

## Pre-Migration Checklist

Complete these steps before writing any migration code. They ensure your environment is ready and you have a clear plan for the migration.

- [ ] **Choose your strategy** -- Complete the [Decision Framework](./01-decision-framework.md) and confirm your approach (API Only, Local Caching, or Offline-First)
- [ ] **Verify your backend is deployed** -- Confirm your Amplify Gen 2 backend is deployed and `amplify_outputs.json` is generated (`npx ampx generate outputs`)
- [ ] **Confirm Amplify is configured** -- Verify that `Amplify.configure(outputs)` runs at app startup before any API calls
- [ ] **Check conflict resolution status** -- Determine if conflict resolution is enabled on your backend (it is if you used DataStore). See [Understanding _version Metadata](./03-prerequisites.md#understanding-_version-metadata)
- [ ] **Inventory all DataStore usage** -- Search your codebase for every DataStore import and operation:
  - `import { DataStore } from 'aws-amplify/datastore'`
  - `DataStore.save()`, `DataStore.query()`, `DataStore.delete()`
  - `DataStore.observe()`, `DataStore.observeQuery()`
  - `DataStore.start()`, `DataStore.stop()`, `DataStore.clear()`
- [ ] **Identify all models and relationships** -- List every DataStore model and its relationships (`hasMany`, `belongsTo`, `hasOne`, `manyToMany`). Note which models have custom primary keys or composite keys.
- [ ] **Write GraphQL operations for each model** -- Generate or manually write the GraphQL queries, mutations, and subscriptions for each model. Use the fragment pattern from [Prerequisites](./03-prerequisites.md#graphql-fragment-for-reusable-field-selection). Include `_version`, `_deleted`, and `_lastChangedAt` in all fragments.
- [ ] **Install Apollo Client** -- Run `npm install @apollo/client@^3.14.0 graphql`
- [ ] **Set up Apollo Client** -- Follow [Apollo Client Setup](./04-apollo-setup.md) and verify the connection works by running a simple list query against your AppSync endpoint
- [ ] **Set up Amplify subscription client** -- Create the `amplifyClient` using `generateClient()` as described in [Subscriptions](./05-subscriptions.md#setting-up-the-amplify-subscription-client)

<!-- ai:checklist:during-migration -->

## During Migration Checklist

Follow these steps while migrating each feature. Work through one model at a time to keep changes manageable and testable.

**For each DataStore model:**

- [ ] **Define a GraphQL fragment** -- Create a `ModelDetails` fragment including all business fields plus `_version`, `_deleted`, and `_lastChangedAt`
- [ ] **Define all GraphQL operations** -- Create list, get, create, update, and delete operations using the fragment
- [ ] **Migrate list queries** -- Replace `DataStore.query(Model)` with `useQuery(LIST_MODEL)` or `apolloClient.query()`. Filter out soft-deleted records (`_deleted: true`) in the results.
- [ ] **Migrate single-item queries** -- Replace `DataStore.query(Model, id)` with `useQuery(GET_MODEL, { variables: { id } })` or `apolloClient.query()`
- [ ] **Migrate creates** -- Replace `DataStore.save(new Model({...}))` with `useMutation(CREATE_MODEL)` or `apolloClient.mutate()`. Note: create mutations do not require `_version` in the input.
- [ ] **Migrate updates** -- Replace `DataStore.save(Model.copyOf(...))` with an update mutation. **Include `_version` from the latest query result in the mutation input.**
- [ ] **Migrate deletes** -- Replace `DataStore.delete(instance)` with a delete mutation. **Include both `id` and `_version` in the mutation input.**
- [ ] **Filter soft-deleted records** -- Add `_deleted` filtering to all list query results. Use the `filterDeleted` helper from [Prerequisites](./03-prerequisites.md#helper-filter-soft-deleted-records) or filter inline.
- [ ] **Migrate observe** -- Replace `DataStore.observe(Model)` with Amplify subscription + refetch pattern. See [Subscriptions](./05-subscriptions.md#pattern-1-refetch-on-subscription-event-recommended)
- [ ] **Migrate observeQuery** -- Replace `DataStore.observeQuery(Model)` with `useQuery(LIST_MODEL)` combined with subscription-triggered `refetch()`
- [ ] **Update error handling** -- Replace DataStore error patterns with Apollo's error link (global) and component-level error handling via `useQuery`/`useMutation` error states
- [ ] **Test each migrated operation** -- Verify create, read, update, delete, and real-time updates all work correctly for this model before moving to the next

**For predicates and filters:**

- [ ] **Migrate filter syntax** -- Convert DataStore predicates (`c => c.status.eq('ACTIVE')`) to GraphQL filter objects (`{ filter: { status: { eq: 'ACTIVE' } } }`)
- [ ] **Migrate sorting** -- Convert DataStore sort predicates to GraphQL `sortDirection` and `sortField` parameters
- [ ] **Migrate pagination** -- Convert DataStore `.page()` calls to GraphQL `nextToken` and `limit` parameters

<!-- ai:checklist:post-migration -->

## Post-Migration Checklist

Complete these steps after you have migrated all models and features. They verify that everything works correctly and clean up DataStore artifacts from your codebase.

**Verification:**

- [ ] **Verify all CRUD operations** -- Test create, read, update, and delete for every migrated model
- [ ] **Verify real-time updates** -- Confirm subscriptions fire and the UI updates for all three event types (create, update, delete) on every model
- [ ] **Verify authentication flow** -- Test sign-in, run authenticated operations, wait for token refresh (>60 minutes), and test sign-out
- [ ] **Verify sign-out cleanup** -- Confirm that `handleSignOut()` clears the Apollo cache and signs out from Amplify. See [Sign-Out and Cache Cleanup](./04-apollo-setup.md#sign-out-and-cache-cleanup)
- [ ] **Verify _version handling** -- Confirm that updates and deletes succeed without `ConditionalCheckFailedException` errors
- [ ] **Verify soft-delete filtering** -- Confirm that records deleted via the `deletePost` mutation no longer appear in list views (they are soft-deleted with `_deleted: true`)
- [ ] **Verify error handling** -- Trigger a network error and confirm the error link logs it. Trigger an auth error and confirm the app handles it gracefully.

**Cleanup:**

- [ ] **Remove DataStore imports** -- Delete all `import { DataStore } from 'aws-amplify/datastore'` statements from your codebase
- [ ] **Remove DataStore model files** -- Delete generated DataStore model files (typically in `src/models/` or wherever your project generated them)
- [ ] **Remove DataStore configuration** -- Remove any `DataStore.configure()`, `DataStore.start()`, and `DataStore.stop()` calls
- [ ] **Remove DataStore package** -- Verify no remaining DataStore imports exist, then remove `@aws-amplify/datastore` from your dependencies if it was installed separately
- [ ] **Run the app end-to-end** -- Complete a full user workflow (sign in, create data, read data, update data, delete data, verify real-time, sign out) to confirm nothing is broken
- [ ] **Monitor for errors post-deployment** -- Watch for `ConditionalCheckFailedException`, subscription disconnects, or auth errors in the first few days after deploying the migrated app

## Strategy-Specific Additions

The checklists above cover the foundation shared by all three strategies. Depending on which strategy you chose, you will have additional setup steps:

### Local Caching (Phase 3)

If you are following the Local Caching strategy, add these items to your migration plan:

- Set up `apollo3-cache-persist` for persistent cache storage
- Configure `fetchPolicy` for each query (e.g., `cache-and-network` for lists, `cache-first` for detail views)
- Implement optimistic updates for mutations using Apollo's `optimisticResponse` option
- Update the sign-out flow to purge the persistent cache in addition to clearing the in-memory cache

### Offline-First (Phase 4)

If you are following the Offline-First strategy, add these items to your migration plan:

- Set up Dexie.js as the local IndexedDB database
- Implement a mutation queue for offline writes
- Build a sync engine for delta and base synchronization
- Implement a conflict resolution handler using `_version` comparison
- Add network status detection to switch between online and offline modes
- Update the sign-out flow to clear both the local database and the mutation queue

---

**Next:** [CRUD Operations](./07-crud-operations.md) — Start migrating your DataStore operations to Apollo Client.

**Previous:** [Subscriptions](./05-subscriptions.md)

**Back to start:** [Introduction](./00-introduction.md)
