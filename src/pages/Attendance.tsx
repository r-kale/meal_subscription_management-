import { useCallback, useEffect, useState } from 'react'
import { LocationPicker } from '../components/LocationPicker'
import { EmptyState } from '../components/ui'
import type { AttendanceMeal, AttendanceRow, AttendanceStatus } from '../data/types'
import { hourIST, todayIST } from '../lib/dates'
import { MEAL_LABEL } from '../lib/domain'
import { useApp } from '../state/AppContext'

/** Before 4 pm IST default to lunch, after that dinner. */
function defaultMeal(): AttendanceMeal {
  return hourIST() < 16 ? 'lunch' : 'dinner'
}

export function Attendance() {
  const { adapter, locationFilter, setLocationFilter } = useApp()
  const [date, setDate] = useState(todayIST())
  const [meal, setMeal] = useState<AttendanceMeal>(defaultMeal)
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await adapter.listAttendanceSheet(locationFilter || undefined, date, meal))
    } finally {
      setLoading(false)
    }
  }, [adapter, locationFilter, date, meal])

  useEffect(() => {
    reload()
  }, [reload])

  async function toggle(row: AttendanceRow, target: AttendanceStatus) {
    // Tapping the already-set state clears the mark.
    const next: AttendanceStatus | null = row.mark === target ? null : target
    await adapter.setAttendance(row.subscription.id, date, meal, next)
    setRows((prev) =>
      prev.map((r) => (r.subscription.id === row.subscription.id ? { ...r, mark: next } : r)),
    )
  }

  const marked = rows.filter((r) => r.mark !== null).length
  const present = rows.filter((r) => r.mark === 'present').length

  return (
    <div className="page">
      <h2>Attendance</h2>
      <LocationPicker value={locationFilter} onChange={setLocationFilter} />
      <div className="btn-row">
        <input
          type="date"
          className="search-input"
          style={{ flex: 1, minWidth: 140 }}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          data-testid="att-date"
        />
        <div className="chip-row">
          {(['lunch', 'dinner'] as const).map((m) => (
            <button key={m} className={`chip${meal === m ? ' active' : ''}`} onClick={() => setMeal(m)} data-testid={`meal-${m}`}>
              {MEAL_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 data-testid="att-counter">
          {present} present · {marked}/{rows.length} marked
        </h3>
        {loading && <EmptyState>Loading…</EmptyState>}
        {!loading && rows.length === 0 && <EmptyState>No active subscribers for this day and meal.</EmptyState>}
        {!loading &&
          rows.map((row) => (
            <div key={row.subscription.id} className={`att-row${row.isSkipDay ? ' skipped' : ''}`} data-testid="att-row">
              <div className="grow">
                <div className="name">{row.subscription.customer_name}</div>
                <div className="meta">
                  {MEAL_LABEL[row.subscription.meal_type]}
                  {row.isSkipDay ? ' · ' : ''}
                  {row.isSkipDay && <span className="badge gray">Skip day</span>}
                </div>
              </div>
              {!row.isSkipDay && (
                <div className="toggle">
                  <button
                    className={row.mark === 'present' ? 'on-present' : ''}
                    onClick={() => toggle(row, 'present')}
                    aria-label={`Mark ${row.subscription.customer_name} present`}
                    data-testid="mark-present"
                  >
                    ✓
                  </button>
                  <button
                    className={row.mark === 'absent' ? 'on-absent' : ''}
                    onClick={() => toggle(row, 'absent')}
                    aria-label={`Mark ${row.subscription.customer_name} absent`}
                    data-testid="mark-absent"
                  >
                    ✗
                  </button>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  )
}
