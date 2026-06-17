import os
import time
from datetime import datetime, timezone

import requests
import xlwings as xw

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://sebzfdkcfgopffjiekqg.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlYnpmZGtjZmdvcGZmamlla3FnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg5OTY5NiwiZXhwIjoyMDkzNDc1Njk2fQ.uRL088OT2wSoDT9LGbk7cMKXBQ13ynbyVm1F6hcVenA")

EXCEL_BOOK_NAME = "Kitap1.xlsx"
SHEET_NAME = "Sayfa4"

START_ROW = 3
END_ROW = 220
SYNC_INTERVAL_SECONDS = 5

GLOBAL_CONTEXT_SYMBOLS = {
    "FDJI": "Dow Jones Future",
    "FSPX": "S&P 500 Future",
    "FDAX": "DAX Future",
    "VIX": "Volatility Index",
    "DXY": "Dollar Index",
    "XU100": "BIST 100",
    "XU030": "BIST 30",
    "XBANK": "BIST Banka",
    "XULAS": "BIST Ulaştırma",
    "XUMAL": "BIST Mali",
    "XUTEK": "BIST Teknoloji",
    "XUSIN": "BIST Sanayi",
    "XHOLD": "BIST Holding",
}


def normalize_symbol(value):
    if value is None:
        return ""
    return (
        str(value)
        .replace("\xa0", "")
        .replace("\t", "")
        .replace("\n", "")
        .strip()
        .upper()
    )


def parse_number(value, allow_zero=False, allow_negative=False):
    if value is None or value == "":
        return None

    if isinstance(value, (int, float)):
        parsed = float(value)
        if allow_negative or allow_zero:
            return parsed
        return parsed if parsed > 0 else None

    text = str(value).strip().replace("%", "")

    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")

    try:
        parsed = float(text)
        if allow_negative or allow_zero:
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

    for fmt in ("%d/%m/%Y %H:%M:%S", "%d.%m.%Y %H:%M:%S"):
        try:
            return datetime.strptime(text.split(".")[0], fmt).isoformat()
        except Exception:
            pass

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


def upsert_table(table_name, rows, label):
    if not rows:
        print(f"No {label} rows.")
        return

    url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    response = requests.post(url, headers=supabase_headers(), json=rows, timeout=15)

    if response.status_code not in (200, 201, 204):
        print(f"{label} Supabase error:", response.status_code, response.text)
    else:
        print(f"Updated {label}: {len(rows)} symbols at {datetime.now().strftime('%H:%M:%S')}")


def read_excel_rows(sheet):
    live_rows = []
    global_rows = []
    seen_global = set()
    now_utc = datetime.now(timezone.utc).isoformat()

    for row_num in range(START_ROW, END_ROW + 1):
        symbol = normalize_symbol(sheet.range(f"B{row_num}").value)
        if not symbol:
            continue

        last_trade_time = parse_datetime(sheet.range(f"I{row_num}").value)

        if symbol in GLOBAL_CONTEXT_SYMBOLS:
            last_price = parse_number(sheet.range(f"C{row_num}").value)
            change_pct = parse_number(
                sheet.range(f"D{row_num}").value,
                allow_zero=True,
                allow_negative=True,
            )

            if not last_price:
                print(f"Global skipped: {symbol} row {row_num} price empty")
                continue

            global_rows.append({
                "symbol": symbol,
                "name": GLOBAL_CONTEXT_SYMBOLS[symbol],
                "last_price": last_price,
                "change_pct": change_pct if change_pct is not None else 0,
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
                "delay_note": "GLOBAL_BIST_CONTEXT",
                "is_stale": False,
                "updated_at": now_utc,
            })

            seen_global.add(symbol)
            print(f"GLOBAL ACTIVE row {row_num}: {symbol} price={last_price} change={change_pct}")
            continue

        bid = parse_number(sheet.range(f"C{row_num}").value)
        ask = parse_number(sheet.range(f"D{row_num}").value)
        volume = parse_number(sheet.range(f"E{row_num}").value)
        last_price = parse_number(sheet.range(f"F{row_num}").value)

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

    missing = [symbol for symbol in GLOBAL_CONTEXT_SYMBOLS if symbol not in seen_global]
    if missing:
        print("Missing global/BIST symbols:", ", ".join(missing))

    return live_rows, global_rows


def main():
    if not SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY == "BURAYA_SUPABASE_SERVICE_ROLE_KEY":
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY eksik. Ortam değişkeni olarak girin veya dosyada doldurun.")

    print("Matriks Excel → Supabase live price + global/BIST context agent started.")

    app = xw.apps.active
    book = find_workbook(app)
    sheet = book.sheets[SHEET_NAME]

    while True:
        live_rows, global_rows = read_excel_rows(sheet)
        upsert_table("live_prices", live_rows, "live_prices")
        upsert_table("global_context_prices", global_rows, "global_context_prices")
        time.sleep(SYNC_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
