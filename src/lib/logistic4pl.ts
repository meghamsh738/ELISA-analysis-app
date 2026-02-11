export type FourPLParams = {
  // y = A + (D - A) / (1 + 10^((C - log10(x)) * B))
  // x is concentration (must be > 0), C is log10(EC50), B is Hill slope (> 0).
  A: number
  D: number
  C: number
  B: number
}

export type FourPLFit = {
  params: FourPLParams
  r2: number
  sse: number
  n: number
}

const isFiniteNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const LN10 = Math.log(10)

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const r2Score = (y: number[], yHat: number[]): number => {
  const mean = y.reduce((acc, v) => acc + v, 0) / y.length
  let ssTot = 0
  let ssRes = 0
  for (let i = 0; i < y.length; i += 1) {
    ssTot += (y[i] - mean) ** 2
    ssRes += (y[i] - yHat[i]) ** 2
  }
  return ssTot === 0 ? Number.NaN : 1 - ssRes / ssTot
}

const solveLinearSystem = (A: number[][], b: number[]): number[] | null => {
  const n = A.length
  const M = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col += 1) {
    let pivotRow = col
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) pivotRow = r
    }
    if (Math.abs(M[pivotRow][col]) < 1e-12) return null
    if (pivotRow !== col) {
      const tmp = M[col]
      M[col] = M[pivotRow]
      M[pivotRow] = tmp
    }

    const pivot = M[col][col]
    for (let c = col; c <= n; c += 1) M[col][c] /= pivot

    for (let r = 0; r < n; r += 1) {
      if (r === col) continue
      const factor = M[r][col]
      if (Math.abs(factor) < 1e-12) continue
      for (let c = col; c <= n; c += 1) {
        M[r][c] -= factor * M[col][c]
      }
    }
  }

  return M.map((row) => row[n])
}

export const eval4plLogX = (params: FourPLParams, xLog10: number): number => {
  const { A, D, C, B } = params
  const t = (C - xLog10) * B
  const pow = Math.exp(clamp(t, -60, 60) * LN10) // 10^t, overflow-safe
  return A + (D - A) / (1 + pow)
}

export const eval4pl = (params: FourPLParams, xConc: number): number => {
  const x = xConc > 0 ? xConc : 1e-12
  return eval4plLogX(params, Math.log10(x))
}

export const invert4pl = (params: FourPLParams, y: number, minConc: number, maxConc: number): number | null => {
  if (!isFiniteNumber(y)) return null
  const { A, D, C, B } = params
  if (!isFiniteNumber(A) || !isFiniteNumber(D) || !isFiniteNumber(C) || !isFiniteNumber(B) || B <= 0) return null
  if (!isFiniteNumber(minConc) || !isFiniteNumber(maxConc) || maxConc <= minConc) return null

  const lo = Math.min(A, D)
  const hi = Math.max(A, D)
  // Only invert within the curve's asymptotes.
  if (y <= lo || y >= hi) return null

  const denom = y - A
  if (Math.abs(denom) < 1e-12) return null
  const frac = (D - A) / denom - 1
  if (!(frac > 0)) return null

  const xLog10 = C - Math.log10(frac) / B
  const conc = 10 ** xLog10
  if (!Number.isFinite(conc)) return null
  if (conc < minConc || conc > maxConc) return null
  return conc
}

type FitOptions = {
  maxIter?: number
  lambda0?: number
  tol?: number
  restarts?: number
}

