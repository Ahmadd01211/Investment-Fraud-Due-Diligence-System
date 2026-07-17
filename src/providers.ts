// ════════════════════════════════════════════════════════════════
//  AI PROVIDER ABSTRACTION  (production, permanent)
//
//  A pluggable layer over OpenAI-compatible chat-completions APIs so the
//  rest of the app never hard-codes a vendor.
//
//  TWO providers only: DeepSeek (reasoning) and OpenAI (vision/OCR).
//
//  ROLE-BASED SELECTION:
//    • REASONING (all 21-rule evaluation + the final report):
//        DeepSeek `deepseek-v4-pro` — PRIMARY. Only if the DeepSeek key is
//        absent, fall back to OpenAI `gpt-4o` for text reasoning.
//    • OCR / VISION (images & scanned pages → text):
//        OpenAI `gpt-4o` — PRIMARY. DeepSeek is TEXT-ONLY and is NEVER sent an
//        image. If a vision call exceeds gpt-4o's context/size limit, it is
//        transparently retried once on `gpt-5` (a higher-capacity fallback).
//
//  MODEL FACTS:
//    • DeepSeek's API is TEXT-ONLY; it rejects image_url message parts.
//    • Valid DeepSeek ids: `deepseek-v4-pro` (reason) and `deepseek-v4-flash`
//      (helper). DeepSeek context is ~1,000,000 tokens (whole docs in one pass).
//    • gpt-4o context is ~128,000 tokens, applied per single page (not a
//      bottleneck for OCR, which sends one page per request).
//
//  MODEL ROLES (provider maps each role → a concrete model id):
//    • reason  → the strongest reasoning model. Used for ALL 21-rule
//                evaluation and for the final report. NEVER a mini model.
//    • vision  → a vision-capable model. Used for OCR of images / scanned PDFs.
//    • helper  → an optional cheap/mini model, allowed ONLY for lightweight
//                preprocessing. Never used for fraud-rule reasoning.
// ════════════════════════════════════════════════════════════════

/** Model role → the provider maps it to a concrete model name. */
export type ModelRole = 'reason' | 'vision' | 'helper'

export interface ChatRequest {
  systemPrompt: string
  /** string, or OpenAI multi-part content array (text + image_url parts). */
  userContent: any
  role: ModelRole
  /** Optional per-call model override (wins over role mapping). */
  forceModel?: string
  /** Cap on output tokens for non-reasoning models. */
  maxTokens?: number
}

/** Normalized result of a single chat call. */
export interface ChatResult {
  content: string
  finishReason: string | null
  /** Which concrete model actually served the call (for logging/telemetry). */
  model: string
  /** Which provider served the call. */
  provider: string
}

/** A pluggable AI backend. Implement this to add a provider. */
export interface AIProvider {
  readonly name: string
  /** Whether this provider accepts image_url message parts (vision). */
  readonly supportsVision: boolean
  /** Resolve a role to this provider's concrete model id. */
  modelFor(role: ModelRole, forceModel?: string): string
  /** Perform one chat-completions call and return raw content + finish reason. */
  chatJson(req: ChatRequest): Promise<ChatResult>
}

// ── OCR abstraction ───────────────────────────────────────────────
export interface OcrPage {
  /** 1-based page (or image) index, preserving document order. */
  page: number
  /** Extracted text for this page. */
  text: string
}

export interface OcrProvider {
  readonly name: string
  /**
   * Extract text from an ordered list of image data-URLs, ONE page each.
   * Must preserve page numbers and order. Returns one OcrPage per input.
   */
  extract(images: string[], startPage?: number): Promise<OcrPage[]>
}

// ── Shared low-level OpenAI-compatible transport ──────────────────
export interface ProviderConfig {
  apiKey: string
  baseUrl: string
  providerName: string
  reasoningEffort?: string
  models: Record<ModelRole, string>
  /** Optional hard override: force ONE model for every role. */
  forceModel?: string
  /** Whether this provider can accept images (OpenAI true, DeepSeek false). */
  supportsVision: boolean
  /** Higher-capacity vision model used only when a vision call overflows. */
  visionFallbackModel?: string
}

