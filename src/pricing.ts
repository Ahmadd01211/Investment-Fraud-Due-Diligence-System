// Unified Solution page (5 core tiers + 1 unlimited package)
// Includes per-tier fillable inquiry modal (no mailto links).

type SolutionTier = {
  id: string
  name: string
  tagline: string
  price: string
  icon: string
  cta: string
  ctaType: 'home' | 'form'
  badge?: string
  turnaround?: string
  features: string[]
}

const SOLUTION_TIERS: SolutionTier[] = [
  {
    id: 'tier-1',
    name: 'Tier 1 — Free Quick Check',
    tagline: 'For a quick, one-off gut check.',
    price: '$0',
    icon: 'fa-shield-halved',
    cta: 'Start free',
    ctaType: 'home',
    features: [
      '3 fraud checks per month (browser-tracked)',
      'Full 21 red flag report',
      'Unlimited 21 red flag detection on every report',
      'Plain-English risk score & verdict',
      'No account or API key needed',
    ],
  },
  {
    id: 'tier-2',
    name: 'Tier 2 — Single Property Title + Background',
    tagline: 'Single-property title package with primary background verification.',
    price: '$49.95',
    icon: 'fa-file-signature',
    cta: 'Request Tier 2',
    ctaType: 'form',
    features: [
      '1 title report with notarized loan document review',
      '1 deep background check on primary reports',
      'Full title chain, lien search, and deed history',
      'FINRA + PACER + state court + registry screening for one named person',
      'Unlimited 21 red flag detection on every report',
    ],
  },
  {
    id: 'tier-3',
    name: 'Tier 3 — Rapid Screen',
    tagline: 'Ideal for initial sponsor vetting.',
    price: '$250–$500',
    icon: 'fa-bolt',
    cta: 'Request Rapid Screen',
    ctaType: 'form',
    features: [
      '21-Flag red-flag scoring report with evidence notes',
      'Up to 5 title reports with notarized loan document review',
      '2 deep background checks on primary reports',
      'FINRA BrokerCheck + SEC EDGAR search across principals/entities',
      'Unlimited 21 red flag detection on every report',
    ],
  },
  {
    id: 'tier-4',
    name: 'Tier 4 — Deep Dive',
    tagline: 'For lenders, underwriters, and $500K+ commitments.',
    price: '$1,500–$3,500',
    icon: 'fa-magnifying-glass-chart',
    badge: 'Most requested',
    cta: 'Request Deep Dive',
    ctaType: 'form',
    features: [
      'Everything in Tier 3, plus full title chain on each disclosed property',
      'Irrational Ratios financial forensics (debt service vs NOI)',
      'PACER federal litigation/bankruptcy search for all principals',
      'Full contradiction matrix mapped to public record',
      'Unlimited 21 red flag detection on every report',
    ],
  },
  {
    id: 'tier-5',
    name: 'Tier 5 — Institutional Package',
    tagline: 'Family offices, $1M+ allocations, and regulatory referrals.',
    price: 'Custom',
    icon: 'fa-building-shield',
    cta: 'Request Institutional Package',
    ctaType: 'form',
    turnaround: '10–15 business days',
    features: [
      'Everything in Tiers 3 & 4, plus primary-source document acquisition',
      'Full entity structure map (LLCs, trusts, nominees)',
      'Tax lien + UCC sweep across operating states',
      'Regulatory referral-ready exhibit package with chain-of-custody',
      'Unlimited 21 red flag detection on every report',
    ],
  },
  {
    id: 'tier-unlimited',
    name: 'Unlimited — Self-Service',
    tagline: 'For users who want unlimited checks without enterprise onboarding.',
    price: '$9.95',
    icon: 'fa-infinity',
    badge: 'Best value',
    cta: 'Get Unlimited',
    ctaType: 'form',
    features: [
      'Unlimited reports',
      'Unlimited 21 red flag detection on every report',
      'Priority processing vs free queue',
      'Best for daily deal screening and fast triage',
      'Simple monthly package',
    ],
  },
]

