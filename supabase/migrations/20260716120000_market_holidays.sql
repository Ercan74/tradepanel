-- BIST tatil takvimi. isMarketOpen() bunu okur: tam tatil (half_day=false)
-- günlerinde bildirim/karar cron'ları sessizce atlar; yarım günler işlem
-- günü sayılır (öğleden sonraki bayatlığı freshness guard yakalar).
create table if not exists public.market_holidays (
  date date primary key,
  description text not null,
  half_day boolean not null default false
);

-- 2026 BIST resmi tatilleri.
-- SEKÜLER (sabit tarih, kesin):
--   01/01 Yılbaşı, 23/04 Ulusal Egemenlik, 01/05 Emek, 19/05 Gençlik ve
--   Spor, 15/07 Demokrasi ve Milli Birlik, 30/08 Zafer, 29/10 Cumhuriyet.
-- DİNİ (Diyanet tahmini — BIST resmi takvimiyle TEYİT EDİLMELİ, ±1 gün
--   kayabilir): Ramazan ve Kurban Bayramı ve arife yarım günleri.
insert into public.market_holidays (date, description, half_day) values
  ('2026-01-01', 'Yılbaşı', false),
  ('2026-03-19', 'Ramazan Bayramı Arifesi (yarım gün) — TEYİT ET', true),
  ('2026-03-20', 'Ramazan Bayramı 1. Gün — TEYİT ET', false),
  ('2026-03-21', 'Ramazan Bayramı 2. Gün — TEYİT ET', false),
  ('2026-03-22', 'Ramazan Bayramı 3. Gün — TEYİT ET', false),
  ('2026-04-23', 'Ulusal Egemenlik ve Çocuk Bayramı', false),
  ('2026-05-01', 'Emek ve Dayanışma Günü', false),
  ('2026-05-19', 'Atatürk''ü Anma, Gençlik ve Spor Bayramı', false),
  ('2026-05-26', 'Kurban Bayramı Arifesi (yarım gün) — TEYİT ET', true),
  ('2026-05-27', 'Kurban Bayramı 1. Gün — TEYİT ET', false),
  ('2026-05-28', 'Kurban Bayramı 2. Gün — TEYİT ET', false),
  ('2026-05-29', 'Kurban Bayramı 3. Gün — TEYİT ET', false),
  ('2026-05-30', 'Kurban Bayramı 4. Gün — TEYİT ET', false),
  ('2026-07-15', 'Demokrasi ve Milli Birlik Günü', false),
  ('2026-08-30', 'Zafer Bayramı', false),
  ('2026-10-28', 'Cumhuriyet Bayramı Arifesi (yarım gün, 13:00 kapanış)', true),
  ('2026-10-29', 'Cumhuriyet Bayramı', false)
on conflict (date) do nothing;
