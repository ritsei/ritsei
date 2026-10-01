# RITSEI Architecture Specification v4

> **Status:** Canonical and active
>
> **Supersedes:** Earlier backend-runtime decisions.
>
> **Related documents**
>
> - Summary: [`./overview.md`](./overview.md)
> - PostgreSQL architecture: [`./postgresql-19-architecture.md`](./postgresql-19-architecture.md)
> - Logical database and physical placement:
>   [`../decisions/0067-separate-logical-database-and-physical-data-placement.md`](../decisions/0067-separate-logical-database-and-physical-data-placement.md)
> - Workload isolation: [`./workload-isolation.md`](./workload-isolation.md)
> - Analytics architecture: [`./analytics-architecture.md`](./analytics-architecture.md)
> - Search architecture: [`./search-architecture.md`](./search-architecture.md)
> - Stateful runtime: [`./runtime-architecture.md`](./runtime-architecture.md)
> - State and consistency: [`./state-and-consistency.md`](./state-and-consistency.md)
> - Financial ledger: [`./financial-ledger.md`](./financial-ledger.md)
> - Authorization: [`./authorization.md`](./authorization.md)
> - Identity and principals: [`./identity-and-principals.md`](./identity-and-principals.md)
> - HTTP API boundary: [`./api.md`](./api.md)
> - IdentityProvider boundary:
>   [`../decisions/0058-define-provider-neutral-identity-and-authentication-boundary.md`](../decisions/0058-define-provider-neutral-identity-and-authentication-boundary.md)
> - RelationshipEngine boundary:
>   [`../decisions/0059-define-replaceable-relationship-authorization-engine.md`](../decisions/0059-define-replaceable-relationship-authorization-engine.md)
> - Messaging: [`./pgque-messaging.md`](./pgque-messaging.md)
> - Durable execution: [`./durable-execution.md`](./durable-execution.md)
> - Document rendering: [`./document-rendering.md`](./document-rendering.md)
> - Communication platform: [`./communication.md`](./communication.md)
> - Process Studio: [`./process-studio.md`](./process-studio.md)
> - External integration surface: [`./integration-architecture.md`](./integration-architecture.md)
> - Integration profile ADR:
>   [`../decisions/0019-adopt-integration-surface-profile.md`](../decisions/0019-adopt-integration-surface-profile.md)
> - Plugin architecture: [`./plugin-architecture.md`](./plugin-architecture.md)
> - Capability-oriented plugin contribution:
>   [`../decisions/0023-adopt-capability-oriented-plugin-contribution.md`](../decisions/0023-adopt-capability-oriented-plugin-contribution.md)
> - Frontend architecture: [`./frontend.md`](./frontend.md)
> - Design system architecture: [`./design-system.md`](./design-system.md)
> - Frontend SPA decision:
>   [`../decisions/0010-use-vite-solidjs-spa.md`](../decisions/0010-use-vite-solidjs-spa.md)
> - Effect application architecture:
>   [`../decisions/0048-define-effect-application-architecture-and-frontend-state-ownership.md`](../decisions/0048-define-effect-application-architecture-and-frontend-state-ownership.md)
> - Native Solid 2 and Effect integration:
>   [`../decisions/0072-prefer-native-solid-reactivity-for-effect-integration.md`](../decisions/0072-prefer-native-solid-reactivity-for-effect-integration.md)
> - Solid compiler boundary:
>   [`../decisions/0049-keep-solid-compiler-at-rendering-boundary.md`](../decisions/0049-keep-solid-compiler-at-rendering-boundary.md)
> - Architecture enforcement: [`./architecture-enforcement.md`](./architecture-enforcement.md)
> - Testing strategy: [`../development/testing.md`](../development/testing.md)
> - Database roles: [`../operations/database-roles.md`](../operations/database-roles.md)
> - External-standard adapters:
>   [`../decisions/0013-version-external-standard-adapters.md`](../decisions/0013-version-external-standard-adapters.md)
> - Internal and external identity:
>   [`../decisions/0014-separate-internal-and-external-identifiers.md`](../decisions/0014-separate-internal-and-external-identifiers.md)
> - Semantic invariant ownership:
>   [`../decisions/0015-one-semantic-owner-per-invariant.md`](../decisions/0015-one-semantic-owner-per-invariant.md)
> - Owner-local business surface and generated ergonomics:
>   [`../decisions/0046-adopt-owner-local-business-surface-and-generated-ergonomics.md`](../decisions/0046-adopt-owner-local-business-surface-and-generated-ergonomics.md)
> - P0 scope and identity model:
>   [`../decisions/0021-define-p0-scope-and-identity-model.md`](../decisions/0021-define-p0-scope-and-identity-model.md)
> - Effect v4 beta.103 update:
>   [`../decisions/0022-update-effect-v4-to-beta-103.md`](../decisions/0022-update-effect-v4-to-beta-103.md)
> - Deno package dependency resolution (historical):
>   [`../decisions/0050-use-package-json-for-deno-dependency-resolution.md`](../decisions/0050-use-package-json-for-deno-dependency-resolution.md)
> - Dependency ownership by application boundary:
>   [`../decisions/0075-partition-dependency-ownership-by-application-boundary.md`](../decisions/0075-partition-dependency-ownership-by-application-boundary.md)
> - UUIDv7 persistent identities:
>   [`../decisions/0051-adopt-uuidv7-for-persistent-identities.md`](../decisions/0051-adopt-uuidv7-for-persistent-identities.md)
> - Jurisdiction localization:
>   [`../decisions/0016-isolate-jurisdiction-localization.md`](../decisions/0016-isolate-jurisdiction-localization.md)
> - Native Deno Effect adapter:
>   [`../decisions/0017-use-effect-platform-deno.md`](../decisions/0017-use-effect-platform-deno.md)
> - Typed Process Studio:
>   [`../decisions/0018-adopt-typed-process-studio.md`](../decisions/0018-adopt-typed-process-studio.md)
> - ADR index: [`../decisions/README.md`](../decisions/README.md)
> - Order lifecycle and PgQue activation gate:
>   [`../decisions/0033-extend-order-lifecycle-and-gate-pgque.md`](../decisions/0033-extend-order-lifecycle-and-gate-pgque.md)
> - Internal event delivery ownership:
>   [`../decisions/0038-move-internal-event-delivery-to-messaging.md`](../decisions/0038-move-internal-event-delivery-to-messaging.md)
> - Non-interference overload isolation:
>   [`../decisions/0034-adopt-non-interference-overload-isolation.md`](../decisions/0034-adopt-non-interference-overload-isolation.md)
> - Source-of-truth and derived-capability non-interference:
>   [`../decisions/0083-enforce-non-interference-between-source-of-truth-and-derived-capabilities.md`](../decisions/0083-enforce-non-interference-between-source-of-truth-and-derived-capabilities.md)
> - Rebuildable Analytic Plane:
>   [`../decisions/0043-adopt-rebuildable-analytic-plane.md`](../decisions/0043-adopt-rebuildable-analytic-plane.md)
> - Governed AI recommendation and agent boundary:
>   [`../decisions/0063-define-governed-ai-recommendation-and-agent-boundary.md`](../decisions/0063-define-governed-ai-recommendation-and-agent-boundary.md)
> - Proposed explicit progressive trust boundaries:
>   [`../decisions/0084-establish-explicit-progressive-trust-boundaries.md`](../decisions/0084-establish-explicit-progressive-trust-boundaries.md)

