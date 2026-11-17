export type PolyFit = {
  degree: number
  coeff: number[] // c0..cd so y = sum(c[i] * x^i)
  r2: number
}

export type ScaledPolyFit = {
  degree: number
  coeff: number[] // Polynomial coefficients on t = (x - xCenter) / xScale.
  xCenter: number
  xScale: number
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

/** Fit in a centered/scaled concentration coordinate to reduce conditioning errors. */
export const fitPolynomialScaled = (x: number[], y: number[], degree: number): ScaledPolyFit | null => {
  const clean: Array<{ x: number; y: number }> = []
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    if (isFiniteNumber(x[i]) && isFiniteNumber(y[i])) clean.push({ x: x[i], y: y[i] })
  }
  if (clean.length < degree + 1 || !Number.isInteger(degree) || degree < 1) return null
  const minX = Math.min(...clean.map((pt) => pt.x))
  const maxX = Math.max(...clean.map((pt) => pt.x))
  const xCenter = (minX + maxX) / 2
  const xScale = (maxX - minX) / 2
  if (!Number.isFinite(xCenter) || !Number.isFinite(xScale) || xScale <= 0) return null
  const normalizedX = clean.map((pt) => (pt.x - xCenter) / xScale)
  const fit = fitPolynomial(normalizedX, clean.map((pt) => pt.y), degree)
  if (!fit) return null
  return { degree, coeff: fit.coeff, xCenter, xScale, r2: fit.r2 }
}

export const evalScaledPolynomial = (fit: ScaledPolyFit, x: number): number =>
  evalPoly(fit.coeff, (x - fit.xCenter) / fit.xScale)

/** Return the polynomial's direction over an interval, or null if it turns or is flat. */
export const polynomialDirection = (coeff: number[], minX: number, maxX: number): 'increasing' | 'decreasing' | null => {
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX <= minX || coeff.length < 2 || coeff.length > 4) return null
  if (!coeff.every(Number.isFinite)) return null

  // The derivative of a cubic is quadratic, so its real roots partition the
  // interval into sections where the derivative cannot change sign.
  const derivative = coeff.slice(1).map((value, index) => value * (index + 1))
  while (derivative.length > 1 && Math.abs(derivative[derivative.length - 1]) < 1e-15) derivative.pop()
  const candidates = [minX, maxX]
  const addRoot = (root: number) => {
    if (Number.isFinite(root) && root > minX && root < maxX) candidates.push(root)
  }

  if (derivative.length === 2) {
    if (Math.abs(derivative[1]) > 1e-15) addRoot(-derivative[0] / derivative[1])
  } else if (derivative.length === 3) {
    const [c, b, a] = derivative
    const discriminant = b * b - 4 * a * c
    if (discriminant >= 0 && Math.abs(a) > 1e-15) {
      const rootDisc = Math.sqrt(discriminant)
      addRoot((-b - rootDisc) / (2 * a))
      addRoot((-b + rootDisc) / (2 * a))
    }
  }

  candidates.sort((a, b) => a - b)
  let direction: 'increasing' | 'decreasing' | null = null
  for (let index = 0; index < candidates.length - 1; index += 1) {
    const x = (candidates[index] + candidates[index + 1]) / 2
    const slope = derivative.reduce((sum, value, power) => sum + value * x ** power, 0)
    if (!Number.isFinite(slope) || Math.abs(slope) <= 1e-14) return null
    const current = slope > 0 ? 'increasing' : 'decreasing'
    if (direction !== null && direction !== current) return null
    direction = current
  }
  return direction
}

export const invertPolyBySearch = (coeff: number[], y: number, minX: number, maxX: number): number | null => {
  if (!Number.isFinite(y) || !Number.isFinite(minX) || !Number.isFinite(maxX)) return null
  if (maxX <= minX) return null
  const direction = polynomialDirection(coeff, minX, maxX)
  if (!direction) return null
  const atMin = evalPoly(coeff, minX)
  const atMax = evalPoly(coeff, maxX)
  const lowResponse = Math.min(atMin, atMax)
  const highResponse = Math.max(atMin, atMax)
  const tolerance = 1e-12 * Math.max(1, Math.abs(lowResponse), Math.abs(highResponse), Math.abs(y))
  if (y < lowResponse - tolerance || y > highResponse + tolerance) return null
  if (Math.abs(y - atMin) <= tolerance) return minX
  if (Math.abs(y - atMax) <= tolerance) return maxX

  let lo = minX
  let hi = maxX
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = (lo + hi) / 2
    const response = evalPoly(coeff, middle)
    if (Math.abs(response - y) <= tolerance) return middle
    if ((direction === 'increasing' && response < y) || (direction === 'decreasing' && response > y)) lo = middle
    else hi = middle
  }
  return (lo + hi) / 2
}

