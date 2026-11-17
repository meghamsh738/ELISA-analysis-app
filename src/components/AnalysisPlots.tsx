import { useEffect, useMemo, useRef, useState } from 'react'
import Plotly from 'plotly.js-basic-dist-min'
import {
  evaluateCalibration,
  type ElisaAnalysisResult,
} from '../lib/elisaAnalysis'
import type { Experiment } from '../lib/experiment'
import { safeName } from '../lib/export'

function Plot({
  data,
  layout,
  name,
  width = 900,
  height = 420,
  exports = true,
  printReport = false,
}: {
  data: Record<string, unknown>[]
  layout: Record<string, unknown>
  name: string
  width?: number
  height?: number
  exports?: boolean
  printReport?: boolean
}) {
  const element = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [printImage, setPrintImage] = useState<{
    data: typeof data
    layout: typeof layout
    url: string
  } | null>(null)
  const printReady = printImage?.data === data && printImage.layout === layout
  useEffect(() => {
    const div = element.current
    if (!div) return
    let active = true
    void Plotly.react(
      div,
      data,
      {
        paper_bgcolor: '#fff',
        plot_bgcolor: '#fff',
        font: { family: 'Arial, sans-serif', size: 13, color: '#183b3a' },
        margin: { l: 75, r: 25, t: 55, b: 75 },
        ...layout,
        autosize: false,
        width: Math.max(1, div.clientWidth),
        height,
      },
      {
        responsive: false,
        displaylogo: false,
        modeBarButtonsToRemove: ['toImage', 'sendDataToCloud'],
      },
    )
      .then(async () => {
        if (!active || !printReport) return
        // Prepare a vector figure with report dimensions before printing. Export
        // dimensions remain independent, and a stale figure cannot enable Print.
        const url = await Plotly.toImage(div, {
          format: 'svg',
          width: 900,
          height: 300,
        })
        if (active) setPrintImage({ data, layout, url })
      })
      .catch((e: Error) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [data, layout, height, printReport])
  useEffect(() => {
    const div = element.current!
    let previousWidth = 0
    const observer = new ResizeObserver(() => {
      const currentWidth = div.clientWidth
      if (currentWidth > 0 && currentWidth !== previousWidth) {
        previousWidth = currentWidth
        // Explicit sizing avoids Plotly's delayed window-resize debounce.
        void Plotly.relayout(div, { width: currentWidth }).catch(() => {})
      }
    })
    observer.observe(div)
    return () => {
      observer.disconnect()
      Plotly.purge(div)
    }
  }, [])
  const save = async (format: 'png' | 'svg') => {
    try {
      const url = await Plotly.toImage(element.current!, {
        format,
        width,
        height,
      })
      const link = document.createElement('a')
      link.href = url
      link.download = `${safeName(name)}.${format}`
      link.click()
    } catch (e) {
      setError(String(e))
    }
  }
  return (
    <div className="plot-card">
      <div
        ref={element}
        className={printReport ? 'plot no-print' : 'plot'}
        aria-label={name}
        role="img"
      />
      {printReport && printReady && (
        <img
          className="print-only print-figure"
          src={printImage.url}
          alt={name}
        />
      )}
      {error && <p role="alert">{error}</p>}
      {exports && (
        <div className="actions no-print">
          <button onClick={() => void save('png')}>Download {name} PNG</button>
          <button onClick={() => void save('svg')}>Download {name} SVG</button>
          {printReport && (
            <button disabled={!printReady} onClick={() => window.print()}>
              Print / save PDF report
            </button>
          )}
        </div>
      )}
    </div>
  )
}
const palette = [
  '#087f8c',
  '#c26935',
  '#6355a4',
  '#418056',
  '#b34d73',
  '#637b8c',
]
export function SamplePlot({
  result,
  exp,
  exports = false,
}: {
  result: ElisaAnalysisResult
  exp: Experiment
  exports?: boolean
}) {
  const graph = useMemo(() => {
    const all = result.samples.filter((s) => s.eligible && s.mean !== null)
    const available = [...new Set(all.map((s) => s.group || 'Ungrouped'))]
    const groups = [
      ...new Set([
        ...exp.graph.groupOrder.filter((g) => available.includes(g)),
        ...available,
      ]),
    ]
    const omitted = all.filter((s) => exp.graph.log && s.mean! <= 0).length
    const traces: Record<string, unknown>[] = []
    groups.forEach((group, i) => {
      const samples = all.filter((s) => (s.group || 'Ungrouped') === group)
      const visible = samples.filter((s) => !exp.graph.log || s.mean! > 0)
      const values = samples.map((s) => s.mean!)
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length
      const sd =
        values.length > 1
          ? Math.sqrt(
              values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
                (values.length - 1),
            )
          : 0
      const stableIndex = [
        ...new Set(result.samples.map((s) => s.group || 'Ungrouped')),
      ].indexOf(group)
      const colour =
        exp.graph.colours[group] ?? palette[stableIndex % palette.length]
      traces.push({
        type: 'scatter',
        mode: 'markers',
        name: group,
        x: visible.map(
          (_, j) =>
            i +
            (j - (visible.length - 1) / 2) *
              Math.min(0.1, 0.5 / Math.max(1, visible.length)),
        ),
        y: visible.map((s) => s.mean),
        text: visible.map(
          (s) =>
            `${s.animalId}${s.partial ? ' — partial technical replicates' : ''}`,
        ),
        hovertemplate: '%{text}<br>%{y:.5g}<extra></extra>',
        marker: { size: exp.graph.pointSize, color: colour },
        showlegend: false,
      })
      const error =
        exp.graph.uncertainty === 'sd' ? sd : sd / Math.sqrt(values.length)
      if (!exp.graph.log || mean > 0)
        traces.push({
          type: 'scatter',
          mode: 'lines',
          x: [i - 0.22, i + 0.22],
          y: [mean, mean],
          line: { color: colour, width: 3 },
          showlegend: false,
          hovertemplate: 'Mean %{y:.5g}<extra></extra>',
        })
      if (
        exp.graph.uncertainty !== 'none' &&
        values.length > 1 &&
        (!exp.graph.log || mean - error > 0)
      )
        traces.push({
          type: 'scatter',
          mode: 'markers',
          x: [i],
          y: [mean],
          marker: { size: 1, color: colour },
          error_y: {
            type: 'data',
            array: [error],
            visible: true,
            color: colour,
          },
          showlegend: false,
        })
    })
    return {
      data: traces,
      omitted,
      n: all.length,
      layout: {
        title: { text: exp.graph.title },
        xaxis: {
          title: { text: exp.graph.xLabel },
          tickvals: groups.map((_, i) => i),
          ticktext: groups.map(
            (g) =>
              `${g}<br>n = ${all.filter((s) => (s.group || 'Ungrouped') === g).length}`,
          ),
          range: [-0.5, Math.max(0.5, groups.length - 0.5)],
        },
        yaxis: {
          title: {
            text: exp.graph.yLabel || `Concentration (${exp.settings.units})`,
          },
          type: exp.graph.log ? 'log' : 'linear',
          zeroline: false,
        },
      },
    }
  }, [result, exp.graph, exp.settings.units])
  return (
    <>
      <p>
        {graph.n} biological samples contribute to this figure. Means and
        optional SD/SEM describe these samples; technical wells are averaged
        first.
      </p>
      {graph.omitted > 0 && (
        <p className="warning">
          {graph.omitted} non-positive sample value(s) cannot be displayed on a
          log axis. Exported concentrations are unchanged.
        </p>
      )}
      <Plot
        data={graph.data}
        layout={graph.layout}
        printReport
        name="Sample concentrations"
        width={exp.graph.width}
        height={exp.graph.height}
        exports={exports}
      />
    </>
  )
}
export function CalibrationPlots({
  result,
  units,
  exports = false,
}: {
  result: ElisaAnalysisResult
  units: string
  exports?: boolean
}) {
  const plots = useMemo(() => {
    const included = result.standards.filter(
      (s) => s.include && s.concentration !== null && s.meanResponse !== null,
    )
    const excluded = result.standards.filter(
      (s) => !s.include && s.concentration !== null && s.meanResponse !== null,
    )
    const curve = result.curve
    const xs =
      curve.model &&
      curve.minConcentration !== null &&
      curve.maxConcentration !== null
        ? Array.from({ length: 150 }, (_, i) =>
            curve.model?.kind === '4pl'
              ? 10 **
                (Math.log10(curve.minConcentration!) +
                  ((Math.log10(curve.maxConcentration!) -
                    Math.log10(curve.minConcentration!)) *
                    i) /
                    149)
              : curve.minConcentration! +
                ((curve.maxConcentration! - curve.minConcentration!) * i) / 149,
          )
        : []
    const data = [
      {
        type: 'scatter',
        mode: 'markers',
        x: included.map((s) => s.concentration),
        y: included.map((s) => s.meanResponse),
        text: included.map((s) => s.level),
        name: 'Retained standards',
        marker: { color: '#087f8c', size: 9 },
      },
      {
        type: 'scatter',
        mode: 'markers',
        x: excluded.map((s) => s.concentration),
        y: excluded.map((s) => s.meanResponse),
        text: excluded.map((s) => s.level),
        name: 'Excluded standards',
        marker: { color: '#a56429', symbol: 'x', size: 10 },
      },
      {
        type: 'scatter',
        mode: 'lines',
        x: xs,
        y: xs.map((x) => evaluateCalibration(curve.model!, x)),
        name: 'Fit',
        line: { color: '#163d3c' },
      },
    ]
    return {
      data,
      residual: [
        {
          type: 'scatter',
          mode: 'markers',
          x: included.map((s) => s.concentration),
          y: included.map((s) => s.meanResidual),
          text: included.map((s) => s.level),
          marker: { color: '#087f8c', size: 9 },
        },
      ],
      layout: {
        title: { text: 'Standard curve' },
        xaxis: {
          title: { text: `Concentration (${units || 'units required'})` },
          type: curve.model?.kind === '4pl' ? 'log' : 'linear',
        },
        yaxis: { title: { text: 'Corrected absorbance' } },
        legend: { orientation: 'h', y: -0.25 },
      },
      residualLayout: {
        title: { text: 'Standard residuals' },
        xaxis: {
          title: { text: `Concentration (${units || 'units required'})` },
        },
        yaxis: {
          title: { text: 'Observed − fitted absorbance' },
          zeroline: true,
        },
      },
    }
  }, [result, units])
  return (
    <div className="two-column">
      <Plot
        data={plots.data}
        layout={plots.layout}
        name="Standard curve"
        exports={exports}
      />
      <Plot
        data={plots.residual}
        layout={plots.residualLayout}
        name="Standard residuals"
        exports={exports}
      />
    </div>
  )
}
