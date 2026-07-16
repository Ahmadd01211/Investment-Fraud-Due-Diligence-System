// ════════════════════════════════════════════════════════════════
//  AI PROVIDER ABSTRACTION  (production, permanent)
//
//  A pluggable layer over OpenAI-compatible chat-completions APIs so the
//  rest of the app never hard-codes a vendor. Add a new provider (Claude,
//  Gemini, …) by implementing AIProvider and registering it in the
//  selection functions below — nothing else in the pipeline changes.
//
//  PROVIDER PRIORITY (updated):
//    1. If a valid DeepSeek API key exists        → DeepSeek Pro v4 (PRIMARY)
//    2. Else if a valid OpenAI API key exists     → OpenAI GPT-5 (FALLBACK)
//    3. Else if a valid Kimi API key exists       → Kimi (legacy fallback)
//    4. Else                                      → configuration error
//
//  Reason: structured fraud detection over long investment/legal docs
//  favours Kimi's long context + lower cost. OpenAI (GPT-4.1) is the
//  fallback. The core 21-rule reasoning ALWAYS uses the strongest model
//  the active provider offers — never a "mini" model.
//
//  MODEL ROLES (provider maps each role → a concrete model id):
//    • reason  → the strongest reasoning model. Used for ALL 21-rule
//                evaluation and for the final report. NEVER a mini model.
//    • vision  → a vision-capable model. Used for OCR of images / scanned
//                PDFs via the vision path.
//    • helper  → an optional cheap/mini model, allowed ONLY for lightweight
//                preprocessing (metadata extraction, classification). Never
//                used for fraud-rule reasoning.
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
  /** Cap on output tokens for non-reasoning models (default 4000). */
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
  /** Resolve a role to this provider's concrete model id. */
  modelFor(role: ModelRole, forceModel?: string): string
  /** Perform one chat-completions call and return raw content + finish reason. */
  chatJson(req: ChatRequest): Promise<ChatResult>
}

// ── OCR abstraction ───────────────────────────────────────────────
// OCR is a SEPARATE concern from chat so a dedicated OCR vendor (Google
// Vision, Azure Document Intelligence, AWS Textract) can be dropped in later
// without touching the pipeline. The default implementation (VisionOcrProvider)
// simply routes images through the active AIProvider's vision model.

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
// OpenAI and Kimi both speak the OpenAI chat-completions dialect, so they
// share this transport and differ only in base URL + model names.

export interface ProviderConfig {
  apiKey: string
  baseUrl: string
  reasoningEffort?: string
  models: Record<ModelRole, string>
  /** Optional hard override: force ONE model for every role. */
  forceModel?: string
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

class OpenAICompatibleProvider implements AIProvider {
  constructor(public readonly name: string, private cfg: ProviderConfig) {}

  modelFor(role: ModelRole, forceModel?: string): string {
    return forceModel || this.cfg.forceModel || this.cfg.models[role]
  }

  async chatJson(req: ChatRequest): Promise<ChatResult> {
    const model = this.modelFor(req.role, req.forceModel)
    const isReasoning = /^(gpt-5|o1|o3|o4)/i.test(model)
    const reqBody: any = {
      model,
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      seed: 42,
    }
    if (isReasoning) {
      reqBody.reasoning_effort = this.cfg.reasoningEffort || 'low'
      reqBody.max_completion_tokens = 16000
    } else {
      reqBody.max_tokens = req.maxTokens || 4000
    }

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

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      throw classifyUpstreamError(resp.status, txt)
    }
    const data: any = await resp.json()
    const content = data?.choices?.[0]?.message?.content
    const finishReason = data?.choices?.[0]?.finish_reason ?? null
    if (!content) throw new Error('Analysis service returned an empty response.')
    return { content, finishReason, model, provider: this.name }
  }
}

// ── Default OCR: route images through the active provider's vision model ──
const OCR_SYSTEM_PROMPT =
  'You are an OCR engine. Transcribe ALL text visible in the image faithfully and completely, ' +
  'preserving reading order, line breaks, headings, tables (as tab/space aligned text), and numbers. ' +
  'Do NOT summarize, interpret, or add commentary. ' +
  'Respond ONLY with a JSON object: {"text": "<verbatim transcription>"}.'

class VisionOcrProvider implements OcrProvider {
  readonly name: string
  constructor(private provider: AIProvider) {
    this.name = `vision:${provider.name}`
  }
  async extract(images: string[], startPage = 1): Promise<OcrPage[]> {
    const pages: OcrPage[] = []
    // One call per image so page numbers stay exact and calls stay small.
    for (let i = 0; i < images.length; i++) {
      const url = images[i]
      const res = await this.provider.chatJson({
        role: 'vision',
        systemPrompt: OCR_SYSTEM_PROMPT,
        userContent: [
          { type: 'text', text: 'Transcribe this page verbatim as JSON {"text": "..."}.' },
          { type: 'image_url', image_url: { url } },
        ],
        maxTokens: 4000,
      })
      let text = ''
      try {
        const parsed = JSON.parse(res.content)
        text = String(parsed?.text || '')
      } catch {
        text = res.content // fall back to raw content if not valid JSON
      }
      pages.push({ page: startPage + i, text })
    }
    return pages
  }
}

