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

### Document Size: Unlimited (Browser-Driven Chunk Pipeline v3.0)
- **No size limits** — upload documents of any length. Small documents are analyzed in one shot;
  large documents are handled by a **browser-driven chunk pipeline** that keeps every HTTP request
  short (so no single request ever hits the Cloudflare Worker duration limit — works on the free
  plan, no Queues, no BYOK):
  1. The browser asks the server to **split** the document authoritatively (`/api/split`).
  2. It analyzes **one chunk per request** (`/api/analyze-chunk`), threading a carryover context
     tail between chunks, with a live "part N of M" progress indicator.
  3. It posts all chunk results to `/api/merge`, which produces the final scored report using the
     **same merge + relevance-gate + scoring** as the one-shot path.
- **Merge is monotonic & deterministic** — for each of the 21 flags the **highest evidence tier**
  across all chunks wins, and the server re-computes the score authoritatively from the tier-based
  severity table. More text can only increase or maintain the score, never lower it.
- **Rate-limit resilient** — chunk requests retry on HTTP 429 with backoff that honors OpenAI's
  "try again in Xs" hint, and pace between chunks, so large docs complete even on a low-TPM key.

### TPM-driven chunk sizing (future-proof)
- The per-chunk size is **derived from your OpenAI key's tokens-per-minute limit** via `OPENAI_TPM`
  (uses ≤50% of TPM as input, ~4 chars/token). Raise your key's tier → set `OPENAI_TPM` higher →
  chunks automatically get bigger and fewer, **no code change**. `MAX_CHUNK_CHARS` remains a manual
  override; a hard 300k-char ceiling caps any single call.
  - `OPENAI_TPM=30000` → ~60k-char chunks · `200000` → ~300k-char chunks (mid-size docs single-shot).

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
| `POST` | `/api/analyze` | Run a **single-shot** fraud analysis (small docs / images) | JSON body: `material` (required, ≥30 chars), `sponsorName?`, `assetType?`, `claimedReturn?`, `amountAsked?`, `sourceType?`, `images?[]` |
| `GET` | `/api/chunk-plan?len=<chars>` | Report whether a doc of that length needs chunking + the plan | query `len` |
| `POST` | `/api/split` | Authoritative server-side split of a large doc into chunks | JSON body: `material` |
| `POST` | `/api/analyze-chunk` | Analyze ONE chunk (used by the browser-driven pipeline) | JSON body: `chunk`, `chunkIndex`, `totalChunks`, `carryover?`, `images?[]`, + optional detail fields |
| `POST` | `/api/merge` | Merge per-chunk results into the final scored report | JSON body: `results[]` |
| `GET` | `/api/framework` | Returns the 21-flag framework (used by the methodology grid) | — |

**Routing:** the frontend calls `/api/chunk-plan`; if a doc fits one call (or has images) it uses
`/api/analyze` (unchanged). Larger text docs use `/api/split` → `/api/analyze-chunk` (looped) →
`/api/merge`.

**`/api/analyze` response shape:** `{ ok: true, result: { riskScore, riskLevel, verdict, summary, triggeredFlags[], extractedClaims[], contradictions[], verifyNext[], investorAdvice, disclaimer } }`

## Data Architecture
- **No database.** The app is stateless by design — each request is analyzed and returned; nothing
  is persisted. (Privacy is a feature for the target audience.)
- **AI engine (GPT-only)**: server-side calls to an OpenAI-compatible chat-completions endpoint,
  with the 21-flag methodology baked into the system prompt and strict JSON output. **Different GPT
  models are chosen by document type** (see below).
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
npm run dev:sandbox                 # serve via wrangler pages dev on :3000
# or
pm2 start ecosystem.config.cjs       # serve via PM2 (recommended)
curl http://localhost:3000          # smoke test
```

### Backend AI configuration (GPT-only, NO BYOK — you provide ONE key for all users)

The app calls any **OpenAI-compatible** Chat Completions API with a single `OPENAI_API_KEY`.
End users never enter a key. **A different GPT model is used per document type:**

| Var | Purpose | Default |
|-----|---------|---------|
| `OPENAI_API_KEY` | your provider secret | (required) |
| `OPENAI_BASE_URL` | API base | `https://api.openai.com/v1` |
| `OPENAI_SHORT_MODEL` | short text submissions (≤ `OPENAI_SHORT_DOC_CHARS`) — fast/cheap | `gpt-4.1-mini` |
| `OPENAI_TEXT_MODEL` | normal text submissions | `gpt-4.1` |
| `OPENAI_VISION_MODEL` | submissions **with images** (sharp vision) | `gpt-5.4` |
| `OPENAI_LARGE_MODEL` | large/chunked text documents | `gpt-4.1` |
| `OPENAI_SHORT_DOC_CHARS` | char threshold below which the SHORT model is used | `6000` |
| `OPENAI_MODEL` | optional — force ONE model for everything (overrides the per-type split) | _(unset)_ |
| `OPENAI_TPM` | your key's tokens-per-minute limit — **drives chunk size** (future-proof) | `30000` |
| `MAX_CHUNK_CHARS` | optional manual override of the TPM-derived per-chunk cap | _(unset)_ |
| `MIN_CHUNK_CHARS` | min chars per chunk so tiny docs aren't over-split | `20000` |
| `CHUNK_PERCENT` | target chunk size as a % of the document | `25` |
| `CARRYOVER_PERCENT` | carryover context between chunks, as a % of chunk size | `10` |
| `OPENAI_REASONING_EFFORT` | `none`/`low`/`medium`/`high` (for GPT-5/o models) — `low` for consistency | `low` |

