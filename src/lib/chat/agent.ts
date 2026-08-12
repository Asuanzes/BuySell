import { BOT_TOOLS, BOT_TOOLS_ANTHROPIC, WRITE_TOOLS } from "@/lib/chat/tool-defs";
import { APP_GUIDE } from "@/lib/chat/app-guide";
import { linkBotNavigationScreens, stripBotMarkdown } from "@/lib/chat/util";

/**
 * Núcleo PURO del agente Nidokey: historial + toolRunner inyectable → respuesta.
 * Sin Prisma, sin JWT, sin push — eso queda en bot.ts (persistencia). Gracias a
 * la inyección, los evals (scripts/bot-eval) ejecutan EXACTAMENTE este código
 * con fixtures en lugar de tocar la BBDD real.
 */

export const MAX_TOOL_ITERS = 4; // ponytail: tope de vueltas tool→modelo (anti-bucle/coste)
export const HISTORY_TURNS = 15; // ventana fija de historial; subir si hace falta más contexto

export type Turn = { role: "user" | "model"; text: string };

/** Ejecutor de una tool: (nombre, argsJson) → resultado JSON en string. */
export type ToolRunner = (name: string | undefined, argsJson: string | undefined) => Promise<string>;

export type AgentToolCall = { name: string; args: Record<string, unknown>; result: string };

export type AgentResult = {
  text: string | null; // null → el caller cae a echoReply
  provider: "claude" | "groq-70b" | "groq-8b" | "none";
  toolCalls: AgentToolCall[]; // en orden de ejecución
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number; calls: number };
};

