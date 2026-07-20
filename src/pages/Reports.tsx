import { useEffect, useState } from 'react'
import type { ReportRow, SubscriptionDetail } from '../data/types'
import { monthLabel, todayIST } from '../lib/dates'
import { MEAL_LABEL } from '../lib/domain'
import { inr } from '../lib/money'
import { useApp } from '../state/AppContext'

interface AttendanceSummaryRow {
  locationId: string
  locationName: string
  meal: 'lunch' | 'dinner'
  present: number
  absent: number
  unmarked: number
  skipped: number
  total: number
}

export function Reports() {
  const { adapter, locations } = useApp()
  const [month, setMonth] = useState(todayIST().slice(0, 7))
  const [rows, setRows] = useState<ReportRow[]>([])
  const [attToday, setAttToday] = useState<AttendanceSummaryRow[]>([])
  const [dues, setDues] = useState<SubscriptionDetail[]>([])

  useEffect(() => {
    adapter.getMonthlyReport(month).then(setRows)
  }, [adapter, month])

  useEffect(() => {
    adapter.listSubscriptionDetails({ hasDues: true }).then(setDues)
    const today = todayIST()
    ;(async () => {
      const summary: AttendanceSummaryRow[] = []
      for (const meal of ['lunch', 'dinner'] as const) {
        const sheet = await adapter.listAttendanceSheet(undefined, today, meal)
        const byLoc = new Map<string, AttendanceSummaryRow>()
        for (const r of sheet) {
          const locId = r.subscription.location_id
          let row = byLoc.get(locId)
          if (!row) {
            row = {
              locationId: locId,
              locationName: locations.find((l) => l.id === locId)?.name ?? '?',
              meal,
              present: 0,
              absent: 0,
              unmarked: 0,
              skipped: 0,
              total: 0,
            }
            byLoc.set(locId, row)
          }
          row.total++
          if (r.isSkipDay) row.skipped++
          else if (r.mark === 'present') row.present++
          else if (r.mark === 'absent') row.absent++
          else row.unmarked++
        }
        summary.push(...byLoc.values())
      }
      setAttToday(summary)
    })()
  }, [adapter, locations])

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const totalNew = rows.reduce((s, r) => s + r.newSubscriptions, 0)
  const totalMeals = rows.reduce((s, r) => s + r.mealsServed, 0)
  const maxRevenue = Math.max(1, ...rows.map((r) => r.revenue))
  const duesTotal = dues.reduce((s, d) => s + d.due_amount, 0)

  return (
    <div className="page">
      <h2>Reports</h2>

      <div className="card" data-testid="att-summary">
        <h3>Today's attendance</h3>
        {attToday.length === 0 && <p className="muted">No active subscribers today.</p>}
        {attToday.map((r) => (
          <div className="row" key={`${r.locationId}-${r.meal}`}>
            <div className="grow">
              <div className="name">
                {locations.length > 1 ? `${r.locationName} · ` : ''}
                {MEAL_LABEL[r.meal]}
              </div>
              <div className="meta">
                {r.present} present · {r.absent} absent · {r.unmarked} not marked
                {r.skipped > 0 ? ` · ${r.skipped} on skip` : ''} (of {r.total})
              </div>
            </div>
            <span className={`badge ${r.unmarked === 0 ? 'green' : 'amber'}`}>
              {r.present}/{r.total - r.skipped}
            </span>
          </div>
        ))}
      </div>

      <div className="card" data-testid="dues-summary">
        <h3>Dues outstanding</h3>
        <div className="row">
          <div className="grow name">
            {dues.length === 0 ? 'No pending dues 🎉' : `${dues.length} customer${dues.length > 1 ? 's' : ''} owe`}
          </div>
          {dues.length > 0 && <span className="badge red">{inr(duesTotal)}</span>}
        </div>
      </div>

      <div className="field">
        <label htmlFor="report-month">Month</label>
        <input id="report-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="report-month" />
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="num" data-testid="total-revenue">{inr(totalRevenue)}</div>
          <div className="label">Collected in {monthLabel(month)}</div>
        </div>
        <div className="stat">
          <div className="num">{totalNew}</div>
          <div className="label">New subscriptions</div>
        </div>
        <div className="stat">
          <div className="num">{totalMeals}</div>
          <div className="label">Meals served (marked present)</div>
        </div>
      </div>

      <div className="card">
        <h3>By location</h3>
        <table className="report" data-testid="report-table">
          <thead>
            <tr>
              <th>Location</th>
              <th className="num">Collected</th>
              <th className="num">New</th>
              <th className="num">Active</th>
              <th className="num">Meals</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.locationId}>
                <td>
                  {r.locationName}
                  <div className="bar-track" style={{ marginTop: 4 }}>
                    <div className="bar-fill" style={{ width: `${(r.revenue / maxRevenue) * 100}%` }} />
                  </div>
                </td>
                <td className="num">{inr(r.revenue)}</td>
                <td className="num">{r.newSubscriptions}</td>
                <td className="num">{r.activeAtMonthEnd}</td>
                <td className="num">{r.mealsServed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
