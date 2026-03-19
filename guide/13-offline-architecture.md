<!-- ai:offline-architecture -->

# Offline-First Architecture and Local Database Setup

This page introduces the offline-first architecture for migrating from DataStore and walks through setting up Dexie.js as your local database. By the end, you will understand how the four core components (local database, mutation queue, sync engine, and conflict resolver) work together, and you will have a typed Dexie.js database ready for offline-first operation.

<!-- ai:when-you-need-offline -->

## When You Need Offline-First

The previous phases of this guide covered two strategies with different levels of connectivity tolerance:

1. **API Only (Phase 2)** -- the simplest path. Every operation goes directly to AppSync. If the network is down, operations fail. Best for apps that always have connectivity.
2. **Local Caching (Phase 3)** -- adds persistence to Apollo's in-memory cache using `apollo3-cache-persist`. Reads work offline from the cache, but writes still require a network connection. Best for apps that need fast startup and occasional offline reads.
3. **Offline-First (this phase)** -- full offline capability. Both reads and writes work without a network connection. Mutations are queued locally and replayed when connectivity returns. Best for field workers, intermittent connectivity, and offline-first mobile web apps.

The key difference from Phase 3 is the source of truth. In Phase 3, Apollo's `InMemoryCache` is the source of truth and the persistent layer is a mirror. In this phase, **Dexie.js (IndexedDB) is the source of truth**. Apollo Client becomes a transport layer only -- it sends mutations and sync queries to AppSync but does not own the data.

If you are not sure which strategy fits your use case, revisit the [Decision Framework](./01-decision-framework.md) for a structured comparison.

> **Reference architecture.** The code in this phase is a reference architecture -- patterns you adapt to your application, not a drop-in library. DataStore hid all of this complexity behind a simple API. Moving to Apollo means you build the offline layer yourself, but you gain full control over every aspect of sync, conflict resolution, and data storage.

<!-- ai:architecture-overview -->

## Architecture Overview

The offline-first architecture has four layers. The application interacts only with the top layer (OfflineDataManager), which coordinates the components underneath.

```
+-------------------------------------------------------+
|              Application / React UI                    |
+-------------------------------------------------------+
|           OfflineDataManager (Facade)                  |
|     save()  query()  delete()  observe()               |
+-------------------------------------------------------+
|                                                        |
|   +-------------------+    +------------------------+  |
|   |  Mutation Queue   |    |     Sync Engine        |  |
|   |  (Dexie table)    |    |  (base + delta sync)   |  |
|   |  FIFO, dedup by   |    |  paginated download    |  |
|   |  modelId           |    |  via syncPosts query   |  |
|   +-------------------+    +------------------------+  |
|                                                        |
|   +-------------------+    +------------------------+  |
|   | Conflict Resolver |    | Connectivity Monitor   |  |
|   | (_version based   |    | navigator.onLine +     |  |
|   |  optimistic lock) |    | WebSocket state        |  |
|   +-------------------+    +------------------------+  |
|                                                        |
+-------------------------------------------------------+
|              Dexie.js (IndexedDB)                      |
|     Data tables  +  _mutationQueue table  +            |
|              _syncMetadata table                       |
+-------------------------------------------------------+
|                                                        |
|   +-------------------+    +------------------------+  |
|   |  Apollo Client    |    |      Amplify           |  |
|   |  (queries, muts)  |    |   (subscriptions)      |  |
|   +-------------------+    +------------------------+  |
|                                                        |
+-------------------------------------------------------+
|                  AWS AppSync                            |
+-------------------------------------------------------+
```

### Component Descriptions

**OfflineDataManager** is the facade that your application calls. It exposes `save()`, `query()`, `delete()`, and `observe()` methods. When you call `save()`, it writes to the local Dexie.js database immediately (so the UI updates instantly) and enqueues a mutation for later sync. When you call `query()`, it reads directly from Dexie.js -- no network round-trip.

**Dexie.js (IndexedDB)** is the source of truth for all data. It stores your user data tables (posts, comments, etc.), a `_mutationQueue` table for pending mutations, and a `_syncMetadata` table for tracking sync timestamps. All reads come from here. All writes go here first.

