<!-- ai:apollo-setup -->

# Apollo Client Setup

This page walks through configuring Apollo Client to work with your AppSync endpoint using Cognito User Pools authentication. By the end, you will have a fully working Apollo Client with auth token injection, error handling, retry logic, and a sign-out pattern that properly clears cached data.

## Overview

Apollo Client communicates with AppSync through a **link chain** — a series of middleware functions that process each request. You will build four links:

1. **HTTP Link** — sends the actual GraphQL request to AppSync
2. **Auth Link** — injects your Cognito ID token into each request
3. **Error Link** — intercepts and logs GraphQL and network errors
4. **Retry Link** — automatically retries failed network requests with backoff

These links compose into a pipeline that handles auth, errors, and retries without any per-request boilerplate in your components.

## The HTTP Link

<!-- ai:http-link -->

The HTTP link is the foundation — it sends GraphQL operations to your AppSync endpoint:

```typescript
import { createHttpLink } from '@apollo/client';
import config from './amplifyconfiguration.json';

const httpLink = createHttpLink({
  uri: config.aws_appsync_graphqlEndpoint,
});
```

`config.aws_appsync_graphqlEndpoint` is the GraphQL endpoint from your Amplify configuration file (see [Prerequisites](./03-prerequisites.md#finding-your-graphql-endpoint) for the full shape). If your config file is named `aws-exports.js`, adjust the import path accordingly.

> **Do NOT use `BatchHttpLink`.** AppSync does not support HTTP request batching. Batched requests will fail silently, returning errors for all operations in the batch.

<!-- ai:auth-link -->

## The Auth Link

The auth link injects your Cognito User Pools ID token into every request:

```typescript
import { setContext } from '@apollo/client/link/context';
import { fetchAuthSession } from 'aws-amplify/auth';

const authLink = setContext(async (_, { headers }) => {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    return {
      headers: {
        ...headers,
        authorization: token || '',
      },
    };
  } catch (error) {
    console.error('Auth session error:', error);
    return { headers };
  }
});
```

**Key details:**

- **`fetchAuthSession()` is called on every request**, ensuring tokens are always fresh. Amplify automatically refreshes expired access tokens using the refresh token — you do not need to manage token lifecycle manually.
- **The `try/catch` handles token expiry gracefully.** If both the access token and the refresh token have expired (or the user signed out in another tab), the request proceeds without an auth header. AppSync will return an authorization error, which the error link (below) can intercept to redirect the user to sign-in.
- **Uses `idToken` (not `accessToken`)** because AppSync Cognito User Pools authorization expects the **ID token** in the `authorization` header. The ID token contains user identity claims (email, groups, custom attributes) that AppSync uses for fine-grained access control.

<!-- ai:error-link -->

## The Error Link

The error link intercepts all GraphQL and network errors globally, so you do not need `try/catch` on every individual operation:

```typescript
import { onError } from '@apollo/client/link/error';

const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    for (const { message, locations, path } of graphQLErrors) {
      console.error(
        `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`
      );

      // Handle specific error types
      if (message.includes('Unauthorized') || message.includes('401')) {
        // Token expired or invalid — redirect to sign-in
        // window.location.href = '/signin';
      }
    }
  }

  if (networkError) {
    console.error(`[Network error]: ${networkError}`);
  }
});
```

**Common AppSync errors you will see:**

| Error Message | Cause | Action |
|---------------|-------|--------|
| `"Unauthorized"` or `"401"` | Expired or missing auth token | Redirect to sign-in |
| `"ConditionalCheckFailedException"` | Missing or stale `_version` in mutation input | Re-query to get latest `_version`, then retry |
| `"ConflictUnhandled"` | Conflict resolution rejected the mutation | Re-query and retry with fresh data |
| `"Network error"` | Connectivity issue | Retry link handles this automatically |

<!-- ai:retry-link -->

## The Retry Link

The retry link automatically retries failed network requests with exponential backoff and jitter:

```typescript
import { RetryLink } from '@apollo/client/link/retry';

const retryLink = new RetryLink({
  delay: {
    initial: 300,
    max: 5000,
    jitter: true,
  },
  attempts: {
    max: 3,
    retryIf: (error) => !!error,
  },
});
```

**How it works:**

- Retries up to **3 times** on any network error
- First retry after **~300ms**, second after **~600ms**, third after **~1200ms** (exponential backoff)
- **`jitter: true`** adds randomness to retry timing, preventing thundering herd problems when many clients retry simultaneously after an outage
- Only retries on network errors (`retryIf: (error) => !!error`), not on GraphQL errors (those are application-level and retrying will not help)

## Putting It All Together

Now combine all four links into a single Apollo Client instance:

```typescript
import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  from,
} from '@apollo/client';

export const apolloClient = new ApolloClient({
  link: from([retryLink, errorLink, authLink, httpLink]),
  cache: new InMemoryCache(),
});
```

### Link Chain Order

The `from()` function composes links **left to right** on outgoing requests and **right to left** on incoming responses:

```
Request  → RetryLink → ErrorLink → AuthLink → HttpLink → AppSync
Response ← RetryLink ← ErrorLink ← AuthLink ← HttpLink ← AppSync
```

**Why this order matters:**

- **RetryLink is first** — it wraps the entire chain, so if any downstream link or the network request fails, RetryLink can re-execute the full chain (including re-fetching the auth token)
- **ErrorLink is second** — it sees all errors (including those from retried requests) and can log or redirect
- **AuthLink is third** — it injects the Cognito token right before the HTTP request
- **HttpLink is last** — it sends the actual request to AppSync

## Connecting to React

Wrap your application with `ApolloProvider` to make the client available to all components:

```typescript
import { ApolloProvider } from '@apollo/client';
import { apolloClient } from './apolloClient';

function App() {
  return (
    <ApolloProvider client={apolloClient}>
      {/* Your app components can now use useQuery, useMutation, etc. */}
    </ApolloProvider>
  );
}
```

Any component inside `ApolloProvider` can use Apollo's React hooks (`useQuery`, `useMutation`) to interact with your AppSync API.

<!-- ai:sign-out -->

## Sign-Out and Cache Cleanup

When a user signs out, you must clear Apollo Client's in-memory cache to prevent the next user from seeing stale data:

```typescript
import { signOut } from 'aws-amplify/auth';

async function handleSignOut() {
  // 1. Clear Apollo Client's in-memory cache
  await apolloClient.clearStore();

  // 2. Sign out from Amplify (clears Cognito tokens)
  await signOut();
}
```

**Key details:**

- **`clearStore()`** clears the in-memory cache and cancels all active queries. Use `resetStore()` instead if you want to clear the cache **and** refetch all active queries (useful if you are redirecting to a public landing page that still has queries).
- **Name the function `handleSignOut` (not `signOut`)** to avoid shadowing the Amplify import. Naming it `signOut` creates a recursive call — the function calls itself instead of Amplify's `signOut`, causing a stack overflow.
- **Order matters:** Clear the cache first, then sign out. If you sign out first, `clearStore()` may trigger refetches that fail because the auth token is already invalidated.
- **For the Local Caching strategy** (covered later in this guide), the sign-out function will also need to purge the persistent cache. The pattern above is correct for the API Only strategy.

<!-- ai:complete-setup -->

## Complete Setup File

Here is the full `src/apolloClient.ts` file combining everything above. Copy this into your project and adjust the import path for your Amplify configuration file:

```typescript
// src/apolloClient.ts
import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  from,
} from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { RetryLink } from '@apollo/client/link/retry';
import { fetchAuthSession } from 'aws-amplify/auth';
import config from './amplifyconfiguration.json';

// --- HTTP Link ---
// Connects to your AppSync GraphQL endpoint
const httpLink = createHttpLink({
  uri: config.aws_appsync_graphqlEndpoint,
});

// --- Auth Link ---
// Injects Cognito ID token into every request
const authLink = setContext(async (_, { headers }) => {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    return {
      headers: {
        ...headers,
        authorization: token || '',
      },
    };
  } catch (error) {
    console.error('Auth session error:', error);
    return { headers };
  }
});

// --- Error Link ---
// Global error handling for GraphQL and network errors
const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    for (const { message, locations, path } of graphQLErrors) {
      console.error(
        `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`
      );

      if (message.includes('Unauthorized') || message.includes('401')) {
        // Token expired or invalid — redirect to sign-in
        // window.location.href = '/signin';
      }
    }
  }

  if (networkError) {
    console.error(`[Network error]: ${networkError}`);
  }
});

// --- Retry Link ---
// Retries failed network requests with exponential backoff
const retryLink = new RetryLink({
  delay: {
    initial: 300,
    max: 5000,
    jitter: true,
  },
  attempts: {
    max: 3,
    retryIf: (error) => !!error,
  },
});

// --- Apollo Client ---
// Link chain: RetryLink → ErrorLink → AuthLink → HttpLink → AppSync
export const apolloClient = new ApolloClient({
  link: from([retryLink, errorLink, authLink, httpLink]),
  cache: new InMemoryCache(),
});
```

### Sign-Out Helper

Add this to your auth utilities (e.g., `src/auth.ts`):

```typescript
// src/auth.ts
import { signOut } from 'aws-amplify/auth';
import { apolloClient } from './apolloClient';

export async function handleSignOut() {
  await apolloClient.clearStore();
  await signOut();
}
```

---

**Next:** [Subscriptions](./05-subscriptions.md) — Set up real-time data updates using Amplify's subscription support.

**Previous:** [Prerequisites](./03-prerequisites.md)
