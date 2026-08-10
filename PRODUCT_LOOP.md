# PRODUCT_LOOP.md — Loop maestro multiagente de producto

> Documento único de coordinación (Claude Code = producto, Codex = técnica,
> DeepSeek = crítica). Leer antes de trabajar, actualizar al terminar.
> Norma de estrategia: `docs/MODELO-NEGOCIO.md`.

```yaml
ciclo: 6
fase_global: implementacion
iteracion: C6i1 (checklist real; CICLO 5 cerrado)
responsable: claude

area_actual: auditoría de las 9 categorías (COMPLETADA, pendiente de autorización del propietario)
categoria_actual: todas
tipo_de_usuario: todos
problema: decidir con evidencia qué categorías se mantienen, mejoran, fusionan, sustituyen o eliminan
evidencia:
  - matriz cuantitativa de 12 dimensiones (abajo)
  - auditoría técnica Codex con citas (task f884cd48) y veredictos DeepSeek (task 1f39ac54)
hipotesis: 2 categorías núcleo (property, chat), 3 de apoyo, 4 a transformar o apagar

decision_categoria:
  estado: decidida (ver listas); eliminar/apagar requiere autorización expresa del propietario

mejora_actual: ninguna (auditoría, no implementación)
conexion_con_otras_areas: [todas]
diferenciacion: dirección "expediente vivo de decisiones" aplicada como filtro
modelo_de_monetizacion: sin cambios respecto a 1.5

criterios_de_aceptacion:
  - cada categoría tiene puntuación, veredicto de los 3 agentes y decisión
  - plan de migración flags-first sin pérdida de datos
metrica_principal: n/a
metricas_guardarrail: []

archivos_reservados: [PRODUCT_LOOP.md]
riesgos: ejecutar todos los cambios a la vez fragmenta la percepción (DeepSeek); ver plan faseado
pruebas: n/a (sin cambios de código)
revision_deepseek: entregada (task 1f39ac54)
decision_final: AUTORIZADO por el propietario (2026-08-09) — fase 0 food OFF y fase 1 workout fuera del selector
fase_0_estado: IMPLEMENTADA Y DESPLEGADA (main 2866cc7 + e0ed36e; 509 tests; gasto Apify cortado)
ciclo_3_estado: COMPLETADO (4 pilares, 7 recorridos, conexiones, arquitectura en capas, límites)
ciclo_4_estado: paquete COMPLETO en main y OTA (fases 0-1 + M1 + MI1 + M2 + M4 + R1v1 + M3 + M5 + MI2); 577 tests, evals bot 15/15
coordinacion: Claude coordina y delega en DeepSeek; Codex editor principal vía HANDOFF (30 tareas Codex + 22 DeepSeek en la sesión)
ciclo_5_estado: CERRADO (mensajería como sistema de operaciones); 608 tests, evals bot 53/53
ciclo_6_estado: EN CURSO — C6i1 checklist real (servidor Codex `bfbb83ed` + móvil de DeepSeek `dd76931b` ya integrado)
deepseek_capacidades: AMPLIADAS a escritura de CÓDIGO PROPUESTO (el propietario autorizó «TODO»); entrega ficheros completos que revisa e integra Claude
siguiente_accion: cerrar C6i1 (contrato del servidor + montaje en la ficha + prompt que resume y enlaza), luego notas por ficha/conversación y alerta-desde-chat; después 7, 8 y 9
```

---

## CICLO 1 — Entregables

### 1. MAPA_PRODUCTO (Claude)

Navegación: 5 tabs — Registros (`/`), Buscar (`/search`), Importar (FAB `+`),
Duplicados (`/matches`), Cuenta (`/account`). El resto son stacks.

| Área | Rutas | Usuario | Objetivo | Estado | Fricciones / conexiones |
| --- | --- | --- | --- | --- | --- |
| Inicio (registros) | `(tabs)/index` | recurrente | ver todo lo que sigue, por categoría | **completa** (FlatList virtualizada) | conecta con todas las fichas; categorías off ocultables en `category-settings` |
| Búsqueda | `(tabs)/search` | comprador/interesado | buscar registros propios + búsqueda externa (inmuebles multiportal, alquiler) | **completa** | búsqueda externa solo inmuebles; resto de verticales sin descubrimiento |
| Importar | `(tabs)/importar`, `listing/preview`, share-sheet, `scan-book`, `property/form`, `viajes/nuevo` | nuevo/recurrente | crear registro desde URL de portal, ISBN, escáner, formulario | **completa** | entrada principal del producto; share-sheet iOS sin App Group aún |
| Duplicados | `(tabs)/matches` | recurrente | fusionar registros duplicados (suggest-only) | **completa** | dedup híbrido, cruza idiomas |
| Fichas de registro | `property/[id]` (+`compare`), `crypto/[id]`, `market/[id]`, `book/[id]`, `job/[id]`, `holiday/[id]`, `trends/[id]`+`article` | todos | seguir precio/estado, comparar, decidir | **completa** en 7 verticales | property es la más rica: comparador, "Qué se ha hablado", anuncios vinculados, precio en tu zona, recheck |
| Mensajería | `chat/[id]`, `contacts`, `new`, `new-group`, `add-members/[id]`, `info/[id]`, `blocked` | todos | conversar 1:1/grupo, compartir registros, bot @Nidokey | **completa** (F5 grupos hecho) | falta responder-cita y picker emoji; bloqueo y reporte existen |
| Compartidos | `shares`, `shared`, `my-shares` | recurrente | ver lo compartido conmigo / por mí, retirar | **completa** | puente registros↔chat |
| Comida (3 actores) | `food/*` (8 pantallas: carrito, checkout, pedidos, courier, panel restaurante) | cliente/repartidor/restaurante | pedido a domicilio completo | **completa pero fuera del caso económico** | ~25 rutas API; menús cuestan dinero (Apify); pagos provider fake |
| Herramientas | `tools/mortgage`, `tools/[tool]` (registro, ine) | comprador inmueble | calcular hipoteca; consultar Registro/INE | mortgage **completa**; registro+ine **prototipo** (solo UI, banner "pendiente") | promesa visual sin lógica |
| Cuenta y ajustes | `(tabs)/account`, `theme-settings`, `category-settings`, `notification-settings`, `export-data`, `premium`, `login`, `onboarding` | todos | identidad, tema, notificaciones, RGPD, suscripción | **completa** (rediseño visual detenido esperando propuesta DeepSeek) | RGPD: borrado + export en app |
| Alertas de precio | sin pantalla propia: se crean en fichas, llegan como DM del bot + push | recurrente | avisos de umbral cripto/mercado/inmuebles | **completa** | 3 gratis / 25 Premium; sin lista central de alertas activas |
| Web | `src/` landing + API | visitante | descargar la app | **rota a propósito** (`<ComingSoon/>` sin flip) | adquisición bloqueada hasta lanzamiento |

Recorridos por tipo de usuario:

- **Visitante**: solo landing ComingSoon → sin recorrido (bloqueado a propósito).
- **Nuevo**: login OTP → onboarding → importar primer registro. Completo.
- **Comprador/interesado**: buscar → importar → ficha → comparar → alertas → chat. El recorrido más completo del producto (solo inmuebles).
- **Vendedor/anunciante**: **no existe como rol** salvo panel de restaurante en food. Nidokey es "seguidor", no marketplace.
- **Recurrente**: home → cambios de precio → chat/alertas. Completo.
- **Profesional**: sin diferenciación (Premium solo sube cuotas).
- **Bloqueado/restringido**: bloqueo de chat completo (`chat/blocked`); cuotas con mensajes de límite.
- **Admin/moderador**: **no existe**. Los reportes de chat (`api/chat/reports`) caen en BBDD sin panel ni flujo de resolución.

### 2. INVENTARIO_DE_CATEGORIAS (Claude)

| Vertical | Problema real que resuelve | Estado | Conexiones | ¿Monetiza? | Nota para el debate |
| --- | --- | --- | --- | --- | --- |
| `property` | seguir precio/estado de inmuebles en varios portales, comparar, coordinar visita | completa, la más profunda | chat, alertas, compartir, herramientas, comparador | cuotas + Premium | **núcleo diferencial** de facto |
| `crypto`/`market` | seguir precios sin app de broker | completa | alertas, chat | Premium (alertas) | genérica: cualquier app lo hace |
| `book` | wishlist/seguimiento de libros por ISBN | completa | compartir, dedup, chat | no | débil en monetización; ¿colabora con ≥2 áreas? |
| `job` | seguir candidaturas multiportal sin cuentas | completa | cuotas free/premium | cuotas | keyless frágil (Jina/Cloudflare) |
| `holiday` | coste total verificable de un viaje | completa | chat, compartir | **afiliación** (única monetización directa por transacción) | motor propio real (Duffel+SSE) |
| `food` | pedido a domicilio 3 actores | completa | chat/gateway | no (pagos fake) | **fuera del caso económico + coste Apify**; candidata a congelar |
| `trends` | radar de tendencias keyless | completa | chat (bot) | no | ¿aporta al "seguir decisiones" o es feed genérico? |
| `workout` | — | **esqueleto** (`enabled:false`, "próximamente") | ninguna | no | candidata a eliminar del selector |
| `chat` | coordinar decisiones sobre registros con personas + bot | completa | TODAS (es el tejido conectivo) | cuota bot 40/400 | junto a property, el otro pilar diferencial |

### 3. INVENTARIO_DE_MONETIZACION (Claude)

