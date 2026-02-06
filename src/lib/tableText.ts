export type TableText = {
  headers: string[]
  rows: string[][]
  maxColumns: number
  warnings: string[]
  separator: 'tab' | 'comma' | 'semicolon' | 'pipe' | 'whitespace'
}

type ParseOptions = {
  hasHeader: boolean
}

const detectSeparator = (text: string): TableText['separator'] => {
  const head = text.split(/\r?\n/).slice(0, 5).join('\n')
  const counts = {
    tab: (head.match(/\t/g) ?? []).length,
    comma: (head.match(/,/g) ?? []).length,
    semicolon: (head.match(/;/g) ?? []).length,
    pipe: (head.match(/\|/g) ?? []).length,
  }
  const best = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    'whitespace') as keyof typeof counts
  return counts[best] > 0 ? (best as TableText['separator']) : 'whitespace'
}

const splitRow = (line: string, sep: TableText['separator']): string[] => {
  if (sep === 'tab') return line.split('\t').map((c) => c.trim())
  if (sep === 'comma') return line.split(',').map((c) => c.trim())
  if (sep === 'semicolon') return line.split(';').map((c) => c.trim())
  if (sep === 'pipe') return line.split('|').map((c) => c.trim())
  return line.trim().split(/\s+/).map((c) => c.trim())
}

export const parseTableText = (text: string, options: ParseOptions): TableText => {
  const trimmed = text.replace(/\r/g, '').trim()
  if (!trimmed) {
    return { headers: [], rows: [], maxColumns: 0, warnings: [], separator: 'whitespace' }
  }

  const separator = detectSeparator(trimmed)
  const rawLines = trimmed
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)

  const rawRows = rawLines.map((line) => splitRow(line, separator))
  const maxColumns = rawRows.reduce((max, row) => Math.max(max, row.length), 0)

  const normalized = rawRows.map((row) => {
    if (row.length === maxColumns) return row
    return [...row, ...Array.from({ length: maxColumns - row.length }, () => '')]
  })

  const warnings: string[] = []
  if (normalized.length && normalized.some((r) => r.length !== maxColumns)) {
    warnings.push('Some rows have fewer columns than others; missing cells were padded with blanks.')
  }

  const headers = options.hasHeader
    ? normalized[0].map((h, idx) => (h.trim() ? h.trim() : `Column ${idx + 1}`))
    : Array.from({ length: maxColumns }, (_, idx) => `Column ${idx + 1}`)

  const rows = options.hasHeader ? normalized.slice(1) : normalized
  return { headers, rows, maxColumns, warnings, separator }
}

export const guessColumnIndex = (
  table: Pick<TableText, 'headers' | 'rows'>,
  kind: 'animalId' | 'group' | 'dilutionFactor'
): number => {
  if (!table.headers.length) return 0

  const headerMatch = (pattern: RegExp) =>
    table.headers.findIndex((h) => pattern.test(h.trim().toLowerCase()))

  if (kind === 'group') {
    const byName = headerMatch(/^(group|treatment|condition)$/i)
    return byName >= 0 ? byName : -1
  }

  if (kind === 'dilutionFactor') {
    const byName = headerMatch(/^(dilution|dilution factor|dilution_factor|dilutionfactor|dil|df)$/i)
    if (byName >= 0) return byName

    // Heuristic: prefer columns that look like "10", "2", "1:10", "1/10", "10x", etc.
    const dilutionLike = (v: string) =>
      /^\s*\d+(\.\d+)?\s*$/.test(v) ||
      /^\s*1\s*[:/]\s*\d+(\.\d+)?\s*$/.test(v) ||
      /^\s*\d+(\.\d+)?\s*x\s*$/i.test(v) ||
      /^\s*x\s*\d+(\.\d+)?\s*$/i.test(v)

    const scores = table.headers.map((_, colIdx) => {
      const values = table.rows.map((r) => (r[colIdx] ?? '').trim()).filter(Boolean)
      if (values.length < 2) return -1
      const hits = values.filter(dilutionLike).length
      const ratio = hits / values.length
      if (ratio < 0.6) return -1
      return hits
    })

    const best = scores
      .map((score, idx) => ({ score, idx }))
      .sort((a, b) => b.score - a.score)[0]
    return best?.score > 0 ? best.idx : -1
  }

  const byName = headerMatch(/^(animal|animal id|animal_id|id|mouse|rat)$/i)
  if (byName >= 0) return byName

  const colScores = table.headers.map((_, colIdx) => {
    const values = table.rows.map((r) => r[colIdx] ?? '').filter(Boolean)
    if (!values.length) return -1
    const numeric = values.filter((v) => /^[+-]?\d+(\.\d+)?$/.test(v.trim())).length
    const alpha = values.filter((v) => /[A-Za-z]/.test(v)).length
    const avgLen = values.reduce((acc, v) => acc + v.length, 0) / values.length
    // prefer "mostly non-numeric", has letters, and not too short
    return alpha * 2 + (values.length - numeric) + Math.min(3, avgLen / 4)
  })

  const best = colScores
    .map((score, idx) => ({ score, idx }))
    .sort((a, b) => b.score - a.score)[0]
  return best?.idx ?? 0
}
