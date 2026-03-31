# Migrating from DataStore to Apollo Client (JavaScript/TypeScript)

<!-- ai:metadata -->
<!--
  Guide version: 1.1.0
  Last updated: 2026-03-31
  Target audience: Amplify JS DataStore Gen 1 users migrating to Gen 2
  Replacement library: Apollo Client 3.14.x + Amplify Gen 2 subscriptions
-->

<!-- ai:understanding-datastore -->
## Understanding DataStore

AWS Amplify DataStore provided a local-first data layer that automatically synchronized data between your app and the cloud. When you used DataStore, you got several powerful capabilities without writing any synchronization logic yourself: a local database (IndexedDB in the browser) that persisted data across sessions, automatic bidirectional sync with your AppSync backend, built-in conflict resolution using version tracking, full offline support with mutation queuing and replay, and real-time updates through `observe()` and `observeQuery()`.

DataStore abstracted away the complexity of GraphQL operations, network state management, and data consistency. You worked with simple `save`, `query`, and `delete` methods on local models, and DataStore handled everything else behind the scenes.

This guide shows you how to get equivalent capabilities using Apollo Client for queries, mutations, and caching, combined with Amplify Gen 2's built-in subscription support for real-time updates. In some cases the replacement is not a 1:1 match — for example, AppSync uses cursor-based pagination (`nextToken`), so apps using page-number navigation will need to adopt a "Load More" pattern or implement client-side pagination. The guide calls out these UX differences where they arise. Depending on how much of DataStore's feature set your app actually uses, you may find the migration simpler than expected.

<!-- ai:what-this-guide-covers -->
## What This Guide Covers

This guide presents three migration strategies, each suited to different application needs:

- **API Only** (simplest): Direct GraphQL queries and mutations via Apollo Client. No local persistence beyond Apollo's in-memory cache. Best for apps that do not need offline support or instant optimistic updates. This is the recommended starting point for most apps.

- **Local Caching** (moderate): Apollo Client with a persistent cache (via `apollo3-cache-persist`) and optimistic updates. Provides a near-offline experience where cached data survives page refreshes, without requiring a full sync engine. Best for apps that want faster perceived performance and basic resilience to brief network interruptions.

- **Offline-First** (complex): A full offline architecture using Dexie.js as a local IndexedDB database, a custom mutation queue for offline writes, a sync engine for delta/base synchronization, and manual conflict resolution using `_version` tracking. Offline-First provides a complete offline data layer with full control over sync timing, conflict strategies, and merge logic.

Each strategy builds on the same Apollo Client foundation, so you can start with API Only and adopt more advanced patterns later if needed.

<!-- ai:who-should-use -->
## Who Should Use This Guide

This guide is for developers who have an existing Amplify Gen 1 application that uses DataStore and want to replace DataStore with Apollo Client. You do not need to migrate your backend to Gen 2 — this guide assumes you keep your Gen 1 backend and only change the frontend data layer.

> **Gen 1 field name casing:** Gen 1 backends generate foreign key fields with uppercase ID suffixes (e.g., `postID`, `tagID`), while Gen 2 uses lowercase (`postId`, `tagId`). The code examples in this guide use the Gen 2 lowercase convention. If you are keeping your Gen 1 backend, you must adjust all field names in GraphQL operations to match your actual schema. Check your `schema.graphql` or use the AppSync console's schema tab to verify field names — mismatched casing returns `null` silently rather than erroring.

It assumes you are familiar with:

- React and React hooks
- Basic GraphQL concepts (queries, mutations, subscriptions)
- Your Amplify configuration file (`amplifyconfiguration.json` or `aws-exports.js`)
- Your app's data model and how it uses DataStore today

You do not need prior experience with Apollo Client. The guide covers Apollo Client setup from scratch.

<!-- ai:comparison-table -->
## Quick Comparison: Before and After

Here is a quick look at how common DataStore operations translate to Apollo Client:

| DataStore Operation | Apollo Client Equivalent |
|---------------------|--------------------------|
| `DataStore.save(new Post({...}))` | `apolloClient.mutate({ mutation: CREATE_POST, variables: { input: {...} } })` |
| `DataStore.query(Post)` | `apolloClient.query({ query: LIST_POSTS })` |
| `DataStore.query(Post, id)` | `apolloClient.query({ query: GET_POST, variables: { id } })` |
| `DataStore.delete(post)` | `apolloClient.mutate({ mutation: DELETE_POST, variables: { input: { id, _version } } })` |
| `DataStore.observe(Post)` | `amplifyClient.graphql({ query: onCreatePost }).subscribe(...)` |
| `DataStore.observeQuery(Post)` | `useQuery(LIST_POSTS)` with subscription-triggered `refetch()` |

Note that subscriptions use Amplify Gen 2's `client.graphql()` rather than Apollo, because AppSync uses a custom WebSocket protocol that Amplify handles natively. Apollo Client handles all queries, mutations, and caching.

<!-- ai:how-to-use -->
## How to Use This Guide

1. **Choose your strategy.** Start with the [Decision Framework](./01-decision-framework.md) to determine which migration strategy fits your app. Most apps should start with API Only.

2. **Complete the prerequisites.** Follow the [Prerequisites](./03-prerequisites.md) to install dependencies, define your GraphQL operations, and set up TypeScript helpers. This section also covers TypeScript-specific considerations like `erasableSyntaxOnly` in Vite 8+ projects.

3. **Set up Apollo Client.** Follow the [Apollo Client Setup](./04-apollo-setup.md) to configure Apollo Client with your AppSync endpoint and Cognito authentication. Note: if your app uses the Amplify `Authenticator` component, `useQuery` hooks must be placed inside the Authenticator boundary — see [React Integration](./10-react-integration.md) for details.

4. **Follow your strategy guide.** Each strategy has dedicated sections with step-by-step instructions, code examples, and migration patterns.

---

**Next:** [Choose Your Strategy](./01-decision-framework.md)
