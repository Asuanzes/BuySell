# Estrategia de integración de datos externos — Nidokey (v2)

> **Entregable:** este documento. **Cero cambios de código.** La implementación se
> hará en iteraciones posteriores, por fases.
>
> **Cambios vs v1:** se descarta **Adzuna** (no es opción); se añaden **cripto** y
> **mercados de inversión** como dominios explícitos; el **panel contextual por
> categoría + simulador de hipoteca + borrar/reordenar** pasan de "diseño" a
> **YA IMPLEMENTADOS** (referencia).

## Contexto y estado actual

Nidokey tiene un **framework de ingesta unificado** (`SourceAdapter` →
`NormalizedRecord` → `upsertRecord` → tabla por tipo → `BaseRecord`) + capa de
refresh (`refreshType` + `/api/cron/refresh` por cron-job.org / GitHub Actions).

**Vivo hoy:** `property` (scraping HTTP + WebView/bookmarklet) y `crypto`
(CoinGecko, auto-refresh). **Implementado esta sesión y desplegado** (móvil):
borrar (✕) + reordenar (arrastre) por tipo con persistencia local; **panel
contextual por categoría** (`CategoryContextSheet`) con el submenú de Inmuebles
(Re-check, Registro, INE, **simulador de hipoteca** con cálculo francés
real); gráfico cripto rediseñado. **`RecordType`** =
`property | renting | holiday | crypto | market | job | workout | chat`.

**Restricciones:** auth (NextAuth web + JWT móvil) es **zona crítica** — no se
toca. **Adzuna descartado** (su API gratuita da datos pobres: a menudo sin
salario, categorías genéricas, redirecciones).

**Lecciones operativas:** el cron de cripto cada 2 min mantiene Neon (free tier)
despierto 24/7 → conviene **bajar la cadencia (15–30 min)**. El `build` ya hace
`prisma generate && next build` (deploys de schema deterministas en Vercel).

---

## 1. Necesidades de datos por dominio

Contrato común (toda tabla lo lleva): `ownerId, recordType, title, subtitle?,
status?, currentValue Int (céntimos), currency, imageUrl?, source, externalId?,
lastCheckedAt?, meta Json, createdAt, updatedAt` + tabla hija `*Snapshot`.

### 1.1 Inmuebles — `property` / `renting`
- **Mín.:** título, precio (venta o renta/mes), operación, tipo, ubicación
  (ciudad/barrio/dirección/lat-lng), m² constr./útiles, hab, baños, planta, año,
  eficiencia, fotos[], URL, portal, `externalId`.
- **Fuentes:** portales automatizables (Fotocasa, Pisos.com, Habitaclia,
  ThinkSpain, Indomio) → adapters propios (vivo) u **actor de Apify** del portal.
  Idealista/Milanuncios/Yaencontre (DataDome) → **manual-only WebView** (vivo).
  Enriquecimiento: **Nominatim** (vivo); **INE** zona (TODO). (Catastro OVC
  retirado el 2026-07-30: la resolución de RC con datos de portal no era fiable.)
- **API oficial vs scraping:** Idealista tiene API pero partner + cuota baja → no
  general. → adapters/Apify + WebView.

### 1.2 Viajes — `holiday`
- **Mín.:** título (hotel/ruta), precio, fechas, origen/destino, proveedor,
  rating, imagen, URL de reserva, `externalId`.
- **API oficial primero:** **Amadeus Self-Service** (vuelos + hoteles, free
  tier). Travelpayouts/Aviasales, Kiwi (Tequila). Booking/Airbnb/Trivago →
  ToS + anti-bot → **actor de Apify iniciado por usuario** / manual-only.

### 1.3 Trabajos — `job`  (sin Adzuna)
- **Mín.:** título, empresa, ubicación, salario (rango), tipo de contrato/jornada,
  modalidad, fecha, URL, `externalId`, estado de candidatura (campo de usuario).
- **Fuentes:**
  - **Apify** con **actores de Indeed / LinkedIn / InfoJobs / Glassdoor** → datos
    ricos (salario, descripción completa, empresa, logo). **Recomendado.**
  - **ScrapingBee** con parser propio de InfoJobs/Indeed (más control/mantenim.).
  - **InfoJobs** tiene programa de API (si aprueban) → opción oficial.
  - LinkedIn/Indeed: ToS + anti-bot fuerte → vía actor Apify (riesgo bajo para uso
    personal) o manual-only; nunca cron masivo server-side propio.

