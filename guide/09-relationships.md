<!-- ai:relationships -->

# Relationships

Relationship handling is where DataStore and Apollo Client differ most fundamentally. DataStore **lazy-loads** relationships: you access a field and it fetches on demand, returning a Promise (for `belongsTo`/`hasOne`) or an AsyncCollection (for `hasMany`). Apollo Client **eagerly loads** relationships based on what you include in your GraphQL selection set. This gives you explicit control over data fetching granularity but requires you to think about what data you need upfront.

This page covers migrating all four relationship types: `hasMany`, `belongsTo`, `hasOne`, and `manyToMany`.

## Schema Reference

All examples on this page use the following Amplify Gen 2 schema definitions:

```typescript
// amplify/data/resource.ts (relevant models)
const schema = a.schema({
  Post: a.model({
    title: a.string().required(),
    content: a.string(),
    status: a.string(),
    rating: a.integer(),
    comments: a.hasMany('Comment', 'postId'),
    tags: a.hasMany('PostTag', 'postId'),
    metadata: a.hasOne('PostMetadata', 'postId'),
  }),
  Comment: a.model({
    content: a.string().required(),
    postId: a.id().required(),
    post: a.belongsTo('Post', 'postId'),
  }),
  Tag: a.model({
    name: a.string().required(),
    posts: a.hasMany('PostTag', 'tagId'),
  }),
  PostTag: a.model({
    postId: a.id().required(),
    tagId: a.id().required(),
    post: a.belongsTo('Post', 'postId'),
    tag: a.belongsTo('Tag', 'tagId'),
  }),
  PostMetadata: a.model({
    postId: a.id().required(),
    views: a.integer(),
    likes: a.integer(),
    post: a.belongsTo('Post', 'postId'),
  }),
});
```

These models extend the `Post` model from the [Prerequisites](./03-prerequisites.md) page with `Comment`, `Tag`, `PostTag` (join model), and `PostMetadata`.

