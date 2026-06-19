create extension if not exists "pgcrypto";

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  address text,
  latitude numeric(10, 6),
  longitude numeric(10, 6),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'employee' check (role in ('admin', 'employee', 'viewer')),
  branch_id uuid references public.branches(id),
  created_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_id text unique not null,
  full_name text not null,
  email text,
  phone text,
  position text,
  department text,
  branch_id uuid references public.branches(id),
  profile_photo_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  role text not null default 'employee' check (role in ('admin', 'employee', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz not null,
  date text not null,
  time text not null,
  employee_id text not null references public.employees(employee_id),
  employee_name text not null,
  email text,
  attendance_type text not null check (attendance_type in ('TIME IN', 'TIME OUT')),
  branch text not null,
  latitude numeric(10, 6) not null,
  longitude numeric(10, 6) not null,
  address text not null,
  device text not null,
  profile_photo_url text,
  original_photo_url text not null,
  verification_photo_url text not null,
  verification_id text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_email_archives (
  id uuid primary key default gen_random_uuid(),
  archive_key text unique not null,
  employee_id text not null references public.employees(employee_id),
  employee_name text not null,
  email text not null,
  month_key text not null,
  month_label text not null,
  record_count integer not null default 0,
  sent_at timestamptz not null default now()
);

create index if not exists attendance_records_timestamp_idx on public.attendance_records(timestamp desc);
create index if not exists attendance_records_employee_idx on public.attendance_records(employee_id);
create index if not exists attendance_records_branch_idx on public.attendance_records(branch);
create index if not exists monthly_email_archives_employee_idx on public.monthly_email_archives(employee_id);
create index if not exists monthly_email_archives_month_idx on public.monthly_email_archives(month_key);

insert into storage.buckets (id, name, public)
values ('attendance-evidence', 'attendance-evidence', true)
on conflict (id) do nothing;

alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.attendance_records enable row level security;
alter table public.audit_logs enable row level security;
alter table public.monthly_email_archives enable row level security;

create or replace function public.current_role()
returns text
language sql
security definer
as $$
  select role from public.profiles where id = auth.uid()
$$;

create policy "authenticated users can read active branches" on public.branches
for select using (active = true);

create policy "admins manage branches" on public.branches
for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

create policy "employees can read employees" on public.employees
for select using (status = 'active');

create policy "admins manage employees" on public.employees
for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

create policy "attendance insert requires evidence" on public.attendance_records
for insert with check (
  latitude is not null
  and longitude is not null
  and original_photo_url is not null
  and verification_photo_url is not null
  and verification_id is not null
);

create policy "attendance readable by authenticated users" on public.attendance_records
for select using (auth.role() = 'authenticated');

create policy "evidence upload by authenticated users" on storage.objects
for insert with check (bucket_id = 'attendance-evidence' and auth.role() = 'authenticated');

create policy "evidence read by authenticated users" on storage.objects
for select using (bucket_id = 'attendance-evidence' and auth.role() = 'authenticated');
