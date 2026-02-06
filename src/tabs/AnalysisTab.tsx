import { useMemo, useState } from 'react'
import { parseElisaReaderText } from '../lib/elisaReader'
import { type WellAssignment } from '../lib/layoutModel'
import { plate96WellIds, type WellId96 } from '../lib/plate96'
import { CurvePlot } from '../components/CurvePlot'
import { fitPolynomial, invertPolyBySearch } from '../lib/polynomial'
import { median } from '../lib/stats'

export type AnalysisTabProps = {
  readerText: string
  onChangeReaderText: (next: string) => void
  wells: Record<WellId96, WellAssignment>
  onChangeWells: (next: Record<WellId96, WellAssignment>) => void
}

type Row = {
  wellId: WellId96
  type: WellAssignment['type']
  animalId: string
  group: string
  dilutionFactor: number | null
  a450: number | null
  a570: number | null
  net: number | null
  keep: boolean
  outlier: boolean
  delta: number | null
}

const fmt = (n: number | null) => (n === null ? '' : n.toFixed(4))

export function AnalysisTab({ readerText, onChangeReaderText, wells, onChangeWells }: AnalysisTabProps) {
  const [showOnlyAssigned, setShowOnlyAssigned] = useState(true)
  const [blankSubtract, setBlankSubtract] = useState(true)
  const [outlierThreshold, setOutlierThreshold] = useState(0.15)
  const [curveDegree, setCurveDegree] = useState<2 | 3>(2)
  const [serialTop, setSerialTop] = useState<number>(1000)
  const [serialFactor, setSerialFactor] = useState<number>(2)
  const [serialOrder, setSerialOrder] = useState<'highToLow' | 'lowToHigh'>('highToLow')

  const parsed = useMemo(() => parseElisaReaderText(readerText), [readerText])

  const standardLevels = useMemo(() => {
    const levels = new Set<string>()
    for (const wellId of plate96WellIds) {
      const w = wells[wellId]
      if (w.type !== 'Standard') continue
      const lvl = (w.standardLevel ?? '').trim()
      if (lvl) levels.add(lvl)
    }
    const list = Array.from(levels)
    const num = (s: string) => {
      const m = s.match(/(\d+)(?!.*\d)/)
      return m ? Number(m[1]) : Number.NaN
    }
    list.sort((a, b) => {
      const na = num(a)
      const nb = num(b)
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
      if (Number.isFinite(na)) return -1
      if (Number.isFinite(nb)) return 1
      return a.localeCompare(b)
    })
    return list
  }, [wells])

  const [stdConcMap, setStdConcMap] = useState<Record<string, number>>(() => {
    const base: Record<string, number> = {}
    const levels = Array.from(
      new Set(
        Object.values(wells)
          .filter((w) => w.type === 'Standard')
          .map((w) => (w.standardLevel ?? '').trim())
          .filter(Boolean)
      )
    )
    const ordered = levels.slice()
    const num = (s: string) => {
      const m = s.match(/(\d+)(?!.*\d)/)
      return m ? Number(m[1]) : Number.NaN
    }
    ordered.sort((a, b) => {
      const na = num(a)
      const nb = num(b)
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
      if (Number.isFinite(na)) return -1
      if (Number.isFinite(nb)) return 1
      return a.localeCompare(b)
    })
    // Default: 2-fold serial dilution from 1000 down.
    ordered.forEach((lvl, idx) => {
      base[lvl] = 1000 / 2 ** idx
    })
    return base
  })

  const blanks = useMemo(() => {
    const vals: number[] = []
    for (const wellId of plate96WellIds) {
      const w = wells[wellId]
      if (w.type !== 'Blank' || !w.keep) continue
      const net = parsed.wells[wellId]?.net ?? null
      if (typeof net === 'number' && Number.isFinite(net)) vals.push(net)
    }
    return vals
  }, [parsed.wells, wells])

  const blankMedian = useMemo(() => median(blanks), [blanks])
  const blankOffset = blankSubtract && blankMedian !== null ? blankMedian : 0

  const rows: Row[] = useMemo(() => {
    const items: Row[] = plate96WellIds.map((wellId) => {
      const w = wells[wellId]
      const reading = parsed.wells[wellId]
      const net = reading?.net ?? null
      return {
        wellId,
        type: w.type,
        animalId: w.type === 'Sample' ? w.animalId ?? '' : '',
        group: w.type === 'Sample' ? w.group ?? '' : w.type === 'Standard' ? w.standardLevel ?? '' : '',
        dilutionFactor: w.type === 'Sample' ? w.dilutionFactor ?? 1 : null,
        a450: reading?.a450 ?? null,
        a570: reading?.a570 ?? null,
        net,
        keep: w.keep,
        outlier: false,
        delta: null,
      }
    })

    // Outlier detection on blank-corrected net, within replicate groups.
    const groupMap = new Map<string, { idx: number; value: number }[]>()
    items.forEach((row, idx) => {
      if (!row.keep) return
      const val = row.net === null ? null : row.net - blankOffset
      if (val === null || !Number.isFinite(val)) return

      let key = 'other'
      if (row.type === 'Standard') key = `STD||${row.group}`
      if (row.type === 'Sample') key = `SAMPLE||${row.animalId}||${row.dilutionFactor ?? 1}`
      if (row.type === 'Blank') key = 'BLANK'

      const arr = groupMap.get(key) ?? []
      arr.push({ idx, value: val })
      groupMap.set(key, arr)
    })

    for (const [, entries] of groupMap.entries()) {
      if (entries.length < 2) continue
      const m = median(entries.map((e) => e.value))
      if (m === null) continue
      for (const e of entries) {
        const delta = Math.abs(e.value - m)
        items[e.idx].delta = delta
        items[e.idx].outlier = delta > outlierThreshold
      }
    }

    return items
  }, [wells, parsed.wells, blankOffset, outlierThreshold])

  const filteredRows = useMemo(() => {
    if (!showOnlyAssigned) return rows
    return rows.filter((r) => r.type !== 'Empty')
  }, [rows, showOnlyAssigned])

  const counts = useMemo(() => {
    const assigned = rows.filter((r) => r.type !== 'Empty').length
    const samples = rows.filter((r) => r.type === 'Sample').length
    const standards = rows.filter((r) => r.type === 'Standard').length
    const blanksCount = rows.filter((r) => r.type === 'Blank').length
    const outliers = rows.filter((r) => r.outlier && r.keep).length
    const kept = rows.filter((r) => r.keep && r.type !== 'Empty').length
    return { assigned, samples, standards, blanks: blanksCount, outliers, kept }
  }, [rows])

  const toggleKeep = (wellId: WellId96, keep: boolean) => {
    onChangeWells({ ...wells, [wellId]: { ...wells[wellId], keep } })
  }

  const stdPoints = useMemo(() => {
    const byLevel = new Map<string, number[]>()
    for (const wellId of plate96WellIds) {
      const w = wells[wellId]
      if (w.type !== 'Standard' || !w.keep) continue
      const lvl = (w.standardLevel ?? '').trim()
      if (!lvl) continue
      const net = parsed.wells[wellId]?.net ?? null
      if (net === null || !Number.isFinite(net)) continue
      const corrected = net - blankOffset
      const arr = byLevel.get(lvl) ?? []
      arr.push(corrected)
      byLevel.set(lvl, arr)
    }

    const points = standardLevels.map((lvl) => {
      const vals = byLevel.get(lvl) ?? []
      const n = vals.length
      const mean = n ? vals.reduce((acc, v) => acc + v, 0) / n : null
      const sd =
        n > 1
          ? Math.sqrt(vals.reduce((acc, v) => acc + (v - (mean ?? 0)) ** 2, 0) / (n - 1))
          : null
      const concRaw = stdConcMap[lvl]
      const conc = Number.isFinite(concRaw) ? concRaw : null
      return { level: lvl, conc, n, mean, sd }
    })
    return points
  }, [blankOffset, parsed.wells, wells, standardLevels, stdConcMap])

  const polyFit = useMemo(() => {
    const usable = stdPoints.filter((p) => p.conc !== null && p.mean !== null)
    if (usable.length < curveDegree + 1) return null
    const x = usable.map((p) => p.conc as number)
    const y = usable.map((p) => p.mean as number)
    return fitPolynomial(x, y, curveDegree)
  }, [stdPoints, curveDegree])

  const sampleQuant = useMemo(() => {
    if (!polyFit) return []
    const usable = stdPoints.filter((p) => p.conc !== null && p.mean !== null)
    const xVals = usable.map((p) => p.conc as number)
    const minX = Math.min(...xVals)
    const maxX = Math.max(...xVals)

    const out: Array<{
      wellId: WellId96
      animalId: string
      group: string
      dilutionFactor: number
      netBlank: number | null
      conc: number | null
      concAdjusted: number | null
    }> = []

    for (const wellId of plate96WellIds) {
      const w = wells[wellId]
      if (w.type !== 'Sample' || !w.keep) continue
      const net = parsed.wells[wellId]?.net ?? null
      if (net === null || !Number.isFinite(net)) continue

      const netBlank = net - blankOffset
      const conc = invertPolyBySearch(polyFit.coeff, netBlank, minX, maxX)
      const dilution = w.dilutionFactor && Number.isFinite(w.dilutionFactor) && w.dilutionFactor > 0 ? w.dilutionFactor : 1
      const concAdjusted = conc === null ? null : conc * dilution

      out.push({
        wellId,
        animalId: w.animalId ?? '',
        group: w.group ?? '',
        dilutionFactor: dilution,
        netBlank,
        conc,
        concAdjusted,
      })
    }

    return out
  }, [polyFit, stdPoints, wells, parsed.wells, blankOffset])

  const sampleSummary = useMemo(() => {
    type Agg = { key: string; animalId: string; group: string; values: number[] }
    const map = new Map<string, Agg>()
    sampleQuant.forEach((row) => {
      if (row.concAdjusted === null || !Number.isFinite(row.concAdjusted)) return
      const key = `${row.animalId}||${row.group}`
      const cur = map.get(key) ?? { key, animalId: row.animalId, group: row.group, values: [] }
      cur.values.push(row.concAdjusted)
      map.set(key, cur)
    })
    const out = Array.from(map.values()).map((a) => {
      const n = a.values.length
      const mean = n ? a.values.reduce((acc, v) => acc + v, 0) / n : null
      const sd =
        n > 1
          ? Math.sqrt(a.values.reduce((acc, v) => acc + (v - (mean ?? 0)) ** 2, 0) / (n - 1))
          : null
      return { animalId: a.animalId, group: a.group, n, mean, sd }
    })
    out.sort((a, b) => a.animalId.localeCompare(b.animalId))
    return out
  }, [sampleQuant])

  const fillStdSerialDilution = () => {
    const levels = standardLevels
    if (!levels.length) return
    const ordered = serialOrder === 'highToLow' ? levels : levels.slice().reverse()
    const next = { ...stdConcMap }
    ordered.forEach((lvl, idx) => {
      const v = serialTop / serialFactor ** idx
      if (Number.isFinite(v)) next[lvl] = v
    })
    setStdConcMap(next)
  }

  const copyQuantTsv = async () => {
    const headers = ['Well', 'AnimalId', 'Group', 'DilutionFactor', 'Net(blank)', 'Conc', 'ConcAdjusted']
    const lines = [headers.join('\t')]
    sampleQuant.forEach((r) => {
      lines.push(
        [
          r.wellId,
          r.animalId,
          r.group,
          String(r.dilutionFactor),
          r.netBlank === null ? '' : r.netBlank.toFixed(4),
          r.conc === null ? '' : r.conc.toFixed(6),
          r.concAdjusted === null ? '' : r.concAdjusted.toFixed(6),
        ].join('\t')
      )
    })
    await navigator.clipboard.writeText(lines.join('\n'))
    alert('Quantified samples copied (TSV).')
  }

  return (
    <div data-testid="analysis-tab">
      <div className="shell">
        <section className="card" data-testid="reader-card">
          <div className="section-head">
            <div>
              <p className="kicker">Step 1 · Paste reader output</p>
              <h2>450 + 570 plate blocks</h2>
              <p className="muted">
                Paste the plate output from the ELISA reader (450 and 570). The app computes net absorbance = 450 − 570 and then
                optionally subtracts the blank median.
              </p>
            </div>
            <div className="row">
              <span className="badge">Parsed wells: {Object.keys(parsed.wells).length}</span>
              {parsed.temperatureC !== null ? <span className="badge">Temp: {parsed.temperatureC}°C</span> : null}
            </div>
          </div>

          <textarea
            className="textarea large"
            value={readerText}
            onChange={(e) => onChangeReaderText(e.target.value)}
            placeholder="Paste ELISA reader output here…"
          />

          {parsed.warnings.length > 0 && (
            <div className="alert warn" role="alert">
              <div>
                <strong>Parse warnings:</strong>
                <ul className="bullets">
                  {parsed.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="shell">
        <section className="card" data-testid="perwell-card">
          <div className="section-head">
            <div>
              <p className="kicker">Step 2 · Review</p>
              <h2>Per-well table</h2>
              <p className="muted">
                Toggle <strong>keep</strong> to remove standards/blanks/samples from downstream curve fitting. Outliers are flagged by
                median delta within replicate groups.
              </p>
            </div>
            <div className="row">
              <span className="badge">Assigned: {counts.assigned}</span>
              <span className="badge">Kept: {counts.kept}</span>
              <span className="badge">Outliers: {counts.outliers}</span>
            </div>
          </div>

          <div className="controls">
            <label className="control">
              <span>Show only assigned wells</span>
              <input type="checkbox" checked={showOnlyAssigned} onChange={(e) => setShowOnlyAssigned(e.target.checked)} />
            </label>
            <label className="control">
              <span>Blank subtract (median)</span>
              <input
                type="checkbox"
                checked={blankSubtract}
                onChange={(e) => setBlankSubtract(e.target.checked)}
                disabled={blanks.length === 0}
              />
            </label>
            <label className="control">
              <span>Outlier threshold (Δabs)</span>
              <input
                type="number"
                value={outlierThreshold}
                min={0}
                step={0.01}
                onChange={(e) => setOutlierThreshold(Number(e.target.value || '0'))}
              />
            </label>
          </div>

          <div className="table-wrap">
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>keep</th>
                    <th>Well</th>
                    <th>Type</th>
                    <th>Animal</th>
                    <th>Group/Std</th>
                    <th className="num">Dilution</th>
                    <th className="num">450</th>
                    <th className="num">570</th>
                    <th className="num">Net</th>
                    <th className="num">Net(blank)</th>
                    <th className="num">Δ</th>
                    <th>Outlier</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => {
                    const corrected = r.net === null ? null : r.net - blankOffset
                    return (
                      <tr key={r.wellId}>
                        <td>
                          <input
                            type="checkbox"
                            checked={r.keep}
                            onChange={(e) => toggleKeep(r.wellId, e.target.checked)}
                            aria-label={`Keep ${r.wellId}`}
                          />
                        </td>
                        <td>{r.wellId}</td>
                        <td>{r.type}</td>
                        <td>{r.animalId}</td>
                        <td>{r.group}</td>
                        <td className="num">{r.dilutionFactor ?? ''}</td>
                        <td className="num">{fmt(r.a450)}</td>
                        <td className="num">{fmt(r.a570)}</td>
                        <td className="num">{fmt(r.net)}</td>
                        <td className="num">{fmt(corrected)}</td>
                        <td className="num">{r.delta === null ? '' : r.delta.toFixed(4)}</td>
                        <td>{r.outlier ? 'Yes' : ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <div className="shell">
        <section className="card" data-testid="curve-card">
          <div className="section-head">
            <div>
              <p className="kicker">Step 3 · Standard curve</p>
              <h2>Concentrations + polynomial fit</h2>
              <p className="muted">
                Standards are taken from wells marked <strong>Standard</strong> in the Layout tab. Use <strong>keep</strong> to drop
                duplicates and improve curve fit.
              </p>
            </div>
            <div className="row">
              <span className="badge">Std levels: {standardLevels.length}</span>
              <span className="badge">Degree: {curveDegree}</span>
              {polyFit ? <span className="badge">R²: {Number.isFinite(polyFit.r2) ? polyFit.r2.toFixed(4) : 'NA'}</span> : null}
            </div>
          </div>

          <div className="controls">
            <label className="control">
              <span>Polynomial degree</span>
              <select value={curveDegree} onChange={(e) => setCurveDegree(Number(e.target.value) as 2 | 3)}>
                <option value={2}>2 (quadratic)</option>
                <option value={3}>3 (cubic)</option>
              </select>
            </label>

            <label className="control">
              <span>Serial top</span>
              <input type="number" value={serialTop} min={0} step={1} onChange={(e) => setSerialTop(Number(e.target.value || '0'))} />
            </label>

            <label className="control">
              <span>Dilution factor</span>
              <input
                type="number"
                value={serialFactor}
                min={1}
                step={0.5}
                onChange={(e) => setSerialFactor(Number(e.target.value || '1'))}
              />
            </label>

            <label className="control">
              <span>Order</span>
              <select
                value={serialOrder}
                onChange={(e) => setSerialOrder(e.target.value === 'lowToHigh' ? 'lowToHigh' : 'highToLow')}
              >
                <option value="highToLow">Std1 highest → StdN lowest</option>
                <option value="lowToHigh">Std1 lowest → StdN highest</option>
              </select>
            </label>
          </div>

          <div className="cta-row">
            <div className="muted">
              Blank median: {blankMedian === null ? 'NA' : blankMedian.toFixed(4)} · Blank subtract:{' '}
              {blankSubtract && blanks.length ? 'on' : 'off'}
            </div>
            <div className="row">
              <button className="ghost" type="button" onClick={fillStdSerialDilution} disabled={!standardLevels.length}>
                Fill serial dilution
              </button>
            </div>
          </div>

          {standardLevels.length === 0 ? (
            <div className="empty">
              <p className="muted">No standards yet. In Layout, select wells and click “Mark Standard”.</p>
            </div>
          ) : (
            <div className="grid-2">
              <div className="table-wrap">
                <div className="table-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Std level</th>
                        <th className="num">Concentration</th>
                        <th className="num">N</th>
                        <th className="num">Mean(abs)</th>
                        <th className="num">SD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stdPoints.map((p) => (
                        <tr key={p.level}>
                          <td>{p.level}</td>
                          <td className="num">
                            <input
                              type="number"
                              value={p.conc ?? ''}
                              onChange={(e) => {
                                const v = Number(e.target.value)
                                setStdConcMap({ ...stdConcMap, [p.level]: v })
                              }}
                              style={{ width: 160 }}
                            />
                          </td>
                          <td className="num">{p.n}</td>
                          <td className="num">{p.mean === null ? '' : p.mean.toFixed(4)}</td>
                          <td className="num">{p.sd === null ? '' : p.sd.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel">
                <h3>Fit preview</h3>
                <div className="muted-small">
                  Uses mean blank-corrected net absorbance per standard level. Requires at least {curveDegree + 1} standard levels
                  with both concentration and absorbance.
                </div>
                <div style={{ height: 12 }} />
                {polyFit ? (
                  <>
                    <CurvePlot
                      title={`Polynomial fit (deg ${polyFit.degree})`}
                      points={stdPoints.filter((p) => p.conc !== null && p.mean !== null).map((p) => ({ x: p.conc as number, y: p.mean as number }))}
                      coeff={polyFit.coeff}
                    />
                    <div style={{ height: 12 }} />
                    <div className="muted-small">
                      Coefficients: y = {polyFit.coeff.map((c, idx) => `${c.toFixed(4)}·x^${idx}`).join(' + ')}
                    </div>
                  </>
                ) : (
                  <div className="muted">Not enough usable standard points to fit yet.</div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="shell">
        <section className="card" data-testid="quant-card">
          <div className="section-head">
            <div>
              <p className="kicker">Step 4 · Quantify</p>
              <h2>Sample concentrations</h2>
              <p className="muted">
                Concentrations are computed by inverting the polynomial fit within the standard range, then multiplying by the well’s
                dilution factor.
              </p>
            </div>
            <div className="row">
              <span className="badge">Wells: {sampleQuant.length}</span>
              <span className="badge">Animals: {sampleSummary.length}</span>
              <button className="ghost" type="button" onClick={copyQuantTsv} disabled={!sampleQuant.length}>
                Copy quantified TSV
              </button>
            </div>
          </div>

          {!polyFit ? (
            <div className="empty">
              <p className="muted">Fit a standard curve first.</p>
            </div>
          ) : (
            <div className="grid-2">
              <div className="table-wrap">
                <div className="table-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Well</th>
                        <th>Animal</th>
                        <th>Group</th>
                        <th className="num">Dilution</th>
                        <th className="num">Net(blank)</th>
                        <th className="num">Conc</th>
                        <th className="num">Conc × Dilution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sampleQuant.map((r) => (
                        <tr key={r.wellId}>
                          <td>{r.wellId}</td>
                          <td>{r.animalId}</td>
                          <td>{r.group}</td>
                          <td className="num">{r.dilutionFactor}</td>
                          <td className="num">{r.netBlank === null ? '' : r.netBlank.toFixed(4)}</td>
                          <td className="num">{r.conc === null ? '' : r.conc.toFixed(6)}</td>
                          <td className="num">{r.concAdjusted === null ? '' : r.concAdjusted.toFixed(6)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="table-wrap">
                <div className="table-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Animal</th>
                        <th>Group</th>
                        <th className="num">N</th>
                        <th className="num">Mean</th>
                        <th className="num">SD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sampleSummary.map((r) => (
                        <tr key={`${r.animalId}||${r.group}`}>
                          <td>{r.animalId}</td>
                          <td>{r.group}</td>
                          <td className="num">{r.n}</td>
                          <td className="num">{r.mean === null ? '' : r.mean.toFixed(6)}</td>
                          <td className="num">{r.sd === null ? '' : r.sd.toFixed(6)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
