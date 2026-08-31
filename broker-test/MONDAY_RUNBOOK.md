# Pazartesi 31 Ağu — Broker Emir Testi Runbook

> **⏰ Demo SON günü.** Tek atış. Denenmemiş senaryo bırakma.
> **Araç:** `order_lab.py` (tek kalıcı oturum + canlı push + JSONL log).
> **Broker:** yalnız Osmanlı demo — BrokageId **8** / AccountId **342447** / ExchangeId **4**.
> **Güvenlik:** her komutu SEN yazıp gönderirsin (insan-döngüde). Claude göndermez.
> Her giden/gelen mesaj `order_lab_YYYYMMDD.jsonl`'e loglanır → sonra protokol-teyidi için işlenecek.

---

## Ön-koşul (09:30–10:00, emir YOK)
1. MatriksIQ açık, Osmanlı demo login, "Dışarıdan Emir Kabulü" lisansı aktif, port 18890 dinlemede.
2. `matriks_excel_to_supabase.py` çalışıyor (fiyatlar Supabase'e akıyor — `buy/fill/...` otomatik fiyatı buradan alır).
3. Konsolu başlat:
```
cd broker-test
python order_lab.py --live
```
   Açılışta `🔴 LIVE` yazmalı. Yazmıyorsa `--live` unuttun demektir.

> İpucu: fiyatı elle de verebilirsin (`buy GARAN 1 100.00`). Otomatik fiyat = Supabase son fiyat × faktör.

---

## FAZ 0 · Bağlantı & mevcut durum
| Komut | Gözle | Geçti mi |
|---|---|---|
| `accounts` | Demo hâlâ geçerli mi? BrokageId 8 / Account 342447 döndü mü | ☐ |
| `pos` | Mevcut pozisyon (demo boş olmalı) | ☐ |
| `list` | **Dünkü resting GARAN 335713072 duruyor mu?** OrderID/OrderID2'yi NOT AL | ☐ |

**Kritik gözlem:** `list` çıktısındaki alan adları (OrderID, OrderID2, ClientOrderId, OrdStatus, Symbol...) → reconciliation şemasını bunlar belirler. Ekran görüntüsü / log yeterli.

---

## FAZ 1 · Emir kimliği & yaşam döngüsü (resting — dolmaz)
> Amaç: **NewOrder yanıtında OrderID/OrderID2 senkron geliyor mu**, edit/cancel çalışıyor mu.

| # | Komut | Gözle | Geçti mi |
|---|---|---|---|
| 1a | `buy GARAN 1` | Market %5 altı → resting. **Yanıt/push'ta OrderID/OrderID2 GELDİ Mİ?** | ☐ |
| 1b | `reg` | Az önceki emrin OrderID/OrderID2'si doldu mu (push geldiyse) | ☐ |
| 1c | `list` | ClientOrderId ile eşleş; OrderID/OrderID2 orada mı | ☐ |
| 1d | `edit <clordid> <yeni_fiyat> 1` | OrdStatus **5 (Düzeltildi)** push geldi mi | ☐ |
| 1e | `cancel <clordid>` | OrdStatus **4 (İptal)** push geldi mi | ☐ |
| 1f | **Dünkü emri temizle:** `cancel <OID> <OID2> GARAN buy` (FAZ0'dan aldığın id'lerle) | İptal push | ☐ |

> `<clordid>` = `reg`/gönderim çıktısındaki `1787...-N` değeri.
> OrderID/OrderID2 hiç gelmezse: reconciliation **ListOrders-poll** tabanlı olacak (senkron değil) — bu da değerli bulgu.

---

## FAZ 2 · Gerçekleşme (fill) & pozisyon  ← İLK GERÇEK FILL
| # | Komut | Gözle | Geçti mi |
|---|---|---|---|
| 2a | `fill GARAN 1` | Market üstü limit → dolmalı. OrdStatus **0→2**, FilledQty, AvgPx push | ☐ |
| 2b | `pos` | Yeni pozisyon göründü mü; QtyNet/AvgCost doğru mu (mutabakat) | ☐ |
| 2c | (fırsat olursa) büyük lot ilan-altı fiyat → **Parçalı (OrdStatus 1)** yakala | ☐ |

---

## FAZ 3 · LONG kapatma
| # | Komut | Gözle | Geçti mi |
|---|---|---|---|
| 3a | `sell GARAN 1` | SELL+Normal, crossing → dolar. Fill push | ☐ |
| 3b | `pos` | Pozisyon sıfırlandı mı | ☐ |

---

## FAZ 4 · Market emri (davranış bilinmiyor — probe)
| # | Komut | Gözle | Geçti mi |
|---|---|---|---|
| 4a | `market GARAN buy 1` | OrderType "1" (PYS), Price YOK. Hemen mi doldu? Red mi? Price nasıl yorumlandı | ☐ |
| 4b | Red gelirse `market GARAN buy 1 <başka_ot>` ile başka OrderType dene | ☐ |
| 4c | Doldu ise `sell GARAN 1` ile kapat (pozisyonu bırakma) | ☐ |

> Market OrderType kodu belgede net değil. "1"=PYS ilk deneme; red/başarı ikisini de logla.

---

## FAZ 5 · SHORT (açığa satış — demo izni BİLİNMİYOR)
| # | Komut | Gözle | Geçti mi |
|---|---|---|---|
| 5a | `short GARAN 1` | OrderSide 2 + TT 2. **Demo kabul etti mi?** Red (OrdStatus 8) bile değerli | ☐ |
| 5b | (5a dolduysa) `pos` | Short pozisyon (QtyNet negatif?) göründü mü | ☐ |
| 5c | (5a dolduysa) `cover GARAN 1` | OrderSide 1 + TT 6 → short kapama. Fill + pozisyon sıfır | ☐ |

> 5a reddedilirse: demo açığa-satış izni yok → canlıda TT2/TT6 ayrıca doğrulanacak (not düş, geç).

---

## FAZ 6 · Hata / red senaryoları
| # | Komut | Gözle | Geçti mi |
|---|---|---|---|
| 6a | `buy XXXXX 1 10.00` (geçersiz sembol) | Red push OrdStatus 8 + sebep | ☐ |
| 6b | `buy GARAN 1 <son×1.5>` (bant-dışı fiyat, 1 lot) | Red — hacim yok, band ihlali | ☐ |
| 6c | `buy GARAN 1 0.001` (geçersiz fiyat adımı, 1 lot) | Red | ☐ |

> ⚠️ **BUGÜN KURAL: her deneme ≤1 lot, yüksek hacim YOK.** Yüksek-miktar red testi (bakiye üstü) atlandı; red kapsamı 6a+6b+6c ile 1 lotta sağlanıyor.

---

## FAZ 7 · Dayanıklılık
| # | Ne | Gözle | Geçti mi |
|---|---|---|---|
| 7a | Konsolu ~5 dk boşta bırak | keep-alive (20s'de bir) bağlantıyı ayakta tutuyor mu; kopma var mı | ☐ |
| 7b | (opsiyonel) `raw {"...TimeInForce":"3"...}` IOC / `"1"` GTC | farklı TIF davranışı | ☐ |

---

## FAZ 8 · Temizlik & kayıt
1. `list` + `pos` → **açık emir / pozisyon KALMASIN.** Varsa `cancel` / ters emirle kapat.
2. `quit` → oturumu kapat.
3. `order_lab_YYYYMMDD.jsonl` bende → her fazın OrderID/OrderID2/OrdStatus'unu **teyitli protokol** olarak `matriks_api.py` + memory'ye işlerim.
4. Bana özetle: hangi fazlar geçti, hangi push'lar geldi/gelmedi, SHORT kabul edildi mi, market davranışı ne oldu.

---

## Sonuçtan çıkacak kararlar (Aşama C girdisi)
- **OrderID senkron mu / poll mu** → order-bridge mutabakat tasarımı.
- **SHORT demo'da çalışıyor mu** → TT2/TT6 canlı-hazır mı.
- **Market OrderType kodu** → acil-çıkış emri tipi.
- **Fill push formatı** → exec-report reconciliation alan eşlemesi.
- Stop yerleşimi (broker vs lokal) hâlâ AYRI karar — StopPx protokolde yok.
