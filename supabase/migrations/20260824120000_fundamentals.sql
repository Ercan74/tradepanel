-- fundamentals: KAP finansal tablolarından çıkarılan temel-analiz kalemleri.
-- 2026-08-24: bilanço-değerleme aracı (Faz-1 MVP). Lokal parser
-- (finansal-agent/kap_fundamentals_parser.py) çeyrekte bir KAP dosyalarını
-- (Finansal Tablolar/) okur, sembol başına standartlaştırılmış kalemleri buraya
-- yazar. Değerleme (P/D-ROE, artık-gelir, F/K, EV/EBITDA) uygulama katmanında
-- canlı fiyatla hesaplanır (bu tablo fiyat-bağımsız çekirdeği tutar).
-- Tüm parasal alanlar TAM TL (ölçek parser'da çözülür: banka mn / sanayi bin).

create table if not exists public.fundamentals (
  symbol            text not null,
  period            text not null,              -- örn "2026/06"
  period_end        date,
  template          text,                        -- bank | industrial | holding
  consolidation     text,                        -- Konsolide | Konsolide Olmayan
  currency_scale    bigint,                      -- 1000 (bin) | 1000000 (mn)
  shares            numeric,                     -- adet (ödenmiş sermaye / 1 TL nominal)
  paid_in_capital   numeric,
  equity_parent     numeric,                     -- ana ortaklığa ait özkaynak (TL)
  equity_total      numeric,
  net_income_period numeric,                     -- dönem (6 ay) net kâr (TL)
  net_income_parent numeric,
  total_assets      numeric,
  revenue           numeric,                     -- sanayi: hasılat
  gross_profit      numeric,
  operating_profit  numeric,                     -- esas faaliyet kârı
  dep_amort         numeric,                     -- amortisman+itfa (EBITDA için)
  financial_debt    numeric,                     -- kısa+uzun finansal borç
  cash              numeric,
  -- türev (fiyat-bağımsız)
  bvps              numeric,                     -- ana ortaklık özkaynak / hisse
  eps_period        numeric,
  eps_annualized    numeric,
  roe               numeric,
  source_file       text,
  parsed_at         timestamptz not null default now(),
  primary key (symbol, period)
);

create index if not exists fundamentals_symbol_idx on public.fundamentals (symbol);
