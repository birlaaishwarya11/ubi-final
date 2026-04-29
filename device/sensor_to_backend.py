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
import busio
import analogio
import wifi
import socketpool
import adafruit_requests
import adafruit_adt7410

# -------- CONFIG (from settings.toml) --------
WIFI_SSID = os.getenv("CIRCUITPY_WIFI_SSID")
WIFI_PASSWORD = os.getenv("CIRCUITPY_WIFI_PASSWORD")

BACKEND_URL = os.getenv("BACKEND_URL")
INGEST_SECRET = os.getenv("INGEST_SECRET")
DEVICE_ID = os.getenv("DEVICE_ID", "immune-device-1")

WINDOW_SECONDS = int(os.getenv("WINDOW_SECONDS", "10"))
SAMPLE_HZ = int(os.getenv("SAMPLE_HZ", "25"))

assert BACKEND_URL, "Missing BACKEND_URL"
assert INGEST_SECRET, "Missing INGEST_SECRET"

SAMPLE_PERIOD = 1.0 / SAMPLE_HZ

# -------- I2C --------
i2c = busio.I2C(board.SCL, board.SDA)

# -------- TEMPERATURE (ADT7410) --------
temp_sensor = adafruit_adt7410.ADT7410(i2c)

# -------- PPG (MAX30102 → BPM) --------
try:
    from max30102 import MAX30102
    ppg = MAX30102(i2c)
except:
    ppg = None

# -------- ECG (AD8232 → HRV) --------
ecg = analogio.AnalogIn(board.A0)

# -------- GSR (GROVE → EDA) --------
gsr = analogio.AnalogIn(board.A1)

# -------- WIFI --------
http = None

def connect_wifi():
    global http
    if not wifi.radio.connected:
        print("Connecting to WiFi...")
        wifi.radio.connect(WIFI_SSID, WIFI_PASSWORD)
        print("Connected:", wifi.radio.ipv4_address)

    if http is None:
        pool = socketpool.SocketPool(wifi.radio)
        http = adafruit_requests.Session(pool, ssl.create_default_context())

# -------- HELPERS --------
def gsr_microsiemens(raw):
    voltage = (raw * 3.3) / 65535
    if voltage < 0.05:
        return 0.0
    return (voltage / 3.3) * 50.0

def detect_peaks(samples, min_gap):
    peaks = []
    for i in range(1, len(samples) - 1):
        if samples[i] > samples[i-1] and samples[i] >= samples[i+1]:
            if not peaks or (i - peaks[-1]) >= min_gap:
                peaks.append(i)
    return peaks

def compute_bpm(ppg_samples):
    if len(ppg_samples) < 10:
        return None
    peaks = detect_peaks(ppg_samples, int(SAMPLE_HZ * 0.4))
    if len(peaks) < 2:
        return None
    intervals = [(peaks[i] - peaks[i-1]) / SAMPLE_HZ for i in range(1, len(peaks))]
    avg = sum(intervals) / len(intervals)
    return 60.0 / avg

def compute_hrv(ecg_samples):
    if len(ecg_samples) < 10:
        return None
    peaks = detect_peaks(ecg_samples, int(SAMPLE_HZ * 0.4))
    if len(peaks) < 3:
        return None
    intervals = [(peaks[i] - peaks[i-1]) * 1000.0 / SAMPLE_HZ for i in range(1, len(peaks))]
    diffs = [(intervals[i] - intervals[i-1]) for i in range(1, len(intervals))]
    return math.sqrt(sum(d*d for d in diffs) / len(diffs))

# -------- SEND TO BACKEND --------
def post_data(payload):
    headers = {
        "Authorization": "Bearer " + INGEST_SECRET,
        "Content-Type": "application/json",
    }
    url = BACKEND_URL.rstrip("/") + "/api/ingest"
    response = http.post(url, data=json.dumps(payload), headers=headers)
    response.close()

# -------- MAIN --------
connect_wifi()

while True:
    ppg_samples = []
    ecg_samples = []
    eda_samples = []
    temp_samples = []

    start = time.monotonic()

    while time.monotonic() - start < WINDOW_SECONDS:
        loop_start = time.monotonic()

        # TEMP
        try:
            temp_samples.append(temp_sensor.temperature)
        except:
            pass

        # PPG → BPM
        if ppg:
            try:
                _, ir = ppg.read()
                ppg_samples.append(ir)
            except:
                pass

        # ECG → HRV
        try:
            ecg_samples.append(ecg.value)
        except:
            pass

        # GSR → EDA
        try:
            eda_samples.append(gsr_microsiemens(gsr.value))
        except:
            pass

        elapsed = time.monotonic() - loop_start
        if elapsed < SAMPLE_PERIOD:
            time.sleep(SAMPLE_PERIOD - elapsed)

    # COMPUTE
    temp = sum(temp_samples)/len(temp_samples) if temp_samples else None
    bpm = compute_bpm(ppg_samples)
    hrv = compute_hrv(ecg_samples)
    eda = sum(eda_samples)/len(eda_samples) if eda_samples else None

    # PRINT
    print(
        "Temp: {:.2f} C | HRV: {} ms | BPM: {} | EDA: {:.2f} uS".format(
            temp if temp else 0,
            int(hrv) if hrv else 0,
            int(bpm) if bpm else 0,
            eda if eda else 0
        )
    )

    # SEND
    payload = {
        "device_id": DEVICE_ID,
        "temp_c": temp,
        "hrv_ms": hrv,
        "heart_rate_bpm": bpm,
        "eda_microsiemens": eda
    }

    try:
        post_data(payload)
    except Exception as e:
        print("POST failed:", e)
