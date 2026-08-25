-- live_prices: Matriks canlı P/D (fiyat/defter) ve F/K (fiyat/kazanç, TTM).
-- 2026-08-25. Kullanıcı Excel Sayfa4'te AA=P/D, AB=F/K kolonlarını Matriks
-- fonksiyonuyla çekiyor. Değerleme motoru BVPS/EPS/ROE'yi bunlardan TÜRETİR:
--   BVPS = fiyat / pb ,  EPS = fiyat / pe ,  ROE = pb / pe
-- Böylece Matriks ile BİREBİR tutar; KAP-parse'ındaki özkaynak-kolonu / hisse-
-- sayısı / ölçek hatalarını (ISCTR/SKBNK/CVKMD sapmaları) tümden bypass eder.
-- Kayıp/negatif F/K (zarar) → EPS/ROE türetilmez → değerleme VERİ-EKSİK.

alter table public.live_prices add column if not exists pb numeric;  -- Matriks P/D (AA)
alter table public.live_prices add column if not exists pe numeric;  -- Matriks F/K (AB), TTM; zararda negatif olabilir

comment on column public.live_prices.pb is 'Matriks P/D (fiyat/defter) — Excel Sayfa4 AA. BVPS=fiyat/pb türetilir (değerleme).';
comment on column public.live_prices.pe is 'Matriks F/K (fiyat/kazanç, TTM) — Excel Sayfa4 AB. EPS=fiyat/pe, ROE=pb/pe türetilir.';
