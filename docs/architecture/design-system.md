# RITSEI Design System: Cartographic Enterprise UI

> **Status:** Canonical and active design-system specification
>
> **Implementation status:** The design-system contract is approved. `apps/web` contains the
> current Panda token/text-style implementation, bundled Pretendard and IBM Plex Mono assets,
> controlled Storybook evidence, a Kobalte-backed `ConfirmDialog` used by the application shell, and
> an HTML/SVG `CartographyField` fallback exercised by the User Accounts workflow. Kobalte activation
> is limited to that tested Dialog wrapper; visual regression and optional WebGPU evidence remain
> activation-gated. `vgpu` is the selected optional cartographic renderer behind a RITSEI-owned
> adapter, but it is not activated as a runtime dependency yet. This document therefore defines the
> target contract and its remaining activation gates; it does not claim that optional GPU capabilities
> already exist.
>
> **Owns:** Product Patterns, Interaction Grammar, Visual Grammar, semantic design tokens, material
> rules, component contracts, accessibility, density, renderer boundaries, and frontend design-system
> governance.
>
> **Related documents**
>
> - Frontend architecture: [`./frontend.md`](./frontend.md)
> - Active architecture: [`./architecture-spec-v4.md`](./architecture-spec-v4.md)
> - Design-system decision: [`../decisions/0056-adopt-ritsei-semantic-frontend-design-system.md`](../decisions/0056-adopt-ritsei-semantic-frontend-design-system.md)
> - Typography decision: [`../decisions/0076-adopt-ritsei-typography-system.md`](../decisions/0076-adopt-ritsei-typography-system.md)
> - Iconography decision: [`../decisions/0077-adopt-ritsei-iconography-system.md`](../decisions/0077-adopt-ritsei-iconography-system.md)
> - Motion decision: [`../decisions/0078-adopt-ritsei-motion-system.md`](../decisions/0078-adopt-ritsei-motion-system.md)
> - Skeleton architecture: [`./skeleton.md`](./skeleton.md)
> - Solid 2 primitive selection: [`../decisions/0074-switch-to-kobalte-for-solid2-accessible-primitives.md`](../decisions/0074-switch-to-kobalte-for-solid2-accessible-primitives.md)
> - Cartographic UI decision: [`../decisions/0069-adopt-cartographic-enterprise-visual-grammar.md`](../decisions/0069-adopt-cartographic-enterprise-visual-grammar.md)
> - Cartographic renderer selection: [`../decisions/0070-select-vgpu-and-defer-typegpu.md`](../decisions/0070-select-vgpu-and-defer-typegpu.md)
> - Cartographic renderer reference: [`./reference/cartographic-renderer-selection.md`](./reference/cartographic-renderer-selection.md)
> - Universal cartographic archetypes: [`../decisions/0071-adopt-universal-cartographic-archetypes.md`](../decisions/0071-adopt-universal-cartographic-archetypes.md)
> - Archetypes and semantic depth reference: [`./reference/cartographic-archetypes-and-semantic-depth.md`](./reference/cartographic-archetypes-and-semantic-depth.md)
> - Frontend state ownership: [`../decisions/0048-define-effect-application-architecture-and-frontend-state-ownership.md`](../decisions/0048-define-effect-application-architecture-and-frontend-state-ownership.md)
> - Vite and SolidJS SPA: [`../decisions/0010-use-vite-solidjs-spa.md`](../decisions/0010-use-vite-solidjs-spa.md)
> - Process Studio: [`./process-studio.md`](./process-studio.md)
> - Authorization: [`./authorization.md`](./authorization.md)
> - Architecture enforcement: [`./architecture-enforcement.md`](./architecture-enforcement.md)
> - Documentation boundaries: [`../documentation-boundaries.md`](../documentation-boundaries.md)

## 1. Scope and normative language

This document is the single source of truth for RITSEI's recurring visual, interaction, and
renderer decisions. Tokens, recipes, components, and styling tools implement these decisions; they
do not replace them.

The following terms are normative:

- **MUST / MUST NOT:** required for a conforming RITSEI surface.
- **SHOULD / SHOULD NOT:** default behavior; an exception requires a documented product reason.
- **MAY:** permitted when it remains inside the approved contract.

A feature deviation MUST name the semantic problem it solves, the affected states and surfaces, the
accessibility behavior, and the exit or replacement path. Local styling exceptions MUST NOT become a
new design-system dialect.

The material ratios and HTML/rendering ratios in this document are **art-direction targets**, not a
literal per-component budget or a universal page template. A form or table MAY be almost entirely
HTML and still conform. A data-dense spatial view MAY use more canvas or WebGPU when its measured
question requires it. For composed experiences that actually need a visual renderer, the current
planning target is approximately `85–95%` HTML/CSS/SVG and `5–15%` Canvas/WebGPU.

## 2. Design thesis

RITSEI does not use topographic patterns as decoration. Its visual language treats an ERP as a map of
business operations: structure, routes, pressure, density, relationships, movement, risk, and change
of state.

> **RITSEI is a living map of the business — precise enough to operate, expressive enough to
> understand.**

The design language has four controlled materials:

```text
55% Cartographic Structure
25% Architectural Paper
15% Precision Geometry
 5% Optical Glass
```

These percentages describe the visual emphasis of a composed experience:

- **Cartographic Structure** communicates contour, field, density, route, boundary, elevation, and
  spatial hierarchy.
- **Architectural Paper** provides calm, tactile, warm surfaces without skeuomorphism.
- **Precision Geometry** keeps grid, spacing, typography, alignment, controls, tables, and layout
  exact.
- **Optical Glass** provides temporary interactive depth for popovers, command palettes, inspectors,
  and modals only.

The governing principles are:

> **Structure before decoration.**
>
> **Meaning before motion.**
>
> **Material before effects.**

The UI MUST remain deterministic, readable, accessible, power-conscious, and fast. A visual effect
that reduces those properties is a defect, not brand expression.

## 3. Visual character and non-goals

The target character is:

- **Technical:** grid, geometry, charts, topology, and structured information.
- **Calm:** no neon, excessive glow, or visual noise.
- **Crafted:** tactile surfaces without sterile SaaS defaults.
- **Spatial:** hierarchy comes from surface, field, elevation, and density, not only shadow.
- **Distinctive:** cartographic language is part of the system and not a background image.

RITSEI is NOT:

- glassmorphism-heavy UI;
- a futuristic gaming dashboard;
- a watercolor-heavy application;
- a beige editorial dashboard;
- skeuomorphic enterprise software; or
- a generic Tailwind SaaS dashboard.

Cartographic identity MUST NOT force every screen to become a map, a graph, or a dashboard. The
business question selects the projection.

## 4. System layers

RITSEI separates business meaning from its visual projection:

```text
Business truth
      ↓
Business semantics
      ↓
Typed visual projection intent
      ↓
Product Patterns + Interaction Grammar
      ↓
Visual Grammar
      ↓
RITSEI UI components
      ↓
Behavior + visual contracts
      ↓
DOM / SVG / Canvas / WebGPU renderer adapters
```

