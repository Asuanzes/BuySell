# Vertical EMPLEO — de dónde salen las ofertas

> Estado a 2026-07-28. Sustituye a `jobs-ingestion-apify.md`, que describía la
> ingesta por actores de pago, ya retirada.

## Búsqueda MULTIPORTAL, todo gratis y sin clave

El diferencial del producto es buscar en varios portales de una vez. Fuentes
activas, consultadas en paralelo con intercalado 1:1:

| Portal | Perfil | Ofertas/página | Provincia | Remoto |
| --- | --- | --- | --- | --- |
| **InfoJobs** (Jina) | generalista | ~20 (JSON embebido) | `provinceIds=<id>` (tabla sondeada) | filtro propio en cliente |
| **Tecnoempleo** (Jina) | informática y telecos | 30 (HTML renderizado) | `pr=,<id>,` (tabla publicada en su `<select>`) | `en_remoto=1` |
| **6 APIs de remoto** (JSON directo) | remoto internacional, en inglés | 8 por API | — | solo entran con "solo remoto" |

Portales evaluados y descartados (2026-07-28, medido, no supuesto):
- **Trabajos.com**: responde, pero **ignora la palabra clave** — devuelve
  limpieza y carretilleros para "programador". Misma trampa que la URL
  segmentada de InfoJobs.
- **Jobatus**: HTTP 422 vía Jina.
- **Talent.com / Manfred**: renderizan en cliente; el HTML servido apenas trae
  5 enlaces.
- **Infoempleo**: solo 19 enlaces y sin estructura clara de tarjeta.

## InfoJobs vía Jina Reader

`src/features/sources/jobs/ingest-infojobs-jina.ts`. Se lee la página pública de
resultados a través de `https://r.jina.ai/<url>` — un `GET` sin cuenta ni token.

Flujo: el móvil llama a `/api/records/search?type=job` → `apifyJobsAdapter.search()`
→ InfoJobs y Tecnoempleo en paralelo → candidatos intercalados con su `record`
ya normalizado embebido. Al elegir uno, el móvil importa con `kind:"record"`:
**no se vuelve a consultar la fuente**.

### Lo que hay que saber para tocarlo

1. **Pedir HTML, no markdown** (`x-return-format: html`). El markdown de Jina se
   come el título y el enlace de cada oferta.
2. **Los datos buenos están en un JSON embebido**, escapado dentro de una cadena
   JS: `\"offers\":[…]` con ~22 ofertas completas (código, título, descripción,
   ciudad, enlace, contrato, jornada, teletrabajo, fecha ISO, empresa, logo).
   Las tarjetas renderizadas son solo 5 y no traen descripción; de ellas se
   rescata únicamente el **salario**, que es lo que falta en el JSON.
3. **La provincia solo se filtra con `provinceIds=<id>`**, un id interno de
   InfoJobs que no se puede deducir (A Coruña es la 28) ni aparece en la página.
   La tabla de las 52 provincias está en `province.ts`, obtenida **sondeando la
   web**: una búsqueda por id anotando la ciudad dominante.
4. ⚠️ **Trampa**: `/ofertas-trabajo/<kw>/en-<provincia>` parece la URL para
   buscar por zona, pero **ignora la palabra clave** (devuelve repartidores y
   vigilantes para "programador"). No usarla.
5. Si se pide una zona que no se resuelve a provincia, la búsqueda devuelve
   **vacío** a propósito: enseñar ofertas de Madrid a quien pidió Vitoria es
   peor que no enseñar nada.

Rendimiento real: ~20 ofertas por búsqueda nacional (3 páginas), las que haya en
la provincia cuando se filtra por zona.

## Por qué NO hay LinkedIn ni Indeed

Ambas se servían con actores de pago de Apify y se retiraron al dar de baja el
plan. Sus alternativas gratuitas no existen:

