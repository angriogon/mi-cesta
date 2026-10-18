-- Recordatorios de la mascota entre las 22:00 y las 23:59: no se enviaban nunca.
-- La ventana era «hora >= recordatorio y hora < recordatorio + 2 h», y en un tipo time
-- «22:40 + 2 h» da la vuelta a las 00:40, así que la segunda condición no se cumplía.
-- Ahora la ventana es «hora - recordatorio < 2 h» con la hora ya pasada: acaba a medianoche
-- como mucho y no se repite al día siguiente.

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
    and (now() at time zone s.time_zone)::time - r.reminder_time::time < interval '2 hours'
    and not exists (
      select 1 from public.push_sent p
      where p.endpoint = s.endpoint and p.reminder_id = r.id and p.day = (now() at time zone s.time_zone)::date
    );
$$;

revoke execute on function public.due_pet_reminders() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.due_pet_reminders() to service_role;
  end if;
end
$$;
