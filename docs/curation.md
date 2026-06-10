# Curation process

Two datasets in ConflictWatch are editorial judgments, not derivable from data:
the **exposure graph** (zone → instrument linkages with weights) and the
**source-trust tiers**. Neither may be auto-generated or LLM-fabricated — a
wrong weight or a promoted content farm ends analyst trust permanently. This
document is the process for growing them.

## Exposure graph

Every `ExposureLink` row now carries provenance:

| Field | Meaning |
|---|---|
| `provenance` | Citation or reasoning for the linkage and its weight (e.g. "~30% of global LNG transits Hormuz — EIA 2025") |
| `addedBy` | `seed` or an analyst identifier |
| `reviewStatus` | `unreviewed` until a human confirms; UI should flag unreviewed weights |
| `reviewedAt` | When a human last confirmed the linkage |

Process for adding a zone:
1. Propose rows with `reviewStatus: 'unreviewed'` and a sourced `provenance` line per row.
2. A human reviews weight and linkage against the cited source, sets `reviewStatus: 'approved'` + `reviewedAt`.
3. Weights are directness of the physical/economic link (1.0 = sole route), not market beta.

### Candidate zones awaiting human curation (NOT yet in the graph)

These are flagged as high-value gaps. Do not add them without sourced weights:

- **Taiwan Strait** — semiconductors (TSMC supply), container freight, JPY/TWD safe-haven flows
- **Bab-el-Mandeb / Red Sea** — container freight war-risk premium, Suez interaction effects
- **Black Sea grain corridor** — wheat, corn, sunflower oil
- **Strait of Malacca** — crude + LNG transit, container freight
- **Sahel mining belt** — uranium (Niger), gold; FX exposure for regional sovereigns
- **South China Sea** — fisheries, energy exploration blocks, freight routing

## Source-trust tiers

Tier reflects **editorial standard, not geography**. Seeds live in
`apps/worker/src/pipeline/trust.ts`; the `DomainReliability` table overrides
them at runtime, so promotion needs no deploy.

Weekly review loop:

```bash
pnpm --filter worker exec tsx scripts/domain-review-report.ts
```

ranks unreviewed domains by how often they actually appear in ingested
clusters. For each, a human sets `tier` to `tier1`/`tier2`/`specialist`
(or `blocked`). The trust gate never auto-promotes; `unknown` fails closed.

## Geographic centroids

`apps/worker/src/lib/centroids.ts` backstops events whose GDELT coordinates
are (0,0). The worker now logs `N geo-drops` per cycle when rows are lost to
missing centroids — a rising count means the table needs rows for the
country codes appearing in the logs.
