-- ============================================================
-- TaxiBook v1 — Supabase Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- USERS TABLE
-- ============================================================
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null unique,
  role        text not null check (role in ('staff', 'coordinator', 'driver')),
  phone       text,
  avatar_url  text,
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- RLS
alter table public.users enable row level security;
create policy "Users can view all users" on public.users for select using (true);
create policy "Users can update own profile" on public.users for update using (auth.uid() = id);

-- ============================================================
-- TAXIS TABLE
-- ============================================================
create table public.taxis (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,           -- 'Taxi 01'
  plate       text,                    -- 'DD 1234 AB'
  driver_id   uuid references public.users(id) on delete set null,
  color        text default '#2563EB',  -- hex color for display
  is_active    boolean default true,
  is_available boolean default true,
  created_at   timestamptz default now()
);

-- RLS
alter table public.taxis enable row level security;
create policy "Everyone can view taxis" on public.taxis for select using (true);
create policy "Coordinator can manage taxis" on public.taxis
  for all using (
    exists (select 1 from public.users where id = auth.uid() and role = 'coordinator')
  );

-- Seed 5 taxis (run after adding drivers)
-- insert into public.taxis (name, plate, color) values
--   ('Taxi 01', 'DD 0001 TB', '#2563EB'),
--   ('Taxi 02', 'DD 0002 TB', '#059669'),
--   ('Taxi 03', 'DD 0003 TB', '#DB2777'),
--   ('Taxi 04', 'DD 0004 TB', '#D97706'),
--   ('Taxi 05', 'DD 0005 TB', '#7C3AED');

-- ============================================================
-- BOOKINGS TABLE
-- ============================================================
create table public.bookings (
  id                uuid primary key default uuid_generate_v4(),
  booking_code      text unique,               -- TXB-2026-001
  passenger_id      uuid not null references public.users(id),
  pickup            text not null,             -- free text
  destination       text not null,             -- free text
  trip_type         text not null check (trip_type in ('DROP', 'WAITING')),
  wait_minutes      int default 0,             -- only for WAITING
  notes             text,
  scheduled_at      timestamptz not null,
  taxi_id           uuid references public.taxis(id) on delete set null,
  status            text not null default 'submitted' check (status in (
                      'submitted',
                      'pending_coordinator_approval',
                      'booked',
                      'on_trip',
                      'waiting_trip',
                      'completed',
                      'rejected',
                      'cancelled'
                    )),
  rejection_reason  text,
  auto_complete_at  timestamptz,               -- system sets this; recalculated on start
  assigned_at       timestamptz,               -- when driver was assigned (auto or manual)
  completed_at      timestamptz,               -- actual completion time
  completed_by      text check (completed_by in ('driver','coordinator','system')),
  created_by        uuid references public.users(id),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- RLS
alter table public.bookings enable row level security;

create policy "Staff can view own bookings" on public.bookings
  for select using (
    passenger_id = auth.uid()
    or exists (select 1 from public.users where id = auth.uid() and role in ('coordinator'))
  );

create policy "Driver can view assigned bookings" on public.bookings
  for select using (
    exists (
      select 1 from public.taxis t
      join public.users u on u.id = auth.uid()
      where t.id = taxi_id and t.driver_id = auth.uid()
    )
    or exists (select 1 from public.users where id = auth.uid() and role = 'coordinator')
  );

create policy "Staff can create bookings" on public.bookings
  for insert with check (auth.uid() = passenger_id);

create policy "Coordinator can update any booking" on public.bookings
  for update using (
    exists (select 1 from public.users where id = auth.uid() and role = 'coordinator')
  );

create policy "Driver can update assigned booking status" on public.bookings
  for update using (
    exists (
      select 1 from public.taxis t
      where t.id = taxi_id and t.driver_id = auth.uid()
    )
  );

-- Auto-generate booking code
create or replace function generate_booking_code()
returns trigger as $$
declare
  yr    text;
  seq   int;
  code  text;
begin
  yr  := to_char(now(), 'YYYY');
  select count(*) + 1 into seq
  from public.bookings
  where extract(year from created_at) = extract(year from now());
  code := 'TXB-' || yr || '-' || lpad(seq::text, 4, '0');
  new.booking_code := code;
  return new;
end;
$$ language plpgsql;

create trigger set_booking_code
  before insert on public.bookings
  for each row execute function generate_booking_code();

-- Auto-set auto_complete_at (only when not already provided by application code)
create or replace function set_auto_complete_at()
returns trigger as $$
begin
  if new.auto_complete_at is null then
    if new.trip_type = 'DROP' then
      new.auto_complete_at := new.scheduled_at + interval '2 hours';
    elsif new.trip_type = 'WAITING' then
      new.auto_complete_at := new.scheduled_at
        + (new.wait_minutes || ' minutes')::interval
        + interval '2 hours';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger set_auto_complete
  before insert on public.bookings
  for each row execute function set_auto_complete_at();

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger bookings_updated_at
  before update on public.bookings
  for each row execute function update_updated_at();

create trigger users_updated_at
  before update on public.users
  for each row execute function update_updated_at();

-- ============================================================
-- PUSH SUBSCRIPTIONS TABLE
-- ============================================================
create table public.push_subscriptions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz default now(),
  unique(user_id, endpoint)
);

