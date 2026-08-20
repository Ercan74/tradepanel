-- news_context: fed_to_agent kolonunu kaldır (ölü bayrak temizliği).
-- 2026-08-20: fed_to_agent, izole dönemde "agent bu notu okudu mu" izlemek için
-- eklenmişti ama hiçbir zaman true'ya çekilmedi (insert'te hep false). Haber-
-- entegrasyonu 2026-08-19'da canlıya alındığında agent en güncel notu doğrudan
-- OKUYOR; bu bayrağa gerek kalmadı, hiçbir yerde select/filter edilmiyor.

alter table public.news_context
  drop column if exists fed_to_agent;
