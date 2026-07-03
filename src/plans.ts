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

