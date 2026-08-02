/**
 * Normaliza la GEO sucia de las fichas de inmueble (Fase 3 de
 * `docs/BUSCADOR-ALQUILER.md`).
 *
 * El problema: `src/lib/import-listing.ts:633-636` guarda `city: "Desconocida"`
 * y `province: ""` cuando el portal no dio ubicación, así que hoy filtrar por
 * provincia produce falsos negativos SILENCIOSOS.
 *
 * Uso:
 *   npm run normalize-geo                 # informe, NO escribe nada
 *   npm run normalize-geo -- --limit 20   # acota cuántas fichas mira
 *   npm run normalize-geo -- --apply      # escribe (pide --yes para confirmar)
 *   npm run normalize-geo -- --audit      # qué se escribió y cuándo
 *   npm run normalize-geo -- --undo "X"   # deshace lo escrito que resultó en X
 *
 * Reglas de seguridad:
 *  - `--dry-run` es el DEFECTO; escribir exige `--apply --yes`.
 *  - Sólo toca campos VACÍOS o marcadores ("", "Desconocida"): nunca pisa un
 *    dato bueno que haya puesto el usuario o el portal.
 *  - Si CartoCiudad no da un municipio claro, la ficha se queda como está.
 *    Antes sucia que inventada (lección de `src/lib/geocode.ts:88-94`).
 *  - Cada escritura deja rastro en `ImportLog` (kind GEOCODE) con el valor
 *    anterior, que es lo que permite deshacer.
 */
import { prisma } from "../src/lib/db";
import { cartociudadCandidates, pickBestMunicipality } from "../src/lib/cartociudad";
import {
  UNKNOWN_CITY,
  canonicalProvinceLoose,
  isBlankGeo,
  isProvinceOnlyQuery,
} from "../src/lib/geo-es";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirmed = args.includes("--yes");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Math.max(1, Number(args[limitArg + 1]) || 50) : 200;

const isBlank = isBlankGeo;

/** Consulta para CartoCiudad, de más específica a más laxa. */
function queriesFor(p: {
  address: string | null;
  postalCode: string | null;
  city: string;
  province: string;
  title: string;
}): string[] {
  const city = isBlank(p.city) ? null : p.city.trim();
  const province = isBlank(p.province) ? null : p.province.trim();
  const out = [
    [p.address?.trim(), city, province].filter(Boolean).join(", "),
    p.postalCode?.trim(),
    [city, province].filter(Boolean).join(", "),
    // Último recurso: muchos títulos de portal llevan la zona
    // ("Piso en alquiler en Cimadevilla, Gijón").
    p.title.split(/\ben\b/i).slice(1).join(" en ").trim(),
  ];
  return Array.from(new Set(out.map((q) => (q ?? "").trim()).filter((q) => q.length >= 3)));
}

type GeoLogMeta = {
  before?: { city?: string | null; province?: string | null };
  after?: { city?: string; province?: string };
};

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

/**
 * Deshace las escrituras de este script cuyo resultado fue `target` (municipio
 * o provincia). Restaura el valor que había ANTES, que es el que se guardó en
 * `ImportLog.meta.before`.
 *
 * Sólo revierte si la ficha SIGUE teniendo lo que escribimos: si alguien la
 * corrigió a mano después, su corrección manda.
 */