| Mecanismo | Estado | Riesgo |
| --- | --- | --- |
| Premium 4,99 €/mes (checkout web Stripe test-mode, webhook-first, entitlements server-side) | rail completo, **APAGADO en prod** (falta `PAYMENT_WEBHOOK_SECRET`) | paywall visible que no cobra |
| Paywall móvil `premium.tsx` | hecho | vender in-app sin IAP = **violación de políticas Apple/Google**; RevenueCat pendiente |
| Cuotas free/Premium (bot 40→400, empleos 10→40, vuelos 50/día, OTP, Places) | en producción (`RateLimit` + `rate-limit.ts`) | ¿el free es un producto usable o un demo capado? (pregunta a DeepSeek) |
| Alertas 3 gratis / 25 Premium | en producción | idem |
| Afiliación viajes (Aviasales marker 536869 + Nuitee white-label, `/go`) | en producción | única monetización por transacción; sin datos de conversión aún |
| Analítica propia (`AnalyticsEvent`, embudo en `docs/ANALITICA.md`) | en producción | sin dashboard de lectura; el embudo se consulta por SQL |
| Coste operativo sin ingreso: Apify/Firecrawl (food), Duffel (vuelos), Anthropic (bot) | vivo | food quema saldo estando fuera del caso económico |

### 4. LISTA_DE_FLUJOS_ROTOS (Claude; DeepSeek ampliará)

1. **Adquisición**: landing web = ComingSoon; Android no está en Play → un visitante no puede instalar la app por ningún canal público.
2. **Pago**: paywall → checkout que no cobra (pagos apagados en prod).
3. **Tiendas**: si se lanza con checkout web para Premium in-app → rechazo/expulsión (falta IAP).
4. **Moderación**: reportar en chat escribe en BBDD y muere ahí; no hay panel, ni notificación al moderador, ni feedback al denunciante.
5. **Promesa sin lógica**: `tools/registro` y `tools/ine` son pantallas de diseño con banner "pendiente".
6. **Categoría fantasma**: `workout` aparece como "próximamente" sin plan detrás.
7. **Alertas sin centro**: no hay pantalla que liste todas las alertas activas del usuario (se gestionan ficha a ficha).
8. **Share Extension iOS**: App Group sin provisionar → compartir-a-Nidokey incompleto en iOS.
9. **Menores chat**: sin responder-cita ni picker emoji (prometidos en backlog desde jun-2026).
10. **Descubrimiento asimétrico**: búsqueda externa solo existe para inmuebles; el resto de verticales solo "siguen" lo que el usuario trae.

### 5. LISTA_DE_DEUDA (semilla Claude; Codex completará)

- `docs/blitzy-tech-spec.md` + `ROADMAP.md` describen otra app (histórico, confunde).
- `Caddyfile` residuo (VPS usa nginx+certbot); Docker de Crawl4AI posiblemente vivo en el VPS (apagar).
- `strip-aps` residuo del flujo iOS local.
- npm audit: vulns altas restantes → subida del toolchain Expo pendiente.
- Working tree con loop de mensajería integrado sin shippear (`AGENT_LOOP.md` + 10 ficheros modificados, `context.test.ts` nuevo sin commitear).
- Food: ~25 rutas API + 8 pantallas de mantenimiento para un vertical fuera del caso económico.

### 6. MAPA_TECNICO (Codex — task `deb0acf1`, ENTREGADO)

Validación del estado actual: `typecheck:mobile` OK + **504 tests OK**.
Hallazgos con cita (severidad Codex):

| Sev | Hallazgo | Evidencia |
| --- | --- | --- |
| BLOQUEANTE | `food` está activa y transaccional en la app pese a estar excluida del roadmap comercial | `apps/mobile/lib/records/config.ts:52`, `(tabs)/index.tsx:53`, `food/checkout.tsx:41` vs `docs/MODELO-NEGOCIO.md:43` |
| BLOQUEANTE (pagos) | El checkout de food limpia el carrito y navega tras `openAuthSessionAsync` **sin comprobar cancelación/éxito** | `apps/mobile/app/food/checkout.tsx:50` |
| ALTO | Premium abre checkout web desde la app; las tiendas exigen IAP | `apps/mobile/app/premium.tsx:70`, `docs/OPERACIONES.md:187,238` |
| ALTO | Viajes abre `affiliateUrl` sin tracking de atribución → ingresos de afiliado no medibles | `apps/mobile/app/holiday/[id].tsx:159` vs `docs/MODELO-NEGOCIO.md:160` |
| MEDIO | Las prefs de categoría permiten dejar visible solo `workout` (categoría no usable) | `apps/mobile/lib/records/category-prefs-context.tsx:106,129` |
| MEDIO | El chat navega a `/${type}/${id}` sin whitelist local de tipos | `apps/mobile/app/chat/[id].tsx:203,951` |

Pruebas que Codex propone añadir: cancel/dismiss en food checkout; última
categoría usable; Premium web-vs-IAP por canal; tracking de clicks de afiliado.

### 7. AUDITORIA_CRITICA (DeepSeek — tasks `5dd022c5` + `908cc01b`, ENTREGADA)

**Veredicto por vertical**: property **APROBADO** · chat **APROBADO** ·
crypto/market **REVISAR** · holiday **REVISAR** · job **REDUCIR** (scrapers
frágiles; empezar por seguimiento manual) · book **FUSIONAR** (en "seguimiento
de objetos con precio") · trends **FUSIONAR** (con crypto/market como
"seguimiento de índices") · food **DESCARTAR** · workout **DESCARTAR**.

**Modelo mental**: "registros multi-vertical" no lo entiende nadie; la metáfora
debería ser "lo que sigues". El chat confunde: en property parece parte del
registro ("Qué se ha hablado") y en el resto de verticales no existe ese puente.

**Estados no contemplados**: vacíos por pantalla, permisos denegados, cuenta
suspendida, offline/caché, y pantalla de cuota agotada con camino de upgrade.

**Privacidad/abuso**: riesgo de leak en "Qué se ha hablado" sobre fichas
compartidas; compartir sin confirmación de alcance de exposición; bot de
escritura sin límites contextuales por chat/grupo ni **registro de auditoría**
de sus acciones (mitigación: permisos granulares + confirmación con registro,
campo y valor propuesto).

**Monetización**: Premium 4,99 corrige **fricción artificial** (multiplicar
cuotas = demo capado, no producto). Vender en su lugar: exportación/sync
avanzada, IA contextual (análisis y resúmenes del bot, no solo escritura),
colaboración en grupo con permisos. Free con cuotas generosas para lo básico.

**Diferenciación**: lo genérico = chat, alertas, temas, búsqueda. El núcleo
defendible = **unificar verticales heterogéneas en un solo modelo mental con un
bot que entiende el contexto de cada tipo de entidad** y puede cruzar patrones
entre verticales.

**TOP 3 RIESGOS ESTRUCTURALES**
1. La fricción artificial del free mata el growth loop.
2. Verticales solapadas generan inconsistencia en modelo de datos y confusión.
3. Dependencia de afiliación externa de margen bajo como única monetización transaccional.

**Dirección estratégica (3 frases)**: Rediseñar el free como producto usable y
monetizar valor añadido (exportación, IA, colaboración). Enfocar el desarrollo
en el núcleo diferencial: modelo unificado de registros con bot que genere
insights cruzados. Eliminar duplicidades de verticales y priorizar calidad
sobre cantidad.

---

## CICLO 1.5 — Debate obligatorio (COMPLETADO 2026-08-09)

### Ronda 1 — Propuestas independientes (15)

**Claude** (panel 3 lentes + juez interno, workflow `wf_cb461433`):
C1 Centro «Qué ha cambiado» (timeline cruzado determinista de rechecks+alertas+compartidos) ·
C2 Puente universal ficha↔chat (generalizar «Qué se ha hablado» a todo BaseRecord) ·
C3 Resumen de cambios como Premium honesto (deltas deterministas, narración IA opcional) ·
C-RAD Home por Decisiones (entidad que agrupa registros multi-vertical, faseada) ·
C-MON CommercialAction (/go + attributionId + disclosure + resultado, viajes primero).

**Codex** (task `b8078ade`):
X1 Espacios de Decisión Live (registros+participantes+criterios+alertas+estado) ·
X2 Copiloto de Cambios y Próximo Paso · X3 Libro de Señales Propias (dashboard cohortes) ·
X-RAD Modo Agente Negociador · X-MON Atribución de Intención Alta (eventos server-side).

**DeepSeek** (tasks `c81cff7a`+`96ab0211`+`d35b4b3d`):
D1 Radar de oportunidades (señales con decaimiento temporal) ·
D2 Historia viva (timeline por registro con eventos automáticos y sociales) ·
D3 Abogado del diablo (tarjeta contrapunto en el comparador) ·
D-RAD Trust Layer (pasaporte de datos cedible con consentimiento) ·
D-MON Visita Coordinada (modo venta: bot coordina visitas/documentación).

### Ronda 2 — Matriz de veredictos cruzados

