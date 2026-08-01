# Motor de búsqueda de vuelos por coste total verificable

> Documento normativo del vertical **Viajes → vuelos**. Manda sobre cualquier
> spec histórica. Si el código y este documento discrepan, manda el código y hay
> que corregir este documento.

## 1. Qué problema resuelve

La búsqueda de siempre pregunta a Duffel por las fechas exactas y enseña la
tarifa. Este motor busca el **menor coste total verificable**: explora
alternativas legítimas del itinerario, las verifica en vivo con las APIs que ya
pagamos, y enseña el proceso mientras ocurre.

Cuatro reglas que no se negocian:

1. **El LLM nunca calcula ni inventa precios.** Puede reordenar candidatos y
   redactar el resumen, y solo sobre datos ya calculados.
2. **Todo lo que decide dinero es determinista**: generación de candidatos,
   restricciones, normalización, ahorro y ranking.
3. **Nada se presenta como disponible sin verificación en vivo.**
4. **Lo estimado se declara.** Un traslado terrestre o una maleta sin tarifa
   publicada entran en el total, pero salen listados aparte.

Con `aiSearch=false` no pasa nada de esto: el comportamiento es el de siempre.

## 2. Mapa

```
apps/mobile/app/viajes/nuevo.tsx
  │  IA apagada ─────────────────► GET /api/travel/flights          (de siempre)
  └─ IA encendida ───────────────► GET /api/travel/flights/stream    (SSE)
         │  lib/flight-stream.ts (expo/fetch + getReader)
         │  components/travel/FlightSearchProgress.tsx
         ▼
src/app/api/travel/flights/stream/route.ts   auth · cuota · heartbeat · cancelación
         ▼
src/features/travel/stream-search.ts         orquestador (generador asíncrono)
   ├─ planner.ts     candidatos                     PURO
   ├─ scorer.ts      puntuación y cartera           PURO
   ├─ normalize.ts   coste total, ahorro, rankings  PURO
   └─ live-deps.ts   Travelpayouts + LLM            I/O

packages/shared/src/
   flights.ts          contratos Zod (los 8)
   airports.ts         120 aeropuertos + grupos de ciudad IATA
   flight-progress.ts  reductor de cliente + lector SSE   PURO
```

Lo **puro** (sin red, sin BBDD, sin reloj) es todo lo que decide dinero, y por eso
está cubierto por tests sin un solo mock de red.

## 3. Generación de candidatos

`planner.ts` explora por **tres ejes separados**, no por producto cartesiano:

| Eje | Qué varía | Flexibilidad |
| --- | --- | --- |
| A · fechas | ±`flexDays` en ida y vuelta, con los aeropuertos pedidos | ±2 días |
| B · aeropuertos | alternativos y códigos de ciudad | ±1 día |
| C · open-jaw | volver desde/hacia otro aeropuerto | solo fechas exactas |

El cartesiano daría ~1.100 candidatos para verificar 6: ruido en los eventos y en
el prompt sin una sola opción extra que la cartera fuese a elegir.

**Restricciones aplicadas antes de gastar dinero**: vuelta posterior a la ida,
estancia mínima, variación máxima de duración, radio de aeropuertos, trayectos
imposibles y deduplicación por clave canónica. `maxStops` viaja a Duffel como
`max_connections`, que filtra en la aerolínea y no cuesta una llamada extra.

**El baseline** (fechas y aeropuertos exactos) va siempre el primero y nunca se
descarta por una regla nuestra. Solo desaparece si la fecha ya pasó — y entonces
la búsqueda se queda sin baseline y no se enseña ningún porcentaje de ahorro.

## 4. Presupuesto en dos fases

| Fase | Proveedor | Llamadas | ¿Cuesta? |
| --- | --- | ---: | --- |
| Barata | Travelpayouts (calendario cacheado) | ≤ 2 | no |
| Barata | LLM priorizar | ≤ 1 | ~0 |
| Verificación | **Duffel** `offer_requests` | **≤ 6** (`MAX_DUFFEL_CALLS_AI`) | **sí** |
| Relato | LLM resumen | ≤ 1 | ~0 |

- Concurrencia máxima: **3** (`MAX_CONCURRENT_PROVIDER`).
- La cuota se descuenta **antes** de llamar: un proceso que muere a mitad no
  puede haber gastado más de lo contado.
- Cuota diaria por usuario: **50** consultas (`flights-search`, ventana fija
  alineada a medianoche UTC). Una búsqueda con IA gasta hasta 6.

### Cartera: por qué no se cogen los 6 mejores

Ordenar solo por puntuación llena el presupuesto con seis variantes de la misma
fecha barata y nunca descubre que ganaba el billete partido o el aeropuerto de al
lado. Se reserva un hueco por familia:

1. baseline · 2. mejor puntuación · 3. mejor de otra estructura · 4. mejor con
aeropuerto alternativo · 5. mejor de baja fricción (≤1 día) · 6. **exploración**.

El hueco de exploración es un sorteo **sembrado por la clave de la búsqueda**:
reproducible, testeable, y es lo único que evita que el motor solo confirme lo
que ya creía.

