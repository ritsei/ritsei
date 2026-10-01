import { assert, describe, it } from "@effect/vitest"

import { validateSkillDocument } from "../../tooling/check-agent-skills.ts"
import {
  evaluateFinancialManifest,
  requiredFinancialGateIds,
} from "../../tooling/financial-gate.ts"
import { analyzeAiBoundary, analyzePublicPackageImports } from "../../tooling/architecture.ts"
import {
  type Gate,
  gates,
  roadmapTracks,
  validateGateGraph,
} from "../../tooling/roadmap-completion/registry.ts"

const skillHeadings = [
  "# Purpose",
  "# Use This Skill When",
  "# Do Not Use This Skill When",
  "# Required Context",
  "# Architecture Rules",
  "# Workflow",
  "# Deterministic Tools",
  "# Required Checks",
  "# Failure Conditions",
  "# Completion Criteria",
  "# Related Skills",
  "# References",
]

const validSkill = `---
name: example-workflow
description: "Use when an RITSEI change needs a repository-native example workflow."
---

${skillHeadings.join("\n\n")}
`

describe("repository tooling", () => {
  it("validates repository-native skill structure", () => {
    assert.deepStrictEqual(
      validateSkillDocument(
        ".agents/skills/example-workflow/SKILL.md",
        validSkill,
        false,
      ),
      [],
    )
    assert.isTrue(
      validateSkillDocument(
        ".agents/skills/example-workflow/SKILL.md",
        validSkill.replace("# Completion Criteria\n", ""),
        false,
      ).some((failure) => failure.includes("# Completion Criteria")),
    )
  })

  it("uses one fail-closed financial evidence evaluator", () => {
    const gates = requiredFinancialGateIds.map((id) => ({
      id,
      title: id,
      observed: "FAIL" as const,
      evidenceClass: "missing" as const,
      acceptedEvidenceClasses: ["production-real" as const],
      evidence: [],
      reason: "missing proof",
      failureCategory: "evidence" as const,
      requiredEvidence: "production proof",
      remediation: "run the rehearsal",
    }))
    const manifest = {
      schemaVersion: 1,
      reviewedAt: "2026-08-31",
      baselineCommit: "056828250526",
      summary: { passed: 0, failed: gates.length, total: gates.length },
      gates,
    }

    assert.strictEqual(evaluateFinancialManifest(manifest).failed, 16)
    assert.throws(() =>
      evaluateFinancialManifest({
        ...manifest,
        summary: { passed: 1, failed: 15, total: 16 },
      })
    )
    assert.throws(() => evaluateFinancialManifest({ ...manifest, gates: [null] }))
  })

  it("rejects invalid roadmap gate dependencies", () => {
    const gate = (id: string, dependencies: readonly string[] = []): Gate => ({
      id,
      title: id,
      source: "test",
      kind: "composite",
      dependencies,
    })

    assert.deepStrictEqual(validateGateGraph([gate("first"), gate("second", ["first"])]), [])
    assert.isTrue(
      validateGateGraph([gate("first", ["missing"])]).some((failure) =>
        failure.includes("unknown dependency")
      ),
    )
    assert.isTrue(
      validateGateGraph([gate("first", ["second"]), gate("second")]).some((failure) =>
        failure.includes("must be declared first")
      ),
    )
    assert.isTrue(
      validateGateGraph([
        gate("first", ["second"]),
        gate("second", ["first"]),
      ]).some((failure) => failure.includes("dependency cycle")),
    )
  })

  it("keeps the global roadmap gate dependent on every registered track gate", () => {
    const global = gates.find(({ id }) => id === "roadmap.global-exit")
    assert.isDefined(global)
    assert.deepStrictEqual(
      [...new Set(global.dependencies)].sort(),
      roadmapTracks.flatMap(({ gateIds }) => gateIds).sort(),
    )
  })

  it("rejects cross-package imports outside public entry points", () => {
    const failures = analyzePublicPackageImports([
      { path: "modules/a/mod.ts", source: 'export { A } from "./src/service.ts"' },
      {
        path: "modules/a/src/service.ts",
        source: 'import { B } from "../../b/src/service.ts"',
      },
      { path: "modules/b/mod.ts", source: 'export { B } from "./src/service.ts"' },
    ], ["a", "b"])

    assert.isTrue(failures.some((failure) => failure.includes("must use modules/b/mod.ts")))
  })

  it("keeps AI/provider code behind the integration and persistence boundaries", () => {
    const providerImport = (name: string, binding: string) =>
      [`import ${binding} from \"`, name, `\"`].join("")

    assert.deepStrictEqual(
      analyzeAiBoundary([{
        path: "modules/integrations/src/model-adapter.ts",
        source: providerImport("effect/ai", "{ LanguageModel }"),
      }]),
      [],
    )
    assert.isTrue(
      analyzeAiBoundary([{
        path: "modules/sales/src/service.ts",
        source: providerImport("effect/ai/LanguageModel", "* as LanguageModel"),
      }]).some((failure) => failure.includes("must stay under modules/integrations/")),
    )
    const integrationSchemaPath = ["../../../db/schema", "integration.ts"].join("/")
    assert.deepStrictEqual(
      analyzeAiBoundary([{
        path: "modules/integrations/src/reliability-store.ts",
        source: [
          `import { externalReliabilityRecords } from "${integrationSchemaPath}"`,
          'import { Database } from "../../foundation/mod.ts"',
          "database.transaction(() => undefined)",
        ].join("\n"),
      }]),
      [],
    )
    assert.isTrue(
      analyzeAiBoundary([{
        path: "modules/integrations/src/reliability-store.ts",
        source: providerImport("openai", "OpenAI"),
      }]).some((failure) => failure.includes("persistence adapter cannot import provider SDK")),
    )
    assert.deepStrictEqual(
      analyzeAiBoundary([{
        path: "modules/integrations/src/governance-store.ts",
        source: [
          `import { externalConnectorGovernance } from "${integrationSchemaPath}"`,
          'import { Database } from "../../foundation/mod.ts"',
          "database.transaction(() => undefined)",
        ].join("\n"),
      }]),
      [],
    )
    assert.isTrue(
      analyzeAiBoundary([{
        path: "modules/integrations/src/governance-store.ts",
        source: providerImport("openai", "OpenAI"),
      }]).some((failure) => failure.includes("persistence adapter cannot import provider SDK")),
    )

    const failures = analyzeAiBoundary([{
      path: "modules/sales/src/recommendations/model.ts",
      source: [
        providerImport("openai", "OpenAI"),
        ['import { orders } from "../../db/', "schema/sales.ts", '"'].join(""),
        "database.update(orders)",
      ].join("\n"),
    }])

    assert.isTrue(
      failures.some((failure) => failure.includes("must stay under modules/integrations")),
    )
    assert.isTrue(failures.some((failure) => failure.includes("private persistence")))
    assert.isTrue(failures.some((failure) => failure.includes("direct business-fact mutations")))
  })
})
