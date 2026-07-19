#!/usr/bin/env node
// One-time import of the legacy Excel workbook into Supabase.
//
// Usage:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/import-xlsx.mjs monthly_meals.xlsx --location "Main Branch" --dry-run
//
// Then re-run with --commit instead of --dry-run to insert.
//
// SECURITY: the service-role key bypasses Row Level Security. Use it only
// here, on your own machine. NEVER put it in public/config.js or anywhere
// in the frontend.
//
// What it does per sheet row (No | Date | Name | From | Till | PAID | Contact | Meal | Notes):
//   - customers deduped by 10-digit phone (fallback: normalized name)
//   - one subscription per row (duplicate rows = multiple tiffins, kept as-is)
//   - PAID amount becomes one payment dated with the row's Date column
//   - "paid X ... Y pending" notes override the payment amount so dues survive
//   - meal labels normalized (lunch / dinner / both; "tiffin" → both)
//   - anything unparseable is preserved in subscription notes

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const commit = args.includes('--commit')
const locationName = args[args.indexOf('--location') + 1] && args.includes('--location')
  ? args[args.indexOf('--location') + 1]
  : 'Main Branch'

if (!file) {
  console.error('Usage: node scripts/import-xlsx.mjs <workbook.xlsx> [--location "Name"] [--dry-run|--commit]')
  process.exit(1)
}

function toISO(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') {
    // Excel serial date (1900 epoch)
    const d = new Date(Math.round((value - 25569) * 86400 * 1000))
    return d.toISOString().slice(0, 10)
  }
  const s = String(value).trim()
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const iso = s.match(/^\d{4}-\d{2}-\d{2}/)
  if (iso) return s.slice(0, 10)
  return null
}

function normalizeMeal(raw) {
  const s = String(raw ?? '').toLowerCase()
  const lunch = s.includes('lunch')
  const dinner = s.includes('dinner')
  if (lunch && dinner) return { meal: 'both', note: null }
  if (lunch) return { meal: 'lunch', note: null }
  if (dinner) return { meal: 'dinner', note: null }
  if (s.includes('tiffin')) return { meal: 'both', note: null }
  return { meal: 'both', note: raw ? `meal label was "${raw}"` : 'meal label missing' }
}

function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return digits.length === 10 ? digits : null
}

function normalizeName(name) {
  return String(name).trim().toLowerCase().replace(/\s+/g, ' ')
}

// ── Parse workbook ──────────────────────────────────────────────
const wb = XLSX.read(readFileSync(file))
const rows = []
for (const sheetName of wb.SheetNames) {
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true })
  // Find the header row (contains "Name") — some sheets have leading blank rows/columns.
  const headerIdx = grid.findIndex((r) => r.some((c) => String(c ?? '').trim().toLowerCase().startsWith('name')))
  if (headerIdx === -1) continue
  const header = grid[headerIdx].map((c) => String(c ?? '').trim().toLowerCase())
  const col = (label) => header.findIndex((h) => h.startsWith(label))
  const cName = col('name'), cDate = col('date'), cFrom = col('from'), cTill = col('till'), cPaid = col('paid'), cContact = col('contact')
  for (const r of grid.slice(headerIdx + 1)) {
    const name = String(r[cName] ?? '').trim()
    if (!name) continue
    const from = toISO(r[cFrom])
    const till = toISO(r[cTill])
    if (!from || !till) continue
    // Meal type + notes live in unnamed columns right of Contact.
    const extras = r.slice(cContact + 1).map((c) => String(c ?? '').trim()).filter(Boolean)
    const mealRaw = extras[0] ?? ''
    const noteRaw = extras.slice(1).join('; ')
    rows.push({
      sheet: sheetName,
      name,
      signupDate: toISO(r[cDate]) ?? from,
      from,
      till: till >= from ? till : from, // a couple of rows have till < from typos
      paid: Number(r[cPaid]) || 0,
      phone: normalizePhone(r[cContact]),
      mealRaw,
      noteRaw,
    })
  }
}

