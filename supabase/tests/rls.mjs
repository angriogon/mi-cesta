import { PGlite } from "@electric-sql/pglite";
// Comprueba la migración en un Postgres embebido (PGlite) que imita lo mínimo de Supabase: usuarios, almacenamiento y permisos.
import { readFileSync } from "node:fs";
const migration = [
  "20261017000000_cesta.sql",
  "20261018000000_apply_batch.sql",
  "20261019000000_prune_history.sql",
  "20261020000000_delete_account.sql",
  "20261021000000_pet_push.sql",
  "20261021000001_pg_net_schema.sql",
  "20261022000000_catalog_duplicates.sql",
  "20261023000000_catalog_more.sql",
  "20261024000000_pet_stock_push.sql",
  "20261025000000_admin_role.sql",
  "20261026000000_member_permissions.sql",
  "20261026000001_late_reminders.sql",
]
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
  (
    await as(
      ANA,
      `select count(*)::int n from products where household_id=$1 and sku in ('garbanzo', 'congelados-pizzas')`,
      [hid],
    )
  ).rows[0].n === 0,
  "el catálogo base ya no trae pares duplicados",
);
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
// ---- rol de administrador ----
const tryAs = async (user, sql, params) => {
  try {
    await as(user, sql, params);
    return true;
  } catch {
    return false;
  }
};
const addReminder = (user, id) =>
  tryAs(user, `insert into dog_reminders (household_id, id, title, reminder_time) values ($1, $2, 'Paseo', '09:00')`, [
    hid,
    id,
  ]);
ok(!(await addReminder(LUIS, "rem-luis")), "un miembro no puede crear recordatorios de la mascota");
ok(await addReminder(ANA, "rem-ana"), "la responsable sí");
ok(
  !(await tryAs(LUIS, `delete from dog_reminders where household_id = $1 and id = 'rem-ana'`, [hid])) ||
    (await as(ANA, `select count(*)::int n from dog_reminders where household_id = $1 and id = 'rem-ana'`, [hid]))
      .rows[0].n === 1,
  "un miembro no puede borrar recordatorios",
);
ok(
  !(await tryAs(LUIS, `select public.set_member_role($1, $2, 'admin')`, [hid, LUIS])),
  "nadie se nombra administrador a sí mismo",
);
ok(
  !(await tryAs(EVA, `select public.set_member_role($1, $2, 'admin')`, [hid, LUIS])),
  "alguien de fuera no cambia roles",
);
ok(
  await tryAs(ANA, `select public.set_member_role($1, $2, 'admin')`, [hid, LUIS]),
  "la responsable nombra administrador a Luis",
);
ok(await addReminder(LUIS, "rem-luis"), "y ya puede gestionar la mascota");
ok(
  !(await tryAs(LUIS, `select public.set_member_role($1, $2, 'member')`, [hid, ANA])),
  "nadie cambia el rol del responsable",
);
await as(ANA, `select public.set_member_role($1, $2, 'member')`, [hid, LUIS]);
ok(
  (await as(ANA, `select role from household_members where household_id = $1 and user_id = $2`, [hid, LUIS])).rows[0]
    .role === "member",
  "y se le puede quitar",
);

// ---- permisos de cada persona y quitar del hogar ----
const PABLO = "55555555-5555-5555-5555-555555555555";
await db.query(`insert into auth.users values ($1, 'pablo@x.es')`, [PABLO]);
await as(PABLO, `select public.join_household($1)`, [code]);
const permissionsOf = async (user) =>
  (
    await as(ANA, `select role, permissions from household_members where household_id = $1 and user_id = $2`, [
      hid,
      user,
    ])
  ).rows[0];
