import { describe, expect, it } from 'vitest'
import { analyzeElisa, parseDilutionFactor, type AssaySettings, type ElisaReadingInput } from './elisaAnalysis'
import { eval4pl, type FourPLParams } from './logistic4pl'
import { plate96WellIds, type WellId96 } from './plate96'
import { emptyLayout96 } from './layoutModel'
import { invertPolyBySearch } from './polynomial'
import { wellRows } from './export'
import type { Experiment } from './experiment'

type Level = { name: string; concentration: number; response: number }
type Fixture = {
  wells: ReturnType<typeof emptyLayout96>
  readings: Partial<Record<WellId96, ElisaReadingInput>>
  settings: AssaySettings
  sampleWell: WellId96
}

const wellId = (value: string): WellId96 => value as WellId96
const reading = (net: number, a450 = net, a570 = 0): ElisaReadingInput => ({ a450, a570, net })

const makeFixture = (
  levels: Level[] = [
    { name: 'S1', concentration: 1, response: 1 },
    { name: 'S2', concentration: 2, response: 2 },
    { name: 'S3', concentration: 3, response: 3 },
  ],
  sampleResponse = 2,
): Fixture => {
  const wells = emptyLayout96()
  const readings: Partial<Record<WellId96, ElisaReadingInput>> = {}
  levels.forEach((level, index) => {
    const id = plate96WellIds[index]
    wells[id] = { wellId: id, type: 'Standard', standardLevel: level.name, keep: true }
    readings[id] = reading(level.response)
  })
  const sampleWell = plate96WellIds[levels.length]
  wells[sampleWell] = { wellId: sampleWell, type: 'Sample', animalId: 'M001', group: 'Control', keep: true }
  readings[sampleWell] = reading(sampleResponse)
  const standards = Object.fromEntries(levels.map((level) => [level.name, {
    concentration: String(level.concentration), include: true, reason: '',
  }]))
  const settings: AssaySettings = {
    inputMode: 'raw',
    blankSubtract: false,
    blankRule: 'mean',
    blankWells: [],
    curveModel: 'poly',
    degree: 1,
    units: 'ng/mL',
    replicateWarning: 0.5,
    standards,
  }
  return { wells, readings, settings, sampleWell }
}

const analyze = (fixture: Fixture) => analyzeElisa(fixture.wells, fixture.readings, fixture.settings)

