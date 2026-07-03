// ─────────────────────────────────────────────────────────────
// InvestSafe Pro™ — Membership plans (single source of truth)
// Served to the frontend via GET /api/plans, and rendered
// server-side into the /pricing page. Edit prices/features HERE.
// ─────────────────────────────────────────────────────────────

export interface Plan {
  id: string
  name: string
  tagline: string
  /** Price in whole currency units (USD). null = custom / contact sales. */
  monthly: number | null
  yearly: number | null
  currency: string
  /** Highlighted "most popular" card. */
  featured?: boolean
  badge?: string
  icon: string // FontAwesome class
  /** Short line under the price, e.g. "checks / month". */
  quota: string
  cta: string
  features: string[]
}

// One-time, pay-as-you-go services (NOT a recurring membership). These are
// standalone products a customer can buy once — e.g. a hands-on title/records
// research report or an expert deep-dive on a single deal.
export interface OneTimeOffering {
  id: string
  name: string
  tagline: string
  /** One-time price in whole currency units (USD). null = quoted per job. */
  price: number | null
  priceFrom?: boolean // show "from $X" when the final price varies
  currency: string
  icon: string // FontAwesome class
  turnaround: string // e.g. "2–3 business days"
  badge?: string
  featured?: boolean
  cta: string
  includes: string[]
}

// ── Premium Services page: audience segments ──
export interface PremiumAudience {
  id: string
  icon: string
  title: string
  desc: string
  bullets: string[]
}

// ── Premium Services page: service tiers ──
export interface ServiceTier {
  id: string
  name: string
  subtitle: string
  price: string
  badge?: string
  featured?: boolean
  features: string[]
  turnaround: string
  cta: string
}

// ── À La Carte add-on services ──
export interface AddOnService {
  id: string
  icon: string
  title: string
  price: string
  priceNote?: string
  desc: string
  cta: string
}

// ── Asset Valuation tool cards ──
export interface ValuationCard {
  id: string
  tags: { label: string; kind: 'retail' | 'institutional' | 'star' }[]
  title: string
  subtitle: string
  price: string
  priceNote?: string
  listHeading: string
  bullets: { lead: string; rest: string }[]
  note: string
  cta: string
  turnaround: string
  featured?: boolean
}

export const CURRENCY = 'USD'

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'For a quick, one-off gut check.',
    monthly: 0,
    yearly: 0,
    currency: CURRENCY,
    icon: 'fa-shield-halved',
    quota: '5 fraud checks / month',
    cta: 'Start free',
    features: [
      '5 fraud checks per month',
      'Full 21-flag red-flag report',
      'Paste text or a short screenshot',
      'Plain-English risk score & verdict',
      'No account or API key needed',
    ],
  },
  {
    id: 'investor',
    name: 'Investor',
    tagline: 'For active investors doing regular due diligence.',
    monthly: 19,
    yearly: 182, // ~2 months free
    currency: CURRENCY,
    featured: true,
    badge: 'Most popular',
    icon: 'fa-user-shield',
    quota: '100 fraud checks / month',
    cta: 'Get Investor',
    features: [
      '100 fraud checks per month',
      'Full PDF, Word & multi-page document analysis',
      'Image / screenshot analysis (sharper vision model)',
      'Downloadable PDF risk reports',
      'Saved report history',
      'Priority analysis queue',
      'Email support',
    ],
  },
  {
    id: 'pro',
    name: 'Professional',
    tagline: 'For advisors, RIAs, and family offices.',
    monthly: 79,
    yearly: 758, // ~2 months free
    currency: CURRENCY,
    icon: 'fa-briefcase',
    quota: '1,000 fraud checks / month',
    cta: 'Get Professional',
    features: [
      '1,000 fraud checks per month',
      'Everything in Investor, plus:',
      'Bulk / batch document analysis',
      'Client-ready branded reports',
      'Deep-analysis mode for large PPMs',
      'Up to 5 team seats',
      'Priority email & chat support',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For firms, compliance teams & platforms.',
    monthly: null,
    yearly: null,
    currency: CURRENCY,
    icon: 'fa-building-shield',
    quota: 'Unlimited checks',
    cta: 'Contact sales',
    features: [
      'Unlimited fraud checks',
      'API access & integrations',
      'Custom 21-flag framework tuning',
      'SSO / SAML & audit logs',
      'Unlimited team seats',
      'Dedicated account manager',
      'SLA & on-prem / private options',
    ],
  },
]

