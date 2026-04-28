# ADR 0001 — ML inference worker for inflammation risk scoring

- **Status:** Accepted
- **Date:** 2026-04-28
- **Deciders:** Aishwarya, ML teammate

## Context

The dashboard schema already has an `inferences` table keyed off `window_id`,
with columns `immune_score (0–100)`, `risk_label (0|1)`, and `model_version`.
The dashboard reads from it and renders "—" until a row exists. The architecture
doc has long named "an inference worker that consumes new sensor_windows rows"
as future work; this ADR turns that placeholder into a concrete component.

The team trained a first model in Edge Impulse Studio (project 976527). The
exported impulse uses **4 raw-data axes**: `SkinTemperature`,
`HeartRateVariability`, `ElectrodermalActivity`, and — incorrectly —
`ImmuneActivationScore`. The first three come from the device. The fourth is
a label column from the JHMC dataset (legend: "continuous score of inflammation
likelihood, 0–100") and must not be a model input. See *Decision Drivers* for
the consequences. This ADR captures v1 anyway because the goal here is to
land the worker, the schema, and the wiring; v2 will replace the model file
with no other changes.

## Decision drivers

1. **Class-project deadline.** Prefer the runtime that needs the least new
   infrastructure to deploy and debug.
2. **Free tier acceptable.** No paid services for the worker.
3. **Existing stack.** Project already runs on Vercel (`/api/ingest`) and
   Supabase. New components should reuse them.
4. **Schema is fixed.** `inferences` columns are already shaped for the model's
   outputs — the worker has to fit that contract.
5. **v1 model has known leakage.** It will produce unreliable scores in
   production until v2 lands. The worker must be model-agnostic enough that
   swapping in v2 only requires replacing one file and one schema entry.

## Considered options

### A. Supabase Edge Function (Deno) triggered by database webhook
Closer to the data, no separate deploy. **But:** ONNX runtime in Deno requires
a WASM build (`onnxruntime-web`); model loading from the function bundle is
fiddlier; harder to debug from local logs; team has no prior Deno experience.

### B. Vercel serverless function (Node) called by Supabase webhook ✅
Lives next to `dashboard/api/ingest.ts`. `onnxruntime-node` is the most
documented ONNX runtime, model file ships in the function bundle, env vars and
deploy pipeline are already set up. Cold-start overhead is real but irrelevant
at class-project window cadence (every 30 s).

### C. Python worker polling Supabase
Most ergonomic for the ML teammate (`onnxruntime` + `pandas`). **But:** needs
a host (Vercel cron, GitHub Actions on a schedule, a small VM). More moving
parts than B for the same outcome.

### D. On-device inference (ESP32 + EI C++ SDK)
Lowest latency and offline-capable. **But:** device runs CircuitPython, EI
exports for Arduino/ESP-IDF; demographics live in `profiles`, not on the
device; retrain = re-flash. Considered and rejected for v1; may revisit when
we move to raw-window models.

## Decision

**Option B — Vercel serverless function.**

Path: `dashboard/api/score-window.ts`. Triggered by a Supabase database
webhook on `INSERT INTO public.sensor_windows`. Authenticates via a shared
header secret (`SCORE_WORKER_SECRET`). Reads features from the existing
`public.feature_vectors` view, runs ONNX, writes one row to `public.inferences`.

## Consequences

### Positive
- One deploy pipeline (Vercel) for both ingest and inference.
- Dashboard "—" placeholder fills automatically the first time `inferences`
  gets a row — no UI changes needed.
- Re-scoring v2 over historical windows is a one-time backfill script that
  reads `feature_vectors` and writes `inferences` rows with `model_version =
  'v2'`. No schema migration.

### Negative / risks
- **v1 model has target leakage** (`ImmuneActivationScore` is a model input).
  At inference time the device cannot produce this value — the worker has to
  feed a placeholder. Documented in `ml/feature_schema.json` and
  `ml/MODEL_CARD.md`. Scores from v1 must not be relied on for medical
  judgment; this is acceptable only because v2 is queued.
- Heart rate is **not** an input to v1 even though the device produces it and
  the dataset shows HR carrying strong signal. Will be fixed in v2.
- Cold starts on Vercel can add ~300–800 ms to the first request after idle.
  Acceptable at 30 s window cadence; revisit if we go to faster windows.

### v2 trigger conditions (re-train and ship a new ADR superseding this)
- ML teammate retrains the impulse with `ImmuneActivationScore` and
  `CytokineLevel_pgmL` removed from inputs, and `HeartRate_bpm`, `Age`,
  `Sex` (and ideally `BMI`) added.
- New `.onnx` is dropped at `dashboard/api/_model/model_v2.onnx`.
- `ml/feature_schema.json` updated (`version: "v2"`, new axis order, no
  placeholder needed).
- No code changes in `score-window.ts` beyond reading the schema.

## References

- `docs/architecture.md` — system overview and the "future work" note this
  ADR resolves.
- `supabase/migrations/0001_init.sql` — `inferences` and `feature_vectors`
  definitions.
- Edge Impulse Studio project 976527 (private; teammate-owned).
- JHMC_Dr.Chou.xlsx — training dataset, legend sheet identifies
  `ImmuneActivationScore` and `CytokineLevel_pgmL` as reference variables.
