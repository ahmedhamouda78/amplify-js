# Migration Test Plan: Local Caching Strategy

This test plan provides step-by-step instructions for migrating the Gen 1 DataStore sample app to Apollo Client using the Local Caching strategy. This strategy extends the API Only migration with persistent cache, optimistic updates, and cache management.

**Strategy:** Local Caching -- Apollo Client with `apollo3-cache-persist` for cache persistence and optimistic updates. Cached data survives page refreshes. Writes still require network. Best for apps that want faster perceived performance and basic resilience to brief network interruptions.

**Sample app spec:** See [sample-app-spec.md](./sample-app-spec.md) for the full model schema, feature matrix, and component list.

---

## Prerequisites

- [ ] Gen 1 DataStore sample app running with all 28 features verified (see sample-app-spec.md verification checklist)
- [ ] Amplify Gen 2 backend deployed with same model schema
- [ ] `amplify_outputs.json` generated and accessible
- [ ] Cognito User Pool configured with at least 2 test users

### Dependencies to Install

```bash
npm install @apollo/client@^3.14.0 apollo3-cache-persist localforage
```

Packages:
- `@apollo/client` (3.14.x) -- Apollo Client with InMemoryCache, hooks, link chain
- `graphql` (16.x) -- GraphQL parser required by Apollo Client
- `apollo3-cache-persist` (0.15.x) -- persists Apollo's InMemoryCache to storage backends
- `localforage` (1.10.x) -- IndexedDB storage backend with automatic fallback

---

## Phases 1-7: Complete API Only Migration First

**Before proceeding to cache-specific phases, complete all steps from the API Only test plan.**

