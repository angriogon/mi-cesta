-- Catálogo base ampliado (47 productos): básicos que faltaban (azúcar, harina, fideos…) y los
-- que aparecían en tickets reales sin equivalente (aceitunas, pepinillos, setas, rosquillas,
-- ambientadores…). Los hogares nuevos los reciben al crearse; a los existentes se les añaden con
-- existencias a cero si aún no tienen un producto con ese nombre.

insert into public.catalog_template (sku, name, category) values
  ('despensa-azucar', 'Azúcar', 'Despensa'),
  ('despensa-azucar-moreno', 'Azúcar moreno', 'Despensa'),
  ('despensa-harina-de-trigo', 'Harina de trigo', 'Despensa'),
  ('despensa-harina-de-maiz', 'Harina de maíz', 'Despensa'),
  ('despensa-levadura', 'Levadura', 'Despensa'),
  ('despensa-pan-rallado', 'Pan rallado', 'Despensa'),
  ('despensa-fideos', 'Fideos', 'Despensa'),
  ('despensa-noodles', 'Noodles', 'Despensa'),
  ('despensa-cuscus', 'Cuscús', 'Despensa'),
  ('despensa-quinoa', 'Quinoa', 'Despensa'),
  ('despensa-aceitunas', 'Aceitunas', 'Despensa'),
  ('despensa-pepinillos', 'Pepinillos', 'Despensa'),
  ('despensa-pimientos-del-piquillo', 'Pimientos del piquillo', 'Despensa'),
  ('despensa-cayena', 'Cayena', 'Despensa'),
  ('despensa-cebolla-frita', 'Cebolla frita', 'Despensa'),
  ('despensa-leche-de-coco', 'Leche de coco', 'Despensa'),
  ('despensa-hummus', 'Hummus', 'Despensa'),
  ('despensa-cereales-de-chocolate', 'Cereales de chocolate', 'Despensa'),
  ('despensa-galletas-saladas', 'Galletas saladas', 'Despensa'),
  ('despensa-patatas-chips', 'Patatas chips', 'Despensa'),
  ('despensa-sal-gruesa', 'Sal gruesa', 'Despensa'),
  ('despensa-bicarbonato', 'Bicarbonato', 'Despensa'),
  ('fruta-y-verdura-setas', 'Setas', 'Fruta y verdura'),
  ('fruta-y-verdura-cebollino', 'Cebollino', 'Fruta y verdura'),
  ('fruta-y-verdura-frutos-rojos', 'Frutos rojos', 'Fruta y verdura'),
  ('fruta-y-verdura-brotes-tiernos', 'Brotes tiernos', 'Fruta y verdura'),
  ('fruta-y-verdura-rucula', 'Rúcula', 'Fruta y verdura'),
  ('fruta-y-verdura-lechuga-romana', 'Lechuga romana', 'Fruta y verdura'),
  ('fruta-y-verdura-esparragos-trigueros', 'Espárragos trigueros', 'Fruta y verdura'),
  ('fruta-y-verdura-jengibre', 'Jengibre', 'Fruta y verdura'),
  ('fruta-y-verdura-batata', 'Batata', 'Fruta y verdura'),
  ('fruta-y-verdura-cebolla-morada', 'Cebolla morada', 'Fruta y verdura'),
  ('fruta-y-verdura-albahaca', 'Albahaca', 'Fruta y verdura'),
  ('refrigerados-tofu', 'Tofu', 'Refrigerados'),
  ('refrigerados-yogur-de-soja', 'Yogur de soja', 'Refrigerados'),
  ('refrigerados-bebida-de-soja', 'Bebida de soja', 'Refrigerados'),
  ('refrigerados-bebida-de-avena', 'Bebida de avena', 'Refrigerados'),
  ('refrigerados-masa-de-pizza', 'Masa de pizza', 'Refrigerados'),
  ('refrigerados-hojaldre', 'Hojaldre', 'Refrigerados'),
  ('panaderia-caracolas', 'Caracolas', 'Panadería'),
  ('panaderia-rosquillas', 'Rosquillas', 'Panadería'),
  ('bebidas-te-frio', 'Té frío', 'Bebidas'),
  ('bebidas-cafe-frio', 'Café frío', 'Bebidas'),
  ('higiene-y-hogar-ambientador', 'Ambientador', 'Higiene y hogar'),
  ('higiene-y-hogar-recambio-de-ambientador', 'Recambio de ambientador', 'Higiene y hogar'),
  ('higiene-y-hogar-carbon-para-barbacoa', 'Carbón para barbacoa', 'Higiene y hogar'),
  ('higiene-y-hogar-pastillas-lavavajillas', 'Pastillas lavavajillas', 'Higiene y hogar')
on conflict (sku) do nothing;

insert into public.products (household_id, id, sku, name, category)
select h.id, gen_random_uuid()::text, t.sku, t.name, t.category
from public.households h
cross join public.catalog_template t
where t.sku in ('despensa-azucar', 'despensa-azucar-moreno', 'despensa-harina-de-trigo', 'despensa-harina-de-maiz', 'despensa-levadura', 'despensa-pan-rallado', 'despensa-fideos', 'despensa-noodles', 'despensa-cuscus', 'despensa-quinoa', 'despensa-aceitunas', 'despensa-pepinillos', 'despensa-pimientos-del-piquillo', 'despensa-cayena', 'despensa-cebolla-frita', 'despensa-leche-de-coco', 'despensa-hummus', 'despensa-cereales-de-chocolate', 'despensa-galletas-saladas', 'despensa-patatas-chips', 'despensa-sal-gruesa', 'despensa-bicarbonato', 'fruta-y-verdura-setas', 'fruta-y-verdura-cebollino', 'fruta-y-verdura-frutos-rojos', 'fruta-y-verdura-brotes-tiernos', 'fruta-y-verdura-rucula', 'fruta-y-verdura-lechuga-romana', 'fruta-y-verdura-esparragos-trigueros', 'fruta-y-verdura-jengibre', 'fruta-y-verdura-batata', 'fruta-y-verdura-cebolla-morada', 'fruta-y-verdura-albahaca', 'refrigerados-tofu', 'refrigerados-yogur-de-soja', 'refrigerados-bebida-de-soja', 'refrigerados-bebida-de-avena', 'refrigerados-masa-de-pizza', 'refrigerados-hojaldre', 'panaderia-caracolas', 'panaderia-rosquillas', 'bebidas-te-frio', 'bebidas-cafe-frio', 'higiene-y-hogar-ambientador', 'higiene-y-hogar-recambio-de-ambientador', 'higiene-y-hogar-carbon-para-barbacoa', 'higiene-y-hogar-pastillas-lavavajillas')
  and not exists (
    select 1 from public.products p where p.household_id = h.id and lower(p.name) = lower(t.name)
  );
