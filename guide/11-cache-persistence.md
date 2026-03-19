<!-- ai:cache-persistence -->

# Cache Persistence

The [Apollo Client Setup](./04-apollo-setup.md) page gave you a working Apollo Client with auth, error handling, retry logic, and `new InMemoryCache()`. That cache lives in memory only -- every time the user refreshes the page or reopens the app, every query starts from scratch with a network request and a loading spinner.

This page adds persistent caching on top of that foundation. You will configure Apollo's cache to survive page refreshes by persisting it to IndexedDB, gate your app startup on cache restoration so queries see cached data immediately, choose the right fetch policy for each query, and manage cache size with eviction and purge on sign-out.

DataStore cached everything automatically and transparently. Apollo gives you explicit control over what gets cached, when it syncs with the server, and how you clean it up. More setup, but no surprises.

**What this page covers:**

1. **Persistent cache** -- save InMemoryCache to IndexedDB so it survives page refreshes
2. **Cache restoration** -- gate app rendering so queries see cached data on cold start
3. **Fetch policies** -- control whether queries read from cache, network, or both
4. **Cache management** -- monitor size, evict entries, purge on sign-out

<!-- ai:cache-install -->

## Installation

Install the persistence and storage libraries. `@apollo/client` is already installed from [Apollo Client Setup](./04-apollo-setup.md).

```bash
npm install apollo3-cache-persist localforage
```

- **apollo3-cache-persist** (v0.15.0) -- persists Apollo's `InMemoryCache` to a storage backend. Peer dependency: `@apollo/client ^3.7.17`.
- **localforage** (v1.10.0) -- provides an IndexedDB storage backend with automatic fallback to WebSQL and localStorage. IndexedDB is async and has no practical size limit, unlike localStorage's 5MB cap.

<!-- ai:cache-persistor-setup -->

## Setting Up CachePersistor with IndexedDB

### Configure localforage

First, configure `localforage` to use IndexedDB explicitly and give your database a recognizable name:

```typescript
import localforage from 'localforage';

localforage.config({
  driver: localforage.INDEXEDDB,
  name: 'myapp-apollo-cache',
  storeName: 'apollo_cache',
});
```

### Configure InMemoryCache

Enhance the `InMemoryCache` from Phase 1 with a placeholder for `typePolicies`. The full `typePolicies` configuration (pagination merge, soft-delete filtering) is covered in [Optimistic Updates](./12-optimistic-updates.md).

```typescript
import { InMemoryCache } from '@apollo/client';

const cache = new InMemoryCache({
  typePolicies: {
    // Configure typePolicies for pagination and normalization.
    // See guide/12-optimistic-updates.md for full configuration.
  },
});
```

### Create the CachePersistor

```typescript
import { CachePersistor, LocalForageWrapper } from 'apollo3-cache-persist';

export const persistor = new CachePersistor({
  cache,
  storage: new LocalForageWrapper(localforage),
  maxSize: 1048576 * 2, // 2MB -- increase if your app caches large datasets
  debug: process.env.NODE_ENV === 'development',
  trigger: 'write',
  key: 'apollo-cache-v1', // Bump when your GraphQL schema changes
});
```

### Configuration Options

| Option | Default | Purpose |
|--------|---------|---------|
| `cache` | (required) | The `InMemoryCache` instance to persist |
| `storage` | (required) | Storage wrapper -- use `LocalForageWrapper` for IndexedDB |
| `maxSize` | `1048576` (1MB) | Max persisted size in bytes. Set `false` to disable the limit |
| `trigger` | `'write'` | When to persist: `'write'` (on every cache write), `'background'` (on tab visibility change) |
| `debounce` | `1000` | Milliseconds to wait between persist writes |
| `key` | `'apollo-cache-persist'` | Storage key identifier. Version this to invalidate stale caches |
| `serialize` | `true` | Whether to JSON-serialize before writing. Set `false` if your storage handles serialization |
| `debug` | `false` | Log persistence activity to the console |

### Why CachePersistor Instead of persistCache

`apollo3-cache-persist` exports two APIs: the `CachePersistor` class and a `persistCache` convenience function. **Use `CachePersistor`.**

`persistCache` is a one-liner that creates a `CachePersistor` internally and calls `restore()` immediately. But it does not return the persistor instance, which means you cannot call:

- **`purge()`** -- needed to clear IndexedDB on sign-out
- **`pause()` / `resume()`** -- needed to stop persistence during sensitive operations
- **`getSize()`** -- needed to monitor cache size
- **`persist()`** -- needed to force an immediate write

For any production app with sign-out, cache management, or debugging needs, `CachePersistor` is the right choice.

### Enhanced Apollo Client Setup

