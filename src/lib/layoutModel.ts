import { plate96WellIds, type WellId96 } from './plate96'

export type WellType = 'Empty' | 'Sample' | 'Standard' | 'Blank'

export type WellAssignment = {
  wellId: WellId96
  type: WellType
  keep: boolean

  // Sample-only fields
  animalId?: string
  group?: string
  dilutionFactor?: number
  meta?: Record<string, string>

  // Standard-only fields
  standardLevel?: string
}

export const emptyLayout96 = (): Record<WellId96, WellAssignment> => {
  const wells = {} as Record<WellId96, WellAssignment>
  for (const wellId of plate96WellIds) {
    wells[wellId] = { wellId, type: 'Empty', keep: true }
  }
  return wells
}