### 1.4 Cripto — `crypto`  (YA IMPLEMENTADO)
- **Mín.:** símbolo, nombre, precio, %24h, volumen, market cap, sparkline 7d.
- **Fuente:** **CoinGecko** (API pública sin clave) — **vivo** (buscar por símbolo,
  auto-refresh, tarjeta financiera).

### 1.5 Mercados de inversión — `market`
- **Mín.:** ticker, nombre, precio, % cambio, volumen, fundamentales básicos,
  sparkline.
- **API oficial:** **Finnhub** / **Twelve Data** / Alpha Vantage (free tier con
  cuota). **Sin scraping** (ToS de TradingView/Investing). **Casi calcado a
  cripto** (mismo `SourceAdapter`, batch de símbolos, cadencia en horario de
  mercado L–V).

### 1.6 Workout / nutrición deportiva — `workout`
- **Mín.:** producto, marca, categoría, precio, precio/100g o /dosis, stock,
  sabores, nutrición (proteína/kcal/ingredientes), imagen, URL, `externalId`.
- **Fuentes:** tiendas (HSN/Prozis/MyProtein) sin API → **scraping propio** del
  PDP (`JSON-LD offers.price`) vía **ScrapingBee** o adapter HTTP. **Open Food
  Facts** (API gratis) para nutrición. Amazon PA-API solo si afiliado. **Bajo
  riesgo anti-bot.**

### 1.7 Tendencias geolocalizadas de X — `trend` (nuevo tipo)
- **Mín.:** `name` (trending), región/WOEID, volumen, categoría mapeada, URL,
  `observedAt`, noticias[].
- **Fuentes:** **X API v2** (de pago) o **actor de Apify** de tendencias.
  Noticias: NewsAPI/GDELT. Clasificación: keywords + LLM (`ANTHROPIC_API_KEY` ya
  scaffolded).

### Resumen API-first por dominio
| Dominio | 1ª opción | Fallback | Anti-bot |
|---|---|---|---|
| Inmuebles | Adapters propios / WebView (Idealista) | Apify actor del portal | Alto |
| Viajes | **Amadeus** | Apify (Booking) / Travelpayouts | Alto |
| Trabajos | **Apify** (Indeed/InfoJobs/LinkedIn) | ScrapingBee · InfoJobs API | Muy alto |
| **Cripto** | **CoinGecko** (vivo) | — | Bajo |
| **Mercados** | **Finnhub / Twelve Data** | Alpha Vantage | Bajo |
| Workout | Scraping propio (JSON-LD) + Open Food Facts | ScrapingBee | Bajo |
| Tendencias X | X API v2 | Apify (X trends) | Medio/legal |

---

## 2. Comparativa de proveedores (Apify · ScrapingBee · Bright Data · Octoparse)

> Precios **aproximados** (verificar al contratar). **Adzuna queda fuera.**

### 2.1 Apify
- **Modelo:** plataforma de "actores" (scrapers listos en su Store) + cómputo por
  uso. Free tier ~5 $/mes; planes desde ~49 $/mes; algunos actores cobran por
  resultado. **API HTTP + datasets + webhooks + scheduling.**
- **Ventajas:** actores mantenidos para **Indeed, LinkedIn, InfoJobs, Booking,
  Idealista, Amazon, X** → time-to-market bajo; gestiona proxies/navegador;
  webhooks encajan con la ingesta por push.
- **Desventajas:** coste por volumen; dependes del mantenimiento del actor; salida
  heterogénea (hay que normalizar).
- **Encaje:** **mejor para trabajos y viajes** (actores ricos), y portales
  inmobiliarios con actor.

### 2.2 ScrapingBee
- **Modelo:** API de scraping (render JS + proxies). Pago por crédito (~49 $/mes);
  JS consume más. **No trae scrapers hechos** — tú el parser.
- **Ventajas:** barato y simple para catálogos de dificultad media; control total
  (encaja directo con un `SourceAdapter`).
- **Desventajas:** mantienes el parser; anti-bot duro (DataDome) no siempre cae.
- **Encaje:** **mejor para workout** (HSN/Prozis JSON-LD) y scrapers propios.

### 2.3 Bright Data
- **Modelo:** enterprise (Web Unlocker, Scraping Browser, proxies residenciales,
  **datasets pre-hechos** incl. empleo). Pago por uso/GB; el más caro.