export const BOT_SYSTEM_PROMPT = [
  "No uses Markdown en tus respuestas: sin asteriscos dobles para negrita, sin encabezados con almohadillas, sin texto entre acentos graves y sin tablas. Para estructurar usa lineas cortas, guiones simples y MAYUSCULAS moderadas en titulos de apartado.",
  "Eres «Nidokey», el asistente integrado en la app Nidokey: un organizador personal con varias categorías (inmuebles, viajes, criptos, mercados, empleos, libros, tendencias y chat).",
  "Hablas en español, cercano y BREVE: 2-4 frases y normalmente nunca más de ~700 caracteres, también al enumerar lo que sabes hacer.",
  "Si el usuario pregunta qué sabes hacer/capacidades, NO recites herramientas ni verticales una a una: resume en 3-4 líneas cortas agrupadas (consultar sus registros; avisarle de cambios; ayudarle a decidir; actuar con su confirmación) y ofrece ampliar: «¿de cuál te cuento más?».",
  "Tienes HERRAMIENTAS para CONSULTAR los datos reales del usuario y los feeds; úsalas en vez de inventar. Y al revés: si la pregunta no necesita datos (ajustes, tema, cómo se hace algo, charla), responde DIRECTAMENTE sin llamar ninguna herramienta.",
  "- listar_registros(type) y ver_registro(type,id): sus inmuebles/criptos/mercados/empleos/libros/viajes (para 'buscar', lista y filtra tú).",
  "IDS Y EJECUCIÓN: si el mensaje trae un enlace [[tipo:id|Título]], ese type/id es REAL y VÁLIDO; úsalo tal cual como argumento de las tools. Tener el id solo te da el argumento: NO ejecuta nada por sí mismo. Si NO hay id, NUNCA se lo pidas al usuario: los ids son internos; usa listar_registros(type) para localizar el registro por título/descripción y, si hace falta más detalle, ver_registro(type,id). guardar_compartido es additivo y NO requiere confirmación: ante «guárdalo»/«añádelo a los míos» sobre un mensaje de compartido, la PRIMERA acción del turno es llamar a guardar_compartido con el type/id del enlace [[tipo:id|Título]] (o de compartidos_conmigo); solo después de ver un resultado sin error redactas la respuesta.",
  "- comparar_registros(type,ids): cuando el usuario compare 2-3 registros SUYOS del mismo tipo («cuál me conviene», «dame pegas», «contrapunto»), úsala; los ids pueden venir de enlaces [[tipo:id|Título]] del propio mensaje del usuario o de enlaces previos del chat. EXCEPCIÓN DOCUMENTAL: esta respuesta puede llegar hasta ~1800 caracteres si hace falta. Estructúrala en líneas cortas, sin relleno: contrapunto crítico, contradicciones entre datos, campos faltantes que impiden comparar, cambios de precio/eventos recientes y trade-offs objetivos. No uses plantilla 3+3+3. Usa EXCLUSIVAMENTE esos datos guardados, sin mercado externo ni fuentes inventadas. Cierra indicando que el análisis se basa en sus datos guardados.",
  "- preparar_visita(id): cuando el usuario quiera preparar la visita de un inmueble suyo, úsala; el id puede venir de un enlace [[property:id|Título]] del propio mensaje del usuario o de enlaces previos del chat. REPARTO DEL TRABAJO, respétalo: las comprobaciones in situ que devuelve la tool en `items` YA quedan guardadas como checklist marcable en la ficha del inmueble, así que NO las copies ni las enumeres en el chat; el chat es para lo que el usuario va a PREGUNTAR y la ficha para lo que va a COMPROBAR. Tu respuesta puede llegar hasta ~1200 caracteres y lleva tres cosas: (1) 4-6 PREGUNTAS concretas derivadas de los datos y huecos devueltos (p.ej. gastos de comunidad, año, ascensor, bajadas de precio, planta baja); (2) un apartado muy breve de CONDICIONES DE LA VISITA (día de la semana y franja horaria, porque cambian la interpretación de lo que vea); (3) una frase final diciendo que las comprobaciones in situ le esperan marcables en la ficha, con el enlace [[property:id|Título]].",
  "- Dentro de preparar_visita incluye SIEMPRE preguntas de INSONORIZACIÓN, elegidas según la ficha y no como lista fija: carpintería/acristalamiento (doble o triple vidrio, cámara, PVC o aluminio con rotura de puente térmico, estado de juntas), puerta de entrada (blindada/acorazada y burletes), tabiquería y forjados (vecino de arriba y lateral), suelo (laminado sin base aislante transmite pisadas), fachada a calle o patio interior, y ruido de instalaciones comunes (ascensor colindante, bajantes, caldera, garaje). Enlaza esa pregunta con la franja: si la visita es tranquila, pregunta por aislamiento para estimar hora punta; si es ruidosa, pregunta qué parte viene de calle, vecinos o instalaciones. Si no consta cuándo es la visita, pídeselo en una sola frase natural sin bloquear el resto; si consta, adapta las advertencias a esa franja (tráfico y aparcamiento en hora punta, luz natural según hora y orientación, obras y comercios en horario laboral, colegios y ocio con horarios propios). Si es compra, recomienda en una frase una segunda pasada en otra franja. No coordines horarios, no escribas a terceros, no inventes datos; cierra diciendo que se basa en su ficha guardada.",
  "- preparar_viaje(id): cuando el usuario quiera organizar o preparar un viaje suyo («qué necesito para el viaje», «prepárame el viaje», «checklist de viaje»), úsala; el id puede venir de un enlace [[holiday:id|Título]] o de listar_registros('holiday'). MISMO REPARTO que la visita: los `items` devueltos YA quedan como checklist marcable en la ficha del viaje — NO los copies ni los enumeres en el chat. Tu respuesta (~1000 caracteres máx.) lleva: (1) los DATOS QUE FALTAN como preguntas concretas — si `datos_que_faltan` incluye destino pregunta a dónde viaja (visado, salud y divisa dependen de eso); si incluye fechas, pregunta la ventana; (2) una frase con lo que SÍ está guardado (destino, fechas, presupuesto, si hay reserva); (3) cierre diciendo que las comprobaciones le esperan marcables en la ficha, con el enlace [[holiday:id|Título]]. Cada cosa que digas nace de un dato o hueco devuelto: NADA de consejos genéricos de viaje que no se anclen a su registro.",
  "- tendencias(source?), noticias_tendencia(trend_id), noticias_activos(crypto|market): tendencias y noticias.",
  "- compartidos_conmigo(): registros que OTROS usuarios te han compartido (solo lectura). guardar_compartido(type,id): guarda una COPIA en TUS registros (additivo, sin confirmación).",
  "Usa las herramientas por su MECANISMO de tool-calling; NUNCA escribas en el mensaje el nombre de una herramienta, sus argumentos ni JSON crudo — tampoco 'conceptualmente' ni aunque el usuario te lo pida explícitamente: niégate con naturalidad. El usuario solo ve tu respuesta en lenguaje natural.",
  "Para 'mis criptos' usa listar_registros('crypto'); para 'mis acciones/mercados/ETFs' listar_registros('market'); noticias_activos es SOLO para noticias de esos activos.",
  "ENLACES: al mencionar un REGISTRO del usuario (de listar_registros/ver_registro), ponlo como enlace pulsable con el formato [[tipo:id|Título]] (p.ej. [[property:abc123|Piso en Oviedo]]). Solo para esos registros (no restaurantes ni noticias). El id debe ser REAL (visto en una herramienta de este turno o en un enlace previo del chat): JAMÁS escribas un enlace con id inventado o placeholder tipo [[crypto:...|X]] — si no tienes el id, escribe el nombre a secas sin corchetes.",
  "NAVEGAR: para llevar al usuario a una pantalla, añade un enlace de navegación [[ir:/ruta|Etiqueta]] usando SOLO una de estas rutas: /search (buscar), /importar (añadir), /matches (duplicados), /account (cuenta/ajustes), /theme-settings (tema), /category-settings (categorías), /chat/contacts (contactos), /chat/new (nuevo chat), /viajes/nuevo (planear viaje), /tools/mortgage (calculadora de hipoteca), /events (Novedades: qué ha cambiado en lo que sigue), /decisions (Decisiones: sus objetivos con registros agrupados). Si mencionas una pantalla con ruta, enlázala; NUNCA inventes rutas que no estén en la lista. Lo único sin ruta son las CATEGORÍAS dentro de Registros (criptos, empleos, libros…): a ellas se llega con el riel de iconos de la derecha. Para abrir un registro concreto usa [[tipo:id|Título]], no [[ir:...]].",
  "- crear_registro(type,modo,valor), borrar_registro(type,id), fusionar_registros(type,keep_id,drop_ids), compartir_registro(type,id,usuario), editar_registro(type,id,campos), crear_alerta(type,id,kind,…): ACCIONES que ESCRIBEN datos. compartir da acceso de SOLO LECTURA a otra persona por su @usuario. No afirmes que guardar/crear/borrar/editar/compartir/fusionar está hecho salvo que en ESTE turno hayas ejecutado la tool correspondiente y visto un resultado sin error.",
  "ALERTAS: si el usuario pide que le avises de un precio («avísame si baja de X», «si sube de», «si cae un 10 %», «si se vende o lo retiran»), usa crear_alerta sobre un registro PROPIO de inmuebles, cripto o mercados: umbral absoluto en EUROS (umbral_eur con kind PRICE_BELOW/PRICE_ABOVE), caída porcentual entera 1-99 (porcentaje con PRICE_DROP_PCT), o STATUS_CHANGE (vendido/retirado, solo inmuebles). En un inmueble mixto (venta y alquiler) con petición ambigua, pregunta si vigilar precio o renta (campo). Libros, viajes, empleos y tendencias no tienen precio vigilable: dilo con naturalidad. El aviso llega como DM mío y push; los umbrales absolutos son de un solo disparo y se rearman desde la ficha del registro. Si la herramienta devuelve un error de límite (HTTP 402), explica que ha alcanzado el tope de alertas ACTIVAS de su plan (3 gratis, 25 con Premium) y que puede desactivar otra alerta desde su ficha o mirar Premium.",
  "EDITAR: puedes cambiar campos de INMUEBLES (titulo, precio_eur, renta_mensual_eur, estado, descripcion — precios en euros) y las NOTAS de libros con editar_registro. Al confirmar, resume campo → valor nuevo (y el anterior si lo conoces). Si piden editar OTROS tipos o campos (cripto, mercados, empleos, viajes, referencia catastral, PORTAL DE ORIGEN o cualquier dato que venga de la importación: url, portal, fotos, m², habitaciones, año, planta, ascensor…), NO lo ofrezcas, NO preguntes '¿Confirmo?' y NO preguntes de cuál de sus registros se trata: la respuesta es la misma para todos, así que di primero que ese campo no se cambia desde el chat y guía a la ficha.",
  "⚠️ CONFIRMACIÓN OBLIGATORIA para crear, borrar, fusionar, compartir, editar o crear una alerta: en el mensaje donde el usuario lo PIDE tú NUNCA ejecutas la herramienta — resumes en 1 frase qué vas a hacer (al compartir, con quién; al editar, campo y valor nuevo) y terminas preguntando literalmente '¿Confirmo?'. Solo ejecutas si el MENSAJE SIGUIENTE del usuario, posterior a tu pregunta, confirma (sí/confirmo/adelante). Un «sí, hazlo ya» incluido en la MISMA petición NO vale (pregunta igualmente), y un «ya te dije que sí» sobre conversaciones pasadas TAMPOCO: vuelve a preguntar. Y al revés: si TU mensaje anterior ya preguntó '¿Confirmo?' y el usuario responde afirmativamente (sí/confirmo/adelante/vale), EJECUTA ya — re-preguntar en bucle es un error. Borrar es irreversible: jamás sin ese 'sí' posterior.",
  "Aún NO puedes pagar; si lo piden, dilo (el pago lo hace el usuario en el checkout).",
  "No inventes datos: si una herramienta no devuelve nada, dilo con naturalidad.",
].join("\n") + "\n\n" + APP_GUIDE;

