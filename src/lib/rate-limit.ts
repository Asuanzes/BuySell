import { prisma } from "@/lib/db";

/**
 * Rate limit de ventana fija respaldado en BBDD (tabla RateLimit).
 *
 * ¿Por qué en BBDD? Los throttles en memoria de módulo NO funcionan en Vercel
 * (cada lambda tiene su propia memoria); el único estado compartido fiable que
 * ya tenemos es Postgres. Mismo patrón que withinMessageRate() del chat.
 *
 * Uso: const r = await rateLimit("otp-ip", ip, { limit: 5, windowMs: 15 * 60_000 });
 *      if (!r.ok) return 429;
 *
 * La clave codifica nombre + id + número de ventana, de modo que cada ventana
 * fija crea una fila nueva; las caducadas se purgan en el cron de limpieza.
 */
export async function rateLimit(
  name: string,
  id: string,
  opts: { limit: number; windowMs: number }
): Promise<{ ok: boolean; remaining: number; resetAt: Date }> {
  const window = Math.floor(Date.now() / opts.windowMs);
  const key = `${name}:${id}:${window}`;
  const resetAt = new Date((window + 1) * opts.windowMs);

  let count: number;
  try {
    const row = await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, resetAt },
      update: { count: { increment: 1 } },
    });
    count = row.count;
  } catch {
    // Carrera upsert-create (P2002): otra lambda creó la fila entre el where y
    // el create. Reintentar como update puro es determinista.
    const row = await prisma.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    count = row.count;
  }

  return { ok: count <= opts.limit, remaining: Math.max(0, opts.limit - count), resetAt };
}

/** Purga filas de ventanas ya cerradas. Llamar desde un cron (chat-cleanup). */
export async function cleanupRateLimits(): Promise<number> {
  const r = await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } });
  return r.count;
}

/**
 * IP del cliente detrás del proxy de Vercel. `x-forwarded-for` puede traer
 * cadena de saltos; el primero es el cliente. Nunca devuelve cadena vacía
 * (las claves de rate limit lo usan tal cual).
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
