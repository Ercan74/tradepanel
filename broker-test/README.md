# broker-test — Canlı Emir Entegrasyonu (izole)

Mevcut sisteme **sıfır temas**. Üretim akışına bağlı değil. Claude canlı emir GÖNDERMEZ;
`--live` çalıştırmaları KULLANICI eliyle, her canlı emir Telegram-onaylı.

## Aktif yön: MatriksIQ "Dışarıdan Emir Kabulü" (soket API)
Osmanlı-webhook yolu IP-bloke kaldığı için terk edildi (aşağıda tarihsel). Yeni yol:
MatriksIQ lisansı **lokal 18890 portunu** açar; harici uygulama **soket + JSON** ile konuşur.

### Dosyalar
| Dosya | Ne |
|---|---|
| `matriks_api.py` | **Saf API katmanı** (I/O yok): kod tabloları + mesaj kurucular + doğrulama + aksiyon-eşlemesi + execution-report çözücü. Tam test edilebilir. |
| `matriks_dryrun.py` | Offline doğrulama — tüm mesaj tiplerini kurar/çerçeveler/basar, hata senaryolarını test eder. `python matriks_dryrun.py` |
| `matriks_order_bridge.py` | **Soket bağlantı katmanı — bu aşama SALT-OKUNUR** (bağlan + ListAccounts/ListPositions oku + keep-alive + execution-report dinle). Emir GÖNDERMEZ. Dry-run varsayılan; `--live` demo/lisans aktifken. |
| `broker_sender.py` | (ESKİ) Osmanlı-webhook dry-run modülü — terk edildi, referans. |

### Aşama durumu
- ✅ **Aşama A (2026-08-27):** Saf API katmanı + offline dry-run doğrulandı. Soket bağlantı iskeleti (salt-okunur) hazır.
- ✅ **Aşama B (2026-08-28):** `--live` demo bağlantı çalıştı — ListAccounts/ListOrders okundu, el-sıkışma (JSON `{"MessageType":"SetMessageType0"}` + char(11)) doğrulandı.
- ✅ **Aşama B+ (2026-08-28):** İLK DEMO EMİR round-trip GEÇTİ (`order_test.py`) — Osmanlı demo GARAN limit BUY, "YENİ" durumda deftere düştü (Ref 335713072). NewOrder=3, OrderType 2=Limit, ClientOrderId zorunlu teyitli.
- ⏳ **Aşama C (Cuma/sonra):** Order-bridge — Supabase ONAYLI+uygulanmamış kararları poll → NewOrder/Cancel/Edit → exec-report ile fill mutabakatı → Supabase'e geri yaz. Her emir **Telegram-onaylı**.

### ✓ Demo round-trip'te TEYİTLENEN protokol
- **NewOrder ApiCommands=3** (doküman "4" diyordu — YANLIŞ), CancelOrder=4, EditOrder=5, KeepAlive=7.
- **OrderType** "2"=Limit, "1"=PYS (Matriks e-postası + apicontrol.txt).
- Alan adı **`ClientOrderId`** (ClOrdID DEĞİL) + boş olamaz; Quantity tek/int; minimal 12 alan; ExchangeId emir gövdesinde YOK.
- El sıkışma JSON obje (ham string değil); satır sonu char(11).

### ⚠️ HÂLÂ AÇIK noktalar
1. **SHORT işlem-tipi kodları** (TransactionType 2/6) demoda DENENMEDİ — yalnız LONG BUY ("1") test edildi; canlı SHORT öncesi Matriks'e doğrulat.
2. **Piyasa (market) emri** — OrderType mı, "en iyi fiyat" ayrı alan mı; market'te Price nasıl.
3. **BİST tavan/taban** emrinde dolum/kuyruk davranışı + dönen OrdStatus.
4. **NewOrder yanıt** — OrderID/OrderID2 senkron yanıttan mı yalnız push'tan mı (exec-report reconciliation için kritik).

### 🛑 Strateji kararı (altyapıdan AYRI, mutabakat şart)
**Stop yerleşimi:** broker-tarafı `StopPx` resting stop (görünür → stop-hunting avı) **vs**
dashboard-lokal sentetik stop (görünmez, mevcut model). Kullanıcı lokal-stop eğiliminde.
Altyapı bu kararı VARSAYMAZ; demoda test edilirken netleşecek.

### Kod tabloları (spec v1.0 özeti)
- **ApiCommands:** 1=ListAccounts, 2=ListPositions, 3=ListOrders, 4=NewOrder, 5=CancelOrder, 6=EditOrder, 7=KeepAlive
- **OrderSide:** 1=Buy, 2=Sell (emir alanı — Side tablosunun 0/1'inden FARKLI)
- **TransactionType:** 1=Normal, 2=AçığaSatış, 3=Günİçi-Açığa, 6=AçığaSatışKapama(cover)
- **ExchangeId:** 4=BİST Spot
- **OrdStatus:** 2=Gerçekleşti (fill teyidi), 8=Reddedildi, 1=Parçalı, 4=İptal…
- **Çerçeveleme:** her JSON paketi sonuna `char(11)`; ilk mesaj `SetMessageType0` (JSON)

---
*Tarihsel Osmanlı-webhook denemeleri ve dersleri: bkz. memory `broker-order-integration`.*