async function undo(target: string) {
  const rows = await prisma.importLog.findMany({
    where: { kind: "GEOCODE", message: { startsWith: "normalize-geo:" } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const seen = new Set<string>();
  let matched = 0;
  let reverted = 0;

  for (const r of rows) {
    const meta = r.meta as GeoLogMeta | null;
    if (!r.propertyId || !meta?.before || !meta.after) continue;
    // Sólo la escritura MÁS RECIENTE de cada ficha (las filas vienen ordenadas).
    if (seen.has(r.propertyId)) continue;
    seen.add(r.propertyId);
    if (norm(meta.after.city) !== norm(target) && norm(meta.after.province) !== norm(target)) {
      continue;
    }

    matched++;
    const where = {
      id: r.propertyId,
      ...(meta.after.city ? { city: meta.after.city } : {}),
      ...(meta.after.province ? { province: meta.after.province } : {}),
    };
    const data = {
      ...(meta.after.city ? { city: meta.before.city || UNKNOWN_CITY } : {}),
      ...(meta.after.province ? { province: meta.before.province || "" } : {}),
    };
    const back = `${data.city ?? "(igual)"} / ${data.province ?? "(igual)"}`;

    if (!confirmed) {
      console.log(`→ ${r.propertyId}  ${meta.after.city ?? ""} ⇒ ${back}`);
      continue;
    }

    const res = await prisma.property.updateMany({ where, data });
    if (res.count === 0) {
      console.log(`· ${r.propertyId} ya no tiene el valor que escribimos: se respeta`);
      continue;
    }
    reverted++;
    await prisma.importLog.create({
      data: {
        propertyId: r.propertyId,
        kind: "GEOCODE",
        ok: true,
        message: `normalize-geo undo: ${meta.after.city ?? ""} ⇒ ${back}`,
        meta: { undoOf: r.id, restored: data },
      },
    });
    console.log(`✓ ${r.propertyId}  ${meta.after.city ?? ""} ⇒ ${back}`);
  }

  console.log(
    `\n${matched} escritura(s) coinciden con «${target}».` +
      (confirmed ? ` ${reverted} revertida(s).` : " Nada revertido — repite con --yes.")
  );
}

/** Qué escribió este script y cuándo. Es el hilo del que tirar para deshacer. */
async function audit() {
  const rows = await prisma.importLog.findMany({
    where: { kind: "GEOCODE", message: { startsWith: "normalize-geo:" } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  if (!rows.length) {
    console.log("Este script no ha escrito nunca (ninguna entrada normalize-geo en ImportLog).");
    console.log("Si la geo cambió, fue por otra vía: importación, edición manual o merge.");
    return;
  }
  console.log(`Escrituras de normalize-geo (${rows.length}):\n`);
  for (const r of rows) {
    console.log(`${r.createdAt.toISOString()}  ${r.propertyId}  ${r.message}`);
  }
}

async function main() {
  if (args.includes("--audit")) {
    await audit();
    process.exit(0);
  }
  const undoArg = args.indexOf("--undo");
  if (undoArg >= 0) {
    const target = args[undoArg + 1];
    if (!target || target.startsWith("--")) {
      console.error('Uso: npm run normalize-geo -- --undo "Corvera de Asturias" [--yes]');
      process.exit(1);
    }
    await undo(target);
    process.exit(0);
  }
  if (apply && !confirmed) {
    console.error("--apply escribe en la base de datos. Repite con --apply --yes.");
    process.exit(1);
  }

  const dirty = await prisma.property.findMany({
    where: {
      OR: [{ province: "" }, { city: UNKNOWN_CITY }, { city: "" }],
    },
    select: {
      id: true,
      title: true,
      address: true,
      postalCode: true,
      city: true,
      province: true,
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  const total = await prisma.property.count();
  const dirtyTotal = await prisma.property.count({
    where: { OR: [{ province: "" }, { city: UNKNOWN_CITY }, { city: "" }] },
  });

  console.log(`Fichas totales: ${total}`);
  console.log(`Con geo incompleta: ${dirtyTotal}`);
  console.log(`Se revisan ahora: ${dirty.length}${apply ? " (MODO ESCRITURA)" : " (informe, no escribe)"}\n`);

  let resolved = 0;
  let unresolved = 0;

  for (const p of dirty) {
    let match: ReturnType<typeof pickBestMunicipality> = null;
    let usedQuery: string | null = null;
    for (const q of queriesFor(p)) {
      const candidates = await cartociudadCandidates(q, {
        provinceFilter: isBlank(p.province) ? undefined : p.province,
      });
      match = pickBestMunicipality(candidates, {
        province: canonicalProvinceLoose(p.province),
        onlyMunicipalityLevel: isProvinceOnlyQuery(q),
      });
      if (match) {
        usedQuery = q;
        break;
      }
    }

    if (!match) {
      unresolved++;
      console.log(`· ${p.id}  «${p.title.slice(0, 48)}»  → sin candidato claro, se deja como está`);
      continue;
    }

    // Sólo se rellenan huecos. Un dato bueno existente manda siempre.
    const patch: { city?: string; province?: string } = {};
    if (isBlank(p.city)) patch.city = match.city;
    if (isBlank(p.province)) patch.province = match.province;

    if (!Object.keys(patch).length) {
      console.log(`· ${p.id}  ya tenía datos buenos, nada que rellenar`);
      continue;
    }

    resolved++;
    const before = `${p.city || "∅"} / ${p.province || "∅"}`;
    const after = `${patch.city ?? p.city} / ${patch.province ?? p.province}`;
    console.log(
      `${apply ? "✓" : "→"} ${p.id}  ${before}  ⇒  ${after}` +
        `  [${match.matchedType}${match.municipalityCode ? ` ${match.municipalityCode}` : ""}]`
    );

    if (apply) {
      // updateMany CON los valores originales en el where: si la ficha cambió
      // entre la lectura y ahora (el usuario la editó, otro import la tocó),
      // `count` es 0 y no se pisa nada. Un `update` por id sí lo pisaría.
      const written = await prisma.property.updateMany({
        where: { id: p.id, city: p.city, province: p.province },
        data: patch,
      });
      if (written.count === 0) {
        resolved--;
        console.log(`  ↳ ${p.id} cambió mientras tanto: no se toca`);
        continue;
      }
      // El valor ANTERIOR y CÓMO se decidió van en el log: sin eso no se puede
      // deshacer ni auditar un falso positivo.
      await prisma.importLog.create({
        data: {
          propertyId: p.id,
          kind: "GEOCODE",
          ok: true,
          message: `normalize-geo: ${before} ⇒ ${after}`,
          meta: {
            before: { city: p.city, province: p.province },
            after: patch,
            source: "cartociudad",
            query: usedQuery,
            matchedType: match.matchedType,
            state: match.state,
            municipalityCode: match.municipalityCode,
            algorithm: "pickBestMunicipality@1",
          },
        },
      });
    }
  }

  console.log(
    `\nResumen: ${resolved} normalizables, ${unresolved} sin candidato claro.` +
      (apply ? " Escritas." : " Nada escrito — repite con --apply --yes.")
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
