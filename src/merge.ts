// ════════════════════════════════════════════════════════════════
//  DETERMINISTIC TYPESCRIPT MERGE + SCORING  (NO LLM)
//
//  Takes the per-chunk ChunkEvaluation[] produced by the LLM and merges them
//  into ONE final, scored dataset — entirely in code. Responsibilities:
//    • deduplicate findings (one entry per rule)
//    • aggregate evidence across chunks (merge quotes, keep page refs)
//    • resolve conflicts (highest evidence tier wins → monotonic)
//    • aggregate confidence (max across chunks that triggered the rule)
//    • assign deterministic severity from the fixed tier table
//    • compute weighted points, risk score, risk level, key drivers
//
//  The LLM NEVER computes the score. This module is the single source of
//  truth for scoring, identical for one-chunk and many-chunk documents.
// ════════════════════════════════════════════════════════════════

import {
  FLAG_FRAMEWORK,
  RULE_BY_N,
  TIER_SEVERITY,
  TIER_RANK,
  VALID_TIERS,
  type ChunkEvaluation,
  type RuleFinding,
  type RuleEvidence,
} from './rules'

export interface MergedEvidence {
  page: number
  section?: string
  quote: string
  reason: string
}

/** One rule after merging across all chunks + deterministic scoring. */
export interface MergedFinding {
  n: number
  name: string
  weight: number
  triggered: boolean
  evidenceTier: string
  severity: number
  weightedPoints: number
  /** Aggregated confidence 0..1 (max across triggering chunks). */
  confidence: number
  /** Distinct pages the evidence spans. */
  pages: number[]
  evidence: MergedEvidence[]
}

