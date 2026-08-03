# Buscador de inmuebles en alquiler — propuesta técnica

> Estado: **propuesta**, pendiente de aprobación. Fecha: 2026-08-02.
> Autor: Claude Code. Revisión adversarial en paralelo: Codex (`nidokey-graph`).
> Documento normativo superior: `docs/MODELO-NEGOCIO.md`.

Objetivo: buscar inmuebles **en alquiler** por provincia, municipio,
barrio/zona, tipo, rango de precio, habitaciones, baños, superficie y el resto
de atributos que ya soporta el modelo, con ordenación, paginación y refresco.

La conclusión corta, para no enterrarla: **el modelo de datos ya soporta casi
todos los filtros pedidos; lo que falta es el motor de consulta, una capa geo
canónica y — el problema de verdad — un corpus de anuncios que sea legal.** No
existe en España ninguna fuente abierta, gratuita y con cobertura nacional de
*anuncios* de alquiler. Sí existen fuentes oficiales excelentes de *geografía* y
de *precio de referencia*. La propuesta separa esos tres problemas y sólo
implementa ahora el que es seguro y reversible.

---

## 1. Inventario: qué existe hoy en el repositorio

### 1.1 Modelo de datos — ya cubre el 90 % de los filtros pedidos

`prisma/schema.prisma:211-298` (`Property`):

| Filtro pedido | Columna existente | ¿Listo? |
| --- | --- | --- |
| Provincia | `province String` (NOT NULL) | sí, pero sucia (§1.5) |
| Municipio/ciudad | `city String` (NOT NULL) | sí, pero sucia (§1.5) |
| Barrio/distrito/zona | `neighborhood String?` | texto libre, sin normalizar |
| Tipo de inmueble | `type PropertyType` (10 valores) | sí |
| Precio min/max | `monthlyRent Int?` (céntimos) | sí, **sin índice** |
| Habitaciones | `rooms Int?` | sí |
| Baños | `bathrooms Int?` | sí |
| Superficie | `builtArea` / `usableArea` / `plotArea` | sí |
| Extras | `hasElevator/Garage/Terrace/Garden/Pool/Storage/Fireplace`, `energyRating`, `yearBuilt`, `floor` | sí |
| Alquiler específico | `deposit`, `minStayMonths`, `maxStayMonths`, `availableFrom`, `utilitiesIncluded`, `furnished`, `petsAllowed`, `contractType` | sí, sin explotar |
| Coordenadas | `latitude`/`longitude Float?` | sí, sin índice ni consulta geo |

Alrededor:

- `Listing` (`schema.prisma:316`) — `portal`, `url` único, `status`,
  `lastSeenAt`, `lastCheckedAt`, `lastCheckResult`. **Es la capa de frescura y
  de baja del anuncio**: ya distingue "no pude comprobarlo" de "ya no existe".
- `PriceSnapshot` (`:342`) — histórico de precio por anuncio y por ficha.
- `SavedSearch` (`:399`) — `portal`, `url`, `filters Json`, `active`,
  `lastRunAt`. **Existe en el esquema y no la escribe ni la lee nadie**: sólo
  aparece en `prisma/schema.prisma` y en el borrado RGPD
  (`src/app/api/account/route.ts`). Es exactamente el hueco de "guardar esta
  búsqueda y avísame".
- Índices actuales: `[city, province]`, `[type, status]`, `[currentPrice]`,
  `[city, builtArea]`, `[operationType, status]`, `[recordType]`.
  **No hay índice por `monthlyRent`** ni por la combinación que usaría este
  buscador.

### 1.2 Búsqueda y filtrado actuales — insuficientes a propósito

- `src/lib/filters.ts` — 11 filtros, **todos de venta**: el rango de precio va
  contra `currentPrice`, que en alquiler es `null`. No hay superficie, ni
  baños, ni operación, ni orden, ni paginación.
- `src/app/api/properties/route.ts:11-20` — `take: 100` fijo,
  `orderBy: updatedAt desc`, siempre `ownerId` (aislamiento correcto).
- `src/app/api/search/route.ts` — búsqueda global por texto entre registros.
- Móvil: `apps/mobile/lib/data/records-repository.ts:21` sólo manda `?q=`. La
  pestaña Buscar (`app/(tabs)/search.tsx`) es texto libre sobre mis registros.
  **No existe ninguna UI de filtros.**

### 1.3 Alta de anuncios (importación) y postura legal actual

- Flujo real: el usuario pega una URL y **la extracción ocurre en un WebView de
  su dispositivo**, con su sesión; el móvil postea el resultado a
  `/api/listings/import`.
- Servidor: `/api/listings/scrape-url` + adaptadores por portal (Fotocasa,
  Pisos.com, Habitaclia, Milanuncios, Yaencontre, ThinkSpain, Indomio) — una
  URL, a petición explícita del usuario.
- **Idealista es `manualOnly`** por DataDome
  (`src/features/scraping/adapters/idealista.ts:8-16`), y el cliente HTTP ya
  detecta anti-bot (`src/features/scraping/http.ts:43`).

