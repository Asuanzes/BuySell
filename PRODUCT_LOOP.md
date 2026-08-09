# PRODUCT_LOOP.md — Loop maestro multiagente de producto

> Documento único de coordinación (Claude Code = producto, Codex = técnica,
> DeepSeek = crítica). Leer antes de trabajar, actualizar al terminar.
> Norma de estrategia: `docs/MODELO-NEGOCIO.md`.

```yaml
ciclo: 2
fase_global: auditoria
iteracion: 1
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
siguiente_accion: CICLO 3 (pilares y recorridos); fases 0-1 listas para implementar en CICLO 4 (Codex editor principal)
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

## Registro de intervenciones

- 2026-08-09 · claude · CICLO 1: mapa producto + inventarios + flujos rotos; Codex y DeepSeek despachados en paralelo.
- 2026-08-09 · claude+codex+deepseek · CICLO 1.5: debate completo (15 propuestas → 6 críticas cruzadas → síntesis). Aprobadas 5 mejoras + 1 radical faseada + 3 monetizaciones indirectas; descartadas X-RAD y D-RAD (2 votos cada una). Siguiente: CICLO 2 con la dirección estratégica como filtro.
- 2026-08-09 · claude+codex+deepseek · CICLO 2: matriz de 9 categorías con VE, decisiones y plan de migración flags-first en 5 fases. Unánime: apagar food y sacar workout — ELEVADO AL PROPIETARIO (condición de parada §9). Siguiente: CICLO 3 tras autorización.
