-- Límite al crecimiento del historial.
--
-- stock_events: las previsiones usan como mucho los últimos 90 días (ritmo de consumo) y los
--   ciclos de compra; se guarda algo más de un año para no perder productos de compra rara.
-- operations: solo sirven para «Deshacer», que usa la última; se guardan 30 días.
--
-- La limpieza la hace el servidor una vez al día (pg_cron). Nadie desde la app puede ejecutarla.

create or replace function public.prune_history(
  p_events_days int default 400,
  p_operations_days int default 30
)
returns void
language sql
security invoker
set search_path = public
as $$
  delete from public.stock_events where created_at < now() - make_interval(days => p_events_days);
  delete from public.operations where created_at < now() - make_interval(days => p_operations_days);
$$;

revoke execute on function public.prune_history(int, int) from public;
revoke execute on function public.prune_history(int, int) from anon, authenticated;

create index if not exists operations_by_date on public.operations (created_at);
create index if not exists stock_events_by_date on public.stock_events (created_at);

-- Solo donde existe pg_cron (Supabase); en las pruebas con PGlite se omite.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('cesta-prune-history', '17 3 * * *', 'select public.prune_history()');
  end if;
end
$$;
