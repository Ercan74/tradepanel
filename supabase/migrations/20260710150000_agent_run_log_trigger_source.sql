-- Çalıştırma kaynağı ayrımı: manuel Yenile / cron / diğer tetikleyiciler
-- agent_run_log'da ayırt edilebilsin.

alter table public.agent_run_log
  add column if not exists trigger_source text;
