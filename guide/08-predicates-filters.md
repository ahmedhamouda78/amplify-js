<!-- ai:predicates-filters -->

# Predicates, Filters, Pagination, and Sorting

This page covers the most syntax-heavy part of the migration: translating DataStore's callback-based predicates into Apollo Client's JSON filter objects, adapting to cursor-based pagination, and implementing sorting without server-side support.

DataStore uses **callback predicates** where you chain operators on a proxy object:

```typescript
// DataStore predicate syntax
const posts = await DataStore.query(Post, (p) =>
  p.and((p) => [p.rating.gt(4), p.status.eq('PUBLISHED')])
);
```

Apollo Client and AppSync use **JSON filter objects** passed as query variables:

```typescript
// Apollo Client / AppSync filter syntax
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: {
    filter: {
      and: [{ rating: { gt: 4 } }, { status: { eq: 'PUBLISHED' } }],
    },
  },
});
const posts = data.listPosts.items.filter((p: any) => !p._deleted);
```

The `LIST_POSTS` query from [Prerequisites](./03-prerequisites.md#complete-operation-definitions) already accepts `$filter: ModelPostFilterInput`, `$limit: Int`, and `$nextToken: String` variables. This page shows how to use them.

**GraphQL operations and imports** used on this page are defined in the [Prerequisites](./03-prerequisites.md#complete-operation-definitions) page. The Apollo Client instance (`apolloClient`) is configured in the [Apollo Client Setup](./04-apollo-setup.md#complete-setup-file) page. Import them as needed:

```typescript
import { apolloClient } from './apolloClient';
import { LIST_POSTS } from './graphql/operations';
```

---

<!-- ai:operator-table -->

## Filter Operator Mapping

DataStore has exactly 12 comparison operators. The first 10 map directly to AppSync's `ModelFilterInput` with identical names. The last 2 (`in` and `notIn`) use a different syntax in AppSync -- see the pattern below.

| # | Operator | DataStore Syntax | GraphQL Syntax | Notes |
|---|----------|-----------------|----------------|-------|
| 1 | `eq` | `p.field.eq(value)` | `{ field: { eq: value } }` | Exact match |
| 2 | `ne` | `p.field.ne(value)` | `{ field: { ne: value } }` | Not equal |
| 3 | `gt` | `p.field.gt(value)` | `{ field: { gt: value } }` | Greater than |
| 4 | `ge` | `p.field.ge(value)` | `{ field: { ge: value } }` | Greater than or equal |
| 5 | `lt` | `p.field.lt(value)` | `{ field: { lt: value } }` | Less than |
| 6 | `le` | `p.field.le(value)` | `{ field: { le: value } }` | Less than or equal |
| 7 | `contains` | `p.field.contains(value)` | `{ field: { contains: value } }` | Substring match (string fields) |
| 8 | `notContains` | `p.field.notContains(value)` | `{ field: { notContains: value } }` | Substring not present |
| 9 | `beginsWith` | `p.field.beginsWith(value)` | `{ field: { beginsWith: value } }` | String prefix match |
| 10 | `between` | `p.field.between(lo, hi)` | `{ field: { between: [lo, hi] } }` | Inclusive range (two values) |
| 11 | `in` | `p.field.in([v1, v2])` | Use `or`+`eq` pattern | See [pattern below](#matching-multiple-values-in-and-notin) |
| 12 | `notIn` | `p.field.notIn([v1, v2])` | Use `and`+`ne` pattern | See [pattern below](#matching-multiple-values-in-and-notin) |

### Before/After Examples for Each Operator

**eq -- Exact match:**

<!-- before: DataStore -->

```typescript
const published = await DataStore.query(Post, (p) => p.status.eq('PUBLISHED'));
```

<!-- after: Apollo Client -->

```typescript
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: { filter: { status: { eq: 'PUBLISHED' } } },
});
const published = data.listPosts.items.filter((p: any) => !p._deleted);
```

**ne -- Not equal:**

<!-- before: DataStore -->

```typescript
const nonDrafts = await DataStore.query(Post, (p) => p.status.ne('DRAFT'));
```

<!-- after: Apollo Client -->

```typescript
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: { filter: { status: { ne: 'DRAFT' } } },
});
const nonDrafts = data.listPosts.items.filter((p: any) => !p._deleted);
```

**gt -- Greater than:**

<!-- before: DataStore -->

```typescript
const highRated = await DataStore.query(Post, (p) => p.rating.gt(4));
```

<!-- after: Apollo Client -->

```typescript
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: { filter: { rating: { gt: 4 } } },
});
const highRated = data.listPosts.items.filter((p: any) => !p._deleted);
```

**ge -- Greater than or equal:**

<!-- before: DataStore -->

```typescript
const ratedFourPlus = await DataStore.query(Post, (p) => p.rating.ge(4));
```

<!-- after: Apollo Client -->

```typescript
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: { filter: { rating: { ge: 4 } } },
});
const ratedFourPlus = data.listPosts.items.filter((p: any) => !p._deleted);
```

**lt -- Less than:**

<!-- before: DataStore -->

```typescript
const lowRated = await DataStore.query(Post, (p) => p.rating.lt(3));
```

<!-- after: Apollo Client -->

```typescript
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: { filter: { rating: { lt: 3 } } },
});
const lowRated = data.listPosts.items.filter((p: any) => !p._deleted);
```

**le -- Less than or equal:**

<!-- before: DataStore -->

```typescript
const ratedThreeOrLess = await DataStore.query(Post, (p) => p.rating.le(3));
```

<!-- after: Apollo Client -->

```typescript
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: { filter: { rating: { le: 3 } } },
});
const ratedThreeOrLess = data.listPosts.items.filter((p: any) => !p._deleted);
```

**contains -- Substring match:**

<!-- before: DataStore -->

```typescript
const reactPosts = await DataStore.query(Post, (p) => p.title.contains('React'));
```

<!-- after: Apollo Client -->

```typescript
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: { filter: { title: { contains: 'React' } } },
});
const reactPosts = data.listPosts.items.filter((p: any) => !p._deleted);
```

**notContains -- Substring not present:**

<!-- before: DataStore -->

```typescript
const noReactPosts = await DataStore.query(Post, (p) => p.title.notContains('React'));
```

<!-- after: Apollo Client -->

```typescript
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: { filter: { title: { notContains: 'React' } } },
});
const noReactPosts = data.listPosts.items.filter((p: any) => !p._deleted);
```

**beginsWith -- String prefix match:**

<!-- before: DataStore -->

```typescript
const gettingStarted = await DataStore.query(Post, (p) =>
  p.title.beginsWith('Getting Started')
);
```

<!-- after: Apollo Client -->

```typescript
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: { filter: { title: { beginsWith: 'Getting Started' } } },
});
const gettingStarted = data.listPosts.items.filter((p: any) => !p._deleted);
```

**between -- Inclusive range:**

<!-- before: DataStore -->

```typescript
const midRated = await DataStore.query(Post, (p) => p.rating.between(2, 4));
```

<!-- after: Apollo Client -->

```typescript
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: { filter: { rating: { between: [2, 4] } } },
});
const midRated = data.listPosts.items.filter((p: any) => !p._deleted);
```

---

<!-- ai:in-notin-pattern -->

## Matching Multiple Values (`in` and `notIn`)

> **Note:** AppSync uses a different syntax for matching multiple values. Instead of `in` and `notIn` operators, combine `or` with `eq` conditions (or `and` with `ne` conditions) as shown below.

DataStore supports `in` and `notIn` because it filters locally after fetching records from the local IndexedDB store. When migrating to direct GraphQL queries, you must replace these operators with equivalent combinations of `eq`/`ne` and logical operators.

### Replacing `in` with `or` + `eq`

<!-- before: DataStore -->

```typescript
// DataStore: "status is one of PUBLISHED or DRAFT"
const posts = await DataStore.query(Post, (p) =>
  p.status.in(['PUBLISHED', 'DRAFT'])
);
```

<!-- after: Apollo Client -->

```typescript
// Apollo: combine multiple eq conditions with or
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: {
    filter: {
      or: [{ status: { eq: 'PUBLISHED' } }, { status: { eq: 'DRAFT' } }],
    },
  },
});
const posts = data.listPosts.items.filter((p: any) => !p._deleted);
```

### Replacing `notIn` with `and` + `ne`

<!-- before: DataStore -->

```typescript
// DataStore: "status is NOT one of ARCHIVED or DELETED"
const posts = await DataStore.query(Post, (p) =>
  p.status.notIn(['ARCHIVED', 'DELETED'])
);
```

<!-- after: Apollo Client -->

```typescript
// Apollo: combine multiple ne conditions with and
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: {
    filter: {
      and: [{ status: { ne: 'ARCHIVED' } }, { status: { ne: 'DELETED' } }],
    },
  },
});
const posts = data.listPosts.items.filter((p: any) => !p._deleted);
```

### Helper Functions

To avoid manually constructing these filter patterns every time, use these helper functions:

```typescript
/**
 * Build a filter equivalent to DataStore's `in` operator.
 * Produces: { or: [{ field: { eq: val1 } }, { field: { eq: val2 } }, ...] }
 */
function buildInFilter(field: string, values: string[]): Record<string, any> {
  return {
    or: values.map((value) => ({ [field]: { eq: value } })),
  };
}

/**
 * Build a filter equivalent to DataStore's `notIn` operator.
 * Produces: { and: [{ field: { ne: val1 } }, { field: { ne: val2 } }, ...] }
 */
function buildNotInFilter(field: string, values: string[]): Record<string, any> {
  return {
    and: values.map((value) => ({ [field]: { ne: value } })),
  };
}

// Usage:
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: {
    filter: buildInFilter('status', ['PUBLISHED', 'DRAFT']),
  },
});
const posts = data.listPosts.items.filter((p: any) => !p._deleted);
```

---

<!-- ai:logical-predicates -->

## Logical Predicates (and, or, not)

DataStore uses callback-based logical combinators. AppSync uses JSON objects with `and`, `or`, and `not` keys.

| Logical Operator | DataStore Syntax | GraphQL Syntax |
|-----------------|------------------|----------------|
| `and` | `p.and(p => [condition1, condition2])` | `{ and: [{ ... }, { ... }] }` |
| `or` | `p.or(p => [condition1, condition2])` | `{ or: [{ ... }, { ... }] }` |
| `not` | `p.not(p => condition)` | `{ not: { ... } }` |

### Combining Conditions with `and`

<!-- before: DataStore -->

```typescript
const posts = await DataStore.query(Post, (p) =>
  p.and((p) => [p.rating.gt(4), p.status.eq('PUBLISHED')])
);
```

<!-- after: Apollo Client -->

```typescript
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: {
    filter: {
      and: [{ rating: { gt: 4 } }, { status: { eq: 'PUBLISHED' } }],
    },
  },
});
const posts = data.listPosts.items.filter((p: any) => !p._deleted);
```

> **Tip:** Top-level filter fields are **implicitly AND-ed** in AppSync. This means `{ status: { eq: 'PUBLISHED' }, rating: { gt: 4 } }` is equivalent to using explicit `and`. Use explicit `and` when you need it nested inside an `or`, or for clarity when combining many conditions.

### Combining Conditions with `or`

<!-- before: DataStore -->

```typescript
const posts = await DataStore.query(Post, (p) =>
  p.or((p) => [p.title.contains('React'), p.title.contains('Apollo')])
);
```

<!-- after: Apollo Client -->

```typescript
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: {
    filter: {
      or: [
        { title: { contains: 'React' } },
        { title: { contains: 'Apollo' } },
      ],
    },
  },
});
const posts = data.listPosts.items.filter((p: any) => !p._deleted);
```

### Negating Conditions with `not`

<!-- before: DataStore -->

```typescript
const posts = await DataStore.query(Post, (p) =>
  p.not((p) => p.status.eq('DRAFT'))
);
```

<!-- after: Apollo Client -->

```typescript
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: {
    filter: {
      not: { status: { eq: 'DRAFT' } },
    },
  },
});
const posts = data.listPosts.items.filter((p: any) => !p._deleted);
```

### Complex Nested Example (and + or)

This example finds published posts with a rating above 4 that mention either "React" or "Apollo" in the title.

<!-- before: DataStore -->

```typescript
const posts = await DataStore.query(Post, (p) =>
  p.and((p) => [
    p.rating.gt(4),
    p.status.eq('PUBLISHED'),
    p.or((p) => [p.title.contains('React'), p.title.contains('Apollo')]),
  ])
);
```

<!-- after: Apollo Client -->

```typescript
const { data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: {
    filter: {
      and: [
        { rating: { gt: 4 } },
        { status: { eq: 'PUBLISHED' } },
        {
          or: [
            { title: { contains: 'React' } },
            { title: { contains: 'Apollo' } },
          ],
        },
      ],
    },
  },
});
const posts = data.listPosts.items.filter((p: any) => !p._deleted);
```

---

<!-- ai:pagination -->

## Pagination Migration

DataStore uses **page-based** pagination (zero-indexed `page` number + `limit`). AppSync uses **cursor-based** pagination (`nextToken` + `limit`). This is not a rename -- it is a fundamental semantic change.

### Key Differences

| Aspect | DataStore (Page-Based) | Apollo/AppSync (Cursor-Based) |
|--------|----------------------|-------------------------------|
| Navigation | Random access -- jump to any page | Sequential only -- must traverse pages in order |
| Parameters | `{ page: 0, limit: 10 }` | `{ limit: 10, nextToken: '...' }` |
| First page | `page: 0` | Omit `nextToken` (or pass `null`) |
| Next page | `page: page + 1` | Use `nextToken` from previous response |
| Jump to page 5 | `page: 4` | Must fetch pages 1 through 4 first |
| End detection | `items.length < limit` | `nextToken === null` |

### Before: DataStore Page-Based Pagination

```typescript
import { DataStore } from 'aws-amplify/datastore';
import { Post, Predicates } from './models';

// Page 1 (first 10 items)
const page1 = await DataStore.query(Post, Predicates.ALL, {
  page: 0,
  limit: 10,
});

// Page 2 (next 10 items)
const page2 = await DataStore.query(Post, Predicates.ALL, {
  page: 1,
  limit: 10,
});

// Jump to page 5 directly
const page5 = await DataStore.query(Post, Predicates.ALL, {
  page: 4,
  limit: 10,
});
```

### After: Apollo Client Cursor-Based Pagination

```typescript
// Page 1 (first 10 items) -- no nextToken needed
const { data: page1Data } = await apolloClient.query({
  query: LIST_POSTS,
  variables: { limit: 10 },
});
const page1Items = page1Data.listPosts.items.filter((p: any) => !p._deleted);
const nextToken = page1Data.listPosts.nextToken;

// Page 2 -- use nextToken from previous response
if (nextToken) {
  const { data: page2Data } = await apolloClient.query({
    query: LIST_POSTS,
    variables: { limit: 10, nextToken },
  });
  const page2Items = page2Data.listPosts.items.filter((p: any) => !p._deleted);
}

// Jump to page 5 -- NOT possible directly.
// Must fetch pages 1 through 4 sequentially to obtain each nextToken.
```

### Load More Pattern (React)

The most common pagination pattern with cursor-based pagination is "Load More" (infinite scroll). Apollo's `fetchMore` function handles this cleanly:

```typescript
import { useQuery } from '@apollo/client';

function PostList() {
  const { data, loading, error, fetchMore } = useQuery(LIST_POSTS, {
    variables: { limit: 10 },
  });

  if (loading && !data) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  const posts = (data?.listPosts?.items ?? []).filter(
    (p: any) => !p._deleted
  );
  const nextToken = data?.listPosts?.nextToken;

  const handleLoadMore = () => {
    fetchMore({
      variables: {
        limit: 10,
        nextToken,
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          listPosts: {
            ...fetchMoreResult.listPosts,
            items: [
              ...prev.listPosts.items,
              ...fetchMoreResult.listPosts.items,
            ],
          },
        };
      },
    });
  };

  return (
    <div>
      <ul>
        {posts.map((post: any) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
      <button onClick={handleLoadMore} disabled={!nextToken || loading}>
        {nextToken ? 'Load More' : 'No More Posts'}
      </button>
    </div>
  );
}
```

### Important: Filters and Pagination Interaction

> **Warning:** When using `nextToken` with filters, AppSync may return **fewer items than `limit`**. This happens because AppSync applies the limit first (scanning DynamoDB), then filters the results. Always check `nextToken !== null` to determine if more pages exist -- do **not** use `items.length < limit` as the end-of-results indicator.

```typescript
// WRONG -- may stop early when filters exclude some items
if (data.listPosts.items.length < limit) {
  // Might miss more matching records on the next page!
}

// CORRECT -- always check nextToken
if (data.listPosts.nextToken === null) {
  // No more pages
}
```

### Migrating "Jump to Page" UX

If your DataStore app uses a page-number navigation pattern (e.g., "Page 1 | 2 | 3 | 4 | 5"), you have two options:

1. **Redesign as infinite scroll / Load More** (recommended). Cursor-based pagination is designed for this pattern.
2. **Fetch pages sequentially and cache tokens**. Store each `nextToken` as you encounter it, mapping them to page numbers. This is complex and fragile -- not recommended for most apps.

---

<!-- ai:sorting -->

## Sorting Migration

DataStore supports `SortDirection.ASCENDING` and `SortDirection.DESCENDING` with chainable sort predicates. AppSync's basic `listModels` query has **no `sortDirection` argument** by default.

### Approach 1: Client-Side Sorting (Recommended)

For most use cases, fetch results and sort them in JavaScript. This is the simplest approach and works with any model.

<!-- before: DataStore -->

```typescript
import { DataStore, SortDirection } from 'aws-amplify/datastore';
import { Post, Predicates } from './models';

// Sort by createdAt descending (newest first)
const posts = await DataStore.query(Post, Predicates.ALL, {
  sort: (s) => s.createdAt(SortDirection.DESCENDING),
});
```

<!-- after: Apollo Client -->

```typescript
const { data } = await apolloClient.query({ query: LIST_POSTS });

// Sort client-side after fetching
const posts = [...data.listPosts.items]
  .filter((p: any) => !p._deleted)
  .sort(
    (a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
```

### Multi-Field Sort

DataStore supports chaining sort predicates. With client-side sorting, use a comparator that handles multiple fields:

<!-- before: DataStore -->

```typescript
// Sort by status ascending, then by createdAt descending
const posts = await DataStore.query(Post, Predicates.ALL, {
  sort: (s) =>
    s.status(SortDirection.ASCENDING).createdAt(SortDirection.DESCENDING),
});
```

<!-- after: Apollo Client -->

```typescript
const { data } = await apolloClient.query({ query: LIST_POSTS });

const posts = [...data.listPosts.items]
  .filter((p: any) => !p._deleted)
  .sort((a: any, b: any) => {
    // Primary: status ascending
    const statusCompare = a.status.localeCompare(b.status);
    if (statusCompare !== 0) return statusCompare;
    // Secondary: createdAt descending
    return (
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });
```

### React Hook with Client-Side Sorting

```typescript
import { useMemo } from 'react';
import { useQuery } from '@apollo/client';

function SortedPostList() {
  const { data, loading, error } = useQuery(LIST_POSTS);

  const posts = useMemo(() => {
    if (!data?.listPosts?.items) return [];
    return [...data.listPosts.items]
      .filter((p: any) => !p._deleted)
      .sort(
        (a: any, b: any) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }, [data]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {posts.map((post: any) => (
        <li key={post.id}>
          {post.title} -- {new Date(post.createdAt).toLocaleDateString()}
        </li>
      ))}
    </ul>
  );
}
```

### Approach 2: Server-Side Sorting (Requires @index Directive)

If your model has a Global Secondary Index (GSI) defined with the `@index` directive, AppSync generates a query with `sortDirection` support. For example:

```graphql
# In your Amplify data model
type Post @model {
  id: ID!
  title: String!
  status: String! @index(name: "byStatus", sortKeyFields: ["createdAt"])
  createdAt: AWSDateTime!
}
```

This generates a `postsByStatus` query that accepts `sortDirection`:

```typescript
const LIST_POSTS_BY_STATUS = gql`
  query PostsByStatus(
    $status: String!
    $sortDirection: ModelSortDirection
    $limit: Int
    $nextToken: String
  ) {
    postsByStatus(
      status: $status
      sortDirection: $sortDirection
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        ...PostDetails
      }
      nextToken
    }
  }
`;

const { data } = await apolloClient.query({
  query: LIST_POSTS_BY_STATUS,
  variables: {
    status: 'PUBLISHED',
    sortDirection: 'DESC',
    limit: 10,
  },
});
```

> **Note:** Server-side sorting requires backend schema changes (adding `@index` directives) and only works when querying by the index's partition key. For general-purpose sorting across all records, use client-side sorting.

---

<!-- ai:filter-reference -->

## Quick Reference

| DataStore Predicate | GraphQL Filter | Notes |
|---|---|---|
| `p.field.eq(value)` | `{ field: { eq: value } }` | Direct mapping |
| `p.field.ne(value)` | `{ field: { ne: value } }` | Direct mapping |
| `p.field.gt(value)` | `{ field: { gt: value } }` | Direct mapping |
| `p.field.ge(value)` | `{ field: { ge: value } }` | Direct mapping |
| `p.field.lt(value)` | `{ field: { lt: value } }` | Direct mapping |
| `p.field.le(value)` | `{ field: { le: value } }` | Direct mapping |
| `p.field.contains(value)` | `{ field: { contains: value } }` | String fields only |
| `p.field.notContains(value)` | `{ field: { notContains: value } }` | String fields only |
| `p.field.beginsWith(value)` | `{ field: { beginsWith: value } }` | String prefix |
| `p.field.between(lo, hi)` | `{ field: { between: [lo, hi] } }` | Inclusive range |
| `p.field.in([v1, v2])` | `{ or: [{ field: { eq: v1 } }, ...] }` | Use `or` + `eq` pattern |
| `p.field.notIn([v1, v2])` | `{ and: [{ field: { ne: v1 } }, ...] }` | Use `and` + `ne` pattern |
| `p.and(p => [...])` | `{ and: [{...}, {...}] }` | Logical AND |
| `p.or(p => [...])` | `{ or: [{...}, {...}] }` | Logical OR |
| `p.not(p => ...)` | `{ not: {...} }` | Logical NOT |
| `{ page: N, limit: M }` | `{ limit: M, nextToken: '...' }` | Cursor-based, sequential only |
| `sort: s => s.field(DIR)` | Client-side `.sort()` | No server-side sort by default |

---

**Previous:** [CRUD Operations](./07-crud-operations.md)

**Next:** [Relationships](./09-relationships.md)
