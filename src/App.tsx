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
        title: 'Start with Layout',
        description: 'Begin in the Layout tab to load sample metadata and assign wells.',
      },
      {
        selector: '[data-testid="samples-card"]',
        title: 'Fill the sample sheet',
        description: 'Paste or load the sample table, then map columns to animal/group fields.',
      },
      {
        selector: '[data-testid="fill-samples"]',
        title: 'Populate plate wells',
        description: 'Use Fill Samples to assign samples into currently empty wells automatically.',
      },
      {
        selector: '[data-testid="analysis-tab-btn"]',
        title: 'Switch to Analysis',
        description: 'Move to Analysis to paste reader output and fit your standards.',
      },
      {
        selector: '[data-testid="std-autoqc"]',
        title: 'Review Auto-QC suggestions',
        description: 'Inspect Auto-QC recommendations to improve standard-curve quality.',
      },
      {
        selector: '[data-testid="std-autoqc-apply"]',
        title: 'Apply suggestions',
        description: 'Apply suggested standard exclusions before quantification if they improve fit.',
      },
      {
        selector: '[data-testid="quant-card"]',
        title: 'Inspect final quantities',
        description: 'Review sample quantification results before copying or exporting outputs.',
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
