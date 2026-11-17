import { plate96WellIds, type WellId96 } from './plate96'
import type { ElisaWellReading } from './elisaReader'
import { eval4pl, fit4pl, invert4pl, type FourPLParams } from './logistic4pl'
import { evalScaledPolynomial, fitPolynomialScaled, polynomialDirection } from './polynomial'
import { type WellAssignment } from './layoutModel'

export type ElisaInputMode = 'raw' | 'wavelengthCorrected' | 'blankCorrected'
export type ElisaCurveDirection = 'increasing' | 'decreasing' | 'nonmonotonic' | 'unknown'
export type ElisaStatus =
  | 'ready'
  | 'warning'
  | 'excluded'
  | 'missing-exclusion-reason'
  | 'missing-reading'
  | 'invalid-reading'
  | 'invalid-dilution'
  | 'below-range'
  | 'above-range'
  | 'ambiguous-curve'
  | 'unquantifiable'
  | 'curve-blocked'
  | 'blank-correction-blocked'
  | 'missing-sample-id'
  | 'identity-conflict'
  | 'missing-standard-mapping'
  | 'invalid-standard-concentration'
  | 'missing-standard'
  | 'insufficient-standards'
  | 'partial-replicates'
  | 'no-eligible-replicates'

export type StandardSetting = Readonly<{
  concentration: string
  include: boolean
  reason: string
}>

export type AssaySettings = Readonly<{
  inputMode: ElisaInputMode
  blankSubtract: boolean
  blankRule: 'mean' | 'median'
  blankWells: readonly WellId96[]
  curveModel: 'poly' | '4pl'
  degree: 1 | 2 | 3
  units: string
  replicateWarning: number
  standards: Readonly<Record<string, StandardSetting>>
}>

export type ElisaReadingInput = ElisaWellReading & Readonly<{
  issues?: readonly string[]
  original?: Readonly<Record<string, string>>
}>

export type CalibrationModel =
  | Readonly<{
      kind: 'poly'
      degree: 1 | 2 | 3
      coefficients: readonly number[]
      xCenter: number
      xScale: number
    }>
  | Readonly<{ kind: '4pl'; params: Readonly<FourPLParams> }>

export type AnalysisIssue = Readonly<{
  severity: 'error' | 'warning'
  code: string
  message: string
  wellId?: WellId96
  level?: string
}>

export type CorrectionResult = Readonly<{
  inputMode: ElisaInputMode
  blankSubtract: boolean
  blankRule: 'mean' | 'median'
  selectedBlankWells: readonly WellId96[]
  validBlankWells: readonly WellId96[]
  offset: number | null
  eligible: boolean
  status: ElisaStatus
  message: string
}>

export type CurveResult = Readonly<{
  model: CalibrationModel | null
  eligible: boolean
  status: ElisaStatus
  message: string
  r2: number | null
  sse: number | null
  nLevels: number
  minConcentration: number | null
  maxConcentration: number | null
  observedResponseMin: number | null
  observedResponseMax: number | null
  fittedResponseMin: number | null
  fittedResponseMax: number | null
  direction: ElisaCurveDirection
}>

export type StandardDiagnostic = Readonly<{
  level: string
  concentration: number | null
  include: boolean
  exclusionReason: string
  totalReplicateCount: number
  retainedReplicateCount: number
  excludedReplicateCount: number
  meanResponse: number | null
  sdResponse: number | null
  replicateSpread: number | null
  replicateWarning: boolean
  predictedResponse: number | null
  meanResidual: number | null
  backCalculatedConcentration: number | null
  eligible: boolean
  status: ElisaStatus
  message: string
}>

export type WellDiagnostic = Readonly<{
  wellId: WellId96
  type: WellAssignment['type']
  animalId: string
  group: string
  standardLevel: string
  keep: boolean
  exclusionReason: string
  original: Readonly<Record<string, string>> | null
  a450: number | null
  a570: number | null
  rawNet: number | null
  inputSignal: number | null
  blankOffset: number | null
  correctedNet: number | null
  dilutionText: string | null
  dilutionFactor: number | null
  technicalReplicateCount: number
  technicalSpread: number | null
  replicateWarning: boolean
  concentrationBeforeDilution: number | null
  concentrationAfterDilution: number | null
  predictedResponse: number | null
  residual: number | null
  backCalculatedConcentration: number | null
  eligible: boolean
  status: ElisaStatus
  message: string
}>

export type SampleSummary = Readonly<{
  animalId: string
  group: string
  totalReplicateCount: number
  eligibleReplicateCount: number
  withheldReplicateCount: number
  partial: boolean
  replicateWarning: boolean
  mean: number | null
  sd: number | null
  eligible: boolean
  status: ElisaStatus
  message: string
}>

export type ElisaAnalysisResult = Readonly<{
  settings: AssaySettings
  correction: CorrectionResult
  curve: CurveResult
  standards: readonly StandardDiagnostic[]
  wells: readonly WellDiagnostic[]
  samples: readonly SampleSummary[]
  issues: readonly AnalysisIssue[]
}>

