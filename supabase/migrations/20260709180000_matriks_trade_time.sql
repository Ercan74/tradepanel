-- Matriks "Son İşlem Dakikası" için doğru timezone'lu alan.
-- Mevcut last_trade_time kolonu TR yerel saatini naive (UTC sanılan)
-- biçimde taşıyor (+3 saat kayık); matriks_trade_time gerçek UTC
-- karşılığını saklar ve veri tazeliği kontrolleri bunu kullanır.

alter table public.live_prices
  add column if not exists matriks_trade_time timestamptz;
