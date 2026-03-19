# Migration Test Plan: API Only Strategy

This test plan provides step-by-step instructions for migrating the Gen 1 DataStore sample app to Apollo Client using the API Only strategy. Each step references the exact guide section, provides before/after code, and includes verification criteria.

**Strategy:** API Only -- direct GraphQL queries and mutations via Apollo Client. No local persistence beyond Apollo's in-memory cache. Simplest migration path.

**Sample app spec:** See [sample-app-spec.md](./sample-app-spec.md) for the full model schema, feature matrix, and component list.

---

## Prerequisites

- [ ] Gen 1 DataStore sample app running with all 28 features verified (see sample-app-spec.md verification checklist)
- [ ] Amplify Gen 2 backend deployed with same model schema (Post, Comment, Author, Tag, PostTag with PostStatus enum)
- [ ] `amplify_outputs.json` generated and accessible
- [ ] Cognito User Pool configured with at least 2 test users

### Dependencies to Install

```bash
npm install @apollo/client graphql
npm install @apollo/client
```

Packages:
- `@apollo/client` (3.14.x) -- Apollo Client with InMemoryCache, hooks, link chain
- `graphql` (16.x) -- GraphQL parser required by Apollo Client

---

## Phase 1: Apollo Client Setup

**Guide reference:** [guide/04-apollo-setup.md](../04-apollo-setup.md), [guide/05-subscriptions.md](../05-subscriptions.md)

### Step 1: Create HTTP Link

- [ ] Create `src/apolloClient.ts`
- [ ] Configure `createHttpLink` with AppSync endpoint from `amplify_outputs.json`

**Before (DataStore):**
```typescript
import { Amplify } from 'aws-amplify';
import config from './amplifyconfiguration.json';
Amplify.configure(config);
// DataStore auto-connects to AppSync -- no explicit endpoint config
```

**After (Apollo Client):**
```typescript
import { createHttpLink } from '@apollo/client';
import outputs from '../amplify_outputs.json';

const httpLink = createHttpLink({
  uri: outputs.data.url,
});
```

**Verify:** File compiles without errors. Endpoint URL matches your AppSync API.

### Step 2: Create Auth Link

- [ ] Configure `setContext` to inject Cognito ID token into every request

**After (Apollo Client):**
```typescript
import { setContext } from '@apollo/client/link/context';
import { fetchAuthSession } from 'aws-amplify/auth';

const authLink = setContext(async (_, { headers }) => {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  return {
    headers: {
      ...headers,
      authorization: token || '',
    },
  };
});
```

**Verify:** Token is injected into requests (check browser Network tab).

### Step 3: Create Error and Retry Links

- [ ] Add error link for logging GraphQL and network errors
- [ ] Add retry link with exponential backoff

**Guide reference:** [guide/04-apollo-setup.md -- Error Handling Link](../04-apollo-setup.md)

**Verify:** Intentionally break the endpoint URL and confirm error link logs the error. Restore URL.

### Step 4: Assemble Apollo Client

- [ ] Compose link chain: `authLink -> retryLink -> errorLink -> httpLink`
- [ ] Create `InMemoryCache` with basic config
- [ ] Create `ApolloClient` instance
- [ ] Wrap app with `ApolloProvider`

**After (Apollo Client):**
```typescript
import { ApolloClient, InMemoryCache, ApolloProvider, from } from '@apollo/client';

const apolloClient = new ApolloClient({
  link: from([authLink, retryLink, errorLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
});

// In App.tsx:
<ApolloProvider client={apolloClient}>
  {/* app content */}
</ApolloProvider>
```

**Verify:** App renders. No console errors. Apollo DevTools show the client is connected.

### Step 5: Set Up Amplify Subscription Client

- [ ] Create Amplify `generateClient()` for subscriptions alongside Apollo Client

**Guide reference:** [guide/05-subscriptions.md](../05-subscriptions.md)

**After:**
```typescript
import { generateClient } from 'aws-amplify/api';
const amplifyClient = generateClient();
```

**Verify:** Subscription client created. Will be tested in Phase 6.

### Step 6: Define GraphQL Operations

- [ ] Create `src/graphql/operations.ts` with all query, mutation, and subscription definitions
- [ ] Include: `CREATE_POST`, `UPDATE_POST`, `DELETE_POST`, `GET_POST`, `LIST_POSTS`, and equivalents for Comment, Author, Tag, PostTag
- [ ] Include subscription definitions: `ON_CREATE_POST`, `ON_UPDATE_POST`, `ON_DELETE_POST`

