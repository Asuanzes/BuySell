# Nidokey Graph RAG

Índice local y servidor MCP compartido por Codex y Claude Code. Combina
búsqueda de texto completo con relaciones estructurales del repositorio y una
capa pequeña de coordinación para evitar que dos agentes editen el mismo ámbito
a la vez. Incluye una cola persistente capaz de delegar entre Codex y Claude
Code y ejecutar tareas controladas en segundo plano.

```text
Codex ─┐                          ┌─ Codex CLI
       ├─ MCP ─ SQLite ─ runners ─┤─ Claude Code CLI
Claude ┘                          └─ DeepSeek (wrapper API)
```

Existe un tercer ejecutor delegable, `deepseek` (rol de diseño de producto/UX):
no tiene CLI propio, corre vía `agents/deepseek-runner.mjs` contra la API de
DeepSeek (`DEEPSEEK_API_KEY` en el entorno; modelo `NIDOKEY_DEEPSEEK_MODEL`,
por defecto `deepseek-chat`). Solo admite `mode=analyze` — nunca escribe en el
working tree — y no participa en la colaboración obligatoria, que sigue siendo
exclusivamente Claude → Codex.

## Qué indexa

- TypeScript/JavaScript: archivos, imports, funciones, componentes, clases,
  métodos, tipos, llamadas resolubles, rutas API y pantallas Expo.
- Prisma: modelos, enums y relaciones.
- Markdown: secciones y referencias entre documentos.
- `package.json` y nombres de variables de `.env.example` (nunca valores).
- Contexto operativo: `AGENTS.md`, `CLAUDE.md` y resúmenes de `.remember/`.
- Sesiones de agentes, claims, decisiones y handoffs.
- Tareas delegadas, dependencias, leases, eventos, ejecuciones y TaskOutput.

La autoridad no es uniforme: `CLAUDE.md`, `AGENTS.md` y el código actual pesan
más que el README y las especificaciones históricas.

## Privacidad

Todo queda en `.graphrag/nidokey.sqlite`, que está ignorado por Git. No utiliza
embeddings remotos ni persiste credenciales. Los ejecutores reutilizan el login
local de Codex/Claude y por tanto **sí consumen la cuota de esos productos**
cuando se usa ejecución en segundo plano. Se excluyen:

- `.env` y variantes locales;
- claves, certificados y cuentas de servicio;
- `node_modules`, builds, binarios y logs;
- configuración personal `.claude/settings.local.json`.

El grafo nunca sustituye al código. Cada resultado incluye ruta y línea para
verificación.

## Presupuesto de contexto

Todas las herramientas de lectura tienen un presupuesto propio y siempre
devuelven JSON válido. Los valores predeterminados son:

| Respuesta | Presupuesto |
| --- | ---: |
| `session_context` | 4.000 caracteres |
| `list_delegated_tasks` | 4.000 |
| `get_delegated_task` (`status` / `summary`) | 3.000 / 6.000 |
| `active_work` | 5.000 |
| `graph_search` | 10.000 |

`session_context` usa un modo incremental:

- dos resultados relevantes por defecto y como máximo seis;
- sesiones agrupadas por agente, sin metadatos repetidos;
- una decisión y un handoff recientes, ambos resumidos;
- únicamente tareas no terminales asignadas al agente;
- sin listados de tipos de nodo, tests históricos ni instrucciones completas;
- la primera llamada hace el bootstrap; las siguientes entregan cambios;
- `context_key` permite reconocer una tarea aunque cambie su redacción;
- `force_context: true` fuerza excepcionalmente un bootstrap completo.

Los detalles no desaparecen: se recuperan bajo demanda mediante `graph_search`,
`get_node`, `trace_relationships`, `impact_analysis`, `active_work` o
`get_delegated_task`. Las tareas usan `detail: "status"` por defecto,
`detail: "summary"` para una entrega acotada y `detail: "full"` solo para una
auditoría explícita. `graph_search` devuelve exactamente `max_results`, omite
metadatos por defecto y limita las relaciones. `get_node` devuelve cuatro
coincidencias por defecto (o hasta ocho) y permite recuperar metadatos con
`include_metadata: true`; `trace_relationships` e `impact_analysis` limitan
nodos y relaciones estructuralmente y marcan `truncated` cuando hay más
contexto disponible. El índice se refresca al abrir la sesión;
`session_context` no repite ese recorrido salvo que se pase `refresh: true` o
haya fallado el refresco inicial.

## Comandos

