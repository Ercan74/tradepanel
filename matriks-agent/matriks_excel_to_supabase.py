import time
import requests
import xlwings as xw
from datetime import datetime, timezone

SUPABASE_URL = "https://sebzfdkcfgopffjiekqg.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "sb_publishable_564FyWf7QMftTyiIvx_P6A_8zmniIRG"

EXCEL_BOOK_NAME = "Kitap1.xlsx"
SHEET_NAME = "Sayfa4"

START_ROW = 3
END_ROW = 120
SYNC_INTERVAL_SECONDS = 5

def parse_number(value):
    if value is None or value == "":
        return None

    if isinstance(value, (int, float)):
        parsed = float(value)
        return parsed if parsed > 0 else None

    text = str(value).strip().replace(".", "").replace(",", ".")

    try:
        parsed = float(text)
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

def upsert_live_prices(rows):
    if not rows:
        return

    url = f"{SUPABASE_URL}/rest/v1/live_prices"

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    response = requests.post(url, headers=headers, json=rows, timeout=15)

    if response.status_code not in (200, 201, 204):
        print("Supabase error:", response.status_code, response.text)
    else:
        print(f"Updated {len(rows)} symbols at {datetime.now().strftime('%H:%M:%S')}")

def main():
    print("Matriks Excel → Supabase live price agent started.")

    app = xw.apps.active
    book = find_workbook(app)
    sheet = book.sheets[SHEET_NAME]

    while True:
        rows = []

        for row_num in range(START_ROW, END_ROW + 1):
            symbol = sheet.range(f"B{row_num}").value

            if not symbol:
                continue

            symbol = str(symbol).strip().upper()

            bid = parse_number(sheet.range(f"C{row_num}").value)
            ask = parse_number(sheet.range(f"D{row_num}").value)
            volume = parse_number(sheet.range(f"E{row_num}").value)
            last_price = parse_number(sheet.range(f"F{row_num}").value)
            last_trade_time = parse_datetime(sheet.range(f"G{row_num}").value)

            if not last_price:
                continue

            rows.append({
                "symbol": symbol,
                "bid": bid,
                "ask": ask,
                "volume": volume,
                "last_price": last_price,
                "last_trade_time": last_trade_time,
                "source": "MATRIKS_DDE",
                "delay_note": "DEMO_15_MIN_DELAYED",
                "is_stale": False,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })

        upsert_live_prices(rows)
        time.sleep(SYNC_INTERVAL_SECONDS)

if __name__ == "__main__":
    main()