// ─────────────────────────────────────────────────────────────
// One-time offerings (buy once — no subscription required)
// ─────────────────────────────────────────────────────────────
export const ONE_TIME_OFFERINGS: OneTimeOffering[] = [
  {
    id: 'title-research',
    name: 'Title & Property Research Report',
    tagline: 'Verify the real estate behind the pitch — ownership, liens & value.',
    price: 149,
    priceFrom: true,
    currency: CURRENCY,
    icon: 'fa-house-circle-check',
    turnaround: '2–3 business days',
    badge: 'Most requested',
    featured: true,
    cta: 'Order title research',
    includes: [
      'County title & deed / ownership verification',
      'Recorded liens, mortgages & encumbrances check',
      'Actual purchase price vs. claimed value',
      'Loan-to-value (LTV) reality check',
      'Cross-check against the sponsor\u2019s claims',
      'Plain-English written summary + source documents',
    ],
  },
  {
    id: 'sponsor-background',
    name: 'Sponsor & Promoter Background Check',
    tagline: 'Who\u2019s really running the deal — regulatory & litigation history.',
    price: 129,
    currency: CURRENCY,
    icon: 'fa-user-magnifying-glass',
    turnaround: '2–4 business days',
    cta: 'Order background check',
    includes: [
      'SEC EDGAR & enforcement-action search',
      'FINRA BrokerCheck & IAPD lookup',
      'Litigation, judgments & bankruptcy scan',
      'Prior failed-deal / entity history',
      'State registration & licensing verification',
      'Consolidated risk summary report',
    ],
  },
  {
    id: 'deep-dive',
    name: 'Expert Deep-Dive Review',
    tagline: 'A human analyst reviews one full offering, end to end.',
    price: 299,
    priceFrom: true,
    currency: CURRENCY,
    icon: 'fa-user-tie',
    turnaround: '3–5 business days',
    cta: 'Book a deep-dive',
    includes: [
      'Full PPM / offering-document read by an analyst',
      'AI 21-flag report + human interpretation',
      'Line-by-line risk & terms breakdown',
      'Specific questions to ask the promoter',
      '30-minute review call to walk through findings',
      'Written recommendation & red-flag memo',
    ],
  },
]

// ═══════════════════════════════════════════════════════════════
// PREMIUM SERVICES PAGE DATA
// (Ported from the Barry Minkow Investment Fraud Due Diligence
//  System — Premium Services. Same wording & pricing.)
// ═══════════════════════════════════════════════════════════════

export const PREMIUM_MISSION = {
  title: 'Our Mission: Level the Playing Field',
  body:
    'Individual investors have historically been at a catastrophic information disadvantage against sophisticated fraudsters who exploit complexity, secrecy, and regulatory gaps. InvestSafe Pro\u2122 Premium Services bring institutional-grade due diligence tools directly to lenders, underwriters, family offices, and serious individual investors \u2014 the same analytical depth used in regulatory referrals that recovered $650M+ in documented fraud.',
}

