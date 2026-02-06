import { describe, expect, it } from 'vitest'
import { evalPoly, fitPolynomial, invertPolyBySearch } from './polynomial'

describe('polynomial', () => {
  it('fits a quadratic exactly for noiseless data', () => {
    // y = 2 + 3x + 0.5x^2
    const x = Array.from({ length: 10 }, (_, i) => i)
    const y = x.map((v) => 2 + 3 * v + 0.5 * v * v)

    const fit = fitPolynomial(x, y, 2)
    expect(fit).not.toBeNull()
    expect(fit!.degree).toBe(2)
    expect(fit!.r2).toBeCloseTo(1, 10)
    expect(fit!.coeff[0]).toBeCloseTo(2, 8)
    expect(fit!.coeff[1]).toBeCloseTo(3, 8)
    expect(fit!.coeff[2]).toBeCloseTo(0.5, 8)
  })

  it('inverts by search within range', () => {
    // y = x^2 in [0, 10]
    const coeff = [0, 0, 1]
    const x = invertPolyBySearch(coeff, 25, 0, 10)
    expect(x).not.toBeNull()
    expect(evalPoly(coeff, x!)).toBeCloseTo(25, 2)
  })
})

