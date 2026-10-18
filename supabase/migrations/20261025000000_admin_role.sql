-- «Administrador» como rol de la cuenta (antes era un PIN guardado en cada dispositivo).
--
-- Roles del hogar: owner (quien lo creó, «Responsable»), admin y member. Responsables y
-- administradores hacen el mantenimiento; los miembros, el uso diario. El servidor lo comprueba:
--   - Solo un administrador puede nombrar o quitar administradores (nunca cambiar al responsable).
--   - En la mascota, crear y borrar artículos y gestionar recordatorios es de administradores;
--     todos pueden ver y contar existencias.
-- En el almacén el mantenimiento edita productos igual que el uso diario (tickets, compra), así que
-- allí la app limita la pantalla de mantenimiento a administradores.

alter table public.household_members drop constraint if exists household_members_role_check;
alter table public.household_members
  add constraint household_members_role_check check (role in ('owner', 'admin', 'member'));

create or replace function public.is_admin(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

create or replace function public.set_member_role(p_household_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(p_household_id) then
    raise exception 'not admin';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'invalid role';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'own role';
  end if;
  update public.household_members set role = p_role
  where household_id = p_household_id and user_id = p_user_id and role <> 'owner';
  if not found then
    raise exception 'member not found';
  end if;
end;
$$;

revoke execute on function public.is_admin(uuid) from anon, public;
revoke execute on function public.set_member_role(uuid, uuid, text) from anon, public;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;

drop policy if exists "dog_items: solo miembros" on public.dog_items;
create policy "dog_items: ver" on public.dog_items for select to authenticated
  using (public.is_member(household_id));
create policy "dog_items: contar" on public.dog_items for update to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "dog_items: crear (administradores)" on public.dog_items for insert to authenticated
  with check (public.is_admin(household_id));
create policy "dog_items: borrar (administradores)" on public.dog_items for delete to authenticated
  using (public.is_admin(household_id));

drop policy if exists "dog_reminders: solo miembros" on public.dog_reminders;
create policy "dog_reminders: ver" on public.dog_reminders for select to authenticated
  using (public.is_member(household_id));
create policy "dog_reminders: gestionar (administradores)" on public.dog_reminders for all to authenticated
  using (public.is_admin(household_id)) with check (public.is_admin(household_id));
