-- live_prices: yeni teknik gösterge kolonları (Kitap1.xlsx Sayfa4 W–AG bloğu).
-- DDE zaten bu sütunları yazıyor ancak pipeline okumuyordu (2026-07-18 denetimi).
-- W=ADX, X/Y=Stochastic Fast K/D ve Z–AG=4H bloğu (RSI/EMA/ATR/ADX/Stoch).
-- Hepsi nullable: eski satırlar ve endeks/global satırları null kalabilir.
-- Bu faz yalnızca veriyi taşır; karar mantığı (BREAKOUT_SETUP, 4H rejim)
-- ayrı fazda eklenecek.

alter table public.live_prices
  add column if not exists adx              numeric,
  add column if not exists stoch_fast_k     numeric,
  add column if not exists stoch_fast_d     numeric,
  add column if not exists rsi_4h           numeric,
  add column if not exists ema100_4h        numeric,
  add column if not exists ema20_4h         numeric,
  add column if not exists ema50_4h         numeric,
  add column if not exists atr_4h           numeric,
  add column if not exists adx_4h           numeric,
  add column if not exists stoch_fast_k_4h  numeric,
  add column if not exists stoch_fast_d_4h  numeric;