**Mutation Queue** is a FIFO queue of pending mutations stored in a Dexie.js table. Each entry records the model name, record ID, operation type (CREATE, UPDATE, DELETE), and the serialized data. The queue deduplicates by `modelId` -- if a record is updated three times while offline, only the latest state needs to be sent. When connectivity returns, the queue drains in order.

**Sync Engine** downloads data from AppSync using two strategies: base sync (full download when no `lastSync` exists or when the full sync interval expires) and delta sync (incremental download of records changed since `lastSync`). The sync engine uses the AppSync-generated `syncPosts` query (not `listPosts`) which accepts a `$lastSync: AWSTimestamp` parameter and returns a `startedAt` timestamp for tracking.

**Conflict Resolver** handles `ConflictUnhandled` errors from AppSync using `_version`-based optimistic locking. When a mutation conflicts with the server version, the resolver receives both the local and remote versions and decides whether to retry with the server's `_version` (last writer wins) or discard the local change. This matches DataStore's conflict handler pattern.

**Connectivity Monitor** watches `navigator.onLine` and listens to `online`/`offline` window events. It also monitors WebSocket subscription state -- if the subscription connection drops, it treats the app as offline even if `navigator.onLine` reports true. When connectivity is restored, it triggers the sync engine and starts draining the mutation queue.

**Apollo Client** is the transport layer. It sends mutations from the queue to AppSync and executes sync queries to download data. It handles auth token injection, retry, and error formatting through the link chain configured in the [Apollo Client Setup](./04-apollo-setup.md). It is NOT the source of truth -- Dexie.js is.

**Amplify** handles real-time subscriptions using the hybrid approach established in the [Subscriptions guide](./05-subscriptions.md). Subscription events are received via Amplify's WebSocket connection and merged into the Dexie.js local database.

### Data Flow Paths

**Write path (instant local, async remote):**

```
App -> OfflineDataManager.save(record)
    -> Dexie.js: put(record)              [immediate, UI updates]
    -> _mutationQueue: add(mutation)       [enqueued for sync]
    -> [when online] Apollo Client.mutate() -> AppSync
```

**Read path (always local, always fast):**

```
App -> OfflineDataManager.query(filter)
    -> Dexie.js: where(filter).toArray()   [local read, instant]
```

**Sync path (background, on reconnect):**

```
Connectivity restored
    -> Sync Engine: Apollo Client.query(syncPosts) -> AppSync
    -> Merge response into Dexie.js (skip records with pending mutations)
    -> Drain _mutationQueue: process each entry via Apollo Client.mutate()
    -> On conflict: Conflict Resolver decides retry vs discard
```

<!-- ai:datastore-internals -->

## What DataStore Does Under the Hood

DataStore abstracts away five internal components that handle offline sync. Understanding what they do helps you build the equivalent with Dexie.js and Apollo Client.

DataStore's sync engine (`packages/datastore/src/sync/`) consists of:

1. **SyncEngine** -- the orchestrator that coordinates all components, subscribes to connectivity, and auto-enqueues mutations from storage changes
2. **MutationEventOutbox** -- a FIFO queue with deduplication by `modelId` and version sync on dequeue
3. **SyncProcessor** -- paginated data download using `syncPosts` queries with `lastSync`/`startedAt`/`nextToken`
4. **MutationProcessor** -- drains the outbox, handles `ConflictUnhandled` errors, retries with jittered backoff
5. **ModelMerger** -- reconciles incoming data with local state while respecting records that have pending mutations in the outbox

The guide simplifies this to four components (the orchestrator becomes the OfflineDataManager facade). Here is the mapping:

| DataStore Internal Component | Guide Equivalent | Where Covered |
|------------------------------|------------------|---------------|
| SyncEngine orchestrator | `OfflineDataManager` facade | This page (architecture) |
| MutationEventOutbox | `_mutationQueue` (Dexie table) | [Mutation Queue](./14-mutation-queue.md) |
| SyncProcessor | `syncModel()` function | [Sync Engine](./15-sync-engine.md) |
| MutationProcessor | `processMutationQueue()` function | [Mutation Queue](./14-mutation-queue.md) |
| ModelMerger | `mergeItemsIntoLocal()` function | [Sync Engine](./15-sync-engine.md) |
| DataStoreConnectivity | `ConnectivityMonitor` class | [Mutation Queue](./14-mutation-queue.md) |

