-- Inflammation-risk wearable: initial schema
-- Target: Supabase (Postgres 15+). Auth handled by Supabase Auth (auth.users).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one-time demographic intake captured at onboarding.
-- Keyed off auth.users.id so Supabase Auth owns email/password.
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  date_of_birth  date        not null,
  gender         smallint    not null check (gender in (0, 1)),                 -- 1=Male, 0=Female (matches dataset)
  race_code      text        not null check (race_code in
                   ('2054-5','2076-8','2106-3','2131-1','2028-9','2186-5')),    -- CDC codes from Legend sheet
  height_cm      real        not null check (height_cm between 100 and 230),
  weight_kg      real        not null check (weight_kg between 30 and 200),
  bmi            real generated always as
                   (weight_kg / ((height_cm / 100.0) * (height_cm / 100.0))) stored,
  consent_at     timestamptz not null,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- devices: paired ESP32(s). A user may re-pair or own >1 device over time.
-- ---------------------------------------------------------------------------
create table public.devices (
  device_id        uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(user_id) on delete cascade,
  mac_address      text unique,
  firmware_version text,
  paired_at        timestamptz not null default now()
);
create index devices_user_idx on public.devices(user_id);

-- ---------------------------------------------------------------------------
-- baselines: resting-baseline captured during onboarding calibration.
-- Used by the dashboard to show "deviation from your normal".
-- ---------------------------------------------------------------------------
create table public.baselines (
  user_id          uuid primary key references public.profiles(user_id) on delete cascade,
  baseline_hr      real,
  baseline_hrv     real,
  baseline_temp    real,
  baseline_eda     real,
  sample_window_s  int  not null,
  captured_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- sensor_windows: one row per aggregation window posted by the ESP32.
-- Default window_seconds = 30; column lets us change later without migration.
-- ---------------------------------------------------------------------------
create table public.sensor_windows (
  window_id        bigserial primary key,
  user_id          uuid not null references public.profiles(user_id) on delete cascade,
  device_id        uuid references public.devices(device_id) on delete set null,
  window_start     timestamptz not null,
  window_end       timestamptz not null,
  window_seconds   smallint    not null default 30,
  heart_rate_bpm   real check (heart_rate_bpm between 30 and 220),
  hrv_ms           real check (hrv_ms between 0 and 300),
  skin_temp_c      real check (skin_temp_c between 30 and 43),
  eda_microsiemens real check (eda_microsiemens between 0 and 100),
  quality_flag     smallint not null default 0,                                -- bitmask: 1=motion,2=poor PPG,4=low ECG,8=temp out-of-range
  ingested_at      timestamptz not null default now(),
  constraint window_order check (window_end > window_start)
);
create index sensor_windows_user_time_idx
  on public.sensor_windows (user_id, window_start desc);

-- ---------------------------------------------------------------------------
-- inferences: ML model output, one per window. model_version lets us
-- re-score historical rows after retraining.
-- ---------------------------------------------------------------------------
create table public.inferences (
  window_id     bigint primary key references public.sensor_windows(window_id) on delete cascade,
  user_id       uuid   not null references public.profiles(user_id) on delete cascade,
  immune_score  real   not null check (immune_score between 0 and 100),
  risk_label    smallint not null check (risk_label in (0, 1)),
  model_version text   not null,
  inferred_at   timestamptz not null default now()
);
create index inferences_user_time_idx
  on public.inferences (user_id, inferred_at desc);

-- ---------------------------------------------------------------------------
-- Dashboard aggregation: hourly rollup. Recomputed on read; cheap at this rate.
-- ---------------------------------------------------------------------------
create view public.user_hourly as
select w.user_id,
       date_trunc('hour', w.window_start) as hour,
       avg(w.heart_rate_bpm)              as hr,
       avg(w.hrv_ms)                      as hrv,
       avg(w.skin_temp_c)                 as temp,
       avg(w.eda_microsiemens)            as eda,
       avg(i.immune_score)                as score,
       max(i.risk_label)                  as any_inflamed,
       count(*)                           as windows
  from public.sensor_windows w
  left join public.inferences i using (window_id)
 group by 1, 2;

-- ---------------------------------------------------------------------------
-- Feature-vector view: maps 1:1 onto the training data columns
-- (Age, Gender, Race, BMI, HR, HRV, SkinTemp, EDA). CytokineLevel is excluded
-- because it is a label/reference variable in the dataset, not a model input.
-- ---------------------------------------------------------------------------
create view public.feature_vectors as
select w.window_id,
       w.user_id,
       w.window_start,
       extract(year from age(p.date_of_birth))::int as age,
       p.gender,
       p.race_code,
       p.bmi,
       w.heart_rate_bpm,
       w.hrv_ms,
       w.skin_temp_c,
       w.eda_microsiemens
  from public.sensor_windows w
  join public.profiles p on p.user_id = w.user_id;

-- ---------------------------------------------------------------------------
-- Row-Level Security: every user sees only their own rows.
-- Service role (used by the inference worker) bypasses RLS automatically.
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.devices        enable row level security;
alter table public.baselines      enable row level security;
alter table public.sensor_windows enable row level security;
alter table public.inferences     enable row level security;

create policy "own profile"        on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own devices"        on public.devices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own baseline"       on public.baselines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own sensor windows" on public.sensor_windows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own inferences"     on public.inferences
  for select using (auth.uid() = user_id);
-- inferences are written by the inference worker via the service role, which bypasses RLS.
