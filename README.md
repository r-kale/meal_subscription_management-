# 🍱 Tiffin Manager — Meal Subscription Management

An open-source, mobile-first web app for tiffin/mess businesses, replacing the monthly Excel sheet. Free to run: the app is a static site on **GitHub Pages** and the data lives in a free **Supabase** project shared live across all your service locations.

## Features

- **Multiple locations** — every manager sees live data for their branch (or all branches)
- **Subscriptions** — monthly Lunch / Dinner / Both plans with From–Till dates and custom pricing
- **Skip days that auto-extend** — mark a leave day and the end date extends by one day automatically (no more "extended till …" notes)
- **Renewal reminders** — dashboard panels for *expiring soon* and *recently expired but not renewed*, each with a one-tap **WhatsApp** button that opens a prefilled renewal message (free `wa.me` links, no API needed)
- **Dues tracking** — partial payments are first-class; every pending balance is visible with a WhatsApp dues reminder
- **Attendance** — tap-list of today's active Lunch/Dinner subscribers per location; skip days shown greyed out
- **Reports** — monthly collection, new subscriptions and active counts per location
- **Excel import** — one-time script that migrates your existing workbook (dedupes customers by phone, parses "pending" notes into dues)
- **Demo mode** — try everything with sample data before connecting a database; data stays in your browser

## Try it

Open the deployed site with `#/login?demo=1` (or tap **Try Demo Mode** on the start screen). Nothing leaves your device in demo mode.

## Setup (one time, ~15 minutes)

Follow **[docs/SETUP.md](docs/SETUP.md)**: create a free Supabase project, run one SQL file, add manager logins, paste two values into `public/config.js`, and enable GitHub Pages. Optional: import your existing Excel with [scripts/README.md](scripts/README.md).

## Stack

Vite + React + TypeScript (no UI framework), Supabase (Postgres + Auth) via a thin adapter layer, HashRouter so it works on GitHub Pages, and a localStorage demo adapter that shares the same pure business rules (`src/lib/domain.ts`).

```
src/lib/       date/money/whatsapp helpers + domain rules (unit-tested)
src/data/      DataAdapter interface + Supabase and Demo implementations
src/pages/     Dashboard · Attendance · Customers · Subscription form · Reports · Settings
supabase/      001_init.sql — full schema, RLS, derived view
scripts/       import-xlsx.mjs — one-time Excel migration
```

## Development

```bash
npm install
npm run dev        # local dev server (demo mode unless config.js is filled)
npm run test:unit  # vitest — domain rules & demo adapter
npm run test:e2e   # playwright — full flows in demo mode
npm run build      # type-check + production build
```

## Roadmap (v2)

QR-code check-in, per-location manager permissions (RLS migration), per-meal skip days, PWA/offline, CSV export, charts.

## License

MIT
