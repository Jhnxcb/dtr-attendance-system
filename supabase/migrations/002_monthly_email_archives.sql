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

create index if not exists monthly_email_archives_employee_idx on public.monthly_email_archives(employee_id);
create index if not exists monthly_email_archives_month_idx on public.monthly_email_archives(month_key);

alter table public.monthly_email_archives enable row level security;
