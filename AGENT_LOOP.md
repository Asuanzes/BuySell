# AGENT_LOOP — Estado compartido del loop multiagente

> Documento único de coordinación (regla 10). Cada agente lo consulta y
> actualiza al intervenir. Historial de iteraciones al final.

## Estado actual

```yaml
iteracion: 1
estado: implementacion
responsable_actual: codex (task edit en curso)
problema_usuario: >
  Quien decide una compra/alquiler con varios inmuebles guardados no puede
  compararlos: la promesa central "te ayuda a compararlas"
  (docs/MODELO-NEGOCIO.md L57) no tiene ninguna UI.
evidencia:
  - "docs/MODELO-NEGOCIO.md L57: 'Nidokey vigila qué cambia, te ayuda a compararlas y coordina el siguiente paso'"
  - "grep 'comparar|compare' en apps/mobile: solo ZoneComparisonBlock (precio de zona DENTRO de una ficha), sin comparación entre registros"
  - "Decisión bcde28a1 del grafo: búsqueda multi-portal registrada como posibilidad futura (misma dirección, fase búsqueda)"
  - "app/tools/[tool].tsx L13: 'integración real con Registro / INE queda como TODO (banners pendiente)' — visible al usuario"
hipotesis: >
  Creemos que quien decide entre varios inmuebles guardados podrá elegir con
  más confianza y menos pasos si añadimos un comparador de 2-3 fichas lado a
  lado. Lo consideraremos válido cuando el flujo selección→comparación→abrir
  ficha sea completable con datos reales, cubierto por criterios verificables
  y sin hallazgos bloqueantes de DeepSeek.
incremento_elegido: >
  Comparador de inmuebles (MVP): selección de 2-3 en la categoría Inmuebles +
  pantalla app/property/compare.tsx con campos clave, mejor valor resaltado y
  acceso a cada ficha. Acordado por los tres agentes (Codex 6edcdd3b,
  DeepSeek 09d6ff17, desempates del loop).
criterios_aceptacion:
  - "Con ≥2 inmuebles visibles aparece la acción Comparar; con <2 seleccionados el CTA está deshabilitado; máximo 3"
  - "Pantalla comparativa: columna por inmueble, filas de campos clave (precio o renta según operación, €/m², superficie, habitaciones, baños, planta, ciudad/zona, estado, portal); ausentes con em-dash"
  - "Mejor valor objetivo resaltado por fila (precio/€m² menor, superficie mayor)"
  - "Mezcla venta+alquiler permitida con aviso y filas de precio separadas"
  - "Tap en cabecera de columna abre la ficha (/property/[id])"
  - "Estados de carga y error con reintento"
  - "i18n ES+EN con claves tipadas; testIDs compare-*"
  - "tsc móvil 0 errores; tests del helper de comparación (€/m², resaltado) pasan"
archivos_reservados:
  - "AGENT_LOOP.md (claude, claim 074ce7e6)"
  - "apps/mobile/** (codex, task edit — nadie más edita código mientras)"
riesgos:
  - "Legibilidad <360px → 3 columnas con scroll horizontal, 2 cómodas (DeepSeek)"
  - "No chocar con long-press de edición → entrada por botón explícito Comparar (Codex)"
  - "Meta de lista sin planta/enlace → cargar detalle por id, 2-3 fetches secuenciales (Codex)"
fuera_de_alcance:
  - "Otros tipos de registro; compartir comparación; persistir selección; multi-portal; retirar tools muertos (limpieza aparte)"
resultado_pruebas: "typecheck móvil 0; npm test 502/502 (+8 sobre la base) — verificado por Codex Y por Claude en cada ronda"
revision_deepseek: "APROBADO (task 5aedf9e6) tras corrección ronda 1: 3 corregidos con regresión, 2 refutados con cita verificada honesta"
decision: INTEGRAR
siguiente_accion: "propietario: probar en dispositivo y /ship cuando decida; iteración 2 lista para arrancar"
```

### Fase 5-6 — Ataque y corrección ✅

DeepSeek (914a59fb): REVISAR, 0 bloqueantes, 5 importantes. Codex (87801dce),
ronda 1/3: €/m² por subconjunto de operación + etiqueta "€/m²·mes" (test),
parseCompareIds dedup/límite/filtrado de rancios (tests), a11y con
accessibilityState/Label + icono no-cromático para "mejor valor"; refutados
con cita: selección ya bloqueaba long-press/drag, scroll horizontal ya
contenido. Claude (producto) rechazó la normalización renta×12×multiplicador
de DeepSeek por indefendible. Re-revisión DeepSeek (5aedf9e6): APROBADO.

### Fase 7 — Validación de valor (Claude): INTEGRAR ✅