**Key insight:** DataStore hides ALL of this complexity. A single `DataStore.save(post)` call writes locally, enqueues a mutation, deduplicates against existing queue entries, and syncs when online -- all invisibly. Moving to Apollo means you build each piece yourself. The trade-off is full control: you choose the conflict strategy, tune the sync interval, decide which models sync, and handle errors exactly as your app requires.

<!-- ai:dexie-setup -->

## Dexie.js Local Database Setup

Dexie.js is a lightweight wrapper around IndexedDB that provides schema versioning, a query builder, bulk operations, and full TypeScript support. Install it:

```bash
npm install dexie
```

### TypeScript Interfaces

Define interfaces that match your GraphQL models. Include the three metadata fields (`_version`, `_deleted`, `_lastChangedAt`) that AppSync adds when conflict resolution is enabled:

```typescript
// src/offline/types.ts

// --- User data models ---

interface Post {
  id: string;
  title: string;
  content: string;
  status?: string;
  rating?: number;
  owner?: string;
  _version: number;
  _deleted: boolean;
  _lastChangedAt: number;
  createdAt: string;
  updatedAt: string;
}

interface Comment {
  id: string;
  postId: string; // foreign key -- belongsTo Post
  content: string;
  owner?: string;
  _version: number;
  _deleted: boolean;
  _lastChangedAt: number;
  createdAt: string;
  updatedAt: string;
}

// --- Internal tables ---

interface MutationQueueEntry {
  id: string;             // unique queue entry ID (UUID)
  modelName: string;      // e.g., 'Post', 'Comment'
  modelId: string;        // the ID of the mutated record
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  data: string;           // JSON-serialized record data
  condition: string;      // JSON-serialized GraphQL condition (or '{}')
  createdAt: number;      // timestamp for FIFO ordering
  inProgress?: boolean;   // lock flag -- true when mutation processor is sending
}

interface SyncMetadata {
  id: string;                    // same as modelName -- one entry per model
  modelName: string;             // e.g., 'Post', 'Comment'
  lastSync: number | null;       // AWSTimestamp from last successful sync
  lastFullSync: number | null;   // AWSTimestamp from last base (full) sync
  fullSyncInterval: number;      // ms between forced full syncs (default: 24h)
}
```

**Why these fields?**

- `MutationQueueEntry.data` is a JSON string rather than a typed object so that the queue table can store mutations for any model type without union types.
- `MutationQueueEntry.inProgress` prevents the sync engine from sending the same mutation twice if processing takes time.
- `SyncMetadata.lastSync` stores the `startedAt` value returned by AppSync sync queries. When this is `null`, the sync engine performs a full base sync. When it has a value, the engine performs a delta sync (only records changed since that timestamp).
- `SyncMetadata.fullSyncInterval` defaults to 24 hours (matching DataStore). When `lastFullSync + fullSyncInterval < now`, a full base sync is triggered even if `lastSync` has a value. This is a safety net that catches any changes missed by delta sync or subscription gaps.

### The OfflineDatabase Class

Create the Dexie database with your model tables and the two internal tables:

```typescript
// src/offline/database.ts
import Dexie, { type Table } from 'dexie';

class OfflineDatabase extends Dexie {
  // User data tables
  posts!: Table<Post, string>;
  comments!: Table<Comment, string>;

  // Internal tables
  mutationQueue!: Table<MutationQueueEntry, string>;
  syncMetadata!: Table<SyncMetadata, string>;

  constructor() {
    super('MyAppOfflineDB');

    this.version(1).stores({
      // Primary key is listed first, then indexed fields
      // Only indexed fields go here -- Dexie stores ALL fields
      posts: 'id, _deleted, updatedAt',
      comments: 'id, postId, _deleted, updatedAt',
      mutationQueue: 'id, modelName, modelId, createdAt',
      syncMetadata: 'id, modelName',
    });
  }
}

export const db = new OfflineDatabase();
```

**Important:** The `stores()` definition does NOT list every field -- it lists only the **primary key** (first entry) and **indexed fields** (fields you will query with `.where()`). Dexie stores all fields on every record regardless of whether they appear in `stores()`. You only add a field to `stores()` if you need to filter or sort by it using `.where()`.

