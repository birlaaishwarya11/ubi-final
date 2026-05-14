

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
    """
    Load both sheets from the JHMC workbook and combine them.
    Normal sheet → label 0, Activation sheet → label 1.
    """
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

    # K-means trains on normal data only
    normal_df     = df[df[LABEL_COL] == 0][FEATURE_COLS]
    activation_df = df[df[LABEL_COL] == 1][FEATURE_COLS]

    normal_path     = out / "kmeans_normal_train.csv"
    activation_path = out / "kmeans_activation_test.csv"
    normal_df.to_csv(normal_path,     index=False)
    activation_df.to_csv(activation_path, index=False)

    print(f"Normal train CSV     → {normal_path} ({len(normal_df)} rows)")
    print(f"Activation test CSV  → {activation_path} ({len(activation_df)} rows)")
    print("\nNext step: upload kmeans_normal_train.csv to Edge Impulse Studio")
    print("as training data. Use kmeans_activation_test.csv to validate")
    print("that activation windows produce higher anomaly scores.")
    print("See the module docstring for full Studio configuration steps.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Prepare JHMC data for K-means anomaly detection in Edge Impulse Studio"
    )
    parser.add_argument("--data", required=True, help="Path to JHMC_Dr.Chou.xlsx")
    parser.add_argument("--out",  required=True, help="Output directory for upload CSVs")
    args = parser.parse_args()
    prepare(args.data, args.out)
