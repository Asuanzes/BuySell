import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { normalizeUsername } from "@nidokey/shared";
import { userDto } from "@/lib/chat/serialize";
import { rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/chat/users/search?q= — resuelve a UNA persona por dato EXACTO:
 * email completo o @username completo (case-insensitive). NO hay búsqueda
 * parcial ni por nombre → no se puede enumerar el directorio de usuarios.
 * Devuelve { users: [] } o un único usuario.
 */
export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  const raw = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (raw.length < 3) return NextResponse.json({ users: [] });

  // Cuota diaria: sin ella este endpoint es un oráculo de emails registrados
  // ("¿está fulano@… en Nidokey?") a velocidad de API.
  const limit = await rateLimit("user-search", userId, { limit: 100, windowMs: 24 * 3600_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Demasiadas búsquedas hoy, inténtalo mañana" }, { status: 429 });
  }

  const isEmail = raw.includes("@") && raw.includes(".") && !raw.startsWith("@");
  const where = isEmail
    ? { email: { equals: raw, mode: "insensitive" as const } }
    : { username: normalizeUsername(raw) };

  const user = await prisma.user.findFirst({
    where: { ...where, id: { not: userId } },
    select: { id: true, name: true, username: true, email: true, image: true },
  });

  // withEmail: quien busca ya conocía el dato exacto (email o @username).
  return NextResponse.json({ users: user ? [userDto(user, { withEmail: true })] : [] });
}
