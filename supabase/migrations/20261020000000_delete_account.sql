-- Eliminar la propia cuenta (derecho de supresión del RGPD; Apple también lo exige en la App Store).
--
-- Sale de cada hogar como haría leave_household: si era el último miembro el hogar se borra con
-- todos sus datos, y si no, sigue para los demás (con un nuevo responsable si hacía falta).
-- Después borra el usuario de auth.users. Las fotos de los tickets las borra antes la app, porque
-- el almacenamiento de Supabase no permite borrar archivos desde SQL.
-- Solo actúa sobre quien llama (auth.uid()); no recibe parámetros.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  h uuid;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  for h in select household_id from public.household_members where user_id = me loop
    perform public.leave_household(h);
  end loop;
  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_my_account() from anon, public;
grant execute on function public.delete_my_account() to authenticated;