## Decision

RITSEI remains a modular monolith. This specification defines the application runtime and
cross-cutting boundaries; financial ledger authority is governed by the dedicated subsystem
architecture and ADR-0040 without weakening domain ownership, audit, or transactional-integrity
principles.

| Area               | Decision                                                              |
| ------------------ | --------------------------------------------------------------------- |
| Language           | TypeScript strict                                                     |
| Application model  | Effect                                                                |
| Runtime            | Deno                                                                  |
| Identity / IAM     | Provider-neutral OIDC/OAuth2 `IdentityProvider`; ZITADEL recommended |
| Application AuthZ  | RITSEI Authorization module with canonical PostgreSQL policy facts |
| Relationship AuthZ | Native PostgreSQL `RelationshipEngine`; optional SpiceDB adapter     |
| HTTP               | Effect v4 `HttpApi` / `HttpRouter` with native `@effect/platform-deno` |
| Database           | PostgreSQL 19+ logical transactional platform for non-ledger state    |
| Persistent IDs     | UUIDv7 for new entity, event, and index-visible identities            |
| Financial execution | TigerBeetle through the FinancialLedgerPort, activation-gated        |
| Query layer        | Drizzle ORM with `postgres.js`                                        |
| Migrations         | Pinned Drizzle Kit graph with reviewed SQL                            |
| Stateful ownership | Optional vendor-neutral Stateful Entity Runtime                       |
| Overload isolation | Workload planes, bounded admission, and reserved command capacity      |
| Source/derived isolation | Class A source-of-truth paths do not depend on Class B/C derived capabilities |
| Analytic plane     | Domain-owned facts, versioned metrics, and rebuildable projections     |
| Native compute     | Optional Zig through `Deno.dlopen`                                    |
| Frontend           | Vite-based SolidJS 2.0 SPA with a separate backend                    |
| Contracts          | Effect Schema                                                         |

