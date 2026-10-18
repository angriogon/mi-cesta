-- Permisos de cada persona del hogar y quitar a alguien del hogar.
--
-- Además del rol (owner «Responsable», admin, member), cada miembro tiene permisos sueltos:
--   - almacen:  mantenimiento del almacén (mínimos, productos, restablecer). Lo limita la app.
--   - mascota:  crear y borrar artículos de la mascota y gestionar sus recordatorios. Lo comprueba el servidor.
--   - miembros: dar o quitar permisos y quitar a alguien del hogar. Lo comprueba el servidor.
-- El responsable y los administradores tienen todos. Todos pueden usar la lista, la compra, los
-- tickets y contar existencias.

alter table public.household_members
  add column if not exists permissions text[] not null default '{}';
alter table public.household_members drop constraint if exists household_members_permissions_check;
alter table public.household_members
  add constraint household_members_permissions_check
  check (permissions <@ array['almacen', 'mascota', 'miembros']::text[]);

update public.household_members
set permissions = array['almacen', 'mascota', 'miembros']
where role = 'admin';

create or replace function public.has_permission(p_household_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household_id
      and user_id = auth.uid()
      and (role in ('owner', 'admin') or p_permission = any (permissions))
  );
$$;

-- Cambia los permisos de otra persona (no los propios ni los del responsable). Con todos, pasa a
-- administrador; si no, a miembro.
create or replace function public.set_member_permissions(p_household_id uuid, p_user_id uuid, p_permissions text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text[] := array(select distinct unnest(coalesce(p_permissions, '{}')) order by 1);
begin
  if not public.has_permission(p_household_id, 'miembros') then
    raise exception 'not allowed';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'own permissions';
  end if;
  if not clean <@ array['almacen', 'mascota', 'miembros']::text[] then
    raise exception 'invalid permission';
  end if;
  update public.household_members
  set permissions = clean,
      role = case when clean @> array['almacen', 'mascota', 'miembros']::text[] then 'admin' else 'member' end
  where household_id = p_household_id and user_id = p_user_id and role <> 'owner';
  if not found then
    raise exception 'member not found';
  end if;
end;
$$;

-- Quita a otra persona del hogar (nunca al responsable; para irse uno mismo está leave_household).
-- Sus dispositivos dejan de recibir los avisos de este hogar.
create or replace function public.remove_member(p_household_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(p_household_id, 'miembros') then
    raise exception 'not allowed';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'use leave_household';
  end if;
  delete from public.household_members
  where household_id = p_household_id and user_id = p_user_id and role <> 'owner';
  if not found then
    raise exception 'member not found';
  end if;
  delete from public.push_subscriptions where household_id = p_household_id and user_id = p_user_id;
end;
$$;

-- Los listados devuelven también los permisos.
drop function if exists public.my_households();
create function public.my_households()
returns table (id uuid, name text, invite_code text, role text, permissions text[])
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.name, h.invite_code, m.role, m.permissions
  from public.households h
  join public.household_members m on m.household_id = h.id
  where m.user_id = auth.uid()
  order by m.created_at;
$$;

drop function if exists public.household_members_list(uuid);
create function public.household_members_list(p_household_id uuid)
returns table (user_id uuid, email text, role text, permissions text[])
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, u.email::text, m.role, m.permissions
  from public.household_members m
  join auth.users u on u.id = m.user_id
  where m.household_id = p_household_id and public.is_member(p_household_id)
  order by m.created_at;
$$;

revoke execute on function public.has_permission(uuid, text) from anon, public;
revoke execute on function public.set_member_permissions(uuid, uuid, text[]) from anon, public;
revoke execute on function public.remove_member(uuid, uuid) from anon, public;
revoke execute on function public.my_households() from anon, public;
revoke execute on function public.household_members_list(uuid) from anon, public;
grant execute on function public.has_permission(uuid, text) to authenticated;
grant execute on function public.set_member_permissions(uuid, uuid, text[]) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.my_households() to authenticated;
grant execute on function public.household_members_list(uuid) to authenticated;

-- Mascota: crear, borrar y recordatorios, con el permiso «mascota».
drop policy if exists "dog_items: crear (administradores)" on public.dog_items;
drop policy if exists "dog_items: borrar (administradores)" on public.dog_items;
create policy "dog_items: crear (permiso mascota)" on public.dog_items for insert to authenticated
  with check (public.has_permission(household_id, 'mascota'));
create policy "dog_items: borrar (permiso mascota)" on public.dog_items for delete to authenticated
  using (public.has_permission(household_id, 'mascota'));

drop policy if exists "dog_reminders: gestionar (administradores)" on public.dog_reminders;
create policy "dog_reminders: gestionar (permiso mascota)" on public.dog_reminders for all to authenticated
  using (public.has_permission(household_id, 'mascota')) with check (public.has_permission(household_id, 'mascota'));
