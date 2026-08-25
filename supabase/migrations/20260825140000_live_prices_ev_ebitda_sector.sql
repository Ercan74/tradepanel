-- live_prices: Matriks EV/EBITDA (FD_FAVOK), Piyasa Değeri, Firma Değeri (EV) +
-- BIST sektörü. 2026-08-25 (Faz-2b). Kullanıcı Excel Sayfa4'te AC=FD_FAVOK,
-- AD=Piyasa Değeri, AE=Firma Değeri çekiyor; sektör feed'in BIST_SECTOR_MAP'inden.
--   * ev_ebitda  → sanayi SEKTÖR-GÖRELİ değerleme (COE-bağımsız, doğru çarpan).
--   * mkt_cap    → holding NAV iştirak değeri birebir (hisse×fiyat parse'ı yerine).
--   * firm_value → EV; Net Borç = firm_value − mkt_cap (holding net borcu türetilir).
--   * sector     → sektör-medyan çarpanları (kalın sektörlerde göreli verdikt).
-- Hepsi nullable; feed yoksa değerleme eski (KAP/absolute) davranışa düşer.

alter table public.live_prices add column if not exists ev_ebitda  numeric; -- FD_FAVOK (AC)
alter table public.live_prices add column if not exists mkt_cap    numeric; -- Piyasa Değeri (AD)
alter table public.live_prices add column if not exists firm_value numeric; -- Firma Değeri/EV (AE)
alter table public.live_prices add column if not exists sector     text;    -- BIST sektörü (feed map)

comment on column public.live_prices.ev_ebitda  is 'Matriks FD/FAVÖK (EV/EBITDA) — Excel AC. Sanayi sektör-göreli değerleme.';
comment on column public.live_prices.mkt_cap    is 'Matriks Piyasa Değeri — Excel AD. Holding NAV iştirak değeri.';
comment on column public.live_prices.firm_value is 'Matriks Firma Değeri (EV) — Excel AE. Net Borç = firm_value − mkt_cap.';
comment on column public.live_prices.sector     is 'BIST sektörü (feed BIST_SECTOR_MAP) — sektör-medyan çarpanları için.';
