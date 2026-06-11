import time
import requests
import xlwings as xw
from datetime import datetime, timezone

SUPABASE_URL = "https://sebzfdkcfgopffjiekqg.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlYnpmZGtjZmdvcGZmamlla3FnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg5OTY5NiwiZXhwIjoyMDkzNDc1Njk2fQ.uRL088OT2wSoDT9LGbk7cMKXBQ13ynbyVm1F6hcVenA"

EXCEL_BOOK_NAME = "Kitap1.xlsx"
SHEET_NAME = "Sayfa4"

START_ROW = 3
END_ROW = 120
SYNC_INTERVAL_SECONDS = 5

GLOBAL_CONTEXT_SYMBOLS = {
    "FDJI": "Dow Jones Future",
    "FSPX": "S&P 500 Future",
    "FDAX": "DAX Future",
    "VIX": "Volatility Index",
}


def parse_number(value, allow_negative=False):
    if value is None or value == "":
        return None

    if isinstance(value, (int, float)):
        parsed = float(value)
        if allow_negative:
            return parsed
        return parsed if parsed > 0 else None

    text = str(value).strip().replace("%", "").replace(".", "").replace(",", ".")

    try:
        parsed = float(text)
        if allow_negative:
            return parsed
        return parsed if parsed > 0 else None
    except ValueError:
        return None


def parse_datetime(value):
    if value is None or value == "":
        return None

    if isinstance(value, datetime):
        return value.isoformat()

    text = str(value).strip()

    try:
        return datetime.strptime(
            text.split(".")[0],
            "%d/%m/%Y %H:%M:%S"
        ).isoformat()
    except Exception:
        return None


def find_workbook(app):
    for book in app.books:
        if book.name == EXCEL_BOOK_NAME:
            return book

    if len(app.books) > 0:
        print("Uyarı: Kitap1.xlsx bulunamadı. İlk açık Excel dosyası kullanılacak:")
        print(app.books[0].name)
        return app.books[0]

    raise RuntimeError("Açık Excel dosyası bulunamadı.")


def supabase_headers():
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }


def upsert_live_prices(rows):
    if not rows:
        return

    url = f"{SUPABASE_URL}/rest/v1/live_prices"

    response = requests.post(
        url,
        headers=supabase_headers(),
        json=rows,
        timeout=15,
    )

    if response.status_code not in (200, 201, 204):
        print("Live Prices Supabase error:", response.status_code, response.text)
    else:
        print(f"Updated live_prices: {len(rows)} symbols at {datetime.now().strftime('%H:%M:%S')}")


def upsert_global_context(rows):
    if not rows:
        return

    url = f"{SUPABASE_URL}/rest/v1/global_context_prices"

    response = requests.post(
        url,
        headers=supabase_headers(),
        json=rows,
        timeout=15,
    )

    if response.status_code not in (200, 201, 204):
        print("Global Context Supabase error:", response.status_code, response.text)
    else:
        print(f"Updated global_context_prices: {len(rows)} symbols at {datetime.now().strftime('%H:%M:%S')}")


def main():
    print("Matriks Excel → Supabase live price + global context agent started.")

    app = xw.apps.active
    book = find_workbook(app)
    sheet = book.sheets[SHEET_NAME]

    while True:
        live_rows = []
        global_rows = []

        for row_num in range(START_ROW, END_ROW + 1):
            symbol = sheet.range(f"B{row_num}").value

            if not symbol:
                continue

            symbol = str(symbol).strip().upper()
            now_utc = datetime.now(timezone.utc).isoformat()

            if symbol in GLOBAL_CONTEXT_SYMBOLS:
                last_price = parse_number(sheet.range(f"C{row_num}").value)
                change_pct = parse_number(sheet.range(f"D{row_num}").value, allow_negative=True)
                last_trade_time = parse_datetime(sheet.range(f"I{row_num}").value)

                if not last_price:
                    continue

                global_rows.append({
                    "symbol": symbol,
                    "name": GLOBAL_CONTEXT_SYMBOLS[symbol],
                    "last_price": last_price,
                    "change_pct": change_pct,
                    "source": "MATRIX_DDE",
                    "updated_at": now_utc,
                })

                live_rows.append({
                    "symbol": symbol,
                    "bid": None,
                    "ask": None,
                    "volume": None,
                    "last_price": last_price,
                    "last_trade_time": last_trade_time,
                    "source": "MATRIKS_DDE",
                    "delay_note": "GLOBAL_CONTEXT",
                    "is_stale": False,
                    "updated_at": now_utc,
                })

                continue

            bid = parse_number(sheet.range(f"C{row_num}").value)
            ask = parse_number(sheet.range(f"D{row_num}").value)
            volume = parse_number(sheet.range(f"E{row_num}").value)
            last_price = parse_number(sheet.range(f"F{row_num}").value)
            last_trade_time = parse_datetime(sheet.range(f"I{row_num}").value)

            if not last_price:
                continue

            live_rows.append({
                "symbol": symbol,
                "bid": bid,
                "ask": ask,
                "volume": volume,
                "last_price": last_price,
                "last_trade_time": last_trade_time,
                "source": "MATRIKS_DDE",
                "delay_note": "DEMO_15_MIN_DELAYED",
                "is_stale": False,
                "updated_at": now_utc,
            })

        upsert_live_prices(live_rows)
        upsert_global_context(global_rows)

        time.sleep(SYNC_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()