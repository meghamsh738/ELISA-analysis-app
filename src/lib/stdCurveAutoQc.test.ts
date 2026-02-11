import { describe, expect, it } from 'vitest'
import { eval4pl } from './logistic4pl'
import { suggestStandardCurveExclusions, type StdLevelInput } from './stdCurveAutoQc'

const mkLevel = (level: string, conc: number, reps: Array<{ wellId: string; y: number }>): StdLevelInput => ({
  level,
  conc,
  replicates: reps,
})

describe('stdCurveAutoQc', () => {
  it('suggests excluding a single bad replicate when it improves 4PL fit', () => {
    const trueParams = { A: 0.05, D: 2.2, C: 1.0, B: 1.2 } // EC50 = 10
    const xs = [0.1, 0.3, 1, 3, 10, 30, 100]

    const levels: StdLevelInput[] = xs.map((x, idx) => {
      const level = `Std${idx + 1}`
      const yTrue = eval4pl(trueParams, x)
      const rep1 = { wellId: `A${idx + 1}`, y: yTrue }
      const rep2 = { wellId: `B${idx + 1}`, y: yTrue }
      return mkLevel(level, x, [rep1, rep2])
    })

    // Inject one outlier replicate at Std4 (x=3). Only one replicate is wrong.
    levels[3] = mkLevel('Std4', 3, [
      { wellId: 'A4', y: eval4pl(trueParams, 3) },
      { wellId: 'B4', y: eval4pl(trueParams, 3) + 0.9 },
    ])

    const s = suggestStandardCurveExclusions(levels, { kind: '4pl' }, { maxActions: 1, minScoreImprove: 1e-6 })
    expect(s.baseline).not.toBeNull()
    expect(s.suggested).not.toBeNull()
    expect(s.actions.length).toBeGreaterThan(0)
    expect(s.droppedLevels).toHaveLength(0)
    expect(s.excludedWellIds).toContain('B4')
    expect((s.suggested!.r2 ?? 0) - (s.baseline!.r2 ?? 0)).toBeGreaterThan(0.01)
  })

  it('suggests dropping a whole level when both replicates are inconsistent', () => {
    const trueParams = { A: 0.05, D: 2.2, C: 1.0, B: 1.2 }
    const xs = [0.1, 0.3, 1, 3, 10, 30, 100]

    const levels: StdLevelInput[] = xs.map((x, idx) => {
      const level = `Std${idx + 1}`
      const yTrue = eval4pl(trueParams, x)
      return mkLevel(level, x, [
        { wellId: `A${idx + 1}`, y: yTrue },
        { wellId: `B${idx + 1}`, y: yTrue },
      ])
    })

    // Make Std6 (x=30) bad in both replicates.
    levels[5] = mkLevel('Std6', 30, [
      { wellId: 'A6', y: eval4pl(trueParams, 30) + 0.8 },
      { wellId: 'B6', y: eval4pl(trueParams, 30) + 0.8 },
    ])

    const s = suggestStandardCurveExclusions(levels, { kind: '4pl' }, { maxActions: 1, maxDroppedLevels: 1, minScoreImprove: 1e-6 })
    expect(s.baseline).not.toBeNull()
    expect(s.suggested).not.toBeNull()
    expect(s.actions.length).toBeGreaterThan(0)
    expect(s.droppedLevels).toContain('Std6')
  })

  it('returns no actions for clean data', () => {
    const trueParams = { A: 0.05, D: 2.2, C: 1.0, B: 1.2 }
    const xs = [0.1, 0.3, 1, 3, 10, 30, 100]

    const levels: StdLevelInput[] = xs.map((x, idx) => {
      const level = `Std${idx + 1}`
      const yTrue = eval4pl(trueParams, x)
      return mkLevel(level, x, [
        { wellId: `A${idx + 1}`, y: yTrue },
        { wellId: `B${idx + 1}`, y: yTrue },
      ])
    })

    const s = suggestStandardCurveExclusions(levels, { kind: '4pl' }, { maxActions: 2, minScoreImprove: 1e-3 })
    expect(s.baseline).not.toBeNull()
    expect(s.actions).toHaveLength(0)
  })
})

