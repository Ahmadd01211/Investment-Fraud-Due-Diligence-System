// ════════════════════════════════════════════════════════════════
//  21-RULE FRAUD FRAMEWORK + PER-CHUNK EVALUATION CONTRACT
//
//  This module owns:
//    • FLAG_FRAMEWORK        — the 21 fraud rules (id, name, weight). PRESERVED
//                              verbatim from the original engine.
//    • TIER_SEVERITY         — evidence-tier → fixed severity (deterministic).
//    • CHUNK_EVAL_PROMPT()   — the system prompt for EVALUATING ONE CHUNK.
//                              The LLM ONLY reports which rules fired + evidence.
//                              It DOES NOT compute any score. Scoring is done in
//                              TypeScript (see merge.ts).
//    • ChunkEvaluation / RuleFinding — the strict per-chunk JSON contract.
//
//  DETERMINISM: temperature 0 + seed + fixed severity table + TS scoring means
//  the same document always yields the same score.
// ════════════════════════════════════════════════════════════════

/** One fraud rule. weight = max points the rule can contribute. */
export interface FraudRule {
  n: number
  name: string
  weight: number
}

/**
 * The 21-flag framework (weight = max points each flag can contribute).
 * PRESERVED EXACTLY — this is the core business logic and must not change.
 */
export const FLAG_FRAMEWORK: FraudRule[] = [
  { n: 1,  name: 'Irrational Ratios — Expenses vs. Revenue Impossible', weight: 10 },
  { n: 2,  name: 'IRR in "Buffett-Shame Zone" (17–25%+)', weight: 10 },
  { n: 3,  name: 'Debt Load Mathematically Incompatible with Returns', weight: 10 },
  { n: 4,  name: 'Promoter FINRA-Barred / SEC-Sanctioned', weight: 10 },
  { n: 5,  name: 'False FDIC Insurance / "SEC Qualified" Claims', weight: 10 },
  { n: 6,  name: '"Guaranteed" / "Risk-Free" Language', weight: 9 },
  { n: 7,  name: 'Property Addresses Concealed', weight: 9 },
  { n: 8,  name: 'Nominee Structure — Concealing Barred Principal', weight: 9 },
  { n: 9,  name: 'Vertical Integration Into Internal Debt Fund', weight: 9 },
  { n: 10, name: 'Facebook / Instagram / TV / Radio Mass Advertising', weight: 8 },
  { n: 11, name: 'AUM Without Debt Disclosure', weight: 8 },
  { n: 12, name: 'Co-GP Double Counting', weight: 8 },
  { n: 13, name: '"Refer a Friend" Unlicensed Solicitation', weight: 8 },
  { n: 14, name: 'No State Licensing', weight: 8 },
  { n: 15, name: 'No Purchase Price / LTV Cap Disclosed', weight: 7 },
  { n: 16, name: 'No Failed Deal Disclosure', weight: 7 },
  { n: 17, name: 'Sudden Pivot to Unrelated Offerings (Oil/Car Wash)', weight: 7 },
  { n: 18, name: '"We Invest Our Own Money" — Unverified', weight: 5 },
  { n: 19, name: 'High-Pressure Sales Blitz — Constant Solicitation', weight: 8 },
  { n: 20, name: 'Perpetual Fundraising / Deal Churn — Acquisition Treadmill', weight: 7 },
  { n: 21, name: 'Asset Overpayment / Book Value Mismatch', weight: 9 },
]

/** Quick lookup: rule number → definition. */
export const RULE_BY_N: Map<number, FraudRule> = new Map(FLAG_FRAMEWORK.map((f) => [f.n, f]))

export const VALID_TIERS = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'GAP'] as const
export type EvidenceTier = (typeof VALID_TIERS)[number]

/**
 * Severity is FIXED by evidence tier so the same submission scores the same
 * every time. The model only picks the tier; TypeScript assigns severity.
 * This table is the single source of truth for severity.
 */
export const TIER_SEVERITY: Record<string, number> = {
  'Tier 1': 10,
  'Tier 2': 8,
  'Tier 3': 5,
  'Tier 4': 3,
  GAP: 0,
}

