# InvestSafe Pro™ — Investment Fraud Due-Diligence Engine

## Project Overview
- **Name**: InvestSafe Pro™
- **Goal**: Let ordinary investors detect investment fraud **before** committing capital by analyzing any-size document (PDF, DOCX, TXT, images, scanned PDFs, prospectuses, websites) against a documented 21-rule fraud framework.
- **v6.0 — Production architecture** (permanent, not a workaround): semantic chunking, provider abstraction, deterministic TS scoring, async job pipeline.

## Architecture (v6.0)

```
Upload (any size) ─▶ POST /api/jobs ─▶ [R2: text]  [D1: job + chunk rows] ─▶ returns { jobId } instantly
                                                     │
Frontend polls  ◀── GET /api/jobs/:id (progress) ◀──┤
                                                     │ each POST /api/jobs/:id/tick = ONE unit of work:
                                                     │   • analyze next chunk  (LLM: 21 rules, evidence only)
                                                     │   • OR merge + report   (TS scoring, then LLM prose)
                                                     ▼
                                        GET /api/jobs/:id/result ─▶ final scored report
```

### Pipeline modules (one responsibility each)
| File | Responsibility |
|------|----------------|
| `src/providers.ts` | **AIProvider abstraction.** Kimi (primary) → OpenAI (fallback). OCR abstraction (`OcrProvider`) so Google Vision / Azure DI can be added later. Never uses a "mini" model for rule reasoning. |
| `src/rules.ts` | The **21 fraud rules** (weights preserved), tier→severity table, the **per-chunk rule-evaluation prompt** (LLM returns evidence only, no scoring) and the **report prompt** (prose only). |
| `src/chunking.ts` | **Semantic, page-aware chunking** (headings/sections/clauses/articles/tables), size-split fallback, `[[PAGE n]]` tracking, boilerplate skipping (index/blank/signature). Never truncates. |
| `src/merge.ts` | **Deterministic TypeScript merge + scoring** (NO LLM): dedupe, aggregate evidence, resolve conflicts (highest tier wins), aggregate confidence, compute weighted points / risk score / level / key drivers. |
| `src/analyzer.ts` | Orchestrator: chunk → evaluate each chunk (all 21 rules) → merge (TS) → generate report (LLM prose only). |
| `src/jobs.ts` | **Async job pipeline** (Queues-equivalent): R2 + D1 + tick processor. Self-provisions D1 schema. Migrating to Cloudflare Queues later = swap the tick loop for a queue consumer calling `processNextUnit`. |
| `src/index.tsx` | Hono routes. |

### Provider selection (config-only switching)
1. Valid `KIMI_API_KEY` → **Kimi** (`kimi-k2.7`) — primary (cost + long context).
2. Else valid `OPENAI_API_KEY` → **OpenAI** (`gpt-4.1`) — fallback.
3. Else → configuration error.

The 21-rule evaluation and final report **always** use the provider's strongest reasoning model (`reason` role). Mini models are allowed only for optional `helper` preprocessing — never for fraud-rule reasoning.

### Determinism & separation of concerns
- **LLM never computes the score.** It only reports, per chunk, which rules are triggered + confidence + evidence (page/quote/reason) + tier.
- **Application computes the score** deterministically in `merge.ts` (temperature 0 + seed + fixed tier→severity table).
- **Final LLM call is report-only** — receives the already-scored dataset and writes verdict/summary/executive summary/recommendations/advice. It cannot change scores or which rules fired.

## API (functional URIs)
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/jobs` | Create analysis job → `{ jobId, totalChunks }` (returns immediately) |
| `GET`  | `/api/jobs/:id` | Job status/progress |
| `POST` | `/api/jobs/:id/tick` | Advance one unit of work (analyze a chunk, or merge+report) |
| `GET`  | `/api/jobs/:id/result` | Final assembled report |
| `GET`  | `/api/capabilities` | `{ asyncJobs }` — frontend picks async vs browser-driven |
| `POST` | `/api/analyze` | Synchronous single-shot (small docs / images / no-D1 fallback) |
| `POST` | `/api/split` | Semantic split (browser-driven fallback) |
| `POST` | `/api/analyze-chunk` | Evaluate one chunk (browser-driven fallback) |
| `POST` | `/api/merge` | Merge + score + report (browser-driven fallback) |
| `GET`  | `/api/framework` | The 21 rules |
| `GET`  | `/api/plans`, `/api/premium`, `POST /api/premium-request` | Membership / premium services |

## Data Architecture
- **D1** (`investsafe-jobs`): `jobs` (id, status, progress, context, result_json), `job_chunks` (per-chunk eval_json). Migration: `migrations/0001_jobs.sql`; also self-provisioned at runtime.
- **R2** (`investsafe-uploads`): extracted document text (`jobs/<id>/text.txt`).
- **Per-chunk contract** (`rules.ts`): `{ chunk_id, page_range, is_investment_related, rules:[{rule_id, triggered, confidence, evidence_tier, evidence:[{page, section, quote, reason}]}], claims }`.
- **Merged dataset** (`merge.ts`): findings with `weightedPoints`, `severity`, `confidence`, `pages`, aggregated evidence; `scoreBreakdown`.

## Scoring (unchanged, deterministic)
`weightedPoints = round(weight × severity / 10)` · severity fixed by tier (T1=10, T2=8, T3=5, T4=3, GAP=0) · `riskScore = round(totalWeightedPoints / (maxPossiblePoints + stabilityFloor) × 100)` · levels: 0-24 Low, 25-49 Medium, 50-74 High, 75-100 Critical.

## OCR
Scanned PDFs / images are transcribed via the active provider's **vision** model (`OcrProvider` abstraction), preserving `[[PAGE n]]` markers and document order. A dedicated OCR vendor can be dropped in by returning a different `OcrProvider` from `selectOcrProvider()` — no pipeline changes.

## Cost optimization
- Boilerplate (table of contents, blank, signature pages) skipped before evaluation.
- Chunk size derived from provider TPM (`KIMI_TPM` / `OPENAI_TPM`) → fewer, larger chunks on higher tiers.
- Report is a single small call on the compacted merged dataset.

## Migrating to Cloudflare Queues later
Minimal: each `tick` is one queue message. Replace the frontend-driven tick loop with a queue consumer that calls `processNextUnit(env, jobId)`. D1 rows, merge, and report stay identical. (Queues + Durable Objects require a paid Workers plan + BYOK, unavailable on the hosted-deploy target — hence the D1/R2/tick equivalent.)

## Local development
```bash
npm run build
npm run db:migrate:local              # or rely on runtime self-provisioning
pm2 start ecosystem.config.cjs         # binds --d1=DB --r2=R2 --local
curl http://localhost:3000/api/capabilities   # {"asyncJobs":true}
```
Secrets in `.dev.vars` (git-ignored). Set `KIMI_API_KEY` to make Kimi active; otherwise `OPENAI_API_KEY` is used.

## Deployment
- **Platform**: Cloudflare Pages + D1 + R2
- **Status**: Local dev verified ✅ (async job, multi-chunk, page threading, legit=0/Low, high-risk=Critical, browser fallback)
- **Tech Stack**: Hono + TypeScript + Vite + Wrangler; TailwindCSS (CDN) frontend
- **Last Updated**: 2026-07-14 (v6.0 production redesign)
