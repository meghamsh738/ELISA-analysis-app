import './App.css'
import {
  useEffect,
  useMemo,
  useState,
  useRef,
  lazy,
  Suspense,
  type ChangeEvent,
} from 'react'
import {
  analyzeElisa,
  parseDilutionFactor,
  type AssaySettings,
} from './lib/elisaAnalysis'
import { parseElisaReaderText } from './lib/elisaReader'
import { plate96WellIds, type WellId96 } from './lib/plate96'
import type { WellAssignment } from './lib/layoutModel'
import {
  builtinPresets,
  cleanLayout,
  cleanPreset,
  decodeExperiment,
  encodeExperiment,
  LAYOUTS_KEY,
  makePractice,
  newExperiment,
  PRESETS_KEY,
  revise,
  steps,
  STORAGE_KEY,
  validateExperiment,
  type AssayPreset,
  type Experiment,
  type SavedLayout,
} from './lib/experiment'
import {
  delimited,
  download,
  exportWorkbook,
  safeName,
  sampleRows,
  wellRows,
} from './lib/export'
import { LayoutTab } from './tabs/LayoutTab'
const CalibrationPlots = lazy(() =>
  import('./components/AnalysisPlots').then((module) => ({
    default: module.CalibrationPlots,
  })),
)
const SamplePlot = lazy(() =>
  import('./components/AnalysisPlots').then((module) => ({
    default: module.SamplePlot,
  })),
)

