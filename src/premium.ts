// Server-rendered Premium Services page (single-file HTML string).
// Contains three sections, ported verbatim from the Barry Minkow
// Investment Fraud Due Diligence System — Premium Services:
//   1) Premium Services (mission, audiences, service tiers)
//   2) À La Carte Add-On Services
//   3) Asset Valuation & Debt Confirmation Tool
import {
  PREMIUM_MISSION,
  PREMIUM_AUDIENCES,
  SERVICE_TIERS,
  ADDON_SERVICES,
  VALUATION_INTRO,
  VALUATION_CARDS,
  VALUATION_STEPS,
  type ServiceTier,
  type PremiumAudience,
  type AddOnService,
  type ValuationCard,
} from './plans'

// Maps each add-on service id to the premium-modal "type" used by the
// original app (openPremiumModal('title') etc.). Kept identical so the
// intro copy + prefilled service name match the source system.
const ADDON_MODAL_TYPE: Record<string, string> = {
  'title-report': 'title',
  'background-check': 'bgcheck',
  'irrational-ratios': 'ratios',
  'entity-mapping': 'entity',
  'ad-archive': 'ads',
  'referral-package': 'referral',
}

function audienceCard(a: PremiumAudience): string {
  const bullets = a.bullets
    .map((b) => `<li><i class="fas fa-check"></i><span>${b}</span></li>`)
    .join('')
  return `
  <article class="aud-card glass tilt-sm">
    <div class="aud-ico"><i class="fas ${a.icon}"></i></div>
    <h3>${a.title}</h3>
    <p class="aud-desc">${a.desc}</p>
    <ul class="aud-list">${bullets}</ul>
  </article>`
}

function tierCard(t: ServiceTier): string {
  const feat = t.featured ? ' featured' : ''
  const badge = t.badge ? `<div class="pp-badge"><i class="fas fa-star"></i> ${t.badge}</div>` : ''
  const btn = t.featured ? 'btn btn-primary btn-block' : 'btn btn-ghost btn-block'
  const feats = t.features
    .map((f) => {
      const isHeader = f.trim().endsWith(':')
      return `<li${isHeader ? ' class="tier-sub"' : ''}><i class="fas ${
        isHeader ? 'fa-plus' : 'fa-circle-check'
      }"></i><span>${f}</span></li>`
    })
    .join('')
  return `
  <article class="tier glass tilt-sm${feat}" id="tier-${t.id}">
    ${badge}
    <div class="tier-head">
      <div>
        <h3 class="tier-name">${t.name}</h3>
        <p class="tier-sub-line">${t.subtitle}</p>
      </div>
      <div class="tier-price">${t.price}</div>
    </div>
    <ul class="tier-feats">${feats}</ul>
    <div class="tier-turn"><i class="fas fa-clock"></i> Turnaround: <strong>${t.turnaround}</strong></div>
    <button type="button" class="${btn}" data-open-premium="${t.id}"><i class="fas fa-paper-plane"></i> ${t.cta}</button>
  </article>`
}

function addonCard(o: AddOnService): string {
  const note = o.priceNote ? `<span class="ao-note">${o.priceNote}</span>` : ''
  // The Asset Valuation add-on opens the dedicated valuation modal (retail);
  // everything else opens the general premium-request modal, matching the
  // original app's openAssetValModal('retail') / openPremiumModal(type).
  const btn =
    o.id === 'asset-valuation'
      ? `<button type="button" class="btn btn-ghost ao-cta" data-open-aval="retail"><i class="fas fa-file-invoice"></i> ${o.cta}</button>`
      : `<button type="button" class="btn btn-ghost ao-cta" data-open-premium="${
          ADDON_MODAL_TYPE[o.id] || o.id
        }"><i class="fas fa-file-invoice"></i> ${o.cta}</button>`
  return `
  <article class="addon glass tilt-sm" id="addon-${o.id}">
    <div class="ao-ico"><i class="fas ${o.icon}"></i></div>
    <h3 class="ao-title">${o.title}</h3>
    <div class="ao-price">${o.price} ${note}</div>
    <p class="ao-desc">${o.desc}</p>
    ${btn}
  </article>`
}

