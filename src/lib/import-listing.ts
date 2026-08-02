import { z } from "zod";
import type { Portal, PropertyType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { evaluateAlerts } from "@/lib/alerts/evaluate";
import { notifyLinkedConversations } from "@/lib/chat/context-events";
import { dhashFromUrl } from "@/lib/dhash";
import { slugifyTitle } from "@nidokey/shared";
import { findSimilar } from "@/features/matching/find-similar";
import { mergeProperties } from "@/features/matching/merge";
import { autoMergeSafety } from "@/features/matching/auto-merge-guard";
import { borrowFieldsFromSimilar } from "@/features/matching/borrow-fields";
import { geocodeAddress } from "@/lib/geocode";
import { cartociudadCandidates, pickBestMunicipality } from "@/lib/cartociudad";
import { isBlankGeo, isProvinceOnlyQuery } from "@/lib/geo-es";
import { logImportEvent } from "@/lib/import-log";
import {
  isValidPriceEur,
  isValidMonthlyRentEur,
  isValidBuiltArea,
  isValidPlotArea,
  isValidYear,
  isReasonablePriceChange,
  cleanDescription,
  isLikelyJunkDescription,
} from "@nidokey/shared";

/**
 * Payload normalizado que el bookmarklet (o cualquier importador) envía
 * a /api/listings/import. Todos los campos opcionales salvo url + título mínimo.
 */
export const ImportListingInput = z.object({
  url: z.string().url(),
  portal: z.enum(["IDEALISTA", "FOTOCASA", "PISOS_COM", "MILANUNCIOS", "HABITACLIA", "YAENCONTRE", "THINKSPAIN", "INDOMIO", "OTHER", "MANUAL"]).optional(),
  externalId: z.string().optional().nullable(),

  title: z.string().min(2),
  description: z.string().optional().nullable(),

  // precio en EUROS enteros (lo convertimos a céntimos al guardar). Según la
  // operación se interpreta como precio de venta (SALE) o renta mensual (RENT).
  price: z.coerce.number().int().nonnegative().optional().nullable(),

  // Operación del anuncio. Por defecto SALE (retrocompatible con imports viejos).
  operationType: z.enum(["SALE", "RENT", "RENT_TO_OWN"]).optional(),

  // Condiciones de alquiler (opcionales; deposit en EUROS → céntimos al guardar).
  deposit: z.coerce.number().int().nonnegative().optional().nullable(),
  minStayMonths: z.coerce.number().int().optional().nullable(),
  maxStayMonths: z.coerce.number().int().optional().nullable(),
  utilitiesIncluded: z.boolean().optional().nullable(),
  furnished: z.enum(["UNFURNISHED", "SEMI", "FURNISHED"]).optional().nullable(),
  petsAllowed: z.boolean().optional().nullable(),
  contractType: z.enum(["RESIDENTIAL", "SEASONAL", "ROOM", "COMMERCIAL"]).optional().nullable(),

  type: z.enum(["HOUSE", "PISO", "ATICO", "CHALET", "DUPLEX", "ESTUDIO", "LOFT", "LOCAL", "TERRENO", "OTRO"]).optional(),

  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  neighborhood: z.string().optional().nullable(),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),

  rooms: z.coerce.number().int().optional().nullable(),
  bathrooms: z.coerce.number().int().optional().nullable(),
  builtArea: z.coerce.number().int().optional().nullable(),
  usableArea: z.coerce.number().int().optional().nullable(),
  plotArea: z.coerce.number().int().optional().nullable(),
  floor: z.string().optional().nullable(),
  yearBuilt: z.coerce.number().int().optional().nullable(),
  hasElevator: z.boolean().optional().nullable(),
  hasGarage: z.boolean().optional().nullable(),
  hasStorage: z.boolean().optional().nullable(),
  hasTerrace: z.boolean().optional().nullable(),
  hasFireplace: z.boolean().optional().nullable(),
  hasGarden: z.boolean().optional().nullable(),
  hasPool: z.boolean().optional().nullable(),
  energyRating: z.enum(["A", "B", "C", "D", "E", "F", "G", "UNKNOWN"]).optional(),

  // Imágenes: aceptamos strings (no .url()). Una sola URL mala NO debe tirar
  // todo el import con 400; filterImages() valida http(s) y descarta basura.
  images: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
});

/**
 * Filtro defensivo de imágenes en el SERVIDOR (red de seguridad sobre el
 * filtrado del cliente WebView): exige http(s), descarta svg/gif y basura
 * (logos, iconos, marcas, mapas…) — pero SOLO como segmento de ruta/fichero,
 * no como subcadena, para NO descartar fotos reales servidas desde /static/ o
 * /assets/. Deduplica por path (sin query → conserva URLs firmadas), tope 60.
 */
const IMG_JUNK_RE =
  /(?:^|[/_.\-])(logos?|sprites?|icons?|icono|favicon|placeholder|avatars?|watermark|marca-?agua|blank|pixel|spacer|loading|banner|badges?|sello|bandera|flags?)(?:[/_.\-]|$)/i;
