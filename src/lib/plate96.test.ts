import { describe, expect, it } from 'vitest'
import { indexToWellId96, plate96WellIds, plate96WellIdsColumnMajor, toWellIndex96, wellRange96 } from './plate96'

describe('plate96', () => {
  it('generates 96 well ids in A1..H12 order', () => {
    expect(plate96WellIds).toHaveLength(96)
    expect(plate96WellIds[0]).toBe('A1')
    expect(plate96WellIds[11]).toBe('A12')
    expect(plate96WellIds[12]).toBe('B1')
    expect(plate96WellIds[95]).toBe('H12')
  })

  it('generates 96 well ids in column-major order', () => {
    expect(plate96WellIdsColumnMajor).toHaveLength(96)
    expect(plate96WellIdsColumnMajor[0]).toBe('A1')
    expect(plate96WellIdsColumnMajor[7]).toBe('H1')
    expect(plate96WellIdsColumnMajor[8]).toBe('A2')
    expect(plate96WellIdsColumnMajor[95]).toBe('H12')
  })

  it('maps well ids to indices and back', () => {
    for (const wellId of ['A1', 'A12', 'B1', 'D7', 'H12'] as const) {
      const idx = toWellIndex96(wellId)
      expect(idx).not.toBeNull()
      expect(indexToWellId96(idx!)).toBe(wellId)
    }
  })

  it('creates selection ranges', () => {
    expect(wellRange96('A1', 'A3')).toEqual(['A1', 'A2', 'A3'])
    expect(wellRange96('A3', 'A1')).toEqual(['A1', 'A2', 'A3'])
    expect(wellRange96('A12', 'B2')).toEqual(['A12', 'B1', 'B2'])
  })
})