function valuationCard(v: ValuationCard): string {
  const feat = v.featured ? ' featured' : ''
  const tags = v.tags
    .map(
      (t) =>
        `<span class="vtag ${t.kind}">${
          t.kind === 'star' ? '<i class="fas fa-star"></i> ' : ''
        }${t.label}</span>`
    )
    .join('')
  const bullets = v.bullets
    .map(
      (b) =>
        `<li><i class="fas fa-circle-check"></i><span><strong>${b.lead}</strong> — ${b.rest}</span></li>`
    )
    .join('')
  const btn = v.featured ? 'btn btn-primary btn-block' : 'btn btn-ghost btn-block'
  return `
  <article class="val-card glass${feat}" id="val-${v.id}">
    <div class="vtags">${tags}</div>
    <h3 class="val-title">${v.title}</h3>
    <p class="val-sub">${v.subtitle}</p>
    <div class="val-price"><span class="val-amt">${v.price}</span> <span class="val-per">${v.priceNote || ''}</span></div>
    <div class="val-lh">${v.listHeading}</div>
    <ul class="val-feats">${bullets}</ul>
    <div class="val-note"><i class="fas fa-flag"></i> ${v.note}</div>
    <button type="button" class="${btn}" data-open-aval="${
      v.id === 'full-portfolio' ? 'institutional' : 'retail'
    }"><i class="fas fa-paper-plane"></i> ${v.cta}</button>
    <div class="val-turn"><i class="fas fa-clock"></i> Turnaround: <strong>${v.turnaround}</strong></div>
  </article>`
}

