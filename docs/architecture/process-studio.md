# Process Studio Architecture

> **Status:** Canonical target architecture
>
> **Owns:** Process Studio's canvas-centric workspace behavior and direct-manipulation boundaries,
> process design-time semantics, typed action and event catalogs, RITSEI Process IR, static process
> validation, definition governance, and compensation metadata.
>
> **Implementation status:** Owned by the
> [Process Studio roadmap](../roadmap/process-studio.md) and `deno task roadmap:measure`. AI-assisted
> modeling and recommendations remain non-authoritative and are governed by
> [ADR-0063](../decisions/0063-define-governed-ai-recommendation-and-agent-boundary.md).
>
> **Related documents**
>
> - Active architecture: [`./architecture-spec-v4.md`](./architecture-spec-v4.md)
> - Durable execution: [`./durable-execution.md`](./durable-execution.md)
> - Financial ledger: [`./financial-ledger.md`](./financial-ledger.md)
> - Messaging and event delivery: [`./pgque-messaging.md`](./pgque-messaging.md)
> - Source-of-truth and derived-capability non-interference:
>   [`../decisions/0083-enforce-non-interference-between-source-of-truth-and-derived-capabilities.md`](../decisions/0083-enforce-non-interference-between-source-of-truth-and-derived-capabilities.md)
> - External integration surface: [`./integration-architecture.md`](./integration-architecture.md)
> - Authorization: [`./authorization.md`](./authorization.md)
> - Identity and principals: [`./identity-and-principals.md`](./identity-and-principals.md)
> - HTTP API boundary: [`./api.md`](./api.md)
> - Plugin trust: [`./plugin-architecture.md`](./plugin-architecture.md)
> - Capability-oriented plugin contribution:
>   [`../decisions/0023-adopt-capability-oriented-plugin-contribution.md`](../decisions/0023-adopt-capability-oriented-plugin-contribution.md)
> - Frontend architecture: [`./frontend.md`](./frontend.md)
> - Design system and Interaction Grammar: [`./design-system.md`](./design-system.md)
> - Testing strategy: [`../development/testing.md`](../development/testing.md)
> - Process Studio decision:
>   [`../decisions/0018-adopt-typed-process-studio.md`](../decisions/0018-adopt-typed-process-studio.md)
> - Capability release and runtime governance:
>   [`../decisions/0020-adopt-capability-release-and-runtime-governance.md`](../decisions/0020-adopt-capability-release-and-runtime-governance.md)
> - Governed AI recommendation and agent boundary:
>   [`../decisions/0063-define-governed-ai-recommendation-and-agent-boundary.md`](../decisions/0063-define-governed-ai-recommendation-and-agent-boundary.md)
> - Process Pack positioning:
>   [`./reference/process-pack-positioning.md`](./reference/process-pack-positioning.md)
> - Process Pack Library roadmap:
>   [`../roadmap/process-pack-library.md`](../roadmap/process-pack-library.md)
> - Roadmap and readiness gates: [`../roadmap/process-studio.md`](../roadmap/process-studio.md)
> - Blueprint review method: [orthogonal-blueprint](https://github.com/rickyraz/skills/tree/main/skills/orthogonal-blueprint)

## Purpose

RITSEI will provide a governed, typed, domain-aware Process Studio for modeling, publishing,
executing, monitoring, and improving business processes. Business users compose approved ERP
capabilities; they do not write arbitrary SQL, scripts, or mutations against domain state.

The target is not a generic low-code platform or a clone of another process product. The
distinguishing property is that the designer and runtime understand RITSEI's public domain
contracts, capabilities, tenant scopes, typed failures, state transitions, events, and compensation
semantics.

```text
Developer describes a capability
            |
            v
Codex Skills implement and validate domain contracts
            |
            v
Typed Action Catalog + Typed Event Catalog
            |
            v
Business users compose approved capabilities
            |
            v
Static validation -> governance -> durable execution
```

Codex Skills and Process Studio operate at different layers:

```text
Development time
-> build new safe capabilities

Runtime design time
-> compose existing safe capabilities
```

Process Studio never replaces domain ownership or turns a process definition into a super-domain.

## Local Domain Workflow vs Process Orchestration

A domain-local lifecycle is owned by the domain that protects its invariant:

```text
SalesOrder: Draft -> Confirmed -> Cancelled
Order fulfillment: Process coordination -> Inventory reservation fulfilled
```

It may use typed policy rules and local transitions without involving Process
Studio. Process Studio is reserved for coordination across domain contracts:

```text
PurchaseOrder.Approved
        |
        v
Inventory.ReserveStock
        |
        v
Inventory.CreateReceipt
        |
        v
Accounting.RecognizeLiability
        |
        v
Settlement.SchedulePayment
```

The example names are conceptual until the corresponding public contracts exist.
Process Studio may invoke them only after their owning packages publish typed,
authorized, idempotent commands and events. It cannot implement their business
logic, duplicate their invariants, or mutate their tables.

```text
Domain-local workflow
-> owns one domain's lifecycle and invariant

Process Studio
-> coordinates public capabilities across domains
```

## Architectural Position

```text
                     Process Studio
                          |
              +-----------+-----------+
              |                       |
        Process Designer        Process Monitor
              |                       |
              v                       v
       Process Definition       Runtime Observability
              |
              v
         Static Validator
              |
        +-----+-----+
        |           |
 Action Catalog   Event Catalog
        |           |
        +-----+-----+
              |
              v
       RELEASED / DEPLOYED
              |
              v
        Workflow Runtime
              |
    +---------+-----------+
    |         |           |
    v         v           v
 Commands   Human Task   Event Wait / Timer
    |
    v
Public Domain Contract
    |
    v
Owning Domain
    |-- invariant
    |-- transaction
    |-- authorization
    `-- audit
```

The Process Studio owns coordination state only. Domain packages remain the authoritative owners of
inventory, accounting, sales, procurement, party, billing, authorization, and other business facts.

## Process Studio as a RITSEI language surface

Process Studio is a primary authoring surface for RITSEI's business language. It lets users compose
approved process semantics using shared vocabulary; it is not a standalone visualization, a generic
graph editor, or an adjacent workflow product.

It is one of the places where the platform's one-model, many-projections thesis becomes concrete: a
released process definition can be edited, executed, observed, and analyzed through different
projections without turning the editor's graph representation into business truth.

The designer, runtime, and projections keep three concerns separate:

| Concern | Question | Owner |
|---|---|---|
| Process semantics | What does this node or edge mean? | Process IR and catalog contracts, with domain contracts authoritative for business meaning |
| Process representation | How is that meaning shown and edited? | Visual Grammar, Product Patterns, and the Process Designer |
| Process execution | How is the process run, recovered, and observed? | Workflow runtime and owning domain contracts |

The process vocabulary may include `Trigger`, `Activity`, `Decision`, `Approval`, `Wait`,
`Commitment`, `Exception`, `Escalation`, and `End`. Their representation reuses RITSEI grammar rather
than treating every element as a generic box:

```text
Activity          -> process node
Decision          -> branching node
Commitment        -> milestone or timeline semantic
Exception         -> attention or exception node
Approval          -> decision surface
Movement          -> flow edge
Capacity          -> constrained state
Dependency        -> relationship edge
```

A process definition can provide related projections for editing, execution status, history,
operational monitoring, and analytics:

```text
Process Definition
  -> Process Studio editing projection
  -> Workflow runtime execution
  -> Process status and timeline projections
  -> Committed process facts/events for analytics
```

These are related projections, not one universal renderer. Runtime and analytics consume their owned
contracts, committed facts, and events; Process IR does not become domain authority. Manufacturing,
ISP, consulting, and retail may therefore write different business sentences while using the same
RITSEI process and visual grammar.

The detailed ownership and lifecycle rules remain in this document; the shared visual vocabulary and
representation rules are owned by [`design-system.md`](./design-system.md).

## Direct-manipulation boundary

Process Studio's intended direct-manipulation engine is the modern `@dnd-kit/solid` adapter. The
provider is scoped to the designer surface rather than the whole ERP. dnd-kit may produce ephemeral
source, target, collision, ordering, and transform state; it must not persist coordinates or decide
whether a process mutation is authorized.

The current repository targets Solid 2 release candidates, while `@dnd-kit/solid@0.5.0` currently
fails the real Vite compatibility probe because its published bundle imports the removed `solid-js/web`
package path. Activation is therefore blocked by ADR-0079. Do not add a legacy React package, a
Solid 1 compatibility shim, or a Vite alias to manufacture compatibility. Once the gate passes, the
browser interaction must translate `DragEnd` into a typed Process Studio intent, validate it against
the current definition/version and authorization boundary, and only then persist canonical layout or
ordering state. A drop is never itself a business fact.

## Separation of Concerns

### Design Time

Design time owns:

- process definitions and diagrams;
- input and output mappings;
- action and event selection;
- pure decisions;
- human-task assignment policy;
- timers, waits, retries, timeouts, and compensation policy;
- static validation;
- review, approval, release, deployment, and version history;
- documentation and simulation.

### Runtime

Runtime owns:

- process instances pinned to released and deployed definition versions;
- deterministic step progression;
- durable timers and event subscriptions;
- human-task state;
- retries, timeouts, cancellation, failure, and recovery;
- compensation progress;
- correlation, causation, actor, and audit metadata;
- operational monitoring.

Runtime engine selection remains owned by [`durable-execution.md`](./durable-execution.md). Process
Studio defines the semantics the selected engine must preserve.

### Domain Execution

Domain execution owns:

- business preconditions and invariants;
- authorization enforcement;
- tenant and organization boundaries;
- PostgreSQL transactions and constraints for PostgreSQL-owned facts;
- `FinancialLedgerPort` execution and outcome semantics for TigerBeetle-backed financial effects;
- durable business facts through their selected authority;
- typed business failures;
- domain audit and event publication.

A process step invokes a public domain command. It must not import private repositories or mutate
another module's tables.

### TigerBeetle-backed actions

A TigerBeetle-backed action is a cross-store financial effect, not a direct PostgreSQL transaction.
Its catalog metadata must declare:

- deterministic idempotency identity;
- accepted, rejected, unknown, reconciled, and manual-recovery outcomes;
- retry and timeout behavior;
- whether dependent steps require reconciliation;
- projection and event timing;
- compensation or manual recovery for the accepted effect;
- bounded-stale versus authoritative-current read behavior.

Process Studio may invoke the public Accounting contract, but it must not call the TigerBeetle adapter,
wait on a provider-specific flag, or claim that a PostgreSQL transaction includes the engine call.

Before a TigerBeetle-backed action is cataloged, its Accounting public output must distinguish a
successful domain result from reconciliation readiness without exposing provider status. The first
profile uses:

```text
success: posted/reversed + operationId + reconciliationStatus(pending|reconciled)
failures: rejected policy/business result | outcome unknown | manual recovery required
```

`unknown` and `manual recovery required` are typed process-visible failures or durable recovery
states, not ordinary retryable business outputs. The catalog must persist the operation identity and
branching result so a restart cannot submit a new financial operation.

### External Integration Execution

Process Studio may also compose normalized `ExternalAction` and `ExternalEvent`
contracts from the connector layer. These are distinct from `DomainAction` and
`DomainEvent`:

```text
DomainAction
  -> public command owned by an RITSEI domain

ExternalAction
  -> connector operation owned by an external provider adapter
```

The connector owns HTTPS, OpenAPI, CloudEvents, OAuth, provider retries,
transport failures, and secrets. Process Studio sees only the typed normalized
contract. External actions may trigger domain commands, but they never become
owners of domain invariants. Detailed protocol rules are owned by
[`integration-architecture.md`](./integration-architecture.md).

## AI-Assisted Modeling and Recommendations

AI is an advisory input to Process Studio, not a new runtime authority. Provider SDKs and model
clients remain behind the integrations boundary; they are not catalog contributors and do not
receive domain database credentials or private service bindings.

AI may produce only bounded, typed artifacts such as:

- an intent draft;
- a draft Process IR or typed mapping;
- a freshness-qualified observation summary; or
- an evidence-bound recommendation for a typed action.

Model output is untrusted. Effect Schema decoding, tenant and scope validation, catalog lookup,
static process validation, and normal review govern every artifact. An AI-generated process remains
`DRAFT`; it cannot publish, release, deploy, alter a released definition, register a capability, or
choose a dynamic action. The released IR contains only exact catalog references, typed mappings,
pure decisions, and deterministic inputs. It contains no prompt, provider topology, live model call,
agent loop, embedding, or confidence-based authority.

A proposed action is not an execution. If a future coordinator accepts one, it binds the exact
recommendation and evidence version, action and catalog version, canonical validated input, and
owner-visible idempotency identity. Dispatch re-enters the owning public command with current
authorization, object relationship, domain policy, Separation of Duties, admission, audit, and
reconciliation checks. A retry reuses that bound intent; it must not ask a model to reinterpret it.

There is no `AgentPrincipal`, autonomous-agent node, model-controlled approver, or model-granted
capability in the 1.0 Process IR. Human or policy review remains the default. Autonomous action
requires a later accepted decision and the safety evidence in
[ADR-0063](../decisions/0063-define-governed-ai-recommendation-and-agent-boundary.md).

### Three governed product lanes

The design-time product surface exposes three lanes without adding lane semantics to Process IR:

- **Copilot draft:** a human request may produce a typed intent, mapping, recommendation, or draft
  IR. The result remains `DRAFT`; no provider call or business command runs in the designer.
- **Bounded execution:** a future execution surface may present only explicitly allowlisted PUBLIC
  catalog actions. It is a gate, not a generic `execute` button: current authorization, object
  relationship, policy, Separation of Duties, idempotency, admission, audit, and owner recovery
  must pass before a domain command runs. The current designer intentionally does not execute
  commands.
- **Curated templates:** versioned, owner-reviewed starter definitions use the same editable
  DesignerModel and catalog references as hand-built drafts. Selecting a template never releases,
  approves, or executes it.

These are product modes, not principals or capabilities. A template or AI origin is draft provenance;
it cannot elevate authorization. A bounded action that becomes high risk still requires explicit
human approval, and every accepted proposal re-enters the normal deterministic runtime and owning
public command.

### Process Packs

A **Process Pack** is the distribution unit for governed business knowledge. It is not a semantic
owner or a snapshot of private implementation. A pack may carry references to:

- versioned process templates;
- typed decisions, forms, and configuration contracts;
- recommended policies;
- analytic projections or dashboards; and
- user-facing documentation.

It also declares required and optional exact catalog capability references. Pack installation is a
resolution step, not a mutation step:

```text
Process Pack
    -> exact capability resolution
    -> explain missing required capabilities
    -> create ordinary DRAFT definitions
    -> configure and statically validate
    -> normal approval, release, and deployment
```

Resolution checks exact `kind`, `id`, and `version` references. Release validation still enforces
catalog stability, compatibility, tenant scope, authorization, and the owning domain contracts.
Packs never carry tables, repositories, SQL, UI-specific business semantics, capability grants, or
authority to approve or execute. A business profile may recommend packs, but it does not change
those rules.

The current product slice contains an experimental Distribution starter pack with three editable
process drafts and a guide. Its non-process asset collections remain empty until owner contracts
exist; no pack persistence, installation mutation, or automatic release is implied.

## Typed Action Catalog

The Typed Action Catalog is a core product capability, not an implementation detail. It is the
authoritative registry of approved domain and connector actions that process definitions may invoke.
Domain and external actions use separate typed namespaces and compatibility rules.

The designer reads the catalog dynamically. It must not hard-code a permanent list such as
`Reserve Stock`, `Post Journal`, or `Approve Invoice`. When a domain publishes a new approved
action, the Process Studio can discover it without a parallel UI release, subject to compatibility
and authorization rules.

A catalog entry has this conceptual contract:

```text
DomainAction
  id
  version
  owningDomain
  title
  description

  inputSchema
  outputSchema
  possibleFailures

  requiredCapability
  tenantAndOrganizationScope

  idempotency
  transactionSemantics
  timeoutPolicy
  retryPolicy

  preconditions
  effects

  reversible
  compensation
  compatibilityRange
```

### Identity and Versioning

- `id` is stable and namespaced by the semantic owner.
- `version` changes when the process-visible contract changes incompatibly.
- `kind` preserves `Domain`, `Plugin`, or `External` provenance.
- `stability` follows `PRIVATE -> EXPERIMENTAL -> PUBLIC -> DEPRECATED -> RETIRED`.
- Only compatible `PUBLIC` capabilities may enter a released production process.
- Deprecated capability versions remain available only for compatible pinned instances until their
  retirement policy is reached.
- A domain, plugin, or connector must not silently change the meaning of a running process instance.
- Action catalog metadata is not the domain implementation and must not expose Drizzle tables,
  repositories, or infrastructure errors.

### Capability Release Contract

Process-visible capabilities have an explicit stability lifecycle:

```text
PRIVATE
  |
  v
EXPERIMENTAL
  |
  v
PUBLIC
  |
  v
DEPRECATED
  |
  v
RETIRED
```

Only compatible `PUBLIC` capabilities may enter a released production process.
Private and experimental capabilities may be used by local tests or explicitly
non-production environments. Deprecated versions remain available for compatible
pinned instances until their retirement policy. Retired versions cannot start
new instances.

The catalog metadata must preserve provenance:

```text
kind: Domain | Plugin | External
owner
stability
compatibilityRange
```

A capability declaration is the source used to derive or verify catalog metadata,
API/OpenAPI descriptions, SDK types, Process Studio palette entries,
authorization metadata, tracing metadata, test fixtures, and documentation.
Hand-maintained duplicate manifests must not become a second source of truth.

### Schemas and Failures

Inputs, outputs, mappings, and public failures use Effect Schema-compatible public contracts. The
static validator rejects incompatible edges and mappings before release.

Possible failures describe stable process-visible outcomes. Raw PostgreSQL, driver, stack-trace, or
repository failures never become catalog contracts.

### Authorization and Scope

Every protected action declares its required business capability and relevant scope dimensions. The
declaration supports design-time validation and UX; the owning domain must still authorize every
runtime invocation.

A process definition cannot grant a capability to its author, publisher, participant, or runtime
principal. Definition governance and action execution are separate authorization decisions. Object
relationship checks, when required, are requested through the RITSEI Authorization and
RelationshipEngine abstractions; the process runtime never calls a provider directly or treats a
provider result as domain validity.

### Idempotency and Transaction Semantics

Each action declares enough metadata for safe orchestration:

```text
idempotency
  required | inherent | unsupported

transactionSemantics
  local_atomic
  coordination_only
  durable_external_effect
```

The catalog does not permit the workflow runtime to stretch a PostgreSQL transaction across human
tasks, timers, external calls, or process checkpoints. Local synchronous invariants remain
owner-local transactions. A TigerBeetle-backed financial step uses the durable intent/outcome
protocol in [`financial-ledger.md`](./financial-ledger.md), not a held PostgreSQL transaction.

### Preconditions and Effects

Actions may expose a bounded, typed semantic summary for static validation:

```text
ConfirmWarehouseTransfer

requires:
  transfer.status = DRAFT
  source.available >= transfer.quantities

effects:
  transfer.status = CONFIRMED
  source.onHand -= transfer.quantities
```

These declarations support process compilation, simulation, and explanation. They do not replace
runtime validation in the owning domain and must never claim more precision than the domain contract
can guarantee.

Preconditions and effects use a restricted declarative vocabulary. They cannot execute SQL, HTTP
requests, arbitrary code, or hidden reads.

## Compensation

Compensation is a first-class runtime and catalog concept from the first engine design, even if the
initial visual designer does not expose compensation as a user-draggable node.

A committed ERP operation often cannot be rolled back by reverting a database transaction later:

```text
Post Journal
Ship Goods
Receive Goods
Issue Inventory
Send Payment
```

After such an operation commits, recovery requires another explicit business operation:

```text
Post Journal
    |
    v
later process failure
    |
    v
Post Reversal Journal
```

Deleting or rewriting the original business fact is forbidden when the owning domain requires
reversal or compensating entries.

An action declares one of:

```text
reversible: false
compensation:
  command: accounting.journal.reverse
```

or:

```text
reversible: false
compensation: none
```

A compensation command:

- is another versioned Typed Action Catalog entry;
- belongs to the domain that owns the affected invariant;
- has its own input schema, capability, failures, idempotency, transaction, and audit behavior;
- records a new business fact instead of erasing committed history;
- preserves correlation and causation to the original action execution.

Catalog metadata declares whether a compensating command exists. The process definition must still
declare whether and when it may run automatically. The runtime must not guess that every available
reversal should execute on every failure.

When `compensation: none`, the process compiler and operator UI must expose that the committed
effect is not automatically reversible. A later failure may move the instance to an explicit
manual-recovery state rather than pretending that a rollback is possible.

Compensation execution must be:

- durable;
- idempotent;
- observable;
- separately authorized;
- ordered according to the released compensation plan;
- resumable after failure;
- auditable independently from the forward action.

## Typed Event Catalog

The Typed Event Catalog is symmetrical with the Typed Action Catalog. `Wait for
Event` and event
triggers select catalog entries; they never accept an unvalidated free-form event name.

Example identities:

```text
inventory.stock_transfer.confirmed + version 1
sales.invoice.finalized + version 1
accounting.journal.posted + version 1
procurement.goods_received + version 1
```

A catalog entry has this conceptual contract:

```text
DomainEvent
  id
  version
  owningDomain
  title
  description

  payloadSchema
  tenantScope
  aggregateType
  correlationFields
  filterableFields
  occurredAtSemantics

ExternalEvent
  id
  version
  connectorId
  source
  payloadSchema
  tenantScope
  correlationFields
  filterableFields
  deduplicationKey
```

Event envelopes and durable delivery remain owned by [`pgque-messaging.md`](./pgque-messaging.md).
External event authentication, CloudEvents validation, provider deduplication,
and protocol normalization remain owned by
[`integration-architecture.md`](./integration-architecture.md).
The catalog supplies typed discovery and process-compatible metadata.

The designer may express:

```text
Wait for:
  inventory.stock_transfer.confirmed + version 1

Filter:
  transferId = ${process.transferId}
```

Static validation must prove that:

- the selected event version exists;
- the filter references declared filterable fields;
- mapped process data and event fields are type-compatible;
- tenant scope is preserved;
- correlation is sufficiently specific for the intended wait;
- the process handles timeout or cancellation when an event may never arrive.

Event delivery remains at-least-once unless the owning messaging contract says otherwise. Resume
operations and event consumers must therefore be idempotent.

## RITSEI Process IR

RITSEI Process IR is the internal source of truth for process definitions. It is deliberately
smaller than BPMN, typed, versioned, deterministic, and aligned with RITSEI runtime semantics.

Initial node kinds are limited to:

```text
Start
Domain Command
Human Task
Decision
Wait for Event
Timer
Parallel Branch
End
```

Additional node kinds require demonstrated business need and an architecture review. Arbitrary
script, SQL, unrestricted HTTP, RPA, and autonomous-agent nodes are not part of the 1.0 core.

The initial runtime must not use BPMN XML as authoritative executable state:

```text
BPMN import
    |
    v
validated translator
    |
    v
RITSEI Process IR
```

and later:

```text
RITSEI Process IR
    |
    v
BPMN exporter
```

BPMN and DMN are interoperability targets. Their full execution semantics do not automatically
become RITSEI runtime semantics.

The IR must support:

- stable node and edge identifiers;
- explicit process input and output schemas;
- typed data mappings;
- exact action and event versions;
- transition conditions;
- task assignment policy;
- retry, timeout, timer, and cancellation policy;
- compensation plan;
- source diagram layout as non-semantic presentation data;
- deterministic serialization and checksums;
- forward-compatible format versioning.

## Pure Decisions

Decision nodes are pure, deterministic transformations:

```text
inputs
  |
  v
Decision
  |
  v
result
```

A decision may evaluate typed values and produce a typed result. It must not:

- query PostgreSQL or hidden mutable state;
- invoke a domain command;
- update business state;
- send HTTP requests;
- publish events;
- read the current clock implicitly;
- use nondeterministic AI output as a binding result.

Required external or mutable facts must be obtained explicitly by an earlier typed action and passed
into the decision input. Time-sensitive decisions receive an explicit timestamp input.

Pure decisions enable reproducible simulation, deterministic retries, versioned decision tables, and
explainable branch selection. Decision tables may become DMN-compatible progressively, but the 1.0
runtime uses the bounded RITSEI decision model.

## Static Process Validation

The Process Studio behaves as a business-aware compiler, not only a diagram editor. Publication is
forbidden until static validation succeeds.

The validator checks at least:

- graph structure, reachability, and valid start/end topology;
- known Process IR version and supported node kinds;
- exact action and event catalog references;
- input, output, variable, filter, and mapping compatibility;
- required capabilities and release/deployment authority;
- tenant and organization scope compatibility;
- transition ordering against declared preconditions and effects;
- retry and idempotency compatibility;
- waits and timers with required timeout/cancellation behavior;
- parallel branches for conflicting declared effects;
- compensation coverage for committed non-reversible actions;
- financial-ledger outcome, reconciliation, and projection-read metadata for TigerBeetle-backed actions;
- deprecated or incompatible catalog versions;
- decisions remain pure;
- AI/provider/agent nodes, dynamic action references, and nondeterministic runtime inputs are forbidden;
- forbidden arbitrary code, SQL, network, and cross-domain mutation.

Examples:

```text
[Complete Transfer]
        |
        v
[Confirm Transfer]

Invalid ordering:
Complete requires a CONFIRMED transfer, but no preceding effect establishes it.
```

```text
[Post Journal]
      |
      v
[Close Period]
      |
      v
[Post Journal]

Potentially invalid process:
The final action may execute after its accounting period is closed.
```

Static validation is conservative. It may reject only what catalog metadata and process data prove
invalid. It must not invent domain rules. Runtime domain validation remains authoritative because
process inputs, concurrent state, and external facts can change after release.

Warnings and errors are distinct:

```text
error
-> process cannot be released safely

warning
-> process is valid but has an operational risk requiring review
```

## Process Definition Governance

Definitions use an environment-aware lifecycle:

```text
DRAFT
  |
  v
VALIDATED
  |
  v
APPROVED
  |
  v
RELEASED
  |
  v
DEPLOYED
  |
  v
RETIRED
```

- Drafts are editable and cannot start production instances.
- Validation records the exact Process IR and catalog versions checked.
- Approval is a governed action separate from editing.
- Release creates an immutable process artifact and checksum.
- Deployment binds a released artifact to an environment such as TEST or PROD.
- Retirement prevents new instances but does not erase history or terminate running instances
  automatically.
- Changes after release create a new version.
- Running instances stay pinned to the definition and catalog versions with which they started.
- Instance migration is never implicit. A migration policy and compatibility proof are required
  before moving an active instance.

The UI may simplify this to `Draft -> Test -> Publish`, but the backend preserves release,
deployment, approval, and environment state separately. Promotion follows:

```text
DEV -> TEST -> PROD
```

Governance records:

- tenant and organization scope;
- process owner;
- author, reviewer, approver, and publisher;
- version comment and change summary;
- validation result;
- referenced action, event, and decision versions;
- release and deployment environment/timestamps;
- definition checksum.

Editing, approving, releasing, deploying, retiring, starting, cancelling, retrying, and
compensating processes require distinct capabilities where risk warrants it.

## Runtime Semantics

A runtime instance contains at least:

```text
instance_id
process_definition_id
process_definition_version
environment
tenant_id
organization_scope
status
input
output
current_progress
initiator
current_actor
execution_principal
delegated_authority
business_object_ids
correlation_id
causation_id
trace_id
started_at
completed_at
```

Each step execution records:

```text
step_execution_id
node_id
attempt
status
idempotency_key
input
output_or_failure
command_or_event_id
business_object_ids
started_at
completed_at
correlation_and_causation
trace_id
compensation_status
```

### Durability

Process checkpoints, timers, subscriptions, tasks, retries, and compensation must survive process
restarts. Effect fibers are not durable. The runtime uses the approved primitive from
[`durable-execution.md`](./durable-execution.md), with the compatibility job layer retained until
`pg_durable` passes its production gates.

### Command Invocation

The runtime invokes a Typed Action Catalog entry through its owning public domain contract.
Authorization occurs at execution time using an explicit principal or approved service identity and
tenant/organization scope. The runtime revalidates the current RITSEI capability, scope, object
relationship, domain policy, and Separation of Duties state immediately before invoking the owner.
Stale or unavailable relationship evidence fails closed.

The runtime does not hold one database transaction across multiple durable steps. Each domain
command owns its local atomic transaction. Cross-step consistency uses explicit state, idempotency,
events, and compensation.

### Execution Context and Authority

Every process invocation carries explicit context:

```text
ProcessInstanceId
TenantId
OrganizationScope
Initiator
CurrentActor
ExecutionPrincipal
DelegatedAuthority
BusinessObjectId(s)
CommandId / EventId
CorrelationId
CausationId
TraceId
```

Principal kinds remain distinct:

```text
HumanPrincipal
ServicePrincipal
ProcessPrincipal
DelegatedPrincipal
```

A `ProcessPrincipal` represents runtime execution; it does not grant every
capability. The owning domain authorizes every action using the principal, scope,
delegation, and applicable policy. Process definitions cannot grant themselves
business permissions.

Segregation of Duties is an organization policy in addition to domain invariants:

```text
Domain invariant:
  journal balances

Organization policy:
  creator != approver
  amount > threshold requires designated approver
```

### Retry and Idempotency

A retry reuses the stable logical step identity and idempotency key. The runtime must distinguish:

```text
command never committed
command committed and response was lost
command failed with a typed business error
command failed with a retryable technical error
unknown external outcome
compensation failed
```

Each durable step persists its execution state:

```text
CommandRequested
CommandStarted
CommandSucceeded
CommandFailed
RetryScheduled
CompensationStarted
CompensationSucceeded
ManualRecoveryRequired
```

Unknown external outcomes enter provider-status reconciliation or manual recovery
according to the connector contract. They are not automatically retried as if no
external side effect occurred.

Business failures do not become infinite technical retries. Retry policies are bounded and visible.

For any future recommendation-originated action, the logical step and idempotency identity also bind
the exact recommendation version, catalog action version, and canonical validated input under the
[`analytics-architecture.md`](./analytics-architecture.md) self-observation boundary. Reuse with a
different bound intent is rejected rather than treated as a retry.

### Human Tasks

Human tasks are durable process state with:

- typed input and completion output;
- candidate capability, role, group, or explicit assignee policy;
- tenant and organization scope;
- claim, release, delegate, complete, reject, expire, and cancel semantics as required by the task
  contract;
- due date, escalation, and timeout policy when configured;
- task-level authorization and audit;
- optimistic or conditional completion preventing duplicate outcomes.

A task inbox is a projection over authoritative task state, not the source of truth.

### Event Waits and Timers

Event waits bind to exact Typed Event Catalog versions and typed correlation filters. Registration
must be durable before the process can safely suspend. Delivery and resume are idempotent.

Timers use explicit timestamps, time zones, and policies. The runtime must not assume one tenant,
one legal entity, or one time zone.

### Cancellation and Failure

Process definitions declare cancellation boundaries and the treatment of already committed actions.
Cancellation never implies database rollback across past checkpoints.

A failed instance exposes:

- failed node and attempt;
- typed business or stable technical failure;
- completed committed actions;
- pending or failed compensation;
- retry eligibility;
- required operator action;
- audit correlation.

### Business Observability

Process Studio exposes business trace context in addition to technical tracing:

```text
technical:
  TraceId

business:
  ProcessInstanceId
  BusinessObjectId
  CommandId
  EventId
  CorrelationId
  CausationId
```

Operators can inspect business progress, for example:

```text
Order-to-Cash #OTC-92831

✓ Sales order confirmed
✓ Credit approved
✓ Inventory reserved
✗ Shipment creation

Reason: connector unavailable
Retry: 3/5
Business object: SO-2026-18381
```

Operator views expose safe typed failures, step state, retry eligibility,
compensation progress, and required actions according to capability scope. Raw
credentials, SQL, stack traces, and private provider payloads remain internal.

## Process Studio workspace and shell

Process Studio MUST inherit the canonical RITSEI global shell; it MUST NOT introduce an unrelated
application shell or duplicate global navigation. Product Pattern and Flexible Workspace contracts
are owned by [Design System §6](./design-system.md#6-product-patterns); shell roles and visual rules
are owned by [Design System Navigation](./design-system.md#navigation-and-workspace-shell). Route and
presentation-state ownership is defined in
[`frontend.md`](./frontend.md#situation-oriented-operational-ui).

Process-definition editing SHOULD use a canvas-centric Flexible Workspace. The global `Processes`
landmark leads to local destinations such as `Definitions`, `Runs`, `Templates`, and `Exceptions`.
The process navigator, canvas, and contextual inspector are separate presentation responsibilities:

```text
┌──────────────┬──────────────────────┬───────────────────────────┬──────────────┐
│ Global       │ Process local        │                           │ Contextual   │
│ navigation   │ navigator            │       Process canvas      │ inspector    │
│              │ Definitions          │       [Node] → [Node]     │ when useful  │
│              │ Runs                 │                           │              │
│              │ Templates            │                           │              │
│              │ Exceptions           │                           │              │
└──────────────┴──────────────────────┴───────────────────────────┴──────────────┘
```

The Process Studio local navigator MAY collapse or use a compact local navigation form when its
width burdens the canvas. The canvas MUST remain the visual center of process editing and SHOULD
expand when navigation or inspector context is not needed. During focused spatial editing, global
navigation MUST be collapsible and local navigation SHOULD collapse when appropriate.

The inspector MUST be contextual, not permanent chrome, and MUST NOT own authoritative process or
business truth. It MAY show a selected node or edge, process metadata, configuration, validation,
dependencies, run state, evidence, or exception detail. Its values MUST derive from Process IR,
validated edit intent, or authorized runtime projections. When there is no relevant selection or
context, the inspector SHOULD close so the canvas can expand.
Evidence, run, and exception details SHOULD be exposed when the task requires them, but MUST NOT be
forced into permanent columns. Process Monitor and Inbox views SHOULD use the existing Product Pattern
matching their operational job; neither is a canvas by default.

Wide, medium, and small viewports MAY change the number and presentation of columns. A small viewport
SHOULD focus on the canvas or selected context and MAY present the inspector as an overlay, drawer, or
focused view. Responsive changes MUST preserve process/object identity, selection meaning, validation,
commands, keyboard access, and focus behavior. Pane visibility and column layout are presentation
state; a deep-linked selection MAY use typed router state. Opening an inspector or moving a node MUST
NOT itself be interpreted as a business or Process IR transition.

The canvas is an editing projection, not business truth. Node position, visual connection, selection,
or completed drag MUST NOT be treated as process semantics or proof of an authorized transition.
Every edit MUST remain a typed intent validated against the current definition and persisted only
through the appropriate Process Studio command.

## Process Designer

The Process Designer is a SolidJS feature in `apps/web/` and follows [`frontend.md`](./frontend.md).
It edits Process IR through public API contracts and does not own runtime or domain policy.

The designer provides:

- drag-and-drop node composition;
- catalog-driven action and event palettes;
- typed mapping editors;
- pure decision tables and conditions;
- human-task assignment configuration;
- timers, retries, timeouts, and compensation policy;
- immediate static errors and warnings;
- lifecycle review and release/deployment controls;
- accessible keyboard alternatives to pointer-based drag-and-drop;
- process documentation and version comparison;
- simulation using explicit test inputs.

The UI must remain usable without precision pointer input. Every drag-and-drop action requires an
accessible keyboard and structured-form alternative. A Solid dnd-kit adapter may implement the
interaction, but drag state and DOM coordinates must not become Process IR or business semantics.

## Process Monitor and Inbox

The Process Monitor provides operational visibility into:

- definition and version;
- instance status and elapsed time;
- active, completed, failed, waiting, and compensating steps;
- human tasks, timers, event waits, and retries;
- typed failures and operator-safe recovery actions;
- correlation and causation trail;
- cancellation and compensation progress.

The monitor must not expose credentials, raw SQL, stack traces, or private event payloads beyond the
viewer's capability and scope.

The Inbox provides assigned and candidate tasks, due dates, process context, and typed completion
forms. Backend authorization remains authoritative even when the UI hides unavailable actions.

## Simulation and Analysis

Simulation executes Process IR against explicit fixtures and pure decisions. It must not mutate
production domain state or send external effects.

Version 1 simulation focuses on:

- path reachability;
- branch outcomes from supplied inputs;
- schema and mapping validation;
- declared precondition/effect propagation;
- timeout and compensation-path inspection;
- expected human-task and event-wait points.

Basic version 1 analysis may report:

- instance count and status;
- step duration;
- wait duration;
- retry and failure frequency;
- bottleneck candidates;
- compensation frequency.

Advanced process mining, cost simulation, conformance analytics, predictive recommendations, and
AI-assisted optimization are post-1.0 concerns unless a separate accepted decision promotes them.

## Extension and Trust Model

Core domains and trusted server plugins may register action and event catalog entries through
versioned contributor contracts. Declarative tenant extensions may compose approved entries and
configure bounded decisions, forms, routing, notifications, and webhooks within their granted
capabilities.

Plugin-local workflows remain owned by the plugin and are not Process Studio definitions. Process
Studio owns cross-domain process definitions, Process IR, release/deployment, and runtime
orchestration; plugin behavior enters Process Studio only through released typed catalog contracts.

Declarative extensions cannot register arbitrary executable code, elevate trust, mutate core tables,
redefine core invariants, or bypass catalog validation. Sandboxed executable extensions remain a
later-phase feature governed by [`plugin-architecture.md`](./plugin-architecture.md).

## Security Boundaries

Deny by default.

A process author or tenant administrator cannot:

- create arbitrary SQL or script actions;
- call private domain implementations;
- grant capabilities through a process definition;
- change action or event metadata owned by another domain;
- remove required authorization checks;
- forge tenant, organization, correlation, or actor metadata;
- mark a non-idempotent action idempotent;
- fabricate compensation for a domain that exposes none;
- publish a definition with static validation errors;
- use model output as an approval, capability grant, dynamic action, or current-state proof;
- expose prompts, provider credentials, private rows, or model topology through Process IR or monitoring;
- activate a new architectural primitive through tenant configuration.

Definitions, instances, tasks, events, and monitoring queries are tenant-aware. RLS may provide
defense in depth but is not the sole authorization mechanism.

## Testing and Validation

Detailed test ownership remains in [`testing.md`](../development/testing.md). Process Studio
implementation must prove the applicable contracts, including:

- catalog identity, versioning, schemas, and contributor authorization;
- Process IR deterministic serialization and compatibility;
- static validation errors and warnings;
- pure decision determinism;
- immutable released versions and instance version pinning;
- command idempotency and lost-response recovery;
- event wait registration and duplicate delivery;
- timer recovery;
- human-task duplicate completion and authorization;
- crash recovery from every durable checkpoint;
- compensation ordering, retry, authorization, and audit;
- cancellation after committed non-reversible actions;
- tenant and organization isolation;
- monitor redaction and operator permissions;
- AI-generated drafts remain draft-only and pass the same IR/static-validation pipeline;
- recommendations bind exact evidence, action versions, canonical input, authorization, and idempotency;
- stale evidence, changed intent, prompt-injection fixtures, and unknown outcomes fail closed;
- accessible designer and inbox interaction.

## Orthogonal Blueprint Conformance

> **Status:** Architecture conformance record, not a second source of truth.
>
> **Reviewed:** 2026-08-03
>
> **Result:** Aligned. The remaining gates are implementation evidence, not a
> reason to redesign the ownership model.

This review applies the repository's Process Studio architecture against the
[orthogonal-blueprint method](https://github.com/rickyraz/skills/tree/main/skills/orthogonal-blueprint).
The binding rules remain in this document, the canonical architecture, accepted
ADRs, and the owning domain contracts.

### Problem (Reframed)

```text
Surface request:
  build a visual workflow designer

Assumed solution:
  build a generic low-code workflow/integration platform

Underlying need:
  coordinate approved cross-domain business capabilities safely,
  durably, observably, and without transferring semantic ownership
```

### Boring Solution Considered

The boring solution is domain-local state transitions plus explicit application
services, jobs, and transactional events. That remains the default for local
work. Process Studio is justified only for durable cross-domain coordination,
where repeated composition, human tasks, waits, recovery, and business
observability provide value that local services alone do not provide.

### Rejected Assumptions

- the visual designer must come before domain contracts and a headless runtime;
- BPMN or DMN should be executable runtime truth from the beginning;
- a process definition grants the capabilities it names;
- one universal ERP entity model is safer than owned domain facts;
- external protocols belong in domain contracts or Process Studio semantics;
- an Effect fiber is a durable workflow;
- a connector timeout proves that no external side effect occurred.

### Axes Explored

| Axis | Process Studio conclusion |
|---|---|
| Inversion | Remove the designer first; retain domain-local workflows and add Process Studio only where cross-domain coordination is proven necessary. |
| Abstraction | Keep invariants and authorization in domains, orchestration in Process Studio, and protocols/secrets in connectors. |
| Constraint | Treat semantic ownership, tenant scope, typed contracts, no private imports, and no arbitrary code as real safety constraints; do not remove them for convenience. |
| Temporal | Require version pinning, durable checkpoints, compatibility ranges, and explicit promotion so the system survives scale, upgrades, and capability retirement. |
| Adversarial | Assume compromised authors, forged context, duplicate delivery, lost responses, malicious connectors, unauthorized approvals, and unsafe retries. |
| Cross-domain | Reuse proven control-plane/data-plane, checkpoint, event-correlation, and adapter-boundary patterns without importing their ownership model into ERP domains. |

### Proposed Modules and Orthogonality

| Module | Single responsibility | Composition boundary | Result |
|---|---|---|---|
| Owning domain | Facts, invariants, transactions, authorization, audit | Public typed commands/events | Pass |
| Capability catalog | Discoverable process-safe metadata | Versioned contributor contract | Pass |
| Process definition/IR | Coordination graph and mappings | Catalog entries and typed edges | Pass |
| Static validator | Reject unsafe definitions before release | Schemas, scopes, policies, compatibility | Pass |
| Runtime | Durable progression, retry, wait, task, recovery | Public domain/connector contracts | Pass |
| Connector layer | Transport, provider protocol, secrets, external outcomes | Normalized external actions/events | Pass |
| Designer/monitor | Human-facing projection and operations | Validated IR and authorized queries | Pass |

A module fails this review if it needs another module's tables, silently owns
its invariants, hides side effects behind a generic interface, or requires
unrelated modules to change for local implementation work.

### Composition Plan

```text
Capability declaration
        |
        v
Typed Action/Event Catalog
        |
        v
Process IR + Static Validator
        |
        v
Released definition -> environment deployment
        |
        v
Durable Runtime
   |              |
   v              v
Domain contract  Connector contract
   |              |
   v              v
Owning invariant  External provider
```

Commands and events cross boundaries only through typed public contracts. Each
owning domain keeps its local transaction and authorization; connectors keep
transport and provider semantics; Process Studio keeps coordination state,
correlation, and recovery metadata.

### Reversibility Map

**Type 1 — irreversible or expensive to change; full review required**

- semantic ownership and package boundaries;
- public action/event identities and schemas;
- tenant, organization, authorization, delegation, and audit semantics;
- Process IR meaning and durable instance version pinning;
- release/deployment lifecycle and compatibility rules;
- external integration profile and normalized connector boundary;
- compensation and manual-recovery semantics.

**Type 2 — reversible with contained cost**

- visual layout and editor interaction model;
- monitor projections and reporting views;
- generated catalog/API/SDK artifacts;
- internal scheduler implementation;
- selected durable engine adapter while its contract remains stable.

When uncertain, treat a decision as Type 1. The roadmap therefore blocks the
visual designer until the Type 1 contracts have evidence.

### Myopia Audit

- **Symptom patching:** more retries or workers cannot repair missing idempotency,
  ownership, or durable outcome reconciliation.
- **Local optimization:** a fast designer does not compensate for immature domain
  contracts or an unsafe runtime.
- **Now-centric design:** release pinning, retirement, promotion, and compatibility
  cover future capability versions and environment drift.
- **Inherited assumptions:** BPMN execution, microservices, generic brokers,
  unrestricted plugins, and AI/RPA are not accepted merely because they are common.
- **Solution-first design:** the roadmap starts from primitive decisions and domain
  maturity, not from canvas features.

### Pre-Mortem Scenarios and Falsification Condition

Assume Process Studio failed two years after becoming operational. The top
internal failure modes are:

1. **It became a super-domain.** Detect cross-domain table imports, duplicated
   invariants, or hand-maintained capability metadata. Stop release and restore
   public-contract ownership.
2. **Recovery duplicated or lost business effects.** Detect failed checkpoint,
   duplicate-effect, or unknown-outcome tests in the 0.85/0.9 validation portfolio.
   Keep the runtime headless and block visual expansion until reconciliation and
   manual recovery work.
3. **Governance drift made production unsafe or unusable.** Detect unapproved
   deployments, incompatible capability versions, unexplained SoD overrides, or
   operator actions without business trace context. Block promotion and repair the
   release/audit path before adding features.

Core assumptions are falsified at the existing roadmap gates:

| Assumption | Falsifying observation | Measure and deadline |
|---|---|---|
| Public contracts can support safe cross-domain composition | Fewer than two domains expose stable, versioned, authorized commands/events, or catalog entries leak implementation types | 0.8 gate |
| Durable Process IR can recover without duplicate effects | Restart, duplicate delivery, or lost-response tests produce duplicate or unknown business effects without reconciliation | 0.85 gate |
| Governance can keep releases safe across environments | Any production deployment bypasses approval, compatibility, tenant, SoD, or audit checks | Before first PROD deployment |

Until these observations are disproven, Process Studio remains a staged
coordination layer rather than a platform-wide programming model.

### Known Risks (Non-Myopic)

- Version pinning creates catalog and migration burden; retirement policies and
  compatibility ranges must prevent unbounded version accumulation.
- Business observability increases sensitive-data exposure and storage cost;
  scoped queries, redaction, retention, and trace separation are required.
- Release governance can slow legitimate domain delivery; generated metadata,
  compatibility checks, and trusted contributor contracts should reduce manual work
  without bypassing approval.
- Process composition can hide policy in graphs; domain authorization and pure
  validation remain authoritative at execution time.
- Connector normalization can erase provider-specific meaning; typed failures,
  explicit unknown outcomes, and manual recovery must preserve the distinction.

### What We Deliberately Chose NOT to Build

- generic low-code or arbitrary-script execution;
- BPMN/DMN as initial runtime truth;
- workflow-owned inventory, accounting, procurement, sales, or party facts;
- unrestricted HTTP actions or a connector marketplace;
- full RPA and autonomous agents controlling core invariants;
- microservices or a graph database without measured need.

### Sign-Off

- [x] Boring solution considered before expanding Process Studio.
- [x] Problem reframed around safe cross-domain coordination.
- [x] All six axes reviewed.
- [x] Modules pass the orthogonality test.
- [x] Type 1 and Type 2 decisions are listed.
- [x] Myopia traps and second-order risks are recorded.
- [x] Pre-mortem contains three internal failure modes.
- [x] Falsification conditions have measures and phase deadlines.
- [x] Rejected assumptions and explicit non-goals are documented.
- [ ] Runtime evidence gates are complete; implementation remains roadmap work.

## Delivery Sequencing

This document owns Process Studio semantics and completion requirements. Phase order, gate IDs,
measured status, and future delivery scope are owned by the
[Process Studio roadmap](../roadmap/process-studio.md); global dependencies are owned by the
[roadmap index](../roadmap/README.md).

## Non-Goals for 1.0

- full BPMN execution semantics;
- BPMN XML as authoritative runtime state;
- arbitrary tenant code, SQL, or unrestricted HTTP actions;
- replacing domain services with workflow definitions;
- one transaction spanning durable checkpoints;
- automatic compensation without an explicit released policy;
- rewriting immutable accounting or inventory facts;
- general-purpose RPA;
- autonomous nondeterministic agents controlling core invariants;
- advanced process mining or a generic integration marketplace.

## Completion Criteria

The target architecture is correctly implemented when:

- Action and Event Catalogs are versioned, typed, discoverable, and owner-controlled;
- Process IR is deterministic and is the only executable definition source of truth;
- decisions are pure;
- static validation rejects provably unsafe definitions;
- released versions are immutable and instances remain version-pinned;
- all commands execute through authorized public domain contracts;
- committed effects use explicit compensation or manual recovery rather than fictional rollback;
- timers, waits, tasks, retries, cancellation, and compensation are durable and observable;
- tenant and organization boundaries are enforced throughout;
- the visual designer remains a late, replaceable projection over sound runtime semantics;
- BPMN and DMN remain interoperability formats until explicitly expanded by a later decision.
