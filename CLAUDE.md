# Nidokey — brief de proyecto

> Brief compacto del estado REAL de la app (jul-2026). La spec histórica del
> producto original "BuySell Asturias" (inteligencia inmobiliaria web) vive en
> `docs/blitzy-tech-spec.md` y `docs/ROADMAP.md`; describe una app que ya no es
> esta. Ante conflicto, manda este documento y el código.

## 1. Qué es

**Nidokey** es una app móvil (Expo) de **registros personales multi-vertical**
con chat integrado. Un "registro" es cualquier cosa que el usuario sigue:

| Tipo (`RecordType`) | Vertical |
| --- | --- |
| `property` | Inmuebles: venta + alquiler (OperationType SALE/RENT/RENT_TO_OWN); import desde portales |
| `crypto` / `market` | Cripto y mercado (precios vía cron GitHub Actions + `CRON_SECRET`) |
| `book` | Libros (ISBN: Open Library primero, Google respaldo; nunca scraping Amazon) |
| `job` | Empleos (Apify InfoJobs/LinkedIn, requiere `APIFY_TOKEN`) |
| `holiday` | Viajes (Travelpayouts: vuelos OK, hoteles pendientes; marker 536869) |
| `food` | Comida a domicilio (diseño cerrado en `docs/diseno-vertical-comida.md`; menús vía Crawl4AI+Groq) |
| `trends` | Tendencias RSS (keyless: trends24+Jina, Google News, HN, Twitch; ver `docs/TRENDS.md`) |
| `workout` | Entrenos |
| `chat` | Chat 1:1/grupos + bot **@Nidokey** (agente con tools) |

Multi-usuario real (compartir registros, chat entre usuarios). Idiomas: ES
(fuente) + EN vía i18next con claves tipadas.

## 2. Foco de trabajo

**Desde 2026-06-01 se trabaja SOLO en `apps/mobile/`.** La web (`src/`) queda
como landing de descarga + API backend; no se añaden features de UI web y no se
traduce.

## 3. Monorepo

| Workspace | Qué es |
| --- | --- |
| `src/` | Next.js 15 App Router: API routes (backend de la app móvil) + landing. Deploy en **Vercel** |
| `apps/mobile/` | Expo SDK 54 + Expo Router 6. La app de verdad |
| `packages/shared/` | Tipos, records, dedup, sanity, i18n compartidos |
| `gateway/` | Gateway WebSocket del chat (Node sin BBDD, systemd en VPS) |
| `crawl4ai/` | Deploy del scraper de menús (Docker en VPS) |
| `scripts/` | Utilidades (`icon-glow.mjs`, `reset-food-menus`, …) |

## 4. Infra y deploy

- **Web+API**: Vercel (auto-deploy al pushear `main`).
- **BBDD**: Neon Postgres. ⚠️ **Se gestiona con `prisma db push`, NUNCA
  `migrate dev/deploy`** (reset destructivo; hay hook anti-migrate). Cambios de
  esquema = editar `prisma/schema.prisma` + `db push`. La `DATABASE_URL` de
  Vercel ya es pooled.
- **App móvil**: EAS Build + **EAS Update (OTA)** — todo cambio JS sale por
  `eas update`, sin rebuild. projectId `bfbe4a8a-1899-44b5-b5a3-5e3742aabf4b`,
  `runtimeVersion: appVersion` (fingerprint NO es determinista en monorepo).
  Cambios nativos (plugins/módulos) requieren `expo run:android` / build en Mac
  para iOS (Claude en Windows no compila iOS).
- **Identidad**: name `Nidokey`, scheme `nidokey`, iOS `es.nidokey.app`,
  Android `com.anonymous.nidokey` (**rename pendiente antes de tiendas**).
- **Chat tiempo real**: gateway WS en `ws.nidokey.es` (VPS Hetzner
  167.233.16.6, **nginx+certbot** — el `Caddyfile` del repo es residuo, no se
  usa). Webhook HMAC `CHAT_GATEWAY_SECRET` + ticket JWT `CHAT_WS_SECRET`.
  Cliente: `apps/mobile/lib/chat/socket.ts` con polling adaptativo de respaldo.
- **Media/avatares**: Cloudflare R2 (URLs firmadas; `GET /api/avatar/[userId]`
  público 302).
- **Menús comida** ⚠️ **DE PAGO**: actor de Glovo en **Apify** (`APIFY_TOKEN`) +
  **Firecrawl** para resolver el restaurante en el catálogo. Cada restaurante
  nuevo descubierto encola un scrape que gasta saldo. (Crawl4AI self-hosted se
  retiró en `1b08124`; su Docker puede seguir vivo en el VPS — apagarlo.)
- **Cron**: GitHub Actions + `CRON_SECRET` (en Vercel Y GitHub) refresca
  cripto/mercado y tendencias; si algo está congelado, mirar ahí.

## 5. Bot @Nidokey

Agente del chat: **Claude Haiku (Anthropic prepago) + Groq de respaldo**. Tools
de LECTURA (records/trends/news/comida) y de ESCRITURA con confirmación
(crear/borrar/fusionar) usando el JWT del usuario. `APP_GUIDE` (mapa de la app)
va en el prompt. Enlaces `[[tipo:id|Título]]` se linkifican en burbuja; lista y
push los limpian con `stripRecordLinks`. Nombre protegido contra suplantación
(homoglifos) + badge verificado.

