import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isPublic } from "./middleware";

/**
 * Todo endpoint que dispara un workflow de GitHub Actions se autentica con
 * `Authorization: Bearer $CRON_SECRET` y valida ese secreto en SU handler.
 *
 * Pero el middleware corre ANTES: si la ruta no es pública trata el Bearer como
 * JWT móvil, `verifyMobileJwt` falla (un secreto de cron no es un JWT) y
 * devuelve 401 sin que el handler llegue a ejecutarse. Pasó con
 * /api/listings/check: el secreto era correcto y el cron nunca corrió.
 *
 * Lo peor es que el 401 del middleware y el del handler tienen el MISMO body
 * ({"error":"No autenticado"}), así que desde fuera parece un secreto mal
 * pegado. Este test ata las dos mitades: los workflows son la fuente de verdad.
 */
const WORKFLOWS = join(import.meta.dirname, "..", ".github", "workflows");

function cronPaths(): { file: string; pathname: string }[] {
  return readdirSync(WORKFLOWS)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .flatMap((file) => {
      const yaml = readFileSync(join(WORKFLOWS, file), "utf8");
      // Solo los steps que mandan el CRON_SECRET; ci.yml y demás no cuentan.
      if (!yaml.includes("CRON_SECRET")) return [];
      const urls = yaml.match(/https:\/\/nidokey\.es(\/[^"'\s?]*)/g) ?? [];
      return urls.map((url) => ({
        file,
        pathname: new URL(url).pathname,
      }));
    });
}

test("las rutas que llaman los crons de GitHub Actions son públicas en el middleware", () => {
  const paths = cronPaths();
  assert.ok(paths.length > 0, "no se encontró ninguna URL de cron en .github/workflows");

  for (const { file, pathname } of paths) {
    assert.ok(
      isPublic(pathname),
      `${file} llama a ${pathname}, que NO está en PUBLIC_PATHS: el middleware ` +
        `lo cortará con 401 antes del handler. Añádelo a PUBLIC_PATHS en src/middleware.ts.`,
    );
  }
});