-- RLS
alter table public.push_subscriptions enable row level security;
create policy "Users manage own subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id);

-- ============================================================
-- NOTIFICATIONS TABLE (log all notifications sent)
-- ============================================================
create table public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  booking_id  uuid references public.bookings(id) on delete cascade,
  title       text not null,
  body        text not null,
  type        text not null,
  is_read     boolean default false,
  sent_at     timestamptz default now()
);

-- RLS
alter table public.notifications enable row level security;
create policy "Users view own notifications" on public.notifications
  for select using (auth.uid() = user_id);
create policy "Users mark own notifications read" on public.notifications
  for update using (auth.uid() = user_id);

-- ============================================================
-- REALTIME — enable for live updates
-- ============================================================
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.taxis;

-- ============================================================
-- VIEWS
-- ============================================================

-- Booking detail view (joins passenger + taxi + driver)
create or replace view public.booking_details as
select
  b.*,
  p.name        as passenger_name,
  p.email       as passenger_email,
  p.phone       as passenger_phone,
  t.name        as taxi_name,
  t.plate       as taxi_plate,
  t.color       as taxi_color,
  d.name        as driver_name,
  d.phone       as driver_phone
from public.bookings b
left join public.users p  on p.id = b.passenger_id
left join public.taxis t  on t.id = b.taxi_id
left join public.users d  on d.id = t.driver_id;

-- Taxi availability view
create or replace view public.taxi_availability as
select
  t.id,
  t.name,
  t.plate,
  t.color,
  t.driver_id,
  d.name        as driver_name,
  d.phone       as driver_phone,
  b.id          as active_booking_id,
  b.destination as active_destination,
  b.status      as active_status,
  b.auto_complete_at,
  case
    when b.id is null then 'available'
    else 'on_trip'
  end           as availability
from public.taxis t
left join public.users d on d.id = t.driver_id
left join public.bookings b on b.taxi_id = t.id
  and b.status in ('booked', 'on_trip', 'waiting_trip')
  and b.auto_complete_at > now()
where t.is_active = true;

-- ============================================================
-- MIGRATION: map / location columns
-- Run this in Supabase SQL Editor after the initial schema
-- ============================================================

-- Driver real-time GPS on taxis table
alter table public.taxis add column if not exists latitude             float8;
alter table public.taxis add column if not exists longitude            float8;
alter table public.taxis add column if not exists location_updated_at  timestamptz;

-- Allow drivers to update their own taxi's location
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'taxis' and policyname = 'Driver can update own taxi location'
  ) then
    execute $p$
      create policy "Driver can update own taxi location" on public.taxis
        for update using (driver_id = auth.uid())
    $p$;
  end if;
end;
$$;

-- Pre-geocoded coordinates stored on bookings (populated async after creation)
alter table public.bookings add column if not exists pickup_lat       float8;
alter table public.bookings add column if not exists pickup_lng       float8;
alter table public.bookings add column if not exists destination_lat  float8;
alter table public.bookings add column if not exists destination_lng  float8;

-- Recreate booking_details so b.* expands to include the new coordinate columns
-- (PostgreSQL expands * at view-creation time, so the original view omits these columns)
-- Must drop first — CREATE OR REPLACE cannot change existing column positions
drop view if exists public.booking_details;
create view public.booking_details as
select
  b.*,
  p.name        as passenger_name,
  p.email       as passenger_email,
  p.phone       as passenger_phone,
  t.name        as taxi_name,
  t.plate       as taxi_plate,
  t.color       as taxi_color,
  d.name        as driver_name,
  d.phone       as driver_phone
