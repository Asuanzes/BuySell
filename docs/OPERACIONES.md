# Operaciones — Nidokey

Manual de operación: despliegue, pagos, backups, rollback y checklist de
lanzamiento. Complementa el brief de [CLAUDE.md](../CLAUDE.md) (arquitectura) y
[docs/ANALITICA.md](ANALITICA.md) (métricas).

## 1. Entornos

| Entorno | Qué | Deploy |
| --- | --- | --- |
| Producción web+API | Vercel (proyecto `nidokey`, dominio nidokey.es) | push a `main` → auto-deploy |
| BBDD | Neon Postgres (única; no hay staging) | `npx prisma db push` (NUNCA `migrate`) |
| App móvil | EAS Update OTA (runtime `appVersion`) | `eas update --branch production` |
| Gateway chat | VPS Hetzner (`ws.nidokey.es`, systemd) | `ssh` + redeploy manual |
| Scraper menús | Apify (actor Glovo) + Firecrawl, **ambos de pago** | sin deploy propio |

**CI**: `.github/workflows/ci.yml` corre typecheck (web+móvil), tests y build en
cada PR/push a `main`. El deploy de Vercel es automático al pushear `main` —
**no pushear sin CI en verde**.

## 2. Variables de entorno

Fuente de verdad: [.env.example](../.env.example) (comentado var a var).
Validación al arrancar: `src/instrumentation.ts` — críticas (`DATABASE_URL`,
`AUTH_SECRET`) tumban el server en producción si faltan; recomendadas solo
avisan en logs.

⚠️ **Acción pendiente de humano**: crear `PAYMENT_WEBHOOK_SECRET` en
Vercel (32 bytes hex). Desde el commit de seguridad, firmar pagos SIN esta
variable **lanza error en producción** (antes caía en silencio a `AUTH_SECRET`).

## 3. Pagos y suscripción Premium

Arquitectura: webhook-first y provider-agnóstico. El estado de un pago o
suscripción SOLO cambia vía webhook firmado; la URL de retorno es decorativa.
Precios centralizados en `src/lib/billing/plans.ts` (4,99 €/mes). Idempotencia
por `(provider, eventId)` en `PaymentWebhookEvent`.

- **Fake** (por defecto sin claves de Stripe): checkout en `/billing/pay/fake`,
  reentra por `/api/billing/webhook/fake` con HMAC. Sirve para probar el rail
  completo en local/producción sin dinero real.
- **Stripe** (test → live): Checkout Session `mode: subscription`.

### Activar Stripe en TEST

1. Crear cuenta Stripe → modo Test.
2. Dashboard → Products → crear "Nidokey Premium" con Price mensual de 4,99 €
   (debe coincidir con `PREMIUM_PLAN.priceCents`).
3. Vercel env: `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_PRICE_ID_PREMIUM=price_…`.
4. Dashboard → Webhooks → endpoint `https://nidokey.es/api/billing/webhook/stripe`
   con eventos `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted` → copiar `whsec_…` a `STRIPE_WEBHOOK_SECRET`.
5. Probar: app → Cuenta → Premium → pagar con tarjeta `4242 4242 4242 4242`.
6. Verificar: `Subscription.status = ACTIVE` en BBDD y evento
   `subscribe_success` en `AnalyticsEvent`.

### Pasar a LIVE (cuando se decida cobrar de verdad)

1. Completar el alta de negocio en Stripe (datos fiscales, cuenta bancaria).
2. Repetir pasos 2-4 en modo Live (claves `sk_live_…`, nuevo webhook + secret).
3. Hacer una compra real controlada y su reembolso desde el dashboard.
4. ⚠️ Tiendas: para vender la suscripción DENTRO de la app publicada en
   App Store/Play hay que migrar el checkout a IAP (RevenueCat) — el checkout
   web actual vale para distribución web/APK y para usuarios existentes. Ver
   "Limitaciones conocidas".

### Reembolsos y disputas

