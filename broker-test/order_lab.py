#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
order_lab.py — MatriksIQ "Dışarıdan Emir Kabulü" CANLI TEST KONSOLU (Pazartesi 31 Ağu).

TEK KALICI OTURUM: bir kez bağlanır, handshake + keep-alive'ı sürdürür, gelen TÜM
push'ları (özellikle execution-report) canlı basar; sen komut yazdıkça emir gönderir.
Böylece async fill/iptal/red bildirimleri KAÇMAZ (order_test.py her seferinde soket
açıp kapatıyordu → push'ları kaçırıyordu). Her giden/gelen mesaj JSONL'e loglanır.

GÜVENLİK: DRY-RUN varsayılan (emirleri KURAR + BASAR, GÖNDERMEZ, bağlanmaz).
`--live` DEMO hesabına GERÇEKTEN gönderir → KULLANICI kendi eliyle çalıştırır ve her
komutu kendi yazar (insan-döngüde). Claude canlı emir göndermez.

Osmanlı demo (2026-08-28 ListAccounts): BrokageId 8 / AccountId 342447 / ExchangeId 4.
Demo SON gün: 31 Ağu (Pazartesi). İlk iş: demo hâlâ geçerli mi (accounts) doğrula.

Komutlar (REPL):
  help                          bu yardım
  accounts                      ListAccounts(0)
  pos                           ListPositions(1)
  list                          ListOrders(2)
  buy   SYM LOT [PRICE]         LONG aç, dolmaz-resting (PRICE yoksa son*0.95)     [FAZ1]
  fill  SYM LOT [PRICE]         LONG aç, dolur-crossing (PRICE yoksa son*1.02)     [FAZ2]
  sell  SYM LOT [PRICE]         LONG kapat SELL+Normal (PRICE yoksa son*0.98)      [FAZ3]
  short SYM LOT [PRICE]         SHORT aç SELL+TT2 (PRICE yoksa son*0.98)           [FAZ5]
  cover SYM LOT [PRICE]         SHORT kapat BUY+TT6 (PRICE yoksa son*1.02)         [FAZ5]
  market SYM buy|sell LOT [OT]  Market probe (OrderType OT, vars. "1"=PYS)          [FAZ4]
  cancel [CLORDID]              İptal(4) — son emri ya da verilen ClientOrderId'i   [FAZ1]
  cancel OID OID2 SYM buy|sell  İptal(4) açık form — registry'de olmayan emir (dünkü resting)
  edit  CLORDID PRICE [LEAVES]  Düzelt(5) — yeni fiyat + kalan miktar               [FAZ1]
  reg                           yerel emir kaydını göster (ClOrdId→OrderID/durum)
  raw {json}                    ham JSON gönder (kaçış kapısı)
  quit                          çık
"""
import os
import sys
import json
import time
import socket
import argparse
import threading
from datetime import datetime

# Windows konsolu (cp1254) emoji/ok karakterinde ÇÖKMESİN — utf-8'e sabitle.
# (Pazartesi canlı çalışacak; terminal render edemezse bile crash yerine '?' bassın.)
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import matriks_api as m

HOST = os.getenv("MATRIKS_HOST", "127.0.0.1")
PORT = int(os.getenv("MATRIKS_PORT", "18890"))

# ── Global durum ────────────────────────────────────────────────────────────
LIVE = False
SOCK = None
SEND_LOCK = threading.Lock()
STOP = threading.Event()
LOGF = None
BROKAGE_ID = "8"
ACCOUNT_ID = "342447"
EXCHANGE_ID = m.Exchange.BIST_SPOT  # 4

# ClientOrderId → {order_id, order_id2, symbol, side, tt, status, clordid}
REGISTRY = {}
LAST_CLORDID = None
_CLO_SEQ = 0


def next_clordid():
    """Benzersiz ClientOrderId — ms damgası + sayaç (aynı ms'de çakışmasın; broker
    benzersiz ClOrdId ister)."""
    global _CLO_SEQ
    _CLO_SEQ += 1
    return f"{int(time.time() * 1000)}-{_CLO_SEQ}"


def ts():
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def log(direction, obj):
    """Her giden/gelen mesajı JSONL'e yaz (Pazartesi kanıt + memory teyidi)."""
    if LOGF:
        rec = {"t": datetime.now().isoformat(), "dir": direction, "msg": obj}
        LOGF.write(json.dumps(rec, ensure_ascii=False) + "\n")
        LOGF.flush()


def out(line):
    """REPL prompt'unu bozmadan satır bas."""
    sys.stdout.write("\r" + line + "\n> ")
    sys.stdout.flush()


# ── Supabase son fiyat (güvenli/crossing fiyat üretimi için) ────────────────
_env_cache = None
def _env():
    global _env_cache
    if _env_cache is None:
        _env_cache = {}
        try:
            for line in open(os.path.join("..", ".env.local"), encoding="utf-8"):
                if "=" in line and not line.strip().startswith("#"):
                    k, _, v = line.strip().partition("=")
                    _env_cache[k] = v.strip().strip('"').strip("'")
        except Exception:
            pass
    return _env_cache


def last_price(symbol):
    try:
        import requests
        e = _env()
        u = e["NEXT_PUBLIC_SUPABASE_URL"]; k = e["SUPABASE_SERVICE_ROLE_KEY"]
        r = requests.get(f"{u}/rest/v1/live_prices",
                         headers={"apikey": k, "Authorization": f"Bearer {k}"},
                         params={"select": "last_price", "symbol": f"eq.{symbol}"}, timeout=8)
        j = r.json()
        return float(j[0]["last_price"]) if j else None
    except Exception as ex:
        out(f"  (fiyat alınamadı: {ex})")
        return None


def bist_tick(px):
    """BİST pay fiyat adımı (kademe) tablosu. 2026-08-31 demo reddi: 125.97 geçersiz
    (132 seviyesinde tick 0.10). Auto-fiyatı geçerli kademeye oturtmak için."""
    if px < 20:   return 0.01
    if px < 50:   return 0.02
    if px < 100:  return 0.05
    if px < 250:  return 0.10
    if px < 500:  return 0.25
    if px < 1000: return 0.50
    return 1.00


def snap_tick(px):
    """En yakın geçerli fiyat adımına yuvarla (float artığını temizle)."""
    t = bist_tick(px)
    return round(round(px / t) * t, 2)


def resolve_price(symbol, explicit, factor, label):
    if explicit is not None:
        return float(explicit)  # elle verilen fiyat AYNEN (FAZ 6c geçersiz-tick testi için ham)
    cur = last_price(symbol)
    if cur is None:
        out(f"  ⚠️ {symbol} son fiyat yok — PRICE elle ver."); return None
    px = snap_tick(cur * factor)
    out(f"  {symbol} son ~{cur} → {label} fiyat {px} (tick {bist_tick(px)}, ×{factor})")
    return px


# ── Soket gönderim ──────────────────────────────────────────────────────────
def send(obj, tag=""):
    """Mesajı bas + logla; LIVE ise sokete yaz. DRY-RUN'da yalnız kurar/basar."""
    line = json.dumps(obj, ensure_ascii=False)
    print(f"  → GÖNDER {tag}: {line}")
    log("send", obj)
    if not LIVE:
        print("     [DRY-RUN — gönderilmedi]")
        return
    with SEND_LOCK:
        SOCK.sendall(m.frame(obj))


def register(clordid, order):
    global LAST_CLORDID
    REGISTRY[clordid] = {
        "clordid": clordid, "symbol": order.get("Symbol"),
        "side": order.get("OrderSide"), "tt": order.get("TransactionType"),
        "order_id": None, "order_id2": None, "status": "gönderildi",
    }
    LAST_CLORDID = clordid


# ── Gelen mesaj işleyici (reader thread) ────────────────────────────────────
def handle_incoming(obj):
    log("recv", obj)
    # execution-report mı?
    if isinstance(obj, dict) and "OrdStatus" in obj:
        p = m.parse_exec_report(obj)
        tag = ("✅FILL" if p["is_fill"] else "🟡PARÇALI" if p["is_partial"]
               else "❌RED" if p["is_reject"] else "🚫İPTAL" if p["is_cancel"] else "…")
        # Registry güncelle (ClientOrderID ile eşle — DEMO: büyük ID)
        clo = p["client_order_id"]
        if clo and clo in REGISTRY:
            REGISTRY[clo]["order_id"] = p["order_id"]
            REGISTRY[clo]["order_id2"] = p["order_id2"]
            REGISTRY[clo]["status"] = p["status_label"]
        expl = f" · {p['explanation']}" if p.get("explanation") else ""
        out(f"{tag} {p['symbol']} OrdStatus={p['ord_status']}({p['status_label']}) "
            f"OrderID={p['order_id']} OrderID2={p['order_id2']} "
            f"filled={p['filled_qty']} leaves={p['leaves_qty']} avg={p['avg_px']} "
            f"ClOrdId={clo}{expl}")
    elif isinstance(obj, dict) and "PositionId" in obj:
        # Pozisyon push'u (emir olayında hesap tüm pozisyonları yayınlar) → tek satır özet.
        out(f"[POZ] {obj.get('Symbol')} Qty={obj.get('QtyTFormatted', obj.get('QtyT'))} "
            f"Maliyet={obj.get('AvgCost')} Son={obj.get('LastPx')} PL={obj.get('PLFormatted', obj.get('PL'))}")
    else:
        # accounts / orders / diğer
        preview = json.dumps(obj, ensure_ascii=False)
        out(f"[PUSH] {preview[:600]}")


def reader():
    buf = b""
    SOCK.settimeout(1.0)
    while not STOP.is_set():
        try:
            chunk = SOCK.recv(65536)
        except socket.timeout:
            continue
        except OSError:
            break
        if not chunk:
            out("[bağlantı kapandı]"); STOP.set(); break
        buf += chunk
        msgs, buf = m.deframe(buf)
        for o in msgs:
            handle_incoming(o)


def keepalive_loop():
    while not STOP.is_set():
        if STOP.wait(20):
            break
        try:
            send(m.keep_alive(), tag="keepalive")
        except Exception as e:
            out(f"[keepalive hata: {e}]"); break


# ── Komut işleyiciler ───────────────────────────────────────────────────────
def do_order(action_label, side, tt, symbol, lots, price):
    clordid = next_clordid()
    order = m.new_order(brokage_id=BROKAGE_ID, account_id=ACCOUNT_ID, symbol=symbol,
                        order_side=side, transaction_type=tt, quantity=lots,
                        client_order_id=clordid, price=price,
                        order_type=m.OrderType.LIMIT, time_in_force=m.TimeInForce.DAY)
    register(clordid, order)
    send(order, tag=f"{action_label} clordid={clordid}")


def cmd_buy(a):    # LONG aç, resting (dolmaz)
    px = resolve_price(a[0], a[2] if len(a) > 2 else None, 0.95, "resting-BUY")
    if px is not None: do_order("BUY(resting)", m.OrderSide.BUY, m.TransactionType.NORMAL, a[0], int(a[1]), px)

def cmd_fill(a):   # LONG aç, crossing (dolur)
    px = resolve_price(a[0], a[2] if len(a) > 2 else None, 1.02, "crossing-BUY")
    if px is not None: do_order("BUY(fill)", m.OrderSide.BUY, m.TransactionType.NORMAL, a[0], int(a[1]), px)

def cmd_sell(a):   # LONG kapat
    px = resolve_price(a[0], a[2] if len(a) > 2 else None, 0.98, "crossing-SELL")
    if px is not None: do_order("SELL(close-long)", m.OrderSide.SELL, m.TransactionType.NORMAL, a[0], int(a[1]), px)

def cmd_short(a):  # SHORT aç
    px = resolve_price(a[0], a[2] if len(a) > 2 else None, 0.98, "SHORT-open")
    if px is not None: do_order("SHORT(open)", m.OrderSide.SELL, m.TransactionType.SHORT_DEFAULT, a[0], int(a[1]), px)

def cmd_cover(a):  # SHORT kapat (cover)
    px = resolve_price(a[0], a[2] if len(a) > 2 else None, 1.02, "COVER")
    if px is not None: do_order("COVER(close-short)", m.OrderSide.BUY, m.TransactionType.CLOSE_SHORT, a[0], int(a[1]), px)

def cmd_market(a):
    # market SYM buy|sell LOT [ORDERTYPE] [TIF]
    # DEMO-TEYİT (2026-08-31): market emri (OrderType "1"=PYS) sürekli seansta
    # TimeInForce = 3 (FaK/Kalanı-İptal) veya 4 (FoK) ZORUNLU; "0"(Gün) → REDDEDİLİR
    # (<-420027> "Market-price orders must be Fill or Kill / Fill and Kill").
    sym = a[0]; side = m.OrderSide.BUY if a[1].lower() == "buy" else m.OrderSide.SELL
    lots = int(a[2]); otype = a[3] if len(a) > 3 else m.OrderType.PYS  # "1"
    tif = a[4] if len(a) > 4 else m.TimeInForce.IOC  # 3 = FaK (market için zorunlu)
    clordid = next_clordid()
    order = m.new_order(brokage_id=BROKAGE_ID, account_id=ACCOUNT_ID, symbol=sym,
                        order_side=side, transaction_type=m.TransactionType.NORMAL,
                        quantity=lots, client_order_id=clordid, price=None,
                        order_type=otype, time_in_force=tif)
    register(clordid, order)
    out(f"  MARKET — OrderType={otype}, TimeInForce={tif} (FaK), Price YOK.")
    send(order, tag=f"MARKET clordid={clordid}")

def cmd_cancel(a):
    # AÇIK FORM: cancel OID OID2 SYM buy|sell  → registry'de olmayan emir (örn dünkü resting).
    if len(a) >= 4:
        oid, oid2, sym, sd = a[0], a[1], a[2], a[3].lower()
        side = m.OrderSide.BUY if sd == "buy" else m.OrderSide.SELL
        msg = m.cancel_order(brokage_id=BROKAGE_ID, account_id=ACCOUNT_ID,
                             order_id=oid, order_id2=oid2, symbol=sym, order_side=side)
        send(msg, tag=f"CANCEL(açık) OID={oid}"); return
    # REGISTRY FORMU: cancel [CLORDID]  (yoksa son emir)
    clo = a[0] if a else LAST_CLORDID
    if not clo or clo not in REGISTRY:
        out(f"  ⚠️ ClientOrderId bulunamadı ({clo}). Önce `reg`/`list` bak; ya da açık form: "
            f"cancel OID OID2 SYM buy|sell"); return
    r = REGISTRY[clo]
    if not r["order_id"] or not r["order_id2"]:
        out(f"  ⚠️ {clo} için OrderID/OrderID2 henüz YOK (fill/ack push'u gelmemiş). "
            f"`list` ile ListOrders çekip eşle, sonra iptal et."); return
    msg = m.cancel_order(brokage_id=BROKAGE_ID, account_id=ACCOUNT_ID,
                         order_id=r["order_id"], order_id2=r["order_id2"], symbol=r["symbol"],
                         order_side=r["side"] or m.OrderSide.BUY, transaction_type=r["tt"] or 1)
    send(msg, tag=f"CANCEL clordid={clo}")

def cmd_edit(a):
    clo = a[0]; new_px = float(a[1]); leaves = int(a[2]) if len(a) > 2 else 1
    if clo not in REGISTRY:
        out(f"  ⚠️ {clo} kayıtta yok."); return
    r = REGISTRY[clo]
    if not r["order_id"] or not r["order_id2"]:
        out(f"  ⚠️ {clo} için OrderID/OrderID2 yok. `list` çek."); return
    msg = m.edit_order(brokage_id=BROKAGE_ID, account_id=ACCOUNT_ID,
                       order_id=r["order_id"], order_id2=r["order_id2"], symbol=r["symbol"],
                       price=new_px, leaves_qty=leaves,
                       order_side=r["side"] or m.OrderSide.BUY, transaction_type=r["tt"] or 1)
    send(msg, tag=f"EDIT clordid={clo}")

def cmd_reg(a):
    if not REGISTRY:
        out("  (kayıt boş)"); return
    for clo, r in REGISTRY.items():
        mark = " ←son" if clo == LAST_CLORDID else ""
        out(f"  {clo} {r['symbol']} side={r['side']} tt={r['tt']} "
            f"OrderID={r['order_id']} OrderID2={r['order_id2']} durum={r['status']}{mark}")


COMMANDS = {
    "accounts": lambda a: send(m.list_accounts(), tag="ListAccounts"),
    "pos":      lambda a: send(m.list_positions(BROKAGE_ID, ACCOUNT_ID, EXCHANGE_ID), tag="ListPositions"),
    "list":     lambda a: send(m.list_orders(BROKAGE_ID, ACCOUNT_ID, EXCHANGE_ID), tag="ListOrders"),
    "buy": cmd_buy, "fill": cmd_fill, "sell": cmd_sell, "short": cmd_short,
    "cover": cmd_cover, "market": cmd_market, "cancel": cmd_cancel, "edit": cmd_edit,
    "reg": cmd_reg,
}


def repl():
    print(__doc__)
    mode = "🔴 LIVE (GERÇEK demo emri)" if LIVE else "🟡 DRY-RUN (gönderilmez)"
    print(f"\n=== order_lab {mode} | Brokage {BROKAGE_ID} / Account {ACCOUNT_ID} / Exchange {EXCHANGE_ID} ===")
    print("Komut için `help`, çıkış `quit`.\n")
    while True:
        try:
            raw = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not raw:
            continue
        if raw in ("quit", "exit", "q"):
            break
        if raw == "help":
            print(__doc__); continue
        if raw.startswith("raw "):
            try:
                send(json.loads(raw[4:]), tag="RAW")
            except Exception as e:
                print(f"  ham JSON hatası: {e}")
            continue
        parts = raw.split()
        cmd, args = parts[0], parts[1:]
        fn = COMMANDS.get(cmd)
        if not fn:
            print(f"  bilinmeyen komut: {cmd} (help)"); continue
        try:
            fn(args)
        except (IndexError, ValueError) as e:
            print(f"  argüman hatası: {e} — `help`")
        except m.OrderValidationError as e:
            print(f"  ❌ doğrulama: {e}")
        except Exception as e:
            print(f"  hata: {e}")


def main():
    global LIVE, SOCK, LOGF, BROKAGE_ID, ACCOUNT_ID, EXCHANGE_ID
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="DEMO hesabına GERÇEKTEN gönder (kullanıcı çalıştırır).")
    ap.add_argument("--brokage", default=BROKAGE_ID)
    ap.add_argument("--account", default=ACCOUNT_ID)
    ap.add_argument("--exchange", type=int, default=EXCHANGE_ID)
    ap.add_argument("--log", default=None, help="JSONL log yolu (vars. order_lab_YYYYMMDD.jsonl).")
    a = ap.parse_args()
    LIVE = a.live
    BROKAGE_ID, ACCOUNT_ID, EXCHANGE_ID = a.brokage, a.account, a.exchange
    logpath = a.log or f"order_lab_{datetime.now():%Y%m%d}.jsonl"
    LOGF = open(logpath, "a", encoding="utf-8")
    print(f"[log → {logpath}]")

    if LIVE:
        print(f"[LIVE] {HOST}:{PORT} bağlanılıyor…")
        SOCK = socket.create_connection((HOST, PORT), timeout=8)
        SOCK.sendall(m.frame(m.HANDSHAKE_JSON))
        log("send", m.HANDSHAKE_JSON)
        time.sleep(0.5)
        threading.Thread(target=reader, daemon=True).start()
        threading.Thread(target=keepalive_loop, daemon=True).start()
        time.sleep(0.5)
    try:
        repl()
    finally:
        STOP.set()
        if SOCK:
            try: SOCK.close()
            except Exception: pass
        if LOGF:
            LOGF.close()
        print("\n[bitti]")


if __name__ == "__main__":
    main()
