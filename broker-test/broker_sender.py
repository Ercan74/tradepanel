#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
İZOLE broker gönderim modülü — DRY-RUN varsayılan. Mevcut sisteme SIFIR temas.

AMAÇ: Broker'ın webhook'una gidecek emir JSON'unu DOĞRU kurup DOĞRULAMAK.
Test/sandbox modu OLMADIĞI için canlıdan önce güvenilir tek kontrol budur.

GÜVENLİK SINIRLARI (değişmez):
  * Varsayılan DRY-RUN: JSON kurulur, EKRANA basılır, GÖNDERİLMEZ.
  * Canlı gönderim yalnız açık '--live' bayrağı + kullanıcının kendi eliyle çalıştırmasıyla olur.
    Bu modülü canlı emir için Claude ÇALIŞTIRMAZ — kullanıcı çalıştırır.
  * apiKey / token / webhook URL gizli: broker.env'den okunur, ASLA loglanmaz/commit edilmez.

Broker format (kullanıcıdan teyitli):
  quantity = LOT (BIST'te 1 lot = 1 adet)
  orderType = mktbest (piyasa en iyi fiyat) — limit/market de var, mktbest tercih ediliyor
  orderSide = buy | sell | shortsell
  timeInForce = day (gtc olası)
  timenow = TradingView {{timenow}} muadili (UTC ISO8601 'Z') — broker bu formatı bekliyordu
"""

import os, sys, json, argparse
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))

# ---- izin verilen değer kümeleri (broker dokümanı netleştikçe genişler) ----
ORDER_SIDES = {"buy", "sell", "shortsell"}   # sell=long kapat? cover=? -> KAPANIŞ kodları teyit bekliyor
ORDER_TYPES = {"mktbest", "limit", "market"}
TIF_VALUES  = {"day", "gtc"}


def load_cfg():
    """broker.env + ortam değişkenlerinden gizli config. Değerler ASLA yazdırılmaz."""
    cfg = {
        "url":     os.environ.get("BROKER_WEBHOOK_URL"),
        "api_key": os.environ.get("BROKER_API_KEY"),
        "token":   os.environ.get("BROKER_TOKEN"),
    }
    p = os.path.join(HERE, "broker.env")
    keymap = {"BROKER_WEBHOOK_URL": "url", "BROKER_API_KEY": "api_key", "BROKER_TOKEN": "token"}
    if os.path.exists(p):
        for raw in open(p, encoding="utf-8"):
            s = raw.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k, v = s.split("=", 1)
            k = k.strip(); v = v.strip().strip('"').strip("'")
            if k in keymap and not cfg.get(keymap[k]):
                cfg[keymap[k]] = v
    return cfg


def tv_timenow():
    """TradingView {{timenow}} muadili: UTC ISO8601 'Z'. Broker bu deseni bekliyordu."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_order(symbol, side, quantity_lot, *, price="", order_type="mktbest",
                tif="day", name="tradepanel", api_key="", token=""):
    """Broker JSON'unu kullanıcının paylaştığı desene BİREBİR uygun kurar. Doğrulamalı."""
    if side not in ORDER_SIDES:
        raise ValueError(f"orderSide gecersiz: {side!r} (izinli: {sorted(ORDER_SIDES)})")
    if order_type not in ORDER_TYPES:
        raise ValueError(f"orderType gecersiz: {order_type!r} (izinli: {sorted(ORDER_TYPES)})")
    if tif not in TIF_VALUES:
        raise ValueError(f"timeInForce gecersiz: {tif!r} (izinli: {sorted(TIF_VALUES)})")
    q = int(quantity_lot)  # LOT — tam sayı olmalı
    if q <= 0:
        raise ValueError(f"quantity (lot) pozitif tam sayi olmali: {quantity_lot!r}")
    if not symbol or not str(symbol).strip():
        raise ValueError("symbol bos olamaz")
    # limit emri ise price zorunlu; mktbest/market'te referans/yok sayilir
    if order_type == "limit" and (price is None or str(price).strip() == ""):
        raise ValueError("limit emrinde price zorunlu")
    return {
        "name": name,
        "symbol": str(symbol).strip().upper(),
        "orderSide": side,
        "orderType": order_type,
        "price": str(price),
        "quantity": str(q),
        "timeInForce": tif,
        "apiKey": api_key,
        "timenow": tv_timenow(),
        "token": token,
    }


