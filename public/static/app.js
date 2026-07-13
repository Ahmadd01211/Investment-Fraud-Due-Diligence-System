/* InvestSafe Pro™ — frontend logic */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ── year ── */
  $('#year').textContent = new Date().getFullYear();

  /* ── nav scroll ── */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

  /* ── reveal on scroll ── */
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  const tagReveal = () => $$('.step,.sample-card,.flag-card,.faq-item,.band-head').forEach((el) => { if (!el.classList.contains('reveal')) { el.classList.add('reveal'); io.observe(el); } });

  /* ── parallax hero card (subtle 3D on mouse) ── */
  const heroCard = $('#heroCard');
  if (heroCard && window.matchMedia('(pointer:fine)').matches) {
    const wrap = heroCard.parentElement;
    wrap.addEventListener('mousemove', (e) => {
      const r = wrap.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      heroCard.style.animation = 'none';
      heroCard.style.transform = `rotateY(${-x * 16}deg) rotateX(${y * 14}deg) translateY(${-6}px)`;
    });
    wrap.addEventListener('mouseleave', () => { heroCard.style.animation = ''; heroCard.style.transform = ''; });
  }

  /* ── toast ── */
  let toastT;
  function toast(msg, type = 'ok') {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fas ${type === 'err' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i> ${esc(msg)}`;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 3600);
  }

  /* ── elements ── */
  const material = $('#material');
  const charCount = $('#charCount');
  const analyzeBtn = $('#analyzeBtn');
  const resultsEmpty = $('#resultsEmpty');
  const resultsLoading = $('#resultsLoading');
  const resultsContent = $('#resultsContent');
  const loadingMsg = $('#loadingMsg');

  const updateCount = () => { charCount.textContent = `${material.value.length.toLocaleString()} characters`; };
  material.addEventListener('input', updateCount); updateCount();

  /* ── file upload + drag/drop ── */
  const dropzone = $('#dropzone');
  const fileInput = $('#fileInput');
  const cameraInput = $('#cameraInput');
  const attachList = $('#attachList');

  /* attached images go to the vision backend; max 4 */
  const attachedImages = []; // { name, dataUrl }
  const MAX_IMAGES = 4;
  const MAX_FILE = 12 * 1024 * 1024; // 12 MB per file

  function fileKind(file) {
    const n = (file.name || '').toLowerCase();
    const t = (file.type || '').toLowerCase();
    if (t.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/.test(n)) return 'image';
    if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
    if (n.endsWith('.docx') || t.indexOf('officedocument.wordprocessing') !== -1) return 'docx';
    if (n.endsWith('.doc')) return 'doc';
    if (/\.(txt|md|csv|json|rtf|html?|log|tsv)$/.test(n) || t.startsWith('text/')) return 'text';
    return 'text'; // attempt text fallback
  }

  function readAsText(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result || ''));
      r.onerror = () => rej(new Error('read error'));
      r.readAsText(file);
    });
  }
  function readAsDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result || ''));
      r.onerror = () => rej(new Error('read error'));
      r.readAsDataURL(file);
    });
  }
  function readAsArrayBuffer(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('read error'));
      r.readAsArrayBuffer(file);
    });
  }

  async function extractPdf(file) {
    if (!window.pdfjsLib) throw new Error('PDF reader still loading — try again in a moment.');
    const buf = await readAsArrayBuffer(file);
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let out = '';
    const pages = Math.min(pdf.numPages, 2000);
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      out += content.items.map((it) => it.str).join(' ') + '\n\n';
      // The backend now handles unlimited size (chunk-and-merge, and Kimi 2.6's
      // 2M-token context for very large docs). Extract the full document up to a
      // generous safety cap so nothing meaningful is lost.
      if (out.length > 2000000) break;
    }
    return out.trim();
  }
  async function extractDocx(file) {
    if (!window.mammoth) throw new Error('Word reader still loading — try again in a moment.');
    const buf = await readAsArrayBuffer(file);
    const res = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return String(res.value || '').trim();
  }

  function appendToMaterial(text, label) {
    const t = String(text || '').trim();
    if (!t) return false;
    const prefix = material.value.trim() ? material.value.trimEnd() + '\n\n' : '';
    material.value = prefix + (label ? `--- ${label} ---\n` : '') + t;
    updateCount();
    return true;
  }

  function renderAttachList() {
    attachList.innerHTML = attachedImages.map((a, i) => `
      <div class="attach-chip" title="${esc(a.name)}">
        <img src="${a.dataUrl}" alt="" />
        <span>${esc(a.name.length > 22 ? a.name.slice(0, 20) + '…' : a.name)}</span>
        <button type="button" data-i="${i}" aria-label="Remove"><i class="fas fa-times"></i></button>
      </div>`).join('');
    attachList.classList.toggle('has', attachedImages.length > 0);
    $$('.attach-chip button', attachList).forEach((b) =>
      b.addEventListener('click', () => { attachedImages.splice(+b.dataset.i, 1); renderAttachList(); }));
  }

  async function handleFiles(fileList) {
    const files = [...fileList].filter(Boolean);
    if (!files.length) return;
    for (const file of files) {
      if (file.size > MAX_FILE) { toast(`"${file.name}" is too large (max 12 MB).`, 'err'); continue; }
      const kind = fileKind(file);
      try {
        if (kind === 'image') {
          if (attachedImages.length >= MAX_IMAGES) { toast(`You can attach up to ${MAX_IMAGES} images.`, 'err'); continue; }
          const dataUrl = await readAsDataURL(file);
          attachedImages.push({ name: file.name || 'image', dataUrl });
          renderAttachList();
          toast(`Attached image "${file.name}"`, 'ok');
        } else if (kind === 'pdf') {
          toast(`Reading PDF "${file.name}"…`, 'ok');
          const text = await extractPdf(file);
          if (text.length < 10) {
            // Likely a scanned/image PDF — offer to attach pages as image? Inform user.
            toast(`"${file.name}" has little selectable text — if it's a scanned PDF, attach a screenshot instead.`, 'err');
          } else {
            appendToMaterial(text, file.name);
            toast(`Loaded text from "${file.name}"`, 'ok');
          }
        } else if (kind === 'docx') {
          toast(`Reading Word doc "${file.name}"…`, 'ok');
          appendToMaterial(await extractDocx(file), file.name);
          toast(`Loaded "${file.name}"`, 'ok');
        } else if (kind === 'doc') {
          toast('.doc (old Word) isn\'t supported — please save as .docx or PDF, or paste the text.', 'err');
        } else {
          const text = await readAsText(file);
          appendToMaterial(text, file.name);
          toast(`Loaded "${file.name}"`, 'ok');
        }
      } catch (err) {
        toast(`Could not read "${file.name}". ${err.message || ''}`, 'err');
      }
    }
  }

  fileInput.addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
  cameraInput.addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop') handleFiles(e.dataTransfer.files); dropzone.classList.remove('drag'); }));

  // paste an image directly into the textarea (e.g. screenshot from clipboard)
  material.addEventListener('paste', (e) => {
    const items = (e.clipboardData || {}).items || [];
    const imgs = [...items].filter((it) => it.kind === 'file' && it.type.startsWith('image/'));
    if (imgs.length) { e.preventDefault(); handleFiles(imgs.map((it) => it.getAsFile())); }
  });

  /* ── clear ── */
  $('#clearBtn').addEventListener('click', () => {
    material.value = ''; updateCount();
    attachedImages.length = 0; renderAttachList();
    ['sponsorName', 'assetType', 'claimedReturn', 'amountAsked'].forEach((id) => { $('#' + id).value = ''; });
    $('#sourceType').value = '';
    showState('empty'); material.focus();
  });

  /* ── samples ── */
  const SAMPLES = [
    {
      cls: 'danger', tag: 'High risk', icon: 'fa-triangle-exclamation', title: 'The "guaranteed" real-estate fund',
      meta: { sponsorName: 'Sterling Capital Partners', assetType: 'Real-estate income fund', claimedReturn: '22% per year', amountAsked: '$25,000', sourceType: 'Facebook / Instagram ad' },
      text: `🚨 LAST CHANCE — Sterling Capital Income Fund 🚨\nEarn a GUARANTEED 22% annual return, completely RISK-FREE. Our fund has NEVER had a losing year and manages over $280M in assets. As seen on Facebook & local radio!\n\nNo experience needed. Refer a friend and BOTH of you get a $1,000 bonus. We invest our own money right alongside yours.\n\n⏰ Only 6 spots left — wire your $25,000 by Friday to lock in your bonus rate. Don't miss out on the opportunity of a lifetime!`
    },
    {
      cls: 'warn', tag: 'Worth checking', icon: 'fa-circle-question', title: 'The aggressive growth note',
      meta: { assetType: 'Private promissory notes', claimedReturn: '12-15%', sourceType: 'Email / newsletter' },
      text: `Introducing the Hargrove Yield Fund — private notes targeting 12–15% annual income, paid monthly. Backed by a diversified portfolio of commercial properties.\n\nWe're growing fast and constantly acquiring new buildings. Minimum investment $50,000. Accredited investors only. Distributions have been consistent since launch. Contact our team for the offering memorandum.`
    },
    {
      cls: 'safe', tag: 'Looks reasonable', icon: 'fa-circle-check', title: 'The disclosed, registered offering',
      meta: { assetType: 'Registered municipal bond fund', sourceType: 'Website / landing page' },
      text: `The Meridian Municipal Bond Fund (ticker: MERMX) is an SEC-registered open-end mutual fund. Current 30-day SEC yield: 3.4%. Past performance does not guarantee future results; the fund's value will fluctuate and you may lose money.\n\nFull prospectus, audited annual reports, expense ratio (0.45%), and a list of all holdings are available on our website and on SEC EDGAR. The fund is advised by a registered investment adviser (Form ADV on file).`
    }
  ];
  function loadSample(s) {
    material.value = s.text; updateCount();
    $('#sponsorName').value = s.meta.sponsorName || '';
    $('#assetType').value = s.meta.assetType || '';
    $('#claimedReturn').value = s.meta.claimedReturn || '';
    $('#amountAsked').value = s.meta.amountAsked || '';
    $('#sourceType').value = s.meta.sourceType || '';
    document.getElementById('analyze').scrollIntoView({ behavior: 'smooth' });
    toast('Sample loaded — hit Analyze', 'ok');
  }
  $('#sampleCards').innerHTML = SAMPLES.map((s, i) => `
    <button class="sample-card glass ${s.cls}" data-i="${i}" type="button">
      <div class="sc-tag"><i class="fas ${s.icon}"></i> ${esc(s.tag)}</div>
      <h4>${esc(s.title)}</h4>
      <p>${esc(s.text.replace(/\n+/g, ' '))}</p>
    </button>`).join('');
  $$('#sampleCards .sample-card').forEach((b) => b.addEventListener('click', () => loadSample(SAMPLES[+b.dataset.i])));
  $('#sampleBtn').addEventListener('click', () => loadSample(SAMPLES[0]));

  /* ── state switching ── */
  const EMPTY_DEFAULT_HTML = resultsEmpty.innerHTML;
  function showState(state) {
    resultsEmpty.hidden = state !== 'empty';
    resultsLoading.hidden = state !== 'loading';
    resultsContent.hidden = state !== 'content';
    // Restore the default empty-state prompt whenever we leave a notice.
    if (state !== 'empty') resultsEmpty.innerHTML = EMPTY_DEFAULT_HTML;
  }

  // Friendly "this isn't an investment" notice (replaces the empty-state prompt).
  function showNotice(title, message) {
    resultsEmpty.innerHTML = `
      <div class="empty-ico notice"><i class="fas fa-circle-exclamation"></i></div>
      <h3>${esc(title)}</h3>
      <p>${esc(message)}</p>
      <button class="mini-btn" type="button" id="noticeOk"><i class="fas fa-rotate-left"></i> Try a different submission</button>`;
    resultsEmpty.hidden = false;
    resultsLoading.hidden = true;
    resultsContent.hidden = true;
    const ok = $('#noticeOk');
    if (ok) ok.addEventListener('click', () => { resultsEmpty.innerHTML = EMPTY_DEFAULT_HTML; material.focus(); });
  }

  /* ── analyze ── */
  const LOAD_MSGS = ['Reading the document…', 'Extracting the promoter\'s claims…', 'Checking 21 fraud patterns…', 'Cross-referencing with known schemes…', 'Building your report…'];
  let msgTimer;
  function cycleMsgs() { let i = 0; loadingMsg.textContent = LOAD_MSGS[0]; msgTimer = setInterval(() => { i = (i + 1) % LOAD_MSGS.length; loadingMsg.textContent = LOAD_MSGS[i]; }, 1700); }

  async function analyze() {
    const text = material.value.trim();
    if (text.length < 30 && attachedImages.length === 0) {
      toast('Please paste at least a few sentences — or attach a document or image — to analyze.', 'err');
      material.focus();
      return;
    }
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing…';
    showState('loading'); cycleMsgs();
    document.getElementById('analyze').scrollIntoView({ behavior: 'smooth', block: 'start' });

    const meta = {
      sponsorName: $('#sponsorName').value.trim(),
      assetType: $('#assetType').value.trim(),
      claimedReturn: $('#claimedReturn').value.trim(),
      amountAsked: $('#amountAsked').value.trim(),
      sourceType: $('#sourceType').value.trim(),
    };
    const images = attachedImages.map((a) => a.dataUrl);

    // Handle the "not an investment" and generic error shapes the same way for
    // both the one-shot and chunked paths.
    const handleErr = (data, res) => {
      if (data && data.error === 'invalid_submission') {
        showState('empty');
        showNotice(data.title || "This doesn't look like an investment", data.message || 'Please submit an investment offering, pitch, ad, email, or document.');
        toast('Not an investment — nothing to analyze', 'err');
        return true; // handled
      }
      if (!res.ok || (data && data.error)) {
        throw new Error((data && (data.message || data.error)) || 'Analysis failed.');
      }
      return false;
    };

    try {
      // Ask the server whether this document needs the multi-chunk pipeline.
      // Images always go single-shot (one vision call).
      let plan = { needsChunking: false, totalChunks: 1 };
      if (images.length === 0 && text.length > 0) {
        try {
          const pr = await fetch('/api/chunk-plan?len=' + text.length);
          if (pr.ok) plan = await pr.json();
        } catch { /* fall back to single-shot */ }
      }

      let result;
      if (!plan.needsChunking) {
        // ── SINGLE SHOT (small doc or images) ── unchanged behaviour ──
        const res = await fetch('/api/analyze', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ material: text, images, ...meta }),
        });
        const data = await res.json();
        if (handleErr(data, res)) return;
        result = data.result;
      } else {
        // ── LARGE DOC: browser-driven chunk pipeline ──
        // 1) server splits authoritatively → 2) analyze each chunk (short
        //    requests) → 3) merge server-side. Live progress in loadingMsg.
        clearInterval(msgTimer); // stop the generic cycling messages
        const sres = await fetch('/api/split', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ material: text }),
        });
        const sdata = await sres.json();
        if (!sres.ok || sdata.error) throw new Error(sdata.error || 'Could not prepare the document.');
        const chunks = sdata.chunks || [];
        const carryChars = Number(sdata.carryover) || 0;
        const total = chunks.length;

        const results = [];
        let carryover = '';
        let acc = '';
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let i = 0; i < total; i++) {
          const pct = Math.round((i / total) * 100);
          loadingMsg.textContent = `Analyzing large document — part ${i + 1} of ${total}… (${pct}%)`;

          // Each chunk is a short request. Retry transient rate-limit / busy
          // responses (429/503) with exponential backoff so a big document
          // doesn't fail just because chunks were sent close together.
          const MAX_RETRIES = 4;
          let data = null, res = null, done = false;
          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            res = await fetch('/api/analyze-chunk', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chunk: chunks[i],
                chunkIndex: i,
                totalChunks: total,
                carryover,
                images: i === 0 ? images : [], // only first chunk carries images
                ...meta,
              }),
            });
            data = await res.json();
            if (res.status === 429 || res.status === 503) {
              if (attempt < MAX_RETRIES) {
                // Honor the server's retry-after hint (from OpenAI's TPM
                // window) when present; otherwise exponential backoff.
                const hint = Number(data && data.retryAfter) || 0;
                const backoff = Math.round(2000 * Math.pow(2, attempt)); // 2s,4s,8s,16s
                const wait = Math.max(hint * 1000 + 500, backoff);
                loadingMsg.textContent =
                  `Analyzing large document — part ${i + 1} of ${total}… (service busy, retrying in ${Math.round(wait / 1000)}s)`;
                await sleep(wait);
                continue;
              }
            }
            done = true;
            break;
          }

          // A single chunk being "not an investment" shouldn't abort the whole
          // doc — the merge step applies the majority relevance gate.
          if (!res.ok && data && data.error !== 'invalid_submission') {
            throw new Error((data && (data.message || data.error)) || `Analysis failed on part ${i + 1}.`);
          }
          if (data && data.result) results.push(data.result);

          // Gentle pacing between chunks to stay under provider rate limits.
          if (i < total - 1) await sleep(600);

          // Carryover for the NEXT chunk = last `carryChars` chars seen so far
          // (mirrors the server's carryover threading exactly).
          acc = (acc + '\n' + chunks[i]);
          carryover = carryChars > 0 ? acc.slice(-carryChars) : '';
        }

        if (results.length === 0) {
          throw new Error('The analysis service was busy and no parts could be analyzed. Please try again in a minute.');
        }

        loadingMsg.textContent = 'Combining findings into your final report…';
        const mres = await fetch('/api/merge', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ results }),
        });
        const mdata = await mres.json();
        if (handleErr(mdata, mres)) return;
        result = mdata.result;
      }

      renderResult(result);
      showState('content');
      toast('Report ready', 'ok');
    } catch (err) {
      showState('empty');
      toast(err.message || 'Something went wrong. Please try again.', 'err');
    } finally {
      clearInterval(msgTimer);
      analyzeBtn.disabled = false;
      analyzeBtn.innerHTML = '<i class="fas fa-magnifying-glass-chart"></i> Analyze for fraud risk';
    }
  }
  analyzeBtn.addEventListener('click', analyze);

  /* ── render result ── */
  const levelColor = { Low: 'var(--green)', Medium: 'var(--gold)', High: '#f57823', Critical: 'var(--red)' };
  const tierClass = (t) => t === 'GAP' ? 'tier-gap' : 'tier-' + (String(t).match(/\d/) || ['2'])[0];
  let lastResult = null;
  function renderResult(r) {
    lastResult = r;
    const c = levelColor[r.riskLevel] || 'var(--blue)';
    const flagsHtml = (r.triggeredFlags || []).length
      ? r.triggeredFlags.map((f) => {
        const isGap = f.evidenceTier === 'GAP';
        return `
        <div class="flag-row ${isGap ? 'is-gap' : ''}" style="border-left-color:${isGap ? 'var(--muted-2)' : c}">
          <div class="fr-top">
            <span class="fr-name">#${f.n} · ${esc(f.name)}</span>
            <span class="fr-tier ${tierClass(f.evidenceTier)}">${esc(f.evidenceTier)}</span>
            <span class="fr-sev">${isGap ? '0 pts' : 'Sev ' + f.severity + ' · ' + f.weightedPoints + ' pts'}</span>
          </div>
          ${f.evidence ? `<div class="fr-ev">${isGap ? '<i class="fas fa-circle-question"></i> Missing: ' : '“'}${esc(f.evidence)}${isGap ? '' : '”'}</div>` : ''}
          <div class="fr-ex">${esc(f.explanation)}</div>
        </div>`;
      }).join('')
      : `<div class="no-flags"><i class="fas fa-circle-check"></i> No major fraud red flags were detected in this material. Still verify independently before investing.</div>`;

    // Explainable score breakdown table
    const sb = r.scoreBreakdown || {};
    const scoredFlags = (r.triggeredFlags || []).filter((f) => f.evidenceTier !== 'GAP');
    const breakdownHtml = scoredFlags.length ? `
      <table class="score-table">
        <thead><tr><th>#</th><th>Flag</th><th>Wt</th><th>Sev</th><th>Tier</th><th>Pts</th></tr></thead>
        <tbody>
          ${scoredFlags.map((f) => `<tr${(sb.keyDrivers || []).includes(f.n) ? ' class="driver"' : ''}>
            <td>${f.n}</td><td>${esc(f.name)}</td><td>${f.weight}</td><td>${f.severity}</td>
            <td><span class="fr-tier ${tierClass(f.evidenceTier)}">${esc(f.evidenceTier)}</span></td><td><b>${f.weightedPoints}</b></td></tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="5">Total weighted points ÷ max possible × 100</td>
          <td><b>${sb.totalWeightedPoints ?? 0}/${sb.maxPossiblePoints ?? 0}</b></td></tr></tfoot>
      </table>
      <div class="score-calc">${sb.totalWeightedPoints ?? 0} ÷ ${sb.maxPossiblePoints ?? 0} × 100 = <b>${r.riskScore}/100</b>
        ${(sb.keyDrivers || []).length ? ` · Key drivers: ${sb.keyDrivers.map((n) => '#' + n).join(', ')}` : ''}</div>` : '';

    const claimsHtml = (r.extractedClaims || []).map((x) => `
      <div class="kv-row">
        <span class="kv-tag">${esc(x.type || 'Claim')}</span>
        <div class="kv-body"><div class="kv-main">${esc(x.claim)}</div>${x.concern ? `<div class="kv-sub">${esc(x.concern)}</div>` : ''}</div>
      </div>`).join('');

    const contraHtml = (r.contradictions || []).map((x) => `
      <div class="kv-row">
        <span class="kv-tag" style="color:#ff8a8a;background:rgba(232,85,85,.12)">Claim</span>
        <div class="kv-body"><div class="kv-main">${esc(x.claim)}</div>
          <div class="kv-sub reality"><i class="fas fa-arrow-right"></i> ${esc(x.reality)}</div>
          ${x.note ? `<div class="kv-sub">${esc(x.note)}</div>` : ''}</div>
      </div>`).join('');

    const verifyHtml = (r.verifyNext || []).map((x) => `
      <div class="kv-row">
        <span class="kv-tag"><i class="fas fa-check"></i></span>
        <div class="kv-body"><div class="kv-main">${esc(x.action)}</div>${x.where ? `<div class="kv-sub">${esc(x.where)}</div>` : ''}</div>
      </div>`).join('');

    resultsContent.innerHTML = `
      <div class="res-hero">
        <div class="res-ring" id="resRing" style="--c:${c}">
          <div class="res-ring-in"><span class="res-ring-num" id="resNum">0</span><span class="res-ring-max">/ 100 risk</span></div>
        </div>
        <div>
          <span class="res-level lvl-${esc(r.riskLevel)}">${esc((r.riskLevel || '').toUpperCase())} RISK</span>
          <div class="res-verdict">${esc(r.verdict)}</div>
        </div>
      </div>
      <p class="res-summary">${esc(r.summary)}</p>

      <div class="res-section">
        <h4><i class="fas fa-flag" style="color:${c}"></i> Red flags found <span class="pilln">${(r.triggeredFlags || []).length} of 21</span></h4>
        ${flagsHtml}
      </div>

      ${breakdownHtml ? `<details class="res-section breakdown-details"><summary><i class="fas fa-calculator" style="color:var(--teal)"></i> How this score was calculated</summary>${breakdownHtml}</details>` : ''}

      ${claimsHtml ? `<div class="res-section"><h4><i class="fas fa-comment-dollar" style="color:var(--gold)"></i> Claims to verify</h4>${claimsHtml}</div>` : ''}
      ${contraHtml ? `<div class="res-section"><h4><i class="fas fa-not-equal" style="color:var(--red)"></i> Possible contradictions</h4>${contraHtml}</div>` : ''}
      ${verifyHtml ? `<div class="res-section"><h4><i class="fas fa-list-check" style="color:var(--teal)"></i> What to do next</h4>${verifyHtml}</div>` : ''}

      <div class="res-section">
        <div class="advice-box">
          <div class="ab-h"><i class="fas fa-lightbulb"></i> Plain-English advice</div>
          ${esc(r.investorAdvice)}
        </div>
      </div>

      <div class="res-actions">
        <button class="btn btn-ghost" id="copyBtn"><i class="fas fa-copy"></i> Copy report</button>
        <button class="btn btn-ghost" id="printBtn"><i class="fas fa-print"></i> Print / Save PDF</button>
        <button class="btn btn-primary" id="againBtn"><i class="fas fa-rotate-right"></i> Check another</button>
      </div>

      <p class="res-disclaimer"><i class="fas fa-circle-info"></i> ${esc(r.disclaimer)}</p>`;

    // animate the score ring + number
    requestAnimationFrame(() => {
      const ring = $('#resRing'); const num = $('#resNum');
      let cur = 0; const target = r.riskScore;
      ring.style.setProperty('--p', target);
      const step = Math.max(1, Math.round(target / 32));
      const t = setInterval(() => { cur = Math.min(target, cur + step); num.textContent = cur; if (cur >= target) clearInterval(t); }, 22);
    });

    $('#copyBtn').addEventListener('click', () => copyReport(r));
    $('#printBtn').addEventListener('click', () => printReport(r));
    $('#againBtn').addEventListener('click', () => { showState('empty'); material.focus(); document.getElementById('analyze').scrollIntoView({ behavior: 'smooth' }); });
  }

  function reportText(r) {
    const sb = r.scoreBreakdown || {};
    let t = `INVESTSAFE PRO — FRAUD RISK REPORT\n`;
    t += `Generated: ${new Date(r.analyzedAt || Date.now()).toLocaleString()}\n`;
    t += `\nRISK SCORE: ${r.riskScore}/100 (${r.riskLevel})\n`;
    t += `SCORE BASIS: ${sb.totalWeightedPoints ?? 0} ÷ ${sb.maxPossiblePoints ?? 0} × 100\n`;
    t += `VERDICT: ${r.verdict}\n\n${r.summary}\n`;
    t += `\nRED FLAGS FOUND (${(r.triggeredFlags || []).length}):\n`;
    (r.triggeredFlags || []).forEach((f) => {
      t += f.evidenceTier === 'GAP'
        ? `  • #${f.n} ${f.name} [SOURCE GAP — 0 pts]\n    ${f.explanation}\n`
        : `  • #${f.n} ${f.name} (sev ${f.severity}/10, ${f.evidenceTier}, ${f.weightedPoints} pts)\n    ${f.explanation}\n`;
    });
    if ((r.contradictions || []).length) { t += `\nPOSSIBLE CONTRADICTIONS:\n`; r.contradictions.forEach((x) => t += `  • ${x.claim} → ${x.reality}\n`); }
    if ((r.verifyNext || []).length) { t += `\nWHAT TO DO NEXT:\n`; r.verifyNext.forEach((x) => t += `  • ${x.action}${x.where ? ' (' + x.where + ')' : ''}\n`); }
    t += `\nADVICE:\n${r.investorAdvice}\n\n${r.disclaimer}`;
    return t;
  }
  function copyReport(r) {
    const t = reportText(r);
    navigator.clipboard.writeText(t).then(() => toast('Report copied to clipboard', 'ok')).catch(() => toast('Could not copy.', 'err'));
  }
  function printReport(r) {
    const w = window.open('', '_blank');
    if (!w) { toast('Allow pop-ups to print.', 'err'); return; }
    const sb = r.scoreBreakdown || {};
    const flags = (r.triggeredFlags || []).map((f) => f.evidenceTier === 'GAP'
      ? `<li><b>#${f.n} ${esc(f.name)}</b> — <i>source gap (0 pts)</i>. ${esc(f.explanation)}</li>`
      : `<li><b>#${f.n} ${esc(f.name)}</b> — severity ${f.severity}/10, ${esc(f.evidenceTier)}, ${f.weightedPoints} pts. ${esc(f.explanation)}</li>`).join('');
    w.document.write(`<html><head><title>InvestSafe Pro Report</title><style>
      body{font-family:Inter,Arial,sans-serif;max-width:760px;margin:30px auto;padding:0 24px;color:#1a2035;line-height:1.6}
      h1{font-size:22px}.score{font-size:40px;font-weight:900}.lvl{font-weight:800}
      .box{border:1px solid #ddd;border-radius:10px;padding:16px;margin:16px 0}
      li{margin-bottom:8px}.muted{color:#777;font-size:12px}</style></head><body>
      <h1>🛡️ InvestSafe Pro™ — Fraud Risk Report</h1>
      <p class="muted">Generated ${new Date(r.analyzedAt || Date.now()).toLocaleString()}</p>
      <div class="box"><div class="score">${r.riskScore}/100</div><div class="lvl">${esc(r.riskLevel)} risk</div>
        <p class="muted">Score: ${sb.totalWeightedPoints ?? 0} ÷ ${sb.maxPossiblePoints ?? 0} × 100</p>
        <p>${esc(r.verdict)}</p><p>${esc(r.summary)}</p></div>
      <h3>Red flags found (${(r.triggeredFlags || []).length})</h3><ul>${flags || '<li>None detected.</li>'}</ul>
      <h3>Advice</h3><p>${esc(r.investorAdvice)}</p>
      <p class="muted">${esc(r.disclaimer)}</p></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 350);
  }

  /* ── flag framework grid ── */
  fetch('/api/framework').then((r) => r.json()).then((d) => {
    const wc = (w) => (w >= 9 ? 'w-hi' : w >= 7 ? 'w-mid' : 'w-lo');
    $('#flagGrid').innerHTML = (d.flags || []).map((f) => `
      <div class="flag-card">
        <span class="fc-n">FLAG ${f.n}</span><span class="fc-w ${wc(f.weight)}">weight ${f.weight}</span>
        <h4>${esc(f.name)}</h4>
      </div>`).join('');
    tagReveal();
  }).catch(() => {});

  /* ── FAQ ── */
  const FAQ = [
    { q: 'Do I need an account, API key, or any setup?', a: 'No. Nothing to install, no sign-up, and no API keys. Just paste the investment material and click Analyze — the AI runs entirely on our servers.' },
    { q: 'Is it really free?', a: 'Yes, you can run fraud checks for free. It is designed for everyday investors who want a second opinion before risking their savings.' },
    { q: 'What can I paste in?', a: 'Anything a promoter sent you: a Facebook or Instagram ad, an email, a text/WhatsApp message, a webinar transcript, a website\'s pitch, or the text from a pitch deck / PPM document. You can also drag-and-drop a .txt file.' },
    { q: 'Do you store my documents?', a: 'No. Your text is sent securely to the analysis engine to produce your report and is not saved on our servers. For sensitive documents, you can remove names before pasting.' },
    { q: 'How accurate is it?', a: 'The engine checks the language and structure of the pitch against 21 fraud patterns drawn from real SEC enforcement cases. It is a powerful early-warning tool — but it is not legal or financial advice. Always confirm with primary sources (SEC EDGAR, FINRA BrokerCheck, county records) and a licensed professional.' },
    { q: 'It flagged a real, legitimate investment. Why?', a: 'Some legitimate offerings use aggressive marketing language that overlaps with fraud patterns. A flag means "verify this," not "this is definitely fraud." Use the "What to do next" steps to confirm.' },
  ];
  $('#faqList').innerHTML = FAQ.map((f) => `
    <details class="faq-item">
      <summary>${esc(f.q)} <i class="fas fa-plus fq-i"></i></summary>
      <div class="fq-body">${esc(f.a)}</div>
    </details>`).join('');

  tagReveal();
})();
