# ImmuneSense

Wearable inflammation-risk monitor. A small ESP32-class device streams sensor
windows over HTTP to a backend, which writes them into Supabase against
whichever user the dashboard has currently *claimed* the device for. The
dashboard renders status, sensor tiles, a trend chart, and a live readings
table.

The device never holds Supabase credentials and never writes to the database
directly. All ingestion goes through the backend ingest endpoint.

```
final_project/
├── dashboard/                    Vite + React + TS + Tailwind SPA
│   ├── api/                      Vercel serverless functions (the backend)
│   │   ├── ingest.ts             POST sensor window  ──►  sensor_windows
│   │   └── health.ts             GET liveness probe
│   └── src/                      UI: login, onboarding, dashboard, live tab
├── device/
│   ├── sensor_to_backend.py      CircuitPython on the ESP32
│   └── settings.toml.example     Wi-Fi + backend URL + shared secret
├── supabase/
│   └── migrations/
│       ├── 0001_init.sql         profiles, sensor_windows, inferences, ...
│       └── 0002_active_session.sql   per-device active-user table
└── docs/
    └── architecture.md           Diagrams, flows, data shapes
```

## How the pieces talk

```
┌───────────┐     30 s windows     ┌──────────────┐    service-role    ┌──────────────┐
│  ESP32    │ ───────────────────► │   Vercel     │ ─────────────────► │  Supabase    │
│  + sensors│   POST /api/ingest   │ /api/ingest  │  (server-only)     │   Postgres   │
└───────────┘   Bearer <secret>    └──────────────┘                    └──────┬───────┘
                                          │                                   │
                                          │  reads active_session.user_id     │ realtime
                                          │  writes sensor_windows row        │
                                          └───────────────────────────────────┤
                                                                              ▼
                                                                       ┌──────────────┐
                                                                       │  Dashboard   │
                                                                       │  (Vercel)    │
                                                                       │              │
                                                                       │ login,       │
                                                                       │ start/stop,  │
                                                                       │ live + trend │
                                                                       └──────────────┘
```

See [`docs/architecture.md`](docs/architecture.md) for sequence diagrams and
data shapes.

## End-to-end setup

### 1. Apply database migrations

```bash
PGPASSWORD='<db-password>' psql \
  "host=db.<ref>.supabase.co port=5432 user=postgres dbname=postgres sslmode=require" \
  -1 -v ON_ERROR_STOP=1 \
  -f supabase/migrations/0001_init.sql

# then 0002 (only if you didn't apply it earlier)
PGPASSWORD='...' psql ... -1 -v ON_ERROR_STOP=1 \
  -f supabase/migrations/0002_active_session.sql
```

### 2. Configure backend env vars on Vercel

The ingest function uses three env vars that the dashboard SPA must NOT see:

| Var | Where to find it | Notes |
|---|---|---|
| `SUPABASE_URL` | Supabase Studio → *Settings → API* | same as `VITE_SUPABASE_URL`, just no `VITE_` prefix |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Studio → *Settings → API* | server-only, never ship to browser |
| `INGEST_DEVICE_SECRET` | generate with `openssl rand -hex 32` | also goes on the device |

Add each via `vercel env add <name> production` (in `dashboard/`).

### 3. Set up the device

1. Flash CircuitPython on the ESP32, install libraries:
   `adafruit_mlx90614`, `adafruit_max30102`, `adafruit_requests`.
2. Copy `device/settings.toml.example` → `settings.toml` on the CIRCUITPY drive.
3. Fill in Wi-Fi creds, `BACKEND_URL` (your Vercel URL), and `INGEST_SECRET`
   (must match the value you put in Vercel env).
4. Copy `device/sensor_to_backend.py` to `code.py` on the device.
5. Reboot. Watch the serial console for window POSTs.

### 4. Use it

1. Open the dashboard, sign up / sign in, fill out demographics.
2. Click **Start sensing**. The dashboard upserts a row in `active_session`
   for your user.
3. Each 30 s window the device POSTs gets logged for you. Watch the **Live**
   tab to see rows arrive.
4. Click **Stop sensing** when done.

The single device only ever logs for one user at a time. If another logged-in
user clicks **Take over**, their `user_id` replaces yours in `active_session`
and subsequent windows go to them.

## What's intentionally not in this repo yet

- **The ML model.** `inferences` rows are written by an external worker
  (planned). For now the dashboard renders sensor data and shows "—" for
  the inflammation score until that worker is wired up.
- **Per-device secrets.** A single shared secret is fine for one device;
  multi-device setups should move to a `device_secrets` table.

## Local dev

```bash
cd dashboard
npm install
cp .env.example .env.local      # paste your VITE_SUPABASE_ANON_KEY
npm run dev                     # SPA on http://localhost:5173
npx vercel dev                  # SPA + serverless functions locally
```
