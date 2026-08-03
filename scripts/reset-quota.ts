/**
 * Reinicia una cuota diaria de la tabla `RateLimit`.
 *
 * Uso:
 *   npm run reset-quota                    # informe: qué cuotas hay gastadas
 *   npm run reset-quota -- flights-search  # borra el contador de vuelos
 *   npm run reset-quota -- all             # borra TODOS los contadores vivos
 *
 * Las claves son `<nombre>:<id>:<nºventana>` (ver `src/lib/rate-limit.ts`), así
 * que borrar la fila equivale a empezar la ventana de cero. No hay efecto
 * secundario: la fila se recrea sola en la siguiente petición.
 *
 * Nombres en uso: flights-search (50/día), bot-day (40, Premium 400),
 * jobs-search, menu-refresh-user (20/día), places-auto (300/día),
 * places-details (150/día), otp-req-ip, otp-verify-ip, push-test, analytics-ip.
 */
import { prisma } from "../src/lib/db";

async function main() {
  const target = process.argv[2]?.trim();

  const live = await prisma.rateLimit.findMany({
    where: { resetAt: { gt: new Date() } },
    orderBy: { resetAt: "asc" },
  });

  if (!target) {
    if (!live.length) {
      console.log("No hay contadores vivos: todas las cuotas están a cero.");
      process.exit(0);
    }
    console.log(`Contadores vivos (${live.length}):\n`);
    for (const r of live) {
      const name = r.key.split(":")[0];
      console.log(`${name.padEnd(20)} ${String(r.count).padStart(4)} usos · caduca ${r.resetAt.toISOString()}`);
    }
    console.log("\nPara reiniciar uno: npm run reset-quota -- <nombre>");
    process.exit(0);
  }

  const where =
    target === "all"
      ? { resetAt: { gt: new Date() } }
      : { key: { startsWith: `${target}:` } };

  const affected = await prisma.rateLimit.deleteMany({ where });
  console.log(`✓ ${affected.count} contador(es) borrado(s) para «${target}».`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