- **LinkedIn**: Jina **bloquea el acceso anónimo al dominio**
  (`AbuseAlleviationError` 403, con fecha de caducidad y reaparición). Funciona
  a ratos — una tarde puede devolver 60 ofertas y a la hora siguiente 403 —, lo
  que para una búsqueda de usuario equivale a no funcionar.
- **Indeed**: por Jina devuelve una cáscara de ~28 KB con solo hojas de estilo,
  sin ninguna oferta (protección anti-bot). Además su actor era el único que
  corría **sin tope de gasto por ejecución**.

`JobPlatform` conserva los valores `linkedin` / `indeed` para que los registros
guardados en su día se sigan mostrando con su etiqueta correcta.

## Tecnoempleo vía Jina Reader

`src/features/sources/jobs/ingest-tecnoempleo-jina.ts`. Más simple que InfoJobs:
las 30 ofertas por página vienen renderizadas en servidor, cada tarjeta empieza
con `<a name="rf-<id>">` y lleva título, empresa, `<b>Ciudad</b> (Modalidad) -
fecha`, recorte de descripción, etiquetas de tecnología y a veces salario.

Particularidades:

- La provincia va como lista entre comas: `?pr=,232,`. La tabla de ids está en
  `province.ts` (`TECNOEMPLEO_PROVINCE_ID`) — esta NO hubo que sondearla: su
  buscador la publica en el `<select>` del HTML. Ojo a los nombres: el portal
  usa Bizkaia/Gipuzkoa/Girona/Lleida/Ourense y nuestro canónico es
  Vizcaya/Guipúzcoa/Gerona/Lérida/Orense.
- Cuando una oferta es 100 % remota, el portal escribe "100% remoto" **en el
  hueco de la ciudad**, sin paréntesis de modalidad.
- El `<title>` de la página confirma el filtro ("181 Ofertas … en Álava"), útil
  para verificar a mano si algo huele raro.

## Bolsas de remoto internacional (seis APIs abiertas)

`src/features/sources/jobs/ingest-remote-apis.ts`. Remotive, Jobicy, Arbeitnow,
RemoteOK, Himalayas y The Muse: APIs JSON **gratis, sin clave y sin scraping**.
Se enrutan SOLO cuando el usuario marca "solo remoto" — son bolsas
internacionales casi todas en inglés y sin filtro de provincia; en una búsqueda
"programador en Vitoria" serían ruido.

- Casi ninguna busca bien en servidor (tabla en la cabecera del fichero): el
  filtro por palabra se hace aquí sobre título + etiquetas + descripción.
  **Limitación honesta de idioma**: "programador" casa poco; "react", "python"
  o "designer" casan bien.
- Cada API aporta hasta 8 ofertas; se intercalan 1:1 entre las seis y se
  deduplican por `externalId`/URL. Una API caída solo se pierde a sí misma.
- Los normalizadores son puros y están cubiertos por
  `ingest-remote-apis.test.ts` con payloads fieles (APIs sondeadas el
  2026-07-28).

## Cuota de Jina (sin clave: 20 peticiones/minuto)

Una búsqueda multiportal consume 2-4 peticiones (1-3 de InfoJobs + 1 de
Tecnoempleo). Sin clave, Jina permite ~20/min por IP — con una clave gratuita
sube a 500/min, opción a considerar si las búsquedas crecen. El bloqueo por
dominio (caso LinkedIn) es independiente de la clave.

## Fragilidad asumida

Esto es scraping de una web de terceros a través de un lector externo: **se
romperá cuando InfoJobs cambie su maquetación o cuando Jina limite el acceso**.
Los tests de `ingest-infojobs-jina.test.ts` protegen el parser (incluido el caso
de que el JSON deje de parsearse, que degrada a las tarjetas), pero **no avisan
de que la web cambió**. Si la búsqueda deja de dar resultados, ese es el primer
sitio donde mirar.

## Persistencia

Hoy las ofertas se guardan como registro al elegirlas en el buscador
(`upsertRecord` con el `NormalizedRecord` embebido). No hay refresco automático
de ofertas guardadas: `refreshType()` solo cubre cripto y mercado.
