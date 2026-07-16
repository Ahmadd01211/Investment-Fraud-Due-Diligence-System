// ════════════════════════════════════════════════════════════════
//  DETERMINISTIC TEXT MERGE + REDUNDANCY REMOVAL  (NO LLM)
//
//  The reasoning model (DeepSeek) only ever receives clean TEXT. This module
//  merges the investor's pasted/PDF/DOCX text with the OCR'd text from images
//  / scanned pages into ONE authoritative document, dropping lines that are
//  duplicated across sources so the model isn't shown the same content twice.
//
//  Pure functions — no network, no LLM, fully deterministic.
// ════════════════════════════════════════════════════════════════

const PAGE_MARKER_RE = /\[\[PAGE\s+(\d+)\]\]/gi

/** Highest [[PAGE n]] number present in the text (0 if none). */
export function maxPageMarker(text: string): number {
  let max = 0
  const src = String(text || '')
  let m: RegExpExecArray | null
  PAGE_MARKER_RE.lastIndex = 0
  while ((m = PAGE_MARKER_RE.exec(src)) !== null) {
    const n = Number(m[1]) || 0
    if (n > max) max = n
  }
  return max
}

/** Join non-empty OCR pages as "[[PAGE n]]\n<text>" blocks. */
export function ocrPagesToMarkedText(pages: { page: number; text: string }[]): string {
  return (pages || [])
    .filter((p) => p && String(p.text || '').trim().length > 0)
    .map((p) => `[[PAGE ${p.page}]]\n${String(p.text).trim()}`)
    .join('\n\n')
    .trim()
}

/** Normalized dedup key for a line (lowercase, collapse non-alphanumerics). */
function normalizeKey(line: string): string {
  return String(line || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export interface MergeStats {
  ocrPagesUsed: number
  ocrPagesSkipped: number
  duplicateLinesDropped: number
}

/**
 * Merge pasted text (authoritative, emitted verbatim first) with OCR text,
 * dropping OCR lines already present in the pasted text (or earlier OCR pages).
 *
 * - Pasted text is emitted VERBATIM and every one of its lines is recorded in
 *   a "seen" set (normalized key, keys shorter than 8 chars ignored).
 * - OCR text is walked page-block by page-block; within a block only lines
 *   whose normalized key is NOT already seen are kept (then added to seen).
 *   If a whole block yields nothing new, that page is skipped entirely.
 *   [[PAGE n]] markers are preserved for kept blocks.
 */
export function mergeTextSources(pasted: string, ocrText: string): { text: string; stats: MergeStats } {
  const pastedText = String(pasted || '')
  const ocr = String(ocrText || '')

  const seen = new Set<string>()
  const remember = (line: string) => {
    const key = normalizeKey(line)
    if (key.length >= 8) seen.add(key)
  }

  // Record every pasted line (verbatim output preserved separately).
  for (const line of pastedText.split('\n')) remember(line)

  const stats: MergeStats = { ocrPagesUsed: 0, ocrPagesSkipped: 0, duplicateLinesDropped: 0 }

  // Split OCR text into page blocks. A block header is a line containing a
  // [[PAGE n]] marker; content before the first marker is its own block.
  const outBlocks: string[] = []
  if (ocr.trim().length > 0) {
    const lines = ocr.split('\n')
    let currentHeader: string | null = null
    let currentBody: string[] = []

    const flush = () => {
      if (currentHeader === null && currentBody.length === 0) return
      const kept: string[] = []
      for (const bodyLine of currentBody) {
        if (bodyLine.trim().length === 0) {
          kept.push(bodyLine)
          continue
        }
        const key = normalizeKey(bodyLine)
        if (key.length >= 8 && seen.has(key)) {
          stats.duplicateLinesDropped += 1
          continue
        }
        kept.push(bodyLine)
        if (key.length >= 8) seen.add(key)
      }
      const hasContent = kept.some((l) => l.trim().length > 0)
      if (hasContent) {
        stats.ocrPagesUsed += 1
        outBlocks.push((currentHeader ? currentHeader + '\n' : '') + kept.join('\n').trim())
      } else if (currentHeader !== null || currentBody.length > 0) {
        stats.ocrPagesSkipped += 1
      }
      currentHeader = null
      currentBody = []
    }

    for (const line of lines) {
      PAGE_MARKER_RE.lastIndex = 0
      if (PAGE_MARKER_RE.test(line)) {
        // New page block starts.
        flush()
        currentHeader = line.trim()
      } else {
        currentBody.push(line)
      }
    }
    flush()
  }

  const parts: string[] = []
  if (pastedText.trim().length > 0) parts.push(pastedText.trim())
  const mergedOcr = outBlocks.join('\n\n').trim()
  if (mergedOcr.length > 0) parts.push(mergedOcr)

  return { text: parts.join('\n\n').trim(), stats }
}
