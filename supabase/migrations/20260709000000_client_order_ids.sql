-- Broker mutabakatı temeli: pozisyon açılış ve kapanış emirleri için
-- kalıcı, benzersiz client order referansları.
-- Format (uygulama tarafında üretilir): TIOS-{yyyymmdd}-{kısa-uuid}
-- Mevcut kayıtlar null kalır; yalnızca yeni açılış/kapanışlar doldurur.

alter table public.positions
  add column if not exists client_order_id text,
  add column if not exists close_client_order_id text;

create unique index if not exists positions_client_order_id_key
  on public.positions (client_order_id)
  where client_order_id is not null;

create unique index if not exists positions_close_client_order_id_key
  on public.positions (close_client_order_id)
  where close_client_order_id is not null;