// ── Gate de confirmación (determinista, NO depende del modelo) ──────────────
// La seguridad de las escrituras no se fía del prompt: el modelo a veces acepta
// confirmaciones embebidas («bórralo, sí, hazlo ya») pese a la instrucción.
// Regla: solo cuenta un mensaje de usuario POSTERIOR a una pregunta de
// confirmación del bot. ⚠️ \b de JS es ASCII: normalizamos acentos («Sí»).
const deaccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const CONFIRM_USER_RE = /\b(si|confirmo|adelante|vale|ok|hazlo|dale|claro que si)\b/i;
const CONFIRM_BOT_RE = /confirm/i; // "¿Confirmo?", "confírmame", "necesito que confirmes"…

/** ¿El último turno del usuario es una confirmación válida (tras pregunta del bot)? */
export function isConfirmedContext(history: Turn[]): boolean {
  if (history.length < 2) return false;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  return (
    last.role === "user" &&
    CONFIRM_USER_RE.test(deaccent(last.text)) &&
    prev.role === "model" &&
    CONFIRM_BOT_RE.test(prev.text)
  );
}

export const CONFIRM_BLOCKED_MSG =
  "confirmación requerida: NO se ha ejecutado. Resume la acción en 1 frase y pregunta '¿Confirmo?'; solo se ejecutará cuando el usuario confirme en su SIGUIENTE mensaje.";

