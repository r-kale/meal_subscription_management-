-- ============================================================
-- Tiffin Manager — initial schema
-- Run this whole file once in your Supabase project:
--   Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

-- ---------- Enums ----------
create type meal_type as enum ('lunch', 'dinner', 'both');
create type payment_mode as enum ('cash', 'upi', 'other');
create type attendance_status as enum ('present', 'absent');
create type user_role as enum ('owner', 'manager');

-- ---------- Tables ----------
create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role user_role not null default 'manager',
  -- Which location this manager belongs to. Null = all locations.
  -- Informational in v1; per-location RLS policies can be added later
  -- without any app changes.
  location_id uuid references locations (id),
  created_at timestamptz not null default now()
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  meal_type meal_type not null,
  duration_days int not null default 30 check (duration_days > 0),
  price numeric(10,2) not null check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text check (phone ~ '^[0-9]{10}$'),
  location_id uuid not null references locations (id),
  notes text,
  created_at timestamptz not null default now()
);
create index customers_location_idx on customers (location_id);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  location_id uuid not null references locations (id),
  meal_type meal_type not null,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  price numeric(10,2) not null check (price >= 0),
  is_cancelled boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index subscriptions_customer_idx on subscriptions (customer_id);
create index subscriptions_location_idx on subscriptions (location_id);
create index subscriptions_end_idx on subscriptions (end_date);

create table payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions (id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  paid_on date not null default current_date,
  mode payment_mode not null default 'cash',
  note text,
  created_at timestamptz not null default now()
);
create index payments_subscription_idx on payments (subscription_id);
create index payments_paid_on_idx on payments (paid_on);

create table skip_days (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions (id) on delete cascade,
  skip_date date not null,
  note text,
  created_at timestamptz not null default now(),
  unique (subscription_id, skip_date)
);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions (id) on delete cascade,
  att_date date not null,
  meal meal_type not null check (meal in ('lunch', 'dinner')),
  status attendance_status not null,
  marked_by uuid references auth.users (id),
  marked_at timestamptz not null default now(),
  unique (subscription_id, att_date, meal)
);
create index attendance_date_idx on attendance (att_date);

create table app_settings (
  key text primary key,
  value text not null
);

-- ---------- Auto-create a profile row for every new auth user ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Derived view ----------
-- The TypeScript twin of these rules lives in src/lib/domain.ts —
-- keep both in sync.
-- security_invoker makes the base tables' RLS apply through the view.
create view subscription_details
  with (security_invoker = true) as
select
  s.*,
  c.name as customer_name,
  c.phone,
  coalesce(k.skip_count, 0)::int as skip_count,
  (s.end_date + coalesce(k.skip_count, 0))::date as effective_end_date,
  coalesce(p.paid_total, 0)::numeric(10,2) as paid_total,
  (s.price - coalesce(p.paid_total, 0))::numeric(10,2) as due_amount
from subscriptions s
join customers c on c.id = s.customer_id
left join (
  select subscription_id, count(*) as skip_count
  from skip_days group by subscription_id
) k on k.subscription_id = s.id
left join (
  select subscription_id, sum(amount) as paid_total
  from payments group by subscription_id
) p on p.subscription_id = s.id;

-- ---------- Row Level Security ----------
-- v1 model: any signed-in manager has full access; the anon key alone
-- can read/write NOTHING. Public sign-ups must be disabled in
-- Authentication → Providers → Email (see docs/SETUP.md).
alter table locations enable row level security;
alter table profiles enable row level security;
alter table plans enable row level security;
alter table customers enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table skip_days enable row level security;
alter table attendance enable row level security;
alter table app_settings enable row level security;

create policy authenticated_all on locations for all to authenticated using (true) with check (true);
create policy authenticated_all on plans for all to authenticated using (true) with check (true);
create policy authenticated_all on customers for all to authenticated using (true) with check (true);
create policy authenticated_all on subscriptions for all to authenticated using (true) with check (true);
create policy authenticated_all on payments for all to authenticated using (true) with check (true);
create policy authenticated_all on skip_days for all to authenticated using (true) with check (true);
create policy authenticated_all on attendance for all to authenticated using (true) with check (true);
create policy authenticated_all on app_settings for all to authenticated using (true) with check (true);

create policy profiles_read on profiles for select to authenticated using (true);
create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Belt and braces: no anon access at all.
revoke all on all tables in schema public from anon;
revoke all on subscription_details from anon;

-- ---------- Starter data ----------
insert into locations (name) values ('Main Branch');

insert into plans (name, meal_type, duration_days, price) values
  ('Monthly Lunch', 'lunch', 30, 1750),
  ('Monthly Dinner', 'dinner', 30, 1750),
  ('Monthly Lunch + Dinner', 'both', 30, 3500);

insert into app_settings (key, value) values
  ('renewal_template', 'Namaste {name} ji! Aapka {meal} tiffin {end_date} ko khatam ho raha hai. Renew karne ke liye {price} bhejein — UPI: {upi}. Dhanyavaad!'),
  ('dues_template', 'Namaste {name} ji! Aapke tiffin ke {due} baaki hain. UPI: {upi}. Dhanyavaad!'),
  ('upi_id', ''),
  ('expiry_window_days', '5');
