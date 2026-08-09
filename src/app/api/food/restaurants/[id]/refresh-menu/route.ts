import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { processMenu } from "@/lib/food/menu-scrape";
import { foodEnabled, foodDisabledResponse } from "@/lib/food/disabled";

export const maxDuration = 300;

/**
 * Refresco manual de la carta ("Actualizar carta" / "Reintentar"): re-encola el menú
 * (menuStatus=PENDING) reseteando caché e intentos, y dispara el fast-path en background.
 * El siguiente GET devolverá "fetching" y el polling traerá la carta nueva. El cron es
 * la red de seguridad. Solo restaurantes de Google (el seed conserva su carta manual).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!foodEnabled()) return foodDisabledResponse(); // fase 0: cada refresh gasta scrape
  const userId = await requireUserId();
  const { id } = await params;
  // Cada refresh dispara Crawl4AI/Firecrawl + LLM (coste real) y resetea
  // menuAttempts. Cooldown por restaurante + cuota diaria por usuario acotan
  // ambas cosas (P1 auditoría: antes el reset de intentos era ilimitado).
  const [perRestaurant, perUser] = await Promise.all([
    rateLimit("menu-refresh", id, { limit: 1, windowMs: 10 * 60_000 }),
    rateLimit("menu-refresh-user", userId, { limit: 20, windowMs: 86_400_000 }),
  ]);
  if (!perRestaurant.ok || !perUser.ok) {
    return NextResponse.json(
      { error: "Carta actualizada hace poco. Inténtalo en unos minutos." },
      { status: 429 }
    );
  }
  const r = await prisma.restaurant.findFirst({ where: { id, active: true }, select: { id: true, source: true } });
  if (!r) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (r.source !== "google") return NextResponse.json({ error: "Este restaurante no se scrapea" }, { status: 400 });
  // Invalida caché + intentos y re-encola para forzar un re-scrape limpio.
  await prisma.restaurant.update({
    where: { id: r.id },
    data: { menuFetchedAt: null, menuSourceUrl: null, menuStatus: "PENDING", menuQueuedAt: new Date(), menuAttempts: 0 },
  });
  after(() => processMenu(r.id).catch(() => {})); // fast-path; cron como respaldo
  return NextResponse.json({ ok: true });
}
