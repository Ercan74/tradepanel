-- positions: VIOP (pay-vadeli) short'ları için mecra + kontrat alanları.
-- 2026-08-31. BİST spot açığa satış gün-içi kapanmak zorunda (bkz. intraday-short-
-- close); VIOP'ta vadelisi olan hisselerde short ORADA açılıp TAŞINABİLİR. Routing
-- (lib/viop.ts routeShort) short'u VIOP mu spot mu açacağını belirler; sonuç bu
-- alanlara yazılır. Mevcut TÜM pozisyonlar spot → venue default 'SPOT'.
--
--   venue         : 'SPOT' | 'VIOP'  (short/long mecrası)
--   viop_contract : VIOP kontrat sembolü, ör. 'F_GARAN0926' (yalnız VIOP; spot NULL)
--   contracts     : VIOP kontrat adedi N (yalnız VIOP; spot NULL — spot quantity/lot kullanır)
--
-- KRİTİK: intraday-short-close cron'u yalnız venue='SPOT' short'ları gün-içi kapatır;
-- venue='VIOP' short'lar KAPANMAZ (vade sonuna dek taşınır).

alter table public.positions
  add column if not exists venue text not null default 'SPOT';

alter table public.positions
  add column if not exists viop_contract text;

alter table public.positions
  add column if not exists contracts integer;

-- venue yalnız SPOT/VIOP olabilir (idempotent guard — constraint zaten varsa atla).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'positions_venue_chk'
  ) then
    alter table public.positions
      add constraint positions_venue_chk check (venue in ('SPOT', 'VIOP'));
  end if;
end $$;

comment on column public.positions.venue is 'Mecra: SPOT (BİST, spot short gün-içi kapanır) | VIOP (pay-vadeli, taşınır). Default SPOT.';
comment on column public.positions.viop_contract is 'VIOP kontrat sembolü (F_<SEM><AAYY>), ör. F_GARAN0926. Yalnız venue=VIOP; spot NULL.';
comment on column public.positions.contracts is 'VIOP kontrat adedi N (1 kontrat = 100 pay). Yalnız venue=VIOP; spot NULL (quantity/lot kullanır).';
