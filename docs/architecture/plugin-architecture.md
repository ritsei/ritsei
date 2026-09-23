# Plugin Architecture

> **Status:** Canonical design concern
>
> **Related documents**
>
> - Active architecture: [`./architecture-spec-v4.md`](./architecture-spec-v4.md)
> - Authorization: [`./authorization.md`](./authorization.md)
> - Process Studio: [`./process-studio.md`](./process-studio.md)
> - External integration surface: [`./integration-architecture.md`](./integration-architecture.md)
> - Frontend architecture: [`./frontend.md`](./frontend.md)
> - Design system: [`./design-system.md`](./design-system.md)
> - Primitive and domain roadmap: [`../roadmap/README.md`](../roadmap/README.md)
> - Plugin ADR:
>   [`../decisions/0007-adopt-tiered-plugin-trust.md`](../decisions/0007-adopt-tiered-plugin-trust.md)
> - Capability-oriented contribution ADR:
>   [`../decisions/0023-adopt-capability-oriented-plugin-contribution.md`](../decisions/0023-adopt-capability-oriented-plugin-contribution.md)
> - Localization ADR:
>   [`../decisions/0016-isolate-jurisdiction-localization.md`](../decisions/0016-isolate-jurisdiction-localization.md)

## Position

Extension boundaries must be designed before version 1, but a full marketplace and arbitrary
third-party runtime are post-version-1 concerns.

## Contribution Model

RITSEI uses **extension by contribution**, not in-place extension of a core
model, table, repository, or domain implementation.

- **Public contracts** serve ordinary domain consumers through supported
  commands, queries, services, DTOs, errors, and events.
- **Contributor contracts** are separate, versioned extension points published
  deliberately by a core domain or platform capability.
- A contributor contract does not transfer ownership of the core invariant.
- Physical importability does not make an internal implementation an accessible
  dependency; only published public or contributor contracts are supported.

A plugin therefore participates in a domain through an explicit capability
surface rather than becoming another implementation of the domain's model.
Detailed rationale is owned by
[`../decisions/0023-adopt-capability-oriented-plugin-contribution.md`](../decisions/0023-adopt-capability-oriented-plugin-contribution.md).

Generated structural ergonomics is tooling, not a second ownership system. It may scaffold schemas,
DTOs, ordinary queries, form metadata, CRUD helpers, API documentation inputs, and test skeletons
from owner-reviewed metadata. It must not generate or claim protected transitions, authorization,
transaction boundaries, cross-domain consequences, fact authority, or persistence ownership.
Generated artifacts remain subject to the same public-contract, package-boundary, capability, and
compatibility checks as handwritten code.

## Extension Classes

### Core Module

Compiled and released with RITSEI. It may participate in core transactions and owns a domain
schema.

### Trusted Server Plugin

Installed by an operator, compiled into the deployment, and trusted as server code. It owns its own
schema and may register migrations, event consumers, workflows, routes, and UI contributions within
declared capabilities.

### Sandboxed Plugin

Runs without direct database or native access. It uses host capabilities with strict CPU, memory,
time, network, and I/O limits. This is a later-phase feature.

### Declarative Tenant Extension

Uses metadata or a typed DSL for:

- custom fields;
- layouts;
- approval policies;
- reports;
- notifications;
- webhooks;
- safe automations.

It cannot execute arbitrary code or modify core invariants.

## Trust Levels

```text
CORE
TRUSTED_SERVER
SANDBOXED
DECLARATIVE
```

Trust level controls database access, network access, native FFI, migration rights, and eligibility
to declare capabilities or register contributions. It does not grant a RITSEI business capability;
a tenant administrator cannot elevate trust.

Trust levels classify extension trust, while catalog provenance (`Domain | Plugin | External` and
`DomainAction`/`PluginAction`/`ExternalAction` or event counterparts) classifies contract origin.
These are separate dimensions: neither label implies the other or authorizes execution.

## Ownership

A plugin may only write to its owned schema unless a core module exposes an explicit contributor
contract. Direct mutation of core accounting or inventory tables is forbidden.

