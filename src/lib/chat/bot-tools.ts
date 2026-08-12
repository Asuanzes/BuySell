import { issueMobileJwt } from "@/lib/mobile-jwt";
import { verifyMobileJwt } from "@/lib/mobile-jwt";
import { RECORD_TYPES, type BotRecordType as RecordType } from "@/lib/chat/tool-defs";
import { createRecordEvent, tripPreparedEventKey, visitPreparedEventKey } from "@/lib/record-events";
import { createVisitChecklistForRecord, type DailyChecklistKind, type RecordTaskView, type StructuredTaskItemInput } from "@/lib/record-tasks";

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

function truncateUserNote(body: unknown): string | null {
  if (typeof body !== "string") return null;
  const note = body.trim();
  if (!note) return null;
  return note.length > 300 ? `${note.slice(0, 300)}...` : note;
}

export function compactRecordForComparison(type: RecordType, record: AnyRecord, latestUserNote?: unknown): AnyRecord {
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
  const nota_reciente = truncateUserNote(latestUserNote);
  if (nota_reciente) base.nota_reciente = nota_reciente;

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
  createChecklist?: (userId: string, input: { recordType: RecordType; recordId: string; title?: string; items: StructuredTaskItemInput[]; kind?: DailyChecklistKind }) => Promise<RecordTaskView>;
  userFromToken: (token: string) => Promise<{ userId: string; email: string } | null>;
  now: () => Date;
};

const defaultPrepareVisitDeps: PrepareVisitDeps = {
  apiGet,
  createEvent: createRecordEvent,
  createChecklist: createVisitChecklistForRecord,
  userFromToken: verifyMobileJwt,
  now: () => new Date(),
};

export type PrepareVisitChecklistItem = Required<Pick<StructuredTaskItemInput, "key" | "label">> & {
  reason: string;
};

function visitFactSummary(property: AnyRecord): string[] {
  return [
    property.ubicacion ? `ubicacion: ${property.ubicacion}` : null,
    property.planta != null ? `planta: ${property.planta}` : null,
    property.ascensor != null ? `ascensor: ${property.ascensor ? "si" : "no"}` : null,
    property.m2 != null ? `metros construidos: ${property.m2}` : null,
    property.ano_construccion != null ? `ano: ${property.ano_construccion}` : null,
  ].filter((v): v is string => Boolean(v));
}