type MutableWell = {
  wellId: WellId96
  type: WellAssignment['type']
  animalId: string
  group: string
  standardLevel: string
  keep: boolean
  exclusionReason: string
  original: Readonly<Record<string, string>> | null
  a450: number | null
  a570: number | null
  rawNet: number | null
  inputSignal: number | null
  blankOffset: number | null
  correctedNet: number | null
  dilutionText: string | null
  dilutionFactor: number | null
  technicalReplicateCount: number
  technicalSpread: number | null
  replicateWarning: boolean
  concentrationBeforeDilution: number | null
  concentrationAfterDilution: number | null
  predictedResponse: number | null
  residual: number | null
  backCalculatedConcentration: number | null
  eligible: boolean
  status: ElisaStatus
  message: string
}

type StandardWork = {
  level: string
  concentration: number | null
  include: boolean
  exclusionReason: string
  totalReplicateCount: number
  retainedReplicateCount: number
  excludedReplicateCount: number
  meanResponse: number | null
  sdResponse: number | null
  replicateSpread: number | null
  replicateWarning: boolean
  predictedResponse: number | null
  meanResidual: number | null
  backCalculatedConcentration: number | null
  eligible: boolean
  status: ElisaStatus
  message: string
}

type CurveWork = {
  model: CalibrationModel | null
  eligible: boolean
  status: ElisaStatus
  message: string
  r2: number | null
  sse: number | null
  nLevels: number
  minConcentration: number | null
  maxConcentration: number | null
  observedResponseMin: number | null
  observedResponseMax: number | null
  fittedResponseMin: number | null
  fittedResponseMax: number | null
  direction: ElisaCurveDirection
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const nonblank = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const roundMedian = (values: number[]): number | null => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export const parseDilutionFactor = (raw: unknown): number | null => {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text) return null
  const number = '(\\d+(?:\\.\\d*)?|\\.\\d+)'
  const direct = new RegExp(`^${number}$`).exec(text)
  if (direct) {
    const factor = Number(direct[1])
    return Number.isFinite(factor) && factor > 0 ? factor : null
  }
  const ratio = new RegExp(`^1\\s*[:/]\\s*${number}$`, 'i').exec(text)
  const times = new RegExp(`^${number}\\s*x$`, 'i').exec(text)
  const prefixed = new RegExp(`^x\\s*${number}$`, 'i').exec(text)
  const factorText = ratio?.[1] ?? times?.[1] ?? prefixed?.[1]
  if (!factorText) return null
  const factor = Number(factorText)
  return Number.isFinite(factor) && factor > 0 ? factor : null
}

export const evaluateCalibration = (model: CalibrationModel, concentration: number): number | null => {
  if (!finite(concentration) || concentration <= 0) return null
  const response = model.kind === 'poly'
    ? evalScaledPolynomial({
        degree: model.degree,
        coeff: [...model.coefficients],
        xCenter: model.xCenter,
        xScale: model.xScale,
        r2: Number.NaN,
      }, concentration)
    : eval4pl(model.params, concentration)
  return Number.isFinite(response) ? response : null
}

const issueKey = (issue: AnalysisIssue) => `${issue.code}|${issue.wellId ?? ''}|${issue.level ?? ''}|${issue.message}`

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child))
    Object.freeze(value)
  }
  return value as Readonly<T>
}

