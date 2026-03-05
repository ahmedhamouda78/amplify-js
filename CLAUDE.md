# CLAUDE.md — AI Assistant Guide for amplify-js

This file provides context for AI assistants (Claude, Copilot, etc.) working in the `amplify-js` repository.

---

## Repository Overview

**amplify-js** is the official JavaScript/TypeScript client library for [AWS Amplify](https://aws-amplify.github.io/). It is a **Yarn workspace monorepo** orchestrated by **Turborepo** containing 21 packages, each mapping to an AWS Amplify category (Auth, Storage, Analytics, etc.).

- **Language:** TypeScript (strict mode, ES2020 target)
- **Package manager:** Yarn 1.22.x
- **Build orchestrator:** Turborepo 2.x
- **Node.js requirement:** 18.18.0 (recommended)
- **License:** Apache-2.0

---

## Monorepo Package Map

All packages live under `packages/`:

| Package | npm name | Purpose |
|---|---|---|
| `core` | `@aws-amplify/core` | Shared utilities, caching, I18n, configuration |
| `auth` | `@aws-amplify/auth` | Cognito authentication (OAuth, SAML, custom flows) |
| `analytics` | `@aws-amplify/analytics` | Amazon Pinpoint analytics |
| `storage` | `@aws-amplify/storage` | Amazon S3 file operations (upload/download/list) |
| `api` | `@aws-amplify/api` | Aggregator for REST + GraphQL |
| `api-rest` | `@aws-amplify/api-rest` | REST API via API Gateway (SigV4 signed) |
| `api-graphql` | `@aws-amplify/api-graphql` | GraphQL via AppSync |
| `datastore` | `@aws-amplify/datastore` | Offline/online sync with AppSync |
| `datastore-storage-adapter` | `@aws-amplify/datastore-storage-adapter` | Storage adapters for DataStore (IndexedDB, AsyncStorage) |
| `predictions` | `@aws-amplify/predictions` | ML/AI services (Rekognition, Comprehend, Translate, etc.) |
| `geo` | `@aws-amplify/geo` | Amazon Location Service |
| `interactions` | `@aws-amplify/interactions` | Amazon Lex chatbots |
| `pubsub` | `@aws-amplify/pubsub` | Real-time messaging via IoT |
| `notifications` | `@aws-amplify/notifications` | Push notifications via Pinpoint |
| `adapter-nextjs` | `@aws-amplify/adapter-nextjs` | Next.js SSR adapter |
| `aws-amplify` | `aws-amplify` | Main aggregator — re-exports all categories |
| `react-native` | `@aws-amplify/react-native` | React Native wrapper |
| `rtn-push-notification` | `@aws-amplify/rtn-push-notification` | React Native push notifications |
| `rtn-web-browser` | `@aws-amplify/rtn-web-browser` | React Native web browser |
| `rtn-passkeys` | `@aws-amplify/rtn-passkeys` | React Native passkeys support |
| `scripts/tsc-compliance-test` | `tsc-compliance-test` | TypeScript API compliance testing |

---

## Development Setup

```bash
# 1. Clone and install
git clone git@github.com:[username]/amplify-js.git
cd amplify-js
yarn                    # Install all dependencies

# 2. Full dev setup (installs + links + builds all packages)
yarn setup-dev

# 3. Build everything
yarn build

# 4. Build a single package
yarn workspace @aws-amplify/auth build

# 5. Watch mode for development
yarn build:watch
# or for a single package:
yarn workspace @aws-amplify/auth build:watch
```

---

## Common Commands

### Building

```bash
yarn build                          # Build all packages + check for duplicate deps
yarn build:watch                    # Watch mode (all packages)
yarn workspace <pkg-name> build     # Build one package
yarn clean                          # Clean all build outputs
```

### Testing

```bash
# Full test suite
yarn test

# Individual test suites
yarn test:no-datastore              # All packages except DataStore
yarn test:datastore                 # DataStore package only
yarn test:size                      # Bundle size checks (requires build first)
yarn test:license                   # Apache-2.0 license header check
yarn test:github-actions            # GitHub Actions config validation
yarn test:tsc-compliance            # TypeScript API compliance tests

# Single package
yarn workspace @aws-amplify/auth test

# With coverage
yarn workspace @aws-amplify/auth test --coverage
```

### Linting and Formatting

```bash
yarn lint                           # Lint all packages
yarn lint:fix                       # Auto-fix lint issues
yarn format                         # Run Prettier on all packages
yarn lint:license                   # Auto-add missing license headers
```

### Linking to a Sample App

```bash
# In amplify-js repo
yarn link-all                       # Link all packages
yarn workspace @aws-amplify/auth link  # Link a single package

# In your sample app
yarn link @aws-amplify/auth
```

---

## Project Structure

```
amplify-js/
├── packages/               # All npm packages (see table above)
│   ├── core/
│   │   ├── src/            # TypeScript source
│   │   ├── __tests__/      # Jest unit tests
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   └── rollup.config.mjs
│   └── [other packages]/
├── scripts/                # Build and utility scripts
│   ├── dts-bundler/        # Custom .d.ts bundling
│   └── tsc-compliance-test/
├── rollup/                 # Shared Rollup config helpers
├── docs/                   # Documentation
├── .changeset/             # Changesets for versioning
├── .github/
│   └── workflows/          # 40+ CI/CD GitHub Actions workflows
├── .husky/                 # Git hooks (pre-commit, pre-push)
├── turbo.json              # Turborepo task configuration
├── tsconfig.json           # Root TypeScript config
├── eslint.config.mjs       # ESLint flat config (v9)
├── prettier.config.js      # Prettier formatting config
├── jest.config.js          # Root Jest config
├── jest.setup.js           # Global test setup
└── package.json            # Monorepo root config + scripts
```

### Per-Package Structure

Each package typically contains:

```
packages/<name>/
├── src/
│   ├── index.ts            # Public exports
│   ├── types.ts            # Type definitions
│   └── [category files]
├── __tests__/
│   └── *.test.ts           # Unit tests (Jest)
├── dist/                   # CJS build output (gitignored)
├── lib/                    # CJS build (gitignored)
├── lib-esm/                # ESM build (gitignored)
├── package.json
├── tsconfig.json
├── tsconfig.build.json     # Build-specific TS config
├── tsconfig.test.json      # Test-specific TS config
└── rollup.config.mjs       # Rollup bundle config
```

---

## TypeScript Configuration

- **Target:** ES2020
- **Module:** ES2020
- **Strict mode:** enabled (`strict: true`, `noImplicitAny: true`)
- **Declarations:** generated for all packages
- **Source maps:** enabled
- `noEmitOnError: true` — build fails on type errors
- Platform-specific files use `.native.ts` suffix for React Native

---

## Code Style and Conventions

### Formatting (Prettier)

- **Tabs** for indentation (not spaces)
- **Single quotes** for strings
- **Trailing commas** everywhere (arrays, objects, functions, generics)
- **Print width:** 80 characters
- **Arrow parens:** omit when single param (`x => x`, not `(x) => x`)

### Linting (ESLint v9 flat config)

- **Max line length:** 120 characters (ignores comments, URLs, strings, template literals)
- **camelCase** required for identifiers (with named exceptions for AWS/OAuth parameters like `access_token`, `client_id`, `aws_*`, etc.)
- **No `console`** — `no-console: error` (use `ConsoleLogger` from core instead)
- **No param reassignment** — `no-param-reassign: error`
- **No eval** — `no-eval: error`
- **No `return await`** — use `return promise` directly
- **Import ordering** — imports must be grouped with newlines between groups
- **Unused imports** removed — `unused-imports/no-unused-imports: error`
- **Object shorthand** enforced — `{ foo }` not `{ foo: foo }`
- **TypeScript `no-shadow`** — use scoped names
- **Blank line before `return`** statements
- **JSDoc types** validated — `jsdoc/no-undefined-types: warn`

### Naming Conventions

- `camelCase` for variables, functions, methods
- `PascalCase` for classes, interfaces, type aliases, enums
- `SCREAMING_SNAKE_CASE` for constants
- Files: `camelCase.ts` or `PascalCase.ts` (match exported symbol)
- Platform-specific: `foo.native.ts`, `foo.android.ts`, `foo.ios.ts`
- Tests: `__tests__/foo.test.ts` or `__tests__/foo.spec.ts`

### Exports

- **Named exports only** — default exports are deprecated in this codebase
- Tree-shaking friendly: use named imports/exports
- Server-side safe exports use `/server` path (e.g., `aws-amplify/auth/server`)
- Internal utilities should not be re-exported through public API

### Promises and Async

- Prefer `async/await` over `.then()` chains
- Always handle promise rejections (`promise/catch-or-return: error`)
- Do not `return await` — just `return promise`

---

## Architecture Patterns

### Category + Plugin System

Amplify uses a **category + plugin** architecture:
- A **category** defines the API surface (e.g., `Storage.uploadData()`)
- A **plugin/provider** implements the category against a specific service (e.g., S3)
- `@aws-amplify/core` holds the singleton `Amplify` object and configuration

### Singleton Pattern

Each category exports a singleton service instance. Consumers configure it once via `Amplify.configure({...})` and interact through the exported singleton.

### Platform Adapters

- Web files: `foo.ts`
- React Native files: `foo.native.ts` (resolved by bundlers via `react-native` field in package.json)
- The build produces separate ESM (`lib-esm/`) and CJS (`lib/`) outputs plus a bundled UMD (`dist/`)

### SSR Support

Packages that support server-side rendering export from a `/server` subpath. These exports avoid browser-only globals.

---

## Testing Conventions

- **Framework:** Jest 29 with `ts-jest`
- **Environment:** `jsdom` (browser-like) by default
- **Test files:** `__tests__/**/*.test.ts` or `**/*.spec.ts`
- **Coverage:** available via `--coverage` flag; output in `coverage/`
- Some packages (e.g., `core`) run tests with `-w 1` (single worker) to avoid race conditions

### Writing Tests

```typescript
// Import from the package src directly in tests
import { someFunction } from '../../src/someModule';

// Mock AWS SDK modules
jest.mock('@aws-sdk/client-s3');

// Use beforeEach/afterEach to reset mocks
beforeEach(() => {
  jest.clearAllMocks();
});
```

---

## Build System Details

### Turborepo Tasks

Defined in `turbo.json`:
- `build` — depends on dependencies being built first (`^build`); outputs `dist/`, `lib/`, `lib-esm/`
- `test` — depends on `^build`; outputs `coverage/`
- `lint` / `lint:fix` / `format` — no outputs, use file inputs
- `clean` — cache disabled, removes outputs

### Rollup Bundling

Each package uses `rollup.config.mjs` to produce:
- ESM build in `lib-esm/`
- CJS build in `lib/`
- UMD bundle in `dist/` (via Webpack for some packages)

Shared Rollup config helpers live in `rollup/`.

### Bundle Size Enforcement

Each package defines size limits in `package.json` under `"size-limit"`. Run `yarn test:size` to verify. Sizes must not regress.

---

## Git Workflow and Hooks

### Branch Naming

Format: `<token>/<short-description>`

Tokens: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

Examples: `feat/s3-multipart-upload`, `fix/cognito-token-refresh`

### Git Hooks (Husky)

- **pre-commit** (`lint-staged`): Runs ESLint `--fix` on staged `.ts`/`.tsx` files
- **pre-push** (`git-secrets`): Scans for AWS credentials and secrets; **blocks push if found**

### git-secrets Setup (Required)

```bash
# Install git-secrets (macOS)
brew install git-secrets

# Linux
sudo apt-get install git-secrets
# or manual: clone awslabs/git-secrets and sudo make install

# Register AWS patterns in this repo
git secrets --register-aws
```

The `prepare` script auto-runs `scripts/setup-git-secrets.sh` on `yarn install`.

### Changesets (Versioning)

This repo uses [Changesets](https://github.com/changesets/changesets) for semantic versioning:

```bash
# After making changes, create a changeset
npx changeset

# This creates a markdown file in .changeset/ describing the change
# Commit this file with your PR
```

Release types: `latest` (stable), `unstable` (dev snapshot), `preid` (custom pre-release tag), `hotfix`.

---

## CI/CD

GitHub Actions workflows (`.github/workflows/`) cover:

| Workflow | Trigger | Purpose |
|---|---|---|
| `pr.yml` | Pull request | Prebuild, unit tests, bundle size, license, TSC compliance, dependency review |
| `release-latest.yml` | Push to `main` | Stable npm publish |
| `release-unstable.yml` | Manual/scheduled | Unstable snapshot publish |
| `release-hotfix.yml` | Manual | Hotfix release |
| `codeql-analysis.yml` | Push/PR | Security scanning |

All CI checks must pass before merging a PR.

---

## Key Files Reference

| File | Purpose |
|---|---|
| `turbo.json` | Turborepo task graph and caching config |
| `tsconfig.json` | Root TypeScript compiler options |
| `eslint.config.mjs` | ESLint v9 flat config (rules, plugins, ignores) |
| `prettier.config.js` | Prettier formatting rules |
| `jest.config.js` | Root Jest configuration |
| `jest.setup.js` | Global test setup (console suppression, globals) |
| `.lintstagedrc.mjs` | Files and commands for pre-commit linting |
| `license_config.json` | License header check configuration |
| `.changeset/` | Pending changelog entries |
| `.husky/pre-commit` | Pre-commit hook (lint-staged) |
| `.husky/pre-push` | Pre-push hook (git-secrets scan) |
| `scripts/setup-git-secrets.sh` | Registers AWS secret patterns |
| `scripts/duplicates-yarn.sh` | Checks for duplicate dependency versions |

---

## Common Pitfalls for AI Assistants

1. **Never use `console.log`** — ESLint will error. Use `ConsoleLogger` from `@aws-amplify/core` or `jest.spyOn(console, ...)` in tests.

2. **Always use named exports** — no default exports.

3. **Import order matters** — place blank lines between import groups (external, internal). ESLint enforces this.

4. **Use tabs, not spaces** — Prettier is configured for tabs.

5. **Trailing commas required** — in all multiline constructs (arrays, objects, params, generics).

6. **Do not reassign parameters** — `no-param-reassign` is an error. Destructure or create new variables instead.

7. **Blank line before `return`** — required by `@stylistic/padding-line-between-statements`.

8. **Never commit AWS credentials** — git-secrets will block the push, but avoid including any key patterns even in tests.

9. **Build before testing** — Turborepo's `test` task depends on `^build`. If tests fail with import errors, run `yarn build` first.

10. **Platform-specific code** — if writing code that diverges for React Native, create a `.native.ts` sibling file rather than using runtime platform detection.

11. **`return await` is forbidden** — simply `return somePromise` or `return await` only inside `try/catch` where you need to catch the rejection.

12. **Check bundle size** — significant additions to public exports may fail `yarn test:size`. Check limits in the affected package's `package.json`.
