# AGENTS.md

This file defines how coding agents must work in the RITSEI repository.

> **Related documents**
>
> - Project overview: [`./README.md`](./README.md)
> - Architecture entrypoint: [`./ARCHITECTURE.md`](./ARCHITECTURE.md)
> - Documentation index: [`./docs/README.md`](./docs/README.md)
> - Canonical architecture: [`./docs/architecture/architecture-spec-v4.md`](./docs/architecture/architecture-spec-v4.md)
> - Architecture decisions: [`./docs/decisions/README.md`](./docs/decisions/README.md)
> - Documentation workflow: [`./docs/development/documentation-workflow.md`](./docs/development/documentation-workflow.md)
> - Documentation ownership: [`./docs/documentation-boundaries.md`](./docs/documentation-boundaries.md)
> - Frontend architecture: [`./docs/architecture/frontend.md`](./docs/architecture/frontend.md)
- Skeleton architecture: [`./docs/architecture/skeleton.md`](./docs/architecture/skeleton.md)
> - Process Studio architecture: [`./docs/architecture/process-studio.md`](./docs/architecture/process-studio.md)
> - External integration surface: [`./docs/architecture/integration-architecture.md`](./docs/architecture/integration-architecture.md)
> - Stateful runtime: [`./docs/architecture/runtime-architecture.md`](./docs/architecture/runtime-architecture.md)
> - State and consistency: [`./docs/architecture/state-and-consistency.md`](./docs/architecture/state-and-consistency.md)
> - Financial ledger: [`./docs/architecture/financial-ledger.md`](./docs/architecture/financial-ledger.md)
> - Search architecture: [`./docs/architecture/search-architecture.md`](./docs/architecture/search-architecture.md)
> - Analytics architecture: [`./docs/architecture/analytics-architecture.md`](./docs/architecture/analytics-architecture.md)
> - Workload isolation: [`./docs/architecture/workload-isolation.md`](./docs/architecture/workload-isolation.md)
> - Frontend SPA decision: [`./docs/decisions/0010-use-vite-solidjs-spa.md`](./docs/decisions/0010-use-vite-solidjs-spa.md)
> - Architecture enforcement: [`./docs/architecture/architecture-enforcement.md`](./docs/architecture/architecture-enforcement.md)
> - Testing strategy: [`./docs/development/testing.md`](./docs/development/testing.md)
> - Database roles: [`./docs/operations/database-roles.md`](./docs/operations/database-roles.md)

## Source-of-Truth Order

When documents conflict, use this order:

1. Accepted ADRs that explicitly supersede earlier decisions.
2. `docs/architecture/architecture-spec-v4.md`.
3. Other canonical architecture documents.
4. Reference and exploration documents.

`ARCHITECTURE.md` is an architectural entrypoint and summary. It does not
supersede the canonical specification or accepted ADRs.

Do not silently resolve contradictions. Report them and update the relevant
source of truth.

## Working Rules

- Inspect existing code and tests before introducing a new pattern.
- Make the smallest change that fully solves the task.
- Avoid unrelated refactoring.
- Solve the requested outcome, not the surrounding roadmap. Required validation is not permission
  to build new tooling. Reuse existing commands, tests, and harnesses first.
- Do not add or generalize evaluators, registries, generators, policy schemas, CI gates, or browser
  harnesses unless explicitly requested or an existing check demonstrably cannot validate a
  task-required invariant. Explain that gap before expanding scope; keep any extension local.
- Documentation or risk-acceptance changes do not automatically require executable policy models.
  Preserve existing gates and distinguish owner approval from observed test results.
- Stop when the requested change and relevant checks are complete. Report unrelated failures
  separately; do not repair inherited debt or chase roadmap scores without authorization.
- Load only task-relevant skills and notes. Autoresearch prompts and experiment objectives apply
  only when explicitly activated, not as standing instructions for ordinary development.
- Keep progress updates factual: report a result, blocker, or scope decision, not repeated planning
  narration. Before handing off, remove speculative abstractions and review the diff for scope creep.
