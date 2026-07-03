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

const orderMail = (subject: string) =>
  `mailto:premium@investsafepro.com?subject=${encodeURIComponent(subject)}`

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
    <a href="${orderMail(t.name)}" class="${btn}"><i class="fas fa-paper-plane"></i> ${t.cta}</a>
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
    <a href="${orderMail(o.title)}" class="btn btn-ghost ao-cta"><i class="fas fa-file-invoice"></i> ${o.cta}</a>
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
    <a href="${orderMail(v.title)}" class="${btn}"><i class="fas fa-paper-plane"></i> ${v.cta}</a>
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
</body>
</html>`
}