Stripe gestiona ambos desde su dashboard. Un reembolso de suscripción no emite
webhook mapeado (la suscripción sigue activa hasta cancelarla también);
procedimiento manual: reembolsar + cancelar inmediata en Stripe → el webhook
`customer.subscription.deleted` marca CANCELLED.

## 4. Base de datos

- **Cambios de esquema**: editar `prisma/schema.prisma` + `npx prisma db push`.
  **PROHIBIDO `prisma migrate dev/deploy`** (reset destructivo; hay hook que lo
  bloquea). `db push` aborta solo si el cambio implica pérdida de datos.
- **Backups**: Neon mantiene point-in-time recovery (retención según plan del
  proyecto Neon; verificar en console.neon.tech → Branches → Restore).
  **Restauración**: crear branch desde timestamp en la consola de Neon →
  apuntar `DATABASE_URL` de Vercel al branch → redeploy. Documentar cada
  restauración real en este fichero.
- **Limpieza**: cron semanal `chat-cleanup` purga OTPs caducados, huérfanos R2
  y ventanas de rate-limit cerradas.

## 5. Rollback

- **Web/API**: Vercel → Deployments → "Promote to Production" del deploy
  anterior (instantáneo). O `git revert` + push.
- **Móvil OTA**: `eas update --branch production` con el commit anterior
  (checkout del commit + update), o `eas update:republish` de un update previo.
- **BBDD**: los cambios aplicados son aditivos (tablas `RateLimit`,
  `Subscription`, `AnalyticsEvent`); un rollback de código NO requiere tocar la
  BBDD. Nunca borrar columnas/tablas en el mismo deploy que deja de usarlas.

## 6. Monitorización

- `GET /api/health` — estado + latencia de BBDD (montable en UptimeRobot/
  cron-job.org gratis).
- `gateway` VPS: `/healthz` con métricas (`notify.recv/relayed`).
- Logs: Vercel → proyecto → Logs (los errores de env-check salen con prefijo
  `[env]`). Los OTP jamás se imprimen en producción.
- Crons: GitHub Actions (pestaña Actions); si cripto/tendencias se congelan,
  mirar ahí primero (`CRON_SECRET` debe existir en Vercel Y GitHub).

## 7. Limitaciones conocidas

- **JWT móvil no revocable** (90 días, stateless): tras borrar la cuenta, un
  token robado resuelve a un usuario inexistente (lecturas vacías/4xx), pero no
  hay denylist. Mitigación futura: versión de token en User.
- **Suscripción en tiendas**: Apple/Google exigen IAP para bienes digitales
  comprados in-app. Plan: RevenueCat detrás de la misma tabla `Subscription`
  (el webhook de RevenueCat encaja en el patrón existente).
- **Tokens de API `nk_` revocados** devuelven 500 en vez de 401 (el middleware
  no puede consultar BBDD); caso residual de usuarios avanzados.
- **Push iOS desactivado** hasta tener cuenta Apple de pago (APNs).
- **Cancelación fake**: sin webhook de renovación, caduca sola al fin de periodo.

## 8. Checklist de lanzamiento

1. `PAYMENT_WEBHOOK_SECRET` creada en Vercel (§2).
2. Stripe TEST verificado end-to-end (§3) → decidir fecha de LIVE.
3. `RESEND_API_KEY` activa y dominio de email verificado en Resend.
4. Rebuild nativo Android con el package nuevo `es.nidokey.app`
   (`eas build -p android`) — el rename invalida los builds dev previos.
5. Play Console: ficha, política de privacidad (URL pública), data safety.
6. Flip de la landing: en `src/app/page.tsx` cambiar `<ComingSoon/>` por
   `<Landing/>` y enlazar los badges de las tiendas (`StoreBadge`).
7. Textos legales (privacidad, términos, cookies) — **revisión profesional
   obligatoria antes de publicar** (RGPD/LSSI). El borrado y export de cuenta
   ya están implementados (`DELETE /api/account`, `GET /api/account/export`).
8. Monitor externo sobre `/api/health` + alerta.
9. Primera compra controlada en producción + verificación del embudo en
   `AnalyticsEvent` (docs/ANALITICA.md).