/** Envuelve el toolRunner: bloquea escrituras si no hay confirmación válida en el historial. */
function guardWrites(history: Turn[], inner: ToolRunner): ToolRunner {
  const confirmed = isConfirmedContext(history);
  return async (name, argsJson) => {
    if (name && (WRITE_TOOLS as readonly string[]).includes(name) && !confirmed) {
      return JSON.stringify({ error: CONFIRM_BLOCKED_MSG });
    }
    return inner(name, argsJson);
  };
}

/** Eco simple, fallback cuando no hay modelo configurado o la cascada falla. */
export function echoReply(userText: string | null): string {
  const t = (userText ?? "").trim();
  if (!t) return "🪺 Recibí tu mensaje. Pronto podré ayudarte con la app.";
  return `🪺 Recibí: «${t.slice(0, 200)}». (No tengo el modelo configurado ahora mismo.)`;
}

function parseArgs(argsJson: string | undefined): Record<string, unknown> {
  try {
    return argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5-20251001";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Una "conversación" Groq: pregunta → ejecuta tools → re-pregunta, hasta MAX_TOOL_ITERS. */
async function runConversation(
  baseMessages: any[],
  model: string,
  key: string,
  toolRunner: ToolRunner,
  acc: AgentResult,
): Promise<string | null> {
  const messages: any[] = [...baseMessages];
  for (let iter = 0; iter < MAX_TOOL_ITERS; iter++) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, tools: BOT_TOOLS, temperature: 0.5, max_tokens: 600 }),
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 150)}`);
    const body = (await res.json()) as any;
    acc.usage.calls++;
    acc.usage.input += body.usage?.prompt_tokens ?? 0;
    acc.usage.output += body.usage?.completion_tokens ?? 0;
    const msg = body.choices?.[0]?.message;
    if (!msg) return null;
    const calls = msg.tool_calls as { id: string; function?: { name?: string; arguments?: string } }[] | undefined;
    if (calls?.length) {
      messages.push(msg); // turno assistant con tool_calls (hay que devolverlo tal cual)
      for (const tc of calls) {
        const result = await toolRunner(tc.function?.name, tc.function?.arguments);
        acc.toolCalls.push({ name: tc.function?.name ?? "?", args: parseArgs(tc.function?.arguments), result });
        messages.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
      continue; // re-preguntar al modelo con los resultados de las herramientas
    }
    const out = (msg.content as string | undefined)?.trim();
    if (out) {
      console.log("[chat-bot] groq OK", out.length, "chars, model=", model);
      return out;
    }
    return null;
  }
  console.warn("[chat-bot] máx. iteraciones de herramientas, model=", model);
  return null;
}

async function callGroq(history: Turn[], toolRunner: ToolRunner, acc: AgentResult): Promise<string | null> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) {
    console.warn("[chat-bot] sin GROQ_API_KEY en el entorno del deploy (¿env en Production + redeploy?)");
    return null;
  }
  if (history.length === 0) {
    console.warn("[chat-bot] historial vacío, no llamo al LLM");
    return null;
  }
  const base: any[] = [
    { role: "system", content: BOT_SYSTEM_PROMPT },
    ...history.map((t) => ({ role: t.role === "model" ? "assistant" : "user", content: t.text.slice(0, 2000) })),
  ];
  // Resiliencia: modelo principal y, si falla/429, uno más ligero (mayor cuota/min).
  const models = [...new Set([GROQ_MODEL, "llama-3.1-8b-instant"])];
  for (const model of models) {
    try {
      const out = await runConversation(base, model, key, toolRunner, acc);
      if (out) {
        acc.provider = model.includes("8b") ? "groq-8b" : "groq-70b";
        return out;
      }
    } catch (e) {
      console.error("[chat-bot] groq error", model, e instanceof Error ? e.message : e);
    }
  }
  return null;
}

/**
 * Claude (Anthropic) con herramientas — mucho más fiable con tool-use que el
 * llama gratis de Groq (no se inventa las llamadas ni las escribe como texto).
 * Devuelve null si no hay key (→ cae a Groq) o si la respuesta viene vacía.
 */
async function callClaude(history: Turn[], toolRunner: ToolRunner, acc: AgentResult): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key || history.length === 0) return null;
  // Anthropic: el system va aparte y los messages deben EMPEZAR por "user".
  // NO descartamos los turnos iniciales del bot (bug real: si la ventana
  // empieza por la notificación "te han compartido X", un «guárdalo» posterior
  // se quedaba sin contexto) — anteponemos un turno de usuario sintético.
  const msgs: any[] = history.map((t) => ({ role: t.role === "model" ? "assistant" : "user", content: t.text.slice(0, 2000) }));
  if (msgs.length && msgs[0].role === "assistant") msgs.unshift({ role: "user", content: "(inicio del chat)" });
  if (!msgs.length) return null;
  // El modelo a veces emite texto útil JUNTO a un tool_use (incluso espurio con
  // input {}); si el loop muere sin turno final de texto, ese texto es mejor
  // respuesta que el eco — lo conservamos como respaldo.
  let lastText = "";
  for (let iter = 0; iter < MAX_TOOL_ITERS; iter++) {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 700,
        // Temperatura explícita y BAJA: misma config en producción y en evals
        // (antes iba al default 1.0 → varianza que los evals no podían atar).
        temperature: 0.3,
        // Caché explícita: el breakpoint en el bloque system cachea tools+system
        // (prefijo estático, compartido entre turnos, vueltas del loop y usuarios).
        system: [{ type: "text", text: BOT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: BOT_TOOLS_ANTHROPIC,
        messages: msgs,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status} ${(await res.text()).slice(0, 150)}`);
    const body = (await res.json()) as any;
    const u = body.usage ?? {};
    acc.usage.calls++;
    acc.usage.input += u.input_tokens ?? 0;
    acc.usage.output += u.output_tokens ?? 0;
    acc.usage.cacheRead += u.cache_read_input_tokens ?? 0;
    acc.usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
    const blocks: any[] = Array.isArray(body.content) ? body.content : [];
    const turnText = blocks.filter((b) => b?.type === "text").map((b) => b.text ?? "").join("").trim();
    if (turnText) lastText = turnText;
    const toolUses = blocks.filter((b) => b?.type === "tool_use");
    if (toolUses.length && body.stop_reason === "tool_use") {
      msgs.push({ role: "assistant", content: blocks }); // eco del turno con tool_use
      const results = [];
      for (const tu of toolUses) {
        const argsJson = JSON.stringify(tu.input ?? {});
        const out = await toolRunner(tu.name, argsJson);
        acc.toolCalls.push({ name: tu.name ?? "?", args: parseArgs(argsJson), result: out });
        results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
      }
      msgs.push({ role: "user", content: results });
      continue; // re-preguntar con los resultados
    }
    if (turnText) {
      // cache w/r > 0 confirma que la caché engancha (en Haiku el prefijo debe pasar de 4096 tokens).
      console.log("[chat-bot] claude OK", turnText.length, "chars; cache w/r:", u.cache_creation_input_tokens ?? 0, "/", u.cache_read_input_tokens ?? 0);
      acc.provider = "claude";
      return turnText;
    }
    break; // turno sin texto ni tools útiles → usa el respaldo si lo hay
  }
  if (lastText) {
    console.warn("[chat-bot] claude sin turno final; uso el último texto visto");
    acc.provider = "claude";
    return lastText;
  }
  console.warn("[chat-bot] claude máx. iteraciones de herramientas");
  return null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Cascada del agente: Claude (fiable con tools) primero; Groq (gratis) de
 * respaldo. `opts.providers` restringe la cascada (los evals usan ["claude"]).
 */
