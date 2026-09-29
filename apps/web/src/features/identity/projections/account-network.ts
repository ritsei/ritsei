import type { UserAccount } from "../../../shared/contracts/generated/identity.ts"
import { projectVisualIntent } from "../../../ui/grammar/projection.ts"
import type { VisualIntent } from "../../../ui/grammar/visual-intent.ts"

export const projectAccountNetwork = (
  accounts: readonly UserAccount[],
): VisualIntent => {
  const active = accounts.filter((account) => account.status === "active").length
  const disabled = accounts.length - active
  const activity = accounts.length === 0 ? 0 : active / accounts.length
  const status = accounts.length === 0 ? "empty" : "ready"

  return projectVisualIntent({
    variationKey: "identity.tenant-account-network",
    archetypes: ["relationship", "capacity"],
    primitives: ["field", "density", "marker", "boundary"],
    dimension: "relationship",
    value: activity,
    semantics: {
      label: "Tenant account relationships",
      description: "A visual summary of linked accounts. The account table remains authoritative.",
    },
    fallback: {
      summary: accounts.length === 0
        ? "No account relationship data is available for this tenant."
        : `${active} active and ${disabled} disabled accounts are linked to this tenant.`,
      metrics: [
        { label: "Total accounts", value: String(accounts.length) },
        { label: "Active", value: String(active) },
        { label: "Disabled", value: String(disabled) },
      ],
    },
    density: "compact",
    surface: "content",
    motion: "subtle",
    status,
    markers: accounts.length === 0 ? [] : [
      {
        id: "active",
        label: `Active accounts: ${active}`,
        x: 34,
        y: 46,
        tone: "success",
        value: String(active),
      },
      {
        id: "disabled",
        label: `Disabled accounts: ${disabled}`,
        x: 68,
        y: 64,
        tone: disabled > 0 ? "warning" : "neutral",
        value: String(disabled),
      },
    ],
  })
}
