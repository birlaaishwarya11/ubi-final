

import argparse
import pathlib
import pandas as pd

FEATURE_COLS = [
    "HeartRate_bpm",
    "HeartRateVariability",
    "SkinTemperature",
    "ElectrodermalActivity",
    "Age",
    "Gender",
    "BMI",
]
LABEL_COL = "label"
GROUP_COL = "PatientID"


def load_jhmc(path: str) -> pd.DataFrame:
  
    normal     = pd.read_excel(path, sheet_name="Normal")
    activation = pd.read_excel(path, sheet_name="Activation")
    normal[LABEL_COL]     = 0
    activation[LABEL_COL] = 1
    df = pd.concat([normal, activation], ignore_index=True)
    print(f"Loaded {len(normal)} normal rows and {len(activation)} activation rows.")
    return df


def prepare(data_path: str, out_dir: str) -> None:
    df = load_jhmc(data_path)

    missing = [c for c in FEATURE_COLS + [LABEL_COL, GROUP_COL] if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns in dataset: {missing}")

    out = pathlib.Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Patient-level split — prevents same patient in train and test
    patient_ids = df[GROUP_COL].unique()
    n_test      = max(1, int(len(patient_ids) * 0.2))
    test_ids    = set(patient_ids[:n_test])

    train_df = df[~df[GROUP_COL].isin(test_ids)][FEATURE_COLS + [LABEL_COL]]
    test_df  = df[ df[GROUP_COL].isin(test_ids)][FEATURE_COLS + [LABEL_COL]]

    train_path = out / "svm_train.csv"
    test_path  = out / "svm_test.csv"
    train_df.to_csv(train_path, index=False)
    test_df.to_csv(test_path,  index=False)

    print(f"Train CSV → {train_path} ({len(train_df)} rows)")
    print(f"Test CSV  → {test_path}  ({len(test_df)} rows)")
    print("\nNext step: upload both CSVs to Edge Impulse Studio.")
    print("See the module docstring for full Studio configuration steps.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Prepare JHMC data for SVM training in Edge Impulse Studio"
    )
    parser.add_argument("--data", required=True, help="Path to JHMC_Dr.Chou.xlsx")
    parser.add_argument("--out",  required=True, help="Output directory for upload CSVs")
    args = parser.parse_args()
    prepare(args.data, args.out)