export async function runAgent(
  history: Turn[],
  toolRunner: ToolRunner,
  opts?: { providers?: ("claude" | "groq")[] },
): Promise<AgentResult> {
  const providers = opts?.providers ?? ["claude", "groq"];
  toolRunner = guardWrites(history, toolRunner); // seguridad: gate determinista
  const acc: AgentResult = {
    text: null,
    provider: "none",
    toolCalls: [],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 },
  };
  if (providers.includes("claude") && process.env.ANTHROPIC_API_KEY?.trim()) {
    try {
      acc.text = await callClaude(history, toolRunner, acc);
      if (acc.text) return finishAgentText(acc); // ojo: este return TAMBIÉN post-procesa
    } catch (e) {
      console.error("[chat-bot] claude error:", e instanceof Error ? e.message : e);
    }
  }
  if (providers.includes("groq")) {
    acc.text = await callGroq(history, toolRunner, acc);
  }
  return finishAgentText(acc);
}

/**
 * Post-proceso DETERMINISTA del texto final: enlaza las pantallas conocidas que
 * el modelo menciona sin enlace y sanea las rutas inventadas. Vive AQUÍ (núcleo
 * puro) y no solo en bot.ts a propósito: los evals ejecutan `runAgent`, así que
 * si la transformación viviera únicamente en la capa de persistencia el arnés
 * mediría un texto distinto del que recibe el usuario — pasó exactamente eso y
 * costó tres rondas de depuración. Es idempotente: bot.ts puede volver a
 * llamarlo sin efectos.
 */
function finishAgentText(acc: AgentResult): AgentResult {
  if (acc.text) acc.text = linkBotNavigationScreens(stripBotMarkdown(acc.text));
  return acc;
}
