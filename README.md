# ImmuneSense

Sternum-mounted wearable patch for early awareness of immune activation. A
small ESP32-class device streams four physiological channels — ECG-derived
heart rate and HRV, skin temperature, and electrodermal activity (EDA) —
over HTTP to a backend every 30 seconds. The backend writes each window into
Supabase against whichever user the dashboard has currently claimed the device
for. An ML inference worker scores each window against a model trained on the
JHMC dataset and returns a 0–100 inflammation risk score to a live dashboard.

The device never holds Supabase credentials and never writes to the database
directly. All ingestion goes through the backend ingest endpoint.

    final_project/
    ├── dashboard/                    Vite + React + TS + Tailwind SPA
    │   ├── api/                      Vercel serverless functions (the backend)
    │   │   ├── ingest.ts             POST sensor window  ──►  sensor_windows
    │   │   ├── score-window.ts       Supabase webhook  ──►  inferences (ML worker)
    │   │   ├── _model/               Bundled with score-window: feature_schema + .onnx
    │   │   └── health.ts             GET liveness probe
    │   └── src/                      UI: login, onboarding, dashboard, live tab
    ├── device/
    │   ├── sensor_to_backend.py      CircuitPython on the ESP32
    │   └── settings.toml.example     Wi-Fi + backend URL + shared secret
    ├── ml/                           Model training scripts, model card, retrain instructions
    │   ├── MODEL_CARD.md             Known limitations of v1, triggers for v2
    │   ├── scripts/
    │   │   ├── prepare_ei_data.py    Prepares JHMC data for Edge Impulse upload
    │   │   ├── train_svm.py          SVM classifier (proposed in design, section 2.3)
    │   │   ├── train_extratrees.py   ExtraTrees classifier (proposed in design, section 2.3)
    │   │   └── train_kmeans.py       K-means unsupervised clustering (proposed in design, section 2.3)
    │   └── training_data/
    │       └── columns.json          Column definitions for JHMC training data
    ├── supabase/
    │   └── migrations/
    │       ├── 0001_init.sql         profiles, sensor_windows, inferences, feature_vectors view, ...
    │       └── 0002_active_session.sql   per-device active-user table
    └── docs/
        ├── architecture.md           Diagrams, flows, data shapes
        └── adr/                      Architecture Decision Records
            └── 0001-ml-inference-worker.md

## How the pieces talk

    +───────────+     30 s windows     +──────────────+    service-role    +──────────────+
    │  ESP32    │ ───────────────────► │   Vercel     │ ─────────────────► │  Supabase    │
    │  + sensors│   POST /api/ingest   │ /api/ingest  │  (server-only)     │   Postgres   │
    +───────────+   Bearer <secret>    +──────────────+                    +──────+───────+
                                                                                  │
                                                                                  │ Database webhook
                                                                                  │ fires on INSERT
                                                                                  ▼
                                                                           +──────────────+
                                                                           │   Vercel     │
                                                                           │/api/score-   │
                                                                           │  window      │
                                                                           │  (ML worker) │
                                                                           +──────+───────+
                                                                                  │
                                                                                  │ writes inferences
                                                                                  ▼
                                                                           +──────────────+
                                                                           │  Dashboard   │
                                                                           │  (Vercel)    │
                                                                           │              │
                                                                           │ login,       │
                                                                           │ start/stop,  │
                                                                           │ live + trend │
                                                                           +──────────────+

See [docs/architecture.md](docs/architecture.md) for sequence diagrams and data shapes.

## Known model limitations (v1)

**Read [ml/MODEL_CARD.md](ml/MODEL_CARD.md) before interpreting any risk scores.**

v1 has four known issues that mean scores should not be used as evidence of patient state:

1. **Target leakage** — `ImmuneActivationScore` is a label column in the JHMC dataset, not a feature. v1 was trained with it as an input. At inference time the worker feeds a constant placeholder. Scores are biased toward whichever class that placeholder favors.
2. **Heart rate missing** — `heart_rate_bpm` is the strongest signal in the dataset (mean 80 vs 115 bpm between classes) but is not a v1 model input. The firmware derives BPM from ECG R-peaks; v2 will include it.
3. **Demographics dropped** — age, gender, BMI, and race are available in the `feature_vectors` view but not used as v1 inputs. v2 will re-include them.
4. **No held-out evaluation** — reporting accuracy on a leaked model would be misleading. v2 will ship with a patient-grouped holdout AUC and confusion matrix.

v1 exists only to exercise the end-to-end pipeline. v2 will replace `dashboard/api/_model/model_v1.onnx` and `feature_schema.json` with no other code changes required.

## End-to-end setup

### 1. Apply database migrations

    PGPASSWORD='<db-password>' psql \
      "host=db.<ref>.supabase.co port=5432 user=postgres dbname=postgres sslmode=require" \
      -1 -v ON_ERROR_STOP=1 \
      -f supabase/migrations/0001_init.sql

    # then 0002
    PGPASSWORD='...' psql ... -1 -v ON_ERROR_STOP=1 \
      -f supabase/migrations/0002_active_session.sql

### 2. Configure backend env vars on Vercel