/** Thrown for upstream API failures; message prefixes drive HTTP status mapping. */
export function classifyUpstreamError(status: number, txt: string): Error {
  const low = txt.toLowerCase()
  console.error(`[LLM upstream error] status=${status} body=${txt.slice(0, 400)}`)
  if (
    low.includes('insufficient_quota') ||
    low.includes('exceeded your current quota') ||
    low.includes('billing') ||
    low.includes('insufficient balance')
  ) {
    return new Error('SERVICE_QUOTA: The analysis service is temporarily unavailable (API quota/billing limit reached).')
  }
  if (status === 429) {
    let retryAfter = 0
    const m = txt.match(/try again in ([\d.]+)\s*s/i)
    if (m) retryAfter = Math.ceil(parseFloat(m[1]))
    return new Error(`SERVICE_RATELIMIT:${retryAfter || ''}`)
  }
  if (status === 401 || status === 403) {
    return new Error('SERVICE_AUTH: The analysis service is misconfigured (invalid API key).')
  }
  return new Error(`Analysis service error (${status}). ${txt.slice(0, 200)}`)
}

/** True when an OpenAI 400/413 body indicates a context-length / image-size overflow. */
function isContextSizeError(status: number, body: string): boolean {
  if (status !== 400 && status !== 413) return false
  const low = body.toLowerCase()
  return (
    low.includes('context_length_exceeded') ||
    low.includes('maximum context length') ||
    low.includes('too large') ||
    (low.includes('image') && low.includes('token'))
  )
}

class OpenAICompatibleProvider implements AIProvider {
  readonly supportsVision: boolean
  constructor(public readonly name: string, private cfg: ProviderConfig) {
    this.supportsVision = cfg.supportsVision
  }

  modelFor(role: ModelRole, forceModel?: string): string {
    return forceModel || this.cfg.forceModel || this.cfg.models[role]
  }