## 6. Convenciones

- Móvil: ficheros kebab-case (componentes PascalCase), `StyleSheet.create`,
  SecureStore vía `apps/mobile/lib/secure-store.ts`.
- i18n: i18next, ES fuente + EN, claves tipadas (`I18nKey`); `labelKey` en
  configs no-React; plurales `_one`/`_other`. La web NO se traduce.
- Tema: estilo "2100" (neón configurable) + vintage, toggle en Ajustes;
  `th` se resuelve en `ThemedShell` de `_layout.tsx`. Colores de categoría:
  `categoryColor(type, dark)` con convención `colorDark?`. Iconos Ionicons de
  línea.
- Precios en cents (`Math.round(€ * 100)`); no alterar precios sin
  `isReasonablePriceChange` de `packages/shared/src/sanity.ts`.
- API: validar body con Zod, filtrar por dueño (`requireUserId()`), errores
  `{ error, detail? }`.
- No commitear `.env`; repo público (`Asuanzes/BuySell`) — cuidado con secretos.

## 7. Gotchas que ya nos han mordido

- **Back de iOS**: el back nativo del header no funciona (las tabs usan
  `<Slot>`); usar `HeaderBack` JS como `headerLeft` global (`_layout.tsx`).
- **Metro hoisting**: `disableHierarchicalLookup` exige transitivas hoisted en
  la raíz — quitar deps "sin uso" del root puede romper el bundle Android y ni
  tsc ni el build web lo detectan.
- **Dev build móvil**: pantalla blanca = no encuentra Metro; el dev build
  apunta a la IP LAN del PC `http://192.168.1.77:8081` (no adb reverse).
- **App negra tras añadir módulo nativo** (`…could not be found in native
  binary`) = recompilar con `expo run:android`, no es red.
- **Icono**: lleva glow bakeado; regenerar con `scripts/icon-glow.mjs` desde
  `*.base.png`, nunca editar `icon.png` a mano (y requiere rebuild nativo).
- **Plugins iOS**: un plugin con `microphonePermission:false` borra la clave
  del plist y rompe a los demás.

## 8. Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Next.js en `:4200` |
| `npm test` / `npm run typecheck` / `npm run typecheck:mobile` | lo mismo que corre el CI de PR |
| `cd apps/mobile && npx expo start` | Metro |
| `/ship <mensaje>` | tsc de lo cambiado → commit → push (Vercel) → `eas update` si tocó móvil |
| `eas update --branch production` | OTA manual |
| `npx prisma db push` | Sincronizar esquema con Neon (nunca migrate) |

## 9. Monetización y analítica (jul-2026)

- **Nidokey Premium** (suscripción 4,99 €/mes): rail webhook-first completo en
  `src/lib/billing/` (planes en `plans.ts` — el cliente JAMÁS manda precios;
  entitlements server-side en `entitlements.ts`; proveedores fake + Stripe
  test-mode tras una interfaz). Paywall móvil en `app/premium.tsx`. Activación
  de Stripe: `docs/OPERACIONES.md`. ⚠️ Para vender in-app en tiendas hará falta
  IAP (RevenueCat) — el checkout web vale para distribución web/APK.
- **Cuotas de coste** (tabla `RateLimit` + `src/lib/rate-limit.ts`,
  serverless-safe): bot 40 msgs/día (Premium 400), empleos Apify 10/día
  (Premium 40), refresh-menu, Places, vuelos Duffel, OTP por IP.
- **Analítica propia** (tabla `AnalyticsEvent`, sin SDK de terceros): móvil
  `lib/analytics.ts` → `POST /api/analytics`; conversión/uso server-side desde
  webhooks. Catálogo y SQL del embudo: `docs/ANALITICA.md`.
- **RGPD**: `DELETE /api/account` (borrado total) + `GET /api/account/export`
  (portabilidad); UI en Cuenta.

## 10. Docs normativos

- `docs/OPERACIONES.md` — deploy, pagos test→live, backups, rollback, checklist de lanzamiento
- `docs/ANALITICA.md` — catálogo de eventos, embudo, métricas
- `docs/ALERTAS.md` — alertas de precio (cripto/mercados/inmuebles): tipos, rearme, cuotas
- `docs/diseno-vertical-comida.md` — diseño cerrado del vertical comida
- `docs/TRENDS.md` — vertical tendencias
- `docs/auditoria-riesgos-mejoras.html` — auditoría técnica P0–P3 (jun-2026; P0/P1 resueltos jul-2026)
- `docs/seguridad-registros.md`, `docs/arquitectura-records.md`
- `docs/blitzy-tech-spec.md` + `docs/ROADMAP.md` — **histórico** BuySell (no refleja la app actual)

## 11. Pendientes estratégicos (jul-2026, tras el sprint de lanzamiento)

1. **Lanzar**: acciones manuales del checklist de `docs/OPERACIONES.md` §8
   (secreto de pagos en Vercel, Stripe test end-to-end, rebuild Android con el
   package nuevo `es.nidokey.app`, ficha de Play, textos legales con revisión
   profesional, flip de la landing).
2. **Tiendas**: EAS build Android; iOS bloqueado por cuenta Apple de pago;
   IAP/RevenueCat para vender Premium in-app.
3. Menores: chat F5 (grupos UI), picker emoji, responder-cita; subida del
   toolchain Expo (resuelve las vulns altas restantes del audit).