For example, `posts: 'id, _deleted, updatedAt'` means:
- `id` is the primary key (used for `.get(id)` and `.put()`)
- `_deleted` is indexed (used for `.where('_deleted').equals(false)` to filter out soft-deleted records)
- `updatedAt` is indexed (used for `.where('updatedAt').above(timestamp)` or `.orderBy('updatedAt')`)
- `title`, `content`, `status`, `rating`, `owner`, `_version`, `_lastChangedAt`, `createdAt` are all stored but NOT indexed -- you cannot use `.where()` on them, but you can read them from query results

### Schema Mapping from DataStore Models

When migrating from DataStore, map your model fields to Dexie.js indexes. Here is the general pattern:

| Field Type | DataStore Behavior | Dexie.js Index | Example |
|------------|-------------------|----------------|---------|
| `id` (primary key) | Auto-generated UUID, primary key | First entry in `stores()` | `'id, ...'` |
| Foreign key (`postId`) | Auto-managed by relationship | Indexed for `.where()` joins | `'id, postId, ...'` |
| `_deleted` | Auto-managed soft delete flag | Indexed for filtering active records | `'id, _deleted, ...'` |
| `updatedAt` | Auto-managed timestamp | Indexed for ordering and delta queries | `'id, ..., updatedAt'` |
| `_version` | Auto-managed conflict version | NOT indexed (read from record, sent in mutations) | -- |
| `_lastChangedAt` | Auto-managed server timestamp | NOT indexed (informational only) | -- |
| `createdAt` | Auto-managed timestamp | NOT indexed unless you sort by it | -- |
| Business fields (`title`, `content`) | Stored as model properties | NOT indexed unless you filter/sort by them | -- |
| Fields used in `@index` | Queryable via DataStore predicates | Indexed in `stores()` | `'id, ..., status'` |

**Rule of thumb:** If you used a field in DataStore predicates (`c => c.status.eq('PUBLISHED')`) or in an `@index` directive, add it to the Dexie `stores()` definition. Otherwise, leave it out -- extra indexes slow down writes without benefit.

### DataStore Before/After Comparison

DataStore creates its IndexedDB schema automatically from your model definitions. With Dexie.js, you define it explicitly:

```typescript
// BEFORE: DataStore (automatic)
// DataStore reads your schema, creates IndexedDB tables,
// adds MutationEvent and ModelMetadata tables automatically.
// You never see any of this.
import { DataStore } from 'aws-amplify/datastore';
import { Post } from './models';

await DataStore.save(new Post({ title: 'Hello', content: 'World' }));

// AFTER: Dexie.js (explicit)
// You define the schema, create tables, and manage metadata tables yourself.
import { db } from './offline/database';

await db.posts.put({
  id: crypto.randomUUID(),
  title: 'Hello',
  content: 'World',
  _version: 1,
  _deleted: false,
  _lastChangedAt: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
```

### Adding a New Model

When you add a new model to your schema, three changes are needed:

1. **Define the interface** with all fields including `_version`, `_deleted`, `_lastChangedAt`:

```typescript
interface Tag {
  id: string;
  label: string;
  _version: number;
  _deleted: boolean;
  _lastChangedAt: number;
  createdAt: string;
  updatedAt: string;
}
```

2. **Add a Table property** to the OfflineDatabase class:

```typescript
class OfflineDatabase extends Dexie {
  posts!: Table<Post, string>;
  comments!: Table<Comment, string>;
  tags!: Table<Tag, string>;          // new table
  mutationQueue!: Table<MutationQueueEntry, string>;
  syncMetadata!: Table<SyncMetadata, string>;
  // ...
}
```

3. **Add to `stores()`** with appropriate indexes:

```typescript
this.version(1).stores({
  posts: 'id, _deleted, updatedAt',
  comments: 'id, postId, _deleted, updatedAt',
  tags: 'id, _deleted, updatedAt',   // new table definition
  mutationQueue: 'id, modelName, modelId, createdAt',
  syncMetadata: 'id, modelName',
});
```

### Version Migrations

When you need to add an index to an existing table (for example, adding a `status` index to posts for filtering), use Dexie's version migration:

