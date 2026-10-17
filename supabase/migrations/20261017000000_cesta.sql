-- Cesta 5 · esquema inicial
-- Cada hogar tiene sus propios datos; solo sus miembros pueden leerlos o modificarlos (RLS).


-- ---------- Hogares y miembros ----------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mi hogar' check (char_length(name) between 1 and 50),
  invite_code text not null unique,
  mode text not null default 'normal' check (mode in ('normal', 'autocesta')),
  pet_name text not null default 'Mascota' check (char_length(pet_name) between 1 and 40),
  postal_code text not null default '' check (postal_code = '' or postal_code ~ '^[0-9]{5}$'),
  price_meta jsonb not null default '{"postalCode": "", "lastAttemptedAt": null, "lastSuccessfulAt": null, "updatedCount": 0}',
  preferences jsonb not null default '{"specialDietEnabled": false, "allergens": [], "avoided": []}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user on public.household_members (user_id);
create index households_created_by on public.households (created_by);

create or replace function public.is_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = auth.uid()
  );
$$;

alter table public.households enable row level security;
create policy "hogares: ver los míos" on public.households for select to authenticated using (public.is_member(id));
create policy "hogares: editar los míos" on public.households for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));
-- Los miembros pueden cambiar los ajustes del hogar, pero no el código de invitación ni el creador.
revoke update on public.households from authenticated;
grant update (name, mode, pet_name, postal_code, price_meta, preferences) on public.households to authenticated;

alter table public.household_members enable row level security;
create policy "miembros: ver los de mis hogares" on public.household_members for select to authenticated
  using (public.is_member(household_id));

-- ---------- Listas compartidas (con revisión para no pisar cambios) ----------

