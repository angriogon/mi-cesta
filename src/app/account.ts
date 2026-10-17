import { backendMode, supabase } from "./config";

export interface HouseholdSummary {
  id: string;
  name: string;
  inviteCode: string;
  role: "owner" | "member";
}

export interface Account {
  mode: "supabase" | "local";
  email: string | null;
  /** Comprueba la contraseña (o la frase de confirmación en modo local) antes de acciones destructivas. */
  verifyPassword(password: string): Promise<boolean>;
  changePassword(current: string, next: string): Promise<void>;
  signOut(): Promise<void>;
  leaveHousehold(): Promise<void>;
  /** Elimina la cuenta: sale de todos sus hogares (los que se quedan vacíos se borran) y cierra la sesión. */
  deleteAccount(password: string): Promise<void>;
  members(): Promise<{ userId: string; email: string; role: string }[]>;
}

export const LOCAL_RESET_PHRASE = "RESTABLECER";

export async function myHouseholds(): Promise<HouseholdSummary[]> {
  const { data, error } = await supabase().rpc("my_households");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    role: row.role === "owner" ? "owner" : "member",
  }));
}

export async function createHousehold(name: string): Promise<string> {
  const { data, error } = await supabase().rpc("create_household", { p_name: name.trim() || "Mi hogar" });
  if (error) throw new Error(error.message);
  return data;
}

export async function joinHousehold(code: string): Promise<string> {
  const { data, error } = await supabase().rpc("join_household", { p_code: code.trim().toUpperCase() });
  if (error) throw new Error(error.message.includes("invalid") ? "El código no es válido." : error.message);
  return data;
}

/** Borra las fotos de tickets de un hogar si quien sale es su último miembro (el hogar se va a borrar). */
async function removePhotosIfLastMember(householdId: string) {
  const { data: members } = await supabase().rpc("household_members_list", { p_household_id: householdId });
  if (!Array.isArray(members) || members.length > 1) return;
  const bucket = supabase().storage.from("ticket-images");
  for (;;) {
    const { data: files } = await bucket.list(householdId, { limit: 1000 });
    if (!files?.length) break;
    const { error } = await bucket.remove(files.map((file) => `${householdId}/${file.name}`));
    if (error) break;
  }
}

/** Datos de Cesta guardados en este dispositivo (preferencias, borradores, hogar elegido). */
function clearLocalData() {
  for (const key of Object.keys(window.localStorage)) if (key.startsWith("cesta-")) window.localStorage.removeItem(key);
}

export function supabaseAccount(email: string, householdId: string, onLeave: () => void): Account {
  return {
    mode: "supabase",
    email,
    async verifyPassword(password) {
      const { error } = await supabase().auth.signInWithPassword({ email, password });
      return !error;
    },
    async changePassword(current, next) {
      const { error: authError } = await supabase().auth.signInWithPassword({ email, password: current });
      if (authError) throw new Error("La contraseña actual no es correcta.");
      const { error } = await supabase().auth.updateUser({ password: next });
      if (error) throw new Error(translateAuthError(error.message));
    },
    async signOut() {
      await supabase().auth.signOut();
    },
    async leaveHousehold() {
      // Si es el último miembro, el hogar se borra: antes se borran sus fotos de tickets.
      await removePhotosIfLastMember(householdId);
      const { error } = await supabase().rpc("leave_household", { p_household_id: householdId });
      if (error) throw new Error(error.message);
      onLeave();
    },
    async deleteAccount(password) {
      const { error: authError } = await supabase().auth.signInWithPassword({ email, password });
      if (authError) throw new Error("La contraseña no es correcta.");
      for (const household of await myHouseholds()) await removePhotosIfLastMember(household.id);
      const { error } = await supabase().rpc("delete_my_account");
      if (error) throw new Error("No se ha podido eliminar la cuenta. Inténtalo de nuevo.");
      clearLocalData();
      // La cuenta ya no existe: basta con olvidar la sesión en este dispositivo.
      await supabase().auth.signOut({ scope: "local" });
    },
    async members() {
      const { data, error } = await supabase().rpc("household_members_list", { p_household_id: householdId });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        userId: row.user_id,
        email: row.email,
        role: row.role,
      }));
    },
  };
}

export function localAccount(): Account {
  return {
    mode: "local",
    email: null,
    async verifyPassword(password) {
      return password.trim().toUpperCase() === LOCAL_RESET_PHRASE;
    },
    async changePassword() {
      throw new Error("En modo local no hay cuenta.");
    },
    async signOut() {},
    async leaveHousehold() {},
    async deleteAccount() {
      throw new Error("En modo local no hay cuenta.");
    },
    async members() {
      return [];
    },
  };
}

export function translateAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("invalid login")) return "Email o contraseña incorrectos.";
  if (text.includes("email not confirmed")) return "Confirma tu email con el enlace que te hemos enviado.";
  if (text.includes("already registered") || text.includes("already been registered"))
    return "Ese email ya tiene una cuenta. Inicia sesión.";
  if (text.includes("password should be") || text.includes("weak"))
    return "La contraseña debe tener al menos 8 caracteres.";
  if (text.includes("rate limit") || text.includes("too many"))
    return "Demasiados intentos. Espera un minuto y vuelve a probar.";
  if (text.includes("network") || text.includes("fetch"))
    return "Sin conexión. Comprueba internet e inténtalo de nuevo.";
  return "No se ha podido completar. Inténtalo de nuevo.";
}

export const isSupabase = backendMode === "supabase";