**Guide reference:** [guide/03-prerequisites.md -- Complete Operation Definitions](../03-prerequisites.md)

**Verify:** All operations parse without errors. TypeScript types match schema.

---

## Phase 2: CRUD Migration

**Guide reference:** [guide/07-crud-operations.md](../07-crud-operations.md)

### Step 7: Migrate Create Operation

- [ ] Replace `DataStore.save(new Post({...}))` with `useMutation(CREATE_POST)`

**Before (DataStore):**
```typescript
const newPost = await DataStore.save(
  new Post({ title: 'My Post', content: 'Hello', status: 'PUBLISHED', rating: 5 })
);
```

**After (Apollo Client):**
```typescript
import { useMutation } from '@apollo/client';
import { CREATE_POST, LIST_POSTS } from './graphql/operations';

const [createPost] = useMutation(CREATE_POST, {
  refetchQueries: [{ query: LIST_POSTS }],
});

const result = await createPost({
  variables: {
    input: { title: 'My Post', content: 'Hello', status: 'PUBLISHED', rating: 5 },
  },
});
```

**Verify:** New post appears in DynamoDB. Post list updates after mutation completes.

### Step 8: Migrate Query by ID

- [ ] Replace `DataStore.query(Post, id)` with `useQuery(GET_POST)`

**Before (DataStore):**
```typescript
const post = await DataStore.query(Post, postId);
```

**After (Apollo Client):**
```typescript
import { useQuery } from '@apollo/client';
import { GET_POST } from './graphql/operations';

const { data, loading, error } = useQuery(GET_POST, {
  variables: { id: postId },
});
const post = data?.getPost;
```

**Verify:** Post detail page loads correct post. Loading state shows during fetch.

### Step 9: Migrate List All

- [ ] Replace `DataStore.query(Post)` with `useQuery(LIST_POSTS)`

**Before (DataStore):**
```typescript
const posts = await DataStore.query(Post);
```

**After (Apollo Client):**
```typescript
const { data, loading } = useQuery(LIST_POSTS);
const posts = data?.listPosts?.items?.filter((p: any) => !p._deleted) ?? [];
```

**Verify:** All posts display. `_deleted` records are filtered out.

### Step 10: Migrate Update

- [ ] Replace `DataStore.save(Post.copyOf(...))` with `useMutation(UPDATE_POST)`
- [ ] Include `_version` in mutation input

**Before (DataStore):**
```typescript
await DataStore.save(
  Post.copyOf(existingPost, updated => { updated.title = 'New Title'; })
);
```

**After (Apollo Client):**
```typescript
const [updatePost] = useMutation(UPDATE_POST, {
  refetchQueries: [{ query: LIST_POSTS }],
});

await updatePost({
  variables: {
    input: { id: post.id, title: 'New Title', _version: post._version },
  },
});
```

**Verify:** Post updates in DynamoDB. `_version` increments. UI reflects change.

### Step 11: Migrate Delete

- [ ] Replace `DataStore.delete(post)` with `useMutation(DELETE_POST)`
- [ ] Include `_version` in mutation input

**Before (DataStore):**
```typescript
await DataStore.delete(post);
```

**After (Apollo Client):**
```typescript
const [deletePost] = useMutation(DELETE_POST, {
  refetchQueries: [{ query: LIST_POSTS }],
});

await deletePost({
  variables: {
    input: { id: post.id, _version: post._version },
  },
});
```

**Verify:** Post soft-deleted in DynamoDB (`_deleted: true`). Post disappears from filtered list.

### Step 12: Migrate Batch Delete

- [ ] Replace `DataStore.delete(Post, predicate)` with query-then-delete loop

**Before (DataStore):**
```typescript
await DataStore.delete(Post, p => p.status.eq('ARCHIVED'));
```

**After (Apollo Client):**
```typescript
// Query archived posts first
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: { filter: { status: { eq: 'ARCHIVED' } } },
});

// Delete each one
const results = await Promise.allSettled(
  data.listPosts.items
    .filter((p: any) => !p._deleted)
    .map((post: any) =>
      apolloClient.mutate({
        mutation: DELETE_POST,
        variables: { input: { id: post.id, _version: post._version } },
      })
    )
);
```

**Verify:** All ARCHIVED posts are soft-deleted. Partial failures are handled gracefully.

---

## Phase 3: Predicates and Queries

**Guide reference:** [guide/08-predicates-filters.md](../08-predicates-filters.md)

### Step 13: Migrate Equality Operators (eq, ne)