create table public.lists (
  household_id uuid primary key references public.households (id) on delete cascade,
  shopping jsonb not null default '[]',
  checklist jsonb not null default '[]',
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.lists enable row level security;
create policy "listas: solo miembros" on public.lists for select to authenticated using (public.is_member(household_id));

-- ---------- Datos de cada hogar ----------

create table public.products (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  sku text not null default '',
  name text not null check (char_length(name) between 2 and 80),
  category text not null default 'Despensa',
  current_stock numeric not null default 0 check (current_stock >= 0),
  minimum_stock integer not null default 0 check (minimum_stock >= 0),
  suppressed boolean not null default false,
  confirmed_at timestamptz,
  planned_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.products enable row level security;
create policy "products: solo miembros" on public.products for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create table public.inventory_lots (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  product_id text,
  product_name text not null,
  quantity numeric not null default 1 check (quantity >= 0),
  expiry_date date,
  estimated boolean not null default false,
  state text not null default 'closed' check (state in ('closed', 'opened', 'reserved', 'cooked', 'frozen')),
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.inventory_lots enable row level security;
create policy "inventory_lots: solo miembros" on public.inventory_lots for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create table public.purchase_sessions (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  planned jsonb not null default '[]',
  created_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.purchase_sessions enable row level security;
create policy "purchase_sessions: solo miembros" on public.purchase_sessions for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create table public.provisional_purchases (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  items jsonb not null default '[]',
  created_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.provisional_purchases enable row level security;
create policy "provisional_purchases: solo miembros" on public.provisional_purchases for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create table public.prices (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  product_id text,
  product_name text not null,
  category text not null,
  price_cents integer not null check (price_cents >= 0),
  merchant text not null default '',
  source text not null check (source in ('ticket', 'mercadona', 'manual')),
  observed_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.prices enable row level security;
create policy "prices: solo miembros" on public.prices for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create table public.tickets (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  merchant text not null,
  purchased_at date not null,
  total_cents integer not null check (total_cents > 0),
  raw_text text not null default '',
  items jsonb not null default '[]',
  image_path text,
  created_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.tickets enable row level security;
create policy "tickets: solo miembros" on public.tickets for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create table public.ticket_reviews (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  ticket_id text not null,
  description text not null,
  quantity numeric not null default 1,
  line_total_cents integer not null default 0,
  issue_type text not null check (issue_type in ('unidentified', 'possible_duplicate', 'price_change')),
  product_id text,
  suggestion jsonb not null default '{}',
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.ticket_reviews enable row level security;
create policy "ticket_reviews: solo miembros" on public.ticket_reviews for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create table public.name_aliases (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  alias text not null,
  product_id text not null,
  created_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.name_aliases enable row level security;
create policy "name_aliases: solo miembros" on public.name_aliases for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create table public.dog_items (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  name text not null check (char_length(name) between 2 and 60),
  current_stock integer not null default 0 check (current_stock >= 0),
  minimum_stock integer not null default 1 check (minimum_stock >= 0),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.dog_items enable row level security;
create policy "dog_items: solo miembros" on public.dog_items for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create table public.dog_reminders (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  title text not null check (char_length(title) between 1 and 80),
  reminder_time text not null check (reminder_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.dog_reminders enable row level security;
create policy "dog_reminders: solo miembros" on public.dog_reminders for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create table public.stock_events (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  product_id text not null,
  delta numeric not null,
  reason text not null,
  created_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.stock_events enable row level security;
create policy "stock_events: solo miembros" on public.stock_events for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create table public.operations (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  operation_type text not null,
  summary text not null,
  inverse jsonb not null default '[]',
  undone boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.operations enable row level security;
create policy "operations: solo miembros" on public.operations for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create table public.household_events (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  kind text not null,
  ref text,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.household_events enable row level security;
create policy "household_events: solo miembros" on public.household_events for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create table public.activity (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  device_id text not null,
  device_name text not null,
  detail text not null default '',
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.activity enable row level security;
create policy "activity: solo miembros" on public.activity for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create table public.quick_sessions (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  location text not null,
  items jsonb not null default '[]',
  committed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.quick_sessions enable row level security;
create policy "quick_sessions: solo miembros" on public.quick_sessions for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create table public.barcodes (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  code text not null,
  name text not null,
  brand text not null default '',
  quantity text not null default '',
  image text,
  allergens jsonb not null default '[]',
  nutrients jsonb not null default '{}',
  source text not null default '',
  created_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.barcodes enable row level security;
create policy "barcodes: solo miembros" on public.barcodes for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create unique index products_unique_name on public.products (household_id, lower(name));
create index stock_events_by_product on public.stock_events (household_id, product_id, created_at);
create index tickets_by_date on public.tickets (household_id, purchased_at desc);

-- ---------- Catálogo base (se copia a cada hogar nuevo, con existencias a cero) ----------

create table public.catalog_template (
  sku text primary key,
  name text not null,
  category text not null
);
alter table public.catalog_template enable row level security;

insert into public.catalog_template (sku, name, category) values
  ('bebidas-agua-con-gas', 'Agua con gas', 'Bebidas'),
  ('bebidas-agua-saborizada', 'Agua saborizada', 'Bebidas'),
  ('bebidas-bebidas-energeticas', 'Bebidas energéticas', 'Bebidas'),
  ('bebidas-bebidas-isotonicas', 'Bebidas isotónicas', 'Bebidas'),
  ('bebidas-cava', 'Cava', 'Bebidas'),
  ('bebidas-cerveza', 'Cerveza', 'Bebidas'),
  ('bebidas-cerveza-sin-alcohol', 'Cerveza sin alcohol', 'Bebidas'),
  ('bebidas-gaseosa', 'Gaseosa', 'Bebidas'),
  ('bebidas-horchata', 'Horchata', 'Bebidas'),
  ('bebidas-nectares', 'Néctares', 'Bebidas'),
  ('bebidas-refrescos-de-cola', 'Refrescos de cola', 'Bebidas'),
  ('bebidas-refrescos-de-limon', 'Refrescos de limón', 'Bebidas'),
  ('bebidas-refrescos-de-naranja', 'Refrescos de naranja', 'Bebidas'),
  ('bebidas-sangria', 'Sangría', 'Bebidas'),
  ('bebidas-tonica', 'Tónica', 'Bebidas'),
  ('bebidas-vino-blanco', 'Vino blanco', 'Bebidas'),
  ('bebidas-vino-rosado', 'Vino rosado', 'Bebidas'),
  ('bebidas-vino-tinto', 'Vino tinto', 'Bebidas'),
  ('bebidas-zumo-de-melocoton', 'Zumo de melocotón', 'Bebidas'),
  ('bebidas-zumo-de-naranja', 'Zumo de naranja', 'Bebidas'),
  ('bebidas-zumo-de-pina', 'Zumo de piña', 'Bebidas'),
  ('zumo-pina-uva', 'Zumo de piña y uva', 'Bebidas'),
  ('bebidas-zumo-multifrutas', 'Zumo multifrutas', 'Bebidas'),
  ('carne-y-pescado-albondigas', 'Albóndigas', 'Carne y pescado'),
  ('carne-y-pescado-almejas', 'Almejas', 'Carne y pescado'),
  ('carne-y-pescado-atun', 'Atún', 'Carne y pescado'),
  ('carne-y-pescado-bacalao', 'Bacalao', 'Carne y pescado'),
  ('carne-y-pescado-calamar', 'Calamar', 'Carne y pescado'),
  ('carne-y-pescado-carne-picada-de-vacuno', 'Carne picada de vacuno', 'Carne y pescado'),
  ('carne-y-pescado-chuletas-de-cerdo', 'Chuletas de cerdo', 'Carne y pescado'),
  ('carne-y-pescado-cinta-de-lomo', 'Cinta de lomo', 'Carne y pescado'),
  ('carne-y-pescado-contramuslos-de-pollo', 'Contramuslos de pollo', 'Carne y pescado'),
  ('carne-y-pescado-costillas-de-cerdo', 'Costillas de cerdo', 'Carne y pescado'),
  ('carne-y-pescado-dorada', 'Dorada', 'Carne y pescado'),
  ('pavo', 'Filetes de pechuga de pavo', 'Carne y pescado'),
  ('pollo', 'Filetes de pechuga de pollo', 'Carne y pescado'),
  ('carne-y-pescado-filetes-de-pollo', 'Filetes de pollo', 'Carne y pescado'),
  ('carne-y-pescado-filetes-de-ternera', 'Filetes de ternera', 'Carne y pescado'),
  ('gamba-cocida', 'Gamba cocida', 'Carne y pescado'),
  ('carne-y-pescado-gambas', 'Gambas', 'Carne y pescado'),
  ('carne-y-pescado-hamburguesas', 'Hamburguesas', 'Carne y pescado'),
  ('carne-y-pescado-langostinos', 'Langostinos', 'Carne y pescado'),
  ('carne-y-pescado-lomo-de-cerdo', 'Lomo de cerdo', 'Carne y pescado'),
  ('carne-y-pescado-lubina', 'Lubina', 'Carne y pescado'),
  ('carne-y-pescado-mejillones', 'Mejillones', 'Carne y pescado'),
  ('carne-y-pescado-merluza', 'Merluza', 'Carne y pescado'),
  ('carne-y-pescado-muslos-de-pollo', 'Muslos de pollo', 'Carne y pescado'),
  ('carne-y-pescado-pechuga-de-pollo', 'Pechuga de pollo', 'Carne y pescado'),
  ('carne-y-pescado-pollo-entero', 'Pollo entero', 'Carne y pescado'),
  ('carne-y-pescado-pulpo', 'Pulpo', 'Carne y pescado'),
  ('carne-y-pescado-salchichas-frescas', 'Salchichas frescas', 'Carne y pescado'),
  ('carne-y-pescado-salmon', 'Salmón', 'Carne y pescado'),
  ('salmon-ahumado', 'Salmón ahumado', 'Carne y pescado'),
  ('carne-y-pescado-sepia', 'Sepia', 'Carne y pescado'),
  ('carne-y-pescado-solomillo-de-cerdo', 'Solomillo de cerdo', 'Carne y pescado'),
  ('congelados-arroz', 'Arroz', 'Congelados'),
  ('congelados-bocadillos', 'Bocadillos', 'Congelados'),
  ('congelados-burritos', 'Burritos', 'Congelados'),
  ('congelados-calamares', 'Calamares', 'Congelados'),
  ('congelados-canelones', 'Canelones', 'Congelados'),
  ('congelados-conos', 'Conos', 'Congelados'),
  ('congelados-croquetas', 'Croquetas', 'Congelados'),
  ('congelados-empanadillas', 'Empanadillas', 'Congelados'),
  ('congelados-ensaladas-preparadas', 'Ensaladas preparadas', 'Congelados'),
  ('congelados-ensaladilla-rusa', 'Ensaladilla rusa', 'Congelados'),
  ('congelados-helados-infantiles', 'Helados infantiles', 'Congelados'),
  ('hielo', 'Hielo cocktail', 'Congelados'),
  ('congelados-lasana', 'Lasaña', 'Congelados'),
  ('congelados-menestra', 'Menestra', 'Congelados'),
  ('congelados-nuggets', 'Nuggets', 'Congelados'),
  ('congelados-paella', 'Paella', 'Congelados'),
  ('parrillada-verduras', 'Parrillada de verduras congelada', 'Congelados'),
  ('congelados-pasta-preparada', 'Pasta preparada', 'Congelados'),
  ('congelados-patatas-fritas', 'Patatas fritas', 'Congelados'),
  ('congelados-pescado-congelado', 'Pescado congelado', 'Congelados'),
  ('congelados-pizza', 'Pizza', 'Congelados'),
  ('congelados-pizzas', 'Pizzas', 'Congelados'),
  ('congelados-pollo-asado', 'Pollo asado', 'Congelados'),
  ('congelados-polos', 'Polos', 'Congelados'),
  ('congelados-sorbetes', 'Sorbetes', 'Congelados'),
  ('congelados-sushi', 'Sushi', 'Congelados'),
  ('congelados-tarrinas', 'Tarrinas', 'Congelados'),
  ('congelados-tortilla-de-patatas', 'Tortilla de patatas', 'Congelados'),
  ('congelados-verduras-congeladas', 'Verduras congeladas', 'Congelados'),
  ('aceite-girasol', 'Aceite de girasol', 'Despensa'),
  ('despensa-aceite-de-oliva', 'Aceite de oliva', 'Despensa'),
  ('despensa-aceite-de-oliva-virgen-extra', 'Aceite de oliva virgen extra', 'Despensa'),
  ('despensa-ajo-en-polvo', 'Ajo en polvo', 'Despensa'),
  ('despensa-alcachofas', 'Alcachofas', 'Despensa'),
  ('despensa-alioli', 'Alioli', 'Despensa'),
  ('despensa-almendras', 'Almendras', 'Despensa'),
  ('despensa-anacardos', 'Anacardos', 'Despensa'),
  ('despensa-anchoas', 'Anchoas', 'Despensa'),
  ('despensa-arroz-basmati', 'Arroz basmati', 'Despensa'),
  ('despensa-arroz-integral', 'Arroz integral', 'Despensa'),
  ('despensa-arroz-largo', 'Arroz largo', 'Despensa'),
  ('despensa-arroz-para-paella', 'Arroz para paella', 'Despensa'),
  ('despensa-arroz-redondo', 'Arroz redondo', 'Despensa'),
  ('despensa-avellanas', 'Avellanas', 'Despensa'),
  ('despensa-barquillos', 'Barquillos', 'Despensa'),
  ('despensa-berberechos', 'Berberechos', 'Despensa'),
  ('despensa-bombones', 'Bombones', 'Despensa'),
  ('despensa-bonito', 'Bonito', 'Despensa'),
  ('despensa-caballa', 'Caballa', 'Despensa'),
  ('despensa-cacahuetes', 'Cacahuetes', 'Despensa'),
  ('despensa-cacao-soluble', 'Cacao soluble', 'Despensa'),
  ('despensa-cafe-descafeinado', 'Café descafeinado', 'Despensa'),
  ('despensa-cafe-en-capsulas', 'Café en cápsulas', 'Despensa'),
  ('despensa-cafe-en-grano', 'Café en grano', 'Despensa'),
  ('despensa-cafe-molido', 'Café molido', 'Despensa'),
  ('despensa-cafe-soluble', 'Café soluble', 'Despensa'),
  ('despensa-caldo-de-carne', 'Caldo de carne', 'Despensa'),
  ('despensa-caldo-de-pescado', 'Caldo de pescado', 'Despensa'),
  ('despensa-caldo-de-pollo', 'Caldo de pollo', 'Despensa'),
  ('despensa-caldo-de-verduras', 'Caldo de verduras', 'Despensa'),
  ('despensa-canela', 'Canela', 'Despensa'),
  ('despensa-capsulas-de-cafe', 'Cápsulas de café', 'Despensa'),
  ('despensa-caramelos', 'Caramelos', 'Despensa'),
  ('despensa-cereales-de-maiz', 'Cereales de maíz', 'Despensa'),
  ('despensa-cereales-integrales', 'Cereales integrales', 'Despensa'),
  ('despensa-chicles', 'Chicles', 'Despensa'),
  ('despensa-chocolate-blanco', 'Chocolate blanco', 'Despensa'),
  ('despensa-chocolate-con-leche', 'Chocolate con leche', 'Despensa'),
  ('despensa-chocolate-negro', 'Chocolate negro', 'Despensa'),
  ('despensa-comino', 'Comino', 'Despensa'),
  ('despensa-copos-de-avena', 'Copos de avena', 'Despensa'),
  ('despensa-cortezas', 'Cortezas', 'Despensa'),
  ('despensa-crema-de-cacahuete', 'Crema de cacahuete', 'Despensa'),
  ('despensa-crema-de-cacao', 'Crema de cacao', 'Despensa'),
  ('despensa-cremas-de-verduras', 'Cremas de verduras', 'Despensa'),
  ('despensa-curry', 'Curry', 'Despensa'),
  ('despensa-espaguetis', 'Espaguetis', 'Despensa'),
  ('despensa-esparragos', 'Espárragos', 'Despensa'),
  ('despensa-galletas-de-chocolate', 'Galletas de chocolate', 'Despensa'),
  ('despensa-galletas-integrales', 'Galletas integrales', 'Despensa'),
  ('despensa-galletas-maria', 'Galletas María', 'Despensa'),
  ('garbanzo', 'Garbanzo', 'Despensa'),
  ('garbanzo-cocido', 'Garbanzo cocido', 'Despensa'),
  ('despensa-garbanzos', 'Garbanzos', 'Despensa'),
  ('despensa-garbanzos-cocidos', 'Garbanzos cocidos', 'Despensa'),
  ('despensa-gazpacho', 'Gazpacho', 'Despensa'),
  ('despensa-granola', 'Granola', 'Despensa'),
  ('despensa-guacamole', 'Guacamole', 'Despensa'),
  ('despensa-guisantes', 'Guisantes', 'Despensa'),
  ('despensa-infusiones', 'Infusiones', 'Despensa'),
  ('despensa-judias', 'Judías', 'Despensa'),
  ('despensa-judias-cocidas', 'Judías cocidas', 'Despensa'),
  ('despensa-ketchup', 'Kétchup', 'Despensa'),
  ('lenteja-cocida', 'Lenteja cocida', 'Despensa'),
  ('lenteja', 'Lenteja pardina', 'Despensa'),
  ('despensa-lentejas', 'Lentejas', 'Despensa'),
  ('despensa-lentejas-cocidas', 'Lentejas cocidas', 'Despensa'),
  ('despensa-macarrones', 'Macarrones', 'Despensa'),
  ('despensa-maiz', 'Maíz', 'Despensa'),
  ('despensa-manzanilla', 'Manzanilla', 'Despensa'),
  ('despensa-mayonesa', 'Mayonesa', 'Despensa'),
  ('despensa-mermelada-de-fresa', 'Mermelada de fresa', 'Despensa'),
  ('despensa-mermelada-de-melocoton', 'Mermelada de melocotón', 'Despensa'),
  ('despensa-miel', 'Miel', 'Despensa'),
  ('despensa-mix-de-frutos-secos', 'Mix de frutos secos', 'Despensa'),
  ('despensa-mostaza', 'Mostaza', 'Despensa'),
  ('despensa-muesli', 'Muesli', 'Despensa'),
  ('despensa-nachos', 'Nachos', 'Despensa'),
  ('despensa-nueces', 'Nueces', 'Despensa'),
  ('despensa-oregano', 'Orégano', 'Despensa'),
  ('despensa-palomitas', 'Palomitas', 'Despensa'),
  ('despensa-pasta-fresca', 'Pasta fresca', 'Despensa'),
  ('despensa-pasta-integral', 'Pasta integral', 'Despensa'),
  ('despensa-perejil', 'Perejil', 'Despensa'),
  ('despensa-pesto', 'Pesto', 'Despensa'),
  ('despensa-pimenton', 'Pimentón', 'Despensa'),
  ('despensa-pimienta', 'Pimienta', 'Despensa'),
  ('despensa-pipas', 'Pipas', 'Despensa'),
  ('despensa-pistachos', 'Pistachos', 'Despensa'),
  ('despensa-poleo-menta', 'Poleo menta', 'Despensa'),
  ('despensa-pure-de-patata', 'Puré de patata', 'Despensa'),
  ('despensa-sal', 'Sal', 'Despensa'),
  ('despensa-salmorejo', 'Salmorejo', 'Despensa'),
  ('despensa-salsa-barbacoa', 'Salsa barbacoa', 'Despensa'),
  ('despensa-salsa-brava', 'Salsa brava', 'Despensa'),
  ('despensa-salsa-cesar', 'Salsa César', 'Despensa'),
  ('despensa-salsa-de-soja', 'Salsa de soja', 'Despensa'),
  ('despensa-salsa-teriyaki', 'Salsa teriyaki', 'Despensa'),
  ('despensa-salsa-yogur', 'Salsa yogur', 'Despensa'),
  ('despensa-sardinas', 'Sardinas', 'Despensa'),
  ('despensa-sopas', 'Sopas', 'Despensa'),
  ('despensa-tallarines', 'Tallarines', 'Despensa'),
  ('despensa-te-negro', 'Té negro', 'Despensa'),
  ('despensa-te-verde', 'Té verde', 'Despensa'),
  ('despensa-tila', 'Tila', 'Despensa'),
  ('despensa-tomate-entero', 'Tomate entero', 'Despensa'),
  ('despensa-tomate-frito', 'Tomate frito', 'Despensa'),
  ('despensa-tomate-triturado', 'Tomate triturado', 'Despensa'),
  ('despensa-vinagre-balsamico', 'Vinagre balsámico', 'Despensa'),
  ('despensa-vinagre-de-manzana', 'Vinagre de manzana', 'Despensa'),
  ('despensa-vinagre-de-vino', 'Vinagre de vino', 'Despensa'),
  ('fruta-y-verdura-aguacate', 'Aguacate', 'Fruta y verdura'),
  ('fruta-y-verdura-ajos', 'Ajos', 'Fruta y verdura'),
  ('fruta-y-verdura-arandanos', 'Arándanos', 'Fruta y verdura'),
  ('fruta-y-verdura-berenjena', 'Berenjena', 'Fruta y verdura'),
  ('fruta-y-verdura-brocoli', 'Brócoli', 'Fruta y verdura'),
  ('fruta-y-verdura-calabacin', 'Calabacín', 'Fruta y verdura'),
  ('fruta-y-verdura-canonigos', 'Canónigos', 'Fruta y verdura'),
  ('fruta-y-verdura-cebollas', 'Cebollas', 'Fruta y verdura'),
  ('fruta-y-verdura-champinones', 'Champiñones', 'Fruta y verdura'),
  ('fruta-y-verdura-ciruelas', 'Ciruelas', 'Fruta y verdura'),
  ('fruta-y-verdura-coliflor', 'Coliflor', 'Fruta y verdura'),
  ('fruta-y-verdura-espinacas', 'Espinacas', 'Fruta y verdura'),
  ('fruta-y-verdura-frambuesas', 'Frambuesas', 'Fruta y verdura'),
  ('fruta-y-verdura-fresas', 'Fresas', 'Fruta y verdura'),
  ('fruta-y-verdura-judias-verdes', 'Judías verdes', 'Fruta y verdura'),
  ('fruta-y-verdura-kiwis', 'Kiwis', 'Fruta y verdura'),
  ('lechuga-iceberg', 'Lechuga Iceberg', 'Fruta y verdura'),
  ('fruta-y-verdura-limones', 'Limones', 'Fruta y verdura'),
  ('fruta-y-verdura-mandarinas', 'Mandarinas', 'Fruta y verdura'),
  ('fruta-y-verdura-mango', 'Mango', 'Fruta y verdura'),
  ('fruta-y-verdura-manzanas', 'Manzanas', 'Fruta y verdura'),
  ('fruta-y-verdura-melocotones', 'Melocotones', 'Fruta y verdura'),
  ('fruta-y-verdura-melon', 'Melón', 'Fruta y verdura'),
  ('naranjas', 'Naranjas', 'Fruta y verdura'),
  ('fruta-y-verdura-nectarinas', 'Nectarinas', 'Fruta y verdura'),
  ('fruta-y-verdura-patatas', 'Patatas', 'Fruta y verdura'),
  ('fruta-y-verdura-pepino', 'Pepino', 'Fruta y verdura'),
  ('fruta-y-verdura-peras', 'Peras', 'Fruta y verdura'),
  ('fruta-y-verdura-pimientos', 'Pimientos', 'Fruta y verdura'),
  ('fruta-y-verdura-platanos', 'Plátanos', 'Fruta y verdura'),
  ('fruta-y-verdura-puerros', 'Puerros', 'Fruta y verdura'),
  ('fruta-y-verdura-sandia', 'Sandía', 'Fruta y verdura'),
  ('tomate-ensalada', 'Tomate ensalada', 'Fruta y verdura'),
  ('fruta-y-verdura-tomates-cherry', 'Tomates cherry', 'Fruta y verdura'),
  ('fruta-y-verdura-uvas', 'Uvas', 'Fruta y verdura'),
  ('zanahoria', 'Zanahorias', 'Fruta y verdura'),
  ('higiene-y-hogar-abrillantador', 'Abrillantador', 'Higiene y hogar'),
  ('higiene-y-hogar-agua-micelar', 'Agua micelar', 'Higiene y hogar'),
  ('higiene-y-hogar-amoniaco', 'Amoniaco', 'Higiene y hogar'),
  ('higiene-y-hogar-balsamo-labial', 'Bálsamo labial', 'Higiene y hogar'),
  ('higiene-y-hogar-bolsas-de-basura', 'Bolsas de basura', 'Higiene y hogar'),
  ('higiene-y-hogar-bolsas-de-congelacion', 'Bolsas de congelación', 'Higiene y hogar'),
  ('higiene-y-hogar-cepillos-de-dientes', 'Cepillos de dientes', 'Higiene y hogar'),
  ('higiene-y-hogar-champu', 'Champú', 'Higiene y hogar'),
  ('higiene-y-hogar-crema-corporal', 'Crema corporal', 'Higiene y hogar'),
  ('higiene-y-hogar-crema-de-manos', 'Crema de manos', 'Higiene y hogar'),
  ('higiene-y-hogar-crema-facial', 'Crema facial', 'Higiene y hogar'),
  ('higiene-y-hogar-crema-protectora', 'Crema protectora', 'Higiene y hogar'),
  ('higiene-y-hogar-cuchillas', 'Cuchillas', 'Higiene y hogar'),
  ('higiene-y-hogar-desengrasante', 'Desengrasante', 'Higiene y hogar'),
  ('higiene-y-hogar-desmaquillante', 'Desmaquillante', 'Higiene y hogar'),
  ('higiene-y-hogar-desodorante', 'Desodorante', 'Higiene y hogar'),
  ('higiene-y-hogar-detergente-lavadora', 'Detergente lavadora', 'Higiene y hogar'),
  ('higiene-y-hogar-enjuague-bucal', 'Enjuague bucal', 'Higiene y hogar'),
  ('higiene-y-hogar-espuma-de-afeitar', 'Espuma de afeitar', 'Higiene y hogar'),
  ('higiene-y-hogar-estropajos', 'Estropajos', 'Higiene y hogar'),
  ('higiene-y-hogar-film-transparente', 'Film transparente', 'Higiene y hogar'),
  ('higiene-y-hogar-gel-de-ducha', 'Gel de ducha', 'Higiene y hogar'),
  ('higiene-y-hogar-jabon-de-manos', 'Jabón de manos', 'Higiene y hogar'),
  ('higiene-y-hogar-lavavajillas', 'Lavavajillas', 'Higiene y hogar'),
  ('higiene-y-hogar-lejia', 'Lejía', 'Higiene y hogar'),
  ('higiene-y-hogar-limpiacristales', 'Limpiacristales', 'Higiene y hogar'),
  ('higiene-y-hogar-limpiador-de-banos', 'Limpiador de baños', 'Higiene y hogar'),
  ('higiene-y-hogar-limpiador-de-suelos', 'Limpiador de suelos', 'Higiene y hogar'),
  ('higiene-y-hogar-limpiador-multiusos', 'Limpiador multiusos', 'Higiene y hogar'),
  ('higiene-y-hogar-panuelos', 'Pañuelos', 'Higiene y hogar'),
  ('higiene-y-hogar-papel-de-aluminio', 'Papel de aluminio', 'Higiene y hogar'),
  ('higiene-y-hogar-papel-de-cocina', 'Papel de cocina', 'Higiene y hogar'),
  ('higiene-y-hogar-papel-de-horno', 'Papel de horno', 'Higiene y hogar'),
  ('higiene-y-hogar-papel-higienico', 'Papel higiénico', 'Higiene y hogar'),
  ('higiene-y-hogar-pasta-de-dientes', 'Pasta de dientes', 'Higiene y hogar'),
  ('higiene-y-hogar-quitamanchas', 'Quitamanchas', 'Higiene y hogar'),
  ('higiene-y-hogar-sal-lavavajillas', 'Sal lavavajillas', 'Higiene y hogar'),
  ('higiene-y-hogar-seda-dental', 'Seda dental', 'Higiene y hogar'),
  ('higiene-y-hogar-servilletas', 'Servilletas', 'Higiene y hogar'),
  ('higiene-y-hogar-suavizante', 'Suavizante', 'Higiene y hogar'),
  ('higiene-y-hogar-toallitas', 'Toallitas', 'Higiene y hogar'),
  ('arena-gato', 'Arena de gato antibacterias', 'Mascotas'),
  ('mascotas-arena-para-gatos', 'Arena para gatos', 'Mascotas'),
  ('mascotas-bolsas-para-excrementos', 'Bolsas para excrementos', 'Mascotas'),
  ('mascotas-comida-humeda-para-gatos', 'Comida húmeda para gatos', 'Mascotas'),
  ('mascotas-comida-humeda-para-perros', 'Comida húmeda para perros', 'Mascotas'),
  ('mascotas-pienso-para-gatos', 'Pienso para gatos', 'Mascotas'),
  ('mascotas-pienso-para-perros', 'Pienso para perros', 'Mascotas'),
  ('mascotas-snacks-para-gatos', 'Snacks para gatos', 'Mascotas'),
  ('mascotas-snacks-para-perros', 'Snacks para perros', 'Mascotas'),
  ('panaderia-baguette', 'Baguette', 'Panadería'),
  ('panaderia-barra-de-pan', 'Barra de pan', 'Panadería'),
  ('pan-integral', 'Barras de pan integral', 'Panadería'),
  ('panaderia-bizcochos', 'Bizcochos', 'Panadería'),
  ('panaderia-croissants', 'Croissants', 'Panadería'),
  ('panaderia-donuts', 'Donuts', 'Panadería'),
  ('panaderia-ensaimadas', 'Ensaimadas', 'Panadería'),
  ('panaderia-galletas', 'Galletas', 'Panadería'),
  ('panaderia-magdalenas', 'Magdalenas', 'Panadería'),
  ('panaderia-muffins', 'Muffins', 'Panadería'),
  ('panaderia-napolitanas', 'Napolitanas', 'Panadería'),
  ('panaderia-palmeras', 'Palmeras', 'Panadería'),
  ('baguettes', 'Pan baguette', 'Panadería'),
  ('panaderia-pan-de-molde', 'Pan de molde', 'Panadería'),
  ('panaderia-pan-de-molde-integral', 'Pan de molde integral', 'Panadería'),
  ('panaderia-pan-de-semillas', 'Pan de semillas', 'Panadería'),
  ('panaderia-pan-integral', 'Pan integral', 'Panadería'),
  ('panaderia-panecillos', 'Panecillos', 'Panadería'),
  ('panaderia-picos', 'Picos', 'Panadería'),
  ('panaderia-reganas', 'Regañás', 'Panadería'),
  ('panaderia-tortillas-de-trigo', 'Tortillas de trigo', 'Panadería'),
  ('panaderia-tortillas-integrales', 'Tortillas integrales', 'Panadería'),
  ('refrigerados-arroz-con-leche', 'Arroz con leche', 'Refrigerados'),
  ('refrigerados-bacon', 'Bacon', 'Refrigerados'),
  ('refrigerados-burrata', 'Burrata', 'Refrigerados'),
  ('refrigerados-cecina', 'Cecina', 'Refrigerados'),
  ('refrigerados-chorizo', 'Chorizo', 'Refrigerados'),
  ('refrigerados-claras-de-huevo', 'Claras de huevo', 'Refrigerados'),
  ('refrigerados-cuajada', 'Cuajada', 'Refrigerados'),
  ('refrigerados-flan', 'Flan', 'Refrigerados'),
  ('refrigerados-fuet', 'Fuet', 'Refrigerados'),
  ('refrigerados-gelatina', 'Gelatina', 'Refrigerados'),
  ('refrigerados-huevos-l', 'Huevos L', 'Refrigerados'),
  ('refrigerados-jamon-cocido', 'Jamón cocido', 'Refrigerados'),
  ('refrigerados-jamon-serrano', 'Jamón serrano', 'Refrigerados'),
  ('refrigerados-kefir', 'Kéfir', 'Refrigerados'),
  ('leche-desnatada', 'Leche desnatada', 'Refrigerados'),
  ('leche-entera', 'Leche entera', 'Refrigerados'),
  ('leche-semi', 'Leche semidesnatada', 'Refrigerados'),
  ('refrigerados-leche-sin-lactosa', 'Leche sin lactosa', 'Refrigerados'),
  ('refrigerados-lomo-embuchado', 'Lomo embuchado', 'Refrigerados'),
  ('refrigerados-mantequilla', 'Mantequilla', 'Refrigerados'),
  ('mantequilla', 'Mantequilla sin sal', 'Refrigerados'),
  ('refrigerados-mortadela', 'Mortadela', 'Refrigerados'),
  ('refrigerados-mousse', 'Mousse', 'Refrigerados'),
  ('refrigerados-nata-para-cocinar', 'Nata para cocinar', 'Refrigerados'),
  ('refrigerados-nata-para-montar', 'Nata para montar', 'Refrigerados'),
  ('refrigerados-natillas', 'Natillas', 'Refrigerados'),
  ('refrigerados-pechuga-de-pavo', 'Pechuga de pavo', 'Refrigerados'),
  ('refrigerados-queso-crema', 'Queso crema', 'Refrigerados'),
  ('refrigerados-queso-curado', 'Queso curado', 'Refrigerados'),
  ('refrigerados-queso-de-cabra', 'Queso de cabra', 'Refrigerados'),
  ('refrigerados-queso-en-lonchas', 'Queso en lonchas', 'Refrigerados'),
  ('refrigerados-queso-feta', 'Queso feta', 'Refrigerados'),
  ('queso-burgos', 'Queso fresco Burgos', 'Refrigerados'),
  ('refrigerados-queso-manchego', 'Queso manchego', 'Refrigerados'),
  ('refrigerados-queso-mozzarella', 'Queso mozzarella', 'Refrigerados'),
  ('refrigerados-queso-parmesano', 'Queso parmesano', 'Refrigerados'),
  ('refrigerados-queso-semicurado', 'Queso semicurado', 'Refrigerados'),
  ('queso-semicurado', 'Queso semicurado mezcla', 'Refrigerados'),
  ('refrigerados-queso-tierno', 'Queso tierno', 'Refrigerados'),
  ('refrigerados-salchichon', 'Salchichón', 'Refrigerados'),
  ('refrigerados-yogur-de-sabores', 'Yogur de sabores', 'Refrigerados'),
  ('refrigerados-yogur-griego', 'Yogur griego', 'Refrigerados'),
  ('refrigerados-yogur-liquido', 'Yogur líquido', 'Refrigerados'),
  ('refrigerados-yogur-natural', 'Yogur natural', 'Refrigerados'),
  ('refrigerados-yogur-proteico', 'Yogur proteico', 'Refrigerados')
on conflict (sku) do nothing;

-- ---------- Funciones ----------

create or replace function public.new_invite_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.households where invite_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if (select count(*) from public.household_members where user_id = auth.uid()) >= 10 then
    raise exception 'too many households';
  end if;
  insert into public.households (name, invite_code, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'Mi hogar'), public.new_invite_code(), auth.uid())
  returning id into new_id;
  insert into public.household_members (household_id, user_id, role) values (new_id, auth.uid(), 'owner');
  insert into public.lists (household_id) values (new_id);
  insert into public.products (household_id, id, sku, name, category)
  select new_id, gen_random_uuid()::text, sku, name, category from public.catalog_template;
  return new_id;
end;
$$;

create or replace function public.join_household(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select id into target from public.households where invite_code = upper(trim(p_code));
  if target is null then
    raise exception 'invalid invite code';
  end if;
  insert into public.household_members (household_id, user_id, role)
  values (target, auth.uid(), 'member')
  on conflict do nothing;
  return target;
end;
$$;

create or replace function public.my_households()
returns table (id uuid, name text, invite_code text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.name, h.invite_code, m.role
  from public.households h
  join public.household_members m on m.household_id = h.id
  where m.user_id = auth.uid()
  order by m.created_at;
$$;

create or replace function public.leave_household(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.household_members where household_id = p_household_id and user_id = auth.uid();
  -- Un hogar sin miembros se borra con todos sus datos.
  if not exists (select 1 from public.household_members where household_id = p_household_id) then
    delete from public.households where id = p_household_id;
  elsif not exists (select 1 from public.household_members where household_id = p_household_id and role = 'owner') then
    update public.household_members set role = 'owner'
    where household_id = p_household_id
      and user_id = (select user_id from public.household_members where household_id = p_household_id order by created_at limit 1);
  end if;
end;
$$;

create or replace function public.household_members_list(p_household_id uuid)
returns table (user_id uuid, email text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, u.email::text, m.role
  from public.household_members m
  join auth.users u on u.id = m.user_id
  where m.household_id = p_household_id and public.is_member(p_household_id)
  order by m.created_at;
$$;

-- Guarda las listas solo si nadie las cambió desde la revisión indicada.
create or replace function public.cas_lists(p_household_id uuid, p_shopping jsonb, p_checklist jsonb, p_revision integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.lists;
  current public.lists;
begin
  if not public.is_member(p_household_id) then
    raise exception 'not a member';
  end if;
  update public.lists
  set shopping = p_shopping, checklist = p_checklist, revision = revision + 1, updated_at = now()
  where household_id = p_household_id and revision = p_revision
  returning * into updated;
  if found then
    return jsonb_build_object('ok', true, 'lists', to_jsonb(updated));
  end if;
  select * into current from public.lists where household_id = p_household_id;
  return jsonb_build_object('ok', false, 'lists', to_jsonb(current));
end;
$$;

revoke execute on function public.new_invite_code() from anon, authenticated, public;
revoke execute on function public.is_member(uuid) from anon, public;
grant execute on function public.is_member(uuid) to authenticated;
revoke execute on function public.create_household(text) from anon, public;
revoke execute on function public.join_household(text) from anon, public;
revoke execute on function public.my_households() from anon, public;
revoke execute on function public.leave_household(uuid) from anon, public;
revoke execute on function public.household_members_list(uuid) from anon, public;
revoke execute on function public.cas_lists(uuid, jsonb, jsonb, integer) from anon, public;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.my_households() to authenticated;
grant execute on function public.leave_household(uuid) to authenticated;
grant execute on function public.household_members_list(uuid) to authenticated;
grant execute on function public.cas_lists(uuid, jsonb, jsonb, integer) to authenticated;

-- ---------- Fotos de tickets (privadas, por carpeta de hogar) ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-images', 'ticket-images', false, 10485760, array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'])
on conflict (id) do nothing;

create policy "tickets: leer fotos de mi hogar" on storage.objects for select to authenticated
  using (bucket_id = 'ticket-images' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "tickets: subir fotos a mi hogar" on storage.objects for insert to authenticated
  with check (bucket_id = 'ticket-images' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "tickets: cambiar fotos de mi hogar" on storage.objects for update to authenticated
  using (bucket_id = 'ticket-images' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "tickets: borrar fotos de mi hogar" on storage.objects for delete to authenticated
  using (bucket_id = 'ticket-images' and public.is_member(((storage.foldername(name))[1])::uuid));

-- ---------- Tiempo real (cambios de otros dispositivos del hogar) ----------

alter table public.lists replica identity full;
alter publication supabase_realtime add table public.lists;
alter table public.products replica identity full;
alter publication supabase_realtime add table public.products;
alter table public.inventory_lots replica identity full;
alter publication supabase_realtime add table public.inventory_lots;
alter table public.dog_items replica identity full;
alter publication supabase_realtime add table public.dog_items;
alter table public.dog_reminders replica identity full;
alter publication supabase_realtime add table public.dog_reminders;
alter table public.tickets replica identity full;
alter publication supabase_realtime add table public.tickets;
alter table public.ticket_reviews replica identity full;
alter publication supabase_realtime add table public.ticket_reviews;
alter table public.activity replica identity full;
alter publication supabase_realtime add table public.activity;
alter table public.prices replica identity full;
alter publication supabase_realtime add table public.prices;
