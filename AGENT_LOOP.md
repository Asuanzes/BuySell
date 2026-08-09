# AGENT_LOOP — Estado compartido del loop multiagente

> Documento único de coordinación (regla 10). Cada agente lo consulta y
> actualiza al intervenir. Historial de iteraciones al final.

## Estado actual — área MENSAJERÍA, iteración 2 CERRADA (INTEGRAR)

```yaml
area: mensajeria
iteracion: 2
fase: cerrado
responsable_actual: claude
momento_del_viaje: retomar la negociación desde la ficha del inmueble
problema_usuario: >
  "Qué se ha hablado" (P2 de la observación) no muestra lo hablado: la ruta
  filtra el último mensaje por contextType/contextId, pero ni los SYSTEM de
  precio ni el mensaje libre que acompaña la tarjeta llevan contextType →
  el preview casi siempre es el body de respaldo "📌 Título".
evidencia:
  - "src/app/api/properties/[id]/related-chats/route.ts:63-65 filtra por contextType"
  - "src/lib/chat/context-events.ts:141-143 y :191-193 crean esos mensajes SIN contextType"
  - "El docstring de la ruta (:15-16) promete lo contrario"
hipotesis: >
  Creemos que el dueño que retoma la decisión desde la ficha entenderá al
  instante el estado de cada conversación si el preview muestra el último
  mensaje real. Señal: related_chat_open {has_preview} + % con preview.
mejora_seleccionada: >
  Read-side (write-side DESCARTADO: estampar contextType en el mensaje libre
  haría que el cliente lo pinte como tarjeta, [id].tsx:1820-1832). Preview =
  último mensaje real por conversación con TRES filtros de privacidad
  acordados: solo conversaciones donde sigo activo (leftAt null), mensajes
  con createdAt >= mi joinedAt, deletedAt null. Sin ventana global take:200
  (una conversación hiperactiva expulsaría a las demás — hallazgo Codex).
  messagePreview reutilizado. + evento related_chat_open {has_preview}.
criterios_aceptacion:
  - "Conversaciones abandonadas no aparecen; preview respeta joinedAt y deletedAt"
  - "Último mensaje exacto por conversación; DTO shape intacto"
  - "related_chat_open {has_preview} sin PII con guard anti doble-tap por foco"
  - "docstring honesto; fila+SQL en ANALITICA.md (Claude); tsc web+móvil 0; npm test 0 fallos"
revision_deepseek: "pre-construcción CONTINUAR con condiciones (311a7b02: filtros leftAt/joinedAt exigidos — incorporados) → ataque post-impl APROBADO, 0 bloqueantes, 0 importantes, 3 opcionales de escala aceptados como riesgo bajo (3fe69132)"
resultado_pruebas: "tsc web 0 · tsc móvil 0 · npm test 504/504 — verificado por Codex y por Claude"
decision: INTEGRAR
siguiente_accion: "propietario: /ship (API por push a main + OTA móvil; iter1 e iter2 salen juntas); tras unos días, SQL de related_chat_open (pct_con_preview) y chat_card_open en ANALITICA.md"
riesgos_aceptados:
  - "Sin tope en convIds para el Promise.all de findFirst: la cuota de compartir (20/h) y el dominio (pocas conversaciones por ficha) lo acotan; revisar si crece"
  - "DIRECT cuyo otro participante se fue: título — y avatar null (comportamiento previo, sin regresión)"
```

### Iteración 2 (mensajería) — historia

- Priorización heredada de la observación de iter1 (P2 > P3 en las tablas de
  Claude y DeepSeek). Diseño Claude: read-side; write-side descartado con
  evidencia (el cliente pinta como tarjeta cualquier mensaje con contextType,
  [id].tsx:1820-1832). Convergencia a tres bandas en los filtros de privacidad:
  Claude (lectura de ruta), DeepSeek (condiciones pre-construcción 311a7b02) y
  Codex (bloqueante de su análisis 45a86d2d) exigieron independientemente
  leftAt/joinedAt.
- Implementación (Codex 66bea493 + 6a60c7cc): participante activo obligatorio,
  findFirst exacto por conversación (sin ventana global — hallazgo Codex:
  una conversación hiperactiva expulsaba a las demás del take:200),
  messagePreview reutilizado (media sin body ya no sale como "sin mensajes"),
  docstring honesto, evento related_chat_open {has_preview} con lock por foco.
  Claude aplicó fila+SQL en ANALITICA.md.
- Ataque (DeepSeek 3fe69132): APROBADO sin bloqueantes ni importantes a la
  primera — las condiciones pre-construcción ya estaban dentro.