Here is the complete enhanced `src/apolloClient.ts` that builds on the [Apollo Client Setup](./04-apollo-setup.md). The link chain (retry, error, auth, HTTP) is unchanged -- only the cache configuration, persistor, and default fetch policy are new.

```typescript
// src/apolloClient.ts -- Enhanced with cache persistence
import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  from,
} from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { RetryLink } from '@apollo/client/link/retry';
import { CachePersistor, LocalForageWrapper } from 'apollo3-cache-persist';
import localforage from 'localforage';
import { fetchAuthSession } from 'aws-amplify/auth';
import outputs from '../amplify_outputs.json';

// --- Configure IndexedDB via localforage ---
localforage.config({
  driver: localforage.INDEXEDDB,
  name: 'myapp-apollo-cache',
  storeName: 'apollo_cache',
});

// --- InMemoryCache with typePolicies ---
const cache = new InMemoryCache({
  typePolicies: {
    // Configure typePolicies for pagination and normalization.
    // See guide/12-optimistic-updates.md for full configuration.
  },
});

// --- Cache Persistor ---
export const persistor = new CachePersistor({
  cache,
  storage: new LocalForageWrapper(localforage),
  maxSize: 1048576 * 2, // 2MB
  debug: process.env.NODE_ENV === 'development',
  trigger: 'write',
  key: 'apollo-cache-v1', // Bump when schema changes
});

// --- HTTP Link ---
const httpLink = createHttpLink({
  uri: outputs.data.url,
});

// --- Auth Link ---
const authLink = setContext(async (_, { headers }) => {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    return {
      headers: {
        ...headers,
        authorization: token || '',
      },
    };
  } catch (error) {
    console.error('Auth session error:', error);
    return { headers };
  }
});

// --- Error Link ---
const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    for (const { message, locations, path } of graphQLErrors) {
      console.error(
        `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`
      );
    }
  }
  if (networkError) {
    console.error(`[Network error]: ${networkError}`);
  }
});

// --- Retry Link ---
const retryLink = new RetryLink({
  delay: { initial: 300, max: 5000, jitter: true },
  attempts: { max: 3, retryIf: (error) => !!error },
});

// --- Apollo Client ---
export const apolloClient = new ApolloClient({
  link: from([retryLink, errorLink, authLink, httpLink]),
  cache,
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
    },
    query: {
      fetchPolicy: 'cache-and-network',
    },
  },
});
```

The key differences from the Phase 1 setup:

