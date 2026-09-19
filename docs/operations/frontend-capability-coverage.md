# Frontend Capability Coverage

> **Status:** Repository-local implementation evidence
>
> **Scope:** Tenant-scoped production-connected workspaces for the active Identity, Party,
> Authorization, Procurement, Inventory, Sales, Accounting, and Process surfaces.
>
> **Related documents**
>
> - Frontend implementation evidence: [`./frontend-implementation.md`](./frontend-implementation.md)
> - Frontend roadmap: [`../roadmap/frontend.md`](../roadmap/frontend.md)
> - Authorization architecture:
>   [`../architecture/authorization.md`](../architecture/authorization.md)
> - Process Studio roadmap: [`../roadmap/process-studio.md`](../roadmap/process-studio.md)

## Boundary invariants

Every listed surface uses generated Effect Schema contracts, bearer authentication, an explicit
tenant header, backend authorization, bounded reads, response validation, and non-optimistic
mutations. Query invalidation is tenant-scoped. The browser does not import domain persistence,
construct repositories, grant capabilities, execute providers, or become authoritative for business
facts.

## Coverage matrix

| Module         | Workspace and active public capabilities                                                                                                                                                                                                                  | Production-connected coverage                                                                                                                                                                               | Explicit exclusions                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity       | `/user-accounts`; `identity.user_account.read`, `identity.user_account.create`, `identity.user_account.update`                                                                                                                                            | Tenant-filtered account list/detail, create, and email update                                                                                                                                               | Global disable, enable, and permanent removal remain trusted Identity operations under ADR-0030                                                                                                                         |
| Party          | `/parties`; `party.read`, `party.create`, `party.legal_entity.create`, `party.branch.create`, `party.party_role.assign`, `party.party_relationship.create/read`, `party.party_identifier.attach`, `party.party_representation.create/activate/deactivate` | Party search/list/detail, role and identifier assignment, legal entity and branch creation, typed relationships, related-party paths, and representation lifecycle                                          | Rename/delete, role removal, identifier detach, and relationship deactivation are absent where no public command owns them                                                                                              |
| Authorization  | `/access`; `authorization.tenant_membership.read/add/suspend/activate/remove`, `authorization.capability.grant`                                                                                                                                           | Tenant membership list/detail/filter, lifecycle administration, capability catalog, direct grants, and impact-confirmed grants                                                                              | Authentication is separate; capability administration never bypasses backend policy or tenant scope                                                                                                                     |
| Procurement    | `/procurement`; `procurement.supplier_account.create`, `procurement.purchase_order.create/read/confirm/cancel`, `procurement.purchase_receipt.receive`                                                                                                    | Supplier accounts, purchase orders, receipts, server-side filters, draft creation, confirmation, cancellation, and receipt commands                                                                         | Unsupported supplier/PO edits and unowned lifecycle actions are not synthesized                                                                                                                                         |
| Inventory      | `/inventory`; `inventory.warehouse.read/create`, `inventory.item.read/create`, `inventory.stock.read/receive/adjust/reserve/release/fulfill`, `inventory.stock_transfer.create/confirm/complete`                                                          | Warehouse/item master data, stock positions, reservations, transfers, movement history, receipt/correction, reservation lifecycle, and transfer lifecycle                                                   | The browser has no local stock authority and cannot bypass transactional inventory invariants                                                                                                                           |
| Sales          | `/sales`; `sales.customer.create/read`, `sales.quotation.create/read`, `sales.order.create/read/confirm/cancel`                                                                                                                                           | Customer, quotation, and order reads, server-side filters, creation, order detail, confirmation, cancellation, exact totals, and unknown-outcome recovery                                                   | Unsupported quotation transitions and customer/order edits remain absent                                                                                                                                                |
| Accounting     | `/accounting`; dedicated read capabilities plus `accounting.legal_entity.configure`, `account.create`, `revenue.configure`, `period.open/close`, `journal.post`                                                                                           | Legal-entity configuration, accounts, periods, revenue profiles, posted-journal history, exact money presentation, and authorized configuration/posting commands                                            | TigerBeetle activation, reconciliation checkpoints, projection rebuilds, evidence custody, durable financial intent, provider submission, and revenue orchestration remain gated or outside the browser                 |
| Process Studio | `/processes`; `process.catalog.read`, `process.definition.validate`, `process.monitor.read`, `process.inbox.read`, `process.history.read`, `process.runtime.retry/compensate/manual_recovery`                                                             | Backend-derived typed catalog, structural Process IR draft editing, local/backend validation, runtime and workflow monitoring, inbox/history, revision-safe operator controls, and unknown-outcome recovery | The browser cannot grant capabilities, release or deploy definitions, execute providers, invoke domain commands, or hard-code catalog authority; legacy order-confirmation recovery remains a backend workflow contract |

## Evidence

Focused domain/API/browser coverage is recorded in
[`frontend-implementation.md`](./frontend-implementation.md). The representative browser suite is
`tests/frontend/process-workflow.test.ts` plus the corresponding workspace workflow tests. The
current build and response-contract evidence is recorded in
[`frontend-readiness-evidence.json`](./frontend-readiness-evidence.json).