export const PREMIUM_AUDIENCES: PremiumAudience[] = [
  {
    id: 'lenders',
    icon: 'fa-building-columns',
    title: 'Lenders & Banks',
    desc:
      'Verify sponsor representations before extending credit lines, bridge loans, or construction financing to syndicators or fund operators. Identify undisclosed debt, nominee structures, and prior defaults before funding.',
    bullets: [
      'Pre-funding sponsor background analysis',
      'Full title chain on collateral properties',
      'Undisclosed lien / UCC filing scan',
      'FINRA bar & federal litigation check',
    ],
  },
  {
    id: 'underwriters',
    icon: 'fa-magnifying-glass-chart',
    title: 'Underwriters & Institutional Analysts',
    desc:
      'Perform independent verification of sponsor track records, claimed asset values, and debt disclosure accuracy before underwriting a deal, issuing a fairness opinion, or allocating to a fund.',
    bullets: [
      'Irrational Ratios financial forensics',
      'AUM vs. actual debt reconciliation',
      'Co-GP double-count audit',
      'Full claim contradiction matrix report',
    ],
  },
  {
    id: 'family-offices',
    icon: 'fa-briefcase',
    title: 'Family Offices & HNW Investors',
    desc:
      'Protect multi-generational capital. Before committing seven or eight figures to a private placement, fund, or syndication, get an independent second opinion from analysts who have identified $650M+ in documented fraud.',
    bullets: [
      'Full 20-flag red flag score report',
      'Sponsor deep-background investigation',
      'Property address verification & title',
      'SEC EDGAR / PACER / state records pull',
    ],
  },
]

export const SERVICE_TIERS: ServiceTier[] = [
  {
    id: 'tier1',
    name: 'Tier 1 \u2014 Rapid Screen',
    subtitle: 'Ideal for initial sponsor vetting',
    price: '$250\u2013$500',
    features: [
      '16-Flag Red Flag Scoring Report \u2014 Complete proprietary checklist with evidence notes',
      'FINRA BrokerCheck + SEC EDGAR Search \u2014 All named principals and entities',
      'Basic Internet Litigation Scan \u2014 Google, CourtListener, SEC enforcement',
      'Written Summary Report \u2014 2\u20134 pages with risk score and key findings',
    ],
    turnaround: '24\u201348 hours',
    cta: 'Request Tier 1 Screen',
  },
  {
    id: 'tier2',
    name: 'Tier 2 \u2014 Deep Dive',
    subtitle: 'For lenders, underwriters & $500K+ commitments',
    price: '$1,500\u2013$3,500',
    badge: 'Most Requested',
    featured: true,
    features: [
      'Everything in Tier 1, plus:',
      'Full Title Chain \u2014 Automated title report on each disclosed property (undisclosed liens, deed history)',
      'Irrational Ratios Financial Forensics \u2014 Debt service vs. NOI mathematical analysis with documented proof',
      'PACER Federal Court Search \u2014 Lawsuits, judgments, bankruptcy filings for all principals',
      'Full Contradiction Matrix \u2014 Every sponsor claim mapped to conflicting public record',
      'Formal Report \u2014 10\u201320 pages, exhibit-referenced, formatted for legal/regulatory use',
    ],
    turnaround: '5\u20137 business days',
    cta: 'Request Tier 2 Deep Dive',
  },
  {
    id: 'tier3',
    name: 'Tier 3 \u2014 Institutional Package',
    subtitle: 'Family offices, $1M+ allocations, regulatory referrals',
    price: 'Custom',
    features: [
      'Everything in Tiers 1 & 2, plus:',
      '\u201CPose as Investor\u201D Investigative Engagement \u2014 Active solicitation of pitch materials as prospective investor',
      'Full Entity Corporate Structure Map \u2014 All related LLCs, trusts, nominee principals traced',
      'Co-GP Double-Count Audit \u2014 Cross-reference all co-sponsor claims for same asset',
      'Tax Lien & UCC Filing Sweep \u2014 All states where entity operates',
      'Regulatory Referral-Ready Package \u2014 SEC, DHS, FBI, FDIC, FINRA formatted exhibits with chain-of-custody',
      'Expert Consultation \u2014 Call with senior analyst to review findings',
    ],
    turnaround: '10\u201315 business days',
    cta: 'Request Institutional Package',
  },
]