Esto importa mucho para el diseño: la postura vigente del proyecto es
*"extracción puntual, iniciada por el usuario, de una URL que él ya está
viendo"*. Un buscador que rastree listados masivamente **rompe esa postura**.

### 1.4 Geolocalización

- `src/lib/geocode.ts` — Nominatim, sin clave, `place_rank ≥ 26` y rechazo de
  `class=boundary` (una cicatriz de 2026-07-30: 14 fichas acabaron con el
  centroide de Castilla-La Mancha). Sin polígonos, sin jerarquía, sin barrios.
  ⚠️ El throttle vive en memoria de módulo → en Vercel **cada lambda tiene su
  propio contador**, así que la política de 1 req/s no está realmente garantizada.
- `src/features/sources/jobs/province.ts` — 52 provincias canónicas,
  normalización sin acentos y tabla de alias ciudad→provincia (`bilbao` →
  `Vizcaya`, `donostia` → `Guipúzcoa`…). **Reutilizable tal cual**; hoy vive en
  el vertical de empleo con nombre de InfoJobs.

### 1.5 La geo del corpus actual está sucia

`src/lib/import-listing.ts:633-636`:

```ts
city: payload.city ?? "Desconocida",
province: payload.province ?? "",
```

Es decir: toda ficha importada sin ubicación tiene `province === ""` y
`city === "Desconocida"`. Cualquier filtro por provincia hoy produce **falsos
negativos silenciosos**. Normalizar el corpus es requisito, no adorno.

### 1.6 Actualización de precios y alertas — ya resueltas

- `/api/cron/listings-check` + `src/features/scraping/recheck-plan.ts`, con la
  decisión documentada "último cambio observado gana" por columna de operación.
- Alertas de precio en producción (`docs/ALERTAS.md`): 3 gratis / 25 Premium.
- `src/lib/rate-limit.ts` — ventana fija en BBDD, serverless-safe.

### 1.7 El patrón de buscador que ya funciona (y que hay que reutilizar)

Empleo, mercados y libros comparten un patrón probado:

```text
adapter.search(query, opts) → SearchHit[] (con NormalizedRecord embebido)
   ↓  /api/records/search?type=…&location=…
móvil pinta candidatos → al elegir, importa SIN volver a consultar la fuente
```

`src/features/sources/types.ts:55-81`, `src/features/sources/jobs/adapter.ts`,
`src/app/api/records/search/route.ts`. **Cualquier fuente externa de alquiler
debe entrar por aquí**, no como un silo nuevo (filtro §9.3 de
`docs/MODELO-NEGOCIO.md`).

---

## 2. Fuentes de datos candidatas

### 2.1 Anuncios (el problema difícil)

| Fuente | Qué da | Coste | Licencia / permiso | Cobertura | Riesgo |
| --- | --- | --- | --- | --- | --- |
| **Corpus propio de Nidokey** (lo que los usuarios ya importan) | Anuncios reales con precio, geo y foto | 0 € | Datos ya en nuestra BBDD | Baja al principio, crece con el uso | **Bajo** si se guarda lo mínimo y se enlaza a la fuente |
| **API de idealista** | Búsqueda real de venta y alquiler | Nivel dev gratuito (se cita ~100 llamadas/mes); comercial, a negociar | Requiere aprobación explícita; condiciones **no publicadas** en su web | Alta | Aprobación improbable para un producto que compite; sin acuerdo, cero |
| **Feeds XML de agencias** (formato tipo Kyero y equivalentes) | Cartera completa de la agencia | 0 € técnico | La agencia decide publicarnos su feed | Nula hasta firmar acuerdos | **Muy bajo** legalmente; alto coste comercial |
| **Bolsas públicas de alquiler** (CCAA y ayuntamientos, vivienda protegida/joven) | Ofertas oficiales | 0 € | Open data / reutilización | Muy baja pero real | **Muy bajo**; además es diferencial |
| **Scraping de listados de portales** | Todo | 0 € directo, alto operativo | ❌ Prohibido por sus condiciones; derecho *sui generis* de base de datos (art. 133 LPI) | Alta | **Alto**: legal, DataDome/Cloudflare, mantenimiento y bloqueos. Ya comprobado que Jina se bloquea en portales (jul-2026) |
| Scrapers de terceros (Apify/Bright Data sobre idealista) | Todo | De pago por uso | Traslada el riesgo pero **no lo elimina** | Alta | Alto: coste variable + mismo problema jurídico |

**Recomendación**: MVP sobre corpus propio; idealista API y feeds de agencia
como vías *autorizadas* a explorar con decisión del propietario; scraping de
listados **descartado** — el `robots.txt` de idealista permite `/alquiler-viviendas/`
pero prohíbe las URLs de búsqueda filtradas y ordenadas, sus condiciones de uso
prohíben la extracción automatizada, y DataDome lo bloquea de facto. Permitir el
robots ≠ permitir el uso.

