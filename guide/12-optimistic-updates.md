<!-- ai:optimistic-updates -->

# Optimistic Updates and typePolicies

The [CRUD Operations](./07-crud-operations.md) page showed how to create, update, and delete records using Apollo mutations with `refetchQueries`. That approach works, but every mutation waits for the server response before the UI updates -- the user sees a loading spinner on every action.

This page replaces `refetchQueries` with **optimistic responses** that update the UI instantly, before the server confirms the mutation. If the server returns an error, Apollo automatically rolls back the optimistic data with zero manual code.

DataStore updated its local store synchronously on `save()`, then synced with the server in the background. Apollo's optimistic layer achieves the same instant-UI behavior, but you write it explicitly -- you tell Apollo what the server response will look like, and Apollo shows that prediction to the user immediately.

**What this page covers:**

1. **Optimistic mutations** -- instant UI updates for create, update, and delete
2. **Cache update functions** -- keeping list queries in sync after mutations
3. **Automatic rollback** -- zero-code error handling
4. **typePolicies** -- pagination merge with `keyArgs` and `_deleted` record filtering

All mutations on this page use the same GraphQL operations (`CREATE_POST`, `UPDATE_POST`, `DELETE_POST`, `LIST_POSTS`) defined in [Prerequisites](./03-prerequisites.md#complete-operation-definitions) and the enhanced `apolloClient` from [Cache Persistence](./11-cache-persistence.md).

```typescript
import { useMutation, useQuery } from '@apollo/client';
import {
  CREATE_POST,
  UPDATE_POST,
  DELETE_POST,
  LIST_POSTS,
} from './graphql/operations';
```

---

<!-- ai:optimistic-how -->

## How Optimistic Updates Work

When you provide an `optimisticResponse` to a mutation, Apollo follows a six-stage lifecycle:

1. **Apollo caches the optimistic object in a separate layer** -- it does not overwrite the canonical cache data.
2. **Active queries re-render immediately** with the optimistic data merged on top of canonical data.
3. **The server response arrives** (or an error occurs).
4. **The optimistic layer is discarded** and the canonical cache is updated with the real server data.
5. **Components re-render again** with the server data. If your prediction was correct, this re-render is invisible to the user -- the data is identical.
6. **On error:** The optimistic layer is discarded and the UI reverts to the previous canonical state automatically.

The key insight: **you do not write rollback code.** Apollo's optimistic layer is a separate overlay that gets discarded entirely when the server responds. If the mutation fails, discarding the overlay restores the previous state. If it succeeds, the canonical cache replaces the overlay with identical data.

---

<!-- ai:optimistic-create -->

## Optimistic Create

### DataStore (Before)

```typescript
import { DataStore } from 'aws-amplify/datastore';
import { Post } from './models';

const newPost = await DataStore.save(
  new Post({
    title: 'My First Post',
    content: 'Hello world',
    status: 'PUBLISHED',
    rating: 5,
  })
);
// UI updated instantly from local store
```

### Apollo Client (After)

```typescript
function CreatePostForm() {
  const [createPost, { loading, error }] = useMutation(CREATE_POST, {
    optimisticResponse: ({ input }) => ({
      createPost: {
        __typename: 'Post',
        id: `temp-${Date.now()}`,
        title: input.title,
        content: input.content,
        status: input.status,
        rating: input.rating ?? null,
        _version: 1,
        _deleted: false,
        _lastChangedAt: Date.now(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }),
    update(cache, { data }) {
      if (!data?.createPost) return;
      cache.updateQuery({ query: LIST_POSTS }, (existing) => {
        if (!existing?.listPosts) return existing;
        return {
          listPosts: {
            ...existing.listPosts,
            items: [data.createPost, ...existing.listPosts.items],
          },
        };
      });
    },
  });

  async function handleSubmit(title: string, content: string) {
    await createPost({
      variables: {
        input: { title, content, status: 'PUBLISHED', rating: 5 },
      },
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit('Title', 'Content'); }}>
      {error && <p>Error: {error.message}</p>}
      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Post'}
      </button>
    </form>
  );
}
```

### Why the update Function Is Needed for Creates

Apollo's normalized cache auto-updates objects that already exist (matched by `__typename` + `id`). But it **cannot know** that a brand-new object should appear in an existing list query. The `update` function tells the cache: "add this new item to the `listPosts` result."

Without `update`, the new post exists in the normalized cache but does not appear in any list until the next `refetch` or page refresh.

> **Note:** `cache.updateQuery` is the recommended API for this pattern. It combines `readQuery` and `writeQuery` into a single callback and handles the case where the query is not yet in the cache (returns `null`).

---

<!-- ai:optimistic-update -->

## Optimistic Update

### DataStore (Before)

```typescript
import { DataStore } from 'aws-amplify/datastore';
import { Post } from './models';

const original = await DataStore.query(Post, '123');
const updated = await DataStore.save(
  Post.copyOf(original, (draft) => {
    draft.title = 'Updated Title';
    draft.rating = 4;
  })
);
// UI updated instantly from local store
```

### Apollo Client (After)

```typescript
function EditPostButton({ post }: { post: Post }) {
  const [updatePost, { loading, error }] = useMutation(UPDATE_POST, {
    optimisticResponse: {
      updatePost: {
        __typename: 'Post',
        id: post.id,
        title: 'Updated Title',
        content: post.content,
        status: post.status,
        rating: 4,
        _version: post._version + 1,
        _deleted: false,
        _lastChangedAt: Date.now(),
        createdAt: post.createdAt,
        updatedAt: new Date().toISOString(),
      },
    },
    // No update function needed
  });

  async function handleUpdate() {
    await updatePost({
      variables: {
        input: {
          id: post.id,
          title: 'Updated Title',
          rating: 4,
          _version: post._version,
        },
      },
    });
  }

  return (
    <>
      {error && <p>Error: {error.message}</p>}
      <button onClick={handleUpdate} disabled={loading}>
        {loading ? 'Saving...' : 'Update'}
      </button>
    </>
  );
}
```

### Why No update Function Is Needed for Updates

Apollo's normalized cache stores every object by its cache key (`__typename` + `id`). When the optimistic response contains an object with the same `Post:123` key as an existing cached object, Apollo **automatically merges the new fields into the existing cache entry**. Every query that references `Post:123` re-renders with the updated data.

No `update` function, no `readQuery`, no `writeQuery`. The normalized cache handles it.

---

<!-- ai:optimistic-delete -->

## Optimistic Delete

### DataStore (Before)

```typescript
import { DataStore } from 'aws-amplify/datastore';
import { Post } from './models';

const post = await DataStore.query(Post, '123');
await DataStore.delete(post);
// UI updated instantly -- record removed from local store
```

### Apollo Client (After)

```typescript
function DeletePostButton({ post }: { post: Post }) {
  const [deletePost, { loading, error }] = useMutation(DELETE_POST, {
    optimisticResponse: {
      deletePost: {
        __typename: 'Post',
        id: post.id,
        _version: post._version + 1,
        _deleted: true,
        _lastChangedAt: Date.now(),
      },
    },
    update(cache, { data }) {
      if (!data?.deletePost) return;
      cache.evict({ id: cache.identify(data.deletePost)! });
      cache.gc();
    },
  });

  async function handleDelete() {
    await deletePost({
      variables: {
        input: {
          id: post.id,
          _version: post._version,
        },
      },
    });
  }

  return (
    <>
      {error && <p>Error: {error.message}</p>}
      <button onClick={handleDelete} disabled={loading}>
        {loading ? 'Deleting...' : 'Delete'}
      </button>
    </>
  );
}
```

### Why cache.evict and cache.gc Are Needed for Deletes

Unlike updates, you are not modifying a cached object -- you are removing it entirely. `cache.evict()` removes the object from the normalized store by its cache ID. `cache.gc()` (garbage collection) then cleans up any dangling references -- other cached objects or query results that pointed to the now-removed object.

Without `evict` + `gc`, the deleted post's data would remain in the cache (with `_deleted: true`) and could still appear in query results.

---

<!-- ai:optimistic-version -->

## _version Handling in Optimistic Responses

AppSync uses `_version` for conflict detection. In optimistic responses, follow this pattern:

| Operation | Optimistic `_version` | Why |
|-----------|----------------------|-----|
| **Create** | `1` | New records start at version 1 |
| **Update** | `post._version + 1` | Predicts the server's version increment |
| **Delete** | `post._version + 1` | Same as update -- the delete mutation increments the version |

**The optimistic `_version` does not need to be exact.** The server response always replaces the optimistic data in the canonical cache. If the server returns `_version: 5` but your optimistic response predicted `_version: 4`, Apollo discards the optimistic layer and writes `_version: 5` to the cache. There may be a brief re-render as the fields update, but it is usually invisible to the user.

---

<!-- ai:optimistic-rollback -->

## Automatic Rollback

When a mutation returns a GraphQL error, Apollo automatically discards the optimistic layer. The UI reverts to the previous state with **zero manual code**.

You do not write try/catch blocks to restore cache state. You do not manually call `writeQuery` to undo changes. Apollo's separate optimistic layer means the canonical cache was never modified -- discarding the overlay is all that is needed.

### Displaying Errors

While rollback is automatic, you still want to tell the user something went wrong. Use the `error` return from `useMutation`:

```typescript
function CreatePostForm() {
  const [createPost, { loading, error }] = useMutation(CREATE_POST, {
    optimisticResponse: { /* ... */ },
    update(cache, { data }) { /* ... */ },
  });

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div role="alert">
          Failed to create post: {error.message}
        </div>
      )}
      <button type="submit" disabled={loading}>Create Post</button>
    </form>
  );
}
```

Alternatively, use the `onError` callback for side effects like toast notifications:

```typescript
const [createPost] = useMutation(CREATE_POST, {
  optimisticResponse: { /* ... */ },
  update(cache, { data }) { /* ... */ },
  onError(error) {
    toast.error(`Failed to create post: ${error.message}`);
  },
});
```

In both cases, the UI has already reverted to its previous state by the time your error handler runs.

---

<!-- ai:optimistic-duplicates -->

## Avoiding Duplicate Items on Create

### The Problem

Apollo calls the `update` function **twice** for optimistic mutations:

1. **First call (optimistic):** `data` contains the optimistic response with the temporary ID (`temp-1234567890`).
2. **Second call (server):** `data` contains the real server response with the permanent ID (`abc-def-ghi`).

Because the temporary ID and real ID differ, a naive `update` function could add the item to the list twice.

### Why It Usually Works Without Extra Code

When the server response arrives, Apollo:

1. Discards the entire optimistic layer (including the temp-ID item in the list)
2. Writes the server response to the canonical cache
3. Runs the `update` function with the server data, which adds the real-ID item to the list

Since the optimistic layer is discarded first, the temp-ID item is gone before the real-ID item is added. The list ends up with exactly one copy.

### The Defensive Pattern

In edge cases (complex cache states, multiple concurrent mutations), you can add an existence check:

```typescript
update(cache, { data }) {
  if (!data?.createPost) return;
  cache.updateQuery({ query: LIST_POSTS }, (existing) => {
    if (!existing?.listPosts) return existing;

    // Check if the item already exists in the list (by real ID)
    const alreadyExists = existing.listPosts.items.some(
      (item: any) => item.__ref === cache.identify(data.createPost)
    );
    if (alreadyExists) return existing;

    return {
      listPosts: {
        ...existing.listPosts,
        items: [data.createPost, ...existing.listPosts.items],
      },
    };
  });
},
```

### When to Use refetchQueries Instead

If you do not need instant UI updates, `refetchQueries` is simpler and avoids all duplicate-item concerns:

```typescript
const [createPost] = useMutation(CREATE_POST, {
  refetchQueries: [{ query: LIST_POSTS }],
});
```

The trade-off: `refetchQueries` makes a network round trip before the list updates. Use optimistic + `update` when instant UX matters; use `refetchQueries` when simplicity matters.

---

<!-- ai:type-policies-pagination -->

## typePolicies for Pagination Merge

### The Problem

AppSync list queries use cursor-based pagination with `nextToken`:

```typescript
// Page 1
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: { limit: 10 },
});

// Page 2
const { data: page2 } = await apolloClient.query({
  query: LIST_POSTS,
  variables: { limit: 10, nextToken: data.listPosts.nextToken },
});
```

Without `typePolicies`, Apollo treats each `(limit, nextToken)` combination as a **separate cache entry**. Page 1 and Page 2 are stored independently. A "Load More" button would replace page 1 with page 2 instead of appending.

### The Solution: keyArgs + merge

```typescript
import { InMemoryCache } from '@apollo/client';

const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        listPosts: {
          // keyArgs defines which arguments create SEPARATE cache entries.
          // Queries with different filters are cached separately.
          // limit and nextToken are NOT key args -- they are pagination params.
          keyArgs: ['filter'],

          merge(existing, incoming) {
            // First page or fresh query -- no existing data to merge with
            if (!existing) {
              return incoming;
            }

            // Append new page items to existing items
            return {
              ...incoming, // Preserves nextToken from the latest page
              items: [...(existing.items || []), ...(incoming.items || [])],
            };
          },
        },
      },
    },
  },
});
```

### How keyArgs Works

`keyArgs: ['filter']` tells Apollo:

- **Same filter (or no filter):** All pages merge into one cache entry. `listPosts(limit: 10)` and `listPosts(limit: 10, nextToken: "abc")` share a single entry.
- **Different filter:** Separate cache entries. `listPosts(filter: { status: { eq: "PUBLISHED" } })` and `listPosts(filter: { status: { eq: "DRAFT" } })` are independent.

This means "Load More" appends new items to the existing list, while filtered queries do not interfere with each other.

### Load More Component Example

```typescript
function PostList() {
  const { data, loading, error, fetchMore } = useQuery(LIST_POSTS, {
    variables: { limit: 10 },
  });

  if (loading && !data) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  const posts = data?.listPosts?.items ?? [];
  const nextToken = data?.listPosts?.nextToken;

  return (
    <div>
      <ul>
        {posts.map((post: any) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>

      {nextToken && (
        <button
          onClick={() =>
            fetchMore({
              variables: { limit: 10, nextToken },
            })
          }
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
}
```

The `merge` function in `typePolicies` handles the rest -- `fetchMore` triggers a new query with `nextToken`, and the merge function appends the new items to the existing list. The component re-renders with the combined list automatically.

---

<!-- ai:type-policies-deleted -->

## Filtering _deleted Records with a read Function

### Why This Is Needed

When conflict resolution is enabled, AppSync performs soft deletes -- records have their `_deleted` field set to `true` instead of being physically removed. These records can appear in list query results. The [CRUD Operations](./07-crud-operations.md#list-all-records) page showed manual filtering with `.filter(item => !item._deleted)`. A `read` function in `typePolicies` handles this at the cache level, so every component that reads the list gets filtered results automatically.

### The read Function

```typescript
listPosts: {
  keyArgs: ['filter'],

  merge(existing, incoming) {
    if (!existing) return incoming;
    return {
      ...incoming,
      items: [...(existing.items || []), ...(incoming.items || [])],
    };
  },

  read(existing, { readField }) {
    if (!existing) return existing;
    return {
      ...existing,
      items: existing.items.filter(
        (ref: any) => !readField('_deleted', ref)
      ),
    };
  },
},
```

### Why readField Instead of Direct Property Access

In Apollo's normalized cache, list items are stored as **references** (e.g., `{ __ref: "Post:123" }`), not as full objects. You cannot access `ref._deleted` directly -- it would be `undefined`. The `readField` helper resolves the reference and reads the field from the normalized cache entry.

```typescript
// WRONG -- ref is a cache reference, not the actual object
items.filter((ref) => !ref._deleted)

// CORRECT -- readField resolves the reference
items.filter((ref) => !readField('_deleted', ref))
```

---

<!-- ai:type-policies-complete -->

## Complete typePolicies Configuration

Here is the full `typePolicies` object combining normalization, pagination merge, and soft-delete filtering. This is the configuration referenced from the `InMemoryCache` setup in [Cache Persistence](./11-cache-persistence.md).

```typescript
import { InMemoryCache } from '@apollo/client';

const cache = new InMemoryCache({
  typePolicies: {
    // --- Object normalization ---
    Post: {
      keyFields: ['id'],
    },
    Comment: {
      keyFields: ['id'],
    },

    // --- Query field policies ---
    Query: {
      fields: {
        listPosts: {
          keyArgs: ['filter'],

          merge(existing, incoming) {
            if (!existing) return incoming;
            return {
              ...incoming,
              items: [...(existing.items || []), ...(incoming.items || [])],
            };
          },

          read(existing, { readField }) {
            if (!existing) return existing;
            return {
              ...existing,
              items: existing.items.filter(
                (ref: any) => !readField('_deleted', ref)
              ),
            };
          },
        },

        listComments: {
          keyArgs: ['filter'],

          merge(existing, incoming) {
            if (!existing) return incoming;
            return {
              ...incoming,
              items: [...(existing.items || []), ...(incoming.items || [])],
            };
          },

          read(existing, { readField }) {
            if (!existing) return existing;
            return {
              ...existing,
              items: existing.items.filter(
                (ref: any) => !readField('_deleted', ref)
              ),
            };
          },
        },
      },
    },
  },
});
```

The pattern is the same for every list query: `keyArgs` for filter separation, `merge` for pagination, `read` for soft-delete filtering. Add a field policy for each list query in your schema.

> **Note:** This `typePolicies` configuration plugs into the `InMemoryCache` in the enhanced `apolloClient.ts` from [Cache Persistence](./11-cache-persistence.md#enhanced-apollo-client-setup). Replace the placeholder `typePolicies: {}` with this full configuration.

---

<!-- ai:optimistic-troubleshooting -->

## Troubleshooting

### Duplicate Items After Create

**Symptoms:** After creating a record, two copies appear in the list -- one with the temporary ID and one with the real server ID.

**Cause:** The `update` function adds the item on both the optimistic call and the server-response call without checking for duplicates.

**Fix:** Rely on Apollo's optimistic layer lifecycle (the temp-ID item is discarded when the server responds). If duplicates persist, add the defensive existence check shown in [Avoiding Duplicate Items on Create](#avoiding-duplicate-items-on-create). Alternatively, use `refetchQueries` instead of `update` if instant UX is not critical.

### Optimistic Update Not Appearing

**Symptoms:** The mutation fires but the UI does not update until the server responds.

**Cause:** The `optimisticResponse` is missing `__typename`, has a mismatched ID, or does not include all fields that the active query expects.

**Fix:**
- Ensure `__typename` is set correctly (e.g., `'Post'`, not `'post'` or `'CreatePostOutput'`).
- For updates and deletes, ensure the `id` matches the existing cached object exactly.
- Include all fields that the active query's selection set returns. Missing fields cause Apollo to treat the optimistic object as incomplete.

### Pagination Shows Duplicates

**Symptoms:** "Load More" shows items from page 1 repeated in page 2, or items shift positions when new pages load.

**Cause:** Missing `keyArgs` on the list field. Without `keyArgs`, each page is a separate cache entry, and Apollo replaces the previous page instead of merging.

**Fix:** Add `keyArgs: ['filter']` and a `merge` function to the list field in `typePolicies`. See [typePolicies for Pagination Merge](#typepolicies-for-pagination-merge).

### _deleted Records Still Showing

**Symptoms:** Soft-deleted records (with `_deleted: true`) appear in list views despite having a `read` function in `typePolicies`.

**Cause:** The `read` function uses `ref._deleted` (direct property access) instead of `readField('_deleted', ref)`. Cache list items are references, not objects.

**Fix:** Use `readField('_deleted', ref)` to resolve the reference. See [Why readField Instead of Direct Property Access](#why-readfield-instead-of-direct-property-access).

---

**Previous:** [Cache Persistence](./11-cache-persistence.md)

**Next:** [Offline Architecture](./13-offline-architecture.md) — Build a full offline-first architecture (Offline-First strategy).
