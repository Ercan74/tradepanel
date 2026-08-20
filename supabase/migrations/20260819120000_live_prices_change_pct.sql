-- live_prices: günlük değişim yüzdesi (Kitap1.xlsx Sayfa4 Z = "Artış %").
-- 2026-08-19: Excel Sayfa4 yeniden düzenlendi — eski 4H bloğu (Z–AG) kaldırıldı,
-- Z artık günlük değişim yüzdesi. Ingestion (matriks_excel_to_supabase.py) bu
-- kolonu change_pct'e yazıyor. Amaç: aşırı-uzama / tavan-taban giriş denetimi
-- (lib/execution MAX_ENTRY_DAY_CHANGE_PCT) — +%10 tavana kilitli hisseden alım
-- hem R:R'ı bozar hem de dolum ihtimali ~sıfırdır.
-- Nullable: veri gelmeyen/eski satırlar null kalır → denetim fail-open davranır.

alter table public.live_prices
  add column if not exists change_pct numeric;
