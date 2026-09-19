# Frontend implementation evidence

> **Status:** F2 design-system and F3 representative-workflow evidence passed mechanically; Kobalte
> dependency approval is bounded and risk-accepted; the Dialog primitive is active only through the
> tested RITSEI confirmation, account-creation, Party-creation, Access-administration, Procurement,
> Inventory, Sales, Accounting, and Process Studio wrappers.
>
> **Evidence date:** September 14, 2026
>
> **Owners:** Frontend and design-system owners.

> **Related documents**
>
> - Delivery gates: [`../roadmap/frontend.md`](../roadmap/frontend.md)
> - Frontend architecture: [`../architecture/frontend.md`](../architecture/frontend.md)
> - Production Solid 2 × Effect bridge:
>   [`../decisions/0086-promote-solid-effect-bridge-to-production-boundary.md`](../decisions/0086-promote-solid-effect-bridge-to-production-boundary.md)
> - Component ownership: [`../architecture/design-system.md`](../architecture/design-system.md)
> - Test workflow: [`../development/testing.md`](../development/testing.md)

## Scope delivered

The compatibility spike, minimal SPA shell, User Accounts, Parties, Authorization Access,
Procurement, Inventory, Sales, and Accounting vertical slices are implemented. The Accounting slice
adds bounded legal-entity configuration, chart-of-accounts, accounting-period, revenue-profile, and
posted-journal projections plus backend-authorized configuration, account, revenue-profile, period,
and journal commands. It keeps exact two-decimal amounts, tenant-scoped reads, and financial-engine
cutover gates at the Accounting boundary. The Party slice adds only the minimum owner-controlled
list/detail projections, `party.read` capability, and thin HTTP routes needed by the workspace. The
Access slice adds bounded tenant-membership reads, direct-grant summaries, capability catalog reads,
and the existing owner-controlled membership/grant commands without inventing roles or narrower
scopes. Procurement adds tenant-scoped supplier-account, purchase-order, and goods-receipt reads
plus backend-authorized draft, confirmation, cancellation, and receipt commands. Inventory adds
bounded warehouse/item master reads, stock positions, reservations, transfers, movement history, and
backend-authorized receipt, correction, reservation, and transfer lifecycle commands. Sales adds
bounded customer, quotation, and sales-order reads, customer/quotation/order creation,
backend-authorized order confirmation and cancellation, detail projections, and explicit
unknown-outcome recovery without inventing unsupported quotation or customer lifecycle commands. The
browser keeps session credentials in memory, sends tenant and bearer headers per request, decodes
responses through generated Effect Schema contracts, and leaves authorization and business authority
on the backend. Global account disable, enable, and removal remain trusted Identity operations and
are intentionally absent from tenant administration under ADR-0030. Party mutations absent from its
public contract are not synthesized in the browser.

The Process Studio slice is now connected end to end at `/processes`: backend-derived typed action
and event catalog discovery, static definition validation, runtime monitoring, workflow history,
operator inbox/history, and revision-safe retry/compensation/manual-recovery controls are exposed
through tenant-scoped API contracts. The browser designer remains a structural draft projection with
backend catalog authority, generated Effect Schema response validation, bearer/tenant headers,
non-optimistic mutations, explicit unknown-outcome handling, and no browser-side business-command
execution. Process release, deployment, capability grants, provider execution, and financial
activation remain backend-governed or outside this slice.

The native Solid 2 × Effect bridge is now a production frontend boundary at
[`apps/web/src/shared/solid-effect.ts`](../../apps/web/src/shared/solid-effect.ts). The connected
User Accounts, Parties, Access, Procurement, Inventory, and Sales routes provide a session-scoped
`ManagedRuntime` through both the API scope and `RuntimeContext`; the runnable `solid-effect`
directory re-exports that implementation as evidence rather than maintaining a separate adapter.

The shared UI surface remains application-local under `apps/web/src/ui/`. It contains only the
semantic tokens, controls, layouts, and accessibility behavior demonstrated by the current slice. A
development-only Storybook lives under `apps/web/.storybook/`; it exercises the real UI recipes with
controlled fixtures and does not create a separate design-system package or production component
catalog. The shared cartographic boundary now has renderer-neutral Visual Grammar contracts, a
feature-owned User Accounts projection, and an HTML/SVG fallback; optional WebGPU remains gated.

## Verified behavior

- The Solid 2 × Effect bridge tests cover missing-provider fail-fast behavior, `R`-channel
  propagation, Layer cleanup, and awaited fiber interruption. TanStack Solid Query remains the owner
  of shared remote server state; the bridge is not used as a replacement cache. TanStack Solid Table
  and Form remain unactivated because the current published adapters import Solid 1-only paths or
  APIs; no compatibility shim or Solid downgrade was introduced.
