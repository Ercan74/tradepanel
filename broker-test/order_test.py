#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TEK DEMO-EMİR TESTİ — OrderType davranışını + exec-report'u ampirik çözmek için.
DRY-RUN varsayılan (emir kurar, BASAR, GÖNDERMEZ). `--live` DEMO hesabına gönderir —
KULLANICI çalıştırır (Claude canlı emir göndermez).

GÜVENLİ tasarım: market'in ~%5 ALTINA limit BUY → dolmaz, emir defterinde DİNLENİR.
Böylece gerçek işlem olmadan: (1) OrderType "2" limit mi (Price'ı dikkate alıp
bekliyor mu) yoksa market mi (hemen doluyor mu) → OrdStatus'tan anlaşılır; (2) NewOrder
yanıt formatı + OrderID/OrderID2 + execution-report push gözlemlenir. Sonra istenirse
--cancel ile iptal (bir sonraki adım). DEMO parası — gerçek risk yok; yine de dinlenen
emir en temkinli test.

Gerçek Osmanlı demo kimliği (ListAccounts'tan, 2026-08-28): BrokageId 8 / AccountId 342447 / ExchangeId 4.
"""
import os
import sys
import json
import time
import socket
import argparse

import matriks_api as m

HOST = os.getenv("MATRIKS_HOST", "127.0.0.1")
PORT = int(os.getenv("MATRIKS_PORT", "18890"))

# ListAccounts (2026-08-28) → Osmanlı Yatırım Pro demo:
BROKAGE_ID = "8"
ACCOUNT_ID = "342447"
EXCHANGE_ID = m.Exchange.BIST_SPOT  # 4


def last_price(symbol):
    """Supabase live_prices'tan son fiyat (güvenli limit fiyatı için)."""
    try:
        import requests
        env = {}
        for line in open(os.path.join("..", ".env.local"), encoding="utf-8"):
            if "=" in line and not line.strip().startswith("#"):
                k, _, v = line.strip().partition("=")
                env[k] = v.strip().strip('"').strip("'")
        u = env["NEXT_PUBLIC_SUPABASE_URL"]; k = env["SUPABASE_SERVICE_ROLE_KEY"]
        r = requests.get(f"{u}/rest/v1/live_prices",
                         headers={"apikey": k, "Authorization": f"Bearer {k}"},
                         params={"select": "last_price", "symbol": f"eq.{symbol}"}, timeout=8)
        j = r.json()
        return float(j[0]["last_price"]) if j else None
    except Exception as e:
        print(f"  (fiyat alınamadı: {e})")
        return None


def build_order(symbol, price, lots, order_type="2", api_cmd=3, clordid=""):
    """NewOrder — MatriksIQ tam-alan formatı. Matriks (2026-08-28): OrderType LMT=2/PYS=1,
    yeni emir ApiCommands=3. Broker reddi [ClOrdIDEmpty] → benzersiz ClOrdID (müşteri
    emir kimliği) ŞART."""
    # Matriks resmi Python örneği (apicontrol.txt) ile BİREBİR — minimal 12 alan.
    # DOĞRU alan adı ClientOrderId (ClOrdID DEĞİL). Quantity tek/int. ExchangeId YOK.
    return {
        "AccountId": ACCOUNT_ID,
        "BrokageId": BROKAGE_ID,
        "ClientOrderId": clordid,     # benzersiz müşteri-emir-kimliği (boş olamaz)
        "Symbol": symbol,
        "Price": float(price),
        "Quantity": int(lots),        # tek alan, int
        "OrderSide": 1,               # 1=Alış, 2=Satış
        "OrderType": order_type,      # "2"=Limit, "1"=PYS
        "IncludeAfterSession": False,
        "TimeInForce": "0",           # Day
        "TransactionType": "1",       # Normal=LONG
        "ApiCommands": api_cmd,       # 3=NewOrder
    }


def main():
    global BROKAGE_ID, ACCOUNT_ID, EXCHANGE_ID
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="DEMO hesabına GERÇEKTEN gönder (kullanıcı çalıştırır).")
    ap.add_argument("--symbol", default="GARAN")
    ap.add_argument("--lots", type=int, default=1)
    ap.add_argument("--price", type=float, default=None, help="Elle limit fiyatı (yoksa market %%5 altı).")
    ap.add_argument("--seconds", type=int, default=10, help="Yanıt dinleme süresi.")
    ap.add_argument("--ordertype", default="2", help="OrderType — Matriks: LMT=2, PYS=1.")
    ap.add_argument("--apicommands", type=int, default=3, help="Yeni emir komutu — Matriks: 3 (doküman 4).")
    ap.add_argument("--brokage", default=BROKAGE_ID, help="BrokageId (ListAccounts'tan).")
    ap.add_argument("--account", default=ACCOUNT_ID, help="AccountId (ListAccounts'tan).")
    ap.add_argument("--exchange", type=int, default=EXCHANGE_ID, help="ExchangeId (4=BİST).")
    a = ap.parse_args()
    BROKAGE_ID, ACCOUNT_ID, EXCHANGE_ID = a.brokage, a.account, a.exchange

    px = a.price
    if px is None:
        cur = last_price(a.symbol)
        if cur:
            px = round(cur * 0.95, 2)
            print(f"{a.symbol} son fiyat ~{cur} → limit BUY {px} (market %5 altı → dolmaz, dinlenir)")
        else:
            print("Fiyat alınamadı — --price ile elle ver."); return

    clordid = str(int(time.time() * 1000))  # benzersiz müşteri-emir-kimliği (ms zaman damgası)
    order = build_order(a.symbol, px, a.lots, order_type=a.ordertype, api_cmd=a.apicommands, clordid=clordid)
    print("\nKURULACAK EMİR:")
    print("  " + json.dumps(order, ensure_ascii=False))

    if not a.live:
        print("\nDRY-RUN — GÖNDERİLMEDİ. Canlı (demo) test için KULLANICI çalıştırır:")
        print(f"  python order_test.py --live --symbol {a.symbol} --lots {a.lots}")
        return

    print(f"\n[LIVE] {a.symbol} {a.lots} lot BUY @{px} → DEMO hesabına gönderiliyor…")
    s = socket.create_connection((HOST, PORT), timeout=8)
    s.settimeout(1.0)
    s.sendall(m.frame(m.HANDSHAKE_JSON))
    time.sleep(1.0)
    s.sendall(m.frame(order))
    print("→ emir gönderildi. Yanıt/exec-report dinleniyor…")
    buffer = b""
    end = time.time() + a.seconds
    followup_sent = False
    order_start = time.time()
    while time.time() < end:
        # Emirden 2.5s sonra ListOrders(3) → emir deftere düştü mü teşhis et
        if not followup_sent and time.time() - order_start > 2.5:
            s.sendall(m.frame(m.list_orders(BROKAGE_ID, ACCOUNT_ID, EXCHANGE_ID)))
            print("→ (teşhis) ListOrders gönderildi — emir deftere düştü mü?")
            followup_sent = True
        try:
            chunk = s.recv(65536)
        except socket.timeout:
            continue
        if not chunk:
            print("[bağlantı kapandı]"); break
        print(f"  [HAM {len(chunk)}B] {chunk[:400]!r}")
        buffer += chunk
        msgs, buffer = m.deframe(buffer)
        for o in msgs:
            print("  [YANIT] " + json.dumps(o, ensure_ascii=False)[:500])
            if isinstance(o, dict) and "OrdStatus" in o:
                p = m.parse_exec_report(o)
                print(f"     → OrdStatus={o.get('OrdStatus')} ({p['status_label']}) "
                      f"OrderID={o.get('OrderID')} OrderID2={o.get('OrderID2')} "
                      f"Filled={o.get('FilledQty')} Leaves={o.get('LeavesQty')} AvgPx={o.get('AvgPx')}")
    s.close()
    print("[bitti] — OrderID/OrderID2'yi not al (iptal için gerekebilir).")


if __name__ == "__main__":
    main()