const IMG_JUNK_HOST_RE = /(googleapis|gstatic|staticmap|maps\.google|fbcdn|facebook|whatsapp|instagram|twitter|gravatar)/i;

export function filterImages(urls: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls ?? []) {
    if (typeof raw !== "string") continue;
    const u = raw.trim();
    if (!/^https?:\/\//i.test(u)) continue;
    const path = u.split("?")[0];
    if (/\.(svg|gif)$/i.test(path)) continue;
    if (IMG_JUNK_RE.test(path) || IMG_JUNK_HOST_RE.test(path)) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(u);
    if (out.length >= 60) break;
  }
  return out;
}

export type ImportListingPayload = z.infer<typeof ImportListingInput>;

export function detectPortal(url: string): Portal {
  const u = url.toLowerCase();
  if (u.includes("idealista.")) return "IDEALISTA";
  if (u.includes("fotocasa.")) return "FOTOCASA";
  if (u.includes("pisos.com")) return "PISOS_COM";
  if (u.includes("milanuncios.")) return "MILANUNCIOS";
  if (u.includes("habitaclia.")) return "HABITACLIA";
  if (u.includes("yaencontre.")) return "YAENCONTRE";
  if (u.includes("thinkspain.")) return "THINKSPAIN";
  if (u.includes("indomio.")) return "INDOMIO";
  return "OTHER";
}

export type ImportResult = {
  created: boolean;
  priceChanged: boolean;
  mediaRefreshed: boolean;
  photoCount: number;
  propertyId: string;
  listingId: string;
  previousPrice: number | null;
  newPrice: number | null;
};

/**
 * Devuelve un objeto solo con las claves que tienen valor (no null/undefined).
 * Útil para fusionar payload con la fila existente sin pisar datos con NULL.
 */
function fillIfEmpty<T extends Record<string, unknown>>(
  existing: T,
  patch: Partial<T>
): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const v = patch[key];
    if (v == null) continue;
    if (existing[key] == null || existing[key] === "") {
      out[key] = v;
    }
  }
  return out;
}

/**
 * Importa un anuncio: crea Property + Listing + Media + PriceSnapshot la primera vez,
 * o actualiza precio/estado y añade snapshot si ya existía el Listing por URL.
 */
/**
 * Re-parsea el array `features` (strings sueltos extraídos por el userscript)
 * para rellenar campos que vienen NULL del payload. Útil cuando el parser
 * cliente no reconoció el formato pero la string está ahí.
 *
 * Ejemplos manejados:
 *   "186 m2"                → builtArea: 186
 *   "65 m² útiles"          → usableArea: 65
 *   "4 hab."                → rooms: 4
 *   "3 baños"               → bathrooms: 3
 *   "Construido en 1931"    → yearBuilt: 1931
 *   "4ª Planta"             → floor: "4ª Planta"
 *   "Parcela de 1.200 m²"   → plotArea: 1200
 *   "4.153 €/m²"            → IGNORADO (precio unitario)
 */
