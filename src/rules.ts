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
//  Calibration note: a triggered flag's weightedPoints = weight × severity ÷ 10,
//  while the score denominator uses the FULL weight. So an all-Tier-2 document can
//  never exceed severity/10 of its weight. Because a promoter's own marketing copy
//  (ads, websites, emails) tops out at "Tier 2" by the evidence rubric — Tier 1 is
//  reserved for a PPM/Form D/FINRA record — the old table (Tier 2 = 8, Tier 3 = 5)
//  structurally capped marketing-scam scores at 50–80% even when many flags fired,
//  producing "Low" verdicts on obvious frauds. The promoter stating the fraudulent
//  claim in their OWN words is not weak evidence — it is a direct misrepresentation.
//  Tiers 2/3 are lifted accordingly; Tier 4 (pure inference) stays low; GAP = 0.
export const TIER_SEVERITY: Record<string, number> = {
  'Tier 1': 10,
  'Tier 2': 9,
  'Tier 3': 7,
  'Tier 4': 4,
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

/**
 * Deterministic detector outputs computed in TypeScript from the chunk text
 * (NOT the LLM). These make relevance + false-positive suppression a pure
 * function of the bytes, so the same document always scores the same.
 * Populated by normalizeChunkEval; consumed by mergeEvaluations.
 */
export interface ChunkDetectors {
  /** Distinct investment-lexicon family indices matched in this chunk. */
  invFamilies: number[]
  /** Distinct legitimate-disclosure family indices matched in this chunk. */
  legitFamilies: number[]
  /** Chunk discloses a purchase price / LTV / cap rate (nullifies rule 15). */
  hasLtv: boolean
  /** Chunk contains genuine (non-negated) loss/risk disclosure (nullifies rule 16). */
  hasLoss: boolean
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
  /** Deterministic TS detector outputs (relevance + legitimacy). */
  det?: ChunkDetectors
}

// ── Chunk-evaluation system prompt (RULE EVALUATION ONLY) ─────────
//
//  Critical differences from the old single-shot prompt:
//    • The model DOES NOT compute riskScore / weightedPoints / riskLevel.
//    • The model considers ALL 21 rules internally but OUTPUTS ONLY the ones
//      that TRIGGER (triggered=true). This is a large token saving: a typical
//      chunk fires 0–5 rules, so emitting 21 objects (16+ of them empty GAPs)
//      every time wastes output tokens on every chunk of a long document.
//      merge.ts + normalizeChunkEval default every un-returned rule to
//      not-triggered/GAP, so omitting them is lossless.
//    • Each triggered rule carries confidence + evidence[] with page/quote/reason.
//    • Deterministic tier selection rules preserved from the original engine.

export function CHUNK_EVAL_PROMPT(): string {
  return `You are the Investment Integrity Engine™ (IIE), the forensic rule-evaluation core of InvestSafe Pro™.
You evaluate ONE CHUNK of an investment document (offering memo, PPM, pitch deck, ad, email, transcript, prospectus) against a fixed 21-rule fraud framework.

Your methodology is built on Barry Minkow's documented investigative framework and patterns from real SEC enforcement cases (e.g. NRIA and other Reg D fraud schemes). You are evidence-first. You NEVER fabricate facts about a named person or company. You analyze the LANGUAGE and STRUCTURE of what the promoter presents.

╔══════════════════════════════════════════════════════════════════╗
║  YOUR JOB IS EVIDENCE EVALUATION ONLY — NOT SCORING.               ║
║  • Do NOT compute any risk score, percentage, weighted points, or  ║
║    risk level. The application computes all scores in code.        ║
║  • Consider ALL 21 rules internally, but OUTPUT ONLY the rules      ║
║    that TRIGGER on affirmative evidence in THIS chunk.             ║
╚══════════════════════════════════════════════════════════════════╝

THE 21 RULES (consider every one; output only those that fire):
${FLAG_FRAMEWORK.map((f) => `Rule ${f.n}: ${f.name}`).join('\n')}

RULE-SPECIFIC GUIDANCE (apply carefully):
  Rule 2: A FIXED or GUARANTEED annual coupon/yield ≥16%, or a stated REALIZED IRR ≥17%, triggers this. "16% annual fixed yield" = triggers. A number labelled "target", "projected", "illustrative", "pro forma", "up to", "expected", or "anticipated" is a PROJECTION — do NOT trigger Rule 2 on a projection alone.
  Rule 6: "Guaranteed/Risk-Free" includes IMPLIED guarantees — "fixed returns", "secure returns", "capital safeguard", "100% payback", "minimal risk", "predictable returns" all qualify. The word "guaranteed" does NOT need to appear literally. Rule 6 fires ONLY on language that REMOVES the perception of risk. Standard risk disclosure is the OPPOSITE and must NOT trigger it (see DO-NOT-TRIGGER GUARDS).
  Rule 10: Google Ads UTM parameters (utm_source=google_ads), Facebook pixel IDs, or mass-media mentions prove mass advertising.
  Rule 19: Multiple aggressive CTAs ("Book a meeting", "Request a callback", "Schedule now") concentrated in a short document = high-pressure sales.

DO-NOT-TRIGGER GUARDS (obey exactly — these prevent false positives on legitimate offerings):
  Rule 6: Standard risk disclosure is a NEGATIVE signal — do NOT trigger on "past performance is not indicative", "investments involve risk", "you may lose your principal", "returns are not guaranteed", "speculative and illiquid", or on "target"/"projected" returns. Rule 6 fires ONLY on language that REMOVES risk ("guaranteed", "risk-free", "principal protected", "capital safeguard", "cannot lose") with NO offsetting disclaimer in the same chunk.
  Rule 2: Do NOT trigger on a number labelled "target", "projected", "illustrative", "pro forma", "up to", "expected", or "anticipated". Trigger only on a FIXED/guaranteed coupon or a stated REALIZED IRR ≥17% (a 16% FIXED coupon triggers; a 16% "target" does not).
  Rule 15: Do NOT trigger if the chunk discloses ANY purchase price, appraisal, LTV, loan-to-cost, or cap-rate figure.
  Rule 16: Do NOT trigger if the chunk contains ANY risk-factors section, loss/impairment disclosure, or a track record that includes losses.

EVIDENCE TIER — answer IN ORDER, STOP at the first "yes"; never average or hedge between two tiers:
  Q1  Is the evidence a PRIMARY SOURCE inside THIS document (the PPM/subscription agreement text itself, a Form D, an audited financial statement, a FINRA/SEC record)?  → Tier 1
  Q2  Is it the promoter's OWN persuasive/marketing language (a headline, landing page, email, ad, or script) quoted verbatim?  → Tier 2
  Q3  Is it a factual-but-indirect item (a number, table cell, address, footnote) that needs one more fact to prove the issue?  → Tier 3
  Q4  Otherwise it is pure inference / pattern-match  → Tier 4 (and usually DO NOT trigger).
  Tier 1 is RESERVED for primary-source documents; NEVER label marketing copy Tier 1.

TRIGGERING RULES (follow exactly for determinism — the same chunk must always produce the same findings):
  • Output a rule ONLY when triggered=true — i.e. THIS CHUNK affirmatively contains problematic content (a bad claim, a contradiction, a prohibited practice). Assign the appropriate Tier 1–4.
  • For most rules, trigger only on AFFIRMATIVE evidence (a bad claim, a contradiction, a prohibited practice).
  • EXCEPTION — Rules 15 and 16 are ABSENCE rules by design: if the material is clearly an offering/pitch and it omits purchase price/LTV disclosure (Rule 15) or omits any mention of failed deals/losses (Rule 16), that omission IS the trigger. Use Tier 3 for absence-based triggers.
  • Do NOT emit "GAP" rows or triggered=false rows.
  • If a rule does not fire in this chunk, OMIT it entirely from the "rules" array. Never output triggered=false rows.
  • Use the HIGHEST tier the evidence clearly supports; do not hedge between two tiers.
  • Only quote text that actually appears in the material of THIS chunk. Every evidence item MUST include the page number where it appears (use the [[PAGE n]] markers in the text; if none are present use 0).
  • confidence — output EXACTLY one of three values so the same quote always scores the same: 1.0 (explicit, literal instance of the rule), 0.9 (clear via an established synonym), 0.7 (strongly implied, one inferential step). If your honest certainty is ≤0.5, DO NOT emit the rule. Never output any other number. confidence is NOT a score; it only aggregates evidence across chunks.

RELEVANCE GATE (do this FIRST):
  • Decide whether THIS CHUNK is about an investment, financial offering, fund, securities, business opportunity, money-making scheme, or a solicitation to invest/send money.
  • A random photo, unrelated screenshot, blank/index/signature/appendix page, or off-topic text is NOT investment-related. If so, set is_investment_related=false, give a short not_relevant_reason, and return an empty "rules" array.

WORKED EXAMPLE — LEGITIMATE OFFERING (investment-related but properly disclosed; emit NO rules):
  Input: "The Fund is registered with the SEC (CIK 0001234567). Past performance is not indicative of future results; investments involve risk, including the possible loss of principal. Target LTV is capped at 65%. Financial statements are audited annually by an independent registered public accounting firm."
  Correct output: {"chunk_id":0,"page_range":[1,1],"is_investment_related":true,"not_relevant_reason":"","rules":[],"claims":[]}
  Why: proper risk disclosure, a real CIK, a disclosed LTV cap, and audited financials are the HALLMARKS OF LEGITIMACY. They must NOT trigger any rule. Do not confuse disclosure with fraud.

OUTPUT — respond with ONLY a single valid JSON object (no markdown, no commentary) in EXACTLY this shape:
{
  "chunk_id": <the chunk id you were given>,
  "page_range": [<first page in this chunk>, <last page in this chunk>],
  "is_investment_related": <true | false>,
  "not_relevant_reason": "<short description if not investment-related, else empty>",
  "rules": [
    // ONLY the rules that TRIGGER in this chunk (0 or more). Omit all others.
    {
      "rule_id": <1-21>,
      "triggered": true,
      "confidence": <0.45-1.0>,
      "evidence_tier": "Tier 1" | "Tier 2" | "Tier 3" | "Tier 4",
      "evidence": [
        { "page": <int>, "section": "<heading/section label or empty>", "quote": "<verbatim quote from this chunk>", "reason": "<why this triggers the rule>" }
      ]
    }
  ],
  "claims": [
    { "type": "<IRR/Returns|AUM|Track Record|Guarantee|FDIC|Licensing|...>", "claim": "<what the promoter asserts>", "concern": "<why verify>", "page": <int> }
  ]
}

Output ONLY the triggered rules — if no rule fires, return "rules": []. Do NOT pad the array with non-triggered or "GAP" rows.`
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
