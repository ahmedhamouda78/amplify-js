# Migration Test Plan: Offline-First Strategy

This test plan provides step-by-step instructions for migrating the Gen 1 DataStore sample app using the Offline-First strategy. This is an independent plan -- it does NOT extend the API Only plan. The Offline-First strategy replaces the Local Caching approach entirely (per Phase 4 decision: "Phase 4 replaces Phase 3 entirely").

**Strategy:** Offline-First -- Dexie.js as local IndexedDB database (source of truth), custom mutation queue for offline writes, sync engine for delta/base synchronization, and manual conflict resolution using `_version` tracking. This is the closest equivalent to DataStore's complete feature set.

**Sample app spec:** See [sample-app-spec.md](./sample-app-spec.md) for the full model schema, feature matrix, and component list.

---

## Prerequisites

- [ ] Gen 1 DataStore sample app running with all 28 features verified (see sample-app-spec.md verification checklist)
- [ ] Amplify Gen 2 backend deployed with same model schema
- [ ] `amplify_outputs.json` generated and accessible
- [ ] Cognito User Pool configured with at least 2 test users
- [ ] Conflict resolution enabled in backend (`dataStoreConfiguration` in `amplify_outputs.json`)

### Dependencies to Install

```bash
npm install @apollo/client@^3.14.0 dexie dexie-react-hooks
```

Packages:
- `@apollo/client` (3.14.x) -- Apollo Client for queries, mutations, and transport
- `graphql` (16.x) -- GraphQL parser required by Apollo Client
- `dexie` (4.x) -- Promise-based IndexedDB wrapper
- `dexie-react-hooks` (1.x) -- React hooks for Dexie.js live queries

---

## Phase 1: Apollo Client Setup

**Guide reference:** [guide/04-apollo-setup.md](../04-apollo-setup.md), [guide/05-subscriptions.md](../05-subscriptions.md)

### Step 1: Create Apollo Client with Link Chain

- [ ] Create `src/apolloClient.ts` with HTTP link, auth link, error link, retry link
- [ ] Configure `InMemoryCache` (basic -- Dexie is the source of truth, not Apollo cache)
- [ ] Wrap app with `ApolloProvider`

**Guide reference:** [guide/04-apollo-setup.md](../04-apollo-setup.md)

```typescript
import { ApolloClient, InMemoryCache, from, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { fetchAuthSession } from 'aws-amplify/auth';
import outputs from '../amplify_outputs.json';

const httpLink = createHttpLink({ uri: outputs.data.url });

const authLink = setContext(async (_, { headers }) => {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  return { headers: { ...headers, authorization: token || '' } };
});

export const apolloClient = new ApolloClient({
  link: from([authLink, httpLink]),
  cache: new InMemoryCache(),
});
```

**Verify:** Apollo Client connects to AppSync endpoint. Auth token is injected.

### Step 2: Set Up Amplify Subscription Client

- [ ] Create Amplify `generateClient()` for subscriptions

```typescript
import { generateClient } from 'aws-amplify/api';
export const amplifyClient = generateClient();
```

**Verify:** Client created. Will be tested in Phase 5 (sync engine).

### Step 3: Define GraphQL Operations

- [ ] Create all query, mutation, and subscription definitions
- [ ] Include sync queries (`syncPosts`, `syncComments`, etc.) with `$lastSync: AWSTimestamp` parameter
- [ ] Include subscription definitions for real-time sync

**Guide reference:** [guide/15-sync-engine.md -- Sync Query GraphQL Definitions](../15-sync-engine.md)

```typescript
const SYNC_POSTS = gql`
  query SyncPosts($lastSync: AWSTimestamp, $limit: Int, $nextToken: String) {
    syncPosts(lastSync: $lastSync, limit: $limit, nextToken: $nextToken) {
      items {
        id
        title
        content
        status
        rating
        _version
        _deleted
        _lastChangedAt
        createdAt
        updatedAt
        owner
      }
      nextToken
      startedAt
    }
  }
`;
```

**Verify:** Sync queries include `$lastSync` parameter and return `startedAt`. Regular CRUD operations also defined.

---

