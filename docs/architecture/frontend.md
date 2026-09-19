# Frontend Architecture

> **Status:** Canonical and active
>
> **Owns:** Frontend runtime shape, application-model and state ownership,
> framework selection, routing boundaries, server-state handling, data-heavy UI
> primitives, contract validation, and presentation-layer constraints.
>
> **Related documents**
>
> - Active architecture: [`./architecture-spec-v4.md`](./architecture-spec-v4.md)
> - SolidJS decision: [`../decisions/0009-use-solidjs-2.md`](../decisions/0009-use-solidjs-2.md)
> - SPA architecture decision: [`../decisions/0010-use-vite-solidjs-spa.md`](../decisions/0010-use-vite-solidjs-spa.md)
> - Contract schema decision: [`../decisions/0024-adopt-effect-schema-as-canonical-contract-schema.md`](../decisions/0024-adopt-effect-schema-as-canonical-contract-schema.md)
> - Effect application architecture: [`../decisions/0048-define-effect-application-architecture-and-frontend-state-ownership.md`](../decisions/0048-define-effect-application-architecture-and-frontend-state-ownership.md)
> - Native Solid 2 and Effect integration: [`../decisions/0072-prefer-native-solid-reactivity-for-effect-integration.md`](../decisions/0072-prefer-native-solid-reactivity-for-effect-integration.md)
> - Production Solid 2 × Effect bridge: [`../decisions/0086-promote-solid-effect-bridge-to-production-boundary.md`](../decisions/0086-promote-solid-effect-bridge-to-production-boundary.md)
> - Design system and Visual Grammar: [`./design-system.md`](./design-system.md)
> - Skeleton architecture: [`./skeleton.md`](./skeleton.md)
> - Solid 2 accessible primitive selection: [`../decisions/0074-switch-to-kobalte-for-solid2-accessible-primitives.md`](../decisions/0074-switch-to-kobalte-for-solid2-accessible-primitives.md)
> - Dependency ownership: [`../decisions/0075-partition-dependency-ownership-by-application-boundary.md`](../decisions/0075-partition-dependency-ownership-by-application-boundary.md)
> - Cartographic visual grammar: [`../decisions/0069-adopt-cartographic-enterprise-visual-grammar.md`](../decisions/0069-adopt-cartographic-enterprise-visual-grammar.md)
> - Cartographic renderer selection: [`../decisions/0070-select-vgpu-and-defer-typegpu.md`](../decisions/0070-select-vgpu-and-defer-typegpu.md)
> - Cartographic renderer reference: [`./reference/cartographic-renderer-selection.md`](./reference/cartographic-renderer-selection.md)
> - Universal cartographic archetypes: [`../decisions/0071-adopt-universal-cartographic-archetypes.md`](../decisions/0071-adopt-universal-cartographic-archetypes.md)
> - Archetypes and semantic depth reference: [`./reference/cartographic-archetypes-and-semantic-depth.md`](./reference/cartographic-archetypes-and-semantic-depth.md)
> - Layered TanStack frontend engine boundaries:
>   [`../decisions/0057-define-layered-tanstack-frontend-engine-boundaries.md`](../decisions/0057-define-layered-tanstack-frontend-engine-boundaries.md)
> - Solid compiler boundary: [`../decisions/0049-keep-solid-compiler-at-rendering-boundary.md`](../decisions/0049-keep-solid-compiler-at-rendering-boundary.md)
> - Authorization architecture: [`./authorization.md`](./authorization.md)
> - Sales architecture: [`./sales.md`](./sales.md)
> - Financial ledger authority: [`./financial-ledger.md`](./financial-ledger.md)
> - Identity and principals: [`./identity-and-principals.md`](./identity-and-principals.md)
> - HTTP API boundary: [`./api.md`](./api.md)
> - Source-of-truth and derived-capability non-interference:
>   [`../decisions/0083-enforce-non-interference-between-source-of-truth-and-derived-capabilities.md`](../decisions/0083-enforce-non-interference-between-source-of-truth-and-derived-capabilities.md)
> - Process Studio architecture: [`./process-studio.md`](./process-studio.md)
> - Architecture enforcement: [`./architecture-enforcement.md`](./architecture-enforcement.md)
> - Testing strategy: [`../development/testing.md`](../development/testing.md)
> - Documentation ownership: [`../documentation-boundaries.md`](../documentation-boundaries.md)

## Decision

RITSEI uses an API-first frontend with a separately deployed backend:

```text
Vite
└── SolidJS 2.0 SPA
    ├── Router
    ├── TanStack Solid Query (selective server-state cache)
    ├── TanStack Solid Table
    ├── TanStack Solid Virtual
    ├── TanStack Solid Form
    ├── Effect application model
    ├── Effect Schema
    └── RITSEI Design System (Kobalte + constrained Panda CSS + Motion wrapper)
```

SolidStart is not the default application foundation.

The RITSEI Design System owns Product Patterns, Interaction Grammar, Visual Grammar, semantic tokens,
component contracts, density, and frontend styling boundaries. Kobalte is the single headless behavior
primitive source behind RITSEI-owned components. Panda CSS is the constrained styling substrate, and
Motion is available only through the RITSEI-owned runtime wrapper for geometry and physics. See
[`design-system.md`](./design-system.md).

Frontend rendering is HTML-first: DOM owns semantics, interaction, accessibility, tables, forms, and
standard record surfaces. SVG, Canvas, and optional WebGPU render only approved visual projections or
material layers behind replaceable adapters and tested semantic fallbacks. `vgpu` is the selected
optional WebGPU implementation behind the cartography adapter; it is not a direct feature dependency.
WebGPU MUST NOT own business state, authorization, or the only representation of a critical value or
action.

It may be introduced only when server rendering, a frontend-owned BFF,
server-session management, server functions, or unified full-stack deployment
becomes an explicit requirement.

## Application Architecture

RITSEI separates the frontend application model from the renderer:

```text
SolidJS 2.0
  -> renderer and presentation runtime

Effect + Effect Schema
  -> application model, typed transitions, effects, and contracts
```

SolidJS owns DOM projection, fine-grained presentation reactivity, and local
ephemeral interaction state. It does not own durable business semantics,
authorization, transaction invariants, or authoritative domain state.

Effect is the frontend application runtime for explicit workflow coordination.
Effect Schema remains the canonical runtime contract language at frontend
boundaries. This is an Effect-first, Foldkit-inspired application architecture,
not a Foldkit dependency or renderer/runtime selection.

For workflows that need explicit coordination, use:

```text
View intent / Message
        |
        v
transition(Model, Message)
        |
        +--> new Model
        `--> Command, Subscription, or Resource operation
                         |
                         v
                    Effect service/API
                         |
                         v
                    result Message
```

- **Model** is application or workflow state, not a second source of truth for
  backend domain state.
- **Message** is a typed user intent, lifecycle notification, or effect result.
- **Transition** is a deterministic state transition from a Model and Message.
- **Command** is an Effect program/value for one external operation.
- **Subscription** is a long-lived source of Messages.
- **Resource** is a scoped, lifecycle-managed Effect resource.

A browser Message is not a backend domain event. UI intent requests a public
command; only the owning backend domain can authorize and commit the domain
fact. For example:

```text
ClickedApprove
      |
      v
ApprovalRequested
      |
      v
ApprovePurchaseOrder
      |
      +--> PurchaseOrderApproved
      `--> ApprovalFailed
```

Components must not mutate authoritative business state with local setters such
as `setStatus("approved")`. They dispatch an intention or invoke the owning
public command, then render the returned state or failure.

### Solid 2 × Effect integration boundary

RITSEI uses Solid's native fine-grained reactive graph as the default integration
surface for Effect. Effect remains the application runtime; Solid remains the
renderer, presentation graph, and ownership tree.

The default composition is:

```text
Solid Context
    -> scoped ManagedRuntime
        -> Effect services, Layers, typed failures, and cancellation
            -> Solid async read/action boundary
```

- `R` is carried by the nearest `ManagedRuntime` in Solid Context, not by a
  global registry.
- Runtime and Layer cleanup follows the Solid owner that created the provider;
  nested providers override services for their subtree only.
- A read adapter must propagate Solid superseding/disposal into Effect fiber
  interruption and preserve Effect failure/finalization on the way back.
- An action adapter must preserve typed failures, interruption, compensation,
  and service scope without moving business authority into the browser.
- Solid signals, memos, stores, and context own local presentation state.
- TanStack Solid Query owns cache policy for shared remote server state; its results
  must not be mirrored into Atom or an unrelated store.
- Effect Atom is an explicit opt-in for a shared or portable Effect-native
  reactive graph. It is not the default local-state store, DI container, cache,
  or business authority.

Do not represent the same reactive fact in both Solid and Atom. If a feature
opts into Atom, Atom owns that fact and the Solid adapter is only its projection.
Keep the decision at the frontend boundary; public domain contracts must remain
independent of Solid and Atom.