export function parseFeaturesArray(features: string[] | undefined): Partial<ImportListingPayload> {
  const out: Partial<ImportListingPayload> = {};
  if (!features?.length) return out;
  for (const raw of features) {
    if (!raw || typeof raw !== "string") continue;
    const t = raw.trim();
    if (!t) continue;
    const low = t.toLowerCase();

    // ── Eficiencia energética: requiere palabra clave + letra A-G aislada
    //    (las etiquetas van en mayúscula: "Certificación energética: D").
    if (out.energyRating == null && /(energ[eé]tic|emisiones)/i.test(low)) {
      const em = t.match(/\b([A-G])\b/);
      if (em) out.energyRating = em[1] as ImportListingPayload["energyRating"];
    }

    // ── Amenidades (no requieren número). "Sin ascensor"/"no dispone" → false.
    {
      const neg = /^\s*sin\b/i.test(t) || /\bno\s+(tiene|dispone|hay|cuenta|incluye|posee)\b/i.test(low);
      if (out.hasElevator == null && /\bascensor\b/i.test(low)) out.hasElevator = !neg;
      if (out.hasGarage == null && /\b(garaje|parking|aparcamiento)\b/i.test(low)) out.hasGarage = !neg;
      if (out.hasStorage == null && /\btrastero\b/i.test(low)) out.hasStorage = !neg;
      if (out.hasTerrace == null && /\bterraza\b/i.test(low)) out.hasTerrace = !neg;
      if (out.hasFireplace == null && /\bchimenea\b/i.test(low)) out.hasFireplace = !neg;
      if (out.hasGarden == null && /\bjard[ií]n\b/i.test(low)) out.hasGarden = !neg;
      if (out.hasPool == null && /\bpiscina\b/i.test(low)) out.hasPool = !neg;
    }

    // ── Condiciones de alquiler (no requieren número salvo la fianza).
    {
      if (out.furnished == null) {
        if (/semi-?amueblad/i.test(low)) out.furnished = "SEMI";
        else if (/sin amueblar|no amueblad|sin amueblamiento/i.test(low)) out.furnished = "UNFURNISHED";
        else if (/\bamueblad/i.test(low)) out.furnished = "FURNISHED";
      }
      if (out.utilitiesIncluded == null && /gastos\b/i.test(low)) {
        if (/gastos\s+(no\s+inclu|aparte|no\s+incluidos)/i.test(low)) out.utilitiesIncluded = false;
        else if (/gastos\s+inclu/i.test(low)) out.utilitiesIncluded = true;
      }
      if (out.petsAllowed == null && /mascota/i.test(low)) {
        out.petsAllowed = !/no\s+se\s+admiten|sin\s+mascota|no\s+(se\s+)?permit/i.test(low);
      }
      if (out.contractType == null && /\btemporada\b/i.test(low)) out.contractType = "SEASONAL";
      // Fianza con importe en € (no "X meses": eso necesita la renta para resolver).
      if (out.deposit == null && /fianza/i.test(low) && /€|eur/i.test(low)) {
        const fm = t.replace(/[\.\s]/g, "").match(/(\d{3,})(?:€|eur)/i);
        const dep = fm ? parseInt(fm[1], 10) : null;
        if (dep != null && dep >= 100 && dep <= 100_000) out.deposit = dep;
      }
    }

    // Descartar €/m²
    if (/€\s*\/\s*m|€\/m|€\s*por\s*m/i.test(t)) continue;
    const num = (() => {
      const m = t.replace(/[\.\s]/g, "").match(/-?\d+/);
      return m ? parseInt(m[0], 10) : null;
    })();
    if (num == null) {
      if (/planta/.test(low) && !out.floor) out.floor = t;
      continue;
    }
    // Construido / año
    const yb = low.match(/(?:construido en|año\s*(?:de\s*)?construcci[oó]n)\D*(\d{4})/);
    if (yb) {
      const y = parseInt(yb[1], 10);
      if (isValidYear(y) && !out.yearBuilt) out.yearBuilt = y;
      continue;
    }
    // Áreas
    if (/m²|\bm2\b|metros/i.test(t)) {
      if (/parcela|terreno|plot/i.test(low)) {
        if (isValidPlotArea(num) && !out.plotArea) out.plotArea = num;
      } else if (/útil|util/i.test(low)) {
        if (isValidBuiltArea(num) && !out.usableArea) out.usableArea = num;
      } else if (/constru|edificad/i.test(low)) {
        if (isValidBuiltArea(num) && !out.builtArea) out.builtArea = num;
      } else if (
        // m² "a secas" → superficie construida, PERO no si la string habla de
        // terraza/balcón/jardín/trastero/garaje (esos m² no son la vivienda).
        !/terraza|balc[oó]n|jard[ií]n|trastero|garaje|parcela/i.test(low) &&
        isValidBuiltArea(num) &&
        !out.builtArea
      ) {
        out.builtArea = num;
      }
      continue;
    }
    // Habitaciones / baños
    if (/habitaci[oó]n|dormit|\bhabs?\.?\b/i.test(low)) {
      if (num >= 0 && num <= 50 && !out.rooms) out.rooms = num;
      continue;
    }
    if (/baño|aseo/i.test(low)) {
      if (num >= 0 && num <= 50 && !out.bathrooms) out.bathrooms = num;
      continue;
    }
    if (/planta/i.test(low) && !out.floor) out.floor = t;
  }
  return out;
}

/**
 * Sanea el payload: pone a null cualquier valor que no pase los validadores
 * de cordura. Evita que un parser-error contamine la BBDD. Adicionalmente
 * intenta rellenar campos vacíos re-parseando el array `features`.
 *
 * `effectiveOperation`: operación REAL del anuncio (la del Listing existente en
 * un re-import). Sin ella, un re-import de un alquiler cuyo payload no traiga
 * operationType validaría la renta con la banda de VENTA (≥ 10.000 €) y la
 * nulearía — el cambio de renta jamás se registraría.
 */
