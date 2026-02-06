export const median = (values: number[]): number | null => {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!clean.length) return null
  const mid = Math.floor(clean.length / 2)
  if (clean.length % 2 === 1) return clean[mid]
  return (clean[mid - 1] + clean[mid]) / 2
}

