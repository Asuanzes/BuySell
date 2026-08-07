# Operaciones — Nidokey

Manual de operación: despliegue, pagos, backups, rollback y checklist de
lanzamiento. Complementa el brief de [CLAUDE.md](../CLAUDE.md) (arquitectura) y
[docs/ANALITICA.md](ANALITICA.md) (métricas).

## 1. Entornos

| Entorno | Qué | Deploy |
| --- | --- | --- |
| Producción web+API | Vercel (proyecto `nidokey`, dominio nidokey.es) | push a `main` → auto-deploy |
| BBDD | Neon Postgres (única; no hay staging) | `npx prisma db push` (NUNCA `migrate`) |
| App móvil | EAS Update OTA (runtime `appVersion`) | `eas update --branch preview` (ver aviso abajo) |
| Gateway chat | VPS Hetzner (`ws.nidokey.es`, systemd) | `ssh` + redeploy manual |
| Scraper menús | Apify (actor Glovo) + Firecrawl, **ambos de pago** | sin deploy propio |

**CI**: `.github/workflows/ci.yml` corre typecheck (web+móvil), tests y build en
cada PR/push a `main`. El deploy de Vercel es automático al pushear `main` —
**no pushear sin CI en verde**.

⚠️ **La rama del OTA tiene que coincidir con el CANAL del build Y con su
`runtimeVersion`.** Un build solo ve updates de su canal y su runtime; publicar
en otro sitio no llega a nadie y **no da ningún error**.

**HAY DOS AUDIENCIAS VIVAS a la vez** (esto se diagnosticó mal el 2026-07-25 al
mirar solo los últimos builds, todos ad-hoc):

| Audiencia | Perfil / canal | Distribución | Rama del OTA |
| --- | --- | --- | --- |
| **Tu propio móvil** | `preview` | ad-hoc (APK / IPA por enlace, device registrado) | `eas update --branch preview` |
| **Testers de TestFlight** | `production` | store (App Store Connect) | `eas update --branch production` |
| dev client con Metro | `development` | — | no usa OTA |

Como `runtimeVersion` sigue la política `appVersion`, **el `version` de app.json
tiene que coincidir con el de la app instalada** o el update no aplica. Antes de
publicar, comprobar qué versión corre cada audiencia:

```bash
eas build:list --limit 10 --json   # appVersion, appBuildVersion, channel, distribution
eas channel:list                   # rama y runtime del último update por canal
```

Regla práctica: un cambio **solo de JS** llega a los testers publicando en
`--branch production` con el `version` de su build — sin subir nada a TestFlight
ni pasar revisión. Un cambio **nativo** (entitlements, iconos de notificación,
módulos) exige build nuevo y subida.

### Números de versión en iOS (TestFlight con testers externos)

- Un **build nuevo dentro de la versión ya aprobada** (mismo `version`,
  `ios.buildNumber` mayor) normalmente pasa la Beta App Review rápido.
- Una **versión nueva** dispara revisión completa.
- El `buildNumber` debe ser mayor que CUALQUIERA ya subido para esa versión:
  comprobar con `eas build:list` filtrando `distribution: store`.

## 2. Variables de entorno

Fuente de verdad: [.env.example](../.env.example) (comentado var a var).
Validación al arrancar: `src/instrumentation.ts` — críticas (`DATABASE_URL`,
`AUTH_SECRET`) tumban el server en producción si faltan; recomendadas solo
avisan en logs.

### Desplegar SIN `PAYMENT_WEBHOOK_SECRET` (pagos apagados)

**Es un escenario soportado y probado** (`src/lib/payments/provider.test.ts`).
Sin esa variable:

- Todo lo que no sean pagos funciona con normalidad: chat, push, alertas,
  registros, analítica.
- Iniciar el pago de un pedido responde **503** con un mensaje claro (no un
  500): la ruta comprueba `paymentsConfigured()` antes de intentar firmar.
- El checkout de suscripción responde **503** (el proveedor fake exige opt-in
  explícito con `BILLING_PROVIDER=fake` en producción).
