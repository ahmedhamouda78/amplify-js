<!-- ai:react-integration -->

# React Integration and Real-Time Observation

This page covers two related topics: (1) migrating React components from imperative DataStore calls to declarative Apollo hooks, and (2) replacing DataStore's real-time observation APIs with Apollo + Amplify subscription patterns.

After completing this page, you will be able to convert any React component that uses DataStore into one that uses Apollo Client for queries and mutations, with Amplify handling real-time subscriptions.

**Prerequisites:**

- `ApolloProvider` must wrap your app (see [Apollo Client Setup](./04-apollo-setup.md#connecting-to-react))
- The Amplify subscription client must be configured (see [Subscriptions](./05-subscriptions.md))
- GraphQL operations (`LIST_POSTS`, `CREATE_POST`, `UPDATE_POST`, `DELETE_POST`, `GET_POST`) are defined in the [Prerequisites](./03-prerequisites.md#complete-operation-definitions) page

> **TypeScript note:** Throughout this page, subscription calls use `(amplifyClient.graphql({ ... }) as any).subscribe()`. The `as any` cast is needed because TypeScript cannot infer at compile time that `graphql()` returns an Observable (not a Promise) for subscription queries. See [Subscriptions](./05-subscriptions.md) for details. All subscription code examples in this section require this cast.

---

<!-- ai:apollo-provider -->

## ApolloProvider Setup

ApolloProvider setup is covered in [Apollo Client Setup](./04-apollo-setup.md#connecting-to-react). Make sure `<ApolloProvider client={apolloClient}>` wraps your app root before using any hooks on this page.

```typescript
import { ApolloProvider } from '@apollo/client';
import { apolloClient } from './apolloClient';

function App() {
  return <ApolloProvider client={apolloClient}>{/* ... */}</ApolloProvider>;
}
```

Any component rendered inside `ApolloProvider` can use `useQuery`, `useMutation`, and other Apollo hooks without additional configuration.

### Important: Apollo Hooks and the Authenticator Boundary

> **Warning:** Apollo hooks like `useQuery` fire immediately when a component mounts. If you place `useQuery` in the same component that renders `<Authenticator>`, the query will execute **before the user signs in**, producing 401 errors and retry storms.

```typescript
// WRONG — useQuery fires before the user authenticates
function App() {
  const { data } = useQuery(LIST_POSTS); // Fires immediately on mount!
  return (
    <Authenticator>
      {({ signOut, user }) => <div>{/* uses data */}</div>}
    </Authenticator>
  );
}
```

The fix is to extract an inner component that is only rendered after successful authentication:

```typescript
// CORRECT — queries only fire after the user is authenticated
function AppContent({ signOut, user }: { signOut?: () => void; user: any }) {
  const { data } = useQuery(LIST_POSTS); // Fires after auth, has valid token
  return <div>{/* uses data */}</div>;
}

function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => <AppContent signOut={signOut} user={user} />}
    </Authenticator>
  );
}
```

This pattern ensures that all `useQuery` and `useMutation` hooks only mount after the user has authenticated, so the auth link in your Apollo Client has a valid Cognito token to inject.

> **Naming the `signOut` prop:** The Authenticator's render prop provides a `signOut` function. If your `AppContent` component also imports Amplify's `signOut` from `aws-amplify/auth`, these names will collide. Rename the prop (e.g., `signOutFn`) or the import to avoid shadowing. See [Apollo Client Setup — Sign-Out](./04-apollo-setup.md) for the full `handleSignOut` pattern that clears Apollo's cache before signing out.

---

<!-- ai:component-migration -->

## Component Migration: Imperative to Declarative

This section shows a complete before/after migration of a typical DataStore React component. This is the core paradigm shift: from imperative state management to declarative Apollo hooks.

### Before: DataStore Component

```typescript
import { useState, useEffect } from 'react';
import { DataStore } from 'aws-amplify/datastore';
import { Post } from './models';

function PostList() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    DataStore.query(Post).then(results => {
      setPosts(results);
      setLoading(false);
    });
  }, []);

  const handleDelete = async (post: Post) => {
    await DataStore.delete(post);
    setPosts(prev => prev.filter(p => p.id !== post.id));
  };

  if (loading) return <p>Loading...</p>;
  return (
    <ul>
      {posts.map(post => (
        <li key={post.id}>
          {post.title}
          <button onClick={() => handleDelete(post)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}
```

### After: Apollo Client Component

```typescript
import { useQuery, useMutation } from '@apollo/client';
import { LIST_POSTS, DELETE_POST } from './graphql/operations';

function PostList() {
  const { data, loading, error } = useQuery(LIST_POSTS);
  const [deletePost] = useMutation(DELETE_POST, {
    refetchQueries: [{ query: LIST_POSTS }],
  });

  const handleDelete = async (post: any) => {
    await deletePost({
      variables: { input: { id: post.id, _version: post._version } },
    });
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  const posts = data?.listPosts?.items?.filter((p: any) => !p._deleted) || [];
  return (
    <ul>
      {posts.map((post: any) => (
        <li key={post.id}>
          {post.title}
          <button onClick={() => handleDelete(post)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}
```

### Key Differences

| Aspect | DataStore | Apollo Client |
|--------|-----------|---------------|
| Data fetching | `useState` + `useEffect` + `DataStore.query()` | `useQuery()` handles everything |
| Loading state | Manual `useState(true)` / `setLoading(false)` | Built-in `loading` from `useQuery` |
| Error handling | Not exposed (DataStore swallowed errors) | Built-in `error` from `useQuery` |
| Mutation response | Manual state update (`setPosts(prev => ...)`) | `refetchQueries` triggers automatic re-fetch |
| Delete input | Pass the model instance | Must include `id` AND `_version` |
| Soft-deleted records | Filtered automatically | Must filter `_deleted` records manually |

---

<!-- ai:loading-error -->

## Loading and Error States

DataStore had no loading state concept. `DataStore.query()` returned a Promise, but there was no built-in way to know if initial sync was complete or if an error occurred. Apollo hooks provide explicit `loading`, `error`, and `data` states.

### useQuery States

```typescript
const { data, loading, error } = useQuery(LIST_POSTS);

// loading: true while the fetch is in-flight
// error: ApolloError if the query failed (network or GraphQL error)
// data: the query result (undefined until the first successful fetch)
```

### cache-and-network Fetch Policy

When using `fetchPolicy: 'cache-and-network'`, both `loading` and `data` can be truthy simultaneously. Apollo returns cached data immediately, then refetches from the network in the background:

```typescript
const { data, loading, error } = useQuery(LIST_POSTS, {
  fetchPolicy: 'cache-and-network',
});

// First load: loading=true, data=undefined
// Cache hit + background refetch: loading=true, data=<cached result>
// Refetch complete: loading=false, data=<fresh result>

// Only show a spinner on the first load (no cached data yet)
if (loading && !data) return <p>Loading...</p>;

// Show a subtle refresh indicator when updating cached data
const posts = data?.listPosts?.items?.filter((p: any) => !p._deleted) || [];
return (
  <div>
    {loading && <span>Refreshing...</span>}
    <ul>
      {posts.map((post: any) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  </div>
);
```

This is the closest Apollo equivalent to DataStore's `observeQuery` behavior, where cached data was shown immediately while sync continued in the background.

### useMutation Loading and Error States

```typescript
const [createPost, { loading: creating, error: createError }] = useMutation(
  CREATE_POST,
  { refetchQueries: [{ query: LIST_POSTS }] }
);

// creating: true while the mutation is in-flight
// Use it to disable the submit button and show progress
return (
  <form onSubmit={handleSubmit}>
    {createError && <p className="error">Error: {createError.message}</p>}
    <button type="submit" disabled={creating}>
      {creating ? 'Creating...' : 'Create Post'}
    </button>
  </form>
);
```

### Error Boundary Pattern

For unrecoverable errors (such as a broken GraphQL endpoint or expired auth), use a React error boundary so that a single failing query does not crash the entire application:

```typescript
import { useQuery } from '@apollo/client';

function PostListWithErrorHandling() {
  const { data, loading, error } = useQuery(LIST_POSTS);

  if (loading && !data) return <p>Loading...</p>;

  if (error) {
    // Check if it is an auth error that needs a redirect
    const isAuthError = error.message.includes('Unauthorized')
      || error.message.includes('401');
    if (isAuthError) {
      return <p>Your session has expired. Please <a href="/signin">sign in</a> again.</p>;
    }
    // For other errors, show a retry option
    return (
      <div>
        <p>Something went wrong: {error.message}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  const posts = data?.listPosts?.items?.filter((p: any) => !p._deleted) || [];
  return (
    <ul>
      {posts.map((post: any) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

---

<!-- ai:observe-migration -->

## Migrating DataStore.observe()

DataStore's `observe()` returned a single Observable with an `opType` field (INSERT, UPDATE, DELETE) for all change events on a model. The migration replaces this with three separate Amplify subscriptions, one for each event type.

> **Important:** Subscriptions use Amplify's `generateClient()`, not Apollo. AppSync uses a custom WebSocket protocol that standard GraphQL subscription libraries cannot handle. See [Subscriptions](./05-subscriptions.md) for the full explanation.

### Before: DataStore observe

```typescript
import { useState, useEffect } from 'react';
import { DataStore } from 'aws-amplify/datastore';
import { Post } from './models';

function PostList() {
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    // Initial load
    DataStore.query(Post).then(setPosts);

    // Subscribe to all changes
    const sub = DataStore.observe(Post).subscribe(msg => {
      if (msg.opType === 'INSERT') {
        setPosts(prev => [...prev, msg.element]);
      }
      if (msg.opType === 'UPDATE') {
        setPosts(prev =>
          prev.map(p => (p.id === msg.element.id ? msg.element : p))
        );
      }
      if (msg.opType === 'DELETE') {
        setPosts(prev => prev.filter(p => p.id !== msg.element.id));
      }
    });

    return () => sub.unsubscribe();
  }, []);

  return (
    <ul>
      {posts.map(post => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

### After: Amplify Subscriptions with Apollo refetch

```typescript
import { useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { generateClient } from 'aws-amplify/api';
import { LIST_POSTS } from './graphql/operations';

const amplifyClient = generateClient();

function PostList() {
  const { data, loading, error, refetch } = useQuery(LIST_POSTS);

  useEffect(() => {
    const subscriptions = [
      (amplifyClient.graphql({
        query: `subscription OnCreatePost {
          onCreatePost { id }
        }`,
      }) as any).subscribe({
        next: () => refetch(),
        error: (err: any) => console.error('Create subscription error:', err),
      }),
      (amplifyClient.graphql({
        query: `subscription OnUpdatePost {
          onUpdatePost { id }
        }`,
      }) as any).subscribe({
        next: () => refetch(),
        error: (err: any) => console.error('Update subscription error:', err),
      }),
      (amplifyClient.graphql({
        query: `subscription OnDeletePost {
          onDeletePost { id }
        }`,
      }) as any).subscribe({
        next: () => refetch(),
        error: (err: any) => console.error('Delete subscription error:', err),
      }),
    ];

    return () => subscriptions.forEach(sub => sub.unsubscribe());
  }, [refetch]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  const posts = data?.listPosts?.items?.filter((p: any) => !p._deleted) || [];
  return (
    <ul>
      {posts.map((post: any) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

### Key Differences from DataStore observe

- **Three subscriptions instead of one.** DataStore combined all event types into a single `observe()` call. Now you subscribe to `onCreatePost`, `onUpdatePost`, and `onDeletePost` separately.
- **Refetch instead of manual state updates.** Rather than updating local state for each event type, the subscription triggers a full refetch. This is simpler and guarantees consistency with the server. For direct cache updates, see [Subscriptions - Pattern 2](./05-subscriptions.md#pattern-2-direct-cache-update-advanced).
- **Subscription payloads only need `id`.** Since you are refetching the full list, the subscription does not need to return all fields.
- **Always clean up in the useEffect return.** Failing to unsubscribe causes memory leaks and errors when callbacks fire on unmounted components.

### Per-ID Observation

DataStore's `observe()` supported observing a single record by ID. To achieve the same result, subscribe to all events and filter in the callback:

```typescript
useEffect(() => {
  const sub = (amplifyClient.graphql({
    query: `subscription OnUpdatePost {
      onUpdatePost { id }
    }`,
  }) as any).subscribe({
    next: ({ data }: any) => {
      if (data.onUpdatePost.id === targetId) {
        refetch();
      }
    },
  });

  return () => sub.unsubscribe();
}, [targetId, refetch]);
```

---

<!-- ai:observe-query-migration -->

## Migrating DataStore.observeQuery()

`observeQuery()` combined an initial query with live updates into a single Observable that emitted snapshots. Each snapshot contained the full set of matching items and an `isSynced` flag. The Apollo equivalent is `useQuery` with `fetchPolicy: 'cache-and-network'` plus subscription-triggered refetch.

### Before: DataStore observeQuery

```typescript
import { useState, useEffect } from 'react';
import { DataStore, SortDirection } from 'aws-amplify/datastore';
import { Post } from './models';

function PublishedPosts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isSynced, setIsSynced] = useState(false);

  useEffect(() => {
    const sub = DataStore.observeQuery(Post, p => p.status.eq('PUBLISHED'), {
      sort: s => s.createdAt(SortDirection.DESCENDING),
    }).subscribe(snapshot => {
      setPosts(snapshot.items);
      setIsSynced(snapshot.isSynced);
    });

    return () => sub.unsubscribe();
  }, []);

  return (
    <div>
      {!isSynced && <p>Syncing...</p>}
      <ul>
        {posts.map(post => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

### After: useQuery with Subscription Refetch

```typescript
import { useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { generateClient } from 'aws-amplify/api';
import { LIST_POSTS } from './graphql/operations';

const amplifyClient = generateClient();

function PublishedPosts() {
  const { data, loading, refetch } = useQuery(LIST_POSTS, {
    variables: { filter: { status: { eq: 'PUBLISHED' } } },
    fetchPolicy: 'cache-and-network',
  });

  useEffect(() => {
    const subscriptions = [
      (amplifyClient.graphql({
        query: `subscription OnCreatePost {
          onCreatePost { id }
        }`,
      }) as any).subscribe({
        next: () => refetch(),
        error: (err: any) => console.error('Create subscription error:', err),
      }),
      (amplifyClient.graphql({
        query: `subscription OnUpdatePost {
          onUpdatePost { id }
        }`,
      }) as any).subscribe({
        next: () => refetch(),
        error: (err: any) => console.error('Update subscription error:', err),
      }),
      (amplifyClient.graphql({
        query: `subscription OnDeletePost {
          onDeletePost { id }
        }`,
      }) as any).subscribe({
        next: () => refetch(),
        error: (err: any) => console.error('Delete subscription error:', err),
      }),
    ];

    return () => subscriptions.forEach(sub => sub.unsubscribe());
  }, [refetch]);

  const posts = data?.listPosts?.items
    ?.filter((p: any) => !p._deleted)
    ?.sort((a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ) || [];

  if (loading && !data) return <p>Loading...</p>;

  return (
    <div>
      {loading && <span>Refreshing...</span>}
      <ul>
        {posts.map((post: any) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Feature Comparison

| observeQuery Feature | Apollo Equivalent | Notes |
|---------------------|-------------------|-------|
| Initial snapshot | `useQuery` first result | Same behavior |
| Live updates | Subscription refetch | Each event triggers full refetch |
| `isSynced` flag | Not applicable | API Only queries the server on demand |
| Debounced snapshots | No debouncing | Each subscription event triggers immediate refetch |
| Predicate filtering | `filter` variable | Same filtering, different syntax (JSON instead of callback) |
| Sort option | Client-side `.sort()` | See [Predicates and Filters](./08-predicates-filters.md) |
| Single Observable | `useQuery` + `useEffect` subscriptions | Two mechanisms instead of one |

---

<!-- ai:owner-auth -->

## Owner-Based Auth Subscriptions

When a model has `@auth(rules: [{ allow: owner }])`, DataStore automatically injected the `owner` argument into subscriptions. After migration, you **must** manually pass the `owner` variable or the subscription will silently receive no events.

> **Warning:** If your subscriptions connect successfully but never fire events, check whether your model has owner-based authorization. This is the most common cause of silent subscription failures after migration.

### Getting the Current Owner

The owner value for Amplify Gen 2 defaults to the `sub` claim from the Cognito ID token:

```typescript
import { fetchAuthSession } from 'aws-amplify/auth';

async function getCurrentOwner(): Promise<string> {
  const session = await fetchAuthSession();
  // Default Amplify Gen 2 owner field uses the 'sub' claim
  return session.tokens?.idToken?.payload?.sub as string;
}
```

> **Note:** The owner claim may be `sub` (default) or `username` depending on your Cognito configuration. Check the `ownerField` in your model's auth rules to confirm which claim is used. In the Amplify Gen 2 schema, look for `@auth(rules: [{ allow: owner }])` -- the default `identityClaim` is `sub`.

### Complete Component with Owner-Based Subscriptions

```typescript
import { useState, useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { generateClient } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import { LIST_POSTS } from './graphql/operations';

const amplifyClient = generateClient();

async function getCurrentOwner(): Promise<string> {
  const session = await fetchAuthSession();
  return session.tokens?.idToken?.payload?.sub as string;
}

function MyPosts() {
  const { data, loading, error, refetch } = useQuery(LIST_POSTS);
  const [owner, setOwner] = useState<string | null>(null);

  // Fetch the current user's owner ID on mount
  useEffect(() => {
    getCurrentOwner().then(setOwner);
  }, []);

  // Set up owner-scoped subscriptions
  useEffect(() => {
    if (!owner) return;

    const subscriptions = [
      (amplifyClient.graphql({
        query: `subscription OnCreatePost($owner: String!) {
          onCreatePost(owner: $owner) { id }
        }`,
        variables: { owner },
      }) as any).subscribe({
        next: () => refetch(),
        error: (err: any) => console.error('Create subscription error:', err),
      }),
      (amplifyClient.graphql({
        query: `subscription OnUpdatePost($owner: String!) {
          onUpdatePost(owner: $owner) { id }
        }`,
        variables: { owner },
      }) as any).subscribe({
        next: () => refetch(),
        error: (err: any) => console.error('Update subscription error:', err),
      }),
      (amplifyClient.graphql({
        query: `subscription OnDeletePost($owner: String!) {
          onDeletePost(owner: $owner) { id }
        }`,
        variables: { owner },
      }) as any).subscribe({
        next: () => refetch(),
        error: (err: any) => console.error('Delete subscription error:', err),
      }),
    ];

    return () => subscriptions.forEach(sub => sub.unsubscribe());
  }, [owner, refetch]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  const posts = data?.listPosts?.items?.filter((p: any) => !p._deleted) || [];
  return (
    <div>
      <h2>My Posts</h2>
      <ul>
        {posts.map((post: any) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

### What Changed from DataStore

- **DataStore injected `owner` automatically.** You never had to think about it. After migration, you must fetch the owner value from the auth session and pass it as a subscription variable.
- **Missing `owner` argument = silent failure.** The subscription will connect successfully (no error), but AppSync will not deliver any events because the auth filter does not match.
- **All three subscription types need the owner argument.** If your model uses owner-based auth, `onCreatePost`, `onUpdatePost`, and `onDeletePost` all require the `owner` variable.

---

<!-- ai:complete-example -->

## Complete Migration Example

This section shows a realistic component that combines CRUD operations, real-time observation, and relationship loading -- migrated from DataStore to Apollo + Amplify.

### Before: DataStore Component (CRUD + Observe + Relationships)

```typescript
import { useState, useEffect } from 'react';
import { DataStore, SortDirection } from 'aws-amplify/datastore';
import { Post, Comment } from './models';

function PostDashboard() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [loading, setLoading] = useState(true);

  // Load posts and observe changes
  useEffect(() => {
    const sub = DataStore.observeQuery(Post, p => p.status.eq('PUBLISHED'), {
      sort: s => s.createdAt(SortDirection.DESCENDING),
    }).subscribe(snapshot => {
      setPosts(snapshot.items);
      setLoading(false);
    });

    return () => sub.unsubscribe();
  }, []);

  // Load comments for each post
  useEffect(() => {
    posts.forEach(async post => {
      const postComments = await post.comments.toArray();
      setComments(prev => ({ ...prev, [post.id]: postComments }));
    });
  }, [posts]);

  // Create a new post
  const handleCreate = async (title: string, content: string) => {
    await DataStore.save(
      new Post({ title, content, status: 'PUBLISHED', rating: 5 })
    );
    // observeQuery automatically picks up the new post
  };

  // Delete a post
  const handleDelete = async (post: Post) => {
    await DataStore.delete(post);
    // observeQuery automatically removes the deleted post
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <button onClick={() => handleCreate('New Post', 'Content here')}>
        New Post
      </button>
      {posts.map(post => (
        <div key={post.id}>
          <h3>{post.title}</h3>
          <p>{post.content}</p>
          <button onClick={() => handleDelete(post)}>Delete</button>
          <h4>Comments ({comments[post.id]?.length || 0})</h4>
          <ul>
            {(comments[post.id] || []).map(comment => (
              <li key={comment.id}>{comment.content}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

### After: Apollo + Amplify Component

```typescript
import { useEffect } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { generateClient } from 'aws-amplify/api';

const amplifyClient = generateClient();

// Query that fetches posts with nested comments
const LIST_POSTS_WITH_COMMENTS = gql`
  query ListPosts($filter: ModelPostFilterInput) {
    listPosts(filter: $filter) {
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
        comments {
          items {
            id
            content
            _version
            _deleted
            createdAt
          }
        }
      }
    }
  }
`;

const CREATE_POST = gql`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      id title content status rating
      _version _deleted _lastChangedAt createdAt updatedAt
    }
  }
`;

const DELETE_POST = gql`
  mutation DeletePost($input: DeletePostInput!) {
    deletePost(input: $input) {
      id _version _deleted
    }
  }
`;

function PostDashboard() {
  const { data, loading, error, refetch } = useQuery(LIST_POSTS_WITH_COMMENTS, {
    variables: { filter: { status: { eq: 'PUBLISHED' } } },
    fetchPolicy: 'cache-and-network',
  });

  const [createPost, { loading: creating }] = useMutation(CREATE_POST, {
    refetchQueries: [{ query: LIST_POSTS_WITH_COMMENTS }],
  });

  const [deletePost] = useMutation(DELETE_POST, {
    refetchQueries: [{ query: LIST_POSTS_WITH_COMMENTS }],
  });

  // Real-time subscriptions (replaces observeQuery)
  useEffect(() => {
    const subscriptions = [
      (amplifyClient.graphql({
        query: `subscription OnCreatePost {
          onCreatePost { id }
        }`,
      }) as any).subscribe({
        next: () => refetch(),
        error: (err: any) => console.error('Create subscription error:', err),
      }),
      (amplifyClient.graphql({
        query: `subscription OnUpdatePost {
          onUpdatePost { id }
        }`,
      }) as any).subscribe({
        next: () => refetch(),
        error: (err: any) => console.error('Update subscription error:', err),
      }),
      (amplifyClient.graphql({
        query: `subscription OnDeletePost {
          onDeletePost { id }
        }`,
      }) as any).subscribe({
        next: () => refetch(),
        error: (err: any) => console.error('Delete subscription error:', err),
      }),
    ];

    return () => subscriptions.forEach(sub => sub.unsubscribe());
  }, [refetch]);

  // Create handler
  const handleCreate = async (title: string, content: string) => {
    await createPost({
      variables: {
        input: { title, content, status: 'PUBLISHED', rating: 5 },
      },
    });
  };

  // Delete handler
  const handleDelete = async (post: any) => {
    await deletePost({
      variables: {
        input: { id: post.id, _version: post._version },
      },
    });
  };

  if (loading && !data) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  const posts = data?.listPosts?.items
    ?.filter((p: any) => !p._deleted)
    ?.sort((a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ) || [];

  return (
    <div>
      {loading && <span>Refreshing...</span>}
      <button onClick={() => handleCreate('New Post', 'Content here')} disabled={creating}>
        {creating ? 'Creating...' : 'New Post'}
      </button>
      {posts.map((post: any) => {
        const activeComments = (post.comments?.items || []).filter(
          (c: any) => !c._deleted
        );
        return (
          <div key={post.id}>
            <h3>{post.title}</h3>
            <p>{post.content}</p>
            <button onClick={() => handleDelete(post)}>Delete</button>
            <h4>Comments ({activeComments.length})</h4>
            <ul>
              {activeComments.map((comment: any) => (
                <li key={comment.id}>{comment.content}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
```

### What Changed

| Aspect | DataStore | Apollo + Amplify |
|--------|-----------|------------------|
| Initial load + live updates | Single `observeQuery()` call | `useQuery` + three `useEffect` subscriptions |
| Relationship loading | Lazy `post.comments.toArray()` in separate `useEffect` | Nested `comments { items { ... } }` in the GraphQL query |
| Create mutation | `DataStore.save(new Post({...}))` | `useMutation(CREATE_POST)` with `refetchQueries` |
| Delete mutation | `DataStore.delete(post)` | `useMutation(DELETE_POST)` with `id` + `_version` |
| Loading state | Manual `useState(true)` | Built-in `loading` from `useQuery` |
| Error handling | Manual `try/catch` | Built-in `error` from `useQuery` |
| Soft-deleted filtering | Automatic | Manual `_deleted` filter on posts AND comments |
| Sorting | `SortDirection.DESCENDING` option | Client-side `.sort()` |

---

<!-- ai:react-checklist -->

## Migration Checklist for React Components

Use this checklist when converting each React component from DataStore to Apollo + Amplify:

### Setup

- [ ] Wrap app root with `<ApolloProvider>` (see [Apollo Client Setup](./04-apollo-setup.md#connecting-to-react))
- [ ] Configure Amplify subscription client with `generateClient()` (see [Subscriptions](./05-subscriptions.md))
- [ ] Ensure all `useQuery`/`useMutation` hooks are inside the `<Authenticator>` boundary (see [Apollo Hooks and the Authenticator Boundary](#important-apollo-hooks-and-the-authenticator-boundary))

### Queries

- [ ] Replace `useState` + `useEffect` + `DataStore.query()` with `useQuery()`
- [ ] Replace `DataStore.query(Model, id)` with `useQuery(GET_MODEL, { variables: { id } })`
- [ ] Filter `_deleted` records from ALL list query results
- [ ] Add `error` state handling (DataStore did not expose errors)
- [ ] Use `fetchPolicy: 'cache-and-network'` where you need cached + fresh data

### Mutations

- [ ] Replace `DataStore.save(new Model({...}))` with `useMutation(CREATE_MODEL)`
- [ ] Replace `DataStore.save(Model.copyOf(...))` with `useMutation(UPDATE_MODEL)` -- include `_version`
- [ ] Replace `DataStore.delete(instance)` with `useMutation(DELETE_MODEL)` -- include `_version`
- [ ] Add `refetchQueries` to mutations that affect list queries
- [ ] Handle mutation `loading` state (disable buttons, show progress)

### Real-Time Observation

- [ ] Replace `DataStore.observe()` with three Amplify subscriptions (`onCreate`, `onUpdate`, `onDelete`)
- [ ] Replace `DataStore.observeQuery()` with `useQuery` + subscription-triggered `refetch()`
- [ ] Add `owner` argument to subscriptions if the model uses owner-based auth (`@auth(rules: [{ allow: owner }])`)
- [ ] Clean up ALL subscriptions in the `useEffect` return function
- [ ] Test that subscriptions fire events (check owner auth if they do not)

### Relationships

- [ ] Replace lazy `model.relatedField.toArray()` with nested fields in the GraphQL query (see [Relationships](./09-relationships.md))
- [ ] Filter `_deleted` on related records (e.g., `post.comments.items.filter(c => !c._deleted)`)

---

**Previous:** [Relationships](./09-relationships.md)

**Next:** [Cache Persistence](./11-cache-persistence.md) — Add persistent cache and fetch policies (Local Caching strategy).