export interface MergedDataset {
  isInvestmentRelated: boolean
  notRelevantReason: string
  riskScore: number
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical'
  scoreBreakdown: {
    totalWeightedPoints: number
    maxPossiblePoints: number
    formula: string
    keyDrivers: number[]
  }
  /** All 21 rules with their merged state (triggered + not-triggered). */
  findings: MergedFinding[]
  /** Only the triggered (non-GAP) rules, sorted by weightedPoints desc. */
  triggeredFlags: MergedFinding[]
  claims: { type: string; claim: string; concern: string; page?: number }[]
  chunkCount: number
  pageCount: number
  analyzedAt: string
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

// Calibration guardrails to reduce false positives on non-investment or weak-evidence text.
const MIN_TRIGGER_CONFIDENCE = 0.45
const MIN_QUOTE_CHARS = 12
const MIN_REASON_CHARS = 24

function normalizeTier(t: any): string {
  const s = String(t || '').trim()
  const found = VALID_TIERS.find((v) => v.toLowerCase() === s.toLowerCase())
  if (found) return found
  if (s.toLowerCase().includes('gap')) return 'GAP'
  const m = s.match(/([1-4])/)
  if (m) return `Tier ${m[1]}`
  return 'GAP'
}

/** Dedupe evidence items by (page + first 80 chars of quote). */
function dedupeEvidence(items: MergedEvidence[]): MergedEvidence[] {
  const seen = new Set<string>()
  const out: MergedEvidence[] = []
  for (const e of items) {
    const key = `${e.page}|${(e.quote || '').toLowerCase().slice(0, 80)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

/**
 * Merge per-chunk evaluations into ONE scored dataset (deterministic).
 */
export function mergeEvaluations(evals: ChunkEvaluation[]): MergedDataset {
  const clean = (Array.isArray(evals) ? evals : []).filter((e) => e && typeof e === 'object')

  // ── Relevance gate ──
  //  A long document is split into many semantic chunks; dry legal/boilerplate
  //  sections (definitions, financial tables, subscription terms) can each look
  //  "non-investment" in isolation, so a strict MAJORITY vote wrongly zeros out
  //  a valid PPM. Require only a meaningful SHARE of chunks (≥25%, min 1). The
  //  stronger signal — any rule that actually triggered on concrete evidence —
  //  forces relevance below, once findings are computed.
  const relevantVotes = clean.filter((e) => e.is_investment_related === true).length
  const relevanceThreshold = Math.max(1, Math.ceil(clean.length * 0.25))
  let isInvestmentRelated = clean.length > 0 && relevantVotes >= relevanceThreshold

  // ── Per-rule accumulator ──
  interface Acc {
    triggered: boolean
    bestRank: number
    tier: string
    confidence: number
    evidence: MergedEvidence[]
  }
  const acc = new Map<number, Acc>()
  for (const rule of FLAG_FRAMEWORK) {
    acc.set(rule.n, { triggered: false, bestRank: 0, tier: 'GAP', confidence: 0, evidence: [] })
  }

  const allClaims: MergedDataset['claims'] = []

  for (const ev of clean) {
    // Ignore rule scoring from chunks classified as non-investment-related.
    if (ev?.is_investment_related !== true) continue

    const rules: RuleFinding[] = Array.isArray(ev.rules) ? ev.rules : []
    for (const r of rules) {
      const n = Number(r?.rule_id)
      if (!RULE_BY_N.has(n)) continue
      const a = acc.get(n)!
      const tier = normalizeTier(r?.evidence_tier)
      const rank = TIER_RANK[tier] ?? 0
      const conf = clamp(Number(r?.confidence) || 0, 0, 1)

      // Collect evidence with page refs (always, so even weak signals are cited).
      const evItems: MergedEvidence[] = (Array.isArray(r?.evidence) ? r.evidence : [])
        .map((e: RuleEvidence) => ({
          page: Math.max(0, Number(e?.page) || 0),
          section: e?.section ? String(e.section) : undefined,
          quote: String(e?.quote || '').trim(),
          reason: String(e?.reason || '').trim(),
        }))
        .filter((e) => e.quote.length > 0 || e.reason.length > 0)

      const hasConcreteEvidence = evItems.some(
        (e) => e.quote.length >= MIN_QUOTE_CHARS || e.reason.length >= MIN_REASON_CHARS
      )
      const triggered =
        r?.triggered === true &&
        tier !== 'GAP' &&
        conf >= MIN_TRIGGER_CONFIDENCE &&
        hasConcreteEvidence

      if (triggered) {
        a.triggered = true
        if (rank > a.bestRank) {
          a.bestRank = rank
          a.tier = tier
        }
        a.confidence = Math.max(a.confidence, conf)
        a.evidence.push(...evItems)
      } else if (!a.triggered && evItems.length > 0) {
        // Keep GAP evidence only if the rule never triggered anywhere.
        a.evidence.push(...evItems)
      }
    }

    if (Array.isArray(ev.claims)) {
      for (const c of ev.claims) {
        allClaims.push({
          type: String(c?.type || ''),
          claim: String(c?.claim || ''),
          concern: String(c?.concern || ''),
          page: c?.page != null ? Number(c.page) : undefined,
        })
      }
    }
  }

  // ── Build merged findings + deterministic scoring ──
  const findings: MergedFinding[] = FLAG_FRAMEWORK.map((rule) => {
    const a = acc.get(rule.n)!
    const tier = a.triggered ? a.tier : 'GAP'
    const severity = TIER_SEVERITY[tier] ?? 0
    const weightedPoints = a.triggered ? Math.round((rule.weight * severity) / 10) : 0
    const evidence = dedupeEvidence(a.evidence).slice(0, 12)
    const pages = Array.from(new Set(evidence.map((e) => e.page).filter((p) => p > 0))).sort((x, y) => x - y)
    return {
      n: rule.n,
      name: rule.name,
      weight: rule.weight,
      triggered: a.triggered,
      evidenceTier: tier,
      severity,
      weightedPoints,
      confidence: a.triggered ? Number(a.confidence.toFixed(2)) : 0,
      pages,
      evidence,
    }
  })

  const triggered = findings.filter((f) => f.triggered)
  const totalWeightedPoints = triggered.reduce((s, f) => s + f.weightedPoints, 0)
  const maxPossiblePoints = triggered.reduce((s, f) => s + f.weight, 0)

  // A rule that actually triggered (concrete evidence, above the confidence
  // floor) is itself proof the document is investment-related — override a
  // conservative relevance vote so real findings are never zeroed.
  if (!isInvestmentRelated && triggered.length > 0) isInvestmentRelated = true

  const notRelevantReason = isInvestmentRelated
    ? ''
    : String(clean.find((e) => e.not_relevant_reason)?.not_relevant_reason || '') ||
      'This does not appear to be an investment offering, pitch, or solicitation.'

  // Dispositive rules: barred promoter, false FDIC / regulatory claim,
  // "guaranteed / risk-free" returns, nominee concealment. A single one of these
  // is independently conclusive of fraud, so it floors the score at Critical (75).
  //
  // We accept Tier 1 (documentary) OR Tier 2/Tier 3 evidence — NOT just Tier 1.
  // The most dangerous claims almost always appear as the promoter's OWN marketing
  // language (ads, landing pages, emails), which the tier rubric classifies as
  // "Tier 2" at best and NEVER "Tier 1" (that tier is reserved for a PPM / Form D /
  // FINRA record). Gating on Tier 1 alone made this override dead code for the most
  // common upload types — a "guaranteed 16% risk-free" website would slip through
  // as Low. `triggered` already requires a concrete verbatim quote above the
  // confidence floor, so rank >= Tier 3 is real evidence, not pure inference (Tier 4).
  const DISPOSITIVE_RULES = new Set([4, 5, 6, 8])
  const hasDispositiveHit = triggered.some(
    (f) => DISPOSITIVE_RULES.has(f.n) && (TIER_RANK[f.evidenceTier] ?? 0) >= 2
  )

  // If the material is not investment-related, force a neutral risk output.
  const riskScore = !isInvestmentRelated
    ? 0
    : (() => {
        // Stability floor: small numbers of flags shouldn't spike to 100% off one item.
        const STABILITY_FLOOR = 40
        const floorWeight = triggered.length >= 4 ? 0 : STABILITY_FLOOR * (1 - triggered.length / 4)
        const denom = maxPossiblePoints + floorWeight
        const raw = denom > 0 ? clamp(Math.round((totalWeightedPoints / denom) * 100), 0, 100) : 0
        return hasDispositiveHit ? Math.max(raw, 75) : raw
      })()

  const keyDrivers = isInvestmentRelated
    ? triggered
        .filter((f) => maxPossiblePoints > 0 && f.weightedPoints / maxPossiblePoints >= 0.15)
        .map((f) => f.n)
    : []

  const riskLevel =
    riskScore >= 75 ? 'Critical' : riskScore >= 50 ? 'High' : riskScore >= 25 ? 'Medium' : 'Low'

  // Dedupe claims.
  const seenClaims = new Set<string>()
  const claims = allClaims.filter((c) => {
    const k = `${c.type}|${c.claim}`.toLowerCase().slice(0, 100)
    if (!c.claim || seenClaims.has(k)) return false
    seenClaims.add(k)
    return true
  })

  const pageCount = Math.max(0, ...findings.flatMap((f) => f.pages), ...clean.map((e) => e.page_range?.[1] || 0))

  return {
    isInvestmentRelated,
    notRelevantReason,
    riskScore,
    riskLevel,
    scoreBreakdown: {
      totalWeightedPoints,
      maxPossiblePoints,
      formula: 'totalWeightedPoints ÷ (maxPossiblePoints + stabilityFloor) × 100',
      keyDrivers,
    },
    findings,
    triggeredFlags: triggered.sort((a, b) => b.weightedPoints - a.weightedPoints),
    claims,
    chunkCount: clean.length,
    pageCount,
    analyzedAt: new Date().toISOString(),
  }
}
