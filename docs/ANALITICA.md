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
| `bot_message_sent` | Mensaje del usuario al bot @Nidokey | móvil | — |
| `paywall_view` | Pantalla Premium vista | móvil | `from` (account/bot_limit/…) |
| `checkout_start` | Alta Premium iniciada (URL de checkout emitida) | **servidor** | `provider` |
| `subscribe_success` | Webhook de activación recibido | **servidor** | `provider` |
| `subscribe_payment_failed` | Webhook de cobro fallido | **servidor** | `provider` |
| `subscribe_cancelled` | Webhook de cancelación | **servidor** | `provider` |
| `food_order_paid` | Webhook de pago de pedido OK | **servidor** | `amountCents`, `provider` |
| `alert_created` | Alerta de precio creada | **servidor** | `recordType`, `kind` |
| `alert_fired` | Alerta disparada (aviso enviado) | **servidor** | `recordType`, `kind` |
| `account_deleted` | Cuenta eliminada | móvil | — |
| `error_critical` | Error irrecuperable mostrado al usuario | móvil | `where` (pantalla) |

Reglas para añadir eventos: nombre `snake_case` (`^[a-z0-9_.]{2,60}$`), props
solo escalares (string ≤120 / number / boolean), documentarlo AQUÍ en el mismo
PR que lo emite.

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