/** Tier ranking for merge conflict resolution (higher = stronger). */
export const TIER_RANK: Record<string, number> = {
  'Tier 1': 4,
  'Tier 2': 3,
  'Tier 3': 2,
  'Tier 4': 1,
  GAP: 0,
}

// ── Per-chunk deterministic JSON contract ─────────────────────────

/** A single piece of supporting evidence for a rule, with source location. */
export interface RuleEvidence {
  /** 1-based page number where the evidence appears (0 if unknown). */
  page: number
  /** Optional section / heading label. */
  section?: string
  /** Verbatim quote from the material that supports the finding. */
  quote: string
  /** Plain-English reason this quote triggers the rule. */
  reason: string
}

/** One rule's evaluation against ONE chunk. */
export interface RuleFinding {
  rule_id: number
  triggered: boolean
  /** Model's self-reported confidence 0..1 (used for aggregation, NOT scoring). */
  confidence: number
  /** Evidence tier the model assigned (drives deterministic severity in TS). */
  evidence_tier: EvidenceTier
  evidence: RuleEvidence[]
}

/** The strict JSON a chunk evaluation must return. */
export interface ChunkEvaluation {
  chunk_id: number
  page_range: [number, number]
  /** True if this chunk relates to an investment/financial offering at all. */
  is_investment_related: boolean
  /** If not investment-related, a short description of what it is. */
  not_relevant_reason?: string
  /** EXACTLY 21 findings — one per rule (rule_id 1..21). */
  rules: RuleFinding[]
  /** Optional extracted claims observed in this chunk (evidence, not scoring). */
  claims?: { type: string; claim: string; concern: string; page?: number }[]
}

// ── Chunk-evaluation system prompt (RULE EVALUATION ONLY) ─────────
//
//  Critical differences from the old single-shot prompt:
//    • The model DOES NOT compute riskScore / weightedPoints / riskLevel.
//    • The model returns ALL 21 rules every time (triggered true/false).
//    • Each rule carries confidence + evidence[] with page/quote/reason.
//    • Deterministic tier selection rules preserved from the original engine.

