import { NextRequest, NextResponse } from "next/server";
import { ImportListingInput, importListing, CrossOwnerError } from "@/lib/import-listing";
import { extractTokenFromRequest, resolveUserFromToken } from "@/lib/api-token";
import { getUserId } from "@/lib/auth-helpers";
import { trackEvent } from "@/lib/analytics-events";

// CORS: el bookmarklet se ejecuta en idealista.com / fotocasa.es / …
// Mantenemos CORS abierto a *, pero exigimos token Bearer en Authorization.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  // 1. Auth UNIFICADA: cookie web / JWT móvil / token bs_ (vía getUserId, el
  //    único resolver). Fallback ?token= para bookmarklets legacy (GET-style).
  let ownerId = await getUserId();
  if (!ownerId) {
    const token = extractTokenFromRequest(req);
    if (token) ownerId = await resolveUserFromToken(token);
  }
  if (!ownerId) {
    return NextResponse.json(
      { error: "No autenticado" },
      { status: 401, headers: CORS_HEADERS }
    );
  }
  const startedAt = Date.now();

  // 2. Parsear payload
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers: CORS_HEADERS });
  }
  const parsed = ImportListingInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", issues: parsed.error.flatten() },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // 3. Importar atribuido al owner
  try {
    const result = await importListing(parsed.data, { ownerId });
    // F0 · métricas: tasa de éxito del import por portal y tipo de resultado.
    await trackEvent("listing_import", {
      userId: ownerId,
      props: {
        portal: parsed.data.portal ?? "OTHER",
        result: result.created ? "created" : result.priceChanged ? "updated" : "duplicate",
        durationMs: Date.now() - startedAt,
      },
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200, headers: CORS_HEADERS });
  } catch (err) {
    // F0 · métricas: import fallido (no rompe el flujo; trackEvent no lanza).
    await trackEvent("listing_import", {
      userId: ownerId,
      props: {
        portal: parsed.data.portal ?? "OTHER",
        result: "error",
        durationMs: Date.now() - startedAt,
      },
    });
    if (err instanceof CrossOwnerError) {
      return NextResponse.json({ error: err.message }, { status: 403, headers: CORS_HEADERS });
    }
    const e = err as Error & { code?: string; meta?: unknown };
    console.error("[import-listing] error:", err);
    return NextResponse.json(
      {
        error: e.message || "Error interno",
        code: e.code ?? null,
        meta: e.meta ?? null,
        name: e.name ?? null,
        stack: e.stack?.split("\n").slice(0, 5).join("\n") ?? null,
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
