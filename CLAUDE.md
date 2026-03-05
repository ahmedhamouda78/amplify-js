# CLAUDE.md — AWS Amplify JS

## Project Overview

AWS Amplify JS is a JavaScript/TypeScript library for building cloud-powered web and mobile applications with AWS services. It provides client-side modules for authentication, storage, APIs (REST & GraphQL), analytics, push notifications, geo, predictions, and real-time pub/sub — targeting both web browsers and React Native.

**Repository:** `aws-amplify/amplify-js`
**License:** Apache-2.0
**npm scope:** `@aws-amplify/*`
**Main entry package:** `aws-amplify` (re-exports from category packages)

## Monorepo Structure

This is a Yarn 1 workspaces monorepo managed with Turborepo and Changesets.

### Packages (`packages/`)

| Package | Description |
|---------|-------------|
| `core` | Foundation — configuration, credentials, Hub event bus, platform utilities. Most packages depend on this. |
| `auth` | Authentication — Cognito sign-in/sign-up, OAuth, MFA, passkeys |
| `storage` | Cloud storage — S3 upload/download/list/remove |
| `api` | Unified API module (wraps api-graphql + api-rest) |
| `api-graphql` | GraphQL API — AppSync operations, subscriptions |
| `api-rest` | REST API — API Gateway operations |
| `analytics` | Event recording — Pinpoint, Kinesis, Personalize |
| `notifications` | Push notifications + in-app messaging |
| `datastore` | Offline-first data with sync (DataStore) |
| `datastore-storage-adapter` | SQLite adapter for DataStore |
| `geo` | Location services — maps, search, geofencing |
| `interactions` | Conversational bots — Lex |
| `predictions` | AI/ML — Translate, Polly, Rekognition, Textract |
| `pubsub` | Real-time pub/sub messaging |
| `adapter-nextjs` | Next.js integration — SSR/SSG auth, API route helpers |
| `aws-amplify` | Umbrella package that re-exports all category packages |
| `react-native` | React Native platform support utilities |
| `rtn-push-notification` | React Native push notification native module |
| `rtn-web-browser` | React Native web browser native module |
| `rtn-passkeys` | React Native passkeys native module |

### Package Internal Layout

Each package typically has:
```
packages/<name>/
├── src/              # Source code (TypeScript)
├── __tests__/        # Jest test files
├── dist/             # Built output (CJS)
├── lib-esm/          # Built output (ESM)
├── package.json
├── tsconfig.json     # Extends root tsconfig
├── tsconfig.build.json
├── jest.config.js
└── rollup.config.mjs  # (some packages)
```

## Development Setup

**Prerequisites:** Node.js 18.18.0+, Yarn 1.22.x

```bash
yarn                  # Install dependencies
yarn setup-dev        # Install + link all packages + build
```

## Common Commands

### Building
```bash
yarn build                          # Build all packages (with turbo caching)
yarn build:watch                    # Watch mode for incremental builds
```

### Testing
```bash
yarn test                           # Run ALL tests (slow — includes DataStore)
yarn test:no-datastore              # Run tests excluding DataStore (faster)
yarn test:datastore                 # Run DataStore tests only
yarn test:size                      # Bundle size regression tests
yarn test:tsc-compliance            # TypeScript type compliance tests
```

To run tests for a **single package**:
```bash
turbo run test --filter=@aws-amplify/auth
```

### Linting & Formatting
```bash
yarn lint                           # Run ESLint across all packages
yarn lint:fix                       # Auto-fix lint issues
yarn format                         # Run Prettier via turbo
```

### Local Development with Linking
```bash
yarn link-all                       # Link all packages for local testing
yarn build:watch                    # Watch mode for rebuilds during dev
```

## Code Style & Conventions

### File Headers
All source files must include the copyright and license header:
```typescript
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
```

### Language & TypeScript
- **TypeScript** throughout (strict mode enabled)
- Target: ES2020, module: ES2020
- Module resolution: Node
- All packages emit both CJS (`dist/cjs/`) and ESM (`dist/esm/`) outputs via Rollup
- Rollup uses `preserveModules: true` to maintain file structure in output

### Formatting (Prettier)
- **Tabs** for indentation (not spaces)
- Single quotes
- Trailing commas everywhere (multiline)
- Print width: 80
- No parens on single-param arrow functions (`avoid`)

### Linting (ESLint 9 flat config)
Key rules:
- `camelCase` enforced (with AWS/auth/notification field exceptions)
- Max line length: 120 characters (comments, URLs, strings exempted)
- Import ordering: groups separated by blank lines, sorted within groups
- No unused imports (auto-removed by `unused-imports` plugin)
- Unused vars must be prefixed with `_`
- `no-console` — use Amplify's internal logger instead
- `no-eval`, `no-param-reassign`
- Object shorthand required
- Blank line before `return` statements
- `@typescript-eslint/no-shadow` (no variable shadowing)
- Method signature style: `method` (not `property`)