function tierCard(t: SolutionTier): string {
  const badge = t.badge ? `<div class="pp-badge">${t.badge}</div>` : ''
  const turn = t.turnaround
    ? `<div class="tier-turn solution-turn"><i class="fas fa-clock"></i> Turnaround: <strong>${t.turnaround}</strong></div>`
    : ''
  const cta =
    t.ctaType === 'home'
      ? `<a class="btn btn-primary btn-block pp-cta" href="/#analyze"><i class="fas fa-play"></i> ${t.cta}</a>`
      : `<button class="btn ${t.id === 'tier-unlimited' || t.id === 'tier-4' ? 'btn-primary' : 'btn-ghost'} btn-block pp-cta" type="button" data-open-solution-form="${t.id}"><i class="fas fa-paper-plane"></i> ${t.cta}</button>`

  return `<article class="plan glass tilt-sm solution-card" id="${t.id}">
    ${badge}
    <div class="pp-head">
      <div class="pp-ico"><i class="fas ${t.icon}"></i></div>
      <h3 class="pp-name">${t.name}</h3>
      <p class="pp-tag">${t.tagline}</p>
    </div>
    <div class="pp-price"><span class="pp-amount">${t.price}</span></div>
    ${turn}
    ${cta}
    <ul class="pp-features">${t.features
      .map((f) => `<li><i class="fas fa-check"></i><span>${f}</span></li>`)
      .join('')}</ul>
  </article>`
}

function tierOfferSchema(t: SolutionTier) {
  const fixed = t.price.match(/^\$(\d+(?:\.\d{1,2})?)$/)
  if (fixed) {
    return {
      '@type': 'Offer',
      name: t.name,
      description: t.tagline,
      price: Number(fixed[1]),
      priceCurrency: 'USD',
    }
  }

  const range = t.price.match(/^\$(\d+(?:\.\d{1,2})?)\s*[–-]\s*\$(\d+(?:\.\d{1,2})?)$/)
  if (range) {
    return {
      '@type': 'AggregateOffer',
      name: t.name,
      description: t.tagline,
      lowPrice: Number(range[1]),
      highPrice: Number(range[2]),
      priceCurrency: 'USD',
      offerCount: 1,
    }
  }

  return {
    '@type': 'Offer',
    name: t.name,
    description: `${t.tagline} (${t.price})`,
    priceCurrency: 'USD',
  }
}

export function SolutionsPage(): string {
  const cards = SOLUTION_TIERS.map(tierCard).join('')
  const faqItems = [
    {
      q: 'How many free checks do I get?',
      a: 'Tier 1 includes 3 free checks per month per browser. After that, you can upgrade to the $9.95 Unlimited package.',
    },
    {
      q: 'Do all tiers include the 21 red flag engine?',
      a: 'Yes. Every tier includes unlimited 21 red flag detection on each report.',
    },
    {
      q: 'Do I need my own API key?',
      a: 'No. You do not need to bring an API key. InvestSafe Pro handles the analysis infrastructure for you.',
    },
    {
      q: 'How fast are paid investigations delivered?',
      a: 'Delivery time depends on tier scope. Rapid Screen is fastest, while Institutional packages are typically 10–15 business days.',
    },
  ]

  const faqHtml = faqItems
    .map(
      (f) =>
        `<details class="faq-item glass"><summary>${f.q}<i class="fas fa-plus fq-i"></i></summary><div class="fq-body">${f.a}</div></details>`
    )
    .join('')

  const serviceSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'InvestSafe Pro Fraud Due-Diligence Solutions',
    serviceType: 'Investment fraud due-diligence and red-flag risk analysis',
    areaServed: 'Global',
    provider: {
      '@type': 'Organization',
      name: 'InvestSafe Pro',
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Solutions & Pricing',
      itemListElement: SOLUTION_TIERS.map((t) => tierOfferSchema(t)),
    },
  })

  const faqSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  })

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="description" content="Compare InvestSafe Pro pricing and solutions: free fraud checks, unlimited 21 red flag detection, deep-dive due diligence, and institutional investigation packages." />
<meta name="robots" content="index, follow, max-image-preview:large" />
<meta name="theme-color" content="#0a0d16" />
<link rel="canonical" href="/solution" />
<meta property="og:site_name" content="InvestSafe Pro" />
<meta property="og:title" content="InvestSafe Pro Solutions & Pricing" />
<meta property="og:description" content="Choose the fraud due-diligence tier that matches your risk level, from free checks to institutional packages." />
<meta property="og:type" content="website" />
<meta property="og:url" content="/solution" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="InvestSafe Pro Solutions & Pricing" />
<meta name="twitter:description" content="Free checks, unlimited plans, and institutional-grade fraud due diligence." />
<title>Solutions & Pricing — InvestSafe Pro™</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%9B%A1%EF%B8%8F%3C/text%3E%3C/svg%3E" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.1/css/all.min.css" />
<link rel="stylesheet" href="/static/style.css" />
<script type="application/ld+json">${serviceSchema}</script>
<script type="application/ld+json">${faqSchema}</script>
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
    <a href="/solution" class="active">Solutions</a>
    <a href="/#faq">FAQ</a>
    <a class="nav-cta" href="/#analyze"><i class="fas fa-magnifying-glass-chart"></i> The Check</a>
  </nav>