const fmt = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : Number(value.toPrecision(6)).toString()
const readLibrary = <T,>(key: string, validate: (value: unknown) => T): T[] => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(raw) ? raw.map(validate) : []
  } catch {
    return []
  }
}
const validatePreset = (value: unknown): AssayPreset => {
  const preset = value as AssayPreset
  if (!preset || typeof preset.name !== 'string' || !preset.name.trim())
    throw new Error('Invalid preset')
  return {
    name: preset.name,
    settings: validateExperiment({
      ...newExperiment(),
      settings: preset.settings,
    }).settings,
  }
}
const validateLayout = (value: unknown): SavedLayout => {
  const layout = value as SavedLayout
  if (!layout || typeof layout.name !== 'string' || !layout.name.trim())
    throw new Error('Invalid layout')
  return {
    name: layout.name,
    wells: validateExperiment({ ...newExperiment(), wells: layout.wells })
      .wells,
  }
}
function ResetDialog({
  title,
  cancel,
  proceed,
}: {
  title: string
  cancel: () => void
  proceed: () => void
}) {
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => previous?.focus()
  }, [])
  return (
    <div className="modal-backdrop">
      <div
        ref={dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        className="modal"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            cancel()
          }
          if (event.key === 'Tab') {
            const buttons = dialog.current!.querySelectorAll('button')
            const first = buttons[0]
            const last = buttons[buttons.length - 1]
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first.focus()
            }
          }
        }}
      >
        <h2 id="reset-title">{title}</h2>
        <p>
          The current screen will be replaced. Save an experiment package first
          if you want a portable copy. Undo can restore the previous edit in
          this session.
        </p>
        <div className="actions">
          <button onClick={cancel}>Keep working</button>
          <button className="primary" onClick={proceed}>
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
const readInitial = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return {
      experiment: raw ? validateExperiment(JSON.parse(raw)) : newExperiment(),
      error: '',
    }
  } catch {
    return {
      experiment: newExperiment(),
      error:
        'The previous local experiment could not be opened. Its saved browser copy has been left unchanged; open a portable backup to recover it.',
    }
  }
}
function Table({
  headers,
  children,
}: {
  headers: string[]
  children: React.ReactNode
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
function App() {
  const [initial] = useState(readInitial)
  const [exp, setExp] = useState(initial.experiment)
  const [step, setStep] = useState(0)
  const [history, setHistory] = useState<Experiment[]>([])
  const [notice, setNotice] = useState(initial.error)
  const [storageError, setStorageError] = useState('')
  const [allowAutosave, setAllowAutosave] = useState(!initial.error)
  const [customPresets, setCustomPresets] = useState<AssayPreset[]>(() =>
    readLibrary(PRESETS_KEY, validatePreset),
  )
  const [layouts, setLayouts] = useState<SavedLayout[]>(() =>
    readLibrary(LAYOUTS_KEY, validateLayout),
  )
  const [presetName, setPresetName] = useState('My assay')
  const [layoutName, setLayoutName] = useState('My plate layout')
  const [showEmpty, setShowEmpty] = useState(false)
  const [serialTop, setSerialTop] = useState('1000')
  const [serialFactor, setSerialFactor] = useState('10')
  const [serialOrder, setSerialOrder] = useState('high')
  const [resetAction, setResetAction] = useState<
    'new' | 'practice' | 'step' | null
  >(null)
  const parsed = useMemo(
    () => parseElisaReaderText(exp.readerText, exp.settings.inputMode),
    [exp.readerText, exp.settings.inputMode],
  )
  const result = useMemo(
    () => analyzeElisa(exp.wells, parsed.wells, exp.settings),
    [exp.wells, parsed, exp.settings],
  )
  const wellIds = plate96WellIds.filter(
    (id) => showEmpty || parsed.wells[id] || exp.wells[id].type !== 'Empty',
  )
  const assigned = Object.values(exp.wells).filter((w) => w.type !== 'Empty')
  const levels = [
    ...new Set(
      assigned
        .filter((w) => w.type === 'Standard')
        .map((w) => w.standardLevel ?? '')
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const presets = [...builtinPresets(), ...customPresets]
  const groups = [...new Set(result.samples.map((s) => s.group || 'Ungrouped'))]
  const hasInput = !!exp.readerText.trim() || assigned.length > 0
  useEffect(() => {
    if (!allowAutosave) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(exp))
      queueMicrotask(() => setStorageError(''))
    } catch {
      queueMicrotask(() =>
        setStorageError(
          'Browser storage is full or unavailable. Download an experiment package to keep this work.',
        ),
      )
    }
  }, [exp, allowAutosave])
  const change = (patch: Partial<Experiment>, from = 0) => {
    setHistory((h) => [...h.slice(-29), exp])
    setExp(revise(exp, patch, from))
    setAllowAutosave(true)
  }
  const settings = (patch: Partial<AssaySettings>) =>
    change({ settings: { ...exp.settings, ...patch } }, 1)
  const well = (id: WellId96, patch: Partial<WellAssignment>) =>
    change(
      { wells: { ...exp.wells, [id]: { ...exp.wells[id], ...patch } } },
      Object.keys(patch).every((key) =>
        ['keep', 'exclusionReason'].includes(key),
      )
        ? 1
        : 0,
    )
  const confirm = (index: number) => {
    const approvals = [...exp.approvals]
    approvals[index] = true
    setHistory((h) => [...h.slice(-29), exp])
    setExp({ ...exp, approvals, revision: exp.revision + 1 })
    if (index < 4) setStep(index + 1)
  }
  const restore = (next: Experiment) => {
    setHistory((h) => [...h.slice(-29), exp])
    setExp(next)
    setAllowAutosave(true)
    setStep(0)
  }
  const undo = () => {
    const previous = history.at(-1)
    if (!previous) return
    setExp({ ...previous, revision: exp.revision + 1 })
    setHistory(history.slice(0, -1))
    setNotice('Previous edit restored as a new revision.')
  }
  const onFile = async (
    event: ChangeEvent<HTMLInputElement>,
    kind: 'reader' | 'experiment',
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      if (file.size > (kind === 'reader' ? 10_000_000 : 30_000_000))
        throw new Error('File is too large for this local workflow.')
      const text = await file.text()
      if (kind === 'experiment') {
        restore(await decodeExperiment(text))
        setNotice(
          'Experiment reopened with its reviewed choices and graph settings.',
        )
        return
      }
      change({
        readerText: text,
        sources: [...exp.sources, { name: file.name, text }],
      })
      setNotice(
        'Source file copied into the experiment. Review every row below.',
      )
    } catch (e) {
      setNotice(String(e))
    }
  }
  const save = async () => {
    try {
      const text = await encodeExperiment(exp, result)
      download(
        text,
        `${safeName(exp.name)}-r${exp.revision}.easylab.json`,
        'application/json',
      )
      setNotice(
        `Experiment revision ${exp.revision} downloaded. Keep this file as a portable backup.`,
      )
    } catch (e) {
      setNotice(String(e))
    }
  }
  const savePreset = () => {
    try {
      if (!presetName.trim()) throw new Error('Enter a preset name.')
      const next = [
        ...customPresets.filter((p) => p.name !== presetName.trim()),
        { name: presetName.trim(), settings: cleanPreset(exp.settings) },
      ]
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next))
      setCustomPresets(next)
      setNotice(
        'Assay preset saved. Blank selections and reviewed exclusions will need confirmation in a new experiment.',
      )
    } catch (e) {
      setNotice(String(e))
    }
  }
  const saveLayout = () => {
    try {
      if (!layoutName.trim()) throw new Error('Enter a layout name.')
      const next = [
        ...layouts.filter((p) => p.name !== layoutName.trim()),
        { name: layoutName.trim(), wells: cleanLayout(exp.wells) },
      ]
      localStorage.setItem(LAYOUTS_KEY, JSON.stringify(next))
      setLayouts(next)
      setNotice(
        'Layout saved. Loading it into another experiment requires a fresh mapping review.',
      )
    } catch (e) {
      setNotice(String(e))
    }
  }
  const reset = () => {
    if (resetAction === 'practice') restore(makePractice())
    else if (resetAction === 'new')
      restore(newExperiment(exp.settings, exp.graph, exp.preset))
    else if (resetAction === 'step') {
      const blank = newExperiment()
      if (step === 0)
        change({ wells: blank.wells, readerText: '', sampleText: '' })
      else if (step === 1) change({ settings: cleanPreset(exp.settings) }, 1)
      else if (step === 2) change({ wells: cleanLayout(exp.wells) }, 1)
      else if (step === 3) change({}, 3)
      else change({ graph: blank.graph }, 4)
    }
    setResetAction(null)
  }
  const fillSeries = () => {
    const top = Number(serialTop)
    const factor = Number(serialFactor)
    if (
      !(
        top > 0 &&
        factor > 1 &&
        Number.isFinite(top) &&
        Number.isFinite(factor)
      )
    ) {
      setNotice(
        'Serial top must be positive and dilution factor greater than 1.',
      )
      return
    }
    const standards = { ...exp.settings.standards }
    levels.forEach((level, i) => {
      const concentration =
        top / factor ** (serialOrder === 'high' ? i : levels.length - 1 - i)
      standards[level] = {
        concentration: String(concentration),
        include: standards[level]?.include ?? true,
        reason: standards[level]?.reason ?? '',
      }
    })
    settings({ standards })
  }
  const importProblems = [...parsed.warnings]
  const invalidAssigned = parsed.rows.filter((row) => {
    const w = exp.wells[row.wellId as WellId96]
    const decision = w?.standardLevel
      ? exp.settings.standards[w.standardLevel]
      : undefined
    const excludedLevel =
      w?.type === 'Standard' &&
      decision?.include === false &&
      !!decision.reason.trim()
    return row.issues.length && w?.type !== 'Empty' && w?.keep && !excludedLevel
  })
  if (invalidAssigned.length)
    importProblems.push(
      `${invalidAssigned.length} assigned reader row(s) need correction or an explicit, reasoned exclusion.`,
    )
  if (
    assigned.some(
      (w) =>
        w.type === 'Sample' &&
        (!w.animalId?.trim() ||
          parseDilutionFactor(
            w.dilutionText?.trim() || (w.dilutionFactor ?? '1'),
          ) === null),
    )
  )
    importProblems.push(
      'Sample IDs and positive dilution factors must be valid.',
    )
  if (assigned.some((w) => !w.keep && !w.exclusionReason?.trim()))
    importProblems.push('Excluded wells need a reason.')
  if (assigned.some((w) => w.type === 'Standard' && !w.standardLevel?.trim()))
    importProblems.push('Every standard well needs a standard level.')
  const canImport =
    !!parsed.rows.length && assigned.length > 0 && importProblems.length === 0
  const selectedStandardProblems = result.standards.filter(
    (s) => s.include && !s.eligible,
  )
  const canSettings =
    exp.approvals[0] &&
    result.correction.eligible &&
    !!exp.settings.units.trim() &&
    selectedStandardProblems.length === 0 &&
    levels.length > 0
  const ready = exp.approvals.slice(0, 3).every(Boolean)
  return (
    <div className="next-app">
      <aside className="workflow-nav no-print">
        <div className="brand">
          EL <span>EasyLab Next</span>
        </div>
        <p className="eyebrow">ELISA Analysis</p>
        <nav aria-label="Analysis steps">
          {steps.map((name, i) => (
            <button
              key={name}
              onClick={() => setStep(i)}
              aria-current={step === i ? 'step' : undefined}
            >
              <span className="step-number">
                {exp.approvals[i] ? '✓' : i + 1}
              </span>
              {name}
            </button>
          ))}
        </nav>
        <p className="nav-note">
          One plate · local workspace
          <br />
          Revision {exp.revision}
          {exp.practice ? ' · Practice' : ''}
        </p>
        <div className="actions">
          <button onClick={undo} disabled={!history.length}>
            Undo
          </button>
          <button onClick={() => setResetAction('step')}>Reset step</button>
        </div>
        <button onClick={() => setResetAction('new')}>New experiment</button>
        <details>
          <summary>Local storage</summary>
          <p>
            Browser or Next desktop profile storage is local to this device.
            Download an experiment package for a portable backup. Original files
            are unchanged.
          </p>
        </details>
      </aside>
      <main>
        <header className="page-header">
          <div>
            <p className="eyebrow">
              {exp.practice
                ? 'Fictional practice experiment'
                : 'One-plate analysis'}
            </p>
            <h1>ELISA Analysis</h1>
            <p>
              Review the plate, explain your choices, then report the
              concentrations.
            </p>
          </div>
          <div className="actions no-print">
            <button
              onClick={() =>
                hasInput ? setResetAction('practice') : restore(makePractice())
              }
            >
              Open practice experiment
            </button>
            <label className="file-button">
              Open experiment
              <input
                type="file"
                accept=".json"
                onChange={(e) => void onFile(e, 'experiment')}
              />
            </label>
            <button onClick={() => void save()}>Save experiment</button>
          </div>
        </header>
        <div className="experiment-bar no-print">
          <label>
            Experiment name
            <input
              value={exp.name}
              onChange={(e) => change({ name: e.target.value }, 5)}
            />
          </label>
          <span className="badge">
            {exp.approvals.filter(Boolean).length}/5 reviewed
          </span>
          <span className="muted">
            Local autosave{' '}
            {allowAutosave && !storageError ? 'on' : 'unavailable'}
          </span>
        </div>
        {notice && (
          <div role="status" className="notice no-print">
            {notice}
            <button onClick={() => setNotice('')} aria-label="Dismiss message">
              ×
            </button>
          </div>
        )}
        {storageError && (
          <p role="alert" className="warning">
            {storageError}
          </p>
        )}
        <div className="step-heading no-print">
          <p className="eyebrow">Step {step + 1} of 5</p>
          <h2>{steps[step]}</h2>
        </div>
        {step === 0 && (
          <>
            <section>
              <h3>Import reader output</h3>
              <p>
                Paste or load a CSV/TSV/TXT file. Two wavelength blocks and
                Well/450/570 tables are supported; corrected data uses
                Well/Absorbance. Every row stays visible below.
              </p>
              <div className="controls">
                <label className="file-button">
                  Choose reader file
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={(e) => void onFile(e, 'reader')}
                  />
                </label>
                <label>
                  Input already contains
                  <select
                    aria-label="Input correction state"
                    value={exp.settings.inputMode}
                    onChange={(e) =>
                      change({
                        settings: {
                          ...exp.settings,
                          inputMode: e.target
                            .value as AssaySettings['inputMode'],
                          blankSubtract:
                            e.target.value === 'blankCorrected'
                              ? false
                              : exp.settings.blankSubtract,
                        },
                      })
                    }
                  >
                    <option value="raw">Raw 450 and 570 readings</option>
                    <option value="wavelengthCorrected">
                      Wavelength-corrected absorbance
                    </option>
                    <option value="blankCorrected">
                      Already blank-corrected absorbance
                    </option>
                  </select>
                </label>
              </div>
              <textarea
                aria-label="Reader output"
                value={exp.readerText}
                onChange={(e) => change({ readerText: e.target.value })}
                rows={7}
                placeholder={'Well\t450\t570\nA1\t0.72\t0.05'}
              />
              <p className="muted">
                Raw input: absorbance = 450 − 570. Corrected input uses its
                supplied Absorbance/Net column. Already blank-corrected input
                will not be corrected again.
              </p>
              <div className="metrics">
                <span>{parsed.rows.length} reader rows</span>
                <span>{Object.keys(parsed.wells).length} matched wells</span>
                <span>{parsed.unmatchedCount} unmatched</span>
                <span>{parsed.duplicateCount} duplicates</span>
                <span>
                  {
                    Object.keys(parsed.wells).filter(
                      (id) => exp.wells[id as WellId96].type === 'Empty',
                    ).length
                  }{' '}
                  unassigned readings
                </span>
              </div>
              {parsed.rows.length > 0 && (
                <details>
                  <summary>Preview all original reader rows</summary>
                  <Table
                    headers={['Input row', 'Well', ...parsed.headers, 'Issue']}
                  >
                    {parsed.rows.map((row, i) => (
                      <tr key={i}>
                        <td>{row.row}</td>
                        <td>{row.wellId}</td>
                        {row.values.map((value, j) => (
                          <td key={j}>{value}</td>
                        ))}
                        <td>{row.issues.join('; ')}</td>
                      </tr>
                    ))}
                  </Table>
                </details>
              )}
            </section>
            <section>
              <h3>Confirm well identities and dilutions</h3>
              <p>
                Use the same sample ID only for technical replicates of the same
                biological sample. A factor of 2 means the measured
                concentration is multiplied by 2 exactly once.
              </p>
              <div className="controls">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={showEmpty}
                    onChange={(e) => setShowEmpty(e.target.checked)}
                  />
                  Show all 96 wells
                </label>
                <label>
                  Saved layout
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const item = layouts.find(
                        (l) => l.name === e.target.value,
                      )
                      if (item) {
                        try {
                          const candidate = validateExperiment({
                            ...exp,
                            wells: cleanLayout(item.wells),
                          })
                          change({ wells: candidate.wells })
                          setNotice(
                            'Layout applied. Check sample identities against this new plate.',
                          )
                        } catch (error) {
                          setNotice(String(error))
                        }
                      }
                      e.target.value = ''
                    }}
                  >
                    <option value="">Choose a layout</option>
                    {layouts.map((l) => (
                      <option key={l.name}>{l.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Layout name
                  <input
                    value={layoutName}
                    onChange={(e) => setLayoutName(e.target.value)}
                  />
                </label>
                <button onClick={saveLayout}>Save layout</button>
              </div>
              <Table
                headers={[
                  'Well',
                  'Type',
                  'Sample ID',
                  'Group',
                  'Standard level',
                  'Dilution',
                  'Reader status',
                ]}
              >
                {wellIds.map((id) => {
                  const w = exp.wells[id]
                  return (
                    <tr key={id}>
                      <th scope="row">{id}</th>
                      <td>
                        <select
                          aria-label={`Type ${id}`}
                          value={w.type}
                          onChange={(e) =>
                            well(id, {
                              type: e.target.value as WellAssignment['type'],
                            })
                          }
                        >
                          {['Empty', 'Sample', 'Standard', 'Blank'].map(
                            (type) => (
                              <option key={type}>{type}</option>
                            ),
                          )}
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label={`Sample ${id}`}
                          disabled={w.type !== 'Sample'}
                          value={w.animalId ?? ''}
                          onChange={(e) =>
                            well(id, { animalId: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Group ${id}`}
                          disabled={w.type !== 'Sample'}
                          value={w.group ?? ''}
                          onChange={(e) => well(id, { group: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Standard ${id}`}
                          disabled={w.type !== 'Standard'}
                          value={w.standardLevel ?? ''}
                          onChange={(e) =>
                            well(id, { standardLevel: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Dilution ${id}`}
                          disabled={w.type !== 'Sample'}
                          value={w.dilutionText ?? w.dilutionFactor ?? '1'}
                          onChange={(e) =>
                            well(id, {
                              dilutionText: e.target.value,
                              dilutionFactor: undefined,
                            })
                          }
                        />
                      </td>
                      <td>
                        {parsed.wells[id]?.issues?.join('; ') ||
                          (parsed.wells[id] ? 'Matched' : 'No reading')}
                      </td>
                    </tr>
                  )
                })}
              </Table>
              <details>
                <summary>
                  Arrange samples, standards and blanks on the plate
                </summary>
                <LayoutTab
                  sampleText={exp.sampleText}
                  onChangeSampleText={(sampleText) => change({ sampleText })}
                  sampleHasHeader={exp.sampleHasHeader}
                  onChangeSampleHasHeader={(sampleHasHeader) =>
                    change({ sampleHasHeader })
                  }
                  animalIdCol={exp.animalIdCol}
                  onChangeAnimalIdCol={(animalIdCol) => change({ animalIdCol })}
                  groupCol={exp.groupCol}
                  onChangeGroupCol={(groupCol) => change({ groupCol })}
                  dilutionCol={exp.dilutionCol}
                  onChangeDilutionCol={(dilutionCol) => change({ dilutionCol })}
                  wells={exp.wells}
                  onChangeWells={(wells) => change({ wells })}
                />
              </details>
              <p>
                {assigned.filter((w) => w.type === 'Sample').length} sample
                wells · {assigned.filter((w) => w.type === 'Standard').length}{' '}
                standard wells ·{' '}
                {assigned.filter((w) => w.type === 'Blank').length} blank wells
              </p>
              {importProblems.length > 0 && (
                <ul className="warning">
                  {importProblems.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
              <button
                className="primary"
                disabled={!canImport}
                onClick={() => confirm(0)}
              >
                Confirm import and mapping
              </button>
            </section>
          </>
        )}
        {step === 1 && (
          <>
            {!exp.approvals[0] && (
              <p className="warning">
                Confirm the imported rows and mapping first. You can still
                inspect settings here.
              </p>
            )}
            <section>
              <h3>Assay settings</h3>
              <p>
                Choose settings that fit your assay. The custom template and
                legacy settings are starting points; neither represents
                kit-specific validation.
              </p>
              <div className="controls">
                <label>
                  Assay preset
                  <select
                    value={exp.preset}
                    onChange={(e) => {
                      const preset = presets.find(
                        (p) => p.name === e.target.value,
                      )
                      if (preset) {
                        try {
                          const candidate = validateExperiment({
                            ...exp,
                            settings: cleanPreset(preset.settings),
                          })
                          change(
                            {
                              settings: candidate.settings,
                              preset: preset.name,
                            },
                            1,
                          )
                        } catch (error) {
                          setNotice(String(error))
                        }
                      }
                    }}
                  >
                    <option value={exp.preset}>{exp.preset}</option>
                    {presets
                      .filter((p) => p.name !== exp.preset)
                      .map((p) => (
                        <option key={p.name}>{p.name}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Concentration units
                  <input
                    aria-label="Concentration units"
                    value={exp.settings.units}
                    onChange={(e) => settings({ units: e.target.value })}
                    placeholder="e.g. ng/mL"
                  />
                </label>
                <label>
                  Curve model
                  <select
                    aria-label="Curve model"
                    value={exp.settings.curveModel}
                    onChange={(e) =>
                      settings({ curveModel: e.target.value as 'poly' | '4pl' })
                    }
                  >
                    <option value="poly">Polynomial</option>
                    <option value="4pl">Four-parameter logistic (4PL)</option>
                  </select>
                </label>
                {exp.settings.curveModel === 'poly' && (
                  <label>
                    Polynomial degree
                    <select
                      value={exp.settings.degree}
                      onChange={(e) =>
                        settings({
                          degree: Number(e.target.value) as 1 | 2 | 3,
                        })
                      }
                    >
                      {[1, 2, 3].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <p className="muted">
                Polynomial: suitable only over a reviewed monotonic range. 4PL:
                a saturating curve requiring enough standards to support its
                shape. Review residuals and back-calculated standards rather
                than choosing a model from R² alone.
              </p>
            </section>
            <section>
              <h3>Blank correction</h3>
              <div className="controls">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    aria-label="Subtract blank"
                    checked={exp.settings.blankSubtract}
                    disabled={exp.settings.inputMode === 'blankCorrected'}
                    onChange={(e) =>
                      settings({ blankSubtract: e.target.checked })
                    }
                  />
                  Subtract selected blanks once
                </label>
                <label>
                  Blank rule
                  <select
                    aria-label="Blank rule"
                    value={exp.settings.blankRule}
                    onChange={(e) =>
                      settings({
                        blankRule: e.target.value as 'mean' | 'median',
                      })
                    }
                  >
                    <option value="median">Median</option>
                    <option value="mean">Mean</option>
                  </select>
                </label>
              </div>
              <p>
                {exp.settings.inputMode === 'blankCorrected'
                  ? 'Input is already blank-corrected. Additional subtraction is disabled.'
                  : 'Select the blank wells that represent the background for this plate.'}
              </p>
              <div className="check-grid">
                {assigned
                  .filter((w) => w.type === 'Blank')
                  .map((w) => (
                    <label className="checkbox" key={w.wellId}>
                      <input
                        type="checkbox"
                        aria-label={`Use blank ${w.wellId}`}
                        checked={exp.settings.blankWells.includes(w.wellId)}
                        onChange={(e) =>
                          settings({
                            blankWells: e.target.checked
                              ? [...exp.settings.blankWells, w.wellId]
                              : exp.settings.blankWells.filter(
                                  (id) => id !== w.wellId,
                                ),
                          })
                        }
                      />
                      {w.wellId} · input{' '}
                      {fmt(
                        result.wells.find((row) => row.wellId === w.wellId)
                          ?.inputSignal,
                      )}
                    </label>
                  ))}
              </div>
              <p className={result.correction.eligible ? 'notice' : 'warning'}>
                Offset: {fmt(result.correction.offset)} absorbance ·{' '}
                {result.correction.message}
              </p>
            </section>
            <section>
              <h3>Standards and retained replicates</h3>
              <p>
                Concentrations use the units above. Excluding a standard level
                requires a reason; quality warnings never remove a level
                automatically.
              </p>
              <div className="controls">
                <label>
                  Serial top
                  <input
                    value={serialTop}
                    onChange={(e) => setSerialTop(e.target.value)}
                  />
                </label>
                <label>
                  Serial factor
                  <input
                    value={serialFactor}
                    onChange={(e) => setSerialFactor(e.target.value)}
                  />
                </label>
                <label>
                  Order
                  <select
                    value={serialOrder}
                    onChange={(e) => setSerialOrder(e.target.value)}
                  >
                    <option value="high">Std1 highest</option>
                    <option value="low">Std1 lowest</option>
                  </select>
                </label>
                <button disabled={!levels.length} onClick={fillSeries}>
                  Fill standard series
                </button>
              </div>
              <Table
                headers={[
                  'Level',
                  'Concentration',
                  'Include',
                  'Exclusion reason',
                ]}
              >
                {levels.map((level) => {
                  const decision = exp.settings.standards[level] ?? {
                    concentration: '',
                    include: true,
                    reason: '',
                  }
                  const update = (patch: Partial<typeof decision>) =>
                    settings({
                      standards: {
                        ...exp.settings.standards,
                        [level]: { ...decision, ...patch },
                      },
                    })
                  return (
                    <tr key={level}>
                      <th scope="row">{level}</th>
                      <td>
                        <input
                          aria-label={`Concentration ${level}`}
                          value={decision.concentration}
                          onChange={(e) =>
                            update({ concentration: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Include ${level}`}
                          checked={decision.include}
                          onChange={(e) =>
                            update({ include: e.target.checked })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Reason ${level}`}
                          value={decision.reason}
                          onChange={(e) => update({ reason: e.target.value })}
                        />
                      </td>
                    </tr>
                  )
                })}
              </Table>
              {selectedStandardProblems.length > 0 && (
                <ul className="warning">
                  {selectedStandardProblems.map((s) => (
                    <li key={s.level}>
                      {s.level}: {s.message}
                    </li>
                  ))}
                </ul>
              )}
              <div className="controls">
                <label>
                  Save settings as
                  <input
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                  />
                </label>
                <button onClick={savePreset}>Save assay preset</button>
              </div>
              <button
                className="primary"
                disabled={!canSettings}
                onClick={() => confirm(1)}
              >
                Confirm standards and blanks
              </button>
            </section>
          </>
        )}
        {step === 2 && (
          <>
            <section>
              <h3>Review technical replicates</h3>
              <p>
                A difference between wells is a prompt to investigate, not proof
                that a reading should be removed. Any exclusion needs a specific
                reason.
              </p>
              <label>
                Replicate spread warning (absorbance)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={exp.settings.replicateWarning}
                  onChange={(e) =>
                    settings({ replicateWarning: Number(e.target.value) })
                  }
                />
              </label>
              <Table
                headers={[
                  'Well',
                  'Type / identity',
                  'Keep',
                  'Exclusion reason',
                  'Input absorbance',
                  'Corrected absorbance',
                  'Review note',
                ]}
              >
                {result.wells
                  .filter((w) => w.type !== 'Empty')
                  .map((w) => (
                    <tr key={w.wellId}>
                      <th scope="row">{w.wellId}</th>
                      <td>
                        {w.type} · {w.animalId || w.standardLevel}
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Keep ${w.wellId}`}
                          checked={w.keep}
                          onChange={(e) =>
                            well(w.wellId, { keep: e.target.checked })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Exclusion reason ${w.wellId}`}
                          value={exp.wells[w.wellId].exclusionReason ?? ''}
                          onChange={(e) =>
                            well(w.wellId, { exclusionReason: e.target.value })
                          }
                        />
                      </td>
                      <td>{fmt(w.inputSignal)}</td>
                      <td>{fmt(w.correctedNet)}</td>
                      <td>{w.message}</td>
                    </tr>
                  ))}
              </Table>
            </section>
            <section>
              <h3>Review the curve</h3>
              <p className={result.curve.eligible ? 'notice' : 'warning'}>
                {result.curve.status} · {result.curve.nLevels} fitted levels ·
                R² {fmt(result.curve.r2)} · calibrated range{' '}
                {fmt(result.curve.minConcentration)}–
                {fmt(result.curve.maxConcentration)} {exp.settings.units}
              </p>
              <Suspense fallback={<p>Loading curve figures…</p>}>
                <CalibrationPlots
                  result={result}
                  units={exp.settings.units}
                  exports={ready}
                />
              </Suspense>
              <Table
                headers={[
                  'Standard',
                  'Retained / total wells',
                  'Mean absorbance',
                  'SD',
                  'Spread warning',
                  'Residual',
                  'Back-calculated concentration',
                  'Review note',
                ]}
              >
                {result.standards.map((s) => (
                  <tr key={s.level}>
                    <th scope="row">{s.level}</th>
                    <td>
                      {s.retainedReplicateCount}/{s.totalReplicateCount}
                    </td>
                    <td>{fmt(s.meanResponse)}</td>
                    <td>{fmt(s.sdResponse)}</td>
                    <td>{s.replicateWarning ? 'Review spread' : '—'}</td>
                    <td>{fmt(s.meanResidual)}</td>
                    <td>{fmt(s.backCalculatedConcentration)}</td>
                    <td>{s.message}</td>
                  </tr>
                ))}
              </Table>
              {result.issues.length > 0 && (
                <details open>
                  <summary>
                    Quality checks are advisory; review the listed issues
                  </summary>
                  <ul>
                    {result.issues.map((issue, i) => (
                      <li key={i}>
                        {issue.wellId || issue.level
                          ? `${issue.wellId || issue.level}: `
                          : ''}
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {!exp.approvals[0] || !exp.approvals[1] ? (
                <p className="warning">
                  Upstream edits require fresh import/mapping and
                  standards/blank confirmation before approving this fit.
                </p>
              ) : null}
              <button
                className="primary"
                disabled={
                  !exp.approvals[0] ||
                  !exp.approvals[1] ||
                  !result.curve.eligible ||
                  result.issues.some((i) => i.severity === 'error')
                }
                onClick={() => confirm(2)}
              >
                Approve reviewed fit
              </button>
            </section>
          </>
        )}
        {step === 3 && (
          <section>
            <h3>Review concentrations</h3>
            {!ready && (
              <p className="warning">
                These are previews. Complete the earlier reviews before
                exporting final concentrations.
              </p>
            )}
            <p>
              Final concentration = inverse curve estimate × the declared
              dilution. Below-range, above-range, invalid and explicitly
              excluded measurements have no final concentration.
            </p>
            <ConcentrationTables result={result} />
            <button
              className="primary"
              disabled={!ready}
              onClick={() => confirm(3)}
            >
              Confirm concentration review
            </button>
          </section>
        )}
        {step === 4 && (
          <>
            <section className="no-print">
              <h3>Figure settings</h3>
              <p>
                Each dot is one biological sample. Changing the axis changes
                only the display.
              </p>
              <div className="controls">
                <label>
                  Title
                  <input
                    value={exp.graph.title}
                    onChange={(e) =>
                      change(
                        { graph: { ...exp.graph, title: e.target.value } },
                        4,
                      )
                    }
                  />
                </label>
                <label>
                  X label
                  <input
                    value={exp.graph.xLabel}
                    onChange={(e) =>
                      change(
                        { graph: { ...exp.graph, xLabel: e.target.value } },
                        4,
                      )
                    }
                  />
                </label>
                <label>
                  Y label
                  <input
                    value={exp.graph.yLabel}
                    placeholder={`Concentration (${exp.settings.units})`}
                    onChange={(e) =>
                      change(
                        { graph: { ...exp.graph, yLabel: e.target.value } },
                        4,
                      )
                    }
                  />
                </label>
                <label>
                  Uncertainty
                  <select
                    value={exp.graph.uncertainty}
                    onChange={(e) =>
                      change(
                        {
                          graph: {
                            ...exp.graph,
                            uncertainty: e.target
                              .value as Experiment['graph']['uncertainty'],
                          },
                        },
                        4,
                      )
                    }
                  >
                    <option value="none">None</option>
                    <option value="sd">SD — spread of samples</option>
                    <option value="sem">SEM — uncertainty of mean</option>
                  </select>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={exp.graph.log}
                    onChange={(e) =>
                      change(
                        { graph: { ...exp.graph, log: e.target.checked } },
                        4,
                      )
                    }
                  />
                  Logarithmic Y axis
                </label>
                {(['pointSize', 'width', 'height'] as const).map((key) => (
                  <label key={key}>
                    {key === 'pointSize' ? 'Point size' : `Export ${key} (px)`}
                    <input
                      type="number"
                      value={exp.graph[key]}
                      min={
                        key === 'pointSize' ? 3 : key === 'width' ? 300 : 250
                      }
                      max={
                        key === 'pointSize' ? 24 : key === 'width' ? 2400 : 1800
                      }
                      onChange={(e) => {
                        const value = Number(e.target.value)
                        if (
                          value >= Number(e.target.min) &&
                          value <= Number(e.target.max)
                        )
                          change({ graph: { ...exp.graph, [key]: value } }, 4)
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="controls">
                {groups.map((group, index) => (
                  <label key={group}>
                    {group}
                    <input
                      type="color"
                      aria-label={`Colour ${group}`}
                      value={
                        exp.graph.colours[group] ??
                        [
                          '#087f8c',
                          '#c26935',
                          '#6355a4',
                          '#418056',
                          '#b34d73',
                          '#637b8c',
                        ][index % 6]
                      }
                      onChange={(e) =>
                        change(
                          {
                            graph: {
                              ...exp.graph,
                              colours: {
                                ...exp.graph.colours,
                                [group]: e.target.value,
                              },
                            },
                          },
                          4,
                        )
                      }
                    />
                  </label>
                ))}
                <label>
                  Group order (one per line)
                  <textarea
                    rows={3}
                    value={exp.graph.groupOrder.join('\n')}
                    placeholder={groups.join('\n')}
                    onChange={(e) =>
                      change(
                        {
                          graph: {
                            ...exp.graph,
                            groupOrder: e.target.value.split('\n'),
                          },
                        },
                        4,
                      )
                    }
                  />
                </label>
              </div>
            </section>
            <section>
              <h3>{exp.name}</h3>
              <p className="muted">
                Revision {exp.revision} ·{' '}
                {exp.settings.units || 'Units not set'} ·{' '}
                {exp.settings.curveModel} · blank{' '}
                {exp.settings.blankSubtract
                  ? `${exp.settings.blankRule}, offset ${fmt(result.correction.offset)}`
                  : 'not subtracted'}{' '}
                · {exp.practice ? 'Fictional practice data' : exp.preset}
              </p>
              {!ready || !exp.approvals[3] ? (
                <p className="warning">
                  Finish fit and concentration review before final result
                  export. Experiment packages can always be saved.
                </p>
              ) : null}
              <Suspense fallback={<p>Loading sample figure…</p>}>
                <SamplePlot
                  result={result}
                  exp={exp}
                  exports={ready && exp.approvals[3]}
                />
              </Suspense>
              <div className="actions no-print">
                <button
                  disabled={!ready || !exp.approvals[3]}
                  onClick={() =>
                    download(
                      delimited(sampleRows(result, exp), ','),
                      `${safeName(exp.name)}-samples.csv`,
                      'text/csv',
                    )
                  }
                >
                  Download sample CSV
                </button>
                <button
                  disabled={!ready || !exp.approvals[3]}
                  onClick={() =>
                    download(
                      delimited(sampleRows(result, exp)),
                      `${safeName(exp.name)}-samples.tsv`,
                    )
                  }
                >
                  Download sample TSV
                </button>
                <button
                  disabled={!ready || !exp.approvals[3]}
                  onClick={() =>
                    download(
                      delimited(wellRows(result, exp)),
                      `${safeName(exp.name)}-wells.tsv`,
                    )
                  }
                >
                  Download well review TSV
                </button>
                <button
                  disabled={!ready || !exp.approvals[3]}
                  onClick={() =>
                    void exportWorkbook(result, exp).catch((e) =>
                      setNotice(String(e)),
                    )
                  }
                >
                  Download Excel workbook
                </button>

                <button onClick={() => void save()}>
                  Download experiment package
                </button>
              </div>
              <div className="print-only">
                <h3>Contributing sample and well results</h3>
                <ConcentrationTables result={result} />
                <h3>Settings and traceability</h3>
                <p>
                  Experiment {exp.id} · created {exp.createdAt} · revision{' '}
                  {exp.revision}
                </p>
                <p>
                  Input: {exp.settings.inputMode}. Blank wells:{' '}
                  {exp.settings.blankWells.join(', ') || 'none'}. Curve:{' '}
                  {exp.settings.curveModel}; R² {fmt(result.curve.r2)}. Sources:{' '}
                  {exp.sources.map((s) => s.name).join(', ') ||
                    'Pasted reader text'}
                  .
                </p>
                <p>
                  Final concentrations and dilution factors are identical to the
                  reviewed tables and workbook. This report describes one plate;
                  retain the experiment package for original input and all
                  review decisions.
                </p>
              </div>
              <button
                className="primary no-print"
                disabled={!ready || !exp.approvals[3]}
                onClick={() => confirm(4)}
              >
                Confirm figures and export review
              </button>
            </section>
          </>
        )}
        <footer className="no-print">
          EasyLab Next · local processing · one 96-well plate ·{' '}
          {exp.practice
            ? 'Practice data are fictional.'
            : 'No kit-specific validation is claimed.'}
        </footer>
      </main>
      {resetAction && (
        <ResetDialog
          title={
            resetAction === 'new'
              ? 'Start a new experiment?'
              : resetAction === 'practice'
                ? 'Open the practice experiment?'
                : 'Reset this step?'
          }
          cancel={() => setResetAction(null)}
          proceed={reset}
        />
      )}
    </div>
  )
}
function ConcentrationTables({
  result,
}: {
  result: ReturnType<typeof analyzeElisa>
}) {
  return (
    <>
      <h4>Biological samples</h4>
      <Table
        headers={[
          'Sample ID',
          'Group',
          'Concentration',
          'SD',
          'Eligible / total wells',
          'Status',
          'Reason',
        ]}
      >
        {result.samples.map((s) => (
          <tr key={`${s.animalId}-${s.group}`}>
            <th scope="row">{s.animalId}</th>
            <td>{s.group}</td>
            <td>{fmt(s.mean)}</td>
            <td>{fmt(s.sd)}</td>
            <td>
              {s.eligibleReplicateCount}/{s.totalReplicateCount}
            </td>
            <td>{s.status}</td>
            <td>{s.message}</td>
          </tr>
        ))}
      </Table>
      <h4>Technical wells</h4>
      <Table
        headers={[
          'Well',
          'Sample',
          'Corrected absorbance',
          'Curve concentration',
          'Dilution',
          'Final concentration',
          'Status',
          'Reason',
        ]}
      >
        {result.wells
          .filter((w) => w.type === 'Sample')
          .map((w) => (
            <tr key={w.wellId}>
              <th scope="row">{w.wellId}</th>
              <td>{w.animalId}</td>
              <td>{fmt(w.correctedNet)}</td>
              <td>{fmt(w.concentrationBeforeDilution)}</td>
              <td>{w.dilutionText || fmt(w.dilutionFactor)}</td>
              <td>{fmt(w.concentrationAfterDilution)}</td>
              <td>{w.status}</td>
              <td>{w.message}</td>
            </tr>
          ))}
      </Table>
    </>
  )
}
export default App
