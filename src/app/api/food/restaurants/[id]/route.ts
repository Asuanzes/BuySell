import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { enqueueMenu, menuStatusFor, processMenu } from "@/lib/food/menu-scrape";
import { foodEnabled, foodDisabledResponse } from "@/lib/food/disabled";

// El GET SIEMPRE responde rápido ("fetching") y el móvil hace polling. El scrape corre en
// background con after() — NO con await: bloquear el GET ~20-40s hacía que iOS cancelara la
// petición a los ~60s (Vercel registraba "GET ---", no 200) y la app se quedaba cargando.
// El scrape con gooyer (~20s) cabe en el presupuesto de la función. processMenu tiene lock
// en BBDD (claima PENDING) → no duplica con el cron.
export const maxDuration = 300;

const MENU_INCLUDE = {
  categories: {
    where: { active: true },
    orderBy: { sortOrder: "asc" as const },
    include: { items: { where: { available: true }, orderBy: { sortOrder: "asc" as const } } },
  },
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!foodEnabled()) return foodDisabledResponse(); // fase 0: el open dispara scrape after()
  await requireUserId();
  const { id } = await params;
  const restaurant = await prisma.restaurant.findFirst({ where: { id, active: true }, include: MENU_INCLUDE });
  if (!restaurant) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const hasMenu = restaurant.categories.some((c) => c.items.length > 0);

  // Encola si falta carta fresca y es cocina de delivery (solo restaurantes de Google).
  const enqueued = await enqueueMenu({
    id: restaurant.id,
    source: restaurant.source,
    menuStatus: restaurant.menuStatus,
    menuFetchedAt: restaurant.menuFetchedAt,
    hasMenu,
    cuisineTypes: restaurant.cuisineTypes,
  });

  // Dispara el scrape en background si está PENDING: lo acabamos de encolar (enqueued) O ya
  // estaba PENDING por el pre-warm de la lista (en ese caso enqueueMenu devuelve false pero
  // hay que procesarlo igual). El cron es la red de seguridad si este after() no completa.
  const pending = enqueued || restaurant.menuStatus === "PENDING";
  if (pending) after(() => processMenu(restaurant.id).catch(() => {}));

  const menuStatus = menuStatusFor({
    source: restaurant.source,
    menuStatus: pending ? "PENDING" : restaurant.menuStatus,
    hasMenu,
    cuisineTypes: restaurant.cuisineTypes,
  });

  return NextResponse.json({ restaurant, menuStatus });
}
