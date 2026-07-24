import { timingSafeEqual } from "node:crypto";

/**
 * Autorización para endpoints programados (cron).
 *
 * Los disparadores externos gratuitos (cron-job.org, GitHub Actions) envían
 * `Authorization: Bearer $CRON_SECRET`. Estos endpoints NO usan sesión de
 * usuario; se protegen con este secreto compartido.
 *
 * `CRON_SECRET` se define en Vercel env y en el panel de cron-job.org / repo
 * secrets de GitHub Actions. Nunca se commitea.
 */
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // sin secreto configurado, nada de cron
  const got = req.headers.get("authorization");
  if (!got) return false;
  // Comparación en tiempo constante: un === con early-exit filtra por timing
  // cuántos caracteres del secreto coinciden.
  const a = Buffer.from(got);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