Effect owns typed failures, lifecycle, concurrency, retry, telemetry, and dependency injection.
Drizzle owns typed schema and query construction. PostgreSQL owns control-plane constraints and
transactions. RITSEI Authorization owns general membership, roles, capabilities, grants, scopes,
relationship coordination, SoD, and final authorization evidence. Owning domains retain business
policy, current-state validation, and command semantics; the financial ledger engine enforces the
accepted transfer-level constraints through the FinancialLedgerPort.

Deno remains the runtime and primary toolchain. npm ecosystem dependencies are declared by the
workspace boundary that owns their consumption: the root `package.json` owns repository-wide packages
and tooling, while `apps/web/package.json` owns dependencies used exclusively by the web application.
Each owner keeps its exact dependency versions; Deno uses `preferPackageJson: true` and
`nodeModulesDir: "auto"` so package exports and peers resolve through the conventional local
`node_modules` topology. The Effect and Deno adapter packages are aligned on `4.0.0`; vendored
Effect source and the Drizzle subtree remain reference-only.

### Dependency Ownership

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

The root `package.json` owns repository-wide npm, JSR, and development dependencies. The
`apps/web/package.json` manifest owns dependencies exclusively consumed by the web application, with
exact versions kept next to the application boundary. `deno.lock` records the single resolved
dependency graph, while `node_modules` provides the conventional local package topology required by
npm ecosystem dependencies.

`deno.json` owns Deno runtime and toolchain behavior: workspace membership, compiler behavior, runtime
permissions, tasks, formatting, and linting. Internal `modules/*` directories remain modular-monolith
boundaries, not workspace package boundaries by default.

## Repository Shape

```text
ritsei/
├── foundation/              # generic primitives and contracts
│   ├── communication/
│   ├── concurrency/
│   ├── database/
│   ├── ids/
│   ├── jobs/
│   └── money/
├── modules/                 # business capabilities with public mod.ts entries
│   ├── identity/  ├── party/       ├── auth/
│   ├── authorization/  ├── catalog/  ├── messaging/  ├── communication/
│   ├── sales/  ├── procurement/  ├── inventory/
│   ├── accounting/  ├── process/  ├── billing/
│   └── integrations/
├── platform/                # concrete PostgreSQL, crypto, and ledger adapters
│   ├── postgres/
│   ├── crypto/
│   └── tigerbeetle/
├── runtime/                 # API, worker, migrator, configuration, composition
│   ├── api/
│   ├── worker/
│   ├── migrator/
│   └── adapters/
├── apps/
│   ├── event-relay/
│   └── web/                 # Vite + SolidJS 2.0 SPA
├── native/ritsei-calc/
├── db/                      # schema, migrations, policies, and seeds
├── deno.json
├── package.json
└── drizzle.config.ts
```

The dependency direction is `foundation <- modules <- runtime` and
`foundation <- platform <- runtime`; platform adapters may consume module public contracts.
Business modules must not import concrete platform code, and internal module calls must not use
loopback HTTP. The full decision and dependency matrix are in
[ADR-0068](../decisions/0068-establish-foundation-modules-platform-runtime-taxonomy.md).

## Module Contract

A module may publicly expose:

- command and query functions;
- Effect service interfaces;
- tagged domain errors;
- Effect Schema DTOs;
- production and test layers.

Table definitions and repository implementations remain internal.

Effect-backed packages use the smallest boundary shape justified by their persistence and test
semantics:

```text
contract.ts  -> public Schema DTOs, service interfaces, and service keys
errors.ts    -> public tagged failures
service.ts   -> domain/application orchestration and compatibility exports
store.ts     -> private semantic persistence port
postgres.ts  -> PostgreSQL/Drizzle implementation
memory.ts    -> deterministic test implementation when safe
layers.ts    -> named live/test composition
```

`mod.ts` normally exports contracts, errors, service operations, and layers; it does not export
private stores or persistence adapters. Business modules expose these entries from `modules/*/mod.ts`.
Foundation contracts, platform adapters, and runtime composition roots have their own public entry
points. The transitional PostgreSQL financial-ledger factory re-export from Accounting is an explicit
exception documented in [`financial-ledger.md`](./financial-ledger.md); callers must still use
`FinancialLedgerPort` rather than provider-specific types. Invariant-heavy financial and durable-
workflow implementations may keep their specialized ports and adapters separate rather than forcing
them into a generic repository shape.

