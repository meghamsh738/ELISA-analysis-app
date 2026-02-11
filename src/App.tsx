import './App.css'
import { useEffect, useMemo, useState } from 'react'
import { AnalysisTab } from './tabs/AnalysisTab'
import { LayoutTab } from './tabs/LayoutTab'
import { GuidedTutorial, type TutorialStep } from './GuidedTutorial'
import { emptyLayout96, type WellAssignment } from './lib/layoutModel'
import { plate96WellIds, type WellId96 } from './lib/plate96'
import { readLocalJson, writeLocalJson } from './lib/storage'

type ActiveTab = 'layout' | 'analysis'

type PersistedStateV1 = {
  v: 1
  tab: ActiveTab
  sampleText: string
  sampleHasHeader: boolean
  animalIdCol: number
  groupCol: number
  dilutionCol?: number
  wells: Record<string, WellAssignment>
  readerText: string
}

const STORAGE_KEY = 'easylab:elisa-analysis:v1'

const hydrateWells = (raw: Record<string, WellAssignment> | null | undefined): Record<WellId96, WellAssignment> => {
  const base = emptyLayout96()
  if (!raw) return base
  for (const wellId of plate96WellIds) {
    const maybe = raw[wellId]
    if (!maybe) continue
    base[wellId] = {
      ...base[wellId],
      ...maybe,
      wellId,
      keep: typeof maybe.keep === 'boolean' ? maybe.keep : true,
      type: maybe.type ?? base[wellId].type,
    }
  }
  return base
}

