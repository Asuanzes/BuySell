import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { subscriptionProvider, type SubscriptionEvent } from "@/lib/billing/provider";
import { PREMIUM_PLAN } from "@/lib/billing/plans";

/**
 * POST /api/billing/webhook/[provider] — ÚNICA vía por la que una suscripción
 * cambia de estado (webhook-first, como los pagos de comida). Firma verificada
 * por el proveedor; idempotencia por (provider, eventId) en PaymentWebhookEvent
 * (namespace "sub-" para no colisionar con los eventos de pedidos).
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerName } = await params;
  const provider = subscriptionProvider(providerName);
  if (!provider) return NextResponse.json({ error: "Proveedor no soportado" }, { status: 404 });

  const event = await provider.verifyWebhook(req);
  if (event === null) return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  if (event === "ignored") return NextResponse.json({ ok: true, ignored: true });

  // Fake: verificación de importe contra el precio server-side (Stripe cobra
  // el Price configurado en su dashboard, no manda importe por suscripción).
  if (providerName === "fake" && event.amountCents !== PREMIUM_PLAN.priceCents) {
    return NextResponse.json({ error: "Importe no coincide" }, { status: 400 });
  }

  try {
    await prisma.paymentWebhookEvent.create({
      data: {
        provider: `sub-${providerName}`,
        eventId: event.eventId,
        type: event.type,
        payload: event.payload as object,
      },
    });
  } catch (e) {
    if (typeof e === "object" && e && "code" in e && e.code === "P2002") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw e;
  }

  const sub = await prisma.subscription.findUnique({ where: { id: event.subscriptionRef } });
  if (!sub) return NextResponse.json({ ok: true }); // ref desconocida: ack sin efecto

  // Stripe NO garantiza el orden de los webhooks (retries). Dos guardas:
  //  1. Evento de una suscripción de proveedor ANTIGUA (tras resubscribir la
  //     fila apunta a otra providerSubscriptionId) → historia pasada, ack.
  //  2. Un "renewed" tardío jamás resucita una fila ya CANCELLED.
  if (
    event.type !== "activated" &&
    event.providerSubscriptionId &&
    sub.providerSubscriptionId &&
    event.providerSubscriptionId !== sub.providerSubscriptionId
  ) {
    return NextResponse.json({ ok: true, stale: true });
  }
  if (event.type === "renewed" && sub.status === "CANCELLED") {
    return NextResponse.json({ ok: true, stale: true });
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: dataForEvent(event),
  });

  // Evento de embudo server-side (fuente de verdad de conversión: el webhook,
  // no el cliente). Best-effort: nunca bloquea el ack al proveedor.
  const funnelName =
    event.type === "activated"
      ? "subscribe_success"
      : event.type === "payment_failed"
        ? "subscribe_payment_failed"
        : event.type === "cancelled"
          ? "subscribe_cancelled"
          : null;
  if (funnelName) {
    await prisma.analyticsEvent
      .create({ data: { userId: sub.userId, name: funnelName, props: { provider: providerName } } })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

function dataForEvent(event: SubscriptionEvent) {
  const periodEnd = event.periodEndISO ? new Date(event.periodEndISO) : undefined;
  const providerSubscriptionId = event.providerSubscriptionId ?? undefined;
  switch (event.type) {
    case "activated":
      // periodEnd FORZADO (null si el evento no lo trae, nunca `undefined`):
      // un "activated" debe borrar cualquier periodo caducado de una
      // suscripción anterior — premiumFromRow trata null como acceso válido
      // hasta que el customer.subscription.updated traiga la fecha real.
      return {
        status: "ACTIVE" as const,
        providerSubscriptionId,
        currentPeriodEnd: event.periodEndISO ? new Date(event.periodEndISO) : null,
        cancelAtPeriodEnd: false,
      };
    case "renewed":
      return { status: "ACTIVE" as const, providerSubscriptionId, currentPeriodEnd: periodEnd };
    case "payment_failed":
      return { status: "PAST_DUE" as const, providerSubscriptionId };
    case "cancelled":
      return { status: "CANCELLED" as const, providerSubscriptionId };
  }
}
