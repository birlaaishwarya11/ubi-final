import time
import os
import ssl
import wifi
import socketpool
import adafruit_requests

import board
import busio

from adafruit_mlx90614 import MLX90614
from adafruit_max30102 import MAX30102


i2c = board.I2C()

# Config

WIFI_SSID = os.getenv("CIRCUITPY_WIFI_SSID")
WIFI_PASSWORD = os.getenv("CIRCUITPY_WIFI_PASSWORD")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_TABLE = os.getenv("SUPABASE_TABLE", "sensor_readings")

DEVICE_ID = os.getenv("DEVICE_ID", "immune-feather-1")

USER_AGE = int(os.getenv("USER_AGE", "30"))
USER_SEX = int(os.getenv("USER_SEX", "0"))

UPLOAD_INTERVAL_S = 10

requests = None




# WiFi Setup
def connect_wifi():
    print("Connecting to WiFi...")

    if wifi.radio.connected:
        print("Already connected:", wifi.radio.ipv4_address)
        return True

    try:
        if WIFI_PASSWORD:
            wifi.radio.connect(WIFI_SSID, WIFI_PASSWORD)
        else:
            wifi.radio.connect(WIFI_SSID)

        print("Connected:", wifi.radio.ipv4_address)
        return True

    except Exception as e:
        print("WiFi failed:", e)
        return False


def make_requests_session():
    global requests

    try:
        pool = socketpool.SocketPool(wifi.radio)
        requests = adafruit_requests.Session(pool, ssl.create_default_context())
        print("HTTP session ready")
        return True

    except Exception as e:
        print("HTTP session failed:", e)
        requests = None
        return False

def analog_voltage(pin):
	return (pin.value * 3.3) / 65535


def read_sensors():
    
	try:
		skin_temperature = mlx.object_temperature
	except Exception e:
		skin_temperature = None


	try:
		electrodermal_activity = analog_voltage(gsr_pin)
	except Exception:
		electrodermal_activity = None


	heart_rate_variability = None

	immune_activation_score = compute_immune_score(

		skin_temperature,
		heart_rate_variability,
		electrodermal_activity

		)


    row = {
        "device_id": DEVICE_ID,
        "skin_temperature": skin_temperature,
        "heart_rate_variability": heart_rate_variability,
        "electrodermal_activity": electrodermal_activity,
        "sex": USER_SEX,
        "age": USER_AGE,
        "immune_activation_score": immune_activation_score,


        "edge_impulse_uploaded": False
    }

    return row


def compute_immune_score(temp, hrv,eda):

	score = 0

	if temp is not None and temp > 37.5:
		score += 1

	if hrv is not None and hrv < 30:

		score += 1

	if eda is not None and eda > 1.8:
		score +=1

	return score

# Supabase insert
def upload_row_to_supabase(row):
    global requests

    if requests is None:
        return False, "No HTTP session"

    url = SUPABASE_URL + "/rest/v1/" + SUPABASE_TABLE

    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    response = None

    try:
        response = requests.post(
            url,
            json=row,
            headers=headers,
            timeout=15
        )

        code = response.status_code
        text = response.text
        response.close()

        if code in (200, 201, 204):
            return True, "OK"

        return False, "HTTP {} {}".format(code, text[:120])

    except Exception as e:
        try:
            if response:
                response.close()
        except Exception:
            pass

        requests = None
        return False, str(e)


# Startup
if not connect_wifi():
    print("Could not connect to WiFi")

if wifi.radio.connected:
    make_requests_session()


# Main loop

last_upload = 0

while True:
    now = time.monotonic()

    if now - last_upload >= UPLOAD_INTERVAL_S:
        last_upload = now

        if not wifi.radio.connected:
            connect_wifi()
            make_requests_session()

        if requests is None:
            make_requests_session()

        row = read_sensors()
        print("Uploading:", row)

        ok, msg = upload_row_to_supabase(row)
        print("Supabase upload:", ok, msg)

    time.sleep(0.1)