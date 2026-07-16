// Server-rendered Premium Services page (single-file HTML string).
// Contains two sections from the Barry Minkow Investment Fraud
// Due Diligence System — Premium Services:
//   1) Premium Services (mission, audiences, service tiers)
//   2) À La Carte Add-On: Title Report + Background Check bundle
import {
  PREMIUM_MISSION,
  PREMIUM_AUDIENCES,
  SERVICE_TIERS,
  ADDON_SERVICES,
  type ServiceTier,
  type PremiumAudience,
  type AddOnService,
} from './plans'

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
  return `
  <article class="addon glass tilt-sm" id="addon-${o.id}">
    <div class="ao-ico"><i class="fas ${o.icon}"></i></div>
    <h3 class="ao-title">${o.title}</h3>
    <div class="ao-price">${o.price} ${note}</div>
    <p class="ao-desc">${o.desc}</p>
    <button type="button" class="btn btn-primary ao-cta" data-open-premium="${o.id}"><i class="fas fa-file-invoice"></i> ${o.cta}</button>
  </article>`
}

export function PremiumPage(): string {
  const audiences = PREMIUM_AUDIENCES.map(audienceCard).join('')
  const tiers = SERVICE_TIERS.map(tierCard).join('')
  const addons = ADDON_SERVICES.map(addonCard).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="description" content="InvestSafe Pro Premium Services — institutional-grade due diligence for lenders, underwriters, family offices & serious investors. Service tiers and à la carte add-ons." />
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
    <a href="/#methodology">Methodology</a>
    <a href="/solution" class="active">Services</a>
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

  <!-- ═══════════ SECTION 2 · À LA CARTE ADD-ON ═══════════ -->
  <section id="a-la-carte" class="band addon-band">
    <div class="band-head">
      <span class="kicker">Start here — no tier required</span>
      <h2><i class="fas fa-wand-magic-sparkles"></i> À La Carte Add-On</h2>
      <p>Order this standalone service on its own — no tier or subscription required.</p>
    </div>
    <div class="addon-grid addon-grid-single">${addons}</div>
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
    <p class="footer-copy">© <span id="year"></span> InvestSafe Pro™ · <a href="/">Home</a> · <a href="/solution">Services</a></p>
  </div>
</footer>

<script src="/static/pricing.js"></script>
<script src="/static/premium.js"></script>
<script src="/static/auth.js"></script>
</body>
</html>`
}