## Phase 2: Dexie.js Local Database

**Guide reference:** [guide/13-offline-architecture.md](../13-offline-architecture.md)

### Step 4: Create Dexie Database Schema

- [ ] Create `src/offline/db.ts` with typed Dexie database
- [ ] Define tables for Post, Comment, Author, Tag, PostTag
- [ ] Define internal tables: `_mutationQueue`, `_syncMetadata`
- [ ] Set up indexes matching query patterns

**Guide reference:** [guide/13-offline-architecture.md -- Setting Up Dexie.js](../13-offline-architecture.md)

```typescript
import Dexie, { Table } from 'dexie';

interface LocalPost {
  id: string;
  title: string;
  content: string;
  status: string;
  rating?: number;
  _version: number;
  _deleted: boolean;
  _lastChangedAt: number;
  createdAt: string;
  updatedAt: string;
  owner: string;
}

interface MutationQueueEntry {
  id?: number;
  modelName: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  data: Record<string, any>;
  createdAt: number;
}

interface SyncMetadata {
  modelName: string;
  lastSync: number | null;
  lastFullSync: number | null;
}

class OfflineDatabase extends Dexie {
  posts!: Table<LocalPost, string>;
  comments!: Table<any, string>;
  authors!: Table<any, string>;
  tags!: Table<any, string>;
  postTags!: Table<any, string>;
  _mutationQueue!: Table<MutationQueueEntry, number>;
  _syncMetadata!: Table<SyncMetadata, string>;

  constructor() {
    super('myapp-offline');
    this.version(1).stores({
      posts: 'id, status, rating, owner, _lastChangedAt',
      comments: 'id, postId, owner, _lastChangedAt',
      authors: 'id, email, owner, _lastChangedAt',
      tags: 'id, label',
      postTags: 'id, postId, tagId',
      _mutationQueue: '++id, modelName, createdAt',
      _syncMetadata: 'modelName',
    });
  }
}

export const db = new OfflineDatabase();
```

**Verify:** Open DevTools > Application > IndexedDB. Confirm `myapp-offline` database with all tables. Tables have correct indexes.

### Step 5: Verify Local CRUD Without Network

- [ ] Simulate offline: DevTools > Network > Offline checkbox
- [ ] Create a post locally in Dexie
- [ ] Query posts from Dexie
- [ ] Update a post in Dexie
- [ ] Delete a post from Dexie
- [ ] Go back online

```typescript
// Local CRUD (no network needed)
await db.posts.put({
  id: crypto.randomUUID(),
  title: 'Offline Post',
  content: 'Created while offline',
  status: 'DRAFT',
  _version: 1,
  _deleted: false,
  _lastChangedAt: Date.now(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  owner: currentUser,
});

const allPosts = await db.posts.where('_deleted').equals(0).toArray();
```

**Verify:** All local CRUD operations succeed while offline. Data persists in IndexedDB. No network requests attempted.

### Step 6: Set Up Dexie React Hooks

- [ ] Use `useLiveQuery` from `dexie-react-hooks` for reactive UI
- [ ] Verify UI updates when Dexie data changes

```typescript
import { useLiveQuery } from 'dexie-react-hooks';

function PostList() {
  const posts = useLiveQuery(
    () => db.posts.where('_deleted').equals(0).toArray()
  );
  // posts updates automatically when db.posts changes
}
```

**Verify:** Adding a record to Dexie automatically updates the React component. No manual state management needed.

---

## Phase 3: Mutation Queue

**Guide reference:** [guide/14-mutation-queue.md](../14-mutation-queue.md)

### Step 7: Implement enqueueMutation

- [ ] Create `src/offline/mutationQueue.ts`
- [ ] Implement `enqueueMutation()` with deduplication logic
- [ ] Dedup rules: CREATE+UPDATE merges, CREATE+DELETE cancels, UPDATE+any replaces

**Guide reference:** [guide/14-mutation-queue.md -- Enqueueing Mutations](../14-mutation-queue.md)

**Verify:**
- [ ] Enqueueing a mutation adds entry to `_mutationQueue` table
- [ ] Enqueueing UPDATE for a record with pending CREATE merges data into CREATE
- [ ] Enqueueing DELETE for a record with pending CREATE removes the CREATE entirely

