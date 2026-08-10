import { issueMobileJwt } from "@/lib/mobile-jwt";
import { verifyMobileJwt } from "@/lib/mobile-jwt";
import { RECORD_TYPES, type BotRecordType as RecordType } from "@/lib/chat/tool-defs";
import { createRecordEvent, visitPreparedEventKey } from "@/lib/record-events";

/**
 * Herramientas (function calling) del asistente Nidokey. Filosofía perezosa: NO
 * reimplementan lógica — el bot acuña un JWT del propio usuario (issueMobileJwt)
 * y llama a los endpoints `/api/...` que ya existen, así que el owner-scoping
 * (requireUserId + ownerId) lo aplican esas rutas. Whitelist estricta: `runTool`
 * solo despacha las funciones de BOT_TOOLS.
 *
 * Los SCHEMAS viven en tool-defs.ts (datos puros, importables por agent.ts y
 * los evals sin arrastrar JWT/geocode); aquí se re-exportan por compatibilidad.
 */
export { BOT_TOOLS, BOT_TOOLS_ANTHROPIC, RECORD_TYPES } from "@/lib/chat/tool-defs";

const BASE = (process.env.NEXTAUTH_URL || "").replace(/\/+$/, "");

/** JWT efímero del usuario para que el bot llame a sus propios endpoints. */
export async function mintUserToken(userId: string, email: string): Promise<string> {
  // 15 min: el uso real dura segundos; si se filtra en un log no vale 90 días.
  return issueMobileJwt(userId, email || `${userId}@nidokey.local`, "15m");
}

function cap(s: string, n = 3000): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function apiGet(path: string, token: string): Promise<unknown> {
  if (!BASE) return { error: "config: NEXTAUTH_URL ausente" };
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "fallo de red" };
  }
}

/** Escritura (POST/DELETE/PATCH) contra los propios endpoints, con el JWT del usuario. */
async function apiSend(path: string, method: string, body: unknown, token: string): Promise<unknown> {
  if (!BASE) return { error: "config: NEXTAUTH_URL ausente" };
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body != null ? { "Content-Type": "application/json" } : {}) },
      body: body != null ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    if (!res.ok) return { error: `HTTP ${res.status}`, detail: text.slice(0, 200) };
    try {
      return text ? JSON.parse(text) : { ok: true };
    } catch {
      return { ok: true };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "fallo de red" };
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function compactRecords(data: unknown): unknown[] {
  const arr = Array.isArray(data) ? data : [];
  return arr.slice(0, 50).map((r: any) => ({
    id: r?.id,
    type: r?.type,
    title: r?.title,
    subtitle: r?.subtitle ?? null,
    value: r?.primaryValue ?? null,
    status: r?.status ?? null,
  }));
}

type AnyRecord = Record<string, any>;

function centsToEuros(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) / 100 : null;
}

function pickMeta(record: AnyRecord): AnyRecord {
  return record?.meta && typeof record.meta === "object" ? record.meta : {};
}

function pickDetail(record: AnyRecord): AnyRecord {
  const meta = pickMeta(record);
  return meta.detail && typeof meta.detail === "object" ? meta.detail : {};
}

function fieldValue(...values: unknown[]): unknown {
  return values.find((v) => v !== undefined && v !== null && v !== "");
}

function stringList(value: unknown, max = 12): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "").slice(0, max) : [];
}

function combinedStringList(...values: unknown[]): string[] {
  return [...new Set(values.flatMap((v) => stringList(v)))].slice(0, 12);
}

