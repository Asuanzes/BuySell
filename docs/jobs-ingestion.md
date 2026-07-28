# Vertical EMPLEO — de dónde salen las ofertas

> Estado a 2026-07-28. Sustituye a `jobs-ingestion-apify.md`, que describía la
> ingesta por actores de pago, ya retirada.

## Fuente única: InfoJobs vía Jina Reader (gratis, sin clave)

`src/features/sources/jobs/ingest-infojobs-jina.ts`. Se lee la página pública de
resultados a través de `https://r.jina.ai/<url>` — un `GET` sin cuenta ni token.

Flujo: el móvil llama a `/api/records/search?type=job` → `apifyJobsAdapter.search()`
→ una o tres peticiones a Jina → candidatos con su `record` ya normalizado
embebido. Al elegir uno, el móvil importa con `kind:"record"`: **no se vuelve a
consultar la fuente**.

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