Production composition is named in `runtime/layers.ts` (`PlatformCore`, `PlatformLive`, domain `*Live`
layers, and `ApplicationLive`). HTTP handler groups resolve static services once during group
construction; request-scoped `CurrentPrincipal` remains inside each request operation. Public
Effect operations use stable `Effect.fn("Domain.operation")` names for readable execution traces.

Dependencies must be visible in the Effect environment type. Business errors must remain tagged and
exhaustively handled.

Every business invariant has one owning domain capability. The owner defines its authoritative
command path, validation, mutation rules, public contract, domain errors, and persistence
constraints. Other domains may consume the contract and maintain derived projections, but must not
become competing mutation authorities or independently redefine the invariant.

Class A source-of-truth reads and writes must not synchronously depend on unrelated Class B operational
or Class C projection capabilities. Owner commits publish facts through the transactional outbox;
derived consumers own their retry, failure, resource, persistence, and rebuild lifecycle. A synchronous
cross-capability dependency is allowed only when an explicit business invariant documents it and names
its semantic owner. Detailed workload and resource proof remains in
[`workload-isolation.md`](./workload-isolation.md) and ADR-0083.

Extension mechanisms, plugins, workflow runtimes, and nondeterministic agents are fallible. ERP
invariants remain enforced by the owning domain, authorization boundary, transactional command path,
and database constraints; they must not depend on extensions behaving correctly. Detailed rationale
is owned by [ADR-0015](../decisions/0015-one-semantic-owner-per-invariant.md).

## Business Surface and Invariant Layer

RITSEI presents concrete owner-local business objects at the business surface while keeping
invariant-bearing semantics below that surface. A familiar object such as `SalesOrder` or
`PurchaseOrder` is first-class when it has an owner, identity, lifecycle, public contract,
authorization, invariant, and correction behavior. It does not require a universal base class,
shared mutable `documents` table, or package created only because the name is familiar.

The supported mutation distinction is:

```text
ordinary structural change -> owner-reviewed query/CRUD-like helper
business meaning          -> explicit typed, authorized action
consequence               -> owner-controlled immutable or corrective fact
```

Examples include `Product.updateDescription`, `SalesOrder.confirm`, and a future owner-controlled
`Invoice.post`. Lifecycle fields must not be changed through ordinary updates. Cross-domain
consequences must use public owner contracts and the approved transaction or financial-ledger
protocol; ORM hooks and hidden subscribers are not business authority.

Generated tooling may scaffold schemas, DTOs, ordinary queries, form metadata, CRUD helpers, API
documentation inputs, and test skeletons. It must not silently generate authorization policy,
business transitions, cross-domain transactions, inventory or financial consequences, fact/event
authority, or provider ownership.

`Record`, `Document`, `Action`, and `Fact` may describe this surface and lifecycle, but they are not
universal runtime base types, shared repositories, or authority tables. `Movement`, `Posting`, and
`Settlement` remain semantic capabilities with explicit owners: Inventory owns physical movement,
Accounting owns posting meaning and uses `FinancialLedgerPort`, and Settlement remains gated until
its obligation and payment contracts are decided. `Commitment` and `Fulfillment` remain useful
concepts; an owner promotes a relationship to an explicit entity when its quantity, rules, history,
or lifecycle require it.

Detailed rationale is owned by
[ADR-0046](../decisions/0046-adopt-owner-local-business-surface-and-generated-ergonomics.md).

## Database Contract

The application targets a logical PostgreSQL database contract. The current deployment uses one
PostgreSQL placement; future replicas, regions, or shards are private, evidence-gated infrastructure
strategies rather than ordinary deployment freedoms.
Domain packages and public contracts must not select or expose physical servers, placements,
shards, replicas, pools, or routers. Data placement never changes semantic ownership.

A logical endpoint does not guarantee one physical connection or portable session state. Existing
invariant-sensitive cross-domain transactions remain on one transactionally compatible placement;
splitting them requires an explicit consistency, recovery, and reconciliation decision. Current
placement rules are owned by
[`postgresql-19-architecture.md`](./postgresql-19-architecture.md); ADR-0067 records the rationale
and decision history.

Drizzle is used for typed tables, indexes, queries, parameter binding, and transactions. It must not
conceal PostgreSQL-specific behavior such as:

- RLS;
- isolation levels;
- advisory and row locks;
- deferred constraints;
- partitioning;
- `ltree`;
- SQL/PGQ;
- custom operators.

Reviewed SQL is the escape hatch and remains a first-class artifact.

The `platform/postgres` adapter owns the `postgres.js` client, Drizzle database lifecycle, typed
transaction callbacks, and stable infrastructure failure mapping behind the foundation database
contracts. Domain implementations build type-safe queries only against their owned tables. Public
domain contracts do not expose Drizzle or PostgreSQL types.