function compactRecordForComparison(type: RecordType, record: AnyRecord): AnyRecord {
  const meta = pickMeta(record);
  const detail = pickDetail(record);
  const base: AnyRecord = {
    id: record.id,
    type: record.type,
    title: record.title,
    subtitle: record.subtitle ?? null,
    status: record.status ?? null,
    value: record.primaryValue ?? null,
  };

  if (type === "property") {
    const priceEur = centsToEuros(fieldValue(meta.currentPrice, detail.currentPrice));
    const rentEur = centsToEuros(fieldValue(meta.monthlyRent, detail.monthlyRent));
    const areaRaw = fieldValue(meta.builtArea, detail.builtArea);
    const area = Number(areaRaw);
    return {
      ...base,
      precio_eur: priceEur,
      renta_mensual_eur: rentEur,
      eur_m2: priceEur != null && Number.isFinite(area) && area > 0 ? Math.round(priceEur / area) : null,
      m2: Number.isFinite(area) ? area : null,
      habitaciones: fieldValue(meta.rooms, detail.rooms) ?? null,
      banos: fieldValue(meta.bathrooms, detail.bathrooms) ?? null,
      ubicacion: [fieldValue(meta.city, detail.city), fieldValue(meta.neighborhood, detail.neighborhood)].filter(Boolean).join(" · ") || null,
      estado: fieldValue(record.status, detail.status) ?? null,
      operacion: fieldValue(meta.operationType, detail.operationType) ?? null,
    };
  }

  if (type === "crypto" || type === "market") {
    return {
      ...base,
      simbolo: fieldValue(meta.symbol, detail.symbol) ?? null,
      mercado: fieldValue(meta.exchange, detail.exchange) ?? null,
      precio: record.primaryValue ?? null,
      cambio_24h_pct: fieldValue(meta.change24h, meta.price_change_percentage_24h, detail.change24h) ?? null,
      cantidad: fieldValue(meta.quantity, detail.quantity) ?? null,
      actualizado: fieldValue(meta.lastCheckedAt, detail.lastCheckedAt, record.updatedAt) ?? null,
    };
  }

  if (type === "job") {
    return {
      ...base,
      salario: record.primaryValue ?? null,
      empresa: fieldValue(meta.company, detail.company) ?? null,
      ubicacion: fieldValue(meta.location, detail.location, record.subtitle) ?? null,
      plataforma: fieldValue(meta.platform, detail.platform) ?? null,
      remoto: fieldValue(meta.remote, detail.remote) ?? null,
    };
  }

  if (type === "book") {
    const book = meta.book && typeof meta.book === "object" ? meta.book : {};
    return {
      ...base,
      autor: fieldValue(book.authors, meta.authors, detail.authors) ?? null,
      rating: record.primaryValue ?? null,
      notas: fieldValue(meta.userNotes, detail.userNotes) ?? null,
      paginas: fieldValue(book.pageCount, meta.pageCount, detail.pageCount) ?? null,
      publicado: fieldValue(book.publishedDate, meta.publishedDate, detail.publishedDate) ?? null,
    };
  }

  if (type === "holiday") {
    return {
      ...base,
      destino: fieldValue(meta.destination, detail.destination, record.subtitle) ?? null,
      coste_total: record.primaryValue ?? null,
      inicio: fieldValue(meta.startDate, detail.startDate) ?? null,
      fin: fieldValue(meta.endDate, detail.endDate) ?? null,
      transporte: fieldValue(meta.transportTotal, meta.flightTotal, meta.flightsTotal, detail.transportTotal) ?? null,
      alojamiento: fieldValue(meta.hotelTotal, meta.accommodationTotal, detail.hotelTotal) ?? null,
    };
  }

  return base;
}

function compactEvents(data: unknown): unknown[] {
  const items = Array.isArray((data as any)?.items) ? (data as any).items : [];
  return items.slice(0, 5).map((e: any) => {
    const p = e?.payload && typeof e.payload === "object" ? e.payload : {};
    return {
      eventType: e?.eventType,
      source: e?.source,
      observedAt: e?.observedAt,
      previousCents: typeof p.previousCents === "number" ? p.previousCents : null,
      newCents: typeof p.newCents === "number" ? p.newCents : null,
      field: p.field ?? null,
      status: p.status ?? null,
    };
  });
}

function compactVisitEvents(data: unknown): unknown[] {
  const items = Array.isArray((data as any)?.items) ? (data as any).items : [];
  return items
    .filter((e: any) => {
      const p = e?.payload && typeof e.payload === "object" ? e.payload : {};
      const eventType = String(e?.eventType ?? "");
      return eventType === "price_changed" || eventType === "status_changed" || p.status != null;
    })
    .slice(0, 5)
    .map((e: any) => {
      const p = e?.payload && typeof e.payload === "object" ? e.payload : {};
      return {
        eventType: e?.eventType,
        source: e?.source,
        observedAt: e?.observedAt,
        previousCents: typeof p.previousCents === "number" ? p.previousCents : null,
        newCents: typeof p.newCents === "number" ? p.newCents : null,
        field: p.field ?? null,
        previousStatus: p.previousStatus ?? p.oldStatus ?? null,
        status: p.status ?? p.newStatus ?? null,
      };
    });
}

