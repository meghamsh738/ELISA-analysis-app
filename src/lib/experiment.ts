import type { AssaySettings, ElisaAnalysisResult } from './elisaAnalysis'
import { emptyLayout96, type WellAssignment } from './layoutModel'
import { plate96WellIds, type WellId96 } from './plate96'

export const STORAGE_KEY = 'easylab-next:elisa:experiment:v1'
export const PRESETS_KEY = 'easylab-next:elisa:presets:v1'
export const LAYOUTS_KEY = 'easylab-next:elisa:layouts:v1'
export const ENGINE = 'next-elisa-1'
export const steps = [
  'Import & map',
  'Standards & blanks',
  'Review fit',
  'Concentrations',
  'Graphs & export',
] as const
export type GraphSettings = {
  title: string
  xLabel: string
  yLabel: string
  groupOrder: string[]
  colours: Record<string, string>
  pointSize: number
  width: number
  height: number
  log: boolean
  uncertainty: 'none' | 'sd' | 'sem'
}
export type Experiment = {
  id: string
  name: string
  revision: number
  createdAt: string
  practice: boolean
  preset: string
  readerText: string
  sources: { name: string; text: string }[]
  wells: Record<WellId96, WellAssignment>
  settings: AssaySettings
  graph: GraphSettings
  approvals: boolean[]
  sampleText: string
  sampleHasHeader: boolean
  animalIdCol: number
  groupCol: number
  dilutionCol: number
}
export type AssayPreset = { name: string; settings: AssaySettings }
export type SavedLayout = {
  name: string
  wells: Record<WellId96, WellAssignment>
}
export const defaultGraph = (): GraphSettings => ({
  title: 'Sample concentrations',
  xLabel: 'Group',
  yLabel: '',
  groupOrder: [],
  colours: {},
  pointSize: 9,
  width: 900,
  height: 500,
  log: false,
  uncertainty: 'none',
})
export const customSettings = (): AssaySettings => ({
  inputMode: 'raw',
  blankSubtract: false,
  blankRule: 'median',
  blankWells: [],
  curveModel: '4pl',
  degree: 2,
  units: '',
  replicateWarning: 0.15,
  standards: {},
})
export const builtinPresets = (): AssayPreset[] => [
  { name: 'Custom assay — configure before use', settings: customSettings() },
  {
    name: 'Legacy settings — not kit validated',
    settings: {
      ...customSettings(),
      blankSubtract: true,
      curveModel: 'poly',
      units: 'AU',
      standards: Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [
          `Std${i + 1}`,
          { concentration: String(1000 / 10 ** i), include: true, reason: '' },
        ]),
      ),
    },
  },
]
export const newExperiment = (
  settings = customSettings(),
  graph = defaultGraph(),
  preset = builtinPresets()[0].name,
): Experiment => ({
  id: crypto.randomUUID(),
  name: 'Untitled ELISA experiment',
  revision: 1,
  createdAt: new Date().toISOString(),
  practice: false,
  preset,
  readerText: '',
  sources: [],
  wells: emptyLayout96(),
  settings: cleanPreset(settings),
  graph: structuredClone(graph),
  approvals: [false, false, false, false, false],
  sampleText: '',
  sampleHasHeader: true,
  animalIdCol: 0,
  groupCol: 1,
  dilutionCol: -1,
})
export const cleanPreset = (s: AssaySettings): AssaySettings => ({
  ...structuredClone(s),
  blankWells: [],
  standards: Object.fromEntries(
    Object.entries(s.standards).map(([level, value]) => [
      level,
      { concentration: value.concentration, include: true, reason: '' },
    ]),
  ),
})
export const cleanLayout = (wells: Experiment['wells']): Experiment['wells'] =>
  Object.fromEntries(
    plate96WellIds.map((id) => [
      id,
      { ...structuredClone(wells[id]), keep: true, exclusionReason: '' },
    ]),
  ) as Experiment['wells']
