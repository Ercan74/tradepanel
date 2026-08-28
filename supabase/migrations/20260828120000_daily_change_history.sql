-- daily_change_history: sembol başına GÜNLÜK kapanış değişim yüzdesi geçmişi.
-- 2026-08-28. Amaç: TAVAN SERİSİ tespiti (t, t-1, ... t-5) → SHORT sinyali bir tavan
-- serisine denk geliyorsa güçlü katalizör olabilir → on-demand tek-hisse haber kontrolü
-- tetiklenir (exit-trap riski: kilitli tavanda cover edilemez, stop çalışmaz).
-- daily-close-snapshot cron'u her seans kapanışında bir satır ekler (upsert). İleriye
-- doğru birikir; 2-gün (t + live t, t-1) bugün hazır, derin seri ~5 günde dolar.

create table if not exists public.daily_change_history (
  symbol      text not null,
  trade_date  date not null,          -- seansın TR takvim günü
  change_pct  numeric,                -- o günün kapanış değişim %'si (live_prices.change_pct)
  close_price numeric,                -- o günün kapanış fiyatı (live_prices.last_price)
  created_at  timestamptz not null default now(),
  primary key (symbol, trade_date)
);

create index if not exists dch_symbol_date_idx
  on public.daily_change_history (symbol, trade_date desc);