function App() {
  const persisted = useMemo(() => readLocalJson<PersistedStateV1>(STORAGE_KEY), [])

  const [tab, setTab] = useState<ActiveTab>(persisted?.tab ?? 'layout')
  const [sampleText, setSampleText] = useState<string>(persisted?.sampleText ?? '')
  const [sampleHasHeader, setSampleHasHeader] = useState<boolean>(persisted?.sampleHasHeader ?? false)
  const [animalIdCol, setAnimalIdCol] = useState<number>(persisted?.animalIdCol ?? 0)
  const [groupCol, setGroupCol] = useState<number>(persisted?.groupCol ?? -1)
  const [dilutionCol, setDilutionCol] = useState<number>(persisted?.dilutionCol ?? -1)
  const [wells, setWells] = useState<Record<WellId96, WellAssignment>>(() => hydrateWells(persisted?.wells))
  const [readerText, setReaderText] = useState<string>(persisted?.readerText ?? '')

  const tutorialSteps: TutorialStep[] = useMemo(
    () => [
      {
        selector: '[data-testid="layout-tab-btn"]',
        title: 'Start in Layout tab',
        description: 'Begin all runs in Layout: sample mapping, plate assignment, and standard/blank marking.',
        details: [
          'Layout defines which wells are Sample, Standard, Blank, or Empty.',
          'Analysis depends on these assignments.',
        ],
      },
      {
        selector: '[data-testid="samples-card"]',
        title: 'Paste sample table',
        description: 'Paste your source table and choose whether the first row contains headers.',
        details: [
          'Animal ID column is required for identifying samples.',
          'Group and dilution columns are optional metadata.',
        ],
      },
      {
        selector: '[data-testid="sample-header-toggle"]',
        title: 'First-row header option',
        description: 'Enable this only if your first row contains column names.',
        details: [
          'Incorrect header setting shifts parsed values into wrong fields.',
        ],
      },
      {
        selector: '[data-testid="animal-id-col-select"]',
        title: 'Animal ID column mapping',
        description: 'Choose which pasted column represents the sample identifier.',
        details: [
          'Animal ID appears on the plate and in quantified output.',
        ],
      },
      {
        selector: '[data-testid="group-col-select"]',
        title: 'Group column mapping (optional)',
        description: 'Assign treatment/group metadata if present in your sheet.',
      },
      {
        selector: '[data-testid="dilution-col-select"]',
        title: 'Dilution column mapping (optional)',
        description: 'Map pre-existing dilution factors from your sample sheet when available.',
      },
      {
        selector: '[data-testid="fill-samples"]',
        title: 'Fill empty wells',
        description: 'Automatically places mapped samples into currently empty wells.',
        details: [
          'Use after column mapping is correct.',
          'Manual edits can still be applied afterward.',
        ],
      },
      {
        selector: '[data-testid="std-level-input"]',
        title: 'Standard level naming',
        description: 'Enter starting level (e.g., Std1) before assigning selected wells as standards.',
      },
      {
        selector: '[data-testid="assign-standards-btn"]',
        title: 'Assign standards',
        description: 'Marks selected wells as standards and auto-pairs duplicate levels.',
      },
      {
        selector: '[data-testid="mark-blank-btn"]',
        title: 'Mark blanks',
        description: 'Assign blank wells used for optional blank-median subtraction.',
      },
      {
        selector: '[data-testid="apply-tags-btn"]',
        title: 'Apply sample tags',
        description: 'Apply dilution factor and optional group override to selected sample wells.',
      },
      {
        selector: '[data-testid="analysis-tab-btn"]',
        title: 'Switch to Analysis tab',
        description: 'After layout is ready, move to Analysis for reader paste, QC, fit, and quantification.',
      },
      {
        selector: '[data-testid="reader-textarea"]',
        title: 'Paste reader output',
        description: 'Paste raw 450/570 output from your plate reader.',
        details: [
          'App computes net absorbance (450 - 570).',
        ],
      },
      {
        selector: '[data-testid="show-assigned-toggle"]',
        title: 'Show only assigned wells',
        description: 'Filters review table to wells that were assigned in Layout.',
      },
      {
        selector: '[data-testid="blank-subtract-toggle"]',
        title: 'Blank subtraction option',
        description: 'Applies blank median correction before curve fit/quantification when blanks are present.',
      },
      {
        selector: '[data-testid="outlier-threshold-input"]',
        title: 'Outlier threshold',
        description: 'Controls sensitivity of replicate outlier flagging in per-well review.',
      },
      {
        selector: '[data-testid="curve-model-select"]',
        title: 'Curve model',
        description: 'Choose 4PL or polynomial model for standard-curve fitting.',
      },
      {
        selector: '[data-testid="serial-top-input"]',
        title: 'Serial dilution defaults',
        description: 'Set serial top/factor/order to prefill standard concentrations quickly.',
      },
      {
        selector: '[data-testid="fill-serial-btn"]',
        title: 'Fill serial dilution',
        description: 'Populates concentration values for standard levels based on serial settings.',
      },
      {
        selector: '[data-testid="std-autoqc"]',
        title: 'Auto-QC suggestions',
        description: 'Review suggested standard exclusions to improve fit quality.',
        details: [
          'Suggestions only affect fit inputs, not raw keep flags.',
        ],
      },
      {
        selector: '[data-testid="std-autoqc-apply"]',
        title: 'Apply Auto-QC exclusions',
        description: 'Applies suggested exclusions to curve fitting and downstream calculations.',
      },
      {
        selector: '[data-testid="quant-card"]',
        title: 'Quantification results',
        description: 'Review per-well concentrations and per-animal summary statistics.',
      },
      {
        selector: '[data-testid="copy-quant-tsv-btn"]',
        title: 'Copy quantified output (final step)',
        description: 'Copy quantified TSV after reviewing fit and sample summaries.',
      },
    ],
    []
  )

  // Keep persisted state in sync.
  useEffect(() => {
    const next: PersistedStateV1 = {
      v: 1,
      tab,
      sampleText,
      sampleHasHeader,
      animalIdCol,
      groupCol,
      dilutionCol,
      wells,
      readerText,
    }
    writeLocalJson(STORAGE_KEY, next)
  }, [tab, sampleText, sampleHasHeader, animalIdCol, groupCol, dilutionCol, wells, readerText])

  return (
    <div className="page">
      <div className="hero" data-testid="app-hero">
        <div className="hero-text">
          <div className="tag">96-well · Dual-wavelength (450/570)</div>
          <h1>ELISA plate layout + analysis</h1>
          <p className="lede">
            Build a 96-well layout from your sample sheet (Animal ID visible on wells), manually assign standards/blanks and
            dilutions, then paste reader output to compute net absorbance and flag outliers.
          </p>
          <div className="pill-row">
            <span className="pill">Paste-first workflow</span>
            <span className="pill">Shift-click selection</span>
            <span className="pill">Keep / outlier flags</span>
          </div>
        </div>
      </div>

      <div className="shell">
        <div className="tabs" role="tablist" aria-label="ELISA tabs">
          <button
            className={tab === 'layout' ? 'tab active' : 'tab'}
            type="button"
            onClick={() => setTab('layout')}
            aria-selected={tab === 'layout'}
            data-testid="layout-tab-btn"
          >
            Layout
          </button>
          <button
            className={tab === 'analysis' ? 'tab active' : 'tab'}
            type="button"
            onClick={() => setTab('analysis')}
            aria-selected={tab === 'analysis'}
            data-testid="analysis-tab-btn"
          >
            Analysis
          </button>
          <GuidedTutorial
            steps={tutorialSteps}
            startLabel="Tutorial"
            onStart={() => setTab('layout')}
          />
        </div>
      </div>

      {tab === 'layout' ? (
        <LayoutTab
          sampleText={sampleText}
          onChangeSampleText={setSampleText}
          sampleHasHeader={sampleHasHeader}
          onChangeSampleHasHeader={setSampleHasHeader}
          animalIdCol={animalIdCol}
          onChangeAnimalIdCol={setAnimalIdCol}
          groupCol={groupCol}
          onChangeGroupCol={setGroupCol}
          dilutionCol={dilutionCol}
          onChangeDilutionCol={setDilutionCol}
          wells={wells}
          onChangeWells={setWells}
        />
      ) : (
        <AnalysisTab readerText={readerText} onChangeReaderText={setReaderText} wells={wells} onChangeWells={setWells} />
      )}
    </div>
  )
}

export default App