### Naming Conventions
- **camelCase** for variables, functions, methods, and utility filenames
- **PascalCase** for classes, interfaces, types, enums, and class filenames (e.g., `Hub.ts`, `StorageCache.ts`)
- Prefix unused parameters/variables with `_`
- Internal/private APIs are typically in `src/` subdirectories not exported from package index

### Platform-Specific Files
React Native and platform-specific code uses file extension conventions:
- `.native.ts` — React Native implementation
- `.android.ts` / `.ios.ts` — Platform-specific native code
- `.ts` — Default (web/browser) implementation
- All variants export the same interface; the bundler selects the correct file

### Import Conventions
- Imports must be ordered with blank lines between groups (enforced by `import/order`)
- Sort import specifiers alphabetically within a statement
- No circular imports or mutable exports
- No relative package imports (`import/no-relative-packages`)
- Newline required after import block

### Testing
- **Jest** is the test framework (with `ts-jest`)
- Test files live in `__tests__/` directories within each package
- Test file naming: `*.test.ts` or `*.test.tsx`
- Use `jest-environment-jsdom` for browser-context tests
- Each package has its own `jest.config.js`

## Git Conventions

### Branch Naming
```
[type]/[short-token]-[branch-name]
```
Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

### Commit Messages
```
type(scope): description (#PR)
```
Examples:
- `feat(auth): add passkey support (#14500)`
- `fix(storage): resolve upload race condition (#14600)`
- `chore(deps): update minimatch resolutions (#14739)`

### Git Hooks
- **pre-commit**: Runs `lint-staged` (ESLint auto-fix on staged `.ts` files)
- **pre-push**: Runs `git-secrets` scan (blocks accidental credential commits)

### Changesets
All user-facing changes require a changeset file:
```bash
yarn changeset        # Interactive — creates .changeset/*.md describing the change
```
Changesets drive the automated release process via `@changesets/cli`.

## Architecture Notes

### Core Package (`packages/core`)
The foundation that all other packages depend on. Provides:
- **Amplify configuration** — `Amplify.configure()` singleton
- **Credential management** — resolves AWS credentials from configured auth
- **Hub** — event bus for cross-category communication
- **Platform detection** — identifies runtime environment (browser, Node, React Native)
- **Internal utilities** — retry, caching, signing, URL parsing

### Category Pattern
Each category package (auth, storage, etc.) follows a layered architecture:
1. **Public API** — exported from `src/index.ts` as standalone functions (functional style, not class-based)
2. **Providers** — service-specific implementations in `src/providers/` (e.g., `src/providers/cognito/`)
3. **Foundation** — shared utilities, service client factories, and serialization in `src/foundation/`
4. **Types** — package-specific types in `src/types/`
5. **Internals** — private APIs in `src/client/` or `src/internal/`, not re-exported from index

All categories use `@aws-amplify/core` for configuration (`Amplify.configure()` singleton), credentials, and Hub events.

### Error Handling
- Base class: `AmplifyError` from `@aws-amplify/core` (includes `recoverySuggestion` field)
- Each service operation has specific error classes (e.g., `SignInException`, `StorageError`)
- Errors are typed and documented with `@throws` JSDoc annotations

### Bundle Size
Bundle size is tracked and tested per-package via `size-limit`. To check:
```bash
yarn test:size              # Run size checks
yarn test:size --why        # Open Statoscope for analysis
```

## CI/CD Pipeline

### Pull Request Checks
1. Prebuild (full monorepo build)
2. Unit tests (parallelized per package)
3. Bundle size regression tests
4. License compliance check
5. TSC compliance tests
6. Dependency review
7. Git secrets check

### Release Process
1. Contributors add changeset files with their PRs
2. Changesets bot creates a version-bump PR
3. Merging the version PR triggers npm publish
4. Channels: `latest` (stable), `unstable` (snapshot), pre-release IDs

## Tips for AI Assistants

- **Always build before testing** — tests depend on built output from dependent packages. Use `turbo run test --filter=@aws-amplify/<pkg>` which handles dependency builds.
- **Use tabs** — the project uses tabs for indentation, not spaces.
- **No console.log** — ESLint forbids `console`. Use the internal logger from `@aws-amplify/core`.
- **Respect the import order** — imports must be grouped with blank lines between groups and sorted alphabetically within each group.
- **DataStore tests are slow** — prefer `yarn test:no-datastore` for faster iteration.
- **Each package builds independently** — modify and rebuild only the affected package during development.
- **Check bundle size impact** — run `yarn test:size` when changing public APIs or adding dependencies.
- **Changeset required for releases** — any user-facing change needs a changeset file in `.changeset/`.