export const fit4pl = (xConc: number[], y: number[], opts: FitOptions = {}): FourPLFit | null => {
  const maxIter = opts.maxIter ?? 90
  const tol = opts.tol ?? 1e-10
  const lambda0 = opts.lambda0 ?? 1e-2
  const restarts = opts.restarts ?? 3

  const clean: Array<{ xLog: number; y: number }> = []
  for (let i = 0; i < Math.min(xConc.length, y.length); i += 1) {
    const xc = xConc[i]
    const yi = y[i]
    if (!isFiniteNumber(xc) || xc <= 0) continue
    if (!isFiniteNumber(yi)) continue
    clean.push({ xLog: Math.log10(xc), y: yi })
  }
  if (clean.length < 4) return null

  const xs = clean.map((p) => p.xLog)
  const ys = clean.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)

  // Determine direction from a rough linear trend in log space.
  const xMean = xs.reduce((a, v) => a + v, 0) / xs.length
  const yMean = ys.reduce((a, v) => a + v, 0) / ys.length
  let cov = 0
  let varx = 0
  for (let i = 0; i < xs.length; i += 1) {
    cov += (xs[i] - xMean) * (ys[i] - yMean)
    varx += (xs[i] - xMean) ** 2
  }
  const slopeSign = varx > 0 ? Math.sign(cov / varx) : 1

  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const A0 = slopeSign >= 0 ? yMin : yMax
  const D0 = slopeSign >= 0 ? yMax : yMin
  const mid = (A0 + D0) / 2
  let C0 = xs[Math.floor(xs.length / 2)]
  let bestMid = Number.POSITIVE_INFINITY
  for (const pt of clean) {
    const d = Math.abs(pt.y - mid)
    if (d < bestMid) {
      bestMid = d
      C0 = pt.xLog
    }
  }

  const BGuesses = [0.6, 1.0, 1.8, 3.0].slice(0, Math.max(1, restarts))

  let bestFit: FourPLFit | null = null

  for (const BStart of BGuesses) {
    // Parameter vector: [A, D, C, b] where B = exp(b) keeps B > 0.
    let p = [A0, D0, C0, Math.log(Math.max(1e-3, BStart))]
    let lambda = lambda0

    const evalModel = (pp: number[], xLog: number) => {
      const A = pp[0]
      const D = pp[1]
      const C = pp[2]
      const B = Math.exp(clamp(pp[3], -4, 4))
      return eval4plLogX({ A, D, C, B }, xLog)
    }

    const sseFor = (pp: number[]) => {
      let sse = 0
      for (let i = 0; i < clean.length; i += 1) {
        const yHat = evalModel(pp, clean[i].xLog)
        const r = clean[i].y - yHat
        sse += r * r
      }
      return sse
    }

    let curSse = sseFor(p)

    for (let iter = 0; iter < maxIter; iter += 1) {
      // Compute current predictions and residuals.
      const yHat: number[] = []
      const r: number[] = []
      for (let i = 0; i < clean.length; i += 1) {
        const yh = evalModel(p, clean[i].xLog)
        yHat.push(yh)
        r.push(clean[i].y - yh)
      }

      // Numerical Jacobian for predictions.
      const J: number[][] = Array.from({ length: clean.length }, () => [0, 0, 0, 0])
      for (let j = 0; j < 4; j += 1) {
        // Use a relative step size; absolute steps can be too small (poor numerical gradients)
        // or too large (nonlinear regime), depending on parameter scale.
        const dp = 1e-4 * (Math.abs(p[j]) + 1)
        const ppPlus = [...p]
        const ppMinus = [...p]
        ppPlus[j] += dp
        ppMinus[j] -= dp
        for (let i = 0; i < clean.length; i += 1) {
          const yhPlus = evalModel(ppPlus, clean[i].xLog)
          const yhMinus = evalModel(ppMinus, clean[i].xLog)
          const dy = (yhPlus - yhMinus) / (2 * dp)
          // Jacobian of the model output: df/dp.
          J[i][j] = dy
        }
      }

      // Build JTJ and JTr.
      const JTJ: number[][] = Array.from({ length: 4 }, () => [0, 0, 0, 0])
      const JTr: number[] = [0, 0, 0, 0]
      for (let i = 0; i < clean.length; i += 1) {
        for (let j = 0; j < 4; j += 1) {
          JTr[j] += J[i][j] * r[i]
          for (let k = 0; k < 4; k += 1) {
            JTJ[j][k] += J[i][j] * J[i][k]
          }
        }
      }

      for (let d = 0; d < 4; d += 1) JTJ[d][d] += lambda

      const delta = solveLinearSystem(JTJ, JTr)
      if (!delta) break

      const pCand = [p[0] + delta[0], p[1] + delta[1], p[2] + delta[2], p[3] + delta[3]]
      // Clamp C within a reasonable range beyond the measured data.
      pCand[2] = clamp(pCand[2], minX - 2, maxX + 2)
      // Clamp b to keep B in a practical range.
      pCand[3] = clamp(pCand[3], -4, 4)

      const sseCand = sseFor(pCand)
      const improved = sseCand + 1e-12 < curSse
      if (improved) {
        p = pCand
        curSse = sseCand
        lambda = Math.max(1e-12, lambda * 0.35)
        const stepNorm = Math.sqrt(delta.reduce((acc, v) => acc + v * v, 0))
        if (stepNorm < tol) break
      } else {
        lambda = Math.min(1e12, lambda * 10)
      }
    }

    const params: FourPLParams = {
      A: p[0],
      D: p[1],
      C: p[2],
      B: Math.exp(clamp(p[3], -4, 4)),
    }
    const yHatFinal = clean.map((pt) => eval4plLogX(params, pt.xLog))
    const r2 = r2Score(ys, yHatFinal)
    const fit: FourPLFit = { params, r2, sse: curSse, n: clean.length }

    if (!bestFit || (Number.isFinite(fit.sse) && fit.sse < bestFit.sse)) {
      bestFit = fit
    }
  }

  return bestFit
}
