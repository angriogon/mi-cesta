-- pg_net en el esquema extensions (recomendación del asesor de seguridad de Supabase).
-- Sus funciones siguen en net.*, así que la tarea cesta-pet-push no cambia.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net' and extnamespace = 'public'::regnamespace) then
    drop extension pg_net;
    create extension pg_net with schema extensions;
  end if;
end
$$;