- Aprendizaje: (1) pedir a DeepSeek "texto plano sin JSON" evita el
  needs_input espurio del wrapper; (2) imponer la revisión pre-construcción
  (fase 4) hizo que el ataque saliera limpio a la primera — el coste se paga
  antes o después, y antes es más barato; (3) el preview honesto convirtió
  además un bug latente de privacidad (conversaciones abandonadas listadas) en
  mejora de seguridad.

## Área mensajería — iteración 1 CERRADA (INTEGRAR)

```yaml
area: mensajeria
iteracion: 1
fase: cerrado
responsable_actual: claude
momento_del_viaje: retomar una negociación / entender el anuncio en el chat
problema_usuario: >
  La tarjeta y el banner de un inmueble en el chat no muestran el estado de la
  operación (RESERVED/SOLD/WITHDRAWN/RENTED): property es el único tipo con
  estado rico en BBDD y el único cuya tarjeta no lo enseña (book/holiday/job sí).
  Quien retoma una conversación decide sobre información caduca; el SYSTEM de
  "VENDIDO" queda enterrado por el scroll.
evidencia:
  - "src/lib/chat/context.ts:39-74 fetchCard property: select sin status; meta solo hab/baños"
  - "src/lib/chat/context.ts:105-138 book/holiday/job SÍ seleccionan status y lo pintan en meta"
  - "prisma/schema.prisma:30-39 PropertyStatus con 6 estados; el bot ya los edita (bot-tools.ts:239-252)"
  - "Tarjeta VIVA: se re-resuelve en cada GET /messages => fix retroactivo a tarjetas ya compartidas"
  - "Codex f87eb8fa (bloqueante): el banner móvil solo pinta title+subtitle ([id].tsx:951-959); RecordCardBubble sí pinta meta (:1524-1527)"
usuarios_afectados: ["quien comparte/recibe fichas de inmueble en el chat y retoma la conversación días después"]
hipotesis: >
  Creemos que quien retoma una conversación sobre un inmueble podrá decidir sin
  información caduca durante la negociación si la tarjeta y el banner muestran
  el estado de la operación. Ventaja Nidokey: la ficha viva compartida es su
  diferencial y ningún chat genérico refleja el estado real del anuncio. Señal:
  chat_card_open {record_type, status_shown} + test unitario de la etiqueta.
mejora_seleccionada: >
  (1) Servidor: status en fetchCard property + etiqueta SOLO estados no activos
  (Reservado/Vendido/Retirado/Alquilado) en meta + statusShown?: boolean aditivo
  en el DTO + test unitario 6 estados. (2) Móvil: banner renderiza meta
  (hallazgo Codex) + espejo DTO + evento chat_card_open {record_type,
  status_shown} con guard anti doble-tap, sin PII, sin evento en tarjeta
  eliminada/sin acceso. Puntuación: Claude P1=48 P2=11 P3=10; DeepSeek P1=48
  P2=8.2 P3=6.7, veredicto CONTINUAR (e7193ea5).
diferenciacion: >
  Paridad interna en lo técnico, diferencial en lo funcional: la tarjeta viva
  con estado real del anuncio dentro de la conversación no existe en chats
  genéricos (principio 2 del loop: saber en qué estado está la operación).
criterios_aceptacion:
  - "Etiqueta solo para RESERVED/SOLD/WITHDRAWN/RENTED; FOR_SALE/FOR_RENT/null/legacy sin etiqueta (tarjeta idéntica a hoy)"
  - "Banner de conversación vinculada renderiza meta cuando existe"
  - "statusShown?: boolean aditivo en DTO servidor y espejo móvil"
  - "chat_card_open {record_type, status_shown} solo en apertura real, guard anti doble-tap, sin ids/títulos/urls/ciudad"
  - "Test unitario de los 6 estados + null; reglas de acceso (sharedAccess) intactas"
  - "tsc web+móvil 0; npm test 0 fallos"
  - "Entrada de catálogo + SQL en docs/ANALITICA.md (aplica Claude, claim 4f4d9e88)"
metrica_principal: "chat_card_open: volumen y % con status_shown=true (engagement con tarjetas y prevalencia del estado)"
metricas_guardarrail: ["crash/render de tarjeta y banner", "volumen anómalo de eventos (doble-tap)", "bloqueos/denuncias sin cambio"]
archivos_reservados:
  - "AGENT_LOOP.md (claude, claim 2bace513)"
  - "docs/ANALITICA.md (claude, claim 4f4d9e88)"
  - "src/lib/chat/** (codex, task edit be4d36e6)"
  - "apps/mobile/** (codex, task edit 7e05de8a)"
riesgos:
  - "Etiqueta server-side en castellano: deuda i18n de DTO ya documentada (MENSAJERIA.md:218), aceptada por coherencia con book/holiday/job"
  - "Incoherencia RENT+«En venta» imposible por diseño: los estados activos no llevan etiqueta"
resultado_pruebas: "tsc web 0 · tsc móvil 0 · npm test 504/504 (+2 nuevos) — verificado por Codex y por Claude en implementación Y en corrección r1"
revision_deepseek: "pre-construcción CONTINUAR (e7193ea5) → ataque APROBADO con recomendaciones (b6973f30: 0 bloqueantes, 2 importantes aceptados, 3 refutados con evidencia) → corrección r1 Codex (7061fc94 lock centralizado, 14110f94 etiqueta primero) → re-revisión APROBADO, hallazgos restantes: ninguno (d3c5a7fd)"
decision: INTEGRAR
siguiente_accion: "propietario: /ship cuando decida (API por push a main + OTA móvil); tras unos días, correr el SQL de chat_card_open de docs/ANALITICA.md (% con status_shown) para validar la hipótesis"
fuera_de_alcance:
  - "Ofertas estructuradas (vetadas: MENSAJERIA.md:122-127, sin rail C2C)"
  - "P2 related-chats preview '📌 Título' y P3 bloqueo en reacciones/read → candidatos iter2/iter3"
  - "Anti-fraude de enlaces; URLs planas no pulsables; Maestro para tarjetas"
```

