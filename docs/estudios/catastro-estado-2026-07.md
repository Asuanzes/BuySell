# Catastro en Nidokey — estudio técnico y decisión de arquitectura (jul-2026)

> Escrito por Claude Code el 2026-07-30. La tarea delegada a Codex
> (`docs/estudios/catastro-codex.md`) falló dos veces por caída de su ejecutor
> en modo edición sin llegar a escribir nada; este documento la sustituye.
> Todo lo marcado "verificado" se comprobó con GETs reales de solo lectura
> contra el servicio público ese mismo día.

## 1. Estado del código (tras el endurecimiento de esta sesión)

- `src/features/cadastre/lookup.ts` — cliente TS server-side del OVC:
  timeout 10 s con abort, límite de respuesta 1 MB, 1 reintento solo ante fallo
  de transporte (`CadastreUnavailableError`), errores de datos separados
  (`CadastreDataError` desde `lerr`), candidatos múltiples nunca auto-elegidos,
  parseo puro testeable (`parseDnprc`).
- `src/features/cadastre/ref.ts` — normalización (mayúsculas, sin separadores)
  y validación ESTRUCTURAL de la RC (14 = finca, 20 = inmueble). Sin algoritmo
  de dígitos de control inventado: la verificación real la hace el OVC.
- `src/features/cadastre/types.ts` — `CadastreInfo` normalizado (uso,
  superficie, año, parcela, participación, unidades constructivas, urbano/
  rústico, bloque/escalera/planta/puerta) + `wrapCadastreData` (schema 1 con
  `source` + `fetchedAt`, `raw` acotado a 64 KB).
- `src/app/api/properties/[id]/cadastre/route.ts` — auth + propiedad del
  inmueble, rate-limit 30/h/usuario (tabla `RateLimit`), caché 30 días con
  `force`, respuesta `ambiguous` con candidatos, errores estructurados
  (`REF_INVALID`, `NOT_FOUND`, `RATE_LIMITED`, `CADASTRE_UNAVAILABLE` 503,
  `CADASTRE_ERROR` 502 sin detalles internos).
- Móvil: `apps/mobile/app/property/cadastre.tsx` (detalle completo, candidatos,
  comparación anuncio-vs-Catastro, copiar RC, abrir Sede, RC manual, corregir
  dirección) + tarjeta resumen en la ficha. El móvil **nunca** llama al
  Catastro directamente.

## 2. Endpoints libres del OVC (verificados 2026-07-30)

| Servicio | URL | Formato | Estado |
| --- | --- | --- | --- |
| Consulta_DNPRC (datos no protegidos por RC) | `ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/Consulta_DNPRC?Provincia=&Municipio=&RefCat=` | JSON | ✅ verificado |
| Consulta_DNPLOC (por dirección) | `…COVCCallejero.svc/json/Consulta_DNPLOC?Provincia=&Municipio=&Sigla=&Calle=&Numero=&Bloque=&Escalera=&Planta=&Puerta=` | JSON | ✅ verificado |
| Consulta_RCCOOR (RC por coordenadas) | `ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR?SRS=EPSG:4326&Coordenada_X=&Coordenada_Y=` | XML (ASMX) | ✅ verificado |
| Consulta_RCCOOR_Distancia (candidatos por proximidad) | mismo servicio ASMX | XML | según doc oficial (no cableado aún) |
| Callejero (ObtenerProvincias/Municipios/Vias) | `COVCCallejero.svc/json/…` | JSON | según doc oficial (no lo necesitamos: la ficha ya trae provincia/municipio) |

⚠️ **El Callejero ASMX antiguo (`ovcservweb/OVCCallejero/COVCCallejero.asmx`)
devuelve HTTP 404**: era lo que usaba el código previo — la integración llevaba
tiempo muerta en producción. El parámetro en WCF es `RefCat` (en ASMX era `RC`).

Señales del servicio JSON (verificadas):
- Raíz `consulta_dnprcResult` / `consulta_dnplocResult`.
- Errores: `control.cuerr` + `lerr: [{ cod, des }]` (p. ej. cod 4 "RC no
  correctamente formada", cod 43 "el número no existe" con `numerero.nump[]`
  de números cercanos).
- Resultados múltiples: `lrcdnp.rcdnp[]` (varias unidades por finca) — cada
  item con `rc` + `dt.locs.lous.lourb.loint` (bloque/escalera/planta/puerta).
- Extras útiles: `bi.ldt` (dirección literal completa), `finca.dff.ss`
  (superficie de parcela), `finca.infgraf.igraf` (URL oficial del plano en la
  Sede), `lcons[]` (unidades constructivas con superficie).

## 3. Python-Catastro (MrCabss69) y pycatastro

Wrapper de `pandas` + `pycatastro`, ambos **GPL-3.0**; `pycatastro` sin
mantenimiento aparente. **No se copia código**: Nidokey es un repo propietario
con distribución en tiendas — incorporar código GPL-3.0 obligaría a licenciar
el trabajo derivado bajo GPL (copyleft), incompatible con el modelo actual.
Además el wrapper apunta a los mismos endpoints que ya consumimos y no añade
capacidades (ni resuelve el 404 del ASMX). Sirve solo como referencia de
lectura del mapa de métodos del OVC; la fuente de verdad es la doc oficial
(`Webservices_Libres.pdf`) y el comportamiento real del servicio.

## 4. Comparativa de arquitecturas

| Opción | Pros | Contras | Veredicto |
| --- | --- | --- | --- |
| (a) Cliente TS server-side sobre OVC (actual) | 0 dependencias nuevas, mismo deploy Vercel, JSON nativo, ya endurecido y testeado | mantener el parseo si el OVC cambia | ✅ **elegida** |
| (b) Microservicio Python (pycatastro) | — | deploy+mantenimiento extra (VPS), dep sin mantener, GPL, sin ventaja funcional | ❌ |
| (c) Copiar código GPL | — | copyleft incompatible con distribución propietaria | ❌ |

## 5. Datos mostrables vs prohibidos

**Mostrables** (no protegidos, devueltos por Consulta_DNP*): referencia
catastral, urbano/rústico, uso principal, superficie construida, superficie de
parcela, año/antigüedad, dirección catastral (provincia, municipio, vía, CP,
bloque/escalera/planta/puerta), coeficiente de participación, unidades
constructivas y sus superficies, cultivos/subparcelas en rústico, plano/mapa
oficial de la Sede.

**PROHIBIDOS** (protegidos, ni se piden ni se muestran ni se prometen):
titularidad, valor catastral, cualquier dato que exija certificado/AEAT.

La UI incluye la nota fija: *"Datos informativos de la Sede Electrónica del
Catastro. No constituyen certificación catastral ni acreditan titularidad."*

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Rate limiting / caída del OVC | caché 30 días + rate-limit propio 30/h/usuario + 503 `CADASTRE_UNAVAILABLE` con degradación (la ficha sigue funcionando) |
| Cambio de esquema del servicio (ya pasó: ASMX→WCF) | parseo defensivo con formas XML y JSON, tests con fixture dorado capturado del servicio real |
| XXE en la rama XML (coordenadas) | `fast-xml-parser` no procesa DTD ni entidades externas |
| Resultados ambiguos | candidatos SIEMPRE elegidos por el usuario (bloque/escalera/planta/puerta); jamás auto-selección |
| Respuestas enormes | límite 1 MB + `raw` acotado a 64 KB al persistir |
