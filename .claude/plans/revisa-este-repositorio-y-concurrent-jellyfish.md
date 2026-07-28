# Plan — Limpieza "basura muerta segura" (auditoría PonyTail, tier aprobado)

## Context
PonyTail auditó el repo y el usuario aprobó **solo** borrar ficheros/scripts muertos **verificados** — sin
tocar deps (riesgo de Metro-hoisting: tsc/next build NO lo cazan, solo el bundle Metro — ver [[metro-dep-hoisting]]),
sin refactors YAGNI, sin migraciones ni SavedSearch. Cada candidato se verificó en read-only. Borrar código
**web/shared** es auto-verificable: si algo seguía importándolo, `next build`/`tsc` falla.

## Borrar ficheros (verificados sin uso)
- `_font-codemod.mjs`, `scripts/rewrite-imports.mjs` — codemods de un solo uso, no referenciados en package.json.
- `scripts/test-jobs-ingestion.ts`, `scripts/test-travelpayouts.ts`, `scripts/test-property-ingest.ts` — harnesses POC manuales.
- `src/components/brand/icons.tsx` — iconos de marca web; 0 importers reales (los hits en móvil eran `TabIconKey`, falso positivo; Landing/ComingSoon ya usan `<img>`).
- `packages/shared/src/portals.ts` — 0 importers (solo el barrel).
- `apps/mobile/constants/theme.ts` — huérfano de plantilla Expo; 0 importers (sin use-theme-color/ThemedText/ThemedView).
- `apps/mobile/app/modal.tsx` — ruta vestigial; nada navega a `/modal`.
- `AUDIT_MENUS.md`, `Contexto general del proyecto.md` — notas scratch superadas.

## Quitar referencias (ediciones)
- `packages/shared/src/index.ts` — borrar `export * from "./portals";` (línea 13).
- `apps/mobile/app/_layout.tsx` — borrar `<Stack.Screen name="modal" .../>` (~línea 462).
- `package.json` — borrar los scripts `test-ingest`, `test-jobs`, `test-travelpayouts`.

## Fuera de scope (NO se toca)
deps (lucide-react / zod móvil / @react-navigation → requieren bundle Metro real), `Landing.tsx` (marketing
diferida, recuperable de git), `prisma/migrations/`, modelo `SavedSearch`, los collapse YAGNI
(filters.ts / adapters manual-only / subpaths / `?token=` / images.remotePatterns), `fix-corrupt-prices.ts` y
`claim-orphan-properties.ts` (se CONSERVAN como mantenimiento), `AGENTS.md` (sin trackear; lo decide el usuario aparte).

## Verificación
- `npx tsc --noEmit -p tsconfig.json` (web) → caza cualquier importer perdido de `brand/icons` o `portals`.
- `cd apps/mobile && npx tsc --noEmit` (móvil) → caza refs a `modal`/`constants`.
- `git status` debe quedar solo con lo previsto (sin tocar los ficheros sin-trackear ajenos).
- Commit + push a `main`. Todo es web/shared/scripts salvo `modal.tsx`+`constants/theme.ts` (móvil, sin uso) →
  un `eas update` lo recogería pero NO es urgente (nada los referenciaba).
