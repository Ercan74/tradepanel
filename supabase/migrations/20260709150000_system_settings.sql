-- Uyumluluk izleme altyapısı: sistem genelinde ayar saklamak için
-- key/value tablosu. İlk kullanım: genel açığa satış yasağı bayrağı
-- (compliance-monitor otomatik günceller, isShortSellEligible okur).

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.system_settings (key, value, updated_by) values
  ('short_sell_globally_banned', 'false'::jsonb, 'MIGRATION_DEFAULT')
on conflict (key) do nothing;
