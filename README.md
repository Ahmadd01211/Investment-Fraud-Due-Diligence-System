# InvestSafe Pro™ — Instant Investment Fraud Check

**Equipping investors. Leveling the playing field.**

A dead-simple, beautifully designed web app that lets *anyone* — no finance degree, no
coding, no API keys — paste an investment pitch, ad, email, or document and get an instant,
plain-English **fraud-risk report**. The AI analysis runs entirely on the server using a
managed API key, so users never have to bring their own.

## Project Overview
- **Name**: InvestSafe Pro™
- **Goal**: Help everyday investors spot investment fraud *before* they commit capital, using a
  forensic 21-flag framework drawn from real SEC enforcement cases and Barry Minkow's documented
  investigative methodology.
- **Audience**: Non-technical individual investors (also useful for lenders, underwriters,
  family offices).
- **Design**: 3D / floating "glassmorphism" UI — animated background orbs, parallax glass cards,
  conic-gradient risk rings, smooth reveal-on-scroll animations.

## Key Features (completed)
- **One-box fraud check** — paste pitch text, **attach files**, or **take a photo**.
- **Attach almost anything** — drag-and-drop or pick: **PDF** (text auto-extracted in-browser via
  PDF.js), **images / screenshots** (JPG, PNG, WEBP, GIF, BMP, HEIC — analyzed by a vision model),
  **Word** `.docx` (extracted via Mammoth.js), and text files (`.txt/.md/.csv/.json/.rtf/.html`).
  You can also **paste a screenshot** straight into the box, or use **Take photo** on mobile.
  Up to 4 images per submission; up to 12 MB per file.
- **Optional detail fields** — promoter name, asset type, promised return, minimum, source — all
  optional, all improve accuracy.
- **Server-side AI analysis (NO BYOK)** — uses a managed OpenAI-compatible key on the backend.
  Users never see or enter an API key.
- **21-flag forensic framework** — every submission is scored against 21 weighted fraud patterns
  using the **official InvestSafe Pro explainable scoring formula** (see below).
- **Explainable score breakdown** — an expandable table showing Flag # | Name | Weight | Severity |
  Evidence Tier | Weighted Points, the exact calculation, and the key score drivers.

### Official Scoring Methodology (matches the original IIE engine)
- Each triggered flag gets a **severity (1–10)** and an **Evidence Tier**:
  - **Tier 1** – primary-source proof · **Tier 2** – the promoter's own quoted language ·
    **Tier 3 / Tier 4** – weaker / inferred evidence · **GAP** – the flag is suspected but the
    required evidence is *missing* from what was provided.
- **Evidence-Tier cap rule**: Tier 3/4 caps severity at 5; **GAP items score 0 points** (they are
  listed as "source gaps" but never inflate the score).
- **weightedPoints = round(weight × severity ÷ 10)**.
- **riskScore = totalWeightedPoints ÷ maxPossiblePoints × 100**, where `maxPossiblePoints` is the
  full weight of every triggered non-GAP flag (i.e. as if each were severity 10).
- **riskLevel**: 0–24 Low · 25–49 Medium · 50–74 High · 75–100 Critical.
- The score is **re-computed authoritatively on the server**, so the displayed number always
  exactly matches the formula regardless of model output.
- **Plain-English report** with:
  - Animated 0–100 **risk score** + Low / Medium / High / **Critical** level
  - One-sentence **verdict** + short summary
  - **Red flags found** (with the exact evidence quote + why it matters)
  - **Claims to verify** and **possible contradictions**
  - **What to do next** (concrete verification steps + where)
  - **Plain-English advice** written for someone with zero finance background
  - **Copy report** and **Print / Save-PDF** buttons
- **Three built-in samples** (high-risk scam, "worth checking", legitimate fund) to try instantly.
- **Methodology section** showing all 21 flags and their weights.
- **FAQ** that reassures non-technical users (no account, no key, privacy, accuracy).
- **Privacy-first** — submitted text is sent to the analysis engine to produce the report and is
  **not stored** on the server.