export function buildPrepareVisitItems(record: AnyRecord, property: AnyRecord, events: unknown[]): PrepareVisitChecklistItem[] {
  const items: PrepareVisitChecklistItem[] = [];
  // 5 y no 8: el resto del presupuesto se reserva para los ítems anclados a
  // hechos y eventos, que son más específicos que «pedir un dato que falta».
  for (const missing of missingVisitFields(record).slice(0, 5)) {
    items.push({
      key: `missing:${missing.field}`,
      label: `Pedir ${missing.label}`,
      reason: missing.reason,
    });
  }

  const priceChange = events.find((event: any) => event?.eventType === "price_changed" && typeof event?.newCents === "number") as AnyRecord | undefined;
  if (priceChange) {
    items.push({
      key: "event:price_changed",
      label: "Preguntar por la ultima bajada de precio",
      reason: `Hay cambio de precio guardado el ${String(priceChange.observedAt ?? "").slice(0, 10) || "historial reciente"}.`,
    });
  }

  if (property.planta != null && property.ascensor === false) {
    items.push({
      key: "fact:no_elevator_floor",
      label: "Subir a pie hasta la vivienda",
      reason: `La ficha indica planta ${property.planta} y sin ascensor.`,
    });
  } else if (property.ascensor === true) {
    items.push({
      key: "fact:elevator",
      label: "Comprobar ruido y estado del ascensor",
      reason: "La ficha indica que el edificio tiene ascensor.",
    });
  }

  const description = String(property.descripcion ?? "").toLowerCase();
  const noiseFacts = [
    property.ubicacion && /calle|avenida|centro|principal/i.test(property.ubicacion) ? "ubicacion urbana guardada" : null,
    /calle|avenida|trafico|tr[aá]fico|ruido|ocio|colegio|garaje|ascensor/.test(description) ? "descripcion con posibles focos de ruido" : null,
  ].filter(Boolean);
  if (noiseFacts.length > 0) {
    items.push({
      key: "fact:noise",
      label: "Identificar origen del ruido en la visita",
      reason: noiseFacts.join("; "),
    });
  } else {
    items.push({
      key: "missing:noise_sources",
      label: "Preguntar por aislamiento y ruido en hora punta",
      reason: "La ficha no guarda datos de insonorizacion ni focos de ruido.",
    });
  }

  const facts = visitFactSummary(property);
  if (facts.length > 0) {
    items.push({
      key: "fact:photo_vs_listing",
      label: "Contrastar fotos y ficha con el estado real",
      reason: facts.slice(0, 3).join("; "),
    });
  }

  // Tope 8, no 12: el propietario cortó el relleno («las gafas de sol sobran»)
  // y una lista de 12 casillas no se lleva encima en una visita. El orden de
  // inserción decide qué cae: photo_vs_listing es el menos específico y va
  // último, así el ítem de ruido/aislamiento —pedido expresamente— sobrevive.
  return items
    .filter((item, index, arr) => arr.findIndex((other) => other.key === item.key || other.label === item.label) === index)
    .slice(0, 8);
}

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
      const [events, notes] = await Promise.all([
        apiGet(`/api/events?recordType=${encodeURIComponent(type)}&recordId=${encodeURIComponent(id)}&limit=5`, token),
        apiGet(`/api/records/${encodeURIComponent(id)}/notes?type=${encodeURIComponent(type)}`, token),
      ]);
      const noteItems = Array.isArray((notes as any)?.items) ? (notes as any).items : [];
      return { id, record: compactRecordForComparison(type, record, noteItems[0]?.body), events: compactEvents(events) };
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
  const items = buildPrepareVisitItems(record, property, events);

  let taskId: string | null = null;
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
    if (deps.createChecklist) {
      try {
        const task = await deps.createChecklist(user.userId, {
          recordType: "property",
          recordId,
          title: `Checklist de visita: ${String(record.title ?? "Inmueble").slice(0, 120)}`,
          items,
        });
        taskId = task.id;
      } catch (err) {
        console.error("[bot-tools] no se pudo crear checklist de visita:", err);
      }
    }
  }

  return {
    type: "property",
    id: recordId,
    property,
    recentEvents: events,
    missingFields: missingVisitFields(record),
    items,
    taskId,
    provenance: "ficha_guardada_del_usuario",
  };
}

// ── C8 · preparar_viaje ─────────────────────────────────────────────────────

type TripFacts = {
  destino: string | null;
  inicio: string | null;
  fin: string | null;
  /** Días de viaje si hay fechas (reales o ventana aproximada). */
  dias: number | null;
  presupuesto_cents: number | null;
  reservado: boolean;
};

/** Datos del viaje que anclan la checklist: reales primero, planning de respaldo. */
export function extractTripFacts(record: AnyRecord): TripFacts {
  const meta = pickMeta(record);
  const planning = meta.planning && typeof meta.planning === "object" ? (meta.planning as AnyRecord) : {};
  const destino =
    (typeof meta.destination === "string" && meta.destination.trim()) ||
    (typeof planning.destinationTentative === "string" && planning.destinationTentative.trim()) ||
    null;
  const inicio = (typeof meta.startISO === "string" && meta.startISO) || (typeof planning.windowStartISO === "string" && planning.windowStartISO) || null;
  const fin = (typeof meta.endISO === "string" && meta.endISO) || (typeof planning.windowEndISO === "string" && planning.windowEndISO) || null;
  let dias: number | null = null;
  if (inicio && fin) {
    const ms = new Date(fin.slice(0, 10)).getTime() - new Date(inicio.slice(0, 10)).getTime();
    if (Number.isFinite(ms) && ms >= 0) dias = Math.round(ms / 86400000) + 1;
  }
  const budget = Number(planning.budgetCents);
  return {
    destino,
    inicio,
    fin,
    dias,
    presupuesto_cents: Number.isFinite(budget) && budget > 0 ? Math.round(budget) : null,
    reservado: Boolean(meta.booking),
  };
}

/**
 * Items de la checklist de VIAJE, deterministas y ANCLADOS (regla del
 * propietario: cada ítem nace de un dato, un hueco o un evento; 8 es techo,
 * no cuota — nada de «llevar gafas de sol»). Orden de inserción = prioridad
 * de supervivencia al corte: huecos → destino → duración → universales.
 */