## 5. Coste total

```
totalTripCost = fareTotal + mandatoryFees + baggageCost + seatCost + groundTransferEstimate
```

- **Manda `total_amount`.** Si el desglose del proveedor no cuadra (pasa: tasas
  mayores que el total), la tarifa se deriva del total. Es lo que se paga.
- **Equipaje**: lo incluido se lee gratis de la propia oferta. Lo que falte se
  estima a 30 €/maleta/trayecto y se declara. Verificarlo de verdad exige un GET
  extra por oferta, que se paga.
- **Traslado terrestre**: 18 c/km por viajero y por aeropuerto pisado, calculado
  con el aeropuerto **real de la oferta**, no con el pedido. Es el mando de
  calibración de esta función.
- **Monedas distintas no se suman.** Sin tipo de cambio fiable, sumar sería
  inventarse un precio.

`confidence` describe la **tarifa** (`observed` · `estimated` · `verified` ·
`expired`); `estimatedComponents` dice qué partes del **total** son estimación
nuestra. Hacen falta las dos: una tarifa verificada con traslado estimado no es
un total verificado, y marcar la oferta entera como estimada escondería que el
vuelo sí está disponible a ese precio.

### Ahorro

`savingsPct = round((baselineTotal − candidateTotal) / baselineTotal × 100)`
sobre `totalTripCost`. **Sin baseline comparable no se enseña porcentaje**, ni
un 0 %. Los ahorros negativos se calculan pero quedan fuera del carrusel de
ahorro; siguen apareciendo en los demás rankings (`cheapest`, `balanced`,
`fastest`).

## 6. Streaming

`GET /api/travel/flights/stream` (SSE) con 12 eventos tipados: `search.started`,
`candidates.generated`, `cache.checked`, `candidate.scored`, `provider.started`,
`offer.found`, `offer.improved`, `candidate.rejected`, `quota.updated`,
`search.partial`, `search.completed`, `search.failed`.

- **`seq` manda sobre el reloj.** Los relojes de dos lambdas no son comparables.
- **Heartbeat cada 15 s.** iOS corta el streaming tras ~60 s sin datos.
- **Cancelar no es fallar**: se emite `search.partial(cancelled)` y un
  `search.completed` con lo ya encontrado. Lo pagado se entrega.
- **Sin replay al reconectar.** En serverless no hay memoria compartida, así que
  no hay `Last-Event-ID`. Lo garantizado es no duplicar y no perder.

### Cliente

`packages/shared/src/flight-progress.ts` es un reductor **puro**: ahí vive la
tolerancia a una red real (desorden, repetidos, corte y reanudación) y por eso se
puede probar. La pantalla solo pinta ese estado.

⚠️ **Las ofertas se indexan por `offerKey`, no por `candidateKey`.** Un mismo
itinerario devuelve varias ofertas y deduplicar por candidato hacía que la última
recibida borrase a las anteriores; como la lista llega ordenada de menor a mayor,
la superviviente era siempre **la más cara**.

## 7. Gotchas

- **`expo/fetch`, no el `fetch` global.** El global de RN viene de whatwg-fetch y
  su `response.body` es `undefined`: no hay streaming posible. `expo/fetch` se
  apoya en un módulo nativo del paquete core `expo`, así que ya está en el
  binario y sale por OTA sin recompilar.
- Leer con `getReader()`, **nunca** con `for await`: el `Symbol.asyncIterator` se
  parchea después.
- Cancelar en `expo/fetch` rechaza con un `Error` genérico, **no** con
  `AbortError`: hay que mirar la señal.
- `credentials` va a `"include"` por defecto y `clone()` lanza "Not implemented".
- El `throttle()` de `duffel.ts` **no limita nada bajo concurrencia**: N llamadas
  simultáneas leen el mismo `lastCall`, esperan lo mismo y disparan a la vez. El
  semáforo del orquestador es lo que sí acota.

## 8. Estado

| | |
| --- | --- |
| Fases 1–4 | hechas y desplegadas |
| Fase 5 (observaciones, scorer tabular, métricas) | pendiente |
| Fase 6 (docs, deuda, validación) | este documento |

**Pendiente que importa:**

- ⚠️ **`DUFFEL_TOKEN` está en modo TEST**: el inventario es sintético. Todo el
  motor es correcto pero opera sobre datos falsos. Sin token `live`, un almacén
  de observaciones no sirve para entrenar ni para detectar variaciones reales.
- `FlightObservation` (aprobado, sin aplicar) y con él la revalidación, el
  scorer tabular y las métricas históricas.
- Verificar el equipaje del ganador en vez de estimarlo.
- Los fixtures de `__fixtures__/` son sintéticos, no capturas reales.
- La revisión adversarial de la UI (fase 4) quedó a medias.

## 9. Comandos

| | |
| --- | --- |
| `npm test` | 360 tests, ninguno toca la red |
| `npm run typecheck` · `npm run typecheck:mobile` | lo que corre el CI |
| `npm run i18n:validate` | claves ES/EN completas (manual, el CI no lo corre) |