export const analyzeElisa = (
  wells: Readonly<Record<WellId96, WellAssignment>>,
  readings: Readonly<Partial<Record<WellId96, ElisaReadingInput>>>,
  settings: AssaySettings,
): ElisaAnalysisResult => {
  const issues: AnalysisIssue[] = []
  const knownIssues = new Set<string>()
  const addIssue = (issue: AnalysisIssue) => {
    const key = issueKey(issue)
    if (knownIssues.has(key)) return
    knownIssues.add(key)
    issues.push(issue)
  }

  const settingsCopy: AssaySettings = {
    ...settings,
    blankWells: [...settings.blankWells],
    standards: Object.fromEntries(Object.entries(settings.standards).map(([level, value]) => [level, { ...value }])),
  }

  const invalidSettings: string[] = []
  if (!['raw', 'wavelengthCorrected', 'blankCorrected'].includes(settings.inputMode)) invalidSettings.push('Choose a valid absorbance input mode.')
  if (!['mean', 'median'].includes(settings.blankRule)) invalidSettings.push('Choose a valid blank calculation.')
  if (!['poly', '4pl'].includes(settings.curveModel)) invalidSettings.push('Choose a valid standard-curve model.')
  if (settings.curveModel === 'poly' && ![1, 2, 3].includes(settings.degree)) invalidSettings.push('Choose polynomial degree 1, 2 or 3.')
  if (!finite(settings.replicateWarning) || settings.replicateWarning < 0) invalidSettings.push('Replicate warning threshold must be a finite non-negative value.')
  invalidSettings.forEach((message) => addIssue({ severity: 'error', code: 'invalid-settings', message }))
  const explicitlyExcludedStandards = new Set(Object.entries(settings.standards)
    .filter(([, setting]) => setting?.include === false && nonblank(setting.reason))
    .map(([level]) => level.trim()))

  const getSignal = (wellId: WellId96): { value: number | null; invalid: boolean; message: string } => {
    const reading = readings[wellId]
    if (!reading) return { value: null, invalid: false, message: 'No reader value is available for this well.' }
    if (reading.issues?.length) return { value: null, invalid: true, message: reading.issues.join('; ') }
    if (settings.inputMode === 'raw') {
      if (!finite(reading.a450) || !finite(reading.a570)) return { value: null, invalid: false, message: 'A450 or A570 is missing.' }
      const value = reading.a450 - reading.a570
      return finite(value) ? { value, invalid: false, message: '' } : { value: null, invalid: true, message: 'A450−A570 is not finite.' }
    }
    if (!finite(reading.net)) return { value: null, invalid: false, message: 'The supplied corrected net absorbance is missing.' }
    return { value: reading.net, invalid: false, message: '' }
  }

  const baseSignals = new Map<WellId96, { value: number | null; invalid: boolean; message: string }>()
  const mutableWells: MutableWell[] = []
  for (const wellId of plate96WellIds) {
    const assignment = wells[wellId] ?? { wellId, type: 'Empty' as const, keep: true }
    const reading = readings[wellId]
    const signal = getSignal(wellId)
    baseSignals.set(wellId, signal)
    const rawNet = finite(reading?.a450) && finite(reading?.a570) ? reading.a450 - reading.a570 : null
    const exclusionReason = nonblank(assignment.exclusionReason)
    const base: MutableWell = {
      wellId,
      type: assignment.type,
      animalId: nonblank(assignment.animalId),
      group: nonblank(assignment.group),
      standardLevel: nonblank(assignment.standardLevel),
      keep: Boolean(assignment.keep),
      exclusionReason,
      original: reading?.original ? { ...reading.original } : null,
      a450: finite(reading?.a450) ? reading.a450 : null,
      a570: finite(reading?.a570) ? reading.a570 : null,
      rawNet: finite(rawNet) ? rawNet : null,
      inputSignal: signal.value,
      blankOffset: null,
      correctedNet: null,
      dilutionText: typeof assignment.dilutionText === 'string' ? assignment.dilutionText : null,
      dilutionFactor: null,
      technicalReplicateCount: 0,
      technicalSpread: null,
      replicateWarning: false,
      concentrationBeforeDilution: null,
      concentrationAfterDilution: null,
      predictedResponse: null,
      residual: null,
      backCalculatedConcentration: null,
      eligible: false,
      status: assignment.type === 'Empty' ? 'excluded' : 'ready',
      message: assignment.type === 'Empty' ? 'Well is not assigned.' : '',
    }
    if (assignment.type !== 'Empty' && !assignment.keep) {
      if (!exclusionReason) {
        base.status = 'missing-exclusion-reason'
        base.message = 'Add a reason before excluding this well.'
        addIssue({ severity: 'error', code: 'missing-exclusion-reason', message: base.message, wellId })
      } else {
        base.status = 'excluded'
        base.message = exclusionReason
      }
    } else if (assignment.type !== 'Empty' && signal.invalid) {
      base.status = 'invalid-reading'
      base.message = signal.message
      addIssue({
        severity: assignment.type === 'Standard' && explicitlyExcludedStandards.has(base.standardLevel) ? 'warning' : 'error',
        code: 'invalid-reading',
        message: signal.message,
        wellId,
      })
    } else if (assignment.type !== 'Empty' && signal.value === null) {
      base.status = 'missing-reading'
      base.message = signal.message
    }
    mutableWells.push(base)
  }
  let blankOffset: number | null = settings.blankSubtract ? null : 0
  let correctionEligible = ['raw', 'wavelengthCorrected', 'blankCorrected'].includes(settings.inputMode) &&
    (!settings.blankSubtract || ['mean', 'median'].includes(settings.blankRule))
  let correctionMessage = ''
  const validBlankWells: WellId96[] = []
  if (settings.inputMode === 'blankCorrected' && settings.blankSubtract) {
    correctionEligible = false
    correctionMessage = 'Input is already blank-corrected; turn off a second blank subtraction.'
    addIssue({ severity: 'error', code: 'double-blank-subtraction', message: correctionMessage })
  } else if (settings.blankSubtract) {
    const selected = [...settings.blankWells]
    if (new Set(selected).size !== selected.length) {
      correctionEligible = false
      correctionMessage = 'A blank well is selected more than once. Review the blank mapping.'
      addIssue({ severity: 'error', code: 'duplicate-blank-well', message: correctionMessage })
    }
    if (!selected.length) {
      correctionEligible = false
      correctionMessage = 'Select at least one valid blank well before subtracting background.'
      addIssue({ severity: 'error', code: 'no-blank-selected', message: correctionMessage })
    }
    const values: number[] = []
    for (const wellId of selected) {
      const assignment = wells[wellId]
      const signal = baseSignals.get(wellId)
      if (!assignment || assignment.type !== 'Blank') {
        correctionEligible = false
        const message = 'Selected background well is not marked as a blank.'
        correctionMessage = correctionMessage || message
        addIssue({ severity: 'error', code: 'selected-well-not-blank', message, wellId })
        continue
      }
      if (!assignment.keep) {
        correctionEligible = false
        const message = nonblank(assignment.exclusionReason)
          ? 'A selected blank is excluded. Remove it from the selected blank wells or include it.'
          : 'Add a reason before excluding this selected blank.'
        correctionMessage = correctionMessage || message
        addIssue({ severity: 'error', code: nonblank(assignment.exclusionReason) ? 'excluded-selected-blank' : 'missing-exclusion-reason', message, wellId })
        continue
      }
      if (signal?.invalid || signal?.value === null || signal === undefined) {
        correctionEligible = false
        const message = signal?.message || 'Selected blank has no valid reader value.'
        correctionMessage = correctionMessage || 'One or more selected blanks do not have a valid reader value.'
        addIssue({ severity: 'error', code: 'invalid-selected-blank', message, wellId })
        continue
      }
      validBlankWells.push(wellId)
      values.push(signal.value)
    }
    if (!values.length) {
      correctionEligible = false
      correctionMessage = correctionMessage || 'No selected blank has a valid reader value.'
      addIssue({ severity: 'error', code: 'no-valid-blank', message: correctionMessage })
    } else {
      blankOffset = settings.blankRule === 'mean'
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : roundMedian(values)
    }
  } else if (!correctionMessage) {
    correctionMessage = settings.inputMode === 'blankCorrected'
      ? 'Reader values are already blank-corrected.'
      : 'No blank subtraction applied.'
  }

  for (const row of mutableWells) {
    row.blankOffset = blankOffset
    if (row.inputSignal !== null && (!settings.blankSubtract || (blankOffset !== null && correctionEligible))) {
      row.correctedNet = settings.blankSubtract ? row.inputSignal - (blankOffset as number) : row.inputSignal
    }
  }

  const correction: CorrectionResult = {
    inputMode: settings.inputMode,
    blankSubtract: settings.blankSubtract,
    blankRule: settings.blankRule,
    selectedBlankWells: [...settings.blankWells],
    validBlankWells,
    offset: blankOffset,
    eligible: correctionEligible,
    status: correctionEligible ? 'ready' : 'blank-correction-blocked',
    message: correctionEligible ? correctionMessage : correctionMessage || 'Review background-correction settings before quantifying.',
  }

  const normalizedSettings = new Map<string, StandardSetting>()
  let duplicateStandardName = false
  for (const [rawLevel, setting] of Object.entries(settings.standards)) {
    const level = rawLevel.trim()
    if (normalizedSettings.has(level)) {
      duplicateStandardName = true
      addIssue({ severity: 'error', code: 'duplicate-standard-mapping', message: `Standard level “${level}” has more than one mapping.`, level })
    } else {
      normalizedSettings.set(level, setting)
    }
  }

  const observedLevels = Array.from(new Set(mutableWells.filter((row) => row.type === 'Standard').map((row) => row.standardLevel)))
  const allLevels = Array.from(new Set([...normalizedSettings.keys(), ...observedLevels]))
  const standardWorks: StandardWork[] = []
  let standardsValid = invalidSettings.length === 0 && correctionEligible && !duplicateStandardName
  const includedForFit: Array<{ level: string; concentration: number; meanResponse: number; sdResponse: number | null; n: number }> = []

  for (const level of allLevels) {
    const setting = normalizedSettings.get(level)
    const levelRows = mutableWells.filter((row) => row.type === 'Standard' && row.standardLevel === level)
    const concentrationText = typeof setting?.concentration === 'string' ? setting.concentration.trim() : ''
    const concentration = setting ? Number(concentrationText) : Number.NaN
    const validConcentration = Number.isFinite(concentration) && concentration > 0 ? concentration : null
    const include = Boolean(setting?.include)
    const exclusionReason = nonblank(setting?.reason)
    const retainedRows = levelRows.filter((row) => row.keep && row.status !== 'invalid-reading' && row.status !== 'missing-reading' && row.correctedNet !== null)
    const excludedRows = levelRows.filter((row) => !row.keep)
    const values = retainedRows.map((row) => row.correctedNet as number)
    const n = values.length
    const meanResponse = n ? values.reduce((sum, value) => sum + value, 0) / n : null
    const sdResponse = n > 1
      ? Math.sqrt(values.reduce((sum, value) => sum + (value - (meanResponse as number)) ** 2, 0) / (n - 1))
      : null
    const replicateSpread = n > 1 ? Math.max(...values) - Math.min(...values) : null
    const replicateWarning = replicateSpread !== null && replicateSpread > settings.replicateWarning
    let status: ElisaStatus = 'ready'
    let message = ''
    let eligible = false

    if (excludedRows.some((row) => !row.exclusionReason)) {
      status = 'missing-exclusion-reason'
      message = 'Add a reason before excluding a standard well.'
      addIssue({ severity: 'error', code: 'missing-exclusion-reason', message, level })
      standardsValid = false
    } else if (!setting) {
      status = 'missing-standard-mapping'
      message = 'Map this standard level to a concentration and inclusion choice.'
      addIssue({ severity: 'error', code: 'missing-standard-mapping', message, level })
      levelRows.filter((row) => row.keep && row.status === 'ready').forEach((row) => {
        row.status = 'missing-standard-mapping'
        row.message = message
      })
      if (levelRows.length) standardsValid = false
    } else if (!include && !exclusionReason) {
      status = 'missing-exclusion-reason'
      message = 'Add a reason before excluding this standard level.'
      addIssue({ severity: 'error', code: 'missing-exclusion-reason', message, level })
      standardsValid = false
    } else if (!include) {
      status = 'excluded'
      message = exclusionReason
      eligible = false
    } else if (validConcentration === null) {
      status = 'invalid-standard-concentration'
      message = 'Included standard concentration must be finite and greater than zero.'
      addIssue({ severity: 'error', code: 'invalid-standard-concentration', message, level })
      standardsValid = false
    } else if (levelRows.length === 0) {
      status = 'missing-standard'
      message = 'Included standard level has no assigned wells.'
      addIssue({ severity: 'error', code: 'missing-standard', message, level })
      standardsValid = false
    } else if (levelRows.some((row) => row.keep && (row.status === 'invalid-reading' || row.status === 'missing-reading'))) {
      const bad = levelRows.find((row) => row.keep && (row.status === 'invalid-reading' || row.status === 'missing-reading')) as MutableWell
      status = bad.status
      message = `Included standard well ${bad.wellId} needs a valid reader value.`
      addIssue({ severity: 'error', code: bad.status, message, level, wellId: bad.wellId })
      standardsValid = false
    } else if (!n || meanResponse === null) {
      status = 'missing-reading'
      message = 'Included standard level has no retained numeric readings.'
      addIssue({ severity: 'error', code: 'missing-standard-reading', message, level })
      standardsValid = false
    } else {
      eligible = true
      if (replicateWarning) {
        status = 'warning'
        message = `Replicate range exceeds ${settings.replicateWarning}; review these readings.`
        addIssue({ severity: 'warning', code: 'standard-replicate-warning', message, level })
      }
      includedForFit.push({ level, concentration, meanResponse, sdResponse, n })
    }

    standardWorks.push({
      level,
      concentration: validConcentration,
      include,
      exclusionReason,
      totalReplicateCount: levelRows.length,
      retainedReplicateCount: n,
      excludedReplicateCount: excludedRows.length,
      meanResponse,
      sdResponse,
      replicateSpread,
      replicateWarning,
      predictedResponse: null,
      meanResidual: null,
      backCalculatedConcentration: null,
      eligible,
      status,
      message,
    })
  }

  const fitPoints = includedForFit
  let curve: CurveWork = {
    model: null,
    eligible: false,
    status: 'curve-blocked',
    message: 'Resolve standard-curve issues before quantifying samples.',
    r2: null,
    sse: null,
    nLevels: fitPoints.length,
    minConcentration: null,
    maxConcentration: null,
    observedResponseMin: null,
    observedResponseMax: null,
    fittedResponseMin: null,
    fittedResponseMax: null,
    direction: 'unknown',
  }

  if (!correctionEligible) {
    curve.message = 'Resolve absorbance correction settings before fitting the standard curve.'
  } else if (!standardsValid) {
    const firstError = issues.find((issue) => issue.severity === 'error' && issue.code !== 'invalid-settings')
    curve.message = firstError?.message || curve.message
  } else if (fitPoints.length < (settings.curveModel === '4pl' ? 4 : settings.degree + 1)) {
    curve.status = 'insufficient-standards'
    curve.message = `Include at least ${settings.curveModel === '4pl' ? 4 : settings.degree + 1} valid standard levels.`
    addIssue({ severity: 'error', code: 'insufficient-standards', message: curve.message })
  } else if (new Set(fitPoints.map((point) => point.concentration)).size !== fitPoints.length) {
    curve.message = 'Included standards must have unique concentrations.'
    addIssue({ severity: 'error', code: 'duplicate-standard-concentration', message: curve.message })
  } else {
    const sortedPoints = [...fitPoints].sort((a, b) => a.concentration - b.concentration)
    const minConcentration = sortedPoints[0].concentration
    const maxConcentration = sortedPoints[sortedPoints.length - 1].concentration
    const responses = sortedPoints.map((point) => point.meanResponse)
    const observedResponseMin = Math.min(...responses)
    const observedResponseMax = Math.max(...responses)
    let model: CalibrationModel | null = null
    let r2: number | null = null
    let sse: number | null = null
    let direction: ElisaCurveDirection = 'unknown'
    let message = ''

    if (settings.curveModel === 'poly') {
      const fit = fitPolynomialScaled(
        sortedPoints.map((point) => point.concentration),
        responses,
        settings.degree,
      )
      if (fit && Number.isFinite(fit.r2)) {
        model = {
          kind: 'poly', degree: settings.degree, coefficients: [...fit.coeff],
          xCenter: fit.xCenter, xScale: fit.xScale,
        }
        r2 = fit.r2
        const tMin = (minConcentration - fit.xCenter) / fit.xScale
        const tMax = (maxConcentration - fit.xCenter) / fit.xScale
        direction = polynomialDirection(fit.coeff, tMin, tMax) || 'nonmonotonic'
        sse = responses.reduce((sum, response, index) => {
          const predicted = evaluateCalibration(model as CalibrationModel, sortedPoints[index].concentration)
          return sum + (predicted === null ? Number.POSITIVE_INFINITY : (response - predicted) ** 2)
        }, 0)
      }
    } else {
      const fit = fit4pl(sortedPoints.map((point) => point.concentration), responses)
      if (fit && Number.isFinite(fit.r2) && Number.isFinite(fit.sse)) {
        model = { kind: '4pl', params: { ...fit.params } }
        r2 = fit.r2
        sse = fit.sse
        direction = fit.params.D > fit.params.A ? 'increasing' : fit.params.D < fit.params.A ? 'decreasing' : 'nonmonotonic'
      }
    }

    const fittedResponseMin = model ? evaluateCalibration(model, minConcentration) : null
    const fittedResponseMax = model ? evaluateCalibration(model, maxConcentration) : null
    const curveEligible = Boolean(
      model && direction !== 'nonmonotonic' && direction !== 'unknown' &&
      fittedResponseMin !== null && fittedResponseMax !== null &&
      Number.isFinite(r2) && Number.isFinite(sse),
    )
    if (!model) message = 'The selected curve model could not be fit to these standard levels.'
    else if (direction === 'nonmonotonic' || direction === 'unknown') message = 'The fitted curve is not monotonic across the standard range, so concentration is ambiguous.'
    else if (!curveEligible) message = 'The fitted curve has invalid diagnostics.'
    curve = {
      model,
      eligible: curveEligible,
      status: curveEligible ? 'ready' : direction === 'nonmonotonic' || direction === 'unknown' ? 'ambiguous-curve' : 'curve-blocked',
      message: curveEligible ? '' : message,
      r2,
      sse,
      nLevels: fitPoints.length,
      minConcentration,
      maxConcentration,
      observedResponseMin,
      observedResponseMax,
      fittedResponseMin,
      fittedResponseMax,
      direction,
    }
    if (!curveEligible) addIssue({ severity: 'error', code: curve.status, message: curve.message })
  }

  if (curve.model && curve.eligible) {
    for (const work of standardWorks) {
      if (!work.include || work.meanResponse === null || work.concentration === null) continue
      const predicted = evaluateCalibration(curve.model, work.concentration)
      work.predictedResponse = predicted
      work.meanResidual = predicted === null ? null : work.meanResponse - predicted
      work.backCalculatedConcentration = invertCalibrationInRange(curve.model, work.meanResponse, curve)
      if (!work.eligible) continue
      const levelRows = mutableWells.filter((row) => row.type === 'Standard' && row.standardLevel === work.level && row.keep && row.correctedNet !== null)
      const expectedResponse = evaluateCalibration(curve.model, work.concentration)
      for (const row of levelRows) {
        row.predictedResponse = expectedResponse
        row.residual = expectedResponse === null ? null : (row.correctedNet as number) - expectedResponse
        row.backCalculatedConcentration = invertCalibrationInRange(curve.model, row.correctedNet as number, curve)
      }
    }
  }

  const groupsByAnimal = new Map<string, Set<string>>()
  for (const row of mutableWells) {
    if (row.type !== 'Sample' || !row.animalId) continue
    const groups = groupsByAnimal.get(row.animalId) ?? new Set<string>()
    groups.add(row.group)
    groupsByAnimal.set(row.animalId, groups)
  }
  const conflictedAnimals = new Set<string>()
  for (const [animalId, groups] of groupsByAnimal) {
    if (groups.size > 1) {
      conflictedAnimals.add(animalId)
      const message = `Animal ${animalId} has conflicting group labels; review the sample mapping.`
      addIssue({ severity: 'error', code: 'identity-conflict', message })
    }
  }

  for (const row of mutableWells) {
    if (row.type !== 'Sample' || row.status === 'excluded' || row.status === 'missing-exclusion-reason' || row.status === 'invalid-reading' || row.status === 'missing-reading') continue
    if (!row.animalId) {
      row.status = 'missing-sample-id'
      row.message = 'Assign an animal or sample ID before quantifying.'
      addIssue({ severity: 'error', code: 'missing-sample-id', message: row.message, wellId: row.wellId })
      continue
    }
    if (conflictedAnimals.has(row.animalId)) {
      row.status = 'identity-conflict'
      row.message = 'This animal has conflicting group labels across its sample wells.'
      continue
    }
    const dilutionText = typeof row.dilutionText === 'string' ? row.dilutionText : ''
    let dilution: number | null
    if (dilutionText.length > 0) {
      dilution = parseDilutionFactor(dilutionText)
    } else if (wells[row.wellId].dilutionFactor === undefined || wells[row.wellId].dilutionFactor === null) {
      dilution = 1
    } else {
      dilution = parseDilutionFactor(wells[row.wellId].dilutionFactor)
    }
    row.dilutionFactor = dilution
    if (dilution === null) {
      row.status = 'invalid-dilution'
      row.message = 'Enter a valid positive dilution factor before quantifying.'
      addIssue({ severity: 'error', code: 'invalid-dilution', message: row.message, wellId: row.wellId })
      continue
    }
    if (row.correctedNet === null) {
      row.status = correctionEligible ? 'missing-reading' : 'blank-correction-blocked'
      row.message = correctionEligible ? 'No corrected absorbance is available for this well.' : correction.message
      continue
    }
    if (!correctionEligible) {
      row.status = 'blank-correction-blocked'
      row.message = correction.message || 'Review absorbance correction before quantifying.'
      continue
    }
    if (!curve.eligible || !curve.model) {
      row.status = curve.status === 'ambiguous-curve' ? 'ambiguous-curve' : 'curve-blocked'
      row.message = curve.message
      continue
    }

    const rangeStatus = classifyRange(row.correctedNet, curve)
    if (rangeStatus === 'below-range' || rangeStatus === 'above-range') {
      row.status = rangeStatus
      row.message = rangeStatus === 'below-range'
        ? 'Absorbance is below the calibrated concentration range.'
        : 'Absorbance is above the calibrated concentration range.'
      addIssue({ severity: 'warning', code: rangeStatus, message: row.message, wellId: row.wellId })
      continue
    }
    const concentration = invertCalibrationInRange(curve.model, row.correctedNet, curve)
    if (concentration === null) {
      row.status = 'unquantifiable'
      row.message = 'Absorbance does not map to a unique concentration inside the selected standards.'
      addIssue({ severity: 'warning', code: 'unquantifiable', message: row.message, wellId: row.wellId })
      continue
    }
    row.concentrationBeforeDilution = concentration
    row.concentrationAfterDilution = concentration * dilution
    row.eligible = finite(row.concentrationAfterDilution)
    row.status = row.eligible ? 'ready' : 'unquantifiable'
    row.message = row.eligible ? '' : 'Dilution-adjusted concentration is not finite.'
    if (!row.eligible) addIssue({ severity: 'error', code: 'invalid-adjusted-concentration', message: row.message, wellId: row.wellId })
  }

  const technicalGroups = new Map<string, MutableWell[]>()
  for (const row of mutableWells) {
    if (row.type !== 'Sample' || !row.keep || !row.animalId || row.dilutionFactor === null || row.correctedNet === null || conflictedAnimals.has(row.animalId)) continue
    const key = JSON.stringify([row.animalId, row.dilutionFactor])
    const group = technicalGroups.get(key) ?? []
    group.push(row)
    technicalGroups.set(key, group)
  }
  for (const groupRows of technicalGroups.values()) {
    const absorbances = groupRows.map((row) => row.correctedNet as number)
    const spread = absorbances.length > 1 ? Math.max(...absorbances) - Math.min(...absorbances) : null
    const warning = spread !== null && spread > settings.replicateWarning
    for (const row of groupRows) {
      row.technicalReplicateCount = groupRows.length
      row.technicalSpread = spread
      row.replicateWarning = warning
      if (warning) {
        row.message = row.message
          ? `${row.message} Same-dilution wells exceed the absorbance spread review threshold.`
          : 'Same-dilution wells exceed the absorbance spread review threshold; review without automatic exclusion.'
      }
    }
    if (warning) {
      addIssue({
        severity: 'warning',
        code: 'sample-replicate-warning',
        message: `Sample ${groupRows[0].animalId} has same-dilution wells with an absorbance spread above ${settings.replicateWarning}; review the wells.`,
      })
    }
  }

  const sampleGroups = new Map<string, MutableWell[]>()
  for (const row of mutableWells) {
    if (row.type !== 'Sample' || !row.animalId) continue
    const key = JSON.stringify([row.animalId, row.group])
    const group = sampleGroups.get(key) ?? []
    group.push(row)
    sampleGroups.set(key, group)
  }
  const samples: SampleSummary[] = []
  for (const groupRows of sampleGroups.values()) {
    const first = groupRows[0]
    const values = groupRows.filter((row) => row.eligible && row.concentrationAfterDilution !== null).map((row) => row.concentrationAfterDilution as number)
    const total = groupRows.length
    const eligible = values.length
    const partial = eligible > 0 && eligible < total
    const replicateWarning = groupRows.some((row) => row.replicateWarning)
    const sd = eligible > 1
      ? Math.sqrt(values.reduce((sum, value) => sum + (value - values.reduce((a, b) => a + b, 0) / values.length) ** 2, 0) / (eligible - 1))
      : null
    const mean = eligible ? values.reduce((sum, value) => sum + value, 0) / eligible : null
    const messages = Array.from(new Set(groupRows.filter((row) => !row.eligible && row.message).map((row) => row.message)))
    const isConflict = conflictedAnimals.has(first.animalId)
    const status: ElisaStatus = isConflict ? 'identity-conflict' : partial ? 'partial-replicates' : eligible && replicateWarning ? 'warning' : eligible ? 'ready' : 'no-eligible-replicates'
    samples.push({
      animalId: first.animalId,
      group: first.group,
      totalReplicateCount: total,
      eligibleReplicateCount: isConflict ? 0 : eligible,
      withheldReplicateCount: total - (isConflict ? 0 : eligible),
      partial: isConflict ? false : partial,
      replicateWarning: isConflict ? false : replicateWarning,
      mean: isConflict ? null : mean,
      sd: isConflict ? null : sd,
      eligible: !isConflict && eligible > 0,
      status,
      message: isConflict
        ? 'Conflicting group labels block this animal summary.'
        : partial
          ? `${total - eligible} of ${total} sample wells are withheld; the mean uses eligible wells only.${replicateWarning ? ' Same-dilution wells also show a spread above the review threshold.' : ''}`
          : eligible && replicateWarning
            ? 'Same-dilution wells show a spread above the review threshold; review them without automatic exclusion.'
          : eligible
            ? ''
            : messages[0] || 'No sample well has an eligible concentration.',
    })
  }
  samples.sort((a, b) => a.animalId.localeCompare(b.animalId) || a.group.localeCompare(b.group))

  const finalizedStandards: StandardDiagnostic[] = standardWorks.map((work) => ({ ...work }))
  const finalizedWells: WellDiagnostic[] = mutableWells.map((row) => ({ ...row }))
  const result: ElisaAnalysisResult = {
    settings: settingsCopy,
    correction,
    curve,
    standards: finalizedStandards,
    wells: finalizedWells,
    samples,
    issues,
  }
  return deepFreeze(result) as ElisaAnalysisResult
}

