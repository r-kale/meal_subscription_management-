# One-time Excel import

Moves your existing workbook (monthly sheets with `No | Date | Name | From | Till | PAID | Contact` columns) into Supabase.

What it does:

- **Customers** deduplicated by 10-digit phone number (same person on June and July sheets becomes one customer)
- **One subscription per row**; identical rows on the *same* sheet are kept (bulk customers with multiple tiffins), identical periods repeated on *later* sheets are skipped
- The **PAID** amount becomes a payment; notes like `paid 200 1550 pending` are parsed so the pending amount shows up as dues
- Meal labels are normalized (`Lunch/dinner` → both, `tiffin` → both); anything unclear is kept in the subscription notes

## Run it

Requires [Node.js](https://nodejs.org) 18+ on your computer, and `npm install` run once in the repository folder.

1. In Supabase: **Settings → API** → copy the **service_role** key (⚠️ keep it secret — it bypasses all security; never put it in `public/config.js`).

2. Preview without writing anything:

```bash
node scripts/import-xlsx.mjs monthly_meals.xlsx --location "Main Branch" --dry-run
```

3. Check the summary (customers, subscriptions, dues). Then insert for real:

```bash
SUPABASE_URL=https://YOURPROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
node scripts/import-xlsx.mjs monthly_meals.xlsx --location "Main Branch" --commit
```

Use `--location` to name the branch these records belong to (created if it doesn't exist). If you run separate workbooks per location, run the script once per file with different `--location` names.

Run it only once per workbook — running `--commit` twice inserts everything twice.