| Propuesta | Codex | DeepSeek | Claude |
| --- | --- | --- | --- |
| C1 Centro «Qué ha cambiado» | APROBADO (coste S) | APROBADO | — |
| C2 Puente ficha↔chat | REVISAR (capa genérica + fallback, no sustituir) | REVISAR (ídem) | — |
| C3 Resumen Premium | REVISAR (EventLog primero, coste IA capado) | REVISAR (fusionar con X2) | — |
| C-RAD Home Decisiones | REDUCIR (modelo polimórfico; v1 sin comparador/personas) | FUSIONAR con X1 | — |
| C-MON CommercialAction | APROBADO (coste S, incremental) | REVISAR (solo viajes al inicio) | — |
| X1 Espacios Decisión | — | APROBADO (núcleo tras fusión con C-RAD) | REDUCIR (v1 = agrupar+cambios; defendible solo si se auto-alimenta de trackers) |
| X2 Copiloto | — | FUSIONAR con C3 | APROBADO (núcleo determinista, IA solo redacta, coste capado) |
| X3 Libro de Señales | — | REDUCIR (3-4 KPI) | REDUCIR (queries SQL versionadas + npm, sin UI ni auth nueva) |
| X-RAD Agente Negociador | — | **DESCARTAR** | **DESCARTAR** (IA sin fallback en daño económico; §5.2 lo valora en 0 €) |
| X-MON Atribución | — | REDUCIR (2 eventos) | REVISAR (realinear con taxonomía §8 del modelo; postback como verdad) |
| D1 Radar | REDUCIR (sin tuning adaptativo; PriceAlert no cubre todo) | — | FUSIONAR en Resumen §4.2 (el ranking mal calibrado entierra el cambio real) |
| D2 Historia viva | FUSIONAR (vista por ficha del mismo EventLog) | — | APROBADO (condición: privacidad de menciones sociales; timeline honesto) |
| D3 Contrapunto | REVISAR (provenance del texto LLM) | — | REDUCIR (sin 3+3+3 fijo que obligue a alucinar; solo datos del usuario; sin cuota propia) |
| D-RAD Trust Layer | **DESCARTAR** (fuera de arquitectura y consentimiento; RGPD) | — | **DESCARTAR** (vende la confianza que es la unidad de valor; mercado inexistente a escala 0) |
| D-MON Visita Coordinada | REDUCIR (presupone rol vendedor inexistente) | — | REDUCIR (lado comprador; la contraparte no está en la plataforma) |

Regla «cada agente descarta o reduce al menos una»: Codex ✔ (D-RAD, C-RAD, D1, D-MON) ·
DeepSeek ✔ (X-RAD, X3, X-MON) · Claude ✔ (X-RAD, D-RAD, X1, X3, D3, D-MON).

### Ronda 3 — Síntesis forzada

#### PAQUETE_DE_DIFERENCIACION

**TOP 5 MEJORAS DIFERENCIADORAS** (fichas: una línea por campo)

