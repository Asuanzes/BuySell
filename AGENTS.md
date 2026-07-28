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
  ámbito no solapado. Las raíces siempre quedan en cola: usa `dispatch_tasks`
  únicamente tras una petición explícita del usuario y la confirmación de
  consumo. Las subtareas heredan ese presupuesto y no pueden crear nuevas
  raíces.
- Las tareas delegadas pueden crear subtareas, pero deben respetar los límites
  de profundidad, descendientes y concurrencia del orquestador. No se delegan
  implícitamente commits, push, PR, despliegues, OTA, migraciones, pagos,
  secretos ni acciones de producción.

El servidor actualiza el índice incrementalmente al abrir y cerrar cada sesión.
La cola, los leases, eventos, resultados y TaskOutput sobreviven al cierre de la
sesión que delegó.
El grafo ayuda a navegar, pero `CLAUDE.md` y el código actual siguen siendo la
fuente de verdad.
