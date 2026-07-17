// ════════════════════════════════════════════════════════════════
//  InvestSafe Pro™ — Comprehensive Deterministic Test Suite
//
//  Tests the FULL pipeline without any LLM call by mocking the provider
//  and simulating what DeepSeek would emit for each scenario.
//
//  Categories:
//   A. Legitimate documents (must score Low 0-24)
//   B. Obvious scams (must score Critical 75-100)
//   C. Structural fraud (must score High 50-74)
//   D. Negation edge cases
//   E. Waterfall / preferred return guards
//   F. Whitewash attacks (scam + disclaimers → still Critical)
//   G. Sentence-level negation precision
//   H. PPM structure detection
//   I. Non-investment documents (must score 0)
//   J. Determinism (same input → same output)
//
//  Run:  npx tsx src/test-suite.ts
// ════════════════════════════════════════════════════════════════

import { mergeEvaluations, type MergedDataset } from './merge'
import { FLAG_FRAMEWORK, type ChunkEvaluation, type ChunkDetectors } from './rules'

// ── Test helpers ────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    const msg = detail ? `${name} — ${detail}` : name
    failures.push(msg)
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

function assertRange(score: number, lo: number, hi: number, name: string) {
  assert(score >= lo && score <= hi, name, `score=${score}, expected ${lo}-${hi}`)
}

function assertLevel(level: string, expected: string, name: string) {
  assert(level === expected, name, `level=${level}, expected ${expected}`)
}

// Build a mock rule finding (simulates what DeepSeek would emit)
function R(id: number, tier: string, conf: number, quote = 'evidence quote for rule', reason = 'reason for triggering rule') {
  return {
    rule_id: id,
    triggered: true,
    confidence: conf,
    evidence_tier: tier,
    evidence: [{ page: 1, section: '', quote: quote + ' ' + id, reason: reason + ' ' + id }],
  }
}

