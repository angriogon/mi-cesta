import { PGlite } from "@electric-sql/pglite";
// Comprueba la migración en un Postgres embebido (PGlite) que imita lo mínimo de Supabase: usuarios, almacenamiento y permisos.
import { readFileSync } from "node:fs";
const migration = ["20261017000000_cesta.sql", "20261018000000_apply_batch.sql"]
  .map((file) => readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"))
  .join("\n");
const db = new PGlite();
const ok = (c, m) => {
  if (!c) {
    console.error("FALLO:", m);
    process.exitCode = 1;
  } else console.log("ok:", m);
};
// Simulación mínima del entorno de Supabase.
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
create publication supabase_realtime;
grant usage on schema public, auth, storage to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
alter default privileges in schema public grant all on tables to authenticated;
insert into auth.users values ('11111111-1111-1111-1111-111111111111','ana@x.es'),('22222222-2222-2222-2222-222222222222','luis@x.es'),('33333333-3333-3333-3333-333333333333','eva@x.es');
`);
await db.exec(migration);
await db.exec(
  `grant select, insert, update, delete on all tables in schema public to authenticated; grant select, insert, update, delete on storage.objects to authenticated;`,
);
// La migración retira el update general de households: volver a aplicarlo como haría Supabase tras los grants por defecto.
await db.exec(
  `revoke update on public.households from authenticated; grant update (name, mode, pet_name, postal_code, price_meta, preferences) on public.households to authenticated;`,
);
const as = async (user, sql, params) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role;`);
  }
};
const ANA = "11111111-1111-1111-1111-111111111111",
  LUIS = "22222222-2222-2222-2222-222222222222",
  EVA = "33333333-3333-3333-3333-333333333333";
const hid = (await as(ANA, `select public.create_household('Casa Ana') as id`)).rows[0].id;
ok(hid, "Ana crea su hogar");
const count = (
  await as(ANA, `select count(*)::int n, sum(current_stock)::int s from products where household_id=$1`, [hid])
).rows[0];
ok(count.n > 300 && count.s === 0, `catálogo base copiado (${count.n} productos, existencias 0)`);
const code = (await as(ANA, `select invite_code from households where id=$1`, [hid])).rows[0].invite_code;
ok(/^[A-Z2-9]{6}$/.test(code), `código de invitación ${code}`);
ok(
  (await as(EVA, `select count(*)::int n from products where household_id=$1`, [hid])).rows[0].n === 0,
  "Eva (otro hogar) no ve los productos de Ana",
);
let blocked = false;
try {
  await as(EVA, `insert into products (household_id,id,name) values ($1,'x','Intruso')`, [hid]);
} catch {
  blocked = true;
}
ok(blocked, "Eva no puede escribir en el hogar de Ana");
blocked = false;
try {
  await as(EVA, `select public.cas_lists($1,'[]','[]',0)`, [hid]);
} catch {
  blocked = true;
}
ok(blocked, "Eva no puede tocar las listas de Ana");
ok(
  (await as(LUIS, `select public.join_household($1) as id`, [code.toLowerCase()])).rows[0].id === hid,
  "Luis se une con el código",
);
blocked = false;
try {
  await as(LUIS, `select public.join_household('ZZZZZZ')`);
} catch {
  blocked = true;
}
ok(blocked, "código inválido rechazado");
const members = (await as(LUIS, `select * from public.household_members_list($1)`, [hid])).rows;
ok(members.length === 2 && members.some((m) => m.email === "ana@x.es"), "Luis ve los miembros");
ok(
  (await as(EVA, `select * from public.household_members_list($1)`, [hid])).rows.length === 0,
  "Eva no ve los miembros de otro hogar",
);
let r = (await as(LUIS, `select public.cas_lists($1,'[{"id":"1","name":"Pan"}]','[]',0) as r`, [hid])).rows[0].r;
ok(r.ok === true && r.lists.revision === 1, "Luis guarda la lista (revisión 1)");
r = (await as(ANA, `select public.cas_lists($1,'[]','[]',0) as r`, [hid])).rows[0].r;
ok(r.ok === false && r.lists.shopping[0].name === "Pan", "Ana con revisión antigua no pisa la lista");
await as(ANA, `update households set mode='autocesta', pet_name='Serranito' where id=$1`, [hid]);
ok(
  (await as(LUIS, `select pet_name from households where id=$1`, [hid])).rows[0].pet_name === "Serranito",
  "ajustes del hogar compartidos",
);
blocked = false;
try {
  await as(LUIS, `update households set invite_code='AAAAAA' where id=$1`, [hid]);
} catch {
  blocked = true;
}
ok(blocked, "no se puede cambiar el código de invitación");
blocked = false;
try {
  await as(ANA, `insert into products (household_id,id,name) values ($1,'dup','leche entera')`, [hid]);
} catch {
  blocked = true;
}
ok(blocked, "no se permiten productos duplicados (mayúsculas aparte)");
await as(ANA, `insert into storage.objects (bucket_id,name) values ('ticket-images', $1)`, [`${hid}/t1.jpg`]);
ok((await as(EVA, `select count(*)::int n from storage.objects`)).rows[0].n === 0, "Eva no ve fotos de tickets ajenas");
ok((await as(LUIS, `select count(*)::int n from storage.objects`)).rows[0].n === 1, "Luis ve las fotos de su hogar");