### 2.2 Geografía (aquí sí hay abundancia oficial y gratuita)

| Fuente | Qué da | Coste | Licencia | Uso propuesto |
| --- | --- | --- | --- | --- |
| **INE** — relación de municipios y códigos por provincia | 52 provincias + ~8.100 municipios con código INE, actualizado a 1-ene-2026 | 0 € | Reutilización con atribución | **Tabla canónica** provincia↔municipio. Embebible en el repo (CSV→JSON, ~200 KB) |
| **CartoCiudad / IGN** — `geocoder/api/geocoder/candidates` y `/find` | Geocodificación oficial española con `provincia_filter`, `municipio_filter`, `poblacion_filter`; devuelve `muniCode`, `provinceCode`, `postalCode`, `lat/lng` | 0 €, sin clave | Servicio público (código EUPL-1.2; datos IGN con atribución) | **Geocodificador primario** para España y resolutor de municipio → código INE |
| **Nominatim (OSM)** | Geocodificación mundial | 0 € | ODbL + política de uso: 1 req/s, **autocompletado prohibido** | Respaldo, nunca en el camino caliente ni en autocompletado |
| **Overpass / OSM `admin_level` 9 y 10** | Distritos y barrios como polígonos | 0 € | **ODbL** (atribución + *share-alike* si publicamos una BD derivada) | Única fuente pan-nacional de barrios; calidad desigual (Madrid/Barcelona bien, resto pobre) |
| **Open data municipal** (Madrid: 131 barrios; Barcelona; Valencia…) | Polígonos y códigos oficiales de barrio/distrito | 0 € | Licencias abiertas por ayuntamiento | Mejor calidad; ciudad a ciudad, empezando por las de más demanda |
| **MITMA — Sistema Estatal de Referencia del Precio del Alquiler** | €/m²·mes y €/mes por ámbito territorial: mediana, P25 y P75 | 0 € | Descarga libre con atribución | **No son anuncios, pero es oro**: permite decir *"este piso está un 18 % por encima de la referencia de su zona"* |
| Catastro (INSPIRE) | Referencia catastral, superficie, año | 0 € | Reutilización | ❌ **Retirado por decisión de producto** (commit `89f70a2`). No reintroducir sin decisión explícita |

**No existe** un dataset oficial español de barrios con cobertura nacional: el
IGN llega a municipio. Los barrios son municipales o de OSM. Cualquier diseño
que exija "barrio oficial en toda España" es irrealizable — de ahí la
degradación por niveles del §4.2.

---

## 3. Arquitectura recomendada para un MVP legal y útil

Principio rector: **no construimos un portal inmobiliario; construimos el
buscador sobre lo que el usuario y su círculo ya siguen, con una capa geo
canónica y una referencia oficial de precio.** Eso encaja con la tesis de
`docs/MODELO-NEGOCIO.md` (seguir, comparar y completar una decisión) y evita el
único punto que puede meternos en un problema serio.

```text
┌─ Capa 1 · GEO CANÓNICA (offline, sin red en caliente) ──────────────┐
│ provincia (52, ya existe la lista) → municipio (INE) → zona/barrio  │
│ normalización sin acentos + alias; polígonos sólo donde hay open    │
│ data municipal. CartoCiudad resuelve lo que el texto no resuelva.   │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─ Capa 2 · MOTOR DE CONSULTA (Postgres/Neon, sin PostGIS) ───────────┐
│ filtros completos + orden + paginación por cursor sobre Property/   │
│ Listing. Geo por bounding box + haversine cuando haya coordenadas.  │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─ Capa 3 · HONESTIDAD DE COBERTURA ──────────────────────────────────┐
│ cada resultado dice portal y "visto por última vez"; si el filtro   │
│ devuelve poco: deep link a la búsqueda equivalente en los portales  │
│ (construido, no scrapeado) + "guardar búsqueda y avisarme".         │
└──────────────────────────────────────────────────────────────────────┘
```

Lo que **no** hay en el MVP, y por qué:

- **Corpus público compartido entre usuarios** — hoy `Property` es privada
  (`ownerId`). Exponerla revelaría qué sigue cada usuario y, agregada, se
  acercaría a "parte sustancial" de la base de datos de un portal. Requiere
  decisión de producto + revisión legal (§6).
- **Scraping de listados** — §2.1.
- **PostGIS, Elasticsearch/Meilisearch, Mapbox** — el volumen no lo justifica
  ni de lejos; Postgres con los índices correctos sobra durante mucho tiempo.
- **Mapa** — la lista con filtros buenos aporta más que un mapa vacío.

---

## 4. Modelo de datos y flujo de búsqueda

### 4.1 Cambios de esquema (ninguno en la Fase 1)

La Fase 1 funciona **sin tocar `schema.prisma`**. Después, y sólo con
`prisma db push` (nunca `migrate`, ver CLAUDE.md §4):