// Build a mock ChunkEvaluation with deterministic detectors
function makeChunkEval(
  text: string,
  llmRules: any[],
  overrides: Partial<ChunkEvaluation> = {}
): ChunkEvaluation {
  // Compute detectors from text (same logic as normalizeChunkEval)
  const INVESTMENT_LEXICON: RegExp[] = [
    /\b(invest(or|ment|ing)?|offering|securit(y|ies)|fund|equity|debenture|note|bond|prospectus)\b/i,
    /\b(irr|roi|yield|returns?|distribution|dividend|coupon|nav|aum|preferred return)\b/i,
    /\b(ppm|private placement|reg(ulation)?\s?d|form\s?d|accredited investor|subscription agreement|rule\s?506)\b/i,
    /\b(capital (call|contribution|commitment)|general partner|limited partner|\bgp\b|\blp\b|sponsor|promoter)\b/i,
    /\b(minimum investment|per (unit|share)|\bunits?\b|\bshares?\b|cap(italization)? table)\b/i,
    /\$\s?\d[\d,]{2,}/,
    /\b\d{1,2}(\.\d+)?\s?%/,
  ]
  const LEGIT_DISCLOSURE_LEXICON: RegExp[] = [
    /past performance\b[^.]{0,40}\b(not|no)\b[^.]{0,20}(indicativ|guarante)/i,
    /\brisk factors?\b/i,
    /\byou (may|could|can|might) lose\b[^.]{0,30}(principal|investment|money|capital)/i,
    /\b(speculative|illiquid)\b/i,
    /\bno (assurance|guarantee)\b/i,
    /\bcik\s*#?\s*\d{6,}\b|\bsec file (no|number)\b|\bform\s?d\b|\brule\s?506\s*\(\s*[bc]\s*\)/i,
    /\bcrd\s*#?\s*\d{4,}\b|\biard\s*#?\s*\d{4,}\b/i,
    /\baudited\b[^.]{0,20}\bstatements?\b|\bindependent (registered )?(public )?(auditor|accounting)/i,
    /\b(qualified custodian|custodian|transfer agent|escrow agent)\b/i,
    /\bloan[- ]to[- ]value\b|\bltv\b[^.]{0,15}\d{1,3}\s*%|\bpurchase price\b|\bcap rate\b/i,
    /\breturns?\s+(are\s+)?not\s+guaranteed\b/i,
    /\ball\s+investments?\b[^.]{0,25}\b(involve|includ)\w*\b[^.]{0,20}\brisk/i,
    /\b(possible|potential|risk of|complete|partial)\b[^.]{0,20}\bloss of\b[^.]{0,20}(principal|capital|funds|investment)/i,
    /\bnet asset value\b|\bnav\b\s+per\s+(unit|share)/i,
    /\b(management|performance|acquisition|administrative)\s+fee|\bperformance allocation\b/i,
    /\btarget(ed)?\b[^.]{0,80}(does\s*n'?t|do\s*not|not)\b[^.]{0,25}(represent|guarantee)\b[^.]{0,25}actual/i,
  ]
  const PPM_STRUCTURE_LEXICON: RegExp[] = [
    /\bprivate placement memorandum\b|\bconfidential\s+(private\s+)?placement\b/i,
    /\bsubscription agreement\b/i,
    /\blimited liability company agreement\b|\bllc agreement\b|\boperating agreement\b/i,
    /\brisk factors?\b[^.]{0,20}(investment|company|property|units?|shares?)/i,
    /\bpotential conflicts? of interest\b/i,
    /\bcertain (u\.?s\.?\s+)?federal income tax\b|\btax considerations\b/i,
    /\baccredited investor\b|\bregulation\s?d\b|\brule\s?506\b/i,
    /\bexhibit\s+[a-z]\b/i,
    /\b(hereby|herein|hereinafter|hereof|hereunder|pursuant to|notwithstanding)\b/i,
    /\bsection\s+(i{1,3}v?|v?i{0,3}|[ivxlc]+)\b\s*[—–-]\s*/i,
    /\bsecurities act of 1933\b|\binvestment company act\b|\bsecurities exchange act\b/i,
    /\b(unitholder|shareholder|limited partner)\s*(s\b|'s\b|\b)/i,
  ]
  const LEGAL_FORMALITY_LEXICON: RegExp[] = [
    /\b(hereby|herein|hereinafter|hereof|hereunder)\b/i,
    /\bpursuant to\b/i,
    /\bnotwithstanding\b/i,
    /\bin the sole (and absolute )?discretion\b/i,
    /\b(representations?|warrant(y|ies)|covenants?)\b[^.]{0,30}\b(investor|unitholder|subscriber)/i,
    /\bindemnif(y|ication)\b/i,
    /\bgoverning law\b|\bjurisdiction\b/i,
    /\bexhibit\s+[a-z]\b/i,
  ]
  const HAS_LTV_RE = /\bloan[- ]to[- ]value\b|\bltv\b|\bpurchase price\b|\bcap rate\b|\bacquisition price\b/i
  const HAS_LOSS_POS_RE = /\brisk factors?\b|\b(may|could|might) lose\b|\bloss of (principal|capital|investment)\b|\brisk of loss\b|\bno assurance\b|\bloss(es)?\b|\bdefault(ed|s)?\b|\bimpair(ment|ed)?\b|\bwrite[- ]?down\b|\bunderperform/i
  const HAS_LOSS_NEG_RE = /\b(no|zero|without|never|cannot|can'?t|impossible)\b[^.]{0,15}\bloss(es)?\b|\bno (chance|risk) of loss\b|\bloss[- ]free\b|\bcannot lose\b/i
  const WATERFALL_RE = /\b(waterfall|distribution|distributable proceeds|profit share|catch[- ]?up|sponsor catch|pari passu)\b/i
  const PREFERRED_RETURN_CONTEXT_RE = /\bpreferred return\b.*\b\d{1,2}\s*%|\b\d{1,2}\s*%\s*preferred return\b/i

  const AFFIRM_GUARANTEE_PATTERNS: RegExp[] = [
    /\bguaranteed?\b.*\b(return|yield|income|profit)/i,
    /\b(return|yield|income)\b.*\bguaranteed?\b/i,
    /\brisk[- ]?free\b/i,
    /\bminimal\s+risk\b/i,
    /\bcapital\s+safeguard/i,
    /\b100\s*%\s*(payback|repayment|principal|bond\s*payback)/i,
    /\b100\s*%\s*(principal\s+)?protect(ed|ion)\b/i,
    /\bsecure[,\s]+predictable\s+returns?\b/i,
    /\bcannot\s+lose\b/i,
    /\b(no|zero)\s+(chance|risk)\s+of\s+loss\b/i,
    /\bloss[- ]free\b/i,
    /\bcompletely\s+safe\b/i,
  ]
  const GUARANTEE_DISCLAIMER_RE = /\b(not?|no|never|cannot|can'?t|without|aren'?t|isn'?t|don'?t|does\s*n'?t)\b[^.]{0,25}\bguaranteed?\b|\bguaranteed?\b[^.]{0,25}\b(not|no|never)\b|\breturn[s]?\s+(are\s+)?not\s+guaranteed\b|\bno\s+guarantee\b|\bcannot\s+be\s+guaranteed\b/i

  function detectAffirmativeGuarantee(t: string): boolean {
    const sentences = t.split(/(?<=[.!?;])\s+/).filter(s => s.length > 5)
    for (const s of sentences) {
      const hasGuaranteeLang = AFFIRM_GUARANTEE_PATTERNS.some(p => p.test(s))
      if (!hasGuaranteeLang) continue
      const isGuaranteeWord = /\bguaranteed?\b/i.test(s)
      if (isGuaranteeWord && GUARANTEE_DISCLAIMER_RE.test(s)) {
        const nonGuaranteeHit = AFFIRM_GUARANTEE_PATTERNS.filter(p => !/guarante/i.test(p.source)).some(p => p.test(s))
        if (nonGuaranteeHit) return true
        continue
      }
      return true
    }
    return false
  }

  function matchedFamilies(text: string, lexicon: RegExp[]): number[] {
    const out: number[] = []
    for (let i = 0; i < lexicon.length; i++) if (lexicon[i].test(text)) out.push(i)
    return out
  }

  const det: ChunkDetectors = {
    invFamilies: matchedFamilies(text, INVESTMENT_LEXICON),
    legitFamilies: matchedFamilies(text, LEGIT_DISCLOSURE_LEXICON),
    hasLtv: HAS_LTV_RE.test(text),
    hasLoss: HAS_LOSS_POS_RE.test(text) && !HAS_LOSS_NEG_RE.test(text),
    ppmFamilies: matchedFamilies(text, PPM_STRUCTURE_LEXICON),
    legalFamilies: matchedFamilies(text, LEGAL_FORMALITY_LEXICON),
    hasWaterfall: WATERFALL_RE.test(text) || PREFERRED_RETURN_CONTEXT_RE.test(text),
    hasAffirmativeGuarantee: detectAffirmativeGuarantee(text),
  }

  // Build full 21-rule array (fill non-triggered rules with GAP)
  const rulesMap = new Map(llmRules.map(r => [r.rule_id, r]))
  const allRules = FLAG_FRAMEWORK.map(def => {
    const r = rulesMap.get(def.n)
    if (r) return r
    return {
      rule_id: def.n,
      triggered: false,
      confidence: 0,
      evidence_tier: 'GAP',
      evidence: [],
    }
  })

  return {
    chunk_id: 0,
    page_range: [1, 1] as [number, number],
    is_investment_related: true,
    not_relevant_reason: '',
    rules: allRules,
    claims: [],
    det,
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════
//  TEST CASES
// ═══════════════════════════════════════════════════════════════

console.log('\n═══ A. LEGITIMATE DOCUMENTS (must score Low 0-24) ═══\n')

// A1: Formal PPM — Franklin-style subscription package
{
  const text = `CONFIDENTIAL PRIVATE PLACEMENT MEMORANDUM. 707 Franklin LLC (a Delaware limited liability company).
Up to $11,200,000 of Limited Unitholder Units. Class A: $1,100,000 — 10% preferred return with no equity split.
Class B: $7,000,000 — 7% preferred return and 70% profit share after the Sponsor Catch-Up (adjusted to 50% after 15% IRR).
Class C: $3,100,000 — 8% preferred return and 80% profit share after the Sponsor Catch-Up.
Subscription Agreement attached as Exhibit B. LLC Agreement attached as Exhibit C.
The Units have not been recommended, approved or disapproved by the SEC. Any representation to the contrary is a criminal offense.
Past performance is not necessarily indicative of future results. There can be no assurance that the Company will achieve comparable results.
Section V — Certain Risk Factors. An investment in the Company is highly speculative and involves a high degree of risk, including the risk of loss of a Unitholder's entire investment.
Section VII — Potential Conflicts of Interest. Certain U.S. Federal Income Tax Considerations.
The Company hereby agrees to make distributions pursuant to the waterfall herein. Accredited investors only. Rule 506(b).
The Property is located at 707 Franklin Gateway SE, Marietta, GA 30067. Purchase price $37,250,000.
The Manager may amend notwithstanding any provision herein. Representations and warranties of investor.
Securities Act of 1933. Investment Company Act. Indemnification. Governing law.`

  // Simulate DeepSeek over-triggering (the common false-positive pattern):
  const llmRules = [
    R(2, 'Tier 2', 0.7, '15% IRR', 'high return in Buffett zone'),
    R(16, 'Tier 3', 0.7, 'no failed deal', 'no losses disclosed'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 24, 'A1: Formal PPM (Franklin-style)')
  assertLevel(result.riskLevel, 'Low', 'A1: risk level')
}

// A2: Fund overview with modest returns + full disclaimers
{
  const text = `IncomePlus Fund. Tax-efficient passive income and appreciation. LIMITED OFFER 1% in bonus units through 8/1/2026.
Target Net IRR 9%-11%. Net Distribution Yield 6.7%. Hold Period 5+ Years. Asset Type Multifamily. Minimum Investment $100K.
Proven Track Record. Trailing 1-Y 7.1%, Trailing 3-Y 5.5%, Trailing 5-Y 9.3%. Monthly Net Total Return: 2021 21.86%, 2022 9.51%, 2020 -6.90%.
Fees: 1.25% Management Fee, 10% Performance Allocation, 0.5% Acquisition Fee. NAV Per Unit $11.13.
Returns are not guaranteed. Past performance is no guarantee of future results.
All investments involve a degree of risk, including the risk of loss, including possible loss of principal.
Targeted performance doesn't represent an actual investment; there can be no assurance that the Fund will achieve its target returns.
Get Fund Documents for due diligence.`

  const llmRules = [
    R(2, 'Tier 2', 0.7, '21.86%', 'high historical return'),
    R(15, 'Tier 3', 0.7, 'no LTV', 'no purchase price'),
    R(16, 'Tier 3', 0.7, 'no failed deals', 'no failures'),
    R(19, 'Tier 3', 0.7, 'limited offer', 'urgency'),
    R(20, 'Tier 3', 0.7, 'fund docs', 'fundraising'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 24, 'A2: Fund overview (IncomePlus-style)')
  assertLevel(result.riskLevel, 'Low', 'A2: risk level')
}

// A3: SEC-registered offering with CIK
{
  const text = `The Fund is registered with the SEC (CIK 0001234567). Form D filed.
Past performance is not indicative of future results; investments involve risk, including the possible loss of principal.
Target LTV is capped at 65%. Financial statements are audited annually by an independent registered public accounting firm.
Qualified custodian holds all fund assets. Minimum investment $250,000. 6% annual distribution yield.`

  const chunk = makeChunkEval(text, [])
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 7, 'A3: SEC-registered fund with CIK')
  assertLevel(result.riskLevel, 'Low', 'A3: risk level')
}

// A4: Real estate syndication with detailed disclosures
{
  const text = `Offering of $5,000,000 in Class A Units. Investment in multifamily property at 123 Main St, Austin TX 78701.
Purchase price $12,500,000. Cap rate 5.2%. LTV 72%. Senior loan $9,000,000 from Wells Fargo.
7% preferred return. Sponsor co-invests $500,000. 5-year hold period. Accredited investors only.
Risk Factors: illiquid investment. You may lose your entire investment. Speculative. No assurance of distributions.
Past performance is not indicative of future results. Returns are not guaranteed.`

  const chunk = makeChunkEval(text, [R(18, 'Tier 3', 0.7, 'co-invests', 'unverified co-invest')])
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 24, 'A4: Real estate syndication with disclosures')
  assertLevel(result.riskLevel, 'Low', 'A4: risk level')
}

// A5: High historical return in a legitimate track record
{
  const text = `Fund Performance (as of December 31, 2025). Net of fees.
2020: -6.90%. 2021: 21.86%. 2022: 9.51%. 2023: 4.50%. 2024: 5.60%. 2025: 7.10%.
Trailing 12-month return: 7.1%. Since inception annualized return: 8.2%.
Past performance is no guarantee of future results. All investments involve risk.
Returns are not guaranteed. The fund's investment objective is income and growth.`

  const llmRules = [R(2, 'Tier 2', 0.8, '21.86%', 'return over 17%')]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 10, 'A5: High past year (21.86%) in legit track record')
  assertLevel(result.riskLevel, 'Low', 'A5: risk level')
}

console.log('\n═══ B. OBVIOUS SCAMS (must score Critical 75-100) ═══\n')

// B1: Guaranteed return with risk-free language
{
  const text = `AIX Bond. GUARANTEED 18% annual fixed yield with capital safeguard on your principal — risk free.
100% principal protected. Book a call now. Limited spots. Wire by Friday.
Invest now and start earning immediately. Schedule a meeting today.`

  const llmRules = [
    R(6, 'Tier 2', 1.0, 'GUARANTEED 18% annual fixed yield', 'guaranteed return'),
    R(2, 'Tier 2', 0.9, '18% annual fixed yield', 'Buffett zone'),
    R(19, 'Tier 2', 0.9, 'Book a call now. Limited spots. Wire by Friday.', 'high pressure'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 75, 100, 'B1: Guaranteed 18% + risk-free + high pressure')
  assertLevel(result.riskLevel, 'Critical', 'B1: risk level')
}

// B2: Fixed high yield without disclaimers
{
  const text = `Earn a fixed 20% annual return on your investment. Locked-in yield, paid monthly.
Your capital is secure with our proprietary protection mechanism. Minimal risk.
Our fund has never had a down year. No losses since inception.`

  const llmRules = [
    R(2, 'Tier 2', 1.0, '20% annual return', 'Buffett zone fixed'),
    R(6, 'Tier 2', 0.9, 'secure, minimal risk', 'risk-free language'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 75, 100, 'B2: Fixed 20% + minimal risk + no losses')
  assertLevel(result.riskLevel, 'Critical', 'B2: risk level')
}

// B3: False FDIC claim
{
  const text = `Your investment is FDIC insured up to $250,000. SEC approved offering.
Invest in our real estate fund for a 12% annual yield. $50,000 minimum.`

  const llmRules = [
    R(5, 'Tier 2', 1.0, 'FDIC insured', 'false FDIC'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 75, 100, 'B3: False FDIC insurance claim')
  assertLevel(result.riskLevel, 'Critical', 'B3: risk level')
}

// B4: FINRA-barred promoter
{
  const text = `Join our exclusive investment club. 15% annual returns guaranteed.
Run by John Smith, a veteran Wall Street executive. $25,000 minimum investment.`

  const llmRules = [
    R(4, 'Tier 1', 1.0, 'John Smith FINRA barred', 'promoter barred by FINRA'),
    R(6, 'Tier 2', 0.9, '15% returns guaranteed', 'guaranteed returns'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 75, 100, 'B4: FINRA-barred promoter')
  assertLevel(result.riskLevel, 'Critical', 'B4: risk level')
}

console.log('\n═══ C. STRUCTURAL FRAUD (must score High 50-74) ═══\n')

// C1: Multiple structural red flags (NRIA archetype)
{
  const text = `Invest in our diversified real estate portfolio. $3 billion AUM. 200+ properties.
Managed by our affiliated property management company. All capital flows through our internal fund.
$50,000 minimum. 8% preferred return. Co-GP across all deals.`

  const llmRules = [
    R(9, 'Tier 2', 0.9, 'internal fund', 'vertical integration'),
    R(12, 'Tier 2', 0.9, 'Co-GP across all deals', 'co-GP double counting'),
    R(11, 'Tier 3', 0.7, '$3 billion AUM', 'AUM without debt disclosure'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 50, 100, 'C1: Structural fraud (NRIA archetype)')
  assert(result.riskLevel === 'High' || result.riskLevel === 'Critical', 'C1: risk level High or Critical')
}

// C2: Irrational expense ratios + debt mismatch
{
  const text = `Our fund generates $500,000 monthly revenue from a 50-unit property. Total expenses $50,000.
Senior loan of $45,000,000 on a property appraised at $12,000,000. 375% LTV.
Returns of 15% guaranteed. $100,000 minimum investment.`

  const llmRules = [
    R(1, 'Tier 2', 0.9, '$500K revenue, $50K expenses', 'irrational ratio'),
    R(3, 'Tier 2', 0.9, '$45M loan on $12M property', 'debt incompatible with returns'),
    R(21, 'Tier 2', 0.9, '375% LTV', 'asset overpayment'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 50, 100, 'C2: Irrational ratios + debt mismatch')
  assert(result.riskLevel === 'High' || result.riskLevel === 'Critical', 'C2: risk level High+')
}

console.log('\n═══ D. NEGATION EDGE CASES ═══\n')

// D1: "Returns are not guaranteed" — must NOT trigger rule 6
{
  const text = `Returns are not guaranteed. Past performance is no guarantee of future results.
Target 8% annual yield. $100,000 minimum investment. Accredited investors only.
All investments involve risk, including possible loss of principal.
Risk Factors section describes material risks. Speculative and illiquid.`

  const llmRules = [R(6, 'Tier 2', 0.7, 'guaranteed', 'contains guarantee word')]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 24, 'D1: Negated "guaranteed" must NOT trigger')
  assertLevel(result.riskLevel, 'Low', 'D1: risk level')
}

// D2: "No guarantee" — must NOT trigger rule 6
{
  const text = `There can be no guarantee or assurance that the Company will achieve its objectives.
No assurance of distributions or income. Investment involves substantial risk.
The offering price was determined arbitrarily. You may lose your entire investment.
7% preferred return. $50,000 minimum investment. Accredited investors.`

  const llmRules = [R(6, 'Tier 2', 0.7, 'no guarantee', 'guarantee word present')]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 24, 'D2: "No guarantee" must NOT trigger')
  assertLevel(result.riskLevel, 'Low', 'D2: risk level')
}

// D3: "Cannot be guaranteed" — must NOT trigger
{
  const text = `Distributions cannot be guaranteed and are subject to the Manager's sole discretion.
The Units will not be registered under the Securities Act of 1933.
Past performance is not indicative of future results. $200,000 minimum. 6% distribution yield.
All investments involve risk. Speculative. Rule 506(b). Accredited investors only.`

  const llmRules = [R(6, 'Tier 3', 0.7, 'guaranteed', 'guarantee in text')]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 24, 'D3: "Cannot be guaranteed" must NOT trigger')
  assertLevel(result.riskLevel, 'Low', 'D3: risk level')
}

// D4: "No chance of loss" — scam negation pattern, MUST trigger
{
  const text = `There is absolutely no chance of loss with our investment product.
Your capital cannot lose value. Loss-free investment guaranteed.
Earn 15% annually. Wire funds today. $25,000 minimum. Limited spots.`

  const llmRules = [
    R(6, 'Tier 2', 1.0, 'no chance of loss, loss-free, guaranteed', 'risk-free language'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 50, 100, 'D4: "No chance of loss" — scam negation MUST trigger')
  assert(result.riskLevel === 'High' || result.riskLevel === 'Critical', 'D4: risk level High+')
}

// D5: "Fixed costs" must NOT trigger FIXED_RE (not a financial return)
{
  const text = `The Company is subject to fixed costs including mortgage payments, taxes, and insurance.
These fixed costs do not decrease when revenue declines. 7% preferred return.
$50,000 minimum investment. Purchase price $10,000,000. LTV 70%. Accredited investors.
Risk Factors: speculative. Past performance not indicative. You may lose principal.
All investments involve risk. Returns are not guaranteed. No assurance of distributions.`

  const llmRules: any[] = []
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 10, 'D5: "Fixed costs" must not false-positive as fixed return')
  assertLevel(result.riskLevel, 'Low', 'D5: risk level')
}

console.log('\n═══ E. WATERFALL / PREFERRED RETURN GUARDS ═══\n')

// E1: "15% IRR" as a waterfall breakpoint — must NOT trigger rule 2
{
  const text = `Waterfall: Distributable proceeds shall be distributed as follows:
First, 7% preferred return to Class B Limited Unitholders.
Second, 30% to Sponsor until catch-up. Third, 70/30 split until 15% IRR achieved, then 50/50.
Purchase price $37,250,000. Accredited investors. $50,000 minimum. Risk Factors.
Past performance is not indicative. No assurance. Speculative. You may lose principal.`

  const llmRules = [R(2, 'Tier 2', 0.7, '15% IRR', 'return in Buffett zone')]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 24, 'E1: 15% IRR waterfall breakpoint')
  assertLevel(result.riskLevel, 'Low', 'E1: risk level')
}

// E2: "10% preferred return" — contractual distribution priority, NOT a promise
{
  const text = `Class A Limited Unitholders are entitled to a 10% preferred return payable monthly.
Class B Limited Unitholders are entitled to a 7% preferred return.
Distributions in the sole and absolute discretion of the Manager.
Purchase price $20,000,000. LTV 75%. Risk Factors. Speculative.
Past performance not indicative. No assurance. You may lose your investment. Accredited investors.`

  const llmRules = [R(2, 'Tier 3', 0.7, '10% preferred return', 'high return')]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 24, 'E2: 10% preferred return is contractual, not fraud')
  assertLevel(result.riskLevel, 'Low', 'E2: risk level')
}

// E3: "Profit share after catch-up" — waterfall language, NOT a promise
{
  const text = `Pari passu among Class B and Class C Unitholders.
70% to Class B Unitholders and 30% to Sponsor Unitholder until 15% IRR achieved.
Then 50/50 split. Catch-up to Sponsor. Distributable proceeds net of reserves.
$1,000 per Unit. Accredited investors. Risk Factors. Speculative. You could lose everything.
Past performance is not indicative. Returns are not guaranteed.`

  const llmRules = [R(2, 'Tier 2', 0.7, '15% IRR', 'waterfall breakpoint')]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 24, 'E3: Profit share + catch-up = waterfall, not fraud')
  assertLevel(result.riskLevel, 'Low', 'E3: risk level')
}

// E4: BUT "guaranteed 18% fixed return" in a supposed PPM — still triggers
{
  const text = `Private Placement Memorandum. Subscription Agreement. Exhibit A.
Hereby the Company guarantees an 18% annual fixed return on all investor capital.
Risk-free investment. Your principal is 100% protected. Waterfall distribution applies.
$50,000 minimum. Accredited investors. Securities Act of 1933.`

  const llmRules = [
    R(2, 'Tier 2', 1.0, 'guaranteed 18% annual fixed return', 'guaranteed high return'),
    R(6, 'Tier 2', 1.0, 'guaranteed, risk-free, 100% protected', 'risk-free language'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 75, 100, 'E4: Guaranteed 18% fixed in PPM = still fraud')
  assertLevel(result.riskLevel, 'Critical', 'E4: risk level')
}

console.log('\n═══ F. WHITEWASH ATTACKS (scam + disclaimers → still Critical) ═══\n')

// F1: Scam + pasted standard disclaimers
{
  const text = `AIX Bond. GUARANTEED 18% annual fixed yield with capital safeguard on your principal — risk free.
100% principal protected. Book a call now. Limited spots.
Past performance is no guarantee of future results. All investments involve risk, including possible loss of principal.
Returns are not guaranteed. Management fee applies. NAV per unit tracked.`

  const llmRules = [
    R(6, 'Tier 2', 0.9, 'GUARANTEED, risk free, capital safeguard', 'guarantee language'),
    R(2, 'Tier 2', 0.9, '18% annual fixed yield', 'Buffett zone'),
    R(19, 'Tier 2', 0.9, 'Book a call, limited spots', 'high pressure'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 75, 100, 'F1: Scam + pasted disclaimers = still Critical')
  assertLevel(result.riskLevel, 'Critical', 'F1: risk level')
}

// F2: Scam pasting PPM-like legal language
{
  const text = `Investment opportunity. GUARANTEED 22% annual return. Risk-free.
Hereby we offer Units pursuant to Rule 506. Accredited investors only.
Subscription Agreement attached as Exhibit A. Securities Act of 1933.
Risk Factors: there are no risk factors. Your money is completely safe.`

  const llmRules = [
    R(6, 'Tier 2', 1.0, 'GUARANTEED, risk-free, completely safe', 'guarantee'),
    R(2, 'Tier 2', 0.9, '22% annual return', 'Buffett zone'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 75, 100, 'F2: Scam with fake PPM language')
  assertLevel(result.riskLevel, 'Critical', 'F2: risk level')
}

// F3: Scam with "zero chance of loss" negation pattern
{
  const text = `Premier Investment Club. Earn 25% annually with zero chance of loss.
Cannot lose your investment. All returns guaranteed. FDIC insured.
$10,000 minimum. Wire today. Limited availability.`

  const llmRules = [
    R(6, 'Tier 2', 1.0, 'zero chance of loss, guaranteed', 'risk-free'),
    R(5, 'Tier 2', 1.0, 'FDIC insured', 'false FDIC'),
    R(2, 'Tier 2', 0.9, '25% annually', 'Buffett zone'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 75, 100, 'F3: "Zero chance of loss" + fake FDIC')
  assertLevel(result.riskLevel, 'Critical', 'F3: risk level')
}

console.log('\n═══ G. SENTENCE-LEVEL NEGATION PRECISION ═══\n')

// G1: Fraud claim and disclaimer in DIFFERENT sentences (scam still caught)
{
  const text = `Our fund provides a guaranteed 20% annual return on all investments.
Management fee of 2% applies. Returns are not guaranteed on a going-forward basis.
$50,000 minimum investment. Wire today.`

  // The first sentence is affirmative fraud ("guaranteed 20% annual return").
  // The third sentence has a negated "guaranteed" but in a DIFFERENT sentence.
  // Sentence-level check should still catch the affirmative first sentence.
  const llmRules = [
    R(6, 'Tier 2', 0.9, 'guaranteed 20% annual return', 'guarantee language'),
    R(2, 'Tier 2', 0.9, '20% annual return', 'Buffett zone'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 75, 100, 'G1: Affirmative fraud + separate disclaimer → still Critical')
  assertLevel(result.riskLevel, 'Critical', 'G1: risk level')
}

// G2: Only negated guarantee (all sentences disclaim) → NOT triggered
{
  const text = `Returns are not guaranteed by the Company or any of its affiliates.
No guarantee of distributions. There is no guarantee that the Fund will achieve its objectives.
Distributions cannot be guaranteed and are at the Manager's sole discretion.
Target 7% yield. $100,000 minimum. Accredited investors. Risk Factors. Speculative. You may lose principal.`

  const llmRules = [R(6, 'Tier 3', 0.7, 'guarantee word', 'guarantee detected')]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 24, 'G2: Every guarantee sentence is negated → no trigger')
  assertLevel(result.riskLevel, 'Low', 'G2: risk level')
}

console.log('\n═══ H. PPM STRUCTURE DETECTION ═══\n')

// H1: Dense PPM structure triggers isFormalPPM → stronger suppression
{
  const text = `CONFIDENTIAL PRIVATE PLACEMENT MEMORANDUM. Subscription Agreement.
Limited Liability Company Agreement. Exhibit A. Exhibit B. Exhibit C.
Section V — Certain Risk Factors. Section VII — Potential Conflicts of Interest.
Certain U.S. Federal Income Tax Considerations. Securities Act of 1933.
Accredited investors only. Regulation D. Rule 506(b).
Hereby the Company agrees. Pursuant to the LLC Agreement. Notwithstanding the foregoing.
In the sole and absolute discretion of the Manager. Representations and warranties of investor.
Indemnification. Governing law. Unitholders and Shareholders.
10% preferred return. Waterfall distribution. 70/30 profit share until 15% IRR. Catch-up.
Purchase price $10,000,000. LTV 70%. Cap rate 5%.
Past performance not indicative. You may lose your investment. Speculative. No assurance.`

  // Even if LLM triggers several rules, the PPM structure should suppress them
  const llmRules = [
    R(2, 'Tier 3', 0.7, '15% IRR', 'Buffett zone'),
    R(11, 'Tier 3', 0.7, 'AUM', 'aum without debt'),
    R(14, 'Tier 3', 0.7, 'no state licensing', 'licensing'),
    R(18, 'Tier 3', 0.7, 'co-invest', 'unverified'),
    R(20, 'Tier 3', 0.7, 'fundraising', 'perpetual'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 24, 'H1: Dense PPM structure suppresses soft rules')
  assertLevel(result.riskLevel, 'Low', 'H1: risk level')
}

// H2: PPM structure does NOT protect strong fraud signals
{
  const text = `CONFIDENTIAL PRIVATE PLACEMENT MEMORANDUM. Subscription Agreement.
Exhibit A. Section V — Risk Factors. Accredited investors. Securities Act of 1933.
Hereby. Pursuant to. Notwithstanding. Representations of investor. Indemnification.
GUARANTEED 18% annual fixed return. Risk-free investment. Your capital is 100% protected.`

  const llmRules = [
    R(6, 'Tier 2', 1.0, 'GUARANTEED, risk-free, 100% protected', 'guarantee language'),
    R(2, 'Tier 2', 0.9, '18% annual fixed return', 'Buffett zone'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 75, 100, 'H2: PPM structure does NOT protect strong fraud')
  assertLevel(result.riskLevel, 'Critical', 'H2: risk level')
}

console.log('\n═══ I. NON-INVESTMENT DOCUMENTS (must score 0) ═══\n')

// I1: Recipe
{
  const text = `Grandmother's Chocolate Cake Recipe. Preheat oven to 350°F. Mix 2 cups flour,
1.5 cups sugar, 3/4 cup cocoa powder. Add 2 eggs, 1 cup milk, 1/2 cup vegetable oil.
Bake for 30 minutes. Serve with frosting. Feeds 12. Cost about $15 total.`

  const chunk = makeChunkEval(text, [])
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 0, 'I1: Recipe — not investment related')
}

// I2: News article mentioning financial terms
{
  const text = `The Federal Reserve raised interest rates by 0.25% today, bringing the benchmark
rate to 5.5%. Stocks fell 2% on the news. The S&P 500 lost $300 billion in market cap.
Bond yields rose. Analysts expect further tightening. Inflation remains at 3.2%.`

  const chunk = makeChunkEval(text, [])
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 0, 'I2: News article — not an offering')
}

console.log('\n═══ J. DETERMINISM (same input → same output) ═══\n')

// J1: Run the same input 5 times, verify identical scores
{
  const text = `IncomePlus Fund. Target Net IRR 9%-11%. 6.7% distribution yield.
Trailing returns: 2021 21.86%, 2020 -6.90%. Returns are not guaranteed.
All investments involve risk including loss of principal. Fees: 1.25% management.
NAV per unit $11.13. Get Fund Documents for due diligence.`

  const llmRules = [
    R(2, 'Tier 2', 0.7, '21.86%', 'high past return'),
    R(19, 'Tier 3', 0.7, 'limited offer', 'urgency'),
  ]

  const scores: number[] = []
  for (let i = 0; i < 5; i++) {
    const chunk = makeChunkEval(text, llmRules)
    const result = mergeEvaluations([chunk])
    scores.push(result.riskScore)
  }
  const allSame = scores.every(s => s === scores[0])
  assert(allSame, 'J1: Five runs produce identical scores', `scores=[${scores.join(',')}]`)
}

// J2: Multi-chunk document produces identical score on re-merge
{
  const text1 = `Private Placement Memorandum. 707 Franklin LLC. Up to $11,200,000.
Subscription Agreement. LLC Agreement. Exhibit A. Exhibit B. Exhibit C.
Securities Act of 1933. Accredited investors. Rule 506(b). Hereby. Pursuant to.
Notwithstanding. Representations of investor. Indemnification. Governing law.`

  const text2 = `Section V — Risk Factors. Highly speculative. Risk of loss of entire investment.
Past performance not necessarily indicative of future results. No assurance.
You may lose your principal. Speculative and illiquid. Purchase price $37,250,000.
Waterfall: 10% preferred return, then 70/30 split until 15% IRR. Catch-up. Pari passu.`

  const chunks = [
    makeChunkEval(text1, [R(14, 'Tier 3', 0.7, 'no state licensing', 'licensing')]),
    makeChunkEval(text2, [R(2, 'Tier 3', 0.7, '15% IRR', 'waterfall breakpoint')]),
  ]
  // Give chunk 2 a different chunk_id
  chunks[1].chunk_id = 1

  const r1 = mergeEvaluations(chunks)
  const r2 = mergeEvaluations(chunks)
  assert(r1.riskScore === r2.riskScore, 'J2: Multi-chunk merge deterministic', `r1=${r1.riskScore} r2=${r2.riskScore}`)
  assertRange(r1.riskScore, 0, 24, 'J2: Multi-chunk PPM scores Low')
}

console.log('\n═══ K. ABSENCE RULE CANCELLATION ═══\n')

// K1: Rule 15 canceled when LTV/price is disclosed
{
  const text = `The offering memorandum discloses a purchase price of $10,000,000.
LTV ratio of 70%. Cap rate 5.2%. $50,000 minimum investment.
7% preferred return. Risk factors. Speculative. You may lose principal.
Past performance not indicative. Returns are not guaranteed. Accredited investors.`

  const llmRules = [R(15, 'Tier 3', 0.7, 'no LTV', 'LTV not disclosed')]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  const rule15 = result.findings.find(f => f.n === 15)
  assert(!rule15?.triggered, 'K1: Rule 15 canceled when LTV/price disclosed')
}

// K2: Rule 16 canceled when losses are disclosed
{
  const text = `Track record includes losses: 2020 -6.90%, 2023 -0.63%.
Risk of loss of principal. You may lose your entire investment.
Defaults and impairments may occur. 7% target yield. $100K minimum.
Past performance not indicative. Returns are not guaranteed. Accredited investors.`

  const llmRules = [R(16, 'Tier 3', 0.7, 'no failed deals', 'no failures')]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  const rule16 = result.findings.find(f => f.n === 16)
  assert(!rule16?.triggered, 'K2: Rule 16 canceled when losses disclosed')
}

// K3: Rule 16 NOT canceled by negated loss ("zero chance of loss")
{
  const text = `There is absolutely no chance of loss. Cannot lose your investment.
15% annual return. $25,000 minimum. Wire now.`

  const llmRules = [
    R(16, 'Tier 3', 0.7, 'no loss disclosure', 'no failures'),
    R(6, 'Tier 2', 1.0, 'no chance of loss', 'risk-free'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  // Rule 16 should NOT be canceled because HAS_LOSS_NEG_RE matches
  // But rule 6 at Tier 2 makes this Critical anyway
  assertRange(result.riskScore, 75, 100, 'K3: Scam negated loss does not cancel rule 16')
}

console.log('\n═══ L. EDGE CASES & REGRESSION GUARDS ═══\n')

// L1: "Target 20% IRR" is a projection — NOT a fixed promise
{
  const text = `The fund targets a 20% IRR over the 5-year hold period.
Projected returns of 18-22% based on current market conditions.
These projections are illustrative and not guaranteed. Speculative investment.
$250,000 minimum. Accredited investors. Risk Factors. You may lose your investment.
Past performance not indicative. Returns are not guaranteed.`

  const llmRules = [R(2, 'Tier 2', 0.8, 'targets 20% IRR', 'Buffett zone')]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 24, 'L1: "Target 20% IRR" is projection — not fraud')
  assertLevel(result.riskLevel, 'Low', 'L1: risk level')
}

// L2: Sudden pivot (car wash + oil) — should trigger
{
  const text = `After 10 years in multifamily real estate, we are now offering investments in:
Car Wash Portfolios — 25% target yield. Oil & Gas Exploration — 30% projected returns.
Cryptocurrency Mining — 40% expected annual returns. $10,000 minimum each.
Refer a friend and earn 5% bonus. No state licensing required for our offerings.`

  const llmRules = [
    R(17, 'Tier 2', 0.9, 'car wash, oil, crypto', 'sudden pivot'),
    R(13, 'Tier 2', 0.9, 'refer a friend 5% bonus', 'unlicensed solicitation'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 10, 100, 'L2: Sudden pivot + refer-a-friend flags detected')
  assert(result.triggeredFlags.length >= 2, 'L2: at least 2 rules triggered', `triggered=${result.triggeredFlags.length}`)
}

// L3: Mass advertising (Google Ads UTM parameters)
{
  const text = `utm_source=google_ads&gad_campaignid=12345678901
Invest in our real estate fund for 12% annual returns. $50,000 minimum.
Join 5,000+ investors who trust us. Schedule a free consultation today.`

  const llmRules = [
    R(10, 'Tier 2', 0.9, 'utm_source=google_ads', 'mass advertising'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 1, 100, 'L3: Google Ads UTM triggers rule 10')
}

// L4: Single promotional incentive is NOT high pressure
{
  const text = `LIMITED OFFER: 1% bonus units on new investments through August 1, 2026.
Target 9% IRR. $100,000 minimum. Accredited investors.
Risk Factors. Speculative. You may lose principal. Past performance not indicative.
Returns are not guaranteed. All investments involve risk. NAV per unit $11.13.
Management fee 1.25%. Performance allocation 10%.`

  const llmRules = [R(19, 'Tier 3', 0.7, 'LIMITED OFFER', 'urgency')]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 0, 24, 'L4: Single promo is NOT high pressure')
  assertLevel(result.riskLevel, 'Low', 'L4: risk level')
}

// L5: Multiple aggressive CTAs IS high pressure
{
  const text = `INVEST NOW — limited spots remaining! Wire by midnight Friday!
Book a meeting TODAY. Schedule a callback. Request your allocation.
Don't miss out! Only 3 spots left. Call 1-800-SCAM-NOW.
12% annual return. $25,000 minimum. Guaranteed income.`

  const llmRules = [
    R(19, 'Tier 2', 0.9, 'INVEST NOW, wire by Friday, limited spots, call now', 'high pressure'),
    R(6, 'Tier 2', 0.9, 'Guaranteed income', 'guarantee language'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 75, 100, 'L5: Multiple aggressive CTAs = Critical')
  assertLevel(result.riskLevel, 'Critical', 'L5: risk level')
}

// L6: Property address concealed — should trigger
{
  const text = `Invest in our luxury apartment complex in a major Southeast market.
The property, which we cannot disclose at this time, generates $500K monthly.
12% preferred return. $100,000 minimum. No risk factors identified.
We invest our own money alongside you.`

  const llmRules = [
    R(7, 'Tier 2', 0.9, 'cannot disclose property', 'address concealed'),
  ]
  const chunk = makeChunkEval(text, llmRules)
  const result = mergeEvaluations([chunk])
  assertRange(result.riskScore, 1, 100, 'L6: Concealed property address triggers rule 7')
}

// L7: The Franklin PPM multi-chunk full simulation
{
  const chunk1Text = `CONFIDENTIAL PRIVATE PLACEMENT MEMORANDUM. 707 Franklin LLC.
Up to $11,200,000 of Limited Unitholder Units. Class A: 10% preferred return.
Class B: 7% preferred return and 70% profit share after Sponsor Catch-Up (adjusted to 50% after 15% IRR).
Subscription Agreement Exhibit B. LLC Agreement Exhibit C. Securities Act of 1933.
Hereby. Pursuant to. Notwithstanding. In the sole and absolute discretion.
Representations and warranties of investor. Indemnification. Governing law.
Accredited investors only. Regulation D. Rule 506(b). Unitholders.`

  const chunk2Text = `Section V — Certain Risk Factors. An investment is highly speculative.
Risk of loss of Unitholder's entire investment. Illiquid. No assurance of distributions.
Past performance is not necessarily indicative of future results.
There can be no assurance the Company will achieve comparable results.
Returns are not guaranteed. No guarantee of income or distributions.
Section VII — Potential Conflicts of Interest.
Certain U.S. Federal Income Tax Considerations.`

  const chunk3Text = `Property: Liberty Pointe Apartments, 707 Franklin Gateway SE, Marietta, GA 30067.
Purchase price $37,250,000. 181-unit multifamily. Acquisition costs $2,027,354.
Capital Expenditures $5,078,865. Senior Loan approximately $33,500,000.
Cap rate and market analysis. First Communities Management Inc. property manager.
Construction manager fee up to 10%. Management fee 3% of gross receipts.`

  const chunk4Text = `Waterfall: Distributable proceeds distributed as follows:
First, 10% preferred return to Class A, then 7% to Class B, 8% to Class C, Pari Passu.
Second, Sponsor Catch-Up. Third, 70/30 split Class B/Sponsor until 15% IRR, then 50/50.
Fourth, 80/20 split Class C/Sponsor until 15% IRR, then 50/50.
Distributions in the Manager's sole and absolute discretion.`

  const chunks = [
    makeChunkEval(chunk1Text, [R(2, 'Tier 2', 0.7, '15% IRR', 'Buffett zone'), R(14, 'Tier 3', 0.7, 'no state licensing', 'licensing')]),
    makeChunkEval(chunk2Text, [R(16, 'Tier 3', 0.7, 'no failed deals', 'no failures')]),
    makeChunkEval(chunk3Text, []),
    makeChunkEval(chunk4Text, [R(2, 'Tier 2', 0.7, '15% IRR waterfall', 'Buffett zone')]),
  ]
  chunks.forEach((c, i) => c.chunk_id = i)

  const result = mergeEvaluations(chunks)
  assertRange(result.riskScore, 0, 15, 'L7: Franklin PPM full 4-chunk simulation')
  assertLevel(result.riskLevel, 'Low', 'L7: risk level')
  assert(result.isInvestmentRelated, 'L7: is investment related')
}

// ═══════════════════════════════════════════════════════════════
//  RESULTS
// ═══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60))
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`)
if (failures.length > 0) {
  console.log('\nFAILURES:')
  failures.forEach(f => console.log(`  ✗ ${f}`))
}
console.log('═'.repeat(60))

process.exit(failed > 0 ? 1 : 0)
