# Nidokey — onboarding para agentes

**Lee `CLAUDE.md` (raíz) antes de tocar nada**: es el brief único y actual del
proyecto (qué es Nidokey, monorepo, infra/deploy, convenciones, gotchas,
pendientes). Este fichero es solo un puntero para no mantener dos copias.

Reglas mínimas si aún no lo has leído:

- Se trabaja SOLO en `apps/mobile/` (la web es landing + API).
- Neon Postgres se gestiona con `prisma db push` — NUNCA `migrate dev/deploy`.
- Todo cambio JS de la app sale por `eas update` (OTA); nativo requiere rebuild.
- No commitear `.env`; el repo es público.

La spec histórica del producto original "BuySell Asturias" está en
`docs/blitzy-tech-spec.md` y NO describe la app actual.

## Graph RAG compartido

Codex y Claude Code comparten el MCP `nidokey-graph`.

- **Primera acción obligatoria de cada tarea:** ejecuta `session_context` con el
  objetivo concreto del usuario. Usa el contexto recuperado en lugar de releer
  indiscriminadamente todo el repositorio y revisa `taskInbox`.
- Si recibes una tarea en cola para `codex`, puedes aceptarla con
  `claim_delegated_task`. Al terminar usa `complete_delegated_task`; no basta
  con responder en el chat.
- Antes de editar, revisa el trabajo activo devuelto y reclama el archivo o
  directorio mínimo con `claim_scope`; si otro agente tiene un ámbito solapado,
  no lo modifiques.
- Amplía solo lo necesario con `graph_search`, `trace_relationships` e
  `impact_analysis`, verificando siempre las citas en el código.
- Al terminar, ejecuta `refresh_index`, registra decisiones no triviales,
  publica un `publish_handoff` y libera el claim.
- Para repartir trabajo, usa `delegate_task` solo hacia el otro agente y con un
  ámbito no solapado. En sesiones Claude Code, la política `required` convierte
  automáticamente cada tarea `critical` o `substantial` en exactamente una raíz
  Codex `analyze`, autorizada y despachada al llamar `session_context`; esta
  petición del propietario es autorización persistente y no requiere confirmar
  cuota en cada ejecución. Consultas breves de estado, formato, erratas o texto
  sin impacto funcional quedan exentas.
- En una tarea sujeta a la política, Codex debe estar arrancado antes de editar.
  Claude trabaja en paralelo, recupera después el resumen con
  `get_delegated_task`, integra o contesta sus hallazgos y publica
  `publish_handoff` antes de finalizar. Los hooks `PreToolUse` y `Stop` hacen
  cumplir el protocolo.
- La colaboración automática está limitada a 1 peer por `context_key`,
  profundidad 0, 1 intento, 25 minutos y 3 ejecuciones al día. No concede
  permisos de commit, push, PR, deploy, OTA, migración, producción, pagos,
  secretos ni borrados.
- Las tareas delegadas pueden crear subtareas, pero deben respetar los límites
  de profundidad, descendientes y concurrencia del orquestador. No se delegan
  implícitamente commits, push, PR, despliegues, OTA, migraciones, pagos,
  secretos ni acciones de producción.

El servidor actualiza el índice incrementalmente al abrir y cerrar cada sesión.
La cola, los leases, eventos, resultados y TaskOutput sobreviven al cierre de la
sesión que delegó.
El grafo ayuda a navegar, pero `CLAUDE.md` y el código actual siguen siendo la
fuente de verdad.
