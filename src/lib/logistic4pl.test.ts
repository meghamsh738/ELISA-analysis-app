import { describe, expect, it } from 'vitest'
import { eval4pl, fit4pl, invert4pl } from './logistic4pl'

describe('logistic4pl', () => {
  it('fits a noiseless increasing 4PL curve', () => {
    const trueParams = { A: 0.05, D: 2.2, C: 1.0, B: 1.2 } // EC50 = 10
    const x = [0.1, 0.3, 1, 3, 10, 30, 100]
    const y = x.map((v) => eval4pl(trueParams, v))

    const fit = fit4pl(x, y, { restarts: 3, maxIter: 140 })
    expect(fit).not.toBeNull()
    expect(fit!.n).toBe(x.length)
    expect(fit!.r2).toBeCloseTo(1, 6)

    const yHat = x.map((v) => eval4pl(fit!.params, v))
    for (let i = 0; i < y.length; i += 1) {
      expect(yHat[i]).toBeCloseTo(y[i], 3)
    }
  })

  it('inverts within the standard range', () => {
    const params = { A: 0.05, D: 2.2, C: 1.0, B: 1.2 }
    const minX = 0.1
    const maxX = 100
    const xTrue = 3
    const y = eval4pl(params, xTrue)
    const x = invert4pl(params, y, minX, maxX)
    expect(x).not.toBeNull()
    expect(x!).toBeCloseTo(xTrue, 3)
  })

  it('fits a noiseless decreasing 4PL curve', () => {
    const trueParams = { A: 2.2, D: 0.05, C: 1.0, B: 1.2 }
    const x = [0.1, 0.3, 1, 3, 10, 30, 100]
    const y = x.map((v) => eval4pl(trueParams, v))

    const fit = fit4pl(x, y, { restarts: 3, maxIter: 160 })
    expect(fit).not.toBeNull()
    expect(fit!.r2).toBeCloseTo(1, 6)

    const yHat = x.map((v) => eval4pl(fit!.params, v))
    for (let i = 0; i < y.length; i += 1) {
      expect(yHat[i]).toBeCloseTo(y[i], 3)
    }
  })
})