// ---- apply_batch: escrituras de varios pasos en una sola transacción ----
const batch = (user, ops) => as(user, `select public.apply_batch($1, $2::jsonb)`, [hid, JSON.stringify(ops)]);
await batch(ANA, [
  {
    kind: "insert",
    table: "products",
    rows: [
      {
        id: "b1",
        name: "Kéfir lote",
        category: "Refrigerados",
        sku: "",
        current_stock: 0,
        minimum_stock: 0,
        suppressed: false,
        confirmed_at: null,
        planned_until: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  },
  { kind: "update", table: "products", id: "b1", patch: { current_stock: 3 } },
  {
    kind: "insert",
    table: "stock_events",
    rows: [{ id: "e1", product_id: "b1", delta: 3, reason: "purchase", created_at: new Date().toISOString() }],
  },
]);
const kefir = (await as(ANA, `select current_stock::int s from products where household_id=$1 and id='b1'`, [hid]))
  .rows[0];
ok(kefir?.s === 3, "apply_batch inserta y actualiza en orden");
blocked = false;
try {
  await batch(ANA, [
    { kind: "update", table: "products", id: "b1", patch: { current_stock: 7 } },
    { kind: "update", table: "products", id: "b1", patch: { current_stock: -1 } },
  ]);
} catch {
  blocked = true;
}
const after = (await as(ANA, `select current_stock::int s from products where household_id=$1 and id='b1'`, [hid]))
  .rows[0];
ok(blocked && after.s === 3, "si un paso falla, no se aplica ninguno (sigue en 3, no en 7)");
blocked = false;
try {
  await batch(EVA, [{ kind: "remove", table: "products", ids: ["b1"] }]);
} catch {
  blocked = true;
}
ok(blocked, "Eva no puede usar apply_batch en el hogar de Ana");
blocked = false;
try {
  await batch(ANA, [{ kind: "removeAll", table: "household_members" }]);
} catch {
  blocked = true;
}
ok(blocked, "apply_batch solo acepta tablas de datos del hogar");
await batch(ANA, [
  {
    kind: "update",
    table: "products",
    id: "b1",
    patch: { household_id: "00000000-0000-0000-0000-000000000000", name: "Kéfir movido" },
  },
]);
ok(
  (await as(ANA, `select name from products where household_id=$1 and id='b1'`, [hid])).rows[0]?.name ===
    "Kéfir movido",
  "un cambio no puede mover filas a otro hogar",
);
await batch(ANA, [{ kind: "remove", table: "products", ids: ["b1"] }]);
ok(
  (await as(ANA, `select count(*)::int n from products where household_id=$1 and id='b1'`, [hid])).rows[0].n === 0,
  "apply_batch borra por id",
);
await as(ANA, `select public.leave_household($1)`, [hid]);
ok(
  (await as(LUIS, `select role from household_members where household_id=$1`, [hid])).rows[0].role === "owner",
  "al salir Ana, Luis pasa a ser el responsable",
);
await as(LUIS, `select public.leave_household($1)`, [hid]);
ok(
  (await db.query(`select count(*)::int n from households`)).rows[0].n === 0,
  "hogar sin miembros se borra con sus datos",
);
ok((await db.query(`select count(*)::int n from products`)).rows[0].n === 0, "sus productos también se borran");
