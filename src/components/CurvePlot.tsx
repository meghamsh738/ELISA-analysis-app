import { evalPoly } from '../lib/polynomial'
import { eval4pl, type FourPLParams } from '../lib/logistic4pl'

type Point = { x: number; y: number }

type CurveModel =
  | { kind: 'poly'; coeff: number[] }
  | { kind: '4pl'; params: FourPLParams }

type Props = {
  points: Point[]
  model: CurveModel | null
  title?: string
  xScale?: 'linear' | 'log10'
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function CurvePlot({ points, model, title, xScale = 'linear' }: Props) {
  const width = 520
  const height = 320
  const pad = 44

  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)

  const xTransform = (x: number) => {
    if (xScale !== 'log10') return x
    return Math.log10(Math.max(1e-12, x))
  }

  const xsT = xs.map(xTransform)

  const xMinT = xsT.length ? Math.min(...xsT) : 0
  const xMaxT = xsT.length ? Math.max(...xsT) : 1
  const yMin = ys.length ? Math.min(...ys) : 0
  const yMax = ys.length ? Math.max(...ys) : 1

  const xSpan = xMaxT - xMinT || 1
  const ySpan = yMax - yMin || 1

  const x0T = xMinT - xSpan * 0.08
  const x1T = xMaxT + xSpan * 0.08
  const y0 = yMin - ySpan * 0.12
  const y1 = yMax + ySpan * 0.12

  const xToPxFromXT = (xT: number) => pad + ((xT - x0T) / (x1T - x0T)) * (width - pad * 2)
  const xToPx = (x: number) => xToPxFromXT(xTransform(x))
  const yScale = (y: number) => height - pad - ((y - y0) / (y1 - y0)) * (height - pad * 2)

  const linePath = (() => {
    if (!model) return ''
    const steps = 180
    const pts: string[] = []
    for (let i = 0; i <= steps; i += 1) {
      const xT = x0T + (i / steps) * (x1T - x0T)
      const x = xScale === 'log10' ? 10 ** xT : xT
      const y = model.kind === 'poly' ? evalPoly(model.coeff, x) : eval4pl(model.params, x)
      const px = xToPxFromXT(xT)
      const py = yScale(y)
      pts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(2)} ${py.toFixed(2)}`)
    }
    return pts.join(' ')
  })()

  const ticks = (min: number, max: number, n: number) => {
    const out: number[] = []
    for (let i = 0; i <= n; i += 1) out.push(min + (i / n) * (max - min))
    return out
  }

  const xTicksT = ticks(x0T, x1T, 4)
  const yTicks = ticks(y0, y1, 4)

  const formatXT = (xT: number) => {
    if (xScale !== 'log10') return clamp(xT, -1e9, 1e9).toFixed(1)
    const conc = 10 ** xT
    if (!Number.isFinite(conc)) return ''
    if (conc >= 1000) return conc.toFixed(0)
    if (conc >= 10) return conc.toFixed(0)
    if (conc >= 1) return conc.toFixed(1)
    if (conc >= 0.1) return conc.toFixed(2)
    return conc.toExponential(1)
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="auto"
      role="img"
      aria-label={title ?? 'Standard curve plot'}
      style={{ display: 'block' }}
    >
      <rect x="0" y="0" width={width} height={height} fill="#FFFDF6" stroke="#111113" strokeWidth="2" />

      {title ? (
        <text x={pad} y={24} fontSize="13" fontFamily="var(--font-mono)" fill="#2F2F36">
          {title}
        </text>
      ) : null}

      {/* grid */}
      {xTicksT.map((t) => (
        <line
          key={`x-${t}`}
          x1={xToPxFromXT(t)}
          x2={xToPxFromXT(t)}
          y1={pad}
          y2={height - pad}
          stroke="rgba(17,17,20,0.08)"
        />
      ))}
      {yTicks.map((t) => (
        <line
          key={`y-${t}`}
          x1={pad}
          x2={width - pad}
          y1={yScale(t)}
          y2={yScale(t)}
          stroke="rgba(17,17,20,0.08)"
        />
      ))}

      {/* axes */}
      <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="#111113" strokeWidth="2" />
      <line x1={pad} x2={pad} y1={pad} y2={height - pad} stroke="#111113" strokeWidth="2" />

      {/* curve */}
      {model ? <path d={linePath} fill="none" stroke="#1F5BFF" strokeWidth="2.5" /> : null}

      {/* points */}
      {points.map((p, idx) => (
        <circle
          key={idx}
          cx={xToPx(p.x)}
          cy={yScale(p.y)}
          r={5.5}
          fill="#FF4D2E"
          stroke="#111113"
          strokeWidth="1.5"
        />
      ))}

      {/* tick labels */}
      {xTicksT.map((t) => (
        <text
          key={`xl-${t}`}
          x={xToPxFromXT(t)}
          y={height - pad + 20}
          textAnchor="middle"
          fontSize="11"
          fontFamily="var(--font-mono)"
          fill="#2F2F36"
        >
          {formatXT(t)}
        </text>
      ))}
      {yTicks.map((t) => (
        <text
          key={`yl-${t}`}
          x={pad - 10}
          y={yScale(t) + 4}
          textAnchor="end"
          fontSize="11"
          fontFamily="var(--font-mono)"
          fill="#2F2F36"
        >
          {clamp(t, -1e9, 1e9).toFixed(2)}
        </text>
      ))}

      <text
        x={width / 2}
        y={height - 10}
        textAnchor="middle"
        fontSize="12"
        fontFamily="var(--font-mono)"
        fill="#2F2F36"
      >
        Concentration
      </text>
      <text
        x={14}
        y={height / 2}
        textAnchor="middle"
        fontSize="12"
        fontFamily="var(--font-mono)"
        fill="#2F2F36"
        transform={`rotate(-90 14 ${height / 2})`}
      >
        Absorbance
      </text>
    </svg>
  )
}
