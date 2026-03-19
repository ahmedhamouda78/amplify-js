# Gen 1 DataStore Sample App Specification

This document defines the Gen 1 DataStore sample application that exercises every feature documented in the migration guide. The sample app serves as the baseline for migration validation: build this app with DataStore first, then migrate it using each strategy's test plan.

## Model Schema

The following GraphQL schema exercises CRUD operations, all predicate operators, every relationship type, enum fields, numeric comparisons, and owner-based auth.

```graphql
enum PostStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

type Post @model @auth(rules: [{ allow: owner }]) {
  id: ID!
  title: String!
  content: String!
  status: PostStatus!
  rating: Int
  tags: [String]
  comments: [Comment] @hasMany
  author: Author @belongsTo
  postTags: [PostTag] @hasMany
}

type Comment @model @auth(rules: [{ allow: owner }]) {
  id: ID!
  content: String!
  post: Post @belongsTo
}

type Author @model @auth(rules: [{ allow: owner }]) {
  id: ID!
  name: String!
  email: String!
  posts: [Post] @hasMany
}

type Tag @model {
  id: ID!
  label: String!
  postTags: [PostTag] @hasMany
}

type PostTag @model {
  id: ID!
  post: Post @belongsTo
  tag: Tag @belongsTo
}
```

### Schema Design Rationale

| Model | Purpose |
|-------|---------|
| Post | Primary model for CRUD, predicates, pagination, sorting. Has `PostStatus` enum for filter testing, `rating: Int` for comparison operators (`gt`, `lt`, `between`), `tags: [String]` for `contains`/`notContains` operators. |
| Comment | Tests `hasMany` / `belongsTo` relationship (Post -> Comments). |
| Author | Tests `hasMany` / `belongsTo` relationship (Author -> Posts). |
| Tag | Tests many-to-many relationship (Post <-> Tag via PostTag join table). |
| PostTag | Join table for many-to-many. Tests `_deleted` filtering on join records. |
| PostStatus | Enum type for `eq` / `ne` filter testing. |

---

## Feature Coverage Matrix

Every DataStore feature documented in the migration guide must be exercised by the sample app.

### CRUD Operations (6 features)

| # | Feature | Gen 1 Code Pattern | Guide Reference |
|---|---------|---------------------|-----------------|
| 1 | Create | `DataStore.save(new Post({ title: 'My Post', content: 'Hello', status: 'PUBLISHED', rating: 5 }))` | guide/07-crud-operations.md |
| 2 | Query by ID | `DataStore.query(Post, id)` | guide/07-crud-operations.md |
| 3 | List all | `DataStore.query(Post)` | guide/07-crud-operations.md |
| 4 | Update | `DataStore.save(Post.copyOf(original, updated => { updated.title = 'New Title' }))` | guide/07-crud-operations.md |
| 5 | Delete | `DataStore.delete(post)` | guide/07-crud-operations.md |
| 6 | Batch delete | `DataStore.delete(Post, p => p.status.eq('ARCHIVED'))` | guide/07-crud-operations.md |

### Predicate Operators (13 features)

| # | Feature | Gen 1 Code Pattern | Guide Reference |
|---|---------|---------------------|-----------------|
| 7 | eq (equals) | `p => p.status.eq('PUBLISHED')` | guide/08-predicates-filters.md |
| 8 | ne (not equals) | `p => p.status.ne('DRAFT')` | guide/08-predicates-filters.md |
| 9 | gt (greater than) | `p => p.rating.gt(3)` | guide/08-predicates-filters.md |
| 10 | ge (greater or equal) | `p => p.rating.ge(3)` | guide/08-predicates-filters.md |
| 11 | lt (less than) | `p => p.rating.lt(3)` | guide/08-predicates-filters.md |
| 12 | le (less or equal) | `p => p.rating.le(3)` | guide/08-predicates-filters.md |
| 13 | contains | `p => p.title.contains('hello')` | guide/08-predicates-filters.md |
| 14 | notContains | `p => p.title.notContains('spam')` | guide/08-predicates-filters.md |
| 15 | beginsWith | `p => p.title.beginsWith('Hello')` | guide/08-predicates-filters.md |
| 16 | between | `p => p.rating.between(2, 4)` | guide/08-predicates-filters.md |
| 17 | and (logical) | `p => p.and(p => [p.status.eq('PUBLISHED'), p.rating.gt(3)])` | guide/08-predicates-filters.md |
| 18 | or (logical) | `p => p.or(p => [p.status.eq('DRAFT'), p.status.eq('PUBLISHED')])` | guide/08-predicates-filters.md |
| 19 | not (logical) | `p => p.not(p => p.status.eq('ARCHIVED'))` | guide/08-predicates-filters.md |