function hasValue(v: unknown): boolean {
  return v !== undefined && v !== null && v !== "";
}

type MissingVisitField = { field: string; label: string; reason: string };

const VISIT_FIELDS: { field: string; label: string; reason: string; values: string[] }[] = [
  { field: "yearBuilt", label: "año de construcción", reason: "edad real del edificio y posibles reformas", values: ["yearBuilt", "constructionYear"] },
  { field: "communityFees", label: "gastos de comunidad", reason: "coste mensual no incluido en el precio", values: ["communityFees", "communityExpenses", "communityCosts", "gastosComunidad"] },
  { field: "orientation", label: "orientación", reason: "luz natural, humedad y temperatura", values: ["orientation", "orientacion"] },
  { field: "floor", label: "planta", reason: "ruido, accesibilidad, seguridad y humedad si es baja", values: ["floor"] },
  { field: "hasElevator", label: "ascensor", reason: "accesibilidad y valor de reventa", values: ["hasElevator", "elevator"] },
  { field: "bathrooms", label: "baños", reason: "capacidad y coste de reforma", values: ["bathrooms"] },
  { field: "usableArea", label: "m² útiles", reason: "diferencia frente a m² construidos", values: ["usableArea"] },
  { field: "energyRating", label: "certificado energético", reason: "consumo previsto y estado de instalaciones", values: ["energyRating"] },
];

function missingVisitFields(record: AnyRecord): MissingVisitField[] {
  const meta = pickMeta(record);
  const detail = pickDetail(record);
  return VISIT_FIELDS.filter((f) => {
    const value = fieldValue(...f.values.flatMap((key) => [(detail as AnyRecord)[key], (meta as AnyRecord)[key]]));
    if (f.field === "energyRating") return !hasValue(value) || value === "UNKNOWN";
    return !hasValue(value);
  })
    .map(({ field, label, reason }) => ({ field, label, reason }));
}

type PrepareVisitDeps = {
  apiGet: (path: string, token: string) => Promise<unknown>;
  createEvent: typeof createRecordEvent;
  userFromToken: (token: string) => Promise<{ userId: string; email: string } | null>;
  now: () => Date;
};

const defaultPrepareVisitDeps: PrepareVisitDeps = {
  apiGet,
  createEvent: createRecordEvent,
  userFromToken: verifyMobileJwt,
  now: () => new Date(),
};

export async function compareRecords(type: RecordType, ids: string[], token: string): Promise<unknown> {
  const uniqueIds = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!RECORD_TYPES.includes(type) || uniqueIds.length !== ids.length || uniqueIds.length < 2 || uniqueIds.length > 3) {
    return { error: "comparar_registros necesita type válido y 2 o 3 ids distintos" };
  }

  const rows = await Promise.all(
    uniqueIds.map(async (id) => {
      const record = (await apiGet(`/api/records/${encodeURIComponent(id)}?type=${encodeURIComponent(type)}`, token)) as AnyRecord;
      if (record?.error) return { id, error: record.error };
      if (record?.type !== type) return { id, error: "tipo mixto: el registro no coincide con la categoría solicitada" };
      const meta = pickMeta(record);
      if (meta.shared || meta.readOnly) return { id, error: "solo puedo comparar registros propios, no compartidos" };
      const events = await apiGet(`/api/events?recordType=${encodeURIComponent(type)}&recordId=${encodeURIComponent(id)}&limit=5`, token);
      return { id, record: compactRecordForComparison(type, record), events: compactEvents(events) };
    }),
  );

  const bad = rows.find((r: any) => r.error);
  if (bad) return { error: `registro no comparable (${bad.id}): ${bad.error}. Revisa que sean ids propios del mismo tipo.` };
  return {
    type,
    ids: uniqueIds,
    records: rows.map((r: any) => r.record),
    events: Object.fromEntries(rows.map((r: any) => [r.id, r.events])),
    provenance: "datos_guardados_del_usuario",
  };
}