- [ ] Replace `p.status.eq('PUBLISHED')` with `{ filter: { status: { eq: 'PUBLISHED' } } }`
- [ ] Replace `p.status.ne('DRAFT')` with `{ filter: { status: { ne: 'DRAFT' } } }`

**Before (DataStore):**
```typescript
const posts = await DataStore.query(Post, p => p.status.eq('PUBLISHED'));
```

**After (Apollo Client):**
```typescript
const { data } = useQuery(LIST_POSTS, {
  variables: { filter: { status: { eq: 'PUBLISHED' } } },
});
```

**Verify:** Only PUBLISHED posts returned. No DRAFT or ARCHIVED posts in results.

### Step 14: Migrate Comparison Operators (gt, ge, lt, le, between)

- [ ] Replace `p.rating.gt(3)` with `{ filter: { rating: { gt: 3 } } }`
- [ ] Replace `p.rating.between(2, 4)` with `{ filter: { rating: { between: [2, 4] } } }`
- [ ] Test all 5 comparison operators

**Verify:** Results match DataStore's behavior for each operator.

### Step 15: Migrate String Operators (contains, notContains, beginsWith)

- [ ] Replace `p.title.contains('hello')` with `{ filter: { title: { contains: 'hello' } } }`
- [ ] Replace `p.title.notContains('spam')` with `{ filter: { title: { notContains: 'spam' } } }`
- [ ] Replace `p.title.beginsWith('Hello')` with `{ filter: { title: { beginsWith: 'Hello' } } }`

**Verify:** String filtering matches DataStore behavior. Case sensitivity matches.

### Step 16: Migrate Logical Operators (and, or, not)

- [ ] Replace `p.and(p => [...])` with `{ filter: { and: [...] } }`
- [ ] Replace `p.or(p => [...])` with `{ filter: { or: [...] } }`
- [ ] Replace `p.not(p => ...)` with `{ filter: { not: { ... } } }`

**Before (DataStore):**
```typescript
const posts = await DataStore.query(Post, p =>
  p.and(p => [p.status.eq('PUBLISHED'), p.rating.gt(3)])
);
```

**After (Apollo Client):**
```typescript
const { data } = useQuery(LIST_POSTS, {
  variables: {
    filter: {
      and: [{ status: { eq: 'PUBLISHED' } }, { rating: { gt: 3 } }],
    },
  },
});
```

**Verify:** Combined filters return correct intersection/union of results.

### Step 17: Migrate Pagination

- [ ] Replace DataStore page/limit with Apollo `nextToken`-based pagination
- [ ] Note: AppSync uses cursor-based pagination, not page-based

**Before (DataStore):**
```typescript
const posts = await DataStore.query(Post, Predicates.ALL, {
  page: 0, limit: 10,
});
```

**After (Apollo Client):**
```typescript
const { data, fetchMore } = useQuery(LIST_POSTS, {
  variables: { limit: 10 },
});

// Load next page:
await fetchMore({
  variables: { nextToken: data.listPosts.nextToken, limit: 10 },
});
```

**Verify:** First page returns 10 items. Fetching more appends additional items. No duplicates.

### Step 18: Migrate Sorting

- [ ] Replace DataStore `sort` option with client-side sorting
- [ ] AppSync does not support server-side sorting on list queries without `@index`

**Before (DataStore):**
```typescript
const posts = await DataStore.query(Post, Predicates.ALL, {
  sort: s => s.createdAt(SortDirection.DESCENDING),
});
```

**After (Apollo Client):**
```typescript
const { data } = useQuery(LIST_POSTS);
const sortedPosts = [...(data?.listPosts?.items ?? [])]
  .filter((p: any) => !p._deleted)
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
```

**Verify:** Posts display in correct sort order. Sort toggle switches between ascending and descending.

---

## Phase 4: Relationships

**Guide reference:** [guide/09-relationships.md](../09-relationships.md)

### Step 19: Migrate hasMany (Post -> Comments)

- [ ] Replace `post.comments.toArray()` with GraphQL nested selection set

**Before (DataStore):**
```typescript
const comments = await post.comments.toArray();
```

**After (Apollo Client):**
```typescript
// Include comments in the GET_POST query selection set:
const GET_POST_WITH_COMMENTS = gql`
  query GetPost($id: ID!) {
    getPost(id: $id) {
      id
      title
      content
      comments {
        items {
          id
          content
          _deleted
        }
      }
    }
  }
`;

const { data } = useQuery(GET_POST_WITH_COMMENTS, { variables: { id: postId } });
const comments = data?.getPost?.comments?.items?.filter((c: any) => !c._deleted) ?? [];
```

