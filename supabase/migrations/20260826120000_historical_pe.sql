-- historical_pe: hisse başına TARİHSEL F/K anlık görüntüleri (borsadirekt.com,
-- Matriks-kaynaklı). 2026-08-26 (Faz-2b Option C — sektör-nötr "kendi-tarihsel"
-- değerleme sinyali). Kaynak: partialPriceEarning.aspx?PageType=FK&Index=XUTUM
-- (~580 hisse), haftalık cron ile tazelenir. Tarihsel çapalar yavaş değişir.
-- KULLANIM: öz-tarih medyanı = median(pe_6m, pe_1y, pe_2y) — TMS-29 enflasyon-
-- muhasebesi (~2023-24) kırılması yüzünden pe_3y/pe_5y KIYASA KATILMAZ (farklı
-- muhasebe tabanı). "-" (kayıp/negatif yıl) → null. Çevrimsel isimlerde F/K-tarihi
-- gürültülüdür (kâr döngüsü) — bağlam sinyali, sert hüküm değil.

create table if not exists public.historical_pe (
  symbol     text primary key,
  close      numeric,   -- önceki gün kapanış
  pe_now     numeric,   -- anlık F/K (borsadirekt, önceki gün kapanışına göre)
  pe_1w      numeric,
  pe_1m      numeric,
  pe_6m      numeric,
  pe_1y      numeric,
  pe_2y      numeric,
  pe_3y      numeric,   -- ⚠ TMS-29 öncesi olabilir (kıyasa katma)
  pe_5y      numeric,   -- ⚠ TMS-29 öncesi (kıyasa katma)
  fetched_at timestamptz not null default now()
);
