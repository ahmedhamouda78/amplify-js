<!-- ai:crud-operations -->

# CRUD Operations

This page covers how to migrate every DataStore CRUD operation to Apollo Client. DataStore conflates create and update into a single `save()` method and handles `_version` internally. With Apollo Client, you use distinct mutations for each operation and manage `_version` explicitly.

**GraphQL operations used on this page** (`CREATE_POST`, `UPDATE_POST`, `DELETE_POST`, `GET_POST`, `LIST_POSTS`, and the `POST_DETAILS_FRAGMENT` fragment) are defined in the [Prerequisites](./03-prerequisites.md#complete-operation-definitions) page. The Apollo Client instance (`apolloClient`) is configured in the [Apollo Client Setup](./04-apollo-setup.md#complete-setup-file) page. Import them as needed:

```typescript
import { apolloClient } from './apolloClient';
import {
  CREATE_POST,
  UPDATE_POST,
  DELETE_POST,
  GET_POST,
  LIST_POSTS,
} from './graphql/operations';
```

> **Convention:** Every example below shows both an **imperative** pattern (`apolloClient.mutate()` / `apolloClient.query()`) for use outside React components, and a **React hook** pattern (`useMutation()` / `useQuery()`) for use inside components.

---

<!-- ai:crud-create -->

## Create (Save New Record)

DataStore uses `new Model()` plus `DataStore.save()` to create a record. Apollo Client uses the `CREATE_POST` mutation.

<!-- before: DataStore -->

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

console.log('Created:', newPost.id);
```

<!-- after: Apollo Client -->

### Imperative

```typescript
const { data } = await apolloClient.mutate({
  mutation: CREATE_POST,
  variables: {
    input: {
      title: 'My First Post',
      content: 'Hello world',
      status: 'PUBLISHED',
      rating: 5,
    },
  },
});

const newPost = data.createPost;
console.log('Created:', newPost.id);
// newPost._version is 1 (set by AppSync automatically)
```

### React Hook

```typescript
import { useMutation } from '@apollo/client';

function CreatePostForm() {
  const [createPost, { loading, error }] = useMutation(CREATE_POST, {
    refetchQueries: [{ query: LIST_POSTS }],
  });

  async function handleSubmit(title: string, content: string) {
    const { data } = await createPost({
      variables: {
        input: {
          title,
          content,
          status: 'PUBLISHED',
          rating: 5,
        },
      },
    });
    console.log('Created:', data.createPost.id);
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

**Key differences:**

- **No `_version` needed for creates.** AppSync sets `_version` to 1 automatically on new records.
- **`refetchQueries`** ensures the list view updates after a create. DataStore handled this automatically through its local store; Apollo requires explicit cache management.
- The response includes `_version: 1` -- store this if you plan to update or delete the record immediately after creating it.

---

<!-- ai:crud-update -->

## Update (Modify Existing Record)

DataStore uses `Model.copyOf()` with an immer-based draft for immutable updates, then `DataStore.save()`. Apollo Client uses the `UPDATE_POST` mutation with a plain object. Only changed fields need to be in the input (AppSync performs partial updates).

**`_version` is REQUIRED for updates.** You must query the record first to get the current `_version`.

<!-- before: DataStore -->

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
// DataStore handles _version internally
```

<!-- after: Apollo Client -->

### Imperative

```typescript
// Step 1: Query the current record to get _version
const { data: queryData } = await apolloClient.query({
  query: GET_POST,
  variables: { id: '123' },
});
const post = queryData.getPost;

// Step 2: Mutate with _version from query result
const { data } = await apolloClient.mutate({
  mutation: UPDATE_POST,
  variables: {
    input: {
      id: '123',
      title: 'Updated Title',
      rating: 4,
      _version: post._version, // REQUIRED
    },
  },
});

const updated = data.updatePost;
// updated._version is now post._version + 1
```

### React Hook

```typescript
import { useQuery, useMutation } from '@apollo/client';

function EditPostForm({ postId }: { postId: string }) {
  const { data, loading: queryLoading } = useQuery(GET_POST, {
    variables: { id: postId },
  });

  const [updatePost, { loading: updating, error }] = useMutation(UPDATE_POST);

  async function handleSave(title: string) {
    const post = data.getPost;
    await updatePost({
      variables: {
        input: {
          id: post.id,
          title,
          _version: post._version, // REQUIRED -- from useQuery result
        },
      },
    });
  }

  if (queryLoading) return <p>Loading...</p>;

  return (
    <div>
      {error && <p>Error: {error.message}</p>}
      <button onClick={() => handleSave('New Title')} disabled={updating}>
        {updating ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}
```

**Key differences:**

- **No `copyOf()` or immer pattern.** Apollo uses plain objects -- just pass the fields you want to change.
- **Only changed fields + `id` + `_version` are needed.** You do not need to send the entire record.
- **Two-step process:** Query first (to get `_version`), then mutate. DataStore handled this internally.

> **Warning:** If you see `ConditionalCheckFailedException`, you are missing or passing a stale `_version`. Re-query the record to get the latest `_version` before retrying.

---

<!-- ai:crud-delete -->

## Delete (Single Record)

DataStore's `delete()` method had three overloads: by instance, by ID, and by predicate. Apollo Client only supports single-record deletion via the `DELETE_POST` mutation.

**`_version` is REQUIRED for deletes.** You must query the record first to get the current `_version`, even if you already have the ID.

<!-- before: DataStore -->

```typescript
import { DataStore } from 'aws-amplify/datastore';
import { Post } from './models';

// Delete by instance
const post = await DataStore.query(Post, '123');
await DataStore.delete(post);

// OR delete by ID
await DataStore.delete(Post, '123');
```

<!-- after: Apollo Client -->

### Imperative

```typescript
// Step 1: Query to get current _version
const { data: queryData } = await apolloClient.query({
  query: GET_POST,
  variables: { id: '123' },
});

// Step 2: Delete with _version
await apolloClient.mutate({
  mutation: DELETE_POST,
  variables: {
    input: {
      id: '123',
      _version: queryData.getPost._version, // REQUIRED
    },
  },
  refetchQueries: [{ query: LIST_POSTS }],
});
```

### React Hook

```typescript
import { useMutation } from '@apollo/client';

function DeletePostButton({ post }: { post: { id: string; _version: number } }) {
  const [deletePost, { loading }] = useMutation(DELETE_POST, {
    refetchQueries: [{ query: LIST_POSTS }],
  });

  async function handleDelete() {
    await deletePost({
      variables: {
        input: {
          id: post.id,
          _version: post._version, // REQUIRED -- from parent query
        },
      },
    });
  }

  return (
    <button onClick={handleDelete} disabled={loading}>
      {loading ? 'Deleting...' : 'Delete'}
    </button>
  );
}
```

**Key differences:**

- **No delete-by-ID shorthand.** Apollo always needs the mutation input object with both `id` and `_version`.
- **Must query first** if you do not already have `_version` from a prior query result.
- **Delete is a soft delete** when conflict resolution is enabled. The record's `_deleted` field is set to `true` in DynamoDB, but the record is not physically removed.

> **Warning:** Even for deletes, a stale `_version` causes `ConditionalCheckFailedException`. Always use the most recent `_version`.

---

<!-- ai:crud-query-id -->

## Query by ID

DataStore uses `DataStore.query(Model, id)` to fetch a single record. Apollo Client uses the `GET_POST` query.

<!-- before: DataStore -->

```typescript
import { DataStore } from 'aws-amplify/datastore';
import { Post } from './models';

const post = await DataStore.query(Post, '123');
// Returns undefined if not found
if (post) {
  console.log(post.title);
}
```

<!-- after: Apollo Client -->

### Imperative

```typescript
const { data } = await apolloClient.query({
  query: GET_POST,
  variables: { id: '123' },
});

const post = data.getPost;
// Returns null if not found (not undefined)
if (post) {
  console.log(post.title);
}
```

### React Hook

```typescript
import { useQuery } from '@apollo/client';

function PostDetail({ postId }: { postId: string }) {
  const { data, loading, error } = useQuery(GET_POST, {
    variables: { id: postId },
  });

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;
  if (!data.getPost) return <p>Post not found</p>;

  const post = data.getPost;

  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
      <p>Status: {post.status}</p>
      <p>Rating: {post.rating}</p>
    </article>
  );
}
```

**Key differences:**

- **Returns `null` instead of `undefined`** when a record is not found. Adjust any `=== undefined` checks to `=== null` or use a falsy check (`if (!post)`).
- **Apollo provides `loading` and `error` states** automatically via hooks. DataStore required manual state management with `useState` / `useEffect`.
- **Response includes `_version`**, `_deleted`, and `_lastChangedAt` metadata (from the `PostDetails` fragment). Store `_version` if you need to update or delete the record.

---

<!-- ai:crud-list -->

## List All Records

DataStore uses `DataStore.query(Model)` to list all records. Apollo Client uses the `LIST_POSTS` query.

**Critical: You must filter out soft-deleted records.** DataStore did this automatically. Apollo Client returns all records including those with `_deleted: true`.

<!-- before: DataStore -->

```typescript
import { DataStore } from 'aws-amplify/datastore';
import { Post } from './models';

const posts = await DataStore.query(Post);
// DataStore automatically filters out deleted records
console.log(`Found ${posts.length} posts`);
```

<!-- after: Apollo Client -->

### Imperative

```typescript
const { data } = await apolloClient.query({
  query: LIST_POSTS,
});

// CRITICAL: Filter out soft-deleted records
const posts = data.listPosts.items.filter(
  (post: any) => !post._deleted
);
console.log(`Found ${posts.length} active posts`);
```

### React Hook

```typescript
import { useQuery } from '@apollo/client';

function PostList() {
  const { data, loading, error } = useQuery(LIST_POSTS);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  // CRITICAL: Filter out soft-deleted records
  const posts = filterDeleted(data.listPosts.items);

  return (
    <ul>
      {posts.map(post => (
        <li key={post.id}>
          {post.title} (v{post._version})
        </li>
      ))}
    </ul>
  );
}
```

**Key differences:**

- **Soft-deleted records are included in results.** Always use `filterDeleted()` on list query results. Forgetting this is the most common migration bug. See [Prerequisites: Filter Soft-Deleted Records](./03-prerequisites.md#helper-filter-soft-deleted-records).
- **Pagination is cursor-based**, not page-based. DataStore used `{ page: 0, limit: 10 }` (zero-indexed page number). Apollo uses `{ limit: 10, nextToken: '...' }`. See [Predicates and Filters](./08-predicates-filters.md) for pagination patterns.
- **No automatic re-fetch.** DataStore's local store updated automatically. With Apollo, use `refetchQueries` after mutations or `pollInterval` for periodic updates.

---

<!-- ai:crud-batch-delete -->

## Batch Delete (Predicate-Based)

DataStore supported deleting multiple records with a predicate: `DataStore.delete(Model, predicate)`. To delete multiple records matching a condition, query the matching records first, then delete each one.

<!-- before: DataStore -->

```typescript
import { DataStore } from 'aws-amplify/datastore';
import { Post } from './models';

// Delete all draft posts in a single call
await DataStore.delete(Post, (p) => p.status.eq('DRAFT'));
```

<!-- after: Apollo Client -->

### Imperative

```typescript
// Step 1: Query posts matching the filter
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: {
    filter: { status: { eq: 'DRAFT' } },
  },
});

// Filter out already-deleted records
const drafts = data.listPosts.items.filter(
  (post: any) => !post._deleted
);

// Step 2: Delete each record individually
const results = await Promise.allSettled(
  drafts.map((post: any) =>
    apolloClient.mutate({
      mutation: DELETE_POST,
      variables: {
        input: {
          id: post.id,
          _version: post._version, // REQUIRED for each record
        },
      },
    })
  )
);

// Step 3: Check for partial failures
const failures = results.filter((r) => r.status === 'rejected');
if (failures.length > 0) {
  console.error(`${failures.length} of ${drafts.length} deletes failed`);
}

// Refresh the list
await apolloClient.refetchQueries({ include: [LIST_POSTS] });
```

### React Hook

```typescript
import { useQuery, useMutation } from '@apollo/client';

function BatchDeleteDrafts() {
  const { data } = useQuery(LIST_POSTS, {
    variables: { filter: { status: { eq: 'DRAFT' } } },
  });
  const [deletePost] = useMutation(DELETE_POST);

  async function handleBatchDelete() {
    const drafts = (data?.listPosts?.items ?? []).filter(
      (post: any) => !post._deleted
    );

    const results = await Promise.allSettled(
      drafts.map((post: any) =>
        deletePost({
          variables: {
            input: {
              id: post.id,
              _version: post._version, // REQUIRED
            },
          },
        })
      )
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    console.log(`Deleted ${succeeded}, failed ${failed}`);
  }

  const draftCount = (data?.listPosts?.items ?? []).filter(
    (post: any) => !post._deleted && post.status === 'DRAFT'
  ).length;

  return (
    <button onClick={handleBatchDelete}>
      Delete {draftCount} Drafts
    </button>
  );
}
```

**Key differences:**

- **No atomicity.** DataStore's predicate delete was a single operation. The Apollo pattern sends individual mutations -- some may succeed while others fail.
- **Use `Promise.allSettled` (not `Promise.all`)** so that one failure does not abort the remaining deletes.
- **Rate limiting on large batches.** AppSync has request throttling. For large datasets (100+ records), process in batches of 10-25 with a delay between batches:

```typescript
// Batch processing helper for large datasets
async function batchDelete(posts: any[], batchSize = 25) {
  for (let i = 0; i < posts.length; i += batchSize) {
    const batch = posts.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map((post) =>
        apolloClient.mutate({
          mutation: DELETE_POST,
          variables: {
            input: { id: post.id, _version: post._version },
          },
        })
      )
    );
    // Brief pause between batches to avoid throttling
    if (i + batchSize < posts.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}
```

> **Warning:** If any record's `_version` has changed between the query and the delete, that individual delete will fail with `ConditionalCheckFailedException`. Handle these failures in your error checking logic.

---

<!-- ai:crud-cascade-delete -->

## Cascade Delete (Parent with Children)

DataStore did not enforce referential integrity — you could delete a parent record without deleting its children. However, many DataStore apps manually deleted children first (comments, join table records) before deleting the parent. With Apollo Client, the same pattern applies: query children, delete each one, then delete the parent.

```typescript
// Delete a Post and all its related records (comments + tag associations)
async function cascadeDeletePost(postId: string, postVersion: number) {
  // Step 1: Delete child comments
  const { data: commentData } = await apolloClient.query({
    query: LIST_COMMENTS,
    variables: { filter: { postID: { eq: postId } } },
    fetchPolicy: 'network-only',
  });
  const comments = commentData.listComments.items.filter((c: any) => !c._deleted);
  for (const c of comments) {
    await apolloClient.mutate({
      mutation: DELETE_COMMENT,
      variables: { input: { id: c.id, _version: c._version } },
    });
  }

  // Step 2: Delete join table records (e.g., PostTag)
  const { data: ptData } = await apolloClient.query({
    query: LIST_POST_TAGS,
    variables: { filter: { postID: { eq: postId } } },
    fetchPolicy: 'network-only',
  });
  const postTags = ptData.listPostTags.items.filter((pt: any) => !pt._deleted);
  for (const pt of postTags) {
    await apolloClient.mutate({
      mutation: DELETE_POST_TAG,
      variables: { input: { id: pt.id, _version: pt._version } },
    });
  }

  // Step 3: Re-query the parent to get a fresh _version, then delete
  const { data: freshPost } = await apolloClient.query({
    query: GET_POST,
    variables: { id: postId },
    fetchPolicy: 'network-only',
  });
  await apolloClient.mutate({
    mutation: DELETE_POST,
    variables: { input: { id: postId, _version: freshPost.getPost._version } },
  });
}
```

**Key points:**

- **Delete children before the parent.** If you delete the parent first, the children become orphaned and may still appear in filtered queries.
- **Re-query the parent's `_version`** before the final delete. Deleting children may trigger subscription events that cause other clients to update the parent, changing its `_version`.
- **Use `fetchPolicy: 'network-only'`** for all queries in the cascade to ensure you have the latest `_version` values.

---

<!-- ai:crud-reference -->

## Quick Reference Table

| DataStore Method | Apollo Client Equivalent | Key Difference |
|---|---|---|
| `DataStore.save(new Model({...}))` | `apolloClient.mutate({ mutation: CREATE_POST, variables: { input: {...} } })` | No `_version` needed for creates |
| `Model.copyOf(original, draft => {...})` + `DataStore.save()` | `apolloClient.mutate({ mutation: UPDATE_POST, variables: { input: { id, _version, ...changes } } })` | Must pass `_version` from last query; plain object instead of immer draft |
| `DataStore.delete(instance)` | `apolloClient.mutate({ mutation: DELETE_POST, variables: { input: { id, _version } } })` | Must query first to get `_version` |
| `DataStore.query(Model, id)` | `apolloClient.query({ query: GET_POST, variables: { id } })` | Returns `null` instead of `undefined` when not found |
| `DataStore.query(Model)` | `apolloClient.query({ query: LIST_POSTS })` | Must filter `_deleted` records from results |
| `DataStore.delete(Model, predicate)` | Query with filter + delete each individually | No atomicity; use `Promise.allSettled` for partial failure handling |

**React Hook equivalents:**

| DataStore Pattern | React Hook Equivalent |
|---|---|
| `useState` + `useEffect` + `DataStore.save(new Model(...))` | `useMutation(CREATE_POST)` |
| `useState` + `useEffect` + `DataStore.save(Model.copyOf(...))` | `useQuery(GET_POST)` + `useMutation(UPDATE_POST)` |
| `DataStore.delete(instance)` | `useMutation(DELETE_POST)` |
| `useState` + `useEffect` + `DataStore.query(Model, id)` | `useQuery(GET_POST, { variables: { id } })` |
| `useState` + `useEffect` + `DataStore.query(Model)` | `useQuery(LIST_POSTS)` |

---

<!-- ai:crud-mistakes -->

## Common Mistakes

### 1. Forgetting `_version` in Update or Delete Mutations

The most frequent migration error. DataStore handled `_version` internally. With Apollo, you must include it yourself.

```typescript
// WRONG -- missing _version
await apolloClient.mutate({
  mutation: UPDATE_POST,
  variables: {
    input: { id: '123', title: 'New Title' },
    // Error: ConditionalCheckFailedException
  },
});

// CORRECT -- include _version from last query
await apolloClient.mutate({
  mutation: UPDATE_POST,
  variables: {
    input: { id: '123', title: 'New Title', _version: post._version },
  },
});
```

### 2. Using CREATE Mutation for Updates

DataStore's `save()` handled both creates and updates. With Apollo, you must call the correct mutation.

```typescript
// WRONG -- using CREATE_POST to "update" an existing record
await apolloClient.mutate({
  mutation: CREATE_POST, // Creates a NEW record, does NOT update
  variables: {
    input: { title: 'Updated Title', content: 'Updated content' },
  },
});

// CORRECT -- use UPDATE_POST for existing records
await apolloClient.mutate({
  mutation: UPDATE_POST,
  variables: {
    input: { id: existingPost.id, title: 'Updated Title', _version: existingPost._version },
  },
});
```

### 3. Not Filtering `_deleted` Records from List Results

DataStore automatically hid soft-deleted records. Apollo returns all records, including deleted ones.

```typescript
// WRONG -- shows deleted records to the user
const { data } = await apolloClient.query({ query: LIST_POSTS });
const posts = data.listPosts.items; // May include deleted records!

// CORRECT -- filter out soft-deleted records
const { data } = await apolloClient.query({ query: LIST_POSTS });
const posts = data.listPosts.items.filter((p: any) => !p._deleted);
```

### 4. Not Using `refetchQueries` After Mutations

DataStore's local store automatically updated queries after mutations. Apollo's cache may not update list queries automatically.

```typescript
// WRONG -- list view shows stale data after create
const [createPost] = useMutation(CREATE_POST);

// CORRECT -- refetch the list after creating
const [createPost] = useMutation(CREATE_POST, {
  refetchQueries: [{ query: LIST_POSTS }],
});
```

### 5. Using Stale `_version` Values

If you cache a record's `_version` and another user or process updates the record, your mutation will fail.

```typescript
// RISKY -- _version may be stale
const post = cachedPosts.find((p) => p.id === '123');
await apolloClient.mutate({
  mutation: UPDATE_POST,
  variables: { input: { id: '123', title: 'New', _version: post._version } },
});

// SAFER -- re-query before mutating
const { data } = await apolloClient.query({
  query: GET_POST,
  variables: { id: '123' },
  fetchPolicy: 'network-only', // Bypass cache to get fresh _version
});
await apolloClient.mutate({
  mutation: UPDATE_POST,
  variables: {
    input: { id: '123', title: 'New', _version: data.getPost._version },
  },
});
```

---

**Previous:** [Migration Checklists](./06-migration-checklist.md)

**Next:** [Predicates and Filters](./08-predicates-filters.md)
