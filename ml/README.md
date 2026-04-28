# ml/

Documentation for the inflammation-risk model. The actual model artifact and
its feature schema live with the serverless function that uses them, not here:

```
final_project/
├── ml/                                 ← docs (this folder)
│   ├── MODEL_CARD.md                   what v1 is, known issues, retrain triggers
│   └── README.md                       you are here
└── dashboard/api/_model/               ← bundled with the Vercel function
    ├── feature_schema.json             axis order + score mapping the worker reads
    └── model_v1.onnx                   ← drop the EI export here
```

`feature_schema.json` and the model file ship inside the `score-window`
function bundle (configured via `dashboard/vercel.json` → `functions →
includeFiles`). They live with the function so the runtime can load them
without a network round trip and so Vercel's static analysis bundles them
correctly.

## How to drop in a new model

1. Export from Edge Impulse Studio → *Deployment* → **ONNX** (preferred) or
   *TensorFlow Lite* (worker would need a code change).
2. Save the file as `dashboard/api/_model/model_v<N>.onnx`.
3. Edit `dashboard/api/_model/feature_schema.json`:
   - Bump `model_version`.
   - Update `model_file` to the new filename.
   - Update `axes` to match the impulse's Raw Data block, **in the exact order
     EI lists them**. Order matters; the runtime cannot detect a mismatch.
   - If the impulse uses a DSP block with normalization, fill the
     `normalization` field with the mean/std arrays from EI.
4. Update `MODEL_CARD.md` with new known issues / metrics.
5. Write a new ADR superseding 0001 if the runtime decision changes; otherwise
   add a brief follow-up note to ADR 0001.
6. Deploy the dashboard (`npx vercel deploy --prod` from `dashboard/`). The
   next `sensor_windows` insert will be scored by the new model; old rows keep
   their `model_version = "v<N-1>"` until you run a backfill.

## Backfilling historical rows under a new model
Not implemented yet. When needed: a small script reads all `sensor_windows`
joined to the `feature_vectors` view and writes new `inferences` rows with
the new `model_version`. Document any backfill in the ADR.
