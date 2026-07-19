# Setup Guide (for the owner)

You'll do this once. After it's done, managers just open the website on their phones and sign in.

## 1. Create a free Supabase project

1. Go to [supabase.com](https://supabase.com) → **Start your project** → sign up (free plan is enough).
2. **New project** → pick any name (e.g. `tiffin`), set a strong database password (save it somewhere), choose the region closest to you (e.g. Mumbai), and create.

## 2. Create the database tables

1. In your Supabase project, open **SQL Editor** → **New query**.
2. Open [`supabase/migrations/001_init.sql`](../supabase/migrations/001_init.sql) from this repository, copy **the whole file**, paste it into the editor, and press **Run**.
3. You should see "Success. No rows returned". That's it — tables, security rules, a starter location and plans are created.

## 3. Turn off public sign-ups and add your managers

1. Go to **Authentication → Sign In / Up** and **disable** "Allow new users to sign up". (Only you create accounts.)
2. Go to **Authentication → Users → Add user → Create new user**: enter each manager's email and a password. Share the password with them privately.

## 4. Connect the app to your database

1. In Supabase go to **Settings → API** and copy two values: the **Project URL** and the **anon public** key.
2. In this GitHub repository open `public/config.js` → tap the pencil (Edit) → fill both values:

```js
window.APP_CONFIG = {
  supabaseUrl: 'https://YOURPROJECT.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi…',
};
```

3. Commit the change. (The anon key is designed to be public — the SQL you ran in step 2 blocks all access without a signed-in user.)

## 5. Turn on the website (GitHub Pages)

1. In the GitHub repository go to **Settings → Pages**.
2. Under **Build and deployment → Source** choose **GitHub Actions**.
3. Go to the **Actions** tab — the "Deploy to GitHub Pages" workflow will run on the next push (or press **Run workflow**). When it finishes, your site URL appears in Settings → Pages (like `https://YOURNAME.github.io/REPO/`).
4. Open the site on your phone, sign in with a manager account. Add your locations and adjust plans under **More (⚙️)**.

## 6. Optional: import your old Excel

See [scripts/README.md](../scripts/README.md) — it moves all customers, subscriptions, payments and pending dues from the workbook into the database in one run.

---

## FAQ

**A manager forgot their password.** Supabase Dashboard → Authentication → Users → the user → **Send password recovery** (or set a new one directly).

**How do I add another manager later?** Same as step 3.2 — Add user.

**Backups?** Supabase free plan keeps daily backups for 7 days (Database → Backups). You can also run `Database → Backups → Download` before big changes.

**Is my data private?** Yes. Row Level Security denies everything to anonymous visitors; only signed-in managers can read or write. Never share the `service_role` key (used only for the one-time import).

**Changing the WhatsApp message or the reminder window?** In the app: **More → Reminders & WhatsApp** — set your UPI ID there too, it gets inserted into the messages.