- `deno task --cwd apps/web build` passes and produces the Vite SPA. The current production output
  is 39,961 bytes of CSS plus sixteen JavaScript chunks; the largest is 167,962 bytes before gzip.
  Every JavaScript chunk remains below 200 KiB and the stylesheet remains below 50,000 bytes.
- The browser shell test covers boot, typed connection validation, routing, dark-theme switching,
  responsive layout, and in-memory credential handling.
- The User Accounts workflow covers tenant-scoped list/detail GET, create POST, and email-update
  PATCH requests; generated contract parity; query invalidation and refetch; permission denial;
  malformed responses; unknown mutation outcomes; dialog and editor focus restoration; and the
  explicit absence of tenant-facing global lifecycle controls.
- The Parties workflow covers tenant-scoped list/search/filter and composed detail reads; Party,
  legal-entity, branch, role, identifier, relationship, related-path, and representation commands;
  generated contract parity; PostgreSQL and memory projection parity; server-authorized refetch;
  permission denial; malformed responses; unknown mutation outcomes; dialog focus restoration; and
  the explicit absence of unsupported rename/delete/detach/deactivate operations.
- The Access workflow covers bounded tenant-membership list/detail reads, server-side
  account-ID/status filtering over the first 200 matching records, add/suspend/activate/remove
  membership commands, direct-grant and capability-catalog reads, tenant-wide capability grant,
  explicit impact acknowledgements, tenant and bearer headers, permission denial, malformed
  responses, unknown mutation outcomes, dialog focus restoration, and axe WCAG 2A/AA checks. The UI
  discloses that roles, narrower scopes, effective matrices, and individual grant revocation are not
  active public contracts.
- The Procurement workflow covers tenant-scoped supplier-account and purchase-order collections,
  purchase-order detail and receipt evidence, server-side status/supplier filters, supplier-account
  creation, draft purchase-order creation with repeatable lines, idempotent confirmation, terminal
  cancellation visibility, bounded partial receipt input, tenant and bearer headers, backend error
  handling, unknown mutation recovery, query invalidation, and axe WCAG 2A/AA checks.
- The Inventory workflow covers bounded warehouse/item master reads, stock-position, reservation,
  transfer, and movement-history projections; create warehouse/item commands; receipt and signed
  correction commands; reservation release/fulfillment; transfer creation/confirmation/completion;
  tenant and bearer headers; backend-only stock authority; query invalidation; unknown-outcome
  recovery; and axe WCAG 2A/AA checks.
- The Sales workflow covers bounded customer, quotation, and order projections; server-side filters;
  customer/quotation/order creation; order detail navigation; backend-authorized confirmation and
  cancellation; tenant and bearer headers; query invalidation; unknown-outcome recovery; generated
  contract parity; and axe WCAG 2A/AA checks. Unsupported quotation transitions and customer/order
  edits remain absent.
- The Process Studio workflow covers backend catalog discovery, typed catalog-bound draft editing,
  local structural validation followed by backend release validation, runtime and workflow
  monitoring, operator inbox/history projections, revision-safe retry/compensation/manual-recovery
  controls, tenant and bearer headers, generated contract parity, response validation,
  non-optimistic mutation handling, unknown-outcome recovery, and axe WCAG 2A/AA checks. The browser
  does not grant capabilities, release definitions, execute providers, or invoke domain commands
  directly.
- The Accounting workflow covers bounded legal-entity configuration, account, period,
  revenue-profile, and posted-journal projections; server-side filters; exact two-decimal journal
  command validation; backend-authorized configuration, account, revenue-profile, and period
  commands plus journal posting; tenant and bearer headers; query invalidation; unknown-outcome
  recovery; generated contract parity; and axe WCAG 2A/AA checks. TigerBeetle activation, financial
  reconciliation, projection rebuild, and external evidence custody remain gated or outside the
  browser command surface. Durable financial-operation intent creation, provider
  submission/reconciliation, and order-revenue/reversal orchestration also remain outside this UI:
  they require the Accounting/worker protocol, stable operation identities, and explicit
  unknown-outcome recovery rather than a partial browser-only command. The interactive surface is
  limited to the transitional PostgreSQL `postJournal` command until the durable operation read and
  recovery contract is ready for a browser workflow.