The layers have separate owners:

| Layer | Owns | Must not own |
|---|---|---|
| Domain | Authoritative facts, invariants, capabilities, typed commands | UI layout or styling |
| Projection | Decoded view models and typed representation intent | New business authority |
| Product Pattern | Canonical composition and workflow behavior | CSS implementation details |
| Interaction Grammar | Selection, editing, dragging, focus, confirmation, navigation | Backend authorization |
| Visual Grammar | How business meaning is represented visually | Domain truth or renderer internals |
| Design System | Tokens, recipes, components, accessibility, density, visual contracts | Domain mutations |
| Renderer | Geometry, lifecycle, and DOM/SVG/Canvas/WebGPU output | Business aggregation or policy |

The browser renders decoded projections and invokes public commands. It never owns a business fact,
authorization decision, transaction, or workflow invariant.

## 5. Stable language and extensible expression

The system has two zones.

### Stable language

These are controlled foundations:

```text
semantic vocabulary and states
semantic tokens
typography and hierarchy
density and spacing rules
interaction states
attention and severity treatment
recipes and core components
accessibility and reduced-motion rules
renderer and fallback contracts
```

Changes to this zone are design-system changes. They MUST preserve meaning, accessibility, public
component behavior, and token compatibility.

### Extensible expression

These adapt to a business question or domain:

```text
projection intent
visual grammar
Product Pattern composition
workspace composition
domain-specific combinations
new representations
```

The three permitted forms of extensibility are:

1. **Visual extensibility:** change how an existing semantic concept is represented.
2. **Grammar extensibility:** add a governed representation for a new business meaning.
3. **Composition extensibility:** combine approved meanings and representations differently for a
   business model.

New business meaning requires an owning domain decision and a typed projection contract. It MUST NOT
be introduced as an untyped feature-local visual dialect.

## 6. Product Patterns

Product Patterns are recurring product decisions, not Panda layout primitives. Panda `Stack`,
`Grid`, and `Container` are implementation mechanisms; RITSEI patterns decide what the user sees,
why it is there, and how it behaves.

Approved starting patterns include:

```text
EntityWorkspace
OperationalWorkspace
Settings
Approval
ExceptionInvestigation
BulkOperation
MasterDetail
CommandSurface
```

