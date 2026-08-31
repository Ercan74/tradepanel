#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SALT-OKUNUR sorgu probu: handshake → ListAccounts(1) → ListPositions(2) →
ListOrders(3). Hangi komutun yanıt verdiğini haritalar. Emir GÖNDERMEZ."""
import socket, json, time
import matriks_api as m

HOST, PORT = "127.0.0.1", 18890
BROKAGE_ID, ACCOUNT_ID, EXCH = "56", "0~5495963", 4

def send(s, label, obj):
    s.sendall(m.frame(obj)); print(f"\n→ {label}: {json.dumps(obj,ensure_ascii=False)}")

def listen(s, secs):
    end = time.time() + secs; buf = b""
    while time.time() < end:
        try: c = s.recv(65536)
        except socket.timeout: continue
        if not c: print("  [kapandı]"); return
        print(f"  [HAM {len(c)}B] {c[:350]!r}")
        buf += c
        msgs, buf = m.deframe(buf)
        for o in msgs:
            cmd = o.get("ApiCommands") if isinstance(o, dict) else "?"
            keys = list(o.keys())[:6] if isinstance(o, dict) else o
            print(f"  [YANIT cmd={cmd}] anahtarlar={keys}")

s = socket.create_connection((HOST, PORT), timeout=8); s.settimeout(1.0)
print("bağlandı. handshake…")
send(s, "handshake", m.HANDSHAKE_JSON); listen(s, 2)
send(s, "ListAccounts(1)", {"ApiCommands": 1}); listen(s, 3)
send(s, "ListPositions(2)", {"ApiCommands": 2, "BrokageId": BROKAGE_ID, "AccountId": ACCOUNT_ID, "ExchangeId": EXCH}); listen(s, 3)
send(s, "ListOrders(3)", {"ApiCommands": 3, "BrokageId": BROKAGE_ID, "AccountId": ACCOUNT_ID, "ExchangeId": EXCH}); listen(s, 3)
s.close(); print("\nprobe bitti.")
