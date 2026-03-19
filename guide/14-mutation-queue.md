<!-- ai:mutation-queue -->

# Mutation Queue and Connectivity Monitoring

This page covers the write-path side of offline-first: how local mutations are queued in IndexedDB, deduplicated by model record, and replayed when connectivity returns. By the end, you will have a working mutation queue with FIFO ordering and deduplication, a connectivity monitor that detects online/offline transitions, and a queue processor that drains pending mutations via Apollo Client.

**Prerequisites:** Complete the [Offline Architecture and Local Database Setup](./13-offline-architecture.md) first. This page imports `db` and the `MutationQueueEntry` interface defined there.

> **Reference architecture.** The code on this page is a reference architecture -- patterns you adapt to your application, not a drop-in library. DataStore handled all of this behind a single `DataStore.save()` call. Moving to Apollo means you build the mutation queue yourself, but you gain full control over ordering, deduplication, retry behavior, and error handling.

<!-- ai:datastore-outbox -->

## How DataStore's Mutation Outbox Works

DataStore's `MutationEventOutbox` (in `packages/datastore/src/sync/outbox.ts`) is the internal component that queues, deduplicates, and drains local mutations. Understanding its design helps you build the equivalent with Dexie.js.

The outbox follows three principles:

1. **FIFO ordering.** Mutations are processed in the order they were created. The oldest mutation is always processed first. This preserves the user's intent -- if they created a post and then updated it, the create must reach the server before the update.

2. **Deduplication by modelId.** If a record already has a pending mutation in the queue, the new mutation is merged with or replaces the existing one rather than adding a second entry. This prevents unnecessary network requests and reduces conflict potential.

3. **Version sync on dequeue.** After a mutation succeeds, the `_version` returned by the server is propagated to all remaining queue entries for the same record. Without this, the next mutation for that record would use a stale `_version` and always trigger a `ConflictUnhandled` error.

Here is how DataStore's outbox methods map to the functions you will build:

| DataStore Outbox Method | Guide Equivalent | Purpose |
|-------------------------|------------------|---------|
| `outbox.enqueue()` | `enqueueMutation()` | Add mutation to queue with dedup |
| `outbox.peek()` | `db.mutationQueue.orderBy('createdAt').first()` | Read head of queue |
| `outbox.dequeue()` | `dequeueAndSyncVersions()` | Remove head and propagate `_version` |
| `outbox.syncOutboxVersionsOnDequeue()` | Built into `dequeueAndSyncVersions()` | Update `_version` in remaining entries |

<!-- ai:enqueue-mutation -->

## Enqueueing Mutations

The `enqueueMutation()` function adds a mutation to the queue inside a Dexie transaction. The transaction ensures atomicity -- the deduplication check and the write happen as a single operation, preventing race conditions between concurrent saves.

### Deduplication Logic

The dedup rules match DataStore's `outbox.ts` exactly:

| Existing Entry | Incoming Entry | Result |
|---------------|---------------|--------|
| None | Any | Add to queue |
| CREATE | UPDATE | Merge data fields into the CREATE (preserves create intent) |
| CREATE | DELETE | Remove the CREATE entirely (net no-op -- record never reaches server) |
| UPDATE | Any (no condition) | Replace with merged data (latest state wins) |
| DELETE | Any | Replace (uncommon -- would require re-creating after delete) |

**Why merge CREATE + UPDATE?** If the user creates a post while offline and then edits the title, you want one CREATE mutation with the final data, not a CREATE followed by an UPDATE. The server only needs to see the final state.

**Why remove CREATE + DELETE?** If the user creates a post and then deletes it before going back online, neither operation needs to reach the server. The record never existed remotely.

### Implementation