`OperationalWorkspace` is the default composition for RITSEI's situation-oriented screens. The
frontend operating model is owned by [`frontend.md`](./frontend.md#situation-oriented-operational-ui);
this document owns the reusable pattern contract. An `OperationalWorkspace` SHOULD compose:

- local navigation for the active domain area;
- a contextual page or object header with identity, lifecycle, and impact;
- evidence, dependencies, process progress, constraints, and history;
- `ExceptionInvestigation` when a blocked, critical, or attention state needs explanation; and
- `CommandSurface` for typed, backend-authorized business actions.

The global sidebar and topbar remain application-shell responsibilities. They provide stable
landmarks and operating context, not record-level menus or business-object mutation controls.

A Product Pattern MUST answer:

- where identity appears;
- where lifecycle state appears;
- where the primary action lives;
- which actions are destructive;
- whether a drawer, dialog, or page is appropriate;
- how the user moves from summary to evidence;
- how filters, bulk actions, history, loading, errors, and degraded states appear; and
- how density and responsive behavior change without changing meaning.

Feature teams MUST compose an existing pattern before creating a new one. A new pattern requires a
named semantic problem and the usage contract in Section 12.

## 7. Interaction Grammar and semantic states

Consumers express intent, not appearance. These dimensions are orthogonal and MUST NOT be collapsed
into a raw color or one overloaded `status` value.

```text
Interaction:
  idle, hovered, selected, dragging, drop-target, disabled

Placement:
  neutral, valid, invalid, constrained

Operational:
  normal, informative, attention, constrained, critical, blocked

System:
  idle, active, pending, completed, failed, cancelled
```

Rules:

- one value per state dimension is the default;
- an interaction state MAY coexist with an operational state;
- `disabled` describes interaction availability, not authorization truth;
- `blocked` describes an operational condition that prevents progress;
- `critical` describes severity and does not automatically mean blocked;
- `constrained` describes a bounded capacity, policy, or placement condition; and
- an unauthorized action MUST be denied by the backend and represented with the approved
  authorization/error contract, not simulated as a local state mutation.

When several operational signals are summarized into one visual treatment, the precedence is:

```text
blocked > critical > constrained > attention > informative > normal
```

System failure and pending states MUST retain their own label or icon even when an operational state
is also shown. Every important state MUST be communicated through at least two channels chosen from
text, icon, shape, border, position, pattern, or semantic color.

## 8. Core palette

Primitive tokens are the controlled material vocabulary. They MUST be defined centrally and consumed
through semantic aliases. Feature code MUST NOT use these primitives directly.

### Dark structural colors

```css
--topo-950: #151A1E;
--topo-850: #252C32;
--topo-700: #37434B;
```

- **Topo Ink — `#151A1E`:** primary dark text, darkest canvas, strong contour, wordmark, and
  high-contrast architectural elements.
- **Topo Slate — `#252C32`:** sidebar, secondary dark surface, navigation, and dark cards.
- **Structural Slate — `#37434B`:** tertiary dark surface, subtle boundary, and secondary contour.

### Terrain colors

```css
--terrain-700: #365A72;
--terrain-500: #57778A;
--terrain-300: #A7BBC4;
```

- **Contour Blue — `#365A72`:** primary interaction, selected state, main chart, active process,
  and important relationship.
- **Terrain Blue — `#57778A`:** secondary information, hover, secondary charts, and topology.
- **Mist Terrain — `#A7BBC4`:** subtle contour, inactive data, washed chart region, and depth.

### Paper colors

```css
--paper-base: #F4F0E6;
--paper-fiber: #E9E2D3;
--surface: #FAF8F2;
```

- **Ivory Paper — `#F4F0E6`:** light-mode canvas; never substitute pure white as the default.
- **Fiber Paper — `#E9E2D3`:** inset panels, secondary regions, grouped sections, and crafted
  backgrounds.
- **Soft Surface — `#FAF8F2`:** elevated cards, inputs, and content surfaces.

Paper texture MUST be subtle enough that it does not compete with data or look like a pasted image.

### Survey accents

```css
--brass: #A88F58;
--sand-marker: #C9B786;
```

Brass and sand are survey markers, not normal actions. They MAY mark milestones, financial focal
points, topology anchors, or premium brand details. Their visual use SHOULD remain below roughly
3–5% of a composed surface.

### Semantic colors

Semantic meaning takes priority over brand consistency:

```css
--success:  #2E7D5B;
--info:     #3862B6;
--warning:  #D49A2C;
--critical: #C84A3C;
--neutral:  #64748B;
--forecast: #7567A8;
```

Semantic colors MUST be paired with explicit text, icon, or shape treatment. `--terrain-300`, brass,
and low-contrast paper values MUST NOT be used as standalone text or status indicators.

### Contrast and theme rules

- Normal text MUST meet WCAG 2.2 AA contrast of at least 4.5:1; large text MUST meet 3:1.
- Non-text controls, focus indicators, and meaningful chart marks MUST meet the applicable 3:1
  non-text contrast requirement.
- Every semantic background MUST have an approved readable foreground token; components MUST NOT
  guess a foreground by inverting the background.
- Light and dark themes MUST define semantic aliases separately. Dark mode is not a blind color
  inversion.
- High-contrast mode MUST preserve state distinctions through text, icon, border, or shape when
  low-contrast material is removed.
- Contrast checks are activation evidence for shared recipes, not an optional visual review.

## 9. Light and dark mode

Light mode is an architectural paper field:

```text
65% paper / ivory
20% topo ink / structural slate
10% terrain family
 5% mist + brass
```

The main canvas is `#F4F0E6`; elevated surfaces use `#FAF8F2`. Navigation MAY use a dark structural
block as a spatial anchor.

Dark mode is a mineral structural field:

```text
70% topo ink / slate
15% terrain
10% mist / ivory
 5% brass
```

Dark mode MUST use restrained contour opacity and MUST preserve readable text and semantic status
contrast. Paper character becomes a subtle mineral/grain surface rather than an inverted ivory
canvas.

## 10. Typography

RITSEI typography is information infrastructure: quiet, precise, readable in dense enterprise
surfaces, and durable beyond short-lived SaaS trends. The active stack is:

```text
Product UI and marketing  Pretendard
Technical values           IBM Plex Mono
Future brand/display       Söhne, only after brand investment is justified
```

Söhne is an identity layer, not a replacement requirement for Pretendard. IBM Plex Mono MUST be
limited to identifiers, code-like values, and technical information where character-by-character
comparison has semantic value.

The application implementation is owned by `apps/web/panda.config.ts` and
`apps/web/src/ui/foundations/typography.ts`. The shared UI surface loads the approved static WOFF2 weights from `@fontsource/pretendard`
and `@fontsource/ibm-plex-mono`; a future approved variable Pretendard asset may replace them
without changing the semantic contract. Components MUST use the semantic text styles rather than
arbitrary font sizes or weights.

Foundation tokens:

```text
12 / 16   xs       metadata, helper text
13 / 18   sm       labels, dense tables, status
14 / 20   md       default application text
16 / 24   lg       prominent body text
18 / 26   xl       section headings
20 / 28   2xl      subsection headings
24 / 32   3xl      page titles
32 / 40   4xl      restrained display
```

The default application size is 14px. Supported weights are 400 regular, 500 medium, and 600
semibold. Primary information MUST NOT fall below 12px. Tables and financial values MUST use
`font-variant-numeric: tabular-nums`; numeric columns SHOULD be right-aligned, while identifiers
MAY use IBM Plex Mono. Labels and navigation use sentence case by default.

Typography MUST remain scannable at dense enterprise layouts. Dates, currencies, quantities, and
percentages MUST use locale-aware formatting and MUST NOT depend on glyph shape alone for meaning.
The system MUST remain usable under zoom, OS text scaling, long labels, and localization.

See [ADR-0076](../decisions/0076-adopt-ritsei-typography-system.md) for the decision record.

### Iconography

Iconography is a semantic information layer, not decoration. Phosphor is the current provider;
Nucleo UI is a future provider option. Application code MUST use the RITSEI `Icon` API and semantic
registry names such as `action.delete`, `object.invoice`, and `status.warning`; provider names and
imports remain inside `apps/web/src/ui/icons/providers/`.

Canonical usage is:

```text
Regular   default utility UI
Fill      selected or active state, selectively
Duotone   empty states, onboarding, and expressive contextual surfaces
```

The canonical scale is 14, 16, 18, 20, 24, and 32px. The default is 18px; dense controls use 16px.
Glyph size MUST NOT be confused with the containing control's interactive target. Icons default to
`currentColor`, with semantic tones for status and emphasis. Critical state MUST combine icon, text,
and color; icon-only controls MUST have an accessible name. Cartographic Identity remains a brand
and illustration layer, not a reason to stylize every utility icon.

See [ADR-0077](../decisions/0077-adopt-ritsei-iconography-system.md) for the decision record.

### Motion

Motion preserves the user's mental map. PandaCSS owns CSS transitions, keyframes, animation styles,
durations, easings, component states, and reduced-motion conditions. Motion owns only runtime geometry,
springs, gestures, reordering, orchestration, and complex SVG behavior. Solid owns state and lifecycle;
Kobalte owns accessible interaction semantics; business state remains outside the animation layer.

Canonical motion tokens are 0, 80, 120, 180, 240, and 320ms, with 2, 4, 8, and 16px spatial
distances. Motion MUST be causal, quiet, purposeful, interruptible, and state-driven. CSS is the
first choice; runtime animation requires a real geometry, gesture, physics, interruption, or
orchestration need. Reduced-motion users retain state feedback while unnecessary spatial traversal is
removed. Animation MUST NOT decide whether a command, transaction, authorization decision, or workflow
step succeeds.

The current runtime wrapper uses `motion@13.2.0` through `apps/web/src/ui/motion/`. Feature code MUST
not import Motion directly or use `motion/react`; it consumes the RITSEI wrapper. High-frequency
surfaces and Process Studio require interruption, unmount, reduced-motion, and performance testing.

See [ADR-0078](../decisions/0078-adopt-ritsei-motion-system.md) for the decision record.

### Drag and drop

The target direct-manipulation engine is the modern `@dnd-kit/solid@0.5.0` adapter. It owns sensors,
collision, sortable preview, constraints, overlays, auto-scroll, and drag accessibility; PandaCSS owns
drag-state appearance, Solid owns ephemeral interaction state, Motion owns only optional post-drop
continuity, and the domain owns the meaning and persistence of a drop.

Activation is currently **not_activated**. The published Solid adapter imports `solid-js/web`, which is
not exported by the repository's Solid 2 package layout. The compatibility probe records this as a
blocked build. RITSEI MUST NOT hide the failure with a Vite alias, Solid 1 compatibility shim, the
legacy React package family, or an application-wide drag context. No production feature may import the
adapter until a real Solid 2 build, pointer/keyboard interaction, accessibility, and reduced-motion
gate passes.

When activated, the provider boundary MUST be local to a meaningful interaction surface, drag handles
SHOULD be explicit for dense Process Studio nodes, and one transform owner applies at a time: dnd-kit
during active manipulation, Motion during custom post-drop settle, and the Process Studio viewport for
camera movement. A visual drop is intent, not business truth; final movement must become a validated
process command before persistence.

See [ADR-0079](../decisions/0079-gate-dnd-kit-solid2-activation.md) for the decision record.

## 11. Grid, geometry, and density

Precision Geometry is the stabilizer for expressive material:

```text
4px base grid
8px common rhythm
12 / 16 / 24 / 32px primary gaps
8–12px card radius
1px low-contrast borders
```

Rules:

- layout alignment MUST remain strict even when a cartographic layer is expressive;
- arbitrary spacing values MUST NOT appear in feature code;
- rounded corners MUST communicate grouping, not decorate every container;
- large continuous surfaces are preferred when grouping does not require cards; and
- the active density profile MUST be explicit and consistent within a workflow.

The initial density profiles are:

```text
comfortable  reading, review, and touch-heavy work
compact     default operational work
dense       high-volume tables and monitoring, only when readability evidence supports it
```

A dense profile MUST preserve target size, keyboard access, row association, and localization. Density
MUST NOT be used to hide required labels or remove error context.

## 12. Surface and elevation system

RITSEI has four surface types:

- **Base Canvas:** paper or dark mineral field; almost no shadow.
- **Content Surface:** tables, forms, documents, charts, and data regions; mostly flat.
- **Group Surface:** cards, KPI groups, summaries, and configuration blocks; slight tonal lift.
- **Interactive Surface:** selected items, inspectors, dropdowns, command menus, and floating
  controls; temporary depth is permitted.

Depth is applied in this order:

```text
tone → texture → border → blur → shadow
```

### Elevation levels

#### L0 — Background

Cartographic field or paper canvas.

```css
box-shadow: none;
```

#### L1 — Content Surface

Tables, forms, charts, and data regions.

```css
box-shadow: 0 1px 2px rgb(21 26 30 / 0.04);
```

#### L2 — Card / Panel

Grouped content only.

```css
box-shadow: 0 4px 12px rgb(21 26 30 / 0.06);
```

#### L3 — Interactive Surface

Dropdowns, inspectors, command palettes, and selected process nodes.

```css
backdrop-filter: blur(10px);
box-shadow: 0 8px 24px rgb(21 26 30 / 0.09);
```

Interactive glass opacity is controlled between `0.82` and `0.90`.

#### L4 — Modal / Popover

```css
backdrop-filter: blur(14px);
box-shadow: 0 18px 48px rgb(21 26 30 / 0.14);
```

L4 is the highest layer and MUST remain restrained.

Glass MUST NOT be used where it reduces contrast, hides an important boundary, increases motion or
power cost, or makes the underlying content harder to parse. It is never the default card treatment.

## 13. Cartographic Visual Grammar

Cartography is a representation system, not wallpaper. Its primitives are:

```text
Contour
Field
Route
Boundary
Marker
Density
Elevation
Pulse
Region
```

They represent:

| Primitive | Permitted semantic readings |
|---|---|
| Contour | density, pressure, activity, capacity, risk, complexity |
| Field | operating area, state distribution, ambient context |
| Route | movement, process, dependency, transaction path, material flow |
| Boundary | risk, policy, scope, ownership, threshold |
| Marker | event, milestone, location, exception, decision |
| Density | concentration, volume, workload, relationship intensity |
| Elevation | concentration, queue pressure, severity, capacity load |
| Pulse | active event, replenishment, pending movement, live activity |
| Region | grouped scope, forecast area, operating condition |

A primitive MUST have a declared semantic meaning in its projection contract. It MUST NOT be added
only to fill empty space.

Cartographic is a grammar for structure, relationship, pressure, movement, boundary, and state. It
MUST NOT be interpreted as a requirement to place maps or topographic contours on every page. The
business question selects the projection; finance, forms, tables, and ordinary record surfaces may
use restrained fields, boundaries, concentration, or no cartographic material at all.

### Topographic usage by surface

```text
Sidebar
→ medium density

Dashboard canvas
→ sparse

Charts
→ contextual

Process Studio
→ expressive

Inventory spatial view
→ expressive

Forms
→ almost none

Tables
→ none or extremely subtle

Modal background
→ contextual deformation
```

Topographic forms MUST NOT move text, break alignment, obscure focus, or sit behind a standard
enterprise table body.

### Paper material

Paper consists of:

```text
micro grain
low-frequency luminance variance
subtle directional fiber
very low contrast noise
```

The material MAY be static and SHOULD freeze when no scene changes. It MUST be imperceptible as a
texture asset and MUST NOT reduce text, chart, or control contrast.

## 14. Domain-adaptive visual language

Domains share one cartographic grammar but select different archetype compositions according to the
business question. The foundation is seven universal business archetypes:

| Archetype | Meaning | Visual grammar |
|---|---|---|
| **Stock** | Something available, stored, or held | density, mass, level |
| **Flow** | Something moving from one point or state to another | route, direction, velocity |
| **Capacity** | Load compared with ability or limit | pressure, compression, elevation |
| **Value** | Money, exposure, or value concentration | field, concentration, variance |
| **Relationship** | People, accounts, vendors, teams, or networks | nodes, proximity, connection |
| **Progress** | Work moving toward an outcome | path, milestones, blockage |
| **Asset / Space** | A thing or place with position and state | regions, boundaries, markers |

A domain may emphasize several archetypes while sharing the same visual language:

```text
Process       → Progress + Flow
Inventory     → Stock + Capacity + Flow + Asset / Space
Manufacturing → Stock + Flow + Capacity + Progress + Asset / Space
Procurement   → Relationship + Flow + Capacity + Value
Finance       → Value + Relationship + Flow + Capacity
CRM           → Relationship + Value + Progress
```

The projection is selected by the user's question:

```text
Movement + "Where is inventory going?"   → Flow
Movement + "What happened to this item?"  → Progress / Flow
Movement + "Where is inventory now?"      → Stock + Asset / Space
```

Industry composition is a combination of archetypes, not a new dashboard family:

```text
Retail        = Stock + Flow + Value + Relationship
Manufacturing = Stock + Flow + Capacity + Progress + Asset / Space
Logistics     = Flow + Capacity + Asset / Space + Progress
Banking       = Value + Relationship + Flow + Capacity
Consulting    = Progress + Capacity + Relationship + Value
Construction  = Progress + Asset / Space + Capacity + Stock + Value
Hospitality   = Capacity + Relationship + Stock + Value
Healthcare    = Capacity + Asset / Space + Flow + Relationship + Stock
Telecom       = Asset / Space + Flow + Capacity + Relationship + Value
Software/SaaS = Relationship + Capacity + Progress + Value
Education     = Relationship + Capacity + Progress + Asset / Space
Utilities     = Asset / Space + Flow + Capacity + Value
```

Do not create `ManufacturingDashboard`, `RetailDashboard`, or `ISPDashboard` as the primary
architecture. Compose approved archetypes, projections, and Product Patterns. The archetypes are
visual projection concepts; they do not own business facts, authorization, workflow state, or
domain invariants.

### Context-aware semantic mapping

A numeric value MUST NOT map to one universal visual operation. The semantic dimension and business
question determine the mapping:

```text
Inventory capacity ↑  → terrain elevation ↑
Risk ↑               → compression / pressure ↑
Movement ↑           → velocity ↑
Uncertainty ↑        → boundary softness ↑
Discrepancy ↑        → continuity breaks ↑
```

Examples include:

```text
Supplier risk         → pressure + contour density
Financial exposure    → concentration + depth
Machine failure risk  → local pulse + boundary
Project risk          → obstruction + path compression
Warehouse risk        → density + spatial pressure
```

The design system MUST NOT apply:

```text
high number → everything becomes higher
```

### Deterministic procedural variation

RITSEI distinguishes stable procedural variation from per-render randomness:

```text
randomness      ✗
variation       ✓
```

Renderer variation MUST be deterministic for the same stable entity identity, semantic state,
surface type, and design-token inputs. `Math.random()` or equivalent unbounded randomness MUST NOT
control the appearance of a business entity on each render.

```text
stable entity identity
      +
semantic state
      +
surface type
      +
design tokens
      ↓
stable seed
      ↓
procedural variation
```

The seed is an adapter input. Raw business identifiers MUST NOT be exposed to shaders when a derived
seed is sufficient. Entities with equal semantic state MAY have different stable field shapes, but
semantic comparability MUST remain intact.

### Semantic depth

UI depth remains the stable hierarchy defined in Section 12:

```text
L0 Canvas
L1 Content
L2 Card
L3 Interactive
L4 Modal
```

Semantic depth is different: it is the perceived depth of data inside a visual field. It MUST be
selected by archetype and meaning, not assigned randomly. Risk may use compression and contour
concentration; capacity may use elevation; movement may use velocity; uncertainty may use boundary
softness. Semantic depth MUST NOT replace explicit labels, semantic color, contrast, reduced-motion
behavior, or accessible alternatives.

### Material vocabulary

Cartographic renderers MAY use a generic material vocabulary broader than color and opacity:

```text
density
amplitude
compression
roughness
continuity
velocity
depth
blur
field radius
contour count
mass
level
concentration
boundary softness
proximity
pulse
```

Business semantics map into this vocabulary through a CPU-side visual projection. The material
vocabulary MUST NOT become a second domain model.

### Data-driven material variation

Material variation MAY respond to data and context when it expresses a declared business or system
state rather than random decoration:

| State or meaning | Permitted material response |
|---|---|
| Risk | Denser contours and stronger critical intensity |
| Capacity | Greater elevation or height |
| Flow | Directional lines or movement following the transaction direction |
| Idle / stable | Flatter, sparser, calmer field |
| Forecast | Softer or ghosted layer |
| Discrepancy | Broken contour or restrained jitter |
| Success / recovery | Lower density and a return toward the neutral palette |

Layout, typography, spacing, interaction behavior, and semantic labels MUST remain consistent. Only
the material layer and approved visual semantics vary. This gives RITSEI a consistent structure with
a surface that responds to business conditions rather than a different dashboard dialect on every
page.

A useful progression is:

```text
Low risk      → sparse, calm
Medium risk   → denser, warmer
High risk     → tight contour, critical red pressure
Recovered     → contour relaxes
```

Material variation MUST NOT override explicit text, semantic color, contrast, reduced-motion
behavior, or the accessible fallback.

## 15. Domain surfaces

### Dashboard

A dashboard MUST establish hierarchy:

```text
Page context
↓
Primary business state
↓
Operational field
↓
Key exceptions
↓
Supporting metrics
```

It MUST NOT default to twelve identical cards. The visual center is operational state, not KPI card
quantity.

### Inventory

Inventory represents business space. Approved data mappings include:

```text
stock_level
capacity
turnover
pick_frequency
reorder_risk
age
movement
```

```text
Contour rapat       → operational pressure tinggi
Elevation tinggi    → capacity concentration
Fast route          → high movement
Flat area           → stable inventory
Pulse               → replenishment needed
Broken contour      → discrepancy
```

### Process Studio

Process Studio visualizes business flow using the shared grammar:

```text
normal process → sparse contour
high activity  → dense contour
bottleneck     → contour convergence
critical state → elevated region
active event   → moving pulse
```

Its graph remains an editing representation, not business truth. See
[`process-studio.md`](./process-studio.md).

### Procurement

Procurement may visualize dependency and supply pressure:

```text
Supplier → Purchase Order → Transit → Receiving → Inventory
```

Route thickness MAY represent volume. Contour density MAY represent supplier risk. Markers MAY
represent delay or exception.

### Manufacturing

Manufacturing may represent production route, WIP density, work-center load, material dependency,
bottlenecks, and machine state. Elevation MAY represent queue pressure.

### Accounting and Finance

Finance MUST NOT be forced into a literal map. It MAY use abstract cartographic language for:

```text
cash position field
liquidity concentration
aging distribution
forecast region
risk boundary
```

Numbers, tables, auditability, exact arithmetic, and reconciliation status remain primary.

### CRM and Sales

CRM may use pipeline terrain, account relationships, deal movement, territory, and revenue
concentration. The primary CRM surface MUST remain scannable and operational.

## 16. Core component contracts

Every shared component has two contracts:

### Machine contract

Props, schemas, variants, slots, events, focus behavior, keyboard behavior, and accessibility
behavior.

### Human/product contract

Every important component and Product Pattern MUST document:

```text
USE WHEN
DO NOT USE FOR
REQUIRES
ACCESSIBILITY NOTES
EMPTY / LOADING / ERROR / DEGRADED BEHAVIOR
DENSITY AND RESPONSIVE BEHAVIOR
```

Example:

```text
DecisionCard

USE WHEN:
  an operational condition requires awareness or intervention.

DO NOT USE FOR:
  ordinary status, passive metrics, successful operations, or decoration.

REQUIRES:
  a clear condition, affected scope, consequence or impact, and a next action when available.
```

### Tables

Tables MUST remain semantic HTML. They MUST be dense but readable and support:

```text
sticky headers
strong numeric alignment
minimal zebra striping
semantic status
subtle row selection
keyboard navigation
```

Canvas MUST NOT replace a standard enterprise table.

### Forms

Forms are functional objects:

```text
paper surface
1px border
clear focus state
terrain-blue interaction
minimum decorative material
```

Forms MUST expose labels, validation, error association, keyboard order, and recovery guidance.

### Buttons

- Primary uses Contour Blue (`#365A72`) through a semantic action token.
- Secondary uses paper or transparent surface with a structural border.
- Danger uses semantic critical treatment.
- Gold MUST NOT be a normal CTA.
- Labels MUST name the action and remain consistent with the resulting confirmation.

### Navigation

RITSEI uses a hybrid navigation shell. This is a semantic split, not a 50/50 compromise:

```text
Sidebar       → global structure and stable landmarks
Topbar        → global operating context and utilities
Local nav     → active domain area
Context header→ current object or operational situation
Commands      → current domain actions
```

The sidebar is a valid cartographic anchor:

```text
Topo Ink + very subtle contour field
active item → terrain-blue region
```

The sidebar MUST remain broad and stable. It MAY contain `My Work`, `Attention`, broad Operations
areas, `Processes`, and `Analytics`, but MUST NOT become a database table of contents with every
record type, filter, or action. Detail navigation belongs in the active workspace as local tabs or
sections.

The topbar MUST remain thin and utility-oriented. It carries tenant, company, location, fiscal
context, search, notifications, help, and identity. It MUST NOT carry the complete application
navigation or business-object commands. Business-object identity, lifecycle, and primary actions
belong in the contextual page/object header below the topbar.

The shell follows this reading order:

```text
Sidebar       → where am I?
Topbar        → under which operating context am I working?
Page header   → what am I working on?
Content       → what is happening?
Commands      → what can I do?
```

The sidebar MUST be collapsible rather than permanently icon-only. Expanded and collapsed states
must preserve labels, keyboard access, current-location indication, and accessible names. Initial
shell targets are approximately:

```text
Global topbar       48px
Context header      56–72px
Local navigation    40px
Sidebar expanded    220–240px
Sidebar collapsed   56–64px
```

The shell must protect content width for dense enterprise tables, financial reports, ledgers, bills
of materials, planning surfaces, and Process Studio. Avoid stacking a large sidebar, large header,
breadcrumbs, tabs, toolbars, and filters when one semantic layer can carry the same information.

Contour contrast MUST remain low enough that navigation labels and current location dominate.

### Cards

Cards are used only when grouping is needed. Avoid card-inside-card, every-metric-as-card,
all-white floating panels, and excessive shadows. Large continuous surfaces are preferred when they
make the information architecture clearer.

### Charts

Charts MUST remain accurate and readable. Cartographic material MAY provide terrain area, contour
density, route, field, marker, or forecast fog, but labels, tooltips, units, currency, missing data,
freshness, degraded state, and accessible textual/table alternatives remain explicit.

### Icons and status

Icons are geometric and precise with low personality and approximately 1.5–2px stroke. Brand
personality comes from composition and material, not icon gimmicks.

Badges are used sparingly. Important state combines semantic color with label, icon, shape, or border;
color alone is prohibited.

### Empty and loading states

Empty states MAY use a sparse contour illustration, paper field, minimal route, and small brass
marker. They MUST explain what is empty and what the user can do next.

Loading states MAY use a quiet terrain, gentle pulse, or contour propagation. They MUST be low-power,
respect reduced motion, and preserve a semantic loading label.

## 17. Interaction, drag, and accessibility rules

Drag and drop is an interaction enhancement, not a business semantic. It MAY use the Solid dnd-kit
adapter behind a RITSEI interaction adapter.

```text
dnd-kit state
      ↓
RITSEI interaction vocabulary
      ↓
validated application intent
      ↓
Process IR or owning public command
```

Pointer drag, keyboard movement, and structured-form editing MUST produce equivalent semantic
operations where editing is required. Focus restoration, announcements, collision behavior,
undo/redo, and cancellation are part of the contract. DOM coordinates MUST NOT become Process IR,
authorization, or persistence state.

Kobalte is the single headless accessibility source behind RITSEI-owned components. Feature code MUST
NOT import Kobalte, dnd-kit, Panda-generated artifacts, or renderer libraries directly.

The pinned Kobalte Solid 2 alpha is permitted under an explicit `approved_with_risk` evidence record.
The known RC peer-range mismatch is accepted only while the compatibility/build checks and the
browser behavior test pass; a failed compatibility or behavior check remains blocked. Production
approval is per exercised primitive, not global: each activated primitive requires a RITSEI wrapper,
an application usage path, and a browser interaction/accessibility test. Unused or untested Kobalte
primitives are not approved. Native semantic HTML remains the fallback and rollback path.

The material layer MUST NOT carry information by itself. Canvas and WebGPU are never substitutes for
semantic DOM, accessible labels, keyboard access, or text/table alternatives.

Analytical visualizations SHOULD use a hybrid composition: a visual canvas or SVG scene, a DOM
summary, and an accessible data or table view. Pointer picking MAY update a Solid selection, but the
explanation, tooltip, popover, or dialog remains DOM-owned and uses the RITSEI/Kobalte interaction
boundary. Decorative canvas output SHOULD be marked `aria-hidden="true"`.

All interactive controls MUST provide:

- visible keyboard focus;
- a logical tab order;
- an accessible name and role;
- an error or status announcement when needed;
- a target size appropriate to the interaction context; and
- behavior that remains understandable at 200% zoom and with long localized content.

## 18. Motion system

Motion explains change; it does not make a static screen look premium.

```text
Utility motion     120–180ms  hover, focus, selection
Structural motion  180–280ms  panels, navigation, inspector
Semantic motion    dynamic    process, inventory movement, events, bottlenecks
```

Semantic motion MAY be more expressive, but MUST be bounded by visibility, power, and reduced-motion
rules. Respect:

```css
@media (prefers-reduced-motion: reduce)
```

Reduced motion MUST disable or replace particle flows, terrain animation, dynamic distortion, and
continuous parallax. Static contour MAY remain.

### Static-first rendering

ERP scenes MUST default to static or event-driven rendering rather than a permanent 60 FPS loop:

```text
STATIC
──────

data changes
    ↓
render()
    ↓
GPU idle
```

A bounded active loop MAY run for pointer interaction, a visible transition, an operational flow, or
another declared semantic change, then SHOULD stop when the activity settles:

```text
ACTIVE
──────

pointer / transition / flow
          ↓
      bounded loop
          ↓
 animation settles
          ↓
         stop
```

Static topology, paper grain, and unchanged inputs SHOULD be baked or cached. Continuous animation
is reserved for a real-time operational need and MUST be visibility-aware, throttled, and allowed a
reduced-quality mode. Solid signals MUST carry semantic changes, not frame counters; renderer-owned
time, delta, particles, simulation, scheduling, and frame submission stay behind the renderer
adapter.

## 19. HTML, CSS, SVG, Canvas, and WebGPU

HTML remains the application and semantic layer. The default implementation balance is:

```text
HTML / CSS / SVG     85–95%
Canvas / WebGPU       5–15%
```

This is a target for composed visual experiences, not a requirement that every route use a GPU. A
standard form, table, or record editor MAY be 100% semantic HTML/CSS.

### Renderer ownership

```text
Application / Solid / HTML
│
├── Forms
├── Tables
├── Navigation
├── Typography
├── Accessibility
│
└── Optional material and visualization adapters
     ├── TopologyField
     ├── Contour
     ├── PaperGrain
     ├── OpticalSurface
     ├── AmbientDepth
     └── DataPulse
```

The cartography contract receives typed visual intent from a domain/application projection. The
selected WebGPU implementation is `vgpu`, but it is reachable only through a RITSEI-owned renderer
adapter:

```text
Domain projection
      ↓
typed visual intent
      ↓
RITSEI cartography contract
      ├── SVG / Canvas / CSS fallback
      └── vgpu adapter
                ↓
             WebGPU
```

WebGPU MAY handle procedural topology, dense visualization, field deformation, data-driven contour,
particle movement, extremely dense charts, spatial visualization, and material rendering. It MUST
NOT own semantics, fetching, authorization, business aggregation, workflow state, or authoritative
facts. Feature and domain code MUST NOT import `vgpu` or raw WebGPU objects directly.

### Progressive enhancement

The fallback hierarchy is mandatory:

```text
vgpu / WebGPU
↓
Canvas 2D / SVG
↓
CSS
↓
Static semantic UI
```

If WebGPU is unavailable, denied, too expensive, or fails at runtime, the application MUST remain
fully usable. No critical action, value, status, or relationship may exist only in a GPU scene.

### Renderer selection

Use CSS for simple blur, shadow, opacity, minor masks, basic texture, and static illusions.

Use SVG for small contours, simple routes, vector distortion, and a small number of interactive
paths.

Use the `vgpu` adapter only when measured need includes thousands of objects, dynamic topology,
continuous fields, massive data, real-time deformation, particle visualization, or complex
data-driven material that lower layers cannot satisfy.

A modal pressure effect with only 2–3px deformation belongs in CSS or SVG. WebGPU is justified only
when the contour field is procedural and materially spans the application scene.

`vgpu` is the selected optional renderer, not a commitment to expose its API or to add it before the
activation gate passes. TypeGPU is deferred for a future GPU-compute-centered subsystem and is not a
current RITSEI renderer dependency. Activation requires an implementation spike and the evidence in
Section 23.

## 20. Shadow, glass, and material constraints

Shadow only confirms hierarchy. Paper provides physical depth, geometry provides structural depth,
cartography provides spatial depth, and glass provides temporary interactive depth.

Optical glass is limited to approximately 5% of the visual language and is approved only for:

```text
command palette
floating filter
quick inspector
selected overlay
popover
modal controls
```

Reference constraints:

```text
Blur          8–16px
Opacity       0.82–0.92
Distortion    0–1.5px
Border        translucent 1px
Highlight     extremely subtle
```

Never use huge blur, rainbow reflection, strong transparency, or large glass cards everywhere.
Contrast and performance evidence are required before a shared glass recipe is activated.

## 21. Token and styling contract

The token hierarchy is:

```text
primitive
   ↓
semantic
   ↓
component
   ↓
state
```

Example:

```css
--color-terrain-700: #365A72;
--color-action-primary: var(--color-terrain-700);
--button-primary-background: var(--color-action-primary);
```

The canonical primitive names in this document (`--topo-950`, `--terrain-700`, and so on) may be
mapped to Panda token names such as `colors.topo.950`. Feature code consumes semantic aliases, not
primitive values.

Panda CSS is the selected styling substrate. The constrained RITSEI authoring surface is:

```text
semantic tokens
config recipes
config slot recipes
approved layout patterns
approved conditions
css() as an exceptional, reviewed escape hatch
```

Feature code MUST NOT use:

- raw foundation colors;
- arbitrary spacing values;
- broad styled JSX props;
- unapproved recipes;
- vendor-specific primitive styling; or
- hard-coded material intensity in a feature component.

Material tokens are centrally controlled:

```css
--material-paper-grain: 0.018;
--material-contour-opacity: 0.08;
--material-contour-density: 0.4;

--glass-blur-interactive: 10px;
--glass-blur-modal: 14px;

--glass-opacity-interactive: 0.86;
--glass-opacity-modal: 0.90;
```

Theme, density, high-contrast, and reduced-motion variants MUST be expressed through semantic
variants and recipes rather than ad hoc feature overrides.

## 22. Frontend location and dependency boundaries

The initial implementation remains inside the single frontend application. `apps/web/src/ui/` is a
dedicated, RITSEI-owned internal library, not part of an individual feature. A library boundary does
not require a separately published package. Do not create a separate `packages/design-system`
package until measured cross-application reuse or an independent build, release, enforcement, or
compatible-consumer need justifies it.

This applies the ownership decisions in ADR-0056 and ADR-0057 without changing their engines or
activation gates. The backend taxonomy in
[`ADR-0068`](../decisions/0068-establish-foundation-modules-platform-runtime-taxonomy.md) remains
unchanged: business modules live in `modules/`, not in new `packages/accounting`,
`packages/procurement`, or `packages/inventory` directories.

```text
apps/web/src/
├── ui/
│   ├── foundations/
│   ├── primitives/
│   ├── internal/               # implementation helpers, not feature contracts
│   ├── recipes/
│   ├── patterns/
│   ├── grammar/
│   ├── interaction/
│   └── renderers/
│       ├── cartography/
│       └── cartography-gpu/
├── features/
│   └── <domain>/
│       ├── projections/
│       ├── queries/
│       ├── forms/
│       └── ui/
└── app/
    ├── shell/
    ├── router/
    └── providers/
```

This is a target organization, not a requirement to scaffold every directory or component before a
consumer needs it.

### Component placement and promotion

Visual reuse alone does not make a component part of the shared UI library. Classify it by the
knowledge and behavior it owns:

| Responsibility | Location | Examples and limits |
|---|---|---|
| Design foundations | `ui/foundations/`, with styling in `ui/recipes/` | Token definitions, typography, spacing, density, and approved icon assets; not business lifecycle enums |
| Generic controls | `ui/primitives/` | `Button`, `Input`, `Dialog`, `Select`, `Tabs`, `Badge`, `FormField`; no domain lookup or command |
| Reusable compositions and Product Patterns | `ui/patterns/` | `DataTable`, bounded `RitseiVirtualList`, `FilterBar`, `EntityWorkspace`, generic approval composition; caller-supplied data, labels, slots, and intents |
| Domain presentation | `features/<domain>/{ui,forms,tables,projections}/` | `JournalEntryTable`, `InvoicePaymentStatus`, `SupplierPicker`, `PurchaseOrderApprovalDialog`; compose shared UI rather than copy its behavior or styling |
| Application composition | `app/shell/`, routes, and providers | Concrete navigation, tenant/workspace composition, and runtime wiring; generic navigation controls can remain in shared UI |

The token → primitive → composite → domain component → application sequence describes composition,
not five mandatory packages or a replacement for the semantic layers in Section 4. Product Patterns,
Interaction Grammar, and Visual Grammar still govern how components are composed.

“Domain-agnostic” means independent of a particular domain's facts, policy, and workflows; it does
not mean devoid of business vocabulary. ADR-0057's `MoneyField`, `QuantityField`, and `PartyField`
remain valid shared semantic controls when their value/formatting contracts and caller-supplied
options are reusable. A `PartyField` does not silently become a `SupplierPicker` that fetches
Procurement data or decides supplier eligibility. Likewise, a generic `Badge` renders a supplied
label and semantic state; the feature owns the mapping from an invoice's public status to that
presentation, without inventing new business truth.

Use these promotion rules:

- Reuse an existing shared control or Product Pattern before adding another one.
- Keep a new domain composition with its owning feature even if several screens use it. Another
  feature may consume an intentional public presentation export from that owner, not its private
  files; dependencies MUST remain acyclic. Cross-feature use does not make it generic UI.
- Promote a new generic composition only for demonstrated common behavior or an approved core
  Product Pattern, with the contracts and evidence in Section 23. Similar markup alone is not
  evidence; avoid a universal component with branches for each domain.
- Keep non-visual transport, routing, and application helpers in their existing frontend owners
  under `shared/`, not in UI or a catch-all `frontend-utils` library.

Feature UI imports RITSEI UI contracts through stable public leaf modules such as
`ui/foundations/*`, `ui/primitives/*`, `ui/recipes/*`, `ui/patterns/*`, `ui/grammar/*`,
`ui/interaction/*`, `ui/renderers/cartography/*`, `ui/icons/*`, and `ui/motion/*`; it must not
import private adapters or generated Panda artifacts. Named subsystem
entrypoints such as `ui/icons/index.ts` and `ui/motion/index.ts` are allowed only when they expose
that subsystem's semantic API; they are not substitutes for the root facade. The UI boundary has no
catch-all root barrel. `apps/web/src/ui/styles.ts` is the sole stylesheet bootstrap and is
imported once by `src/main.tsx` and the Storybook preview, never as a side effect of importing a
component or recipe. Only the internal UI layer imports Kobalte, Panda-generated artifacts, dnd-kit,
chart adapters, Canvas, or WebGPU renderers. Shared UI MUST NOT import features, routes, application
composition, domain API clients, or domain-specific DTOs. It may consume frontend-safe shared value
contracts, but MUST NOT own fetching, query-cache policy, or business command execution. Those
responsibilities remain at the frontend application/feature boundaries defined in
[`frontend.md`](./frontend.md). Backend implementations, Drizzle tables, repositories, and private
services remain forbidden frontend dependencies.

### Cross-application extraction gate

An additional screen, feature consumer, or component playground is not evidence of a second
application. Before extracting a shared frontend package, record:

- actual consuming applications and which stable contracts they share;
- a named owner, public exports, compatibility expectations, and consumer migration plan;
- Solid/compiler and Panda source-generation boundaries that work for every consumer; and
- import-boundary, build, interaction, accessibility, and visual-regression checks for the shared
  library and its consumers.

Extract only the proven shared surface. Tokens and icons MAY remain part of that library; separate
`tokens`, `icons`, or `<domain>-ui` packages require their own consumer and ownership justification.
Domain presentation remains domain-owned even when extracted and MUST NOT be bundled into generic UI
or a backend module's browser-unsafe entry point. Package paths and names such as `@ritsei/ui` are
not activated by this document. An extraction proposal must reconcile ADR-0056's application-local
Panda output and ADR-0049's compiler boundary through the existing ADR workflow before changing
those decisions; it must not silently move generated artifacts or introduce independent release
infrastructure.

The current Process Studio model and prototype files are exploratory application material. They do
not activate the production design-system contract and MUST NOT be treated as evidence that Panda,
Kobalte, or WebGPU is already available.

## 23. Activation, validation, and governance

A Product Pattern, shared component, Visual Grammar primitive, or renderer adapter is not complete
until it has:

- a named semantic problem;
- a `USE WHEN` and `DO NOT USE FOR` contract;
- machine-typed props, variants, slots, and events;
- keyboard and screen-reader behavior;
- empty, loading, error, and degraded behavior;
- density, responsive, zoom, and localization review;
- contrast and high-contrast evidence;
- reduced-motion behavior;
- a component or interaction test when behavior is non-trivial; and
- visual regression coverage when a shared visual contract changes.

Frontend activation gates include:

- Vite and SolidJS 2 compatibility;
- Kobalte focus, keyboard, and screen-reader behavior;
- constrained Panda token, recipe, slot, density, theme, reduced-motion, and high-contrast
  enforcement;
- dnd-kit pointer/keyboard parity where used;
- deterministic renderer output and accessible fallbacks;
- the same renderer adapter contract in browser, headless Node, and deterministic mock paths;
- `vgpu/node` headless validation and `vgpu/mock` CI coverage when the adapter is activated;
- bundle, route, frame-time, memory, and interaction performance measurements;
- no permanent GPU animation for static scenes;
- power behavior during long-lived enterprise sessions; and
- no forbidden vendor imports outside the internal UI layer.

WebGPU activation additionally requires:

- a semantic HTML fallback that remains fully usable;
- device capability detection and runtime failure recovery;
- visibility-based rendering and static-frame caching;
- bounded frame rate and reduced-quality mode;
- measured benefit over SVG, Canvas, or CSS for the target workload; and
- evidence that the scene does not expose business or authorization semantics only through pixels.

Agents and feature teams MUST compose existing Product Patterns, use semantic variants, preserve
backend authority, and propose a new pattern when repeated decisions cannot be expressed. They MUST
NOT create industry-specific dashboard families, use color alone for state, or bypass the renderer
boundary because a local visual effect is convenient.

### Design artifacts and implementation authority

The design system is the governed language and its contracts, not a Figma file, component package,
or component catalog alone:

| Artifact | Role |
|---|---|
| This specification | Canonical semantic, interaction, visual, and usage rules |
| Figma or another design tool, when used | Design exploration, specifications, and review; not executable implementation authority |
| Version-controlled token and recipe sources | Machine-readable implementation of approved design decisions; generated Panda/CSS output is derived, not a separately edited source |
| RITSEI-owned UI source and tests | Executable component contracts and behavior |
| Component documentation/playground, when introduced | Demonstrates the actual shared implementation and its states; not an alternative implementation or a second specification |

Design-system owners review shared token, recipe, and component changes; feature owners retain
responsibility for domain presentation and semantic mappings. A mismatch between design artifacts,
this specification, and code MUST be resolved with the relevant owner, not silently accepted as a
new rule. Update usage guidance and regression evidence with the implementation; document breaking
contract changes and their consumer migration.

Storybook is a development-only documentation and review tool, not a prerequisite for reuse.
The current setup under `apps/web/.storybook/` is intentionally small: it verifies the repository's
SolidJS 2, Vite, and styling integration with production UI recipes and controlled fixtures. It must
not use real tenant data or credentials, fork token sources, or become a second component
implementation. Its presence does not replace accessibility, interaction, visual-regression, or
representative workflow evidence.

## 24. Non-goals

This design system does not:

- define backend business semantics or authorization;
- define Process IR or Process Studio runtime semantics;
- select a chart, graph, map, or canvas engine for every visual grammar;
- adopt TypeGPU as a GPU application or compute platform before a measured requirement and separate ADR;
- require WebGPU, SSR, SolidStart, or a universal metadata-driven UI framework;
- add frontend dependencies before an implementation spike and activation gate;
- replace frontend state ownership in ADR-0048; or
- turn visual material into a second domain model.

## 25. Final formula

```text
55% Cartographic Structure
25% Architectural Paper
15% Precision Geometry
 5% Optical Glass
```

With implementation balance:

```text
85–95% HTML / CSS / SVG
 5–15% Canvas / WebGPU
```

As a non-normative screen-level design philosophy:

```text
90% deterministic structure
 8% semantic procedural variation
 2% entity-specific variation
```

This is not an engineering budget or a literal pixel allocation. It is a guardrail that keeps layout,
typography, spacing, interaction, and accessibility stable while allowing data-driven material
expression.

The selected optional WebGPU implementation is `vgpu` behind a RITSEI-owned adapter. The most
important rule remains:

> **HTML owns interaction and semantics. WebGPU owns optional material, field, density, and
> high-complexity visualization.**

RITSEI should feel like an operating landscape, not a pile of cards. A screen is a readable business
landscape: navigable, precise, expressive when useful, and quiet when decoration would obscure the
work.
