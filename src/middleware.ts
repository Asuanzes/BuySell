import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth-edge";
import { verifyMobileJwt } from "@/lib/mobile-jwt";

/**
 * Middleware. La web es SOLO la landing pública (`/`) + la API (de la que vive la
 * app móvil). Ya no hay subpáginas web → cualquier otra ruta de página redirige a
 * la landing.
 *
 * Rutas públicas (no requieren sesión):
 *   - /                         (landing de presentación + descarga)
 *   - /api/auth/*               (NextAuth + OTP móvil)
 *   - /api/listings/import      (CORS abierto; validación por API token)
 *   - /api/records/import       (validada por requireUserId() en el handler)
 *   - /api/cron/*               (validada por CRON_SECRET en el handler)
 *   - estáticos (_next, favicon, etc.)
 */
const PUBLIC_PATHS = [
  /^\/$/,                             // landing pública de presentación + descarga
  /^\/api\/auth(\/.*)?$/,
  /^\/api\/listings\/import$/,        // validada por token Bearer
  /^\/api\/records\/import$/,         // ingesta unificada; validada por requireUserId() en el handler
  /^\/api\/payments\/webhook\/[^/]+$/, // webhooks de pago: la firma del proveedor es la auth real
  /^\/api\/payments\/fake\/[^/]+$/,    // pasarela fake: firma server-side y reentra por webhook
  /^\/api\/billing\/webhook\/[^/]+$/,  // webhooks de suscripción (fake/Stripe): auth = firma
  /^\/api\/billing\/fake\/[^/]+$/,     // confirmación del checkout fake de suscripción
  /^\/billing\/pay\/fake$/,            // checkout fake hospedado (suscripción)
  /^\/billing\/pay\/return$/,          // puente HTTPS -> deep link móvil
  /^\/api\/cron(\/.*)?$/,             // validada por CRON_SECRET en el handler
  /^\/food\/pay\/return$/,             // puente HTTPS -> deep link móvil
  /^\/food\/pay\/fake$/,               // checkout fake hospedado
  /^\/api\/avatar\/[^/]+$/,           // foto de perfil: 302 a URL firmada (expo-image no manda Bearer)
  /^\/api\/avatar\/group\/[^/]+$/,    // foto de grupo: idem (la de arriba solo casa UN segmento)
  /^\/api\/analytics$/,               // embudo pre-login; rate limit por IP en el handler
  /^\/api\/health$/,                  // health check (sin datos sensibles)
  /^\/_next(\/.*)?$/,
  /^\/favicon\./,
  /^\/icon\./,
  // Estáticos servidos desde public/ (p.ej. /brand/nidokey-logo.png): cualquier
  // ruta NO-API que acabe en extensión de fichero. Sin esto el middleware
  // redirigía /brand/*.png a "/" (307) y la imagen del logo no cargaba.
  /^\/(?!api\/).*\.[a-zA-Z0-9]+$/,
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((re) => re.test(pathname));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // API (la consume la app móvil). El Bearer se VALIDA aquí en el edge: un JWT
  // inválido/caducado responde 401 limpio en vez de llegar a requireUserId(),
  // que lanza sin catch y convertía cada token malo en un 500 (P0 auditoría).
  // Los tokens de API (nk_/bs_) requieren BBDD → se resuelven en el handler.
  if (pathname.startsWith("/api/")) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      // Tokens de API: SOLO el formato exacto que emite api-token.ts pasa al
      // handler (la resolución exige BBDD). "Bearer nk_loquesea" malformado
      // muere aquí con 401 — sin esto llegaba a requireUserId() y era un 500.
      if (token.startsWith("nk_")) {
        if (/^nk_[0-9a-f]{64}$/.test(token)) return NextResponse.next();
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
      }
      const verified = await verifyMobileJwt(token);
      if (!verified) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
      }
      return NextResponse.next();
    }
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Cualquier otra página: ya no hay subpáginas web → siempre a la landing.
  return NextResponse.redirect(new URL("/", req.url));
}

export const config = {
  matcher: [
    /*
     * Aplica a todo excepto:
     *  - rutas estáticas (_next/static, _next/image)
     *  - imágenes (favicon, icon)
     */
    "/((?!_next/static|_next/image|favicon|icon).*)",
  ],
};