**M1 · EventLog + Centro «Qué ha cambiado»** (C1 + D1 fusionada)
Problema: no hay lugar que responda «¿qué ha cambiado en lo que sigo?»; las alertas se gestionan ficha a ficha (flujo roto #7).
Propuesta: log de eventos determinista común (Δprecio, disponibilidad, import, alerta, compartido) + pantalla timeline cruzado con gestión de alertas; sin ML, sin ranking.
Usuarios: recurrente con decisiones activas. Áreas: alertas+fichas+chat+home.
Evidencia: PriceAlert ya persiste disparos (schema.prisma:1284); MODELO-NEGOCIO §4.2 exige memoria cronológica.
Diferenciación: ningún competidor cruza portales+cripto+vuelos en un timeline personal verificable.
Complejidad: S-M (datos ya existen; OTA). Riesgo: timeline vacío en nuevos (estado vacío pedagógico).
Ingresos: suelo free del resumen Premium. Métrica: % usuarios que abren Novedades y navegan a ficha tras un cambio.
Prueba mínima: EventLog read-only sobre señales existentes + pantalla lista.
Decisión: **APROBADA** (única con doble APROBADO limpio).

**M2 · Puente universal ficha↔chat** (C2 revisada)
Problema: «Qué se ha hablado» solo existe en property; el modelo mental es inconsistente (hallazgo DeepSeek CICLO 1).
Propuesta: capa genérica sobre `src/lib/chat/context.ts` con fallback a la impl property (NO sustitución big-bang), para holiday/job/book/crypto.
Usuarios: cualquier usuario que conversa sobre registros. Áreas: fichas de todas las verticales+chat+compartidos.
Evidencia: related-chats es property-only y dueño-only (route.ts:10-28); sharedAccess con reglas delicadas (access.ts:59-73).
Diferenciación: la ficha como expediente de la decisión con su conversación — tesis §1 hecha UI.
Complejidad: M. Riesgo: leak en fichas compartidas → replicar check de membresía del loop iter2 ANTES de generalizar.
Ingresos: más conversaciones vinculadas = más superficie para resumen Premium. Métrica: % fichas no-property con chat vinculado a 7 días.
Prueba mínima: generalizar solo holiday (la vertical con monetización viva).
Decisión: **APROBADA con condición de privacidad previa**.

**M3 · Historia viva del registro** (D2 condicionada)
Problema: cada registro es una foto fija; el usuario no ve la evolución del objeto ni confía en la decisión.
Propuesta: vista por ficha del MISMO EventLog de M1 (no producto separado): eventos automáticos + menciones sociales visibles solo para participantes del chat de origen; timeline honesto («sin eventos desde X»).
Usuarios: decisiones de alto valor. Áreas: fichas+chat/grupos+import+bot.
Evidencia: §4.4 historial de decisión; SYSTEM de precio y recheck ya generan los eventos en property.
Diferenciación: historial del objeto multi-vertical + capa social propia; requiere datos acumulados (foso temporal).
Complejidad: M (reusa M1). Riesgo: privacidad de menciones (condición dura); completitud (se muestra, no se rellena).
Ingresos: «historial ampliado» ya listado en §5.1 Premium. Métrica: tasa de apertura del timeline en fichas >30 días.
Prueba mínima: timeline de property con eventos ya existentes.
Decisión: **APROBADA como vista de M1**.

**M4 · Resumen y Próximo Paso** (C3 + X2 fusionadas)
Problema: Premium actual = cuotas multiplicadas (demo capado, riesgo estructural #1 de DeepSeek); no vende utilidad.
Propuesta: digest periódico de deltas del EventLog narrado por el bot con fallback a lista plana sin LLM; free = semanal completo; Premium = frecuencia/profundidad/próximo paso sugerido.
Usuarios: recurrentes; conversión free→Premium. Áreas: bot+alertas+fichas+analítica.
Evidencia: §4.2 lo declara la funcionalidad Premium principal; DM del bot ya es memoria cronológica en producción.
Diferenciación: vende continuidad («lo que Nidokey hizo por ti mientras no mirabas»), no descapado de cuotas.
Complejidad: M (tras M1). Riesgo: coste Anthropic por digest → capar con la cuota bot existente y observarlo (§9.5).
Ingresos: SKU Premium central. Métrica: % usuarios que vuelve por un cambio/alerta (§11) + CTR resumen→ficha.
Prueba mínima: digest semanal por plantilla (sin IA) a usuarios con ≥1 alerta.
Decisión: **APROBADA — primera candidata Premium**.

**M5 · Contrapunto del comparador** (D3 reducida)
Problema: el comparador muestra atributos presentes; falta el contexto adverso para decidir con criterio.
Propuesta: tool del bot sobre el comparador existente que señala contradicciones, campos faltantes y cambios no reflejados usando SOLO datos de los registros del usuario; longitud variable (sin 3+3+3 que obligue a alucinar); salida etiquetada como análisis del bot (provenance); dentro de la cuota general.
Usuarios: quien compara 2-3 alternativas caras. Áreas: comparador+bot+timeline (M3).
Evidencia: comparador instrumentado (commits f8ecd1b/54a8f54); tools de lectura del bot en producción.
Diferenciación: análisis adversarial multi-vertical sobre datos propios; nadie lo ofrece.
Complejidad: S-M (prompt+tool). Riesgo: confianza si inventa → restricción a datos propios y etiquetado.
Ingresos: alimenta el futuro «informe de decisión» (pago único). Métrica: % comparaciones que invocan contrapunto y guardan la tarjeta.
Prueba mínima: tool en property/compare sin persistencia.
Decisión: **APROBADA reducida**.

**TOP IDEAS RADICALES (sobrevive 1 de 3)**

**R1 · Espacios de Decisión** (C-RAD + X1 fusionadas y reducidas)
Problema: la decisión real («comprar piso en Oviedo») no existe como objeto; «registros multi-vertical» no lo entiende nadie.
Propuesta: entidad Decision que agrupa registros de cualquier vertical; v1 = agrupar + «cambios desde la última visita» (auto-alimentado por el EventLog M1); v2 = personas/grupo de chat; v3 = cierre con resultado. Sección «Decisiones» ENCIMA de las categorías (coexistencia, sin big-bang). El bot solo sugiere agrupar, con confirmación.
Usuarios: cualquier usuario con 2-3 registros hacia un objetivo. Áreas: home+fichas+comparador+grupos+alertas+compartidos.
Evidencia: §4.1 y paso 2 de §10; la home actual es lista por categoría sin agrupación por objetivo.
Diferenciación: continuidad de la decisión entre fuentes, sesiones y personas; un tablero Notion no sabe que el piso bajó 10k anoche — el espacio de Nidokey sí (se auto-alimenta de trackers vivos, condición de existencia).
Complejidad: L (modelo polimórfico: no hay tabla Record única; índices userId+recordType+recordId, acceso uniforme, huérfanos — riesgo señalado por Codex).
Riesgo: reordena la home; sección vacía si nadie agrupa (crear decisión con confirmación al comparar o compartir).
Ingresos: habilita SKUs §5.1 (espacios compartidos, historial) sin paywalls nuevos. Métrica: decisiones activas por MAU y % finalizadas con resultado.
Prueba mínima: v1 con agrupación manual + contador de cambios, sin UI de home nueva (entrada desde una pestaña).
Decisión: **APROBADA FASEADA** (v2/v3 requieren revalidación tras v1).

X-RAD (Agente Negociador) — **DESCARTADA** (2 votos): IA sin fallback determinista en decisiones con daño económico; deuda de auditoría del bot sin pagar; monetización valorada en 0 € por §5.2; riesgo legal en España.
D-RAD (Trust Layer) — **DESCARTADA** (2 votos): vende la confianza que §1 define como unidad de valor; mercado inexistente a escala 0; coste legal+técnico superior al presupuesto total; RGPD.

#### PAQUETE_DE_MONETIZACION_INDIRECTA

**MI1 · CommercialAction con atribución y resultado** (C-MON + X-MON fusionadas)
Hoy la ÚNICA monetización transaccional (afiliación viajes) es invisible: `holiday/[id].tsx:159` abre el affiliateUrl sin tracking. Implementar la capa §8 del modelo con su taxonomía EXACTA (commercial_action_view/click, partner_redirect, lead_submitted, conversion_confirmed) — no inventar nombres nuevos; ruta /go + attributionId sobre AnalyticsEvent existente + disclosure visible + pregunta de resultado («¿llegaste a reservar?») que alimenta el historial §4.4. Postback del proveedor como única fuente de verdad de ingreso. Empezar por viajes; extensible a libros/inmuebles sin código por vertical. Coste S.

**MI2 · Preparación de visita (lado comprador)** (D-MON reducida)
Checklist de visita + preguntas preparadas por el bot (tool de LECTURA, ya viable) + recordatorio push; el resumen post-visita lo escribe el USUARIO y queda como evento del timeline (M3). Sin coordinar horarios con contrapartes que no están en la plataforma; sin escritura autónoma del bot. Aumenta cierres y retención en el vertical núcleo. Coste S.

**MI3 · Free íntegro como growth loop**
Desmontar la fricción artificial (riesgo estructural #1): el free recibe M1 completo y el resumen semanal completo; Premium compra frecuencia, profundidad, historial y export — nunca seguridad, privacidad ni la experiencia básica. Un free usable es el canal de adquisición orgánica que el producto no tiene (y no habrá presupuesto de marketing). Coste 0 (es una decisión de diseño de planes en `plans.ts`).

#### LISTA_DE_RIESGOS_CRITICOS

1. **Embudo cero**: TODO el debate presupone usuarios que no existen — landing en ComingSoon, Android fuera de Play, pagos apagados, sin IAP. Lanzar (checklist `docs/OPERACIONES.md` §8) es prerequisito para validar cualquier idea de este paquete; ninguna mejora lo sustituye.
2. **Modelo de datos polimórfico sin EventLog común**: no hay tabla Record única (soft-refs recordType/recordId + switch por vertical en access.ts). Decision, timeline y resumen lo necesitan; construirlo ad-hoc por feature = migraciones dolorosas después. El EventLog determinista mínimo va ANTES que cualquier IA o scoring (consenso de las 3 críticas).
3. **Privacidad del contexto conversacional + bot sin auditoría**: M2/M3 amplifican la superficie del leak de «Qué se ha hablado» en fichas compartidas, y el bot de escritura carece de registro de auditoría y límites por chat/grupo (hallazgo DeepSeek R1 que su propia R2 ignoró). Resolver membresía + audit log antes de generalizar el puente.

#### DIRECCION_ESTRATEGICA_RECOMENDADA

- **Qué debe ser Nidokey**: el expediente vivo de tus decisiones — vigila lo que sigues, recuerda lo que se habló, te dice qué cambió y qué toca hacer.
- **Para quién**: personas (solas o con pareja/grupo) siguiendo decisiones de alto valor: comprar/alquilar vivienda (núcleo), invertir, viajar, cambiar de empleo.
- **Problema central**: las decisiones largas se fragmentan entre portales, chats y memoria; nadie avisa a tiempo ni conserva el contexto.
- **Tres capacidades diferenciales**: (1) seguimiento unificado multi-vertical con detección de cambios verificable (EventLog); (2) conversación contextual sobre los objetos de la decisión (puente ficha↔chat, espacios); (3) asistencia del bot revisable y útil aunque la IA falle (resumen, contrapunto, preparación).
- **Qué NO debe intentar ser**: marketplace/transacción, vendedor de datos, agente que negocia por ti, super-app (food/workout fuera del caso económico).
- **Funciones que generan confianza**: timeline de hechos verificables, disclosure de afiliación, privacidad del contexto compartido, bloqueo/denuncia siempre gratis, bot con confirmación y auditoría.
- **Funciones que generan retención**: centro «Qué ha cambiado», alertas, espacios de decisión abiertos, resumen periódico.
- **Funciones que pueden generar ingresos**: Premium de continuidad (resumen+historial+export), afiliación con atribución (MI1), futuro «informe de decisión» de pago único (M3+M5 empaquetados).

---

## CICLO 2 — Auditoría de categorías (COMPLETADO 2026-08-09, pendiente autorización)

### MATRIZ_DE_CATEGORIAS

Puntuaciones 1-5. Numerador: **N**ecesidad · **F**recuencia · **V**alor · **D**iferenciación · **C**onexión · **R**etención · **M**onetización · confianza en la **E**videncia. Denominador: **CT** coste técnico · **CO** coste operativo · **RL** riesgo legal · **RA** riesgo de abuso. VE = (N·F·D·C·E)/(CT+CO+RL+RA).

| Categoría | N/F/V/D/C/R/M/E | CT/CO/RL/RA | VE | Codex (técnica) | DeepSeek (crítica) | Decisión |
| --- | --- | --- | --- | --- | --- | --- |
| `property` | 5/4/5/4/5/5/4/5 | 3/3/2/2 | **200** | modelo más específico y valioso (schema:219-306); fusionarla pierde semántica renta/venta, comparador, rechecks | APROBADO — núcleo del expediente | **MANTENER + MEJORAR** (paquete 1.5) |
| `chat` | 4/5/5/4/5/5/3/5 | 3/2/2/3 | **200** | contexto por soft-ref ya existe (contextType/contextId); cerrar moderación y audit del bot | APROBADO — capa conversacional del expediente | **MANTENER + MEJORAR** (moderación+audit) |
| `crypto`+`market` | 3/4/3/2/3/4/2/4 | 2/2/2/1 | **41** | casi duplicadas: comparten AssetDetail, mappers homólogos, chart y alertas comunes → candidata a `FinancialAssetRecord` lógico, sin migración física | APROBADO; renombrar a «Inversiones» | **MEJORAR** (agrupar como Inversiones, absorber señales) |
| `holiday` | 3/2/4/4/3/2/4/4 | 3/3/2/1 | **32** | motor propio real; dependencia de APIs externas | REVISAR — módulo del expediente de viaje | **MEJORAR** (MI1 atribución primero) |
| `job` | 4/3/3/2/2/3/2/3 | 3/3/2/1 | **16** | JobListing con snapshots y dedup; import con UX propia | REDUCIDO — seguimiento manual coherente con el expediente | **REDUCIR** (candidatura manual primero, keyless best-effort) |
| `trends` | 2/3/2/2/2/3/1/3 | 2/2/1/1 | **12** | ya medio demovida (fuera de category-prefs, botón aparte en el rail); mantener API/cron hasta que exista capa `signals` | TRANSFORMAR — capa de señales; riesgo: ruido | **FUSIONAR→señales** (deja de ser categoría) |
| `book` | 2/2/2/1/2/2/1/4 | 1/1/1/1 | **8** | BookRecord sin snapshots; no perder userNotes ni dedup ISBN en cualquier fusión | FUSIONAR en registro genérico de objetos | **MANTENER-LITE** (coste ~0, sin inversión; fusión conceptual en CICLO 3) |
| `food` | 2/3/2/1/1/2/1/5 | 4/5/3/3 | **2** | mini-app transaccional viva: tablas propias, crons 5/15min, fallback en refresh.yml, tools bot, APP_GUIDE — flag único server/client necesario | APAGADO (datos intactos) | **ELIMINAR-POR-FLAG** ⚠️ requiere autorización |
| `workout` | 1/1/1/1/1/1/1/5 | 1/1/1/1 | **1** | quitar de RECORD_TYPES exige migración defensiva en category-prefs | FUERA del selector | **ELIMINAR del selector** ⚠️ requiere autorización |

Fuentes y confianza: puntuaciones = inferencia de Claude sobre el inventario CICLO 1 + veredictos 1.5 (confianza media-alta en núcleo y colas, media en el centro de la tabla); columna Codex = HECHO con citas verificadas (task `f884cd48`); columna DeepSeek = juicio crítico (task `1f39ac54`). Sin investigación de mercado nueva en este ciclo: el análisis competitivo del debate 1.5 (Idealista avisa bajadas, feeds financieros, tableros Notion) se da por vigente, fecha 2026-08-09.

### Listas de decisión

- **CATEGORIAS_A_MANTENER**: property, chat (núcleo, VE 200 ambas).
- **CATEGORIAS_A_MEJORAR**: crypto+market (reencuadre «Inversiones», sin migración física), holiday (tras MI1).
- **CATEGORIAS_A_REDUCIR**: job (flujo primario = candidatura manual + import; búsqueda keyless etiquetada mejor-esfuerzo).
- **CATEGORIAS_A_FUSIONAR**: trends → capa de señales dentro de fichas Inversiones/property (la categoría desaparece de la navegación; API y cron se mantienen hasta que las fichas consuman señales); book → fusión conceptual en «objetos seguidos» (CICLO 3), hoy modo lite.
- **CATEGORIAS_A_SUSTITUIR**: ninguna.
- **CATEGORIAS_A_ELIMINAR** ⚠️ (recomendación unánime de los 3 agentes; **requiere autorización expresa del propietario**): food (apagar por flag, datos y rutas intactos, parar gasto Apify), workout (fuera del selector; es un esqueleto sin datos).
- **CATEGORIAS_CANDIDATAS_A_ANADIR**: ninguna vertical nueva (unánime). La necesidad estructural la cubre el objeto transversal «Decisión» (R1 del debate), que no es una categoría.
- **Renombres sugeridos** (DeepSeek, para CICLO 3): crypto/market → «Inversiones»; trends → «Señales»; el resto de nombres de UI en ES ya son claros.

### PLAN_DE_MIGRACION (flags-first, sin borrar datos ni rutas, una fase por iteración del CICLO 4)

0. **Food OFF** (para el gasto — primera candidata tras autorización): flag único server/client que oculta rail+home+import; retirar tools de comida del bot (`tool-defs.ts:67-94`, `bot-tools.ts:138-180`) y menciones en APP_GUIDE (`app-guide.ts:20,26,29`); pausar `food-menus.yml` y `food-expire.yml` **y el fallback de food-menus dentro de `refresh.yml:35-44`**. BBDD y rutas API intactas; reversible con el flag. Guard de CI: ningún workflow llama `/api/cron/food-menus`.
1. **Workout fuera del selector**: quitar de RECORD_TYPES con migración defensiva en `category-prefs.ts` (hoy puede quedar como única categoría visible — hallazgo MEDIO del CICLO 1). Sin datos que migrar.
2. **Trends → señales** (bloqueada por M1 EventLog): crear capa `signals` consumida por AssetDetail y `property/[id]`; después retirar solo la entrada de navegación. Tabla y cron intactos.
3. **Job reducido**: formulario de candidatura manual como flujo primario; keyless con etiqueta de cobertura.
4. **Inversiones** (CICLO 3): agrupación UI de crypto+market; sin migración de tablas.

Pruebas del plan (Codex): tests de category-prefs (ocultar food/workout/trends), test del registry de tools del bot (ausencia de food), guard CI de workflows, tests de EventLog read-only + privacidad en compartidos.

Riesgo principal (DeepSeek): ejecutar (0)-(3) a la vez fragmenta la percepción del producto → una fase por iteración, cada una con su flag y verificación.

---

## CICLO 3 — Sistema diferencial (en curso 2026-08-09; coordinación: Claude delega en DeepSeek, Codex intacto)

### PILARES_DIFERENCIALES (posición de Claude — dirección de producto)

Se seleccionan **4 pilares** (de los 6 candidatos de la spec). Descartados como pilar: «Conocimiento local» (sin capacidad de curar datos locales; lo que existe —precio en tu zona, CartoCiudad— vive dentro de P1) y «Organización conectada» como pilar separado (sus piezas útiles quedan dentro de P2; calendario/notas/tareas se deciden en CICLO 6 con la regla anti-isla).

**P1 · Contexto continuo** (M1 + M3)
Problema: las decisiones largas pierden su historia entre sesiones y fuentes. Usuarios: todos, núcleo recurrente. Promesa: «Nidokey recuerda qué cambió y te lo enseña verificable». Funciones: EventLog aditivo, centro «Qué ha cambiado», Historia viva por ficha, alertas. Categorías: todas las activas. Datos: snapshots/rechecks/alertas existentes. Conexiones: fichas↔centro↔chat. Free: timeline reciente completo. Pago: historial ilimitado + export. Métrica: % usuarios que vuelve por un cambio (§11). Riesgos: timeline vacío en nuevos. No se construirá: ranking por urgencia con ML. Ventaja difícil de copiar: cruce multi-vertical + histórico acumulado.

**P2 · Conversaciones accionables** (M2 + R1-Espacios + compartir/grupos)
Problema: el chat y los registros viven separados fuera de property; la decisión no existe como objeto. Usuarios: parejas/grupos decidiendo, recurrentes. Promesa: «la conversación lleva la decisión encima». Funciones: puente universal ficha↔chat, espacios de decisión (v1 agrupar+cambios, v2 personas, v3 cierre), compartir registros. Categorías: todas. Datos: ChatMessage.contextType/Id, RecordShare, Decision (nueva). Conexiones: home↔fichas↔grupos↔alertas. Free: íntegro. Pago: espacios compartidos avanzados/historial (§5.1). Métrica: decisiones activas por MAU; % fichas no-property con chat vinculado. Riesgos: leak de contexto en compartidas (fix de membresía ANTES). No se construirá: colaboración en tiempo real más allá de aviso→refetch. Ventaja: el espacio se auto-alimenta de los trackers vivos.

**P3 · Inteligencia revisable** (M4 + M5 + bot con confirmación)
Problema: vigilar cuesta tiempo; la IA sin control destruye confianza. Usuarios: recurrentes y Premium. Promesa: «te resume y te reta, tú decides». Funciones: resumen y próximo paso (digest determinista + narración opcional), contrapunto del comparador, tools con confirmación y auditoría. Categorías: todas. Datos: EventLog + registros propios. Conexiones: bot↔centro↔fichas↔comparador. Free: resumen semanal completo. Pago: frecuencia/profundidad. Métrica: CTR resumen→ficha; % comparaciones con contrapunto. Riesgos: coste LLM (capar con cuota bot); alucinación (solo datos propios + provenance). No se construirá: agente que negocia o actúa solo. Ventaja: útil aunque la IA falle (núcleo determinista).

**P4 · Confianza verificable** (MI1 + privacidad + moderación)
Problema: sin confianza no hay recomendación ni pago; la afiliación invisible huele a agenda oculta. Usuarios: todos. Promesa: «sabes qué gana Nidokey y qué ve cada cual». Funciones: disclosure de afiliación con atribución (/go §8), timeline de hechos verificables, membresía en contexto compartido, audit log del bot, bloqueo/denuncia gratis + cierre de moderación. Categorías: todas + chat. Datos: AnalyticsEvent/CommercialAction. Conexiones: fichas↔chat↔cuenta. Free: TODO (la confianza nunca es Premium — principio 7). Pago: n/a. Métrica: quejas/denuncias resueltas; conversiones afiliado atribuidas. Riesgos: moderación exige flujo operativo (CICLO 7). No se construirá: reputación opaca por puntuación. Ventaja: honestidad estructural frente a portales con incentivos ocultos.

### ARQUITECTURA_DE_PRODUCTO (capas, de abajo arriba)

1. **Registros por vertical** (tablas existentes; sin migración física).
2. **EventLog aditivo** (soft-ref recordType/recordId + idempotency; poblado desde snapshots/alerts/chat) — fundamento de P1/P3.
3. **Objetos de decisión** (Decision faseada v1→v3) — fundamento de P2.
4. **Superficies**: home (Decisiones+categorías), fichas (historia+chat+siguiente paso), centro «Qué ha cambiado», chat/grupos, resumen del bot.
5. **Capa comercial §8** (CommercialAction, /go, postback) — transversal, P4.

Orden de construcción (iteraciones CICLO 4, una por vez): fase 1 workout-out → M1 EventLog+Centro → MI1 CommercialAction viajes → M2 puente (tras fix membresía + audit bot) → M4 resumen plantilla → R1-Espacios v1 → M3 historia viva → M5 contrapunto → MI2 preparación de visita.

### PROPUESTA_DE_VALOR

«Nidokey es el expediente vivo de tus decisiones: vigila lo que sigues en todas tus fuentes, recuerda lo que hablasteis, te avisa de lo que cambia y te ayuda a dar el siguiente paso — contigo al mando y sin agendas ocultas.»

### LIMITES_DEL_PRODUCTO

No es un marketplace ni procesa transacciones; no vende ni cede datos del usuario; el bot no negocia ni actúa sin confirmación; no es super-app (food/workout fuera); no promete colaboración en tiempo real (aviso opaco→refetch); calendario/notas/tareas solo entrarán si superan la regla anti-isla del CICLO 6; sin moderación humana continua — la moderación se diseña como flujo mínimo con SLA honesto en CICLO 7.

### Registro de delegaciones (protocolo Claude→DeepSeek)

| ID | Tarea | Estado | Revisión de Claude |
| --- | --- | --- | --- |
| D3-01 | Recorridos R1-R4 (task `307405ae`) | COMPLETADA | ACEPTADA con correcciones: OTP en vez de SSO/emails; alertas 3/25 (no «5»); votación marcada (H) v3. Evidencia media-alta (citó capacidades reales). |
| D3-02 | Recorridos R5-R7 + conexiones (task `643dfebd`) | PARCIAL→COMPLETADA | R5-R7 ACEPTADOS (corregido: comunicaciones por push+DM, export JSON); conexiones truncadas por el tope del runner → D3-02b. |
| D3-02b | MAPA_DE_CONEXIONES (task `d5246813`) | COMPLETADA | ACEPTADA con 2 correcciones: «privacidad diferencial»→sin-PII server-side; compartir-al-grupo ya existe, (H) solo su agregación en espacios. |

### MAPA_DE_RECORRIDOS (diseño DeepSeek D3-01/D3-02, revisado y corregido por Claude)

Corrección global del revisor: el login es **OTP por email** (sin SSO ni emails de marketing — las comunicaciones son push + DM del bot); las alertas free/Premium son **3/25** (ya en producción); todo lo que dependa de Espacios v2/v3 va marcado (H).

**R1 Visitante → cuenta**: landing activada → tienda → onboarding → OTP → opt-in push diferido. Errores: cuenta existente→login, push denegado→pedir después. Fin: home con estado vacío pedagógico (crear primera alerta/registro). Diferenciación: importar un anuncio real en el primer minuto. Monetización: ninguna (a propósito).
**R2 Buscar → comparar → guardar → decidir**: búsqueda propia + externa (inmuebles) → filtros → comparador (2-3) → guardar → timeline. Errores: sin resultados→ampliar filtros; comparador lleno→aviso. Notif: alerta de precio configurable. Fin: registro guardado con ≥2 alternativas comparadas. Siguiente: compartir (R7). Diferenciación: coste total en el comparador. Monetización: ninguna directa (las alertas free son 3; Premium 25).
**R3 Ficha → conversar → coordinar → cerrar**: «Qué se ha hablado»/discutir → chat con contexto → bot con confirmación → cierre con resumen → evento en EventLog. Errores: invitado sin app→enlace; bot caído→flujo manual. (H) votación/quórum = Espacios v3. Fin: registro «decidido» con resumen. Diferenciación: conversación pegada a la ficha.
**R4 Recurrente → recupera contexto → continúa**: abrir app → centro «Qué ha cambiado» → registro pendiente → seguir (R2/R3). Errores: sesión expirada→re-login OTP; datos viejos→pull-to-refresh. Notif: resumen periódico (M4). Fin: retoma sin releer historial. Diferenciación: P1 entero. Monetización: el resumen frecuente es el gancho Premium.
**R5 Free → Premium**: CTA contextual en ficha/centro («historial completo + resumen frecuente + export») → pantalla de beneficios → checkout web → webhook activa entitlement → toast «Premium activo» + DM del bot con lo desbloqueado. Errores: pago rechazado→reintento claro; webhook lento→estado «pendiente» visible. Fin: valor visible en la misma ficha donde nació el CTA. Guardarraíl: free íntegro, Premium no oculta datos. (IAP fuera de alcance hasta RevenueCat.)
**R6 Privacidad/salida**: Cuenta → cancelar (acceso hasta fin de período) → export JSON (`/api/account/export`) → borrado total con confirmación (`DELETE /api/account`) → confirmación en pantalla. Errores: export falla→retry visible; sin obstáculos engañosos. Diferenciación: P4 — salir es fácil y completo.
**R7 Decisión en grupo**: compartir ficha al grupo → el bot expande la tarjeta → discusión con criterios → (H) espacio de decisión v2 agrega criterios/pros-contras → consenso → cierre con acta vinculada. Errores: enlace sin acceso→pedir membresía; actualización = aviso→refetch (sin tiempo real). Diferenciación: P2. Monetización: (H) espacios múltiples/avanzados Premium.

### MAPA_DE_CONEXIONES (DeepSeek D3-02b, revisado por Claude)

1. alertas ↔ chat: el disparo llega como DM del bot con enlace a la ficha; el chat da la acción siguiente (P1→P2).
2. ficha ↔ chat: la ficha pasa contexto («Qué se ha hablado») y el chat devuelve resúmenes y decisiones (P2, P3).
3. comparador ↔ bot: criterios de comparación → contrapunto verificable sobre datos propios (P3, P4).
4. home ↔ espacios de decisión: la home ordena por decisiones activas y el EventLog les da «cambios desde tu última visita» (P1, P2). (H v1+)
5. compartidos ↔ grupos: compartir-al-grupo ya existe; su agregación en espacios compartidos es (H) v2 (P2, P4).
6. afiliación ↔ analítica: /go + postback alimentan AnalyticsEvent server-side sin PII; el disclosure es visible al usuario (P4).
7. centro-cambios ↔ fichas: cada entrada del centro enlaza a su ficha; la ficha muestra su historia viva del mismo EventLog (P1).
8. cuenta/privacidad ↔ todo: membresía del contexto compartido, audit del bot y export/borrado gobiernan cualquier flujo (P4).

---

## CICLO 4 — Iteraciones de implementación

### Iteración 1 · Fase 1: workout fuera del selector (en curso 2026-08-09)

HANDOFF_A_CODEX emitido (task `0d14a77b`, modo edit, ámbito `apps/mobile/lib/records` **reservado por Codex**): sacar workout de MANAGED_RECORD_TYPES replicando el patrón de la fase 0, con test de migración defensiva (order/hidden/start guardados con workout se descartan). Fuera de alcance: shared, pantallas, OTA. Autorización del propietario: decisión `407b6082`. Claude verificará typecheck+tests y commiteará (el sandbox de Codex no escribe .git); DeepSeek hará la revisión posterior.

Preparación iteración 2 (M1): delegación D4-01 a DeepSeek (task `77336a54`) — criterios de aceptación, casos límite, estados y privacidad del EventLog + Centro «Qué ha cambiado» antes del diseño técnico de Codex.

| ID | Tarea | Estado | Revisión |
| --- | --- | --- | --- |
| HANDOFF-C4I1 | Codex implementa fase 1 workout (task `0d14a77b`) | **INTEGRADA** (main `2aa8fcd`) | Claude verificó (typecheck + 513 tests); DeepSeek D4-02 APROBADO sin bloqueantes |
| D4-01 | DeepSeek: criterios M1 (task `77336a54`) | COMPLETADA | ACEPTADA con notas: decisión de negocio resuelta por Claude (duplicados near-miss se conservan ambos, sin marca); métrica = la de la ficha M1 |
| D4-02 | DeepSeek: revisión post-impl. fase 1 (task `e649156c`) | COMPLETADA | APROBADO; importantes cubiertos por tests existentes; opcional anotado (centralizar lista de exclusión si crece) |
| D5-01 | DeepSeek: auditoría chat + flujos rotos (task `a2539171`) | COMPLETADA | ACEPTADA con corrección: nada de «tiempo real WS» (límite: aviso→refetch); 8 flujos rotos y veredictos de capacidades registrados para CICLO 5 |
| D5-02 | DeepSeek: política de compartir/reenviar (task `c389c659`) | COMPLETADA | ACEPTADA; decisión final de Claude: REDUCIR — sin reenvío en v1 (solo cita de texto + compartir registros); la matriz de bloqueos/joinedAt se conserva como spec para cuando se aborde |

**Cierre iteración 1** — Problema: categoría esqueleto visible. Mejora: workout fuera del selector con migración defensiva. Pilar: higiene del sistema (pre-P1). Evidencia técnica: typecheck + 513 tests. Evidencia de producto: n/a (limpieza). Deuda introducida: ninguna; opcional de DeepSeek anotado. Aprendizaje: el patrón food/workout es reutilizable para cualquier salida de categoría. Siguiente: iteración 2 = M1 EventLog + Centro (criterios D4-01 listos; falta diseño técnico de Codex).

### Iteración 2 · M1 EventLog + Centro «Qué ha cambiado» (**INTEGRADA** 2026-08-09, main `e6634d5` + `dc7157c`)

| Paso | Resultado |
| --- | --- |
| Diseño técnico (Codex `65bd023d`) | APROBADO por Claude con ajuste: idempotencyKey por transición de valor + bucket de día, nunca timestamp de detección |
| Server (Codex `5a458087`, tras 2 intentos caídos por límites del ejecutor) | RecordEvent en Neon (db push), createRecordEvent best-effort, población en 6 puntos, GET /api/events con cursor, retención 500/usuario; 519 tests |
| Revisión server (DeepSeek D4-03 `7455db0c`) | APROBADO; trade-offs validados (1 evento/alerta/día documentado en ALERTAS.md; href informativo) |
| Móvil (Codex `324074a9`) | pantalla /events con estados completos, filtro por categorías, entrada en Cuenta, i18n ES/EN; 523 tests |
| Revisión móvil (DeepSeek D4-04 `f686497b`) | APROBADO CON OBSERVACIONES: 0 bloqueantes, 4 importantes |
| Correcciones (Codex `bdec6351`) | los 4 importantes corregidos (doble-tap, 404 verificado en todas las fichas sin cambios, pull-to-refresh, vacío-por-filtrado) + fin de lista |

**Cierre iteración 2** — Problema: sin lugar que responda «¿qué ha cambiado en lo que sigo?» (flujo roto #7). Mejora: EventLog determinista + centro Novedades. Pilar: P1 (fundamento también de P3). Evidencia técnica: typecheck web+móvil, 523 tests, tabla aditiva sin migración. Métrica a observar: % usuarios que abren Novedades y navegan a ficha tras un cambio (instrumentación de analítica pendiente de la iteración de M4). Deuda: href del payload con formato /records/ (informativo, cliente lo ignora); optimización batch del findUnique en crons de lote (opcional D4-03). Aprendizaje: límites del ejecutor Codex (scope debe existir; sandbox escribe solo dentro del scope) — documentados en memoria. Pendiente de OTA para llegar a dispositivos.

### Iteración 3 · MI1 CommercialAction §8 (**INTEGRADA** 2026-08-09, main `e225920` + `faac76d`)

| Paso | Resultado |
| --- | --- |
| Server (Codex `ec182b61`) | GET /api/go: whitelist estricta (aviasales exactos + sufijo .nuitee.link, solo https), attributionId como sub_id, eventos LITERALES §8 (commercial_action_click, partner_redirect), eco en Novedades, 302; conversión reservada al postback |
| Revisión server (DeepSeek D4-05 `b09605eb`) | APROBADO con reservas: rate-limit recomendado (hecho), open-redirect teórico (documentado), formato sub_id por partner pendiente de verificar con Travelpayouts/Aviasales al configurar postback |
| Móvil (Codex `a67664a8`) | holiday abre reserva vía /api/go (fetch auth + redirect manual), disclosure de afiliado (P4), eventos view/click, pregunta «¿llegaste a reservar?» una vez por registro |
| Correcciones (Codex `783506b8` + `0b4e5e30`, en paralelo) | rate-limit 60/h en la ruta; FALLBACK a URL directa si /go falla (decisión de Claude: la atribución nunca bloquea la reserva) con fallback:true medido |

**Cierre iteración 3** — Problema: la única monetización transaccional era invisible (hallazgo ALTO CICLO 1; §5.2 la contabiliza como cero sin atribución). Mejora: capa comercial §8 v1 con disclosure honesto y medición de atribución perdida. Pilar: P4 (y alimenta §4.4 con el outcome). Evidencia: typecheck web+móvil, 531+ tests. Métrica: clicks atribuidos vs fallback; outcomes reportados. Deuda declarada: formato de sub_id por partner (verificar con la doc de Travelpayouts al activar postback); conversión sigue en cero hasta postback — correcto por diseño. Pendiente de OTA.

### Iteración 4 · M2 puente universal ficha↔chat (**INTEGRADA** 2026-08-09, main `027c885` + `e68d43d` + `7a17738`)

Precondiciones cumplidas: privacidad de membresía (loop mensajería persistido en `027c885`) + audit del bot (wrapper de runner → `bot_write_tool` en AnalyticsEvent con props mínimos, sin args libres). Server: helper genérico de related-chats por viewer + ruta `/api/records/[id]/related-chats?type=X` + property como wrapper. Móvil: RelatedChatsBlock generalizado a components/records, estreno en **viajes**, property intacto. Revisión D4-06: APROBADO — 2 hallazgos refutados con código (filtro de membresía está en la query `related-chats.ts:121`; `chat` ya excluido del RECORD_TYPES de la ruta); opcionales a backlog (audit de intentos bloqueados, rate-limit preventivo). 545 tests.

**Cierre iteración 4** — Problema: el chat parecía parte del registro solo en property (inconsistencia de modelo mental, hallazgo DeepSeek CICLO 1). Mejora: puente universal con la misma privacidad en todas las verticales. Pilar: P2. Métrica: % fichas no-property con chat vinculado a 7 días. Deuda: extender a job/book/crypto/market (mecánico, mismo componente). Pendiente de OTA.

### Iteración 4b · Feedback del propietario (**INTEGRADA**, main `b1930da`, OTA publicada)

Novedades sale de Cuenta y pasa al rail de la home junto a Tendencias, con `sparkles-outline` y el patrón visual de los tres estilos. OTA republicada en preview + production.

### Iteración 5 · M4 Resumen semanal (**INTEGRADA** 2026-08-10, main `4836544`)

Diseño Codex (`e24552ed`) aprobado con 2 decisiones de Claude: corte semanal UTC (cron lunes 07:00 UTC) e idempotencia por clientId de ChatMessage (`weekly-digest:{semana}:{usuario}`, sin tabla nueva). Implementación (`58866c57`): plantilla ES pura agrupada por categoría con conteos + enlaces reales + cierre a Novedades, cap 500 con «+N más», entrega por el camino exacto de las alertas (ensureBotDm + replyAsBot → push con prefs/mute), usuarios sin eventos no reciben nada; cron `/api/cron/weekly-digest` + workflow `weekly-digest.yml`. Revisión D4-07 (`f86962ac`): APROBADO sin bloqueantes; nota de longitud resuelta por el revisor (el ~700 es guía del LLM, no corte del renderizado — observar el primer lunes); primer lunes con ventana corta = aceptable (si no hay eventos, no se envía).

**Cierre iteración 5** — Problema: Premium sin nada que vender salvo cuotas; el usuario no percibe lo que Nidokey vigila por él. Mejora: resumen semanal determinista (el suelo free del futuro Premium de frecuencia/narración). Pilar: P3 (sobre P1). Métrica: CTR digest→Novedades/ficha. Deuda: microcopy variable del cierre (opcional D4-07). Free íntegro: semanal completo para todos.

### Iteración 6 · R1v1 Espacios de Decisión (**INTEGRADA** 2026-08-10, main `b095e8d` + `46917d2`)

Diseño Codex (`f63431b2`) aprobado íntegro: DecisionItem normalizado con soft-refs, botón en el rail (no sección en la home virtualizada), alta solo desde ficha, topes 10/20, detalle devuelve contador previo y marca visita. Schema por Claude (db push). Server (`8fcab968`): CRUD owner-scoped con guardarraíles en API, changedCount por SQL tipado sobre índice compuesto nuevo. Revisión D4-08 (`ad02dc12`): limpio en los 5 vectores; verificación adicional de Claude: SIN IDOR (materialización filtra por ownerId en las 6 tablas, `decisions.ts:141-173`). Decisiones de producto de Claude: archivar NO congela el contador (reactivar muestra actividad acumulada); referencia ajena por API = inocua (record:null, cuenta 0 eventos ajenos). Móvil (`c3c2e8bc`): /decisions con badge, detalle con RecordCards + CTA comparador (≥2 property), sheet «Añadir a decisión» en las 6 fichas con crear inline, rail con `git-branch-outline`. 562 tests.

**Cierre iteración 6** — Problema: la decisión real del usuario no existía como objeto (hallazgo central del debate: «registros multi-vertical no lo entiende nadie»). Mejora: la RADICAL del paquete, faseada a su v1 útil: agrupar + cambios desde la última visita. Pilar: P2 (sobre P1). Métrica: decisiones activas por MAU; % decisiones con ≥2 registros. Deuda: v2 (personas/grupo) y v3 (cierre con resultado) requieren revalidación tras uso real. OTA publicada (grupos cca7ec3a/de82317c).

### Iteración 7 · M3 Historia viva (**INTEGRADA** 2026-08-10, main `f8ae941` + `dbeef0e`)

Diseño (`e8fd3cb9`) aprobado: reutilizar /api/events con filtros conjuntos recordType+recordId (400 si falta uno), bloque de 5 entradas + «ver todo» filtrado, property+holiday primero, OCULTAR (no vaciar) en fichas compartidas — vacío se leería como «no hay historia» cuando no se muestra historia ajena. Server (`0e725b81`): filtros con owner-scope intacto. Móvil (`65f110a5`): RecordHistoryBlock + RecordEventRow común (sin duplicar formato con Novedades), pantalla /events parametrizada con título contextual. 569 tests.

**Cierre iteración 7** — Problema: cada registro era una foto fija sin evolución visible. Mejora: la historia del objeto en su ficha, del mismo EventLog. Pilar: P1 (alimenta el futuro «historial ampliado» Premium §5.1). Métrica: aperturas del bloque Historia en fichas >30 días. Deuda: extender a crypto/market/job/book cuando generen más eventos (mecánico). OTA publicada con M5/MI2 (grupos 4f2b28fc/1e884ae6).

### Iteración 8 · M5 Contrapunto (**INTEGRADA** 2026-08-10, main `b6847bc`)

Sin ronda de diseño aparte (alcance cerrado en el debate; tool de lectura). Tool `comparar_registros(type,ids)` con 2-3 ids propios del mismo tipo, serialización lado-a-lado por vertical + últimos 5 eventos, prompt para análisis crítico de longitud VARIABLE (sin 3+3+3 que fuerce a alucinar), fundado solo en datos guardados y cerrando con esa provenance. 574 tests.
**Verificación extra de Claude** (no pedida por el protocolo pero propia de un cambio de prompt): arnés `bot:eval:smoke`. Aparecieron 2 fallos que NO eran de M5 sino casos CADUCADOS tras la fase 0 — `con-06` pedía buscar restaurantes (comida retirada) y `onb-04` exigía la palabra literal «pagar» cuando el bot expresaba el límite correctamente. Reescritos ambos → 15/15. Aprendizaje: retirar una vertical exige revisar el arnés de evals, no solo el código.

### Iteración 9 · MI2 Preparación de visita (**INTEGRADA** 2026-08-10, main `6e6ba5c`)

Tool de LECTURA `preparar_visita(id)` (property propio): ficha compacta + historial reciente + **campos AUSENTES relevantes**; el bot genera preguntas concretas derivadas de esos huecos y del historial (si falta gastos de comunidad lo pregunta; si el precio bajó dos veces, por qué) + checklist in situ. Deja huella en el EventLog (`visit_prepared`, idempotente por día) → aparece en Novedades e Historia. Reducida al LADO COMPRADOR por la crítica cruzada (coordinar horarios con la contraparte se descartó: no es usuaria de Nidokey y sería operación humana continua). 577 tests, evals 15/15.

**Cierre iteraciones 8-9** — Problema: comparar sin criterio adverso y visitar sin preparación son los dos momentos donde el usuario decide peor. Mejora: asistencia revisable en ambos, siempre sobre datos propios. Pilar: P3. Métrica: % comparaciones con contrapunto; visitas preparadas por usuario. Deuda: la salida del bot no se guarda como nota (candidata a CICLO 6 con las notas aprobadas).

### PAQUETE DE DIFERENCIACIÓN — COMPLETADO

M1 ✅ · M2 ✅ · M3 ✅ · M4 ✅ · M5 ✅ · R1v1 ✅ · MI1 ✅ · MI2 ✅ · MI3 (free íntegro) = decisión de diseño vigente. Todo en `main` y en los dos canales OTA. Descartadas y NO construidas: X-RAD (agente negociador) y D-RAD (trust layer), como mandó el debate.

### Preparación CICLO 6 — DECISIONES sobre herramientas (D6-01, DeepSeek, revisada)

| Herramienta | Decisión |
| --- | --- |
| Calendario | **REDUCIR** a vista de citas + checklist de visita (dentro de MI2); nunca calendario completo con sync externa |
| Notas | **APROBAR mínimo**: por conversación (D5-01) + por ficha de registro |
| Recordatorios/tareas | **APROBAR mínimo**: seguimientos simples desde ficha/conversación, sin gestor completo |
| Colecciones | **DESCARTAR**: los espacios de decisión (R1) ya cubren agrupar/comparar/invitar |
| Alertas | **APROBAR** (ya integradas, 3/25): añadir alta desde el chat («avísame si baja») |

Orden recomendado: notas → tareas → alerta-desde-chat → vista de citas. Revisión de Claude: ACEPTADA; nota: el «tablero de decisiones» citado es (H) hasta que exista R1-v1.

### Preparación CICLO 8 — segmentos y matriz (D8-01, DeepSeek, revisada)

Aceptado: 6 segmentos con disposición a pagar (profesional = sin caso real hoy, HIPOTESIS); comparables 2025 (Notion/Airtable/Miro/PFM, 5-10 €/mes, confianza media); **4,99 €/mes validado como punto medio razonable** si el free queda íntegro; **informe de decisión 6,99-9,99 € pago único ALIMENTA la suscripción** (producto distinto, sin beneficios recurrentes) — no canibaliza.
Rechazado por Claude (contradice decisiones del debate): precios à-la-carte por función (hay UN bundle Premium); «historial 12 meses gratis» (el free es cap de 500 eventos, no temporal); «10 contrapuntos/decisión gratis» (M5 vive dentro de la cuota general del bot, sin cuota propia).
Pendiente del propietario (condición de parada): precio final y activación de pagos reales.

---

## CICLO 5 — Mensajería como sistema de operaciones (CERRADO 2026-08-10)

Partida: los 8 flujos rotos auditados en D5-01. No se construyó mensajería nueva: se
arregló que la conversación **sepa de qué se está hablando** y que las funciones
diferenciales tengan puerta de entrada.

| Pieza | Estado |
| --- | --- |
| Cabecera contextual (servidor) | INTEGRADA (`32a3d69`): el detalle de conversación devuelve estado del registro, precio, y **cambios desde mi último mensaje** (tope 3 eventos, solo al dueño; base = último mensaje propio o `joinedAt`) |
| Cabecera contextual (visual) | **PENDIENTE** — el banner del móvil aún solo pinta título/subtítulo/meta. Delegada a DeepSeek (D6-04) |
| Iconos de acción en el chat del bot | INTEGRADOS: comparar (`scale-balance`) y preparar visita, con selector de registros. El propietario corrigió el icono: la balanza digital no se reconocía |
| El bot dejaba de saber a qué inmueble se refería | RESUELTO sin añadir ids nuevos: los mensajes ya llevan `[[tipo:id\|Título]]`, así que el bot **lee el id del enlace** en vez de pedírselo al usuario. Antes preguntaba «dime el ID del inmueble», que para un usuario no significa nada |
| Teclado fantasma al reentrar en un chat | RESUELTO (BUG-01, `cc6860e`): el relleno se deriva del estado del teclado y se reinicia al enfocar |
| «Cuenta» truncada en las tabs | RESUELTO: era reparto de `flex`, no longitud del texto |
| Enlaces de navegación del bot | RESUELTOS en CÓDIGO, no en prompt (ver aprendizaje abajo) |
| Markdown crudo y cortes a media palabra | RESUELTOS (BUG-13, `ceba961`) |

**Cierre CICLO 5** — Problema: la mensajería era un chat genérico pegado a una app de
registros; no aportaba nada que no diera WhatsApp. Mejora: la conversación lleva el
estado vivo de aquello de lo que habla, y las herramientas de decisión se lanzan desde
ella. Pilar: P2. Evidencia: 608 tests, evals del bot 53/53 (primera vez en verde
completo), typecheck web+móvil. Deuda declarada y visible: **la mitad visual de la
cabecera sigue sin llegar al usuario** — el servidor calcula los cambios y la app no los
pinta; hasta que D6-04 se integre, esta pieza no existe para quien usa la app.

**Aprendizaje central del ciclo (vale para todo el proyecto): dejar de discutir con el
modelo.** Cinco rondas de refuerzo del prompt para que el bot enlazara pantallas
produjeron regresiones peores que el problema: dejó de ejecutar herramientas mientras
afirmaba «✅ Guardado» (el error más grave posible según su propio prompt), empezó a
pedir ids internos y llegó a inventarse rutas. Lo que lo arregló fue **post-proceso
determinista en código** (autoenlace de pantallas conocidas + saneado de rutas
inválidas) y *aliviar* el prompt. Corolario que costó tres rondas de depuración: la
transformación tiene que vivir donde la ejecutan los evals (`agent.ts`), no solo en la
capa de persistencia (`bot.ts`), o el arnés mide un texto distinto del que recibe el
usuario.

## CICLO 6 — Herramientas mínimas (EN CURSO)

Orden aprobado en D6-01: notas → tareas → alerta-desde-chat → vista de citas. **El
propietario adelantó la pieza de tareas** al pedir que el checklist de visita fuera real.

### C6i1 · Checklist de visita REAL (en curso)

Decisión de producto `58592d37`: **el checklist marcable vive en la FICHA; en el chat el
bot resume y enlaza.** No se hace interactiva la burbuja: un mensaje es el registro
inmutable de lo que se dijo, y una casilla marcada dentro de un mensaje de hace tres
semanas no significa nada. Además el volcado en el chat chocaba con el límite de longitud
(el checklist real medía 1678 caracteres contra un tope de producción de 800, subido a
2000) y la presión de llenar la lista era justo lo que producía relleno del tipo «llevar
gafas de sol» — que el propietario cortó en seco: **cada ítem debe estar anclado a un
dato, un hueco o un evento; 5-8 es un techo, no una cuota.**

| Pieza | Estado |
| --- | --- |
| Modelo `RecordTask` + `RecordTaskItem` | APLICADO a Neon con `db push` (uno por VISITA, no por inmueble: se conserva la del domingo y la del jueves) |
| Servidor: API owner-scoped + ítems deterministas en `preparar_visita` + evento al completar | Codex `bfbb83ed` EN CURSO |
| Móvil: `RecordChecklistBlock` (tachado, contador, «+ añadir comprobación») | **INTEGRADO** — primera entrega de CÓDIGO de DeepSeek (D6-03), revisada y corregida por Claude |
| Montaje en la ficha + prompt que resume y enlaza | PENDIENTE (el prompt espera a que Codex libere `src`) |
| BUG-14 (relleno genérico) | ABSORBIDA por C6i1-A: sus instrucciones ya exigen la regla de anclaje. Mantenerlas separadas habría hecho que dos tareas reescribieran el mismo generador de ítems |

**DeepSeek pasa a escribir código.** El propietario autorizó ampliar sus capacidades
(«TODO»). Se amplió el arnés para que quepa una entrega real: tope de salida 4000 → 16000
caracteres **conservando los saltos de línea** (antes el markdown y el código llegaban
aplastados en una sola línea ilegible), `max_tokens` 8192 → 16384, y contrato de entrega
`### FICHERO: ruta` con el contenido COMPLETO del fichero, nunca diffs ni «...». También
se le quitó el protocolo obligatorio del grafo, que era **imposible de cumplir** para un
agente sin repositorio ni herramientas: pedírselo era lo que le empujaba a inventarse
citas de ficheros que no había visto. Lo entregado se revisa siempre antes de integrar:
en su primera entrega de código había dos defectos reales (estados de carga y error
inalcanzables por el orden de las guardas, y una sincronización que se comía la marca
optimista del usuario).

---

## Registro de intervenciones

- 2026-08-09 · claude · CICLO 1: mapa producto + inventarios + flujos rotos; Codex y DeepSeek despachados en paralelo.
- 2026-08-09 · claude+codex+deepseek · CICLO 1.5: debate completo (15 propuestas → 6 críticas cruzadas → síntesis). Aprobadas 5 mejoras + 1 radical faseada + 3 monetizaciones indirectas; descartadas X-RAD y D-RAD (2 votos cada una). Siguiente: CICLO 2 con la dirección estratégica como filtro.
- 2026-08-09 · claude+codex+deepseek · CICLO 2: matriz de 9 categorías con VE, decisiones y plan de migración flags-first en 5 fases. Unánime: apagar food y sacar workout — ELEVADO AL PROPIETARIO (condición de parada §9). Siguiente: CICLO 3 tras autorización.
- 2026-08-09 · propietario · AUTORIZA fase 0 (food OFF) y fase 1 (workout fuera). Autoriza además la vía Codex manual al agotarse el cupo automático diario.
- 2026-08-09 · claude+codex · FASE 0 IMPLEMENTADA Y DESPLEGADA (main 2866cc7 + e0ed36e): crons pausados (gasto Apify cortado), kill-switch FOOD_ENABLED en 6 endpoints, bot sin tools/menciones food, NAV_ALLOW limpio, 5 guards en food-off.test.ts; typecheck + 509 tests OK. Barrido Codex 8dc7280b integrado (7 hallazgos: 5 aceptados, 2 aplazados a CICLO 9).
- 2026-08-09 · claude(coordinador)+deepseek · CICLO 3 COMPLETADO bajo el nuevo modelo de coordinación: pilares P1-P4 + arquitectura en capas + propuesta de valor + límites (Claude); recorridos R1-R7 y mapa de conexiones (DeepSeek D3-01/02/02b, revisados y corregidos). Siguiente: CICLO 4 iteración 1 (HANDOFF_A_CODEX fase 1 workout).
- 2026-08-10 · claude+codex+deepseek · CICLO 4 COMPLETADO: paquete de diferenciación íntegro (M1-M5, R1v1, MI1-MI2) en main y en los dos canales OTA.
- 2026-08-10 · propietario · Reenfoque: las tareas de lanzamiento (flip de la landing, capturas/vídeos de tienda, bundle a Play, IAP) quedan APLAZADAS hasta que el producto funcione bien y haya material. Foco: mejorar lo que hay y acabar el loop.
- 2026-08-10 · claude+codex+deepseek · CICLO 5 CERRADO: cabecera contextual (servidor), iconos de acción del bot, ids por enlace, teclado, evals 53/53. Deuda visible: la mitad VISUAL de la cabecera no ha llegado al usuario.
- 2026-08-10 · propietario · Autoriza ampliar las capacidades de DeepSeek («TODO»). Claude amplía el arnés (16000 caracteres con saltos de línea, contrato de fichero completo, se le retira el protocolo del grafo que no podía cumplir) y le delega su primera tarea de CÓDIGO (D6-03).
- 2026-08-10 · claude · CICLO 6 abierto por petición del propietario con la pieza de tareas adelantada: checklist de visita REAL. Decisión `58592d37` (el checklist marcable vive en la ficha; el chat resume y enlaza). BUG-14 absorbida por C6i1-A. BUG-12 y BUG-13 integrados en `ceba961` (608 tests).