The production bridge is
[`apps/web/src/shared/solid-effect.ts`](../../apps/web/src/shared/solid-effect.ts). The connected
session route provides its single session-scoped `ManagedRuntime` through both `ApiRuntime` and
`RuntimeContext`; it does not create a second runtime for the same session.

The runnable evidence harness remains at
[`apps/web/src/experiments/solid-effect/`](../../apps/web/src/experiments/solid-effect/):

- [`src/solid-effect.ts`](../../apps/web/src/experiments/solid-effect/src/solid-effect.ts) re-exports
  the production bridge rather than maintaining a copy;
- [`src/app.tsx`](../../apps/web/src/experiments/solid-effect/src/app.tsx) composes the
  scoped runtime;
- [`src/typeahead.tsx`](../../apps/web/src/experiments/solid-effect/src/typeahead.tsx)
  demonstrates the native interruptible read path;
- [`src/checkout.tsx`](../../apps/web/src/experiments/solid-effect/src/checkout.tsx)
  demonstrates the native action path with typed failure and compensation; and
- [`src/atom.tsx`](../../apps/web/src/experiments/solid-effect/src/atom.tsx) is the
  comparison-only Atom registry/`AsyncResult` path, not the production default.

The production adapter tests live beside the implementation at
[`apps/web/src/shared/solid-effect.test.ts`](../../apps/web/src/shared/solid-effect.test.ts).
The current Atom binding is a Solid 1.x compatibility reference only; it is not a Solid 2
integration template. See ADR-0072 and ADR-0086 for the ownership decision and production boundary.

### State ownership

| State category | Owner | Rule |
|---|---|---|
| Authoritative domain state | Backend domain, PostgreSQL, or approved financial ledger | The browser may render a decoded projection but cannot mutate authority directly. |
| Application/workflow state | Effect Model and explicit transitions | Use for multi-step coordination, pending commands, retries, reconciliation, and lifecycle state. |
| Remote server state | TanStack Solid Query | Own cache, invalidation, refresh, and server snapshots; do not mirror query data into unrelated stores. |
| Presentation state | Solid signals, memos, stores, and context | Keep ephemeral mechanics local: focus, hover, popovers, tabs, column layout, drag state, and virtualization. |
| Shareable navigation state | Router plus Effect Schema | Keep URL filters and navigation inputs typed, validated, and independent of domain implementations. |

Not every signal is an application Message, and not every application Message
belongs in a global Model. Local presentation state is intentionally allowed
and must not be forced through a Model-to-Message transition merely for
architectural uniformity.

### Skeleton integration boundary

The RITSEI Skeleton architecture is a direct application of ADR-0072. Solid owns skeleton
visibility, responsive measurement, derived geometry selection, lifecycle, and cleanup. TanStack
Solid Query owns remote loading semantics. Effect `ManagedRuntime` remains at the application
boundary and is never injected into `Skeleton`. Boneyard contributes immutable geometry artifacts
only; it is not a reactive store, service runtime, or lifecycle owner.

The canonical boundary and build/runtime rules live in [`skeleton.md`](./skeleton.md). This frontend
document only defines the ownership relationship so the Skeleton layer cannot introduce a second
reactive graph.

### Renderer state and frame ownership

Solid signals and Effects may carry semantic changes such as theme, warehouse data, selection,
viewport size, or filters to a cartography adapter. They MUST NOT be used as a permanent frame
counter or as the renderer's clock. Renderer-owned time, delta, particles, simulation, scheduling,
and frame submission remain behind the renderer adapter. Static scenes render once or from cached
inputs; bounded loops run only for visible interaction or declared operational activity and stop
when that activity settles.

Kobalte controls and overlays remain DOM-owned. Canvas or WebGPU may provide pointer picking, but
selection is presentation state and explanations remain accessible through RITSEI-owned components,
text, and data/table alternatives.

Foldkit is an architectural reference only. RITSEI does not add Foldkit as a
dependency or couple public application contracts to its renderer, VDOM, runtime,
or release cadence. A complete frontend runtime replacement requires measured
benefit, compatibility with SolidJS and Effect v4, a migration path, and a new
ADR.

## Compiler and Rendering Boundary

Solid does use a JSX compiler or transform. RITSEI must not say that Solid
needs no compiler. The precise boundary is:

```text
Effect application model
        |
        v
Solid reactive projection
        |
        v
Solid JSX/compiler lowering
        |
        v
DOM
```

