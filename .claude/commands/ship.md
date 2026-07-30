---
description: "Despliegue Nidokey: tsc de lo que cambió → commit → push (deploy web en Vercel) → eas update si tocó el móvil (canales preview y, si procede, production/TestFlight). Uso: /ship <mensaje de commit>"
argument-hint: <mensaje de commit>
---

Ritual de despliegue de Nidokey. Mensaje de commit: **$ARGUMENTS**
Si `$ARGUMENTS` está vacío, pídelo y para (no inventes el mensaje).

Ejecuta EN ORDEN, parando ante el primer fallo. Monorepo con rutas de
despliegue distintas: web/backend → Vercel al pushear; móvil → EAS OTA.

## 1. Detectar qué cambió
`git status --porcelain` + `git diff --name-only HEAD`. Clasifica rutas:
- **Móvil** = `apps/mobile/**`
- **Web/backend** = `src/**`, `packages/**`, `prisma/**`
- **Esquema** = `prisma/schema.prisma`
- **Nativo** = `apps/mobile/package.json`, `apps/mobile/app.json`,
  `apps/mobile/app.config.*`, `apps/mobile/android/**`, `apps/mobile/ios/**`

Si no hay cambios, dilo y termina.

## 2. Esquema (si cambió `prisma/schema.prisma`)
⚠️ NUNCA `prisma migrate dev/deploy` (reset destructivo en Neon). El cambio de
esquema se aplica SOLO con `npx prisma db push`. Pregunta antes de ejecutarlo.

## 3. tsc — solo lo que cambió
- Web/backend tocado → `npx tsc --noEmit -p tsconfig.json`
- Móvil tocado → `cd "apps/mobile" && npx tsc --noEmit`
Si alguno falla: **para**, muestra los errores, NO commitees.

## 4. Resumen + confirmación (OBLIGATORIA)
Muestra el plan: qué desplegará (web sí/no, OTA móvil sí/no) y avisos.
- ⚠️ Si hubo cambio **nativo**: avisa "OTA (eas update) NO arrastra cambios
  nativos → necesitas EAS Build / `expo run:android`, no basta /ship".
**Espera el OK del usuario antes de seguir.** Sin OK explícito, no pushees.

## 5. Commit
`git add -A` y commit con `$ARGUMENTS` como mensaje, terminando con el trailer:
```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```
(Se trabaja directo en `main`: es la rama que despliega.)

## 6. Push → deploy web
`git push origin main`. Esto dispara el deploy del backend en Vercel solo.

## 7. OTA móvil (solo si hubo cambios en `apps/mobile/**`)
⚠️ **HAY DOS AUDIENCIAS** (tabla en `docs/OPERACIONES.md` §1): el móvil propio
bebe del canal `preview` y los testers de TestFlight del canal `production`.
Un update solo llega a su canal+runtime; el canal equivocado no da error.

1. Siempre: `cd "apps/mobile" && eas update --branch preview --platform all -m "$ARGUMENTS"`
2. Si el cambio es solo-JS y debe llegar a los testers de TestFlight, pregunta
   al usuario y publica también:
   `eas update --branch production --platform all -m "$ARGUMENTS"`
   (el `version` de app.json debe coincidir con el del build de esa audiencia).

Si falla por sesión/auth de EAS: NO es fatal (el push ya está hecho). Avisa
"haz el OTA donde tengas sesión EAS" y sigue.

## 8. Cierre
Resume: hash del commit, deploy web disparado, OTA publicado (en qué canales) o
no, y pendientes (cambios nativos sin rebuild/TestFlight, db push pendiente).
