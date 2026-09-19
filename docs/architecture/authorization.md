# Authorization Architecture

> **Status:** Canonical
>
> **Related documents**
>
> - Active architecture: [`./architecture-spec-v4.md`](./architecture-spec-v4.md)
> - Search architecture: [`./search-architecture.md`](./search-architecture.md)
> - Analytics architecture: [`./analytics-architecture.md`](./analytics-architecture.md)
> - Workload isolation: [`./workload-isolation.md`](./workload-isolation.md)
> - Authorization ADR:
>   [`../decisions/0006-use-capability-based-authorization.md`](../decisions/0006-use-capability-based-authorization.md)
> - User-account lifecycle and tenant membership:
>   [`../decisions/0030-user-account-lifecycle-and-tenant-membership.md`](../decisions/0030-user-account-lifecycle-and-tenant-membership.md)
> - Capability naming:
>   [`../decisions/0031-capability-naming-and-business-verb-conventions.md`](../decisions/0031-capability-naming-and-business-verb-conventions.md)
> - Plugin trust model: [`./plugin-architecture.md`](./plugin-architecture.md)
> - Process Studio: [`./process-studio.md`](./process-studio.md)
> - Process governance ADR:
>   [`../decisions/0020-adopt-capability-release-and-runtime-governance.md`](../decisions/0020-adopt-capability-release-and-runtime-governance.md)
> - Governed AI recommendation and agent boundary:
>   [`../decisions/0063-define-governed-ai-recommendation-and-agent-boundary.md`](../decisions/0063-define-governed-ai-recommendation-and-agent-boundary.md)
> - Identity and principals: [`./identity-and-principals.md`](./identity-and-principals.md)
> - HTTP API boundary: [`./api.md`](./api.md)
> - IdentityProvider boundary:
>   [`../decisions/0058-define-provider-neutral-identity-and-authentication-boundary.md`](../decisions/0058-define-provider-neutral-identity-and-authentication-boundary.md)
> - RelationshipEngine boundary:
>   [`../decisions/0059-define-replaceable-relationship-authorization-engine.md`](../decisions/0059-define-replaceable-relationship-authorization-engine.md)

## Goals

The authorization system must be:

- multi-tenant safe;
- deny by default;
- based on business actions;
- explicitly scoped;
- compatible with Separation of Duties;
- auditable and explainable;
- fast on normal request paths;
- independent of Redis as a source of truth.

Authentication integrations may include OIDC, SAML, SCIM, LDAP, Active Directory, MFA, and passkeys.
Authentication does not replace authorization.

Search rank, analytic metrics, projection membership, cached results, embeddings, and external
provider ACLs do not grant RITSEI capabilities. Search returns candidates; current visibility and
every business action are revalidated by the owning domain. Detailed search behavior is owned by
[`search-architecture.md`](./search-architecture.md).

## Model

The **RITSEI Authorization Kernel** is the application authorization boundary. It combines:

```text
active tenant membership
+ roles and capability grants
+ precomputed effective permission matrix
+ explicit organizational scope
+ relationship/object evaluation through the replaceable `RelationshipEngine`
+ domain business policy
+ static and dynamic Separation of Duties
```

The ownership split is:

```text
PostgreSQL / RITSEI
  -> membership, roles, capabilities, grants, scopes, authorization policy,
     SoD policy, authorization versions, and owner-domain policy facts

RITSEI Authorization Kernel
  -> orchestration, final decision, explanation, and audit evidence

RelationshipEngine
  -> selected relationship/object checks and bounded candidate-resource evaluation

Native PostgreSQL implementation
  -> default RelationshipEngine implementation

SpiceDB adapter
  -> optional high-scale RelationshipEngine implementation
```

Neither relationship implementation is authoritative for membership, roles, capabilities, grants,
scopes, SoD, tenant isolation, domain policy, or business facts. Domains never call a provider
directly, and public contracts never expose provider types.

Tenant membership is separate from capability grants. A membership may be `active` or `suspended`;
only an active membership can authorize a capability. Removing a membership removes its
tenant-scoped grants but does not delete the global `UserAccount`.

Roles bundle capabilities but do not make the final decision. Scope is metadata on a grant or
policy, not part of the role or capability identifier.

## Authorization decision order

Every protected command or sensitive query passes the following layers:

```text
Identity
  -> Capability
  -> Scope
  -> Object Relationship
  -> Domain Policy
  -> Separation of Duties
  -> ALLOW / DENY
  -> Authorization decision evidence
```

