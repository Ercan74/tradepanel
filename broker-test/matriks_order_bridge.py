#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MatriksIQ "Dışarıdan Emir Kabulü" — SOKET BAĞLANTI KATMANI (bu aşama: SALT-OKUNUR).

Bugünkü kapsam (2026-08-27, altyapı girişi): lokal sokete (127.0.0.1:18890) bağlan,
el sıkış, ListAccounts/ListPositions OKU, keep-alive gönder, execution-report PUSH'larını
dinle. **EMİR GÖNDERMEZ** — order-gönderim + Supabase-karar-poll + Telegram-onay Cuma'nın
işi (ayrı, kapılı adım). Böylece demo'da önce bağlantı/protokol sağlamlığı risksiz test edilir.

VARSAYILAN DRY-RUN: sokete BAĞLANMAZ, ne yapacağını yazar. `--live` demo/lisans aktifken
KULLANICI eliyle çalışır (Claude canlı bağlantı açmaz). Kimlik/host broker.env'den.

GÜVENLİK: Bu betik --live'da bile YALNIZ okuma/dinleme yapar; NewOrder/Cancel/Edit ÇAĞIRMAZ.
"""
import os
import sys
import time
import socket
import argparse
import threading

import matriks_api as m

HOST = os.getenv("MATRIKS_HOST", "127.0.0.1")
PORT = int(os.getenv("MATRIKS_PORT", "18890"))
KEEPALIVE_SEC = int(os.getenv("MATRIKS_KEEPALIVE_SEC", "30"))
RECV_BUF = 65536


def _load_env():
    """broker.env'den MATRIKS_* değişkenlerini yükle (varsa). Gizli; loglanmaz."""
    path = os.path.join(os.path.dirname(__file__), "broker.env")
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        if k.startswith("MATRIKS_") and k not in os.environ:
            os.environ[k] = v.strip().strip('"').strip("'")


def dry_run():
    print("=" * 72)
    print(f"DRY-RUN — sokete BAĞLANMAZ. Hedef {HOST}:{PORT} (lisans aktifken açılır).")
    print("=" * 72)
    print("\n--live verildiğinde SIRAYLA yapılacak (SALT-OKUNUR):")
    steps = [
        ("bağlan", f"TCP connect {HOST}:{PORT}"),
        ("el sıkış", m.frame(m.HANDSHAKE_JSON)),
        ("hesap sorgu", m.frame(m.list_accounts())),
        ("→ yanıttan", "BrokageId + AccountId yakala (sonraki her mesajda gerekir)"),
        ("pozisyon sorgu", m.frame(m.list_positions("<BrokageId>", "<AccountId>"))),
        ("keep-alive", f"{m.frame(m.keep_alive())}  her {KEEPALIVE_SEC}s"),
        ("dinle", "execution-report PUSH'ları → parse_exec_report → ekrana"),
    ]
    for label, val in steps:
        v = val.decode("utf-8").replace(m.PACKET_TERMINATOR, "⟨0x0B⟩") if isinstance(val, bytes) else val
        print(f"  • {label:14} {v}")
    print("\nEMİR GÖNDERİMİ YOK (bu aşama salt-okunur). Bağlantı sağlamsa → Cuma order-bridge.")
    print("Çalıştırmak için (demo/lisans aktifken, KULLANICI eliyle):  python matriks_order_bridge.py --live")


def _sender_keepalive(sock, stop_evt):
    while not stop_evt.wait(KEEPALIVE_SEC):
        try:
            sock.sendall(m.frame(m.keep_alive()))
        except OSError:
            break


def live():
    print(f"[live] {HOST}:{PORT} bağlanılıyor… (SALT-OKUNUR — emir gönderilmez)")
    stop_evt = threading.Event()
    sock = socket.create_connection((HOST, PORT), timeout=10)
    sock.settimeout(1.0)
    try:
        # 1) el sıkış (JSON mesajlaşma) + 2) hesap sorgu
        sock.sendall(m.frame(m.HANDSHAKE_JSON))
        sock.sendall(m.frame(m.list_accounts()))
        print("[live] handshake + ListAccounts gönderildi.")

        # keep-alive arka planda
        threading.Thread(target=_sender_keepalive, args=(sock, stop_evt), daemon=True).start()

        buffer = b""
        brokage_id = account_id = None
        pos_asked = False
        print("[live] dinleniyor (Ctrl+C ile çık)…")
        while True:
            try:
                chunk = sock.recv(RECV_BUF)
            except socket.timeout:
                continue
            if not chunk:
                print("[live] bağlantı kapandı (karşı taraf).")
                break
            buffer += chunk
            msgs, buffer = m.deframe(buffer)
            for obj in msgs:
                if not isinstance(obj, dict):
                    print("  [ham]", obj)
                    continue
                cmd = obj.get("ApiCommands")
                # Hesap yanıtı → kimlik yakala + pozisyon sorgusu (tek sefer)
                if brokage_id is None and (obj.get("BrokageId") or obj.get("AccountId")):
                    brokage_id = obj.get("BrokageId", brokage_id)
                    account_id = obj.get("AccountId", account_id)
                    print(f"  [hesap] BrokageId={brokage_id} AccountId={account_id}")
                    if brokage_id and account_id and not pos_asked:
                        sock.sendall(m.frame(m.list_positions(brokage_id, account_id)))
                        pos_asked = True
                # Execution-report benzeri (OrdStatus taşıyan) push
                if "OrdStatus" in obj:
                    p = m.parse_exec_report(obj)
                    print(f"  [exec] {p['symbol']} {p['status_label']} filled={p['filled_qty']} avg={p['avg_px']}")
                else:
                    print(f"  [msg cmd={cmd}] {obj}")
    except KeyboardInterrupt:
        print("\n[live] kullanıcı durdurdu.")
    finally:
        stop_evt.set()
        try:
            sock.close()
        except OSError:
            pass
        print("[live] soket kapatıldı.")


def main():
    _load_env()
    ap = argparse.ArgumentParser(description="MatriksIQ soket bağlantı testi (salt-okunur).")
    ap.add_argument("--live", action="store_true", help="Sokete GERÇEKTEN bağlan (demo/lisans aktif + KULLANICI çalıştırır).")
    args = ap.parse_args()
    if args.live:
        live()
    else:
        dry_run()


if __name__ == "__main__":
    main()
