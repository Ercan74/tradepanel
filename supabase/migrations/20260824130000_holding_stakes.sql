-- holding_stakes: holdinglerin borsada işlem gören iştirak payları (NAV için).
-- 2026-08-24 (Faz-2 holding-NAV). KAP dipnotundaki "Etkin ortaklık oranları"
-- tablosundan okunan pay%'ler. NAV = Σ(stake_pct × iştirak piyasa değeri) —
-- iştirak piyasa değeri = fundamentals.shares × live_prices.last_price.
-- Çizgisiz-tablo PDF'leri güvenilir otomatik-parse edilemediğinden ÇEYREKLİK
-- küçük CURATED liste olarak tutulur (rapordan okunup girilir). `note` alanında
-- "varsayım" gibi güvenilirlik şerhi taşınabilir (holdingler yapısı gereği şerhli).

create table if not exists public.holding_stakes (
  holding_symbol text not null,
  sub_ticker     text not null,       -- BIST kodu (fundamentals + live_prices ile eşleşir)
  sub_name       text,
  stake_pct      numeric not null,    -- etkin ortaklık %
  note           text,                -- güvenilirlik şerhi (ör. "varsayım", "İştirak")
  period         text not null default '2026/06',
  updated_at     timestamptz not null default now(),
  primary key (holding_symbol, sub_ticker, period)
);

create index if not exists holding_stakes_holding_idx on public.holding_stakes (holding_symbol);
