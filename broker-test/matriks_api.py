#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MatriksIQ "Dışarıdan Emir Kabulü" — SAF API KATMANI (I/O YOK, tam test edilebilir).

Kaynak: MatriksIQ_DisaridanEmirKabulu_API_Dokumani.pdf v1.0 (2026-08-21).
Bu modül YALNIZCA mesaj kurar + doğrular + execution-report çözer. Soket/ağ YOK
(o matriks_order_bridge.py'de). Böylece Matriks'e bağlanmadan format doğrulanır.

✅ CANLI DEMO'DA TEYİTLENDİ (2026-08-31, order_lab.py ile 8 faz): NewOrder=3/Cancel=4/
Edit=5/KA=7; OrderType 2=Limit/1=PYS(market); TransactionType 1/2(short-aç)/6(cover) —
hepsi çalıştı. Market emri TIF FaK(3)/FoK(4) ZORUNLU. Exec-report: OrderID senkron,
OrderID2 2.push (`*1`resting/`*0`fill), ClientOrderID echo (büyük-ID), OrdStatus STRING,
Explanation=sebep. ⚠️ Geçersiz sembol = SESSİZ düşme (0 yanıt) → gönderen taraf doğrulamalı.
GÜVENLİK: Bu katman emir GÖNDERMEZ — yalnız Python dict/bytes üretir.
"""

import json

# ── PAKET ÇERÇEVELEME ───────────────────────────────────────────────────────
# Spec: her JSON paketinin sonuna char(11) (paket-bitti işareti) eklenir.
PACKET_TERMINATOR = chr(11)  # 0x0B (Vertical Tab)

# İlk el sıkışma: mesajlaşma tipini seç. DİKKAT (2026-08-28 probe ile bulundu):
# düz string DEĞİL, JSON obje gönderilmeli → {"MessageType":"SetMessageType0"}.
# (Düz "SetMessageType0" string'i sunucu yok sayıyor; JSON ile hesap yanıtı geliyor.)
HANDSHAKE_JSON = {"MessageType": "SetMessageType0"}       # JSON mesajlaşma
HANDSHAKE_BYTEARRAY = {"MessageType": "SetMessageType1"}  # byteArray mesajlaşma


# ── KOD TABLOLARI ───────────────────────────────────────────────────────────
# ⚠️ GERÇEK değerler Matriks resmi Python örneğinden (apicontrol.txt, 2026-08-28) —
# doküman TABLOSU YANLIŞ/KAYIK. Demo'da GARAN emri bu değerlerle GEÇTİ.
class ApiCmd:
    LIST_ACCOUNTS = 0   # {ApiCommands:0} → Accounts push (handshake da otomatik döndürür)
    LIST_POSITIONS = 1  # BrokageId+AccountId+ExchangeId
    LIST_ORDERS = 2
    NEW_ORDER = 3       # ✓ TEYİTLİ (doküman "4" diyordu)
    CANCEL_ORDER = 4
    EDIT_ORDER = 5
    KEEP_ALIVE = 7


class OrderSide:  # ⚠️ DİKKAT: Side tablosu 0/1 ama EMİR alanı OrderSide 1/2!
    BUY = 1
    SELL = 2


class TransactionType:  # SHORT/cover yön kodları BURADA (Osmanlı'da eksikti)
    NORMAL = 1              # LONG al/sat
    SHORT_DEFAULT = 2       # açığa satış
    SHORT_INTRADAY = 3      # gün-içi kapanacak açığa satış
    CLOSE_SHORT = 6         # açığa satış kapama (cover)


class TimeInForce:
    DAY = 0
    GTC = 1            # iptal edilene dek
    OPENING = 2        # açılış
    IOC = 3            # kalanı iptal
    FOK = 4            # ya hep ya hiç
    GTD = 6            # tarihli (ExpireDate ile)
    CLOSING = 7        # kapanış
    SESSION = 8        # seans
    EQUALIZER = 9      # dengeleyici


class Exchange:
    BIST_SPOT = 4      # bizim kullanacağımız
    VIOP = 9
    INDEX = 27
    CRYPTO = 65


# Execution-report OrdStatus kodları (int + bazıları harf)
ORD_STATUS = {
    0: "Bekliyor", 1: "Parçalı", 2: "Gerçekleşti", 4: "İptal", 5: "Düzeltildi",
    6: "İptalBekliyor", 7: "Durduruldu", 8: "Reddedildi", 9: "Beklemede",
    "A": "İletilmeyiBekliyor", "C": "ZamanAşımı", "E": "DüzeltmeGönderildi", "Z": "Silinmiş",
}
ORD_FILLED = 2       # fill teyidi bu koddan (ACK'ten DEĞİL)
ORD_PARTIAL = 1
ORD_REJECTED = 8
ORD_CANCELLED = 4

# ✓ OrderType TEYİTLİ (Matriks e-postası + apicontrol.txt + demo round-trip):
#    "2"=Limit, "1"=PYS. Emirler string gönderir; NORMAL SEÇİM = "2" (Limit).
class OrderType:
    LIMIT = "2"
    PYS = "1"


# ── ÇERÇEVELEME YARDIMCILARI ────────────────────────────────────────────────
def frame(msg) -> bytes:
    """dict/str → sockete yazılacak bytes (JSON + char(11))."""
    payload = msg if isinstance(msg, str) else json.dumps(msg, ensure_ascii=False)
    return (payload + PACKET_TERMINATOR).encode("utf-8")


def deframe(buffer: bytes):
    """char(11) ile ayrılmış tamponu (mesaj-listesi, kalan-tampon) olarak böler.
    Soket akışında parçalı gelen paketleri toparlamak için."""
    text = buffer.decode("utf-8", errors="replace")
    parts = text.split(PACKET_TERMINATOR)
    remainder = parts.pop()  # son parça: eksik/kalan
    msgs = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        try:
            msgs.append(json.loads(p))
        except json.JSONDecodeError:
            msgs.append({"_raw": p, "_parse_error": True})
    return msgs, remainder.encode("utf-8")


# ── SORGU MESAJLARI ─────────────────────────────────────────────────────────
def list_accounts() -> dict:
    """Hesapları listele → BrokageId/AccountId buradan gelir (sonraki her mesajda gerekir)."""
    return {"ApiCommands": ApiCmd.LIST_ACCOUNTS}


def list_positions(brokage_id, account_id, exchange_id=Exchange.BIST_SPOT) -> dict:
    return {"ApiCommands": ApiCmd.LIST_POSITIONS, "BrokageId": brokage_id,
            "AccountId": account_id, "ExchangeId": exchange_id}


def list_orders(brokage_id, account_id, exchange_id=Exchange.BIST_SPOT) -> dict:
    return {"ApiCommands": ApiCmd.LIST_ORDERS, "BrokageId": brokage_id,
            "AccountId": account_id, "ExchangeId": exchange_id}


def keep_alive() -> dict:
    return {"ApiCommands": ApiCmd.KEEP_ALIVE}


# ── EMİR MESAJLARI ──────────────────────────────────────────────────────────
class OrderValidationError(ValueError):
    pass


def new_order(*, brokage_id, account_id, symbol, order_side, quantity, client_order_id,
              transaction_type=TransactionType.NORMAL, price=None,
              order_type="2", time_in_force=TimeInForce.DAY,
              include_after_session=False) -> dict:
    """Yeni emir (ApiCommands 3). MİNİMAL format — Matriks resmi örneğiyle BİREBİR
    (apicontrol.txt, demoda GEÇTİ). GÖNDERMEZ. OrderType "2"=Limit/"1"=PYS.
    ⚠️ Alan `ClientOrderId` (ClOrdID DEĞİL) + BOŞ OLAMAZ. Quantity tek/int. ExchangeId YOK."""
    if not symbol or not isinstance(symbol, str):
        raise OrderValidationError("symbol zorunlu (str)")
    if not client_order_id:
        raise OrderValidationError("client_order_id ZORUNLU (boş olamaz → [ClOrdIDEmpty])")
    if order_side not in (OrderSide.BUY, OrderSide.SELL):
        raise OrderValidationError(f"order_side 1(Buy)/2(Sell) olmalı, geldi: {order_side}")
    if transaction_type not in (TransactionType.NORMAL, TransactionType.SHORT_DEFAULT,
                                TransactionType.SHORT_INTRADAY, TransactionType.CLOSE_SHORT):
        raise OrderValidationError(f"transaction_type geçersiz: {transaction_type}")
    if not isinstance(quantity, int) or quantity <= 0:
        raise OrderValidationError(f"quantity pozitif tamsayı (lot) olmalı, geldi: {quantity}")

    msg = {
        "AccountId": account_id,
        "BrokageId": brokage_id,
        "ClientOrderId": client_order_id,
        "Symbol": symbol,
        "Quantity": quantity,
        "OrderSide": order_side,
        "OrderType": str(order_type),      # "2"=Limit, "1"=PYS
        "IncludeAfterSession": bool(include_after_session),
        "TimeInForce": str(time_in_force),
        "TransactionType": str(transaction_type),
        "ApiCommands": ApiCmd.NEW_ORDER,   # 3
    }
    if price is not None:
        msg["Price"] = price
    return msg


def cancel_order(*, brokage_id, account_id, order_id, order_id2, symbol,
                 order_side, order_type="2", transaction_type=TransactionType.NORMAL) -> dict:
    """İptal (4) — apicontrol.txt TAM ALAN. OrderID+OrderID2 ZORUNLU (NewOrder yanıtı/
    emir-push'undan; yoksa ListOrders'tan). Orijinal emrin OrderSide/OrderType/
    TransactionType'ı da gönderilir."""
    if not order_id or not order_id2:
        raise OrderValidationError("cancel: OrderID ve OrderID2 zorunlu")
    return {
        "AccountId": account_id, "BrokageId": brokage_id,
        "OrderID": order_id, "OrderID2": order_id2, "Symbol": symbol,
        "OrderSide": str(order_side), "OrderType": str(order_type),
        "TransactionType": str(transaction_type), "ApiCommands": ApiCmd.CANCEL_ORDER,
    }


def edit_order(*, brokage_id, account_id, order_id, order_id2, symbol,
               price, leaves_qty, order_side, order_type="2",
               transaction_type=TransactionType.NORMAL) -> dict:
    """Düzelt (5) — apicontrol.txt TAM ALAN. Yeni Price + kalan miktar (LeavesQty).
    ⚠️ StopPx protokolde YOK (broker-stop opsiyonu ayrı strateji kararı)."""
    if not order_id or not order_id2:
        raise OrderValidationError("edit: OrderID ve OrderID2 zorunlu")
    return {
        "AccountId": account_id, "BrokageId": brokage_id,
        "OrderID": order_id, "OrderID2": order_id2, "Symbol": symbol,
        "Price": float(price), "LeavesQty": int(leaves_qty),
        "OrderSide": str(order_side), "OrderType": str(order_type),
        "TransactionType": str(transaction_type), "ApiCommands": ApiCmd.EDIT_ORDER,
    }


# ── AKSİYON EŞLEMESİ (bizim karar → MatriksIQ emri) ─────────────────────────
def order_for_action(action, side, *, brokage_id, account_id, symbol, quantity, client_order_id,
                     price=None, order_type="2",
                     time_in_force=TimeInForce.DAY) -> dict:
    """
    action: "OPEN" | "CLOSE" ; side: "LONG" | "SHORT" (pozisyonun yönü).
      OPEN  LONG  → BUY  + NORMAL
      OPEN  SHORT → SELL + SHORT_DEFAULT
      CLOSE LONG  → SELL + NORMAL
      CLOSE SHORT → BUY  + CLOSE_SHORT (cover)
    """
    action = action.upper(); side = side.upper()
    if action == "OPEN" and side == "LONG":
        os_, tt = OrderSide.BUY, TransactionType.NORMAL
    elif action == "OPEN" and side == "SHORT":
        os_, tt = OrderSide.SELL, TransactionType.SHORT_DEFAULT
    elif action == "CLOSE" and side == "LONG":
        os_, tt = OrderSide.SELL, TransactionType.NORMAL
    elif action == "CLOSE" and side == "SHORT":
        os_, tt = OrderSide.BUY, TransactionType.CLOSE_SHORT
    else:
        raise OrderValidationError(f"bilinmeyen action/side: {action}/{side}")
    return new_order(brokage_id=brokage_id, account_id=account_id, symbol=symbol,
                     order_side=os_, transaction_type=tt, quantity=quantity, price=price,
                     order_type=order_type, time_in_force=time_in_force,
                     client_order_id=client_order_id)


# ── EXECUTION REPORT (PUSH) ÇÖZÜCÜ ──────────────────────────────────────────
def parse_exec_report(obj: dict) -> dict:
    """Emir-durumu push'unu normalize eder. fill teyidi = OrdStatus==2 (ACK'ten DEĞİL).
    ⚠️ DEMO-TEYİT (2026-08-31): OrdStatus STRING gelir ("8"); alan adı ClientOrderID
    (büyük ID); red/durum sebebi Explanation alanında."""
    raw = obj.get("OrdStatus")
    # OrdStatus string ("8") veya int (8) gelebilir → int anahtara normalize et.
    key = raw
    if isinstance(raw, str) and raw.lstrip("-").isdigit():
        key = int(raw)
    return {
        "order_id": obj.get("OrderID"),
        "order_id2": obj.get("OrderID2"),
        "client_order_id": obj.get("ClientOrderID") or obj.get("ClientOrderId"),
        "symbol": obj.get("Symbol"),
        "ord_status": raw,
        "status_label": ORD_STATUS.get(key) or ORD_STATUS.get(str(raw)) or f"bilinmiyor({raw})",
        "explanation": obj.get("Explanation"),
        "filled_qty": obj.get("FilledQty"),
        "leaves_qty": obj.get("LeavesQty"),
        "avg_px": obj.get("AvgPx"),
        "is_fill": key == ORD_FILLED,
        "is_partial": key == ORD_PARTIAL,
        "is_reject": key == ORD_REJECTED,
        "is_cancel": key == ORD_CANCELLED,
    }
