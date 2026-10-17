import type { TableName } from "../types";
import { TicketsApi } from "./tickets";
import { now } from "./shared";

/** Todas las tablas con datos del hogar, en el orden en que se leen mejor en la exportación. */
const EXPORT_TABLES: TableName[] = [
  "products",
  "inventory_lots",
  "tickets",
  "ticket_reviews",
  "prices",
  "name_aliases",
  "barcodes",
  "purchase_sessions",
  "provisional_purchases",
  "quick_sessions",
  "dog_items",
  "dog_reminders",
  "stock_events",
  "operations",
  "household_events",
  "activity",
];

export interface HouseholdExport {
  format: "cesta-export";
  version: 1;
  exportedAt: string;
  household: unknown;
  lists: unknown;
  tables: Partial<Record<TableName, unknown[]>>;
  /** Las fotos de los tickets no van dentro del archivo; aquí están sus rutas en el almacenamiento. */
  ticketPhotos: string[];
}

/** Privacidad: copia de todos los datos del hogar (derecho de portabilidad del RGPD). */
export class PrivacyApi extends TicketsApi {
  async exportHousehold(): Promise<HouseholdExport> {
    const [household, lists, ...rows] = await Promise.all([
      this.db.getHousehold(),
      this.db.getLists(),
      ...EXPORT_TABLES.map((table) => this.db.list(table)),
    ]);
    const tables = Object.fromEntries(EXPORT_TABLES.map((table, index) => [table, rows[index]]));
    const ticketPhotos = (tables.tickets as { imagePath?: string | null }[]).flatMap((ticket) =>
      ticket.imagePath ? [ticket.imagePath] : [],
    );
    return {
      format: "cesta-export",
      version: 1,
      exportedAt: now(),
      household,
      lists,
      tables,
      ticketPhotos,
    };
  }
}
