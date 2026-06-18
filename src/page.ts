// Server-rendered home page (single-file HTML string).
export function HomePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="description" content="InvestSafe Pro — paste any investment pitch, ad, or document and get an instant, plain-English fraud risk report. No accounts, no API keys, no jargon." />
<title>InvestSafe Pro™ — Instant Investment Fraud Check</title>
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
  <a class="brand" href="#top">
    <span class="brand-badge"><i class="fas fa-shield-halved"></i></span>
    <span class="brand-text">
      <span class="brand-main">InvestSafe<span class="brand-tm">Pro™</span></span>
      <span class="brand-sub">Fraud Due-Diligence</span>
    </span>
  </a>
  <nav class="nav-links">
    <a href="#how">How it works</a>
    <a href="#methodology">Methodology</a>
    <a href="#faq">FAQ</a>
    <a class="nav-cta" href="#analyze"><i class="fas fa-magnifying-glass-chart"></i> Check a pitch</a>
  </nav>
</header>

<main id="top">

  <!-- ───────────── HERO ───────────── -->
  <section class="hero">
    <div class="hero-inner">
      <div class="hero-pill"><span class="dot"></span> Powered by forensic AI · No sign-up · 100% free to try</div>
      <h1 class="hero-title">
        Is that investment <span class="grad">too good to be true?</span><br />
        Find out in <span class="grad-2">30 seconds.</span>
      </h1>
      <p class="hero-lead">
        Paste any investment pitch, advertisement, email, or pitch deck. Our AI scans it against a
        <strong>21-point fraud-detection framework</strong> built on real SEC enforcement cases — and gives you a
        clear, plain-English risk report. No finance degree, no API keys, no jargon.
      </p>
      <div class="hero-actions">
        <a href="#analyze" class="btn btn-primary btn-lg"><i class="fas fa-shield-check"></i> Check it for free</a>
        <a href="#sample" class="btn btn-ghost btn-lg"><i class="fas fa-wand-magic-sparkles"></i> Try a sample</a>
      </div>
      <div class="hero-trust">
        <div class="trust-item"><i class="fas fa-lock"></i> We never store your documents</div>
        <div class="trust-item"><i class="fas fa-bolt"></i> Results in seconds</div>
        <div class="trust-item"><i class="fas fa-user-shield"></i> Built for everyday investors</div>
      </div>
    </div>

    <!-- floating glass preview card -->
    <div class="hero-card-wrap">
      <div class="float-card glass tilt" id="heroCard">
        <div class="fc-head">
          <span class="fc-dot r"></span><span class="fc-dot y"></span><span class="fc-dot g"></span>
          <span class="fc-title">Risk Report</span>
        </div>
        <div class="fc-score">
          <div class="ring" style="--p:88;--c:var(--red)">
            <div class="ring-inner"><span class="ring-num">88</span><span class="ring-lbl">/100</span></div>
          </div>
          <div class="fc-verdict">
            <span class="fc-level crit">CRITICAL RISK</span>
            <p>"Guaranteed 22% returns" + mass Facebook ads + no PPM = classic fraud signature.</p>
          </div>
        </div>
        <div class="fc-flags">
          <div class="fc-flag"><i class="fas fa-flag"></i> Guaranteed / risk-free language</div>
          <div class="fc-flag"><i class="fas fa-flag"></i> IRR in "Buffett-Shame Zone"</div>
          <div class="fc-flag"><i class="fas fa-flag"></i> Mass social-media advertising</div>
        </div>
      </div>
      <div class="float-chip chip-1 glass"><i class="fas fa-flag"></i> 21 fraud signals</div>
      <div class="float-chip chip-2 glass"><i class="fas fa-file-shield"></i> SEC-case based</div>
    </div>
  </section>

  <!-- ───────────── HOW IT WORKS ───────────── -->
  <section id="how" class="band">
    <div class="band-head">
      <span class="kicker">Dead simple</span>
      <h2>Three steps. Zero expertise required.</h2>
      <p>You don't need to know anything about finance, coding, or "API keys." Just bring the pitch.</p>
    </div>
    <div class="steps">
      <div class="step glass tilt-sm">
        <div class="step-num">1</div>
        <div class="step-ico"><i class="fas fa-paste"></i></div>
        <h3>Paste or upload</h3>
        <p>Drop in the email, ad copy, WhatsApp message, or upload the pitch deck / PPM as a text or PDF-text file.</p>
      </div>
      <div class="step glass tilt-sm">
        <div class="step-num">2</div>
        <div class="step-ico"><i class="fas fa-microchip"></i></div>
        <h3>We analyze it</h3>
        <p>Our forensic AI reads it like a fraud investigator — checking 21 known red-flag patterns from real cases.</p>
      </div>
      <div class="step glass tilt-sm">
        <div class="step-num">3</div>
        <div class="step-ico"><i class="fas fa-file-circle-check"></i></div>
        <h3>Get a clear report</h3>
        <p>A risk score, the exact warning signs found, what to verify next, and plain-English advice on what to do.</p>
      </div>
    </div>
  </section>

  <!-- ───────────── ANALYZER ───────────── -->
  <section id="analyze" class="analyzer">
    <div class="band-head">
      <span class="kicker">The check</span>
      <h2>Run a free fraud check</h2>
      <p>Paste the investment material below. The more you include, the better the analysis.</p>
    </div>

    <div class="analyzer-grid">
      <!-- input -->
      <div class="panel glass" id="inputPanel">
        <div class="dropzone" id="dropzone">
          <textarea id="material" placeholder="Paste the investment pitch, advertisement, email, or document text here…