export function buildPrepareTripItems(facts: TripFacts): PrepareVisitChecklistItem[] {
  const items: PrepareVisitChecklistItem[] = [];

  if (!facts.destino) {
    items.push({ key: "missing:destination", label: "Definir el destino", reason: "El viaje aún no tiene destino guardado; visado, salud y divisa dependen de él." });
  }
  if (!facts.inicio || !facts.fin) {
    items.push({ key: "missing:dates", label: "Cerrar la ventana de fechas", reason: "Sin fechas no se puede reservar ni calcular el equipaje." });
  }
  if (!facts.reservado) {
    items.push({ key: "missing:booking", label: "Reservar transporte y alojamiento", reason: "El registro no tiene reserva confirmada todavía." });
  }

  if (facts.destino) {
    items.push(
      { key: "dest:visa", label: `Comprobar si ${facts.destino} exige visado o autorización`, reason: `Destino guardado: ${facts.destino}.` },
      { key: "dest:health", label: `Comprobar recomendaciones sanitarias para ${facts.destino}`, reason: "Vacunas o seguro obligatorio dependen del destino guardado." },
      { key: "dest:currency", label: `Comprobar moneda y medios de pago en ${facts.destino}`, reason: "Divisa y efectivo dependen del destino guardado." },
      { key: "dest:plug", label: `Comprobar el tipo de enchufe en ${facts.destino}`, reason: "El adaptador depende del destino guardado." },
    );
  }

  if (facts.dias != null && facts.dias > 5) {
    items.push({ key: "fact:laundry", label: "Prever lavandería o maleta grande", reason: `El viaje guardado dura ${facts.dias} días.` });
  } else if (facts.dias != null && facts.dias <= 3) {
    items.push({ key: "fact:carryon", label: "Valorar solo equipaje de mano", reason: `El viaje guardado dura ${facts.dias} días.` });
  }

  items.push(
    { key: "doc:id", label: "Revisar vigencia de DNI/pasaporte", reason: "Documentación imprescindible para cualquier viaje." },
    { key: "money:bank", label: "Avisar al banco y llevar segundo medio de pago", reason: "Evita bloqueos de tarjeta fuera de tu zona habitual." },
    { key: "home:leave", label: "Dejar la casa lista (llaves, luces, plantas)", reason: "Cierre de casa antes de la salida." },
  );

  return items
    .filter((item, index, arr) => arr.findIndex((other) => other.key === item.key || other.label === item.label) === index)
    .slice(0, 8);
}

/**
 * preparar_viaje(id): checklist de viaje adjunta al registro (RecordTask
 * trip_checklist, diario idempotente — mismo mecanismo que la visita) +
 * huella en el EventLog. ADITIVA y fuera de WRITE_TOOLS a propósito, como
 * preparar_visita (el precedente manda sobre la línea «con confirmación» del
 * diseño: crear un checklist no destruye ni expone nada).
 */
export async function prepareTrip(id: string, token: string, deps: PrepareVisitDeps = defaultPrepareVisitDeps): Promise<unknown> {
  const recordId = String(id || "").trim();
  if (!recordId) return { error: "preparar_viaje necesita id de viaje" };

  const record = (await deps.apiGet(`/api/records/${encodeURIComponent(recordId)}?type=holiday`, token)) as AnyRecord;
  if (record?.error) return { error: `viaje no preparable (${recordId}): ${record.error}. Revisa que sea un id propio.` };
  if (record?.type !== "holiday") return { error: "preparar_viaje solo admite viajes (holiday)" };
  const meta = pickMeta(record);
  if (meta.shared || meta.readOnly) return { error: "solo puedo preparar viajes propios, no compartidos" };

  const facts = extractTripFacts(record);
  const items = buildPrepareTripItems(facts);

  let taskId: string | null = null;
  const user = await deps.userFromToken(token);
  if (user?.userId) {
    const observedAt = deps.now();
    await deps.createEvent({
      userId: user.userId,
      recordType: "holiday",
      recordId,
      eventType: "trip_prepared",
      source: "bot",
      idempotencyKey: tripPreparedEventKey(recordId, observedAt),
      payload: { recordTitle: record.title ?? "Viaje" },
      observedAt,
    });
    if (deps.createChecklist) {
      try {
        const task = await deps.createChecklist(user.userId, {
          recordType: "holiday",
          recordId,
          title: `Checklist de viaje: ${String(record.title ?? "Viaje").slice(0, 120)}`,
          items,
          kind: "trip_checklist",
        });
        taskId = task.id;
      } catch (err) {
        console.error("[bot-tools] no se pudo crear checklist de viaje:", err);
      }
    }
  }

  return {
    type: "holiday",
    id: recordId,
    viaje: {
      titulo: record.title ?? null,
      destino: facts.destino,
      inicio: facts.inicio,
      fin: facts.fin,
      dias: facts.dias,
      presupuesto_eur: facts.presupuesto_cents != null ? Math.round(facts.presupuesto_cents) / 100 : null,
      reservado: facts.reservado,
    },
    datos_que_faltan: [
      !facts.destino ? "destino" : null,
      !facts.inicio || !facts.fin ? "fechas" : null,
      !facts.reservado ? "reserva" : null,
    ].filter(Boolean),
    items,
    taskId,
    provenance: "ficha_guardada_del_usuario",
  };
}