The effective permission matrix is the cheap coarse-grained gate. Role and grant changes compile
into a versioned matrix; membership suspension, revocation, or policy changes invalidate the
affected matrix entries. A stale matrix cannot authorize sensitive work. The matrix is necessary but
does not prove access to a particular object. Domain policy remains the owner of business validity
such as amount, accounting period, inventory state, credit limit, or approval limit.

## Current implementation versus target architecture

The current repository baseline primarily proves active tenant membership, direct capability grants,
deny-by-default checks, and PostgreSQL-backed authorization. The target architecture documented here
adds role compilation, scoped grants, an effective permission matrix, relationship/object
evaluation, first-class SoD, machine/delegated principal context, and explainable decision evidence.

Target documentation is not implementation evidence. Each target layer must gain its own public
contract, failure mapping, invariant tests, and activation gate before production use.

## Permission Shape

Permissions represent business capabilities:

```text
accounting.invoice.read
accounting.invoice.submit
accounting.invoice.approve
accounting.invoice.post
accounting.invoice.reverse
inventory.warehouse.read
inventory.warehouse.create
inventory.item.read
inventory.item.create
inventory.stock.read
inventory.stock.receive
inventory.stock.adjust
inventory.stock.reserve
inventory.stock.release
inventory.stock.fulfill
inventory.stock_transfer.create
inventory.stock_transfer.confirm
inventory.stock_transfer.complete
authorization.role.assign
```

Use explicit lifecycle or controlled verbs where the business effect differs. Ordinary `create`,
`read`, or `update` remains acceptable when it accurately names one coherent owner-controlled
action. Broad `manage`, `write`, `admin`, `full_access`, and `execute` capabilities are forbidden by
ADR-0031.

Financial staging evidence deliberately separates `accounting.financial_evidence.record` from
`accounting.financial_evidence.read`; recording binds the evidence operator to the authenticated
principal, while lookup remains tenant-scoped and bounded. Accounting operational projections use
separate narrow read capabilities for legal-entity configuration, accounts, journals, revenue
profiles, and periods; write capabilities do not implicitly grant those reads.

## Scope

A grant may be limited to:

- tenant;
- legal entity;
- branch;
- warehouse;
- department;
- cost center;
- project;
- owned records;
- a specific resource;
- a hierarchy subtree.

Tenant IDs from headers, URLs, cookies, payloads, and IdP organization claims are untrusted
selectors. RITSEI resolves the tenant through active membership and scope before reading or mutating
business data. PostgreSQL composite keys and RLS remain an independent tenant boundary.

Scopes are never encoded into role or capability IDs. Do not create role variants such as
`FINANCE_MANAGER_PT_A_JAKARTA`; use one role plus explicit scoped grants.

## Object-level Authorization

A capability and scope do not authorize every object in that scope. For a request such as
`payment.approve(P1)`, the kernel must also prove that the principal may act on `P1`.

The relationship/object layer is evaluated through the RITSEI `RelationshipEngine` abstraction.
Native PostgreSQL is the default implementation; SpiceDB is an optional high-scale adapter for the
same contract. A missing, stale, unknown, or unavailable relationship result is never interpreted as
`ALLOW` for sensitive work.

Search results, projection membership, entity addresses, provider ACLs, and cached permissions are
candidate or convenience data. The owning domain revalidates current tenant, object relationship,
domain policy, and SoD before a sensitive response or command succeeds.

## Policy Safety

Tenant administrators must not provide arbitrary SQL, JavaScript, or other unrestricted code.
Dynamic conditions use a typed, validated policy model.

Business policy is evaluated by the owning domain or an explicit RITSEI policy contract. The
relationship evaluator must not contain amount, period, inventory, balance, credit, manufacturing,
approval-limit, or other mutable business invariants.

## Admission Is Not Authorization

Workload class, criticality, WorkloadCell placement, shuffle-shard membership, and ResourceLease
acquisition do not grant a business capability. They control where and whether work may begin after
trusted routing metadata is resolved.

A caller must still pass tenant membership, scoped capability, scope, relationship, domain policy,
and Separation of Duties checks. A query projection or isolated executor must fail closed when
authorization context is missing, stale beyond its contract, or invalid. Sensitive isolated queries
invoke a bounded owner-controlled authorization-check contract with no access to the command reserve
or use an owner-approved fail-closed authorization projection with explicit scope, relationship,
SoD, revocation, and freshness behavior. If current owner state cannot be evaluated through that
path, the query is authoritative and does not claim hard projection isolation. WorkloadCell or lease
membership must never be accepted as proof of tenant visibility or mutation authority.