// ── Transform ───────────────────────────────────────────────────
const customersByKey = new Map()
const subscriptions = []
const warnings = []

for (const row of rows) {
  const key = row.phone ?? `name:${normalizeName(row.name)}`
  if (!customersByKey.has(key)) {
    customersByKey.set(key, { name: row.name.trim(), phone: row.phone, notes: null })
  }

  const { meal, note: mealNote } = normalizeMeal(row.mealRaw)
  const notes = []
  if (mealNote) notes.push(mealNote)

  // Payment amount: default full PAID; "paid X ... Y pending" overrides.
  let paymentAmount = row.paid
  let price = row.paid
  const partial = (row.mealRaw + ' ' + row.noteRaw).match(/paid\s*(\d+).*?(\d+)\s*pend/i) ??
    (row.noteRaw.match(/pend(?:ing)?\s*(\d+)/i) ? [null, String(row.paid), row.noteRaw.match(/pend(?:ing)?\s*(\d+)/i)[1]] : null)
  if (partial) {
    paymentAmount = Number(partial[1])
    price = Number(partial[1]) + Number(partial[2])
    notes.push(`imported: paid ${partial[1]}, ${partial[2]} pending`)
  }
  if (row.noteRaw && !partial) notes.push(row.noteRaw)

  subscriptions.push({
    customerKey: key,
    sheet: row.sheet,
    meal_type: meal,
    start_date: row.from,
    end_date: row.till,
    price,
    paymentAmount,
    paymentDate: row.signupDate,
    notes: notes.length ? notes.join('; ') : null,
  })
}

// Drop duplicate subscription periods that appear on consecutive monthly
// sheets (the same subscription copied forward, not a new one). Duplicates
// on the SAME sheet are kept — that's a bulk customer taking multiple
// tiffins for the same period.
const firstSheetByKey = new Map()
const deduped = []
for (const s of subscriptions) {
  const k = `${s.customerKey}|${s.start_date}|${s.end_date}|${s.meal_type}`
  const firstSheet = firstSheetByKey.get(k)
  if (firstSheet !== undefined && firstSheet !== s.sheet) {
    warnings.push(`skipped duplicate period for ${s.customerKey} (${s.start_date} → ${s.end_date}, sheet ${s.sheet})`)
    continue
  }
  firstSheetByKey.set(k, s.sheet)
  deduped.push(s)
}

console.log(`Sheets parsed:        ${wb.SheetNames.join(', ')}`)
console.log(`Rows read:            ${rows.length}`)
console.log(`Unique customers:     ${customersByKey.size}`)
console.log(`Subscriptions to add: ${deduped.length} (${subscriptions.length - deduped.length} cross-sheet duplicates skipped)`)
console.log(`With pending dues:    ${deduped.filter((s) => s.paymentAmount < s.price).length}`)
if (warnings.length) {
  console.log('\nNotes:')
  for (const w of warnings.slice(0, 20)) console.log(`  - ${w}`)
  if (warnings.length > 20) console.log(`  … and ${warnings.length - 20} more`)
}