### Iteración 1 (mensajería) — historia

- Implementación (Codex be4d36e6 servidor + 7e05de8a móvil, en paralelo con
  ámbitos disjuntos y contrato DTO fijado por adelantado): helper puro
  `propertyStatusLabel` (solo estados no activos), `status` en el select,
  `statusShown?: boolean` aditivo, banner con `meta`, evento `chat_card_open`,
  test de 6 estados + null. Claude aplicó docs/ANALITICA.md (fila + SQL) y de
  paso corrigió el catálogo `bot_message_sent`→`bot_message` (el código emite
  `bot_message` desde servidor; renombrar el código dejaría huérfano el
  histórico).
- Ataque (DeepSeek b6973f30): APROBADO con recomendaciones. Aceptados: unlock
  por timeout reabría ventana de evento duplicado; useFocusEffect por burbuja
  = coste innecesario; etiqueta al final de meta truncable. Refutados con
  evidencia: taps mismo-frame (ref síncrona), caché del serializador (no
  existe), flush en beforeRemove (cola a nivel de módulo).
- Corrección r1 (Codex): lock único a nivel de pantalla con reset solo por
  foco + comparador del memo de Bubble ampliado con statusShown; etiqueta
  primero ("Vendido · 3 hab · 2 baños"). Re-revisión (d3c5a7fd): APROBADO,
  ninguno restante.
- Validación (Claude): 7/7 criterios cumplidos; INTEGRAR. Working tree, sin
  commit: /ship es del propietario.
- Aprendizaje: (1) el fix es retroactivo gratis porque la tarjeta es viva —
  elegir mejoras sobre datos re-resueltos multiplica el valor; (2) fijar el
  contrato DTO por adelantado permitió dos tasks Codex en paralelo sin
  conflicto; (3) la etiqueta al final de un texto truncable es un anti-patrón
  — lo importante primero; (4) el runner de DeepSeek marca needs_input si la
  entrega envuelve JSON — pedir "texto plano, sin JSON" en las instrucciones.
- Siguiente fricción detectada (backlog priorizado): P2 "Qué se ha hablado"
  enseña "📌 Título" en vez del último intercambio; P3 bloqueo incompleto en
  reacciones/read-notify; URLs planas no pulsables + cero anti-fraude;
  cero analítica de chat (chat_message_sent/conversation_created/record_shared);
  notifyShare() muerto; textos SYSTEM sin i18n.

### Observación (Claude) — 3 fricciones auditadas ✅ 2026-08-08

Auditoría de punta a punta con 3 exploradores (UX móvil, backend, huecos de
negociación). Base: `docs/MENSAJERIA.md` es fiel al código salvo matices; la
mensajería ya tiene banner de contexto, eventos SYSTEM de precio/VENDIDO,
responder-cita, edición, búsqueda por conversación y denuncias con snapshot.
**P1** estado invisible en tarjeta property (elegido). **P2** "Qué se ha
hablado" enseña "📌 Título" en vez del último intercambio (los SYSTEM y el
mensaje libre se crean sin contextType — related-chats/route.ts filtra por él).
**P3** bloqueo incompleto: reactions/route.ts sin check de bloqueo (y
read/route.ts notifica); el share/route.ts:86-90 documenta ese mismo gotcha.
Hallazgos extra para el backlog: cero analítica de chat; `bot_message` (código)
vs `bot_message_sent` (catálogo); `notifyShare()` del bot es código muerto;
ningún flujo móvil crea `Conversation.contextType` (banner sin productor);
URLs planas no pulsables; forward/transcribe NO existen (memoria del 21-jul
incorrecta); gateway del VPS pendiente de redeploy manual (hardening).

