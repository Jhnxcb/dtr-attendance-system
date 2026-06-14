create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_id text unique not null,
  full_name text not null,
  email text,
  branch_site text,
  registered_photo_url text,
  role text default 'staff',
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  verification_id text unique not null,
  employee_id text not null references public.employees(employee_id),
  employee_name text not null,
  email text,
  attendance_type text not null check (attendance_type in ('TIME IN', 'TIME OUT')),
  attendance_date text not null,
  attendance_time text not null,
  timestamp timestamptz not null,
  latitude numeric(10, 6) not null,
  longitude numeric(10, 6) not null,
  location_address text not null,
  branch_site text not null,
  device_used text not null,
  registered_photo_url text,
  evidence_photo_url text not null,
  verification_photo_url text not null,
  raw_code text,
  created_at timestamptz default now()
);

create index if not exists attendance_records_timestamp_idx on public.attendance_records(timestamp desc);
create index if not exists attendance_records_employee_idx on public.attendance_records(employee_id);
create index if not exists attendance_records_branch_idx on public.attendance_records(branch_site);

alter table public.employees enable row level security;
alter table public.attendance_records enable row level security;

create policy "employees can be read by scanner"
on public.employees for select
using (active = true);

create policy "attendance can be inserted by scanner"
on public.attendance_records for insert
with check (
  evidence_photo_url is not null
  and verification_photo_url is not null
  and latitude is not null
  and longitude is not null
  and verification_id is not null
);

create policy "attendance can be read by dashboard"
on public.attendance_records for select
using (true);

insert into storage.buckets (id, name, public)
values ('attendance-evidence', 'attendance-evidence', true)
on conflict (id) do nothing;

create policy "attendance evidence can be uploaded"
on storage.objects for insert
with check (bucket_id = 'attendance-evidence');

create policy "attendance evidence can be viewed"
on storage.objects for select
using (bucket_id = 'attendance-evidence');
