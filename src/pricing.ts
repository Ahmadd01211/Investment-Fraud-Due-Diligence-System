// Server-rendered Memberships / Pricing page (single-file HTML string).
// Plan data comes from ./plans (the same data served at /api/plans), so the
// page always matches the backend source of truth.
import { PLANS, type Plan } from './plans'

function money(v: number | null): string {
  if (v === null) return 'Custom'
  if (v === 0) return '$0'
  return '$' + v.toLocaleString('en-US')
}

function priceBlock(p: Plan): string {
  if (p.monthly === null) {
    return `<div class="pp-price"><span class="pp-amount">Let's talk</span></div>
            <div class="pp-quota">${p.quota}</div>`
  }
  const mo = money(p.monthly)
  const yr = p.yearly
  const per = p.monthly === 0 ? '' : `<span class="pp-per">/mo</span>`
  const yearly =
    yr && yr > 0
      ? `<div class="pp-yearly" data-yearly="${yr}" data-monthly="${p.monthly}">
           or <strong>${money(yr)}</strong>/yr <span class="pp-save">save ${Math.round(
          (1 - yr / (p.monthly * 12)) * 100
        )}%</span>
         </div>`
      : `<div class="pp-yearly muted-line">Free forever</div>`
  return `<div class="pp-price"><span class="pp-amount">${mo}</span>${per}</div>
          <div class="pp-quota">${p.quota}</div>
          ${yearly}`
}

function planCard(p: Plan): string {
  const feat = p.featured ? ' featured' : ''
  const badge = p.badge ? `<div class="pp-badge">${p.badge}</div>` : ''
  const btnClass = p.featured ? 'btn btn-primary btn-block' : 'btn btn-ghost btn-block'
  const items = p.features
    .map(
      (f) =>
        `<li><i class="fas ${
          f.endsWith(':') ? 'fa-plus pp-plus' : 'fa-check'
        }"></i><span>${f}</span></li>`
    )
    .join('')
  return `
  <article class="plan glass tilt-sm${feat}" id="plan-${p.id}" data-plan="${p.id}">
    ${badge}
    <div class="pp-head">
      <div class="pp-ico"><i class="fas ${p.icon}"></i></div>
      <h3 class="pp-name">${p.name}</h3>
      <p class="pp-tag">${p.tagline}</p>
    </div>
    ${priceBlock(p)}
    <a href="${p.id === 'enterprise' ? 'mailto:sales@investsafepro.com?subject=Enterprise%20plan' : '#'}"
       class="${btnClass} pp-cta" data-plan-cta="${p.id}">
      <i class="fas ${p.id === 'enterprise' ? 'fa-envelope' : 'fa-bolt'}"></i> ${p.cta}
    </a>
    <ul class="pp-features">${items}</ul>
  </article>`
}