function classifyRange(response: number, curve: CurveWork): 'in-range' | 'below-range' | 'above-range' | 'no-range' {
  if (curve.observedResponseMin === null || curve.observedResponseMax === null || curve.fittedResponseMin === null || curve.fittedResponseMax === null) return 'no-range'
  const lower = Math.max(curve.observedResponseMin, Math.min(curve.fittedResponseMin, curve.fittedResponseMax))
  const upper = Math.min(curve.observedResponseMax, Math.max(curve.fittedResponseMin, curve.fittedResponseMax))
  const tolerance = 1e-10 * Math.max(1, Math.abs(lower), Math.abs(upper), Math.abs(response))
  if (response >= lower - tolerance && response <= upper + tolerance) return 'in-range'
  if (curve.direction === 'increasing') return response < lower ? 'below-range' : 'above-range'
  if (curve.direction === 'decreasing') return response > upper ? 'below-range' : 'above-range'
  return 'no-range'
}

function invertCalibrationInRange(model: CalibrationModel, response: number, curve: CurveWork): number | null {
  if (!finite(response) || curve.minConcentration === null || curve.maxConcentration === null) return null
  const min = curve.minConcentration
  const max = curve.maxConcentration
  const atMin = evaluateCalibration(model, min)
  const atMax = evaluateCalibration(model, max)
  if (atMin === null || atMax === null) return null
  const low = Math.min(atMin, atMax)
  const high = Math.max(atMin, atMax)
  const tolerance = 1e-10 * Math.max(1, Math.abs(low), Math.abs(high), Math.abs(response))
  if (response < low - tolerance || response > high + tolerance) return null
  if (model.kind === '4pl') return invert4pl(model.params, response, min, max)

  let lo = min
  let hi = max
  for (let iteration = 0; iteration < 120; iteration += 1) {
    const mid = (lo + hi) / 2
    const value = evaluateCalibration(model, mid)
    if (value === null) return null
    if (Math.abs(value - response) <= tolerance) return mid
    const increasing = curve.direction === 'increasing'
    if ((increasing && value < response) || (!increasing && value > response)) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