**Verify:** Comments load with their parent post. `_deleted` comments are filtered out.

### Step 20: Migrate belongsTo (Comment -> Post)

- [ ] Replace `comment.post` with GraphQL nested selection set

**Before (DataStore):**
```typescript
const parentPost = await comment.post;
```

**After (Apollo Client):**
```typescript
// Include post in the GET_COMMENT query:
const GET_COMMENT = gql`
  query GetComment($id: ID!) {
    getComment(id: $id) {
      id
      content
      post {
        id
        title
      }
    }
  }
`;
```

**Verify:** Comment displays its parent post title. Navigation from comment to post works.

### Step 21: Migrate manyToMany (Post <-> Tag via PostTag)

- [ ] Replace join table traversal with nested GraphQL selection sets
- [ ] Filter `_deleted` on PostTag records

**Before (DataStore):**
```typescript
const postTags = await post.postTags.toArray();
const tags = await Promise.all(postTags.map(pt => pt.tag));
```

**After (Apollo Client):**
```typescript
const GET_POST_WITH_TAGS = gql`
  query GetPost($id: ID!) {
    getPost(id: $id) {
      id
      title
      postTags {
        items {
          id
          _deleted
          tag {
            id
            label
          }
        }
      }
    }
  }
`;

const tags = data?.getPost?.postTags?.items
  ?.filter((pt: any) => !pt._deleted)
  ?.map((pt: any) => pt.tag) ?? [];
```

**Verify:** Tags display on post detail. Adding/removing tags via PostTag updates correctly.

---

## Phase 5: React Integration

**Guide reference:** [guide/10-react-integration.md](../10-react-integration.md)

### Step 22: Convert PostList to useQuery

- [ ] Replace `useState` + `useEffect` + `DataStore.query()` pattern with `useQuery`
- [ ] Remove manual loading state management

**Before (DataStore):**
```typescript
const [posts, setPosts] = useState<Post[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  DataStore.query(Post).then(results => {
    setPosts(results);
    setLoading(false);
  });
}, []);
```

**After (Apollo Client):**
```typescript
const { data, loading, error } = useQuery(LIST_POSTS);
const posts = data?.listPosts?.items?.filter((p: any) => !p._deleted) ?? [];
```

**Verify:** Component renders post list. Loading state works. Error state displays on failure.

### Step 23: Convert PostForm to useMutation

- [ ] Replace `DataStore.save()` calls with `useMutation` hooks
- [ ] Handle loading and error states from mutation result

**After (Apollo Client):**
```typescript
const [createPost, { loading: saving }] = useMutation(CREATE_POST, {
  refetchQueries: [{ query: LIST_POSTS }],
});

const handleSubmit = async () => {
  await createPost({
    variables: { input: { title, content, status, rating } },
  });
};
```

**Verify:** Create and update forms work. Button disables during save. Error messages display on failure.

### Step 24: Remove All DataStore Imports

- [ ] Search for and remove all `import { DataStore } from 'aws-amplify/datastore'`
- [ ] Search for and remove all `import { Post, Comment, ... } from './models'`
- [ ] Remove `models/` directory

**Verify:** `grep -r "DataStore" src/` returns zero results. `grep -r "from './models'" src/` returns zero results.

---

## Phase 6: Real-Time

**Guide reference:** [guide/10-react-integration.md -- Real-Time Observation](../10-react-integration.md), [guide/05-subscriptions.md](../05-subscriptions.md)

### Step 25: Replace observe with Amplify Subscriptions

- [ ] Replace `DataStore.observe(Post)` with Amplify `client.graphql({ query: onCreatePost }).subscribe()`
- [ ] Set up subscriptions for create, update, and delete events

**Before (DataStore):**
```typescript
const sub = DataStore.observe(Post).subscribe(msg => {
  console.log(msg.opType, msg.element);
});
```

**After (Amplify Subscriptions):**
```typescript
import { generateClient } from 'aws-amplify/api';
import { onCreatePost, onUpdatePost, onDeletePost } from './graphql/subscriptions';

const client = generateClient();

const createSub = client.graphql({ query: onCreatePost }).subscribe({
  next: ({ data }) => addToLog(`CREATE: ${data.onCreatePost.title}`),
});

const updateSub = client.graphql({ query: onUpdatePost }).subscribe({
  next: ({ data }) => addToLog(`UPDATE: ${data.onUpdatePost.title}`),
});

const deleteSub = client.graphql({ query: onDeletePost }).subscribe({
  next: ({ data }) => addToLog(`DELETE: ${data.onDeletePost.title}`),
});
```