export function PricingPage(): string {
  const cards = PLANS.map(planCard).join('')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="description" content="InvestSafe Pro membership plans — from a free monthly check to unlimited enterprise fraud due-diligence. Pick the plan that fits how often you invest." />
<title>Memberships & Pricing — InvestSafe Pro™</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%9B%A1%EF%B8%8F%3C/text%3E%3C/svg%3E" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.1/css/all.min.css" />
<link rel="stylesheet" href="/static/style.css" />
</head>
<body>

<!-- floating 3D background orbs -->
<div class="bg-scene" aria-hidden="true">
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="orb orb-3"></div>
  <div class="grid-overlay"></div>
</div>

<!-- ───────────── NAV ───────────── -->
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
    <a href="/pricing" class="active">Pricing</a>
    <a class="nav-cta" href="/#analyze"><i class="fas fa-magnifying-glass-chart"></i> Check a pitch</a>
  </nav>
</header>

<main id="top">

  <!-- ───────────── PRICING HERO ───────────── -->
  <section class="hero pricing-hero">
    <div class="hero-inner pricing-hero-inner">
      <div class="hero-pill"><span class="dot"></span> Simple, honest pricing · Cancel anytime</div>
      <h1 class="hero-title">
        Protect every dollar you invest.<br />
        <span class="grad">Pick your plan.</span>
      </h1>
      <p class="hero-lead">
        Every plan runs the same forensic <strong>21-flag fraud framework</strong>. Choose based on how
        often you need to vet an investment — from a free monthly check to unlimited firm-wide due diligence.
      </p>

      <!-- billing toggle -->
      <div class="bill-toggle" id="billToggle">
        <button class="bt-opt active" data-bill="monthly" type="button">Monthly</button>
        <button class="bt-opt" data-bill="yearly" type="button">Yearly <span class="bt-save">2 months free</span></button>
      </div>
    </div>
  </section>

  <!-- ───────────── PLAN CARDS ───────────── -->
  <section class="pricing-wrap">
    <div class="plans-grid" id="plansGrid">
      ${cards}
    </div>
    <p class="pricing-note"><i class="fas fa-lock"></i> No API keys, ever. We run the AI for you. Prices in USD. Taxes may apply.</p>
  </section>

  <!-- ───────────── COMPARE ───────────── -->
  <section class="band compare-band">
    <div class="band-head">
      <span class="kicker">Everything included</span>
      <h2>What every plan gives you</h2>
      <p>The core protection never changes — paid plans just add volume, formats, history, and support.</p>
    </div>
    <div class="perk-grid">
      <div class="perk glass tilt-sm"><div class="perk-ico"><i class="fas fa-flag"></i></div><h3>Full 21-flag report</h3><p>The same forensic framework — built on real SEC enforcement cases — runs on every single check.</p></div>
      <div class="perk glass tilt-sm"><div class="perk-ico"><i class="fas fa-lock"></i></div><h3>Private by default</h3><p>We don't store your documents. Your due diligence stays yours.</p></div>
      <div class="perk glass tilt-sm"><div class="perk-ico"><i class="fas fa-language"></i></div><h3>Plain-English verdicts</h3><p>No finance degree needed — clear scores, red flags, and what to verify next.</p></div>
      <div class="perk glass tilt-sm"><div class="perk-ico"><i class="fas fa-rotate-left"></i></div><h3>Cancel anytime</h3><p>Upgrade, downgrade, or cancel in a click. No lock-in, no surprises.</p></div>
    </div>
  </section>

  <!-- ───────────── PRICING FAQ ───────────── -->
  <section id="faq" class="band">
    <div class="band-head">
      <span class="kicker">Billing questions</span>
      <h2>Pricing FAQ</h2>
    </div>
    <div class="faq-list">
      <details class="faq-item glass"><summary>Do I need my own API key?</summary><div>No. InvestSafe Pro runs the AI on our side — you never enter or pay for an API key. Just pick a plan and start checking.</div></details>
      <details class="faq-item glass"><summary>What counts as one "check"?</summary><div>One analyzed submission — whether it's a pasted pitch, a screenshot, or an uploaded PDF/Word document — counts as a single check, no matter how many red flags it finds.</div></details>
      <details class="faq-item glass"><summary>Can I change plans later?</summary><div>Yes. You can upgrade or downgrade at any time; changes take effect on your next billing cycle, and unused checks reset monthly.</div></details>
      <details class="faq-item glass"><summary>Is there a refund policy?</summary><div>If InvestSafe Pro isn't a fit, contact us within 14 days of your first paid charge for a full refund.</div></details>
      <details class="faq-item glass"><summary>Do you offer discounts?</summary><div>Yearly billing includes roughly two months free. Enterprise pricing is tailored to your volume and team — <a href="mailto:sales@investsafepro.com">talk to sales</a>.</div></details>
    </div>
  </section>

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
      InvestSafe Pro is an educational due-diligence aid, not legal, investment, or financial advice. Membership
      pricing shown here is illustrative and may change. Always verify with primary sources (SEC EDGAR, FINRA
      BrokerCheck, county records) and consult a licensed professional before investing.
    </p>
    <p class="footer-copy">© <span id="year"></span> InvestSafe Pro™ · <a href="/">Home</a> · <a href="/pricing">Pricing</a></p>
  </div>
</footer>

<script src="/static/pricing.js"></script>
</body>
</html>`
}