### Step 8: Implement processMutationQueue

- [ ] Create queue processor that drains mutations in FIFO order
- [ ] Send each mutation to AppSync via Apollo Client
- [ ] On success: dequeue and sync `_version` to remaining entries for same record
- [ ] On failure: retry with exponential backoff (max 3 attempts)

**Guide reference:** [guide/14-mutation-queue.md -- Processing the Queue](../14-mutation-queue.md)

```typescript
async function processMutationQueue(): Promise<void> {
  const head = await db._mutationQueue.orderBy('createdAt').first();
  if (!head) return; // Queue empty

  try {
    const result = await apolloClient.mutate({
      mutation: getMutationForEntry(head),
      variables: { input: head.data },
    });

    // Dequeue and propagate _version
    await dequeueAndSyncVersions(head, result.data);

    // Process next entry
    await processMutationQueue();
  } catch (error) {
    // Handle conflict or network error
    console.error('Mutation failed:', error);
  }
}
```

**Verify:**
- [ ] Queue processes in FIFO order (oldest first)
- [ ] After successful mutation, `_version` from server is propagated to remaining queue entries for same record
- [ ] Failed mutations are retried with backoff
- [ ] Queue empties completely when all mutations succeed

### Step 9: Verify Queue Operations While Offline

- [ ] Go offline (DevTools > Network > Offline)
- [ ] Perform 5 CRUD operations (create 2 posts, update 1, delete 1, create 1 comment)
- [ ] Verify all 5 operations are in the mutation queue
- [ ] Verify deduplication: update the same post twice -- only 1 queue entry for that post
- [ ] Go online
- [ ] Verify queue drains and all operations reach AppSync

**Verification steps:**
1. Check DevTools > Network > Offline
2. Create Post A, Create Post B
3. Update Post A title
4. Delete Post B
5. Create Comment on existing post
6. Open DevTools > Application > IndexedDB > `_mutationQueue` table
7. Verify entries: Post A CREATE (with merged update data), Post B CREATE+DELETE cancelled (net 0 entries), Comment CREATE
8. Uncheck Offline in Network tab
9. Watch queue drain (check `_mutationQueue` table empties)
10. Verify all records in DynamoDB match expected state

**Verify:** Queue deduplication works correctly. All operations sync to server on reconnect. No duplicate records in DynamoDB.

---

## Phase 4: Connectivity Monitoring

**Guide reference:** [guide/14-mutation-queue.md -- Connectivity Monitoring](../14-mutation-queue.md)

### Step 10: Implement Connectivity Monitor

- [ ] Create `src/offline/connectivity.ts`
- [ ] Use `navigator.onLine` + `online`/`offline` events
- [ ] Add 5-second stabilization delay before triggering state change (matches DataStore behavior)

**Guide reference:** [guide/14-mutation-queue.md -- Connectivity Monitoring](../14-mutation-queue.md)

```typescript
class ConnectivityMonitor {
  private isOnline: boolean;
  private stabilizationDelay = 5000; // 5 seconds, matches DataStore
  private pendingTransition: NodeJS.Timeout | null = null;

  constructor(private onTransition: (online: boolean) => void) {
    this.isOnline = navigator.onLine;
    window.addEventListener('online', () => this.scheduleTransition(true));
    window.addEventListener('offline', () => this.scheduleTransition(false));
  }

  private scheduleTransition(online: boolean) {
    if (this.pendingTransition) clearTimeout(this.pendingTransition);
    this.pendingTransition = setTimeout(() => {
      if (this.isOnline !== online) {
        this.isOnline = online;
        this.onTransition(online);
      }
    }, this.stabilizationDelay);
  }
}
```

**Verify:**
- [ ] Going offline triggers transition after 5 seconds (not immediately)
- [ ] Going online triggers sync after 5 seconds
- [ ] Rapid toggle (offline then online within 5s) does not trigger offline handler

### Step 11: Wire Connectivity to Queue Processor

- [ ] On transition to online: trigger sync-then-drain (sync first to get latest `_version` values, then drain queue)
- [ ] On transition to offline: stop queue processing