- The accessibility test runs axe WCAG 2A/AA checks and exercises narrow layout, reduced motion,
  forced colors, skip-link focus, labeled controls, keyboard traversal, validation focus, 200% zoom,
  route splitting, bundle limits, interaction latency, and bounded repeated use.
- The cartographic fallback test exercises typed archetype/material projection, deterministic SVG
  geometry, native marker-button keyboard activation, reduced motion, forced colors, 200% zoom, and
  axe WCAG 2A/AA checks. The textual summary and User Accounts table remain authoritative.
- `deno task --cwd apps/web compatibility` passes the Kobalte Solid 2 bundle probe with
  `@kobalte/core@2.0.0-alpha.1`. `tests/frontend/kobalte.test.ts`,
  `tests/frontend/workflow.test.ts`, `tests/frontend/party-workflow.test.ts`,
  `tests/frontend/access-workflow.test.ts`, `tests/frontend/procurement-workflow.test.ts`,
  `tests/frontend/inventory-workflow.test.ts`, `tests/frontend/sales-workflow.test.ts`, and
  `tests/frontend/accounting-workflow.test.ts` cover the exercised Dialog probe plus the production
  confirmation, account-creation, Party-creation, Access-administration, Procurement, Inventory, and
  Sales lifecycle wrappers: keyboard opening, focus containment/restoration, Escape and explicit
  close, reduced motion, forced colors, and axe WCAG 2A/AA checks. The exact Solid 2 RC peer-range
  mismatch is an explicitly accepted prerelease risk; production use remains limited to those tested
  RITSEI wrapper usage paths.
- `deno task --cwd apps/web storybook:build` and the CI smoke test pass with the pinned
  `storybook-solidjs-vite@11.0.0-next-20260903183420` adapter and `storybook@11.0.0-alpha.0`, using
  upstream compatibility reference commit `c6b884cc26f35852655c0d61a6f577af89977d2f`. The adapter's
  published peer range still warns for the Storybook 11 alpha; this remains bounded to the
  development tool and is covered by the build, startup, and browser-render checks. The Storybook
  tasks invoke Node because Storybook 11's worker path requires Node's `process.channel` support.

## Validation performed

| Check                                                                                     | Result                                                                                                                              |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `deno fmt --check apps packages tooling tests db deno.json sgconfig.yml vitest.config.ts` | passed; 314 files                                                                                                                   |
| `deno lint apps packages tooling tests vitest.config.ts`                                  | passed; 169 files                                                                                                                   |
| `deno task check`                                                                         | passed                                                                                                                              |
| `deno task check:affected`                                                                | passed; related run 67/68 files and 316/317 tests (1 skipped), then cross-package run 74/74 files and 274/274 tests                 |
| `deno task --cwd apps/web build`                                                          | passed; 16 JavaScript chunks, largest 167,962 bytes, stylesheet 39,961 bytes                                                        |
| Full repository test suite                                                                | passed; 126 files and 487 tests, with 1 skipped file/test                                                                           |
| `deno task boundary:test`                                                                 | passed; 2 tests                                                                                                                     |
| `deno task boundary:lint`                                                                 | passed; architecture and schema-ownership checks passed                                                                             |
| `deno task roadmap:measure`                                                               | completed mechanically; financial, Process, frontend, PostgreSQL production, and deployment gates remain outside this slice         |
| `npx --no-install fallow audit --format json --quiet --gate new-only`                     | passed; zero introduced dead code, complexity, or duplication; 7 inherited complexity findings and 17 inherited clone groups remain |
| `deno task fallow:audit`                                                                  | fails only on the repository-wide inherited Fallow health findings; changed-scope attribution remains zero introduced findings      |

## Remaining blockers

The F2 design-system manifest records the automated token, focus, keyboard, contrast, density,
theme, reduced-motion, and vendor-boundary checks as passed; the Kobalte compatibility check remains
`approved_with_risk` and only the tested Dialog wrapper usage paths are approved, including Access
administration, Procurement, Inventory, Sales, Accounting, and Process Studio. The F3 readiness
manifest records the representative-workflow browser checks, bounded bundle/latency thresholds,
semantic accessibility, zoom, and repeated-use stability as passed. This is repository-local
mechanical evidence only; it does not claim production SLOs, full assistive-technology
certification, or production deployment approval. The latest changed-scope verification is clean:
`deno task check:affected`, the full test suite, boundary checks, and the build all pass. The
repository-wide Fallow `all` gate still reports inherited complexity and duplication findings; the
changed-scope `new-only` gate reports zero introduced findings. Open roadmap financial, Process
maturity, PostgreSQL production, frontend activation, and deployment gates remain intentionally
outside this bounded frontend delivery.
