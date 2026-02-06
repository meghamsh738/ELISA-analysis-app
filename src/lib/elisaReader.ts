import { indexToWellId96, type WellId96 } from './plate96'
import { parseTableText } from './tableText'

export type ElisaWellReading = {
  a450: number | null
  a570: number | null
  net: number | null
}

export type ElisaParseResult = {
  wells: Partial<Record<WellId96, ElisaWellReading>>
  temperatureC: number | null
  warnings: string[]
  format: 'plateBlocks' | 'list'
}

const toNumber = (value: string): number | null => {
  const s = value.trim()
  if (!s) return null
  const up = s.toUpperCase()
  if (['NA', 'NAN', 'INF', '#DIV/0!', 'UNDETERMINED'].includes(up)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const splitPreserve = (line: string, sep: 'tab' | 'comma' | 'semicolon' | 'pipe' | 'whitespace'): string[] => {
  if (sep === 'tab') return line.split('\t').map((c) => c.trim())
  if (sep === 'comma') return line.split(',').map((c) => c.trim())
  if (sep === 'semicolon') return line.split(';').map((c) => c.trim())
  if (sep === 'pipe') return line.split('|').map((c) => c.trim())
  return line.trim().split(/\s+/).map((c) => c.trim())
}

const detectSep = (text: string): 'tab' | 'comma' | 'semicolon' | 'pipe' | 'whitespace' => {
  const head = text.split(/\r?\n/).slice(0, 5).join('\n')
  const counts = {
    tab: (head.match(/\t/g) ?? []).length,
    comma: (head.match(/,/g) ?? []).length,
    semicolon: (head.match(/;/g) ?? []).length,
    pipe: (head.match(/\|/g) ?? []).length,
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const best = sorted[0]?.[0] as keyof typeof counts | undefined
  if (!best) return 'whitespace'
  return counts[best] > 0 ? best : 'whitespace'
}

const tryParsePlateBlocks = (text: string): ElisaParseResult | null => {
  const trimmed = text.replace(/\r/g, '').trim()
  if (!trimmed) return null

  const sep = detectSep(trimmed)
  const lines = trimmed
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)

  const rows = lines.map((l) => splitPreserve(l, sep))
  const headerIdx = rows.findIndex((r) => r.some((c) => /temperature/i.test(c)))
  const resolvedHeaderIdx = headerIdx >= 0 ? headerIdx : rows.findIndex((r) => r.filter((c) => c.trim() === '1').length >= 2)
  if (resolvedHeaderIdx < 0) return null

  const header = rows[resolvedHeaderIdx]
  const oneIndices: number[] = []
  header.forEach((cell, idx) => {
    if (cell.trim() === '1') oneIndices.push(idx)
  })
  if (oneIndices.length < 2) return null
  const start450 = oneIndices[0]
  const start570 = oneIndices[1]

  const dataRows = rows.slice(resolvedHeaderIdx + 1)
  const matrix450: (number | null)[][] = []
  const matrix570: (number | null)[][] = []
  let temperatureC: number | null = null

  for (const row of dataRows) {
    const padded = row.length < start570 + 12 ? [...row, ...Array.from({ length: start570 + 12 - row.length }, () => '')] : row
    const vals450 = Array.from({ length: 12 }, (_, i) => toNumber(padded[start450 + i] ?? ''))
    const vals570 = Array.from({ length: 12 }, (_, i) => toNumber(padded[start570 + i] ?? ''))
    const hasAny = vals450.some((v) => v !== null) || vals570.some((v) => v !== null)
    if (!hasAny) continue

    if (temperatureC === null) {
      // Temperature is usually in the first cell of the first row
      temperatureC = toNumber(padded[0] ?? '') ?? null
    }

    matrix450.push(vals450)
    matrix570.push(vals570)
    if (matrix450.length >= 8) break
  }

  if (matrix450.length < 8 || matrix570.length < 8) return null

  const wells: Partial<Record<WellId96, ElisaWellReading>> = {}
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 12; c += 1) {
      const well = indexToWellId96(r * 12 + c)
      if (!well) continue
      const a450 = matrix450[r]?.[c] ?? null
      const a570 = matrix570[r]?.[c] ?? null
      const net = a450 !== null && a570 !== null ? a450 - a570 : null
      wells[well] = { a450, a570, net }
    }
  }

  return { wells, temperatureC, warnings: [], format: 'plateBlocks' }
}

const tryParseList = (text: string): ElisaParseResult | null => {
  const trimmed = text.replace(/\r/g, '').trim()
  if (!trimmed) return null

  const table = parseTableText(trimmed, { hasHeader: true })
  if (table.headers.length < 2) return null

  const h = table.headers.map((v) => v.trim().toLowerCase())
  const idx450 = h.findIndex((c) => c === '450' || c.includes('450'))
  const idx570 = h.findIndex((c) => c === '570' || c.includes('570'))
  if (idx450 < 0 || idx570 < 0) return null

  const idxWell = h.findIndex((c) => c === 'well' || c.includes('well') || c.includes('position'))
  const idxIndex = idxWell < 0 ? 0 : -1

  const wells: Partial<Record<WellId96, ElisaWellReading>> = {}
  const warnings: string[] = []

  for (const row of table.rows) {
    const a450 = toNumber(row[idx450] ?? '')
    const a570 = toNumber(row[idx570] ?? '')
    const net = a450 !== null && a570 !== null ? a450 - a570 : null

    let wellId: WellId96 | null = null

    if (idxWell >= 0) {
      const raw = (row[idxWell] ?? '').trim()
      const match = /^([A-H])\s*([1-9]|1[0-2])$/i.exec(raw)
      if (match) {
        wellId = `${match[1].toUpperCase()}${Number(match[2])}` as WellId96
      }
    } else {
      // Fall back to sequential index (1..96).
      const n = Number((row[idxIndex] ?? '').trim())
      if (Number.isFinite(n) && n >= 1 && n <= 96) {
        wellId = indexToWellId96(n - 1)
      }
    }

    if (!wellId) continue
    wells[wellId] = { a450, a570, net }
  }

  if (!Object.keys(wells).length) {
    warnings.push('No well readings could be mapped from the list format.')
  }

  return { wells, temperatureC: null, warnings, format: 'list' }
}

export const parseElisaReaderText = (text: string): ElisaParseResult => {
  const warnings: string[] = []

  const block = tryParsePlateBlocks(text)
  if (block) return block

  const list = tryParseList(text)
  if (list) return list

  warnings.push('Could not parse the reader output. Try pasting the 450/570 plate blocks as tab-separated text.')
  return { wells: {}, temperatureC: null, warnings, format: 'plateBlocks' }
}