Los 8 criterios de aceptación se cumplen (verificados en código y suite).
Utilidad: convierte N aperturas de ficha + memoria en 1 pantalla; coherente
con el tema, i18n tipada, céntimos y el patrón de estados de la app; coste
futuro bajo (helper puro con 8 tests, cero dependencias nuevas). No integrado
a main todavía: commit/OTA son del propietario (/ship).

### Fase 8 — Cierre y aprendizaje

- Problema abordado: imposibilidad de comparar inmuebles guardados (promesa
  central sin UI).
- Cambio entregado: comparador 2-3 con selección en la home (working tree,
  9+6 ficheros, 502/502).
- Evidencia: tests del helper, criterios verificados, veredicto APROBADO.
- Validación pendiente con usuarios: uso real del botón Comparar (analítica
  candidata: evento compare_open con nº de seleccionados).
- Deuda introducida: ninguna dependencia nueva; pantalla compare sin flujo
  Maestro todavía (testIDs listos).
- Lecciones: (1) la documentación de pendientes estaba rancia — verificar
  SIEMPRE contra código antes de proponer; (2) el veredicto numérico de
  DeepSeek empataba, los desempates del loop decidieron bien; (3) dos bugs de
  infraestructura del runner (acreditación MCP y sandbox Windows) se llevaron
  más tiempo que el producto — ya arreglados y documentados; (4) needs_input
  es estado terminal para vigilantes.
- Siguiente oportunidad recomendada: instrumentar compare_open + flujo Maestro
  del comparador; después reevaluar multi-portal con la prueba de concepto que
  pide DeepSeek.

### Fase 4 — Implementación (Codex) ✅ 2026-08-07 (task b63ad232)

9 ficheros: entrada `compare-start` + modo selección con tope 3 en la home,
pantalla `app/property/compare.tsx` (carga por ids, estados carga/error/ids
insuficientes, aviso venta+alquiler mixto, mejor valor resaltado, tap → ficha),
helper puro `lib/records/compare.ts` con test, i18n ES/EN.
Nota de proceso: el intento 1 (77df1872) rebotó por un bug de infraestructura
del runner (sandbox Windows), arreglado y documentado fuera del loop.

## Iteración 1

### Fase 1 — Descubrimiento (Claude) ✅ 2026-08-07

Tres problemas con evidencia local. Dos candidatos previos se **descartaron por
evidencia** antes de proponerse (la documentación iba por detrás del código):

- ~~Formulario manual de inmueble~~ → ya existe (`app/property/form.tsx`, crear+editar con campos de alquiler).
- ~~Responder-cita en chat~~ → ya existe (`replyToId` en esquema y en el flujo de envío de `chat/[id].tsx`).

**P1 — No se pueden comparar los inmuebles guardados.**
Quién: quien decide compra/alquiler entre ≥2 candidatos guardados (caso de uso
central del producto). Cuándo: el momento de decidir. Qué impide: elegir con
confianza; hoy hay que abrir fichas en serie y memorizar cifras. Gravedad: la
propuesta de valor lo promete textualmente y no existe.

**P2 — La búsqueda va portal a portal, sin multi-selección.**
Quién: quien busca piso. Cuándo: fase de búsqueda (puerta de entrada). Qué
impide: ver la oferta completa sin repetir la búsqueda N veces. Evidencia:
decisión bcde28a1 (posibilidad futura registrada, no implementada).

**P3 — Herramientas anunciadas con banner "pendiente".**
Quién: quien abre el panel contextual de un inmueble. Qué impide: obtener lo
que la pantalla anuncia (Registro/INE); promesa rota visible. Evidencia:
comentario TODO en `app/tools/[tool].tsx` L13.

### Fase 2 — Priorización

**DeepSeek** (task 09d6ff17 ✅): multi-portal 3.33 · comparador 3.27 · tools
3.20. Matices: multi-portal puntúa alto en impacto/frecuencia pero confianza
2/5 y coste máximo (5+5+5), "exige prueba de concepto"; para el comparador
recomienda **empezar con 2 inmuebles**, venta/alquiler separados, tarjetas
apiladas con diferencias resaltadas; los banners de tools "podrían frustrar si
no llevan a nada".

**Codex** (task 6edcdd3b ⏳): viabilidad y cambio mínimo en curso.

**Claude**: con empate técnico (3.33 vs 3.27), aplican los desempates del loop:
más fácil de validar, más reversible y menor superficie → comparador. La regla
"más útil para el flujo principal" es la única discutible (búsqueda es puerta
de entrada, pero la misión del producto es decidir entre alternativas ya
guardadas). Pendiente de confirmar con la viabilidad de Codex.
