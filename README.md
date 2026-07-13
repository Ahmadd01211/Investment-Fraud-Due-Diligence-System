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

### Document Size: Unlimited (Chunk-and-Merge v2.0)
- **No size limits** — upload documents of any length. The backend handles large documents via:
  - **Kimi 2.6** (2M token context window) — when configured with a `KIMI_API_KEY`, large documents
    are sent directly to Kimi without chunking, producing a single coherent analysis.
  - **Chunk-and-Merge** — documents exceeding the per-chunk threshold are split into overlapping
    chunks (~100k chars each, with ~5k overlap), analyzed in parallel, and merged by taking the
    **highest evidence tier** per flag across all chunks. This is **monotonically deterministic** —
    more text can only increase or maintain the score, never lower it.
- **Deterministic scoring** — the server re-computes the score authoritatively using the tier-based
  severity table, so the same document always produces the same score regardless of how many
  chunks it required.

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
- **No file size limits** — the backend handles large documents via chunking or Kimi 2.6.
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
pm run dev:sandbox                  # serve via wrangler pages dev on :3000
# or
pm2 start ecosystem.config.cjs       # serve via PM2 (recommended)
curl http://localhost:3000          # smoke test
```

### Backend AI configuration (NO BYOK — you provide ONE key for all users)

The app supports **two AI providers**: OpenAI-compatible (default) and **Kimi 2.6** (for large documents).

#### OpenAI-compatible provider
The app calls any **OpenAI-compatible** Chat Completions API. Configure it once on the
backend; end users never enter a key.

| Var | Purpose | Default |
|-----|---------|---------|
| `OPENAI_API_KEY` | your provider secret | (required) |
| `OPENAI_BASE_URL` | API base | `https://api.openai.com/v1` |
| `OPENAI_TEXT_MODEL` | model for text-only submissions (cheap) | `gpt-5.4-mini` |
| `OPENAI_VISION_MODEL` | model for submissions **with images** (sharp vision) | `gpt-5.4` |
| `OPENAI_MODEL` | optional — force ONE model for everything (overrides the split) | _(unset)_ |
| `OPENAI_MAX_MATERIAL_CHARS` | max chars per chunk (default 100k) | `100000` |
| `OPENAI_REASONING_EFFORT` | `none`/`low`/`medium`/`high` — default `low` for consistency | `low` |

**Smart model routing:** when the user attaches an image/screenshot the app uses
`OPENAI_VISION_MODEL` (default `gpt-5.4`, sharper vision); plain-text submissions use
the cheaper `OPENAI_TEXT_MODEL` (`gpt-5.4-mini`). Set `OPENAI_MODEL` to force one model.
The code auto-selects `max_completion_tokens` for GPT-5/o-series models and
`max_tokens` for older models (gpt-4o).

#### Kimi 2.6 provider (optional, for large documents)
Kimi 2.6 has a **2M token context window** (~8M characters), so large documents can be
sent in a single shot without chunking. When configured, documents exceeding the threshold
auto-route to Kimi for a single coherent analysis.

| Var | Purpose | Default |
|-----|---------|---------|
| `KIMI_API_KEY` | Moonshot AI / Kimi API key | _(unset — Kimi disabled)_ |
| `KIMI_BASE_URL` | Kimi API base | `https://api.moonshot.cn/v1` |
| `KIMI_MODEL` | Kimi model name | `kimi-2.6` |
| `KIMI_DOC_CHARS` | char threshold to route to Kimi | `150000` |

**Routing priority:** If `KIMI_API_KEY` is set and the document exceeds `KIMI_DOC_CHARS`,
the document goes to Kimi 2.6 in a single call. Otherwise, standard chunking or single-shot
with the OpenAI-compatible provider is used.

For local dev, put them in `.dev.vars` (git-ignored):
```
# OpenAI-compatible (required)
OPENAI_API_KEY=sk-your-openai-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_TEXT_MODEL=gpt-5.4-mini
OPENAI_VISION_MODEL=gpt-5.4

# Kimi 2.6 (optional — enables large-doc single-shot)
KIMI_API_KEY=sk-your-kimi-key
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_MODEL=kimi-2.6
KIMI_DOC_CHARS=150000
```

Works with OpenAI, OpenRouter, Together, Groq, Azure OpenAI, Kimi, etc. — just set the
matching `OPENAI_BASE_URL` and `OPENAI_MODEL` (or `KIMI_BASE_URL` for Kimi).

## How Chunk-and-Merge Works (for large documents)

When a document exceeds the per-chunk threshold (~100k chars by default):

1. **Split** — The document is split into overlapping chunks (~100k chars each, with ~5k overlap
   to preserve context at boundaries). The split tries to break at sentence boundaries to keep
   context intact.

2. **Analyze in parallel** — Each chunk is sent to the AI model independently with the same
   21-flag system prompt. Chunks are processed in parallel for speed.

3. **Merge** — For each of the 21 flags, the **highest evidence tier** found across all chunks
   is kept. This is **monotonic**: more text can only increase or maintain the score, never lower it.

4. **Re-compute score** — The server re-computes the risk score authoritatively using the
   `TIER_SEVERITY` table (server-side, deterministic), so the final score is always consistent.

**Why this keeps scores stable:**
- Severity is fixed by tier (not chosen by the model) — server-side `TIER_SEVERITY` table.
- Merge is monotonic: higher tier always wins → same document always produces same or higher score.
- The stability floor still applies (1–2 flags get a baseline floor to prevent one borderline flag
  from swinging a clean document to Critical).

## Deployment (Cloudflare Pages)
The backend keys are **secrets** in production (do not commit them):

```bash
# one-time
npx wrangler pages project create investsafe-pro --production-branch main

# OpenAI-compatible secrets
npx wrangler pages secret put OPENAI_API_KEY --project-name investsafe-pro
npx wrangler pages secret put OPENAI_BASE_URL --project-name investsafe-pro
npx wrangler pages secret put OPENAI_TEXT_MODEL --project-name investsafe-pro
npx wrangler pages secret put OPENAI_VISION_MODEL --project-name investsafe-pro

# Optional Kimi 2.6 secrets
npx wrangler pages secret put KIMI_API_KEY --project-name investsafe-pro
npx wrangler pages secret put KIMI_BASE_URL --project-name investsafe-pro

# deploy
npm run deploy
```

## Deployment Status
- **Platform**: Cloudflare Pages
- **Status**: ✅ Running locally in sandbox (PM2) · ⏳ Not yet deployed to production
- **Project name**: `investsafe-pro`
- **Last Updated**: 2026-07-13 — v2.0: Chunk-and-Merge for unlimited document size, Kimi 2.6 support (2M context window), monotonic deterministic merge, removed frontend 150k char cap. Score stability preserved via server-side TIER_SEVERITY table.

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