The ingest function uses env vars that the dashboard SPA must NOT see:

| Var | Where to find it | Notes |
|---|---|---|
| `SUPABASE_URL` | Supabase Studio → Settings → API | same as `VITE_SUPABASE_URL`, no `VITE_` prefix |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Studio → Settings → API | server-only, never ship to browser |
| `INGEST_DEVICE_SECRET` | generate with `openssl rand -hex 32` | also goes on the device |
| `SCORE_WORKER_SECRET` | generate with `openssl rand -hex 32` | also goes in the Supabase webhook header (see step 2b) |

Add each via `vercel env add <name> production` (in `dashboard/`).

### 2b. Wire the ML inference worker

The ML worker is `dashboard/api/score-window.ts`. It runs whenever a new
`sensor_windows` row is inserted, scores it with the bundled ONNX model, and
writes one row to `inferences`. See `docs/adr/0001-ml-inference-worker.md`
for the rationale and `ml/MODEL_CARD.md` for the model itself.

1. Drop the model export at `dashboard/api/_model/model_v1.onnx` (export from Edge Impulse Studio → Deployment → ONNX). See `ml/README.md` for details.
2. Confirm `dashboard/api/_model/feature_schema.json` matches the impulse's Raw Data block axis order.
3. In Supabase Studio → Database → Webhooks, create a webhook:
   - **Name:** `score_window_on_insert`
   - **Table:** `public.sensor_windows`
   - **Events:** INSERT only
   - **Method:** POST
   - **URL:** `https://<your-vercel-url>/api/score-window`
   - **HTTP Headers:** `Content-Type: application/json` and `x-score-worker-secret: <value of SCORE_WORKER_SECRET>`
4. Deploy: `npx vercel deploy --prod` from `dashboard/`. The next window the device posts will get scored within ~1 s and the dashboard score tile will flip from "—" to a number.

> **Note:** Without this webhook, `score-window.ts` is never called and every window will show "—" for its risk score on the dashboard. The code is correct; the webhook is the trigger.

### 3. Set up the device

1. Flash CircuitPython on the ESP32, install libraries: `adafruit_adt7410`, `adafruit_requests`.
2. Copy `device/settings.toml.example` → `settings.toml` on the CIRCUITPY drive.
3. Fill in Wi-Fi creds, `BACKEND_URL` (your Vercel URL), and `INGEST_SECRET` (must match the value you put in Vercel env).
4. Copy `device/sensor_to_backend.py` to `code.py` on the device.
5. Reboot. Watch the serial console — a line will print every 30 seconds showing temp, BPM, HRV, EDA, and quality flag, followed by "Window posted successfully".

**Sensors used in the final prototype:**
- AD8232 — ECG, from which BPM and HRV are derived via R-peak detection
- ADT7410 — skin temperature (I2C)
- Grove GSR — electrodermal activity (EDA)

The MAX30102 PPG sensor is no longer used. BPM and HRV are derived directly
from the AD8232 ECG signal, making the optical PPG sensor redundant. This
matches the future-work direction described in the paper (section 11).

**quality_flag bitmask** written by the firmware and stored in `sensor_windows`:

| Bit | Value | Meaning |
|-----|-------|---------|
| 0 | 1 | All sensors present and in range (good signal) |
| 1 | 1 | Motion detected |
| 2 | 2 | Poor PPG signal |
| 3 | 4 | Low ECG signal quality |
| 4 | 8 | Temperature out of expected range |

A `quality_flag` of `0` means incomplete sensor data — one or more required channels returned null. The dashboard surfaces this as a warning on the status card and as a "Signal" column in the Live tab.

### 4. Use it

1. Open the dashboard, sign up / sign in, fill out demographics on the onboarding screen. This establishes your profile and is required before any windows can be stored for you.
2. Click **Start sensing**. The dashboard upserts a row in `active_session` for your user.
3. Each 30 s window the device POSTs gets logged for you. Watch the **Live** tab to see rows arrive. The **Signal** column shows whether each window had good sensor contact.
4. The **Overview** tab shows your current inflammation status, confidence level, and whether your personal baseline has been established.
5. Click **Stop sensing** when done.

The single device only ever logs for one user at a time. If another logged-in user clicks **Take over**, their `user_id` replaces yours in `active_session` and subsequent windows go to them.

## What's intentionally not in this repo yet

- **A trustworthy ML model.** v1 (in `dashboard/api/_model/`) has known target leakage — see `ml/MODEL_CARD.md` and `docs/adr/0001-...md`. It exists to exercise the worker plumbing end-to-end. v2 will replace the `.onnx` file and `feature_schema.json` with no other code changes.
- **Personalized baseline onboarding.** The schema and dashboard support baseline profiles but multi-day wear data was not collected in the prototype evaluation. The dashboard falls back to the JHMC population reference until a personal baseline is established.
- **Per-device secrets.** A single shared secret is fine for one device; multi-device setups should move to a `device_secrets` table.

## Local dev

    cd dashboard
    npm install
    cp .env.example .env.local      # paste your VITE_SUPABASE_ANON_KEY
    npm run dev                     # SPA on http://localhost:5173
    npx vercel dev                  # SPA + serverless functions locally
