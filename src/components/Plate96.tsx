import { Fragment, type MouseEvent } from 'react'
import { PLATE96_COLS, PLATE96_ROWS, type WellId96 } from '../lib/plate96'

export type WellType = 'Empty' | 'Sample' | 'Standard' | 'Blank'

export type WellInfo = {
  wellId: WellId96
  type: WellType
  label: string
  title: string
  color: string
  keep: boolean
}

type Props = {
  wells: Record<WellId96, WellInfo>
  selected: Set<WellId96>
  onWellClick: (wellId: WellId96, event: MouseEvent<HTMLDivElement>) => void
}

export function Plate96({ wells, selected, onWellClick }: Props) {
  return (
    <div className="plate-shell">
      <div className="plate-grid-wrapper">
        <div className="plate-grid plate-96" aria-label="96-well plate">
          <div className="corner" />
          {PLATE96_COLS.map((col) => (
            <div key={`h-${col}`} className="col-head">
              {col}
            </div>
          ))}
          {PLATE96_ROWS.map((row) => (
            <Fragment key={row}>
              <div className="row-head">{row}</div>
              {PLATE96_COLS.map((col) => {
                const wellId = `${row}${col}` as WellId96
                const info = wells[wellId]
                const isSelected = selected.has(wellId)
                return (
                  <div
                    key={wellId}
                    className={[
                      'well-square',
                      isSelected ? 'selected' : '',
                      info?.keep === false ? 'excluded' : '',
                    ].join(' ')}
                    role="button"
                    tabIndex={0}
                    aria-label={`Well ${wellId}`}
                    title={info?.title ?? wellId}
                    style={{ backgroundColor: info?.color ?? '#FFFDF6' }}
                    onClick={(e) => onWellClick(wellId, e)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        // @ts-expect-error - React keyboard event does not match mouse event, but handler only reads modifier keys.
                        onWellClick(wellId, e)
                      }
                    }}
                    data-testid={`well-${wellId}`}
                  >
                    {info?.label ? <span className="well-label">{info.label}</span> : null}
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}
