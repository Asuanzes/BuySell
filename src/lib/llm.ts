/**
 * Llamada de TEXTO a un LLM: sin herramientas, sin historial y sin estado.
 * Cascada Claude Haiku (Anthropic prepago) → Groq (gratis), con fetch plano y
 * sin SDK, igual que el resto de proveedores del repo.
 *
 * Devuelve `null` si no hay claves o si fallan los dos: quien llama DEBE seguir
 * funcionando sin LLM (aquí el modelo adorna, no decide).
 *
 * No reutiliza src/lib/chat/agent.ts a propósito: aquel es el agente del chat
 * (tool-use, guardWrites, ventana de historial) y tiene su propia suite de
 * evals; meterle un modo "solo texto" sería tocar código caliente sin ganancia.
 */
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5-20251001";
const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";

export type LlmTextOpts = {
  prompt: string;
  system?: string;
  maxTokens?: number;
  /** Corto a propósito: esto va dentro de una petición HTTP del usuario. */
  timeoutMs?: number;
};

async function callAnthropic(o: LlmTextOpts): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: o.maxTokens ?? 400,
      temperature: 0.3,
      ...(o.system ? { system: o.system } : {}),
      messages: [{ role: "user", content: o.prompt }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(o.timeoutMs ?? 12_000),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { content?: { type?: string; text?: string }[] };
  const text = (body.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
  return text || null;
}

async function callGroq(o: LlmTextOpts): Promise<string | null> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return null;
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: o.maxTokens ?? 400,
      temperature: 0.3,
      messages: [...(o.system ? [{ role: "system", content: o.system }] : []), { role: "user", content: o.prompt }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(o.timeoutMs ?? 12_000),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content?.trim() || null;
}

/** Texto del LLM, o null si no hay proveedor disponible. Nunca lanza. */
export async function llmText(opts: LlmTextOpts): Promise<string | null> {
  for (const call of [callAnthropic, callGroq]) {
    try {
      const out = await call(opts);
      if (out) return out;
    } catch (err) {
      console.error("[llm]", call.name, err instanceof Error ? err.message : err);
    }
  }
  return null;
}

/**
 * Primer array JSON que aparezca en la respuesta. Los modelos pequeños envuelven
 * el JSON en prosa o en ```json aunque se les pida lo contrario.
 */
export function extractJsonArray(text: string | null): unknown[] | null {
  if (!text) return null;
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
