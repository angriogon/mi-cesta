/**
 * API de Cesta: equivale a las rutas de servidor de la versión original (/api/*), pero trabaja
 * directamente sobre la base de datos del hogar. Cada dominio vive en src/data/api/.
 */
export { CestaApi } from "./api/home";
export { ApiError, type ExternalPrices } from "./api/shared";