Example: 'Earn a GUARANTEED 22% annual return with our real-estate fund. Featured on Facebook & local radio. Limited spots — wire by Friday to lock in your bonus!'"></textarea>
          <div class="dz-overlay" id="dzOverlay"><i class="fas fa-file-arrow-up"></i><span>Drop a .txt / .md / .csv file to analyze</span></div>
        </div>

        <div class="dz-actions">
          <label class="mini-btn" for="fileInput"><i class="fas fa-paperclip"></i> Attach a text file</label>
          <input type="file" id="fileInput" accept=".txt,.md,.csv,.json,text/plain" hidden />
          <button class="mini-btn" id="sampleBtn" type="button"><i class="fas fa-flask"></i> Load sample pitch</button>
          <button class="mini-btn danger" id="clearBtn" type="button"><i class="fas fa-eraser"></i> Clear</button>
          <span class="char-count" id="charCount">0 characters</span>
        </div>

        <details class="more-details">
          <summary><i class="fas fa-sliders"></i> Add optional details (improves accuracy)</summary>
          <div class="detail-grid">
            <label>Promoter / company name<input type="text" id="sponsorName" placeholder="e.g. Sterling Capital Partners" /></label>
            <label>What are they selling?<input type="text" id="assetType" placeholder="e.g. real-estate fund, crypto, notes" /></label>
            <label>Promised return / IRR<input type="text" id="claimedReturn" placeholder="e.g. 22% per year" /></label>
            <label>Minimum investment<input type="text" id="amountAsked" placeholder="e.g. $25,000" /></label>
            <label class="full">Where did you see this?
              <select id="sourceType">
                <option value="">Choose…</option>
                <option>Facebook / Instagram ad</option>
                <option>Email / newsletter</option>
                <option>Text / WhatsApp message</option>
                <option>Radio / TV / podcast</option>
                <option>Webinar / seminar</option>
                <option>Pitch deck / PPM document</option>
                <option>Friend / family referral</option>
                <option>Website / landing page</option>
                <option>Other</option>
              </select>
            </label>
          </div>
        </details>

        <button class="btn btn-primary btn-block btn-lg" id="analyzeBtn" type="button">
          <i class="fas fa-magnifying-glass-chart"></i> Analyze for fraud risk
        </button>
        <p class="micro-note"><i class="fas fa-lock"></i> Processed securely. We do not save your text.</p>
      </div>

      <!-- output -->
      <div class="panel glass results-panel" id="resultsPanel">
        <div class="results-empty" id="resultsEmpty">
          <div class="empty-ico"><i class="fas fa-shield-halved"></i></div>
          <h3>Your report will appear here</h3>
          <p>Paste a pitch on the left and hit <strong>Analyze</strong>. You'll get a risk score, the specific red flags found, and what to do next.</p>
        </div>

        <div class="results-loading" id="resultsLoading" hidden>
          <div class="scanner"><i class="fas fa-fingerprint"></i></div>
          <h3 id="loadingMsg">Reading the document…</h3>
          <p>Our forensic AI is checking 21 fraud patterns.</p>
          <div class="load-bar"><span></span></div>
        </div>

        <div class="results-content" id="resultsContent" hidden></div>
      </div>
    </div>
  </section>

  <!-- ───────────── SAMPLE STRIP ───────────── -->
  <section id="sample" class="samples band">
    <div class="band-head">
      <span class="kicker">Not sure what to paste?</span>
      <h2>Try one of these</h2>
      <p>Click a sample to load it, then hit Analyze.</p>
    </div>
    <div class="sample-cards" id="sampleCards"></div>
  </section>

  <!-- ───────────── METHODOLOGY ───────────── -->
  <section id="methodology" class="band">
    <div class="band-head">
      <span class="kicker">What we look for</span>
      <h2>The 21-flag fraud framework</h2>
      <p>Built on Barry Minkow's documented investigative methodology and patterns from real SEC enforcement cases. Each flag carries a weight — bigger weight, bigger danger.</p>
    </div>
    <div class="flag-grid" id="flagGrid"></div>
  </section>

  <!-- ───────────── FAQ ───────────── -->
  <section id="faq" class="band">
    <div class="band-head">
      <span class="kicker">Good to know</span>
      <h2>Frequently asked questions</h2>
    </div>
    <div class="faq-list" id="faqList"></div>
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
      InvestSafe Pro is an educational due-diligence aid, not legal, investment, or financial advice. It analyzes the
      language and structure of what a promoter presents and does not make factual claims about any specific named
      person or company. Always verify with primary sources (SEC EDGAR, FINRA BrokerCheck, county records) and consult a
      licensed professional before investing.
    </p>
    <p class="footer-copy">© <span id="year"></span> InvestSafe Pro™ · Inspired by Barry Minkow methodologies &amp; real case filings</p>
  </div>
</footer>

<script src="/static/app.js"></script>
</body>
</html>`
}