**Guide reference:** [guide/15-sync-engine.md -- Reconnection Order](../15-sync-engine.md)

**Verify:** Going online triggers sync then queue drain in correct order. Going offline stops processing gracefully.

---

## Phase 5: Sync Engine

**Guide reference:** [guide/15-sync-engine.md](../15-sync-engine.md)

### Step 12: Implement Base Sync

- [ ] Create `src/offline/syncEngine.ts`
- [ ] Implement base sync: download all records for each model when `lastSync` is null
- [ ] Use `syncPosts` query (not `listPosts`) with `lastSync: null`
- [ ] Handle pagination with `nextToken`
- [ ] Save `startedAt` as the new `lastSync` value
- [ ] Sync models in topological order: Author first, then Post, then Comment, Tag, PostTag

**Guide reference:** [guide/15-sync-engine.md -- Base Sync](../15-sync-engine.md)

```typescript
async function baseSync(modelName: string): Promise<void> {
  let nextToken: string | null = null;
  let startedAt: number | null = null;

  do {
    const { data } = await apolloClient.query({
      query: getSyncQuery(modelName),
      variables: { lastSync: null, limit: 100, nextToken },
      fetchPolicy: 'network-only',
    });

    const syncResult = data[`sync${modelName}s`];
    startedAt = syncResult.startedAt;
    nextToken = syncResult.nextToken;

    // Upsert items into Dexie
    await db.table(modelName.toLowerCase() + 's').bulkPut(
      syncResult.items.map(processItem)
    );
  } while (nextToken);

  // Save sync metadata
  await db._syncMetadata.put({
    modelName,
    lastSync: startedAt,
    lastFullSync: startedAt,
  });
}
```

**Verify:**
- [ ] Base sync downloads all records for each model
- [ ] Records are stored in correct Dexie tables
- [ ] `_syncMetadata` has `lastSync` and `lastFullSync` timestamps
- [ ] Soft-deleted records (`_deleted: true`) are stored but filtered from queries

### Step 13: Implement Delta Sync

- [ ] Implement delta sync: download only changed records since `lastSync`
- [ ] Use `syncPosts` query with `lastSync: <timestamp>`
- [ ] Process `_deleted: true` records by marking them deleted in Dexie
- [ ] Update `lastSync` to new `startedAt` value

**Guide reference:** [guide/15-sync-engine.md -- Delta Sync](../15-sync-engine.md)

```typescript
async function deltaSync(modelName: string): Promise<void> {
  const metadata = await db._syncMetadata.get(modelName);
  if (!metadata?.lastSync) {
    return baseSync(modelName); // Fall back to base sync
  }

  let nextToken: string | null = null;
  let startedAt: number | null = null;

  do {
    const { data } = await apolloClient.query({
      query: getSyncQuery(modelName),
      variables: { lastSync: metadata.lastSync, limit: 100, nextToken },
      fetchPolicy: 'network-only',
    });

    const syncResult = data[`sync${modelName}s`];
    startedAt = syncResult.startedAt;
    nextToken = syncResult.nextToken;

    for (const item of syncResult.items) {
      if (item._deleted) {
        await db.table(modelName.toLowerCase() + 's').update(item.id, {
          _deleted: true,
          _version: item._version,
        });
      } else {
        await db.table(modelName.toLowerCase() + 's').put(processItem(item));
      }
    }
  } while (nextToken);

  await db._syncMetadata.update(modelName, { lastSync: startedAt });
}
```

**Verify:**
- [ ] Delta sync only downloads records changed since last sync
- [ ] `_deleted` records are marked deleted locally
- [ ] `lastSync` is updated after each delta sync
- [ ] Subsequent delta syncs download fewer records

### Step 14: Implement Full Sync Interval Check

- [ ] Force base sync when `lastFullSync + fullSyncInterval < now` (default 24 hours)
- [ ] This catches any changes missed by delta sync during extended offline periods

