import { indexToWellId96, type WellId96 } from './plate96'
import { parseTableText } from './tableText'

export type ElisaWellReading = {
  a450: number | null
  a570: number | null
  net: number | null
  issues?: string[]
  original?: Record<string, string>
}
export type ReaderRow = {
  row: number
  wellId: string
  values: string[]
  issues: string[]
}
export type ElisaParseResult = {
  wells: Partial<Record<WellId96, ElisaWellReading>>
  temperatureC: number | null
  warnings: string[]
  format: 'plateBlocks' | 'list'
  rows: ReaderRow[]
  headers: string[]
  unmatchedCount: number
  duplicateCount: number
}
const numeric = (raw: string): number | null =>
  raw.trim() && Number.isFinite(Number(raw)) ? Number(raw) : null
const split = (line: string) =>
  line.includes('\t')
    ? line.split('\t')
    : line.includes(',')
      ? line.split(',')
      : line.includes(';')
        ? line.split(';')
        : line.trim().split(/\s+/)
const wellId = (raw: string): WellId96 | null => {
  const match = /^([A-H])\s*0?([1-9]|1[0-2])$/i.exec(raw.trim())
  return match
    ? (`${match[1].toUpperCase()}${Number(match[2])}` as WellId96)
    : null
}
const fieldIssue = (label: string, value: string) =>
  numeric(value) === null
    ? `${label} ${value.trim() ? 'is not numeric' : 'is missing'}`
    : ''