```typescript
// src/offline/mutationQueue.ts
import { db } from './database';
import type { MutationQueueEntry } from './types';

/**
 * Enqueue a mutation with modelId-based deduplication.
 * Must be called AFTER writing to the local Dexie.js table.
 *
 * @example
 * await db.posts.put(updatedPost);
 * await enqueueMutation({
 *   modelName: 'Post',
 *   modelId: updatedPost.id,
 *   operation: 'UPDATE',
 *   data: JSON.stringify(updatedPost),
 *   condition: '{}',
 * });
 */
export async function enqueueMutation(
  entry: Omit<MutationQueueEntry, 'id' | 'createdAt' | 'inProgress'>
): Promise<void> {
  await db.transaction('rw', db.mutationQueue, async () => {
    // Find existing mutation for this record (excluding in-progress entries
    // that are currently being sent by the mutation processor)
    const existing = await db.mutationQueue
      .where('modelId')
      .equals(entry.modelId)
      .and(item => !item.inProgress)
      .first();

    if (!existing) {
      // No existing mutation -- simply enqueue
      await db.mutationQueue.add({
        ...entry,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      });
      return;
    }

    // --- Deduplication logic (mirrors DataStore outbox.ts) ---

    if (existing.operation === 'CREATE') {
      if (entry.operation === 'DELETE') {
        // CREATE + DELETE = no-op. Remove the CREATE entirely.
        // The record was never sent to the server, so no remote
        // operation is needed.
        await db.mutationQueue.delete(existing.id);
      } else {
        // CREATE + UPDATE = merge data into the CREATE.
        // The server only needs the final state as a single CREATE.
        const mergedData = {
          ...JSON.parse(existing.data),
          ...JSON.parse(entry.data),
        };
        await db.mutationQueue.update(existing.id, {
          data: JSON.stringify(mergedData),
        });
      }
      return;
    }

    if (existing.operation === 'UPDATE') {
      if (entry.operation === 'DELETE') {
        // UPDATE + DELETE = replace with DELETE.
        // The pending update is irrelevant since the record is being deleted.
        await db.mutationQueue.update(existing.id, {
          operation: 'DELETE',
          data: entry.data,
        });
      } else {
        // UPDATE + UPDATE = merge into single UPDATE with latest data.
        const mergedData = {
          ...JSON.parse(existing.data),
          ...JSON.parse(entry.data),
        };
        await db.mutationQueue.update(existing.id, {
          data: JSON.stringify(mergedData),
        });
      }
      return;
    }

    // Existing DELETE + any new mutation = replace entirely.
    // This is uncommon but can happen if a record is deleted then re-created
    // with the same ID before going back online.
    await db.mutationQueue.delete(existing.id);
    await db.mutationQueue.add({
      ...entry,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    });
  });
}
```

### DataStore Before/After Comparison

```typescript
// BEFORE: DataStore (automatic enqueuing)
// DataStore.save() writes locally AND enqueues to the internal
// MutationEventOutbox -- all in one call.
import { DataStore } from 'aws-amplify/datastore';
import { Post } from './models';

const post = await DataStore.save(
  Post.copyOf(existingPost, updated => {
    updated.title = 'New Title';
  })
);

// AFTER: Dexie.js + explicit enqueue (two steps)
// Step 1: Write to local database (instant UI update)
const updatedPost = { ...existingPost, title: 'New Title' };
await db.posts.put(updatedPost);

// Step 2: Enqueue for remote sync (will send when online)
await enqueueMutation({
  modelName: 'Post',
  modelId: updatedPost.id,
  operation: 'UPDATE',
  data: JSON.stringify(updatedPost),
  condition: '{}',
});
```

The two-step pattern is intentional. By separating the local write from the queue enqueue, you can control exactly when and how mutations are queued. For example, you might skip enqueueing for local-only draft records, or add custom metadata to the queue entry.

<!-- ai:process-queue -->

## Processing the Queue

The `processMutationQueue()` function drains the queue in FIFO order when the device is online. It peeks at the head entry, marks it as in-progress (to prevent duplicate sends), sends it via Apollo Client, and on success calls `dequeueAndSyncVersions()` to remove the entry and propagate the server's `_version` to remaining entries.

### The getMutationForOperation Helper

Before processing, you need a way to map a model name and operation to the correct GraphQL mutation document. This helper returns the appropriate mutation based on the queue entry:

```typescript
// src/offline/graphql.ts
import { gql, type DocumentNode } from '@apollo/client';

// Define your mutation documents (matching your AppSync schema)
const CREATE_POST = gql`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      id title content status rating owner
      _version _deleted _lastChangedAt
      createdAt updatedAt
    }
  }
`;

const UPDATE_POST = gql`
  mutation UpdatePost($input: UpdatePostInput!) {
    updatePost(input: $input) {
      id title content status rating owner
      _version _deleted _lastChangedAt
      createdAt updatedAt
    }
  }
`;

const DELETE_POST = gql`
  mutation DeletePost($input: DeletePostInput!) {
    deletePost(input: $input) {
      id _version _deleted _lastChangedAt
    }
  }
`;

// Registry: map modelName + operation to GraphQL document
const mutationRegistry: Record<
  string,
  Record<string, DocumentNode>
> = {
  Post: {
    CREATE: CREATE_POST,
    UPDATE: UPDATE_POST,
    DELETE: DELETE_POST,
  },
  // Add entries for each model in your schema:
  // Comment: { CREATE: CREATE_COMMENT, UPDATE: UPDATE_COMMENT, DELETE: DELETE_COMMENT },
};

export function getMutationForOperation(
  modelName: string,
  operation: 'CREATE' | 'UPDATE' | 'DELETE',
): DocumentNode {
  const model = mutationRegistry[modelName];
  if (!model) {
    throw new Error(`No mutations registered for model: ${modelName}`);
  }
  const mutation = model[operation];
  if (!mutation) {
    throw new Error(
      `No ${operation} mutation registered for model: ${modelName}`
    );
  }
  return mutation;
}
```

### dequeueAndSyncVersions

This function is critical for correctness. After a mutation succeeds, the server returns the record with an updated `_version`. If other mutations for the same record are still in the queue, they must use this new `_version` -- otherwise they will conflict.

DataStore's `outbox.syncOutboxVersionsOnDequeue()` does exactly this. Here is the equivalent:

```typescript
// src/offline/mutationQueue.ts (continued)

/**
 * Remove a completed mutation from the queue and propagate the
 * server-returned _version to remaining entries for the same record.
 *
 * Why this matters: If you update a Post twice while offline, the queue
 * has two entries. When the first UPDATE succeeds, the server increments
 * _version from 1 to 2. The second UPDATE must use _version: 2, not
 * _version: 1. Without this propagation, the second mutation always
 * triggers a ConflictUnhandled error.
 */
async function dequeueAndSyncVersions(
  completedEntry: MutationQueueEntry,
  serverResponse: Record<string, any>,
): Promise<void> {
  await db.transaction('rw', db.mutationQueue, async () => {
    // Remove the completed entry
    await db.mutationQueue.delete(completedEntry.id);

    // Find remaining entries for the same record
    const remaining = await db.mutationQueue
      .where('modelId')
      .equals(completedEntry.modelId)
      .toArray();

    // Propagate _version and _lastChangedAt from server response
    for (const entry of remaining) {
      const data = JSON.parse(entry.data);
      data._version = serverResponse._version;
      data._lastChangedAt = serverResponse._lastChangedAt;
      await db.mutationQueue.update(entry.id, {
        data: JSON.stringify(data),
      });
    }
  });
}
```

### The Queue Processor

The processor drains the queue one entry at a time. It stops when the queue is empty or when connectivity is lost:

```typescript
// src/offline/mutationQueue.ts (continued)
import { apolloClient } from './apollo-setup';
import { getMutationForOperation } from './graphql';

/**
 * Determine if an error is a network/transport error (retryable)
 * vs a permanent GraphQL error (should not retry).
 */
function isNetworkError(error: any): boolean {
  // Apollo Client sets networkError for transport failures
  if (error?.networkError) return true;
  // Check for fetch failures (offline, DNS, timeout)
  if (error?.message?.includes('Failed to fetch')) return true;
  if (error?.message?.includes('Network request failed')) return true;
  return false;
}

/**
 * Process the mutation queue in FIFO order.
 * Called when connectivity is restored or after a local mutation while online.
 */
export async function processMutationQueue(
  connectivity: ConnectivityMonitor,
  conflictHandler: ConflictHandler,
): Promise<void> {
  if (!connectivity.online) return;

  let consecutiveFailures = 0;
  const MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes (matches DataStore)
  const BASE_DELAY_MS = 100;

  while (connectivity.online) {
    // Peek at head of queue (FIFO by createdAt)
    const head = await db.mutationQueue
      .orderBy('createdAt')
      .first();

    if (!head) break; // Queue empty -- done

    // Mark as in-progress to prevent duplicate processing
    await db.mutationQueue.update(head.id, { inProgress: true });

    try {
      const mutation = getMutationForOperation(
        head.modelName,
        head.operation,
      );

      const result = await apolloClient.mutate({
        mutation,
        variables: { input: JSON.parse(head.data) },
      });

      // Success -- dequeue and propagate _version
      const serverRecord =
        result.data[Object.keys(result.data)[0]];
      await dequeueAndSyncVersions(head, serverRecord);

      // Also update the local Dexie.js table with server response
      // (gets the authoritative _version and timestamps)
      if (head.operation !== 'DELETE') {
        const tableName =
          head.modelName.toLowerCase() + 's';
        await db.table(tableName).put(serverRecord);
      }

      consecutiveFailures = 0; // Reset backoff on success

    } catch (error: any) {
      // Check for conflict errors (handled separately)
      const gqlErrors = error?.graphQLErrors ?? [];
      const conflictError = gqlErrors.find(
        (e: any) => e.errorType === 'ConflictUnhandled',
      );

      if (conflictError) {
        // Delegate to conflict handler (covered in guide/15)
        await handleConflict(
          head,
          conflictError,
          conflictHandler,
        );
        consecutiveFailures = 0;
        continue;
      }

      if (isNetworkError(error)) {
        // Network error -- unmark and stop processing.
        // The connectivity monitor will re-trigger when online.
        await db.mutationQueue.update(head.id, {
          inProgress: false,
        });

        consecutiveFailures++;

        if (consecutiveFailures >= 3) {
          // Backoff: wait before retrying
          const delay = Math.min(
            BASE_DELAY_MS * Math.pow(2, consecutiveFailures),
            MAX_BACKOFF_MS,
          );
          // Add jitter (0-50% of delay) to prevent thundering herd
          const jitter = delay * Math.random() * 0.5;
          await new Promise(r =>
            setTimeout(r, delay + jitter),
          );
          continue;
        }

        break; // Stop processing, will resume on reconnect
      }

      // Permanent error (auth, validation, schema mismatch).
      // Dequeue to prevent infinite loop. Log for debugging.
      console.error(
        `[MutationQueue] Permanent error for ${head.modelName}` +
          ` ${head.operation} (${head.modelId}):`,
        error,
      );
      await db.mutationQueue.delete(head.id);
    }
  }
}
```

### Conflict Handling (Preview)

When the queue processor encounters a `ConflictUnhandled` error, it calls the conflict handler. The full conflict resolution pattern is covered in [Sync Engine and Conflict Resolution](./15-sync-engine.md). Here is the minimal handler used by the queue processor:

```typescript
// src/offline/mutationQueue.ts (continued)

type ConflictHandler = (conflict: {
  localModel: Record<string, any>;
  remoteModel: Record<string, any>;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  attempts: number;
}) => Record<string, any> | 'DISCARD'
  | Promise<Record<string, any> | 'DISCARD'>;

// Default: "last writer wins" -- retry with server's _version
const defaultConflictHandler: ConflictHandler = ({
  localModel,
  remoteModel,
}) => {
  return { ...localModel, _version: remoteModel._version };
};

async function handleConflict(
  entry: MutationQueueEntry,
  conflictError: any,
  conflictHandler: ConflictHandler,
  maxAttempts: number = 10,
): Promise<void> {
  let attempts = 0;
  let currentData = JSON.parse(entry.data);

  while (attempts < maxAttempts) {
    attempts++;

    const resolution = await conflictHandler({
      localModel: currentData,
      remoteModel: conflictError.data,
      operation: entry.operation,
      attempts,
    });

    if (resolution === 'DISCARD') {
      // Accept server version -- merge into local DB
      const tableName = entry.modelName.toLowerCase() + 's';
      await db.table(tableName).put(conflictError.data);
      await db.mutationQueue.delete(entry.id);
      return;
    }

    // Retry with resolved data
    try {
      const mutation = getMutationForOperation(
        entry.modelName,
        entry.operation,
      );
      const result = await apolloClient.mutate({
        mutation,
        variables: { input: resolution },
      });

      const serverRecord =
        result.data[Object.keys(result.data)[0]];
      await dequeueAndSyncVersions(entry, serverRecord);
      return;
    } catch (retryError: any) {
      const retryConflict = retryError?.graphQLErrors?.find(
        (e: any) => e.errorType === 'ConflictUnhandled',
      );
      if (retryConflict) {
        conflictError = retryConflict;
        currentData = resolution as Record<string, any>;
        continue;
      }
      throw retryError; // Non-conflict error, let caller handle
    }
  }

  // Exceeded max attempts -- auto-discard
  console.warn(
    `[MutationQueue] Max conflict attempts (${maxAttempts}) reached` +
      ` for ${entry.modelName} ${entry.modelId}. Discarding local changes.`,
  );
  await db.mutationQueue.delete(entry.id);
}
```

<!-- ai:connectivity-monitor -->

## Connectivity Monitoring

The `ConnectivityMonitor` class tracks whether the device can reach the network. It uses two signals:

1. **`navigator.onLine` + `online`/`offline` window events.** This is what DataStore's `Reachability` class uses. It detects when the browser loses all network connectivity (airplane mode, WiFi off, etc.).

2. **WebSocket subscription disconnection.** DataStore's `DataStoreConnectivity` additionally monitors the AppSync WebSocket connection. If the subscription socket drops (server-side disconnect, network partition), the monitor treats the app as offline even if `navigator.onLine` still reports `true`. This catches connectivity issues that the browser's online/offline events miss.

### Implementation

```typescript
// src/offline/connectivity.ts

type ConnectionHandler = (online: boolean) => void;

export class ConnectivityMonitor {
  private listeners: Set<ConnectionHandler> = new Set();
  private _online: boolean = navigator.onLine;
  private stabilizationTimer: ReturnType<typeof setTimeout> | null =
    null;

  constructor() {
    window.addEventListener('online', () => {
      this.handleOnlineEvent(true);
    });
    window.addEventListener('offline', () => {
      this.handleOnlineEvent(false);
    });
  }

  /** Current connectivity state. */
  get online(): boolean {
    return this._online;
  }

  /**
   * Subscribe to connectivity changes.
   * The handler is called immediately with the current state,
   * then again on each transition.
   *
   * @returns An unsubscribe function.
   */
  subscribe(handler: ConnectionHandler): () => void {
    this.listeners.add(handler);
    // Emit current state immediately (matches DataStore pattern)
    handler(this._online);
    return () => this.listeners.delete(handler);
  }

  /**
   * Call this when the AppSync subscription WebSocket disconnects.
   * Sets the state to offline immediately, then re-checks after
   * a 5-second stabilization delay.
   *
   * The delay prevents "flapping" -- rapid online/offline transitions
   * that would trigger unnecessary sync cycles. DataStore uses the
   * same 5-second delay in datastoreConnectivity.ts.
   */
  notifySocketDisconnect(): void {
    this.setOnline(false);

    // Clear any existing stabilization timer
    if (this.stabilizationTimer) {
      clearTimeout(this.stabilizationTimer);
    }

    // Re-check actual connectivity after stabilization delay
    this.stabilizationTimer = setTimeout(() => {
      this.stabilizationTimer = null;
      this.setOnline(navigator.onLine);
    }, 5000);
  }

  /** Clean up event listeners (call on app teardown). */
  destroy(): void {
    window.removeEventListener('online', this.handleOnlineEvent);
    window.removeEventListener('offline', this.handleOnlineEvent);
    if (this.stabilizationTimer) {
      clearTimeout(this.stabilizationTimer);
    }
    this.listeners.clear();
  }

  private handleOnlineEvent = (online: boolean): void => {
    // When going online, add a short stabilization delay to
    // avoid triggering sync during brief connectivity flickers
    if (online && !this._online) {
      if (this.stabilizationTimer) {
        clearTimeout(this.stabilizationTimer);
      }
      this.stabilizationTimer = setTimeout(() => {
        this.stabilizationTimer = null;
        this.setOnline(navigator.onLine);
      }, 5000);
      return;
    }

    // Going offline is immediate -- no delay needed
    if (!online) {
      if (this.stabilizationTimer) {
        clearTimeout(this.stabilizationTimer);
        this.stabilizationTimer = null;
      }
      this.setOnline(false);
    }
  };

  private setOnline(online: boolean): void {
    if (this._online === online) return;
    this._online = online;
    this.listeners.forEach(handler => handler(online));
  }
}
```

