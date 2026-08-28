#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Handshake teşhis probu — SALT-OKUNUR. Farklı handshake varyantlarını dener,
gelen HAM baytı basar. Emir GÖNDERMEZ."""
import socket, json, time
T = chr(11)
HOST, PORT = "127.0.0.1", 18890

def frame(s): return (s + T).encode("utf-8")

def probe(label, handshake, delay, also_no_handshake=False):
    print(f"\n===== {label} =====")
    try:
        s = socket.create_connection((HOST, PORT), timeout=8)
    except OSError as e:
        print(f"  bağlanamadı: {e}"); return
    s.settimeout(1.0)
    if not also_no_handshake:
        s.sendall(frame(handshake)); print(f"  → handshake: {handshake!r}")
        time.sleep(delay)
    s.sendall(frame(json.dumps({"ApiCommands": 1}))); print("  → ListAccounts {\"ApiCommands\":1}")
    end = time.time() + 6; got = b""
    while time.time() < end:
        try:
            c = s.recv(65536)
        except socket.timeout:
            continue
        if not c:
            print("  (karşı taraf kapattı)"); break
        got += c; print(f"  [HAM {len(c)}B] {c[:500]!r}")
    if not got:
        print("  (YANIT YOK)")
    s.close()

probe("A: raw string handshake + 1.5s gecikme", "SetMessageType0", 1.5)
probe("B: JSON MessageType handshake", json.dumps({"MessageType": "SetMessageType0"}), 1.5)
probe("C: JSON SetMessageType alanı", json.dumps({"SetMessageType": 0}), 1.5)
probe("D: handshake YOK, direkt ListAccounts", "", 0, also_no_handshake=True)
print("\nprobe bitti.")