> **Note:** All relationship examples include `_version`, `_deleted`, and `_lastChangedAt` fields in selections for conflict-resolution-enabled backends. See [Prerequisites: Understanding _version Metadata](./03-prerequisites.md#understanding-_version-metadata) for details.

---

<!-- ai:has-many -->

## hasMany: Post -> Comments

A `hasMany` relationship means a parent record has zero or more child records. In this example, a Post has many Comments.

**The key change:** DataStore's `AsyncCollection` with `.toArray()` becomes a nested GraphQL selection with an `items` wrapper object.

### DataStore (Before)

<!-- before: DataStore -->

```typescript
import { DataStore } from 'aws-amplify/datastore';
import { Post } from './models';

// Query a post, then lazy-load its comments
const post = await DataStore.query(Post, '123');
const comments = await post.comments.toArray();
// comments is Comment[] — fetched on demand when you called .toArray()
```

DataStore fetches the comments lazily: the `post.comments` field returns an `AsyncCollection` that only hits the database when you call `.toArray()`.

### Apollo Client (After) — Eager Loading (Nested Selection)

<!-- after: Apollo Client -->

Define a GraphQL query that includes the comments in the selection set:

```graphql
query GetPostWithComments($id: ID!) {
  getPost(id: $id) {
    ...PostDetails
    comments {
      items {
        id
        content
        createdAt
        _version
        _deleted
        _lastChangedAt
      }
      nextToken
    }
  }
}
```

Use it with Apollo Client:

```typescript
import { gql } from '@apollo/client';

const GET_POST_WITH_COMMENTS = gql`
  ${POST_DETAILS_FRAGMENT}
  query GetPostWithComments($id: ID!) {
    getPost(id: $id) {
      ...PostDetails
      comments {
        items {
          id
          content
          createdAt
          _version
          _deleted
          _lastChangedAt
        }
        nextToken
      }
    }
  }
`;

// Fetch the post and its comments in a single request
const { data } = await apolloClient.query({
  query: GET_POST_WITH_COMMENTS,
  variables: { id: '123' },
});

const post = data.getPost;
const comments = data.getPost.comments.items.filter(c => !c._deleted);
```

The comments come back in the same response as the post — no second request needed. The `items` wrapper is standard for all `hasMany` fields in AppSync-generated schemas.

> **Important:** Always filter `_deleted` records from nested `items` arrays. Soft-deleted child records are still returned by AppSync.

### Apollo Client (After) — Lazy Loading (Separate Query)

If you do not always need comments, omit them from the initial query and fetch them separately when needed. This simulates DataStore's lazy-loading behavior:

```graphql
query ListCommentsByPost($filter: ModelCommentFilterInput) {
  listComments(filter: $filter) {
    items {
      id
      content
      createdAt
      _version
      _deleted
      _lastChangedAt
    }
    nextToken
  }
}
```

```typescript
const LIST_COMMENTS_BY_POST = gql`
  query ListCommentsByPost($filter: ModelCommentFilterInput) {
    listComments(filter: $filter) {
      items {
        id
        content
        createdAt
        _version
        _deleted
        _lastChangedAt
      }
      nextToken
    }
  }
`;

// Fetch comments for a specific post on demand
const { data } = await apolloClient.query({
  query: LIST_COMMENTS_BY_POST,
  variables: { filter: { postId: { eq: '123' } } },
});

const comments = data.listComments.items.filter(c => !c._deleted);
```

> **Over-fetching warning:** Including relationships in every query when the component does not always need them wastes bandwidth and slows down responses. Use the nested selection (eager) pattern for data you always display together. Use the separate query (lazy) pattern for data that is optional or loaded on user action (e.g., expanding a comments section).

### React Hook Example

```typescript
import { useQuery } from '@apollo/client';

function PostWithComments({ postId }: { postId: string }) {
  const { data, loading, error } = useQuery(GET_POST_WITH_COMMENTS, {
    variables: { id: postId },
  });

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error loading post.</p>;

  const post = data.getPost;
  const comments = post.comments.items.filter(c => !c._deleted);

  return (
    <div>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
      <h2>Comments ({comments.length})</h2>
      {comments.map(comment => (
        <div key={comment.id}>
          <p>{comment.content}</p>
        </div>
      ))}
    </div>
  );
}
```

---

<!-- ai:belongs-to -->

## belongsTo: Comment -> Post

A `belongsTo` relationship means a child record references its parent. In this example, a Comment belongs to a Post.

**The key change:** DataStore resolves the parent automatically via a Promise. Apollo uses a nested selection to include the parent in the response.

### DataStore (Before)

<!-- before: DataStore -->

```typescript
import { DataStore } from 'aws-amplify/datastore';
import { Comment } from './models';

const comment = await DataStore.query(Comment, 'abc');
const post = await comment.post; // Promise resolves to the parent Post
```

### Apollo Client (After)

<!-- after: Apollo Client -->

```graphql
query GetCommentWithPost($id: ID!) {
  getComment(id: $id) {
    id
    content
    post {
      id
      title
      status
      _version
      _deleted
      _lastChangedAt
    }
    _version
    _deleted
    _lastChangedAt
  }
}
```

```typescript
const GET_COMMENT_WITH_POST = gql`
  query GetCommentWithPost($id: ID!) {
    getComment(id: $id) {
      id
      content
      post {
        id
        title
        status
        _version
        _deleted
        _lastChangedAt
      }
      _version
      _deleted
      _lastChangedAt
    }
  }
`;

const { data } = await apolloClient.query({
  query: GET_COMMENT_WITH_POST,
  variables: { id: 'abc' },
});

const comment = data.getComment;
const post = comment.post; // Parent Post is already loaded — no extra request
```

The parent object is directly available as `data.getComment.post`. No Promise, no `.then()` — it is already resolved in the response.

> **Tip:** The foreign key field (`postId`) is also available on the Comment if you only need the parent's ID without fetching the full parent record. This avoids the overhead of nesting the parent selection when you just need the reference.

---

<!-- ai:has-one -->

## hasOne: Post -> PostMetadata

A `hasOne` relationship represents 1:1 ownership. In this example, a Post has one PostMetadata record containing view and like counts.

**The key change:** Similar to `belongsTo` — DataStore returns a Promise, Apollo uses a nested selection. The result is `null` if no related record exists.

### DataStore (Before)

<!-- before: DataStore -->

```typescript
import { DataStore } from 'aws-amplify/datastore';
import { Post } from './models';

const post = await DataStore.query(Post, '123');
const metadata = await post.metadata; // Promise resolves to PostMetadata or undefined
```

### Apollo Client (After)

<!-- after: Apollo Client -->

```graphql
query GetPostWithMetadata($id: ID!) {
  getPost(id: $id) {
    ...PostDetails
    metadata {
      id
      views
      likes
      _version
      _deleted
      _lastChangedAt
    }
  }
}
```

```typescript
const GET_POST_WITH_METADATA = gql`
  ${POST_DETAILS_FRAGMENT}
  query GetPostWithMetadata($id: ID!) {
    getPost(id: $id) {
      ...PostDetails
      metadata {
        id
        views
        likes
        _version
        _deleted
        _lastChangedAt
      }
    }
  }
`;

const { data } = await apolloClient.query({
  query: GET_POST_WITH_METADATA,
  variables: { id: '123' },
});

const post = data.getPost;
const metadata = post.metadata; // PostMetadata object or null
```

If no PostMetadata record exists for this Post, `post.metadata` will be `null`.

---

<!-- ai:many-to-many -->

## manyToMany: Post <-> Tag

Many-to-many relationships use an explicit join table model. In this example, Posts and Tags are connected through the `PostTag` join model. DataStore auto-generates the join model machinery. In GraphQL, you must query through the join model explicitly.

**The key change:** Instead of getting tags directly, you query `PostTag` join records and then extract the `tag` from each one.

### DataStore (Before)

<!-- before: DataStore -->

```typescript
import { DataStore } from 'aws-amplify/datastore';
import { Post } from './models';

const post = await DataStore.query(Post, '123');
const postTags = await post.tags.toArray(); // Returns PostTag join records
// Each PostTag has a .tag field that resolves to the Tag
const tags = await Promise.all(postTags.map(pt => pt.tag));
```

### Apollo Client (After) — Querying Tags for a Post

<!-- after: Apollo Client -->

```graphql
query GetPostWithTags($id: ID!) {
  getPost(id: $id) {
    ...PostDetails
    tags {
      items {
        id
        tag {
          id
          name
          _version
          _deleted
          _lastChangedAt
        }
        _version
        _deleted
      }
    }
  }
}
```

```typescript
const GET_POST_WITH_TAGS = gql`
  ${POST_DETAILS_FRAGMENT}
  query GetPostWithTags($id: ID!) {
    getPost(id: $id) {
      ...PostDetails
      tags {
        items {
          id
          tag {
            id
            name
            _version
            _deleted
            _lastChangedAt
          }
          _version
          _deleted
        }
      }
    }
  }
`;

const { data } = await apolloClient.query({
  query: GET_POST_WITH_TAGS,
  variables: { id: '123' },
});

// Extract tags from the join records, filtering out deleted join entries
const tags = data.getPost.tags.items
  .filter(pt => !pt._deleted)
  .map(pt => pt.tag);
```

> **Note:** Filter `_deleted` on the **join records** (`PostTag`), not just the tags themselves. A deleted join record means the association was removed even if the Tag still exists.

### Creating a Many-to-Many Association

To associate a Post with a Tag, create a `PostTag` join record:

```graphql
mutation CreatePostTag($input: CreatePostTagInput!) {
  createPostTag(input: $input) {
    id
    postId
    tagId
    _version
    _deleted
    _lastChangedAt
  }
}
```

```typescript
const CREATE_POST_TAG = gql`
  mutation CreatePostTag($input: CreatePostTagInput!) {
    createPostTag(input: $input) {
      id
      postId
      tagId
      _version
      _deleted
      _lastChangedAt
    }
  }
`;

// Associate post "123" with tag "456"
await apolloClient.mutate({
  mutation: CREATE_POST_TAG,
  variables: { input: { postId: '123', tagId: '456' } },
});
```

### Removing a Many-to-Many Association

To remove an association, delete the `PostTag` join record. You need its `id` and `_version`:

```graphql
mutation DeletePostTag($input: DeletePostTagInput!) {
  deletePostTag(input: $input) {
    id
    _version
  }
}
```

```typescript
const DELETE_POST_TAG = gql`
  mutation DeletePostTag($input: DeletePostTagInput!) {
    deletePostTag(input: $input) {
      id
      _version
    }
  }
`;

// Remove the association (need the PostTag record's id and _version)
await apolloClient.mutate({
  mutation: DELETE_POST_TAG,
  variables: {
    input: {
      id: postTagRecord.id,
      _version: postTagRecord._version,
    },
  },
});
```

> **Important:** Deleting the `PostTag` join record removes the association between the Post and Tag. It does **not** delete the Post or the Tag themselves.

---

<!-- ai:creating-related -->

## Creating Related Records

When creating a child record that belongs to a parent, the key difference is how you specify the relationship.

### DataStore (Before)

<!-- before: DataStore -->

DataStore accepted the **model instance** for the relationship:

```typescript
import { DataStore } from 'aws-amplify/datastore';
import { Comment, Post } from './models';

const existingPost = await DataStore.query(Post, '123');
await DataStore.save(
  new Comment({
    content: 'Great post!',
    post: existingPost, // Pass the model instance
  })
);
```

### Apollo Client (After)

<!-- after: Apollo Client -->

Apollo requires the **foreign key ID**, not the model instance:

```graphql
mutation CreateComment($input: CreateCommentInput!) {
  createComment(input: $input) {
    id
    content
    postId
    _version
    _deleted
    _lastChangedAt
  }
}
```

```typescript
const CREATE_COMMENT = gql`
  mutation CreateComment($input: CreateCommentInput!) {
    createComment(input: $input) {
      id
      content
      postId
      _version
      _deleted
      _lastChangedAt
    }
  }
`;

await apolloClient.mutate({
  mutation: CREATE_COMMENT,
  variables: {
    input: {
      content: 'Great post!',
      postId: '123', // Pass the foreign key ID directly
    },
  },
});
```

**Key difference:** DataStore accepted the model instance (`post: existingPost`) and extracted the ID internally. With Apollo, you pass the foreign key ID directly (`postId: '123'`). This is more explicit and avoids needing to query the full parent just to create a child record.

---

<!-- ai:relationship-reference -->

## Quick Reference Table

| Relationship | DataStore Access Pattern | Apollo Client Access Pattern | Key Change |
|---|---|---|---|
| **hasMany** (Post -> Comments) | `await post.comments.toArray()` | Nested `comments { items { ... } }` selection | AsyncCollection becomes `items` wrapper; eager-loaded in single request |
| **belongsTo** (Comment -> Post) | `await comment.post` | Nested `post { ... }` selection | Promise becomes nested object; no await needed |
| **hasOne** (Post -> PostMetadata) | `await post.metadata` | Nested `metadata { ... }` selection | Promise becomes nested object or `null` |
| **manyToMany** (Post <-> Tag) | `await post.tags.toArray()` then `await pt.tag` | Nested `tags { items { tag { ... } } }` selection | Must query through join table; filter `_deleted` on join records |
| **Creating children** | `new Comment({ post: existingPost })` | `{ input: { postId: '123' } }` | Model instance becomes foreign key ID |

---

<!-- ai:relationship-performance -->

## Performance Considerations

### Eager vs. Lazy Loading

DataStore always lazy-loaded relationships. Apollo gives you the choice:

- **Eager loading** (nested selection): Fetches related data in the same GraphQL request. Use this for data you always display together (e.g., a post and its metadata).
- **Lazy loading** (separate query): Fetches related data only when needed. Use this for data that is optional or loaded on user action (e.g., comments that appear when a user scrolls down).

### The N+1 Query Problem

DataStore hid the N+1 problem because all data was local — lazy-loading from IndexedDB was effectively free. With Apollo, each separate query is a network request:

```typescript
// N+1 problem: 1 query for posts + N queries for each post's comments
const { data } = await apolloClient.query({ query: LIST_POSTS });
const posts = data.listPosts.items.filter(p => !p._deleted);

// BAD: separate query for each post's comments
for (const post of posts) {
  const { data: commentData } = await apolloClient.query({
    query: LIST_COMMENTS_BY_POST,
    variables: { filter: { postId: { eq: post.id } } },
  });
}

// GOOD: include comments in the list query
const LIST_POSTS_WITH_COMMENTS = gql`
  ${POST_DETAILS_FRAGMENT}
  query ListPostsWithComments($filter: ModelPostFilterInput, $limit: Int) {
    listPosts(filter: $filter, limit: $limit) {
      items {
        ...PostDetails
        comments {
          items {
            id
            content
            _version
            _deleted
          }
        }
      }
      nextToken
    }
  }
`;
```

### Recommendations

1. **Use nested selections** for data you always need together. One request is always faster than multiple.
2. **Use separate queries** for optional or on-demand data (e.g., a "Load comments" button).
3. **Be mindful of depth.** Deeply nested selections (post -> comments -> replies -> author) increase response size and backend processing time. Limit nesting to 2-3 levels.
4. **Apollo's cache helps.** Once a related record is fetched, Apollo caches it by `__typename` and `id`. Subsequent queries for the same record may resolve from cache without a network request.

---

**Previous:** [Predicates and Filters](./08-predicates-filters.md)

**Next:** [React Integration](./10-react-integration.md)
