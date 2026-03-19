# Amplify JS DataStore Gen 1 to Gen 2 Migration Guide

## What This Is

A comprehensive migration guide that helps Amplify Gen 1 customers migrate their JavaScript/TypeScript DataStore-based applications to Gen 2 using Apollo Client. Since DataStore is not available in Amplify Gen 2, this guide provides step-by-step instructions, code examples, and a decision framework for three migration strategies (API Only, Local Caching, Offline-First). The guide is published on docs.amplify.aws and also available as an AI-friendly document for agent-assisted migration.

## Core Value

Customers can confidently migrate their Gen 1 DataStore apps to Gen 2 without losing critical functionality, with clear guidance on which strategy matches their needs and working code they can follow.

## Current State

**v1.0 shipped: 2026-03-15** -- See [milestones/v1.0-ROADMAP.md](./milestones/v1.0-ROADMAP.md)

Delivered:
- 17 guide files covering all 3 migration strategies (API Only, Local Caching, Offline-First)
- Decision framework, parity matrix, and migration checklists
- Before/after code for every DataStore operation
- 8 MDX pages ready for docs.amplify.aws
- AI-friendly single-file version (8,973 lines, 144 ai: tags)
- Sample app spec and 3 migration test plans

## Next Milestone Goals (v2)

Candidates for v2 (requires `/gsd:new-milestone` to define):
- React Native-specific migration patterns
- Next.js SSR-specific patterns
- Multi-auth mode migration (API key, IAM, OIDC)
- Automated DataStore usage audit tool
- agentskills.io Agent Skill format

## Constraints

- **Replacement library:** Apollo Client is the sole recommended replacement (per team decision)
- **Auth focus:** Cognito User Pools as primary auth pattern in all examples
- **Framework focus:** React-focused examples with vanilla JS alternatives where helpful
- **Docs format:** Must conform to Amplify docs site MDX format and conventions
- **Validation:** Guide must be tested by actually migrating sample apps before publication
- **Depth:** All three strategies (API Only, Local Caching, Offline-First) require deep, working code examples

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Apollo Client as sole replacement | Aligns with iOS/Android guides, strong ecosystem, good AppSync support | Shipped v1.0 |
| Apollo Client v3 (not v4) | apollo3-cache-persist only supports v3 | Shipped v1.0 |
| Hybrid subscription (Amplify + Apollo) | No JS equivalent of AppSync Apollo Extensions library | Shipped v1.0 |
| Client-side focus only | Backend migration is a separate workstream with its own timeline | Shipped v1.0 |
| React-focused examples | Most DataStore JS users are React developers | Shipped v1.0 |
| Cognito primary auth | Most common auth pattern for DataStore apps | Shipped v1.0 |
| All 3 strategies at full depth | Comprehensive coverage for all customer segments | Shipped v1.0 |
| Dual-format output (docs + AI) | Immediate docs value + future agent skill conversion | Shipped v1.0 |
| Dexie.js for offline local DB | Mature IndexedDB wrapper, clean API, v4 stable | Shipped v1.0 |
| CachePersistor over persistCache | Lifecycle control (purge, pause, getSize) needed for sign-out | Shipped v1.0 |

## Context

- **Guide location:** `guide/` directory in this repo (canonical markdown source)
- **MDX pages:** `guide/mdx/migrate-from-datastore/` (ready for docs site)
- **AI-friendly:** `guide/AI-MIGRATION-GUIDE.md` (single concatenated file)
- **Validation:** `guide/validation/` (sample app spec + 3 migration test plans)
- **Docs site:** `/home/ec2-user/Work/AmplifyDev/docs/`
- **Amplify JS repo:** `/home/ec2-user/Work/AmplifyDev/amplify-js/`
- **DataStore package:** `packages/datastore/` (IndexedDB, immer, rxjs, ulid)

---
*Last updated: 2026-03-15 after v1.0 milestone completion*