```typescript
const FULL_SYNC_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

async function sync(modelName: string): Promise<void> {
  const metadata = await db._syncMetadata.get(modelName);

  const needsBaseSync = !metadata?.lastSync ||
    !metadata?.lastFullSync ||
    (Date.now() - metadata.lastFullSync > FULL_SYNC_INTERVAL);

  if (needsBaseSync) {
    await baseSync(modelName);
  } else {
    await deltaSync(modelName);
  }
}
```

**Verify:** After 24 hours (or by manually adjusting `lastFullSync`), sync falls back to base sync.

### Step 15: Verify Data Flows from AppSync to Local DB

- [ ] Ensure Dexie is empty
- [ ] Create 5 posts directly in DynamoDB/AppSync console
- [ ] Run base sync
- [ ] Verify all 5 posts appear in Dexie
- [ ] Create 2 more posts in AppSync console
- [ ] Run delta sync
- [ ] Verify only 2 new posts are downloaded

**Verification steps:**
1. Clear Dexie: `await db.posts.clear(); await db._syncMetadata.clear()`
2. Create posts in AppSync console or via another client
3. Run `await sync('Post')`
4. Check `await db.posts.count()` equals expected number
5. Check `await db._syncMetadata.get('Post')` has `lastSync` value
6. Add more posts in AppSync
7. Run `await sync('Post')` again
8. Verify only new posts were downloaded (check network requests in DevTools)

**Verify:** Base sync downloads all records. Delta sync downloads only changes. Timestamps track correctly.

---

## Phase 6: Conflict Resolution

**Guide reference:** [guide/15-sync-engine.md -- Conflict Resolution](../15-sync-engine.md)

### Step 16: Implement Version-Based Conflict Detection

- [ ] Include `_version` in all mutations
- [ ] Handle `ConflictUnhandled` errors from AppSync
- [ ] Implement AUTO_MERGE as default strategy

**Guide reference:** [guide/15-sync-engine.md -- Conflict Resolution](../15-sync-engine.md)

```typescript
async function handleConflict(
  error: any,
  localData: Record<string, any>,
  serverData: Record<string, any>
): Promise<Record<string, any>> {
  // Auto-merge: server wins for conflicting fields
  return {
    ...localData,
    ...serverData,
    _version: serverData._version, // Always use server's version
  };
}
```

**Verify:** ConflictUnhandled errors are caught and resolved. Server version is preserved.

### Step 17: Test Concurrent Edits

- [ ] Sign in as User A in Browser 1, edit Post title to "Title A"
- [ ] Sign in as User A in Browser 2, edit same Post title to "Title B"
- [ ] Both browsers go offline before the other's change syncs
- [ ] Both browsers go online
- [ ] Verify conflict is detected and resolved

**Verification steps:**
1. Open app in two browser windows (same user)
2. Both windows: navigate to same post
3. Window 1: go offline, change title to "Title A", save locally
4. Window 2: go offline, change title to "Title B", save locally
5. Window 1: go online -- mutation succeeds (first writer wins)
6. Window 2: go online -- mutation fails with ConflictUnhandled
7. Verify conflict handler resolves: server version wins (Title A persists)
8. Window 2: sync brings in "Title A", local state updated

**Verify:** Conflict detected. Auto-merge resolves correctly. No data loss. Both windows eventually show same data.

### Step 18: Verify _version Tracking

- [ ] Create a post (version 1)
- [ ] Update it 3 times (version should reach 4)
- [ ] Verify `_version` in Dexie matches server's `_version`
- [ ] Verify mutation queue uses correct `_version` for each operation

**Verify:** `_version` increments on each mutation. Local and server versions stay in sync. Queue entries use current version.

---

## Phase 7: Apollo Integration

**Guide reference:** [guide/15-sync-engine.md -- Apollo Integration](../15-sync-engine.md)

### Step 19: Wire Dexie as Source of Truth

- [ ] All reads come from Dexie (via `useLiveQuery`)
- [ ] All writes go to Dexie first, then enqueue for sync
- [ ] Apollo Client is used only as transport (sending mutations and sync queries to AppSync)

**Guide reference:** [guide/15-sync-engine.md -- OfflineDataManager](../15-sync-engine.md)

