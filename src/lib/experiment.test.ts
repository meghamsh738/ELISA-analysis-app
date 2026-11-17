import { describe, it, expect } from 'vitest'
import { analyzeElisa } from './elisaAnalysis'
import { parseElisaReaderText } from './elisaReader'
import {
  cleanLayout,
  cleanPreset,
  decodeExperiment,
  encodeExperiment,
  makePractice,
  newExperiment,
  revise,
  validateExperiment,
} from './experiment'
import { delimited, sampleRows, wellRows } from './export'

describe('ELISA experiment packages and shared exports', () => {
  it('round trips original input, review choices, noncontiguous standards and figure settings', async () => {
    const experiment = makePractice()
    experiment.approvals = [true, true, true, true, true]
    experiment.graph.title = 'Reviewed figure'
    experiment.graph.colours = { Control: '#345678' }
    experiment.settings = {
      ...experiment.settings,
      standards: {
        ...experiment.settings.standards,
        Std2: {
          concentration: '2',
          include: false,
          reason: 'Preparation error recorded',
        },
      },
    }
    const result = analyzeElisa(
      experiment.wells,
      parseElisaReaderText(experiment.readerText).wells,
      experiment.settings,
    )
    const encoded = await encodeExperiment(experiment, result)
    const restored = await decodeExperiment(encoded)
    expect(restored).toEqual(experiment)
    const damaged = encoded.replace('Reviewed figure', 'Modified figure')
    await expect(decodeExperiment(damaged)).rejects.toThrow('checksum')
    expect(
      analyzeElisa(
        restored.wells,
        parseElisaReaderText(restored.readerText).wells,
        restored.settings,
      ),
    ).toEqual(result)
  })
  it('new experiments and reusable presets/layouts require new review decisions', () => {
    const experiment = makePractice()
    experiment.wells.A3.keep = false
    experiment.wells.A3.exclusionReason = 'Pipetting error'
    const preset = cleanPreset({
      ...experiment.settings,
      standards: {
        Std1: { concentration: '1', include: false, reason: 'Old review' },
      },
    })
    expect(preset.blankWells).toEqual([])
    expect(preset.standards.Std1).toEqual({
      concentration: '1',
      include: true,
      reason: '',
    })
    expect(cleanLayout(experiment.wells).A3.keep).toBe(true)
    const next = newExperiment(preset, experiment.graph, 'Saved preset')
    expect(next.approvals.every((v) => !v)).toBe(true)
    expect(next.graph).toEqual(experiment.graph)
    expect(next.wells.A3.type).toBe('Empty')
    expect(
      revise(
        { ...experiment, approvals: [true, true, true, true, true] },
        { name: 'Edited' },
        2,
      ).approvals,
    ).toEqual([true, true, false, false, false])
  })
  it('exports the same dilution/correction results and withheld endpoints shown on screen', () => {
    const experiment = makePractice()
    const result = analyzeElisa(
      experiment.wells,
      parseElisaReaderText(experiment.readerText).wells,
      experiment.settings,
    )
    expect(
      sampleRows(result, experiment)
        .filter((row) => row.Eligible)
        .map((row) => row.Concentration),
    ).toEqual(expect.arrayContaining([expect.closeTo(6), expect.closeTo(14)]))
    const wells = wellRows(result, experiment)
    const sample = wells.find((row) => row.Well === 'A3')!
    expect(sample.FinalConcentration).toBeCloseTo(
      Number(sample.ConcentrationBeforeDilution) * 2,
    )
    expect(sample.BlankOffset).toBeCloseTo(0.1)
    expect(
      wells.find((row) => row.Well === 'G3')!.FinalConcentration,
    ).toBeNull()
    expect(
      wells.find((row) => row.Well === 'H3')!.FinalConcentration,
    ).toBeNull()
    expect(sampleRows(result, experiment).length).toBe(8)
    expect(result.samples.filter((sample) => sample.eligible).length).toBe(6)
  })
  it('rejects malformed package structures and neutralizes formula-like text in tabular exports', () => {
    const e = makePractice()
    expect(() =>
      validateExperiment({ ...e, wells: { A1: e.wells.A1 } }),
    ).toThrow('96 wells')
    expect(() =>
      validateExperiment({ ...e, graph: { ...e.graph, width: -1 } }),
    ).toThrow('figure width')
    expect(delimited([{ Sample: '=SUM(1,2)', Concentration: -1 }])).toContain(
      "'=SUM(1,2)\t-1",
    )
  })
})
