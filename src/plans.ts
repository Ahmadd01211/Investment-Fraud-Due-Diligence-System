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
