-- BIST açığa satış (short) uygunluk altyapısı:
--  - short_sell_eligible_symbols: açığa satışa uygun semboller (BIST50 manuel seed)
--  - short_sell_temp_exclusions: geçici yasaklar (VBTS vb.) — uygun listedeki bir
--    sembol, aktif bir exclusion penceresi içindeyse short AÇILAMAZ.
-- Kural yalnızca YENİ short açılışları için; mevcut açık pozisyonlara dokunulmaz.

create table if not exists public.short_sell_eligible_symbols (
  symbol text primary key,
  added_at timestamptz not null default now(),
  source text default 'BIST50_MANUAL'
);

create table if not exists public.short_sell_temp_exclusions (
  symbol text not null,
  excluded_from timestamptz not null,
  excluded_until timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (symbol, excluded_from)
);

-- Seed: BIST50 açığa satışa uygun 50 sembol
insert into public.short_sell_eligible_symbols (symbol) values
  ('AEFES'), ('AKBNK'), ('AKSEN'), ('ALARK'), ('ASELS'),
  ('ASTOR'), ('BIMAS'), ('BRSAN'), ('BTCIM'), ('CANTE'),
  ('CCOLA'), ('CIMSA'), ('DSTKF'), ('ECILC'), ('EFOR'),
  ('EKGYO'), ('ENKAI'), ('EREGL'), ('FROTO'), ('GARAN'),
  ('GLRMK'), ('GUBRF'), ('HALKB'), ('HEKTS'), ('ISCTR'),
  ('KCHOL'), ('KRDMD'), ('KTLEV'), ('KUYAS'), ('MGROS'),
  ('MIATK'), ('OYAKC'), ('PASEU'), ('PETKM'), ('PGSUS'),
  ('SAHOL'), ('SASA'), ('SISE'), ('TAVHL'), ('TCELL'),
  ('THYAO'), ('TOASO'), ('TRALT'), ('TRMET'), ('TTKOM'),
  ('TUPRS'), ('TURSG'), ('ULKER'), ('VAKBN'), ('YKBNK')
on conflict (symbol) do nothing;

-- Seed: güncel geçici yasaklar (VBTS). Bu üç sembol şu an BIST50
-- listesinde yok; ileride uygun listeye girerlerse pencere içinde
-- otomatik engellensinler diye kayıt altına alınıyor.
insert into public.short_sell_temp_exclusions
  (symbol, excluded_from, excluded_until, reason) values
  ('KOCMT', '2026-07-07', '2026-08-06', 'VBTS'),
  ('EUPWR', '2026-07-09', '2026-07-17', 'VBTS'),
  ('RUBNS', '2026-07-09', '2026-07-17', 'VBTS')
on conflict (symbol, excluded_from) do nothing;