export function sanitizePayload(
  p: ImportListingPayload,
  effectiveOperation?: "SALE" | "RENT" | "RENT_TO_OWN"
): ImportListingPayload {
  const out = { ...p };
  // 1. Validar y nulear lo que no sea cuerdo. El precio se valida con la banda
  //    de su operación: alquiler 100–50.000 €/mes, venta ≥ 10.000 €. Así una
  //    renta de 450 € no se descarta (isValidPriceEur la rechazaría) ni un
  //    precio de venta bajo se cuela como renta.
  const isRent = (effectiveOperation ?? out.operationType) === "RENT";
  const priceOk = isRent ? isValidMonthlyRentEur(out.price ?? null) : isValidPriceEur(out.price ?? null);
  if (!priceOk) out.price = null;
  if (!isValidBuiltArea(out.builtArea ?? null)) out.builtArea = null;
  if (!isValidBuiltArea(out.usableArea ?? null)) out.usableArea = null;
  if (out.plotArea != null && !isValidPlotArea(out.plotArea)) out.plotArea = null;
  if (out.rooms != null && (out.rooms < 0 || out.rooms > 50)) out.rooms = null;
  if (out.bathrooms != null && (out.bathrooms < 0 || out.bathrooms > 50)) out.bathrooms = null;
  if (!isValidYear(out.yearBuilt ?? null)) out.yearBuilt = null;
  if (out.latitude != null && (out.latitude < -90 || out.latitude > 90)) out.latitude = null;
  if (out.longitude != null && (out.longitude < -180 || out.longitude > 180)) out.longitude = null;

  // 2. Si tras nulear quedan huecos, re-parsear array `features` como fallback.
  //    Recupera m²/útiles/parcela/hab./baños/año/planta + eficiencia + amenidades
  //    aunque el JSON del portal no los trajera (el cliente ahora SIEMPRE manda
  //    el texto de las listas de características).
  const fromFeatures = parseFeaturesArray(out.features);
  if (out.builtArea == null && fromFeatures.builtArea != null) out.builtArea = fromFeatures.builtArea;
  if (out.usableArea == null && fromFeatures.usableArea != null) out.usableArea = fromFeatures.usableArea;
  if (out.plotArea == null && fromFeatures.plotArea != null) out.plotArea = fromFeatures.plotArea;
  if (out.rooms == null && fromFeatures.rooms != null) out.rooms = fromFeatures.rooms;
  if (out.bathrooms == null && fromFeatures.bathrooms != null) out.bathrooms = fromFeatures.bathrooms;
  if (out.yearBuilt == null && fromFeatures.yearBuilt != null) out.yearBuilt = fromFeatures.yearBuilt;
  if (!out.floor && fromFeatures.floor) out.floor = fromFeatures.floor;
  if (out.energyRating == null && fromFeatures.energyRating != null) out.energyRating = fromFeatures.energyRating;
  if (out.hasElevator == null && fromFeatures.hasElevator != null) out.hasElevator = fromFeatures.hasElevator;
  if (out.hasGarage == null && fromFeatures.hasGarage != null) out.hasGarage = fromFeatures.hasGarage;
  if (out.hasStorage == null && fromFeatures.hasStorage != null) out.hasStorage = fromFeatures.hasStorage;
  if (out.hasTerrace == null && fromFeatures.hasTerrace != null) out.hasTerrace = fromFeatures.hasTerrace;
  if (out.hasFireplace == null && fromFeatures.hasFireplace != null) out.hasFireplace = fromFeatures.hasFireplace;
  if (out.hasGarden == null && fromFeatures.hasGarden != null) out.hasGarden = fromFeatures.hasGarden;
  if (out.hasPool == null && fromFeatures.hasPool != null) out.hasPool = fromFeatures.hasPool;

  // 3. Filtrar imágenes basura (logos/iconos/marcas/mapas), deduplicar y limitar.
  out.images = filterImages(out.images);

  // 4. Descripción: limpiar (tags/entidades/espacios) y descartar basura
  //    (cookies, "anuncios similares", solo teléfono, CTA corto). Mejor vacía
  //    que con texto incorrecto — nunca entra basura a BBDD.
  if (out.description) {
    const c = cleanDescription(out.description);
    out.description = !c || isLikelyJunkDescription(c) ? null : c;
  }

  return out;
}

/**
 * Se lanza cuando un import intenta tocar (update path) una ficha cuyo Property
 * pertenece a OTRO usuario (colisión de `Listing.url`, que es @unique global).
 * Los route handlers lo mapean a 403 sin filtrar existencia del recurso ajeno.
 */
export class CrossOwnerError extends Error {
  constructor(message = "Recurso de otro usuario") {
    super(message);
    this.name = "CrossOwnerError";
  }
}

