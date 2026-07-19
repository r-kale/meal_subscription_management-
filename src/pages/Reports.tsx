import { useEffect, useState } from 'react'
import type { ReportRow } from '../data/types'
import { monthLabel, todayIST } from '../lib/dates'
import { inr } from '../lib/money'
import { useApp } from '../state/AppContext'

export function Reports() {
  const { adapter } = useApp()
  const [month, setMonth] = useState(todayIST().slice(0, 7))
  const [rows, setRows] = useState<ReportRow[]>([])

  useEffect(() => {
    adapter.getMonthlyReport(month).then(setRows)
  }, [adapter, month])

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const totalNew = rows.reduce((s, r) => s + r.newSubscriptions, 0)
  const maxRevenue = Math.max(1, ...rows.map((r) => r.revenue))

  return (
    <div className="page">
      <h2>Reports</h2>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
