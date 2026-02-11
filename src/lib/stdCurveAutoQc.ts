import { fit4pl } from './logistic4pl'
import { evalPoly, fitPolynomial } from './polynomial'

export type CurveKind = { kind: '4pl' } | { kind: 'poly'; degree: 2 | 3 }

export type StdLevelInput = {
  level: string
  conc: number
  replicates: Array<{ wellId: string; y: number }>
}

export type AutoQcAction =
  | { type: 'exclude-replicate'; level: string; wellId: string; reason: string }
  | { type: 'drop-level'; level: string; reason: string }

export type AutoQcSuggestion = {
  excludedWellIds: string[]
  droppedLevels: string[]
  actions: AutoQcAction[]
  baseline: { r2: number; sse: number; nLevels: number } | null
  suggested: { r2: number; sse: number; nLevels: number } | null
}

export type AutoQcOptions = {
  maxActions?: number
  maxExcludedWells?: number
  maxDroppedLevels?: number
  replicatePenalty?: number
  levelPenalty?: number
  minScoreImprove?: number
}

const isFiniteNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

const mean = (values: number[]): number | null => {
  const clean = values.filter((v) => Number.isFinite(v))
  if (!clean.length) return null
  return clean.reduce((acc, v) => acc + v, 0) / clean.length
}

type FitSummary = { r2: number; sse: number; nLevels: number }
type Point = { level: string; x: number; y: number; n: number }

const fitForPoints = (points: Point[], curve: CurveKind): FitSummary | null => {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)

  if (curve.kind === '4pl') {
    const clean: Array<{ x: number; y: number }> = []
    for (let i = 0; i < xs.length; i += 1) {
      const x = xs[i]
      const y = ys[i]
      if (!isFiniteNumber(x) || x <= 0) continue
      if (!isFiniteNumber(y)) continue
      clean.push({ x, y })
    }
    if (clean.length < 4) return null
    const fit = fit4pl(
      clean.map((p) => p.x),
      clean.map((p) => p.y),
      { restarts: 3 }
    )
    if (!fit) return null
    return { r2: fit.r2, sse: fit.sse, nLevels: clean.length }
  }

  const degree = curve.degree
  const clean: Array<{ x: number; y: number }> = []
  for (let i = 0; i < xs.length; i += 1) {
    const x = xs[i]
    const y = ys[i]
    if (!isFiniteNumber(x)) continue
    if (!isFiniteNumber(y)) continue
    clean.push({ x, y })
  }
  if (clean.length < degree + 1) return null
  const fit = fitPolynomial(
    clean.map((p) => p.x),
    clean.map((p) => p.y),
    degree
  )
  if (!fit) return null
  let sse = 0
  for (const pt of clean) {
    const yHat = evalPoly(fit.coeff, pt.x)
    const r = pt.y - yHat
    sse += r * r
  }
  return { r2: fit.r2, sse, nLevels: clean.length }
}

const calcScore = (
  fit: FitSummary,
  excludedWellIdsCount: number,
  droppedLevelCount: number,
  replicatePenalty: number,
  levelPenalty: number
): number => {
  const r2 = Number.isFinite(fit.r2) ? fit.r2 : -Infinity
  return r2 - excludedWellIdsCount * replicatePenalty - droppedLevelCount * levelPenalty
}