</header>

<main id="top">
  <section class="hero pricing-hero pricing-hero-compact">
    <div class="hero-inner pricing-hero-inner">
      <div class="hero-pill"><span class="dot"></span> Inspired by modern SaaS pricing layouts · all plans in one view</div>
      <h1 class="hero-title">Solutions &amp; <span class="grad">Pricing</span></h1>
      <p class="hero-lead">Choose a tier below. Every package includes unlimited 21 red flag detection per report.</p>
      <div class="hero-actions" style="justify-content:center">
        <a class="btn btn-primary" href="/#analyze"><i class="fas fa-play"></i> Try The Check</a>
        <a class="btn btn-ghost" href="#pricing-faq"><i class="fas fa-circle-question"></i> Pricing FAQ</a>
      </div>
    </div>
  </section>

  <section class="pricing-proof" aria-label="Plan trust signals">
    <div class="proof-chip"><i class="fas fa-circle-check"></i> Transparent tier scope</div>
    <div class="proof-chip"><i class="fas fa-credit-card"></i> No card required for Tier 1</div>
    <div class="proof-chip"><i class="fas fa-shield"></i> Full 21 red flag report on every check</div>
    <div class="proof-chip"><i class="fas fa-bolt"></i> Upgrade instantly to Unlimited</div>
  </section>

  <section class="pricing-wrap solutions-wrap">
    <div class="plans-grid solutions-grid one-view" id="solutionsGrid">${cards}</div>
    <p class="pricing-note"><i class="fas fa-circle-info"></i> Free tier allows 3 checks/month per browser. After that, users are prompted to upgrade to the $9.95 Unlimited package.</p>
  </section>

  <section class="band" aria-labelledby="pricing-why-title">
    <div class="band-head">
      <span class="kicker">Why teams choose us</span>
      <h2 id="pricing-why-title">Built for clarity, speed, and defensible due diligence</h2>
      <p>Designed for investors, lenders, and analysts who need risk signals quickly — without skipping evidence quality.</p>
    </div>
    <div class="perk-grid">
      <article class="perk glass"><div class="perk-ico"><i class="fas fa-list-check"></i></div><h3>Structured framework</h3><p>Every report follows the same 21-flag methodology for consistency and auditability.</p></article>
      <article class="perk glass"><div class="perk-ico"><i class="fas fa-file-shield"></i></div><h3>Evidence-first output</h3><p>Findings map to explicit evidence notes so conclusions are easy to review.</p></article>
      <article class="perk glass"><div class="perk-ico"><i class="fas fa-gauge-high"></i></div><h3>Fast decision support</h3><p>Start with quick triage, then escalate into deep investigations only when needed.</p></article>
      <article class="perk glass"><div class="perk-ico"><i class="fas fa-people-group"></i></div><h3>Scales by deal size</h3><p>From individual checks to institutional referrals, packages align with risk and exposure.</p></article>
    </div>
  </section>

  <section class="band compare-band" aria-labelledby="compare-title">
    <div class="band-head">
      <span class="kicker">At a glance</span>
      <h2 id="compare-title">Quick package comparison</h2>
    </div>
    <div class="price-matrix-wrap glass">
      <table class="price-matrix">
        <caption>Compare free, unlimited, and investigation-focused solution tiers.</caption>
        <thead>
          <tr><th>Feature</th><th>Tier 1</th><th>Unlimited</th><th>Tier 3+</th></tr>
        </thead>
        <tbody>
          <tr><td>21 red flag detection</td><td>Included</td><td>Included</td><td>Included</td></tr>
          <tr><td>Monthly report volume</td><td>3 checks/browser</td><td>Unlimited</td><td>Project-based</td></tr>
          <tr><td>Title/background services</td><td>—</td><td>—</td><td>Included by tier</td></tr>
          <tr><td>Formal investigation deliverables</td><td>Basic report</td><td>Self-service report</td><td>Expanded evidentiary packages</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section id="pricing-faq" class="band" aria-labelledby="faq-title">
    <div class="band-head">
      <span class="kicker">Pricing FAQ</span>
      <h2 id="faq-title">Common questions before you choose a tier</h2>
    </div>
    <div class="faq-list">${faqHtml}</div>
  </section>