```typescript
// Two-step write pattern:
async function savePost(post: Partial<LocalPost>): Promise<void> {
  // 1. Save to local Dexie DB
  await db.posts.put({
    ...post,
    updatedAt: new Date().toISOString(),
  } as LocalPost);

  // 2. Enqueue mutation for server sync
  await enqueueMutation({
    modelName: 'Post',
    operation: post.id ? 'UPDATE' : 'CREATE',
    data: post,
  });
}
```

**Verify:**
- [ ] Reads never wait for network (Dexie serves data immediately)
- [ ] Writes are saved locally first, then queued for sync
- [ ] Apollo cache is not the source of truth

### Step 20: Implement OfflineDataManager Facade

- [ ] Create `src/offline/offlineDataManager.ts`
- [ ] Expose `save()`, `query()`, `delete()`, `observe()` methods
- [ ] Coordinate Dexie, mutation queue, sync engine, and connectivity monitor

```typescript
class OfflineDataManager {
  async save(modelName: string, data: any): Promise<void> { /* ... */ }
  async query(modelName: string, filter?: any): Promise<any[]> { /* ... */ }
  async delete(modelName: string, id: string): Promise<void> { /* ... */ }
  async startSync(): Promise<void> { /* ... */ }
  async stopSync(): void { /* ... */ }
}
```

**Verify:** OfflineDataManager provides a clean API that hides the complexity of Dexie, mutation queue, and sync engine.

### Step 21: Migrate All Components to Use OfflineDataManager

- [ ] PostList reads from Dexie via `useLiveQuery`
- [ ] PostForm writes via `offlineDataManager.save()`
- [ ] PostDetail reads from Dexie
- [ ] CommentList reads from Dexie, writes via OfflineDataManager
- [ ] TagManager reads from Dexie, writes via OfflineDataManager
- [ ] SubscriptionMonitor uses Dexie live queries for reactive updates
- [ ] AuthGate clears Dexie + mutation queue on sign-out

**Verify:** All 7 components work with Dexie as the data source. No direct Apollo `useQuery` calls for data reads (Apollo is transport only).

---

## Phase 8: Full Offline Scenario

### Step 22: Complete Offline CRUD Test

- [ ] Go offline (DevTools > Network > Offline, or airplane mode)
- [ ] Create 2 new posts
- [ ] Update 1 existing post
- [ ] Delete 1 existing post
- [ ] Create 1 comment on a post
- [ ] Navigate through the app (PostList, PostDetail, CommentList)
- [ ] Verify all operations reflect in UI immediately (from Dexie)
- [ ] Go online
- [ ] Verify all operations sync to server

**Verification steps:**
1. Check Network > Offline in DevTools
2. Perform all CRUD operations
3. Verify each operation reflects immediately in the UI
4. Check `_mutationQueue` table has all pending mutations
5. Uncheck Offline
6. Wait for connectivity monitor (5-second delay)
7. Watch sync engine run (delta sync first, then queue drain)
8. Verify all records in DynamoDB match local state
9. Check `_mutationQueue` is empty
10. Verify no data loss

**Verify:** All operations work offline. All data syncs on reconnect. No data loss. No duplicates.

### Step 23: Test Extended Offline Period

- [ ] Go offline for extended period (simulate by adjusting timestamps)
- [ ] Perform 20+ operations offline
- [ ] Go online
- [ ] Verify all operations sync without errors
- [ ] Verify base sync triggers if full sync interval exceeded

**Verify:** Large queue drains successfully. Base sync runs if interval exceeded. No operations lost.

### Step 24: Test Rapid Online/Offline Toggling

- [ ] Rapidly toggle network state (online/offline every 2-3 seconds, 10 times)
- [ ] Perform CRUD operations during toggling
- [ ] Verify 5-second stabilization delay prevents thrashing
- [ ] Verify no duplicate mutations or lost operations

**Verify:** Stabilization delay prevents rapid state changes. No duplicate records. All operations eventually sync.

### Step 25: Test Multi-Tab Sync

- [ ] Open app in 2 browser tabs
- [ ] Tab 1: create a post while online
- [ ] Tab 2: verify post appears (via sync or subscription)
- [ ] Tab 1: go offline, create another post
- [ ] Tab 2: verify offline post does NOT appear until Tab 1 goes online and syncs