PostgreSQL remains canonical for RITSEI authorization facts and control-plane state. An external
relationship evaluator is a replaceable projection/evaluation dependency and must not become a second
membership, grant, policy, tenant, or business-fact authority.

The authoritative migration graph is generated by pinned Drizzle Kit `1.0.0-rc.4` from
`db/schema/index.ts`. Every migration has `migration.sql` and `snapshot.json`; unsupported
PostgreSQL features use Drizzle custom migrations. All SQL remains reviewed before application.
The runtime dependency is currently pinned separately to `drizzle-orm` `1.0.0-rc.5-169397b`;
this compatibility split does not change the required `drizzle-kit` migration version and must be
revalidated before either dependency is upgraded or downgraded. Detailed rationale and HTTP rules are owned by
[ADR-0012](../decisions/0012-use-drizzle-schema-flow-and-effect-http.md).

Financial ledger authority and execution are governed by
[ADR-0040](../decisions/0040-adopt-tigerbeetle-financial-ledger.md) and the canonical
[`financial-ledger.md`](./financial-ledger.md) subsystem architecture. TigerBeetle is the required
financial execution engine for the activated profile; PostgreSQL remains authoritative for
control-plane metadata, policy, workflow state, audit links, and projections.

## Identifier Contract

New persistent entity, stored event, stored line, workflow, and other index-visible identities use
UUIDv7. PostgreSQL-owned IDs use the existing `uuidv7()` default in `db/schema/common.ts`; application
code that must create a persistent identity before insertion uses the foundation-owned `uuidv7()` helper,
implemented through the pinned `@std/uuid` package. Existing UUIDv4 rows remain valid and are not migrated
solely for version conversion. UUIDv4 remains acceptable for ephemeral opaque values such as lease
tokens and test fixtures. UUIDv7 is not a replacement for `created_at`, business numbers, or secrets.
The complete decision and evidence are owned by
[ADR-0051](../decisions/0051-adopt-uuidv7-for-persistent-identities.md).

## Search Contract

Search starts with exact and structured PostgreSQL queries. Ranked lexical, vector, hybrid, replica,
or external search is introduced only after measured need and compatibility evidence.

An owning domain may search its own data through a typed query. Cross-domain search consumes public
facts or committed events into a tenant-scoped, rebuildable projection; it must not import private
tables or repositories. Search results are candidate references, not authorization evidence or
current business facts. Sensitive use and every business action return through the owning public
domain contract.

Embeddings and external search projections are asynchronous and rebuildable. They cannot participate
in invariant enforcement or make domain writes depend on a model or search provider. Provider types,
index names, shards, replicas, and topology remain private implementation details. PostgreSQL search
extensions require PostgreSQL 19 compatibility and the production gates defined by
[`search-architecture.md`](./search-architecture.md) and
[ADR-0027](../decisions/0027-adopt-postgresql-first-replaceable-search.md).

## Identity and Authorization Contract

RITSEI consumes a provider-neutral OIDC/OAuth2 `IdentityProvider` boundary for human and machine
authentication. ZITADEL is the recommended adapter, not a required dependency. The RITSEI
authentication boundary validates the selected provider assertion and constructs an explicit
principal; RITSEI identity owns internal `UserAccount` and issuer-plus-subject mapping. Provider
organizations, groups, roles, and claims do not grant ERP authority.

RITSEI Authorization is the application decision boundary. PostgreSQL/RITSEI remains canonical for
tenant membership, roles, capabilities, grants, scopes, SoD, and policy facts. The precomputed
permission matrix is the coarse gate. A provider-neutral `RelationshipEngine` evaluates object
relationships; native PostgreSQL is the default implementation and SpiceDB is an optional high-scale
adapter. Neither relationship implementation owns tenant isolation, business invariants, domain
policy, or final authority by itself.

Every protected operation follows:

```text
Identity -> Capability -> Scope -> Object Relationship -> Domain Policy -> SoD -> Audit
```

Missing tenant context, stale revocation, unavailable relationship evaluation, or an unknown decision
fails closed. Detailed rules are owned by [`authorization.md`](./authorization.md),
[`identity-and-principals.md`](./identity-and-principals.md), and [`api.md`](./api.md).

## Scope and User Account Contract

The P0 scope model keeps tenant isolation, legal identity, operational structure,
and financial configuration distinct:

```text
Tenant
└── Legal Entity
    ├── Branch (optional)
    └── Warehouse (inventory-owned; primary Branch association optional)
```

