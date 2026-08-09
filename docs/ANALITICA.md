# Analítica de producto

Capa propia, sin SDK de terceros: el móvil encola eventos
([apps/mobile/lib/analytics.ts](../apps/mobile/lib/analytics.ts)) y los envía en
lotes a `POST /api/analytics`, que los persiste en la tabla `AnalyticsEvent`.
Los eventos de **conversión** (pagos/suscripción) los inserta el **servidor**
desde los webhooks — el cliente nunca es la fuente de verdad del dinero.

Privacidad: sin PII en `props` (nunca email/nombre/dirección); `userId` se
atribuye solo desde el token de sesión; al borrar la cuenta los eventos se
anonimizan (`userId → null`). Pre-login los eventos van con `deviceId` anónimo.

## Catálogo de eventos

| Evento | Cuándo se emite | Origen | Props permitidas |
| --- | --- | --- | --- |
| `session_start` | Arranque de la app con sesión resuelta | móvil | `authed` (bool) |
| `login_request` | Envío del email para pedir OTP | móvil | — |
| `login_verify_success` | OTP verificado, sesión creada | móvil | `new_user` (bool, si disponible) |
| `onboarding_complete` | Fin del onboarding | móvil | — |
| `record_import` | Import/alta de un registro | móvil | `type` (property/crypto/…), `kind` (url/query/isbn/manual) |
| `compare_open` | Apertura real del comparador de inmuebles desde la home (valida la hipótesis del loop iter1) | móvil | `selected_count` (number, 2-3) |
| `chat_card_open` | Apertura de un registro desde su tarjeta en el chat (valida la hipótesis del loop mensajería iter1: estado de la operación visible en la tarjeta) | móvil | `record_type` (property/crypto/…), `status_shown` (bool: la tarjeta mostraba etiqueta de estado) |
| `related_chat_open` | Apertura de una conversación desde "Qué se ha hablado" de la ficha de inmueble (valida el loop mensajería iter2: preview honesto del último mensaje) | móvil | `has_preview` (bool: la fila mostraba un último mensaje con texto) |
| `listing_import` | Import de un inmueble (URL/search) — **F0 scraping** | **servidor** | `portal`, `result` (created/updated/duplicate/error), `durationMs` |
| `listing_recheck` | Recheck de un anuncio (cron o botón manual) — **F0 scraping** | **servidor** | `listingId`, `portal`, `outcome` (ok/gone/blocked/error), `durationMs`, `priceChanged` |
| `listing_price_change` | Cambio de precio detectado (aplicado o rechazado por cordura) — **F0 scraping** | **servidor** | `portal`, `sanityRejected` (bool), `direction` (drop/up/flat), `pct`, `previousPrice`, `newPrice`/`attempted` |
| `price_change_push` | Push automático de cambio de precio o retirada al dueño + compartidos (sin alerta manual) — **F0 scraping** | **servidor** | `kind` (price/removed), `delivered`, `errors` |
| `bot_message` | Mensaje del usuario al bot @Nidokey (emitido al responder el bot) | **servidor** (`src/lib/chat/bot.ts`) | — |
| `paywall_view` | Pantalla Premium vista | móvil | `from` (account/bot_limit/…) |
| `checkout_start` | Alta Premium iniciada (URL de checkout emitida) | **servidor** | `provider` |
| `subscribe_success` | Webhook de activación recibido | **servidor** | `provider` |
| `subscribe_payment_failed` | Webhook de cobro fallido | **servidor** | `provider` |
| `subscribe_cancelled` | Webhook de cancelación | **servidor** | `provider` |
| `food_order_paid` | Webhook de pago de pedido OK | **servidor** | `amountCents`, `provider` |
| `alert_created` | Alerta de precio creada | **servidor** | `recordType`, `kind` |
| `alert_fired` | Alerta disparada (aviso enviado) | **servidor** | `recordType`, `kind` |
| `push_register_failed` | El móvil no pudo registrar token de push | móvil | `reason` (sin_modulo_nativo/permiso_denegado/fallo_en_token…), `platform`, `detail` |
| `account_deleted` | Cuenta eliminada | móvil | — |
| `error_critical` | Error irrecuperable mostrado al usuario | móvil | `where` (pantalla) |

