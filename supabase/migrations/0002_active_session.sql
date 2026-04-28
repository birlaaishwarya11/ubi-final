-- Active sensing session: tracks which user the (single) device is currently
-- streaming for. The backend ingest endpoint reads this to decide whose
-- sensor_windows row to write.
--
-- Single-device assumption: at most one row per device_id at a time. The
-- dashboard's "Start sensing" button upserts a row; "Stop sensing" deletes it.

create table public.active_session (
  device_id    text        primary key,
  user_id      uuid        not null references public.profiles(user_id) on delete cascade,
  started_at   timestamptz not null default now(),
  last_seen_at timestamptz                                                       -- updated by ingest endpoint
);

alter table public.active_session enable row level security;

-- Anyone signed in can read the active session (dashboard shows status).
create policy "read active session" on public.active_session
  for select to authenticated using (true);

-- Anyone signed in can claim or take over the device for themselves.
-- (Single-device class project; one user at a time. Takeover is intentional.)
create policy "claim device" on public.active_session
  for insert to authenticated with check (auth.uid() = user_id);

create policy "takeover device" on public.active_session
  for update to authenticated
  using (true)
  with check (auth.uid() = user_id);

-- Only the holder can release the session via the dashboard.
create policy "release device" on public.active_session
  for delete to authenticated using (auth.uid() = user_id);
