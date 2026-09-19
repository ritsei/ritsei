import { useLocation, useNavigate } from "@solidjs/router"
import { logout as logoutSession } from "./auth-client.ts"
import type { JSX } from "@solidjs/web"
import {
  createMemo,
  createSignal,
  Errored,
  For,
  Loading,
  onSettled,
  Show,
  untrack,
  useContext,
} from "solid-js"
import { layout } from "../ui/foundations/layout.ts"
import { ConfirmDialog } from "../ui/patterns/confirm-dialog.tsx"
import { Button } from "../ui/primitives/button.tsx"
import { SessionContext } from "./session.ts"

type NavigationItem = Readonly<{
  label: string
  marker: string
  href?: string
  unavailableReason?: string
}>

type NavigationSection = Readonly<{
  label: string
  items: readonly NavigationItem[]
}>

const navigationSections: readonly NavigationSection[] = [
  {
    label: "Work",
    items: [
      { label: "My work", marker: "MW", href: "/" },
      {
        label: "Attention",
        marker: "AT",
        unavailableReason: "Attention projections are not connected yet.",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Revenue", marker: "RV", href: "/sales" },
      { label: "Supply", marker: "SP", href: "/procurement" },
      { label: "Inventory", marker: "IN", href: "/inventory" },
      { label: "Finance", marker: "FI", href: "/accounting" },
    ],
  },
  {
    label: "Processes",
    items: [
      { label: "Process Studio", marker: "PR", href: "/processes" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Parties", marker: "PT", href: "/parties" },
      { label: "User accounts", marker: "UA", href: "/user-accounts" },
      { label: "Access", marker: "AC", href: "/access" },
    ],
  },
  {
    label: "Insight",
    items: [
      {
        label: "Analytics",
        marker: "AN",
        unavailableReason: "Analytics remains outside the current frontend slice.",
      },
    ],
  },
]

type LocalNavigation = Readonly<{
  area: string
  items: readonly Readonly<{ label: string; href: string }>[]
}>

// Fallow: this explicit route table is the shell's local-navigation authority.
// fallow-ignore-next-line complexity
const localNavigationFor = (pathname: string): LocalNavigation => {
  if (pathname.startsWith("/user-accounts")) {
    return { area: "Identity", items: [{ label: "Accounts", href: "/user-accounts" }] }
  }
  if (pathname.startsWith("/parties")) {
    return { area: "Party", items: [{ label: "Parties", href: "/parties" }] }
  }
  if (pathname.startsWith("/access")) {
    return { area: "Authorization", items: [{ label: "Access", href: "/access" }] }
  }
  if (pathname.startsWith("/procurement")) {
    return { area: "Supply", items: [{ label: "Procurement", href: "/procurement" }] }
  }
  if (pathname.startsWith("/inventory")) {
    return { area: "Inventory", items: [{ label: "Overview", href: "/inventory" }] }
  }
  if (pathname.startsWith("/sales")) {
    return { area: "Revenue", items: [{ label: "Sales", href: "/sales" }] }
  }
  if (pathname.startsWith("/accounting")) {
    return { area: "Finance", items: [{ label: "Accounting", href: "/accounting" }] }
  }
  if (pathname.startsWith("/processes")) {
    return { area: "Processes", items: [{ label: "Process Studio", href: "/processes" }] }
  }
  return { area: "Work", items: [{ label: "Overview", href: "/" }] }
}

const compactTenantId = (tenantId: string): string =>
  `${tenantId.slice(0, 8)}…${tenantId.slice(-4)}`

const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable)

function ContextItem(props: {
  label: string
  value: string
  title?: string
  optional?: boolean
  code?: boolean
}) {
  return (
    <span
      class={[layout.contextItem, props.optional && layout.contextItemOptional]}
      title={props.title}
    >
      <span class={layout.contextLabel}>{props.label}</span>
      <span class={[layout.contextValue, props.code && layout.contextCode]}>{props.value}</span>
    </span>
  )
}

function NavigationEntry(props: {
  item: NavigationItem
  collapsed: boolean
  closeMobile: () => void
  captureFirst?: (element: HTMLAnchorElement) => void
}) {
  const item = untrack(() => props.item)
  const closeMobile = untrack(() => props.closeMobile)
  const captureFirst = untrack(() => props.captureFirst)
  const labelClass =
    () => [layout.navigationLabel, props.collapsed && layout.navigationLabelCollapsed]
  return item.href
    ? (
      <a
        ref={(element) => captureFirst?.(element)}
        href={item.href}
        class={layout.navigationItem}
        aria-label={item.label}
        title={props.collapsed ? item.label : undefined}
        onClick={closeMobile}
      >
        <span class={layout.navigationMarker} aria-hidden="true">{item.marker}</span>
        <span class={labelClass()}>{item.label}</span>
      </a>
    )
    : (
      <span
        class={[layout.navigationItem, layout.navigationItemUnavailable]}
        role="link"
        aria-disabled="true"
        aria-label={`${item.label}, unavailable`}
        title={item.unavailableReason}
      >
        <span class={layout.navigationMarker} aria-hidden="true">{item.marker}</span>
        <span class={labelClass()}>{item.label}</span>
      </span>
    )
}

// Fallow: the shell intentionally orchestrates responsive navigation, session state, and workspace layout.
// fallow-ignore-next-line complexity
export function ApplicationShell(props: { children: JSX.Element }) {
  const session = useContext(SessionContext)
  const location = useLocation()
  const navigate = useNavigate()
  const [dark, setDark] = createSignal(false)
  const [collapsed, setCollapsed] = createSignal(false)
  const [compact, setCompact] = createSignal(globalThis.matchMedia("(max-width: 767px)").matches)
  const [mobileOpen, setMobileOpen] = createSignal(false)
  const localNavigation = createMemo(() => localNavigationFor(location.pathname))
  let navigationToggle: HTMLButtonElement | undefined
  let firstNavigationLink: HTMLAnchorElement | undefined

  const navigationExpanded = () => compact() ? mobileOpen() : !collapsed()
  const toggleLabel = () => navigationExpanded() ? "Collapse navigation" : "Open navigation"

  const toggleNavigation = () => {
    if (compact()) {
      const opening = !mobileOpen()
      setMobileOpen(opening)
      if (opening) queueMicrotask(() => firstNavigationLink?.focus())
      return
    }
    setCollapsed(!collapsed())
  }

  const closeMobileNavigation = () => {
    if (compact()) setMobileOpen(false)
  }

  const dismissMobileNavigation = () => {
    if (!compact() || !mobileOpen()) return
    setMobileOpen(false)
    queueMicrotask(() => navigationToggle?.focus())
  }

  onSettled(() => {
    const media = globalThis.matchMedia("(max-width: 767px)")
    const handleViewport = (event: MediaQueryListEvent) => {
      setCompact(event.matches)
      if (!event.matches) setMobileOpen(false)
    }
    // Fallow: keyboard shortcuts intentionally combine Escape dismissal and navigation toggle paths.
    // fallow-ignore-next-line complexity
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mobileOpen()) {
        event.preventDefault()
        dismissMobileNavigation()
        return
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "b" &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault()
        toggleNavigation()
      }
    }
    media.addEventListener("change", handleViewport)
    document.addEventListener("keydown", handleKeyboard)
    return () => {
      media.removeEventListener("change", handleViewport)
      document.removeEventListener("keydown", handleKeyboard)
    }
  })

  return (
    <div data-theme={dark() ? "dark" : "light"} class={layout.page}>
      <a class={layout.skip} href="#main">Skip to content</a>
      <header class={layout.topbar}>
        <a href="/" aria-label="RITSEI home" class={layout.brand}>
          <img src="/logo.svg" alt="" class={layout.brandLogo} />
        </a>
        <Button
          ref={(element) => navigationToggle = element}
          iconOnly
          type="button"
          class={layout.navigationToggle}
          aria-label={toggleLabel()}
          aria-controls="global-navigation"
          aria-expanded={navigationExpanded() ? "true" : "false"}
          title={`${toggleLabel()} (⌘B or Ctrl+B)`}
          onClick={toggleNavigation}
        >
          <span aria-hidden="true">{navigationExpanded() ? "‹" : "›"}</span>
        </Button>
        <div class={layout.contextStrip} aria-label="Operating context">
          <Show
            when={session.current()}
            keyed
            fallback={<ContextItem label="Session" value="Not connected" />}
          >
            {(current) => (
              <>
                <Show
                  when={session.tenants().length > 1}
                  fallback={
                    <ContextItem
                      label="Tenant"
                      value={compactTenantId(current.tenantId)}
                      title={current.tenantId}
                      code
                    />
                  }
                >
                  <label class={layout.contextItem}>
                    <span class={layout.contextLabel}>Tenant</span>
                    <select
                      aria-label="Active tenant"
                      value={current.tenantId}
                      onChange={(event) => session.selectTenant(event.currentTarget.value)}
                    >
                      <For each={session.tenants()}>
                        {(tenant) => (
                          <option value={tenant.tenantId}>
                            {compactTenantId(tenant.tenantId)}
                          </option>
                        )}
                      </For>
                    </select>
                  </label>
                </Show>
                <ContextItem label="Company" value="Not selected" optional />
                <ContextItem label="Location" value="Not selected" optional />
                <ContextItem label="Fiscal context" value="Not selected" optional />
              </>
            )}
          </Show>
        </div>
        <div class={layout.topbarActions}>
          <span class={layout.previewBadge}>Development</span>
          <Button
            type="button"
            aria-pressed={dark() ? "true" : "false"}
            onClick={() => setDark(!dark())}
          >
            Dark theme
          </Button>
          <Show when={session.current()}>
            <ConfirmDialog
              triggerLabel="Sign out"
              title="Sign out of RITSEI?"
              description="Your in-memory session credentials will be cleared."
              confirmLabel="Sign out"
              onConfirm={() => {
                const current = session.current()
                if (current !== null) void logoutSession(current.token).catch(() => undefined)
                session.replace(null)
                navigate("/", { replace: true })
              }}
            />
          </Show>
        </div>
      </header>

      <div class={[layout.shellBody, collapsed() && layout.shellBodyCollapsed]}>
        <Show when={compact() && mobileOpen()}>
          <button
            type="button"
            class={layout.navigationBackdrop}
            aria-label="Close navigation"
            onClick={dismissMobileNavigation}
          />
        </Show>
        <aside
          id="global-navigation"
          class={layout.sidebar}
          data-mobile-open={mobileOpen() ? "true" : "false"}
          data-collapsed={collapsed() ? "true" : "false"}
          aria-label="Global navigation"
          aria-hidden={compact() && !mobileOpen() ? "true" : undefined}
          inert={compact() && !mobileOpen() ? true : undefined}
        >
          <nav aria-label="Primary" class={layout.navigation}>
            <For each={navigationSections}>
              {(section, sectionIndex) => (
                <section class={layout.navigationSection} aria-label={section.label}>
                  <h2
                    class={[
                      layout.navigationSectionLabel,
                      collapsed() && layout.navigationSectionLabelCollapsed,
                    ]}
                  >
                    {section.label}
                  </h2>
                  <div class={layout.navigationList}>
                    <For each={section.items}>
                      {(item, itemIndex) => (
                        <NavigationEntry
                          item={item}
                          collapsed={collapsed()}
                          closeMobile={closeMobileNavigation}
                          captureFirst={sectionIndex() === 0 && itemIndex() === 0
                            ? (element) => firstNavigationLink = element
                            : undefined}
                        />
                      )}
                    </For>
                  </div>
                </section>
              )}
            </For>
          </nav>
          <p
            class={[
              layout.sidebarNote,
              collapsed() && layout.sidebarNoteCollapsed,
            ]}
          >
            Backend authorization remains authoritative.
          </p>
        </aside>

        <div class={layout.workspace}>
          <div class={layout.localNavigation}>
            <span class={layout.localArea}>{localNavigation().area}</span>
            <nav
              aria-label={`${localNavigation().area} sections`}
              class={layout.localNavigationLinks}
            >
              <For each={localNavigation().items}>
                {(item) => <a href={item.href}>{item.label}</a>}
              </For>
            </nav>
          </div>
          <main id="main" tabindex="-1" class={layout.main}>
            <Errored
              fallback={
                <section class={layout.stack}>
                  <h1>Workspace unavailable</h1>
                  <p role="alert">This page could not load. Reload the browser to try again.</p>
                </section>
              }
            >
              <Loading fallback={<p role="status">Loading workspace…</p>}>
                {props.children}
              </Loading>
            </Errored>
          </main>
        </div>
      </div>
    </div>
  )
}