  private buildBody(model: string, req: ChatRequest): any {
    const isDeepSeek = this.cfg.providerName === 'deepseek'
    const isOpenAIReasoning = /^(gpt-5|o1|o3|o4)/i.test(model)

    const reqBody: any = { model }

    if (isDeepSeek) {
      // DeepSeek: use system + user messages. No temperature/seed — DeepSeek
      // handles determinism internally. Large output budget so structured JSON
      // isn't truncated.
      reqBody.messages = [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: typeof req.userContent === 'string' ? req.userContent : JSON.stringify(req.userContent) },
      ]
      reqBody.response_format = { type: 'json_object' }
      reqBody.max_tokens = req.maxTokens || (req.role === 'reason' ? 16000 : 4000)
    } else if (isOpenAIReasoning) {
      reqBody.messages = [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userContent },
      ]
      reqBody.response_format = { type: 'json_object' }
      reqBody.reasoning_effort = this.cfg.reasoningEffort || 'high'
      reqBody.max_completion_tokens = 16000
    } else {
      reqBody.messages = [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userContent },
      ]
      reqBody.response_format = { type: 'json_object' }
      reqBody.temperature = 0
      reqBody.seed = 42
      reqBody.max_tokens = req.maxTokens || (req.role === 'reason' ? 16000 : 4000)
    }
    return reqBody
  }

  private async postOnce(reqBody: any): Promise<Response> {
    const url = `${this.cfg.baseUrl}/chat/completions`
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.apiKey}` }
    let resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(reqBody) })
    // Some models reject temperature/seed → retry once without them.
    if (!resp.ok && resp.status === 400) {
      const peek = await resp.clone().text().catch(() => '')
      const pl = peek.toLowerCase()
      if (pl.includes('temperature') || pl.includes('seed')) {
        const fb = { ...reqBody }
        delete fb.temperature
        delete fb.seed
        resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(fb) })
      }
    }
    return resp
  }

  async chatJson(req: ChatRequest): Promise<ChatResult> {
    const model = this.modelFor(req.role, req.forceModel)

    // Defensive backstop: a text-only provider must NEVER receive an image part.
    if (!this.supportsVision && Array.isArray(req.userContent)) {
      const hasImage = req.userContent.some((p: any) => p && p.type === 'image_url')
      if (hasImage) {
        throw new Error(`SERVICE_CONFIG: provider "${this.name}" is text-only; OCR the image first`)
      }
    }

    const reqBody = this.buildBody(model, req)
    let resp = await this.postOnce(reqBody)

    // Vision context/size overflow → transparently retry ONCE on the higher-
    // capacity vision fallback model (gpt-5). Text/reason calls never do this.
    if (!resp.ok && req.role === 'vision' && this.cfg.visionFallbackModel && this.cfg.visionFallbackModel !== model) {
      const body = await resp.clone().text().catch(() => '')
      if (isContextSizeError(resp.status, body)) {
        console.warn(
          `[vision fallback] "${model}" hit a context/size limit; escalating to "${this.cfg.visionFallbackModel}".`
        )
        const fbBody = this.buildBody(this.cfg.visionFallbackModel, req)
        resp = await this.postOnce(fbBody)
        if (resp.ok) {
          const data: any = await resp.json()
          const content = data?.choices?.[0]?.message?.content
          const finishReason = data?.choices?.[0]?.finish_reason ?? null
          if (!content) throw new Error('Analysis service returned an empty response.')
          return { content, finishReason, model: this.cfg.visionFallbackModel, provider: this.name }
        }
      }
    }

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      throw classifyUpstreamError(resp.status, txt)
    }
    const data: any = await resp.json()
    const msg = data?.choices?.[0]?.message
    // DeepSeek reasoning models may put output in `reasoning_content` with empty `content`.
    const content = msg?.content || msg?.reasoning_content || ''
    const finishReason = data?.choices?.[0]?.finish_reason ?? null
    console.log(`[provider:${this.name}] model=${model} finish=${finishReason} contentLen=${content.length} hasReasoning=${!!msg?.reasoning_content} keys=${msg ? Object.keys(msg).join(',') : 'null'}`)
    if (!content) throw new Error('Analysis service returned an empty response.')
    return { content, finishReason, model, provider: this.name }
  }
}

// ── Default OCR: route images through OpenAI's vision model ──
const OCR_SYSTEM_PROMPT =
  'You are a precise OCR engine. Transcribe ALL text visible in the image faithfully and completely, ' +
  'preserving reading order, line breaks, headings, tables (as tab/space aligned text), figures, and numbers exactly. ' +
  'Transcribe small print, footnotes, disclaimers, and stamps too — they often carry the key claims. ' +
  'Do NOT translate, summarize, interpret, correct, or add commentary. If the image contains no legible text, return an empty string. ' +
  'Respond ONLY with a single JSON object: {"text": "<verbatim transcription>"}.'

/** Extract the transcription from an OCR response, tolerating fenced/partial JSON. */
function parseOcrText(raw: string): string {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''
  // Strip ```json … ``` fences some models add despite json_object mode.
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    const parsed = JSON.parse(unfenced)
    if (parsed && typeof parsed.text === 'string') return parsed.text
  } catch {
    /* fall through to salvage */
  }
  // Salvage the "text" value from a truncated/partially-valid object — e.g. the
  // model hit the output-token cap mid-transcription, leaving no closing quote.
  const idx = unfenced.indexOf('"text"')
  if (idx >= 0) {
    const q = unfenced.indexOf('"', idx + '"text"'.length)
    if (q >= 0) {
      // Everything after the value's opening quote, minus a proper trailing close.
      const body = unfenced.slice(q + 1).replace(/"\s*}?\s*$/, '')
      try {
        return JSON.parse('"' + body + '"')
      } catch {
        return body
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\r/g, '\r')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
      }
    }
  }
  // Last resort: if it does not look like JSON at all, treat as raw text.
  if (!unfenced.startsWith('{') && !unfenced.startsWith('[')) return unfenced
  return ''
}

class VisionOcrProvider implements OcrProvider {
  readonly name: string
  constructor(private provider: AIProvider) {
    this.name = `vision:${provider.name}`
  }

  /** OCR one image; retries once on a transient rate-limit, else yields ''. */
  private async ocrOne(url: string): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.provider.chatJson({
          role: 'vision',
          systemPrompt: OCR_SYSTEM_PROMPT,
          userContent: [
            { type: 'text', text: 'Transcribe this page verbatim as JSON {"text": "..."}.' },
            // detail:"high" makes OpenAI tile the image at full resolution — far
            // more accurate on dense pages, small print, and tables.
            { type: 'image_url', image_url: { url, detail: 'high' } },
          ],
          // Dense full pages can exceed 4k output tokens and get truncated
          // (garbled/half-missing OCR). Give the transcription room.
          maxTokens: 8000,
        })
        return parseOcrText(res.content)
      } catch (err: any) {
        const msg = String(err?.message || '')
        // Retry once after a short backoff on a rate-limit; otherwise give up on
        // THIS page only (return '') so one bad page never fails the whole doc.
        if (attempt === 0 && msg.startsWith('SERVICE_RATELIMIT:')) {
          const secs = Number(msg.slice('SERVICE_RATELIMIT:'.length)) || 3
          await new Promise((r) => setTimeout(r, Math.min(8000, Math.max(1000, secs * 1000))))
          continue
        }
        console.warn(`[OCR] page transcription failed: ${msg.slice(0, 160)}`)
        return ''
      }
    }
    return ''
  }

  async extract(images: string[], startPage = 1): Promise<OcrPage[]> {
    const pages: OcrPage[] = []
    // One call per image so page numbers stay exact and calls stay small.
    for (let i = 0; i < images.length; i++) {
      const text = await this.ocrOne(images[i])
      pages.push({ page: startPage + i, text })
    }
    return pages
  }
}

// ── Provider environment shape (subset of Bindings the providers read) ──
export interface ProviderEnv {
  // ── DeepSeek (PRIMARY — reasoning; TEXT ONLY) ──
  DEEPSEEK_API_KEY?: string
  DEEPSEEK_BASE_URL?: string
  /** Force ONE DeepSeek model for every role. */
  DEEPSEEK_MODEL?: string
  DEEPSEEK_REASON_MODEL?: string
  DEEPSEEK_HELPER_MODEL?: string
  DEEPSEEK_REASONING_EFFORT?: string

  // ── OpenAI (vision/OCR PRIMARY; reasoning fallback) ──
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  /** Force ONE OpenAI model for every role. */
  OPENAI_MODEL?: string
  OPENAI_REASON_MODEL?: string
  OPENAI_VISION_MODEL?: string
  /** Higher-capacity vision model used only when a vision call overflows. */
  OPENAI_VISION_FALLBACK_MODEL?: string
  OPENAI_HELPER_MODEL?: string
  OPENAI_REASONING_EFFORT?: string
}

// Defaults.
//   reason = strongest model (NEVER a mini) — used for the 21 rules + report.
//   vision = vision-capable model — used for OCR (OpenAI only).
//   helper = cheap model — ONLY for optional lightweight preprocessing.
const OPENAI_DEFAULTS: Record<ModelRole, string> = {
  reason: 'gpt-4o',
  vision: 'gpt-4o',
  helper: 'gpt-4o-mini', // helper ONLY — never used for rule reasoning
}
const OPENAI_VISION_FALLBACK_DEFAULT = 'gpt-5'

const DEEPSEEK_DEFAULTS: Record<ModelRole, string> = {
  reason: 'deepseek-v4-pro',
  // DeepSeek is text-only; this "vision" slot is never used for OCR, but the
  // role map requires all three keys. Kept as the reasoning model as a no-op.
  vision: 'deepseek-v4-pro',
  helper: 'deepseek-v4-flash',
}

function isUsableKey(k?: string): boolean {
  return typeof k === 'string' && k.trim().length > 10
}

function buildOpenAI(env: ProviderEnv): AIProvider {
  return new OpenAICompatibleProvider('openai', {
    apiKey: env.OPENAI_API_KEY as string,
    baseUrl: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    providerName: 'openai',
    reasoningEffort: env.OPENAI_REASONING_EFFORT,
    forceModel: env.OPENAI_MODEL,
    supportsVision: true,
    visionFallbackModel: env.OPENAI_VISION_FALLBACK_MODEL || OPENAI_VISION_FALLBACK_DEFAULT,
    models: {
      reason: env.OPENAI_REASON_MODEL || OPENAI_DEFAULTS.reason,
      vision: env.OPENAI_VISION_MODEL || OPENAI_DEFAULTS.vision,
      helper: env.OPENAI_HELPER_MODEL || OPENAI_DEFAULTS.helper,
    },
  })
}

function buildDeepSeek(env: ProviderEnv): AIProvider {
  return new OpenAICompatibleProvider('deepseek', {
    apiKey: env.DEEPSEEK_API_KEY as string,
    baseUrl: (env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, ''),
    providerName: 'deepseek',
    reasoningEffort: env.DEEPSEEK_REASONING_EFFORT,
    forceModel: env.DEEPSEEK_MODEL,
    supportsVision: false, // DeepSeek's API is text-only — never send it images
    models: {
      reason: env.DEEPSEEK_REASON_MODEL || DEEPSEEK_DEFAULTS.reason,
      vision: env.DEEPSEEK_REASON_MODEL || DEEPSEEK_DEFAULTS.vision,
      helper: env.DEEPSEEK_HELPER_MODEL || DEEPSEEK_DEFAULTS.helper,
    },
  })
}

/**
 * Select the REASONING provider (21 rules + report):
 *   DeepSeek `deepseek-v4-pro` (PRIMARY) → OpenAI `gpt-4o` (fallback).
 */
export function selectReasoningProvider(env: ProviderEnv): AIProvider {
  if (isUsableKey(env.DEEPSEEK_API_KEY)) return buildDeepSeek(env)
  if (isUsableKey(env.OPENAI_API_KEY)) return buildOpenAI(env)
  throw new Error('SERVICE_AUTH: No analysis provider configured. Set DEEPSEEK_API_KEY (primary) or OPENAI_API_KEY (fallback).')
}

/** Back-compat alias: the reasoning provider is the app's default provider. */
export const selectProvider = selectReasoningProvider

/**
 * Select the VISION provider for OCR: OpenAI only (DeepSeek is text-only).
 * Returns null when no OpenAI key is configured.
 */
export function selectVisionProvider(env: ProviderEnv): AIProvider | null {
  if (isUsableKey(env.OPENAI_API_KEY)) return buildOpenAI(env)
  return null
}

/** True when an OCR-capable (vision) provider is configured. */
export function hasVisionProvider(env: ProviderEnv): boolean {
  return isUsableKey(env.OPENAI_API_KEY)
}

/** List every configured provider in priority order (for future runtime fallback). */
export function availableProviders(env: ProviderEnv): AIProvider[] {
  const list: AIProvider[] = []
  if (isUsableKey(env.DEEPSEEK_API_KEY)) list.push(buildDeepSeek(env))
  if (isUsableKey(env.OPENAI_API_KEY)) list.push(buildOpenAI(env))
  return list
}

/** True when at least one reasoning provider is configured. */
export function hasProvider(env: ProviderEnv): boolean {
  return isUsableKey(env.DEEPSEEK_API_KEY) || isUsableKey(env.OPENAI_API_KEY)
}

/**
 * Select the OCR provider (vision-model OCR backed by OpenAI). Returns null
 * when no vision provider is configured (DeepSeek can never do OCR).
 */
export function selectOcrProvider(env: ProviderEnv): OcrProvider | null {
  const v = selectVisionProvider(env)
  return v ? new VisionOcrProvider(v) : null
}