## Área comparador — iteración 2 CERRADA (INTEGRAR, commit 54a8f54)

```yaml
iteracion: 2
estado: implementacion
responsable_actual: codex
problema_usuario: >
  La hipótesis de la iteración 1 (el comparador ayuda a decidir) no tiene
  señal observable: sin instrumentación no sabremos si se usa. Además, el
  panel del inmueble ofrece herramientas (Registro/INE) que solo llevan a
  banners "pendiente" — promesa rota visible.
evidencia:
  - "AGENT_LOOP.md iter1 fase 8: 'Validación pendiente con usuarios: uso real del botón Comparar'"
  - "Codex f80c615f: compare.tsx sin analytics; punto limpio de emisión = openCompare() en index.tsx:157-160; ANALITICA.md exige catalogar"
  - "lib/records/tools.ts:39-40 marca Registro/INE enabled:true; tools/[tool].tsx:10-13 admite que son placeholders"
hipotesis: >
  Creemos que el equipo podrá validar (o refutar) el valor del comparador si
  instrumentamos compare_open con el nº de seleccionados. Lo consideraremos
  válido cuando el evento aparezca en AnalyticsEvent con count correcto y el
  flujo Maestro compare.yaml sea reproducible.
incremento_elegido: >
  (1) Evento compare_open {selected_count} emitido en openCompare() + entrada
  en docs/ANALITICA.md + flujo Maestro compare.yaml. LIMPIEZA COMPLEMENTARIA
  acotada (eliminación, no funcionalidad nueva — regla 6 respetada): retirar
  Registro/INE del panel de tools. Acordado: DeepSeek 41,7 vs 20,0 vs 2,2
  (295e40af); Codex recomienda (1) con emisión en openCompare y sin PII
  (f80c615f). POC multi-portal POSPUESTA formalmente.
criterios_aceptacion:
  - "compare_open se emite UNA vez por apertura real (en openCompare, no en useEffect), props solo {selected_count: 2|3}, sin ids/títulos/urls"
  - "Entrada de catálogo para docs/ANALITICA.md redactada (la aplica Claude: docs está fuera del workspace de Codex)"
  - "Flujo Maestro apps/mobile/.maestro/compare.yaml con los testIDs compare-* + README actualizado"
  - "Panel del inmueble sin Registro/INE (tools.ts); tools/[tool].tsx queda como fallback no enlazado"
  - "tsc móvil 0; npm test 0 fallos"
archivos_reservados:
  - "AGENT_LOOP.md (claude, claim 93ae2bb5)"
  - "docs/ANALITICA.md (claude, claim e9bb9f06)"
  - "apps/mobile/** (codex, task edit)"
riesgos:
  - "Evento duplicado por doble tap → RESUELTO: compareOpenLockedRef + reset por useFocusEffect (corrección ronda 1)"
resultado_pruebas: "typecheck 0; npm test 502/502 — verificado por Codex y Claude en implementación y en corrección"
revision_deepseek: "ataque REVISAR (ca9471fb: bloqueante doble-tap, cazado precisamente porque Maestro no cuenta eventos) → corrección Codex (43a78be1) → re-revisión APROBADO (c1696220)"
decision: INTEGRAR
siguiente_accion: "propietario: /ship cuando decida; tras unos días, correr el SQL de compare_open de docs/ANALITICA.md para validar la hipótesis de iter1"
```

### Iteración 2 — historia

- Implementación (Codex 0dfdda98): compare_open en openCompare() con
  {selected_count} sin PII; Registro/INE eliminados del panel (mortgage
  intacto, [tool].tsx como fallback); .maestro/compare.yaml (index 0/1
  correcto) + README; texto de catálogo entregado y aplicado por Claude en
  docs/ANALITICA.md (fila + SQL de uso) respetando el workspace de Codex.
- Ataque (DeepSeek ca9471fb): REVISAR — doble tap duplicaría el evento y el
  flujo Maestro no lo detectaría. Corrección (Codex 43a78be1): lock por ref
  con reset al foco (determinista, permite reaperturas legítimas).
  Re-revisión (c1696220): APROBADO, cobertura del camino completo verificada.
- Validación (Claude): los 5 criterios cumplidos; INTEGRAR.
- Cierre y aprendizaje: la validación del valor ya no depende de opiniones —
  el SQL del catálogo responde con datos; deuda: claves i18n huérfanas de
  registro/ine (aceptado, limpieza futura); lección: el ciclo completo de la
  iteración 2 costó ~20 minutos de pared con el pipeline sano — el cuello de
  botella de la iteración 1 fue la infraestructura, no el proceso.

## Iteración 1 — CERRADA (INTEGRAR, commit f8ecd1b)

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
