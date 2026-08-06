import { prisma } from "@/lib/db";
import type { RecordType, BaseRecord, Book, DedupCandidate } from "@nidokey/shared";
import { findDuplicateGroups } from "@nidokey/shared";
import {
  bookToBaseRecord,
  cryptoToBaseRecord,
  marketToBaseRecord,
  jobToBaseRecord,
  propertyToBaseRecord,
} from "@/lib/records/mapper";
import { findSimilar } from "@/features/matching/find-similar";

/**
 * Escaneo ON-DEMAND de duplicados de REGISTROS (no se almacenan sugerencias).
 *
 * - book/crypto/market/job: proyectan a `DedupCandidate` (claves desde columnas +
 *   `meta.book`), excluyen los pares descartados y agrupan con el motor genérico
 *   de `@nidokey/shared/dedup`.
 * - property: usa su motor inmobiliario (`findSimilar`: fotos/geo/título/m²) y
 *   agrupa los pares con score ≥ PROPERTY_MIN_SCORE en componentes conexos.
 *   Los descartes se leen de `Property.matchDismissed` (lo que respeta
 *   `findSimilar` y `/api/properties/[id]/dismiss-match`).
 *
 * Cada grupo lleva sus registros ya mapeados a `BaseRecord` (mismos mappers que
 * `/api/records`) para que el cliente pinte cualquier tipo sin lógica específica.
 */
const DEDUP_TYPES: RecordType[] = ["book", "crypto", "market", "job"];

/** Score mínimo para que un par de inmuebles aparezca como duplicado. 70
 *  deja fuera los pares de solo-fotos-de-stock (60 sin corroboración) y solo
 *  admite señales reales (título, geo+m², renta, fotos corroboradas). */
const PROPERTY_MIN_SCORE = 70;
/** Tope de inmuebles escaneados por pasada (escala personal). */
const PROPERTY_SCAN_LIMIT = 200;

export interface DuplicateGroupResult {
  type: RecordType;
  score: number;
  reasons: string[];
  records: BaseRecord[];
  /** El grupo mezcla idiomas: la UI debe preguntar antes de fusionar. */
  crossLanguage: boolean;
}

/** Clave canónica de un par no dirigido (ids ordenados). */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/**
 * Duplicados de inmuebles del usuario mediante el motor inmobiliario.
 *
 * Se emite UN GRUPO POR PAR (no componentes conexos a propósito): fusionar
 * solo toca 2 fichas, y un enlace falso (p. ej. fotos de stock) no arrastra a
 * fichas no relacionadas por transitividad — el merge del tab conserva una y
 * borra el resto, y con pares el daño máximo de un falso positivo es una ficha
 * equivocada, no media cartera.
 */