</main>

<div class="modal-overlay" id="modal-solution" aria-hidden="true">
  <div class="modal modal-lg glass" role="dialog" aria-modal="true" aria-labelledby="solution-modal-title">
    <div class="modal-header premium-modal-header">
      <h3><i class="fas fa-layer-group"></i> <span id="solution-modal-title">Request Solution Tier</span></h3>
      <button type="button" class="modal-close" data-close-modal="modal-solution" aria-label="Close">&times;</button>
    </div>
    <form class="modal-body" id="solution-form" novalidate>
      <div class="premium-request-intro" id="solution-request-intro"></div>
      <input type="hidden" id="solution-tier-id" name="tierId" value="" />

      <div class="form-row">
        <div class="form-group">
          <label>Your Name <span class="req">*</span></label>
          <input type="text" id="solution-name" name="name" class="form-control" required placeholder="Full name" />
        </div>
        <div class="form-group">
          <label>Email <span class="req">*</span></label>
          <input type="email" id="solution-email" name="email" class="form-control" required placeholder="you@email.com" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Phone (optional)</label>
          <input type="tel" id="solution-phone" name="phone" class="form-control" placeholder="+1 (555) 000-0000" />
        </div>
        <div class="form-group">
          <label>Client Type <span class="req">*</span></label>
          <select id="solution-client-type" name="clientType" class="form-control" required>
            <option value="">— Select —</option>
            <option>Individual Investor</option>
            <option>Family Office</option>
            <option>Lender / Bank</option>
            <option>Underwriter / Analyst</option>
            <option>Legal Counsel</option>
            <option>Other</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label>Sponsor / Entity (optional)</label>
        <input type="text" id="solution-target" name="target" class="form-control" placeholder="e.g. XYZ Capital Partners" />
      </div>

      <div class="form-group">
        <label>Deal Size / Budget (optional)</label>
        <select id="solution-deal-size" name="dealSize" class="form-control">
          <option value="">— Select —</option>
          <option>Under $100,000</option>
          <option>$100,000 – $500,000</option>
          <option>$500,000 – $1,000,000</option>
          <option>$1,000,000 – $5,000,000</option>
          <option>$5,000,000+</option>
        </select>
      </div>

      <div class="form-group">
        <label>What do you need help with?</label>
        <textarea id="solution-notes" name="notes" class="form-control" rows="4" placeholder="Share what you want reviewed, timeline, and any red flags you already noticed."></textarea>
      </div>

      <div class="premium-request-note">
        <i class="fas fa-lock"></i> We keep your request confidential. Our team will reply with next steps and scope confirmation.
      </div>
    </form>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" data-close-modal="modal-solution">Cancel</button>
      <button type="submit" form="solution-form" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Submit Request</button>
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
    <p class="footer-disclaimer">InvestSafe Pro is an educational due-diligence aid, not legal or investment advice. Paid scopes are confirmed before engagement.</p>
    <p class="footer-copy">© <span id="year"></span> InvestSafe Pro™ · <a href="/">Home</a> · <a href="/solution">Solutions</a></p>
  </div>
</footer>