```powershell
node --no-warnings tools/graphrag/cli.mjs index
node --no-warnings tools/graphrag/cli.mjs status
node --no-warnings tools/graphrag/cli.mjs query "flujo de mensajes del chat"
node --no-warnings tools/graphrag/cli.mjs trace "ChatSocket.open"
node --no-warnings tools/graphrag/cli.mjs impact "src/lib/chat/config.ts"
node --no-warnings tools/graphrag/cli.mjs active
node --no-warnings tools/graphrag/cli.mjs tasks
node --no-warnings tools/graphrag/cli.mjs task <task-id>
node --no-warnings tools/graphrag/cli.mjs orchestrator
node --no-warnings tools/graphrag/cli.mjs dispatch <task-id> --confirm
node --no-warnings tools/graphrag/cli.mjs cancel <task-id>
node --no-warnings --test tools/graphrag/test.mjs
```

También hay scripts `npm run graphrag:*`.

## Herramientas MCP

| Herramienta | Uso |
| --- | --- |
| `session_context` | Bootstrap de tarea: actualiza y recupera contexto, trabajo, decisiones y handoffs |
| `delegate_task` | Delega al otro agente con ámbito, dependencias y límites |
| `list_delegated_tasks` | Bandeja compacta; detalle completo solo bajo demanda |
| `get_delegated_task` | Estado, resumen o auditoría completa mediante `detail` |
| `claim_delegated_task` | Acepta una tarea en la sesión actual |
| `complete_delegated_task` | Persiste TaskOutput y handoff, y libera el ámbito |
| `cancel_delegated_task` | Cancela cola o solicita parar el PID registrado |
| `dispatch_tasks` | Despliega agentes locales en segundo plano |
| `orchestration_status` | Capacidad, procesos y disponibilidad de ejecutores |
| `graph_status` | Cobertura y antigüedad del índice |
| `refresh_index` | Actualización incremental por hash |
| `graph_search` | Recuperación acotada; metadatos y relaciones son optativos |
| `get_node` | Símbolo, archivo o entidad concreta |
| `trace_relationships` | Recorrido estructural |
| `impact_analysis` | Consumidores afectados por un cambio |
| `active_work` | Trabajo activo; historial solo con `include_history: true` |
| `claim_scope` | Reserva temporal de archivo/directorio |
| `release_claim` | Liberación de reserva |
| `record_decision` | Decisión técnica enlazada al código |
| `publish_handoff` | Resumen para el otro agente |

## Protocolo de trabajo paralelo

1. Al comenzar, llamar `session_context` con el objetivo concreto de la tarea.
2. Revisar el trabajo activo, decisiones, handoffs y contexto que devuelve.
3. Ampliar solo lo necesario con `graph_search` o recorridos estructurales.
4. Reclamar el directorio o archivo mínimo mediante `claim_scope`.
5. Si hay conflicto, dividir el trabajo o esperar; no sobrescribir al otro
   agente.
6. Implementar y probar.
7. Ejecutar `refresh_index`.
8. Registrar decisiones no evidentes y publicar un handoff.
9. Liberar el claim.

## Delegación persistente

1. El agente creador llama `delegate_task` con `target_agent`, instrucciones,
   criterios de aceptación y un `scope` no solapado.
2. La tarea queda en SQLite. Puede esperar dependencias sin ocupar un proceso.
3. El receptor puede aceptarla con `claim_delegated_task`, o el creador puede
   autorizar la raíz y arrancar un runner mediante `dispatch_tasks`. Los hijos
   heredan ese presupuesto; un worker nunca puede crear otra raíz.
4. El runner reserva el ámbito y lanza el CLI permitido mediante argumentos
   separados, nunca mediante un comando de shell construido con el prompt.
5. El proceso renueva su lease, registra PID y eventos y produce un resultado
   validado por `task-output.schema.json`; el resumen está limitado a 4.000
   caracteres y los artefactos extensos se referencian mediante rutas.
6. La finalización crea un handoff y relaciones `DELEGATED`, `ASSIGNED_TO`,
   `CHILD_OF`, `DEPENDS_ON`, `SCOPES` y `PRODUCED`.
7. Si el proceso falla, se reintenta dentro del presupuesto. Si necesita
   permisos o información, termina en `needs_input`.

Límites por defecto:

- 3 runners simultáneos en total y 2 por proveedor;
- profundidad máxima 2 (límite absoluto 3);
- 3 hijos directos y 8 descendientes por raíz;
- 2 intentos y 45 minutos por tarea;
- idempotencia y huella de duplicados;
- cancelación dirigida únicamente al proceso registrado.
- máximo de 3 raíces activas autorizadas en segundo plano.

Para seguimiento frecuente usa `orchestration_status`. Consulta
`get_delegated_task` con `detail: "status"` solo cuando necesites el estado de
una tarea concreta; evita sondear repetidamente `summary` o `full`.

### Colaboración Claude Code → Codex obligatoria