- `auth` owns Tenant and its default timezone; one UserAccount may access multiple
  tenants through separate scoped capabilities.
- `identity` owns the UserAccount contract; `party` owns Organization, one-to-one
  Legal Entity identity in P0, optional Branches, PartyRole, and scoped
  PartyRelationship records.
- `inventory` owns Warehouses and stock; a Warehouse is scoped to a Legal Entity.
- `accounting` owns Legal Entity base currency, precision, fiscal period, and
  posting configuration.
- Party relationships and role classifications do not grant authorization by
  themselves; owning domains enforce capabilities at runtime.

The first implementation uses owner-local commands rather than a universal
cross-domain provisioning command. Public user-account and PartyRepresentation
vocabulary is defined by [ADR-0029](../decisions/0029-rename-user-and-party-public-vocabulary.md).
Detailed rationale and deferred group, validity, delegation, and cross-domain
configuration decisions are owned by
[ADR-0021](../decisions/0021-define-p0-scope-and-identity-model.md).

## Transaction Contract

A transaction context is explicit. Cross-domain operations that require atomic consistency
participate in the same PostgreSQL transaction through typed services when they use the PostgreSQL
profile. TigerBeetle-backed financial operations use the durable financial-ledger protocol and do
not claim cross-store ACID.

No module may mutate another module's tables directly. Sharing a transaction does not transfer
semantic ownership; every invariant-sensitive mutation still passes through the owning domain's
public typed service. Financial execution goes through `FinancialLedgerPort`, never a provider SDK.

## Workload Isolation Contract

Public operations declare workload behavior separately from capability identity. Business verbs
continue to describe owner-controlled effects; workload class, criticality, consistency, estimated
cost, deadline, and admission remain metadata.

The initial planes are command, query, and async. Query work may use a bounded authoritative path or
a projection-safe path; only the projection-safe path qualifies for the no-primary-credential
guarantee. Canonical commands retain a reviewed non-zero resource reserve. Projection-safe
dashboard, search, and reporting routes in a hard-isolated deployment must not obtain command
executor slots, command database connections, or a PostgreSQL-primary credential, and they must not
silently fall back to the primary when their projection path is unavailable.

A business command remains command-plane work when initiated by a job, event consumer, or workflow.
Async orchestration must re-enter command admission, authorization, idempotency, owner-controlled
services, and transaction boundaries.

Scarce work acquires bounded admission before executor or database resources. Adaptive concurrency
may lower a tested hard ceiling but never exceed it. Interactive queues and wait deadlines remain
finite; overload rejects or degrades before backlog amplifies retries.

`WorkloadCell` is the topology-private deployment containment term. It is distinct from a domain,
Tenant, Stateful Entity Runtime entity, and `celld` runtime cell. WorkloadCell placement and optional
recursive shuffle sharding must not appear in public DTOs, capability IDs, events, entity addresses,
or Process IR.

A colocated deployment preserves logical boundaries but cannot claim physical non-interference
without executable proof of disjoint resources. Detailed routing, resource, projection, overload,
and validation rules are owned by [`workload-isolation.md`](./workload-isolation.md).

## Analytic Plane Contract

The Analytic Plane is a logical subsystem over the existing workload classes. Bounded semantic and
projection reads execute as `query`; ingestion, rebuild, backfill, compaction, report materialization,
and export execute as `async`. It is not a fourth top-level workload class.

Source domains own versioned Business Fact Contracts, correction semantics, and compatibility. The
Analytic Plane owns derived metric definitions, dimensional query semantics, projection lifecycle,
lineage, freshness evaluation, and provider-independent planning. Neither a metric nor a projection
becomes business, authorization, stock, balance, journal, or financial authority.

Every analytic projection declares a complete rebuild source: retained committed facts/events or an
owner-approved snapshot/export plus subsequent replay. Metric contracts declare grain, source fact
versions, valid dimensions and joins, aggregation behavior, exact arithmetic, time and unit semantics,
authorization, freshness, and a provider-independent output schema.

Projection-safe analytic routes in a hard-isolated deployment have no PostgreSQL-primary credential,
command service binding, or hidden primary fallback. If no projection satisfies the requested
semantic version, completeness, authorization, consistency, and maximum staleness, the route serves
only its declared stale/degraded response or typed unavailability.

PostgreSQL reporting projections are the baseline. External OLAP providers, open table formats, and
embedded analytical engines require measured need, cross-engine conformance, rebuild, security,
non-interference, operations, and provider-exit evidence. Detailed rules are owned by
[`analytics-architecture.md`](./analytics-architecture.md) and ADR-0043.

## Stateful Entity Runtime Contract