- Verificar webhooks **falla cerrado** (401), nunca crashea.
- El arranque solo deja un aviso `[env]` en los logs; no tumba el server.
- **NO hay fallback a `AUTH_SECRET` en producción** — eso era el P0 de la
  auditoría y sigue cerrado.

⚠️ Crear `PAYMENT_WEBHOOK_SECRET` (32 bytes hex) **antes de querer cobrar**.

### ⛔ El push de Android NO funciona: falta Firebase (FCM)

**Diagnosticado el 2026-07-25.** La tabla `Device` estaba vacía para los 13
usuarios: ningún dispositivo ha registrado token nunca. Causa raíz, con la
cadena completa:

1. No hay `android.googleServicesFile` en `apps/mobile/app.json` ni ningún
   `google-services.json` en el repo.
2. Sin esa clave, el plugin de Gradle `com.google.gms.google-services` **nunca
   se aplica** (`@expo/config-plugins/build/android/GoogleServices.js:108-125`
   hace early-return), así que el APK sale sin `google_app_id`.
3. Sin eso `FirebaseApp` no auto-inicializa y
   `FirebaseMessaging.getInstance()` lanza `IllegalStateException`
   (`expo-notifications/.../tokens/PushTokenModule.kt:82-93`).
4. `getExpoPushTokenAsync()` rechaza → el `catch` de `registerForPush` lo
   silenciaba → `POST /api/devices` no se llamaba nunca.

Lo que **NO** era (descartado con evidencia, para no perder el tiempo otra vez):
el módulo nativo sí está en el binario (la dependencia entró 6 días antes del
build); `registerForPush` sí se ejecuta al arrancar con sesión abierta
(`auth-context.tsx:138`); `POST_NOTIFICATIONS` sí está en el manifiesto
(**lo declara la propia librería**, `expo-notifications/android/src/main/AndroidManifest.xml:3`,
y `android.permissions` de app.json es **aditivo**, no una allowlist).

#### Pasos para arreglarlo (requiere REBUILD, no hay atajo por OTA)

Hacen falta **dos ficheros distintos** de Firebase, con tratamiento opuesto:

| Fichero | Qué es | ¿Al repo? |
| --- | --- | --- |
| `google-services.json` | identificadores públicos del proyecto | **SÍ**, es commiteable (lo dice la doc de Expo; va dentro del APK de todos modos) |
| clave de **cuenta de servicio** (`*-firebase-adminsdk-*.json`) | credencial privada para que Expo envíe por ti | **NO, JAMÁS**. Se sube a EAS. Ya está en `.gitignore` |

**Parte humana (navegador, no automatizable):**