export const parseElisaReaderText = (
  text: string,
  inputMode?: 'raw' | 'wavelengthCorrected' | 'blankCorrected',
): ElisaParseResult => {
  const result: ElisaParseResult = {
    wells: {},
    temperatureC: null,
    warnings: [],
    format: 'list',
    rows: [],
    headers: [],
    unmatchedCount: 0,
    duplicateCount: 0,
  }
  if (!text.trim()) return result
  const lines = text.replace(/\r/g, '').split('\n')
  while (lines.at(-1) === '') lines.pop()
  // The existing reader format contains two adjacent 12-column wavelength blocks.
  const blockHeader = lines.findIndex((line) => {
    const cells = split(line)
    return (
      cells.filter(
        (cell, i) =>
          cell.trim() === '1' &&
          Array.from({ length: 12 }, (_, j) => String(j + 1)).every(
            (value, j) => cells[i + j]?.trim() === value,
          ),
      ).length >= 2
    )
  })
  if (blockHeader >= 0) {
    result.format = 'plateBlocks'
    if (inputMode && inputMode !== 'raw')
      result.warnings.push(
        'Wavelength blocks contain raw readings. Select raw input, or provide a Well/Absorbance table of corrected values.',
      )
    const headers = split(lines[blockHeader])
    const starts = headers.flatMap((cell, i) =>
      cell.trim() === '1' ? [i] : [],
    )
    result.headers = ['Well', '450', '570', 'Original plate row']
    const rows = lines.slice(blockHeader + 1)
    if (rows.length !== 8)
      result.warnings.push(
        `Expected 8 plate rows; found ${rows.length}. Correct the input before confirming.`,
      )
    rows.forEach((line, rowIndex) => {
      const cells = split(line)
      if (rowIndex >= 8) {
        result.rows.push({
          row: blockHeader + rowIndex + 2,
          wellId: '',
          values: cells,
          issues: ['Unmatched extra plate row'],
        })
        result.unmatchedCount++
        return
      }
      const separatorColumns = headers.flatMap((value, index) =>
        index > starts[0] && !value.trim() ? [index] : [],
      )
      const shapeIssue =
        cells.length !== headers.length ||
        separatorColumns.some((index) => cells[index]?.trim())
          ? `Plate row ${rowIndex + 1} has missing or misplaced cells; check every separator against the header.`
          : ''
      if (shapeIssue) result.warnings.push(shapeIssue)
      if (!rowIndex) result.temperatureC = numeric(cells[0] ?? '')
      for (let col = 0; col < 12; col++) {
        const id = indexToWellId96(rowIndex * 12 + col)!
        const raw450 = cells[starts[0] + col] ?? ''
        const raw570 = cells[starts[1] + col] ?? ''
        const a450 = numeric(raw450)
        const a570 = numeric(raw570)
        const issues = [
          shapeIssue,
          fieldIssue('450', raw450),
          fieldIssue('570', raw570),
        ].filter(Boolean)
        result.wells[id] = {
          a450,
          a570,
          net: a450 !== null && a570 !== null ? a450 - a570 : null,
          issues,
          original: { '450': raw450, '570': raw570, plateRow: line },
        }
        result.rows.push({
          row: blockHeader + rowIndex + 2,
          wellId: id,
          values: [id, raw450, raw570, line],
          issues,
        })
      }
    })
    return result
  }
  const table = parseTableText(text, { hasHeader: true })
  result.warnings.push(...table.warnings)
  result.headers = table.headers
  const normalized = table.headers.map((h) =>
    h.trim().toLowerCase().replace(/[ _-]/g, ''),
  )
  const wi = normalized.findIndex((h) =>
    ['well', 'wellid', 'position', 'wellposition'].includes(h),
  )
  const ai = normalized.findIndex((h) => /450/.test(h))
  const bi = normalized.findIndex((h) => /570/.test(h))
  const ni = normalized.findIndex((h) =>
    [
      'absorbance',
      'net',
      'value',
      'corrected',
      'correctedabsorbance',
      'netabsorbance',
    ].includes(h),
  )
  if ((ai < 0 || bi < 0) && ni < 0)
    result.warnings.push(
      'Use Well, 450 and 570 columns, or Well and Absorbance for already corrected input.',
    )
  if (inputMode === 'raw' && (ai < 0 || bi < 0))
    result.warnings.push(
      'Raw input requires both 450 and 570 columns. Select the appropriate corrected-input type for an Absorbance table.',
    )
  if (inputMode && inputMode !== 'raw' && ni < 0)
    result.warnings.push(
      'Corrected input requires an explicit Absorbance or Net column. Raw wavelengths cannot be declared corrected.',
    )
  if (new Set(normalized).size !== normalized.length)
    result.warnings.push('Duplicate column headings need correction.')
  for (const [i, values] of table.rows.entries()) {
    const index = Number(values[0])
    const id =
      wi >= 0
        ? wellId(values[wi] ?? '')
        : Number.isInteger(index) && index >= 1 && index <= 96
          ? indexToWellId96(index - 1)
          : null
    const raw450 = values[ai] ?? ''
    const raw570 = values[bi] ?? ''
    const rawNet = values[ni] ?? ''
    const a450 = numeric(raw450)
    const a570 = numeric(raw570)
    const issues: string[] = []
    if (!id) {
      issues.push('Well must be A1–H12, or a whole-number index from 1 to 96')
      result.unmatchedCount++
    }
    if (inputMode === 'raw' || (!inputMode && ai >= 0 && bi >= 0))
      issues.push(
        ...[fieldIssue('450', raw450), fieldIssue('570', raw570)].filter(
          Boolean,
        ),
      )
    else if (ni >= 0)
      issues.push(...[fieldIssue('Absorbance', rawNet)].filter(Boolean))
    const net =
      ni >= 0
        ? numeric(rawNet)
        : a450 !== null && a570 !== null
          ? a450 - a570
          : null
    if (id) {
      if (result.wells[id]) {
        issues.push('Duplicate well identity')
        result.duplicateCount++
        result.wells[id] = {
          ...result.wells[id]!,
          issues: ['Duplicate well identity'],
          a450: null,
          a570: null,
          net: null,
        }
        for (const row of result.rows.filter((row) => row.wellId === id))
          row.issues.push('Duplicate well identity')
      } else
        result.wells[id] = {
          a450,
          a570,
          net,
          issues: [...issues],
          original: Object.fromEntries(
            table.headers.map((h, j) => [h, values[j] ?? '']),
          ),
        }
    }
    result.rows.push({
      row: i + 2,
      wellId: id ?? values[wi] ?? values[0] ?? '',
      values,
      issues,
    })
  }
  if (!table.rows.length) result.warnings.push('No reader rows found.')
  if (result.unmatchedCount)
    result.warnings.push(
      `${result.unmatchedCount} unmatched row(s) require correction.`,
    )
  if (result.duplicateCount)
    result.warnings.push(
      `${result.duplicateCount} duplicate well row(s) require correction.`,
    )
  return result
}
