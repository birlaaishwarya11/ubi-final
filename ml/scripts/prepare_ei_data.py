"""
Prepare JHMC_Dr.Chou.xlsx for re-training the inflammation-risk model on
Edge Impulse (or any other tabular trainer).

What this script enforces vs. v1's impulse:

- Drops `ImmuneActivationScore` and `CytokineLevel_pgmL` from inputs. Both
  are LABEL columns per the dataset legend; including them as features is
  target leakage and is the reason v1 is unreliable. (See docs/adr/0001.)
- Adds `HeartRate_bpm` — strongest single signal in the dataset (mean 80 vs
  115 between classes), available from the MAX30102 sensor, missing from v1.
- Adds demographics `Age`, `Gender`, `BMI`. The schema's `feature_vectors`
  view already exposes them; the worker will join `profiles` at inference.
- One-hot encodes `Race` into 6 binary columns (one per CDC code in the
  dataset). EI has no categorical type; every Raw Data axis is a float, so
  encoding has to happen here, NOT in EI. Integer-encoding the 6 codes
  would impose a fake ordering on a nominal variable — don't do that.
  The same encoding (and the same column order) is mirrored in
  `dashboard/api/_model/feature_schema.json` so the worker can expand
  `profiles.race_code` to the correct one-hot vector at inference time.
  Underscores replace hyphens in column names because some EI CSV parsers
  trip on `-` in axis names.
- Splits 80/20 by `Patient`, NOT by row. The same 1,000 patient IDs appear
  in both Normal and Activation sheets; a row-level random split leaks the
  static demographic vector across train and test, inflating metrics.

Outputs:
    ml/training_data/train.csv   one row per sample (1,600 patients × 2 states = 3,200)
    ml/training_data/test.csv    one row per sample (  200 patients × 2 states =   400)
    ml/training_data/columns.json   feature names in the order EI should see them

Usage:
    cd final_project
    source .venv/bin/activate
    python ml/scripts/prepare_ei_data.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit


HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parent.parent  # final_project/
INPUT_XLSX = PROJECT_ROOT / "JHMC_Dr.Chou.xlsx"
OUT_DIR = PROJECT_ROOT / "ml" / "training_data"

# Numeric features (already float in the source).
NUMERIC_FEATURES = [
    "Age",
    "Gender",
    "BMI",
    "HeartRate_bpm",
    "HRV_ms",
    "SkinTemperature_C",
    "EDA_microsiemens",
]

# CDC race codes per the schema's profiles.race_code check constraint and
# the dataset's Legend sheet. Order is frozen — the worker expands
# profiles.race_code to a one-hot in this exact order.
RACE_CODES = ["2054-5", "2076-8", "2106-3", "2131-1", "2028-9", "2186-5"]
RACE_COLS = [f"Race_{c.replace('-', '_')}" for c in RACE_CODES]

# Feature order is the contract — `feature_schema.json` (v2) must match it.
FEATURES = NUMERIC_FEATURES + RACE_COLS
LABEL = "InflammationRiskLabel"

TEST_FRAC = 0.20
RANDOM_STATE = 20260428  # frozen so re-runs reproduce the same split


def load_combined() -> pd.DataFrame:
    xl = pd.ExcelFile(INPUT_XLSX)
    normal = pd.read_excel(xl, sheet_name="Normal")
    activation = pd.read_excel(xl, sheet_name="Immune Activation")
    if not (set(normal.columns) == set(activation.columns)):
        raise ValueError("Normal and Activation sheets have different columns")
    df = pd.concat([normal, activation], ignore_index=True)
    needed = ["Patient", "Race"] + NUMERIC_FEATURES + [LABEL]
    missing = [c for c in needed if c not in df.columns]
    if missing:
        raise ValueError(f"missing columns in dataset: {missing}")
    df = df[needed].copy()

    unknown = set(df["Race"].unique()) - set(RACE_CODES)
    if unknown:
        raise ValueError(f"unexpected Race codes in dataset: {unknown}")

    # Frozen-order one-hot. pd.get_dummies' column order depends on the
    # categorical levels seen, so we materialize each column explicitly.
    for code, col in zip(RACE_CODES, RACE_COLS):
        df[col] = (df["Race"] == code).astype(int)
    df = df.drop(columns=["Race"])
    return df


def patient_grouped_split(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    splitter = GroupShuffleSplit(n_splits=1, test_size=TEST_FRAC, random_state=RANDOM_STATE)
    train_idx, test_idx = next(splitter.split(df, groups=df["Patient"]))
    train = df.iloc[train_idx].reset_index(drop=True)
    test = df.iloc[test_idx].reset_index(drop=True)
    overlap = set(train["Patient"]) & set(test["Patient"])
    if overlap:
        raise AssertionError(f"patient leak across split: {len(overlap)} ids")
    return train, test


def write_split(df: pd.DataFrame, path: Path) -> None:
    out = df[FEATURES + [LABEL]].copy()
    out.to_csv(path, index=False)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    df = load_combined()
    train, test = patient_grouped_split(df)

    write_split(train, OUT_DIR / "train.csv")
    write_split(test, OUT_DIR / "test.csv")
    (OUT_DIR / "columns.json").write_text(
        json.dumps(
            {
                "features": FEATURES,
                "label": LABEL,
                "race_one_hot": {
                    "source_column": "profiles.race_code",
                    "code_to_column": dict(zip(RACE_CODES, RACE_COLS)),
                },
            },
            indent=2,
        )
        + "\n"
    )

    # Sanity report — these numbers go in the PR / model card.
    print(f"Total rows:          {len(df):>5}")
    print(f"Train rows:          {len(train):>5}  ({train['Patient'].nunique()} patients)")
    print(f"Test rows:           {len(test):>5}  ({test['Patient'].nunique()} patients)")
    print(f"Train class balance: {dict(train[LABEL].value_counts())}")
    print(f"Test  class balance: {dict(test[LABEL].value_counts())}")
    print()
    print("Per-feature train/test mean drift (sanity-check the split is reasonable):")
    drift = pd.DataFrame({
        "train_mean": train[NUMERIC_FEATURES].mean(),
        "test_mean": test[NUMERIC_FEATURES].mean(),
    })
    drift["abs_drift_%"] = (drift["test_mean"] - drift["train_mean"]).abs() / drift["train_mean"].abs() * 100
    print(drift.round(2).to_string())

    print()
    print("Race one-hot proportions (train / test):")
    race_drift = pd.DataFrame({
        "train_prop": train[RACE_COLS].mean(),
        "test_prop": test[RACE_COLS].mean(),
    }).round(3)
    print(race_drift.to_string())

    print()
    print(f"Wrote {OUT_DIR / 'train.csv'}")
    print(f"Wrote {OUT_DIR / 'test.csv'}")
    print(f"Wrote {OUT_DIR / 'columns.json'}")


if __name__ == "__main__":
    main()