```typescript
class OfflineDatabase extends Dexie {
  posts!: Table<Post, string>;
  comments!: Table<Comment, string>;
  mutationQueue!: Table<MutationQueueEntry, string>;
  syncMetadata!: Table<SyncMetadata, string>;

  constructor() {
    super('MyAppOfflineDB');

    // Original schema
    this.version(1).stores({
      posts: 'id, _deleted, updatedAt',
      comments: 'id, postId, _deleted, updatedAt',
      mutationQueue: 'id, modelName, modelId, createdAt',
      syncMetadata: 'id, modelName',
    });

    // Migration: add status index to posts
    this.version(2).stores({
      posts: 'id, _deleted, updatedAt, status',
      // Only list tables that changed -- unchanged tables are inherited
    });
  }
}
```

Dexie handles the IndexedDB `onupgradeneeded` lifecycle automatically. When the database opens with a higher version number, Dexie creates and drops indexes as needed. Existing data is preserved -- only the index structure changes.

If you need to transform data during migration (not just add indexes), Dexie supports an `.upgrade()` callback:

```typescript
this.version(3).stores({
  posts: 'id, _deleted, updatedAt, status',
}).upgrade(tx => {
  // Set default status for existing posts that lack it
  return tx.table('posts').toCollection().modify(post => {
    if (!post.status) {
      post.status = 'DRAFT';
    }
  });
});
```

<!-- ai:comparing-phase3 -->

## Comparing with Phase 3 (Local Caching)

Phase 3 and Phase 4 both improve the offline experience, but they are architecturally different. Do not combine them -- choose one.

| Aspect | Phase 3: Local Caching | Phase 4: Offline-First |
|--------|----------------------|----------------------|
| **Source of truth** | Apollo InMemoryCache (persisted to IndexedDB via `apollo3-cache-persist`) | Dexie.js (IndexedDB) |
| **Offline reads** | Yes (from persisted cache) | Yes (from Dexie.js) |
| **Offline writes** | No (mutations fail without network) | Yes (queued in `_mutationQueue`, replayed on reconnect) |
| **Sync mechanism** | Apollo `refetchQueries` / `cache-and-network` fetchPolicy | Base sync (full) + delta sync (incremental) via `syncPosts` queries |
| **Conflict resolution** | Last write wins (whoever saves last overwrites) | `_version`-based optimistic concurrency with custom conflict handler |
| **Persistence library** | `apollo3-cache-persist` | `dexie` |
| **Complexity** | Low -- add a few configuration lines to existing Apollo setup | High -- implement mutation queue, sync engine, conflict resolver, connectivity monitor |
| **Best for** | Apps that need fast startup and stale-while-revalidate reads | Apps that must work fully offline with write capability |

**When to use Phase 3:** Your app works primarily online. Users tolerate brief connectivity interruptions for reads (cached data shows while refetching). Writes always require connectivity.

**When to use Phase 4:** Your app must work in environments with no connectivity for extended periods. Users create, update, and delete records while offline, and those changes sync when connectivity returns.

**Phase 4 does NOT use `apollo3-cache-persist`.** Dexie.js replaces the Apollo cache persistence layer entirely. Apollo's `InMemoryCache` still exists (Apollo Client requires it), but it is not persisted and is not the source of truth. If you already set up Phase 3's cache persistence, you will remove it when adopting Phase 4.

<!-- ai:next-steps -->

## Next Steps

With the architecture understood and the local database set up, the next two guides build the remaining components:

- **[Mutation Queue and Connectivity Monitoring](./14-mutation-queue.md)** -- Implement the `_mutationQueue` table operations (enqueue with deduplication, FIFO drain, version propagation), the `ConnectivityMonitor` class, and the mutation processor that sends queued mutations via Apollo Client.

- **[Sync Engine and Conflict Resolution](./15-sync-engine.md)** -- Implement base sync and delta sync using AppSync's `syncPosts` queries, the `mergeItemsIntoLocal()` function that respects pending mutations, the conflict resolver with `_version`-based optimistic locking, and the `OfflineDataManager` facade that ties everything together.

---

**Previous:** [Optimistic Updates](./12-optimistic-updates.md)

**Next:** [Mutation Queue and Connectivity Monitoring](./14-mutation-queue.md)
