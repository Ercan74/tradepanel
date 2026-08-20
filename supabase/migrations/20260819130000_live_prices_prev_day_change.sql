-- live_prices: bir önceki GÜNÜN günlük değişim yüzdesi ("dün tavan mıydı" denetimi).
-- 2026-08-19: change_pct (Z = "Artış %") zaten O GÜNÜN tam hareketidir; seans
-- kapanışında dondurulunca ertesi gün "dünkü değişim" olur. Excel kolonları canlı
-- (donmaz) → değer DB'de tutulur. Günlük bir cron (~18:05) change_pct'i buraya
-- kopyalar; giriş denetimi "önceki gün tavana yakın kapandıysa riskli" için okur.
-- Nullable: milat öncesi / veri gelmeyen satırlar null → denetim fail-open.

alter table public.live_prices
  add column if not exists prev_day_change_pct numeric;