from public.bookings b
left join public.users p  on p.id = b.passenger_id
left join public.taxis t  on t.id = b.taxi_id
left join public.users d  on d.id = t.driver_id;

-- ============================================================
-- REGISTERED LOCATIONS TABLE
-- Named places (offices, gates, etc.) pinned by coordinators
-- ============================================================
create table if not exists public.registered_locations (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  address    text,
  lat        float8 not null,
  lng        float8 not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.registered_locations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'registered_locations'
    and policyname = 'Authenticated users can view registered locations'
  ) then
    execute $p$
      create policy "Authenticated users can view registered locations" on public.registered_locations
        for select using (auth.uid() is not null)
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'registered_locations'
    and policyname = 'Coordinator can manage registered locations'
  ) then
    execute $p$
      create policy "Coordinator can manage registered locations" on public.registered_locations
        for all using (
          exists (select 1 from public.users where id = auth.uid() and role = 'coordinator')
        )
    $p$;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'registered_locations_updated_at'
  ) then
    execute $p$
      create trigger registered_locations_updated_at
        before update on public.registered_locations
        for each row execute function update_updated_at()
    $p$;
  end if;
end;
$$;

-- ============================================================
-- MIGRATION: taxis is_available + notification reminder types
-- Run these in Supabase SQL Editor on existing databases
-- ============================================================

-- Add is_available column to taxis if it doesn't already exist
alter table public.taxis add column if not exists is_available boolean default true;

-- Remove the strict type check constraint from notifications.
-- The type values are enforced by application code; the constraint
-- causes failures when new notification types are added over time.
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.notifications'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%booking_confirmed%';
  if cname is not null then
    execute format('alter table public.notifications drop constraint %I', cname);
  end if;
end;
$$;

-- ============================================================
-- MIGRATION: prevent driver double-booking at the DB level
-- Run these two statements in Supabase SQL Editor
-- ============================================================

-- 1. Fix trigger: only apply 2h fallback when app did not provide auto_complete_at
create or replace function set_auto_complete_at()
returns trigger as $$
begin
  if new.auto_complete_at is null then
    if new.trip_type = 'DROP' then
      new.auto_complete_at := new.scheduled_at + interval '2 hours';
    elsif new.trip_type = 'WAITING' then
      new.auto_complete_at := new.scheduled_at
        + (new.wait_minutes || ' minutes')::interval
        + interval '2 hours';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

-- 2. Exclusion constraint: two bookings for the same taxi cannot have overlapping
--    time windows while in an active status.
--    Requires btree_gist for the mixed = / && operators in a GIST index.
create extension if not exists btree_gist;

alter table public.bookings
  drop constraint if exists no_driver_overlap;

alter table public.bookings
  add constraint no_driver_overlap
  exclude using gist (
    taxi_id   with =,
    tstzrange(scheduled_at, auto_complete_at) with &&
  )
  where (taxi_id is not null and status in ('booked', 'on_trip', 'waiting_trip'));

-- ============================================================
-- FEEDBACK TABLE
-- General app feedback (voice of customer), not tied to a trip
-- ============================================================
create table if not exists public.feedback (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references public.users(id) on delete set null,
  category    text not null default 'general' check (category in ('bug', 'suggestion', 'complaint', 'general')),
  message     text not null,
  created_at  timestamptz default now()
);

alter table public.feedback enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'feedback'
    and policyname = 'Users can submit feedback'
  ) then
    execute $p$
      create policy "Users can submit feedback" on public.feedback
        for insert with check (auth.uid() = user_id)
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'feedback'
    and policyname = 'Users view own feedback'
  ) then
    execute $p$
      create policy "Users view own feedback" on public.feedback
        for select using (auth.uid() = user_id)
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'feedback'
    and policyname = 'Coordinator can view all feedback'
  ) then
    execute $p$
      create policy "Coordinator can view all feedback" on public.feedback
        for select using (
          exists (select 1 from public.users where id = auth.uid() and role = 'coordinator')
        )
    $p$;
  end if;
end;
$$;