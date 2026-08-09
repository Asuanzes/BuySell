import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  COMMERCIAL_ACTION_EVENTS,
  buildCommercialRedirect,
  commercialRedirectAnalyticsEvents,
  partnerRedirectEventKey,
} from "@/lib/commercial-actions";
import { requireUserId } from "@/lib/auth-helpers";
import { trackEvent } from "@/lib/analytics-events";
import { createRecordEvent } from "@/lib/record-events";
import { rateLimit } from "@/lib/rate-limit";

const Query = z.object({
  target: z.string().min(1),
  recordType: z.literal("holiday"),
  recordId: z.string().min(1),
});

export const GO_RATE_LIMIT = { limit: 60, windowMs: 3600_000 } as const;

type GoRateLimiter = typeof rateLimit;

export function checkGoRateLimit(userId: string, limiter: GoRateLimiter = rateLimit) {
  return limiter("commercial-go", userId, GO_RATE_LIMIT);
}

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const limit = await checkGoRateLimit(userId);
  if (!limit.ok) {
    return NextResponse.json({ error: "Demasiadas redirecciones. Inténtalo más tarde." }, { status: 429 });
  }

  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parámetros inválidos", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const attributionId = randomUUID();
  const redirect = buildCommercialRedirect({
    ...parsed.data,
    attributionId,
  });
  if (!redirect) {
    return NextResponse.json({ error: "Partner no permitido" }, { status: 400 });
  }

  const props = {
    attributionId: redirect.attributionId,
    recordType: redirect.recordType,
    recordId: redirect.recordId,
    host: redirect.host,
  };

  for (const event of commercialRedirectAnalyticsEvents(props)) {
    await trackEvent(event.name, { userId, props: event.props });
  }
  await createRecordEvent({
    userId,
    recordType: redirect.recordType,
    recordId: redirect.recordId,
    eventType: COMMERCIAL_ACTION_EVENTS.redirect,
    source: "commercial_action",
    idempotencyKey: partnerRedirectEventKey(redirect.recordType, redirect.recordId, redirect.attributionId),
    payload: props,
  });

  return NextResponse.redirect(redirect.targetUrl, { status: 302 });
}
