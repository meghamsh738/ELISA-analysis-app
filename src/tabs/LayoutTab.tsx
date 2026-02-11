import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Plate96 } from '../components/Plate96'
import { emptyLayout96, type WellAssignment, type WellType } from '../lib/layoutModel'
import {
  plate96WellIds,
  plate96WellIdsColumnMajor,
  type WellId96,
  wellRange96ColumnMajor,
} from '../lib/plate96'
import { guessColumnIndex, parseTableText, type TableText } from '../lib/tableText'

const CONTROL_COLORS: Record<WellType, string> = {
  Sample: '#1F5BFF',
  Standard: '#7aa89a',
  Blank: '#9aa0aa',
  Empty: '#FFF7EC',
}

const hashHue = (input: string) => {
  let h = 0
  for (let i = 0; i < input.length; i += 1) h = (h * 31 + input.charCodeAt(i)) % 360
  return h
}

const groupColor = (group: string) => `hsl(${hashHue(group)}deg 70% 48%)`

const buildWellTitle = (well: WellAssignment) => {
  if (well.type === 'Sample') {
    const bits = [
      `${well.wellId} • Sample`,
      well.animalId ? `Animal: ${well.animalId}` : null,
      well.group ? `Group: ${well.group}` : null,
      well.dilutionFactor ? `Dilution: ×${well.dilutionFactor}` : null,
    ].filter(Boolean)
    return bits.join(' \n')
  }
  if (well.type === 'Standard') return `${well.wellId} • Standard ${well.standardLevel ?? ''}`.trim()
  if (well.type === 'Blank') return `${well.wellId} • Blank`
  return `${well.wellId} • Empty`
}

const parseStandardSeed = (raw: string): { prefix: string; start: number } => {
  const trimmed = raw.trim()
  if (!trimmed) return { prefix: 'Std', start: 1 }

  const match = /^(.*?)(\d+)$/.exec(trimmed)
  if (!match) return { prefix: trimmed, start: 1 }

  const prefix = (match[1] || 'Std').trimEnd() || 'Std'
  const start = Number(match[2])
  return { prefix, start: Number.isFinite(start) && start > 0 ? start : 1 }
}

const parseDilutionFactor = (raw: string): number | null => {
  const s = raw.trim()
  if (!s) return null
  const direct = Number(s)
  if (Number.isFinite(direct) && direct > 0) return direct

  const colon = /^\s*1\s*:\s*(\d+(\.\d+)?)\s*$/.exec(s)
  if (colon) {
    const v = Number(colon[1])
    return Number.isFinite(v) && v > 0 ? v : null
  }

  const slash = /^\s*1\s*\/\s*(\d+(\.\d+)?)\s*$/.exec(s)
  if (slash) {
    const v = Number(slash[1])
    return Number.isFinite(v) && v > 0 ? v : null
  }

  const times = /^\s*(\d+(\.\d+)?)\s*x\s*$/i.exec(s)
  if (times) {
    const v = Number(times[1])
    return Number.isFinite(v) && v > 0 ? v : null
  }

  const prefixed = /^\s*x\s*(\d+(\.\d+)?)\s*$/i.exec(s)
  if (prefixed) {
    const v = Number(prefixed[1])
    return Number.isFinite(v) && v > 0 ? v : null
  }

  return null
}

export type LayoutTabProps = {
  sampleText: string
  onChangeSampleText: (next: string) => void
  sampleHasHeader: boolean
  onChangeSampleHasHeader: (next: boolean) => void
  animalIdCol: number
  onChangeAnimalIdCol: (next: number) => void
  groupCol: number
  onChangeGroupCol: (next: number) => void
  dilutionCol: number
  onChangeDilutionCol: (next: number) => void

  wells: Record<WellId96, WellAssignment>
  onChangeWells: (next: Record<WellId96, WellAssignment>) => void
}

