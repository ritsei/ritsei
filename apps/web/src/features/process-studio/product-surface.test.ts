import { assert, describe, it } from "@effect/vitest"

import {
  getProcessStudioTemplate,
  makeProcessStudioDraft,
  ProcessStudioTemplates,
  serializeProcessStudioDraft,
} from "./product-surface.ts"
import { toProcessIr, validateDesignerModel } from "./designer-model.ts"

describe("Process Studio product surface", () => {
  it("provides structurally valid starter drafts without catalog authority", () => {
    assert.strictEqual(ProcessStudioTemplates.length, 3)
    assert.strictEqual(
      new Set(ProcessStudioTemplates.map((template) => template.model.definitionId)).size,
      ProcessStudioTemplates.length,
    )
    for (const template of ProcessStudioTemplates) {
      assert.deepStrictEqual(validateDesignerModel(template.model), [])
      assert.isDefined(getProcessStudioTemplate(template.id))
      assert.isFalse(JSON.stringify(template.model).includes("sales.order.confirm"))
      assert.isFalse(JSON.stringify(template.model).includes("inventory.stock.adjust"))
      assert.isFalse(JSON.stringify(template.model).includes("accounting.revenue.post"))
    }
    const review = getProcessStudioTemplate("review-draft")!
    assert.deepStrictEqual(
      review.nodes.filter((node) => node.kind === "HumanTask").map((node) => node.label),
      ["Review draft"],
    )
  })

  it("preserves draft lane and source metadata", () => {
    const model = getProcessStudioTemplate("review-draft")!
    const draft = makeProcessStudioDraft(model, "templates", "template")

    assert.strictEqual(draft.lane, "templates")
    assert.deepStrictEqual(draft.metadata, { status: "DRAFT", source: "template" })
  })

  it("keeps product-surface metadata out of serialized Process IR", () => {
    const model = getProcessStudioTemplate("review-draft")!
    const draft = makeProcessStudioDraft(model, "copilot_draft", "copilot")
    const serialized = serializeProcessStudioDraft(draft)
    const ir = toProcessIr(model)

    assert.strictEqual(
      serialized,
      JSON.stringify({
        formatVersion: 1,
        definitionId: ir.definitionId,
        version: ir.version,
        catalogVersion: ir.catalogVersion,
        environment: ir.environment,
        nodes: [...ir.nodes].sort((a, b) => a.id.localeCompare(b.id)),
        edges: [...ir.edges].sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`)),
        checksum: ir.checksum,
      }),
    )
    assert.isFalse(serialized.includes("copilot_draft"))
    assert.isFalse(serialized.includes("template"))
  })
})
