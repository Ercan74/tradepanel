from dotenv import load_dotenv
import os
import time
import requests
import pandas as pd
from borsapy import Ticker

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
POLL_SECONDS = int(os.getenv("POLL_SECONDS", "5"))

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(".env içinde SUPABASE_URL veya SUPABASE_KEY eksik.")

REST_URL = f"{SUPABASE_URL}/rest/v1"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

UPSERT_HEADERS = {
    **HEADERS,
    "Prefer": "resolution=merge-duplicates",
}


def now_iso():
    return pd.Timestamp.utcnow().isoformat()


def clean_symbol(symbol):
    if not symbol:
        return ""

    symbol = str(symbol).upper().strip()

    if ":" in symbol:
        symbol = symbol.split(":")[-1]

    return symbol


def round_num(value, digits=4):
    return round(float(value), digits)


def get_price(symbol):
    clean = clean_symbol(symbol)
    ticker = Ticker(clean)
    data = ticker.info

    price = data.get("last")

    if price is None:
        raise RuntimeError(f"{symbol} fiyat alınamadı. Raw: {data}")

    return float(price), data


def fetch_open_positions():
    url = f"{REST_URL}/signals"
    params = {
        "status": "eq.OPEN",
        "select": "*",
    }

    r = requests.get(url, headers=HEADERS, params=params, timeout=20)

    if r.status_code >= 400:
        raise RuntimeError(f"Supabase fetch error: {r.text}")

    return r.json()


def calc_pnl(side, entry, current):
    if side == "LONG":
        pnl = current - entry
    else:
        pnl = entry - current

    pnl_pct = (pnl / entry) * 100 if entry else 0

    return round_num(pnl), round_num(pnl_pct)


def upsert_live_price(symbol, price, raw):
    payload = {
        "symbol": clean_symbol(symbol),
        "name": raw.get("description"),
        "price": round_num(price),
        "change": raw.get("change"),
        "volume_tl": None,
        "volume_qty": raw.get("volume"),
        "category": "equity",
        "updated_at": now_iso(),
    }

    url = f"{REST_URL}/live_prices"

    r = requests.post(
        url,
        headers=UPSERT_HEADERS,
        json=payload,
        timeout=20,
    )

    if r.status_code >= 400:
        print("live_prices update error:", r.text)


def check_lifecycle(position, current_price):
    side = position.get("side")
    entry = float(position.get("entry_price") or position.get("price") or 0)

    sl = position.get("sl_price")
    tp1 = position.get("tp1_price")
    tp2 = position.get("tp2_price")
    trailing = position.get("trailing_price")
    tp1_hit = bool(position.get("tp1_hit"))

    close_reason = None
    lifecycle_status = position.get("lifecycle_status") or "OPEN"
    new_tp1_hit = tp1_hit
    new_trailing = float(trailing) if trailing is not None else None

    if side == "LONG":
        if sl is not None and current_price <= float(sl):
            close_reason = "SL_HIT"

        elif tp2 is not None and current_price >= float(tp2):
            close_reason = "TP2_HIT"

        elif tp1 is not None and current_price >= float(tp1) and not tp1_hit:
            new_tp1_hit = True
            lifecycle_status = "TP1_HIT"
            new_trailing = max(new_trailing or entry, entry)

        elif new_trailing is not None and tp1_hit and current_price <= new_trailing:
            close_reason = "TRAILING_STOP_HIT"

        elif tp1_hit:
            candidate = current_price * 0.985
            new_trailing = max(new_trailing or entry, candidate)
            lifecycle_status = "TRAILING_ACTIVE"

    elif side == "SHORT":
        if sl is not None and current_price >= float(sl):
            close_reason = "SL_HIT"

        elif tp2 is not None and current_price <= float(tp2):
            close_reason = "TP2_HIT"

        elif tp1 is not None and current_price <= float(tp1) and not tp1_hit:
            new_tp1_hit = True
            lifecycle_status = "TP1_HIT"
            new_trailing = min(new_trailing or entry, entry)

        elif new_trailing is not None and tp1_hit and current_price >= new_trailing:
            close_reason = "TRAILING_STOP_HIT"

        elif tp1_hit:
            candidate = current_price * 1.015
            new_trailing = min(new_trailing or entry, candidate)
            lifecycle_status = "TRAILING_ACTIVE"

    return {
        "close_reason": close_reason,
        "lifecycle_status": close_reason or lifecycle_status,
        "tp1_hit": new_tp1_hit,
        "trailing_price": round_num(new_trailing) if new_trailing is not None else None,
    }


def update_signal(position, current_price):
    position_id = position["id"]
    side = position.get("side")
    entry = float(position.get("entry_price") or position.get("price") or 0)

    pnl, pnl_pct = calc_pnl(side, entry, current_price)
    lifecycle = check_lifecycle(position, current_price)

    payload = {
        "current_price": round_num(current_price),
        "pnl": pnl,
        "pnl_pct": pnl_pct,
        "last_price_at": now_iso(),
        "tp1_hit": lifecycle["tp1_hit"],
        "lifecycle_status": lifecycle["lifecycle_status"],
    }

    if lifecycle["trailing_price"] is not None:
        payload["trailing_price"] = lifecycle["trailing_price"]

    if lifecycle["close_reason"]:
        payload.update({
            "status": "CLOSED",
            "closed_at": now_iso(),
            "close_price": round_num(current_price),
            "close_reason": lifecycle["close_reason"],
        })

    url = f"{REST_URL}/signals"
    params = {"id": f"eq.{position_id}"}

    r = requests.patch(
        url,
        headers=HEADERS,
        params=params,
        json=payload,
        timeout=20,
    )
    
    print("PATCH STATUS:", r.status_code)
    print("PATCH BODY:", r.text)
    print("PATCH PAYLOAD:", payload)

    if r.status_code >= 400:
        raise RuntimeError(f"Signal update error: {r.text}")

    return {
        "symbol": position.get("symbol"),
        "side": side,
        "entry": entry,
        "current": current_price,
        "pnl": pnl,
        "pnl_pct": pnl_pct,
        "status": payload.get("status", "OPEN"),
        "life": lifecycle["lifecycle_status"],
    }


def run():
    print("TradePanel Price Engine v2 başladı.")
    print(f"Polling: {POLL_SECONDS} saniye\n")

    while True:
        try:
            positions = fetch_open_positions()

            if not positions:
                print("Açık pozisyon yok.")
                time.sleep(POLL_SECONDS)
                continue

            print(f"\n{len(positions)} açık pozisyon güncelleniyor...")

            for position in positions:
                symbol = position.get("symbol")

                try:
                    price, raw = get_price(symbol)
                    upsert_live_price(symbol, price, raw)
                    result = update_signal(position, price)

                    print(
                        f"{result['symbol']} | {result['side']} | "
                        f"Entry: {result['entry']} | Current: {result['current']} | "
                        f"PnL: {result['pnl']} | PnL%: {result['pnl_pct']} | "
                        f"Status: {result['status']} | Life: {result['life']}"
                    )

                except Exception as e:
                    print(f"{symbol} hata:", e)

        except KeyboardInterrupt:
            print("\nPrice Engine durduruldu.")
            break

        except Exception as e:
            print("GENEL HATA:", e)

        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    run()