// ── Emit SQL mode ───────────────────────────────────────────────
// Writes a single SQL file to paste into the Supabase SQL Editor —
// for when running Node against the database isn't convenient.
// The output contains customer phone numbers: do NOT commit it.
if (args.includes('--emit-sql')) {
  const outPath = args[args.indexOf('--emit-sql') + 1]
  if (!outPath || outPath.startsWith('--')) {
    console.error('Usage: --emit-sql <output.sql>')
    process.exit(1)
  }
  const q = (v) => (v == null ? 'null' : `'${String(v).replaceAll("'", "''")}'`)
  const lines = []
  lines.push('-- Generated by scripts/import-xlsx.mjs --emit-sql')
  lines.push('-- Paste the whole file into the Supabase SQL Editor and Run ONCE.')
  lines.push('-- Contains personal data (phone numbers): do not commit this file.')
  lines.push('do $$')
  lines.push('declare')
  lines.push('  loc_id uuid;')
  lines.push('  cust_id uuid;')
  lines.push('  sub_id uuid;')
  lines.push('begin')
  lines.push(`  if exists (select 1 from payments where note = 'imported from Excel') then`)
  lines.push(`    raise exception 'Import has already been run — aborting to avoid duplicates';`)
  lines.push('  end if;')
  lines.push('')
  lines.push(`  select id into loc_id from locations where name = ${q(locationName)};`)
  lines.push('  if loc_id is null then')
  lines.push(`    insert into locations (name) values (${q(locationName)}) returning id into loc_id;`)
  lines.push('  end if;')
  for (const [key, c] of customersByKey) {
    lines.push('')
    lines.push(`  -- ${c.name}`)
    lines.push(
      `  insert into customers (name, phone, location_id) values (${q(c.name)}, ${q(c.phone)}, loc_id) returning id into cust_id;`,
    )
    for (const s of deduped.filter((x) => x.customerKey === key)) {
      lines.push(
        `  insert into subscriptions (customer_id, location_id, meal_type, start_date, end_date, price, notes) ` +
          `values (cust_id, loc_id, ${q(s.meal_type)}, ${q(s.start_date)}, ${q(s.end_date)}, ${s.price}, ${q(s.notes)}) returning id into sub_id;`,
      )
      if (s.paymentAmount > 0) {
        lines.push(
          `  insert into payments (subscription_id, amount, paid_on, mode, note) ` +
            `values (sub_id, ${s.paymentAmount}, ${q(s.paymentDate)}, 'other', 'imported from Excel');`,
        )
      }
    }
  }
  lines.push('end $$;')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(outPath, lines.join('\n') + '\n')
  console.log(`\nSQL written to ${outPath} — paste it into the Supabase SQL Editor and Run.`)
  process.exit(0)
}

if (!commit) {
  console.log('\nDry run only — re-run with --commit to insert into Supabase.')
  process.exit(0)
}

// ── Insert ──────────────────────────────────────────────────────
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables first.')
  process.exit(1)
}
const db = createClient(url, key)

const { data: loc, error: locErr } = await db
  .from('locations')
  .upsert({ name: locationName }, { onConflict: 'name' })
  .select()
  .single()
if (locErr) throw new Error(locErr.message)
console.log(`\nImporting into location "${loc.name}" (${loc.id})…`)

const idByKey = new Map()
for (const [k, c] of customersByKey) {
  const { data, error } = await db
    .from('customers')
    .insert({ name: c.name, phone: c.phone, location_id: loc.id, notes: c.notes })
    .select('id')
    .single()
  if (error) throw new Error(`customer ${c.name}: ${error.message}`)
  idByKey.set(k, data.id)
}
console.log(`Inserted ${idByKey.size} customers.`)

let subCount = 0
for (const s of deduped) {
  const { data: sub, error } = await db
    .from('subscriptions')
    .insert({
      customer_id: idByKey.get(s.customerKey),
      location_id: loc.id,
      meal_type: s.meal_type,
      start_date: s.start_date,
      end_date: s.end_date,
      price: s.price,
      notes: s.notes,
    })
    .select('id')
    .single()
  if (error) throw new Error(`subscription for ${s.customerKey}: ${error.message}`)
  if (s.paymentAmount > 0) {
    const { error: payErr } = await db.from('payments').insert({
      subscription_id: sub.id,
      amount: s.paymentAmount,
      paid_on: s.paymentDate,
      mode: 'other',
      note: 'imported from Excel',
    })
    if (payErr) throw new Error(`payment for ${s.customerKey}: ${payErr.message}`)
  }
  subCount++
}
console.log(`Inserted ${subCount} subscriptions. Done ✅`)
