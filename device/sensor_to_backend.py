"""
ImmuneSense — device-side sensor streaming.

Reads MAX30102 (PPG → HR, HRV), MLX90614 (skin temp), and a Grove GSR
(electrodermal activity) for `WINDOW_SECONDS` seconds, then POSTs one
aggregated row to the backend ingest endpoint. The backend decides which
user this row belongs to (from active_session) and writes to Supabase.

The device never talks to Supabase directly. It only knows:
  - the backend URL
  - a shared INGEST_SECRET (Bearer token)
  - its own DEVICE_ID

Configure via settings.toml on the CIRCUITPY drive (see settings.toml.example).
"""

import time
import math
import os
import ssl
import json

import board
import wifi
import socketpool
import adafruit_requests
import analogio

from adafruit_mlx90614 import MLX90614

try:
    from adafruit_max30102 import MAX30102
    HAS_MAX30102 = True
except ImportError:
    HAS_MAX30102 = False


# ------------- Config (from settings.toml) -------------

WIFI_SSID = os.getenv("CIRCUITPY_WIFI_SSID")
WIFI_PASSWORD = os.getenv("CIRCUITPY_WIFI_PASSWORD")

BACKEND_URL = os.getenv("BACKEND_URL")
INGEST_SECRET = os.getenv("INGEST_SECRET")
DEVICE_ID = os.getenv("DEVICE_ID", "immune-feather-1")

WINDOW_SECONDS = int(os.getenv("WINDOW_SECONDS", "30"))
SAMPLE_HZ = int(os.getenv("SAMPLE_HZ", "25"))
GSR_PIN_NAME = os.getenv("GSR_PIN", "A0")

assert BACKEND_URL, "BACKEND_URL not set"
assert INGEST_SECRET, "INGEST_SECRET not set"

SAMPLE_PERIOD = 1.0 / SAMPLE_HZ


# ------------- Hardware setup -------------

i2c = board.I2C()
mlx = MLX90614(i2c)

if HAS_MAX30102:
    try:
        max30102 = MAX30102(i2c)
    except Exception as e:
        print("MAX30102 init failed:", e)
        max30102 = None
else:
    max30102 = None

gsr_pin = analogio.AnalogIn(getattr(board, GSR_PIN_NAME))


# ------------- Wi-Fi -------------

http = None


def connect_wifi():
    global http
    if not wifi.radio.connected:
        print("Wi-Fi: connecting to", WIFI_SSID)
        wifi.radio.connect(WIFI_SSID, WIFI_PASSWORD)
    if http is None:
        pool = socketpool.SocketPool(wifi.radio)
        http = adafruit_requests.Session(pool, ssl.create_default_context())
    print("Wi-Fi:", wifi.radio.ipv4_address)


# ------------- Sensor sampling helpers -------------

def gsr_microsiemens(raw_value):
    """Crude conversion: raw ADC → voltage → conductance estimate.
    Grove GSR output is a divider; this is a placeholder mapping good
    enough for demoing trend, not absolute calibration."""
    voltage = (raw_value * 3.3) / 65535
    if voltage < 0.05:
        return 0.0
    return (voltage / 3.3) * 50.0


def detect_peaks(samples, min_gap_samples):
    """Return indices of local maxima above the running mean.
    Simple threshold + minimum-interval peak detector for HR from PPG."""
    if len(samples) < 3:
        return []
    mean = sum(samples) / len(samples)
    threshold = mean + 0.4 * (max(samples) - mean)
    peaks = []
    last = -min_gap_samples
    for i in range(1, len(samples) - 1):
        if (
            samples[i] > threshold
            and samples[i] > samples[i - 1]
            and samples[i] >= samples[i + 1]
            and (i - last) >= min_gap_samples
        ):
            peaks.append(i)
            last = i
    return peaks


def compute_hr_hrv(ppg_samples, sample_hz):
    """Returns (heart_rate_bpm, hrv_rmssd_ms) or (None, None)."""
    if not ppg_samples:
        return None, None
    min_gap = max(1, int(sample_hz * 0.4))  # ≥ 0.4 s between beats (≤150 bpm)
    peaks = detect_peaks(ppg_samples, min_gap)
    if len(peaks) < 3:
        return None, None
    intervals_ms = [
        (peaks[i] - peaks[i - 1]) * 1000.0 / sample_hz for i in range(1, len(peaks))
    ]
    mean_rr = sum(intervals_ms) / len(intervals_ms)
    hr = 60000.0 / mean_rr
    if len(intervals_ms) < 2:
        return hr, None
    diffs = [intervals_ms[i] - intervals_ms[i - 1] for i in range(1, len(intervals_ms))]
    rmssd = math.sqrt(sum(d * d for d in diffs) / len(diffs))
    return hr, rmssd


# ------------- Window aggregation -------------

def collect_window():
    ppg = []
    temps = []
    edas = []
    deadline = time.monotonic() + WINDOW_SECONDS
    while time.monotonic() < deadline:
        loop_start = time.monotonic()
        if max30102 is not None:
            try:
                _, ir = max30102.read()
                ppg.append(ir)
            except Exception:
                pass
        try:
            temps.append(mlx.object_temperature)
        except Exception:
            pass
        try:
            edas.append(gsr_microsiemens(gsr_pin.value))
        except Exception:
            pass
        elapsed = time.monotonic() - loop_start
        if elapsed < SAMPLE_PERIOD:
            time.sleep(SAMPLE_PERIOD - elapsed)

    hr, hrv = compute_hr_hrv(ppg, SAMPLE_HZ)
    skin_temp = sum(temps) / len(temps) if temps else None
    eda = sum(edas) / len(edas) if edas else None

    quality = 0
    if hr is None:
        quality |= 0x02  # poor PPG / not enough beats
    if skin_temp is None:
        quality |= 0x08

    return {
        "device_id": DEVICE_ID,
        "window_seconds": WINDOW_SECONDS,
        "heart_rate_bpm": round(hr, 1) if hr is not None else None,
        "hrv_ms": round(hrv, 1) if hrv is not None else None,
        "skin_temp_c": round(skin_temp, 2) if skin_temp is not None else None,
        "eda_microsiemens": round(eda, 2) if eda is not None else None,
        "quality_flag": quality,
    }


# ------------- POST to backend -------------

def post_window(row):
    headers = {
        "Authorization": "Bearer " + INGEST_SECRET,
        "Content-Type": "application/json",
    }
    url = BACKEND_URL.rstrip("/") + "/api/ingest"
    resp = http.post(url, data=json.dumps(row), headers=headers, timeout=15)
    code = resp.status_code
    text = resp.text
    resp.close()
    return code, text


# ------------- Main loop -------------

connect_wifi()
print("ImmuneSense device started. Window =", WINDOW_SECONDS, "s")

while True:
    try:
        if not wifi.radio.connected:
            connect_wifi()
        row = collect_window()
        print("Window:", row)
        code, body = post_window(row)
        if code == 201:
            print("→ logged for user")
        elif code == 409:
            print("→ no active user (dashboard not started)")
        else:
            print("→ HTTP", code, body[:120])
    except Exception as e:
        print("Loop error:", e)
        time.sleep(2)