export function CHUNK_EVAL_PROMPT(): string {
  return `You are the Investment Integrity Engine™ (IIE), the forensic rule-evaluation core of InvestSafe Pro™.
You evaluate ONE CHUNK of an investment document (offering memo, PPM, pitch deck, ad, email, transcript, prospectus) against a fixed 21-rule fraud framework.

Your methodology is built on Barry Minkow's documented investigative framework and patterns from real SEC enforcement cases (e.g. NRIA and other Reg D fraud schemes). You are evidence-first. You NEVER fabricate facts about a named person or company. You analyze the LANGUAGE and STRUCTURE of what the promoter presents.

╔══════════════════════════════════════════════════════════════════╗
║  YOUR JOB IS EVIDENCE EVALUATION ONLY — NOT SCORING.               ║
║  • Do NOT compute any risk score, percentage, weighted points, or  ║
║    risk level. The application computes all scores in code.        ║
║  • For EVERY one of the 21 rules, report whether THIS CHUNK        ║
║    triggers it, with an evidence tier and supporting evidence.     ║
╚══════════════════════════════════════════════════════════════════╝

THE 21 RULES (evaluate every one):
${FLAG_FRAMEWORK.map((f) => `Rule ${f.n}: ${f.name}`).join('\n')}

EVIDENCE TIER (pick the single best-fitting tier when a rule is TRIGGERED):
  Tier 1 = primary-source / direct documentary proof (the PPM text itself, a Form D, a FINRA bar record, an audited statement).
  Tier 2 = strong secondary evidence (the promoter's own ad / brochure / website language quoted verbatim).
  Tier 3 = weaker / indirect / circumstantial evidence.
  Tier 4 = inference or pattern-match only (no concrete proof in this chunk).
  GAP    = the rule is SUSPECTED but the required evidence is simply MISSING from this chunk (e.g. "no PPM disclosed"). Use "GAP" as the tier for a not-affirmatively-triggered gap; set triggered=false for GAP.

TRIGGERING RULES (follow exactly for determinism — the same chunk must always produce the same findings):
  • triggered=true ONLY when THIS CHUNK affirmatively contains problematic content (a bad claim, a contradiction, a prohibited practice). Set the appropriate Tier 1–4.
  • Never set triggered=true merely because something expected is ABSENT. Absence of a required disclosure → triggered=false with evidence_tier="GAP" (especially Rules 7, 11, 15, 16).
  • If a rule does not apply to this chunk at all → triggered=false, evidence_tier="GAP", evidence: [].
  • Use the HIGHEST tier the evidence clearly supports; do not hedge between two tiers.
  • Only quote text that actually appears in the material of THIS chunk. Every evidence item MUST include the page number where it appears (use the [[PAGE n]] markers in the text; if none are present use 0).
  • confidence is your own 0.0–1.0 certainty that the rule is correctly triggered for this chunk. It is NOT a score and does not affect points; it is used only to aggregate evidence across chunks.

RELEVANCE GATE (do this FIRST):
  • Decide whether THIS CHUNK is about an investment, financial offering, fund, securities, business opportunity, money-making scheme, or a solicitation to invest/send money.
  • A random photo, unrelated screenshot, blank/index/signature/appendix page, or off-topic text is NOT investment-related. If so, set is_investment_related=false and not_relevant_reason to a short description; you may still return all 21 rules with triggered=false, evidence_tier="GAP", evidence: [].

OUTPUT — respond with ONLY a single valid JSON object (no markdown, no commentary) in EXACTLY this shape:
{
  "chunk_id": <the chunk id you were given>,
  "page_range": [<first page in this chunk>, <last page in this chunk>],
  "is_investment_related": <true | false>,
  "not_relevant_reason": "<short description if not investment-related, else empty>",
  "rules": [
    {
      "rule_id": <1-21>,
      "triggered": <true | false>,
      "confidence": <0.0-1.0>,
      "evidence_tier": "Tier 1" | "Tier 2" | "Tier 3" | "Tier 4" | "GAP",
      "evidence": [
        { "page": <int>, "section": "<heading/section label or empty>", "quote": "<verbatim quote from this chunk>", "reason": "<why this triggers the rule>" }
      ]
    }
    // ... one object for EVERY rule 1..21, in ascending rule_id order
  ],
  "claims": [
    { "type": "<IRR/Returns|AUM|Track Record|Guarantee|FDIC|Licensing|...>", "claim": "<what the promoter asserts>", "concern": "<why verify>", "page": <int> }
  ]
}

You MUST include all 21 rule objects. For rules that do not fire in this chunk, return triggered=false, evidence_tier="GAP", evidence: [].`
}

// ── Final REPORT prompt (report generation ONLY, no scoring) ──────
//
//  Receives the ALREADY-MERGED, ALREADY-SCORED structured dataset (produced
//  deterministically in TS). Its ONLY job is to write human-readable prose.
//  It must NOT change scores or decide which rules fired.

export function REPORT_PROMPT(): string {
  return `You are the report writer for InvestSafe Pro™.
You will receive a FINAL, ALREADY-COMPUTED fraud-analysis dataset as JSON: the risk score, risk level, the list of triggered rules with their evidence, extracted claims, and contradictions. All scoring has ALREADY been done deterministically by the application.

YOUR ONLY JOB is to write clear, calm, plain-English prose for an investor with NO finance or legal background. You must NOT:
  • recompute or change the risk score, risk level, weighted points, or which rules fired;
  • invent new rules, evidence, or facts not present in the provided dataset.

Use ONLY the rules, evidence, claims, and contradictions given to you. Refer to page numbers where the dataset provides them.

Respond with ONLY a single valid JSON object in EXACTLY this shape:
{
  "verdict": "<one-sentence plain-English bottom line the investor understands>",
  "summary": "<2-4 sentence plain-English explanation of the overall finding>",
  "executiveSummary": "<1-2 short paragraphs summarizing the key risks and what they mean>",
  "keyConcerns": [ "<short bullet describing a top concern, referencing a page if available>" ],
  "recommendations": [ "<concrete next step, e.g. 'Verify the promoter on FINRA BrokerCheck'>" ],
  "investorAdvice": "<3-5 sentences of clear guidance on what to do next>",
  "disclaimer": "This is an educational due-diligence aid, not legal or financial advice. Always verify with primary sources and consult a licensed professional."
}`
}
