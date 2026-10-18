// Edge Function: envia los avisos de la mascota por Web Push (llamada por pg_cron cada 5 minutos).
// - Los envios programados solo los pide pg_cron: comprueba el secreto x-cesta-cron guardado en Vault.
// - Sin ese secreto, la app puede pedir un aviso de prueba para un dispositivo del usuario (con su sesion).
// - La primera vez genera las claves VAPID, guarda la privada en Vault y publica la publica en push_config.
// - Envia cada recordatorio, y cada articulo bajo minimos (10:00-12:00), una vez al dia por dispositivo.
// - Borra los dispositivos que ya no existen.
// Despliegue: supabase functions deploy pet-push --no-verify-jwt
// Solo caracteres ASCII en el codigo: el despliegue no siempre conserva bien los literales acentuados.

import { createClient } from "npm:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

// Contacto para los servicios de push (Apple, Google, Mozilla): la direccion de la app.
const CONTACT = "https://angriogon.github.io/mi-cesta/";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

interface DueStock {
  endpoint: string;
  p256dh: string;
  auth: string;
  alert_id: string;
  item_name: string;
  current_stock: number;
  minimum_stock: number;
  pet_name: string;
  day: string;
}

/** Un aviso listo para enviar (recordatorio o articulo bajo minimos). */
interface Push {
  endpoint: string;
  p256dh: string;
  auth: string;
  key: string;
  day: string;
  title: string;
  body: string;
}

interface DueReminder {
  endpoint: string;
  p256dh: string;
  auth: string;
  reminder_id: string;
  title: string;
  pet_name: string;
  day: string;
}

async function vapidKeys() {
  const { data: stored, error } = await admin.rpc("push_vapid_keys");
  if (error) throw error;
  if (stored) return await webpush.importVapidKeys(stored, { extractable: false });
  const keys = await webpush.generateVapidKeys({ extractable: true });
  const exported = await webpush.exportVapidKeys(keys);
  const publicKey = await webpush.exportApplicationServerKey(keys);
  const { error: saveError } = await admin.rpc("push_save_vapid_keys", { p_keys: exported, p_public_key: publicKey });
  if (saveError) throw saveError;
  // Si otra ejecucion las guardo a la vez, se usan las que quedaron en Vault.
  const { data: final } = await admin.rpc("push_vapid_keys");
  return await webpush.importVapidKeys(final ?? exported, { extractable: false });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Aviso de prueba: lo pide la app con la sesion del usuario, solo para un dispositivo suyo.
 * Sirve para comprobar en el iPhone que los avisos llegan sin esperar a un recordatorio.
 */
async function sendTest(request: Request): Promise<Response> {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: user } = await admin.auth.getUser(token);
  if (!user?.user) return new Response("forbidden", { status: 403, headers: CORS });
  const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
  const { data: subscription } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("endpoint", body.endpoint ?? "")
    .eq("user_id", user.user.id)
    .maybeSingle();
  if (!subscription) return new Response("not subscribed", { status: 404, headers: CORS });
  const appServer = await webpush.ApplicationServer.new({ contactInformation: CONTACT, vapidKeys: await vapidKeys() });
  try {
    await appServer
      .subscribe({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } })
      .pushTextMessage(
        JSON.stringify({
          title: "Cesta",
          body: "Los avisos funcionan en este dispositivo.",
          tag: "cesta-prueba",
          url: "./?view=dog",
        }),
        { ttl: 10 * 60, urgency: webpush.Urgency.High },
      );
  } catch (failure) {
    const status = (failure as { response?: Response }).response?.status;
    if (status === 404 || status === 410) {
      await admin.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
      return new Response("gone", { status: 410, headers: CORS });
    }
    console.error("test push failed", status ?? String(failure));
    return new Response("push failed", { status: 502, headers: CORS });
  }
  return new Response(JSON.stringify({ sent: 1 }), { headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!request.headers.get("x-cesta-cron")) return sendTest(request);
  const { data: allowed } = await admin.rpc("push_cron_secret_ok", {
    p_secret: request.headers.get("x-cesta-cron"),
  });
  if (!allowed) return new Response("forbidden", { status: 403 });

  const appServer = await webpush.ApplicationServer.new({ contactInformation: CONTACT, vapidKeys: await vapidKeys() });

  // Limpieza: el registro de envios solo hace falta unos dias.
  const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  await admin.from("push_sent").delete().lt("day", cutoff);

  const [reminders, stock] = await Promise.all([admin.rpc("due_pet_reminders"), admin.rpc("due_pet_stock_alerts")]);
  if (reminders.error) return new Response(reminders.error.message, { status: 500 });
  if (stock.error) return new Response(stock.error.message, { status: 500 });
  const due: Push[] = [
    ...((reminders.data ?? []) as DueReminder[]).map((item) => ({
      endpoint: item.endpoint,
      p256dh: item.p256dh,
      auth: item.auth,
      key: item.reminder_id,
      day: item.day,
      title: `Aviso de ${item.pet_name || "tu mascota"}`,
      body: item.title,
    })),
    ...((stock.data ?? []) as DueStock[]).map((item) => ({
      endpoint: item.endpoint,
      p256dh: item.p256dh,
      auth: item.auth,
      key: item.alert_id,
      day: item.day,
      title: `Para ${item.pet_name || "tu mascota"}`,
      body: `Queda poco: ${item.item_name} (${item.current_stock} de m\u00ednimo ${item.minimum_stock}).`,
    })),
  ];

  let sent = 0;
  let gone = 0;
  for (const item of due) {
    // Se marca antes de enviar: si el envio falla no se reintenta en bucle cada 5 minutos.
    const { error: markError } = await admin
      .from("push_sent")
      .insert({ endpoint: item.endpoint, reminder_id: item.key, day: item.day });
    if (markError) continue;
    try {
      const subscriber = appServer.subscribe({
        endpoint: item.endpoint,
        keys: { p256dh: item.p256dh, auth: item.auth },
      });
      await subscriber.pushTextMessage(
        JSON.stringify({
          title: item.title,
          body: item.body,
          tag: `cesta-dog-${item.key}-${item.day}`,
          url: "./?view=dog",
        }),
        { ttl: 2 * 60 * 60, urgency: webpush.Urgency.High },
      );
      sent++;
    } catch (failure) {
      const status = (failure as { response?: Response }).response?.status;
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("endpoint", item.endpoint);
        gone++;
      } else console.error("push failed", status ?? String(failure));
    }
  }
  return new Response(JSON.stringify({ due: due.length, sent, gone }), {
    headers: { "Content-Type": "application/json" },
  });
});