Reglas para añadir eventos: nombre `snake_case` (`^[a-z0-9_.]{2,60}$`), props
solo escalares (string ≤120 / number / boolean), documentarlo AQUÍ en el mismo
PR que lo emite.

## Búsqueda de vuelos

El motor de vuelos ([docs/VUELOS-IA.md](VUELOS-IA.md)) se mide en **dos sitios
distintos**, y conviene no confundirlos.

### Ya instrumentado: `SearchDiagnostics`

Viaja dentro de la respuesta de cada búsqueda (`search.completed`) y **no se
persiste**: sirve para depurar una búsqueda concreta, no para agregar.

| Campo | Qué mide |
| --- | --- |
| `candidatesGenerated` / `AfterConstraints` / `Truncated` | cobertura de candidatos y cuánto se recortó |
| `candidatesVerified` | cuántos llegaron a la fase de pago |
| `providerCalls.duffel` | llamadas, errores, latencia p50 y máxima |
| `timeToFirstOfferMs` | latencia hasta el primer resultado en pantalla |
| `timeToBestOfferMs` | latencia hasta el mejor resultado |
| `expiredOffers` | ofertas caducadas al cerrar |
| `explorationSlots` + `seed` | huecos de exploración y semilla (hace reproducible la búsqueda) |
| `algoVersion` | versión del algoritmo que produjo el resultado |

### Pendiente (fase 5): eventos agregables

Nada de esto se emite todavía. Requiere la tabla `FlightObservation` y eventos
en `lib/analytics.ts`:

| Evento previsto | Props | Para qué |
| --- | --- | --- |
| `flight_search_start` | `ai` (bool), `hasReturn`, `travelers` | denominador del embudo |
| `flight_search_result` | `ai`, `offers`, `partial`, `degraded`, `msToFirst`, `msToBest`, `calls` | rendimiento y cobertura |
| `flight_saving_found` | `pct`, `absCents`, `structure` (round_trip/split/open_jaw), `movedDays` | **cuánto ahorra el motor de verdad** |
| `flight_book_click` | `structure`, `confidence`, `selfTransfer` | tasa de clic en reserva |
| `flight_offer_expired` | `secondsAlive` | tasa de ofertas caducadas |
| `flight_revalidated` | `changed` (bool), `deltaCents` | % de revalidaciones exitosas |

Sin PII, como el resto: ni ruta ni fechas concretas del viaje en las props — el
itinerario es un dato personal y para analizar basta con la forma (estructura,
días movidos, ahorro).

## Embudo

1. **Adquisición** → visitas landing (Vercel Analytics) + instalaciones (consolas de las tiendas)
2. **Registro** → `login_request` → `login_verify_success`
3. **Activación** → `onboarding_complete` → primer `record_import`
4. **Intención** → `paywall_view` → `checkout_start`
5. **Conversión** → `subscribe_success`
6. **Retención** → `session_start` recurrente (D1/D7/D30)

## Consultas (SQL sobre Neon)

