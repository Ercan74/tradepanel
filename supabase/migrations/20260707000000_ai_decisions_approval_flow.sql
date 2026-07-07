-- Faz 1: ai_decisions tablosuna Telegram onay akışı alanları
-- status yaşam döngüsü: PENDING -> APPROVED / REJECTED / AUTO_EXECUTED / EXPIRED

alter table public.ai_decisions
  add column if not exists status text not null default 'PENDING',
  add column if not exists telegram_message_id bigint,
  add column if not exists telegram_chat_id text,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists suggested_side text,
  add column if not exists suggested_price numeric,
  add column if not exists suggested_qty numeric;

alter table public.ai_decisions
  drop constraint if exists ai_decisions_status_check;

alter table public.ai_decisions
  add constraint ai_decisions_status_check
  check (status in ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_EXECUTED', 'EXPIRED'));

-- Mevcut satırlar onay akışından önce üretildi ve (CLOSE/REDUCE için)
-- otomatik uygulandı — hepsini AUTO_EXECUTED olarak işaretle.
update public.ai_decisions set status = 'AUTO_EXECUTED';
