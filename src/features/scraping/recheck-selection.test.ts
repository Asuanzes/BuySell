import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildRecheckWhere } from "./runner";

/**
 * Forma del `where` con el que el cron elige a quién recomprobar. Sin BBDD: lo
 * que se protege es lo que rompe en silencio.
 *
 * Un `AND` de dos `OR` mal montado no da error — devuelve el conjunto
 * equivocado. Los dos fallos posibles son caros y opuestos: recomprobarlo todo
 * en cada pasada (el cron corre cada 2 h, así que serían 12× las descargas
 * diarias contra portales que ya bloquean) o no recomprobar nada nunca (las
 * alertas de precio dejarían de dispararse sin que nadie lo note).
 */

const NOW = new Date("2026-08-04T12:00:00Z");

/** Extrae las dos ramas del AND por la clave que las distingue. */
function branches(where: ReturnType<typeof buildRecheckWhere>) {
  const and = (where.AND ?? []) as Record<string, unknown>[];
  const or = (b: Record<string, unknown>) => (b.OR ?? []) as Record<string, unknown>[];
  const watchable = and.find((b) => or(b).some((c) => "status" in c));
  const stale = and.find((b) => or(b).some((c) => "lastCheckedAt" in c));
  return { and, watchable: or(watchable ?? {}), stale: or(stale ?? {}) };
}

describe("buildRecheckWhere", () => {
  it("exige las DOS condiciones a la vez, no una u otra", () => {
    // Si esto fuera un OR de todo, un anuncio recién comprobado volvería a
    // entrar sólo por estar activo, y el cron cada 2 h multiplicaría por 12 las
    // descargas.
    const { and, watchable, stale } = branches(buildRecheckWhere({ now: NOW }));
    assert.equal(and.length, 2, "deben ser dos ramas obligatorias");
    assert.ok(watchable.length > 0 && stale.length > 0);
  });

  it("vigila los activos y los retirados recientes, para cazar reapariciones", () => {
    const { watchable } = branches(buildRecheckWhere({ now: NOW, removedWatchDays: 45 }));
    assert.deepEqual(watchable[0], {
      status: { in: ["ACTIVE", "PRICE_DROP", "PRICE_UP", "UNKNOWN"] },
    });
    assert.deepEqual(watchable[1], {
      status: "REMOVED",
      lastSeenAt: { gte: new Date("2026-06-20T12:00:00Z") },
    });
  });

  it("un anuncio nunca comprobado entra siempre", () => {
    // `lastCheckedAt: null` no casa con ningún `lt`, así que sin esta rama los
    // anuncios recién importados no se recomprobarían jamás.
    const { stale } = branches(buildRecheckWhere({ now: NOW }));
    assert.deepEqual(stale[0], { lastCheckedAt: null });
  });

  it("el corte de rancio se calcula hacia atrás desde ahora", () => {
    const { stale } = branches(buildRecheckWhere({ now: NOW, staleAfterHours: 20 }));
    assert.deepEqual(stale[1], {
      lastCheckedAt: { lt: new Date("2026-08-03T16:00:00Z") },
    });
  });

  it("con 0 horas de rancio todo lo vigilable entra: es la vía de escape para forzar un barrido", () => {
    const { stale } = branches(buildRecheckWhere({ now: NOW, staleAfterHours: 0 }));
    assert.deepEqual(stale[1], { lastCheckedAt: { lt: NOW } });
  });
});