def _masked(payload):
    """apiKey/token maskeli kopya — güvenli yazdırma için."""
    def m(v): return (v[:3] + "…(gizli)") if v else "(bos)"
    return {**payload, "apiKey": m(payload.get("apiKey", "")), "token": m(payload.get("token", ""))}


def send_order(payload, url, dry_run=True):
    """
    dry_run=True (VARSAYILAN): JSON'u maskeli basar, GÖNDERMEZ.
    dry_run=False: gerçek POST — bunu KULLANICI '--live' ile çalıştırır. Claude çalıştırmaz.
    """
    if dry_run:
        print("=== DRY-RUN — GÖNDERİLMEDİ ===")
        print("Hedef URL :", url or "(broker.env'de BROKER_WEBHOOK_URL yok!)")
        print("Payload (apiKey/token maskeli):")
        print(json.dumps(_masked(payload), indent=2, ensure_ascii=False))
        print("Gonderilen gercek JSON'da apiKey/token DOLU olur; govde birebir bu yapidadir.")
        return None
    # ---- CANLI GÖNDERİM (kullanıcı eliyle) ----
    if not url:
        raise RuntimeError("BROKER_WEBHOOK_URL yok — canli gonderim yapilamaz.")
    import urllib.request
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=15) as resp:
        text = resp.read().decode("utf-8", "replace")
        print("HTTP", resp.status)
        print("Yanit:", text)
        return text


def main():
    ap = argparse.ArgumentParser(description="İzole broker emir gönderici (varsayılan DRY-RUN).")
    ap.add_argument("--symbol", default="SASA")
    ap.add_argument("--side", default="buy", choices=sorted(ORDER_SIDES))
    ap.add_argument("--qty", type=int, default=1, help="LOT adedi")
    ap.add_argument("--type", dest="order_type", default="mktbest", choices=sorted(ORDER_TYPES))
    ap.add_argument("--tif", default="day", choices=sorted(TIF_VALUES))
    ap.add_argument("--price", default="", help="limit emri icin; mktbest'te bos")
    ap.add_argument("--live", action="store_true",
                    help="GERCEK emir gonderir. Yalniz KULLANICI kendi eliyle kullanmali.")
    args = ap.parse_args()

    cfg = load_cfg()
    order = build_order(args.symbol, args.side, args.qty, price=args.price,
                        order_type=args.order_type, tif=args.tif,
                        name="tradepanel", api_key=cfg["api_key"] or "", token=cfg["token"] or "")

    # BOŞ PRICE KİLİDİ: ilk canlı denemede boş price ile emir broker'a DÜŞMEDİ
    # (200+TrackingId geldi ama emir hiç oluşmadı). Sihirbaz her zaman {{close}} (gerçek fiyat)
    # gönderiyor. mktbest'te bile referans fiyat gönder.
    if not str(args.price).strip():
        print("UYARI: price BOŞ. Sihirbaz her zaman gerçek fiyat ({{close}}) gönderir;")
        print("       boş price ilk denemede emrin broker'da hiç oluşmamasına yol açmış olabilir.")
        if args.live:
            print(">>> Canli gonderim ENGELLENDI. Guncel fiyati ekle: --price <ornek 2.50>")
            return

    if args.live:
        print("!!! CANLI MOD — GERÇEK EMİR GÖNDERİLECEK !!!")
        print("   %s %s %d LOT (%s)" % (args.side.upper(), order["symbol"], args.qty, args.order_type))
        confirm = input("Devam icin buyuk harfle 'EVET' yaz: ").strip()
        if confirm != "EVET":
            print("Iptal edildi."); return
        send_order(order, cfg["url"], dry_run=False)
    else:
        send_order(order, cfg["url"], dry_run=True)


if __name__ == "__main__":
    main()