A plugin manifest declares its identity, versions, trust level, execution/deployment topology,
dependencies, entry point, owned schemas, requested capabilities, and declared contributions. The
plugin's eligible capability surface is bounded by the intersection of declared capabilities, trust
policy, installation policy, and tenant policy. A declaration is a request, not a grant, and this
intersection is not a runtime authorization decision: each operation MUST pass the existing RITSEI
AuthZ Kernel and the owning domain's current authorization and business-policy checks. Process
invocations MUST also satisfy
the applicable catalog release, version, scope, and execution-context requirements.

Trust level and deployment topology are separate dimensions. Local execution is not automatically
trusted, and remote execution is not automatically untrusted.

Core modules and trusted server plugins may contribute versioned Typed Action
Catalog and Typed Event Catalog entries through approved contributor contracts.
A connector is an integration-adapter role, not a plugin trust level or separate
extension-authority model. Trusted plugins may supply connector adapters, but
protocols, credentials, retries, and external failures remain behind the
integration boundary and cannot become domain invariants.

A plugin contribution is Process Studio-ready only after it satisfies the
primitive and Level 3 domain-provider gates in
[`../roadmap/domain-maturity.md`](../roadmap/domain-maturity.md), and its catalog
entries meet Process Studio's release and compatibility requirements. Plugin
trust or installation MUST NOT bypass those gates. A manifest's `workflow`
declaration refers to plugin-local implementation or domain-local coordination;
it is not a Process Studio definition or Process IR contribution. Process Studio
owns cross-domain definitions, Process IR, release/deployment, and runtime
orchestration, and may invoke plugin behavior only through released compatible
catalog contracts.

Plugin UI contributions MUST target an explicitly host-published semantic
extension point and use its versioned contract. Examples such as an object-related
section, contextual inspector, integration summary, or settings section are
illustrative categories, not published extension-point identifiers. UI and route
contributions MUST render within the host-owned shell and use public design-system
contracts. They MUST NOT replace the shell or workspace frame, redefine global
navigation, inject arbitrary DOM or scripts, add global CSS, override design
system tokens, or depend on private UI internals. Declarative layout metadata may
configure only host-published extension points; without one, the corresponding
UI contribution is unsupported. Shell presentation is owned by
[`design-system.md`](./design-system.md), and route composition by
[`frontend.md`](./frontend.md).

Declarative tenant extensions may compose and configure approved entries but
cannot register arbitrary executable code, forge catalog metadata, or elevate
their trust. Detailed process contribution rules are owned by
[`process-studio.md`](./process-studio.md).

## Lifecycle

A plugin manifest must define:

- stable identifier;
- semantic version;
- plugin API version;
- trust level;
- compatible RITSEI range;
- dependencies;
- entry point;
- owned schema;
- declared capabilities;
- execution/deployment topology;
- declared action, event, workflow, route, connector, and UI contributions.

Each host-facing contribution MUST reference its owner-published contract and compatible version:
action/event entries use their catalog identities and versions, connector adapters use integration-
owned versioning, and UI entries identify the host-published extension point and contract version.
The plugin API version covers manifest/host API compatibility; it MUST NOT replace owner-specific
compatibility or create a redundant generic contribution-version axis.

Installation does not make a contribution Process Studio-ready. It must pass the relevant public
contract, schema, capability, compatibility, idempotency, recovery, observability, and maturity
gates before production orchestration may use it.

The plugin loader, manifest registry, sandbox runtime, and marketplace are not part of the current
implementation; they remain design and roadmap work.

## Localization Boundaries

Shared primitive cores remain jurisdiction-neutral. Jurisdiction-specific policy, identifiers,
codes, evidence formats, reporting formats, and authority integrations belong to explicit
localization boundaries.

A localization may be a core module released with RITSEI or a trusted server plugin installed by
an operator. Both use public domain contracts or explicit contributor contracts and must not mutate
another module's tables, redefine its invariants, or patch jurisdiction-specific behavior into
shared primitives.

A localization contract declares its jurisdiction and version. External authority protocols and
formats additionally use versioned integration adapters. Detailed rationale is owned by
[ADR-0016](../decisions/0016-isolate-jurisdiction-localization.md).

## Native Code

Only the core calculation-kernel boundary may use Zig. Plugins must not load arbitrary native
libraries.
