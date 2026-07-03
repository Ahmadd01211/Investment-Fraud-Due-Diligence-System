/* InvestSafe Pro™ — Premium Services page interactions.
   Ports the original app's openPremiumModal(type) / openAssetValModal(tier)
   modal system to our Hono-served page. Forms POST to /api/premium-request. */
(function () {
  'use strict';

  // Per-service config used to populate the premium-request modal title + intro,
  // mirroring the original Barry Minkow DD System service catalogue.
  var PREMIUM_SERVICES = {
    tier1: {
      title: 'Request Tier 1 — Rapid Screen',
      price: '$250–$500 · 24–48 hours',
      desc: 'Initial sponsor vetting: 16-Flag Red Flag Scoring Report, FINRA BrokerCheck + SEC EDGAR search on all principals & entities, basic internet/litigation scan, and a 2–4 page written summary with risk score.'
    },
    tier2: {
      title: 'Request Tier 2 — Deep Dive',
      price: '$1,500–$3,500 · 5–7 business days',
      desc: 'For lenders, underwriters & $500K+ commitments. Everything in Tier 1 plus full title chain on each disclosed property, Irrational Ratios financial forensics, PACER federal court search, full contradiction matrix, and a 10–20 page exhibit-referenced report.'
    },
    tier3: {
      title: 'Request Tier 3 — Institutional Package',
      price: 'Custom pricing · 10–15 business days',
      desc: 'Family offices, $1M+ allocations & regulatory referrals. Everything in Tiers 1 & 2 plus "Pose as Investor" engagement, full entity structure map, Co-GP double-count audit, tax lien & UCC sweep, referral-ready packages (SEC/DHS/FBI/FDIC/FINRA) and senior-analyst consultation.'
    },
    title: {
      title: 'Order Single Property Title Report',
      price: '$15–$50',
      desc: 'Full title chain, lien search, and deed history for one property. Identifies undisclosed mortgages the sponsor may be hiding from investors.'
    },
    bgcheck: {
      title: 'Order Principal Background Check',
      price: '$35–$150',
      desc: 'FINRA BrokerCheck, PACER federal search, state court search, sex offender registry and criminal history for one named individual.'
    },
    ratios: {
      title: 'Order Irrational Ratios Analysis',
      price: '$200–$400',
      desc: 'Full debt-service-vs-NOI mathematical analysis with documented source data — the single most powerful quantitative fraud indicator.'
    },
    entity: {
      title: 'Order Entity Structure Mapping',
      price: '$300–$600',
      desc: 'Full org chart of all related entities, LLC members, registered agents, state filings and nominee-principal identification.'
    },
    ads: {
      title: 'Order Ad & Marketing Archive Capture',
      price: '$75–$200',
      desc: 'Systematic capture & archiving of all known Facebook, Instagram, YouTube, TV and radio advertising with metadata, timestamps and targeting data via the Meta Ad Library.'
    },
    referral: {
      title: 'Order Regulatory Referral Package',
      price: '$500–$1,000',
      desc: 'Existing findings formatted into agency-specific referral packages for SEC, DHS/HSI, FBI, FDIC or FINRA with proper exhibit labeling and chain-of-custody documentation.'
    }
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var lastFocused = null;

  function openModal(id) {
    var overlay = document.getElementById(id);
    if (!overlay) return;
    lastFocused = document.activeElement;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    var focusable = overlay.querySelector('input, select, textarea, button');
    if (focusable) { try { focusable.focus(); } catch (e) {} }
  }

  function closeModal(id) {
    var overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal-overlay.open')) {
      document.body.classList.remove('modal-open');
    }
    if (lastFocused) { try { lastFocused.focus(); } catch (e) {} }
  }

  function openPremiumModal(type) {
    var cfg = PREMIUM_SERVICES[type] || { title: 'Request Premium Service', price: '', desc: '' };
    var titleEl = $('#premium-modal-title');
    var introEl = $('#premium-request-intro');
    var typeEl = $('#premium-service-type');
    if (titleEl) titleEl.textContent = cfg.title;
    if (typeEl) typeEl.value = type;
    if (introEl) {
      introEl.innerHTML =
        '<div class="pri-price"><i class="fas fa-tag"></i> ' + (cfg.price || 'Custom quote') + '</div>' +
        '<p>' + cfg.desc + '</p>';
    }
    openModal('modal-premium');
  }

  function setAvalTier(tier) {
    var isInst = tier === 'institutional';
    var tierInput = $('#aval-tier');
    if (tierInput) tierInput.value = tier;
    var retail = $('#aval-retail-fields');
    var inst = $('#aval-institutional-fields');
    if (retail) retail.style.display = isInst ? 'none' : '';
    if (inst) inst.style.display = isInst ? '' : 'none';
    var addr = $('#aval-property-address');
    if (addr) addr.required = !isInst;
    $all('.aval-tier-opt').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-aval-tier') === tier);
    });
  }

  function openAssetValModal(tier) {
    setAvalTier(tier || 'retail');
    openModal('modal-assetval');
  }

  // ── Toast ──
  var toastTimer = null;
  function toast(msg, kind) {
    var el = $('#toast');
    if (!el) { alert(msg); return; }
    el.textContent = msg;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 4200);
  }

  function serialize(form) {
    var data = {};
    $all('input, select, textarea', form).forEach(function (el) {
      if (!el.name) return;
      data[el.name] = el.value;
    });
    return data;
  }

  function validateRequired(form) {
    var ok = true;
    $all('[required]', form).forEach(function (el) {
      // Skip fields inside a hidden container (e.g. retail-only fields when institutional)
      if (el.offsetParent === null && el.type !== 'hidden') return;
      if (!String(el.value || '').trim()) {
        el.classList.add('invalid');
        ok = false;
      } else {
        el.classList.remove('invalid');
      }
    });
    return ok;
  }

  function submitForm(form, kind, evt) {
    evt.preventDefault();
    if (!validateRequired(form)) {
      toast('Please complete the required fields.', 'error');
      return;
    }
    var payload = serialize(form);
    payload.kind = kind; // 'premium' | 'valuation'
    var btn = form.parentElement.querySelector('.modal-footer .btn-primary') ||
              document.querySelector('button[form="' + form.id + '"].btn-primary');
    if (btn) { btn.disabled = true; btn.dataset.label = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…'; }

    fetch('/api/premium-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (res.ok && res.body && res.body.ok) {
          var ref = res.body.reference ? ' (Ref: ' + res.body.reference + ')' : '';
          toast('Request received — our team will respond within one business day.' + ref, 'success');
          form.reset();
          if (kind === 'valuation') setAvalTier('retail');
          closeModal(kind === 'valuation' ? 'modal-assetval' : 'modal-premium');
        } else {
          toast((res.body && res.body.error) || 'Something went wrong. Please try again.', 'error');
        }
      })
      .catch(function () {
        toast('Network error — please try again.', 'error');
      })
      .finally(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.label; }
      });
  }

  // ── Wiring ──
  document.addEventListener('click', function (e) {
    var openP = e.target.closest('[data-open-premium]');
    if (openP) { e.preventDefault(); openPremiumModal(openP.getAttribute('data-open-premium')); return; }
    var openA = e.target.closest('[data-open-aval]');
    if (openA) { e.preventDefault(); openAssetValModal(openA.getAttribute('data-open-aval')); return; }
    var closeBtn = e.target.closest('[data-close-modal]');
    if (closeBtn) { e.preventDefault(); closeModal(closeBtn.getAttribute('data-close-modal')); return; }
    var tierBtn = e.target.closest('[data-aval-tier]');
    if (tierBtn) { e.preventDefault(); setAvalTier(tierBtn.getAttribute('data-aval-tier')); return; }
    // click on overlay backdrop closes
    if (e.target.classList && e.target.classList.contains('modal-overlay') && e.target.classList.contains('open')) {
      closeModal(e.target.id);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var open = document.querySelector('.modal-overlay.open');
      if (open) closeModal(open.id);
    }
  });

  var pForm = document.getElementById('premium-form');
  if (pForm) pForm.addEventListener('submit', function (e) { submitForm(pForm, 'premium', e); });
  var aForm = document.getElementById('aval-form');
  if (aForm) aForm.addEventListener('submit', function (e) { submitForm(aForm, 'valuation', e); });

  // Expose (parity with original global fn names)
  window.openPremiumModal = openPremiumModal;
  window.openAssetValModal = openAssetValModal;
  window.setAvalTier = setAvalTier;
})();
