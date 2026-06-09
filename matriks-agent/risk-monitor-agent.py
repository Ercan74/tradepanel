import time
import requests
from datetime import datetime

RISK_MONITOR_URL = "http://localhost:3000/api/risk-monitor"
SECRET = "ema100_secret_2026"
INTERVAL_SECONDS = 30


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def call_risk_monitor():
    try:
        response = requests.get(
            RISK_MONITOR_URL,
            params={"secret": SECRET},
            timeout=20,
        )

        if response.status_code != 200:
            print(f"[{now()}] ERROR {response.status_code}: {response.text}")
            return

        data = response.json()
        actions = data.get("actions", [])

        if actions:
            print(f"[{now()}] Actions: {len(actions)}")
            for item in actions:
                symbol = item.get("symbol", "-")
                action = item.get("action", "-")
                message = item.get("message", "")
                print(f"  - {symbol} | {action} | {message}")
        else:
            checked = data.get("checked", 0)
            print(f"[{now()}] OK - checked {checked}, no action")

    except requests.exceptions.RequestException as exc:
        print(f"[{now()}] REQUEST ERROR: {exc}")
    except Exception as exc:
        print(f"[{now()}] ERROR: {exc}")


def main():
    print("Risk Monitor Agent started.")
    print(f"URL: {RISK_MONITOR_URL}")
    print(f"Interval: {INTERVAL_SECONDS} seconds")
    print("Press CTRL+C to stop.\n")

    while True:
        call_risk_monitor()
        time.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    main()