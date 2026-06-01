create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

create table if not exists public.pricing_settings (
  id uuid primary key default gen_random_uuid(),
  kain_pasang_per_meter numeric(12,2) not null default 35,
  kemeja numeric(12,2) not null default 65,
  kurung_pahang numeric(12,2) not null default 95,
  kurung_moden numeric(12,2) not null default 110,
  addon_pocket numeric(12,2) not null default 3,
  addon_extra_size numeric(12,2) not null default 5,
  delivery_charge numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  quotation_no text not null unique,
  project_no text not null unique,
  school_name text not null,
  school_logo text,
  company_logo text,
  pricing jsonb not null,
  rows jsonb not null,
  summary jsonb not null,
  source_file_name text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.share_payment_rows (
  id uuid primary key default gen_random_uuid(),
  share_token text not null,
  row_id text not null,
  nama text not null default '',
  jenis_pakaian text not null default '',
  saiz text not null default '',
  poket boolean not null default false,
  quantity numeric(12,2) not null default 1,
  total_price numeric(12,2) not null default 0,
  paid boolean not null default false,
  slip_name text not null default '',
  slip_data_url text not null default '',
  updated_at timestamptz not null default now(),
  unique (share_token, row_id)
);

alter table public.admin_users enable row level security;
alter table public.pricing_settings enable row level security;
alter table public.projects enable row level security;
alter table public.share_payment_rows enable row level security;

drop policy if exists "Admins can read admin users" on public.admin_users;
create policy "Admins can read admin users"
on public.admin_users for select
to authenticated
using (auth.uid() = id or exists (select 1 from public.admin_users au where au.id = auth.uid()));

drop policy if exists "Admins manage pricing" on public.pricing_settings;
create policy "Admins manage pricing"
on public.pricing_settings for all
to authenticated
using (exists (select 1 from public.admin_users au where au.id = auth.uid()))
with check (exists (select 1 from public.admin_users au where au.id = auth.uid()));

drop policy if exists "Demo admin can read pricing" on public.pricing_settings;
create policy "Demo admin can read pricing"
on public.pricing_settings for select
to anon
using (true);

drop policy if exists "Demo admin can update pricing" on public.pricing_settings;
create policy "Demo admin can update pricing"
on public.pricing_settings for all
to anon
using (true)
with check (true);

drop policy if exists "Admins manage projects" on public.projects;
create policy "Admins manage projects"
on public.projects for all
to authenticated
using (exists (select 1 from public.admin_users au where au.id = auth.uid()))
with check (exists (select 1 from public.admin_users au where au.id = auth.uid()));

drop policy if exists "Demo admin can read projects" on public.projects;
create policy "Demo admin can read projects"
on public.projects for select
to anon
using (true);

drop policy if exists "Demo admin can save projects" on public.projects;
create policy "Demo admin can save projects"
on public.projects for all
to anon
using (true)
with check (true);

drop policy if exists "Anyone with share token can read shared payment rows" on public.share_payment_rows;
create policy "Anyone with share token can read shared payment rows"
on public.share_payment_rows for select
to anon, authenticated
using (true);

drop policy if exists "Anyone with share token can update shared payment rows" on public.share_payment_rows;
create policy "Anyone with share token can update shared payment rows"
on public.share_payment_rows for insert
to anon, authenticated
with check (true);

drop policy if exists "Anyone with share token can modify shared payment rows" on public.share_payment_rows;
create policy "Anyone with share token can modify shared payment rows"
on public.share_payment_rows for update
to anon, authenticated
using (true)
with check (true);

insert into public.pricing_settings (
  kain_pasang_per_meter,
  kemeja,
  kurung_pahang,
  kurung_moden,
  addon_pocket,
  addon_extra_size,
  delivery_charge,
  discount_amount
)
select 35, 65, 95, 110, 3, 5, 0, 0
where not exists (select 1 from public.pricing_settings);