ok(
  !(await tryAs(LUIS, `select public.set_member_permissions($1, $2, array['mascota'])`, [hid, PABLO])),
  "sin el permiso «miembros» no se cambian permisos",
);
ok(
  await tryAs(ANA, `select public.set_member_permissions($1, $2, array['mascota'])`, [hid, LUIS]),
  "la responsable da a Luis el permiso de la mascota",
);
ok((await permissionsOf(LUIS)).role === "member", "con un permiso suelto sigue siendo miembro");
ok(await addReminder(LUIS, "rem-luis-2"), "y con él gestiona los recordatorios de la mascota");
ok(
  !(await tryAs(LUIS, `select public.set_member_permissions($1, $2, array['almacen'])`, [hid, PABLO])),
  "el permiso de la mascota no deja gestionar miembros",
);
ok(
  !(await tryAs(ANA, `select public.set_member_permissions($1, $2, array['todo'])`, [hid, LUIS])),
  "solo permisos conocidos",
);
await as(ANA, `select public.set_member_permissions($1, $2, array['almacen', 'mascota', 'miembros'])`, [hid, LUIS]);
ok((await permissionsOf(LUIS)).role === "admin", "con todos los permisos pasa a administrador");
ok(
  !(await tryAs(LUIS, `select public.set_member_permissions($1, $2, '{}')`, [hid, LUIS])),
  "nadie cambia sus propios permisos",
);
ok(!(await tryAs(LUIS, `select public.set_member_permissions($1, $2, '{}')`, [hid, ANA])), "ni los del responsable");
const listed = (await as(PABLO, `select * from public.household_members_list($1)`, [hid])).rows;
ok(listed.find((row) => row.user_id === LUIS)?.permissions.length === 3, "el listado de miembros incluye los permisos");
ok(
  (await as(LUIS, `select permissions from public.my_households()`)).rows[0].permissions.length === 3,
  "y cada uno ve los suyos en sus hogares",
);
await as(PABLO, `insert into push_subscriptions (endpoint, household_id, p256dh, auth) values ($1, $2, 'k', 'a')`, [
  "https://push.example/pablo",
  hid,
]);
ok(
  !(await tryAs(PABLO, `select public.remove_member($1, $2)`, [hid, LUIS])),
  "un miembro sin permiso no quita a nadie",
);
ok(!(await tryAs(LUIS, `select public.remove_member($1, $2)`, [hid, ANA])), "nadie quita al responsable");
ok(await tryAs(LUIS, `select public.remove_member($1, $2)`, [hid, PABLO]), "Luis, con permiso, quita a Pablo");
ok(
  (await as(PABLO, `select count(*)::int n from products where household_id = $1`, [hid])).rows[0].n === 0,
  "Pablo ya no ve los datos del hogar",
);
ok(
  (await db.query(`select count(*)::int n from push_subscriptions where endpoint = 'https://push.example/pablo'`))
    .rows[0].n === 0,
  "y sus dispositivos dejan de recibir los avisos del hogar",
);
await as(ANA, `select public.set_member_permissions($1, $2, '{}')`, [hid, LUIS]);
// Los recordatorios de estas pruebas (a las 09:00) se borran: si no, las de avisos de más abajo
// los verían «pendientes» al ejecutarse entre las 09:00 y las 11:00.
await as(ANA, `delete from dog_reminders where household_id = $1 and id like 'rem-%'`, [hid]);

// ---- prune_history: límite al historial ----
await db.query(
  `insert into stock_events (household_id, id, product_id, delta, reason, created_at) values
   ($1, 'se-old', 'p', 1, 'purchase', now() - interval '500 days'), ($1, 'se-new', 'p', 1, 'purchase', now() - interval '60 days')`,
  [hid],
);
await db.query(
  `insert into operations (household_id, id, operation_type, summary, created_at) values
   ($1, 'op-old', 'purchase', 'vieja', now() - interval '45 days'), ($1, 'op-new', 'purchase', 'nueva', now())`,
  [hid],
);
let pruneBlocked = false;
try {
  await as(ANA, `select public.prune_history()`);
} catch {
  pruneBlocked = true;
}
ok(pruneBlocked, "nadie puede ejecutar prune_history desde la app");
await db.query(`select public.prune_history()`);
const kept = (
  await db.query(
    `select id from stock_events where id like 'se-%' union all select id from operations where id like 'op-%' order by 1`,
  )
).rows.map((r) => r.id);
ok(kept.join() === "op-new,se-new", `prune_history borra solo lo antiguo (${kept.join()})`);

// ---- avisos push de la mascota ----
const subscribe = (user, endpoint, household) =>
  as(user, `insert into push_subscriptions (endpoint, household_id, p256dh, auth) values ($1, $2, 'k', 'a')`, [
    endpoint,
    household,
  ]);