// ── Provider environment shape (subset of Bindings the providers read) ──
export interface ProviderEnv {
  // ── Kimi / Moonshot (PRIMARY) ──
  KIMI_API_KEY?: string
  KIMI_BASE_URL?: string
  /** Force ONE Kimi model for every role. */
  KIMI_MODEL?: string
  KIMI_REASON_MODEL?: string
  KIMI_VISION_MODEL?: string
  KIMI_HELPER_MODEL?: string
  KIMI_REASONING_EFFORT?: string

  // ── OpenAI (PRIMARY) ──
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  /** Force ONE OpenAI model for every role. */
  OPENAI_MODEL?: string
  OPENAI_REASON_MODEL?: string
  OPENAI_VISION_MODEL?: string
  OPENAI_HELPER_MODEL?: string
  OPENAI_REASONING_EFFORT?: string

  // ── DeepSeek (fallback) ──
  DEEPSEEK_API_KEY?: string
  DEEPSEEK_BASE_URL?: string
  /** Force ONE DeepSeek model for every role. */
  DEEPSEEK_MODEL?: string
  DEEPSEEK_REASON_MODEL?: string
  DEEPSEEK_VISION_MODEL?: string
  DEEPSEEK_HELPER_MODEL?: string
  DEEPSEEK_REASONING_EFFORT?: string
}

// Defaults.
//   reason = strongest model (NEVER a mini) — used for the 21 rules + report.
//   vision = vision-capable model — used for OCR.
//   helper = cheap model — ONLY for optional lightweight preprocessing.
const KIMI_DEFAULTS: Record<ModelRole, string> = {
  reason: 'kimi-k2.7',
  vision: 'kimi-k2.7',
  helper: 'kimi-k2.7',
}
const OPENAI_DEFAULTS: Record<ModelRole, string> = {
  // GPT-5 series default; high-context analysis target.
  reason: 'gpt-5',
  vision: 'gpt-5',
  helper: 'gpt-5-mini', // helper ONLY — never used for rule reasoning
}

const DEEPSEEK_DEFAULTS: Record<ModelRole, string> = {
  reason: 'deepseek-pro-v4',
  vision: 'deepseek-pro-v4',
  helper: 'deepseek-chat',
}

function isUsableKey(k?: string): boolean {
  return typeof k === 'string' && k.trim().length > 10
}

function buildKimi(env: ProviderEnv): AIProvider {
  return new OpenAICompatibleProvider('kimi', {
    apiKey: env.KIMI_API_KEY as string,
    baseUrl: (env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1').replace(/\/$/, ''),
    reasoningEffort: env.KIMI_REASONING_EFFORT,
    forceModel: env.KIMI_MODEL,
    models: {
      reason: env.KIMI_REASON_MODEL || KIMI_DEFAULTS.reason,
      vision: env.KIMI_VISION_MODEL || KIMI_DEFAULTS.vision,
      helper: env.KIMI_HELPER_MODEL || KIMI_DEFAULTS.helper,
    },
  })
}

function buildOpenAI(env: ProviderEnv): AIProvider {
  return new OpenAICompatibleProvider('openai', {
    apiKey: env.OPENAI_API_KEY as string,
    baseUrl: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    reasoningEffort: env.OPENAI_REASONING_EFFORT,
    forceModel: env.OPENAI_MODEL,
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
    reasoningEffort: env.DEEPSEEK_REASONING_EFFORT,
    forceModel: env.DEEPSEEK_MODEL,
    models: {
      reason: env.DEEPSEEK_REASON_MODEL || DEEPSEEK_DEFAULTS.reason,
      vision: env.DEEPSEEK_VISION_MODEL || DEEPSEEK_DEFAULTS.vision,
      helper: env.DEEPSEEK_HELPER_MODEL || DEEPSEEK_DEFAULTS.helper,
    },
  })
}

/**
 * Select the active provider per priority:
 *   DeepSeek Pro v4 → OpenAI (GPT-5) → Kimi.
 * The returned provider is used everywhere; the rest of the app is unchanged.
 */
export function selectProvider(env: ProviderEnv): AIProvider {
  if (isUsableKey(env.DEEPSEEK_API_KEY)) return buildDeepSeek(env)
  if (isUsableKey(env.OPENAI_API_KEY)) return buildOpenAI(env)
  if (isUsableKey(env.KIMI_API_KEY)) return buildKimi(env)
  throw new Error('SERVICE_AUTH: No analysis provider configured. Set DEEPSEEK_API_KEY (primary), OPENAI_API_KEY (fallback), or KIMI_API_KEY.')
}

/** List every configured provider in priority order (for future runtime fallback). */
export function availableProviders(env: ProviderEnv): AIProvider[] {
  const list: AIProvider[] = []
  if (isUsableKey(env.DEEPSEEK_API_KEY)) list.push(buildDeepSeek(env))
  if (isUsableKey(env.OPENAI_API_KEY)) list.push(buildOpenAI(env))
  if (isUsableKey(env.KIMI_API_KEY)) list.push(buildKimi(env))
  return list
}

/** True when at least one provider is configured. */
export function hasProvider(env: ProviderEnv): boolean {
  return isUsableKey(env.OPENAI_API_KEY) || isUsableKey(env.DEEPSEEK_API_KEY) || isUsableKey(env.KIMI_API_KEY)
}

/**
 * Select the OCR provider. Currently the vision-model OCR backed by the active
 * AIProvider. Swap this for GoogleVisionOcr / AzureDocIntelOcr later WITHOUT
 * touching the pipeline — just return a different OcrProvider here.
 */
export function selectOcrProvider(env: ProviderEnv): OcrProvider {
  return new VisionOcrProvider(selectProvider(env))
}