export const revise = (
  exp: Experiment,
  patch: Partial<Experiment>,
  invalidateFrom = 0,
): Experiment => ({
  ...exp,
  ...patch,
  revision: exp.revision + 1,
  approvals: exp.approvals.map((yes, i) => (i < invalidateFrom ? yes : false)),
})
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
const string = (v: unknown, name: string, max = 1000): string => {
  if (typeof v !== 'string' || v.length > max)
    throw new Error(`Invalid ${name}.`)
  return v
}
const finite = (v: unknown, name: string, min: number, max: number): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
    throw new Error(`Invalid ${name}.`)
  return v
}
export const validateExperiment = (input: unknown): Experiment => {
  if (
    !object(input) ||
    !object(input.settings) ||
    !object(input.wells) ||
    !object(input.graph)
  )
    throw new Error('This is not an ELISA experiment.')
  const exp = input as unknown as Experiment
  string(exp.id, 'experiment ID')
  string(exp.name, 'name')
  string(exp.createdAt, 'date')
  string(exp.preset, 'preset')
  string(exp.readerText, 'reader input', 10_000_000)
  string(exp.sampleText, 'sample input', 1_000_000)
  finite(exp.revision, 'revision', 1, Number.MAX_SAFE_INTEGER)
  if (
    !Number.isInteger(exp.revision) ||
    typeof exp.practice !== 'boolean' ||
    typeof exp.sampleHasHeader !== 'boolean' ||
    !Array.isArray(exp.approvals) ||
    exp.approvals.length !== 5 ||
    exp.approvals.some((v) => typeof v !== 'boolean')
  )
    throw new Error('Invalid experiment review state.')
  for (const column of [exp.animalIdCol, exp.groupCol, exp.dilutionCol]) {
    finite(column, 'sample column', -1, 1000)
    if (!Number.isInteger(column)) throw new Error('Invalid sample column.')
  }
  if (!Array.isArray(exp.sources) || exp.sources.length > 50)
    throw new Error('Invalid source copies.')
  exp.sources.forEach((source) => {
    if (!object(source)) throw new Error('Invalid source copy.')
    string(source.name, 'source name')
    string(source.text, 'source copy', 10_000_000)
  })
  const s = exp.settings
  if (
    !['raw', 'wavelengthCorrected', 'blankCorrected'].includes(s.inputMode) ||
    !['mean', 'median'].includes(s.blankRule) ||
    !['poly', '4pl'].includes(s.curveModel) ||
    ![1, 2, 3].includes(s.degree) ||
    typeof s.blankSubtract !== 'boolean'
  )
    throw new Error('Invalid assay settings.')
  finite(s.replicateWarning, 'replicate warning', 0, 100)
  string(s.units, 'units', 100)
  if (
    !Array.isArray(s.blankWells) ||
    s.blankWells.some((id) => !plate96WellIds.includes(id)) ||
    new Set(s.blankWells).size !== s.blankWells.length ||
    !object(s.standards)
  )
    throw new Error('Invalid standards or blank selection.')
  if (Object.keys(s.standards).length > 96)
    throw new Error('Too many standard levels.')
  Object.entries(s.standards).forEach(([level, decision]) => {
    string(level, 'standard level')
    if (!object(decision) || typeof decision.include !== 'boolean')
      throw new Error('Invalid standard decision.')
    string(decision.concentration, 'standard concentration')
    string(decision.reason, 'standard reason')
  })
  if (Object.keys(exp.wells).length !== 96)
    throw new Error('A layout must contain exactly 96 wells.')
  for (const id of plate96WellIds) {
    const well = exp.wells[id]
    if (
      !object(well) ||
      well.wellId !== id ||
      !['Empty', 'Sample', 'Standard', 'Blank'].includes(well.type) ||
      typeof well.keep !== 'boolean'
    )
      throw new Error(`Invalid well ${id}.`)
    for (const key of [
      'animalId',
      'group',
      'standardLevel',
      'dilutionText',
      'exclusionReason',
    ] as const)
      if (well[key] !== undefined) string(well[key], `${id} ${key}`)
    if (well.dilutionFactor !== undefined)
      finite(well.dilutionFactor, `${id} dilution`, -1e12, 1e12)
    if (
      well.meta !== undefined &&
      (!object(well.meta) ||
        Object.values(well.meta).some((v) => typeof v !== 'string'))
    )
      throw new Error(`Invalid metadata for ${id}.`)
  }
  const g = exp.graph
  string(g.title, 'figure title')
  string(g.xLabel, 'x label')
  string(g.yLabel, 'y label')
  finite(g.width, 'figure width', 300, 2400)
  finite(g.height, 'figure height', 250, 1800)
  finite(g.pointSize, 'point size', 3, 24)
  if (
    typeof g.log !== 'boolean' ||
    !['none', 'sd', 'sem'].includes(g.uncertainty) ||
    !Array.isArray(g.groupOrder) ||
    g.groupOrder.some((v) => typeof v !== 'string') ||
    !object(g.colours) ||
    Object.values(g.colours).some(
      (v) => typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v),
    )
  )
    throw new Error('Invalid graph settings.')
  return structuredClone(exp)
}
const digest = async (text: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
export const encodeExperiment = async (
  experiment: Experiment,
  results: ElisaAnalysisResult,
) => {
  const payload = {
    engineVersion: ENGINE,
    experiment: validateExperiment(experiment),
    results,
  }
  const text = JSON.stringify(payload)
  if (new TextEncoder().encode(text).length > 25_000_000)
    throw new Error('Experiment exceeds the 25 MB portable-package limit.')
  const encoded = JSON.stringify(
    {
      format: 'easylab.elisa',
      version: 1,
      checksum: await digest(text),
      payload,
    },
    null,
    2,
  )
  if (new TextEncoder().encode(encoded).length > 30_000_000)
    throw new Error('Formatted package exceeds the 30 MB limit.')
  return encoded
}
export const decodeExperiment = async (text: string): Promise<Experiment> => {
  if (new TextEncoder().encode(text).length > 30_000_000)
    throw new Error('Package exceeds the size limit.')
  const envelope: unknown = JSON.parse(text)
  if (
    !object(envelope) ||
    envelope.format !== 'easylab.elisa' ||
    envelope.version !== 1 ||
    !object(envelope.payload) ||
    envelope.payload.engineVersion !== ENGINE
  )
    throw new Error(
      'Unsupported ELISA experiment package or calculation version.',
    )
  if (envelope.checksum !== (await digest(JSON.stringify(envelope.payload))))
    throw new Error(
      'The package checksum does not match; the file may have changed.',
    )
  return validateExperiment(envelope.payload.experiment)
}
export const makePractice = (): Experiment => {
  const exp = newExperiment()
  exp.practice = true
  exp.name = 'Practice — one-plate ELISA'
  exp.preset = 'Fictional practice assay'
  exp.settings = {
    ...customSettings(),
    curveModel: 'poly',
    degree: 1,
    units: 'ng/mL',
    blankSubtract: true,
    blankWells: ['H1', 'H2'],
  }
  const lines = ['Well\t450\t570']
  const add = (id: WellId96, response: number) =>
    lines.push(`${id}\t${(response + 0.15).toFixed(6)}\t0.05`)
  const standards: Record<
    string,
    { concentration: string; include: boolean; reason: string }
  > = {}
  for (let i = 0; i < 5; i++) {
    const level = `Std${i + 1}`
    const concentration = [1, 2, 4, 8, 16][i]
    standards[level] = {
      concentration: String(concentration),
      include: true,
      reason: '',
    }
    for (let j = 1; j <= 2; j++) {
      const id = `${'ABCDE'[i]}${j}` as WellId96
      exp.wells[id] = {
        wellId: id,
        type: 'Standard',
        standardLevel: level,
        keep: true,
      }
      add(id, concentration * 0.1 + (j === 1 ? -0.002 : 0.002))
    }
  }
  for (const id of ['H1', 'H2'] as WellId96[]) {
    exp.wells[id] = { wellId: id, type: 'Blank', keep: true }
    add(id, 0)
  }
  const concentrations = [3, 3.5, 4, 7, 8, 9, 20, 0.4]
  concentrations.forEach((value, i) => {
    for (let j = 0; j < 2; j++) {
      const id = `${'ABCDEFGH'[i]}${3 + j}` as WellId96
      exp.wells[id] = {
        wellId: id,
        type: 'Sample',
        animalId: `Sample ${i + 1}`,
        group: i < 3 ? 'Control' : i < 6 ? 'Treatment' : 'Range checks',
        dilutionText: '2',
        dilutionFactor: 2,
        keep: true,
      }
      add(id, value * 0.1 + (j ? 0.003 : -0.003))
    }
  })
  exp.settings = { ...exp.settings, standards }
  exp.readerText = lines.join('\n')
  exp.sources = [{ name: 'Fictional practice data.tsv', text: exp.readerText }]
  return exp
}
