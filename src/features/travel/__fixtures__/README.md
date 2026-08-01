# Fixtures de proveedores (vuelos)

⚠️ **Estos payloads son SINTÉTICOS**, construidos a partir del esquema
documentado de cada proveedor. **No son capturas de tráfico real.** Reproducen la
FORMA de la respuesta (nombres de campo, tipos, anidamiento), no un precio que
existiera nunca.

Sustituir cualquiera por una captura real anonimizada es cambiar un fichero y
nada más: los tests consumen los datos por su clave, no por su contenido.

Todas las fechas son **literales fijas**. Nada se genera con `Date.now()`: un
fixture con reloj convierte un test en una moneda al aire.

## `duffel.json`

| Clave | Qué caso cubre |
| --- | --- |
| `roundTripDirect` | Ida y vuelta directo. El caso normal y el baseline de los tests |
| `roundTripOneStop` | Ida con escala (2 segmentos): duración agregada y recuento de escalas |
| `oneWayOut` / `oneWayBack` | Tramos sueltos que forman un billete partido |
| `withCheckedBaggage` | Tarifa que YA incluye 1 maleta facturada → coste de equipaje 0 |
| `expiredOffer` | `expires_at` en 2020 → la oferta se marca `expired`, no `verified` |
| `foreignCurrency` | Precio en GBP → no comparable con un baseline en EUR |
| `overnightReturn` | La vuelta sale el 17 y aterriza el 18 (nocturno) |
| `alternateAirport` | Llega a REU en vez de a BCN → traslado terrestre estimado |
| `malformed` | Lista de ofertas rotas: importe no numérico, sin importe, sin trayectos, sin segmentos y con tasas mayores que el total |

Invariante respetada en todos salvo `malformed`: `base_amount + tax_amount ===
total_amount`, y `arriving_at > departing_at` en cada segmento.

## `travelpayouts.json`

| Clave | Qué caso cubre |
| --- | --- |
| `calendarDeparture` | `/v1/prices/calendar` con el precio como **número suelto** |
| `calendarReturnNested` | La MISMA API con el precio **anidado** en `{ price }`. Las dos formas existen de verdad y el parser tiene que aguantar ambas |
| `calendarEmpty` | Ruta sin datos cacheados |
| `calendarDirty` | Valores basura mezclados: `null`, texto, 0, negativo y objetos sin `price`. El parser los ignora sin lanzar |

## Sin datos personales

Aerolíneas reales, sí. Personas, no: ningún nombre de pasajero, correo,
localizador ni identificador de reserva real. Los `id` de oferta llevan el
prefijo `off_fixture_` para que sea imposible confundirlos con uno de producción.