Con `NIDOKEY_GRAPH_COLLAB_POLICY=required`, `session_context` clasifica el
objetivo de una sesión Claude Code. Las tareas `critical` o `substantial`
(implementación, bugs funcionales, seguridad, datos, arquitectura,
integraciones, refactors, rendimiento, investigación técnica o cambios
multifichero) crean de forma idempotente exactamente una raíz Codex en modo
`analyze`. Se autoriza y despacha automáticamente; la configuración constituye
la autorización persistente del propietario y no abre una confirmación de cuota
por tarea. Consultas cortas de estado, formato, erratas o texto sin impacto
funcional se clasifican como triviales y quedan exentas.

El gate exige este orden:

1. Claude llama `session_context` con un `context_key` estable.
2. El peer Codex queda arrancado antes de cualquier edición de Claude.
3. Ambos trabajan en paralelo; el peer `analyze` no recibe un claim de escritura.
4. Claude espera su estado terminal y recupera el resultado con
   `get_delegated_task` (`detail: "summary"`).
5. Claude integra o responde expresamente a los hallazgos y publica
   `publish_handoff` antes de cerrar.

Los hooks de Claude `PreToolUse` y `Stop` bloquean, respectivamente, una
edición prematura y el cierre sin revisar el peer. El perfil automático fija
1 peer por `context_key`, `max_depth: 0`, `max_attempts: 1`, timeout de 25
minutos y 3 peers automáticos por día. Alcanzar el tope no degrada a ejecución
silenciosa: requiere intervención humana. El peer conserva sandbox de solo
lectura y no hereda permisos para commit, push, PR, deploy, EAS Update,
migraciones, producción, pagos, secretos o borrados.

Las tareas de análisis usan sandbox de solo lectura. En tareas `edit`, Codex
limita su raíz escribible al directorio delegado; Claude arranca desde ese mismo
directorio con aceptación de ediciones. El ámbito sigue siendo una frontera
cooperativa en Claude. Los prompts se entregan por `stdin`, no aparecen como
argumentos del proceso.

Los claims caducan automáticamente. Además, el servidor intenta liberarlos
cuando finaliza la sesión MCP. El índice se actualiza incrementalmente tanto al
abrir como al cerrar la sesión, por lo que los archivos nuevos y modificados se
incorporan aunque el agente omita la actualización manual.

## Integración

- Claude Code lee `.mcp.json` y Codex `.codex/config.toml`; ambos apuntan a una
  copia operativa en `C:\Users\suanz\.nidokey-graph\runtime`, fuera del árbol
  editable de la app.
- Los workers de Claude cargan una configuración MCP protegida y solo los
  ajustes de usuario; no ejecutan hooks o MCP definidos por el repositorio.
- Los workers de Codex ignoran la configuración de usuario para esa ejecución
  e inyectan únicamente el MCP protegido, conservando la autenticación local.
- Cada cliente lanza un proceso `stdio` independiente.
- Ambos procesos comparten SQLite en modo WAL, por lo que las lecturas son
  concurrentes y las escrituras cortas se serializan.
- Cada tarea de fondo usa un runner Node desacoplado de la sesión MCP que la
  creó. Sus logs acotados viven en `.graphrag/runs/`.
- `.mcp.json` activa la política obligatoria y sus topes mediante
  `NIDOKEY_GRAPH_COLLAB_POLICY`, `NIDOKEY_GRAPH_COLLAB_DAILY_LIMIT` y
  `NIDOKEY_GRAPH_COLLAB_TIMEOUT_MINUTES`. La entrada MCP de Codex usa
  `required = true`, de modo que una sesión no continúa silenciosamente sin el
  servidor compartido.

Después de instalar o cambiar la configuración, reinicia la sesión del agente y
comprueba el servidor con `/mcp`.

## Limitaciones

- La resolución de llamadas dinámicas, reflexión y exports indirectos es
  heurística.
- La búsqueda es local y estructural; no envía código a un modelo de embeddings.
- Los claims son cooperativos. Codex aplica además un límite de escritura por
  directorio; Claude sigue compartiendo el working tree principal. Para
  aislamiento fuerte de Claude harían falta worktrees y una fase explícita de
  integración.
- Una tarea de fondo no puede resolver preguntas de aprobación. Debe devolver
  `needs_input`.
- No se autorizan implícitamente commits, pushes, PR, despliegues, OTA,
  migraciones, pagos, secretos, producción ni borrados.
- Si el equipo o el sistema mata bruscamente un runner, la reconciliación evita
  duplicar una tarea mientras detecte un PID vivo; puede requerir revisión
  humana.
- Antes de eliminar código o realizar una migración, hay que verificar usos
  dinámicos y consumidores externos con las herramientas normales del repo.
