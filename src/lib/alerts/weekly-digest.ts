import type { RecordType } from "@nidokey/shared";

import { ensureBotDm, replyAsBot } from "@/lib/chat/bot";
import { prisma } from "@/lib/db";

const DIGEST_EVENT_CAP = 500;
const EXAMPLES_PER_CATEGORY = 3;
const USER_BATCH_SIZE = 100;

type DigestEvent = {
  recordType: string;
  recordId: string;
  eventType: string;
  payload: unknown;
  observedAt: Date;
};

export type WeeklyDigestWindow = {
  weekStart: Date;
  weekEnd: Date;
};

export type WeeklyDigestSummary = {
  sent: number;
  skipped: number;
};

type CategoryBucket = {
  label: string;
  counts: {
    priceDrops: number;
    priceUps: number;
    valueChanges: number;
    alerts: number;
    imports: number;
    shares: number;
    other: number;
  };
  links: string[];
};

const CATEGORY_LABELS: Partial<Record<RecordType, string>> = {
  property: "Inmuebles",
  crypto: "Cripto",
  market: "Mercados",
  job: "Empleos",
  book: "Libros",
  holiday: "Viajes",
  food: "Comida",
  workout: "Entrenos",
  trends: "Tendencias",
  chat: "Chats",
};

function payloadRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
}

function titleFromPayload(payload: unknown): string {
  const p = payloadRecord(payload);
  return typeof p.recordTitle === "string" && p.recordTitle.trim() ? p.recordTitle.trim() : "Registro";
}

function trimTitle(title: string): string {
  return title.replace(/\s+/g, " ").slice(0, 60);
}

function categoryLabel(recordType: string): string {
  return CATEGORY_LABELS[recordType as RecordType] ?? "Registros";
}

function digestLink(event: DigestEvent): string {
  return `[[${event.recordType}:${event.recordId}|${trimTitle(titleFromPayload(event.payload))}]]`;
}

function isPriceDrop(event: DigestEvent): boolean {
  const p = payloadRecord(event.payload);
  return (
    typeof p.previousCents === "number" &&
    typeof p.newCents === "number" &&
    p.newCents < p.previousCents
  );
}

function isPriceUp(event: DigestEvent): boolean {
  const p = payloadRecord(event.payload);
  return (
    typeof p.previousCents === "number" &&
    typeof p.newCents === "number" &&
    p.newCents > p.previousCents
  );
}

function phrase(n: number, one: string, many: string): string | null {
  if (n <= 0) return null;
  return `${n} ${n === 1 ? one : many}`;
}

function describeBucket(bucket: CategoryBucket): string {
  const parts = [
    phrase(bucket.counts.priceDrops, "bajada de precio", "bajadas de precio"),
    phrase(bucket.counts.priceUps, "subida de precio", "subidas de precio"),
    phrase(bucket.counts.valueChanges, "cambio de valor", "cambios de valor"),
    phrase(bucket.counts.alerts, "alerta", "alertas"),
    phrase(bucket.counts.imports, "registro importado", "registros importados"),
    phrase(bucket.counts.shares, "registro compartido", "registros compartidos"),
    phrase(bucket.counts.other, "novedad", "novedades"),
  ].filter(Boolean);
  const examples = bucket.links.length > 0 ? ` ${bucket.links.join(", ")}` : "";
  return `${bucket.label}: ${parts.join(", ")}.${examples}`;
}

export function previousCompletedUtcWeek(now = new Date()): WeeklyDigestWindow {
  const currentUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = new Date(currentUtcMidnight).getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const currentWeekStartMs = currentUtcMidnight - daysSinceMonday * 86_400_000;
  const weekStart = new Date(currentWeekStartMs - 7 * 86_400_000);
  const weekEnd = new Date(currentWeekStartMs);
  return { weekStart, weekEnd };
}

export function weeklyDigestClientId(weekStart: Date, userId: string): string {
  return `weekly-digest:${weekStart.toISOString()}:${userId}`;
}

export function buildWeeklyDigestText(
  events: DigestEvent[],
  window: WeeklyDigestWindow,
  totalEvents = events.length,
): string | null {
  if (events.length === 0) return null;

  const buckets = new Map<string, CategoryBucket>();
  for (const event of events) {
    const key = event.recordType;
    const bucket =
      buckets.get(key) ??
      {
        label: categoryLabel(event.recordType),
        counts: { priceDrops: 0, priceUps: 0, valueChanges: 0, alerts: 0, imports: 0, shares: 0, other: 0 },
        links: [],
      };

    if (event.eventType === "alert_fired") bucket.counts.alerts++;
    else if (event.eventType === "record_imported") bucket.counts.imports++;
    else if (event.eventType === "record_shared") bucket.counts.shares++;
    else if (event.eventType === "price_changed" || event.eventType === "value_changed") {
      if (isPriceDrop(event)) bucket.counts.priceDrops++;
      else if (isPriceUp(event)) bucket.counts.priceUps++;
      else bucket.counts.valueChanges++;
    } else {
      bucket.counts.other++;
    }

    if (bucket.links.length < EXAMPLES_PER_CATEGORY) {
      const link = digestLink(event);
      if (!bucket.links.includes(link)) bucket.links.push(link);
    }
    buckets.set(key, bucket);
  }

  const start = window.weekStart.toISOString().slice(0, 10);
  const end = window.weekEnd.toISOString().slice(0, 10);
  const overflow = Math.max(0, totalEvents - events.length);
  const lines = [
    "Resumen semanal de Nidokey",
    `Semana ${start} - ${end} UTC`,
    "",
    ...Array.from(buckets.values()).map(describeBucket),
    ...(overflow > 0 ? [`+${overflow} novedades más.`] : []),
    "",
    "Ver todas: [[ir:/events|Novedades]]",
  ];
  return lines.join("\n");
}

export async function runWeeklyDigest(now = new Date()): Promise<WeeklyDigestSummary> {
  const window = previousCompletedUtcWeek(now);
  let sent = 0;
  let skipped = 0;

  for (let skip = 0; ; skip += USER_BATCH_SIZE) {
    const users = await prisma.recordEvent.groupBy({
      by: ["userId"],
      where: { observedAt: { gte: window.weekStart, lt: window.weekEnd } },
      orderBy: { userId: "asc" },
      skip,
      take: USER_BATCH_SIZE,
    });
    if (users.length === 0) break;

    for (const user of users) {
      const userId = user.userId;
      const [events, total] = await Promise.all([
        prisma.recordEvent.findMany({
          where: { userId, observedAt: { gte: window.weekStart, lt: window.weekEnd } },
          orderBy: [{ observedAt: "desc" }, { id: "desc" }],
          take: DIGEST_EVENT_CAP,
          select: { recordType: true, recordId: true, eventType: true, payload: true, observedAt: true },
        }),
        prisma.recordEvent.count({
          where: { userId, observedAt: { gte: window.weekStart, lt: window.weekEnd } },
        }),
      ]);
      const text = buildWeeklyDigestText(events, window, total);
      if (!text) {
        skipped++;
        continue;
      }
      const conversationId = await ensureBotDm(userId);
      if (!conversationId) {
        skipped++;
        continue;
      }
      const delivered = await replyAsBot(conversationId, text, {
        clientId: weeklyDigestClientId(window.weekStart, userId),
      });
      if (delivered) sent++;
      else skipped++;
    }

    if (users.length < USER_BATCH_SIZE) break;
  }

  return { sent, skipped };
}