RITSEI may route selected, approved aggregate categories through a
vendor-neutral Stateful Entity Runtime for explicit active ownership,
identity-local serialization, hot state, or object-local coordination.
Stateless Effect services and direct PostgreSQL transactions remain the default.

The runtime does not replace PostgreSQL, PgQue, the job table, the durable
workflow engine, domain authorization, or public contracts. PostgreSQL remains
canonical for control-plane and non-ledger business facts; the activated financial
profile uses TigerBeetle for accepted transfers, balances, and transfer history.
Runtime state is classified and reconciled under [`state-and-consistency.md`](./state-and-consistency.md)
and [`financial-ledger.md`](./financial-ledger.md).

Domain packages must not depend directly on `celld`, Cloudflare Durable Objects,
or another adapter. Runtime selection and topology remain infrastructure and
composition-root concerns. Detailed routing, lifecycle, recovery, observability,
and aggregate-selection rules are owned by
[`runtime-architecture.md`](./runtime-architecture.md).

## Composite Process Contract

Composite business processes such as Order-to-Cash and Procure-to-Pay coordinate public typed
services from their participating domain capabilities.

A process coordinator may sequence operations, carry the explicit transaction context for
synchronous atomic work, and define durable steps or compensation for asynchronous work. It must not
directly mutate participating domains' tables, duplicate their authoritative facts, redefine their
invariants, or become a super-domain that absorbs their ownership.

Process-specific state is permitted only when it represents coordination state that no participating
domain owns, such as durable progress, retry, or compensation status.

## Process Studio Contract

RITSEI's planned Process Studio composes versioned, typed domain actions and events through a
small deterministic Process IR. It does not expose arbitrary SQL, scripts, private repositories, or
cross-domain table mutation. Actions execute through authorized public domain contracts; decisions
are pure; released definitions are immutable, deployments are explicit, and running instances remain
version-pinned.

Capability stability, execution principals, delegation, SoD, business observability, retry,
unknown-outcome handling, and environment promotion are governed by
[`../decisions/0020-adopt-capability-release-and-runtime-governance.md`](../decisions/0020-adopt-capability-release-and-runtime-governance.md).

Committed effects are not treated as if a later SQL rollback could erase them. Domains may publish
explicit compensating commands, and process definitions select compensation or manual-recovery
policy. Static validation checks catalog versions, schemas, mappings, capabilities, tenant scope,
transition ordering, idempotency, waits, parallel effects, and compensation before release.

The detailed target architecture is owned by [`./process-studio.md`](./process-studio.md); staged
delivery gates are owned by [`../roadmap/process-studio.md`](../roadmap/process-studio.md).

## AI and Recommendation Boundary

AI is an untrusted advisory boundary over federated domain semantics. It may interpret intent,
summarize authorized observations, or propose typed Process IR and domain actions, but it cannot
become a semantic owner, authorization authority, approval authority, or source of business facts.
Only an authorized owner command, optionally coordinated by a released deterministic process, may
mutate business state. There is no `AgentPrincipal`; model output never grants capability, scope,
delegation, or Separation-of-Duties approval.

Provider and model adapters remain behind the integrations boundary. AI context is tenant-scoped,
minimized, and sourced through public contracts or approved analytic observations. Released Process
IR contains typed catalog references and deterministic inputs, not prompts, provider topology, live
model calls, arbitrary tools, or dynamic actions. Autonomous actuation remains outside the 1.0 core
and requires a later accepted ADR with bounded safety evidence. Detailed AI recommendation,
authorization, Process Studio, analytics, and enforcement rules are owned by their respective
subsystem documents and ADR-0063.

## Asynchronous Contract

Effect fibers are not durable. Use:

```text
PostgreSQL transaction
-> PostgreSQL-owned synchronous invariant

Financial ledger protocol
-> PostgreSQL intent -> durable submission -> TigerBeetle outcome -> PostgreSQL receipt/projection -> reconciliation

PgQue
-> committed event and fan-out

Job table
-> scheduled or leased single-consumer work

pg_durable
-> checkpointed workflow after production approval
```

The financial-ledger protocol is not a cross-store ACID transaction and must not be replaced with a
held PostgreSQL transaction or an unkeyed retry. See [`financial-ledger.md`](./financial-ledger.md).

## HTTP Contract

HTTP routing is Effect-native. `HttpApi` owns endpoint schemas, errors, and OpenAPI metadata;
`HttpApiBuilder` and `HttpRouter` own server routing. The canonical `@effect/platform-deno` adapter
owns native `Deno.serve` integration and `DenoRuntime` owns process execution. Application code must
not import `node:http`, call `Deno.serve` directly, or use third-party routing frameworks. Authentication,
tenant selection, authorization order, 401/403/404/503 behavior, and explainable denial rules are
owned by [`api.md`](./api.md).