### Pagination and Sorting (2 features)

| # | Feature | Gen 1 Code Pattern | Guide Reference |
|---|---------|---------------------|-----------------|
| 20 | Page-based pagination | `DataStore.query(Post, Predicates.ALL, { page: 0, limit: 10 })` | guide/08-predicates-filters.md |
| 21 | Sorting | `DataStore.query(Post, Predicates.ALL, { sort: s => s.createdAt(SortDirection.DESCENDING) })` | guide/08-predicates-filters.md |

### Relationships (3 features)

| # | Feature | Gen 1 Code Pattern | Guide Reference |
|---|---------|---------------------|-----------------|
| 22 | hasMany (Post -> Comments) | `const comments = await post.comments.toArray()` | guide/09-relationships.md |
| 23 | belongsTo (Comment -> Post) | `const post = await comment.post` | guide/09-relationships.md |
| 24 | manyToMany (Post <-> Tag) | Navigate via PostTag join table | guide/09-relationships.md |

### Real-Time (2 features)

| # | Feature | Gen 1 Code Pattern | Guide Reference |
|---|---------|---------------------|-----------------|
| 25 | observe (single model) | `DataStore.observe(Post).subscribe(msg => { console.log(msg.element) })` | guide/10-react-integration.md |
| 26 | observeQuery (with predicate) | `DataStore.observeQuery(Post, p => p.status.eq('PUBLISHED')).subscribe(snapshot => { setPosts(snapshot.items) })` | guide/10-react-integration.md |

### Auth (2 features)

| # | Feature | Gen 1 Code Pattern | Guide Reference |
|---|---------|---------------------|-----------------|
| 27 | Owner-based CRUD scoping | Operations scoped to authenticated user via `@auth(rules: [{ allow: owner }])` | guide/04-apollo-setup.md |
| 28 | Sign-out with DataStore.clear() | `await DataStore.clear(); await Auth.signOut()` | guide/04-apollo-setup.md |

**Total: 28 features**

---

## React Component List

The sample app needs these 7 components to exercise all features in the matrix.

### 1. PostList

