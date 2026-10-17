-- Escrituras de varios pasos en una sola transacción: o se aplican todas o ninguna.
--
-- La lógica sigue en la app; esta función solo aplica, en orden, la lista de escrituras que
-- le llega. Se ejecuta con los permisos de quien llama (security invoker), así que las
-- políticas RLS de cada tabla siguen valiendo, y solo acepta las tablas de datos del hogar.
--
-- p_ops: [{ "kind": "insert", "table": "products", "rows": [{...}] }
--         { "kind": "update", "table": "products", "id": "p1", "patch": {...} }
--         { "kind": "remove", "table": "inventory_lots", "ids": ["l1"] }
--         { "kind": "removeAll", "table": "purchase_sessions" }]
-- Las filas y los cambios llegan con los nombres de columna de la base de datos (snake_case).

create or replace function public.apply_batch(p_household_id uuid, p_ops jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  op jsonb;
  tbl text;
  sets text;
  cols text;
  allowed constant text[] := array[
    'products', 'inventory_lots', 'purchase_sessions', 'provisional_purchases', 'prices', 'tickets',
    'ticket_reviews', 'name_aliases', 'dog_items', 'dog_reminders', 'stock_events', 'operations',
    'household_events', 'activity', 'quick_sessions', 'barcodes'
  ];
begin
  if not public.is_member(p_household_id) then
    raise exception 'No perteneces a este hogar' using errcode = '42501';
  end if;
  if jsonb_typeof(p_ops) <> 'array' then
    raise exception 'p_ops debe ser una lista';
  end if;

  for op in select value from jsonb_array_elements(p_ops) loop
    tbl := op ->> 'table';
    if tbl is null or not (tbl = any (allowed)) then
      raise exception 'Tabla no permitida: %', coalesce(tbl, '(vacía)');
    end if;

    case op ->> 'kind'
      when 'insert' then
        -- Inserta o actualiza (igual que el upsert de la app), siempre dentro del hogar indicado.
        select string_agg(format('%I = excluded.%I', column_name, column_name), ', ')
          into sets
          from information_schema.columns
         where table_schema = 'public' and table_name = tbl and column_name not in ('household_id', 'id');
        execute format(
          'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1) '
          'on conflict (household_id, id) do update set %s',
          tbl, tbl, sets
        )
        using (
          select coalesce(jsonb_agg(item || jsonb_build_object('household_id', p_household_id)), '[]'::jsonb)
            from jsonb_array_elements(op -> 'rows') as r(item)
        );
      when 'update' then
        select string_agg(format('%I', key), ', ') into cols
          from jsonb_object_keys(op -> 'patch') as k(key)
         where key not in ('household_id', 'id');
        if cols is not null then
          execute format(
            'update public.%I as x set (%s) = (select %s from jsonb_populate_record(x, $3)) '
            'where x.household_id = $1 and x.id = $2',
            tbl, cols, cols
          )
          using p_household_id, op ->> 'id', op -> 'patch';
        end if;
      when 'remove' then
        execute format('delete from public.%I where household_id = $1 and id = any ($2)', tbl)
        using p_household_id, array(select jsonb_array_elements_text(op -> 'ids'));
      when 'removeAll' then
        execute format('delete from public.%I where household_id = $1', tbl) using p_household_id;
      else
        raise exception 'Operación desconocida: %', coalesce(op ->> 'kind', '(vacía)');
    end case;
  end loop;
end;
$$;

revoke execute on function public.apply_batch(uuid, jsonb) from anon, public;
grant execute on function public.apply_batch(uuid, jsonb) to authenticated;