export async function prepareVisit(id: string, token: string, deps: PrepareVisitDeps = defaultPrepareVisitDeps): Promise<unknown> {
  const recordId = String(id || "").trim();
  if (!recordId) return { error: "preparar_visita necesita id de inmueble" };

  const record = (await deps.apiGet(`/api/records/${encodeURIComponent(recordId)}?type=property`, token)) as AnyRecord;
  if (record?.error) return { error: `inmueble no preparable (${recordId}): ${record.error}. Revisa que sea un id propio.` };
  if (record?.type !== "property") return { error: "preparar_visita solo admite inmuebles (property)" };
  const meta = pickMeta(record);
  if (meta.shared || meta.readOnly) return { error: "solo puedo preparar visitas de inmuebles propios, no compartidos" };

  const detail = pickDetail(record);
  const priceEur = centsToEuros(fieldValue(meta.currentPrice, detail.currentPrice));
  const rentEur = centsToEuros(fieldValue(meta.monthlyRent, detail.monthlyRent));
  const comparableEur = priceEur ?? rentEur;
  const areaRaw = fieldValue(meta.builtArea, detail.builtArea);
  const area = Number(areaRaw);
  const property = {
    id: record.id,
    title: record.title,
    descripcion: typeof fieldValue(detail.description, record.description) === "string" ? String(fieldValue(detail.description, record.description)).slice(0, 700) : null,
    precio_eur: priceEur,
    renta_mensual_eur: rentEur,
    eur_m2: comparableEur != null && Number.isFinite(area) && area > 0 ? Math.round(comparableEur / area) : null,
    m2: Number.isFinite(area) ? area : null,
    habitaciones: fieldValue(meta.rooms, detail.rooms) ?? null,
    banos: fieldValue(meta.bathrooms, detail.bathrooms) ?? null,
    ano_construccion: fieldValue(meta.yearBuilt, detail.yearBuilt) ?? null,
    estado: fieldValue(record.status, detail.status) ?? null,
    operacion: fieldValue(meta.operationType, detail.operationType) ?? null,
    ubicacion:
      [fieldValue(meta.city, detail.city), fieldValue(meta.neighborhood, detail.neighborhood), fieldValue(meta.address, detail.address)]
        .filter(Boolean)
        .join(" · ") || null,
    direccion: fieldValue(meta.address, detail.address) ?? null,
    entorno: fieldValue(meta.environment, detail.environment) ?? null,
    etiquetas: combinedStringList(meta.tags, detail.tags),
    planta: fieldValue(meta.floor, detail.floor) ?? null,
    ascensor: fieldValue(meta.hasElevator, detail.hasElevator) ?? null,
  };
  const events = compactVisitEvents(await deps.apiGet(`/api/events?recordType=property&recordId=${encodeURIComponent(recordId)}&limit=20`, token));

  const user = await deps.userFromToken(token);
  if (user?.userId) {
    const observedAt = deps.now();
    await deps.createEvent({
      userId: user.userId,
      recordType: "property",
      recordId,
      eventType: "visit_prepared",
      source: "bot",
      idempotencyKey: visitPreparedEventKey(recordId, observedAt),
      payload: { recordTitle: record.title ?? "Inmueble" },
      observedAt,
    });
  }

  return {
    type: "property",
    id: recordId,
    property,
    recentEvents: events,
    missingFields: missingVisitFields(record),
    provenance: "ficha_guardada_del_usuario",
  };
}

// Fase 0 food OFF (2026-08-09): resolveCoords y las tools de comida se retiraron
// con la vertical (ver tool-defs.ts).