- **Encaje:** **solo si** ScrapingBee/Apify fallan contra objetivo difícil a
  escala. Diferido.

### 2.4 Octoparse
- **Modelo:** no-code visual; ~75–209 $/mes; API para descargar tareas.
- **Encaje:** **prototipado rápido** de fuentes secundarias; acoplado a la
  herramienta. No para el núcleo.

### 2.5 Recomendación priorizada
| Necesidad | Usar primero | Por qué |
|---|---|---|
| API oficial disponible | **La API** (CoinGecko, Finnhub, Amadeus, Open Food Facts, INE) | Legal, estable, gratis/barato |
| Fuente con actor maduro / push | **Apify** | Time-to-market + webhooks (trabajos, viajes) |
| Scraper propio (protección media) | **ScrapingBee** | Barato, control (workout, portales) |
| Anti-bot duro a escala | **Bright Data** (diferido) | Proxies residenciales |
| Prototipo no-code | **Octoparse** (puntual) | Iteración sin código |

**Regla de oro:** API oficial → ScrapingBee/Apify → Bright Data (último recurso).

---

## 3. Arquitectura de integración

Reutiliza lo existente (`src/features/sources/types.ts`, `registry.ts`,
`upsert.ts`, `refresh.ts`, `ImportLog`, `getUserId`/`isCronAuthorized`).

### 3.1 Capa de proveedores (nueva, fina)
`src/features/sources/providers/{apify,scrapingbee,brightdata,octoparse}.ts`:
clientes HTTP delgados (auth con su key de env, run/poll/fetch dataset). Los
**adapters** los consumen.
```
SourceInput → Adapter (usa Provider) → NormalizedRecord
            → upsertRecord(ownerId, n) → tabla por tipo + *Snapshot
            → BaseRecord (mapper) → UI
```

### 3.2 DTO universal + tablas por categoría
`NormalizedRecord` (existe) lo producen todos. Tablas nuevas siguiendo el patrón
`CryptoHolding`/`*Snapshot` (aditivo): `JobListing`, `MarketInstrument`,
`WorkoutProduct`, `TravelOffer`, `RentingListing`, `TrendTopic`. `upsertRecord`
gana un `case` por tipo; `mapper.ts` un `*ToBaseRecord`.

### 3.3 Tres modos de ingesta
1. **Síncrono (usuario):** `POST /api/records/import` (auth `getUserId`). Para
   buscadores (empleo/viajes), el patrón es **buscar → elegir → registrar el
   candidato** (`input.kind:"record"`).
2. **Batch programado:** `refreshType(type)` por cron-job.org (`CRON_SECRET`, ≤60s
   Vercel) o `tsx scripts/refresh-type.ts` (GitHub Actions, sin límite, scraping
   pesado / Apify).
3. **Webhook (push):** `POST /api/ingest/webhook/[provider]` (Apify "run
   finished") con **`PROVIDER_SECRET`** dedicado (patrón de `isCronAuthorized`,
   **sin tocar `/api/auth`**). Lee el dataset → `upsertRecord` en bulk.

### 3.4 Cadencia / cuotas / retrasos
Throttle y **batch** por proveedor. Cadencia: cripto/mercados 1–15 min (bajar
desde 2 min por Neon); viajes/empleo horario o diario; inmuebles diario; workout
semanal; X trends 15–30 min. No es tiempo real → UI muestra `lastCheckedAt`.

### 3.5 Monitorización / errores
`FetchOutcome` (`ok|gone|blocked|error`) → cada etapa a **`ImportLog`**. Alertas
por **Resend** ante N fallos seguidos de un `source`. Métrica: tasa de
`blocked`/`error` por `source`.

### 3.6 Infra (gratis)
Vercel Hobby (≤60s) para APIs batch (cripto, mercados, Amadeus, Apify dataset
fetch). **GitHub Actions** (gratis, sin límite) para Playwright/scraping pesado.
Worker desacoplado (Railway/Fly) + cola `pg-boss` **diferido**.

### 3.7 Env nuevas (Vercel / `.env.local`, nunca commit)
`APIFY_TOKEN`, `SCRAPINGBEE_API_KEY`, `BRIGHTDATA_*`, `FINNHUB_API_KEY`,
`TWELVEDATA_API_KEY`, `AMADEUS_CLIENT_ID`/`_SECRET`, `X_BEARER_TOKEN`,
`NEWSAPI_KEY`, `PROVIDER_SECRET`.

