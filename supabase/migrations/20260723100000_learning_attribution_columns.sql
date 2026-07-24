-- AŞAMA 1b-i — Öğrenen agent, 1. döngü (SONUÇ ATFI): şema (2026-07-23)
--
-- Amaç: bir pozisyonun HANGİ kurulum tipi / rejim / karar altında açıldığını
-- YAPISAL olarak kaydetmek ki agent kendi geçmiş performansını kova bazında
-- (setupType × rejim × yön) ölçebilsin. Bugün bu ölçülemiyordu (setupType
-- agent çıktısında yapısal alan değildi, sadece serbest metinde kalıyordu).
--
-- Bu migration SADECE kolon/index ekler; veri yazımı 1b-ii (write-path) ve
-- 1b-iii (backfill) ile gelir. Hiçbir mevcut satır DEĞİŞMEZ.
--
-- TASARIM NOTLARI:
-- * CHECK constraint YOK (bilinçli): setup_type/regime/attribution_source
--   değer kümeleri (ör. BREAKOUT_SETUP gelip gidebilir) evrilecek; DDL rijit
--   olmasın. Değer doğrulaması WRITE-PATH'te yapılır: trim + uppercase +
--   whitelist; bilinmeyen değer → UNKNOWN + console.warn (hayalet kova önlenir).
-- * ai_decision_id: raw_payload.decisionId (JSON) yerine DEDİKE kolon —
--   ilerideki tüm öğrenme döngülerinin (kaçırılan fırsat, otopsi) join temeli.
--   Hard FK EKLENDİ (references ai_decisions(id) ON DELETE SET NULL). Yetim
--   kontrolü geçildi: 52 benzersiz decisionId (44 CLOSED + 8 OPEN), 0 yetim,
--   0 malformed. Gerekçe: bugünün dersi — kod yolları sessizce ayrışıp bir
--   alanı iki anlama sokabiliyor (pnl_amount); DB kısıtı yeni bir kod yolu
--   tarafından atlanamaz, bağı hizada tutar. ON DELETE SET NULL rijitliği
--   kaldırır (ai_decisions temizliği pozisyonu bloklamaz, yalnız bağı düşer).
--
-- DEĞER SÖZLÜKLERİ (kodda enforce edilir, DDL'de değil):
--   setup_type         : MEAN_REVERSION | MOMENTUM_CONTINUATION | BREAKOUT_SETUP
--                        | TV_SIGNAL | EXTERNAL_SIGNAL | UNKNOWN
--   regime             : TRENDLİ-YUKARI | TRENDLİ-AŞAĞI | YATAY-SIKIŞIK
--                        | YÜKSEK-VOLATİLİTE | BELİRSİZ   (giriş anı, per-position)
--   attribution_source : STRUCTURED | TEXT_DERIVED | EXTERNAL_SIGNAL | UNKNOWN
--   entry_indicators   : jsonb snapshot — RSI/ADX/EMA20/50/100/ATR/LRS/MACD/
--                        StochRSI/StochFastK/StochFastD + 4H seti + matriks_trade_time
--                        (giriş anı veri tazeliği analizi için). 1b-ii'de doldurulur.

begin;

alter table public.positions
  add column if not exists setup_type          text,
  add column if not exists regime              text,
  add column if not exists attribution_source  text,
  add column if not exists ai_decision_id      uuid,
  add column if not exists entry_indicators    jsonb;

alter table public.ai_decisions
  add column if not exists setup_type text,
  add column if not exists regime     text;

-- Hard FK: ai_decision_id → ai_decisions(id), ON DELETE SET NULL.
-- Idempotent (constraint zaten varsa atla). Yetim kontrolü DDL öncesi geçti.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'positions_ai_decision_id_fkey'
  ) then
    alter table public.positions
      add constraint positions_ai_decision_id_fkey
      foreign key (ai_decision_id) references public.ai_decisions(id) on delete set null;
  end if;
end $$;

-- Pozisyon → karar bağı (öğrenme döngülerinin join temeli)
create index if not exists idx_positions_ai_decision_id on public.positions (ai_decision_id);
-- Kova sorguları (setup_type / regime gruplama). Düşük satır sayısı — opsiyonel
-- ama ileriye dönük ucuz.
create index if not exists idx_positions_setup_type on public.positions (setup_type);
create index if not exists idx_positions_regime     on public.positions (regime);

commit;

-- GERİ ALMA (gerekirse — kolonları ve indexleri düşürür; veri kaybı olur):
-- begin;
-- alter table public.positions drop constraint if exists positions_ai_decision_id_fkey;
-- drop index if exists idx_positions_regime;
-- drop index if exists idx_positions_setup_type;
-- drop index if exists idx_positions_ai_decision_id;
-- alter table public.ai_decisions drop column if exists regime, drop column if exists setup_type;
-- alter table public.positions
--   drop column if exists entry_indicators, drop column if exists ai_decision_id,
--   drop column if exists attribution_source, drop column if exists regime,
--   drop column if exists setup_type;
-- commit;
