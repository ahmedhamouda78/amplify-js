<!-- ai:prerequisites -->

# Prerequisites

This page covers everything you need before setting up Apollo Client: required tools, installing Apollo Client, retrieving your GraphQL schema, writing GraphQL operations, and understanding the `_version` metadata fields that conflict-resolution-enabled backends require.

## Before You Begin

Before starting the migration, make sure you have:

- [ ] An existing **Amplify Gen 1 backend** with your data models deployed and working
- [ ] Your Amplify configuration file (`amplifyconfiguration.json` or `aws-exports.js`) in your project
- [ ] The `aws-amplify` v6 package installed and configured (`Amplify.configure(config)` called at app startup)
- [ ] Familiarity with **GraphQL syntax** — queries, mutations, and subscriptions

> **You do NOT need to migrate your backend to Gen 2.** This guide assumes you are keeping your existing Gen 1 backend and replacing the DataStore client library with Apollo Client. The `aws-amplify` v6 library works with Gen 1 backends — you only need to update how you call the API, not your infrastructure.

## Install Apollo Client

Install Apollo Client:

```bash
npm install @apollo/client@^3.14.0
```

You do **not** need to install `graphql` separately — it is already provided by `aws-amplify`. Apollo Client's peer dependency on `graphql` (`^15.0.0 || ^16.0.0`) is satisfied by the `graphql@15.8.0` that `aws-amplify` installs. Installing `graphql` explicitly would cause npm to resolve a newer version (v16), which conflicts with `aws-amplify`'s pinned `graphql@15.8.0` and fails with an `ERESOLVE` error.

**Why Apollo Client v3 (not v4)?** The `apollo3-cache-persist` library — needed for the Local Caching strategy covered later in this guide — only supports Apollo Client v3. Starting with v3 avoids a disruptive version migration mid-project. Apollo Client 4.x introduces breaking API changes (class-based links, different import paths, React exports moved to a `/react` subpath) that are incompatible with v3 code. Using `@apollo/client@^3.14.0` ensures you get the latest v3 release (3.14.1) with all stability fixes.

> **Note:** You should already have `aws-amplify` v6 installed in your project. If you are still on `aws-amplify` v5, upgrade to v6 first — it supports Gen 1 backends and provides the `fetchAuthSession()` and `generateClient()` APIs used throughout this guide.

## Retrieving Your GraphQL Schema

Your Amplify Gen 1 backend defines data models in `amplify/backend/api/*/schema.graphql`. The GraphQL schema and auto-generated operations (queries, mutations, subscriptions) are in your project's `src/graphql/` directory.

### Finding Your GraphQL Endpoint

Your GraphQL endpoint and auth configuration are in your Amplify configuration file (`amplifyconfiguration.json` or `aws-exports.js`):

```json
{
  "aws_appsync_graphqlEndpoint": "https://xxxxx.appsync-api.us-east-1.amazonaws.com/graphql",
  "aws_appsync_region": "us-east-1",
  "aws_appsync_authenticationType": "AMAZON_COGNITO_USER_POOLS"
}
```

You will use `config.aws_appsync_graphqlEndpoint` when configuring Apollo Client in the next section.

### Using Your Existing Generated Operations

Your Gen 1 project already has auto-generated GraphQL operations in `src/graphql/` (queries, mutations, subscriptions). These operations continue to work with your Gen 1 backend — you can reference them when writing the Apollo Client operations below. The generated files show the exact field names, filter input types, and subscription signatures for your schema.

### Manual Approach

Alternatively, you can copy queries, mutations, and subscriptions directly from the **AWS AppSync console**:

1. Open the [AppSync console](https://console.aws.amazon.com/appsync)
2. Select your API
3. Go to the **Schema** tab to see your full GraphQL schema
4. Use the **Queries** tab to test operations interactively

<!-- ai:graphql-operations -->

## Writing GraphQL Operations

Apollo Client uses `gql` tagged template literals to define GraphQL operations. This section shows the standard patterns using a `Post` model as the running example.

### GraphQL Fragment for Reusable Field Selection

Fragments let you define a reusable set of fields. Every operation references this fragment, ensuring consistent field selection across your app:

```graphql
fragment PostDetails on Post {
  id
  title
  content
  status
  rating
  createdAt
  updatedAt
  _version
  _deleted
  _lastChangedAt
  owner
}
```

> **Important:** The `_version`, `_deleted`, and `_lastChangedAt` fields are required for backends with conflict resolution enabled. See [Understanding _version Metadata](#understanding-_version-metadata) below.

> **Note:** If your model uses **owner-based authorization** (`@auth(rules: [{ allow: owner }])`), include the `owner` field in your fragments. This field is needed for owner-scoped subscriptions (see [React Integration — Owner-Based Auth Subscriptions](./10-react-integration.md#owner-based-auth-subscriptions)). DataStore apps commonly use owner-based auth.

### Result Types

Define a TypeScript interface that matches the fields in your fragment. This is used with `TypedDocumentNode` to give Apollo Client fully typed query results — your hooks and queries return typed data instead of `any`, so you get compile-time checks and IDE autocomplete on every field:

```typescript
// Result type matching the PostDetails fragment fields
export interface Post {
  id: string;
  title: string;
  content: string;
  status: string;
  rating: number | null;
  createdAt: string;
  updatedAt: string;
  _version: number;
  _deleted: boolean | null;
  _lastChangedAt: number;
  owner: string | null;
}
```

> **Multi-model apps:** Define a result interface for **each model** in your app. Co-locate them with the operations in your `src/graphql/operations.ts` file. For a 4-model app, expect roughly 4 result interfaces plus 2-3 query/mutation result wrappers per model.

### Complete Operation Definitions

Every operation is typed with `TypedDocumentNode<ResultType>`. This tells Apollo Client the shape of the response data, so `useQuery`, `useMutation`, and `apolloClient.query()` all return typed results:

```typescript
import { gql } from '@apollo/client';
import type { TypedDocumentNode } from '@apollo/client';

// Fragment for consistent field selection
const POST_DETAILS_FRAGMENT = gql`
  fragment PostDetails on Post {
    id
    title
    content
    status
    rating
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    owner
  }
`;

// --- Result wrapper types ---

interface ListPostsResult {
  listPosts: { items: Post[]; nextToken: string | null };
}

interface GetPostResult {
  getPost: Post | null;
}

interface CreatePostResult {
  createPost: Post;
}

interface UpdatePostResult {
  updatePost: Post;
}

interface DeletePostResult {
  deletePost: Post;
}

// --- Typed operations ---

// List all posts
export const LIST_POSTS: TypedDocumentNode<ListPostsResult> = gql`
  ${POST_DETAILS_FRAGMENT}
  query ListPosts($filter: ModelPostFilterInput, $limit: Int, $nextToken: String) {
    listPosts(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        ...PostDetails
      }
      nextToken
    }
  }
`;

// Get a single post by ID
export const GET_POST: TypedDocumentNode<GetPostResult> = gql`
  ${POST_DETAILS_FRAGMENT}
  query GetPost($id: ID!) {
    getPost(id: $id) {
      ...PostDetails
    }
  }
`;

// Create a new post
export const CREATE_POST: TypedDocumentNode<CreatePostResult> = gql`
  ${POST_DETAILS_FRAGMENT}
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ...PostDetails
    }
  }
`;

// Update an existing post
export const UPDATE_POST: TypedDocumentNode<UpdatePostResult> = gql`
  ${POST_DETAILS_FRAGMENT}
  mutation UpdatePost($input: UpdatePostInput!) {
    updatePost(input: $input) {
      ...PostDetails
    }
  }
`;

// Delete a post
export const DELETE_POST: TypedDocumentNode<DeletePostResult> = gql`
  ${POST_DETAILS_FRAGMENT}
  mutation DeletePost($input: DeletePostInput!) {
    deletePost(input: $input) {
      ...PostDetails
    }
  }
`;
```

Note that every operation — including mutations — returns the full `PostDetails` fragment. This ensures you always have the latest `_version` value for subsequent mutations.

Because every operation is typed, Apollo hooks return typed data throughout your app:

```typescript
const { data } = useQuery(LIST_POSTS);
// data is ListPostsResult — data.listPosts.items is Post[]
// Full autocomplete on .id, .title, ._version, etc.

const [updatePost] = useMutation(UPDATE_POST);
// result.data.updatePost is Post
```

> **Multi-model apps:** The examples above use a `Post` model. Create a similar result interface, wrapper types, and set of typed operations (list, get, create, update, delete) for **each model** in your app. For relationship models (e.g., Comment, Tag, join tables), see the [Relationships](./09-relationships.md) section for the additional query patterns you will need.

> **Gen 1 field name casing:** The examples in this guide use Gen 2 lowercase conventions for foreign key fields (e.g., `postId`, `tagId`). Gen 1 backends generate these with uppercase ID suffixes (`postID`, `tagID`). **Your GraphQL operations must match your actual schema field names exactly.** A mismatched field name does not produce an error — AppSync silently returns `null` for fields that do not exist. Check your `src/graphql/queries.js` or the AppSync console's Schema tab to confirm the correct casing for your backend. See also [Relationships](./09-relationships.md) for details on foreign key field conventions.

> **Replacing DataStore enums:** DataStore model files export TypeScript `enum` types (e.g., `PostStatus`). After migration, you no longer import from `./models`, so you need to define these values yourself. If your TypeScript configuration has `erasableSyntaxOnly: true` (the default in TypeScript 5.9+ and Vite 8 scaffolds — note that Vite 8 sets this in `tsconfig.app.json`, not `tsconfig.json`), `enum` declarations are not allowed because they emit runtime code. Use a `const` object with `as const` instead:
>
> ```typescript
> // Instead of: enum PostStatus { DRAFT = 'DRAFT', PUBLISHED = 'PUBLISHED', ARCHIVED = 'ARCHIVED' }
> const PostStatus = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', ARCHIVED: 'ARCHIVED' } as const;
> type PostStatus = (typeof PostStatus)[keyof typeof PostStatus];
> ```

<!-- ai:version-metadata -->

## Understanding _version Metadata

This is one of the most important sections in this guide. If your app used DataStore, your backend **has conflict resolution enabled**, and you must handle three metadata fields correctly or your mutations will fail.

### Why These Fields Exist

DataStore enables **conflict resolution** on the AppSync backend via DynamoDB. This mechanism adds three metadata fields to every model:

| Field | Type | Purpose |
|-------|------|---------|
| `_version` | `Int` | Optimistic locking counter. Incremented on every successful mutation. |
| `_deleted` | `Boolean` | Soft-delete flag. When `true`, the record is logically deleted but still exists in DynamoDB. |
| `_lastChangedAt` | `AWSTimestamp` | Millisecond timestamp of the last change. Set automatically by AppSync. |

### When You Need Them

If your app used DataStore, your backend **has** conflict resolution enabled. This means:

- **All mutations require `_version`** in the input. Omitting it causes a `ConditionalCheckFailedException`.
- **All queries should select** `_version`, `_deleted`, and `_lastChangedAt` in the response fields.
- **List queries return soft-deleted records.** You must filter them out in your application code.

### How to Handle Them

Follow these three rules:

1. **Always include metadata fields in response selections.** Every query and mutation response should include `_version`, `_deleted`, and `_lastChangedAt` (the `PostDetails` fragment above does this).

2. **Always pass `_version` from the last query result into mutation inputs.** This is how AppSync knows which version of the record you are modifying:

```typescript
// First, query the current post (includes _version in response)
const { data } = await apolloClient.query({ query: GET_POST, variables: { id: postId } });
const post = data.getPost;

// Then, pass _version when updating
await apolloClient.mutate({
  mutation: UPDATE_POST,
  variables: {
    input: {
      id: post.id,
      title: 'Updated Title',
      _version: post._version,  // REQUIRED — from the query result
    },
  },
});
```

3. **Filter soft-deleted records from list query results:**

```typescript
const { data } = await apolloClient.query({ query: LIST_POSTS });
const activePosts = data.listPosts.items.filter(post => !post._deleted);
```

### What Happens Without _version

```typescript
// WITHOUT _version in mutation input:
await apolloClient.mutate({
  mutation: UPDATE_POST,
  variables: {
    input: { id: post.id, title: 'Updated Title' },
    // Missing _version!
  },
});
// Error: "ConditionalCheckFailedException" or "ConflictUnhandled"

// WITH _version:
await apolloClient.mutate({
  mutation: UPDATE_POST,
  variables: {
    input: { id: post.id, title: 'Updated Title', _version: post._version },
  },
});
// Success: mutation completes, returns new _version value (e.g., _version: 2)
```

### Helper: Filter Soft-Deleted Records

A simple utility function to filter out soft-deleted records from any list query. Because the operations are typed with `TypedDocumentNode`, the generic infers `T` from the actual item type (e.g., `Post`) and the return type preserves full field access:

```typescript
function filterDeleted<T extends { _deleted?: boolean | null }>(items: T[]): T[] {
  return items.filter(item => !item._deleted);
}

// Usage — returns Post[] with full type safety
const { data } = await apolloClient.query({ query: LIST_POSTS });
const activePosts = filterDeleted(data.listPosts.items);
activePosts[0].id;       // string
activePosts[0]._version; // number
```

### Can I Disable Conflict Resolution?

Yes, but it requires backend changes. You would need to modify your `amplify/data/resource.ts` to remove the conflict resolution configuration and redeploy. Once disabled, the `_version`, `_deleted`, and `_lastChangedAt` fields are no longer required.

This guide assumes conflict resolution is **still active**, which is the default state for any app migrated from DataStore. For instructions on disabling conflict resolution, see the [Amplify Gen 2 data modeling documentation](https://docs.amplify.aws/react/build-a-backend/data/).

---

**Next:** [Apollo Client Setup](./04-apollo-setup.md) — Configure Apollo Client with auth, error handling, and retry logic.

**Previous:** [Decision Framework](./01-decision-framework.md)