- Preserve existing naming and directory conventions.
- Do not add dependencies without a documented reason.
- Do not weaken typing, validation, constraints, authorization, audit, or tests.
- Do not convert all failures into generic `Error` values.
- Do not assume an Effect fiber is durable.
- Do not treat Drizzle as the domain model.
- Do not encode a financial storage engine such as TigerBeetle in orthogonal
  domain primitives; engine selection belongs in the current financial-ledger ADR.
- Do not activate Zig without benchmark evidence and a safe fallback.
- Commits created by agents MUST follow the [commit-message standard](./docs/development/commit-message-guidelines.md); do not rewrite shared history without explicit approval.

## Repository-Native Skills

Before implementing a matching workflow, read the relevant `SKILL.md` under
`.agents/skills/`. Match ordinary developer intent to the descriptions below;
do not require the user to name a skill. Compose skills when a change crosses
several workflows.

| Developer intent | Skill |
|---|---|
| Add or implement a business capability from a terse ERP request | [`develop-enterprise-feature`](./.agents/skills/develop-enterprise-feature/SKILL.md) |
| Design or explain an Effect success/error/requirements flow or call graph | [`design-effect-program`](./.agents/skills/design-effect-program/SKILL.md) |
| Add a new domain or schema owner | [`create-domain-module`](./.agents/skills/create-domain-module/SKILL.md) |
| Change tables, constraints, triggers, RLS, or migrations | [`change-owned-schema`](./.agents/skills/change-owned-schema/SKILL.md) |
| Add or change a package's public service, DTO, or tagged errors | [`expose-public-contract`](./.agents/skills/expose-public-contract/SKILL.md) |
| Let one domain consume another domain's behavior or facts | [`introduce-cross-domain-integration`](./.agents/skills/introduce-cross-domain-integration/SKILL.md) |
| Expose domain behavior through the Effect HTTP API | [`add-api-endpoint`](./.agents/skills/add-api-endpoint/SKILL.md) |
| Add a protected business action or permission | [`add-authorization-capability`](./.agents/skills/add-authorization-capability/SKILL.md) |
| Implement stock, balance, journal, idempotent, or multi-write invariants | [`implement-transactional-workflow`](./.agents/skills/implement-transactional-workflow/SKILL.md) |

Installed generic skills supplement these workflows; they do not replace
repository ownership, tooling, or validation rules.

### Agent Authority Model

- **Reasoning authority:** agents may inspect broadly, identify owners, choose a
  documented workflow, and make bounded implementation decisions.
- **Execution authority:** use existing repository tasks and generators for deterministic
  mechanics; do not hand-simulate their output or infer authority to create more tooling.
- **Validation authority:** existing scripts, linters, type checking, tests, and CI decide
  whether mechanical invariants hold. A focused regression test can supply executable evidence;
  a new evaluator is not the default. Human review remains human review.
- **Deployment authority:** destructive migrations, production changes, secrets,
  and break-glass operations remain subject to existing human review and runtime
  permissions.

## Dependency Ownership

Dependency and Deno configuration ownership follows application boundaries:

```text
             Dependency ownership

       package.json                 apps/web/package.json
       repo-wide npm/JSR             web-only runtime/dev deps
       deps and tooling              (exact pins live here)
                │                              │
                └──────────────┬───────────────┘
                               ▼
                         deno install
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
               node_modules           deno.lock

             deno.json owns workspace orchestration,
             runtime, compiler, tasks, formatting,
             linting, and permissions.
```

Rules:

- Declare a dependency in the application boundary that exclusively consumes it:
  repository-wide dependencies and tooling belong in the root `package.json`; web-only
  runtime and development dependencies belong in `apps/web/package.json`.
- Keep exact dependency versions in the owning manifest: repository-wide packages in the root
  `package.json`, and web-only packages in `apps/web/package.json`. Do not duplicate versions in
  source imports, task commands, CI configuration, or Dockerfiles.
- Keep dependencies used by root tests, tooling, runtime, or more than one boundary in
  the root `package.json`, even when their names are frontend-oriented.