### Wiring Connectivity to Queue Processing

When the monitor detects a transition from offline to online, trigger the mutation queue processor and (when implemented) the sync engine:

```typescript
// src/offline/init.ts
import { ConnectivityMonitor } from './connectivity';
import { processMutationQueue } from './mutationQueue';

const connectivity = new ConnectivityMonitor();

connectivity.subscribe((online) => {
  if (online) {
    // Drain pending mutations
    processMutationQueue(connectivity, defaultConflictHandler);

    // Sync engine triggers separately (see guide/15-sync-engine.md)
    // syncAllModels(connectivity);
  }
});
```

### DataStore Comparison

DataStore's connectivity monitoring does the same thing with less visible code. Here is the mapping:

| DataStore Component | Guide Equivalent | Behavior |
|-------------------|-----------------|----------|
| `Reachability` class | `window.addEventListener('online'/'offline')` | Browser-level connectivity detection |
| `DataStoreConnectivity` | `ConnectivityMonitor.notifySocketDisconnect()` | WebSocket disruption detection with 5s stabilization |
| `SyncEngine.startDisruptionListener()` | `connectivity.subscribe()` callback | Triggers sync + queue drain on reconnect |
| Hub event `CONNECTION_DISRUPTED` | Your subscription error handler calling `notifySocketDisconnect()` | Socket-level connectivity signal |

The main difference is that DataStore wires everything together internally. With this architecture, you connect the pieces explicitly -- which means you can customize the behavior (for example, skipping sync for certain models, or adding a longer delay for mobile).

<!-- ai:offline-data-manager -->

## The OfflineDataManager Write Path

The `OfflineDataManager` is the facade that your application calls for all data operations. This section shows the write path -- `save()` and `delete()`. The read path (`query()`) reads directly from Dexie.js and does not involve the mutation queue.

### save()

The save method writes to the local database first (for instant UI update), then enqueues a mutation. If the device is online, it immediately triggers queue processing:

```typescript
// src/offline/manager.ts
import { db } from './database';
import { enqueueMutation, processMutationQueue } from './mutationQueue';
import type { ConnectivityMonitor } from './connectivity';
import type { Post } from './types';

interface OfflineDataManagerConfig {
  connectivity: ConnectivityMonitor;
  conflictHandler: ConflictHandler;
}

export class OfflineDataManager {
  private connectivity: ConnectivityMonitor;
  private conflictHandler: ConflictHandler;

  constructor(config: OfflineDataManagerConfig) {
    this.connectivity = config.connectivity;
    this.conflictHandler = config.conflictHandler;
  }

  /**
   * Save a record locally and enqueue a mutation for remote sync.
   *
   * @param modelName - The model name (e.g., 'Post')
   * @param record - The full record to save
   * @param isNew - True for CREATE, false for UPDATE
   */
  async save<T extends { id: string }>(
    modelName: string,
    record: T,
    isNew: boolean = false,
  ): Promise<T> {
    const tableName = modelName.toLowerCase() + 's';

    // Step 1: Write to local database immediately
    await db.table(tableName).put(record);

    // Step 2: Enqueue mutation for remote sync
    await enqueueMutation({
      modelName,
      modelId: record.id,
      operation: isNew ? 'CREATE' : 'UPDATE',
      data: JSON.stringify(record),
      condition: '{}',
    });

    // Step 3: If online, trigger queue processing
    if (this.connectivity.online) {
      // Fire-and-forget -- don't block the save on network
      processMutationQueue(
        this.connectivity,
        this.conflictHandler,
      ).catch(err =>
        console.error('[OfflineDataManager] Queue processing error:', err),
      );
    }

    return record;
  }

  /**
   * Delete a record locally and enqueue a DELETE mutation.
   */
  async delete(
    modelName: string,
    recordId: string,
    version: number,
  ): Promise<void> {
    const tableName = modelName.toLowerCase() + 's';

    // Step 1: Mark as deleted locally (soft delete for sync)
    await db.table(tableName).update(recordId, {
      _deleted: true,
    });

    // Step 2: Enqueue DELETE mutation
    await enqueueMutation({
      modelName,
      modelId: recordId,
      operation: 'DELETE',
      data: JSON.stringify({
        id: recordId,
        _version: version,
      }),
      condition: '{}',
    });

    // Step 3: If online, trigger queue processing
    if (this.connectivity.online) {
      processMutationQueue(
        this.connectivity,
        this.conflictHandler,
      ).catch(err =>
        console.error('[OfflineDataManager] Queue processing error:', err),
      );
    }
  }

  /**
   * Query records from the local database.
   * No network involvement -- reads directly from Dexie.js.
   */
  async query<T>(
    modelName: string,
    filter?: (item: T) => boolean,
  ): Promise<T[]> {
    const tableName = modelName.toLowerCase() + 's';
    let collection = db.table(tableName)
      .where('_deleted')
      .equals(0); // Only non-deleted records

    const results = await collection.toArray();

    if (filter) {
      return results.filter(filter) as T[];
    }
    return results as T[];
  }
}
```

### Usage Example

```typescript
// In your React component or service
import { OfflineDataManager } from './offline/manager';
import { ConnectivityMonitor } from './offline/connectivity';

const connectivity = new ConnectivityMonitor();
const manager = new OfflineDataManager({
  connectivity,
  conflictHandler: defaultConflictHandler,
});

// Creating a new post (works offline)
const newPost = {
  id: crypto.randomUUID(),
  title: 'My Post',
  content: 'Written while offline',
  _version: 1,
  _deleted: false,
  _lastChangedAt: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

await manager.save('Post', newPost, true); // isNew = true -> CREATE

// Updating the post (works offline)
const updated = { ...newPost, title: 'Updated Title' };
await manager.save('Post', updated); // isNew = false -> UPDATE

// Deleting the post (works offline)
await manager.delete('Post', newPost.id, newPost._version);

// Querying (always local, always fast)
const posts = await manager.query<Post>('Post');
```

Note that `query()` reads from Dexie.js, which means results are available immediately even when offline. The data may be stale if sync has not run recently -- this is the trade-off of offline-first. The sync engine (covered in [guide/15](./15-sync-engine.md)) keeps the local database up to date when connectivity is available.

<!-- ai:sign-out -->

## Sign-Out: Clearing Offline State

When a user signs out, you must clear the mutation queue and all local data to prevent the next user from seeing or syncing stale data. This mirrors DataStore's `DataStore.clear()` behavior.

```typescript
// src/offline/manager.ts (continued)

/**
 * Clear all offline state on sign-out.
 * Call this BEFORE Amplify.signOut().
 *
 * Order matters:
 * 1. Clear mutation queue (prevent sending stale mutations)
 * 2. Clear sync metadata (force full sync on next sign-in)
 * 3. Clear all data tables (remove previous user's data)
 */
async function clearOfflineState(): Promise<void> {
  await db.mutationQueue.clear();
  await db.syncMetadata.clear();
  await db.posts.clear();
  await db.comments.clear();
  // Add db.tableName.clear() for each model table
}
```

