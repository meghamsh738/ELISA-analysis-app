import { evalPoly } from '../lib/polynomial'

type Point = { x: number; y: number }

type Props = {
  points: Point[]
  coeff: number[] | null
  title?: string
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function CurvePlot({ points, coeff, title }: Props) {
  const width = 520
  const height = 320
  const pad = 44

  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)

  const xMin = xs.length ? Math.min(...xs) : 0
  const xMax = xs.length ? Math.max(...xs) : 1
  const yMin = ys.length ? Math.min(...ys) : 0
  const yMax = ys.length ? Math.max(...ys) : 1

  const xSpan = xMax - xMin || 1
  const ySpan = yMax - yMin || 1

  const x0 = xMin - xSpan * 0.08
  const x1 = xMax + xSpan * 0.08
  const y0 = yMin - ySpan * 0.12
  const y1 = yMax + ySpan * 0.12

  const xScale = (x: number) => pad + ((x - x0) / (x1 - x0)) * (width - pad * 2)
  const yScale = (y: number) => height - pad - ((y - y0) / (y1 - y0)) * (height - pad * 2)

  const linePath = (() => {
    if (!coeff) return ''
    const steps = 180
    const pts: string[] = []
    for (let i = 0; i <= steps; i += 1) {
      const x = x0 + (i / steps) * (x1 - x0)
      const y = evalPoly(coeff, x)
      const px = xScale(x)
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

  const xTicks = ticks(x0, x1, 4)
  const yTicks = ticks(y0, y1, 4)

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
      {xTicks.map((t) => (
        <line
          key={`x-${t}`}
          x1={xScale(t)}
          x2={xScale(t)}
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
      {coeff ? <path d={linePath} fill="none" stroke="#1F5BFF" strokeWidth="2.5" /> : null}

      {/* points */}
      {points.map((p, idx) => (
        <circle
          key={idx}
          cx={xScale(p.x)}
          cy={yScale(p.y)}
          r={5.5}
          fill="#FF4D2E"
          stroke="#111113"
          strokeWidth="1.5"
        />
      ))}

      {/* tick labels */}
      {xTicks.map((t) => (
        <text
          key={`xl-${t}`}
          x={xScale(t)}
          y={height - pad + 20}
          textAnchor="middle"
          fontSize="11"
          fontFamily="var(--font-mono)"
          fill="#2F2F36"
        >
          {clamp(t, -1e9, 1e9).toFixed(1)}
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