The Solid compiler lowers JSX/templates, static nodes, and dynamic bindings.
Solid's reactive primitives and observers provide the presentation dependency
graph. Neither the generated DOM code nor compiler optimization defines domain
state, authorization, transaction semantics, Effect services, or public schemas.

RITSEI is therefore **compiler-neutral at the application-architecture level**,
not compiler-free at the rendering level. Compiler configuration stays inside
`apps/web`; public contracts and Effect application transitions must not depend
on generated output or a particular compiler pass. Supported Vite/compiler
changes are validated as frontend build changes, including behavior,
accessibility, bundle output, and measured performance.

Solid 2.0 remains a pre-release dependency as of August 23, 2026. Its release
risk is contained by keeping the Effect application model and backend contracts
independent of the renderer and compiler. See [`ADR-0049`](../decisions/0049-keep-solid-compiler-at-rendering-boundary.md)
for the decision record.

## Why an SPA Fits RITSEI

RITSEI is an authenticated, long-lived, interaction-heavy application.

Its primary screens include:

```text
/accounting/journals
/inventory/stock-movements
/sales/invoices
/procurement/purchase-orders
/settings/users
```

These screens depend more on:

- persistent application state;
- complex forms;
- tables and virtualization;
- permission-aware actions;
- URL-driven filters;
- interactive dashboards;
- a separate transactional backend;

than on SEO or public first-page rendering.

The browser therefore behaves more like an application shell than a public
content website.

```text
Browser
  |
  |-- application shell
  |-- router and URL state
  |-- server-state cache
  |-- table and virtualization state
  |-- form state
  `-- session state
  |
  v
RITSEI Backend API
  |
  v
PostgreSQL
```

## Stack

| Concern | Decision |
|---|---|
| Renderer / presentation runtime | SolidJS 2.0 |
| Application runtime | Effect-based typed transitions and effects |
| Compiler boundary | Solid JSX/compiler transform inside `apps/web` |
| Build tool | Vite |
| Application shape | Client-side SPA |
| Router | Solid Router by default, or TanStack Solid Router behind an adapter |
| Server state | TanStack Solid Query |
| Tables | TanStack Solid Table |
| Virtualization | TanStack Solid Virtual |
| Forms | TanStack Solid Form |
| Runtime validation | Effect Schema |
| Design system | RITSEI Product Patterns, Interaction Grammar, and Visual Grammar |
| Accessible UI primitives | Kobalte behind RITSEI-owned components |
| Styling foundation | Constrained Panda CSS profile |
| Runtime motion | RITSEI Motion wrapper; CSS first, runtime geometry only when required |
| Skeleton loading UI | Solid-native RITSEI Skeleton boundary; Boneyard supplies static geometry artifacts only |
| Direct manipulation | `@dnd-kit/solid` target; activation blocked by the Solid 2 compatibility gate |
| Backend | Separate Effect-on-Deno API |
| Transactional database | PostgreSQL |

The frontend must not introduce its own business backend through route loaders,
server functions, or hidden server handlers.

## Deployment Boundary

The frontend is a separate application:

```text
apps/web/
```

It communicates with the backend through an explicit public transport contract,
such as HTTPS with JSON or another approved RPC encoding.

```text
SolidJS ERP SPA
  |
  | HTTPS / JSON / approved RPC
  v
RITSEI API
  |
  | authentication
  | authorization
  | accounting
  | inventory
  | procurement
  | sales
  | transactions
  | audit
  | idempotency
  v
PostgreSQL
```

The browser must not connect directly to PostgreSQL, PgQue, internal workers, or
private backend module endpoints.

## Dependency Direction

Allowed:

```text
apps/web
  -> shared public contracts
  -> frontend feature packages
  -> frontend infrastructure
  -> public backend API
```

Forbidden:

```text
apps/web
  -X-> backend repositories
  -X-> Drizzle table definitions
  -X-> PostgreSQL transaction services
  -X-> backend-only Effect Layers
  -X-> internal worker or relay code
```

Shared public contracts must remain independent of SolidJS, Drizzle, and backend
implementation details.

## Router Decision

### Default: Solid Router

Prefer Solid Router when the application benefits from:

- the most direct Solid integration;
- standard web primitives such as links and forms;
- a smaller framework-specific surface;
- alignment with SolidJS core primitives;
- optional future server capabilities without making them foundational.

### Alternative: TanStack Solid Router

TanStack Solid Router may be selected when typed URL state is a dominant
requirement, especially for screens with complex filtering and navigation.

Example:

```text
/invoices
  ?companyId=12
  &branchId=8
  &status=OVERDUE
  &dateFrom=2026-01-01
  &dateTo=2026-07-31
  &sort=dueDate.desc
  &page=4