await subscribe(ANA, "https://push.example/ana", hid);
ok(
  (await as(ANA, `select count(*)::int n from push_subscriptions`)).rows[0].n === 1,
  "Ana activa los avisos en su dispositivo",
);
ok(
  (await as(LUIS, `select count(*)::int n from push_subscriptions`)).rows[0].n === 0,
  "nadie más ve los dispositivos de Ana",
);
let foreignPush = false;
try {
  await subscribe(EVA, "https://push.example/eva", hid);
} catch {
  foreignPush = true;
}
ok(foreignPush, "Eva no puede recibir avisos de un hogar que no es suyo");
const localNow = `(now() at time zone 'Europe/Madrid')`;
await db.query(
  `insert into dog_reminders (household_id, id, title, reminder_time) values
   ($1, 'r-ya', 'Paseo', to_char(${localNow} - interval '5 minutes', 'HH24:MI')),
   ($1, 'r-luego', 'Pienso', to_char(${localNow} + interval '30 minutes', 'HH24:MI'))`,
  [hid],
);
const due = (await db.query(`select reminder_id from public.due_pet_reminders()`)).rows.map((r) => r.reminder_id);
// Un recordatorio a las 23:30 se envía a las 23:45 (antes, «23:30 + 2 h» daba la vuelta y no salía nunca).
const lateWindow = (
  await db.query(
    "select (time '23:45' >= time '23:30' and time '23:45' - time '23:30' < interval '2 hours') as yes, (time '00:30' >= time '23:30') as nextDay",
  )
).rows[0];
ok(
  lateWindow.yes && !lateWindow.nextday,
  "los recordatorios de la noche entran en la ventana y no se repiten al día siguiente",
);
// Cerca de medianoche los recordatorios de prueba cambian de día; no se comprueba en ese rato.
const nearMidnight = (
  await db.query(`select extract(hour from ${localNow}) = 0 and extract(minute from ${localNow}) < 6 as x`)
).rows[0].x;
ok(nearMidnight || due.join() === "r-ya", `solo avisa de lo que ya toca (${due.join()})`);
await db.query(
  `insert into push_sent (endpoint, reminder_id, day) values ('https://push.example/ana', 'r-ya', (${localNow})::date)`,
);
ok(
  (await db.query(`select count(*)::int n from public.due_pet_reminders()`)).rows[0].n === 0,
  "cada aviso se envía una sola vez al día",
);
// Artículos de la mascota bajo mínimos: solo entre las 10:00 y las 12:00 de la hora local.
await db.query(
  `insert into dog_items (household_id, id, name, current_stock, minimum_stock) values
   ($1, 'pienso', 'Pienso', 1, 2), ($1, 'arena', 'Arena', 5, 2), ($1, 'sin-minimo', 'Juguete', 0, 0)`,
  [hid],
);
const localHour = (await db.query(`select extract(hour from ${localNow})::int h`)).rows[0].h;
const stockDue = (await db.query(`select alert_id from public.due_pet_stock_alerts()`)).rows.map((r) => r.alert_id);
ok(
  localHour >= 10 && localHour < 12 ? stockDue.join() === "stock:pienso" : stockDue.length === 0,
  `avisa solo del pienso bajo mínimos y en su franja (${localHour} h: ${stockDue.join() || "ninguno"})`,
);
let stockBlocked = false;
try {
  await as(ANA, `select * from public.due_pet_stock_alerts()`);
} catch {
  stockBlocked = true;
}
ok(stockBlocked, "solo el servidor puede consultar los artículos bajo mínimos");
let dueBlocked = false;
try {
  await as(ANA, `select * from public.due_pet_reminders()`);
} catch {
  dueBlocked = true;
}
ok(dueBlocked, "solo el servidor puede consultar los avisos pendientes");
// ---- delete_my_account: eliminar la propia cuenta ----
const MARTA = "44444444-4444-4444-4444-444444444444";
await db.query(`insert into auth.users values ($1, 'marta@x.es')`, [MARTA]);
await as(MARTA, `select public.join_household($1)`, [code]);
await as(MARTA, `select public.delete_my_account()`);
ok(
  (await db.query(`select count(*)::int n from auth.users where id = $1`, [MARTA])).rows[0].n === 0,
  "Marta elimina su cuenta",
);
ok(
  (await as(ANA, `select count(*)::int n from household_members where household_id = $1`, [hid])).rows[0].n >= 2 &&
    (await as(ANA, `select count(*)::int n from products where household_id = $1`, [hid])).rows[0].n > 0,
  "el hogar compartido sigue para los demás con sus datos",
);
const evaHome = (await as(EVA, `select public.create_household('Casa Eva') as id`)).rows[0].id;
await as(EVA, `select public.delete_my_account()`);
ok(
  (await db.query(`select count(*)::int n from households where id = $1`, [evaHome])).rows[0].n === 0 &&
    (await db.query(`select count(*)::int n from products where household_id = $1`, [evaHome])).rows[0].n === 0,
  "si era la única del hogar, el hogar se borra con sus datos",
);
let anonymousBlocked = false;
try {
  await as("", `select public.delete_my_account()`);
} catch {
  anonymousBlocked = true;
}
ok(anonymousBlocked, "sin sesión no se puede eliminar ninguna cuenta");

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