export const ADDON_SERVICES: AddOnService[] = [
  {
    id: 'title-report',
    icon: 'fa-file-lines',
    title: 'Single Property Title Report',
    price: '$15\u2013$50',
    desc:
      'Full title chain, lien search, deed history. Identify undisclosed mortgages that sponsor is hiding from investors.',
    cta: 'Order Title',
  },
  {
    id: 'background-check',
    icon: 'fa-user-magnifying-glass',
    title: 'Principal Background Check',
    price: '$35\u2013$150',
    desc:
      'FINRA BrokerCheck, PACER federal search, state court search, sex offender registry, criminal history for one named individual.',
    cta: 'Order Check',
  },
  {
    id: 'asset-valuation',
    icon: 'fa-building-circle-check',
    title: 'Asset Valuation & Debt Confirmation',
    price: '$75\u2013$150',
    priceNote: 'Retail / Custom Institutional',
    desc:
      'Independent book value, subcategory cap rate, confirmed recorded debt, last sale price (incl. non-disclosure states), and ownership verification for any claimed asset.',
    cta: 'Order Valuation',
  },
  {
    id: 'irrational-ratios',
    icon: 'fa-calculator',
    title: 'Irrational Ratios Analysis',
    price: '$200\u2013$400',
    desc:
      'Full debt-service-vs-NOI mathematical analysis with documented source data. The single most powerful quantitative fraud indicator.',
    cta: 'Order Analysis',
  },
  {
    id: 'entity-mapping',
    icon: 'fa-sitemap',
    title: 'Entity Structure Mapping',
    price: '$300\u2013$600',
    desc:
      'Full org chart of all related entities, LLC members, registered agents, state filings, and nominee principal identification.',
    cta: 'Order Mapping',
  },
  {
    id: 'ad-archive',
    icon: 'fa-rectangle-ad',
    title: 'Ad & Marketing Archive Capture',
    price: '$75\u2013$200',
    desc:
      'Systematic capture and archiving of all known Facebook, Instagram, YouTube, TV, and radio advertising with metadata, timestamps, and targeting data via Meta Ad Library.',
    cta: 'Order Capture',
  },
  {
    id: 'referral-package',
    icon: 'fa-gavel',
    title: 'Regulatory Referral Package',
    price: '$500\u2013$1,000',
    desc:
      'Existing findings formatted into agency-specific referral packages for SEC, DHS/HSI, FBI, FDIC, or FINRA with proper exhibit labeling and chain-of-custody documentation.',
    cta: 'Order Package',
  },
]

export const VALUATION_INTRO = {
  title: 'Asset Valuation & Debt Confirmation Tool',
  badge: 'NEW TOOL',
  subline: 'Book Value \u00B7 Subcategory Cap Rate \u00B7 Recorded Debt \u00B7 Last Sale Price \u00B7 Ownership Verification',
  why:
    'Based on our past experience, syndicators may overpay for assets, carry undisclosed debt on assets, or not own the assets at all. The more investor representations that can be tested or corroborated, the better. This tool provides an independent book value for any property, cross-references the current subcategory cap rate, confirms recorded debt from a secondary source, and retrieves the last recorded sale price \u2014 even in non-disclosure states where deed prices are not publicly available.',
}