## Frontend Contract

The frontend is a separately deployed Vite-based SolidJS 2.0 SPA.

Its default stack is:

```text
SolidJS 2.0 renderer and presentation runtime
+ Effect-based application model and typed transitions
+ Solid Router
+ TanStack Solid Query
+ TanStack Solid Table
+ TanStack Solid Virtual
+ TanStack Solid Form
+ Effect Schema
+ RITSEI Design System
+ Kobalte behind RITSEI-owned components
+ constrained Panda CSS
```

SolidJS owns rendering and presentation-local reactivity. Its JSX/compiler transform is a
rendering-boundary implementation detail, not the owner of application semantics. Effect owns
explicit frontend application coordination through typed Models, Messages, transitions, Commands,
Subscriptions, and scoped Resources where a workflow needs them. The default Solid 2 integration
carries Effect's `R` channel through a scoped Solid Context `ManagedRuntime`; Effect Atom is an
optional shared/portable reactive graph, not a second default store or lifecycle owner. TanStack
Query remains the owner of remote server state; presentation-only signals must not become a shadow
domain model or query cache. Detailed rationale and runnable references are owned by
[ADR-0072](../decisions/0072-prefer-native-solid-reactivity-for-effect-integration.md) and
[`frontend.md`](./frontend.md).

The router owns navigation and validated URL state. It must not own business policy or backend
transaction behavior. UI intent invokes a public command; only the owning backend domain can
authorize and commit the authoritative business fact.

SolidStart and SSR are not enabled by default. Their adoption requires an explicit requirement and a
new or superseding ADR.

See [`./frontend.md`](./frontend.md) for detailed frontend rules and [`./design-system.md`](./design-system.md) for Product Patterns, Visual Grammar, and frontend design-system boundaries.

## External Integration Surface Contract

External developer integrations use the canonical profile defined by
[`./integration-architecture.md`](./integration-architecture.md): HTTPS + JSON + OpenAPI for
actions, CloudEvents over HTTPS for external events, AsyncAPI for message contracts, OAuth 2.0 with
RFC 9700 security practices, and RFC 9457 Problem Details for HTTP failures.

Domain actions/events and external connector actions/events are separate typed namespaces. The
connector layer owns protocol translation, credentials, provider retries, delivery, and external
failures. Process Studio composes normalized contracts and never exposes Kafka partitions, gRPC
stubs, SOAP envelopes, raw OAuth tokens, or provider storage identifiers.

Advanced protocols such as gRPC, Kafka, AMQP, NATS, SQS, Pub/Sub, EventBridge, SOAP, and OData may
exist behind versioned adapters. They are not the universal external interface and never become
Process IR primitives. External identity-provider authentication for RITSEI principals is separate
from connector OAuth scopes; neither one is silently converted into a domain capability. External
calls do not extend PostgreSQL transactions across the network; side effects require idempotency,
timeout/retry policy, provider status, and compensation or manual recovery.

## External Standards Contract

External standards such as UBL, ISO 20022, EPCIS, XBRL, and jurisdiction-specific reporting formats
must enter and leave through versioned adapters in `modules/integrations`.

An adapter must identify its standard, version, and profile or message type. It maps external
representations to public domain contracts and must not make external generated types part of a
domain's public API or use an external document schema as the internal persistence model.

Domain modules may adopt standard semantics, identifiers, and code lists. The domain that owns the
business fact remains authoritative. Detailed rationale is owned by
[ADR-0013](../decisions/0013-version-external-standard-adapters.md).

## External Identity Contract

Domain entities use internal identities that remain independent of identifiers assigned by tenants,
standards bodies, governments, suppliers, customers, or other external systems.

An external identifier must declare its scheme and uniqueness scope. Where relevant, its scope may
include issuer, tenant, jurisdiction, trading relationship, and validity period. It must not be used
as an internal primary key, and global uniqueness must not be assumed unless guaranteed by the
governing standard.

The domain that owns the identified entity owns identifier attachment, lifecycle policy, and
conflict translation. Detailed rationale is owned by
[ADR-0014](../decisions/0014-separate-internal-and-external-identifiers.md).

## Zig FFI Boundary

Zig is optional and limited to bounded compute. The adapter must define:

- ABI version;
- input and output schema;
- memory ownership;
- maximum input size;
- error mapping;
- timeout behavior;
- benchmark threshold;
- TypeScript fallback.

Zig must not open database transactions or perform hidden I/O.