```

If TanStack Solid Router is used, domain and query code must not depend directly
on router-specific types throughout the codebase.

## Router Abstraction

Feature modules own typed search models independently from the router.

```ts
export type InvoiceListSearch = {
  readonly companyId?: string
  readonly branchId?: string
  readonly status?: "DRAFT" | "POSTED" | "PAID" | "OVERDUE"
  readonly dateFrom?: string
  readonly dateTo?: string
  readonly sort?: string
  readonly page: number
  readonly pageSize: number
}
```

Search input must be decoded through a schema before it reaches feature queries.

The route layer should only:

```text
parse route and search input
-> invoke feature query or command
-> render feature UI
```

It must not own:

```text
business validation
authorization policy
query construction details
mutation semantics
accounting rules
inventory invariants
```

## Server-State Ownership

SolidJS 2.0 owns reactive async composition and pending presentation. TanStack
Solid Query owns cache policy for remote server state when the application needs
shared snapshots, staleness, invalidation, refetch, pagination, or cross-screen
reuse. Query is a server-cache protocol, not the domain model and not a
requirement for every asynchronous read.

Use Solid async composition for simple route or component-local reads when no
shared cache policy is needed. Use TanStack Solid Query for cache-worthy ERP
state such as master-data lookups, large filtered collections, aggregates,
shared detail views, and mutations that must invalidate several query identities.

An Effect application Model may coordinate a command's lifecycle, but it must
not become a second cache or mirror of query data.

TanStack Solid Query may own:

- cache identity and lifetime;
- invalidation and background refresh;
- stale/fresh policy;
- paginated or infinite server collections;
- safe optimistic coordination;
- mutation lifecycle and dependent-query refresh.

Do not copy query results into unrelated signals, global stores, or a client
collection merely to make them reactive. Authoritative business state and
business decisions remain in the backend domain or approved financial ledger.

A feature should expose reusable query modules rather than constructing ad hoc
request behavior inside route components. The shared `createServerQuery` policy
adds tenant-scoped identity and bounded cache profiles; the feature still owns
validated input, endpoint loading, and invalidation.

```ts
const invoiceKey = ["invoices", "list"] as const

export function createInvoiceListQuery(scope: ApiScope, input: InvoiceListInput) {
  return createServerQuery({
    tenantId: scope.tenantId,
    key: [...invoiceKey, input] as const,
    cache: "collection",
    load: ({ signal }) => invoiceApi.list(scope, input, signal),
  })
}
```

Query keys must be:

- deterministic;
- tenant-aware where required;
- scope-aware where required;
- based on validated input;
- stable across components.

## Local Reactive State

Use Solid primitives according to ownership. These are presentation primitives,
not substitutes for the application transition model:

- signals for small local mutable state;
- memos for derived state;
- stores for structured local state that benefits from granular updates;
- context for stable dependency distribution;
- TanStack Query for remote server state;
- URL search parameters for shareable list and filter state.

Context must not become a global mutable service locator.

## Table Architecture

TanStack Solid Table is an internal headless table engine for RITSEI. It owns
table behavior, not domain policy. RITSEI exposes semantic UI such as `DataTable`;
feature code declares columns, capabilities, and semantic formatting without
importing vendor APIs into domain or public UI contracts. A `createTableModel`
adapter is justified only when it adds RITSEI policy and must remain internal.

Table definitions may contain:

- column descriptions;
- display formatting;
- sorting metadata;
- filtering metadata;
- row selection behavior;
- presentation actions.

They must not contain:

- permission decisions that are not enforced by the backend;
- accounting calculations;
- inventory mutations;
- raw API calls hidden in cell renderers;
- direct persistence-model dependencies.

For large datasets, use server-side pagination, filtering, and sorting.
Client-side processing is limited to bounded datasets.

## Virtualization

Use TanStack Solid Virtual when row or column rendering becomes expensive or a
large tree/list would otherwise create excessive DOM. It is a rendering-window
primitive, not a replacement for server-side filtering, sorting, pagination, or
cursor loading. The client must not download an unbounded dataset merely to
virtualize its DOM.

The preferred large-collection shape is:

```text
server-side filter/sort/cursor pagination
        -> query cache or bounded client window
        -> table/list model
        -> virtualized DOM
