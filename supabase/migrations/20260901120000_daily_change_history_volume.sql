-- daily_change_history: günlük TL-hacmi geçmişi (göreli-hacim tabanı).
-- 2026-09-01. Hacim lisansı geldi (live_prices.volume = TL-hacmi dolu). "Bugünkü
-- hacim olağandışı mı" (göreli-hacim = bugün / N-günlük ortalama) için hacim TARİHİ
-- gerekir. daily-close-snapshot her kapanışta change_pct/close_price ile birlikte
-- volume'u da upsert eder → birkaç hafta sonra ortalama-hacim tabanı oluşur →
-- momentum-kırılım teyidi (hacimsiz kırılım = sahte). GÖZLEM; davranış değiştirmez.

alter table public.daily_change_history
  add column if not exists volume numeric;

comment on column public.daily_change_history.volume is 'O günün TL-hacmi (live_prices.volume). Göreli-hacim (rel-vol) tabanı için birikir.';
