#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MatriksIQ API katmanı — DRY-RUN doğrulama (SOKET YOK, Matriks GEREKMEZ).
Her mesaj tipini kurar + çerçeveler + basar; aksiyon-eşlemesi + exec-report + hata
senaryolarını test eder. `python matriks_dryrun.py` ile çalışır.
"""
import matriks_api as m

# Spec'teki DEMO kimlik değerleri (gerçekleri runtime'da ListAccounts=1'den gelir)
DEMO = dict(brokage_id=7, account_id="0~801949")


def show(title, msg):
    framed = m.frame(msg)
    # char(11)'i görünür kıl
    vis = framed.decode("utf-8").replace(m.PACKET_TERMINATOR, "⟨0x0B⟩")
    print(f"\n▸ {title}\n  {vis}")


def main():
    print("=" * 72)
    print("MatriksIQ 'Dışarıdan Emir Kabulü' — DRY-RUN (offline, soket yok)")
    print("=" * 72)

    print("\n── EL SIKIŞMA + SORGULAR ──")
    show("İlk mesaj (mesajlaşma tipi)", m.HANDSHAKE_JSON)
    show("ListAccounts (1)", m.list_accounts())
    show("ListPositions (2)", m.list_positions(**DEMO))
    show("ListOrders (3)", m.list_orders(**DEMO))
    show("KeepAlive (7 — ⚠️ 5 vs 7 teyit edilecek)", m.keep_alive())

    print("\n── AKSİYON EŞLEMESİ (bizim karar → emir) ──")
    show("OPEN LONG  GARAN 70 lot (BUY+NORMAL)",
         m.order_for_action("OPEN", "LONG", symbol="GARAN", quantity=70, **DEMO))
    show("CLOSE LONG GARAN 70 lot (SELL+NORMAL)",
         m.order_for_action("CLOSE", "LONG", symbol="GARAN", quantity=70, **DEMO))
    show("OPEN SHORT XYZ 100 lot (SELL+SHORT_DEFAULT)",
         m.order_for_action("OPEN", "SHORT", symbol="XYZ", quantity=100, **DEMO))
    show("CLOSE SHORT XYZ 100 lot / cover (BUY+CLOSE_SHORT)",
         m.order_for_action("CLOSE", "SHORT", symbol="XYZ", quantity=100, **DEMO))

    print("\n── LİMİT + STOP + İPTAL/DÜZELT ──")
    show("Limit BUY GARAN @134.50",
         m.new_order(symbol="GARAN", order_side=m.OrderSide.BUY, quantity=70,
                     price=134.50, time_in_force=m.TimeInForce.DAY, **DEMO))
    show("Stop emri (StopPx — broker-stop opsiyonu, strateji kararı AYRI)",
         m.new_order(symbol="GARAN", order_side=m.OrderSide.SELL, quantity=70,
                     stop_px=129.00, **DEMO))
    show("CancelOrder (5)", m.cancel_order("1258195", "1258195*8,0300"))
    show("EditOrder (6) — fiyat düzelt", m.edit_order("1258195", "1258195*8,0300", Price=135.00))

    print("\n── EXECUTION REPORT (PUSH) ÇÖZÜMÜ ──")
    for rep in [
        {"OrderID": "1258195", "Symbol": "GARAN", "OrdStatus": 2, "FilledQty": 70, "LeavesQty": 0, "AvgPx": 134.55},
        {"OrderID": "1258196", "Symbol": "GARAN", "OrdStatus": 1, "FilledQty": 30, "LeavesQty": 40, "AvgPx": 134.60},
        {"OrderID": "1258197", "Symbol": "XYZ", "OrdStatus": 8, "FilledQty": 0, "LeavesQty": 100},
    ]:
        p = m.parse_exec_report(rep)
        tag = "✅FILL" if p["is_fill"] else "🟡PARÇALI" if p["is_partial"] else "❌RED" if p["is_reject"] else "…"
        print(f"  {tag} {p['symbol']:6} OrdStatus={p['ord_status']}({p['status_label']}) filled={p['filled_qty']} leaves={p['leaves_qty']} avg={p['avg_px']}")

    print("\n── DOĞRULAMA (hata senaryoları — reddedilmeli) ──")
    for label, fn in [
        ("qty=0",        lambda: m.new_order(symbol="GARAN", order_side=m.OrderSide.BUY, quantity=0, **DEMO)),
        ("qty=1.5",      lambda: m.new_order(symbol="GARAN", order_side=m.OrderSide.BUY, quantity=1.5, **DEMO)),
        ("order_side=3", lambda: m.new_order(symbol="GARAN", order_side=3, quantity=70, **DEMO)),
        ("symbol boş",   lambda: m.new_order(symbol="", order_side=m.OrderSide.BUY, quantity=70, **DEMO)),
        ("cancel eksik", lambda: m.cancel_order("1258195", "")),
    ]:
        try:
            fn(); print(f"  ⚠️ HATA YAKALANMADI: {label}")
        except m.OrderValidationError as e:
            print(f"  ✅ reddedildi ({label}): {e}")

    print("\n" + "=" * 72)
    print("DRY-RUN tamam. ⚠️ AÇIK: OrderType değer tablosu (şu an placeholder 2),")
    print("KeepAlive 5↔7, market-emri fiyat davranışı → demo açılınca Matriks'e sor.")
    print("=" * 72)


if __name__ == "__main__":
    main()
