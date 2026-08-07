import { isRentOperation } from "@nidokey/shared";
import type { PropertyDetail } from "@/lib/records/property";

export type CompareMetric =
  | "salePrice"
  | "rentPrice"
  | "pricePerSqm"
  | "builtArea"
  | "rooms"
  | "bathrooms"
  | "floor"
  | "location"
  | "status"
  | "portal";

export type CompareGoal = "min" | "max";

export type ComparableProperty = Pick<
  PropertyDetail,
  | "id"
  | "operationType"
  | "currentPrice"
  | "monthlyRent"
  | "builtArea"
  | "rooms"
  | "bathrooms"
  | "floor"
  | "city"
  | "neighborhood"
  | "status"
  | "listings"
>;

export type CompareCell = {
  propertyId: string;
  value: number | string | null;
  best: boolean;
  operationKind: "sale" | "rent";
};

export type CompareRow = {
  metric: CompareMetric;
  goal?: CompareGoal;
  cells: CompareCell[];
};

export function comparePriceCents(p: ComparableProperty, kind: "sale" | "rent"): number | null {
  if (kind === "rent") return p.monthlyRent;
  return p.currentPrice;
}

export function pricePerSqmCents(p: ComparableProperty): number | null {
  const price = isRentOperation(p.operationType) ? p.monthlyRent : p.currentPrice;
  if (price == null || !p.builtArea || p.builtArea <= 0) return null;
  return Math.round(price / p.builtArea);
}

export function operationKind(p: Pick<ComparableProperty, "operationType">): "sale" | "rent" {
  return isRentOperation(p.operationType) ? "rent" : "sale";
}

export function hasMixedOperations(properties: ComparableProperty[]): boolean {
  const hasRent = properties.some((p) => isRentOperation(p.operationType));
  const hasSale = properties.some((p) => !isRentOperation(p.operationType));
  return hasRent && hasSale;
}

export function bestPropertyIds(
  properties: ComparableProperty[],
  valueOf: (p: ComparableProperty) => number | null,
  goal: CompareGoal,
): Set<string> {
  const values = properties
    .map((p) => ({ id: p.id, value: valueOf(p) }))
    .filter((x): x is { id: string; value: number } => x.value != null && Number.isFinite(x.value));
  if (values.length < 2) return new Set();
  const target =
    goal === "min"
      ? Math.min(...values.map((x) => x.value))
      : Math.max(...values.map((x) => x.value));
  return new Set(values.filter((x) => x.value === target).map((x) => x.id));
}

export function parseCompareIds(ids: string | string[] | undefined): string[] {
  const raw = Array.isArray(ids) ? ids : ids == null ? [] : [ids];
  const seen = new Set<string>();
  const parsed: string[] = [];
  for (const chunk of raw) {
    for (const candidate of chunk.split(",")) {
      const id = candidate.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      parsed.push(id);
      if (parsed.length >= 3) return parsed;
    }
  }
  return parsed;
}

export async function fetchExistingProperties<T extends ComparableProperty>(
  ids: string[],
  fetchProperty: (id: string) => Promise<T>,
): Promise<T[]> {
  const properties: T[] = [];
  for (const id of ids) {
    try {
      properties.push(await fetchProperty(id));
    } catch {
      // A stale or malformed id should not break comparison for the remaining valid ids.
    }
  }
  return properties;
}

export function buildCompareRows(properties: ComparableProperty[]): CompareRow[] {
  const saleBest = bestPropertyIds(properties, (p) => comparePriceCents(p, "sale"), "min");
  const rentBest = bestPropertyIds(properties, (p) => comparePriceCents(p, "rent"), "min");
  const salePerSqmBest = bestPropertyIds(properties.filter((p) => operationKind(p) === "sale"), pricePerSqmCents, "min");
  const rentPerSqmBest = bestPropertyIds(properties.filter((p) => operationKind(p) === "rent"), pricePerSqmCents, "min");
  const perSqmBest = new Set([...salePerSqmBest, ...rentPerSqmBest]);
  const areaBest = bestPropertyIds(properties, (p) => p.builtArea, "max");

  const row = (
    metric: CompareMetric,
    valueOf: (p: ComparableProperty) => number | string | null,
    bestIds = new Set<string>(),
    goal?: CompareGoal,
  ): CompareRow => ({
    metric,
    goal,
    cells: properties.map((p) => ({
      propertyId: p.id,
      value: valueOf(p),
      best: bestIds.has(p.id),
      operationKind: operationKind(p),
    })),
  });

  return [
    row("salePrice", (p) => p.currentPrice, saleBest, "min"),
    row("rentPrice", (p) => p.monthlyRent, rentBest, "min"),
    row("pricePerSqm", pricePerSqmCents, perSqmBest, "min"),
    row("builtArea", (p) => p.builtArea, areaBest, "max"),
    row("rooms", (p) => p.rooms),
    row("bathrooms", (p) => p.bathrooms),
    row("floor", (p) => p.floor),
    row("location", (p) => [p.city, p.neighborhood].filter(Boolean).join(" · ") || null),
    row("status", (p) => p.status),
    row("portal", (p) => p.listings[0]?.portal ?? null),
  ];
}