// Fase 0 food OFF (2026-08-09): resolveCoords y las tools de comida se retiraron
// con la vertical (ver tool-defs.ts).

/** Tipos con precio vigilable — los mismos que valida POST /api/alerts. */
const ALERT_RECORD_TYPES = ["property", "crypto", "market"] as const;
const ALERT_KINDS = ["PRICE_BELOW", "PRICE_ABOVE", "PRICE_DROP_PCT", "STATUS_CHANGE"] as const;

export type CreateAlertBody = {
  recordType: (typeof ALERT_RECORD_TYPES)[number];
  recordId: string;
  kind: (typeof ALERT_KINDS)[number];
  field: "price" | "rent";
  threshold?: number;
};

/**
 * Mapea los argumentos del LLM al body EXACTO de POST /api/alerts. Pura y
 * exportada para testear la parte peligrosa sin red: euros→céntimos SOLO en
 * umbrales absolutos (PRICE_DROP_PCT viaja como entero 1-99 tal cual), renta
 * solo en inmuebles y STATUS_CHANGE solo en inmuebles. La API re-valida todo
 * (ownsRecord, cuota, condición ya cumplida): esto es defensa en profundidad
 * y mensajes de error que el bot pueda explicar.
 */
export function buildCreateAlertBody(args: Record<string, any>): { body: CreateAlertBody } | { error: string } {
  const type = String(args.type || "") as CreateAlertBody["recordType"];
  const id = String(args.id || "").trim();
  const kind = String(args.kind || "") as CreateAlertBody["kind"];
  if (!ALERT_RECORD_TYPES.includes(type) || !id) {
    return { error: "type/id no válidos: la alerta necesita un registro propio de inmuebles, cripto o mercados (libros, viajes y empleos no tienen precio vigilable)" };
  }
  if (!ALERT_KINDS.includes(kind)) return { error: "kind debe ser PRICE_BELOW|PRICE_ABOVE|PRICE_DROP_PCT|STATUS_CHANGE" };
  const field = args.campo === "renta" ? "rent" : "price";
  if (field === "rent" && type !== "property") return { error: "solo los inmuebles tienen renta mensual vigilable" };
  if (kind === "STATUS_CHANGE") {
    if (type !== "property") return { error: "el cambio de estado (vendido/retirado) solo aplica a inmuebles" };
    return { body: { recordType: type, recordId: id, kind, field } };
  }
  if (kind === "PRICE_DROP_PCT") {
    const pct = Number(args.porcentaje);
    if (!Number.isInteger(pct) || pct < 1 || pct > 99) return { error: "porcentaje debe ser un entero entre 1 y 99" };
    return { body: { recordType: type, recordId: id, kind, field, threshold: pct } };
  }
  const eur = Number(args.umbral_eur);
  if (!Number.isFinite(eur) || eur <= 0) return { error: "umbral_eur debe ser un número positivo en euros" };
  const cents = Math.round(eur * 100);
  if (cents < 1) return { error: "umbral demasiado pequeño: el mínimo es 0,01 €" };
  return { body: { recordType: type, recordId: id, kind, field, threshold: cents } };
}

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
      case "preparar_viaje": {
        const id = String(args.id || "");
        return cap(JSON.stringify(await prepareTrip(id, token)), 5000);
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
      case "crear_alerta": {
        const built = buildCreateAlertBody(args);
        if ("error" in built) return JSON.stringify({ error: built.error });
        // La API valida ownsRecord, cuota (402 con upgrade) y condición ya
        // cumplida; el detail llega al LLM para que explique el motivo real.
        const data = await apiSend("/api/alerts", "POST", built.body, token);
        return cap(JSON.stringify(data), 2000);
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
