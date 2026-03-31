<!-- ai:subscriptions -->

# Real-Time Subscriptions

This page explains how to set up real-time data updates in your migrated app. The key architectural decision is that **subscriptions use the Amplify library** (not Apollo), while queries and mutations continue to use Apollo Client. This hybrid approach exists because AppSync uses a custom WebSocket protocol that standard GraphQL subscription libraries cannot handle.

## Why Not Apollo Subscriptions?

AppSync uses a **custom WebSocket subprotocol** for real-time data. This is not the standard `graphql-ws` protocol or the older `subscriptions-transport-ws` protocol that Apollo Client's subscription libraries expect.

On iOS and Android, the **AWS AppSync Apollo Extensions library** handles this custom protocol natively. The hybrid approach uses Amplify for subscriptions because it already handles this protocol natively.

If you try to use standard Apollo subscription libraries with AppSync:

- The WebSocket connection will establish successfully (giving the appearance that it works)
- The connection then **immediately disconnects** with no helpful error message
- Subscription callbacks never fire, and debugging is extremely difficult because the failure is silent

The `aws-amplify` v6 library already has a production-tested implementation (`AWSAppSyncRealTimeProvider`) that handles the AppSync WebSocket protocol, including authentication, automatic reconnection, and token refresh. This works with both Gen 1 and Gen 2 backends. Rather than replicating this complex protocol handling, the guide uses Amplify for subscriptions and Apollo for everything else.

> **Warning:** Do NOT use `graphql-ws`, `subscriptions-transport-ws`, or Apollo's `WebSocketLink` with AppSync.
> These libraries do not speak AppSync's custom WebSocket protocol and will fail silently.

## Setting Up the Amplify Subscription Client

Create the Amplify client alongside your Apollo Client. You should already have Amplify configured at app startup (`Amplify.configure(config)` where `config` is your `amplifyconfiguration.json` or `aws-exports.js`):

```typescript
import { generateClient } from 'aws-amplify/api';

// Use alongside your Apollo Client (from apollo-setup)
// Amplify.configure(config) must have been called before this
const amplifyClient = generateClient();
```

You now have two clients:
- **`apolloClient`** — for queries, mutations, and caching (configured in [Apollo Client Setup](./04-apollo-setup.md))
- **`amplifyClient`** — for subscriptions only