export function PremiumPage(): string {
  const audiences = PREMIUM_AUDIENCES.map(audienceCard).join('')
  const tiers = SERVICE_TIERS.map(tierCard).join('')
  const addons = ADDON_SERVICES.map(addonCard).join('')
  const valuationCards = VALUATION_CARDS.map(valuationCard).join('')
  const steps = VALUATION_STEPS.map(
    (s) => `
    <div class="vstep">
      <div class="vstep-num">${s.n}</div>
      <div class="vstep-body"><h4>${s.title}</h4><p>${s.desc}</p></div>
    </div>`
  ).join('<div class="vstep-arrow"><i class="fas fa-angle-right"></i></div>')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="description" content="InvestSafe Pro Premium Services — institutional-grade due diligence for lenders, underwriters, family offices & serious investors. Service tiers, à la carte add-ons, and the Asset Valuation & Debt Confirmation tool." />
<title>Premium Services — InvestSafe Pro™</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%9B%A1%EF%B8%8F%3C/text%3E%3C/svg%3E" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.1/css/all.min.css" />
<link rel="stylesheet" href="/static/style.css" />
</head>
<body>

<div class="bg-scene" aria-hidden="true">
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="orb orb-3"></div>
  <div class="grid-overlay"></div>
</div>

<header class="nav" id="nav">
  <a class="brand" href="/">
    <span class="brand-badge"><i class="fas fa-shield-halved"></i></span>
    <span class="brand-text">
      <span class="brand-main">InvestSafe<span class="brand-tm">Pro™</span></span>
      <span class="brand-sub">Fraud Due-Diligence</span>
    </span>
  </a>
  <nav class="nav-links">
    <a href="/#how">How it works</a>
    <a href="/pricing">Pricing</a>
    <a href="/premium" class="active">Premium</a>
    <a class="nav-cta" href="/#analyze"><i class="fas fa-magnifying-glass-chart"></i> Check a pitch</a>
  </nav>
</header>

<main id="top">

  <!-- ═══════════ SECTION 1 · PREMIUM SERVICES ═══════════ -->
  <section class="premium-hero">
    <div class="ph-head">
      <div class="ph-title"><i class="fas fa-gem"></i> Premium Services</div>
      <p class="ph-tag">"Equipping Investors, Level the Playing Field Proactively" — Deeper intelligence for high-stakes decisions</p>
    </div>

    <div class="mission glass">
      <div class="mission-ico"><i class="fas fa-scale-balanced"></i></div>
      <div>
        <h2>${PREMIUM_MISSION.title}</h2>
        <p>${PREMIUM_MISSION.body}</p>
      </div>
    </div>

    <div class="aud-grid">${audiences}</div>
  </section>

  <!-- Service Tiers -->
  <section class="band tiers-band">
    <div class="tiers-head">
      <h2><i class="fas fa-layer-group"></i> Service Tiers</h2>
      <span class="tiers-note">Scaled to the complexity and capital at stake</span>
    </div>
    <div class="tiers-grid">${tiers}</div>
  </section>

  <!-- ═══════════ SECTION 2 · À LA CARTE ═══════════ -->
  <section id="a-la-carte" class="band addon-band">
    <div class="band-head">
      <span class="kicker">Pay only for what you need</span>
      <h2><i class="fas fa-wand-magic-sparkles"></i> À La Carte Add-On Services</h2>
      <p>Order any single service on its own — no tier or subscription required.</p>
    </div>
    <div class="addon-grid">${addons}</div>
  </section>

  <!-- ═══════════ SECTION 3 · ASSET VALUATION TOOL ═══════════ -->
  <section id="valuation" class="band valuation-band">
    <div class="val-intro glass">
      <div class="val-intro-head">
        <h2><i class="fas fa-building-circle-check"></i> ${VALUATION_INTRO.title} <span class="val-new">${VALUATION_INTRO.badge}</span></h2>
        <div class="val-tags-top">
          <span class="vtag retail">Retail</span>
          <span class="vtag institutional">Institutional</span>
        </div>
      </div>
      <p class="val-subline">${VALUATION_INTRO.subline}</p>
      <div class="val-why"><i class="fas fa-triangle-exclamation"></i> <span><strong>Why this matters:</strong> ${VALUATION_INTRO.why}</span></div>
    </div>

    <div class="val-grid">${valuationCards}</div>

    <div class="vprocess glass">
      <h3><i class="fas fa-diagram-project"></i> How the Valuation Process Works</h3>
      <div class="vsteps">${steps}</div>
    </div>
  </section>

  <p class="pricing-note"><i class="fas fa-circle-info"></i> Premium services are performed by our research team. Price ranges reflect document size, property count & complexity — you'll receive a fixed quote before any work begins.</p>

</main>

<!-- ═══════════ PREMIUM SERVICE REQUEST MODAL ═══════════ -->
<div class="modal-overlay" id="modal-premium" aria-hidden="true">
  <div class="modal modal-lg glass" role="dialog" aria-modal="true" aria-labelledby="premium-modal-title">
    <div class="modal-header premium-modal-header">
      <h3><i class="fas fa-gem"></i> <span id="premium-modal-title">Request Premium Service</span></h3>
      <button type="button" class="modal-close" data-close-modal="modal-premium" aria-label="Close">&times;</button>
    </div>
    <form class="modal-body" id="premium-form" novalidate>
      <div class="premium-request-intro" id="premium-request-intro"></div>
      <input type="hidden" id="premium-service-type" name="serviceType" value="" />

      <div class="form-group">
        <label>Your Name / Organization <span class="req">*</span></label>
        <input type="text" id="premium-name" name="name" class="form-control" required placeholder="e.g. First National Bank — Commercial Lending Dept." />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Contact Email <span class="req">*</span></label>
          <input type="email" id="premium-email" name="email" class="form-control" required placeholder="your@email.com" />
        </div>
        <div class="form-group">
          <label>Phone (optional)</label>
          <input type="tel" id="premium-phone" name="phone" class="form-control" placeholder="+1 (555) 000-0000" />
        </div>
      </div>
      <div class="form-group">
        <label>Client Type <span class="req">*</span></label>
        <select id="premium-client-type" name="clientType" class="form-control" required>
          <option value="">— Select —</option>
          <option>Lender / Bank</option>
          <option>Underwriter / Analyst</option>
          <option>Family Office</option>
          <option>Individual Investor</option>
          <option>Legal Counsel</option>
          <option>Regulatory Agency</option>
          <option>Other</option>
        </select>
      </div>
      <div class="form-group">
        <label>Subject of Investigation — Sponsor / Entity Name <span class="req">*</span></label>
        <input type="text" id="premium-target" name="target" class="form-control" required placeholder="e.g. XYZ Capital Partners, LLC — John Smith (Promoter)" />
      </div>
      <div class="form-group">
        <label>Estimated Capital at Risk / Deal Size</label>
        <select id="premium-deal-size" name="dealSize" class="form-control">
          <option value="">— Select Range —</option>
          <option>Under $100,000</option>
          <option>$100,000 – $500,000</option>
          <option>$500,000 – $1,000,000</option>
          <option>$1,000,000 – $5,000,000</option>
          <option>$5,000,000 – $25,000,000</option>
          <option>Over $25,000,000</option>
        </select>
      </div>
      <div class="form-group">
        <label>Known Property Addresses / Locations (for title reports)</label>
        <textarea id="premium-addresses" name="addresses" class="form-control" rows="2" placeholder="List any known property addresses — or 'none disclosed' if sponsor is hiding them"></textarea>
      </div>
      <div class="form-group">
        <label>What specific concerns prompted this request?</label>
        <textarea id="premium-concerns" name="concerns" class="form-control" rows="4" placeholder="Describe the red flags you've observed, what the sponsor claims, and what you need verified. More detail = faster and more accurate investigation."></textarea>
      </div>
      <div class="form-group">
        <label>Urgency / Required Turnaround</label>
        <select id="premium-urgency" name="urgency" class="form-control">
          <option>Standard (as quoted)</option>
          <option>Rush — 24–48 hours (premium pricing applies)</option>
          <option>Flexible — quality over speed</option>
        </select>
      </div>
      <div class="premium-request-note">
        <i class="fas fa-lock"></i> <strong>Confidential:</strong> All engagement details are held in strict confidence. Service is provided on a flat-fee or retainer basis. A member of our team will respond within one business day to confirm scope, pricing, and engagement letter.
      </div>
    </form>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" data-close-modal="modal-premium">Cancel</button>
      <button type="submit" form="premium-form" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Submit Request</button>
    </div>
  </div>
</div>

<!-- ═══════════ ASSET VALUATION REQUEST MODAL ═══════════ -->
<div class="modal-overlay" id="modal-assetval" aria-hidden="true">
  <div class="modal modal-lg glass" role="dialog" aria-modal="true" aria-labelledby="aval-modal-title">
    <div class="modal-header">
      <h3 id="aval-modal-title"><i class="fas fa-building-circle-check"></i> Asset Valuation &amp; Debt Confirmation Request</h3>
      <button type="button" class="modal-close" data-close-modal="modal-assetval" aria-label="Close">&times;</button>
    </div>
    <form class="modal-body" id="aval-form" novalidate>
      <input type="hidden" id="aval-tier" name="tier" value="retail" />

      <!-- Tier selector -->
      <div class="aval-tier-select">
        <button type="button" class="aval-tier-opt active" id="aval-opt-retail" data-aval-tier="retail">
          <i class="fas fa-user" style="color:var(--green)"></i>
          <span>
            <strong>Retail — Single Asset</strong>
            <small>One property · $75–$150 · 24–48 hrs</small>
          </span>
        </button>
        <button type="button" class="aval-tier-opt" id="aval-opt-institutional" data-aval-tier="institutional">
          <i class="fas fa-building-columns" style="color:var(--purple)"></i>
          <span>
            <strong>Institutional — Full Portfolio</strong>
            <small>Entire sponsor portfolio · Custom pricing · 5–10 days</small>
          </span>
        </button>
      </div>

      <!-- Why box -->
      <div class="aval-why">
        <i class="fas fa-triangle-exclamation"></i>
        <span><strong>Red Flag #21 — Asset Overpayment.</strong> Based on our experience, syndicators may overpay for assets, carry undisclosed debt, or not own assets at all. This tool independently confirms book value, recorded debt, and last sale price — including in non-disclosure states.</span>
      </div>

      <!-- Requestor info -->
      <div class="form-row">
        <div class="form-group">
          <label>Your Name <span class="req">*</span></label>
          <input type="text" id="aval-client-name" name="name" class="form-control" required placeholder="Full name" />
        </div>
        <div class="form-group">
          <label>Email <span class="req">*</span></label>
          <input type="email" id="aval-client-email" name="email" class="form-control" required placeholder="your@email.com" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>You Are</label>
          <select id="aval-client-type" name="clientType" class="form-control">
            <option>Individual Investor</option>
            <option>Family Office</option>
            <option>Lender / Bank</option>
            <option>Underwriter / Analyst</option>
            <option>Attorney</option>
            <option>Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>Sponsor / Syndicator Name <span class="req">*</span></label>
          <input type="text" id="aval-sponsor-name" name="sponsor" class="form-control" required placeholder="e.g. Sterling Capital Group LLC" />
        </div>
      </div>

      <!-- Retail (single asset) fields -->
      <div id="aval-retail-fields">
        <div class="form-group">
          <label>Property Address <span class="req">*</span></label>
          <input type="text" id="aval-property-address" name="propertyAddress" class="form-control" placeholder="Full street address, city, state, ZIP — from title report or sponsor disclosure" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Asset Class</label>
            <select id="aval-asset-class" name="assetClass" class="form-control">
              <option>Multifamily</option><option>Commercial RE</option><option>Self-Storage</option>
              <option>Mobile Home Park</option><option>Industrial</option><option>Retail</option>
              <option>Office</option><option>Mixed-Use</option><option>Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>Claimed Purchase Price ($)</label>
            <input type="number" id="aval-claimed-price" name="claimedPrice" class="form-control" placeholder="e.g. 42000000" />
          </div>
        </div>
      </div>

      <!-- Institutional (portfolio) fields -->
      <div id="aval-institutional-fields" style="display:none;">
        <div class="form-group">
          <label>Sponsor Claimed AUM / Portfolio Value</label>
          <input type="text" id="aval-claimed-aum" name="claimedAum" class="form-control" placeholder="e.g. $280M (as stated in marketing materials)" />
        </div>
        <div class="form-group">
          <label>Known Property Addresses (one per line or from title reports)</label>
          <textarea id="aval-known-properties" name="knownProperties" class="form-control" rows="4" placeholder="123 Main St, Dallas TX 75201&#10;4500 Oak Ave, Phoenix AZ 85001&#10;Add as many as you have — we will research additional addresses from EDGAR Form D filings"></textarea>
        </div>
        <div class="aval-deepdive">
          <i class="fas fa-info-circle"></i>
          <span><strong>Institutional Deep Dive:</strong> Our team will also pull all SEC Form D filings for the sponsor and known affiliates to identify additional properties and cross-reference with the ownership audit. Assets in your fund and outside your fund can both be included upon request.</span>
        </div>
      </div>

      <!-- Vendor link -->
      <div class="form-group">
        <label>Vendor / Data Source URL (if you have one — optional)</label>
        <input type="url" id="aval-vendor-link" name="vendorLink" class="form-control" placeholder="e.g. CoStar listing, LoopNet, county assessor URL, CREXI listing" />
      </div>

      <!-- Notes -->
      <div class="form-group">
        <label>Additional Context or Concerns</label>
        <textarea id="aval-notes" name="notes" class="form-control" rows="3" placeholder="e.g. Sponsor claims $40M acquisition price but won't disclose the address. Pitch deck shows 'luxury' multifamily — no comps provided. Title report shows $38.5M deed of trust on a property with claimed $280M AUM..."></textarea>
      </div>

      <div class="premium-request-note">
        <i class="fas fa-lock"></i> <strong>Confidential:</strong> Independent verification via county records, EDGAR Form D filings & recorded deeds. You'll receive a fixed quote before any work begins.
      </div>
    </form>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" data-close-modal="modal-assetval">Cancel</button>
      <button type="submit" form="aval-form" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Submit Valuation Request</button>
    </div>
  </div>
</div>

<div class="toast" id="toast" role="status" aria-live="polite"></div>

<footer class="footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <span class="brand-badge sm"><i class="fas fa-shield-halved"></i></span>
      <div>
        <strong>InvestSafe Pro™</strong>
        <span>Equipping investors. Leveling the playing field.</span>
      </div>
    </div>
    <p class="footer-disclaimer">
      InvestSafe Pro is an educational due-diligence aid, not legal, investment, or financial advice. Premium
      service pricing is illustrative and confirmed by written quote before work begins. Always verify with primary
      sources (SEC EDGAR, FINRA BrokerCheck, county records) and consult a licensed professional before investing.
    </p>
    <p class="footer-copy">© <span id="year"></span> InvestSafe Pro™ · <a href="/">Home</a> · <a href="/pricing">Pricing</a> · <a href="/premium">Premium</a></p>
  </div>
</footer>

<script src="/static/pricing.js"></script>
<script src="/static/premium.js"></script>
</body>
</html>`
}
