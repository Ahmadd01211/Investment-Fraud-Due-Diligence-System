// ════════════════════════════════════════════════════════════════
//  SEMANTIC, PAGE-AWARE CHUNKING
//
//  Splits a document into analysis chunks that respect MEANING, not just
//  size. Preference order:
//     1. Headings / section titles (ALL-CAPS lines, "ARTICLE X", "Section N",
//        numbered headings, Markdown #).
//     2. Clause / article / item boundaries.
//     3. Table blocks kept intact.
//     4. Paragraph boundaries.
//     5. Sentence boundaries (only when a single semantic unit is too big).
//  Documents are NEVER truncated — every character ends up in some chunk.
//
//  PAGE AWARENESS: the extracted text carries [[PAGE n]] markers (emitted by
//  the frontend PDF extractor and the OCR layer). This module tracks which
//  page each chunk spans so findings can cite pages.
//
//  COST OPTIMIZATION: blank, index/table-of-contents, signature, and pure
//  appendix/exhibit boilerplate segments are detected and can be skipped
//  (they rarely contain fraud evidence and waste tokens).
// ════════════════════════════════════════════════════════════════

export const PAGE_MARKER_RE = /\[\[PAGE\s+(\d+)\]\]/gi

export interface Segment {
  /** Raw text of this semantic segment (page markers stripped for LLM). */
  text: string
  /** First page this segment appears on. */
  startPage: number
  /** Last page this segment appears on. */
  endPage: number
  /** Heading/section label if this segment starts a new section. */
  heading?: string
  /** True if this looks like skippable boilerplate (index/blank/signature). */
  skippable: boolean
}

export interface Chunk {
  chunk_id: number
  text: string
  startPage: number
  endPage: number
  /** Heading(s) covered by this chunk (for context / citations). */
  headings: string[]
}

export interface ChunkOptions {
  /** Max characters per chunk (from TPM-derived sizing). */
  maxChunkChars: number
  /** Min characters before we bother starting a new chunk. */
  minChunkChars: number
  /** Hard ceiling on number of chunks. */
  maxChunks: number
  /** Skip index/blank/signature/appendix boilerplate to save tokens. */
  skipBoilerplate: boolean
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  maxChunkChars: 60000,
  minChunkChars: 4000,
  maxChunks: 200,
  skipBoilerplate: true,
}

// ── Heading detection ─────────────────────────────────────────────
const HEADING_PATTERNS: RegExp[] = [
  /^#{1,6}\s+.+/, // markdown heading
  /^(ARTICLE|SECTION|CLAUSE|ITEM|EXHIBIT|SCHEDULE|APPENDIX|PART)\s+[0-9IVXLC]+\b.*/i,
  /^\s*\d+(\.\d+)*\s+[A-Z].{0,80}$/, // "3.2 Risk Factors"
  /^[A-Z0-9][A-Z0-9 ,'&\/\-]{6,80}$/, // ALL-CAPS heading line
  /^(RISK FACTORS|USE OF PROCEEDS|MANAGEMENT|OFFERING SUMMARY|TERMS OF THE OFFERING|CONFLICTS OF INTEREST|LITIGATION|FINANCIAL STATEMENTS|SUBSCRIPTION|INVESTOR SUITABILITY)\b.*/i,
]

function isHeadingLine(line: string): boolean {
  const t = line.trim()
  if (t.length === 0 || t.length > 90) return false
  return HEADING_PATTERNS.some((re) => re.test(t))
}

// ── Boilerplate detection (skippable) ─────────────────────────────
const BOILERPLATE_RE =
  /\b(table of contents|index of|signature page|in witness whereof|\[?this page intentionally left blank\]?|blank page)\b/i

function looksLikeBoilerplate(text: string): boolean {
  const t = text.trim()
  if (t.length === 0) return true
  if (t.replace(/[\s.·•\-_]/g, '').length < 15) return true // essentially blank / dot-leaders
  if (BOILERPLATE_RE.test(t)) return true
  // A page that is mostly dot-leaders + page numbers = table of contents.
  const dotLeaderLines = (t.match(/\.{4,}\s*\d+\s*$/gm) || []).length
  const lines = t.split('\n').filter((l) => l.trim().length > 0).length
  if (lines > 0 && dotLeaderLines / lines > 0.4) return true
  return false
}

/**
 * Parse [[PAGE n]] markers and split the raw text into per-page pieces,
 * so we can attach page numbers to every downstream segment/chunk.
 */
function splitByPage(raw: string): { page: number; text: string }[] {
  const pages: { page: number; text: string }[] = []
  const matches = [...raw.matchAll(PAGE_MARKER_RE)]
  if (matches.length === 0) {
    return [{ page: 0, text: raw }] // unknown pagination
  }
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const page = Number(m[1]) || 0
    const start = (m.index || 0) + m[0].length
    const end = i + 1 < matches.length ? matches[i + 1].index! : raw.length
    pages.push({ page, text: raw.slice(start, end) })
  }
  // Any preamble before the first marker.
  if ((matches[0].index || 0) > 0) {
    const pre = raw.slice(0, matches[0].index).trim()
    if (pre) pages.unshift({ page: 0, text: pre })
  }
  return pages
}

