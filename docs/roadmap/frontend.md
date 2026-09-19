# Frontend Readiness Roadmap

> **Status:** Canonical roadmap subdocument
>
> **Track ID:** `frontend`
>
> **Owner:** `apps/web` frontend and RITSEI design-system owners.
>
> **Scope committed:** a buildable Vite/SolidJS SPA, typed application boundaries, RITSEI-owned
> Product Patterns, and one accessible representative user workflow.
>
> **Measured by:** `frontend.*` gates through `deno task roadmap:measure`.
>
> **Does not own:** backend authorization, business invariants, domain state, deployment topology,
> or mandatory WebGPU/cartographic rendering.
>
> **Detailed semantics belong to:** [`../architecture/frontend.md`](../architecture/frontend.md) and
> [`../architecture/design-system.md`](../architecture/design-system.md).
>
> **Related documents**
>
> - Roadmap index: [`./README.md`](./README.md)
> - Process Studio: [`./process-studio.md`](./process-studio.md)
> - Workload isolation: [`./workload.md`](./workload.md)
> - Effect application architecture:
>   [`../decisions/0048-define-effect-application-architecture-and-frontend-state-ownership.md`](../decisions/0048-define-effect-application-architecture-and-frontend-state-ownership.md)
> - Native Solid 2 and Effect integration:
>   [`../decisions/0072-prefer-native-solid-reactivity-for-effect-integration.md`](../decisions/0072-prefer-native-solid-reactivity-for-effect-integration.md)
> - Semantic design system:
>   [`../decisions/0056-adopt-ritsei-semantic-frontend-design-system.md`](../decisions/0056-adopt-ritsei-semantic-frontend-design-system.md)
> - Cartographic visual grammar:
>   [`../decisions/0069-adopt-cartographic-enterprise-visual-grammar.md`](../decisions/0069-adopt-cartographic-enterprise-visual-grammar.md)

## Scope

This track turns the current Process Studio UI prototype into a separately deployable application
shell without moving business authority into the browser.

```text
Vite + SolidJS SPA
    ↓
typed router and Effect Schema transport boundary
    ↓
RITSEI public API
```

Solid signals and application models own presentation and workflow state only. TanStack Solid Query
owns shared remote-cache policy where needed. Domain facts, authorization, transactions, and
corrections remain backend-owned.

The track does not select SolidStart/SSR and does not make `vgpu`, Canvas, or WebGPU the only
semantic representation of a critical value or action.

## Dependencies

```text
workload.command-reserve + Process Studio designer evidence
        ↓
frontend.shell
        ↓
frontend.application-boundaries ─┐
frontend.design-system          ├─→ frontend.accessibility-performance
```

The dependency is a product-support sequence, not a claim that every frontend screen requires a
hard-isolated deployment. Route-specific workload and renderer choices remain conditional.

## Sequence

### F0 — Application shell (`frontend.shell`)

Create a reproducible Vite/SolidJS 2.0 SPA with typed routing, public transport decoding, and a
separate backend deployment boundary. The shell must have an executable build check and must not
import repositories, Drizzle tables, backend-only layers, or worker code.

**Exit evidence:**

- `apps/web/package.json`, `apps/web/index.html`, and `apps/web/vite.config.ts` define the shell;
- `apps/web/src/app/` contains the application and routing boundary;
- a reproducible production build records its output and dependency versions; and
- the existing Process Studio designer remains a representative feature test.

### F1 — Application boundaries (`frontend.application-boundaries`)

Implement typed route/search decoding, Effect application coordination, selective TanStack Solid
Query cache ownership, mutation invalidation, and explicit loading, denial, conflict, degraded, and
recovery states. Do not mirror authoritative query results into unrelated browser stores.

**Exit evidence:**

- route input and API responses decode through Effect Schema;
- `apps/web/src/app/` and `apps/web/src/shared/` keep router, transport, and state policy local;
- representative procurement, inventory, accounting, authorization, or Process workflows cover
  query/mutation boundaries; and
- no browser path can execute a backend command or mutate a domain fact directly.

### F2 — RITSEI design system (`frontend.design-system`)

Activate RITSEI-owned UI wrappers around the approved Kobalte and constrained Panda CSS boundaries.
Product Patterns, semantic tokens, density, theme, responsive behavior, and visual grammar remain
shared contracts rather than feature-local vendor usage.

**Exit evidence:**

- `apps/web/src/ui/` owns shared controls and Product Patterns;
- `docs/operations/frontend-design-system-evidence.json` records token, focus, keyboard, contrast,
  density, theme, reduced-motion review, and any explicitly accepted Kobalte prerelease risk; and
- feature code does not import headless or styling vendors directly.

### F3 — Accessibility and performance (`frontend.accessibility-performance`)

Validate one representative business workflow end to end. Cover keyboard and screen-reader behavior,
focus and error handling, contrast/high contrast, reduced motion, zoom/localization, route
splitting, bundle size, interaction latency, and long-session stability.

**Exit evidence:**

- `apps/web/src/ui/accessibility.test.ts` provides executable shared-control checks;
- `docs/operations/frontend-readiness-evidence.json` records the reviewed workflow and thresholds;
- critical actions have semantic DOM and accessible alternatives; and
- performance or visual acceleration never removes the semantic fallback.

## Current implementation progress

As of September 13, 2026, the currently feasible frontend slice is implemented without claiming
roadmap completion:

- **Compatibility spike:** Vite, SolidJS 2, Panda CSS, the generated semantic recipe surface,
  TanStack Solid Query, Playwright, and axe run through the web-owned manifest plus shared
  repository tooling. The Kobalte Solid 2 probe bundles successfully with
  `@kobalte/core@2.0.0-alpha.1`, and the browser probe covers the exercised Dialog contract. The
  package's RC peer-range mismatch is explicitly accepted as `approved_with_risk` with exact pins
  and rollback; Dialog is active only through the tested RITSEI confirmation, account-creation,
  Party-creation, and Access-administration wrappers. TanStack Solid Query is active. TanStack Solid
  Table and Form remain unactivated because the current published adapters still import Solid 1
  paths or APIs that the pinned SolidJS 2 runtime intentionally does not expose; the application
  does not add an unreviewed compatibility shim or downgrade Solid to hide that gap.
- **F0:** `deno task --cwd apps/web build` produces the separate SPA, and the browser shell test
  verifies boot, routing, invalid connection input, theme switching, responsive layout, and
  in-memory credentials.
- **F1/F2 vertical slices:** generated browser contracts preserve the canonical Identity, Party, and
  Authorization schemas and HTTP paths. The connected User Accounts workspace supports
  tenant-filtered list and detail reads, account creation, and email updates. The connected
  Procurement workspace supports tenant-scoped supplier-account, purchase-order, and receipt reads,
  server-side filters, supplier-account creation, draft order creation, confirmation, cancellation,
  and bounded receipt commands. The connected Inventory workspace supports bounded warehouse/item
  master reads, stock positions, reservations, transfers, movement history, warehouse and item
  creation, receipt/correction commands, reservation lifecycle commands, and transfer lifecycle
  commands without local stock authority. The connected Sales workspace supports bounded customer,
  quotation, and sales-order reads, server-side filters, customer/quotation/order creation, order
  confirmation and cancellation, detail projections, and unknown-outcome recovery without local
  business authority. The connected Accounting workspace supports bounded legal-entity
  configuration, chart-of-accounts, period, revenue-profile, and posted-journal evidence reads,
  exact two-decimal journal presentation, backend-authorized configuration, account,
  revenue-profile, period, and journal commands, and explicit financial-engine cutover gating. The
  connected Process Studio surface now provides backend-derived catalog discovery, structural draft
  editing, static validation, runtime/inbox/history monitoring, and authorized recovery controls;
  detailed readiness remains owned by the Process Studio roadmap. The connected Parties workspace
  supports bounded list/search/filter, composed detail, Party creation, role and identifier
  assignment, legal-entity and branch creation, typed legal-entity relationships, bounded
  related-party paths, and user-account representation lifecycle commands. The connected Access
  workspace supports bounded tenant-membership list/detail reads, server-side account-ID/status
  filtering over the first 200 matching records, membership lifecycle commands, direct-grant and
  capability-catalog reads, and the existing tenant-wide capability grant command. All workspaces
  preserve tenant-scoped headers, backend authorization, typed loading/error states, refetch, and
  unknown-outcome recovery. Global account disable, enable, and permanent removal remain trusted
  Identity operations and are not exposed to tenant administrators, as required by ADR-0030. Party
  rename/delete, role removal, identifier detach, and relationship deactivation remain absent
  because no public Party contract owns them. Domain presentation remains under its feature owner.
- **F3 evidence:** the representative-workflow browser checks cover axe, keyboard focus, reduced
  motion, forced-colors visibility, narrow layout, validation focus, 200% zoom, route splitting,
  bundle limits, interaction latency, semantic fallback, and bounded repeated use.

The F2 evidence manifest records the automated design-system checks as passed. The F3 readiness
manifest records the representative-workflow checks and bounded local thresholds as passed. The
Kobalte compatibility risk is accepted only for the exact pinned dependency and does not globally
approve unused or untested primitives; the current production-approval list contains only the tested
Dialog wrapper usage paths for shell confirmation, User Accounts, Parties, Access, Procurement,
Inventory, Sales, Accounting, and Process Studio. This remains repository-local mechanical evidence
and does not claim production SLOs, full assistive-technology certification, or production
deployment approval.

## Conditional stages (not registered)

Keep `frontend.vgpu` unregistered until a named cartographic workload demonstrates a measured need
beyond HTML, CSS, SVG, or Canvas. Activation requires a complete semantic fallback, deterministic
mock/headless behavior, bounded frame and power use, and recovery on renderer failure.

## Measures

| Measure                                      | Target before frontend support claim |
| -------------------------------------------- | ------------------------------------ |
| `frontend.*` mechanical gates                | all four pass                        |
| frontend imports of backend implementations  | `0`                                  |
| browser-side business mutations              | `0`                                  |
| critical workflow keyboard blockers          | `0`                                  |
| critical workflow semantic fallback failures | `0`                                  |
| unbounded render loop for static content     | `0`                                  |

The live track counters are emitted by `deno task roadmap:measure`; route performance and
accessibility thresholds remain reviewed workflow evidence.

## Stop conditions

Stop frontend promotion when browser state becomes a shadow domain model, vendor types escape the
RITSEI UI boundary, Canvas/WebGPU becomes the only semantic path, accessibility is deferred, a
permanent render loop is used for static scenes, or SolidStart/SSR is introduced without a new
approved requirement.
