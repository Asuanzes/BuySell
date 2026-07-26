import { issueMobileJwt } from "@/lib/mobile-jwt";
import { geocodeAddress } from "@/lib/geocode";
import { RECORD_TYPES, type BotRecordType as RecordType } from "@/lib/chat/tool-defs";

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

/** Coordenadas para las tools de comida: 'ciudad' (geocode) o la dirección guardada por defecto. */
async function resolveCoords(args: Record<string, any>, token: string): Promise<{ lat: number; lng: number } | { error: string }> {
  const city = args.ciudad ? String(args.ciudad).trim() : "";
  if (city) {
    const g = await geocodeAddress({ city, country: "España" });
    if (g) return { lat: g.latitude, lng: g.longitude };
    return { error: `No pude ubicar "${city}".` };
  }
  const data = (await apiGet("/api/food/addresses", token)) as any;
  const addr = Array.isArray(data?.addresses) ? data.addresses[0] : null;
  if (addr && typeof addr.latitude === "number" && typeof addr.longitude === "number") {
    return { lat: addr.latitude, lng: addr.longitude };
  }
  return { error: "Necesito una ciudad o que el usuario tenga una dirección de entrega guardada." };
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
      case "buscar_restaurantes": {
        const c = await resolveCoords(args, token);
        if ("error" in c) return JSON.stringify({ error: c.error });
        const q = args.query ? `&q=${encodeURIComponent(String(args.query))}` : "";
        const data = (await apiGet(`/api/food/restaurants?lat=${c.lat}&lng=${c.lng}${q}`, token)) as any;
        const items = (data?.restaurants ?? []).slice(0, 15).map((r: any) => ({
          id: r?.id,
          nombre: r?.name ?? r?.title,
          direccion: r?.address ?? r?.formattedAddress ?? r?.vicinity ?? null,
        }));
        return cap(JSON.stringify(items));
      }
      case "buscar_platos": {
        const query = String(args.query || "");
        if (!query) return JSON.stringify({ error: "falta query" });
        const c = await resolveCoords(args, token);
        if ("error" in c) return JSON.stringify({ error: c.error });
        const data = (await apiGet(`/api/food/search?lat=${c.lat}&lng=${c.lng}&q=${encodeURIComponent(query)}`, token)) as any;
        const items = (data?.results ?? []).slice(0, 15).map((x: any) => ({
          plato: x?.item?.name ?? x?.name,
          precio_eur: typeof x?.item?.priceCents === "number" ? x.item.priceCents / 100 : null,
          restaurante: x?.restaurant?.name ?? null,
          restaurant_id: x?.restaurant?.id ?? null,
        }));
        return cap(JSON.stringify(items));
      }
      case "carta_restaurante": {
        const id = String(args.restaurant_id || "");
        if (!id) return JSON.stringify({ error: "falta restaurant_id" });
        const data = (await apiGet(`/api/food/restaurants/${encodeURIComponent(id)}`, token)) as any;
        const r = data?.restaurant;
        if (!r) return JSON.stringify({ error: "restaurante no encontrado" });
        const platos = (r.categories ?? [])
          .flatMap((cat: any) =>
            (cat?.items ?? []).map((it: any) => ({
              plato: it?.name,
              precio_eur: typeof it?.priceCents === "number" ? it.priceCents / 100 : null,
              categoria: cat?.name ?? null,
            })),
          )
          .slice(0, 50);
        // menuStatus: si está "PENDING"/vacío, la carta se está scrapeando aún.
        return cap(JSON.stringify({ restaurante: r?.name ?? null, menuStatus: data?.menuStatus ?? null, platos }), 4000);
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