```

Virtualization must preserve:

- keyboard navigation;
- focus behavior;
- accessible labels;
- selection state;
- stable row identity;
- scroll restoration where required.

Keep vendor virtualizer adapters internal. RITSEI exposes a narrow
`RitseiVirtualList` contract with fixed-row, bounded windowing; semantic
components such as `DataTable` or a future `CommandList` may delegate to it
when measured need exists. Do not virtualize small tables without measurement.

## Forms

TanStack Solid Form is an optional internal engine for ERP interaction, behind
RITSEI-owned semantic UI such as `Form`, `MoneyField`, `QuantityField`, and
`PartyField`. An internal repeatable-field primitive is `FieldArray`; a business-specific
`LineItemsField` is added only when a domain consumer and contract justify it.
The engine manages client form state, validation timing, async feedback, nested
values, arrays, composition, and submission interaction; it does not own
business invariants.

Effect Schema remains the contract and decoding boundary. The cross-layer schema
policy is owned by [`ADR-0024`](../decisions/0024-adopt-effect-schema-as-canonical-contract-schema.md):
shared API, route, plugin, Process Studio, and normalized integration contracts
must not be duplicated with a second canonical validator. Effect v4 schemas may
be adapted to Standard Schema with `Schema.toStandardSchemaV1`.

A form layer may provide:

- field state;
- touched and dirty tracking;
- client-side feedback;
- submission coordination;
- mapping of typed backend failures.

The backend remains authoritative for:

- business validation;
- authorization;
- uniqueness;
- concurrency;
- transaction invariants.

Client validation improves feedback but never replaces server validation.

Formisch is not the core form engine at this stage. Its schema-first model is a
valid future alternative, but adoption requires demonstrated SolidJS 2
compatibility, integration with the repository's Effect Schema boundary, and a
migration path that does not leak engine APIs into RITSEI fields. Keep that
comparison behind the RITSEI form boundary rather than binding feature code to
one implementation.

## Optional TanStack Modules

The TanStack family is selected by problem, not adopted as a complete platform:

| Module | RITSEI status | Boundary |
|---|---|---|
| Solid Query | Selective core | Remote cache policy; never domain authority |
| Solid Table | Core | Headless collection behavior behind RITSEI table contracts |
| Solid Virtual | Core infrastructure | Measured rendering optimization; not server pagination |
| Solid Form | Current default | ERP form interaction behind RITSEI field contracts |
| Solid Pacer | Optional utility | Debounce, throttle, queue, or batch interaction work |
| Solid DB | R&D only | Client projection/optimistic layer; never production authority |
| Solid Devtools | Development only | Diagnostics; no application contract |
| Solid Store | Not default | Solid signals/stores remain the local-state choice |
| Solid Router | Optional | Evaluate only when typed URL requirements justify it |
| TanStack Start | Not selected | No change to the separate Vite SPA/backend boundary |
| Ranger | Feature-specific | Add only for a proven range-control need |

Pacer may reduce request and interaction noise, but it must not implement
business retry, idempotency, authorization, or transaction policy. A future
client collection layer may sit above Query for normalized read projections, but
it remains rebuildable and subordinate to backend authority.

## Contract Validation

All data entering the frontend from an API, browser storage, plugin boundary,
file import, or third-party integration is untrusted.

Use shared Effect Schema contracts to:

- decode request and response payloads;
- reject invalid data;
- version public contracts;
- preserve tagged business failures;
- normalize transport-specific representations;
- decode typed route search input.

Frontend code must not reuse backend implementation types when a public contract
should exist.

## Feature Structure

Organize the frontend by business capability rather than generic technical type.

```text
apps/web/src/
├── app/
│   ├── providers/
│   ├── router/
│   └── shell/
├── routes/
├── features/
│   ├── accounting/
│   │   ├── api/
│   │   ├── contracts/
│   │   ├── forms/
│   │   ├── projections/
│   │   ├── queries/
│   │   ├── tables/
│   │   └── ui/
│   ├── inventory/
│   ├── procurement/
│   ├── sales/
│   └── authorization/
└── shared/
    ├── contracts/
    ├── infrastructure/
    └── routing/