## Functional Entry Points (URIs)
| Method | Path | Purpose | Params |
|---|---|---|---|
| `GET` | `/` | The full single-page app (hero, analyzer, samples, methodology, FAQ) | — |
| `POST` | `/api/analyze` | Run a fraud analysis | JSON body: `material` (required, ≥30 chars), `sponsorName?`, `assetType?`, `claimedReturn?`, `amountAsked?`, `sourceType?` |
| `GET` | `/api/framework` | Returns the 21-flag framework (used by the methodology grid) | — |

**`/api/analyze` response shape:** `{ ok: true, result: { riskScore, riskLevel, verdict, summary, triggeredFlags[], extractedClaims[], contradictions[], verifyNext[], investorAdvice, disclaimer } }`

## Data Architecture
- **No database.** The app is stateless by design — each request is analyzed and returned; nothing
  is persisted. (Privacy is a feature for the target audience.)
- **AI engine**: server-side call to an OpenAI-compatible chat-completions endpoint
  (`gpt-5-mini`) with the 21-flag methodology baked into the system prompt and strict JSON output.
- **Secrets**: `OPENAI_API_KEY` + `OPENAI_BASE_URL` — provided to the Worker as environment
  variables / secrets (see Deployment). Never exposed to the browser.

## User Guide
1. Open the site.
2. Paste the investment pitch / ad / email (or drop a text file). Not sure what to paste? Click a
   **sample**.
3. (Optional) Open "Add optional details" and fill in what you know.
4. Click **Analyze for fraud risk**.
5. Read your report — risk score, red flags, what to verify, and clear advice. Use **Copy** or
   **Print / Save PDF** to keep it.

### Attaching documents & images
- Click **Attach file** (or drag a file onto the box) — PDFs and Word docs are read and their text
  is added to the box automatically; images are attached as thumbnails.
- Click **Take photo** (mobile) to snap a pitch / ad and have it analyzed directly.
- **Paste** a screenshot from your clipboard into the box — it attaches as an image.
- An image-only submission is fine — you don't have to type anything if you've attached a picture.
- *Note:* scanned PDFs with no selectable text won't extract — attach a screenshot of the page
  instead so the vision model can read it.

## Tech Stack
- **Hono** (edge web framework) on **Cloudflare Pages / Workers**
- **Vite** + `@hono/vite-build` for the build
- Vanilla JS + handcrafted CSS (glassmorphism / 3D) — no heavy frontend framework
- Font Awesome (CDN), Google Fonts (Inter, JetBrains Mono)

## Local Development
```bash
npm run build                       # build to dist/
pm2 start ecosystem.config.cjs      # serve via wrangler pages dev on :3000
curl http://localhost:3000          # smoke test
```
The API key for local dev lives in `.dev.vars` (git-ignored):
```
OPENAI_API_KEY=<token>
OPENAI_BASE_URL=https://www.genspark.ai/api/llm_proxy/v1
```

## Deployment (Cloudflare Pages)
The backend key is a **secret** in production (do not commit it):
```bash
# one-time
npx wrangler pages project create investsafe-pro --production-branch main
npx wrangler pages secret put OPENAI_API_KEY --project-name investsafe-pro
npx wrangler pages secret put OPENAI_BASE_URL --project-name investsafe-pro

# deploy
npm run deploy
```

## Deployment Status
- **Platform**: Cloudflare Pages
- **Status**: ✅ Running locally in sandbox (PM2) · ⏳ Not yet deployed to production
- **Project name**: `investsafe-pro`
- **Last Updated**: 2026-06-18 — added PDF / image / Word / text attachment support (incl. vision-model image analysis)

## Not Yet Implemented / Next Steps
- Live SEC EDGAR / FINRA BrokerCheck lookups (currently the report tells users *where* to verify).
- OCR for scanned/image-only PDFs (currently selectable-text PDFs extract; scanned pages should be
  attached as images so the vision model reads them).
- Legacy `.doc` (old Word binary) support — users are asked to save as `.docx` or PDF.
- Saved history / shareable report links (would require storage; intentionally omitted for privacy).
- Multi-language support.

---
*InvestSafe Pro is an educational due-diligence aid, not legal or financial advice. It analyzes the
language and structure of what a promoter presents and does not make factual claims about any
specific named person or company. Always verify with primary sources (SEC EDGAR, FINRA BrokerCheck,
county records) and consult a licensed professional before investing.*
