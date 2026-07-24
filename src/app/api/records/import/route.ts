import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { BaseRecord, RecordType } from "@nidokey/shared";

import { getUserId } from "@/lib/auth-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { jobSearchDailyLimit } from "@/lib/billing/entitlements";
import { pickAdapter } from "@/features/sources/registry";
import { upsertRecord, getCryptoById, getMarketById, getJobById, getBookById, getHolidayById } from "@/features/sources/upsert";
import { cryptoToBaseRecord, marketToBaseRecord, jobToBaseRecord, bookToBaseRecord, holidayToBaseRecord } from "@/lib/records/mapper";
import type { NormalizedRecord } from "@/features/sources/types";

/**
 * POST /api/records/import — ingesta UNIFICADA de registros (todos los tipos).
 *
 * Body: { type, input: SourceInput, source? }
 *   input = { kind:"url", url } | { kind:"symbol", symbol, quote? } | { kind:"query", query }
 *
 * Auth: getUserId() (cookie web / JWT móvil / token bs_) — mismo resolver que
 * todo el backend, sin lógica de token paralela. Para fuentes con API oficial
 * (cripto/mercados) la extracción corre server-side aquí; para fuentes
 * `manualOnly` (scrape duro) devuelve { needsClient: true } y el WebView del
 * móvil postea el registro normalizado por el mismo canal (fase posterior).
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Registro ya normalizado que envía el cliente (candidato elegido en una
// búsqueda de pago, p. ej. empleo): se guarda tal cual, sin re-llamar a la fuente.
const RecordPayload = z.object({
  recordType: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().nullish(),
  status: z.string().nullish(),
  currentValue: z.number().nullish(),
  currency: z.string().nullish(),
  imageUrl: z.string().nullish(),
  source: z.string().min(1),
  externalId: z.string().nullish(),
  observedAt: z.union([z.string(), z.date()]).optional(),
  meta: z.record(z.unknown()).optional(),
});

const Body = z.object({
  type: z.string().min(1),
  source: z.string().optional(),
  input: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("url"), url: z.string().url() }),
    z.object({ kind: z.literal("symbol"), symbol: z.string().min(1), quote: z.string().optional() }),
    z.object({ kind: z.literal("query"), query: z.string().min(1) }),
    z.object({ kind: z.literal("record"), record: RecordPayload }),
  ]),
});

/** Recarga la fila guardada y la mapea a BaseRecord para la respuesta. */
async function recordById(type: RecordType, id: string): Promise<BaseRecord | null> {
  if (type === "crypto") {
    const r = await getCryptoById(id);
    return r ? cryptoToBaseRecord(r) : null;
  }
  if (type === "market") {
    const r = await getMarketById(id);
    return r ? marketToBaseRecord(r) : null;
  }
  if (type === "job") {
    const r = await getJobById(id);
    return r ? jobToBaseRecord(r) : null;
  }
  if (type === "book") {
    const r = await getBookById(id);
    return r ? bookToBaseRecord(r) : null;
  }
  if (type === "holiday") {
    const r = await getHolidayById(id);
    return r ? holidayToBaseRecord(r) : null;
  }
  return null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const ownerId = await getUserId();
  if (!ownerId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401, headers: CORS_HEADERS });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers: CORS_HEADERS });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", issues: parsed.error.flatten() },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const type = parsed.data.type as RecordType;
  const input = parsed.data.input;

  // Candidato ya normalizado (búsqueda de pago, p. ej. empleo): se persiste
  // directo, SIN volver a llamar a la fuente (coste 0 al elegir).
  if (input.kind === "record") {
    const r = input.record;
    if (r.recordType !== type) {
      return NextResponse.json(
        { error: "recordType no coincide con type" },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    const normalized: NormalizedRecord = {
      recordType: type,
      title: r.title,
      subtitle: r.subtitle ?? null,
      status: r.status ?? null,
      currentValue: r.currentValue ?? null,
      currency: r.currency ?? null,
      imageUrl: r.imageUrl ?? null,
      source: r.source,
      externalId: r.externalId ?? null,
      observedAt: r.observedAt ? new Date(r.observedAt) : new Date(),
      meta: r.meta ?? {},
    };
    try {
      const { id, created } = await upsertRecord(ownerId, normalized);
      const record = await recordById(type, id);
      return NextResponse.json(
        { created, record },
        { status: created ? 201 : 200, headers: CORS_HEADERS }
      );
    } catch (err) {
      console.error("[records-import] error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Error interno" },
        { status: 500, headers: CORS_HEADERS }
      );
    }
  }

  // Búsqueda de empleo = 3 actores Apify DE PAGO por petición. Cuota diaria por
  // usuario (mayor en Premium): sin ella, un script con un JWT quema saldo sin tope.
  if (type === "job" && input.kind === "query") {
    const limit = await jobSearchDailyLimit(ownerId);
    const jobsLimit = await rateLimit("jobs-search", ownerId, { limit, windowMs: 86_400_000 });
    if (!jobsLimit.ok) {
      return NextResponse.json(
        { error: "Límite diario de búsquedas de empleo alcanzado. Inténtalo mañana." },
        { status: 429, headers: CORS_HEADERS }
      );
    }
  }

  const adapter = pickAdapter(type, input);
  if (!adapter) {
    return NextResponse.json(
      { error: `Sin fuente disponible para "${type}" con esa entrada`, needsClient: true },
      { status: 422, headers: CORS_HEADERS }
    );
  }
  if (adapter.manualOnly) {
    return NextResponse.json(
      { error: "Esta fuente requiere captura desde el cliente", needsClient: true },
      { status: 422, headers: CORS_HEADERS }
    );
  }

  const outcome = await adapter.fetch(input);
  if (outcome.kind !== "ok") {
    const status = outcome.kind === "gone" ? 404 : outcome.kind === "blocked" ? 422 : 502;
    const reason = outcome.kind === "error" ? outcome.error : outcome.reason;
    return NextResponse.json({ error: reason, kind: outcome.kind }, { status, headers: CORS_HEADERS });
  }

  try {
    const { id, created } = await upsertRecord(ownerId, outcome.record);
    const record = await recordById(type, id);
    return NextResponse.json(
      { created, record },
      { status: created ? 201 : 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("[records-import] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