```sql
-- Embudo de los últimos 30 días
SELECT name, COUNT(*) AS total, COUNT(DISTINCT COALESCE("userId", "deviceId")) AS uniques
FROM "AnalyticsEvent"
WHERE "createdAt" > now() - interval '30 days'
GROUP BY name ORDER BY total DESC;

-- Conversión registro→activación (por usuario, 30 días)
SELECT
  COUNT(DISTINCT CASE WHEN name = 'login_verify_success' THEN "userId" END) AS registros,
  COUNT(DISTINCT CASE WHEN name = 'onboarding_complete' THEN "userId" END) AS onboarding,
  COUNT(DISTINCT CASE WHEN name = 'record_import' THEN "userId" END) AS activados,
  COUNT(DISTINCT CASE WHEN name = 'subscribe_success' THEN "userId" END) AS premium
FROM "AnalyticsEvent" WHERE "createdAt" > now() - interval '30 days';

-- Retención D7 simple (usuarios con session_start 7+ días después del primero)
WITH first_seen AS (
  SELECT "userId", MIN("createdAt") AS d0 FROM "AnalyticsEvent"
  WHERE name = 'session_start' AND "userId" IS NOT NULL GROUP BY "userId"
)
SELECT COUNT(DISTINCT e."userId")::float / NULLIF(COUNT(DISTINCT f."userId"), 0) AS d7
FROM first_seen f
LEFT JOIN "AnalyticsEvent" e
  ON e."userId" = f."userId" AND e.name = 'session_start'
  AND e."createdAt" BETWEEN f.d0 + interval '7 days' AND f.d0 + interval '8 days';

-- Uso del comparador de inmuebles (30 días)
SELECT COUNT(*) AS aperturas,
  COUNT(DISTINCT COALESCE("userId", "deviceId")) AS usuarios_unicos,
  ROUND(AVG(("props" ->> 'selected_count')::numeric), 2) AS inmuebles_por_comparacion
FROM "AnalyticsEvent"
WHERE name = 'compare_open' AND "createdAt" > now() - interval '30 days';

-- Tarjetas de registro abiertas desde el chat (30 días): engagement y
-- prevalencia del estado de operación visible (loop mensajería iter1)
SELECT "props" ->> 'record_type' AS tipo,
  COUNT(*) AS aperturas,
  COUNT(DISTINCT COALESCE("userId", "deviceId")) AS usuarios_unicos,
  ROUND(100.0 * AVG(CASE WHEN ("props" ->> 'status_shown')::boolean THEN 1 ELSE 0 END), 1) AS pct_con_estado
FROM "AnalyticsEvent"
WHERE name = 'chat_card_open' AND "createdAt" > now() - interval '30 days'
GROUP BY 1 ORDER BY aperturas DESC;

-- "Qué se ha hablado" → chat (30 días): uso del puente ficha→conversación y
-- % de filas con preview real (loop mensajería iter2)
SELECT COUNT(*) AS aperturas,
  COUNT(DISTINCT COALESCE("userId", "deviceId")) AS usuarios_unicos,
  ROUND(100.0 * AVG(CASE WHEN ("props" ->> 'has_preview')::boolean THEN 1 ELSE 0 END), 1) AS pct_con_preview
FROM "AnalyticsEvent"
WHERE name = 'related_chat_open' AND "createdAt" > now() - interval '30 days';
```

## Métricas principales (definiciones)

- **Visitantes**: Vercel Analytics (landing).
- **Tasa de registro**: `login_verify_success` únicos / visitantes.
- **Tasa de activación**: usuarios con ≥1 `record_import` / registros.
- **Conversión a pago**: `subscribe_success` únicos / `paywall_view` únicos.
- **MRR**: suscripciones ACTIVE × 4,99 € (consultar tabla `Subscription`).
- **Churn**: `subscribe_cancelled` del mes / ACTIVE al inicio del mes.
- **Errores por sesión**: `error_critical` / `session_start`.

> Objetivos iniciales: NO hay datos históricos; cualquier cifra objetivo es una
> hipótesis a validar con las primeras semanas de datos reales.

## Métricas operativas del scraping de inmuebles (F0)

Eventos `listing_import`, `listing_recheck` y `listing_price_change` (ver
catálogo). Son métricas de **pipeline** (el recheck del cron no tiene un usuario
único → `userId` null). Query de referencia (Neon/Postgres):

