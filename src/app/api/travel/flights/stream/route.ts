import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FlightSearchRequest } from "@nidokey/shared";
import { requireUserId } from "@/lib/auth-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { liveDeps } from "@/features/travel/live-deps";
import { runFlightSearch } from "@/features/travel/stream-search";
import { MAX_DUFFEL_CALLS_AI } from "@/features/travel/flight-search";

/**
 * GET /api/travel/flights/stream?origin=MAD&destination=BCN&departDate=…
 *
 * Búsqueda inteligente EN STREAMING (Server-Sent Events). Emite el progreso real
 * — candidatos generados, consultas al proveedor, ofertas según aparecen — para
 * que la app pueda enseñar resultados parciales en vez de un spinner.
 *
 * Es una ruta NUEVA: /api/travel/flights no cambia, así que las versiones ya
 * instaladas de la app siguen funcionando igual.
 *
 * Cancelar = cerrar la conexión. `req.signal` se propaga hasta el proveedor, de
 * modo que una búsqueda abandonada deja de gastar llamadas de pago.
 */

/**
 * El streaming vive mientras dure la búsqueda. Con 6 consultas en vivo y tres
 * en paralelo, el caso malo ronda el minuto.
 */
export const maxDuration = 300;

const DAILY_SEARCH_LIMIT = 50;
const DAY_MS = 86_400_000;

/** Query plana (lo que cabe en una URL) → contrato de dominio. */
const StreamQuery = z.object({
  origin: z.string().length(3),
  destination: z.string().length(3),
  departDate: z.string(),
  returnDate: z.string().optional(),
  adults: z.coerce.number().int().min(1).max(9).optional(),
  children: z.string().optional(),
  lang: z.enum(["es", "en"]).optional(),
  currency: z.string().length(3).optional(),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
  maxStops: z.coerce.number().int().min(0).max(2).optional(),
  checkedBags: z.coerce.number().int().min(0).max(3).optional(),
  // Mismo motivo que en FlightSearchQuery: z.coerce.boolean() convierte la
  // cadena "false" en true (Boolean("false") === true).
  nearby: z.enum(["0", "1", "true", "false"]).optional(),
  splitTickets: z.enum(["0", "1", "true", "false"]).optional(),
});

const flag = (v: string | undefined, fallback: boolean) =>
  v == null ? fallback : v === "1" || v === "true";

function sse(event: string, data: unknown, id: number): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const parsed = StreamQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const q = parsed.data;
  const request = FlightSearchRequest.safeParse({
    origin: q.origin.toUpperCase(),
    destination: q.destination.toUpperCase(),
    departDate: q.departDate,
    returnDate: q.returnDate ?? null,
    adults: q.adults ?? 1,
    childAges: (q.children ?? "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 17),
    currency: (q.currency ?? "EUR").toUpperCase(),
    lang: q.lang ?? "es",
    aiSearch: true,
    preferences: {
      cabin: q.cabin ?? "economy",
      maxStops: q.maxStops ?? 1,
      checkedBags: q.checkedBags ?? 0,
      allowSplitTickets: flag(q.splitTickets, true),
      nearby: { enabled: flag(q.nearby, true) },
    },
  });
  if (!request.success) {
    return NextResponse.json({ error: "Parámetros inválidos", issues: request.error.flatten() }, { status: 400 });
  }

  // Se cobra 1 por adelantado y se liquida al final lo realmente gastado. Igual
  // que en la ruta clásica: quien abre una búsqueda paga al menos una consulta.
  const limit = await rateLimit("flights-search", userId, { limit: DAILY_SEARCH_LIMIT, windowMs: DAY_MS });
  if (!limit.ok) {
    return NextResponse.json({ error: "Límite diario de búsquedas de vuelos alcanzado" }, { status: 429 });
  }
  const budget = Math.min(MAX_DUFFEL_CALLS_AI, 1 + limit.remaining);

  const encoder = new TextEncoder();
  const events = runFlightSearch(request.data, {
    budget,
    dailyRemaining: limit.remaining,
    signal: req.signal,
    deps: liveDeps(),
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let used = 0;
      /**
       * Latido cada 15 s. iOS monta el streaming sobre un URLSessionConfiguration
       * por defecto y corta la conexión tras ~60 s sin datos: dos consultas lentas
       * seguidas a Duffel bastarían para que el usuario viera morir la búsqueda
       * sin motivo. Un comentario SSE (`: ping`) no genera evento en el cliente.
       */
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // Cliente cerrado: lo limpia el finally.
        }
      }, 15_000);
      try {
        for await (const event of events) {
          if (event.type === "quota.updated") used = event.duffelCalls.used;
          controller.enqueue(encoder.encode(sse(event.type, event, event.seq)));
        }
      } catch (err) {
        // El cliente se fue a mitad: no es un error que reportar, pero la
        // liquidación de cuota de abajo TIENE que ocurrir igual.
        if (!req.signal.aborted) {
          console.error("[flights-stream] ruta:", err instanceof Error ? err.message : err);
        }
      } finally {
        clearInterval(heartbeat);
        // Liquidación: ya se cobró 1 al entrar; se descuenta el resto gastado.
        if (used > 1) {
          await rateLimit("flights-search", userId, {
            limit: DAILY_SEARCH_LIMIT,
            windowMs: DAY_MS,
            cost: used - 1,
          }).catch(() => {});
        }
        try {
          controller.close();
        } catch {
          // Ya cerrado porque el cliente colgó: nada que hacer.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Sin esto un proxy con buffer entrega todo junto al final y el
      // streaming deja de serlo.
      "X-Accel-Buffering": "no",
    },
  });
}