**Per-type model routing** (`pickModel`): images → `OPENAI_VISION_MODEL`; text ≤ `OPENAI_SHORT_DOC_CHARS`
→ `OPENAI_SHORT_MODEL`; large/chunked text → `OPENAI_LARGE_MODEL`; otherwise `OPENAI_TEXT_MODEL`.
`OPENAI_MODEL` forces one model for everything. The code auto-selects `max_completion_tokens` for
GPT-5/o-series models and `max_tokens` otherwise.

For local dev, put them in `.dev.vars` (git-ignored):
```
OPENAI_API_KEY=sk-your-openai-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_SHORT_MODEL=gpt-4.1-mini
OPENAI_TEXT_MODEL=gpt-4.1
OPENAI_VISION_MODEL=gpt-5.4
OPENAI_LARGE_MODEL=gpt-4.1
OPENAI_SHORT_DOC_CHARS=6000
OPENAI_REASONING_EFFORT=low

# TPM-driven chunk sizing — set to your key's real TPM to future-proof
OPENAI_TPM=30000
CHUNK_PERCENT=25
CARRYOVER_PERCENT=10
MIN_CHUNK_CHARS=20000
# MAX_CHUNK_CHARS=60000   # optional manual override
```

Works with OpenAI, OpenRouter, Together, Groq, Azure OpenAI, etc. — just set the matching
`OPENAI_BASE_URL` and model names.

## How the Browser-Driven Chunk Pipeline Works (large documents)

When a document is too large to fit one call (per `/api/chunk-plan`):

1. **Split** (`/api/split`) — The **server** splits the document authoritatively into chunks (size
   derived from `OPENAI_TPM`), breaking at sentence boundaries where possible. Doing the split
   server-side guarantees the browser orchestrates the exact same chunks the engine expects.

2. **Analyze one chunk per request** (`/api/analyze-chunk`) — The browser loops the chunks
   **sequentially**, threading a carryover context tail from the previous chunk(s) so evidence that
   spans a boundary is understood. Each request is short (one GPT call), so none hits the Worker
   duration limit. 429 rate-limits are retried with backoff (honoring OpenAI's retry hint); a small
   pause paces requests under the TPM window. A live "part N of M" indicator shows progress.

3. **Merge** (`/api/merge`) — For each of the 21 flags, the **highest evidence tier** found across
   all chunks is kept (monotonic: more text never lowers the score). The relevance gate uses a
   majority vote across chunks.

4. **Re-compute score** — The server re-computes the risk score authoritatively using the
   `TIER_SEVERITY` table (deterministic), so a chunked analysis scores identically to a one-shot one.

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

# required secrets
npx wrangler pages secret put OPENAI_API_KEY --project-name investsafe-pro
npx wrangler pages secret put OPENAI_BASE_URL --project-name investsafe-pro

# recommended: set your key's TPM so large-doc chunking is sized correctly
npx wrangler pages secret put OPENAI_TPM --project-name investsafe-pro

# optional model overrides (defaults: gpt-4.1-mini / gpt-4.1 / gpt-5.4 / gpt-4.1)
npx wrangler pages secret put OPENAI_SHORT_MODEL --project-name investsafe-pro
npx wrangler pages secret put OPENAI_TEXT_MODEL --project-name investsafe-pro
npx wrangler pages secret put OPENAI_VISION_MODEL --project-name investsafe-pro
npx wrangler pages secret put OPENAI_LARGE_MODEL --project-name investsafe-pro

# deploy
npm run deploy
```

## Deployment Status
- **Platform**: Cloudflare Pages
- **Status**: ✅ Running locally in sandbox (PM2) · ⏳ Not yet deployed to production
- **Project name**: `investsafe-pro`
- **Last Updated**: 2026-07-13 — v3.0: **GPT-only** per-document-type model routing (short/normal/
  vision/large); **browser-driven chunk pipeline** (split → analyze-chunk → merge) so large docs
  never hit the Worker request limit — no Queues / no BYOK / free-plan compatible; **TPM-driven chunk
  sizing** (`OPENAI_TPM`) that scales automatically when you raise your key's tier; 429 rate-limit
  retries with backoff. Removed Kimi/multi-provider. Deterministic scoring preserved.

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