1. Crear proyecto en [Firebase](https://console.firebase.google.com) → añadir
   app **Android** con el package **`es.nidokey.app`** (el NUEVO, tras el
   rename; con el viejo no funcionará).
2. Descargar `google-services.json`.
3. Firebase → Configuración del proyecto → **Cuentas de servicio** → *Generar
   nueva clave privada* → descargar el JSON.
4. Subir esa clave a EAS: expo.dev → proyecto → Credentials → Android →
   *FCM V1 service account key* (o `eas credentials` en tu terminal, que es
   interactivo). Las claves de servidor FCM **legacy** están retiradas por
   Google desde 2024: tiene que ser **V1**.

**Parte automatizable (una vez existan los dos ficheros):**

5. Colocar `google-services.json` en `apps/mobile/` y añadir a `app.json`,
   dentro de `android`: `"googleServicesFile": "./google-services.json"`.
   ⚠️ No añadir la clave antes de tener el fichero: rompería el prebuild.
6. `npx expo config --type public` para confirmar que la ruta resuelve.
7. `eas build -p android --profile preview` (~20 min, consume cuota de EAS) e
   instalar el APK.
8. Comprobar con el botón de prueba (abajo) y verificar que aparece fila en
   `Device`.

**NO re-añadir el config plugin `expo-notifications` a app.json**: en Android
solo aporta icono, color y sonidos (cosmético) y en iOS reintroduce el
entitlement `aps-environment` que rompe la firma sin cuenta Apple de pago.

### Probar el push tras desplegar

Cuenta → Notificaciones → **"Enviar notificación de prueba"**. La respuesta
diagnostica el fallo en vez de dejarte a ciegas:

| Resultado | Significa |
| --- | --- |
| llega la notificación | la cadena entera funciona |
| "Ningún dispositivo registró token" | el binario instalado no trae el módulo nativo de `expo-notifications` (hace falta `eas build`, no basta OTA) o no se aceptó el permiso |
| "Estás en horario silencioso" | la franja está activa; el aviso sí se guardaría en el chat |
| "El push de chat está desactivado" | la preferencia está apagada |

En iOS no habrá push hasta tener cuenta Apple de pago (APNs); las alertas
siguen llegando al DM de @Nidokey.

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
- **Móvil OTA**: `eas update --branch preview` con el commit anterior (checkout
  del commit + update), o `eas update:republish` de un update previo — que es
  más rápido y no depende del árbol de trabajo.
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
   ⚠️ **Alineación 16 KB** (Google Play la exige para apps con target
   Android 15+): RN 0.81/Expo 54 ya cumplen, pero hay que verificar las
   dependencias con código nativo (`@shopify/react-native-skia`,
   `react-native-view-shot`, `expo-share-intent`, `react-native-webview`).
   Cómo: `npx expo-doctor` antes del build y, tras subir el `.aab`, el
   informe de compatibilidad de Play Console (App bundle explorer → avisos
   de "16 KB page size"). Si una librería falla, la solución es SUBIR su
   versión, no parchear el binario.
5. Play Console: ficha, política de privacidad (URL pública), data safety.
6. Flip de la landing: en `src/app/page.tsx` cambiar `<ComingSoon/>` por
   `<Landing/>` y enlazar los badges de las tiendas (`StoreBadge`).
7. Textos legales (privacidad, términos, cookies) — **revisión profesional
   obligatoria antes de publicar** (RGPD/LSSI). El borrado y export de cuenta
   ya están implementados (`DELETE /api/account`, `GET /api/account/export`).
8. Monitor externo sobre `/api/health` + alerta.
9. Primera compra controlada en producción + verificación del embudo en
   `AnalyticsEvent` (docs/ANALITICA.md).

### Requisitos legales de la UE en las tiendas (aparecieron el 2026-07-25)

Al subir a TestFlight, App Store Connect bloqueó el envío hasta aceptar dos
declaraciones nuevas de normativa europea. **No son un trámite de un clic: tienen
consecuencias sobre el producto.** Verificar el alcance exacto con asesoría —
aquí solo se recoge lo que hay que mirar:

- **Condición de comerciante (DSA)**. Al declararte comerciante, Apple publica
  tus **datos de contacto en la ficha de la app**: nombre, dirección, teléfono y
  email. Siendo persona física, son datos personales tuyos y quedan visibles.
  Muchos desarrolladores individuales usan una dirección profesional o
  constituyen una entidad antes de declarar. Decidir esto ANTES de publicar en
  abierto: revertirlo después no borra lo ya indexado.
- **Accesibilidad (European Accessibility Act)**. Aplica a servicios de comercio
  electrónico dirigidos a consumidores de la UE. Nidokey **vende una suscripción
  dentro de la app**, así que muy probablemente está en el alcance. Eso convierte
  la accesibilidad en obligación legal, no en mejora opcional.
  Línea base actual: 26 ficheros del móvil usan `accessibilityLabel` /
  `accessibilityRole` / `accessibilityHint` — hay algo, pero **nunca se ha
  auditado**. Pendiente: recorrer los flujos críticos (registro, alta de
  registro, paywall, pago, borrado de cuenta) con lector de pantalla, revisar
  contraste y tamaños de toque.

Ambas afectan también a Google Play, que tiene declaraciones equivalentes.