Integrate this into your sign-out flow:

```typescript
import { signOut } from 'aws-amplify/auth';

async function handleSignOut(): Promise<void> {
  // 1. Clear offline state (mutation queue + Dexie.js tables)
  await clearOfflineState();

  // 2. Clear Apollo Client cache
  await apolloClient.clearStore();

  // 3. Sign out via Amplify (clears auth tokens)
  await signOut();
}
```

**Warning:** Do NOT call `clearOfflineState()` after `signOut()`. The sign-out invalidates auth tokens, and some Dexie.js operations may fail if they trigger async side effects that attempt network calls with an expired token. Always clear local state first.

<!-- ai:testing -->

## Testing Your Mutation Queue

Use browser DevTools to verify the mutation queue is working correctly.

### Manual Testing Steps

1. **Open IndexedDB inspector.** In Chrome: DevTools > Application > Storage > IndexedDB > MyAppOfflineDB > mutationQueue.

2. **Go offline.** DevTools > Network tab > check "Offline" (or toggle airplane mode).

3. **Perform mutations in your app.** Create a post, update it, delete another post.

4. **Verify queue entries.** Refresh the IndexedDB view. You should see entries in the `mutationQueue` table, one per unique `modelId` (not one per operation, thanks to dedup).

5. **Check dedup behavior.** Create a post, then update its title twice while offline. You should see only ONE queue entry (a CREATE with the latest title), not three entries.

6. **Go back online.** Uncheck "Offline" in the Network tab.

7. **Verify queue drains.** Watch the `mutationQueue` table -- entries should disappear as they are processed. Check the Network tab to confirm GraphQL mutations are sent to AppSync.

### Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Entries not appearing in queue | Forgot to call `enqueueMutation()` after local write | Ensure both `db.table.put()` and `enqueueMutation()` are called |
| Entries not draining when online | Connectivity monitor not wired to queue processor | Verify `connectivity.subscribe()` callback triggers `processMutationQueue()` |
| Multiple entries for same record | Dedup logic not running (transaction issue) | Ensure `enqueueMutation()` uses `db.transaction('rw', ...)` |
| Entries stuck with `inProgress: true` | Queue processor crashed mid-send | Add startup recovery: clear `inProgress` flags on app init |
| `ConflictUnhandled` on second mutation | `_version` not propagated after first mutation | Verify `dequeueAndSyncVersions()` updates remaining entries |
| Old user's data visible after sign-in | `clearOfflineState()` not called on sign-out | Add `clearOfflineState()` to your sign-out flow |

### Startup Recovery

If the app crashes or is closed while a mutation is in-progress, that entry may be stuck with `inProgress: true`. Add a recovery step on app startup:

```typescript
// src/offline/init.ts (run on app startup)
async function recoverStuckMutations(): Promise<void> {
  const stuck = await db.mutationQueue
    .where('inProgress')
    .equals(1) // Dexie stores booleans as 0/1 in indexes
    .toArray();

  for (const entry of stuck) {
    await db.mutationQueue.update(entry.id, {
      inProgress: false,
    });
  }

  if (stuck.length > 0) {
    console.log(
      `[MutationQueue] Recovered ${stuck.length} stuck entries`,
    );
  }
}
```

<!-- ai:next-steps -->

## Next Steps

The mutation queue handles the write path: local writes are queued and replayed when online. The remaining pieces of the offline-first architecture are:

- **[Sync Engine and Conflict Resolution](./15-sync-engine.md)** -- Implement the read path: base sync (full download), delta sync (incremental), the `mergeItemsIntoLocal()` function that respects pending mutations, the full conflict resolver, and the complete `OfflineDataManager` facade that ties everything together.

---

**Previous:** [Offline Architecture and Local Database Setup](./13-offline-architecture.md)

**Next:** [Sync Engine and Conflict Resolution](./15-sync-engine.md)
