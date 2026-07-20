import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '../components/ui'
import type { Location, MealType, Plan } from '../data/types'
import { DemoAdapter } from '../data/demoAdapter'
import { MEAL_LABEL } from '../lib/domain'
import { inr } from '../lib/money'
import { useApp } from '../state/AppContext'

export function Settings() {
  const { adapter, session, signOut, settings, reloadSettings, reloadLocations } = useApp()
  const [locations, setLocations] = useState<Location[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [editingPlan, setEditingPlan] = useState<Partial<Plan> | null>(null)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [newLocation, setNewLocation] = useState('')
  const [form, setForm] = useState(settings)
  const [saved, setSaved] = useState(false)

  useEffect(() => setForm(settings), [settings])
  useEffect(() => {
    adapter.listPlans(true).then(setPlans)
    adapter.listLocations(true).then(setLocations)
  }, [adapter])

  async function refreshLocations() {
    setLocations(await adapter.listLocations(true))
    await reloadLocations()
  }

  async function saveTemplates(e: FormEvent) {
    e.preventDefault()
    await adapter.saveSettings({ ...form, expiryWindowDays: Math.max(1, Number(form.expiryWindowDays) || 5) })
    await reloadSettings()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function addLocation(e: FormEvent) {
    e.preventDefault()
    if (!newLocation.trim()) return
    await adapter.upsertLocation({ name: newLocation.trim() })
    setNewLocation('')
    await refreshLocations()
  }

  async function savePlan(e: FormEvent) {
    e.preventDefault()
    if (!editingPlan?.name || !editingPlan.price) return
    await adapter.upsertPlan({
      id: editingPlan.id,
      name: editingPlan.name,
      meal_type: (editingPlan.meal_type ?? 'lunch') as MealType,
      duration_days: editingPlan.duration_days ?? 30,
      price: editingPlan.price,
      is_active: editingPlan.is_active ?? true,
    })
    setEditingPlan(null)
    setPlans(await adapter.listPlans(true))
  }

  return (
    <div className="page">
      <h2>Settings</h2>

      <div className="card">
        <h3>Locations</h3>
        {locations.map((l) => (
          <div className="row tappable" key={l.id} onClick={() => setEditingLocation(l)} data-testid="location-row">
            <div className="grow name">{l.name}</div>
            <span className="muted">rename ›</span>
          </div>
        ))}
        <form onSubmit={addLocation} className="btn-row" style={{ marginTop: 8 }}>
          <input
            className="search-input"
            style={{ flex: 1 }}
            placeholder="New location name"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            data-testid="new-location-name"
          />
          <button className="btn primary" type="submit" data-testid="add-location">
            Add
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Plans</h3>
        {plans.map((p) => (
          <div className="row tappable" key={p.id} onClick={() => setEditingPlan(p)}>
            <div className="grow">
              <div className="name">{p.name}</div>
              <div className="meta">
                {MEAL_LABEL[p.meal_type]} · {p.duration_days} days · {inr(p.price)}
                {!p.is_active && ' · inactive'}
              </div>
            </div>
          </div>
        ))}
        <button className="btn" style={{ marginTop: 8 }} onClick={() => setEditingPlan({ duration_days: 30, meal_type: 'lunch', is_active: true })}>
          + New plan
        </button>
      </div>

      <form className="card" onSubmit={saveTemplates}>
        <h3>Reminders & WhatsApp</h3>
        <div className="field">
          <label htmlFor="set-window">Show "expiring" this many days ahead</label>
          <input
            id="set-window"
            type="number"
            min={1}
            max={30}
            value={form.expiryWindowDays}
            onChange={(e) => setForm({ ...form, expiryWindowDays: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label htmlFor="set-upi">UPI ID (used in messages)</label>
          <input id="set-upi" value={form.upiId} onChange={(e) => setForm({ ...form, upiId: e.target.value })} placeholder="yourname@upi" />
        </div>
        <div className="field">
          <label htmlFor="set-renewal">Renewal message ({'{name} {end_date} {meal} {price} {upi}'})</label>
          <textarea id="set-renewal" value={form.renewalTemplate} onChange={(e) => setForm({ ...form, renewalTemplate: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="set-dues">Dues message ({'{name} {due} {upi}'})</label>
          <textarea id="set-dues" value={form.duesTemplate} onChange={(e) => setForm({ ...form, duesTemplate: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="set-welcome">Welcome message ({'{name} {meal} {end_date}'})</label>
          <textarea id="set-welcome" value={form.welcomeTemplate} onChange={(e) => setForm({ ...form, welcomeTemplate: e.target.value })} />
        </div>
        <button className="btn primary" type="submit">
          {saved ? 'Saved ✓' : 'Save settings'}
        </button>
      </form>

      <div className="card">
        <h3>Account</h3>
        <p className="muted">Signed in as {session.email}</p>
        <div className="btn-row">
          <button className="btn danger" onClick={signOut}>
            Sign out
          </button>
          {adapter instanceof DemoAdapter && (
            <button
              className="btn"
              onClick={() => {
                adapter.resetDemoData()
                window.location.reload()
              }}
            >
              Reset demo data
            </button>
          )}
        </div>
      </div>

      {editingLocation && (
        <Modal title="Rename location" onClose={() => setEditingLocation(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (!editingLocation.name.trim()) return
              await adapter.upsertLocation({ id: editingLocation.id, name: editingLocation.name.trim(), is_active: editingLocation.is_active })
              setEditingLocation(null)
              await refreshLocations()
            }}
          >
            <div className="field">
              <label htmlFor="loc-name">Location name</label>
              <input
                id="loc-name"
                value={editingLocation.name}
                onChange={(e) => setEditingLocation({ ...editingLocation, name: e.target.value })}
                data-testid="location-name-input"
              />
            </div>
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={editingLocation.is_active}
                  onChange={(e) => setEditingLocation({ ...editingLocation, is_active: e.target.checked })}
                />{' '}
                Active (inactive locations are hidden from pickers)
              </label>
            </div>
            <div className="btn-row">
              <button className="btn primary" type="submit" data-testid="save-location">
                Save
              </button>
              <button className="btn" type="button" onClick={() => setEditingLocation(null)}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingPlan && (
        <Modal title={editingPlan.id ? 'Edit plan' : 'New plan'} onClose={() => setEditingPlan(null)}>
          <form onSubmit={savePlan}>
            <div className="field">
              <label htmlFor="plan-name">Name</label>
              <input id="plan-name" value={editingPlan.name ?? ''} onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="plan-meal">Meal</label>
              <select
                id="plan-meal"
                value={editingPlan.meal_type ?? 'lunch'}
                onChange={(e) => setEditingPlan({ ...editingPlan, meal_type: e.target.value as MealType })}
              >
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="both">Lunch + Dinner</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="plan-days">Duration (days)</label>
              <input
                id="plan-days"
                type="number"
                min={1}
                value={editingPlan.duration_days ?? 30}
                onChange={(e) => setEditingPlan({ ...editingPlan, duration_days: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor="plan-price">Price (₹)</label>
              <input
                id="plan-price"
                type="number"
                min={0}
                value={editingPlan.price ?? ''}
                onChange={(e) => setEditingPlan({ ...editingPlan, price: Number(e.target.value) })}
                required
              />
            </div>
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={editingPlan.is_active ?? true}
                  onChange={(e) => setEditingPlan({ ...editingPlan, is_active: e.target.checked })}
                />{' '}
                Active
              </label>
            </div>
            <div className="btn-row">
              <button className="btn primary" type="submit">
                Save plan
              </button>
              <button className="btn" type="button" onClick={() => setEditingPlan(null)}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