export function LayoutTab({
  sampleText,
  onChangeSampleText,
  sampleHasHeader,
  onChangeSampleHasHeader,
  animalIdCol,
  onChangeAnimalIdCol,
  groupCol,
  onChangeGroupCol,
  dilutionCol,
  onChangeDilutionCol,
  wells,
  onChangeWells,
}: LayoutTabProps) {
  const [selected, setSelected] = useState<Set<WellId96>>(new Set())
  const [lastClicked, setLastClicked] = useState<WellId96 | null>(null)
  const didAutoGuessDilution = useRef(false)

  const table: TableText = useMemo(
    () => parseTableText(sampleText, { hasHeader: sampleHasHeader }),
    [sampleText, sampleHasHeader]
  )

  useEffect(() => {
    if (!table.headers.length) return
    if (animalIdCol < 0 || animalIdCol >= table.headers.length) {
      onChangeAnimalIdCol(guessColumnIndex(table, 'animalId'))
    }
    if (groupCol >= table.headers.length) onChangeGroupCol(-1)
    if (dilutionCol >= table.headers.length) onChangeDilutionCol(-1)
    if (dilutionCol < -1) onChangeDilutionCol(-1)
    if (dilutionCol === -1 && !didAutoGuessDilution.current) {
      const guess = guessColumnIndex(table, 'dilutionFactor')
      if (guess >= 0) onChangeDilutionCol(guess)
      didAutoGuessDilution.current = true
    }
  }, [
    table,
    animalIdCol,
    groupCol,
    dilutionCol,
    onChangeAnimalIdCol,
    onChangeGroupCol,
    onChangeDilutionCol,
  ])

  const sampleCount = table.rows.length
  const filledSamples = Object.values(wells).filter((w) => w.type === 'Sample').length
  const filledStandards = Object.values(wells).filter((w) => w.type === 'Standard').length
  const filledBlanks = Object.values(wells).filter((w) => w.type === 'Blank').length

  const wellUi = useMemo(() => {
    const byId = {} as Record<WellId96, { label: string; title: string; color: string; keep: boolean; type: WellType; wellId: WellId96 }>
    for (const wellId of plate96WellIds) {
      const w = wells[wellId]
      const baseColor = CONTROL_COLORS[w.type]
      const color = w.type === 'Sample' && w.group ? groupColor(w.group) : baseColor

      const label =
        w.type === 'Sample'
          ? (w.animalId ?? '').slice(0, 8)
          : w.type === 'Standard'
            ? (w.standardLevel ?? 'Std').slice(0, 6)
            : w.type === 'Blank'
              ? 'Blank'
              : ''

      byId[wellId] = {
        wellId,
        type: w.type,
        label,
        title: buildWellTitle(w),
        color,
        keep: w.keep,
      }
    }
    return byId
  }, [wells])

  const handleWellClick = (wellId: WellId96, event: MouseEvent<HTMLDivElement>) => {
    const isShift = event.shiftKey
    const isMulti = event.metaKey || event.ctrlKey

    setSelected((prev) => {
      const next = new Set(prev)
      if (isShift && lastClicked) {
        // Column-major selection matches the reader's index order:
        // A1..H1, A2..H2, ... A12..H12.
        const range = wellRange96ColumnMajor(lastClicked, wellId)
        if (!isMulti) next.clear()
        range.forEach((w) => next.add(w))
      } else if (isMulti) {
        if (next.has(wellId)) next.delete(wellId)
        else next.add(wellId)
      } else {
        next.clear()
        next.add(wellId)
      }
      return next
    })
    setLastClicked(wellId)
  }

  const resetPlate = () => {
    onChangeWells(emptyLayout96())
    setSelected(new Set())
    setLastClicked(null)
  }

  const assignStandardsInPairs = () => {
    if (!selected.size) return

    const { prefix, start } = parseStandardSeed(stdLevel)
    // Standards are usually laid out as duplicates side-by-side (ex: A1+A2, B1+B2, ...).
    // We therefore assign in row-major order so pairs fall on adjacent columns within a row.
    const ordered = plate96WellIds.filter((wellId) => selected.has(wellId))

    const next = { ...wells }
    const replicates = 2
    for (let i = 0; i < ordered.length; i += 1) {
      const wellId = ordered[i]
      const levelNum = start + Math.floor(i / replicates)
      next[wellId] = { wellId, type: 'Standard', keep: true, standardLevel: `${prefix}${levelNum}` }
    }

    onChangeWells(next)
    setStdLevel(`${prefix}${start + Math.ceil(ordered.length / replicates)}`)
  }

  const fillSamplesIntoEmpty = () => {
    if (!table.rows.length) return
    const next = { ...wells }

    // Most wet-lab workflows fill plates by column (A1..H1, then A2..H2, etc).
    const emptyWellIds = plate96WellIdsColumnMajor.filter((id) => next[id].type === 'Empty')
    let cursor = 0
    let dilutionParseFailures = 0

    for (let i = 0; i < table.rows.length; i += 1) {
      const row = table.rows[i]
      const animalId = (row[animalIdCol] ?? '').trim()
      if (!animalId) continue

      const group = groupCol >= 0 ? (row[groupCol] ?? '').trim() : ''
      const dilutionRaw = dilutionCol >= 0 ? (row[dilutionCol] ?? '').trim() : ''
      const parsedDilution = dilutionCol >= 0 ? parseDilutionFactor(dilutionRaw) : null
      const dilutionFactor = parsedDilution && parsedDilution > 0 ? parsedDilution : 1
      if (dilutionCol >= 0 && dilutionRaw && parsedDilution === null) dilutionParseFailures += 1
      const meta: Record<string, string> = {}
      table.headers.forEach((h, idx) => {
        const cell = (row[idx] ?? '').trim()
        if (!cell) return
        meta[h] = cell
      })

      const targetWell = emptyWellIds[cursor]
      if (!targetWell) break
      cursor += 1

      next[targetWell] = {
        wellId: targetWell,
        type: 'Sample',
        keep: true,
        animalId,
        group: group || undefined,
        dilutionFactor,
        meta,
      }
    }

    onChangeWells(next)
    if (dilutionParseFailures > 0) {
      alert(`Could not parse ${dilutionParseFailures} dilution value(s); defaulted to 1 for those rows.`)
    }
  }

  const [stdLevel, setStdLevel] = useState('Std1')
  const markSelectedAs = (type: WellType) => {
    if (!selected.size) return
    if (type === 'Standard') {
      assignStandardsInPairs()
      return
    }
    const next = { ...wells }
    selected.forEach((wellId) => {
      if (type === 'Empty') {
        next[wellId] = { wellId, type: 'Empty', keep: true }
        return
      }
      if (type === 'Blank') {
        next[wellId] = { wellId, type: 'Blank', keep: true }
        return
      }
      // Sample assignment should come from the pasted list.
    })
    onChangeWells(next)
  }

  const [dilutionFactor, setDilutionFactor] = useState<number>(1)
  const [groupOverride, setGroupOverride] = useState<string>('')
  const applySampleTags = () => {
    if (!selected.size) return
    const next = { ...wells }
    selected.forEach((wellId) => {
      const w = next[wellId]
      if (w.type !== 'Sample') return
      next[wellId] = {
        ...w,
        dilutionFactor: Number.isFinite(dilutionFactor) && dilutionFactor > 0 ? dilutionFactor : w.dilutionFactor,
        group: groupOverride.trim() ? groupOverride.trim() : w.group,
      }
    })
    onChangeWells(next)
  }

  const copyLayoutTsv = async () => {
    const metaKeys = Array.from(
      new Set(Object.values(wells).flatMap((w) => (w.meta ? Object.keys(w.meta) : [])))
    ).sort()

    const headers = ['Well', 'Type', 'AnimalId', 'Group', 'DilutionFactor', 'StandardLevel', 'Keep', ...metaKeys]
    const lines = [headers.join('\t')]
    plate96WellIds.forEach((wellId) => {
      const w = wells[wellId]
      const row = [
        w.wellId,
        w.type,
        w.animalId ?? '',
        w.group ?? '',
        w.dilutionFactor ? String(w.dilutionFactor) : '',
        w.standardLevel ?? '',
        w.keep ? '1' : '0',
        ...metaKeys.map((k) => w.meta?.[k] ?? ''),
      ]
      lines.push(row.join('\t'))
    })
    await navigator.clipboard.writeText(lines.join('\n'))
    alert('Layout copied (TSV).')
  }

  return (
    <div data-testid="layout-tab">
      <div className="shell grid-2 tall">
        <section className="card" data-testid="samples-card">
          <div className="section-head">
            <div>
              <p className="kicker">Step 1 · Samples</p>
              <h2>Paste sample table</h2>
              <p className="muted">
                Paste rows with any number of columns. Map which column is <strong>Animal ID</strong>. Only Animal ID will be shown
                on wells; other columns stay attached as metadata for analysis/export.
              </p>
            </div>
            <div className="row">
              <span className="badge">Rows: {sampleCount}</span>
              <span className="badge">Cols: {table.maxColumns}</span>
            </div>
          </div>

          <div className="field-row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={sampleHasHeader}
                onChange={(e) => onChangeSampleHasHeader(e.target.checked)}
                data-testid="sample-header-toggle"
              />
              <span className="toggle-ui" />
              <span className="toggle-label">First row is headers</span>
            </label>
          </div>

          <textarea
            className="textarea large"
            value={sampleText}
            onChange={(e) => onChangeSampleText(e.target.value)}
            placeholder={`Example:\n1\tC571\tSaline\tFemale\n2\tC572\tLPS\tMale`}
          />

          {table.headers.length > 0 && (
            <div className="controls">
              <label className="control">
                <span>Animal ID column</span>
                <select value={animalIdCol} onChange={(e) => onChangeAnimalIdCol(Number(e.target.value))} data-testid="animal-id-col-select">
                  {table.headers.map((h, idx) => (
                    <option key={h + idx} value={idx}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
              <label className="control">
                <span>Group column (optional)</span>
                <select value={groupCol} onChange={(e) => onChangeGroupCol(Number(e.target.value))} data-testid="group-col-select">
                  <option value={-1}>&lt;none&gt;</option>
                  {table.headers.map((h, idx) => (
                    <option key={h + idx} value={idx}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
              <label className="control">
                <span>Dilution column (optional)</span>
                <select value={dilutionCol} onChange={(e) => onChangeDilutionCol(Number(e.target.value))} data-testid="dilution-col-select">
                  <option value={-1}>&lt;none&gt;</option>
                  {table.headers.map((h, idx) => (
                    <option key={h + idx} value={idx}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {table.warnings.length > 0 && (
            <div className="alert warn" role="alert">
              <div>
                <strong>Parse warnings:</strong>
                <ul className="bullets">
                  {table.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="cta-row">
            <div className="muted">
              Plate: {filledSamples} samples · {filledStandards} standards · {filledBlanks} blanks
            </div>
            <div className="row">
              <button className="ghost" type="button" onClick={resetPlate}>
                Reset plate
              </button>
              <button className="primary" type="button" onClick={fillSamplesIntoEmpty} data-testid="fill-samples">
                Fill empty wells
              </button>
            </div>
          </div>
        </section>

        <section className="card" data-testid="plate-card">
          <div className="section-head">
            <div>
              <p className="kicker">Step 2 · Layout</p>
              <h2>96-well plate</h2>
              <p className="muted">
                Click wells to select. Shift-click selects a sequence in reader order (A1..H1, then A2..H2). Standards/blanks can be
                assigned manually.
              </p>
            </div>
            <div className="row">
              <span className="badge">Selected: {selected.size}</span>
              <button
                className="ghost"
                type="button"
                onClick={copyLayoutTsv}
                disabled={!Object.keys(wells).length}
                data-testid="copy-layout-tsv-btn"
              >
                Copy layout TSV
              </button>
            </div>
          </div>

          <div className="layout-plate-grid">
            <Plate96 wells={wellUi} selected={selected} onWellClick={handleWellClick} />
            <div className="panel">
              <h3>Assign</h3>
              <div className="muted-small">Use this to mark standards/blanks or tag sample dilutions.</div>

              <div style={{ height: 12 }} />

              <div className="field-row">
                <input
                  type="text"
                  value={stdLevel}
                  onChange={(e) => setStdLevel(e.target.value)}
                  placeholder="Std1"
                  aria-label="Standard level"
                  data-testid="std-level-input"
                />
                <button
                  className="ghost"
                  type="button"
                  onClick={() => markSelectedAs('Standard')}
                  disabled={!selected.size}
                  data-testid="assign-standards-btn"
                >
                  Assign Standards
                </button>
              </div>
              <div className="muted-small">
                Standards are assigned as duplicates: <code>Std1</code>, <code>Std1</code>, <code>Std2</code>, <code>Std2</code>, ...
                <br />
                Tip: shift-click <code>A1</code> then <code>H2</code> to select the first 2 columns; duplicates map as{' '}
                <code>A1</code>+<code>A2</code>, <code>B1</code>+<code>B2</code>, ...
              </div>

              <div className="field-row">
                <button
                  className="ghost"
                  type="button"
                  onClick={() => markSelectedAs('Blank')}
                  disabled={!selected.size}
                  data-testid="mark-blank-btn"
                >
                  Mark Blank
                </button>
                <button
                  className="ghost"
                  type="button"
                  onClick={() => markSelectedAs('Empty')}
                  disabled={!selected.size}
                  data-testid="clear-wells-btn"
                >
                  Clear wells
                </button>
              </div>

              <div style={{ height: 16 }} />
              <h3>Sample Tags</h3>
              <div className="field-row">
                <input
                  type="number"
                  value={Number.isFinite(dilutionFactor) ? dilutionFactor : 1}
                  onChange={(e) => setDilutionFactor(Number(e.target.value || '1'))}
                  min={0}
                  step={0.1}
                  aria-label="Dilution factor"
                  data-testid="sample-dilution-input"
                />
                <input
                  type="text"
                  value={groupOverride}
                  onChange={(e) => setGroupOverride(e.target.value)}
                  placeholder="Group override (optional)"
                  aria-label="Group override"
                  data-testid="group-override-input"
                />
                <button
                  className="ghost"
                  type="button"
                  onClick={applySampleTags}
                  disabled={!selected.size}
                  data-testid="apply-tags-btn"
                >
                  Apply tags
                </button>
              </div>

              <div style={{ height: 16 }} />
              <h3>Legend</h3>
              <div className="legend">
                <span>
                  <span className="swatch sample" /> Sample
                </span>
                <span>
                  <span className="swatch standard" /> Standard
                </span>
                <span>
                  <span className="swatch blank" /> Blank
                </span>
                <span>
                  <span className="swatch empty" /> Empty
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