export async function importListing(
  rawPayload: ImportListingPayload,
  opts: { ownerId?: string | null } = {}
): Promise<ImportResult> {
  // El Listing existente manda sobre la operación (un re-import no cambia un
  // alquiler a venta) y su operación decide la banda de validación del precio.
  const existing = await prisma.listing.findUnique({
    where: { url: rawPayload.url },
    include: { property: true },
  });

  const payload = sanitizePayload(rawPayload, existing?.operationType ?? undefined);
  const portal = payload.portal ?? detectPortal(payload.url);
  const operationType = payload.operationType ?? "SALE";
  const isRent = operationType === "RENT";
  const priceCents = payload.price != null ? payload.price * 100 : null;
  const depositCents = payload.deposit != null ? payload.deposit * 100 : null;
  const ownerId = opts.ownerId ?? null;

  // ---------- Update path ----------
  if (existing) {
    // Seguridad: Listing.url es @unique GLOBAL. Si la URL ya existe pero su
    // Property es de OTRO usuario, NO tocamos su ficha (sería un IDOR de
    // secuestro por colisión de URL). Solo el dueño re-importa su propia URL.
    if (ownerId && existing.property.ownerId !== ownerId) {
      throw new CrossOwnerError("Este anuncio ya pertenece a otra cuenta");
    }

    const previousPrice = existing.lastPrice ?? null;
    // La operación la marca el ANUNCIO (cada listing tiene la suya): un mismo
    // inmueble puede tener anuncio de venta y de alquiler. Reusamos la del
    // listing existente (no la del payload) para no cambiar de operación al
    // re-importar la misma URL.
    const existingIsRent = existing.operationType === "RENT";

    // Sanity check: si el cambio es brutal (>5x o <0.2x), NO escribimos
    // el precio nuevo ni creamos snapshot. Log para revisión.
    const sanity = isReasonablePriceChange(previousPrice, priceCents);
    if (!sanity.ok) {
      await prisma.listing.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), lastCheckedAt: new Date() },
      });
      await logImportEvent("RECHECK", {
        propertyId: existing.propertyId,
        ok: false,
        message: `Import rechazado: ${sanity.reason}`,
        meta: { listingId: existing.id, attempted: priceCents, previousPrice, url: payload.url },
      });
      return {
        created: false,
        priceChanged: false,
        mediaRefreshed: false,
        photoCount: payload.images.length,
        propertyId: existing.propertyId,
        listingId: existing.id,
        previousPrice,
        newPrice: previousPrice,
      };
    }

    const priceChanged = priceCents != null && priceCents !== previousPrice;

    // Reaparición: si el anuncio estaba REMOVED/SOLD y el usuario lo re-importa,
    // es que la página vuelve a estar viva → reactivar para que el cron lo
    // vuelva a vigilar. Con cambio de precio, el estado ya es PRICE_*.
    const wasGone = existing.status === "REMOVED" || existing.status === "SOLD";
    // Primer precio conocido (previousPrice null) = línea base, no PRICE_DROP.
    const newStatus = priceChanged
      ? previousPrice == null
        ? wasGone
          ? ("ACTIVE" as const)
          : existing.status
        : priceCents! < previousPrice
        ? ("PRICE_DROP" as const)
        : ("PRICE_UP" as const)
      : wasGone
      ? ("ACTIVE" as const)
      : existing.status;

    // Con cambio de precio: transacción + guard optimista (mismo patrón que el
    // runner) — dos imports concurrentes de la misma URL no pueden duplicar
    // snapshot ni disparar la alerta dos veces.
    let priceApplied = false;
    if (priceChanged && priceCents != null) {
      priceApplied = await prisma.$transaction(async (tx) => {
        const upd = await tx.listing.updateMany({
          where: { id: existing.id, lastPrice: previousPrice },
          data: {
            lastPrice: priceCents,
            lastSeenAt: new Date(),
            lastCheckedAt: new Date(),
            lastCheckResult: "ok",
            lastCheckDetail: null,
            status: newStatus,
          },
        });
        if (upd.count === 0) return false;
        await tx.priceSnapshot.create({
          data: {
            listingId: existing.id,
            propertyId: existing.propertyId,
            price: priceCents,
            source: portal,
          },
        });
        return true;
      });
    }
    if (!priceApplied) {
      // Sin cambio (o carrera perdida): solo marcar visto/comprobado.
      await prisma.listing.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          lastCheckedAt: new Date(),
          lastCheckResult: "ok",
          lastCheckDetail: null,
          ...(priceChanged ? {} : { status: newStatus }),
        },
      });
    }

    // Refrescar campos escalares que estuvieran vacíos (no pisamos lo editado a mano)
    const propPatch = fillIfEmpty(existing.property as unknown as Record<string, unknown>, {
      address: payload.address ?? undefined,
      city: payload.city ?? undefined,
      province: payload.province ?? undefined,
      postalCode: payload.postalCode ?? undefined,
      neighborhood: payload.neighborhood ?? undefined,
      latitude: payload.latitude ?? undefined,
      longitude: payload.longitude ?? undefined,
      rooms: payload.rooms ?? undefined,
      bathrooms: payload.bathrooms ?? undefined,
      builtArea: payload.builtArea ?? undefined,
      usableArea: payload.usableArea ?? undefined,
      plotArea: payload.plotArea ?? undefined,
      floor: payload.floor ?? undefined,
      yearBuilt: payload.yearBuilt ?? undefined,
      hasElevator: payload.hasElevator ?? undefined,
      hasGarage: payload.hasGarage ?? undefined,
      hasStorage: payload.hasStorage ?? undefined,
      hasTerrace: payload.hasTerrace ?? undefined,
      hasFireplace: payload.hasFireplace ?? undefined,
      hasGarden: payload.hasGarden ?? undefined,
      hasPool: payload.hasPool ?? undefined,
      energyRating: payload.energyRating ?? undefined,
      // Condiciones de alquiler: solo rellenan huecos (no pisan lo editado).
      deposit: depositCents ?? undefined,
      minStayMonths: payload.minStayMonths ?? undefined,
      maxStayMonths: payload.maxStayMonths ?? undefined,
      utilitiesIncluded: payload.utilitiesIncluded ?? undefined,
      furnished: payload.furnished ?? undefined,
      petsAllowed: payload.petsAllowed ?? undefined,
      contractType: payload.contractType ?? undefined,
    });

    // Descripción: sustituir la guardada si está vacía, es basura, o la nueva es
    // MUCHO más rica (cura legado tipo título-SEO corto de Idealista que no es
    // "basura" por patrón). Una descripción real ya completa no la supera un
    // ×1.5, así que respeta ediciones del dueño. `payload.description` ya viene
    // limpia y no-basura desde sanitizePayload.
    const prevDesc = existing.property.description;
    const newDesc = payload.description ?? null;
    const muchRicher =
      !!newDesc && !!prevDesc && newDesc.length > prevDesc.length * 1.5 && newDesc.length - prevDesc.length > 60;
    const descPatch =
      newDesc && (!prevDesc || isLikelyJunkDescription(prevDesc) || muchRicher)
        ? { description: newDesc }
        : {};

    // El precio nuevo va a su columna según la operación del anuncio: alquiler →
    // monthlyRent, venta → currentPrice. Así una ficha mixta conserva ambos.
    const priceColumn =
      priceApplied && priceCents != null
        ? existingIsRent
          ? { monthlyRent: priceCents }
          : { currentPrice: priceCents }
        : {};
    await prisma.property.update({
      where: { id: existing.propertyId },
      data: {
        ...propPatch,
        ...descPatch,
        ...priceColumn,
      },
    });

    // Alertas + hilos vinculados: el re-import (userscript/share sheet) es el
    // ÚNICO canal de cambios para los portales manual-only (Idealista,
    // Milanuncios, Yaencontre) — sin este enganche sus alertas no saltaban
    // nunca. Mismo contrato que el recheck del runner.
    if (priceApplied && priceCents != null) {
      await evaluateAlerts("property", existing.propertyId, existingIsRent ? "rent" : "price", {
        oldCents: previousPrice,
        newCents: priceCents,
        status: newStatus,
      });
      await notifyLinkedConversations("property", existing.propertyId, {
        oldCents: previousPrice,
        newCents: priceCents,
        status: newStatus,
        isRent: existingIsRent,
      });
    }

    // Refrescar fotos del portal: borramos las anteriores PHOTO+PORTAL_SCRAPE
    // (las USER_UPLOAD se conservan intactas) y volvemos a crear desde el payload.
    // Preservamos `phash` previo: si la URL ya estaba en BBDD con phash calculado,
    // lo reutilizamos en la nueva fila para no tener que rehashear.
    let mediaRefreshed = false;
    if (payload.images.length > 0) {
      const existingPhashes = await prisma.media.findMany({
        where: { propertyId: existing.propertyId, kind: "PHOTO", source: "PORTAL_SCRAPE", phash: { not: null } },
        select: { url: true, phash: true },
      });
      const phashByUrl = new Map(existingPhashes.map((m) => [m.url, m.phash]));

      await prisma.media.deleteMany({
        where: { propertyId: existing.propertyId, kind: "PHOTO", source: "PORTAL_SCRAPE" },
      });
      await prisma.media.createMany({
        data: payload.images.map((url, i) => ({
          propertyId: existing.propertyId,
          kind: "PHOTO" as const,
          source: "PORTAL_SCRAPE" as const,
          url,
          order: i,
          phash: phashByUrl.get(url) ?? null,
        })),
      });
      mediaRefreshed = true;
    }

    // Background: re-hashear fotos nuevas (no auto-merge en re-import,
    // pero sí buscar duplicados por si han aparecido tras importar otro portal).
    void postImportTasks(existing.propertyId, { skipAutoMerge: !mediaRefreshed });

    return {
      created: false,
      // Carrera perdida = otro proceso ya aplicó este mismo cambio: para este
      // caller no hubo cambio (idempotencia del doble procesado).
      priceChanged: priceApplied,
      mediaRefreshed,
      photoCount: payload.images.length,
      propertyId: existing.propertyId,
      listingId: existing.id,
      previousPrice,
      newPrice: priceCents,
    };
  }

  // ---------- Create path ----------
  const inferredType: PropertyType = payload.type ?? "PISO";

  const property = await prisma.property.create({
    data: {
      ownerId,
      title: payload.title,
      titleSlug: slugifyTitle(payload.title),
      description: payload.description ?? null,
      type: inferredType,
      operationType,
      status: isRent ? "FOR_RENT" : "FOR_SALE",
      // El precio va a su columna según la operación (venta vs renta mensual).
      currentPrice: isRent ? null : priceCents,
      monthlyRent: isRent ? priceCents : null,
      deposit: depositCents,
      minStayMonths: payload.minStayMonths ?? null,
      maxStayMonths: payload.maxStayMonths ?? null,
      utilitiesIncluded: payload.utilitiesIncluded ?? null,
      furnished: payload.furnished ?? null,
      petsAllowed: payload.petsAllowed ?? null,
      contractType: payload.contractType ?? null,

      address: payload.address ?? null,
      city: payload.city ?? "Desconocida",
      // Sin default regional: provincia desconocida = "" (la columna es NOT NULL).
      province: payload.province ?? "",
      postalCode: payload.postalCode ?? null,
      neighborhood: payload.neighborhood ?? null,
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,

      rooms: payload.rooms ?? null,
      bathrooms: payload.bathrooms ?? null,
      builtArea: payload.builtArea ?? null,
      usableArea: payload.usableArea ?? null,
      plotArea: payload.plotArea ?? null,
      floor: payload.floor ?? null,
      yearBuilt: payload.yearBuilt ?? null,
      hasElevator: payload.hasElevator ?? null,
      hasGarage: payload.hasGarage ?? null,
      hasStorage: payload.hasStorage ?? null,
      hasTerrace: payload.hasTerrace ?? null,
      hasFireplace: payload.hasFireplace ?? null,
      hasGarden: payload.hasGarden ?? null,
      hasPool: payload.hasPool ?? null,
      energyRating: payload.energyRating ?? "UNKNOWN",

      tags: payload.features ?? [],

      media: {
        create: payload.images.map((url, i) => ({
          kind: "PHOTO" as const,
          source: "PORTAL_SCRAPE" as const,
          url,
          order: i,
        })),
      },
      listings: {
        create: {
          portal,
          operationType,
          url: payload.url,
          externalId: payload.externalId ?? null,
          lastPrice: priceCents,
          lastSeenAt: new Date(),
          lastCheckedAt: new Date(),
          status: "ACTIVE",
        },
      },
    },
    include: { listings: true },
  });

  const listing = property.listings[0];

  if (priceCents != null) {
    await prisma.priceSnapshot.create({
      data: {
        listingId: listing.id,
        propertyId: property.id,
        price: priceCents,
        source: portal,
      },
    });
  }

  // Lanzar tareas de background: hash de fotos, geocode,
  // buscar duplicados y posible auto-merge.
  void postImportTasks(property.id);

  return {
    created: true,
    priceChanged: false,
    mediaRefreshed: payload.images.length > 0,
    photoCount: payload.images.length,
    propertyId: property.id,
    listingId: listing.id,
    previousPrice: null,
    newPrice: priceCents,
  };
}

