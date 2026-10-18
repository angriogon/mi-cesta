# Cesta

- Textos de la app, commits y PR en español.
- **Novedades:** todo cambio que se note en la app añade su nota en `src/copy/novedades.ts`: una versión nueva arriba (o
  ampliar la que aún no se ha publicado), con frases que cuenten qué cambia para quien usa Cesta. Sube también
  `version` en `package.json` y `package-lock.json` a la misma versión. El CI (`npm run check:novedades`) falla si un PR
  toca la app sin tocar Novedades; un PR sin cambios visibles lleva «[sin novedades]» en el título.
- Las migraciones de Supabase son aditivas. Nunca la clave service_role en el repositorio.
- Antes de un PR: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run test:db`,
  `npm run test:e2e`.