async function scanPropertyDuplicates(ownerId: string): Promise<DuplicateGroupResult[]> {
  const props = await prisma.property.findMany({
    where: { ownerId },
    select: { id: true, matchDismissed: true },
    take: PROPERTY_SCAN_LIMIT,
  });
  if (props.length < 2) return [];
  const dismissedBy = new Map(props.map((p) => [p.id, new Set(p.matchDismissed)]));

  // Pares puntuados por findSimilar (fotos/geo/título/m²/renta). Cada ficha
  // actúa de fuente una vez; un par repetido se queda con el mejor score.
  const pairScore = new Map<string, { score: number; reasons: string[] }>();
  for (const p of props) {
    const cands = await findSimilar(p.id);
    for (const c of cands) {
      if (c.score < PROPERTY_MIN_SCORE) continue;
      const key = pairKey(p.id, c.propertyId);
      const prev = pairScore.get(key);
      if (!prev || c.score > prev.score) pairScore.set(key, { score: c.score, reasons: c.reasons });
    }
  }

  const out: DuplicateGroupResult[] = [];
  for (const [key, v] of pairScore) {
    const [a, b] = key.split("|") as [string, string];
    // Respetar descartes en CUALQUIERA de los dos sentidos (findSimilar solo
    // mira los del origen; aquí cubrimos la dirección inversa).
    if (dismissedBy.get(a)?.has(b) || dismissedBy.get(b)?.has(a)) continue;
    const rows = await prisma.property.findMany({
      where: { id: { in: [a, b] } },
      include: {
        media: { orderBy: { order: "asc" }, take: 1, select: { url: true, kind: true } },
      },
    });
    if (rows.length !== 2) continue;
    out.push({
      type: "property",
      score: v.score,
      reasons: v.reasons.slice(0, 3),
      records: rows.map(propertyToBaseRecord),
      crossLanguage: false,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

export async function scanDuplicates(
  ownerId: string,
  only?: RecordType,
): Promise<DuplicateGroupResult[]> {
  const wantsProperty = only === undefined || only === "property";
  const types = only ? (DEDUP_TYPES.includes(only) ? [only] : []) : DEDUP_TYPES;

  const out: DuplicateGroupResult[] = [];

  if (types.length > 0) {
    // Descartes del usuario, agrupados por tipo → Set de pairKeys.
    const dismissals = await prisma.recordDuplicateDismissal.findMany({ where: { ownerId } });
    const dismissedByType = new Map<string, Set<string>>();
    for (const d of dismissals) {
      const set = dismissedByType.get(d.recordType) ?? new Set<string>();
      set.add(d.pairKey);
      dismissedByType.set(d.recordType, set);
    }

    for (const type of types) {
      const { candidates, byId } = await loadCandidates(ownerId, type);
      if (candidates.length < 2) continue;
      const groups = findDuplicateGroups(candidates, {
        dismissedPairs: dismissedByType.get(type) ?? new Set<string>(),
      });
      for (const g of groups) {
        const records = g.ids.map((id) => byId.get(id)).filter((r): r is BaseRecord => !!r);
        if (records.length < 2) continue;
        out.push({ type: g.type, score: g.score, reasons: g.reasons, records, crossLanguage: g.crossLanguage });
      }
    }
  }

  if (wantsProperty) {
    out.push(...(await scanPropertyDuplicates(ownerId)));
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}

/** Carga las fichas de un tipo y devuelve candidatos para el motor + el mapa
 *  id→BaseRecord (para serializar los grupos). Tope alto (escala personal). */
async function loadCandidates(
  ownerId: string,
  type: RecordType,
): Promise<{ candidates: DedupCandidate[]; byId: Map<string, BaseRecord> }> {
  const candidates: DedupCandidate[] = [];
  const byId = new Map<string, BaseRecord>();

  if (type === "book") {
    const rows = await prisma.bookRecord.findMany({ where: { ownerId }, take: 500 });
    for (const r of rows) {
      const b = (r.meta as { book?: Book } | null)?.book;
      candidates.push({
        id: r.id,
        type: "book",
        title: r.title,
        keys: {
          isbn13: b?.isbn13 ?? r.isbn13 ?? null,
          isbn10: b?.isbn10 ?? null,
          workId: b?.externalIds?.openLibraryWorkId ?? null,
          authors: b?.authors ?? (r.authors ? [r.authors] : []),
          language: b?.language ?? null,
        },
      });
      byId.set(r.id, bookToBaseRecord(r));
    }
    return { candidates, byId };
  }

  if (type === "crypto") {
    const rows = await prisma.cryptoHolding.findMany({ where: { ownerId }, take: 500 });
    for (const r of rows) {
      candidates.push({ id: r.id, type: "crypto", title: r.title, keys: { symbol: r.symbol } });
      byId.set(r.id, cryptoToBaseRecord(r));
    }
    return { candidates, byId };
  }

  if (type === "market") {
    const rows = await prisma.marketInstrument.findMany({ where: { ownerId }, take: 500 });
    for (const r of rows) {
      candidates.push({ id: r.id, type: "market", title: r.title, keys: { symbol: r.symbol } });
      byId.set(r.id, marketToBaseRecord(r));
    }
    return { candidates, byId };
  }

  if (type === "job") {
    const rows = await prisma.jobListing.findMany({ where: { ownerId }, take: 500 });
    for (const r of rows) {
      candidates.push({
        id: r.id,
        type: "job",
        title: r.title,
        keys: { url: r.url, externalId: r.externalId, company: r.company, location: r.location },
      });
      byId.set(r.id, jobToBaseRecord(r));
    }
    return { candidates, byId };
  }

  return { candidates, byId };
}
