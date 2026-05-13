

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

# wifi
WIFI_SSID        = os.getenv("CIRCUITPY_WIFI_SSID")
WIFI_PASSWORD    = os.getenv("CIRCUITPY_WIFI_PASSWORD")
BACKEND_URL      = os.getenv("BACKEND_URL")
INGEST_SECRET    = os.getenv("INGEST_SECRET")
DEVICE_ID        = os.getenv("DEVICE_ID", "immune-feather-1")

WINDOW_SECONDS   = 30        # transmission interval
ECG_PPG_HZ       = 1         # sample ECG and PPG every 1 second
TEMP_INTERVAL    = 5         # sample temperature every 5 seconds
EDA_INTERVAL     = 10        # sample EDA every 10 seconds

assert BACKEND_URL,    "Missing BACKEND_URL in settings.toml"
assert INGEST_SECRET,  "Missing INGEST_SECRET in settings.toml"


i2c          = busio.I2C(board.SCL, board.SDA)
temp_sensor  = adafruit_adt7410.ADT7410(i2c)

try:
    from max30102 import MAX30102
    ppg = MAX30102(i2c)
    print("MAX30102 PPG sensor found")
except Exception:
    ppg = None
    print("MAX30102 not found — PPG disabled")

ecg = analogio.AnalogIn(board.A0)   # AD8232 ECG
gsr = analogio.AnalogIn(board.A1)   # Grove GSR / EDA


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


def gsr_microsiemens(raw):
    voltage = (raw * 3.3) / 65535
    if voltage < 0.05:
        return 0.0
    return (voltage / 3.3) * 50.0

def detect_peaks(samples, min_gap):
    peaks = []
    for i in range(1, len(samples) - 1):
        if samples[i] > samples[i - 1] and samples[i] >= samples[i + 1]:
            if not peaks or (i - peaks[-1]) >= min_gap:
                peaks.append(i)
    return peaks

def compute_bpm_from_ecg(ecg_samples):
    """
    Derive BPM from AD8232 ECG R-peak intervals.
    This makes the MAX30102 PPG redundant for heart rate measurement
    and is the basis for removing the PPG sensor in the next hardware revision.
    """
    if len(ecg_samples) < 10:
        return None
    peaks = detect_peaks(ecg_samples, int(ECG_PPG_HZ * 0.4))
    if len(peaks) < 2:
        return None
    intervals = [(peaks[i] - peaks[i - 1]) / ECG_PPG_HZ for i in range(1, len(peaks))]
    avg = sum(intervals) / len(intervals)
    return 60.0 / avg if avg > 0 else None

def compute_hrv_from_ecg(ecg_samples):
    """
    Compute RMSSD HRV from AD8232 ECG R-peak intervals.
    """
    if len(ecg_samples) < 10:
        return None
    peaks = detect_peaks(ecg_samples, int(ECG_PPG_HZ * 0.4))
    if len(peaks) < 3:
        return None
    intervals = [(peaks[i] - peaks[i - 1]) * 1000.0 / ECG_PPG_HZ for i in range(1, len(peaks))]
    diffs = [(intervals[i] - intervals[i - 1]) for i in range(1, len(intervals))]
    return math.sqrt(sum(d * d for d in diffs) / len(diffs))


def post_window(payload):
    headers = {
        "Authorization": "Bearer " + INGEST_SECRET,
        "Content-Type": "application/json",
    }
    url = BACKEND_URL.rstrip("/") + "/api/ingest"
    response = http.post(url, data=json.dumps(payload), headers=headers)
    response.close()

connect_wifi()

while True:
    ecg_samples  = []
    ppg_samples  = []
    temp_samples = []
    eda_samples  = []

    window_start        = time.monotonic()
    last_temp_sample    = window_start - TEMP_INTERVAL
    last_eda_sample     = window_start - EDA_INTERVAL
    last_ecg_ppg_sample = window_start - ECG_PPG_HZ

    print("\nStarting 30-second window...")

    while time.monotonic() - window_start < WINDOW_SECONDS:
        now = time.monotonic()

        # ECG and PPG — every 1 second
        if now - last_ecg_ppg_sample >= ECG_PPG_HZ:
            try:
                ecg_samples.append(ecg.value)
            except Exception:
                pass

            if ppg:
                try:
                    _, ir = ppg.read()
                    ppg_samples.append(ir)
                except Exception:
                    pass

            last_ecg_ppg_sample = now

        # Temperature — every 5 seconds
        if now - last_temp_sample >= TEMP_INTERVAL:
            try:
                temp_samples.append(temp_sensor.temperature)
            except Exception:
                pass
            last_temp_sample = now

        # EDA — every 10 seconds
        if now - last_eda_sample >= EDA_INTERVAL:
            try:
                eda_samples.append(gsr_microsiemens(gsr.value))
            except Exception:
                pass
            last_eda_sample = now

        time.sleep(0.05)


    temp = sum(temp_samples) / len(temp_samples) if temp_samples else None
    eda  = sum(eda_samples)  / len(eda_samples)  if eda_samples  else None

    # BPM and HRV derived from ECG R-peaks
    bpm = compute_bpm_from_ecg(ecg_samples)
    hrv = compute_hrv_from_ecg(ecg_samples)

    quality_flag = 1 if all(x is not None for x in [temp, bpm, hrv, eda]) else 0


    print(
        "Temp: {:.2f} C | BPM: {} | HRV: {} ms | EDA: {:.2f} uS | Quality: {}".format(
            temp or 0,
            int(bpm) if bpm else 0,
            int(hrv) if hrv else 0,
            eda or 0,
            quality_flag
        )
    )

    
    payload = {
        "device_id":        DEVICE_ID,
        "window_seconds":   WINDOW_SECONDS,
        "skin_temp_c":      temp,
        "heart_rate_bpm":   bpm,
        "hrv_ms":           hrv,
        "eda_microsiemens": eda,
        "quality_flag":     quality_flag
    }

    try:
        post_window(payload)
        print("Window posted successfully")
    except Exception as e:
        print("POST failed:", e)
        try:
            connect_wifi()
        except Exception as e2:
            print("WiFi reconnect failed:", e2)