- Commit the single `deno.lock` so dependency resolution remains reproducible.
- Keep `nodeModulesDir: "auto"` and `preferPackageJson: true` in `deno.json`.
- Use `deno install` after root or member manifest changes.
- Treat `vendor/` as reference material, not as the application dependency source.

## Effect v4 Reference

All TypeScript implementations that use Effect v4 MUST consult the vendored
canonical source at `./vendor/effect` before writing or changing Effect
code. The legacy directory name is retained so the existing
subtree history remains pullable. Use it as the primary local reference for v4
APIs, module layout, examples, and migration behavior. Do not rely on Effect v3
memory when the vendored reference can answer the question.

The subtree is maintained from the `effect` remote at
`https://github.com/Effect-TS/effect/tree/main`:

```sh
git subtree pull --prefix=vendor/effect effect main --squash
```

## Drizzle v1 Reference and Effect Integration

The runtime `drizzle-orm` dependency is pinned to `1.0.0-rc.5-169397b` in the
root `package.json` and `deno.lock`. Keep that runtime pin; do not downgrade it
to match the vendored reference. The vendored Drizzle v1 source remains a
`v1.0.0-rc.4` reference subtree until it is deliberately refreshed from the
upstream source.

The subtree is maintained from the `drizzle-orm` remote:

```sh
git subtree pull --prefix=vendor/drizzle-orm drizzle-orm v1.0.0-rc.4 --squash
```

The migration generator remains pinned independently to Drizzle Kit
`1.0.0-rc.4`; runtime ORM and migration-generator versions must not be
conflated. Revalidate the migration graph, typecheck, and integration tests
before changing either pin.

Integration rules:

- Effect owns lifecycle, typed failures, dependency injection, and transaction
  boundaries.
- Drizzle owns SQL construction, dialect rendering, and typed persistence
  schema; it is never the domain model.
- Keep the PostgreSQL driver, Drizzle client lifecycle, transaction boundary,
  and infrastructure-error mapping inside `foundation/` contracts and `platform/postgres/` adapters.
- `db/schema/index.ts` is the Drizzle Kit entry point. A domain implementation
  may import only its owned tables; public package entry points must not
  re-export persistence tables or Drizzle query types.
- Use Drizzle query builders for application reads and writes. Raw SQL in a
  domain implementation is forbidden; unsupported PostgreSQL DDL belongs in a
  reviewed Drizzle custom migration.
- Execute every invariant-sensitive mutation through the foundation database contract's typed Drizzle
  transaction service, implemented by `platform/postgres/`. Do not construct a driver client inside a domain.
- Map constraint failures to tagged domain errors at the owning domain boundary;
  never expose raw PostgreSQL or Drizzle errors to callers.
- Do not copy integration examples verbatim. Adapt them to this repository's
  `DatabaseLayer`, public module contracts, schema ownership, and test layers.
- Application dependencies resolve from their owning workspace manifest; vendored
  subtrees are reference-only and must not be used as runtime dependencies.
- The root `package.json` owns repository-wide npm/JSR dependencies and tooling; `apps/web/package.json`
  owns dependencies exclusively consumed by the web application. Both manifests resolve into the single
  `deno.lock` dependency graph.
- `deno.json` owns Deno runtime and toolchain behavior such as compiler options, permissions, tasks,
  formatting, linting, and workspace membership; it does not own web dependency versions.
- Do not introduce raw GitHub, `raw.githubusercontent.com`, or other HTTPS source imports as package
  substitutes unless an accepted ADR explicitly requires the exception.
- `drizzle-orm/effect-postgres` and its `effect` / `@effect/sql-pg` peer path are covered by the
  foundation/platform import smoke test. Keep required repository-wide peer dependencies in the root
  `package.json`.
- Generate every migration with pinned Drizzle Kit `1.0.0-rc.4`. Custom SQL must
  start from `drizzle-kit generate --custom`; every migration directory must
  contain `migration.sql` and `snapshot.json`.

## Documentation Boundaries

Before editing documentation, read `docs/documentation-boundaries.md`.
Do not duplicate canonical rules across several documents. Link to the owning
document and summarize only what is necessary for navigation or context.

## HTTP Rules

