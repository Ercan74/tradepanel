#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MatriksIQ "Dışarıdan Emir Kabulü" — SAF API KATMANI (I/O YOK, tam test edilebilir).

Kaynak: MatriksIQ_DisaridanEmirKabulu_API_Dokumani.pdf v1.0 (2026-08-21).
Bu modül YALNIZCA mesaj kurar + doğrular + execution-report çözer. Soket/ağ YOK
(o matriks_order_bridge.py'de). Böylece Matriks'e bağlanmadan format doğrulanır.

⚠️ AÇIK/TEYİTSİZ noktalar (demo açılınca Matriks'e sorulacak) kodda ⚠️ ile işaretli.
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


# ── KOD TABLOLARI (spec §) ──────────────────────────────────────────────────
class ApiCmd:
    LIST_ACCOUNTS = 1
    LIST_POSITIONS = 2
    LIST_ORDERS = 3
    NEW_ORDER = 4
    CANCEL_ORDER = 5
    EDIT_ORDER = 6
    KEEP_ALIVE = 7  # ⚠️ Doküman metni KeepAlive=5 derken örnek 7 gösteriyor (5=CancelOrder).
                    #    Örneğe uyduk (7); demo'da TEYİT edilecek.


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

# ⚠️ OrderType değer TABLOSU EN BÜYÜK BOŞLUK — dokümanda tanımsız (örneklerde hep "2").
#    Demo açılınca Matriks'ten alınacak. Şimdilik placeholder + açık uyarı.
ORDER_TYPE_UNCONFIRMED = 2  # ⚠️ TEYİTSİZ — market/limit eşlemesi bilinmiyor


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


def new_order(*, brokage_id, account_id, symbol, order_side, quantity,
              transaction_type=TransactionType.NORMAL, price=None,
              order_type=ORDER_TYPE_UNCONFIRMED, time_in_force=TimeInForce.DAY,
              stop_px=None, exchange_id=Exchange.BIST_SPOT,
              include_after_session=False, expire_date=None) -> dict:
    """Yeni emir (ApiCommands 4). Alan doğrulaması yapar; GÖNDERMEZ."""
    if not symbol or not isinstance(symbol, str):
        raise OrderValidationError("symbol zorunlu (str)")
    if order_side not in (OrderSide.BUY, OrderSide.SELL):
        raise OrderValidationError(f"order_side 1(Buy)/2(Sell) olmalı, geldi: {order_side}")
    if transaction_type not in (TransactionType.NORMAL, TransactionType.SHORT_DEFAULT,
                                TransactionType.SHORT_INTRADAY, TransactionType.CLOSE_SHORT):
        raise OrderValidationError(f"transaction_type geçersiz: {transaction_type}")
    if not isinstance(quantity, int) or quantity <= 0:
        raise OrderValidationError(f"quantity pozitif tamsayı (lot) olmalı, geldi: {quantity}")
    if time_in_force not in vars(TimeInForce).values():
        raise OrderValidationError(f"time_in_force geçersiz: {time_in_force}")

    msg = {
        "ApiCommands": ApiCmd.NEW_ORDER,
        "BrokageId": brokage_id,
        "AccountId": account_id,
        "ExchangeId": exchange_id,
        "Symbol": symbol,
        "OrderSide": order_side,
        "TransactionType": transaction_type,
        "OrderType": order_type,          # ⚠️ TEYİTSİZ değer
        "TimeInForce": time_in_force,
        # Lot üç alanda birden isteniyor (spec): Quantity + OrderQty + LeavesQty
        "Quantity": quantity,
        "OrderQty": quantity,
        "LeavesQty": quantity,
        "IncludeAfterSession": bool(include_after_session),
    }
    if price is not None:
        msg["Price"] = price
    if stop_px is not None:
        msg["StopPx"] = stop_px          # koşullu/stop emri (broker-stop opsiyonu — strateji kararı ayrı)
    if expire_date is not None:
        msg["ExpireDate"] = expire_date
    return msg


def cancel_order(order_id, order_id2) -> dict:
    """İptal (5). OrderID + OrderID2 ZORUNLU (NewOrder cevabı / emir-push'undan gelir)."""
    if not order_id or not order_id2:
        raise OrderValidationError("cancel: OrderID ve OrderID2 zorunlu")
    return {"ApiCommands": ApiCmd.CANCEL_ORDER, "OrderID": order_id, "OrderID2": order_id2}


def edit_order(order_id, order_id2, **changes) -> dict:
    """Düzelt (6). OrderID+OrderID2 zorunlu; değiştirilecek alanlar (Price/StopPx/Quantity...)."""
    if not order_id or not order_id2:
        raise OrderValidationError("edit: OrderID ve OrderID2 zorunlu")
    return {"ApiCommands": ApiCmd.EDIT_ORDER, "OrderID": order_id, "OrderID2": order_id2, **changes}


# ── AKSİYON EŞLEMESİ (bizim karar → MatriksIQ emri) ─────────────────────────
def order_for_action(action, side, *, brokage_id, account_id, symbol, quantity,
                     price=None, order_type=ORDER_TYPE_UNCONFIRMED,
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
                     order_type=order_type, time_in_force=time_in_force)


# ── EXECUTION REPORT (PUSH) ÇÖZÜCÜ ──────────────────────────────────────────
def parse_exec_report(obj: dict) -> dict:
    """Emir-durumu push'unu normalize eder. fill teyidi = OrdStatus==2 (ACK'ten DEĞİL)."""
    status = obj.get("OrdStatus")
    return {
        "order_id": obj.get("OrderID"),
        "order_id2": obj.get("OrderID2"),
        "symbol": obj.get("Symbol"),
        "ord_status": status,
        "status_label": ORD_STATUS.get(status, f"bilinmiyor({status})"),
        "filled_qty": obj.get("FilledQty"),
        "leaves_qty": obj.get("LeavesQty"),
        "avg_px": obj.get("AvgPx"),
        "is_fill": status == ORD_FILLED,
        "is_partial": status == ORD_PARTIAL,
        "is_reject": status == ORD_REJECTED,
        "is_cancel": status == ORD_CANCELLED,
    }