export const suggestStandardCurveExclusions = (
  inputs: StdLevelInput[],
  curve: CurveKind,
  opts: AutoQcOptions = {}
): AutoQcSuggestion => {
  const maxActions = opts.maxActions ?? 3
  const maxExcludedWells = opts.maxExcludedWells ?? 3
  const maxDroppedLevels = opts.maxDroppedLevels ?? 1
  const replicatePenalty = opts.replicatePenalty ?? 0.005
  const levelPenalty = opts.levelPenalty ?? 0.01
  const minScoreImprove = opts.minScoreImprove ?? 0.001

  // Normalize + filter unusable data early.
  const levels: StdLevelInput[] = inputs
    .map((l) => ({
      level: (l.level ?? '').trim(),
      conc: l.conc,
      replicates: (l.replicates ?? []).filter((r) => r && typeof r.wellId === 'string' && isFiniteNumber(r.y)),
    }))
    .filter((l) => l.level.length > 0)
    .filter((l) => isFiniteNumber(l.conc) && l.conc > 0)
    .filter((l) => l.replicates.length > 0)

  const excludedWellIds = new Set<string>()
  const droppedLevels = new Set<string>()
  const actions: AutoQcAction[] = []

  const buildPoints = (): Point[] => {
    const pts: Point[] = []
    for (const lvl of levels) {
      if (droppedLevels.has(lvl.level)) continue
      const reps = lvl.replicates.filter((r) => !excludedWellIds.has(r.wellId))
      if (!reps.length) continue
      const y = mean(reps.map((r) => r.y))
      if (y === null) continue
      pts.push({ level: lvl.level, x: lvl.conc, y, n: reps.length })
    }
    return pts
  }

  const baselinePoints = buildPoints()
  const baselineFit = fitForPoints(baselinePoints, curve)
  if (!baselineFit) {
    return { excludedWellIds: [], droppedLevels: [], actions: [], baseline: null, suggested: null }
  }

  let curFit = baselineFit
  let curScore = calcScore(curFit, excludedWellIds.size, droppedLevels.size, replicatePenalty, levelPenalty)

  for (let step = 0; step < maxActions; step += 1) {
    let best:
      | {
          nextExcluded: Set<string>
          nextDropped: Set<string>
          fit: FitSummary
          score: number
          action: AutoQcAction
        }
      | null = null

    const currentPoints = buildPoints()
    const currentFit = fitForPoints(currentPoints, curve)
    if (!currentFit) break

    // Candidate: exclude a single replicate (must leave at least 1 replicate in that level).
    for (const lvl of levels) {
      if (droppedLevels.has(lvl.level)) continue
      const included = lvl.replicates.filter((r) => !excludedWellIds.has(r.wellId))
      if (included.length <= 1) continue
      for (const rep of included) {
        if (excludedWellIds.has(rep.wellId)) continue
        if (excludedWellIds.size + 1 > maxExcludedWells) continue

        const nextExcluded = new Set(excludedWellIds)
        nextExcluded.add(rep.wellId)

        // Recompute points with this replicate excluded.
        const pts: Point[] = []
        for (const l2 of levels) {
          if (droppedLevels.has(l2.level)) continue
          const reps2 = l2.replicates.filter((r) => !nextExcluded.has(r.wellId))
          if (!reps2.length) continue
          const y2 = mean(reps2.map((r) => r.y))
          if (y2 === null) continue
          pts.push({ level: l2.level, x: l2.conc, y: y2, n: reps2.length })
        }

        const fit2 = fitForPoints(pts, curve)
        if (!fit2) continue
        const score2 = calcScore(fit2, nextExcluded.size, droppedLevels.size, replicatePenalty, levelPenalty)

        if (!best || score2 > best.score) {
          best = {
            nextExcluded,
            nextDropped: new Set(droppedLevels),
            fit: fit2,
            score: score2,
            action: {
              type: 'exclude-replicate',
              level: lvl.level,
              wellId: rep.wellId,
              reason: `Improves fit (ΔR² ${(fit2.r2 - currentFit.r2).toFixed(4)}).`,
            },
          }
        }
      }
    }

    // Candidate: drop an entire standard level.
    for (const lvl of levels) {
      if (droppedLevels.has(lvl.level)) continue
      if (droppedLevels.size + 1 > maxDroppedLevels) continue

      const nextDropped = new Set(droppedLevels)
      nextDropped.add(lvl.level)

      const pts: Point[] = []
      for (const l2 of levels) {
        if (nextDropped.has(l2.level)) continue
        const reps2 = l2.replicates.filter((r) => !excludedWellIds.has(r.wellId))
        if (!reps2.length) continue
        const y2 = mean(reps2.map((r) => r.y))
        if (y2 === null) continue
        pts.push({ level: l2.level, x: l2.conc, y: y2, n: reps2.length })
      }

      const fit2 = fitForPoints(pts, curve)
      if (!fit2) continue
      const score2 = calcScore(fit2, excludedWellIds.size, nextDropped.size, replicatePenalty, levelPenalty)

      if (!best || score2 > best.score) {
        best = {
          nextExcluded: new Set(excludedWellIds),
          nextDropped,
          fit: fit2,
          score: score2,
          action: { type: 'drop-level', level: lvl.level, reason: `Improves fit (ΔR² ${(fit2.r2 - currentFit.r2).toFixed(4)}).` },
        }
      }
    }

    if (!best) break
    if (!(best.score > curScore + minScoreImprove)) break

    // Apply the best step.
    excludedWellIds.clear()
    for (const id of best.nextExcluded) excludedWellIds.add(id)
    droppedLevels.clear()
    for (const lvl of best.nextDropped) droppedLevels.add(lvl)
    actions.push(best.action)
    curFit = best.fit
    curScore = best.score
  }

  const excludedList = Array.from(excludedWellIds)
  const droppedList = Array.from(droppedLevels)
  const suggestedPoints = buildPoints()
  const suggestedFit = fitForPoints(suggestedPoints, curve)

  return {
    excludedWellIds: excludedList,
    droppedLevels: droppedList,
    actions,
    baseline: baselineFit,
    suggested: suggestedFit,
  }
}