```

RITSEI-owned shared UI and renderer adapters live under `apps/web/src/ui/`; feature-specific visual
projections live under `apps/web/src/features/<domain>/projections/`. Shared-control, composite,
domain-component, and application-shell placement, including the cross-application extraction gate,
are owned by [Design System §22](./design-system.md#22-frontend-location-and-dependency-boundaries).
Avoid global directories where unrelated behavior accumulates inside generic components, hooks,
services, stores, or utility files.

## Domain Logic

Presentation components may:

- render state;
- collect user input;
- invoke feature-level commands;
- display typed failures;
- coordinate view behavior.

Presentation components must not own:

- authoritative domain status transitions or domain events;
- accounting policy;
- authorization policy;
- transaction semantics;
- inventory invariants;
- pricing policy;
- workflow durability;
- idempotency rules.

These belong to the backend domain or explicit shared contracts.

## Situation-oriented operational UI

RITSEI uses a **role-aware, situation-oriented operational UI**. It combines task-centered,
process-centered, business-object, and exception-aware interaction models without making any one
of those terms the complete product category. The phrase is RITSEI product vocabulary: it draws on
those established ideas and case-management-like work without claiming compliance with a single
external standard. The user should not have to discover the correct application before
understanding what needs attention; the interface should expose the current operational situation
and the commands that can safely advance it.

An operational situation is a frontend/projection composition, not a domain entity or source of
truth:

```text
Operational Situation
├── related business objects
├── current process state
├── evidence and history
├── constraints, risks, and exceptions
└── eligible domain commands
```

Predictable work may be presented through process and business-object lifecycles. Evolving or
exception-heavy work may use case-management-like composition. These are presentation and
coordination choices; the owning domain contracts remain authoritative for facts, authorization,
and invariants. The frontend may show an eligible command and request it, but only the backend
owning domain authorizes and commits the business fact.

RITSEI uses a hybrid shell, but not a 50/50 split:

```text
GLOBAL STRUCTURE
  persistent collapsible sidebar

GLOBAL OPERATING CONTEXT
  thin topbar: tenant, company, location, fiscal context, search, identity, utilities

DOMAIN
  local navigation inside the active workspace

BUSINESS CONTEXT
  contextual page or object header: identity, lifecycle, impact, commands

SITUATION
  content: evidence, dependencies, process state, risks, and history

ACTION
  public domain commands through the CommandSurface pattern