---

## 4. Tendencias geolocalizadas de X — pipeline

- **`TrendTopic`** (tabla): `ownerId?` (puede ser global), `region`/`woeid`,
  `name`, `volume`, `category` (mapeada), `url`, `observedAt`, `meta`
  (sample/sentimiento/noticias[]) + `TrendSnapshot`.
- **Pipeline (cron 15–30 min):** obtener por región (X API v2 / actor Apify) →
  **clasificar** a categorías (cripto, e-sports/gaming, deportes, geopolítica,
  política nacional…) con keywords + LLM → enriquecer con noticias (NewsAPI/GDELT)
  → persistir → exponer (`/api/records?type=trend`) + **enriquecimiento cruzado**
  (trend cripto → tarjeta de esa cripto).
- **Legal:** ToS de X → preferir API oficial de pago; scraping solo vía actor de
  terceros y con moderación.

---

## 5. Seguridad y legalidad
- **Preferir APIs oficiales** (CoinGecko, Finnhub, Amadeus, Open Food Facts,
  INE).
- **ToS / robots.txt:** respetar; no scrapear donde el ToS lo prohíba (LinkedIn,
  Booking, Airbnb) salvo **importación iniciada por el usuario** (WebView).
- **Anti-bot:** DataDome/PerimeterX → manual-only/WebView o proxies de proveedor;
  nunca cron masivo server-side propio contra esos objetivos.
- **Riesgos/mitigación:** bloqueo de IP → proxies del proveedor + throttle;
  cambios de HTML → adapters aislados + `FetchOutcome` + monitor por `source`.
- **GDPR:** datos mínimos, `ownerId` scoping; borrado en cascada (vivo).
- **Secretos:** en env; webhooks con `PROVIDER_SECRET`; **no tocar `/api/auth`**.

---

## 6. Roadmap por fases
### Fase 1 — Modelos + pilotos
- Tablas + mappers + `upsertRecord`/`refreshType` para **`job`**, **`market`**,
  **`workout`**.
- **Trabajos → Apify** (actor Indeed/InfoJobs): patrón buscar→elegir→registrar.
- **Mercados → Finnhub/Twelve Data** (calcado a cripto, ya probado el patrón).
- **Workout → ScrapingBee** (HSN/Prozis JSON-LD) + Open Food Facts.
- (Inmuebles y cripto ya están; opcional: actor Apify de un portal inmobiliario.)
### Fase 2 — Ampliar + tendencias
- **Viajes → Amadeus**; **renting** (reusa scraping property). Pipeline **X
  trends** + categorías (gaming/e-sports, cripto, deportes, geopolítica, política).
### Fase 3 — Operación
- Webhooks de Apify (`/api/ingest/webhook/apify`); worker desacoplado para
  Playwright/Apify pesado; monitor/alertas; caché. Bajar cadencia del cron cripto.

---

## 7. Menús laterales contextuales por categoría — YA IMPLEMENTADO + extensión

### 7.1 Estado: IMPLEMENTADO esta sesión (referencia)
- **`apps/mobile/components/CategoryContextSheet.tsx`** — bottom sheet genérico
  (RN `Modal`, sin deps nuevas), **presentación pura**; el dispatch por `id`/`kind`
  lo hace la pantalla.
- **`apps/mobile/lib/records/tools.ts`** — registry **config-driven** `ToolDef[]`
  por tipo: `{ id, label, icon, kind: "action"|"route"|"info"|"share", enabled,
  hint? }`. **Añadir categoría/herramienta = añadir aquí.**
- **Detalle de inmueble** (`app/property/[id].tsx`): **botón circular de marca en
  la esquina inferior derecha de la tarjeta de precio** → abre el sheet
  "Herramientas del inmueble" con:
  - **Actualizar precio** (`action`): re-check real de los anuncios.
  - **Registro / Estadísticas de zona (INE)** (`route`): pantallas
    **diseñadas** con su estructura y banner "pendiente de integración"
    (`app/tools/[tool].tsx`) — hooks/TODOs para Registro, INE.
  - **Simulador de hipoteca** (`route` → `app/tools/mortgage.tsx`): form (precio,
    entrada %, plazo, interés) + **cálculo francés real** (cuota, intereses,
    total) + nota "proceso completo con partner: próximamente".
  - **Compartir** (`share`).