**Features exercised:** List all (#3), predicates (#7-19), pagination (#20), sorting (#21), observeQuery (#26)

```typescript
// Key DataStore usage:
const posts = await DataStore.query(Post, p => p.status.eq('PUBLISHED'), {
  page: currentPage,
  limit: PAGE_SIZE,
  sort: s => s.createdAt(SortDirection.DESCENDING),
});
```

**UI elements:**
- List of post cards showing title, status, rating
- Filter controls: status dropdown, rating range, text search
- Pagination controls: previous/next buttons with page number
- Sort toggle: ascending/descending by created date

### 2. PostForm

**Features exercised:** Create (#1), update (#4), relationships (author selection, tag assignment)

```typescript
// Key DataStore usage (create):
const newPost = await DataStore.save(
  new Post({ title, content, status: 'DRAFT', rating: 0 })
);

// Key DataStore usage (update):
const updated = await DataStore.save(
  Post.copyOf(existingPost, p => { p.title = newTitle; })
);
```

**UI elements:**
- Title and content inputs
- Status dropdown (DRAFT, PUBLISHED, ARCHIVED)
- Rating selector (1-5)
- Author selector (belongsTo)
- Tag multi-select (manyToMany via PostTag)
- Save button

### 3. PostDetail

**Features exercised:** Query by ID (#2), hasMany (#22), belongsTo (#23), manyToMany (#24)

```typescript
// Key DataStore usage:
const post = await DataStore.query(Post, postId);
const comments = await post.comments.toArray();
const author = await post.author;
const postTags = await post.postTags.toArray();
```

**UI elements:**
- Full post content
- Author name (belongsTo traversal)
- Tag badges (manyToMany traversal via PostTag)
- Comments section (hasMany traversal)
- Edit and delete buttons

### 4. CommentList

**Features exercised:** hasMany traversal (#22), create (#1), delete (#5)

```typescript
// Key DataStore usage:
const comments = await post.comments.toArray();
await DataStore.save(new Comment({ content: text, post: currentPost }));
await DataStore.delete(comment);
```

**UI elements:**
- List of comments for a post
- New comment input with submit button
- Delete button on each comment

### 5. TagManager

**Features exercised:** manyToMany operations (#24), create (#1), delete (#5), batch delete (#6)

```typescript
// Key DataStore usage:
// Add tag to post
await DataStore.save(new PostTag({ post: currentPost, tag: selectedTag }));
// Remove tag from post
await DataStore.delete(postTag);
// Create new tag
await DataStore.save(new Tag({ label: 'new-tag' }));
```

**UI elements:**
- Available tags list
- Create new tag input
- Assign/unassign tags to current post
- Delete tag (removes from all posts via batch delete of PostTag records)

### 6. SubscriptionMonitor

**Features exercised:** observe (#25), observeQuery (#26)

```typescript
// Key DataStore usage:
const observeSub = DataStore.observe(Post).subscribe(msg => {
  addToLog(`${msg.opType}: ${msg.element.title}`);
});

const observeQuerySub = DataStore.observeQuery(
  Post, p => p.status.eq('PUBLISHED')
).subscribe(snapshot => {
  setPublishedPosts(snapshot.items);
  setIsSynced(snapshot.isSynced);
});
```

**UI elements:**
- Real-time event log showing create/update/delete events
- Live count of published posts (updates as posts change status)
- Sync status indicator (isSynced from observeQuery)

### 7. AuthGate

**Features exercised:** Owner-based auth (#27), sign-out with clear (#28)

```typescript
// Key DataStore usage:
// Sign-out handler
const handleSignOut = async () => {
  await DataStore.clear();
  await Auth.signOut();
};
```

**UI elements:**
- Authenticator component (from @aws-amplify/ui-react)
- Current user display
- Sign-out button that calls DataStore.clear() before sign-out
- Conditional rendering: show app content only when authenticated

---

## Dependencies

Exact npm packages for the Gen 1 DataStore sample app:

```json
{
  "dependencies": {
    "aws-amplify": "^6.0.0",
    "@aws-amplify/ui-react": "^6.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
```

Note: `@aws-amplify/datastore` is included within `aws-amplify` v6. No separate DataStore package install is needed.

---

## App Structure

```
src/
  App.tsx              # Root component with AuthGate and routing
  models/              # DataStore generated models (Post, Comment, Author, Tag, PostTag)
    index.ts
    schema.js
  components/
    AuthGate.tsx       # Authentication wrapper
    PostList.tsx       # List, filter, paginate, sort posts
    PostForm.tsx       # Create/edit post with relationships
    PostDetail.tsx     # View post with comments and tags
    CommentList.tsx    # Comments for a post
    TagManager.tsx     # Manage tags and post-tag associations
    SubscriptionMonitor.tsx  # Real-time event display
  amplifyconfiguration.json  # Gen 1 config (or amplify_outputs.json for Gen 2)
```

---

## Verification Checklist

Before starting any migration test plan, verify that all 28 features work in the Gen 1 app:

- [ ] Create a new post with all fields
- [ ] Query a post by ID
- [ ] List all posts
- [ ] Update a post's title and status
- [ ] Delete a post
- [ ] Batch delete all ARCHIVED posts
- [ ] Filter by status (eq, ne)
- [ ] Filter by rating (gt, ge, lt, le, between)
- [ ] Filter by title (contains, notContains, beginsWith)
- [ ] Combine filters with and, or, not
- [ ] Paginate through post list
- [ ] Sort posts by created date
- [ ] Navigate Post -> Comments (hasMany)
- [ ] Navigate Comment -> Post (belongsTo)
- [ ] Navigate Post <-> Tag (manyToMany via PostTag)
- [ ] Observe real-time create/update/delete events
- [ ] ObserveQuery updates when posts change
- [ ] Owner-based auth scopes data to current user
- [ ] Sign-out clears DataStore and signs out user
