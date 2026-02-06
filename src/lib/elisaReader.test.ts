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
    const text = [header, rowA, rowB, rowC, filler, filler, filler, filler, filler].join('\n')

    const parsed = parseElisaReaderText(text)
    expect(Object.keys(parsed.wells).length).toBeGreaterThan(0)
    expect(parsed.wells.A1?.a450).toBeCloseTo(0.9768, 6)
    expect(parsed.wells.A1?.a570).toBeCloseTo(0.1063, 6)
    expect(parsed.wells.A1?.net).toBeCloseTo(0.8705, 6)
  })
})

