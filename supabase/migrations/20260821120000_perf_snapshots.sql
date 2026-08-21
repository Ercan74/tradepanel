-- perf_snapshots: haftalık performans mini-tracker'ı.
-- 2026-08-21: trailing R:R modeli (2026-08-17) + REDUCE emekliliği (2026-08-19)
-- sonrası performansı haftalık dondurur. Amaç: "temiz dönem" R:R/winrate/beklenti,
-- N büyürken korunuyor mu izlemek (erken küçük-örnek sonuçları ortalamaya döner mi).
-- Her hafta bir cron (/api/perf-tracker) iki pencere yazar: ERA_CLEAN (2026-08-19'dan
-- kümülatif) ve LAST_7D (son 7 gün). Metrikler positions'tan türetilir (yeniden
-- hesaplanabilir; bu tablo zaman-serisini/trendi kalıcılaştırır).

create table if not exists public.perf_snapshots (
  id            uuid primary key default gen_random_uuid(),
  snapshot_at   timestamptz not null default now(),
  window_label  text not null,              -- ERA_CLEAN | LAST_7D
  window_from   timestamptz,                -- pencere başlangıcı (kapanış tarihi filtresi)
  n             integer not null,
  wins          integer not null,
  losses        integer not null,
  flats         integer not null default 0,
  winrate       numeric,                    -- %
  avg_win       numeric,                    -- TL
  avg_loss      numeric,                    -- TL
  rr            numeric,                     -- |avg_win / avg_loss|
  expectancy    numeric,                    -- TL / işlem
  total_pnl     numeric,                     -- TL
  created_at    timestamptz not null default now()
);

create index if not exists perf_snapshots_at_idx on public.perf_snapshots (snapshot_at desc);