Capability IDs retain business ownership and verbs. They must not encode `command`, `query`,
`priority`, pool, cell, region, or executor names.

## Enforcement Layers

```text
RITSEI AuthZ Kernel
  -> membership, capability matrix, scope, relationship, SoD, decision

Owning domain
  -> business policy, current state, command semantics, and typed failures

PostgreSQL constraints and transaction
  -> structural and concurrency integrity

PostgreSQL RLS
  -> tenant isolation and defense in depth
```

Authorization is fail-closed. An unavailable selected engine, stale revocation, missing tenant
context, unknown relationship result, or policy-version mismatch must deny or return typed
unavailability; it must never silently fall through to an allow path.

## Process Execution Authority and Separation of Duties

A workflow runtime does not become an authorization superuser. Every process command is authorized
by the owning domain using explicit execution context:

```text
ProcessInstanceId
TenantId
OrganizationScope
Initiator
CurrentActor
ExecutionPrincipal
DelegatedAuthority
BusinessObjectId(s)
CorrelationId
CausationId
```

Principal kinds remain distinct:

```text
HumanPrincipal
ServicePrincipal
ProcessPrincipal
DelegatedPrincipal
```

A `ServicePrincipal` receives explicit machine capabilities and is not an administrator by default.
A `ProcessPrincipal` identifies durable runtime execution; it does not grant capabilities by itself.
A `DelegatedPrincipal` preserves the effective actor, delegating authority, scope, expiry, and
reason. A process definition cannot grant, widen, or substitute a business capability.

Separation of Duties is a policy layer in addition to domain invariants:

```text
Domain invariant:
  journal must balance

Organization policy:
  creator != approver
  amount > threshold requires designated approver
```

High-risk workflows must preserve actor, initiator, delegation, capability, scope, and approval
history. Approval completion must be conditional or otherwise protected against duplicate or
unauthorized completion.

### AI recommendations are not principals or approvals

A model, provider, prompt, embedding, confidence value, or recommendation is not a RITSEI principal
and cannot receive an implicit `AgentPrincipal` identity. An AI adapter may use an explicit
least-privileged service principal to read approved context or create a draft, but that identity
does not acquire domain mutation, approval, delegation, or Separation-of-Duties authority.

Authorization distinguishes three decisions:

```text
observation
  -> may this principal read the scoped evidence now?
review
  -> may this reviewer assess and accept this exact recommendation?
execution
  -> may this execution principal invoke this exact owner command now?
```

Each stage revalidates current tenant membership, scope, object relationship, domain policy,
Separation of Duties, actionability/expiry, and any required admission. A process definition or
model output cannot grant a capability, widen scope, choose an approver, satisfy SoD, or replace the
current actor. A proposed action reaches the owning public command, which remains authoritative for
business validation, idempotency, transaction, audit, and typed failure behavior. Detailed evidence
binding and unknown-outcome handling are owned by
[`analytics-architecture.md`](./analytics-architecture.md) and
[`process-studio.md`](./process-studio.md).

## Audit and Explainability

Every high-risk authorization decision records safe, tenant-scoped evidence:

```text
principal and principal kind
tenant
capability
resource
scope result
relationship result
domain policy result
SoD result
decision
reason
policy/grant version
provider consistency evidence
request, correlation, and causation identifiers
timestamp
```

The public response may expose a user-safe reason such as `APPROVAL_LIMIT_EXCEEDED` or
`SEGREGATION_OF_DUTIES`. It must not expose raw SQL, credentials, provider tuples, private policy
expressions, or sensitive resource-existence signals.

Domain-owned business history remains the authority for business facts. Authorization decision
evidence follows the audit boundary in ADR-0037 and does not replace owner-local history.

## Performance and Query Safety

Relationship traversal may help build projections, but the hot request path uses the precomputed
permission matrix and bounded indexed scope/object checks. List and search queries must push tenant
and scope restrictions into the owner-controlled query path or use a bounded candidate/batch check;
they must not fetch all rows and filter unauthorized records in application memory.

A projection-safe query path has its own authorization budget and explicit revocation/freshness
contract. If current access cannot be proven by the selected RelationshipEngine, it fails closed or
uses a separately declared authoritative path.
