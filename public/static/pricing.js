/* InvestSafe Pro™ — Pricing page interactions
   The plan cards are server-rendered from /src/plans.ts (same data as
   /api/plans), so this script only handles the monthly/yearly toggle,
   nav scroll style, and the footer year. */
(function () {
  'use strict';

  // year
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // nav shadow on scroll
  var nav = document.getElementById('nav');
  function onScroll() {
    if (!nav) return;
    nav.classList.toggle('scrolled', window.scrollY > 10);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ── billing toggle (monthly ⇄ yearly) ──
  var toggle = document.getElementById('billToggle');
  var grid = document.getElementById('plansGrid');
  if (toggle && grid) {
    toggle.addEventListener('click', function (e) {
      var btn = e.target.closest('.bt-opt');
      if (!btn) return;
      var mode = btn.getAttribute('data-bill');
      toggle.querySelectorAll('.bt-opt').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      grid.setAttribute('data-bill', mode);

      grid.querySelectorAll('.plan').forEach(function (card) {
        var amountEl = card.querySelector('.pp-amount');
        var perEl = card.querySelector('.pp-per');
        var yEl = card.querySelector('.pp-yearly');
        if (!amountEl || !yEl) return;
        var monthly = parseFloat(yEl.getAttribute('data-monthly'));
        var yearly = parseFloat(yEl.getAttribute('data-yearly'));
        if (isNaN(monthly) || isNaN(yearly)) return; // free / custom cards

        if (mode === 'yearly') {
          var perMo = Math.round(yearly / 12);
          amountEl.textContent = '$' + perMo.toLocaleString('en-US');
          if (perEl) perEl.textContent = '/mo';
          yEl.innerHTML =
            'billed <strong>$' + yearly.toLocaleString('en-US') + '</strong>/yr' +
            ' <span class="pp-save">2 months free</span>';
        } else {
          amountEl.textContent = '$' + monthly.toLocaleString('en-US');
          if (perEl) perEl.textContent = '/mo';
          var save = Math.round((1 - yearly / (monthly * 12)) * 100);
          yEl.innerHTML =
            'or <strong>$' + yearly.toLocaleString('en-US') + '</strong>/yr' +
            ' <span class="pp-save">save ' + save + '%</span>';
        }
      });
    });
  }

  // ── plan CTA (placeholder checkout hook) ──
  document.querySelectorAll('[data-plan-cta]').forEach(function (btn) {
    var plan = btn.getAttribute('data-plan-cta');
    if (plan === 'enterprise') return; // real mailto link
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      // Checkout is not wired to a payment provider yet — surface a friendly note.
      var mode = grid ? grid.getAttribute('data-bill') || 'monthly' : 'monthly';
      alert(
        'You selected the "' + plan.charAt(0).toUpperCase() + plan.slice(1) +
        '" plan (' + mode + ').\n\nCheckout isn\'t connected to a payment provider yet. ' +
        'Once a provider (e.g. Stripe) is added, this button will start secure checkout.'
      );
    });
  });
})();