```prisma
// Fase 3 — geo exacta en vez de LIKE sobre texto libre
municipalityCode String? @db.VarChar(5)   // código INE
zoneSlug         String?                  // barrio normalizado

@@index([operationType, province, city, monthlyRent])
@@index([operationType, status, updatedAt])
@@index([monthlyRent])

// Fase 4 — resucitar SavedSearch
ownerId  String?   // ya existe, hoy sin uso
filters  Json      // el mismo objeto que produce parseRentalFilters
```

### 4.2 Resolución provincia → municipio → barrio

Tres niveles con degradación explícita (nunca un fallo silencioso):

1. **Provincia** — 52 valores canónicos, resueltos por normalización + alias
   (reutilizando `src/features/sources/jobs/province.ts`). Exacto siempre.
2. **Municipio** — texto normalizado contra la tabla INE. Si el usuario escribe
   algo que no está, se busca por provincia y se avisa ("no reconozco *X*;
   buscando en toda la provincia"), como ya hace empleo.
3. **Barrio/zona** — `neighborhood` normalizado, coincidencia por prefijo. Si
   la ciudad tiene polígonos (Madrid, Barcelona…) y la ficha tiene
   coordenadas, se puede resolver el barrio real; si no, es texto. Los barrios
   "no oficiales" del lenguaje de la calle se tratan como **alias**, no como
   entidades.

Anuncios con ubicación aproximada (la mayoría de portales ofusca el portal
exacto): se marcan como aproximados y **no se filtran por radio fino**; entran
por municipio/zona. Mejor excluir un filtro que mentir con precisión falsa —
la misma lección de `geocode.ts:88-94`.

### 4.3 Flujo de búsqueda

```text
UI de filtros → querystring
   → parseRentalFilters()  (Zod, con clamps: límites de precio, área, take)
   → buildRentalWhere()    (Prisma.PropertyWhereInput)
   → orderBy + cursor
   → resultados: { id, título, monthlyRent, zona, m², hab, baños,
                   portal, lastSeenAt, aproximado? }
   → acciones: abrir en el portal · guardar búsqueda · crear alerta
```

Ordenaciones: precio asc/desc, más recientes, €/m², superficie. Paginación por
cursor `(orden, id)` — el offset con orden por precio duplica y salta filas
cuando el corpus cambia entre páginas.

### 4.4 Actualización, bajas y deduplicación

Todo esto **ya existe** y se reutiliza, no se reinventa:

- Frecuencia: recheck diario por cron (`/api/cron/listings-check`), priorizando
  anuncios vistos hace más tiempo y los que tienen alerta activa.
- Cambio de precio: `PriceSnapshot` + `recheck-plan.ts` (último cambio
  observado gana, por columna de operación).
- Baja: `lastCheckResult` distingue `gone` de `blocked`/`error`. Un anuncio
  `gone` sale de los resultados pero conserva su historial.
- Deduplicación: `titleSlug`, `MatchSuggestion`, `phash` de fotos y el módulo
  `src/features/dedup/`.
- Coste: 0 € — todo son fetches propios; sin Apify ni Firecrawl.

---

## 5. Plan de implementación por fases

Cada fase es pequeña, independiente y reversible.

### Fase 1 — Motor de filtros y consulta (esta entrega)

Sin migración, sin red, sin UI nueva, sin despliegue. **Sólo ficheros nuevos**:
ni `/api/properties` ni `src/lib/filters.ts` se tocan, así que la lista actual
del móvil no puede regresionar.

- `src/lib/geo-es.ts` — provincia canónica y normalización, reutilizando la
  tabla de empleo con un nombre neutro (y sitio donde aterrizará el INE).
- `src/lib/rentals/filters.ts` — `RentalFilters`, `parseRentalFilters`,
  `buildRentalWhere`, `rentalOrderBy`, con clamps y validación.
- `src/app/api/rentals/search/route.ts` — endpoint **propio**, owner-scoped.
- `src/lib/rentals/filters.test.ts` — tests con `node --test`.

**Aceptación**: `npm test` y `npm run typecheck` en verde; `minPrice/maxPrice`
apuntan a `monthlyRent` con `operation=RENT` y a `currentPrice` con `SALE`;
`/api/properties` devuelve byte a byte lo mismo que antes.

### Fase 2 — UI de filtros en el móvil (hecha, 100 % OTA)

Los filtros viven en la **pestaña Buscar**, no en la lista de Inmuebles: la home
mezcla orden manual guardado, modo edición, arrastre y borrado, y meter ahí una
segunda fuente de datos arriesgaba una pantalla en producción. La pestaña Buscar
pasa a tener dos ámbitos: «Todo» (texto sobre todos los registros, como antes) e
«Inmuebles» (filtros contra `/api/rentals/search`).

- `apps/mobile/components/PropertyFilterSheet.tsx` — hoja con operación, zona
  (provincia/municipio/barrio), tipo, precio, habitaciones, baños, superficie y
  orden. `Modal` de React Native + `KeyboardAvoidingView`, sin dependencia
  nativa nueva.
- `apps/mobile/app/(tabs)/search.tsx` — ámbitos, contador de filtros activos,
  total de resultados y aviso si la provincia escrita no se reconoce.
- `records-repository.ts` (`searchProperties`) y `mappers.ts`
  (`rentalSearchItemToRecord`): el fetch y el mapeo siguen en la puerta única de
  datos, no en la pantalla.
- Claves i18n ES/EN (32 en el espacio `search`, en paridad).

Los filtros se aplican **al pulsar «Aplicar»**, no al teclear. Una sola página
(`limit=50`): el cursor existe en el backend pero acumular páginas dentro de
`useQuery` —que reemplaza `data` y revalida al volver a foco— duplicaría filas.

**Pendiente de verificación en dispositivo**: la UI no se ha ejecutado (aquí
sólo `typecheck:mobile`).

### Fase 3 — Normalización del corpus (hecha; falta ejecutar la escritura)

- `src/lib/cartociudad.ts` — cliente del geocodificador del IGN (sin clave) y
  `pickBestMunicipality`, la función pura que elige candidato.
- `scripts/normalize-property-geo.ts` (`npm run normalize-geo`) — informe por
  defecto; escribir exige `--apply --yes`.
- `canonicalProvinceLoose` en `src/lib/geo-es.ts` — desdobla la forma bilingüe
  del INE/IGN ("Araba/Álava", "Valencia/València") a la tabla castellana.
- **Causa raíz corregida**: `src/lib/import-listing.ts` resuelve ahora municipio
  y provincia con el IGN al importar, en el paso de enriquecimiento posterior.
  Sin esto el corpus se volvería a ensuciar con cada importación y limpiarlo
  sería tarea de Sísifo. Sólo rellena huecos; el dato del portal manda.

Tres desviaciones del plan original, todas deliberadas:

1. **No se embebe la tabla del INE todavía.** CartoCiudad ya devuelve `muniCode`
   y provincia en la propia respuesta, así que para normalizar no hace falta.
   Se embeberá cuando haga falta autocompletado sin red (Fase 3b).
2. **No se añade `municipalityCode` ni los índices.** Añadir un campo a
   `schema.prisma` sin ejecutar `prisma db push` **rompería la app entera**: el
   `select` por defecto de Prisma pide todos los escalares del modelo y la
   columna no existiría en Neon. Va junto al push, en la Fase 3b.
3. **Sólo se rellenan huecos** (`""`, `"Desconocida"`). Un dato existente no se
   pisa nunca, y sin candidato claro la ficha se queda sucia — antes sin dato
   que con un dato inventado, la lección de `geocode.ts:88-94`.

Estado real del corpus medido con el informe (2026-08-02): **25 de 26 fichas
tienen la geo incompleta**, es decir el filtro por provincia hoy no funciona de
hecho. El script resolvió 9 y descartó 16, incluidas direcciones de California
y de Bali que no son españolas.

#### Incidente del 2026-08-02: el falso positivo de Corvera

De esas 9, **5 eran falsas**. Las fichas cuya única pista era la provincia
generaban la consulta `"Asturias"`, y el IGN devolvía la **calle Asturias** de
Corvera de Asturias; el ranking prefería `callejero` sobre `municipio`, así que
las cinco acabaron en Corvera. Se detectó leyendo el informe completo, ya
aplicado.

Tres cosas que hicieron que esto costara diez minutos y no un día:

1. El informe imprime cada cambio, así que el patrón (cinco filas idénticas)
   saltaba a la vista.
2. `ImportLog` guardaba el valor anterior de cada escritura → `--undo` restaura
   exactamente lo que había, y sólo si la ficha sigue teniendo lo que escribimos.
3. La corrección es una regla, no un parche: `isProvinceOnlyQuery` marca las
   consultas que sólo nombran una provincia, y para ésas sólo se aceptan
   candidatos de nivel municipio. Con test que reproduce el caso real.

`npm run normalize-geo -- --audit` lista lo escrito;
`npm run normalize-geo -- --undo "<municipio>" --yes` lo deshace.

**Aceptación**: informe previo con las filas afectadas ✓; ninguna ficha cambia
sin fila en `ImportLog` con el valor anterior ✓; `province=""` baja tras
ejecutar `--apply --yes` (⏳ pendiente de tu autorización).

### Fase 3b — Código INE e índices ⚠️ requiere `prisma db push`

`municipalityCode`, `zoneSlug`, el índice
`(operationType, status, province, city, monthlyRent)` y la tabla del INE para
autocompletar sin red.

### Fase 4 — Búsquedas guardadas y alerta de "hay algo nuevo"

Resucitar `SavedSearch` (owner-scoped) + evaluación en el cron + aviso por el
DM del bot, exactamente igual que las alertas de precio. **Aceptación**: una
búsqueda guardada notifica una sola vez por resultado nuevo; topes 3 gratis /
25 Premium como en `docs/ALERTAS.md`.

### Fase 5 — Referencia oficial de precio (MITMA)

Importar el índice estatal por municipio y mostrar "un 18 % por encima de la
referencia de su zona". Alto valor diferencial, coste 0, cero riesgo legal.

### Fase 6 — Búsqueda en portales desde el WebView (decidida el 2026-08-02)

**Decisión del propietario**, tomada tras leer §2 y §3: el buscador debe
encontrar anuncios publicados en los portales, no sólo lo guardado. Se
implementa **dentro del WebView del móvil**, no en el servidor.

Por qué el WebView y no Vercel — medido, no supuesto (2026-08-02):

| Portal | fetch de servidor |
| --- | --- |
| Fotocasa, pisos.com, Habitaclia, Milanuncios | HTTP 200, contenido real |
| **Idealista**, yaencontre, Kyero | **HTTP 403 anti-bot** |

Idealista es el portal que más importa en España y el servidor no puede
alcanzarlo. El WebView sí: es el navegador del usuario, con su IP y sus
cookies, y ya se usa así para importar un anuncio
(`WebViewImporter` + `portal-extractors.ts`, con UA de Chrome y
`sharedCookiesEnabled` para que un captcha resuelto persista).

Implementación:

- `apps/mobile/lib/portal-search.ts` — URL de resultados por portal y operación,
  y un extractor **genérico**: parte de los ENLACES a fichas (que no pueden
  cambiar sin romper el portal) en vez de nombres de clase CSS, y lee precio,
  habitaciones y metros del bloque que contiene cada enlace.
- La URL sólo lleva la ZONA. El resto de filtros se aplican sobre lo extraído:
  cada portal tiene su propia gramática de filtros y adivinarlas sería lo
  primero en romperse.
- `apps/mobile/components/PortalSearchWebView.tsx` — ejecuta la búsqueda; si el
  portal pide captcha, enseña el WebView para que el usuario lo resuelva.
- Pulsar un resultado reutiliza el canal de importación que ya existe.

#### Gramática de URL por portal (medida el 2026-08-03)

Adivinar el slug del municipio fue el punto débil y reventó por ahí. Lo medido:

| Portal | Formato que funciona | Trampa |
| --- | --- | --- |
| Idealista | `/alquiler-viviendas/{muni}-{provincia}/` | Sirve interstitial de DataDome en la primera carga |
| Fotocasa | `/es/alquiler/viviendas/{muni}/todas-las-zonas/l` | Si el municipio se llama como su provincia hace falta `{muni}-capital`, o devuelve la PROVINCIA entera; y `-capital` en un municipio normal da 404 |
| Pisos.com | `/alquiler/pisos-{muni}/` | Reescribe el slug solo (`pisos-gijon` → `pisos-gijon_concejo_xixon_conceyu_gijon`) |
| Milanuncios | `/alquiler-de-pisos-en-{muni}/` | **Sin provincia**: con ella rebota al listado NACIONAL y devuelve anuncios de otra ciudad |
| Habitaclia | `/alquiler-{muni}.htm` | Redirige a `m.habitaclia.com`; sirve verificación al WebView |

Tres defectos propios que salieron de esa prueba:

1. El aceptador de cookies usaba `button[class*="accept"]`, un selector tan
   ancho que clicaba cualquier botón de la página: es lo que mandaba Fotocasa a
   su portada y pisos.com de alquiler a venta. Ahora sólo actúa sobre ids
   conocidos de gestores de consentimiento y con el texto verificado.
2. No se comprobaba **dónde acabábamos**. Un redirect silencioso devolvía
   tarjetas plausibles de otra zona u otra operación, que es peor que un error.
   Hay guard de municipio + operación, que falla pronto y descarta los hits.
3. El `€` viajaba literal en el script inyectado; el WebView de Android puede
   mutilar los no-ASCII y sin el símbolo no se leía ningún precio. Va escapado
   (`€`) y hay una segunda vía por nombre de clase, que es ASCII.

**Siguiente paso (recomendación de Codex, aceptada): pilotar el buscador propio
del portal** en vez de construir la URL. Con 8.100 municipios y una gramática
distinta por portal, la tabla de arriba no escala; las URLs construidas quedan
como atajo para los casos ya medidos. Fallos que esperar al pilotar formularios:
inputs controlados por React que ignoran `input.value = x` sin el setter nativo,
sugerencias con debounce, homónimos en la primera sugerencia y formularios que
navegan por JS sin `submit`.

Postura y límites que se mantienen: la búsqueda la inicia **el usuario**, en su
dispositivo y bajo su sesión; los resultados **enlazan al portal** y se importan
uno a uno; no hay rastreo masivo, ni caché de fotos, ni corpus agregado. Las
condiciones de uso de los portales prohíben la extracción automatizada y el
acceso puede cortarse en cualquier momento — el riesgo queda en el mismo plano
que la importación por URL que la app ya hacía.

### Fase 7 — Otras fuentes externas ⚠️ requiere tu autorización

Solicitar la API de idealista; explorar feeds de agencias locales; conectar
bolsas públicas de alquiler. Entra por el patrón `SourceAdapter.search()`.

### Fase 7 — Corpus compartido ⚠️ requiere decisión de producto y revisión legal

Sólo si las fases 1-5 demuestran uso real.

---

## 6. Riesgos, autorizaciones y métricas

### Riesgos

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Corpus vacío (arranque en frío) | El buscador no encuentra nada y parece roto | Cobertura honesta: decir cuántas fichas hay en esa zona y ofrecer el deep link al portal + guardar búsqueda |
| Geo sucia (`province=""`) | Falsos negativos silenciosos | Fase 3 antes de prometer filtros por provincia; mientras, "sin ubicación" es un filtro visible |
| Derecho *sui generis* de base de datos | Requerimiento legal de un portal | No agregar listados; enlazar siempre a la fuente; no cachear fotos ni reproducir descripciones; tope por portal |
| Nominatim en producción | Bloqueo por incumplir su política | CartoCiudad como primario; Nominatim sólo puntual; nunca autocompletado |
| ODbL de OSM | Contaminación de licencia si publicamos la BD derivada | Usar OSM sólo para consulta interna, con atribución; no redistribuir la tabla derivada |
| Fuga de privacidad si se comparte el corpus | Revelar qué sigue cada usuario | Fase 7 fuera del MVP; cualquier corpus público nace de `Listing` (hecho público del portal), nunca de la ficha del usuario |

### Requieren tu autorización explícita

1. Cualquier fuente externa nueva (Fase 6).
2. Cualquier corpus compartido entre usuarios (Fase 7).
3. `prisma db push` contra Neon (Fase 3).
4. Despliegue, `eas update` o cron nuevo.

### Métricas (se instrumentan con `lib/analytics.ts`, sin SDK de terceros)

- `rental_search_run` con nº de filtros y nº de resultados;
- % de búsquedas con **0 resultados** — la métrica que dice si el corpus sirve;
- búsquedas guardadas creadas por usuario activo;
- % de búsquedas que acaban en abrir ficha o guardar registro;
- retorno tras un aviso de "nuevo resultado";
- coste variable: debe seguir siendo 0 € en las fases 1-5.

---

## 7. Herramientas: qué hace falta y qué se evita

**Necesarias**: ninguna nueva en las fases 1-5. Todo se hace con Prisma/Neon,
`fetch`, `node --test` y lo que ya está en el repo.

**Evitables** (y por qué): PostGIS (bounding box + haversine bastan a esta
escala), Elasticsearch/Meilisearch (Postgres sobra), Mapbox/Google Maps (no hay
mapa en el MVP), Apify/Firecrawl/proxies de scraping (coste variable y riesgo
legal), Redis (el rate limit ya vive en BBDD).

**A evaluar sólo si el corpus crece**: `pg_trgm` para búsqueda difusa de
municipios y barrios (extensión estándar de Postgres, disponible en Neon).

---

## 8. Revisión adversarial de Codex y qué se hizo con ella

Tarea `4e64c629` (`nidokey-graph`, modo *analyze*), ejecutada en paralelo.

| Hallazgo de Codex | Disposición |
| --- | --- |
| **Rechazo 1** — scraping/agregación server-side de portales como base del producto (art. 133 LPI: extracción de parte sustancial, y también extracciones repetidas de partes no sustanciales que dañen la explotación normal; sin umbral numérico seguro) | **Aceptado**. Coincide con §2.1 y §3. El scraping de listados queda fuera |
| **Rechazo 2** — no reutilizar `/api/properties` como buscador; usar `/api/rentals/search` sobre una proyección pública mínima y nunca sobre fichas privadas por defecto | **Aceptado y aplicado en Fase 1**. El motor vive en un endpoint propio; `/api/properties` no se toca. El aislamiento por `ownerId` de la lista actual no se reabre |
| **Rechazo 3** — no normalizar geo con Nominatim en caliente desde Vercel (el throttle de `geocode.ts:12-17` es de memoria de módulo: cada lambda tiene su contador) | **Aceptado**. La Fase 1 no hace ninguna llamada de red; la Fase 3 usa INE versionado + CartoCiudad cacheado |
| Un corpus público derivado de `Property` sin `visibility` / `publicApprovedAt` / `sourceConsent` filtraría fichas privadas | **Aceptado para la Fase 7**: esas tres columnas son requisito previo, no un extra |
| Hoy se guardan URLs de fotos `PORTAL_SCRAPE` (`src/lib/import-listing.ts:563-583`, `:660-663`) y la descripción del portal (`:617`) — justo lo que no puede viajar a un corpus público | **Aceptado**: anotado como exclusión explícita de cualquier proyección pública |
| Índice sugerido `(operationType, status, province, city, monthlyRent)`, más completo que el propuesto | **Aceptado**, sustituye al del §4.1 en la Fase 3 |
| Cursor compuesto `(monthlyRent, id)` para orden por precio | **Aceptado**, ya era el diseño; implementado en Fase 1 |
| «Viable sólo como inventario guardado/compartido o marketplace hiperlocal, no como buscador general; ciudad piloto» | **Aceptado como encuadre**: si la promesa es competir con Idealista, el arranque en frío la rompe. La ciudad piloto entra en la Fase 6 |
| Fuentes externas de terceros (Apify/Bright Data sobre idealista) trasladan el riesgo pero no lo eliminan | **Aceptado**, ya estaba descartado en §2.1 |
| «Aplicar TTL 14-30 días a la ficha pública» | **Aplazado** a la Fase 7: sin corpus público no hay a qué aplicarle TTL, y un TTL sobre fichas privadas borraría datos del usuario |

Nada rechazado. Dos avisos operativos de Codex, ajenos al diseño: no pudo
ejecutar los tests (política del entorno) ni cerrar su tarea con
`complete_delegated_task` (el servidor fija la identidad del agente).

### 8.1 Segunda revisión — Fase 2 (tarea `cf80496b`)

| Hallazgo de Codex | Disposición |
| --- | --- |
| Los campos numéricos quedan tapados por el teclado si se copia `AlertsSheet` sin `KeyboardAvoidingView` (`AlertsSheet.tsx:209-213`) | **Aceptado y corregido**: la hoja lleva `KeyboardAvoidingView` (`padding` en iOS; en Android basta el `adjustResize` por defecto, forzar `height` pelea con `statusBarTranslucent`) |
| No meter cursor acumulativo dentro de `useQuery`: el hook reemplaza `data` (`useQuery.ts:69-82`) y revalida al foco (`:111-114`), así que una revalidación puede dejar la página N donde iba la 1, duplicar filas o mezclar filtros | **Aceptado**: Fase 2 con una sola página `limit=50`. Si hiciera falta, un hook aparte `useRentalSearchPages` con dedupe por `id`, sin tocar `useQuery` |
| Estado de filtros: `draft` dentro de la hoja y `committed` fuera; pedir sólo al pulsar «Aplicar» (volcar cada tecla a querystring dispara una búsqueda por pulsación) | **Aceptado**, es el diseño implementado |
| El mapper debe vivir en el repositorio/`mappers.ts`, no en la pantalla (`records-repository.ts:11-17` declara ser la puerta única) | **Aceptado**, ya estaba así |
| No añadir dependencia nativa para la hoja; `Modal` + `useSafeAreaInsets` es el patrón del proyecto (`CategoryContextSheet`, `AlertsSheet`) | **Aceptado**: todo sale por OTA |
| Una ruta modal para los filtros metería back-stack innecesario con el `<Slot>` de tabs y el `HeaderBack` JS | **Aceptado**: la hoja se monta en la pantalla, no como ruta |
| Los filtros pueden perderse al navegar al detalle y volver (como le pasa a `opFilter`, `index.tsx:71-72`); sincronizarlos en params de Expo Router | **Aplazado**: en Expo Router la pestaña no se desmonta al hacer `push` al detalle, así que hoy no se pierden. Se revisará si aparece el síntoma |

### 8.2 Tercera revisión — Fase 3 (tarea `bf7d5dc7`)

| Hallazgo de Codex | Disposición |
| --- | --- |
| **Rechazo 1** — `pickBestMunicipality` caía a cualquier provincia cuando la pista no casaba: una ficha que dice Asturias podía acabar con un municipio de Badajoz, internamente contradictoria | **Aceptado y corregido**. Pista incompatible = ambiguo = no se toca. El test que celebraba el comportamiento anterior ahora exige `null` |
| **Rechazo 2** — el log no bastaba para deshacer ni auditar un falso positivo: faltaban la consulta usada, el `state` del IGN y la versión del algoritmo | **Aceptado**: `ImportLog.meta` lleva ahora `query`, `state`, `matchedType`, `municipalityCode` y `algorithm`. Descartado guardar los candidatos rechazados: mucho ruido para el valor que aporta |
| **Rechazo 3** — `property.update` por id pisa un cambio concurrente (el usuario edita la ficha mientras corre el script) | **Aceptado**: `updateMany` con los valores originales en el `where`; si `count === 0` la ficha cambió y se salta |
| **Rechazo 4** — no añadir `municipalityCode` al esquema sin autorización de `db push` | **Aceptado**, ya era la decisión; confirmó además que las rutas afectadas serían `records/route.ts:24-31`, `properties/route.ts:11-19`, `rentals/search/route.ts:42-57`, `import-listing.ts:745` y `account/export/route.ts:25` |
| Subir el throttle a ≥1 s, como el precedente de Nominatim | **Aceptado**: 1 req/s por defecto |
| Documentó los valores de `state` del IGN (1 exacto; 2-6 aproximaciones; 10 sin resultado) | **Aceptado**: se guarda en el log y desempata candidatos del mismo tipo |
| Tolerar variantes del nombre del campo `muniCode` | **Rechazado**: el código ya trata `muniCode` como opcional y no depende de él (`municipalityCode: null` si falta). Añadir alias sin una respuesta real que lo justifique es adivinar |
