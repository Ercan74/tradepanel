-- Gözlemlenebilirlik: portfolio-ai-agent'ın HER çalıştırması (reportOnly
-- dahil) ürettiği HAM/filtrelenmemiş karar setiyle birlikte loglanır.
-- Böylece "cron çalıştı mı, ne üretti, neden Telegram'a düşmedi" soruları
-- geriye dönük kanıtla cevaplanabilir.

create table if not exists public.agent_run_log (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  mode text not null,                -- 'agent' | 'report_only'
  decisions jsonb not null,          -- ham decisions dizisi (urgency/type/symbol/side/source dahil)
  decision_count int not null default 0,
  summary text,
  monthly_outlook text,
  portfolio_snapshot jsonb           -- açık pozisyon sayısı, havuz/tarama boyutu, PnL
);

create index if not exists agent_run_log_run_at_idx
  on public.agent_run_log (run_at desc);
