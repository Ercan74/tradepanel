-- Haber/temel-analiz bağlam notları (news-test otomasyonunun hedef deposu).
-- İZOLE: canlı portföy-agent'a BESLENMEZ. 1c ([[learning-agent-attribution]])
-- kapısı açılınca agent bu tablodan "son notu" okuyup prompt'una "TEMEL BAĞLAM"
-- olarak alacak (fed_to_agent ile izlenir). Şimdilik yalnız arşiv + dashboard
-- görüntüleme. Vercel cron (2×/gün izole; entegrasyonda 15-dk-yoklama) Haiku ile
-- doldurur. Not: içerik kaynak-etiketli + güven-etiketli (KESİN/RAPORLU/ANLATI),
-- BAĞLAM üretir SİNYAL değil (bkz. news-test/TEMPLATE.md + SCOPE.md).
create table if not exists public.news_context (
  id uuid primary key default gen_random_uuid(),
  scan_at timestamptz not null default now(),      -- tarama zamanı
  scan_slot text,                                  -- '10:00' | '14:00' | 'event'
  note_type text not null default 'DELTA',         -- 'BASELINE' | 'DELTA'
  content text not null,                           -- notun TAM markdown metni
  summary text,                                    -- dashboard listesi için kısa özet
  regime text,                                     -- 'RISK-ON' | 'RISK-OFF' | 'KARIŞIK' (ops.)
  confidence_kesin int not null default 0,         -- KESİN madde sayısı
  confidence_raporlu int not null default 0,       -- RAPORLU madde sayısı
  confidence_anlati int not null default 0,        -- ANLATI madde sayısı
  portfolio_symbols text[],                        -- kapsadığı semboller
  model text,                                      -- 'haiku-4-5' vb. (kalite izleme)
  fed_to_agent boolean not null default false,     -- 1c sonrası agent okudu mu
  created_at timestamptz not null default now()
);

-- Son notu / tarih aralığını hızlı çekmek için.
create index if not exists news_context_scan_at_idx
  on public.news_context (scan_at desc);

comment on table public.news_context is
  'İzole haber/temel bağlam notları (news-test otomasyonu). Canlı agent''a beslenmez; 1c kapısı sonrası okunacak.';
