-- Takip migration — pnl_pct tanım tekilleştirme (2026-07-23)
--
-- SORUN: pnl_pct kolonu tarihsel olarak İKİ farklı tanım taşıyor. Kısmi-çıkışlı
-- (çok-aşamalı) pozisyonların bir kısmında pnl_pct hâlâ ESKİ "fiyat-hareketi %"
-- ((exit−entry)/entry) iken, dün migrate edilen 6 satırda ve ileriye dönük
-- kapanışlarda YENİ "toplam-bazlı %" (pnl_amount / (entry×quantity)). Aynı
-- kolonda iki tanım = /replay kartlarında yanıltıcı % (ör. CMENT 3.20 gösterir,
-- gerçek toplam-bazlı 6.50). Bu migration TÜM çok-aşamalı kapanmışları
-- toplam-bazlıya çeker → tek tanım.
--
-- KAPSAM: SADECE realized_partial_amount != 0 olan 15 kapanmış pozisyon (id ile).
-- Tek-aşamalı 40 pozisyona DOKUNULMAZ (onlarda iki tanım matematiksel eşit).
-- pnl_amount'a DOKUNULMAZ — her yerde doğru (harness 54/54 sıfır sapma).
-- Idempotent guard: pnl_pct zaten toplam-bazlı olan 6 satır (ATATP/BTCIM/GESAN/
-- KRDMD/OBAMS/TUKAS) atlanır (recompute aynı sonucu verir).
--
-- Beklenen değişim (yalnız 9 satır DEĞİŞİR; 6 satır no-op):
--   ARENA   3.42 ->  5.92
--   CMENT   3.20 ->  6.50
--   DURDO   4.96 ->  5.61
--   EUPWR   4.90 ->  8.10
--   HATSN   4.12 ->  5.08
--   LIDFA   7.75 ->  6.87
--   MIATK   7.36 ->  7.05
--   NUHCM   6.86 ->  6.56
--   SANEL -61.02 -> -27.19
--   (ATATP 11.81 / BTCIM 5.77 / GESAN 5.08 / KRDMD 6.33 / OBAMS 7.56 / TUKAS 4.28: zaten doğru, no-op)

begin;

-- 1) YEDEK — geri alınabilirlik. 15 hedef satırın eski pnl_pct'si + girdiler.
--    "if not exists": tekrar çalıştırılırsa İLK yedek korunur.
create table if not exists positions_pnlpct_backup_20260723 as
select
  id,
  symbol,
  pnl_pct     as old_pnl_pct,
  pnl_amount,
  entry_price,
  quantity,
  now()       as backed_up_at
from positions
where id in (
  '621ca989-52d3-4c47-8fad-69555d7f6bc8',  -- ARENA
  'ae9a587a-165a-415e-9e65-04a32ab9bc3d',  -- ATATP
  'ba0d4e5e-aeaf-4b94-9a27-a6bfd8d39498',  -- BTCIM
  '719c0e93-24cd-4295-8f5b-ab1d1785230d',  -- CMENT
  '8dc18bc9-c8c6-41d7-b7cb-848d0ea8dd9c',  -- DURDO
  '933eb79f-b4bb-47bf-b477-c75b6349e7e1',  -- EUPWR
  'f6a7d556-2151-4878-8567-f8be0164e16b',  -- GESAN
  '873017e9-6858-4648-b472-bf7e238ce389',  -- HATSN
  'da1a3f72-916c-4a14-af90-a73115e0c6dd',  -- KRDMD
  'dcf2a004-dcfe-4f07-b141-1dd39cd2b525',  -- LIDFA
  '8a8a8a84-853a-451a-a9ac-d4594e4836d8',  -- MIATK
  'b29e4401-71c2-4137-a0c3-9c0c9b0d547b',  -- NUHCM
  '698975c4-a8a8-466b-a8a7-683065d769b4',  -- OBAMS
  '46810c56-da29-43ac-b24f-4cdd11958c1b',  -- SANEL
  '4e487e1e-03d3-46d1-9425-49b6951bc7d8'   -- TUKAS
);

-- 2) DÜZELTME — toplam-bazlı: pnl_amount / (entry × quantity) × 100.
--    Idempotent guard: yalnız hesaplanan değer stored'dan FARKLI olan satırları
--    günceller → 6 doğru satır atlanır, ikinci çalıştırmada tümü no-op.
--    Sıfıra bölme/null koruması dahil.
update positions p
set pnl_pct = round((p.pnl_amount / (p.entry_price * p.quantity) * 100)::numeric, 2)
where p.id in (
  '621ca989-52d3-4c47-8fad-69555d7f6bc8',  -- ARENA
  'ae9a587a-165a-415e-9e65-04a32ab9bc3d',  -- ATATP
  'ba0d4e5e-aeaf-4b94-9a27-a6bfd8d39498',  -- BTCIM
  '719c0e93-24cd-4295-8f5b-ab1d1785230d',  -- CMENT
  '8dc18bc9-c8c6-41d7-b7cb-848d0ea8dd9c',  -- DURDO
  '933eb79f-b4bb-47bf-b477-c75b6349e7e1',  -- EUPWR
  'f6a7d556-2151-4878-8567-f8be0164e16b',  -- GESAN
  '873017e9-6858-4648-b472-bf7e238ce389',  -- HATSN
  'da1a3f72-916c-4a14-af90-a73115e0c6dd',  -- KRDMD
  'dcf2a004-dcfe-4f07-b141-1dd39cd2b525',  -- LIDFA
  '8a8a8a84-853a-451a-a9ac-d4594e4836d8',  -- MIATK
  'b29e4401-71c2-4137-a0c3-9c0c9b0d547b',  -- NUHCM
  '698975c4-a8a8-466b-a8a7-683065d769b4',  -- OBAMS
  '46810c56-da29-43ac-b24f-4cdd11958c1b',  -- SANEL
  '4e487e1e-03d3-46d1-9425-49b6951bc7d8'   -- TUKAS
)
  and p.entry_price is not null
  and p.quantity is not null
  and p.quantity <> 0
  and round((p.pnl_amount / (p.entry_price * p.quantity) * 100)::numeric, 2)
      is distinct from p.pnl_pct;

commit;

-- 3) DOĞRULAMA (isteğe bağlı):
-- select p.symbol, b.old_pnl_pct, p.pnl_pct,
--        round((p.pnl_amount / (p.entry_price * p.quantity) * 100)::numeric, 2) as beklenen
--   from positions p
--   join positions_pnlpct_backup_20260723 b on b.id = p.id
--  order by p.symbol;
-- Beklenen: p.pnl_pct = beklenen (15/15).

-- ======================================================================
-- GERİ ALMA (gerekirse — yedekten eski pnl_pct'leri geri yazar):
-- update positions p
--    set pnl_pct = b.old_pnl_pct
--   from positions_pnlpct_backup_20260723 b
--  where p.id = b.id;
-- ======================================================================
