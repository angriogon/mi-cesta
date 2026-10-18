-- Catálogo base sin pares duplicados («Garbanzo» / «Garbanzos», «Pizza» / «Pizzas»…).
-- Los hogares nuevos ya no los reciben. En los existentes solo se quitan los que nadie ha usado:
-- sin existencias ni mínimo, no ocultos y sin lotes, precios, revisiones, alias ni movimientos.
delete from public.catalog_template
where sku in ('congelados-pizzas', 'garbanzo', 'garbanzo-cocido', 'lenteja-cocida');

delete from public.products p
where p.sku in ('congelados-pizzas', 'garbanzo', 'garbanzo-cocido', 'lenteja-cocida')
  and p.current_stock = 0
  and p.minimum_stock = 0
  and not p.suppressed
  and not exists (select 1 from public.inventory_lots l where l.household_id = p.household_id and l.product_id = p.id)
  and not exists (select 1 from public.prices x where x.household_id = p.household_id and x.product_id = p.id)
  and not exists (select 1 from public.ticket_reviews r where r.household_id = p.household_id and r.product_id = p.id)
  and not exists (select 1 from public.name_aliases a where a.household_id = p.household_id and a.product_id = p.id)
  and not exists (select 1 from public.stock_events e where e.household_id = p.household_id and e.product_id = p.id);