```sql
-- 1. Tasa de éxito del recheck por portal (14 días). La base del diagnóstico.
SELECT "props" ->> 'portal' AS portal,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE "props" ->> 'outcome' = 'ok') AS ok,
       ROUND(100.0 * COUNT(*) FILTER (WHERE "props" ->> 'outcome' = 'ok') / NULLIF(COUNT(*), 0), 1) AS ok_pct,
       COUNT(*) FILTER (WHERE "props" ->> 'outcome' = 'blocked') AS blocked,
       COUNT(*) FILTER (WHERE "props" ->> 'outcome' = 'gone') AS gone,
       COUNT(*) FILTER (WHERE "props" ->> 'outcome' = 'error') AS errores
FROM "AnalyticsEvent"
WHERE name = 'listing_recheck' AND "createdAt" > now() - interval '14 days'
GROUP BY 1 ORDER BY total DESC;

-- 2. Resultado de imports por portal (14 días).
SELECT "props" ->> 'portal' AS portal, "props" ->> 'result' AS result, COUNT(*) AS n
FROM "AnalyticsEvent"
WHERE name = 'listing_import' AND "createdAt" > now() - interval '14 days'
GROUP BY 1, 2 ORDER BY 1, 3 DESC;

-- 3. Bloqueos por portal y día (tendencia: detecta endurecimiento del anti-bot).
SELECT "createdAt"::date AS day, "props" ->> 'portal' AS portal, COUNT(*) AS blocked
FROM "AnalyticsEvent"
WHERE name = 'listing_recheck' AND "props" ->> 'outcome' = 'blocked'
  AND "createdAt" > now() - interval '30 days'
GROUP BY 1, 2 ORDER BY 1;

-- 4. Cambios de precio: bajadas/subidas y rechazos por cordura (30 días).
SELECT "props" ->> 'portal' AS portal,
       COUNT(*) AS cambios,
       COUNT(*) FILTER (WHERE "props" ->> 'direction' = 'drop') AS bajadas,
       COUNT(*) FILTER (WHERE "props" ->> 'direction' = 'up') AS subidas,
       COUNT(*) FILTER (WHERE ("props" ->> 'sanityRejected')::boolean) AS rechazos_sanity
FROM "AnalyticsEvent"
WHERE name = 'listing_price_change' AND "createdAt" > now() - interval '30 days'
GROUP BY 1 ORDER BY 2 DESC;

-- 5. Frescura: antigüedad de la última comprobación por anuncio (hoy, no evento).
SELECT ROUND(AVG(EXTRACT(EPOCH FROM (now() - "lastCheckedAt")) / 3600), 1) AS horas_media,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (now() - "lastCheckedAt")) / 3600) AS horas_mediana,
       COUNT(*) FILTER (WHERE "lastCheckResult" NOT IN ('ok', 'gone')) AS comprobaciones_fallidas
FROM "Listing"
WHERE status IN ('ACTIVE', 'PRICE_DROP', 'PRICE_UP', 'UNKNOWN');

-- 6. Duplicados por URL (varios seguidores del mismo anuncio → N descargas).
SELECT url, COUNT(*) AS seguidores FROM "Listing"
GROUP BY url HAVING COUNT(*) > 1 ORDER BY 2 DESC LIMIT 20;

-- 7. Anuncios retirados detectados por día (outcome gone) y reapariciones.
SELECT "createdAt"::date AS day, COUNT(*) AS retirados
FROM "AnalyticsEvent"
WHERE name = 'listing_recheck' AND "props" ->> 'outcome' = 'gone'
  AND "createdAt" > now() - interval '30 days'
GROUP BY 1 ORDER BY 1;
```

**Interpretación y alertas**

- **Coste por anuncio**: hoy ~0 € (fetch plano + Nominatim/CartoCiudad gratuitos,
  sin proveedor de pago). Si se introduce proxy/proveedor, coste por 1000
  anuncios comprobados = gasto del mes / (`listing_recheck` `ok` del mes).
- **Umbral de alerta de salud**: si la tasa `ok` de un portal cae >10 p.p. por
  debajo de su baseline (promedio de las 2 primeras semanas de datos), revisar
  selectores/anti-bot de ese portal. Los `blocked` sin tendencia previa suelen
  anticipar un endurecimiento.
- **Frescura objetivo**: mediana < 26 h (el runner marca `staleAfterHours = 22`).
- **Cambios de precio**: ratio bajadas/subidas y el volumen de `rechazos_sanity`
  alertan de selectores de precio rotos (un selector que lee el banner de
  "anuncios similares" infla los rechazos).
