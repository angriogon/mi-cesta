-- Aviso push cuando un artículo de la mascota (pienso, arena…) está en su mínimo o por debajo.
-- Una vez al día por artículo y dispositivo, a partir de las 10:00 de su hora local y hasta las
-- 12:00 (para no avisar de madrugada ni tarde). La Edge Function pet-push los envía junto a los
-- recordatorios; en push_sent se anotan como «stock:<id>».

create or replace function public.due_pet_stock_alerts()
returns table (
  endpoint text,
  p256dh text,
  auth text,
  alert_id text,
  item_name text,
  current_stock integer,
  minimum_stock integer,
  pet_name text,
  day date
)
language sql
stable
security definer
set search_path = public
as $$
  select s.endpoint, s.p256dh, s.auth, 'stock:' || i.id, i.name, i.current_stock, i.minimum_stock, h.pet_name,
    (now() at time zone s.time_zone)::date
  from public.dog_items i
  join public.households h on h.id = i.household_id
  join public.push_subscriptions s on s.household_id = i.household_id
  join pg_timezone_names tz on tz.name = s.time_zone
  where i.minimum_stock > 0
    and i.current_stock <= i.minimum_stock
    and (now() at time zone s.time_zone)::time >= time '10:00'
    and (now() at time zone s.time_zone)::time < time '12:00'
    and not exists (
      select 1 from public.push_sent p
      where p.endpoint = s.endpoint and p.reminder_id = 'stock:' || i.id
        and p.day = (now() at time zone s.time_zone)::date
    );
$$;

revoke execute on function public.due_pet_stock_alerts() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.due_pet_stock_alerts() to service_role;
  end if;
end
$$;