export const VALUATION_CARDS: ValuationCard[] = [
  {
    id: 'single-asset',
    tags: [{ label: 'Retail', kind: 'retail' }],
    title: 'Single Asset Valuation',
    subtitle: 'For individual investors evaluating one specific property',
    price: '$75 \u2013 $150',
    priceNote: 'per property',
    listHeading: 'WHAT YOU RECEIVE:',
    bullets: [
      { lead: 'Book Value & Market-Supported Value', rest: 'Independent third-party assessment using current subcategory cap rate (e.g., Class B Multifamily, DFW market \u2192 5.2% cap). Calculates: Market Value = NOI \u00F7 Cap Rate' },
      { lead: 'Recorded Debt Confirmation', rest: 'Secondary source verification of all recorded mortgages, deeds of trust, and UCC liens on the specific property \u2014 independent of the title report' },
      { lead: 'Last Recorded Sale Price & Date', rest: 'Even in non-disclosure states where sale prices are not required to be recorded publicly, vendor databases track arms-length transactions and assessor records' },
      { lead: 'Overpayment Gap Analysis', rest: 'Calculated difference between claimed purchase price and market-supported value. Positive gap = investor capital destroyed at acquisition' },
      { lead: 'Ownership Verification', rest: 'Confirms whether the sponsor entity appears as deed holder in county records' },
    ],
    note: 'Findings feed directly into Red Flag #21 \u2014 Asset Overpayment / Book Value Mismatch in the investigation scorer',
    cta: 'Order Single Asset Valuation',
    turnaround: '24\u201348 hours',
  },
  {
    id: 'full-portfolio',
    tags: [
      { label: 'Institutional', kind: 'institutional' },
      { label: 'For Family Offices & HNW Investors', kind: 'star' },
    ],
    title: 'Full Portfolio Valuation & Ownership Audit',
    subtitle: 'Test the entire company \u2014 not just one deal. Verify every claimed asset.',
    price: 'Custom Pricing',
    priceNote: 'based on portfolio size',
    listHeading: 'EVERYTHING IN RETAIL, PLUS:',
    featured: true,
    bullets: [
      { lead: 'Portfolio-Wide Book Value Reconciliation', rest: 'Independent valuation of every claimed asset in the sponsor\u2019s portfolio, using property-specific cap rates for each market and asset class' },
      { lead: 'True Net Equity Calculation', rest: 'Cumulative book value of all assets minus all confirmed recorded debt = actual investor equity. Compared against claimed AUM in marketing materials' },
      { lead: 'Ownership Audit Across All Entities', rest: 'Deed ownership verification for every disclosed (and discernible) property \u2014 including cross-referencing nominee LLCs and affiliated entities' },
      { lead: 'Assets Outside the Fund', rest: 'For investors who want to test assets beyond their specific fund allocation: verify the sponsor\u2019s other holdings that secure the broader company narrative' },
      { lead: 'Non-Disclosure State Coverage', rest: 'Vendor database access covers all 50 states including non-disclosure states (Texas, Indiana, Missouri, etc.) where public records alone are insufficient' },
      { lead: 'Formal Valuation Report', rest: 'Exhibit-referenced summary document formatted for regulatory referral, legal review, or lender underwriting' },
    ],
    note: 'Results integrate with Contradiction Matrix, Irrational Ratios, and Red Flag #21 for a complete forensic picture',
    cta: 'Request Portfolio Valuation',
    turnaround: '5\u201310 business days',
  },
]

export const VALUATION_STEPS = [
  { n: 1, title: 'You Provide the Address & Claimed Price', desc: 'Submit the property address (from title report or sponsor disclosure), the claimed purchase price, and the asset class via the request form below.' },
  { n: 2, title: 'Vendor Pulls Book Value & Debt', desc: 'Our vendor queries commercial property databases to retrieve: assessed value, last recorded sale, all recorded liens, and the current market cap rate for that asset subcategory and geography.' },
  { n: 3, title: 'We Calculate the Overpayment Gap', desc: 'Overpayment Gap = Claimed Purchase Price \u2212 Market-Supported Value. Any positive gap represents investor capital that was destroyed at the moment of acquisition.' },
  { n: 4, title: 'Findings Added to Investigation', desc: 'Results are entered into your investigation as a Record, a Contradiction (if gap is material), and a scored Red Flag #21 \u2014 building the evidentiary chain for a regulatory referral.' },
]