describe('ELISA analysis pipeline', () => {
  it('uses A450 minus A570 in raw mode and keeps the well and sample results consistent', () => {
    const fixture = makeFixture()
    fixture.readings[plate96WellIds[0]] = reading(999, 1.4, 0.4)
    const result = analyze(fixture)
    const standard = result.wells.find((well) => well.wellId === plate96WellIds[0])!
    const sample = result.wells.find((well) => well.wellId === fixture.sampleWell)!

    expect(standard.rawNet).toBeCloseTo(1)
    expect(standard.inputSignal).toBeCloseTo(1)
    expect(standard.correctedNet).toBeCloseTo(1)
    expect(sample.concentrationBeforeDilution).toBeCloseTo(2)
    expect(sample.concentrationAfterDilution).toBeCloseTo(2)
    expect(result.samples[0]).toMatchObject({ animalId: 'M001', mean: 2, eligible: true })
  })

  it('uses supplied wavelength-corrected net values without recomputing A450 minus A570', () => {
    const fixture = makeFixture()
    fixture.settings = { ...fixture.settings, inputMode: 'wavelengthCorrected' }
    fixture.readings[plate96WellIds[0]] = reading(1.25, 90, 10)
    const result = analyze(fixture)
    const standard = result.wells.find((well) => well.wellId === plate96WellIds[0])!

    expect(standard.rawNet).toBe(80)
    expect(standard.inputSignal).toBe(1.25)
    expect(standard.correctedNet).toBe(1.25)
  })

  it('uses the selected mean or median blank offset once, and applies no offset when subtraction is off', () => {
    const fixture = makeFixture([
      { name: 'S1', concentration: 1, response: 1.3 },
      { name: 'S2', concentration: 2, response: 2.3 },
      { name: 'S3', concentration: 3, response: 3.3 },
    ], 2.3)
    const blanks = [wellId('H10'), wellId('H11'), wellId('H12')]
    ;[0.1, 0.3, 0.9].forEach((value, index) => {
      fixture.wells[blanks[index]] = { wellId: blanks[index], type: 'Blank', keep: true }
      fixture.readings[blanks[index]] = reading(value)
    })
    fixture.settings = { ...fixture.settings, blankSubtract: true, blankWells: blanks, blankRule: 'median' }

    const median = analyze(fixture)
    expect(median.correction.offset).toBeCloseTo(0.3)
    expect(median.wells.find((well) => well.wellId === fixture.sampleWell)?.correctedNet).toBeCloseTo(2)
    expect(median.wells.find((well) => well.wellId === fixture.sampleWell)?.concentrationAfterDilution).toBeCloseTo(2)

    fixture.settings = { ...fixture.settings, blankSubtract: false }
    const uncorrected = analyze(fixture)
    const sample = uncorrected.wells.find((well) => well.wellId === fixture.sampleWell)!
    expect(uncorrected.correction.offset).toBe(0)
    expect(sample.blankOffset).toBe(0)
    expect(sample.correctedNet).toBe(sample.inputSignal)
    expect(sample.concentrationAfterDilution).toBeCloseTo(2)
    const exportedSample = wellRows(uncorrected, { name: 'Fixture', revision: 1, settings: { units: 'ng/mL' } } as Experiment)
      .find((row) => row.Well === fixture.sampleWell)!
    expect(exportedSample.InputAbsorbance).toBe(sample.inputSignal)
    expect(exportedSample.CorrectedAbsorbance).toBe(sample.correctedNet)
    expect(exportedSample.FinalConcentration).toBe(sample.concentrationAfterDilution)
  })

  it('blocks missing blank selections and prevents a second subtraction of already blank-corrected values', () => {
    const fixture = makeFixture()
    fixture.settings = { ...fixture.settings, blankSubtract: true }
    const missing = analyze(fixture)
    expect(missing.correction.eligible).toBe(false)
    expect(missing.curve.eligible).toBe(false)
    expect(missing.issues.some((issue) => issue.code === 'no-blank-selected')).toBe(true)

    fixture.settings = { ...fixture.settings, inputMode: 'blankCorrected', blankSubtract: true, blankWells: [wellId('H10')] }
    const double = analyze(fixture)
    expect(double.correction.eligible).toBe(false)
    expect(double.issues.some((issue) => issue.code === 'double-blank-subtraction')).toBe(true)
    expect(double.samples[0].eligible).toBe(false)
  })

  it('parses positive dilution factors, defaults only an absent value to one, and blocks malformed text', () => {
    expect(parseDilutionFactor('1:10')).toBe(10)
    expect(parseDilutionFactor('1/4')).toBe(4)
    expect(parseDilutionFactor('10x')).toBe(10)
    expect(parseDilutionFactor('x2.5')).toBe(2.5)
    expect(parseDilutionFactor('')).toBeNull()
    expect(parseDilutionFactor('one to ten')).toBeNull()

    const fixture = makeFixture()
    const absent = analyze(fixture).wells.find((well) => well.wellId === fixture.sampleWell)!
    expect(absent.dilutionFactor).toBe(1)
    expect(absent.status).toBe('ready')

    fixture.wells[fixture.sampleWell].dilutionText = '1:foo'
    const invalid = analyze(fixture).wells.find((well) => well.wellId === fixture.sampleWell)!
    expect(invalid.dilutionFactor).toBeNull()
    expect(invalid.concentrationAfterDilution).toBeNull()
    expect(invalid.status).toBe('invalid-dilution')
  })

  it('applies dilution exactly once and reports partial technical replicates', () => {
    const fixture = makeFixture()
    const secondSample = wellId('H1')
    fixture.wells[secondSample] = { wellId: secondSample, type: 'Sample', animalId: 'M001', group: 'Control', keep: true, dilutionText: '1:2' }
    fixture.readings[secondSample] = reading(2)
    const result = analyze(fixture)
    const summary = result.samples.find((sample) => sample.animalId === 'M001')!
    const diluted = result.wells.find((well) => well.wellId === secondSample)!

    expect(diluted.concentrationBeforeDilution).toBeCloseTo(2)
    expect(diluted.concentrationAfterDilution).toBeCloseTo(4)
    expect(summary.mean).toBeCloseTo(3)
    expect(summary.totalReplicateCount).toBe(2)
    expect(summary.eligibleReplicateCount).toBe(2)
    expect(summary.partial).toBe(false)

    fixture.readings[fixture.sampleWell] = undefined
    const partial = analyze(fixture).samples.find((sample) => sample.animalId === 'M001')!
    expect(partial).toMatchObject({ totalReplicateCount: 2, eligibleReplicateCount: 1, withheldReplicateCount: 1, partial: true, status: 'partial-replicates' })
  })

  it('marks decreasing curves in range and withholds values outside the selected standard range', () => {
    const fixture = makeFixture([
      { name: 'S1', concentration: 1, response: 3 },
      { name: 'S2', concentration: 2, response: 2 },
      { name: 'S3', concentration: 3, response: 1 },
    ], 2.5)
    const result = analyze(fixture)
    expect(result.curve.direction).toBe('decreasing')
    expect(result.wells.find((well) => well.wellId === fixture.sampleWell)?.concentrationAfterDilution).toBeCloseTo(1.5)

    fixture.readings[fixture.sampleWell] = reading(3.5)
    const outside = analyze(fixture).wells.find((well) => well.wellId === fixture.sampleWell)!
    expect(outside.status).toBe('below-range')
    expect(outside.concentrationAfterDilution).toBeNull()
    expect(outside.eligible).toBe(false)
  })

  it('labels values outside fitted concentration endpoints even when inside the observed standard responses', () => {
    const fixture = makeFixture([
      { name: 'S1', concentration: 1, response: 0 },
      { name: 'S2', concentration: 2, response: 1.5 },
      { name: 'S3', concentration: 3, response: 2 },
    ], 0.1)
    const result = analyze(fixture)
    const sample = result.wells.find((well) => well.wellId === fixture.sampleWell)!

    expect(result.curve.eligible).toBe(true)
    expect(result.curve.observedResponseMin).toBe(0)
    expect(sample.status).toBe('below-range')
    expect(sample.concentrationAfterDilution).toBeNull()
  })

  it('rejects a nonmonotonic polynomial calibration and does not clamp a boundary inverse', () => {
    const fixture = makeFixture([
      { name: 'S1', concentration: 1, response: 1 },
      { name: 'S2', concentration: 2, response: 0 },
      { name: 'S3', concentration: 3, response: 1 },
    ], 0.5)
    fixture.settings = { ...fixture.settings, degree: 2 }
    const result = analyze(fixture)
    expect(result.curve.eligible).toBe(false)
    expect(result.curve.status).toBe('ambiguous-curve')
    expect(result.wells.find((well) => well.wellId === fixture.sampleWell)?.eligible).toBe(false)

    expect(invertPolyBySearch([0, 1], 11, 0, 10)).toBeNull()
    expect(invertPolyBySearch([1, -2, 1], 0.5, 0, 2)).toBeNull()
  })

  it('fits and inverts a 4PL calibration within its measured concentration range', () => {
    const params: FourPLParams = { A: 0.05, D: 2.2, C: 2, B: 1.2 }
    const concentrations = [1, 10, 100, 1000, 10000]
    const levels = concentrations.map((concentration, index) => ({
      name: `S${index + 1}`,
      concentration,
      response: eval4pl(params, concentration),
    }))
    const target = 25
    const fixture = makeFixture(levels, eval4pl(params, target))
    fixture.settings = { ...fixture.settings, curveModel: '4pl' }
    const result = analyze(fixture)
    const sample = result.wells.find((well) => well.wellId === fixture.sampleWell)!

    expect(result.curve.eligible).toBe(true)
    expect(result.curve.direction).toBe('increasing')
    expect(sample.eligible).toBe(true)
    expect(sample.concentrationAfterDilution).toBeCloseTo(target, 1)
  })

  it('reports standard residuals against the expected absorbance at the mapped concentration', () => {
    const fixture = makeFixture()
    const replicate = wellId('H2')
    fixture.wells[replicate] = { wellId: replicate, type: 'Standard', standardLevel: 'S1', keep: true }
    fixture.readings[replicate] = reading(1.2)
    const result = analyze(fixture)
    const expected = result.standards.find((standard) => standard.level === 'S1')!.predictedResponse!
    const replicateRow = result.wells.find((well) => well.wellId === replicate)!

    expect(replicateRow.predictedResponse).toBeCloseTo(expected)
    expect(replicateRow.residual).toBeCloseTo(1.2 - expected)
  })

  it('requires a reason for each excluded standard level and each excluded standard replicate', () => {
    const fixture = makeFixture()
    fixture.settings = {
      ...fixture.settings,
      standards: { ...fixture.settings.standards, S3: { concentration: '3', include: false, reason: '' } },
    }
    let result = analyze(fixture)
    expect(result.standards.find((standard) => standard.level === 'S3')?.status).toBe('missing-exclusion-reason')
    expect(result.curve.eligible).toBe(false)

    fixture.settings = {
      ...fixture.settings,
      standards: { ...fixture.settings.standards, S3: { concentration: '3', include: true, reason: '' } },
    }
    const replicate = wellId('H2')
    fixture.wells[replicate] = { wellId: replicate, type: 'Standard', standardLevel: 'S3', keep: false }
    result = analyze(fixture)
    expect(result.standards.find((standard) => standard.level === 'S3')?.status).toBe('missing-exclusion-reason')
    expect(result.curve.eligible).toBe(false)
  })

  it('blocks missing or invalid included standard readings and requires a reason to exclude a sample', () => {
    const fixture = makeFixture()
    fixture.readings[plate96WellIds[1]] = undefined
    let result = analyze(fixture)
    expect(result.curve.eligible).toBe(false)
    expect(result.standards.find((standard) => standard.level === 'S2')?.status).toBe('missing-reading')

    fixture.readings[plate96WellIds[1]] = { ...reading(2), issues: ['450 is not numeric'] }
    result = analyze(fixture)
    expect(result.wells.find((well) => well.wellId === plate96WellIds[1])?.status).toBe('invalid-reading')
    expect(result.curve.eligible).toBe(false)

    fixture.wells[fixture.sampleWell].keep = false
    fixture.wells[fixture.sampleWell].exclusionReason = ''
    result = analyze(fixture)
    expect(result.wells.find((well) => well.wellId === fixture.sampleWell)?.status).toBe('missing-exclusion-reason')
    expect(result.samples[0].eligible).toBe(false)
    fixture.wells[fixture.sampleWell].exclusionReason = 'Reader bubble visible'
    result = analyze(fixture)
    expect(result.wells.find((well) => well.wellId === fixture.sampleWell)?.status).toBe('excluded')
  })

  it('blocks an assigned standard well with no level mapping', () => {
    const fixture = makeFixture()
    fixture.wells[plate96WellIds[0]].standardLevel = ''
    const result = analyze(fixture)

    expect(result.curve.eligible).toBe(false)
    expect(result.wells.find((well) => well.wellId === plate96WellIds[0])?.status).toBe('missing-standard-mapping')
    expect(result.issues.some((issue) => issue.code === 'missing-standard-mapping')).toBe(true)
  })

  it('keeps an explicitly excluded standard level with a bad reader value out of the fit without blocking the remaining curve', () => {
    const fixture = makeFixture()
    fixture.settings = {
      ...fixture.settings,
      standards: { ...fixture.settings.standards, S3: { concentration: '3', include: false, reason: 'Top level failed reader QC' } },
    }
    fixture.readings[plate96WellIds[2]] = { ...reading(3), issues: ['450 is not numeric'] }
    const result = analyze(fixture)
    const readerIssue = result.issues.find((issue) => issue.code === 'invalid-reading' && issue.wellId === plate96WellIds[2])

    expect(result.curve.eligible).toBe(true)
    expect(result.curve.nLevels).toBe(2)
    expect(readerIssue?.severity).toBe('warning')
    expect(result.standards.find((standard) => standard.level === 'S3')?.status).toBe('excluded')
  })

  it('blocks conflicting group labels for the same biological sample', () => {
    const fixture = makeFixture()
    const second = wellId('H3')
    fixture.wells[second] = { wellId: second, type: 'Sample', animalId: 'M001', group: 'Treatment', keep: true }
    fixture.readings[second] = reading(2)
    const result = analyze(fixture)
    expect(result.samples).toHaveLength(2)
    expect(result.samples.every((sample) => !sample.eligible && sample.status === 'identity-conflict' && sample.mean === null)).toBe(true)
    expect(result.issues.some((issue) => issue.code === 'identity-conflict')).toBe(true)
  })

  it('blocks a sample ID shared between a blank group and a named group', () => {
    const fixture = makeFixture()
    const second = wellId('H3')
    fixture.wells[second] = { wellId: second, type: 'Sample', animalId: 'M001', group: '', keep: true }
    fixture.readings[second] = reading(2)
    const result = analyze(fixture)

    expect(result.samples).toHaveLength(2)
    expect(result.samples.every((sample) => sample.status === 'identity-conflict' && !sample.eligible && sample.mean === null)).toBe(true)
    expect(result.issues.some((issue) => issue.code === 'identity-conflict')).toBe(true)
  })

  it('flags same-dilution sample spread for review but keeps all wells and separates dilution groups', () => {
    const fixture = makeFixture()
    const second = wellId('H3')
    fixture.wells[second] = { wellId: second, type: 'Sample', animalId: 'M001', group: 'Control', keep: true }
    fixture.readings[second] = reading(2.8)
    let result = analyze(fixture)
    let sampleRows = result.wells.filter((well) => well.type === 'Sample' && well.animalId === 'M001')
    let sampleSummary = result.samples.find((sample) => sample.animalId === 'M001')!

    expect(sampleRows.every((well) => well.replicateWarning && well.eligible)).toBe(true)
    expect(sampleRows.every((well) => well.message.includes('spread review threshold'))).toBe(true)
    expect(sampleSummary).toMatchObject({ eligible: true, replicateWarning: true, status: 'warning' })
    expect(result.issues.some((issue) => issue.code === 'sample-replicate-warning' && issue.severity === 'warning')).toBe(true)

    fixture.wells[second].dilutionText = '1:2'
    result = analyze(fixture)
    sampleRows = result.wells.filter((well) => well.type === 'Sample' && well.animalId === 'M001')
    sampleSummary = result.samples.find((sample) => sample.animalId === 'M001')!
    expect(sampleRows.every((well) => !well.replicateWarning)).toBe(true)
    expect(sampleSummary.replicateWarning).toBe(false)
  })
})