**Verify:** Multi-tab behavior is predictable. Online operations propagate via subscriptions. Offline operations propagate after sync.

---

## Phase 9: Sign-Out and Cleanup

### Step 26: Implement Offline-Aware Sign-Out

- [ ] Process remaining mutation queue before sign-out (warn user if offline)
- [ ] Clear all Dexie tables
- [ ] Clear sync metadata
- [ ] Clear Apollo cache
- [ ] Sign out

```typescript
const handleSignOut = async () => {
  // 1. Drain any remaining mutations
  if (navigator.onLine) {
    await processMutationQueue();
  } else {
    const pendingCount = await db._mutationQueue.count();
    if (pendingCount > 0) {
      const confirmed = window.confirm(
        `You have ${pendingCount} unsaved changes. Sign out anyway? Changes will be lost.`
      );
      if (!confirmed) return;
    }
  }

  // 2. Clear all local data
  await db.posts.clear();
  await db.comments.clear();
  await db.authors.clear();
  await db.tags.clear();
  await db.postTags.clear();
  await db._mutationQueue.clear();
  await db._syncMetadata.clear();

  // 3. Clear Apollo cache
  await apolloClient.clearStore();

  // 4. Sign out
  await signOut();
};
```

**Verify:**
- [ ] If online: queue drains before sign-out
- [ ] If offline with pending mutations: user warned before sign-out
- [ ] All Dexie tables are empty after sign-out
- [ ] Apollo cache is cleared
- [ ] Sign in as different user: no stale data

---

## Final Verification Checklist

Complete this checklist after all migration steps. Every item must pass.

### Offline Functionality
- [ ] App loads and displays data without network (from Dexie)
- [ ] Create works offline (saved to Dexie, enqueued in mutation queue)
- [ ] Update works offline
- [ ] Delete works offline
- [ ] All operations sync when back online
- [ ] No data loss after offline period

### Mutation Queue
- [ ] Mutations queue in FIFO order
- [ ] Deduplication merges CREATE+UPDATE correctly
- [ ] Deduplication cancels CREATE+DELETE correctly
- [ ] `_version` propagates after successful dequeue
- [ ] Queue drains completely on reconnect
- [ ] Failed mutations retry with backoff

### Sync Engine
- [ ] Base sync downloads all records
- [ ] Delta sync downloads only changed records
- [ ] `lastSync` timestamp tracks correctly
- [ ] Full sync interval forces base sync after 24 hours
- [ ] Models sync in topological order (parents before children)
- [ ] `_deleted` records processed correctly

### Conflict Resolution
- [ ] Concurrent edits trigger ConflictUnhandled error
- [ ] Auto-merge resolves conflicts (server version wins)
- [ ] `_version` stays in sync between local and server
- [ ] No data corruption after conflict resolution

### Connectivity
- [ ] 5-second stabilization delay on transitions
- [ ] Rapid toggling does not cause thrashing
- [ ] Sync-then-drain order on reconnect
- [ ] Graceful degradation when offline

### CRUD Operations (same as API Only)
- [ ] All 6 CRUD operations work
- [ ] All 13 predicate operators return correct results (client-side filtering from Dexie)
- [ ] Pagination works (from Dexie data)
- [ ] Sorting works (from Dexie data)
- [ ] All relationship types work

### Relationships
- [ ] Post -> Comments (hasMany) via Dexie join
- [ ] Comment -> Post (belongsTo) via Dexie lookup
- [ ] Post <-> Tag (manyToMany via PostTag) via Dexie joins

### Real-Time
- [ ] Subscriptions trigger delta sync for incoming changes
- [ ] Remote changes appear in UI via Dexie live queries

### Auth
- [ ] Owner-based auth scopes data to current user
- [ ] Sign-out clears all Dexie tables and mutation queue
- [ ] No cross-user data leakage

### No DataStore Remaining
- [ ] `grep -r "DataStore" src/` returns zero results
- [ ] `grep -r "from './models'" src/` returns zero results
- [ ] No regressions -- all features work end-to-end