<script>
(function(){
  'use strict';
  var y=document.getElementById('year'); if(y) y.textContent=String(new Date().getFullYear());
  var nav=document.getElementById('nav');
  function onScroll(){ if(nav) nav.classList.toggle('scrolled', window.scrollY>10); }
  window.addEventListener('scroll', onScroll, { passive:true }); onScroll();

  var tierMeta = ${JSON.stringify(
    SOLUTION_TIERS.map((t) => ({ id: t.id, name: t.name, price: t.price, tagline: t.tagline }))
  )};

  function $(s,r){ return (r||document).querySelector(s); }
  function $all(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }

  var modalId='modal-solution';
  var lastFocused=null;
  function openModal(){
    var m=document.getElementById(modalId); if(!m) return;
    lastFocused=document.activeElement;
    m.classList.add('open'); m.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open');
    var f=m.querySelector('input,select,textarea,button'); if(f){ try{f.focus();}catch(e){} }
  }
  function closeModal(){
    var m=document.getElementById(modalId); if(!m) return;
    m.classList.remove('open'); m.setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open');
    if(lastFocused){ try{lastFocused.focus();}catch(e){} }
  }

  function toast(msg, kind){
    var t=$('#toast');
    if(!t){ alert(msg); return; }
    t.textContent=msg;
    t.className='toast show' + (kind ? ' ' + kind : '');
    clearTimeout(window.__solutionToastTimer);
    window.__solutionToastTimer=setTimeout(function(){ t.className='toast'; }, 4000);
  }

  document.addEventListener('click', function(e){
    var open=e.target.closest('[data-open-solution-form]');
    if(open){
      e.preventDefault();
      var id=open.getAttribute('data-open-solution-form');
      var tier=tierMeta.find(function(t){ return t.id===id; }) || tierMeta[0];
      $('#solution-tier-id').value=tier.id;
      $('#solution-modal-title').textContent='Request ' + tier.name;
      $('#solution-request-intro').innerHTML='<div class="pri-price"><i class="fas fa-tag"></i> ' + tier.price + '</div><p>' + tier.tagline + '</p>';
      openModal();
      return;
    }
    var close=e.target.closest('[data-close-modal="modal-solution"]');
    if(close){ e.preventDefault(); closeModal(); return; }
    if(e.target.classList && e.target.classList.contains('modal-overlay') && e.target.id===modalId){ closeModal(); }
  });

  document.addEventListener('keydown', function(e){ if(e.key==='Escape'){ closeModal(); }});

  function serialize(form){
    var data={};
    $all('input,select,textarea', form).forEach(function(el){ if(el.name) data[el.name]=el.value; });
    return data;
  }

  function validateRequired(form){
    var ok=true;
    $all('[required]', form).forEach(function(el){
      if(!String(el.value||'').trim()){ el.classList.add('invalid'); ok=false; }
      else el.classList.remove('invalid');
    });
    return ok;
  }

  var form=$('#solution-form');
  if(form){
    form.addEventListener('submit', function(e){
      e.preventDefault();
      if(!validateRequired(form)){ toast('Please complete required fields.', 'error'); return; }
      var payload=serialize(form);
      var submitBtn=document.querySelector('button[form="solution-form"].btn-primary');
      if(submitBtn){ submitBtn.disabled=true; submitBtn.dataset.label=submitBtn.innerHTML; submitBtn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Submitting…'; }

      fetch('/api/solution-request', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(payload),
      })
      .then(function(r){ return r.json().then(function(j){ return { ok:r.ok, body:j }; }); })
      .then(function(res){
        if(res.ok && res.body && res.body.ok){
          var ref=res.body.reference ? ' (Ref: ' + res.body.reference + ')' : '';
          toast('Request submitted successfully' + ref, 'success');
          form.reset();
          closeModal();
        } else {
          toast((res.body && res.body.error) || 'Could not submit request.', 'error');
        }
      })
      .catch(function(){ toast('Network error. Please try again.', 'error'); })
      .finally(function(){ if(submitBtn){ submitBtn.disabled=false; submitBtn.innerHTML=submitBtn.dataset.label; }});
    });
  }
})();
</script>
<script src="/static/auth.js"></script>
</body>
</html>`
}
