-- Avisos de la mascota en el iPhone aunque Cesta esté cerrada (Web Push; iOS 16.4+ con la app instalada).
--
-- 1. Cada dispositivo que activa los avisos guarda aquí su suscripción (solo la ve su dueño).
-- 2. Cada 5 minutos pg_cron llama a la Edge Function pet-push, que pide los recordatorios que tocan
--    (hora local de cada dispositivo) y los envía una sola vez al día por dispositivo.
-- 3. Las claves VAPID las genera la propia función y se guardan en Vault; la pública se publica en
--    push_config para que la app pueda suscribirse. Nadie más ve la privada.

create table public.push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  time_zone text not null default 'Europe/Madrid',
  created_at timestamptz not null default now()
);
create index push_subscriptions_household on public.push_subscriptions (household_id);
alter table public.push_subscriptions enable row level security;
create policy "push: mis dispositivos" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member(household_id));

-- Qué se ha enviado hoy a cada dispositivo (solo lo usa el servidor).
create table public.push_sent (
  endpoint text not null references public.push_subscriptions (endpoint) on delete cascade,
  reminder_id text not null,
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (endpoint, reminder_id, day)
);
alter table public.push_sent enable row level security;

-- Clave pública para suscribirse (pública por diseño).
create table public.push_config (
  id boolean primary key default true check (id),
  public_key text not null
);
alter table public.push_config enable row level security;
create policy "push_config: lectura pública" on public.push_config for select to anon, authenticated using (true);

-- Recordatorios que tocan ahora en cada dispositivo: activos, ya pasada su hora local (hasta 2 h
-- después, para no avisar de cosas viejas) y aún no enviados hoy a ese dispositivo.
create or replace function public.due_pet_reminders()
returns table (
  endpoint text,
  p256dh text,
  auth text,
  reminder_id text,
  title text,
  pet_name text,
  day date
)
language sql
stable
security definer
set search_path = public
as $$
  select s.endpoint, s.p256dh, s.auth, r.id, r.title, h.pet_name, (now() at time zone s.time_zone)::date
  from public.dog_reminders r
  join public.households h on h.id = r.household_id
  join public.push_subscriptions s on s.household_id = r.household_id
  join pg_timezone_names tz on tz.name = s.time_zone
  where r.enabled
    and (now() at time zone s.time_zone)::time >= r.reminder_time::time
    and (now() at time zone s.time_zone)::time < r.reminder_time::time + interval '2 hours'
    and not exists (
      select 1 from public.push_sent p
      where p.endpoint = s.endpoint and p.reminder_id = r.id and p.day = (now() at time zone s.time_zone)::date
    );
$$;

-- Claves VAPID en Vault (solo el servidor).
create or replace function public.push_vapid_keys()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return (select decrypted_secret::jsonb from vault.decrypted_secrets where name = 'cesta_push_vapid' limit 1);
end;
$$;

create or replace function public.push_save_vapid_keys(p_keys jsonb, p_public_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from vault.secrets where name = 'cesta_push_vapid') then
    return;
  end if;
  perform vault.create_secret(p_keys::text, 'cesta_push_vapid', 'Claves VAPID de los avisos de Cesta');
  insert into public.push_config (id, public_key) values (true, p_public_key)
  on conflict (id) do update set public_key = excluded.public_key;
end;
$$;

-- La llamada de pg_cron se identifica con un secreto que solo conocen Vault y la función.
create or replace function public.push_cron_secret_ok(p_secret text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return p_secret is not null
    and p_secret = (select decrypted_secret from vault.decrypted_secrets where name = 'cesta_push_cron' limit 1);
end;
$$;

revoke execute on function public.due_pet_reminders() from public, anon, authenticated;
revoke execute on function public.push_vapid_keys() from public, anon, authenticated;
revoke execute on function public.push_save_vapid_keys(jsonb, text) from public, anon, authenticated;
revoke execute on function public.push_cron_secret_ok(text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.due_pet_reminders() to service_role;
    grant execute on function public.push_vapid_keys() to service_role;
    grant execute on function public.push_save_vapid_keys(jsonb, text) to service_role;
    grant execute on function public.push_cron_secret_ok(text) to service_role;
    grant select, insert, delete on public.push_sent to service_role;
    grant select, delete on public.push_subscriptions to service_role;
  end if;
end
$$;

-- Solo en Supabase (con Vault, pg_cron y pg_net); en las pruebas con PGlite se omite.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'supabase_vault')
    and exists (select 1 from pg_extension where extname = 'pg_cron')
    and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
    if not exists (select 1 from vault.secrets where name = 'cesta_push_cron') then
      perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cesta_push_cron');
    end if;
    perform cron.schedule(
      'cesta-pet-push',
      '*/5 * * * *',
      $job$
        select net.http_post(
          url := 'https://ykptjovevwmzxzuejhzp.supabase.co/functions/v1/pet-push',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cesta-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'cesta_push_cron')
          ),
          body := '{}'::jsonb
        )
      $job$
    );
  end if;
end
$$;
