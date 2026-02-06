export type PolyFit = {
  degree: number
  coeff: number[] // c0..cd so y = sum(c[i] * x^i)
  r2: number
}

const isFiniteNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

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
  // Augment matrix
  const M = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col += 1) {
    // Partial pivot
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

    // Normalize pivot row
    const pivot = M[col][col]
    for (let c = col; c <= n; c += 1) M[col][c] /= pivot

    // Eliminate
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

export const evalPoly = (coeff: number[], x: number): number => {
  // Horner, but coeff is low-to-high
  let y = 0
  for (let i = coeff.length - 1; i >= 0; i -= 1) {
    y = y * x + coeff[i]
  }
  return y
}

export const fitPolynomial = (x: number[], y: number[], degree: number): PolyFit | null => {
  const clean: Array<{ x: number; y: number }> = []
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    if (isFiniteNumber(x[i]) && isFiniteNumber(y[i])) clean.push({ x: x[i], y: y[i] })
  }
  if (clean.length < degree + 1) return null

  const n = degree + 1
  const A: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => 0))
  const b: number[] = Array.from({ length: n }, () => 0)

  for (const pt of clean) {
    const xpows: number[] = [1]
    for (let k = 1; k <= 2 * degree; k += 1) xpows[k] = xpows[k - 1] * pt.x
    for (let row = 0; row < n; row += 1) {
      for (let col = 0; col < n; col += 1) {
        A[row][col] += xpows[row + col]
      }
      b[row] += pt.y * xpows[row]
    }
  }

  const coeff = solveLinearSystem(A, b)
  if (!coeff) return null

  const yHat = clean.map((pt) => evalPoly(coeff, pt.x))
  const r2 = r2Score(clean.map((pt) => pt.y), yHat)
  return { degree, coeff, r2 }
}

export const invertPolyBySearch = (coeff: number[], y: number, minX: number, maxX: number): number | null => {
  if (!Number.isFinite(y) || !Number.isFinite(minX) || !Number.isFinite(maxX)) return null
  if (maxX <= minX) return null

  const clamp = (v: number) => Math.min(maxX, Math.max(minX, v))
  const err = (x: number) => {
    const yHat = evalPoly(coeff, x)
    const e = yHat - y
    return e * e
  }

  // Coarse scan.
  const steps = 600
  let bestX = minX
  let bestErr = err(minX)
  for (let i = 1; i <= steps; i += 1) {
    const x0 = minX + (i / steps) * (maxX - minX)
    const e0 = err(x0)
    if (e0 < bestErr) {
      bestErr = e0
      bestX = x0
    }
  }

  // Local refine.
  let step = (maxX - minX) / 20
  for (let iter = 0; iter < 28; iter += 1) {
    const a = clamp(bestX - step)
    const b = clamp(bestX + step)
    const ea = err(a)
    const eb = err(b)
    if (ea < bestErr) {
      bestErr = ea
      bestX = a
    }
    if (eb < bestErr) {
      bestErr = eb
      bestX = b
    }
    step *= 0.5
  }

  return bestX
}