- **Apertura/cierre:** icono dedicado → bottom sheet (swipe-down/backdrop). **No
  rompe** el scroll del detalle ni la navegación por tabs. (Paridad web: `Card`
  "Herramientas" en el `aside` de `properties/[id]` — TODO.)

### 7.2 Extensión a otras categorías (sin reescribir)
Añadir una categoría = añadir su `tools[]` en `tools.ts` (+ alguna pantalla de
herramienta). Cuando `crypto`/`job`/etc. tengan pantalla de detalle, **el mismo
`CategoryContextSheet` + su `tools[]` ya funcionan** (crypto ya tiene tools stub).

### 7.3 Submenús sugeridos por categoría (información / acción / compartir)
| Categoría | Herramientas |
|---|---|
| **property** | Re-check, Registro, INE zona, Simulador hipoteca, Comparar, Abrir portal, Compartir |
| **renting** | Re-check, INE alquiler, Calc. rentabilidad/yield, Checklist contrato, Abrir portal, Compartir |
| **holiday** | Re-check precio, Alertas de precio, Comparar fechas, Mapa/zona, Abrir reserva, Compartir |
| **crypto** | Gráfico avanzado, Alertas de precio, Conversor, Noticias (X trend), Añadir/editar cantidad, Compartir |
| **market** | Gráfico, Alertas, Fundamentales/dividendos, Noticias, Compartir |
| **job** | Estado candidatura (acción), Info empresa, Benchmark salarial, Preparar entrevista, Abrir oferta, Compartir |
| **workout** | Precio histórico, Alertas de precio, Info nutricional (Open Food Facts), Comparar alternativas, Lista de compra, Compartir |
| **trend** | Noticias relacionadas, Sentimiento, Evolución del volumen, Seguir/fijar, Compartir |

### 7.4 Borrado y reordenado — IMPLEMENTADO, persiste por categoría
- **Borrado:** `deleteRecord(record)` enruta por tipo (property → `/api/properties`;
  resto → `/api/records/:id?type=`). **Reordenado:** orden **local** en SecureStore
  (`nidokey.order.<tipo>`, `lib/local-order.ts`) aplicado en la lista. **Agnóstico
  del tipo** → al habilitar categorías nuevas, **cero trabajo extra**.
- **Mejora futura (opcional):** sincronizar el orden entre dispositivos/web con una
  columna `position` o tabla `UserPreference` (hoy es preferencia local por diseño).

---

## 8. Mapa de archivos (implementación futura — no se toca ahora)
- **Fuentes:** `src/features/sources/providers/*.ts`,
  `src/features/sources/adapters/{apify-jobs,finnhub,hsn,amadeus,...}.ts`; registrar
  en `registry.ts`.
- **Persistencia:** `prisma/schema.prisma` (+ modelos por tipo + `*Snapshot`);
  `upsert.ts` (+`case`); `mapper.ts` (+`*ToBaseRecord`); `refresh.ts`.
- **Endpoints:** `src/app/api/records/search/route.ts` (buscadores) ·
  `src/app/api/ingest/webhook/[provider]/route.ts` (`PROVIDER_SECRET`) · reusar
  `/api/records/import`, `/api/cron/refresh`.
- **UI:** ampliar `apps/mobile/lib/records/tools.ts` (tools[] por categoría) +
  pantallas en `app/tools/`; habilitar tipos en `lib/records/config.ts`. Web:
  `Card` "Herramientas" en `properties/[id]`.
- **Infra:** `.github/workflows/refresh.yml`; `.env.example` (+ keys).

## 9. Verificación (cuando se implemente, por fase)
1. **Mercados (Finnhub):** añadir un ticker → tarjeta tipo cripto con precio real.
2. **Trabajos (Apify):** buscar → elegir → registrar → aparece en Empleos con
   empresa/ubicación/salario.
3. **Workout (ScrapingBee):** importar URL de producto → precio + nutrición.
4. **Panel contextual:** (ya validado en inmuebles) replicar en una categoría
   nueva añadiendo su `tools[]` sin tocar UI.
5. **Borrado/orden:** en cualquier categoría nueva, ✕ borra y arrastrar reordena;
   el orden persiste tras recargar.
6. **No regresión:** `/api/auth/*`, login web/móvil, inmuebles y cripto intactos.