```

The navigation rules are:

- The **sidebar answers “where am I?”** and contains stable landmarks, not every record type or
  action. Its default landmarks are `My Work`, `Attention`, broad `Operations` areas, `Processes`,
  and `Analytics`.
- The **topbar answers “under which operating context am I working?”** It carries global scope and
  utilities, but must not become a second application menu or a collection of hidden dropdowns.
- **Local navigation answers “which part of this domain workspace?”** It belongs inside the active
  area, for example `Overview`, `Purchase Orders`, `Suppliers`, `Receipts`, and `Exceptions`.
- The **contextual page/object header answers “what am I working on?”** It separates business-object
  identity and lifecycle from application chrome and places the primary domain actions nearby.
- **Content answers “what is happening?”** It presents the situation, evidence, relationships,
  constraints, and process progress.
- **Commands answer “what can I do?”** They invoke typed public operations; they do not mutate
  authoritative state locally.

The sidebar MUST be collapsible rather than permanently icon-only. Expanded and collapsed states
must preserve labels, keyboard access, current-location indication, and accessible names. A shortcut
such as `⌘B` MAY supplement an explicit toggle; hover or focus expansion MAY improve discoverability
but MUST NOT be the only way to recover labels. Initial shell density targets are approximately:

```text
Global topbar       48px
Context header      56–72px
Local navigation    40px
Sidebar expanded    220–240px
Sidebar collapsed   56–64px
```

The shell must protect content width for dense tables, financial reports, ledgers, bills of
materials, planning surfaces, and Process Studio. Avoid stacking a large sidebar, large header,
breadcrumbs, tabs, toolbars, and filters when one semantic layer can carry the same information.

## Process Studio UI

The planned Process Designer, Process Monitor, and Task Inbox are frontend
features over public Process Studio contracts. The designer serializes the
canonical RITSEI Process IR, discovers actions and events from typed catalogs,
and renders static validation results from the backend contract. It must not
hard-code domain capabilities or execute process semantics in the browser.

Drag-and-drop is an enhancement, not the only interaction model. The Solid dnd-kit adapter may
implement bounded pointer, touch, and keyboard interaction behind the RITSEI interaction layer, but
it must not become Process IR or business semantics. Every modeling action requires an accessible
keyboard and structured-form alternative. Detailed process semantics, governance, catalogs,
compensation, and roadmap are owned by [`process-studio.md`](./process-studio.md).

## Authorization UX

The frontend may hide or disable controls based on a backend-provided permission matrix or capability
summary. This is UX only. The backend repeats current tenant, capability, scope, object relationship,
domain-policy, and Separation-of-Duties checks for every protected command and query.

The UI must not treat identity-provider organization/group claims, cached permissions, route guards,
hidden controls, or disabled buttons as security boundaries. Tenant switching invalidates tenant-scoped
server-state caches and must not reuse authorization results across tenants.

When a denial is safe to disclose, the UI may present the typed explanation returned by the backend,
for example an approval-limit or Separation-of-Duties reason. It must not display raw provider tuples,
policy expressions, credentials, SQL, or sensitive object-existence signals.

## Error Model

The UI must distinguish:

```text
validation failure
authentication failure (401)
authorization denial (403)
safe not-found (404)
business conflict
concurrency conflict
network or transport failure
unexpected defect
```

Do not reduce all failures to a generic toast. A stale, unavailable, or unknown relationship decision
is not an allow result; the UI should show a retry/unavailable state rather than inventing permission.

Feature modules should map public tagged errors to specific recovery actions and user-facing messages.

## SolidStart Exception Gate

SolidStart may be adopted only if several of these requirements become central:

- frontend and backend move into one runtime and deployment unit;
- frontend-owned server sessions are required;
- a BFF becomes a primary boundary;
- SSR materially benefits authenticated workflows;
- server functions become a primary application interface;
- server-side file handling or report generation belongs to the frontend app;
- the team explicitly chooses convention over a manually assembled Vite stack.

Even then, backend domain ownership must remain separate from UI routing.

SolidStart is a packaging and integration choice, not the owner of ERP business
logic.

## SSR Policy

SSR is not required by default.

A proposal to add SSR must identify:

- the route or workflow;
- the measurable user benefit;
- authentication and cache behavior;
- deployment cost;
- operational ownership;
- why client rendering is insufficient.

Do not enable SSR globally for speculative performance or SEO benefits that do
not apply to authenticated ERP screens.

## Accessibility

Core workflows must support:

- semantic HTML;
- keyboard navigation;
- visible focus;
- meaningful labels;
- accessible validation feedback;
- reduced-motion preferences where relevant;
- screen-reader-compatible tables and forms; and
- semantic summaries or data/table alternatives for analytical visualizations.

Kobalte provides headless accessible behavior behind RITSEI-owned components, but feature
composition must still be tested. Decorative canvas output may be `aria-hidden="true"`; it must not
be the only channel for a business value, status, relationship, or action.

## Performance

Optimize from measurements.

Prioritize:

1. stable query keys and bounded cache policy;
2. server-side filtering and pagination;
3. SolidJS fine-grained reactivity;
4. memoized derived state;
5. table virtualization when measured;
6. code splitting by route or feature;
7. payload and contract-size control;
8. static-frame caching, visibility-aware rendering, and bounded animation for cartographic scenes;
9. renderer fallback and long-session power behavior when a visual adapter is activated.

Do not introduce broad global stores, speculative prefetching, or duplicated
client projections without evidence. Do not run a permanent GPU frame loop for static ERP scenes.

## Testing

Frontend changes should use the smallest useful combination of:

- unit tests for pure transformations;
- schema tests for route and API decoding;
- component tests for interaction;
- query tests for cache and invalidation behavior;
- accessibility tests;
- integration tests for feature flows;
- end-to-end tests for critical ERP workflows;
- renderer-neutral projection and semantic-material tests;
- deterministic fallback and mock-renderer tests;
- headless renderer smoke tests when `vgpu` is activated; and
- accessibility and reduced-motion tests around visualizations.

Tests should assert user-visible behavior and public contracts rather than
internal signal or memo implementation details.

## Completion Criteria

The frontend architecture is correctly implemented when:

- `apps/web/` builds as a Vite-based SolidJS 2.0 SPA;
- shared UI uses RITSEI Product Patterns and semantic contracts;
- vendor primitives and styling engines remain behind the internal UI layer;
- the backend remains separately deployable;
- no frontend code imports backend internals;
- remote state uses TanStack Solid Query;
- complex table and form behavior uses explicit feature abstractions;
- route search input is typed and validated;
- router-specific types do not leak into domain contracts;
- authorization remains enforced by the backend;
- complex workflow coordination uses explicit Effect transitions where needed;
- presentation-only state remains local to Solid primitives;
- cartographic renderer imports remain behind the internal UI adapter boundary;
- static visual scenes do not require a permanent frame loop;
- semantic fallbacks remain usable when WebGPU is unavailable or fails; and
- SolidStart and SSR are absent unless an approved requirement activates them.