async function postImportTasks(propertyId: string, opts: { skipAutoMerge?: boolean } = {}): Promise<void> {
  // 1. dHash de fotos sin hash. Throttle suave para no martillear CDNs.
  try {
    const pendingMedia = await prisma.media.findMany({
      where: { propertyId, kind: "PHOTO", phash: null },
      select: { id: true, url: true },
      take: 60,
    });
    let hashedOk = 0, hashedFail = 0;
    for (const m of pendingMedia) {
      const h = await dhashFromUrl(m.url);
      if (h) {
        await prisma.media.update({ where: { id: m.id }, data: { phash: h } });
        hashedOk++;
      } else {
        hashedFail++;
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    if (pendingMedia.length) {
      await logImportEvent("HASH", {
        propertyId,
        ok: hashedOk > 0,
        message: `${hashedOk} hash OK / ${hashedFail} fallidas (${pendingMedia.length} pendientes)`,
        meta: { ok: hashedOk, fail: hashedFail, total: pendingMedia.length },
      });
    }
  } catch (e) {
    await logImportEvent("HASH", { propertyId, ok: false, message: (e as Error).message });
  }

  // 1b. Municipio y provincia si el portal no los dio. Sin esto el corpus
  //     acumula fichas con `province: ""` y `city: "Desconocida"` (ver el
  //     upsert de más arriba), que dejan el filtro por zona del buscador
  //     silenciosamente inútil: no falla, simplemente no encuentra nada.
  //     La consulta al IGN va en el enriquecimiento posterior, no en la ruta de
  //     importación, y su ritmo lo marca una importación de un usuario, no un
  //     rastreador. Sólo rellena huecos: un dato del portal nunca se pisa.
  try {
    const p = await prisma.property.findUnique({ where: { id: propertyId } });
    if (p && (isBlankGeo(p.city) || isBlankGeo(p.province))) {
      const query = [
        p.address,
        p.postalCode,
        isBlankGeo(p.city) ? null : p.city,
        isBlankGeo(p.province) ? null : p.province,
      ]
        .map((s) => s?.trim())
        .filter(Boolean)
        .join(", ");
      const match =
        query.length >= 3
          ? pickBestMunicipality(await cartociudadCandidates(query), {
              province: p.province,
              // Si lo único que sabemos es la provincia, un resultado de calle
              // sería un homónimo de otro municipio (ver isProvinceOnlyQuery).
              onlyMunicipalityLevel: isProvinceOnlyQuery(query),
            })
          : null;
      const data: { city?: string; province?: string } = {};
      if (match && isBlankGeo(p.city)) data.city = match.city;
      if (match && isBlankGeo(p.province)) data.province = match.province;
      if (Object.keys(data).length) {
        await prisma.property.update({ where: { id: propertyId }, data });
        await logImportEvent("GEOCODE", {
          propertyId,
          ok: true,
          message: `zona: ${data.city ?? p.city} / ${data.province ?? p.province}`,
          meta: { before: { city: p.city, province: p.province }, after: data, source: "cartociudad" },
        });
      }
    }
  } catch (e) {
    await logImportEvent("GEOCODE", { propertyId, ok: false, message: (e as Error).message });
  }

  // 2. Geocode si seguimos sin coords pero tenemos dirección/ciudad.
  try {
    const p = await prisma.property.findUnique({ where: { id: propertyId } });
    if (p && p.latitude == null && p.longitude == null && (p.address || p.city)) {
      const g = await geocodeAddress({
        address: p.address,
        city: p.city,
        province: p.province,
        postalCode: p.postalCode,
        country: p.country,
      });
      if (g) {
        await prisma.property.update({
          where: { id: propertyId },
          data: { latitude: g.latitude, longitude: g.longitude },
        });
        await logImportEvent("GEOCODE", {
          propertyId, ok: true,
          message: `${g.latitude.toFixed(5)}, ${g.longitude.toFixed(5)}`,
          meta: { displayName: g.displayName },
        });
      } else {
        await logImportEvent("GEOCODE", { propertyId, ok: false, message: "Sin resultado" });
      }
    }
  } catch (e) {
    await logImportEvent("GEOCODE", { propertyId, ok: false, message: (e as Error).message });
  }

  // 4. Préstamo de campos vacíos desde una ficha similar.
  try {
    const b = await borrowFieldsFromSimilar(propertyId);
    if (b.borrowed.length) {
      await logImportEvent("BORROW_FIELDS", {
        propertyId, ok: true,
        message: `${b.borrowed.length} campos prestados desde ${b.fromPropertyId} (score ${b.score})`,
        meta: { borrowed: b.borrowed, fromPropertyId: b.fromPropertyId, score: b.score },
      });
    }
  } catch (e) {
    await logImportEvent("BORROW_FIELDS", { propertyId, ok: false, message: (e as Error).message });
  }

  // 5. Buscar duplicados. Si score ≥ 95, auto-merge (salvo skipAutoMerge).
  if (!opts.skipAutoMerge) {
    try {
      const candidates = await findSimilar(propertyId);
      const top = candidates[0];
      if (top && top.score >= 95) {
        // Safety: bloquear auto-merge si tipo distinto o, en la MISMA operación,
        // precios que difieren > 30 %. La operación distinta (venta vs alquiler
        // del mismo inmueble) es el caso mixto legítimo y NO se bloquea por
        // precio. Ver autoMergeSafety (función pura testeada).
        const me = await prisma.property.findUnique({ where: { id: propertyId } });
        const them = await prisma.property.findUnique({ where: { id: top.propertyId } });
        const safety = me && them ? autoMergeSafety(me, them) : { blocked: false, priceTooDifferent: false, typeMismatch: false };
        const { priceTooDifferent, typeMismatch } = safety;
        if (safety.blocked) {
          await logImportEvent("MATCH", {
            propertyId, ok: true,
            message: `Sugerencia ${top.score}% bloqueada por safety (precio/tipo distinto)`,
            meta: { candidateId: top.propertyId, score: top.score, reasons: top.reasons, blocked: true, priceTooDifferent, typeMismatch },
          });
        } else {
          try {
            const result = await mergeProperties(propertyId, top.propertyId);
            await logImportEvent("MERGE_AUTO", {
              propertyId: top.propertyId, ok: true,
              message: `Fusionado ${propertyId} → ${top.propertyId} (score ${top.score}, ${top.reasons.join(", ")})`,
              meta: { sourceId: propertyId, targetId: top.propertyId, score: top.score, reasons: top.reasons, ...result },
            });
          } catch (e) {
            await logImportEvent("MERGE_AUTO", { propertyId, ok: false, message: (e as Error).message, meta: { candidateId: top.propertyId } });
          }
        }
      } else if (top) {
        await logImportEvent("MATCH", {
          propertyId, ok: true,
          message: `Sugerencia ${top.propertyId} (score ${top.score})`,
          meta: { candidateId: top.propertyId, score: top.score, reasons: top.reasons },
        });
      }
    } catch (e) {
      await logImportEvent("MATCH", { propertyId, ok: false, message: (e as Error).message });
    }
  }
}

