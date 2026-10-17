/** Lectura y escritura en localStorage que nunca rompe la app (modo privado, cuota llena…). */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento disponible: el dato vive solo durante la sesión.
  }
}

export function readText(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeText(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignorado a propósito.
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignorado a propósito.
  }
}

export function deviceId(): string {
  let id = readText("cesta-device-id");
  if (!id) {
    id = crypto.randomUUID();
    writeText("cesta-device-id", id);
  }
  return id;
}

export function deviceName(): string {
  const agent = navigator.userAgent;
  if (/iphone/i.test(agent)) return "iPhone";
  if (/ipad/i.test(agent) || (/macintosh/i.test(agent) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/android/i.test(agent)) return "Android";
  return "Otro dispositivo";
}