- [ ] Complete Phase 1: Apollo Client Setup (Steps 1-6) -- [test-plan-api-only.md](./test-plan-api-only.md#phase-1-apollo-client-setup)
- [ ] Complete Phase 2: CRUD Migration (Steps 7-12) -- [test-plan-api-only.md](./test-plan-api-only.md#phase-2-crud-migration)
- [ ] Complete Phase 3: Predicates and Queries (Steps 13-18) -- [test-plan-api-only.md](./test-plan-api-only.md#phase-3-predicates-and-queries)
- [ ] Complete Phase 4: Relationships (Steps 19-21) -- [test-plan-api-only.md](./test-plan-api-only.md#phase-4-relationships)
- [ ] Complete Phase 5: React Integration (Steps 22-24) -- [test-plan-api-only.md](./test-plan-api-only.md#phase-5-react-integration)
- [ ] Complete Phase 6: Real-Time (Steps 25-26) -- [test-plan-api-only.md](./test-plan-api-only.md#phase-6-real-time)
- [ ] Complete Phase 7: Auth (Steps 27-28) -- [test-plan-api-only.md](./test-plan-api-only.md#phase-7-auth)
- [ ] All API Only verification checklist items pass

---

## Phase 8: Cache Persistence

**Guide reference:** [guide/11-cache-persistence.md](../11-cache-persistence.md)

### Step 29: Configure localforage for IndexedDB

- [ ] Set up localforage with explicit IndexedDB driver

```typescript
import localforage from 'localforage';

localforage.config({
  driver: localforage.INDEXEDDB,
  name: 'myapp-apollo-cache',
  storeName: 'apollo_cache',
});
```

**Verify:** Open browser DevTools > Application > IndexedDB. Confirm `myapp-apollo-cache` database exists after app starts.

### Step 30: Set Up CachePersistor

- [ ] Replace bare `InMemoryCache` with `CachePersistor`-managed cache
- [ ] Configure max cache size

**Guide reference:** [guide/11-cache-persistence.md -- Setting Up CachePersistor](../11-cache-persistence.md)

```typescript
import { CachePersistor } from 'apollo3-cache-persist';
import { InMemoryCache } from '@apollo/client';

const cache = new InMemoryCache();

const persistor = new CachePersistor({
  cache,
  storage: localforage as any,
  maxSize: 1048576 * 5, // 5 MB
  debug: process.env.NODE_ENV === 'development',
});
```

**Verify:** CachePersistor initializes without errors. Debug output shows cache operations in development.

### Step 31: Gate App Startup on Cache Restoration

- [ ] Restore cache before rendering app
- [ ] Show loading indicator during restoration

**Guide reference:** [guide/11-cache-persistence.md -- Cache Restoration](../11-cache-persistence.md)

```typescript
function App() {
  const [cacheReady, setCacheReady] = useState(false);

  useEffect(() => {
    persistor.restore().then(() => setCacheReady(true));
  }, []);

  if (!cacheReady) return <div>Loading cached data...</div>;

  return (
    <ApolloProvider client={apolloClient}>
      {/* app content */}
    </ApolloProvider>
  );
}
```

**Verify:**
- [ ] On first load: "Loading cached data..." appears briefly, then app renders
- [ ] On subsequent loads: cached data appears immediately (no loading spinners for previously fetched queries)

### Step 32: Verify Cache Persistence Across Page Refresh

- [ ] Load the post list (triggers a LIST_POSTS query)
- [ ] Refresh the page (Ctrl+R or F5)
- [ ] Verify the post list renders immediately from cache before network response arrives

**Verification steps:**
1. Open Network tab in DevTools and set throttle to "Slow 3G"
2. Navigate to post list -- wait for posts to load
3. Refresh the page
4. Posts should appear immediately from cache (no loading spinner)
5. After network response arrives, data updates if there are changes

**Verify:** Posts display instantly after refresh. Network request still fires (cache-and-network policy) but UI does not wait for it.

### Step 33: Configure Fetch Policies

- [ ] Set `cache-and-network` as the default fetch policy (matches DataStore's always-fresh behavior)
- [ ] Verify queries read from cache first, then update from network

**Guide reference:** [guide/11-cache-persistence.md -- Fetch Policies](../11-cache-persistence.md)

```typescript
const apolloClient = new ApolloClient({
  link: from([authLink, retryLink, errorLink, httpLink]),
  cache,
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
    query: { fetchPolicy: 'cache-first' },
  },
});
```

**Verify:** Queries return cached data immediately, then update if server data differs.

---

## Phase 9: Optimistic Updates

**Guide reference:** [guide/12-optimistic-updates.md](../12-optimistic-updates.md)

### Step 34: Add Optimistic Create

- [ ] Add `optimisticResponse` to create mutation
- [ ] Add `update` function to insert into cache

```typescript
const [createPost] = useMutation(CREATE_POST, {
  optimisticResponse: {
    createPost: {
      __typename: 'Post',
      id: `temp-${Date.now()}`,
      title,
      content,
      status,
      rating,
      _version: 1,
      _deleted: null,
      _lastChangedAt: Date.now(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      owner: currentUser,
    },
  },
  update(cache, { data }) {
    const existing = cache.readQuery({ query: LIST_POSTS });
    if (existing && data?.createPost) {
      cache.updateQuery({ query: LIST_POSTS }, (prev) => ({
        listPosts: {
          ...prev.listPosts,
          items: [data.createPost, ...prev.listPosts.items],
        },
      }));
    }
  },
});
```

**Verify:**
- [ ] New post appears in list instantly (before server responds)
- [ ] After server responds, temp ID is replaced with real ID
- [ ] No duplicate entries in the list

### Step 35: Add Optimistic Update

- [ ] Add `optimisticResponse` to update mutation with incremented `_version`

```typescript
const [updatePost] = useMutation(UPDATE_POST, {
  optimisticResponse: {
    updatePost: {
      __typename: 'Post',
      ...existingPost,
      title: newTitle,
      _version: existingPost._version + 1,
      updatedAt: new Date().toISOString(),
    },
  },
});
```

**Verify:**
- [ ] Title change appears instantly in UI
- [ ] After server responds, data matches (or corrects if server had different _version)

### Step 36: Add Optimistic Delete

- [ ] Add `optimisticResponse` with `_deleted: true` to delete mutation
- [ ] Add `update` function to remove from cache

```typescript
const [deletePost] = useMutation(DELETE_POST, {
  optimisticResponse: {
    deletePost: {
      __typename: 'Post',
      ...existingPost,
      _deleted: true,
      _version: existingPost._version + 1,
    },
  },
  update(cache, { data }) {
    cache.updateQuery({ query: LIST_POSTS }, (prev) => ({
      listPosts: {
        ...prev.listPosts,
        items: prev.listPosts.items.filter(
          (p: any) => p.id !== data?.deletePost?.id
        ),
      },
    }));
  },
});
```

**Verify:**
- [ ] Post disappears from list instantly
- [ ] After server responds, post stays removed

### Step 37: Verify Automatic Rollback on Error

- [ ] Intentionally send a mutation with wrong `_version` to trigger a conflict
- [ ] Verify Apollo automatically rolls back the optimistic update

**Verification steps:**
1. Open the post detail page for a post
2. In a separate tab or DynamoDB console, update the same post (this changes the server's `_version`)
3. In the original tab, try to update the post
4. The optimistic update shows instantly, then rolls back when the server returns a ConflictUnhandled error
5. The UI reverts to the server's current state

**Verify:** Optimistic update rolls back. Error is logged. UI shows server state.

---

## Phase 10: Cache Management

**Guide reference:** [guide/12-optimistic-updates.md -- typePolicies](../12-optimistic-updates.md)

### Step 38: Configure typePolicies for Pagination Merge

- [ ] Add `typePolicies` to `InMemoryCache` to merge paginated results

**Guide reference:** [guide/12-optimistic-updates.md -- typePolicies](../12-optimistic-updates.md)

```typescript
const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        listPosts: {
          keyArgs: ['filter', 'sortDirection'],
          merge(existing, incoming) {
            if (!existing) return incoming;
            return {
              ...incoming,
              items: [...existing.items, ...incoming.items],
            };
          },
          read(existing) {
            if (!existing) return existing;
            return {
              ...existing,
              items: existing.items.filter(
                (ref: any) => {
                  const deleted = readField('_deleted', ref);
                  return !deleted;
                }
              ),
            };
          },
        },
      },
    },
  },
});
```

**Verify:** Paginated queries merge correctly. `_deleted` records filtered at cache level. No duplicates after fetch-more.

### Step 39: Test Cache Eviction

- [ ] Monitor cache size via `persistor.getSize()`
- [ ] Verify eviction when cache exceeds `maxSize`

```typescript
const cacheSize = await persistor.getSize();
console.log(`Cache size: ${cacheSize} bytes`);
```

**Verify:** `getSize()` returns reasonable value. Cache does not grow unbounded.

### Step 40: Test Cache Size After Extended Use

- [ ] Perform 50+ CRUD operations
- [ ] Check that cache size stays within the configured 5MB limit
- [ ] Verify `persistor.getSize()` reflects actual IndexedDB usage

**Verify:** Cache size remains under 5MB. Older entries are evicted when limit is reached.

---

## Phase 11: Sign-Out Cache Cleanup

**Guide reference:** [guide/11-cache-persistence.md -- Sign-Out](../11-cache-persistence.md)

### Step 41: Implement Pause-ClearStore-Purge-SignOut Order

- [ ] Replace `DataStore.clear()` + `Auth.signOut()` with the correct Apollo cleanup sequence

**Before (DataStore):**
```typescript
const handleSignOut = async () => {
  await DataStore.clear();
  await Auth.signOut();
};
```

**After (Apollo Client with Cache Persistence):**
```typescript
import { signOut } from 'aws-amplify/auth';

const handleSignOut = async () => {
  // 1. Stop persisting to IndexedDB
  persistor.pause();
  // 2. Clear Apollo's in-memory cache
  await apolloClient.clearStore();
  // 3. Delete persisted cache from IndexedDB
  await persistor.purge();
  // 4. Sign out
  await signOut();
};
```

**Verify:**
- [ ] Sign out completes without errors
- [ ] Open DevTools > Application > IndexedDB: `myapp-apollo-cache` is empty after sign-out
- [ ] Sign in as a different user: no data from previous user visible
- [ ] Cache persistence resumes after new user signs in

### Step 42: Verify No Cross-User Data Leakage

- [ ] Sign in as User A, create 3 posts
- [ ] Sign out
- [ ] Sign in as User B
- [ ] Verify User B sees zero of User A's posts
- [ ] Check IndexedDB: no User A data present

**Verify:** Complete isolation between user sessions. No stale data leakage.

---

## Final Verification Checklist

Complete this checklist after all migration steps. Every item must pass. This extends the API Only checklist with cache-specific items.

### API Only Features (all must still pass)
- [ ] All CRUD operations work (create, query, list, update, delete, batch delete)
- [ ] All 13 predicate operators return correct results
- [ ] Pagination and sorting work
- [ ] All relationship types load correctly (hasMany, belongsTo, manyToMany)
- [ ] Real-time subscriptions fire on mutations
- [ ] Owner-based auth scopes data to current user
- [ ] No DataStore imports remain (`grep -r "DataStore" src/` returns zero results)

### Cache Persistence (Phase 8)
- [ ] Cache persists across page refresh
- [ ] Posts appear instantly on page load (from cache)
- [ ] Network requests still fire to update stale data
- [ ] IndexedDB contains cache data (visible in DevTools)

### Optimistic Updates (Phase 9)
- [ ] Create shows new post instantly (before server response)
- [ ] Update shows changes instantly
- [ ] Delete removes post instantly
- [ ] Failed mutation triggers automatic rollback
- [ ] No stale or duplicate data after rollback

### Cache Management (Phase 10)
- [ ] Paginated results merge correctly in cache
- [ ] `_deleted` records filtered at cache level
- [ ] Cache size stays within 5MB limit
- [ ] `persistor.getSize()` returns accurate value

### Sign-Out (Phase 11)
- [ ] Pause-clearStore-purge-signOut order executes without errors
- [ ] IndexedDB is empty after sign-out
- [ ] No cross-user data leakage
- [ ] Cache persistence resumes for new user session