- `InMemoryCache` is extracted into a `cache` variable (so the persistor can reference it)
- `CachePersistor` is created and exported (for use in sign-out and app startup)
- `defaultOptions` sets `cache-and-network` as the default fetch policy (see [Fetch Policy Patterns](#fetch-policy-patterns) below)

<!-- ai:cache-restore -->

## Cache Restoration on App Startup

### The Problem

Queries that fire before `persistor.restore()` completes see an empty `InMemoryCache`. This means every cold start triggers network requests and shows loading spinners -- even though cached data is sitting in IndexedDB waiting to be loaded.

### The Solution: Gate App Rendering

Call `await persistor.restore()` before rendering any component that uses Apollo queries. The simplest pattern is a loading gate in your root `App` component:

```typescript
// src/App.tsx
import { useState, useEffect } from 'react';
import { ApolloProvider } from '@apollo/client';
import { apolloClient, persistor } from './apolloClient';

function App() {
  const [cacheReady, setCacheReady] = useState(false);

  useEffect(() => {
    persistor.restore().then(() => setCacheReady(true));
  }, []);

  if (!cacheReady) {
    return <div>Loading...</div>; // Or your splash screen component
  }

  return (
    <ApolloProvider client={apolloClient}>
      {/* Your app components */}
    </ApolloProvider>
  );
}

export default App;
```

Once `cacheReady` flips to `true`, every `useQuery` hook inside `ApolloProvider` will find the restored cache data and render immediately -- no network request needed for data that was cached in a previous session.

### DataStore Comparison

DataStore also had async startup (`DataStore.start()`), but it was implicit -- queries waited internally for the local store to be ready. With Apollo, you must gate rendering explicitly. The upside is that you control exactly what the user sees during initialization (a splash screen, skeleton UI, or nothing at all).

> **Warning:** Not gating renders on cache restoration is the most common persistence mistake. The symptom is loading spinners on every app launch despite having megabytes of cached data in IndexedDB. If your app shows a brief flash of loading state before data appears, check that `persistor.restore()` completes before your first query runs.

<!-- ai:fetch-policies -->

## Fetch Policy Patterns

Fetch policies control where Apollo reads data from -- cache, network, or both -- on a per-query basis. With a persistent cache, the right fetch policy determines whether your users see instant cached data or wait for a network round trip.

### All Six Fetch Policies

| Policy | Cache Read | Network Fetch | Best For |
|--------|-----------|---------------|----------|
| `cache-first` | Yes (if data exists) | Only on cache miss | Data that rarely changes. Shows cached data with no network request. |
| `cache-and-network` | Yes (immediate) | Always (updates cache after) | **Recommended default for migration.** Shows cached data instantly, then updates from server in background. |
| `network-only` | No | Always | Force fresh data. Use after a conflict error or when data must be authoritative. |
| `cache-only` | Yes | Never | True offline reads. Use when you know data is cached and want zero network activity. |
| `no-cache` | No | Always | Bypass cache entirely. Query results are not stored. Use for one-off sensitive reads. |
| `standby` | Yes | Only on manual `refetch()` | Inactive queries that update only when explicitly told. Useful for background or low-priority data. |

### DataStore Migration Mapping

This table maps common DataStore patterns to the closest Apollo fetch policy:

| DataStore Pattern | Recommended fetchPolicy | Why |
|-------------------|------------------------|-----|
| `DataStore.query(Model)` (online) | `cache-and-network` | Returns cached data immediately, then updates from server |
| `DataStore.query(Model)` (offline) | `cache-only` | Reads from persistent cache with no network attempt |
| `DataStore.observeQuery()` | `cache-and-network` with `useQuery` | Shows cache first, updates on server response, re-renders on cache changes |
| First load / cold start | `cache-first` | Shows persisted data instantly without a network request |
| After conflict error | `network-only` | Forces fresh data from server to resolve stale state |

### Why cache-and-network Is the Recommended Default

DataStore always showed locally cached data immediately and then synced with the server in the background. `cache-and-network` is the closest Apollo equivalent:

1. The query reads from cache first (instant render, no loading spinner)
2. Apollo fires a network request in the background
3. When the response arrives, the cache updates and the component re-renders with fresh data

This matches DataStore's "always fresh" behavior. Your users see data immediately and get silent updates without any extra code.

The enhanced `apolloClient` setup above already sets `cache-and-network` as the default. You can override it per query when needed:

```typescript
// Override for a specific query
const { data, loading } = useQuery(GET_SENSITIVE_DATA, {
  fetchPolicy: 'network-only', // Always fetch fresh for this query
});
```

### A Note on nextFetchPolicy

After the initial fetch, Apollo switches to a different policy for subsequent cache updates. By default, `cache-and-network` queries use `cache-first` for subsequent renders -- meaning Apollo will not fire another network request when the component re-renders (e.g., after a state change). The network request only happens on the initial mount. This is usually the behavior you want.

If you need every render to trigger a network request (rare), you can set `nextFetchPolicy: 'cache-and-network'` on the query.

<!-- ai:cache-signout -->

## Enhanced Sign-Out with Cache Purge

The [Apollo Client Setup](./04-apollo-setup.md#sign-out-and-cache-cleanup) sign-out function clears the in-memory cache with `clearStore()`. With cache persistence enabled, you must also purge the IndexedDB store -- otherwise the next user who signs in will see the previous user's cached data restored from disk.

```typescript
// src/auth.ts -- Enhanced with cache persistence purge
import { signOut } from 'aws-amplify/auth';
import { apolloClient, persistor } from './apolloClient';

export async function handleSignOut() {
  // 1. Pause persistence so clearStore doesn't trigger a write
  persistor.pause();

  // 2. Clear in-memory cache and cancel active queries
  await apolloClient.clearStore();

  // 3. Purge persisted cache from IndexedDB
  await persistor.purge();

  // 4. Sign out from Amplify (clears Cognito tokens)
  await signOut();
}
```

**Why this order matters:**

1. **Pause first** -- `clearStore()` modifies the cache, which would trigger the persistor to write an empty cache to IndexedDB. Pausing prevents that unnecessary write.
2. **Clear in-memory cache** -- removes all cached data from memory and cancels active queries so no stale data is visible.
3. **Purge IndexedDB** -- deletes the persisted cache from disk so the next user starts fresh.
4. **Sign out last** -- clears Cognito tokens. If you sign out first, `clearStore()` may trigger refetches that fail because the auth token is already invalidated.

> **Note:** The `persistor.resume()` call is intentionally omitted. After sign-out, the user typically navigates to a sign-in screen. When they sign back in and the app re-initializes, `persistor.restore()` will resume normal persistence. If your app stays mounted after sign-out and needs to continue caching for a public view, call `persistor.resume()` after `signOut()`.

<!-- ai:cache-management -->

## Cache Size Management and Eviction

### Monitoring Cache Size

Use `persistor.getSize()` to check how much data is stored in IndexedDB:

```typescript
async function logCacheSize() {
  const sizeInBytes = await persistor.getSize();
  if (sizeInBytes !== null) {
    console.log(`Cache size: ${(sizeInBytes / 1024).toFixed(1)} KB`);
  }
}
```

This is useful for debugging and for deciding whether to increase `maxSize`.

### maxSize Behavior

When the serialized cache exceeds `maxSize`, the persistor **stops writing to IndexedDB silently**. The in-memory cache continues to work normally -- queries and mutations are unaffected. But new data will not be persisted, so a page refresh will lose recent cache additions.

**Choosing an appropriate maxSize:**

- **2MB** -- good default for most apps with moderate data
- **5MB** -- for apps with large lists or many cached queries
- **`false`** -- disables the limit entirely. Use with caution on mobile devices where storage is more constrained.

Enable `debug: true` during development to see console warnings when the cache approaches the limit.

### Evicting Specific Objects

Remove a specific object from the cache using `cache.evict()`:

```typescript
import { apolloClient } from './apolloClient';

const cache = apolloClient.cache;

// Evict a specific post by its cache ID
cache.evict({ id: cache.identify({ __typename: 'Post', id: postId })! });

// Evict a specific field from an object (e.g., remove cached comments)
cache.evict({
  id: cache.identify({ __typename: 'Post', id: postId })!,
  fieldName: 'comments',
});

// Always run gc() after evict() to clean up dangling references
cache.gc();
```

`cache.identify()` returns the normalized cache key (e.g., `"Post:abc123"`). Using `identify` instead of manually constructing the ID string means your code stays correct even if you customize `keyFields` in `typePolicies`.

### Garbage Collection

`cache.gc()` removes unreachable objects from the cache -- objects that are no longer referenced by any query result or other cached object.

```typescript
// Standard garbage collection
cache.gc();

// With memory optimization (releases internal result cache memory)
// Temporarily slower reads after this call, but frees more memory
cache.gc({ resetResultCache: true });
```

**Always call `gc()` after `evict()`.** Evicting an object may leave dangling references in other cached objects. Garbage collection cleans those up.

### Schema Version Strategy

When your GraphQL schema changes (fields added, removed, or renamed), the persisted cache may contain objects with the old shape. This can cause TypeErrors, missing fields, or unexpected null values.

The simplest fix: **bump the `key` option** on your `CachePersistor`:

```typescript
export const persistor = new CachePersistor({
  cache,
  storage: new LocalForageWrapper(localforage),
  key: 'apollo-cache-v2', // Was 'apollo-cache-v1'
  // ...other options
});
```

When the key changes, `persistor.restore()` finds no data under the new key and starts with an empty cache. The old data under the previous key is abandoned (and eventually cleaned up by the browser's storage management).

**The trade-off:** One cold start (all queries hit the network) in exchange for zero cache migration code. For most apps, this is the right choice. If you need seamless cache migration across schema changes, you would need to read the old cache, transform it, and write it under the new key -- but that is rarely worth the complexity.

<!-- ai:cache-troubleshooting -->

## Troubleshooting

### Cache Not Restored Before Queries Run

**Symptoms:** Every page load shows loading spinners briefly, then data appears. Cache size is greater than zero but queries still hit the network on every cold start.

**Cause:** Your first `useQuery` fires before `persistor.restore()` completes. The query sees an empty `InMemoryCache` and triggers a network request.

**Fix:** Gate your app rendering on cache restoration. Wrap your `ApolloProvider` in a loading gate that waits for `persistor.restore()` to complete before rendering children. See [Cache Restoration on App Startup](#cache-restoration-on-app-startup).

### Cache Exceeds maxSize Silently

**Symptoms:** Recent data is not persisted across page refreshes, but older cached data still appears. No errors in the console (unless `debug: true` is set).

**Cause:** The serialized cache has exceeded the `maxSize` limit. The persistor stops writing new data to IndexedDB but the in-memory cache continues working normally.

**Fix:** Increase `maxSize` to accommodate your app's data volume (2-5MB is typical). Enable `debug: true` to see when writes are skipped. Use `persistor.getSize()` to monitor actual cache size. Consider evicting large or infrequently-used entries with `cache.evict()`.

### Stale Cache After Schema Changes

**Symptoms:** App crashes with TypeErrors reading cached data, or fields show as null or undefined after deploying a schema change.

**Cause:** The persisted cache contains objects with the old schema shape. Apollo tries to read fields that no longer exist or have changed type.

**Fix:** Include a version in the `key` option (e.g., `'apollo-cache-v1'`). When the schema changes, bump the version to `'apollo-cache-v2'`. This abandons the old cache and starts fresh. See [Schema Version Strategy](#schema-version-strategy).

---

**Previous:** [React Integration](./10-react-integration.md)

**Next:** [Optimistic Updates](./12-optimistic-updates.md)