- HTTP contracts, routing, request decoding, error encoding, and OpenAPI use
  Effect v4 `HttpApi`, `HttpApiGroup`, `HttpApiEndpoint`, `HttpApiBuilder`, and
  `HttpRouter`.
- Use the canonical `@effect/platform-deno` source as the server adapter and
  runtime entrypoint on Deno.
- Application code must not import `node:http` or call `Deno.serve` directly;
  native serving is owned by the Effect Deno adapter.
- Never use Hono, Express, Fastify, or NestJS for application HTTP.
- Use Effect HttpApi security middleware for bearer, cookie, or API-key
  authentication boundaries.
- Use v4 `Effect.catch`, `Effect.catchCause`, and `Effect.mapError`; never use
  v3 `catchAll` or `catchAllCause` names.

## Frontend Rules

- Build `apps/web/` as a Vite-based SolidJS 2.0 SPA.
- Do not add SolidStart or SSR without an approved architectural decision.
- Use Solid Router by default.
- Keep router-specific types behind frontend routing abstractions.
- Use TanStack Solid Query for remote server state.
- Use Solid's native reactive graph and Solid Context-carried `ManagedRuntime`
  as the default Effect integration; use Effect Atom only as an explicit opt-in
  for shared or portable reactive graphs, and never mirror the same fact across
  both systems. See [`docs/architecture/frontend.md`](./docs/architecture/frontend.md)
  and [ADR-0072](./docs/decisions/0072-prefer-native-solid-reactivity-for-effect-integration.md).
