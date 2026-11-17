import { describe, expect, it } from 'vitest'
import { parseElisaReaderText } from './elisaReader'

describe('elisaReader', () => {
  it('parses 450/570 plate blocks and computes net', () => {
    const header =
      'Temperature(°C)\t1\t2\t3\t4\t5\t6\t7\t8\t9\t10\t11\t12\t\t1\t2\t3\t4\t5\t6\t7\t8\t9\t10\t11\t12'
    const rowA =
      '23.8\t0.9768\t0.8699\t0.9769\t0.4967\t0.2348\t0.1013\t0.1044\t0.109\t0.1059\t0.1071\t0.1008\t0.1055\t\t0.1063\t0.1013\t0.1025\t0.0939\t0.104\t0.0928\t0.0954\t0.0992\t0.0962\t0.0982\t0.0887\t0.0965'
    const rowB =
      '\t0.8951\t0.9967\t0.9746\t0.4795\t0.2179\t0.1068\t0.1029\t0.1022\t0.1027\t0.11\t0.1067\t0.1067\t\t0.0997\t0.1012\t0.1082\t0.0995\t0.1011\t0.0959\t0.0945\t0.0933\t0.0959\t0.101\t0.0979\t0.0984'
    const rowC =
      '\t1.1572\t0.9335\t0.8637\t0.3671\t0.173\t0.1045\t0.1018\t0.1003\t0.1033\t0.1016\t0.1009\t0.1176\t\t0.1029\t0.0966\t0.0965\t0.0989\t0.0959\t0.0932\t0.0919\t0.0926\t0.0949\t0.0933\t0.0927\t0.1068'

    // Fill to 8 rows; values aren't important for the test beyond A1.
    const filler = rowB
    const text = [
      header,
      rowA,
      rowB,
      rowC,
      filler,
      filler,
      filler,
      filler,
      filler,
    ].join('\n')

    const parsed = parseElisaReaderText(text)
    expect(Object.keys(parsed.wells).length).toBeGreaterThan(0)
    expect(parsed.wells.A1?.a450).toBeCloseTo(0.9768, 6)
    expect(parsed.wells.A1?.a570).toBeCloseTo(0.1063, 6)
    expect(parsed.wells.A1?.net).toBeCloseTo(0.8705, 6)
  })
})

it('retains malformed and unmatched rows and rejects duplicate wells', () => {
  const parsed = parseElisaReaderText(
    'Well\t450\t570\nA1\t1\t1\nA2\tbad\t0.1\nZ9\t2\t0.1\nA1\t3\t0.1',
  )
  expect(parsed.format).toBe('list')
  expect(parsed.rows).toHaveLength(4)
  expect(parsed.unmatchedCount).toBe(1)
  expect(parsed.duplicateCount).toBe(1)
  expect(parsed.wells.A1?.net).toBeNull()
  expect(parsed.wells.A2?.original?.['450']).toBe('bad')
  expect(parsed.wells.A2?.issues?.length).toBeGreaterThan(0)
})
it('reads explicitly corrected absorbance without inventing wavelengths', () => {
  const parsed = parseElisaReaderText('Well,Absorbance\nA1,0.45\nA2,-0.03')
  expect(parsed.wells.A1?.net).toBe(0.45)
  expect(parsed.wells.A1?.a450).toBeNull()
  expect(parsed.wells.A2?.net).toBe(-0.03)
  expect(parsed.rows).toHaveLength(2)
})
it('does not shift later plate rows when a whole row is missing or invalid', () => {
  const header =
    'Temperature\t' +
    Array.from({ length: 12 }, (_, i) => i + 1).join('\t') +
    '\t' +
    Array.from({ length: 12 }, (_, i) => i + 1).join('\t')
  const row = (value: string) =>
    '\t' +
    Array(12).fill(value).join('\t') +
    '\t' +
    Array(12).fill('0').join('\t')
  const parsed = parseElisaReaderText(
    [header, row('1'), row('bad'), ...Array(6).fill(row('3'))].join('\n'),
  )
  expect(parsed.wells.A1?.net).toBe(1)
  expect(parsed.wells.B1?.net).toBeNull()
  expect(parsed.wells.C1?.net).toBe(3)
})
it('accepts quoted CSV numbers and preserves original logical rows', () => {
  const parsed = parseElisaReaderText(
    '"Well","450","570"\n"A1","0.8","0.2"\n"A2","bad","0.2"',
  )
  expect(parsed.wells.A1?.net).toBeCloseTo(0.6)
  expect(parsed.wells.A2?.issues).toEqual(['450 is not numeric'])
  expect(parsed.rows).toHaveLength(2)
})

it('validates the selected signal and preserves unused raw cells', () => {
  const text = 'Well,450,570,Net\nA1,bad,0.2,0.45'
  const raw = parseElisaReaderText(text, 'raw')
  expect(raw.wells.A1?.issues).toContain('450 is not numeric')
  for (const mode of ['wavelengthCorrected', 'blankCorrected'] as const) {
    const corrected = parseElisaReaderText(text, mode)
    expect(corrected.wells.A1?.net).toBe(0.45)
    expect(corrected.wells.A1?.issues).toEqual([])
    expect(corrected.rows[0].values).toContain('bad')
  }
  expect(
    parseElisaReaderText(
      'Well,450,570\nA1,1,0.2',
      'blankCorrected',
    ).warnings.join(' '),
  ).toContain('explicit Absorbance or Net')
  expect(
    parseElisaReaderText('Well,Absorbance\nA1,0.8', 'raw').warnings.join(' '),
  ).toContain('both 450 and 570')
})

it('blocks an entire plate row with a missing wavelength separator', () => {
  const half = Array.from({ length: 12 }, (_, i) => String(i + 1))
  const header = ['Temperature', ...half, '', ...half].join('\t')
  const good = [
    '23',
    ...Array(12).fill('1'),
    '',
    ...half.map((v) => String(Number(v) / 10)),
  ].join('\t')
  const bad = [
    '23',
    ...Array(12).fill('1'),
    ...half.map((v) => String(Number(v) / 10)),
  ].join('\t')
  const parsed = parseElisaReaderText(
    [header, bad, ...Array(7).fill(good)].join('\n'),
  )
  expect(parsed.warnings.join(' ')).toContain('missing or misplaced cells')
  for (let i = 1; i <= 12; i++)
    expect(parsed.wells[`A${i}` as 'A1']?.issues?.[0]).toContain(
      'missing or misplaced cells',
    )
  expect(parsed.wells.B1?.a570).toBe(0.1)
  expect(parsed.rows[0].values.at(-1)).toBe(bad)
})
it('surfaces ragged list-table rows instead of silently accepting padded cells', () => {
  const parsed = parseElisaReaderText(
    'Well,450,570,Comment\nA1,1,0.1,note\nA2,2,0.2',
  )
  expect(parsed.warnings.join(' ')).toContain('fewer columns')
  expect(parsed.rows).toHaveLength(2)
})