> **Console warning:** If `generateClient()` is in a different file from `Amplify.configure()`, you may see the warning *"Amplify has not been configured"* in the console. This is because ES module imports execute before module body code, so `generateClient()` runs before `Amplify.configure()`. The warning is harmless — `generateClient()` creates a client proxy, and the actual configuration is resolved when you call `amplifyClient.graphql()` (which happens inside `useEffect`, well after Amplify is configured). This is the [standard Amplify pattern](https://docs.amplify.aws/react/build-a-backend/troubleshooting/library-not-configured/) for module-level client creation.

## Subscription GraphQL Definitions

AppSync generates three subscription types for each model: `onCreatePost`, `onUpdatePost`, and `onDeletePost`. These use the same `PostDetails` fragment defined in [Prerequisites](./03-prerequisites.md#graphql-fragment-for-reusable-field-selection):

```graphql
subscription OnCreatePost {
  onCreatePost {
    ...PostDetails
  }
}

subscription OnUpdatePost {
  onUpdatePost {
    ...PostDetails
  }
}

subscription OnDeletePost {
  onDeletePost {
    ...PostDetails
  }
}
```

The fragment includes `_version`, `_deleted`, and `_lastChangedAt` metadata fields, which are required when conflict resolution is enabled on your backend (see [Understanding _version Metadata](./03-prerequisites.md#understanding-_version-metadata)).

<!-- ai:pattern:refetch -->

## Pattern 1: Refetch on Subscription Event (Recommended)

The refetch pattern is the simplest and most reliable approach. When a subscription event fires, you refetch the list query from the server. This guarantees the UI always shows the latest server state.

```typescript
import { useQuery } from '@apollo/client';
import { useEffect } from 'react';
import { LIST_POSTS } from './graphql/queries';
import { generateClient } from 'aws-amplify/api';

const amplifyClient = generateClient();

function PostList() {
  const { data, loading, error, refetch } = useQuery(LIST_POSTS);

  useEffect(() => {
    // Note: TypeScript cannot infer that graphql() returns an Observable for
    // subscription queries (it types the return as Promise | Observable).
    // Cast to `any` to access .subscribe(), or use Amplify codegen for typed subscriptions.
    const subscriptions = [
      (amplifyClient.graphql({
        query: `subscription OnCreatePost {
          onCreatePost { id }
        }`
      }) as any).subscribe({
        next: () => refetch(),
        error: (err: any) => console.error('Create subscription error:', err),
      }),
      (amplifyClient.graphql({
        query: `subscription OnUpdatePost {
          onUpdatePost { id }
        }`
      }) as any).subscribe({
        next: () => refetch(),
        error: (err: any) => console.error('Update subscription error:', err),
      }),
      (amplifyClient.graphql({
        query: `subscription OnDeletePost {
          onDeletePost { id }
        }`
      }) as any).subscribe({
        next: () => refetch(),
        error: (err: any) => console.error('Delete subscription error:', err),
      }),
    ];

    return () => subscriptions.forEach(sub => sub.unsubscribe());
  }, [refetch]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const activePosts = data?.listPosts?.items?.filter(
    (post: any) => !post._deleted
  ) || [];

  return (
    <ul>
      {activePosts.map((post: any) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

**Why this pattern works well:**

- **The subscription payload only needs `id`** since you are refetching the full list anyway. This keeps the subscription lightweight.
- **Simple and reliable.** No cache manipulation logic to get wrong. The refetch guarantees consistency with the server.
- **One extra network round-trip per event.** For most applications, this latency is imperceptible (typically under 100ms for the refetch). If your app handles hundreds of events per second, consider Pattern 2 below.
- **Filters soft-deleted records** using the `_deleted` check in the render logic, matching the pattern from [Prerequisites](./03-prerequisites.md#filter-soft-deleted-records).

<!-- ai:pattern:cache-update -->

## Pattern 2: Direct Cache Update (Advanced)

For applications that need lower latency or handle high-frequency updates, you can update Apollo's cache directly from subscription data instead of refetching. This avoids the extra network round-trip but requires more code and careful cache management.

```typescript
import { useQuery } from '@apollo/client';
import { useEffect } from 'react';
import { LIST_POSTS, POST_DETAILS_FRAGMENT } from './graphql/queries';
import { apolloClient } from './apolloClient';
import { generateClient } from 'aws-amplify/api';

const amplifyClient = generateClient();

function PostListAdvanced() {
  const { data, loading, error } = useQuery(LIST_POSTS);

  useEffect(() => {
    const sub = (amplifyClient.graphql({
      query: `subscription OnCreatePost {
        onCreatePost {
          id title content status rating
          _version _deleted _lastChangedAt
          createdAt updatedAt owner
        }
      }`
    }) as any).subscribe({
      next: ({ data }: any) => {
        const newPost = data.onCreatePost;
        apolloClient.cache.modify({
          fields: {
            listPosts(existingData = { items: [] }) {
              const newRef = apolloClient.cache.writeFragment({
                data: newPost,
                fragment: POST_DETAILS_FRAGMENT,
              });
              return {
                ...existingData,
                items: [...existingData.items, newRef],
              };
            },
          },
        });
      },
      error: (err: any) => console.error('Create subscription error:', err),
    });

    return () => sub.unsubscribe();
  }, []);

  // ... render logic
}
```

**Key differences from Pattern 1:**

- **The subscription payload must include all fields** (not just `id`) because you are writing the data directly into the cache.
- **You must handle all three event types** (create, update, delete) separately with different cache update logic. The example above only shows `onCreatePost` for brevity.
- **Cache updates can get out of sync** if the subscription misses events (network disconnect). Consider adding a periodic refetch as a safety net.

> **Recommendation:** Start with Pattern 1 (refetch). Only move to Pattern 2 if you have measured a performance problem with the refetch approach.

<!-- ai:comparison:observe -->

## DataStore Comparison

Here is how DataStore's real-time APIs map to the hybrid Apollo + Amplify approach:

| DataStore | Amplify + Apollo (Hybrid) |
|-----------|--------------------------|
| `DataStore.observe(Post).subscribe(...)` | `amplifyClient.graphql({ query: onCreatePost }).subscribe(...)` |
| `DataStore.observeQuery(Post)` | `useQuery(LIST_POSTS)` + subscription refetch |
| Automatic per-model subscriptions | Manual setup per subscription type (create, update, delete) |
| Real-time + local DB sync | Real-time + Apollo cache refetch or `cache.modify` |
| Single observe call for all event types | Separate subscription per event type |
| Predicate-based filtering in observe | Filter in subscription callback or use subscription arguments |

The main difference is granularity: DataStore's `observe()` gave you all events for a model type in one call. With the hybrid approach, you subscribe to each event type (`onCreate`, `onUpdate`, `onDelete`) individually and handle them in your component.

## Cleanup on Unmount

Always unsubscribe when your component unmounts. Failing to clean up subscriptions causes memory leaks and can result in errors when subscription callbacks try to update unmounted components.

The array pattern shown in Pattern 1 is the recommended approach for managing multiple subscriptions:

```typescript
useEffect(() => {
  // Create an array of all subscriptions (cast to any for TypeScript)
  const subscriptions = [
    (amplifyClient.graphql({ query: '...' }) as any).subscribe({ next: () => refetch() }),
    (amplifyClient.graphql({ query: '...' }) as any).subscribe({ next: () => refetch() }),
    (amplifyClient.graphql({ query: '...' }) as any).subscribe({ next: () => refetch() }),
  ];

  // Clean up all subscriptions on unmount
  return () => subscriptions.forEach(sub => sub.unsubscribe());
}, [refetch]);
```

If you only have a single subscription, the cleanup is simpler:

```typescript
useEffect(() => {
  const sub = (amplifyClient.graphql({ query: '...' }) as any).subscribe({
    next: () => refetch(),
  });

  return () => sub.unsubscribe();
}, [refetch]);
```

## Troubleshooting

### Subscription connects but never fires

The subscription name must match your schema exactly. AppSync subscriptions are generated as `onCreateModelName`, `onUpdateModelName`, and `onDeleteModelName` (camelCase with the model name). For example, for a `Post` model:
- Correct: `onCreatePost`
- Wrong: `onPostCreated`, `OnCreatePost` (capital O in the field name), `createPost`

Check your AppSync schema in the AWS console to confirm the exact subscription field names.

### Auth error on subscription

Amplify must be configured **before** the subscription client is used. Make sure `Amplify.configure(config)` runs at app startup (typically in your entry file) before any component calls `amplifyClient.graphql()`. A module-level `const amplifyClient = generateClient()` may log a *"not configured"* warning at import time, but this is harmless — the client resolves its configuration when `graphql()` is actually called, which happens inside `useEffect` after Amplify is configured. If subscriptions fail with auth errors, verify that `Amplify.configure()` runs before your app renders.

### Subscription disconnects after ~5 minutes of inactivity

This is normal behavior. AppSync WebSocket connections have a keep-alive mechanism, but idle connections may be closed by the server or intermediate proxies. Amplify's `AWSAppSyncRealTimeProvider` handles automatic reconnection -- it will re-establish the connection and resume the subscription without any action on your part. You do not need to add reconnection logic.

### Subscription works in development but not in production

Check that your Amplify configuration file (`amplifyconfiguration.json` or `aws-exports.js`) is correct for the production environment. The GraphQL endpoint URL and auth configuration must match your deployed backend. Also verify that CORS is configured on your AppSync API to allow WebSocket connections from your production domain.

### Subscription connects but receives no events (owner-based auth)

If your model uses **owner-based authorization** (`@auth(rules: [{ allow: owner }])`), you must pass the `$owner` variable in your subscriptions. Without it, the subscription connects successfully but AppSync silently filters out all events. This is the most common cause of "subscriptions work but nothing happens." See [React Integration — Owner-Based Auth Subscriptions](./10-react-integration.md#owner-based-auth-subscriptions) for the complete pattern.

---

**Next:** [Migration Checklists](./06-migration-checklist.md) -- Pre/during/post checklists for planning and tracking your migration.

**Previous:** [Apollo Client Setup](./04-apollo-setup.md)
