# Model card — ImmuneSense `model_v1`

## What it predicts
Binary classification of a 30-second sensor window: `0 = Normal`,
`1 = Inflamed`. The `inferences` row written by the worker carries:

- `risk_label` — the argmax class (0 or 1).
- `immune_score` — softmax probability of class 1, rescaled to 0–100.
- `model_version = "v1"`.

## Training data
JHMC_Dr.Chou.xlsx (1,000 patients × 2 states = 2,000 rows). Provenance is
internal to the class project; data is synthetic-feeling (class gap is much
larger than what we expect on real wearable data).

## Inputs (what the model file expects, in order)
1. `SkinTemperature` (°C)
2. `HeartRateVariability` (ms)
3. `ElectrodermalActivity` (µS)
4. `ImmuneActivationScore` (0–100) — **see "Known issues" below**

The device produces axes 1–3. Axis 4 is fed a constant placeholder by the
worker. See `feature_schema.json` for the exact value.

## Known issues (v1 only)

### 1. Target leakage on the `ImmuneActivationScore` input
The Edge Impulse impulse was configured with `ImmuneActivationScore` as a
Raw Data axis. Per the JHMC legend, that column is a label
("continuous score of inflammation likelihood, 0–100"), not a feature. The
classifier learned to read the answer from the input. At inference time
the device cannot produce this value, so the worker feeds a constant.
Concretely: **v1 scores will be biased toward whatever class the placeholder
favors** and should not be used as evidence of patient state.

This is documented in `feature_schema.json` and ADR 0001. v1 exists only to
exercise the plumbing end-to-end; v2 will replace the model file.

### 2. Heart rate is missing
`HeartRate_bpm` is the strongest signal in the dataset (mean 80 vs 115 bpm
between classes) and is available from the MAX30102 sensor. v1 does not
use it.

### 3. Demographics dropped
`Age`, `Sex`, `BMI`, and `Race` are not inputs. The schema's
`feature_vectors` view supports them; v2 should re-include them.

### 4. Train/test split
Unknown whether the EI training split was patient-grouped. The JHMC dataset
has the same 1,000 patient IDs in both Normal and Activation sheets; a
random row-level split would leak. v2 must use a patient-level split.

## Evaluation
v1 is **not** evaluated against a held-out test set in this repo because of
the leakage issue above (any score reported would be misleading). v2 will
ship with patient-grouped holdout AUC and a confusion matrix.

## Intended use
Demo / class submission only. Not for clinical or medical use of any kind.

## Triggers for v2
See ADR 0001, "v2 trigger conditions".