**Verify:** Creating a post in a second browser tab triggers the subscription. Update and delete events also fire.

### Step 26: Replace observeQuery with useQuery + Refetch

- [ ] Replace `DataStore.observeQuery()` with `useQuery` plus subscription-triggered refetch

**Before (DataStore):**
```typescript
const sub = DataStore.observeQuery(Post, p => p.status.eq('PUBLISHED')).subscribe(
  snapshot => {
    setPosts(snapshot.items);
    setIsSynced(snapshot.isSynced);
  }
);
```

**After (Apollo Client + Amplify):**
```typescript
const { data, refetch } = useQuery(LIST_POSTS, {
  variables: { filter: { status: { eq: 'PUBLISHED' } } },
});

useEffect(() => {
  const client = generateClient();
  const sub = client.graphql({ query: onCreatePost }).subscribe({
    next: () => refetch(),
  });
  // Also subscribe to onUpdatePost, onDeletePost with refetch
  return () => sub.unsubscribe();
}, [refetch]);
```

**Verify:** Published post count updates in real time when another user creates/updates/deletes a post. No manual refresh needed.

---

## Phase 7: Auth

**Guide reference:** [guide/04-apollo-setup.md -- Sign-Out](../04-apollo-setup.md)

### Step 27: Verify Owner-Based Filtering

- [ ] Sign in as User A and create posts
- [ ] Sign in as User B and verify User B cannot see User A's posts (owner auth)
- [ ] Verify mutations are scoped to the authenticated user

**Verify:** Each user sees only their own data. Attempting to update another user's post returns an unauthorized error.

### Step 28: Migrate Sign-Out Cleanup

- [ ] Replace `DataStore.clear()` with `apolloClient.clearStore()`

**Before (DataStore):**
```typescript
const handleSignOut = async () => {
  await DataStore.clear();
  await Auth.signOut();
};
```

**After (Apollo Client):**
```typescript
import { signOut } from 'aws-amplify/auth';

const handleSignOut = async () => {
  await apolloClient.clearStore();
  await signOut();
};
```

**Verify:** After sign-out and re-sign-in as a different user, no stale data from the previous user is visible. Apollo DevTools show empty cache after clearStore.

---

## Final Verification Checklist

Complete this checklist after all migration steps. Every item must pass.

### CRUD Operations
- [ ] Create a new post with all fields -- post appears in DynamoDB and UI
- [ ] Query a post by ID -- correct post loads on detail page
- [ ] List all posts -- all posts display, `_deleted` records filtered out
- [ ] Update a post -- changes saved, `_version` increments
- [ ] Delete a post -- post soft-deleted, disappears from list
- [ ] Batch delete ARCHIVED posts -- all matching posts removed

### Predicates
- [ ] Filter by status (eq) -- only matching status returned
- [ ] Filter by status (ne) -- matching status excluded
- [ ] Filter by rating (gt, ge, lt, le) -- correct numeric comparison
- [ ] Filter by rating (between) -- inclusive range works
- [ ] Filter by title (contains) -- substring match works
- [ ] Filter by title (notContains) -- exclusion works
- [ ] Filter by title (beginsWith) -- prefix match works
- [ ] Combine with and -- intersection of conditions
- [ ] Combine with or -- union of conditions
- [ ] Combine with not -- negation works

### Pagination and Sorting
- [ ] Pagination loads 10 items per page
- [ ] Next page loads additional items
- [ ] Sort ascending/descending works

### Relationships
- [ ] Post -> Comments (hasMany) loads correctly
- [ ] Comment -> Post (belongsTo) navigates correctly
- [ ] Post <-> Tag (manyToMany via PostTag) displays correctly
- [ ] Adding a tag to a post creates PostTag record
- [ ] Removing a tag from a post deletes PostTag record

### Real-Time
- [ ] Create event fires subscription
- [ ] Update event fires subscription
- [ ] Delete event fires subscription
- [ ] Published posts count updates in real time

### Auth
- [ ] Owner-based auth scopes data to current user
- [ ] Sign-out clears Apollo cache
- [ ] Re-sign-in shows correct user's data only

### No DataStore Remaining
- [ ] `grep -r "DataStore" src/` returns zero results
- [ ] `grep -r "from './models'" src/` returns zero results
- [ ] `grep -r "@aws-amplify/datastore" package.json` returns zero results
- [ ] No regressions -- all features work end-to-end
