-- ADIM 2 — Retroaktif kısmi-çıkış muhasebe düzeltmesi (2026-07-21)
--
-- SORUN: fix öncesi closePosition (AI/webhook kapanışı) pnl_amount'a yalnızca
-- FINAL dilimi yazdı; daha önce realize edilen kısmi çıkışlar (TP1/REDUCE)
-- realized_partial_amount'ta kaldı ve pnl_amount'a EKLENMEDİ. Analytics S1
-- bu 6 pozisyonun kısmi kârını kaçırdı (panel eksik).
--
-- Bu migration bu 6 EKLEMELİ satırın:
--   pnl_amount = eski pnl_amount + realized_partial_amount   (TOPLAM realized)
--   pnl_pct    = TOPLAM / (entry_price × quantity) × 100      (toplam-bazlı;
--                lib/pnl.ts calcTotalPnlPct ile AYNI formül)
-- olarak düzeltir.
--
-- KAPSAM: SADECE aşağıdaki 6 id (reconciliation harness "undercount" doğruladı).
-- ARENA/NUHCM (zaten toplam) ve Path-A trailing/stop kapanışlarına DOKUNULMAZ.
-- İleriye dönük fix (closePosition + risk-monitor) zaten deploy edildi
-- (commit ee7cb77); bu yalnızca GEÇMİŞ 6 satırı düzeltir.
--
-- Beklenen değişim:
--   ATATP  587.40 -> 1280.40  (pct 10.94 -> 11.81)
--   BTCIM  262.80 ->  577.80  (pct  5.24 ->  5.77)
--   GESAN   49.30 ->  504.60  (pct  1.99 ->  5.08)
--   KRDMD  158.40 ->  627.44  (pct  6.37 ->  6.33)
--   OBAMS  457.08 ->  755.60  (pct  9.14 ->  7.56)
--   TUKAS  224.20 ->  425.98  (pct  4.50 ->  4.28)

begin;

-- 1) YEDEK — geri alınabilirlik. Eski değerler ayrı tabloda saklanır.
--    "if not exists": tekrar çalıştırılırsa İLK yedek korunur (üzerine yazmaz).
create table if not exists positions_pnl_backup_20260721 as
select
  id,
  symbol,
  pnl_amount              as old_pnl_amount,
  pnl_pct                 as old_pnl_pct,
  realized_partial_amount,
  entry_price,
  quantity,
  now()                   as backed_up_at
from positions
where id in (
  'ae9a587a-165a-415e-9e65-04a32ab9bc3d',  -- ATATP
  'ba0d4e5e-aeaf-4b94-9a27-a6bfd8d39498',  -- BTCIM
  'f6a7d556-2151-4878-8567-f8be0164e16b',  -- GESAN
  'da1a3f72-916c-4a14-af90-a73115e0c6dd',  -- KRDMD
  '698975c4-a8a8-466b-a8a7-683065d769b4',  -- OBAMS
  '4e487e1e-03d3-46d1-9425-49b6951bc7d8'   -- TUKAS
);

-- 2) DÜZELTME — yedekteki ESKİ değerlerden hesaplar. Idempotent guard:
--    yalnız pnl_amount hâlâ eski değere eşit olan (henüz düzeltilmemiş)
--    satırları günceller → ikinci kez çalışırsa NO-OP, çift eklemez.
update positions p
set
  pnl_amount = round((b.old_pnl_amount + b.realized_partial_amount)::numeric, 2),
  pnl_pct    = round(((b.old_pnl_amount + b.realized_partial_amount)
                       / (b.entry_price * b.quantity) * 100)::numeric, 2)
from positions_pnl_backup_20260721 b
where p.id = b.id
  and p.pnl_amount = b.old_pnl_amount;

commit;

-- 3) DOĞRULAMA (isteğe bağlı — çalıştır ve karşılaştır):
-- select p.symbol, b.old_pnl_amount, p.pnl_amount, b.old_pnl_pct, p.pnl_pct
--   from positions p
--   join positions_pnl_backup_20260721 b on b.id = p.id
--  order by p.symbol;

-- ======================================================================
-- GERİ ALMA (gerekirse — yedek tablodan eski değerleri geri yazar):
-- update positions p
--    set pnl_amount = b.old_pnl_amount,
--        pnl_pct    = b.old_pnl_pct
--   from positions_pnl_backup_20260721 b
--  where p.id = b.id;
-- ======================================================================
