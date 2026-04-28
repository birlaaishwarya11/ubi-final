import os
import time
import json
import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
SUPABASE_TABLE = os.getenv("SUPABASE_TABLE","sensor_readings")

EI_API_KEY = os.environ["EI_API_KEY"]
EI_INGESTION_URL = "https://ingestion.edgeimpulse.com/api/training/data""

POLL_SECONDS = float(os.getenv("POLL_SECONDS", "5"))
DEVICE_NAME = os.getenv("DEVICE_NAME", "ImmuneSense-Supabase")
DEVICE_TYPE = os.getenv("DEVICE_TYPE", "supabase-tabular")

FEATURES = [
    ("SkinTemperature", "skin_temperature"),
    ("HeartRatevVraiability", "heart_rate_variability"),
    ("ElectrodermalActivity", "electrodermal_activity"),
    ("ImmuneActivationScore", "immune_activation_score"),
]



def supabase_headers(prefer=None):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def fetch_unuploaded(limit=25):
    url = f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}"
    params = {
        "select": "*",
        "edge_impulse_uploaded": "eq.false",
        "order": "created_at.asc",
        "limit": str(limit),
    }

    resp = requests.get(url, headers=supabase_headers(), params=params, timeout=20)
    resp.raise_for_status()
    return resp.json()

def label_for_row(row):
    val = row.get("inflammation_risk")

    if val is None:
        return "unlabeled"

    return "risk" if int(val) == 1 else "baseline"



def build_edge_impulse_payload(row):
    sample = []

    for _, db_col in FEATURES:
        value = row.get(db_col)
        if value is None:
            value = 0
        sample.append(float(value))

    return {
        "protected": {
            "ver": "v1",
            "alg": "none",
            "iat": int(time.time()),
        },
        "signature": "0",
        "payload": {
            "device_name": DEVICE_NAME,
            "device_type": DEVICE_TYPE,
            "interval_ms": 1000,
            "sensors": [
                {"name": ei_name, "units": "numeric"}
                for ei_name, _ in FEATURES
            ],
            "values": [sample],
        },
    }


def upload_to_edge_impulse(row):
    label = label_for_row(row)

    headers = {
        "x-api-key": EI_API_KEY,
        "x-label": label,
        "x-file-name": f"supabase_row_{row['id']}.json",
        "Content-Type": "application/json",
    }

    payload = build_edge_impulse_payload(row)

    resp = requests.post(
        EI_INGESTION_URL,
        headers=headers,
        data=json.dumps(payload),
        timeout=30,
    )

    text = resp.text
    status = resp.status_code
    resp.close()

    if status not in (200, 201, 202):
        raise RuntimeError(f"Edge Impulse upload failed {status}: {text[:300]}")

    return {
        "status_code": status,
        "body": text[:500],
        "label": label,
    }


def mark_uploaded(row_id, ei_response):
    url = f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}"
    params = {"id": f"eq.{row_id}"}
    body = {
        "edge_impulse_uploaded": True,
        "edge_impulse_result": ei_response,
    }

    resp = requests.patch(
        url,
        headers=supabase_headers(prefer="return=minimal"),
        params=params,
        data=json.dumps(body),
        timeout=20,
    )
    resp.raise_for_status()


def main():
    print("Starting Supabase → Edge Impulse acquisition loop")

    while True:
        try:
            rows = fetch_unuploaded()

            if not rows:
                print("No new rows")
                time.sleep(POLL_SECONDS)
                continue

            print(f"Found {len(rows)} rows")

            for row in rows:
                try:
                    print("Uploading row", row["id"], "label:", label_for_row(row))
                    ei_response = upload_to_edge_impulse(row)
                    mark_uploaded(row["id"], ei_response)
                    print("Uploaded row", row["id"])

                except Exception as e:
                    print("Failed row", row.get("id"), e)

        except Exception as e:
            print("Loop error:", e)

        time.sleep(POLL_SECONDS)

if __name__ == "__main__":
    main()



