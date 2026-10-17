import type { Database } from "./database.types";
import type { Household, Lists, TableName, Tables } from "./types";

/**
 * Contrato entre los tipos de la app (camelCase) y las columnas reales de Supabase (snake_case).
 * Si una migración añade, quita o renombra una columna sin actualizar `types.ts`, la compilación falla aquí.
 * Tras cambiar el esquema: `npm run gen:types`.
 */

type Snake<S extends string> = S extends `${infer Head}${infer Tail}`
  ? `${Head extends Lowercase<Head> ? Head : `_${Lowercase<Head>}`}${Snake<Tail>}`
  : S;

type ColumnsOf<T> = Snake<keyof T & string>;
type DbTables = Database["public"]["Tables"];
type Row<T extends keyof DbTables> = DbTables[T]["Row"];

/**
 * Campos de la app sin columna, y columnas sin campo en la app.
 * `household_id` lo pone la capa de datos; `ServerOnly` son columnas que la app no lee a propósito.
 */
type Drift<App, T extends keyof DbTables, ServerOnly extends string = never> = {
  missingColumns: Exclude<ColumnsOf<App>, keyof Row<T>>;
  missingFields: Exclude<keyof Row<T>, ColumnsOf<App> | "household_id" | ServerOnly>;
};

type InSync = { missingColumns: never; missingFields: never };

type AllTables = { [T in TableName]: Drift<Tables[T], T> } & {
  households: Drift<Household, "households", "created_by">;
  lists: Drift<Lists, "lists">;
};

type AssertInSync<T extends Record<string, InSync>> = T;

// Si esta línea no compila, el mensaje indica la tabla y la columna desalineadas.
export type SchemaInSync = AssertInSync<AllTables>;
