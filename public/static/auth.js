/* InvestSafe Pro™ — optional accounts (self-contained IIFE).
   Injects its own CSS + DOM: a nav auth control, a sign-in/create modal, and a
   saved-history panel. Accounts are OPTIONAL — analysis works signed-out. */
(() => {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let CONFIG = { enabled: false, emailPassword: false, google: false, user: null };

  /* ── styles ── */
  function injectCss() {
    if (document.getElementById('isp-auth-css')) return;
    const css = `
      .isp-auth-nav{display:inline-flex;align-items:center;gap:8px;position:relative}
      .isp-auth-btn{font-size:14px;font-weight:700;padding:9px 16px;border-radius:11px;
        background:rgba(255,255,255,.06);border:1px solid var(--border-2);color:var(--text);cursor:pointer}
      .isp-auth-btn:hover{background:var(--grad);border-color:transparent;color:#fff}
      .isp-avatar{width:34px;height:34px;border-radius:50%;background:var(--grad);color:#fff;
        font-weight:800;font-size:14px;display:inline-flex;align-items:center;justify-content:center;
        cursor:pointer;border:none}
      .isp-menu{position:absolute;top:46px;right:0;min-width:210px;background:var(--card-solid);
        border:1px solid var(--border-2);border-radius:var(--radius-sm);box-shadow:0 18px 40px -12px rgba(0,0,0,.6);
        padding:8px;z-index:2000;display:none}
      .isp-menu.open{display:block}
      .isp-menu .isp-me{padding:8px 10px;border-bottom:1px solid var(--border);margin-bottom:6px}
      .isp-menu .isp-me b{display:block;color:var(--text);font-size:13.5px}
      .isp-menu .isp-me span{color:var(--muted);font-size:12px;word-break:break-all}
      .isp-menu button{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:none;
        border:none;color:var(--text);font-size:13.5px;font-weight:600;padding:9px 10px;border-radius:9px;cursor:pointer}
      .isp-menu button:hover{background:var(--bg2)}
      .isp-modal-bg{position:fixed;inset:0;background:rgba(5,8,16,.72);backdrop-filter:blur(4px);
        z-index:5000;display:none;align-items:center;justify-content:center;padding:20px}
      .isp-modal-bg.open{display:flex}
      .isp-modal{width:100%;max-width:420px;background:var(--card-solid);border:1px solid var(--border-2);
        border-radius:var(--radius);padding:26px 24px;box-shadow:0 30px 70px -20px rgba(0,0,0,.7);position:relative}
      .isp-modal h3{font-size:20px;font-weight:800;margin:0 0 4px;color:var(--text)}
      .isp-modal .isp-sub{color:var(--muted);font-size:13px;margin-bottom:18px}
      .isp-close{position:absolute;top:14px;right:14px;background:none;border:none;color:var(--muted);
        font-size:18px;cursor:pointer}
      .isp-tabs{display:flex;gap:6px;background:var(--bg2);border-radius:11px;padding:4px;margin-bottom:16px}
      .isp-tabs button{flex:1;padding:8px;border:none;background:none;color:var(--muted);font-weight:700;
        font-size:13.5px;border-radius:8px;cursor:pointer}
      .isp-tabs button.active{background:var(--grad);color:#fff}
      .isp-field{margin-bottom:12px}
      .isp-field label{display:block;font-size:12.5px;font-weight:600;color:var(--muted);margin-bottom:5px}
      .isp-field input{width:100%;padding:11px 13px;border-radius:10px;border:1px solid var(--border-2);
        background:var(--bg2);color:var(--text);font-size:14px}
      .isp-field input:focus{outline:none;border-color:var(--blue)}
      .isp-submit{width:100%;padding:12px;border:none;border-radius:11px;background:var(--grad);color:#fff;
        font-weight:800;font-size:14.5px;cursor:pointer;margin-top:4px}
      .isp-submit:disabled{opacity:.6;cursor:default}
      .isp-err{color:#ff8a8a;font-size:12.5px;margin:8px 0 0;min-height:16px}
      .isp-or{text-align:center;color:var(--muted-2);font-size:12px;margin:16px 0;position:relative}
      .isp-or::before,.isp-or::after{content:"";position:absolute;top:50%;width:38%;height:1px;background:var(--border)}
      .isp-or::before{left:0}.isp-or::after{right:0}
      .isp-google{width:100%;padding:11px;border:1px solid var(--border-2);border-radius:11px;background:#fff;
        color:#1a2035;font-weight:700;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px}
      .isp-google:hover{background:#f2f4f9}
      .isp-panel-bg{position:fixed;inset:0;background:rgba(5,8,16,.72);backdrop-filter:blur(4px);
        z-index:5000;display:none;align-items:center;justify-content:center;padding:20px}
      .isp-panel-bg.open{display:flex}
      .isp-panel{width:100%;max-width:560px;max-height:80vh;overflow:auto;background:var(--card-solid);
        border:1px solid var(--border-2);border-radius:var(--radius);padding:26px 24px;position:relative}
      .isp-panel h3{font-size:19px;font-weight:800;margin:0 0 16px;color:var(--text)}
      .isp-hist-item{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border);
        border-radius:12px;margin-bottom:10px}
      .isp-pill{font-size:11px;font-weight:800;padding:5px 9px;border-radius:20px;white-space:nowrap}
      .isp-hist-body{flex:1;min-width:0}
      .isp-hist-body .v{color:var(--text);font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .isp-hist-body .d{color:var(--muted);font-size:12px}
      .isp-view{font-size:13px;font-weight:700;color:var(--blue);text-decoration:none;white-space:nowrap}
      .isp-empty{color:var(--muted);text-align:center;padding:30px 10px;font-size:14px}
      .isp-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);
        background:var(--card-solid);border:1px solid var(--border-2);color:var(--text);padding:12px 18px;
        border-radius:12px;font-size:13.5px;font-weight:600;z-index:6000;opacity:0;transition:.3s;box-shadow:0 18px 40px -14px rgba(0,0,0,.6)}
      .isp-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
    `;
    const el = document.createElement('style');
    el.id = 'isp-auth-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ── toast ── */
  let toastT;
  function toast(msg) {
    let t = document.querySelector('.isp-toast');
    if (!t) { t = document.createElement('div'); t.className = 'isp-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 3800);
  }

  const initials = (u) => {
    const s = (u.name || u.email || '?').trim();
    return s.slice(0, 1).toUpperCase();
  };
  const riskColor = (lvl) => ({
    Low: 'var(--green)', Medium: 'var(--gold)', High: '#f57823', Critical: 'var(--red)',
  }[lvl] || 'var(--muted)');

  /* ── nav control ── */
  function renderNav() {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;
    let host = document.getElementById('ispAuthNav');
    if (!host) {
      host = document.createElement('span');
      host.id = 'ispAuthNav';
      host.className = 'isp-auth-nav';
      navLinks.appendChild(host);
    }
    if (!CONFIG.enabled) { host.innerHTML = ''; return; }

    if (CONFIG.user) {
      const u = CONFIG.user;
      host.innerHTML = `
        <button class="isp-avatar" id="ispAvatar" title="${esc(u.email)}">${esc(initials(u))}</button>
        <div class="isp-menu" id="ispMenu">
          <div class="isp-me"><b>${esc(u.name || 'Signed in')}</b><span>${esc(u.email)}</span></div>
          <button id="ispHistoryBtn"><i class="fas fa-clock-rotate-left"></i> My history</button>
          <button id="ispLogoutBtn"><i class="fas fa-arrow-right-from-bracket"></i> Sign out</button>
        </div>`;
      const menu = host.querySelector('#ispMenu');
      host.querySelector('#ispAvatar').addEventListener('click', (e) => {
        e.stopPropagation(); menu.classList.toggle('open');
      });
      document.addEventListener('click', () => menu.classList.remove('open'));
      host.querySelector('#ispHistoryBtn').addEventListener('click', () => { menu.classList.remove('open'); openHistory(); });
      host.querySelector('#ispLogoutBtn').addEventListener('click', logout);
    } else {
      host.innerHTML = `<button class="isp-auth-btn" id="ispSignInBtn"><i class="fas fa-user"></i> Sign in</button>`;
      host.querySelector('#ispSignInBtn').addEventListener('click', () => openModal('login'));
    }
  }

  /* ── modal ── */
  function ensureModal() {
    let bg = document.getElementById('ispModalBg');
    if (bg) return bg;
    bg = document.createElement('div');
    bg.id = 'ispModalBg';
    bg.className = 'isp-modal-bg';
    bg.innerHTML = `
      <div class="isp-modal" role="dialog" aria-modal="true">
        <button class="isp-close" id="ispModalClose" aria-label="Close">&times;</button>
        <h3 id="ispModalTitle">Welcome back</h3>
        <p class="isp-sub">Save your fraud-check history to your account. Optional — analysis always works without an account.</p>
        <div class="isp-tabs">
          <button data-tab="login" class="active">Sign in</button>
          <button data-tab="register">Create account</button>
        </div>
        <form id="ispAuthForm">
          <div class="isp-field" id="ispNameField" style="display:none">
            <label>Name (optional)</label>
            <input type="text" id="ispName" autocomplete="name" />
          </div>
          <div class="isp-field">
            <label>Email</label>
            <input type="email" id="ispEmail" autocomplete="email" required />
          </div>
          <div class="isp-field">
            <label>Password</label>
            <input type="password" id="ispPassword" autocomplete="current-password" required minlength="8" />
          </div>
          <button type="submit" class="isp-submit" id="ispSubmit">Sign in</button>
          <p class="isp-err" id="ispErr"></p>
        </form>
        <div id="ispGoogleWrap" style="display:none">
          <div class="isp-or">or</div>
          <button class="isp-google" id="ispGoogleBtn">
            <svg width="17" height="17" viewBox="0 0 48 48"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>
            Continue with Google
          </button>
        </div>
      </div>`;
    document.body.appendChild(bg);

    bg.querySelector('#ispModalClose').addEventListener('click', closeModal);
    bg.addEventListener('click', (e) => { if (e.target === bg) closeModal(); });
    bg.querySelectorAll('.isp-tabs button').forEach((b) =>
      b.addEventListener('click', () => setTab(b.dataset.tab)));
    bg.querySelector('#ispAuthForm').addEventListener('submit', submitAuth);
    bg.querySelector('#ispGoogleBtn').addEventListener('click', () => { window.location.href = '/api/auth/google/start'; });
    return bg;
  }

  let currentTab = 'login';
  function setTab(tab) {
    currentTab = tab;
    const bg = document.getElementById('ispModalBg');
    bg.querySelectorAll('.isp-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    bg.querySelector('#ispModalTitle').textContent = tab === 'register' ? 'Create your account' : 'Welcome back';
    bg.querySelector('#ispNameField').style.display = tab === 'register' ? '' : 'none';
    bg.querySelector('#ispSubmit').textContent = tab === 'register' ? 'Create account' : 'Sign in';
    bg.querySelector('#ispPassword').setAttribute('autocomplete', tab === 'register' ? 'new-password' : 'current-password');
    bg.querySelector('#ispErr').textContent = '';
  }

  function openModal(tab) {
    const bg = ensureModal();
    bg.querySelector('#ispGoogleWrap').style.display = CONFIG.google ? '' : 'none';
    setTab(tab || 'login');
    bg.classList.add('open');
    setTimeout(() => bg.querySelector('#ispEmail').focus(), 60);
  }
  function closeModal() {
    const bg = document.getElementById('ispModalBg');
    if (bg) bg.classList.remove('open');
  }

  async function submitAuth(e) {
    e.preventDefault();
    const bg = document.getElementById('ispModalBg');
    const email = bg.querySelector('#ispEmail').value.trim();
    const password = bg.querySelector('#ispPassword').value;
    const name = bg.querySelector('#ispName').value.trim();
    const errEl = bg.querySelector('#ispErr');
    const submit = bg.querySelector('#ispSubmit');
    errEl.textContent = '';

    if (currentTab === 'register' && password.length < 8) {
      errEl.textContent = 'Password must be at least 8 characters.';
      return;
    }
    submit.disabled = true;
    const orig = submit.textContent;
    submit.textContent = 'Please wait…';
    try {
      const url = currentTab === 'register' ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        errEl.textContent = data.error || 'Something went wrong. Please try again.';
        return;
      }
      CONFIG.user = data.user;
      closeModal();
      renderNav();
      toast(currentTab === 'register' ? 'Account created — welcome!' : 'Signed in.');
    } catch {
      errEl.textContent = 'Network error. Please try again.';
    } finally {
      submit.disabled = false;
      submit.textContent = orig;
    }
  }

  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    CONFIG.user = null;
    renderNav();
    toast('Signed out.');
  }

  /* ── history panel ── */
  function ensurePanel() {
    let bg = document.getElementById('ispPanelBg');
    if (bg) return bg;
    bg = document.createElement('div');
    bg.id = 'ispPanelBg';
    bg.className = 'isp-panel-bg';
    bg.innerHTML = `
      <div class="isp-panel" role="dialog" aria-modal="true">
        <button class="isp-close" id="ispPanelClose" aria-label="Close">&times;</button>
        <h3><i class="fas fa-clock-rotate-left"></i> Your fraud-check history</h3>
        <div id="ispHistList"><div class="isp-empty">Loading…</div></div>
      </div>`;
    document.body.appendChild(bg);
    bg.querySelector('#ispPanelClose').addEventListener('click', () => bg.classList.remove('open'));
    bg.addEventListener('click', (e) => { if (e.target === bg) bg.classList.remove('open'); });
    return bg;
  }

  async function openHistory() {
    const bg = ensurePanel();
    bg.classList.add('open');
    const list = bg.querySelector('#ispHistList');
    list.innerHTML = '<div class="isp-empty">Loading…</div>';
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      if (!res.ok || !data.ok) {
        list.innerHTML = `<div class="isp-empty">${esc(data.error || 'Could not load history.')}</div>`;
        return;
      }
      const items = data.items || [];
      if (!items.length) {
        list.innerHTML = '<div class="isp-empty">No saved checks yet. Run an analysis while signed in and it will appear here.</div>';
        return;
      }
      list.innerHTML = items.map((it) => {
        const lvl = it.riskLevel || (it.status === 'done' ? '—' : 'Pending');
        const score = (typeof it.riskScore === 'number') ? `${it.riskScore}/100` : '—';
        const date = it.createdAt ? new Date(it.createdAt).toLocaleString() : '';
        const verdict = it.verdict || (it.status === 'done' ? 'Report ready' : 'In progress…');
        return `
          <div class="isp-hist-item">
            <span class="isp-pill" style="background:${riskColor(it.riskLevel)}22;color:${riskColor(it.riskLevel)}">${esc(lvl)} · ${esc(score)}</span>
            <div class="isp-hist-body">
              <div class="v">${esc(verdict)}</div>
              <div class="d">${esc(date)}</div>
            </div>
            <a class="isp-view" href="/?job=${encodeURIComponent(it.jobId)}">View</a>
          </div>`;
      }).join('');
    } catch {
      list.innerHTML = '<div class="isp-empty">Network error loading history.</div>';
    }
  }

  /* ── ?auth= redirect toast ── */
  function handleAuthParam() {
    const params = new URLSearchParams(window.location.search);
    const a = params.get('auth');
    if (!a) return;
    const MSGS = {
      signed_in: 'Signed in with Google.',
      cancelled: 'Google sign-in was cancelled.',
      state_mismatch: 'Sign-in expired or was invalid. Please try again.',
      google_failed: 'Google sign-in failed. Please try again.',
    };
    if (MSGS[a]) toast(MSGS[a]);
    params.delete('auth');
    const qs = params.toString();
    const clean = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
    window.history.replaceState({}, '', clean);
  }

  /* ── boot ── */
  async function init() {
    injectCss();
    try {
      const res = await fetch('/api/auth/config');
      if (res.ok) CONFIG = Object.assign(CONFIG, await res.json());
    } catch { /* auth unavailable — stay signed-out */ }
    renderNav();
    handleAuthParam();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
