export const PLATE96_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
export const PLATE96_COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

export type Plate96Row = (typeof PLATE96_ROWS)[number]
export type Plate96Col = (typeof PLATE96_COLS)[number]
export type WellId96 = `${Plate96Row}${Plate96Col}`

export const plate96WellIds = (() => {
  const wells: WellId96[] = []
  for (const row of PLATE96_ROWS) {
    for (const col of PLATE96_COLS) {
      wells.push(`${row}${col}` as WellId96)
    }
  }
  return wells
})()

export const plate96WellIdsColumnMajor = (() => {
  const wells: WellId96[] = []
  for (const col of PLATE96_COLS) {
    for (const row of PLATE96_ROWS) {
      wells.push(`${row}${col}` as WellId96)
    }
  }
  return wells
})()

export const toWellIndex96 = (wellId: string): number | null => {
  const match = /^([A-H])\s*([1-9]|1[0-2])$/i.exec(wellId.trim())
  if (!match) return null
  const row = match[1].toUpperCase() as Plate96Row
  const col = Number(match[2]) as Plate96Col
  const rowIdx = PLATE96_ROWS.indexOf(row)
  const colIdx = PLATE96_COLS.indexOf(col)
  if (rowIdx < 0 || colIdx < 0) return null
  return rowIdx * 12 + colIdx
}

export const wellRange96 = (from: string, to: string): WellId96[] => {
  const a = toWellIndex96(from)
  const b = toWellIndex96(to)
  if (a === null || b === null) return []
  const start = Math.min(a, b)
  const end = Math.max(a, b)
  return plate96WellIds.slice(start, end + 1)
}

export const indexToWellId96 = (index: number): WellId96 | null => {
  if (!Number.isFinite(index)) return null
  const idx = Math.trunc(index)
  if (idx < 0 || idx >= 96) return null
  return plate96WellIds[idx] ?? null
}