/** Despacha UNA tool de la whitelist. Devuelve siempre un string (JSON) para el LLM. */
export async function runTool(name: string | undefined, argsJson: string | undefined, token: string): Promise<string> {
  let args: Record<string, any> = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    /* args inválidos → {} */
  }
  try {
    switch (name) {
      case "listar_registros": {
        const type = String(args.type || "");
        if (!RECORD_TYPES.includes(type as RecordType)) return JSON.stringify({ error: "categoría no válida" });
        return cap(JSON.stringify(compactRecords(await apiGet(`/api/records?type=${encodeURIComponent(type)}`, token))));
      }
      case "ver_registro": {
        const type = String(args.type || "");
        const id = String(args.id || "");
        if (!RECORD_TYPES.includes(type as RecordType) || !id) return JSON.stringify({ error: "type/id no válidos" });
        const data = await apiGet(`/api/records/${encodeURIComponent(id)}?type=${encodeURIComponent(type)}`, token);
        return cap(JSON.stringify(data), 4000);
      }
      case "comparar_registros": {
        const type = String(args.type || "");
        const ids = Array.isArray(args.ids) ? args.ids.map((x: any) => String(x)) : [];
        if (!RECORD_TYPES.includes(type as RecordType)) return JSON.stringify({ error: "categoría no válida" });
        return cap(JSON.stringify(await compareRecords(type as RecordType, ids, token)), 5000);
      }
      case "preparar_visita": {
        const id = String(args.id || "");
        return cap(JSON.stringify(await prepareVisit(id, token)), 5000);
      }
      case "tendencias": {
        const source = args.source ? `&source=${encodeURIComponent(String(args.source))}` : "";
        const data = (await apiGet(`/api/trends?limit=25${source}`, token)) as any;
        const items = (data?.items ?? []).map((t: any) => ({ id: t.id, name: t.name, source: t.source, volume: t.volume ?? null }));
        return cap(JSON.stringify(items));
      }
      case "noticias_tendencia": {
        const id = String(args.trend_id || "");
        if (!id) return JSON.stringify({ error: "falta trend_id" });
        const data = (await apiGet(`/api/trends/${encodeURIComponent(id)}/news`, token)) as any;
        const items = (data?.items ?? []).slice(0, 7).map((n: any) => ({ title: n.title, source: n.source ?? null, url: n.url }));
        return cap(JSON.stringify(items));
      }
      case "noticias_activos": {
        const type = String(args.type || "");
        if (type !== "crypto" && type !== "market") return JSON.stringify({ error: "type debe ser crypto|market" });
        const data = (await apiGet(`/api/news?type=${type}`, token)) as any;
        const items = (data?.items ?? []).slice(0, 10).map((n: any) => ({ title: n.title, source: n.source ?? null, url: n.url, at: n.publishedAt ?? null }));
        return cap(JSON.stringify(items));
      }
      case "crear_registro": {
        const type = String(args.type || "");
        const modo = String(args.modo || "");
        const valor = String(args.valor || "").trim();
        if (!RECORD_TYPES.includes(type as RecordType)) return JSON.stringify({ error: "categoría no válida" });
        if (!["url", "symbol", "query"].includes(modo) || !valor) return JSON.stringify({ error: "modo/valor no válidos" });
        const input =
          modo === "url" ? { kind: "url", url: valor } : modo === "symbol" ? { kind: "symbol", symbol: valor } : { kind: "query", query: valor };
        const data = await apiSend("/api/records/import", "POST", { type, input, source: "nidokey-chat" }, token);
        return cap(JSON.stringify(data), 2000);
      }
      case "borrar_registro": {
        const type = String(args.type || "");
        const id = String(args.id || "");
        if (!RECORD_TYPES.includes(type as RecordType) || !id) return JSON.stringify({ error: "type/id no válidos" });
        const data = await apiSend(`/api/records/${encodeURIComponent(id)}?type=${encodeURIComponent(type)}`, "DELETE", null, token);
        return JSON.stringify(data);
      }
      case "fusionar_registros": {
        const type = String(args.type || "");
        const keepId = String(args.keep_id || "");
        const dropIds = Array.isArray(args.drop_ids) ? args.drop_ids.map((x: any) => String(x)).filter(Boolean) : [];
        if (!RECORD_TYPES.includes(type as RecordType) || !keepId || dropIds.length === 0) {
          return JSON.stringify({ error: "type/keep_id/drop_ids no válidos" });
        }
        if (type === "property") {
          // Inmuebles: merge per-vertical (cada drop → keep).
          const results = [];
          for (const d of dropIds) results.push(await apiSend(`/api/properties/${encodeURIComponent(d)}/merge`, "POST", { intoId: keepId }, token));
          return cap(JSON.stringify(results), 2000);
        }
        const data = await apiSend("/api/records/duplicates/merge", "POST", { type, keepId, dropIds }, token);
        return cap(JSON.stringify(data), 2000);
      }
      case "compartir_registro": {
        const type = String(args.type || "");
        const id = String(args.id || "");
        const usuario = String(args.usuario || "").replace(/^@/, "").trim();
        if (!RECORD_TYPES.includes(type as RecordType) || !id || !usuario) {
          return JSON.stringify({ error: "type/id/usuario no válidos" });
        }
        const data = await apiSend(`/api/records/${encodeURIComponent(id)}/share`, "POST", { type, username: usuario }, token);
        return JSON.stringify(data);
      }
      case "editar_registro": {
        const type = String(args.type || "");
        const id = String(args.id || "");
        const campos = (args.campos && typeof args.campos === "object" ? args.campos : {}) as Record<string, unknown>;
        if (!id) return JSON.stringify({ error: "type/id no válidos" });
        // Whitelist server-side (defensa en profundidad además del prompt):
        // solo campos mapeados; lo demás se descarta. Precios llegan en EUROS
        // y se persisten en CÉNTIMOS (convención de import-listing/formatPrice).
        const eurToCents = (v: unknown): number | null => {
          const n = Number(v);
          return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
        };
        if (type === "property") {
          const ESTADOS = ["FOR_SALE", "RESERVED", "SOLD", "WITHDRAWN", "FOR_RENT", "RENTED"];
          const body: Record<string, unknown> = {};
          if (typeof campos.titulo === "string" && campos.titulo.trim().length >= 3) body.title = campos.titulo.trim();
          if (campos.precio_eur != null) {
            const c = eurToCents(campos.precio_eur);
            if (c == null) return JSON.stringify({ error: "precio_eur no válido" });
            body.currentPrice = c;
          }
          if (campos.renta_mensual_eur != null) {
            const c = eurToCents(campos.renta_mensual_eur);
            if (c == null) return JSON.stringify({ error: "renta_mensual_eur no válida" });
            body.monthlyRent = c;
          }
          if (campos.estado != null) {
            const s = String(campos.estado).toUpperCase();
            if (!ESTADOS.includes(s)) return JSON.stringify({ error: `estado debe ser ${ESTADOS.join("|")}` });
            body.status = s;
          }
          if (typeof campos.descripcion === "string") body.description = campos.descripcion;
          if (!Object.keys(body).length) {
            return JSON.stringify({ error: "ningún campo editable: property admite titulo|precio_eur|renta_mensual_eur|estado|descripcion" });
          }
          const data = await apiSend(`/api/properties/${encodeURIComponent(id)}`, "PATCH", body, token);
          return cap(JSON.stringify(data), 2000);
        }
        if (type === "book") {
          if (typeof campos.notas !== "string") {
            return JSON.stringify({ error: "book solo admite el campo notas" });
          }
          const data = await apiSend(`/api/records/${encodeURIComponent(id)}?type=book`, "PATCH", { notes: campos.notas }, token);
          return cap(JSON.stringify(data), 2000);
        }
        return JSON.stringify({ error: "este tipo aún no admite edición desde el chat; guía al usuario a la ficha del registro" });
      }
      case "compartidos_conmigo": {
        return cap(JSON.stringify(compactRecords(await apiGet("/api/records/shared", token))));
      }
      case "guardar_compartido": {
        const type = String(args.type || "");
        const id = String(args.id || "");
        if (!RECORD_TYPES.includes(type as RecordType) || !id) return JSON.stringify({ error: "type/id no válidos" });
        const data = await apiSend(`/api/records/${encodeURIComponent(id)}/adopt`, "POST", { type }, token);
        return JSON.stringify(data);
      }
      default:
        return JSON.stringify({ error: "herramienta desconocida" });
    }
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : "fallo de la herramienta" });
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
