# Alertas de precio

Avisos cuando cambia el precio (o el estado) de un registro que sigues.
Verticales cubiertos: **cripto**, **mercados** e **inmuebles** (venta y
alquiler). Libros, viajes, tendencias y comida no tienen precio propio
vigilable y quedan fuera.

## Decisión central: el DM del bot es el registro, el push es el aviso

Cada alerta que salta escribe **siempre** un mensaje en el DM de @Nidokey, con
un enlace `[[tipo:id|Título]]` que abre la ficha. El push (fase siguiente) es
solo el aviso inmediato. De ahí salen cuatro propiedades:

- Funciona en **iOS** aunque no haya APNs (cuenta Apple de pago pendiente).
- No hace falta centro de notificaciones: el DM ya es el historial.
- El horario silencioso se implementa suprimiendo el push, sin perder el aviso.
- La feature completa sale por OTA, sin rebuild nativo.

## Tipos de alerta

| Tipo | Significado | Umbral | Repetición |
| --- | --- | --- | --- |
| `PRICE_BELOW` | baja de X | céntimos | un solo disparo |
| `PRICE_ABOVE` | sube de X | céntimos | un solo disparo |
| `PRICE_DROP_PCT` | cae un X % desde la referencia | porcentaje entero 1-99 | enfriamiento 6 h |
| `STATUS_CHANGE` | vendido o retirado (solo inmuebles) | — | enfriamiento 6 h |

**Un solo disparo** (`oneShot`) en los umbrales absolutos: la alerta se
desactiva al saltar y el usuario la rearma desde la app. Es lo que significa
"avísame cuando llegue a X"; sin ello, un precio oscilando en torno al umbral
notificaría en cada ejecución del cron.

Los umbrales exigen **cruce**: solo saltan si el valor anterior estaba al otro
lado. Y la API **rechaza crear una alerta cuya condición ya se cumple**, con un
mensaje claro, en vez de disparar un aviso inmediato y desconcertante.

Al **rearmar** se refresca `baselineCents` con el precio actual: si no, una
alerta porcentual seguiría midiendo la caída desde un precio viejo.

## Campo vigilado: `price` vs `rent`

Una ficha de inmueble puede ser **mixta** (venta y alquiler a la vez), así que
cada alerta declara qué vigila: `price` (`currentPrice` en venta,
`currentValue` en cripto/mercados) o `rent` (`monthlyRent`). Las de
`STATUS_CHANGE` se guardan siempre como `price` para que el enganche del
scraper las encuentre.

## Dónde se evalúa

Una única función `evaluateAlerts()`
([src/lib/alerts/evaluate.ts](../src/lib/alerts/evaluate.ts)), llamada desde
los tres sitios que detectan el cambio:

| Enganche | Cubre | Cadencia |
| --- | --- | --- |
| [features/sources/refresh.ts](../src/features/sources/refresh.ts) | cripto, mercados | cron cada 1-2 min |
| [features/scraping/runner.ts](../src/features/scraping/runner.ts) | inmuebles (precio/renta y desaparición del anuncio) | cron diario [listings-check.yml](../.github/workflows/listings-check.yml) + botón de la ficha |
| [lib/import-listing.ts](../src/lib/import-listing.ts) (update path) | inmuebles re-importados — el ÚNICO canal de los portales manual-only (Idealista, Milanuncios, Yaencontre) | al re-importar/compartir a la app |

La decisión (`shouldFire`) es **pura** y está cubierta por
`src/lib/alerts/evaluate.test.ts`. El envoltorio no lanza nunca: un fallo en
las alertas no puede romper el cron de refresco.

Coste añadido al cron: **una** consulta por ejecución (`recordsWithAlerts`
precarga los ids con alertas activas), no una por registro.

⚠️ **Latencia en inmuebles**: `checkAllActiveListings` sigue siendo un bucle
secuencial con pausa de 1 s por anuncio (P1-8 de la auditoría). Las alertas de
inmuebles llegan tan rápido como ese job — a volumen, horas. La UI dice
"revisamos tus anuncios a diario" y no promete tiempo real. Arreglar ese bucle
es trabajo aparte.

Notas del recheck (jul-2026): la decisión es pura
([recheck-plan.ts](../src/features/scraping/recheck-plan.ts), testeada con la
secuencia determinista completa), se aplica en transacción con guard optimista
(sin snapshots ni alertas duplicadas en carreras), los `REMOVED` se re-vigilan
45 días para detectar reapariciones, y el resultado de cada pasada queda en
`Listing.lastCheckResult/lastCheckDetail` (visible en la ficha móvil).

## Cuota por plan

Alertas **activas** simultáneas: **3 gratis / 25 Premium**
([plans.ts](../src/lib/billing/plans.ts) + `activeAlertsLimit()` en
[entitlements.ts](../src/lib/billing/entitlements.ts)). Al agotarla la API
responde `402` con `upgrade: true` y la app enlaza al paywall con
`?from=alerts`.

Las notificaciones de **chat nunca se limitan por plan**.

## API

| Ruta | Qué hace |
| --- | --- |
| `GET /api/alerts?recordType=&recordId=` | mis alertas + `limit` y `activeCount` |
| `POST /api/alerts` | crear (valida pertenencia con `ownsRecord`, cuota y condición ya cumplida) |
| `PATCH /api/alerts/[id]` `{active}` | rearmar (refresca la referencia) o desactivar |
| `DELETE /api/alerts/[id]` | borrar |

Autorización: `requireUserId()` + `ownsRecord()`
([lib/records/access.ts](../src/lib/records/access.ts), compartido con la ruta
de compartir registros). El borrado de cuenta arrastra las alertas por cascada
de FK.

## Analítica

Eventos: `alert_created` y `alert_fired` (ambos server-side, con `recordType` y
`kind`). Ver [ANALITICA.md](ANALITICA.md).

## Notificaciones: canales y preferencias

Además del DM del bot, cada alerta manda **push** si el usuario lo permite. El
filtrado vive en [src/lib/notifications/push.ts](../src/lib/notifications/push.ts),
compartido con el push del chat:

- `NotificationPrefs` (1-a-1 con `User`, el id ES el userId): `chatPush`,
  `alertsPush`, `quietStartHour`, `quietEndHour`. **La ausencia de fila = todo
  activado y sin franja**, así que los usuarios que ya existían no cambian de
  comportamiento.
- **Horario silencioso en hora LOCAL** del dispositivo: `Device.timezone`
  (IANA, la manda el móvil al registrar el token). Admite franjas que cruzan
  medianoche (23 → 8). `inQuietHours` y `localHourIn` son puras y están
  cubiertas por `src/lib/notifications/push.test.ts`.
- Silenciar **solo suprime el push**: el mensaje del bot se escribe igual, así
  que ningún aviso se pierde.
- El push de **chat nunca se limita por plan**; solo las alertas tienen cuota.
- UI: Cuenta → Notificaciones (`apps/mobile/app/notification-settings.tsx`).
  Cubre además el requisito de Apple/Google de poder desactivarlas desde la app.

API: `GET`/`PATCH /api/account/notifications`.

## Pendiente

1. Verificar en dispositivo si el binario Android instalado trae el módulo
   nativo de `expo-notifications` (si no, no hay push hasta el próximo build;
   el DM funciona igual). iOS sigue bloqueado por la cuenta de Apple.
2. Extender a inmuebles con umbral sobre el histórico de `PriceSnapshot`
   (hoy la referencia es el precio al crear la alerta).
3. Alertas de empleo por consulta guardada: investigado el 2026-07-26 — **no
   sobre Apify** ($3–4,50/mes por alerta), sí viable con Jina Reader.