- Do not mirror query results into unrelated signals or global stores.
- Use TanStack Solid Table, Virtual, and Form for their specific concerns.
- Before adding a frontend screen, use the [Product Pattern/workspace matrix](./docs/architecture/design-system.md#6-product-patterns), [shell contract](./docs/architecture/design-system.md#navigation-and-workspace-shell), and [route/state composition rules](./docs/architecture/frontend.md#situation-oriented-operational-ui); reuse the canonical shell and patterns rather than inventing page-specific navigation.
- Keep route loaders thin: parse input, invoke feature logic, and render.
- Validate API and route boundaries with Effect Schema.
- Do not import backend implementation modules, Drizzle tables, or repositories.
- Keep business policy and authorization enforcement in the backend.
- Preserve accessibility, keyboard navigation, and semantic HTML.

## Module Boundaries

A domain module may expose:

- commands and queries;
- Effect service interfaces;
- public tagged errors;
- DTOs through Effect Schema;
- production and test `Layer` values.

Table definitions, repositories, internal helpers, and implementation details
must remain private.

A module must not mutate another module's tables directly. Cross-module work must
use a typed service contract, including when both modules participate in the
same PostgreSQL transaction.

- The financial ledger domain must depend on an engine-independent port. Keep
  PostgreSQL and the TigerBeetle adapter behind foundation/platform boundaries;
  do not import engine-specific account, transfer, or balance types into domain
  modules.

### Default Effect Feature Shape

New business capabilities and HTTP endpoints must follow this default path:

```text
contract.ts -> errors.ts -> service.ts -> store.ts -> postgres.ts/memory.ts -> layers.ts -> handler
```

Rules for new work:

- `contract.ts` owns public Effect Schema DTOs, service keys, and operation contracts.
- `errors.ts` owns public tagged business failures.
- `service.ts` owns named `Effect.fn("Domain.operation")` workflows and orchestration.
- `store.ts` owns private semantic persistence ports; `postgres.ts` owns Drizzle implementation;
  `memory.ts` exists when a deterministic test implementation can preserve the same invariants.
- `layers.ts` owns named production/test composition; `mod.ts` exports only the public contract,
  errors, operations, and layers.
- `runtime/api/api.ts` defines transport schemas and routes; `runtime/api/handlers.ts` stays thin and
  calls public services only.
- Preserve tenant scope, authorization, tagged failures, transactions, idempotency, events, and
  financial/workflow authority. Add database constraints and invariant tests for every new mutable
  fact.
- Do not perform a repository-wide refactor before adding a feature. Apply the shape to the new
  capability and extract an existing package only when its complexity or invariant boundary requires
  it; record any exception in the owning architecture document.

### Identifier Policy

- New persistent entity, stored event, stored line, workflow, and other
  index-visible identities MUST use UUIDv7.
- PostgreSQL-owned IDs use the `uuidv7()` default from `db/schema/common.ts`.
  Application-created persistent IDs use the foundation-owned `uuidv7()` helper;
  domain packages must not import `@std/uuid` directly.
- Do not use `crypto.randomUUID()` for persistent identities, stored event IDs,
  or generated test UUID fixtures. UUIDv4 remains valid for opaque ephemeral
  lease capability tokens; use explicit fixed fixtures when a test must cover
  UUIDv4 behavior.
- Do not confuse a random lease capability with fencing. True stale-writer
  fencing requires a per-fence-scope monotonic `BIGINT` generation enforced at
  the side-effect mutation boundary; it must never decrease or reset while the
  scope exists. A job row stores its current acquisition's generation.
- Keep fencing generation and idempotency identity separate: generation proves
  freshness; operation/command/idempotency keys control replay and duplicates.
- Keep `created_at` as the audit timestamp and business numbers as separate
  fields; UUIDv7 is neither an audit timestamp nor a human-readable number.
- Do not rewrite existing UUIDv4 rows solely to convert their UUID version.

### Failure Ownership and Translation

Keep failure types at the layer that owns and can act on them:

- Domain packages own business-policy errors, authorization errors, and their
  input-validation failures.
- Foundation and platform services own stable capability-level technical failures such as
  `DatabaseFailure`.
- Application composition roots own startup, configuration, deployment, and
  compatibility failures such as `UnsupportedPostgresVersion`.
- A domain may propagate a stable error from a public service contract, but must
  not import PostgreSQL, Drizzle, driver, migration, pool, version-check, or
  other infrastructure-specific error types.
- Map known constraint violations to tagged errors in the owning domain. Map all
  other database implementation failures once at the platform boundary.
- Adding an infrastructure failure must not widen every domain failure union.
  Translate it into the existing stable service failure or handle it at the
  composition root.
- Keep startup probes and lifecycle methods out of domain-facing service
  interfaces. Expose them as platform or application bootstrap operations.
- Preserve underlying causes for internal diagnostics, but never expose raw SQL,
  SQLSTATE, credentials, driver objects, or stack traces through public DTOs or
  API responses.
- Before adding an error to a domain contract, ask whether a domain caller can
  take a meaningful business action for it. If not, it belongs below or above
  the domain boundary.

Example:

```text
UserAccountAlreadyExists | DatabaseFailure | SchemaError       allowed
UserAccountAlreadyExists | UnsupportedPostgresVersion          forbidden
UserAccountAlreadyExists | PostgresError | DrizzleQueryError    forbidden
```

Add a contract or boundary regression test whenever a new error translation is
introduced.

## Architecture Enforcement

- Import other domains only through their public package entry points.
- Never import another domain's table definitions or repositories.
- Keep the package dependency graph acyclic.
- Respect the schema ownership registry.
- Do not bypass a failing boundary check with an undocumented allowlist.
- Add public contract tests for exported module behavior.

## Database Rules

- PostgreSQL 19+ is the minimum supported database version; the `platform/postgres` adapter must
  reject `server_version_num` values below `190000`.
- PostgreSQL is the transactional source of truth for control-plane and non-ledger
  business state; financial transfer, balance, and transfer-history authority follows
  the current financial-ledger architecture.
- Critical invariants require transactions and database constraints.
- The pinned Drizzle Kit snapshot graph is authoritative for migration order and
  schema history; generated SQL remains review-required.
- Use `drizzle-kit generate --custom` for RLS, locking, deferred constraints,
  partitioning, `ltree`, SQL/PGQ, triggers, and unsupported PostgreSQL features.
- Every migration requires owner, review-date, generator headers, and a sibling
  `snapshot.json`.
- Never rewrite an applied migration. Add a new Drizzle migration.

## Analytics Rules

Before implementing analytical facts, metrics, cubes, dashboards, reporting projections, semantic
queries, OLAP providers, historical tables, or analytical exports, read
[`docs/architecture/analytics-architecture.md`](./docs/architecture/analytics-architecture.md),
ADR-0043, and the workload-isolation architecture.

- Source domains own Business Fact Contracts, corrections, and compatibility; analytics owns only
  derived metric and projection semantics.
- Analytics reads run as bounded `query` work; ingestion, rebuild, backfill, and export run as
  bounded `async` work. Do not add a fourth top-level workload class.
- Start with a measured PostgreSQL projection. Do not add ClickHouse, Pinot, Iceberg, DuckDB, a
  warehouse, or another provider before its activation gates pass.
- Every projection declares a complete rebuild source: retained facts/events or an owner-approved
  snapshot plus subsequent replay.
- Metric contracts declare grain, dimensions, join cardinality, aggregation, exact arithmetic, time,
  units/currency, authorization, and freshness.
- Hard-isolated analytic routes must not possess a PostgreSQL-primary credential or hidden fallback.
- Freshness never proves current authorization, read-your-writes, or authoritative state.
- Provider topology, tables, partitions, files, snapshots, and credentials stay out of public
  contracts.
- Financial analytics consume Accounting-approved facts and preserve reconciliation status; they do
  not establish independent balance authority.

## Search Rules

Before implementing exact, full-text, BM25, vector, hybrid, global, or external search, read
[`docs/architecture/search-architecture.md`](./docs/architecture/search-architecture.md) and
ADR-0027.

- Start with exact and structured PostgreSQL queries; add ranked, vector, replica, or external search
  only after measured need.
- Domain-local search may query only owned tables. Cross-domain search consumes public facts or
  committed events into a tenant-scoped, rebuildable projection.
- Search results are candidates, not authorization evidence or current business facts. Sensitive use
  and every command return through the owning public domain contract.
- Embeddings are asynchronous, versioned, rebuildable, and never part of invariant enforcement.
- Do not expose provider types, index names, model credentials, shards, replicas, or topology in
  public contracts.
- Do not require `pg_textsearch`, `pgvector`, `pgvectorscale`, or an external engine until PostgreSQL
  19 compatibility and the documented production gates pass.
- Unsupported extension DDL and indexes use reviewed Drizzle custom migrations; provider-specific raw
  SQL must not enter domain packages.
- Bound search connections, concurrency, top-k, candidates, statement time, and OLTP resource impact.

## Workload Isolation and Non-Interference

Before changing route workload classes, dashboard/report execution, connection pools, overload
control, deployment cells, or shuffle sharding, read
[`docs/architecture/workload-isolation.md`](./docs/architecture/workload-isolation.md) and ADR-0034.

- Keep workload class, criticality, consistency, cost, and admission policy as metadata; do not put
  topology, priority, pool, or cell names into capability IDs.
- A ResourceLease is admission, not authorization, durable acceptance, a database lock, or business
  ownership.
- Use a cheap pre-authorization ingress bound, then acquire the protected execution permit only after
  scoped authorization and before executor slots, database connections, projection connections, or
  expensive work.
- Hard-isolated projection routes must not possess a PostgreSQL-primary credential or silently fall
  back to command resources.
- Preserve a non-zero command reserve that query and async workloads cannot acquire.
- Async-triggered business commands must re-enter command admission, authorization, idempotency,
  owner-controlled services, and transaction boundaries.
- Keep interactive queues and wait deadlines bounded; reject or degrade before backlog amplifies
  retries.
- Use `WorkloadCell` for deployment containment; do not confuse it with a Stateful Entity Runtime
  entity or a `celld` runtime cell.
- Do not claim hard isolation from logical semaphores or separate pools alone. Name the protected
  resources, shared dependencies, excluded failures, and overload proof.

## Stateful Runtime and Asynchronous Rules

- PostgreSQL remains canonical for control-plane and non-ledger business facts;
  runtime-local durability does not transfer business authority. Financial transfer,
  balance, and transfer-history authority follows the current financial-ledger
  architecture.
- Use the optional Stateful Entity Runtime only for an approved aggregate with a
  documented address, state class, version, idempotency, recovery, reconciliation,
  observability, and fallback path.
- Domain packages must not import `celld`, Cloudflare Durable Object, fleet,
  bucket, or ownership-protocol APIs; adapters stay behind RITSEI-owned
  runtime contracts.
- Do not activate `celld` for production until ADR-0026's maturity gates pass and
  a later accepted ADR approves production use.
- Use a direct transaction for synchronous business invariants.
- Use PgQue for committed facts and fan-out.
- Use a job table for leased, scheduled, prioritized single-consumer work.
- Use `pg_durable` only after compatibility and production gates pass.
- Make consumers and workflow steps idempotent.
- Do not dual-write to PostgreSQL and an external broker.

## External Integration Rules

Before implementing external actions, events, connectors, OpenAPI imports,
CloudEvents ingestion, AsyncAPI contracts, OAuth integration, or provider
adapters, read [`docs/architecture/integration-architecture.md`](./docs/architecture/integration-architecture.md)
and ADR-0019.

- Use HTTPS + JSON + OpenAPI for the default external action surface.
- Use CloudEvents over HTTPS for external events and AsyncAPI as the message
  contract/catalog; do not make AsyncAPI a required broker.
- Keep `DomainAction`/`DomainEvent` distinct from `ExternalAction`/`ExternalEvent`.
- Keep protocols, credentials, provider retries, and transport failures inside
  `modules/integrations` or approved connector plugins.
- Do not expose Kafka partitions, gRPC stubs, SOAP envelopes, raw OAuth tokens,
  or provider storage identifiers to Process Studio or domain packages.
- Use OAuth 2.0 with RFC 9700 security practices and RFC 9457 Problem Details;
  do not silently turn OAuth scopes into domain capabilities.
- External side effects require idempotency, timeout/retry policy, provider
  status, and explicit compensation or manual recovery.

## Process Studio Rules

Before implementing process catalogs, Process IR, workflow definitions,
compensation, static validation, designer, monitor, or inbox behavior, read
[`docs/architecture/process-studio.md`](./docs/architecture/process-studio.md),
[`docs/roadmap/README.md`](./docs/roadmap/README.md), and ADR-0018.

- Build Typed Action and Event Catalogs before the visual designer.
- Invoke only authorized public domain contracts; never expose arbitrary SQL,
  scripts, private repositories, or cross-domain table writes.
- Treat compensation as a new idempotent business command, not as deletion or a
  later rollback of committed facts.
- Keep decisions pure and Process IR small, typed, deterministic, and versioned.
- Keep BPMN and DMN at interoperability boundaries unless a later ADR expands
  their role.
- Capability release states distinguish private, experimental, public,
  deprecated, and retired contracts.
- Released definitions are immutable; deployment is separate from release, and
  running instances remain pinned to exact definition and catalog versions.
- A ProcessPrincipal never bypasses domain authorization; preserve initiator,
  actor, delegation, scope, SoD, correlation, and causation context.
- Persist retry, unknown-outcome, compensation, manual-recovery, and business
  observability state.
- Do not activate `pg_durable` before the existing compatibility and production
  gates pass.

## Fallow Static Analysis

Fallow is the generic repository-wide graph and entropy check. It complements, rather than
replaces, RITSEI-specific ownership, financial, authorization, Effect, migration, and workload
checks.

- Use `deno task fallow` for a full dead-code, duplication, and health scan.
- Use `deno task fallow:dead-code`, `deno task fallow:dupes`, `deno task fallow:health`, and
  `deno task fallow:boundaries` for focused analysis.
- Use `deno task fallow:audit` as the baseline-backed changed-set gate before commit; it intentionally
  uses Fallow's `all` gate, and its committed baselines are a temporary migration ledger, not permission
  to add more debt.
- Agents should request `--format json --quiet` when parsing Fallow output and run
  `deno task fallow:fix:dry-run` before considering any automatic cleanup.
- Never apply Fallow fixes blindly to Accounting, the financial ledger, Process Runtime,
  authorization, migrations, or other invariant-sensitive code. Trace and review the finding first.
- Keep exceptions narrow and reasoned. Do not weaken boundaries, thresholds, entry points, or
  baselines just to make a run green.
- `vendor/`, migration artifacts, generated declarations, and `.auto/` remain outside Fallow's
  application analysis; do not add them as entries or zones.

## Authorization and Security

- Deny by default.
- Keep authentication separate from authorization.
- Model permissions as business capabilities, not only CRUD.
- Make scopes explicit and tenant-aware.
- Use PostgreSQL RLS as defense in depth, not as the only policy engine.
- Never commit secrets or log credentials and sensitive data.
- Never accept arbitrary tenant SQL or arbitrary policy scripts.

## Web Research

For discovering information on the public web, ALWAYS prefer the
provider-native web search capability when available.

Do NOT use `ax`, `curl`, `wget`, or shell commands to query search engines
such as Google, Bing, Brave Search, or DuckDuckGo.

Use `ax` only after an exact URL is already known.

Preferred workflow:

1. Use native web search to discover relevant sources.
2. Prefer primary and authoritative sources.
3. Once an exact URL is known, use `ax <url>` when the full page needs inspection.
4. Use local read/edit/bash tools only for repository work.

Examples:

Incorrect:

    ax 'https://search.brave.com/search?q=...'
    ax 'https://www.google.com/search?q=...'
    ax 'https://www.bing.com/search?q=...'

Correct:

    native web search
    → discover https://docs.example.com/foo
    → ax https://docs.example.com/foo

## Documentation Rules

Update documentation when changing:

- public contracts;
- module boundaries;
- data ownership;
- transaction or consistency models;
- asynchronous semantics;
- authorization;
- deployment or configuration;
- extension boundaries.

Create a new ADR for significant decisions. Do not rewrite the history of an
accepted ADR.

## Testing Rules

All TypeScript tests MUST use `@effect/vitest`:

- Import `assert`, `describe`, `it`, and other test APIs only from
  `@effect/vitest`. Do not import test APIs directly from `vitest`.
- Do not use `Deno.test` in TypeScript test files. Structural `ast-grep` YAML
  rule tests remain on the `ast-grep` runner.
- Use `it.effect` for tests returning an Effect, including scoped resources;
  use `it.live` only when live test services are intentional, and regular `it`
  only for pure synchronous tests.
- Do not call `Effect.runPromise` or `Effect.runSync` inside tests. Return the
  Effect to `@effect/vitest` instead.
- Use `assert` from `@effect/vitest`; do not use `expect` or manual
  `throw new Error` assertions when an `assert` method expresses the check.
- Capture typed failures with Effect operators such as `Effect.flip` or
  `Effect.result`; do not use `try` / `catch` around Effect execution.
- Acquire external resources with scoped Effect constructors and release them
  through finalizers. Never rely on test-process exit for cleanup.
- Keep `@effect/vitest` on the exact same v4 release as `effect`, and declare
  both it and `vitest` in the root `package.json`.
- Run worktree-local tests through `deno task check:affected`; reserve `deno task
  test` for the full suite and CI. Do not introduce a second test command path.
- Test discovery MUST be allowlisted to `apps/**`, `foundation/**`, `modules/**`, `platform/**`, `runtime/**`, and `tests/**`.
  Exclude `vendor/**` and `**/node_modules/**` from tests, coverage, watch mode,
  formatting, linting, type checking, and boundary scans. Vendored subtrees are
  reference material and keep their own upstream validation workflows.

Add a boundary rule or repository scan when needed to prevent regression to
`Deno.test`, direct `vitest` imports, or Effect runtime runners in tests.

## Validation

```sh
deno fmt --check apps packages tooling tests db deno.json sgconfig.yml vitest.config.ts
deno lint apps packages tooling tests vitest.config.ts
deno task check
deno task check:affected
deno task boundary:test
deno task boundary:lint
deno task fallow:audit
```

There is no build command yet because the application executables and frontend
build are still being scaffolded. Report this as unverified until build targets
exist.

## Completion Report

Summarize:

1. what changed;
2. why it changed;
3. validation performed;
4. documentation or ADR changes;
5. remaining risks and assumptions.