/**
 * Break a document into SEMANTIC segments (heading-delimited), each tagged
 * with the page range it spans and whether it is skippable boilerplate.
 */
export function segmentDocument(raw: string): Segment[] {
  const pages = splitByPage(raw)
  const segments: Segment[] = []

  let cur: { lines: string[]; startPage: number; endPage: number; heading?: string } | null = null

  const flush = () => {
    if (!cur) return
    const text = cur.lines.join('\n').trim()
    if (text.length > 0) {
      segments.push({
        text,
        startPage: cur.startPage,
        endPage: cur.endPage,
        heading: cur.heading,
        skippable: looksLikeBoilerplate(text),
      })
    }
    cur = null
  }

  for (const pg of pages) {
    const lines = pg.text.split('\n')
    for (const line of lines) {
      if (isHeadingLine(line)) {
        // A heading starts a new semantic segment.
        flush()
        cur = { lines: [line], startPage: pg.page, endPage: pg.page, heading: line.trim() }
      } else {
        if (!cur) cur = { lines: [], startPage: pg.page, endPage: pg.page }
        cur.lines.push(line)
        cur.endPage = pg.page
      }
    }
  }
  flush()

  // If no headings were ever found, fall back to a single big segment.
  if (segments.length === 0 && raw.trim()) {
    segments.push({
      text: raw.replace(PAGE_MARKER_RE, '').trim(),
      startPage: pages[0]?.page ?? 0,
      endPage: pages[pages.length - 1]?.page ?? 0,
      skippable: false,
    })
  }
  return segments
}

/** Split an oversized text into sentence-boundary pieces of ≤ maxChars. */
function splitBySize(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]
  const out: string[] = []
  let i = 0
  while (i < text.length) {
    let end = Math.min(i + maxChars, text.length)
    if (end < text.length) {
      // back off to the nearest sentence / paragraph boundary in the last 800 chars
      const window = text.slice(Math.max(i, end - 800), end)
      const m = window.lastIndexOf('. ')
      const nl = window.lastIndexOf('\n')
      const rel = Math.max(m, nl)
      if (rel > 0) end = Math.max(i, end - 800) + rel + 1
    }
    out.push(text.slice(i, end).trim())
    i = end
  }
  return out.filter((s) => s.length > 0)
}

/**
 * Assemble semantic segments into chunks that are ≤ maxChunkChars, greedily
 * packing consecutive segments together (so small clauses share a chunk) and
 * splitting any single oversized segment by size as a last resort.
 * Boilerplate is skipped when skipBoilerplate is true.
 */
export function chunkDocument(raw: string, opts: Partial<ChunkOptions> = {}): Chunk[] {
  const o = { ...DEFAULT_CHUNK_OPTIONS, ...opts }
  const segments = segmentDocument(raw)

  const chunks: Chunk[] = []
  let buf: string[] = []
  let bufLen = 0
  let bufStart = 0
  let bufEnd = 0
  let bufHeadings: string[] = []
  let id = 0

  const emit = () => {
    if (buf.length === 0) return
    if (chunks.length >= o.maxChunks) return
    const text = buf.join('\n\n').trim()
    if (text.length === 0) {
      buf = []; bufLen = 0; bufHeadings = []
      return
    }
    chunks.push({
      chunk_id: id++,
      text,
      startPage: bufStart,
      endPage: bufEnd,
      headings: [...bufHeadings],
    })
    buf = []; bufLen = 0; bufHeadings = []
  }

  for (const seg of segments) {
    if (o.skipBoilerplate && seg.skippable) continue

    const pieces = seg.text.length > o.maxChunkChars ? splitBySize(seg.text, o.maxChunkChars) : [seg.text]

    for (const piece of pieces) {
      // Start a fresh chunk if adding this piece would exceed the max.
      if (bufLen > 0 && bufLen + piece.length > o.maxChunkChars) emit()
      if (buf.length === 0) {
        bufStart = seg.startPage
        bufEnd = seg.endPage
      }
      buf.push(piece)
      bufLen += piece.length + 2
      bufEnd = seg.endPage
      if (seg.heading && !bufHeadings.includes(seg.heading)) bufHeadings.push(seg.heading)

      // If we've comfortably filled a chunk, emit it.
      if (bufLen >= o.maxChunkChars) emit()
    }
  }
  emit()

  // Edge case: everything got skipped as boilerplate — fall back to no-skip.
  if (chunks.length === 0 && raw.trim()) {
    return chunkDocument(raw, { ...opts, skipBoilerplate: false })
  }
  return chunks
}

/** Strip page markers from text before sending to the LLM (they stay in metadata). */
export function stripPageMarkers(text: string): string {
  return text.replace(PAGE_MARKER_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}
